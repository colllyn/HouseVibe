-- Migration: Fix workspace_members RLS bypass (Phase 1 Final)
-- P1-DB-005: Prevent owners from removing self or other owners at DB level.
--
-- Vulnerability: The broad "Owner can manage members" UPDATE policy allows
-- any owner to PATCH any workspace_members row via the REST API, including:
--   1. Setting own status = 'inactive' (self-removal)
--   2. Setting another owner's status = 'inactive' (owner-removal)
--   3. Changing own or another owner's role
--
-- Fix:
--   1. Drop the broad UPDATE policy
--   2. Create a SECURITY DEFINER RPC with self/owner removal checks
--   3. Revoke direct UPDATE on workspace_members from authenticated
--   4. All member removals must go through the RPC (DB-level enforcement)

begin;

-- =============================================================================
-- 1. Drop the broad "Owner can manage members" UPDATE policy
-- =============================================================================
drop policy if exists "Owner can manage members" on public.workspace_members;

-- =============================================================================
-- 2. Revoke direct UPDATE from authenticated users
--    All member modifications MUST go through SECURITY DEFINER RPCs.
-- =============================================================================
revoke update on public.workspace_members from authenticated;

-- =============================================================================
-- 3. remove_workspace_member RPC
--    SECURITY DEFINER, set search_path = '', owner-only, with
--    self-removal and owner-removal guards at DB level.
-- =============================================================================
create or replace function public.remove_workspace_member(
  p_member_id uuid,
  p_workspace_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid;
  v_target record;
  v_result jsonb;
begin
  -- 3a. Authenticate caller
  v_caller_id := (select auth.uid());
  if v_caller_id is null then
    raise exception '未登录' using errcode = 'ME001';
  end if;

  -- 3b. Verify caller is the workspace owner (via workspaces.owner_user_id)
  if not exists (
    select 1 from public.workspaces
    where id = p_workspace_id
      and owner_user_id = v_caller_id
  ) then
    raise exception '仅工作区所有者可以移除成员' using errcode = 'ME002';
  end if;

  -- 3c. Fetch target member
  select id, user_id, role, status
  into v_target
  from public.workspace_members
  where id = p_member_id
    and workspace_id = p_workspace_id
    and status = 'active';

  if not found then
    raise exception '成员不存在' using errcode = 'ME003';
  end if;

  -- 3d. Cannot remove self
  if v_target.user_id = v_caller_id then
    raise exception '不能移除自己' using errcode = 'ME004';
  end if;

  -- 3e. Cannot remove another owner
  if v_target.role = 'owner' then
    raise exception '不能移除工作区所有者' using errcode = 'ME005';
  end if;

  -- 3f. Execute removal (soft-delete: set status = inactive)
  update public.workspace_members
  set status = 'inactive'
  where id = p_member_id
    and workspace_id = p_workspace_id;

  -- 3g. Write audit log
  insert into public.audit_logs (
    workspace_id,
    actor_user_id,
    entity_type,
    entity_id,
    action,
    before_data,
    after_data
  ) values (
    p_workspace_id,
    v_caller_id,
    'workspace_member',
    p_member_id,
    'member_removed',
    jsonb_build_object(
      'user_id', v_target.user_id,
      'role', v_target.role,
      'status', v_target.status
    ),
    jsonb_build_object(
      'user_id', v_target.user_id,
      'role', v_target.role,
      'status', 'inactive',
      'removed_by', v_caller_id,
      'removed_at', now()
    )
  );

  -- 3h. Return result
  select jsonb_build_object(
    'id', p_member_id,
    'workspace_id', p_workspace_id,
    'user_id', v_target.user_id,
    'status', 'inactive',
    'removed_by', v_caller_id,
    'removed_at', now()
  ) into v_result;

  return v_result;
end;
$$;

-- Only authenticated users can call (owner check is internal)
grant execute on function public.remove_workspace_member(uuid, uuid) to authenticated;
revoke execute on function public.remove_workspace_member(uuid, uuid) from public, anon;

-- =============================================================================
-- 4. Replace UPDATE policy with a strict, RPC-only approach
--    Since we revoked UPDATE, only SECURITY DEFINER functions can modify.
--    But add a SELECT policy improvement: system admins can read all.
-- =============================================================================

-- SELECT policy is already adequate (Members can see own memberships).
-- No new INSERT/UPDATE/DELETE policies — only RPCs and service_role.

commit;
