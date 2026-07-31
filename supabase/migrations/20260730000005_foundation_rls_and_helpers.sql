-- Migration: Foundation RLS, Helper Functions, and Policies
-- Enables RLS on all foundation tables, creates auth helper functions,
-- workspace creation RPC, and all access control policies.

-- =============================================================================
-- 5a. Helper Functions (private schema, SECURITY DEFINER)
-- =============================================================================

-- is_workspace_member: check if the current user is an active member of a workspace
create or replace function private.is_workspace_member(workspace_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = workspace_uuid
      and user_id = (select auth.uid())
      and status = 'active'
  );
$$;

-- is_workspace_owner: check if the current user is the owner of a workspace
create or replace function private.is_workspace_owner(workspace_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = workspace_uuid
      and user_id = (select auth.uid())
      and role = 'owner'
      and status = 'active'
  );
$$;

-- is_system_admin: stub function — always returns false until Phase 1-C
create or replace function private.is_system_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Phase 1-C: replace with actual system_admins table check
  select false;
$$;

-- Grant execute to authenticated role; revoke default PUBLIC access
grant execute on function private.is_workspace_member(uuid) to authenticated;
grant execute on function private.is_workspace_owner(uuid) to authenticated;
grant execute on function private.is_system_admin() to authenticated;
revoke execute on function private.is_workspace_member(uuid) from public, anon;
revoke execute on function private.is_workspace_owner(uuid) from public, anon;
revoke execute on function private.is_system_admin() from public, anon;

-- =============================================================================
-- 5b. create_workspace_with_owner RPC
-- Atomically creates a workspace + owner membership record.
-- Uses explicit UUID generation because search_path = ''.
-- =============================================================================
create or replace function public.create_workspace_with_owner(
  workspace_name text,
  workspace_city text default null,
  workspace_business_type text default 'residential_lease'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_workspace_id uuid;
  v_member_id uuid;
  v_result jsonb;
begin
  -- 1. Validate authenticated user
  v_user_id := (select auth.uid());
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'UA001';
  end if;

  -- 2. Create workspace (explicit UUID: gen_random_uuid is in extensions schema)
  v_workspace_id := extensions.gen_random_uuid();
  insert into public.workspaces (id, name, owner_user_id, city, business_type)
  values (v_workspace_id, workspace_name, v_user_id, workspace_city, workspace_business_type);

  -- 3. Create owner membership
  v_member_id := extensions.gen_random_uuid();
  insert into public.workspace_members (id, workspace_id, user_id, role, status)
  values (v_member_id, v_workspace_id, v_user_id, 'owner', 'active');

  -- 4. Return result
  select jsonb_build_object(
    'workspace_id', v_workspace_id,
    'workspace_name', workspace_name,
    'owner_user_id', v_user_id,
    'member_id', v_member_id,
    'role', 'owner',
    'status', 'active'
  ) into v_result;

  return v_result;
end;
$$;

-- Grant execute to authenticated role; revoke default PUBLIC access
grant execute on function public.create_workspace_with_owner(text, text, text) to authenticated;
revoke execute on function public.create_workspace_with_owner(text, text, text) from public, anon;

-- =============================================================================
-- 5c. Enable RLS on all foundation tables
-- =============================================================================
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.audit_logs enable row level security;

-- Grant base table access to authenticated role.
-- RLS policies (below) restrict access to authorized rows only.
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.workspaces to authenticated;
grant select, insert, update on public.workspace_members to authenticated;
-- audit_logs: no direct access for authenticated; service_role only.

-- =============================================================================
-- 5d. RLS Policies: profiles
-- =============================================================================

-- Users can read their own profile
create policy "Users can read own profile" on public.profiles
  for select using (id = (select auth.uid()));

-- System admins can read all profiles (stub: no effect until Phase 1-C)
create policy "System admins can read all profiles" on public.profiles
  for select using (private.is_system_admin());

-- Users can update their own profile
create policy "Users can update own profile" on public.profiles
  for update using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- =============================================================================
-- 5e. RLS Policies: workspaces
-- =============================================================================

-- Members can read their own workspaces (system admins can read all)
create policy "Members can read own workspaces" on public.workspaces
  for select using (
    private.is_workspace_member(id)
    or private.is_system_admin()
  );

-- Only the workspace owner can update workspace info
create policy "Owner can update workspace" on public.workspaces
  for update using (private.is_workspace_owner(id))
  with check (private.is_workspace_owner(id));

-- =============================================================================
-- 5f. RLS Policies: workspace_members
-- IMPORTANT: Uses direct EXISTS checks, NOT is_workspace_member/is_workspace_owner
-- to avoid recursive policy evaluation.
-- =============================================================================

-- SELECT: user sees own memberships; owner sees all memberships in their workspace.
-- Uses workspaces.owner_user_id (NOT workspace_members self-join) to avoid RLS recursion.
create policy "Members can see own memberships" on public.workspace_members
  for select using (
    user_id = (select auth.uid())
    or private.is_system_admin()
    or exists (
      select 1 from public.workspaces
      where workspaces.id = workspace_members.workspace_id
        and workspaces.owner_user_id = (select auth.uid())
    )
  );

-- UPDATE: owner can manage members (change role, set status to inactive).
-- WITH CHECK prevents workspace_id and user_id reassignment to unauthorized targets.
-- Uses workspaces.owner_user_id to avoid RLS recursion.
create policy "Owner can manage members" on public.workspace_members
  for update using (
    exists (
      select 1 from public.workspaces
      where workspaces.id = workspace_members.workspace_id
        and workspaces.owner_user_id = (select auth.uid())
    )
  ) with check (
    exists (
      select 1 from public.workspaces
      where workspaces.id = workspace_members.workspace_id
        and workspaces.owner_user_id = (select auth.uid())
    )
  );

-- =============================================================================
-- 5g. RLS Policies: audit_logs
-- =============================================================================

-- No SELECT policy — only service_role can read audit_logs.
-- No INSERT policy — only service_role (server-side with admin check) can write.
-- No UPDATE/DELETE policy — ordinary users MUST NOT modify audit_logs.
-- Phase 1-C will add is_system_admin() SELECT policy.
