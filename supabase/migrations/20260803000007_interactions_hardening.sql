-- Migration: Interactions hardening — soft-delete support, atomic RPCs, hardened RLS.
-- Per P2-CLIENT-002 interaction-contract v1.0.
-- 1. Adds updated_at and deleted_at columns to interactions.
-- 2. Creates atomic create_interaction, update_interaction, soft_delete_interaction RPCs.
-- 3. Hardens RLS policies with deleted_at filter and client-workspace consistency checks.
-- 4. All RPCs are SECURITY DEFINER with search_path = ''.

begin;

-- =============================================================================
-- 1. Add updated_at column (populated via default + trigger)
-- =============================================================================
alter table public.interactions
  add column if not exists updated_at timestamptz not null default now();

-- =============================================================================
-- 2. Add deleted_at column for soft delete
-- =============================================================================
alter table public.interactions
  add column if not exists deleted_at timestamptz;

-- =============================================================================
-- 3. Attach updated_at trigger (reuses existing private.set_updated_at)
-- =============================================================================
drop trigger if exists trg_interactions_updated_at on public.interactions;
create trigger trg_interactions_updated_at before update on public.interactions
  for each row execute function private.set_updated_at();

-- =============================================================================
-- 4. Drop existing interactions RLS policies (will be recreated below)
-- =============================================================================
drop policy if exists "Workspace members can read interactions" on public.interactions;
drop policy if exists "Workspace members can create interactions" on public.interactions;
drop policy if exists "Workspace members can update interactions" on public.interactions;
drop policy if exists "Workspace members can delete interactions" on public.interactions;

-- =============================================================================
-- 5. RLS Policies: interactions (hardened)
-- Per interaction-contract v1.0 section 6.3 and rls-contract v1.0 section 4.8.
-- =============================================================================

-- SELECT: workspace members can read non-deleted interactions
create policy "Workspace members can read interactions" on public.interactions
  for select using (
    private.is_workspace_member(workspace_id)
    and deleted_at is null
  );

-- INSERT: workspace members can create interactions.
-- Additionally verifies the referenced client belongs to the same workspace
-- and is not soft-deleted (client-workspace consistency check).
create policy "Workspace members can create interactions" on public.interactions
  for insert with check (
    private.is_workspace_member(workspace_id)
    and exists (
      select 1 from public.clients
      where clients.id = client_id
        and clients.workspace_id = interactions.workspace_id
        and clients.deleted_at is null
    )
  );

-- UPDATE: workspace members can update non-deleted interactions.
-- Also verifies the referenced client belongs to the same workspace.
create policy "Workspace members can update interactions" on public.interactions
  for update using (
    private.is_workspace_member(workspace_id)
    and deleted_at is null
  ) with check (
    private.is_workspace_member(workspace_id)
    and exists (
      select 1 from public.clients
      where clients.id = client_id
        and clients.workspace_id = interactions.workspace_id
        and clients.deleted_at is null
    )
  );

-- DELETE: workspace members can direct-delete non-deleted interactions.
-- Soft-delete is preferred via RPC; this policy exists as a safety-net.
create policy "Workspace members can delete interactions" on public.interactions
  for delete using (
    private.is_workspace_member(workspace_id)
    and deleted_at is null
  );

-- =============================================================================
-- 6. RPC: create_interaction
--    Atomic create + audit + cross-workspace client verification.
--    SECURITY DEFINER with search_path = ''.
-- =============================================================================
create or replace function public.create_interaction(
  p_client_id uuid,
  p_interaction_type public.interaction_type,
  p_occurred_at timestamptz,
  p_summary text default null,
  p_raw_text text default null,
  p_next_action text default null,
  p_property_id uuid default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_workspace_id uuid;
  v_interaction_id uuid;
  v_now timestamptz;
begin
  -- 1. Authenticate
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'UA001';
  end if;

  -- 2. Derive workspace_id from active membership
  select workspace_id into v_workspace_id
  from public.workspace_members
  where user_id = v_user_id
    and status = 'active'
  limit 1;

  if not found then
    raise exception 'No active workspace membership'
      using errcode = '42501';
  end if;

  -- 3. Verify client exists, is not soft-deleted, and belongs to same workspace
  if not exists (
    select 1 from public.clients
    where id = p_client_id
      and workspace_id = v_workspace_id
      and deleted_at is null
  ) then
    raise exception 'Client not found or access denied'
      using errcode = 'P2004'; -- RESOURCE_NOT_FOUND
  end if;

  -- 4. Insert interaction
  v_now := now();

  insert into public.interactions (
    workspace_id, client_id, property_id,
    interaction_type, summary, raw_text, next_action,
    occurred_at, created_by,
    created_at, updated_at
  ) values (
    v_workspace_id, p_client_id, p_property_id,
    p_interaction_type, p_summary, p_raw_text, p_next_action,
    p_occurred_at, v_user_id,
    v_now, v_now
  )
  returning id into v_interaction_id;

  -- 5. Write audit log
  insert into public.audit_logs (
    workspace_id, actor_user_id, entity_type, entity_id, action, after_data
  ) values (
    v_workspace_id, v_user_id, 'interaction', v_interaction_id,
    'interaction_created',
    jsonb_build_object(
      'interaction_type', p_interaction_type,
      'summary', p_summary,
      'client_id', p_client_id,
      'occurred_at', p_occurred_at
    )
  );

  -- 6. Return created interaction
  return jsonb_build_object(
    'id', v_interaction_id,
    'interaction_type', p_interaction_type,
    'summary', p_summary,
    'client_id', p_client_id,
    'occurred_at', p_occurred_at,
    'created_at', v_now
  );
end;
$$;

grant execute on function public.create_interaction(
  uuid, public.interaction_type, timestamptz, text, text, text, uuid, text
) to authenticated;
revoke execute on function public.create_interaction(
  uuid, public.interaction_type, timestamptz, text, text, text, uuid, text
) from public, anon;

-- =============================================================================
-- 7. RPC: update_interaction
--    Partial update + audit + cross-workspace client verification.
--    SECURITY DEFINER with search_path = ''.
-- =============================================================================
create or replace function public.update_interaction(
  p_interaction_id uuid,
  p_interaction_type public.interaction_type default null,
  p_summary text default null,
  p_raw_text text default null,
  p_next_action text default null,
  p_occurred_at timestamptz default null,
  p_property_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_workspace_id uuid;
  v_interaction record;
  v_before_data jsonb;
  v_after_data jsonb;
  v_now timestamptz;
begin
  -- 1. Authenticate
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'UA001';
  end if;

  -- 2. Derive workspace_id
  select workspace_id into v_workspace_id
  from public.workspace_members
  where user_id = v_user_id
    and status = 'active'
  limit 1;

  if not found then
    raise exception 'No active workspace membership'
      using errcode = '42501';
  end if;

  -- 3. Look up interaction, verify exists and not soft-deleted
  select id, workspace_id, client_id, interaction_type, summary, raw_text,
         next_action, occurred_at, property_id
  into v_interaction
  from public.interactions
  where id = p_interaction_id
    and deleted_at is null;

  if not found then
    raise exception 'Interaction not found'
      using errcode = 'P2004'; -- RESOURCE_NOT_FOUND
  end if;

  -- 4. Verify client belongs to same workspace (cross-workspace check)
  if not exists (
    select 1 from public.clients
    where id = v_interaction.client_id
      and workspace_id = v_workspace_id
      and deleted_at is null
  ) then
    raise exception 'Client not found or access denied'
      using errcode = 'P2004'; -- RESOURCE_NOT_FOUND
  end if;

  -- 5. Build before_data snapshot
  v_before_data := jsonb_build_object(
    'interaction_type', v_interaction.interaction_type,
    'summary', v_interaction.summary,
    'raw_text', v_interaction.raw_text,
    'next_action', v_interaction.next_action,
    'occurred_at', v_interaction.occurred_at,
    'property_id', v_interaction.property_id
  );

  v_now := now();

  -- 6. Update interaction with provided fields (non-null params only)
  update public.interactions
  set
    interaction_type = coalesce(p_interaction_type, interaction_type),
    summary = coalesce(p_summary, summary),
    raw_text = coalesce(p_raw_text, raw_text),
    next_action = coalesce(p_next_action, next_action),
    occurred_at = coalesce(p_occurred_at, occurred_at),
    property_id = coalesce(p_property_id, property_id),
    updated_at = v_now
  where id = p_interaction_id
    and deleted_at is null;

  -- 7. Build after_data snapshot from updated values
  v_after_data := jsonb_build_object(
    'interaction_type', coalesce(p_interaction_type, v_interaction.interaction_type),
    'summary', coalesce(p_summary, v_interaction.summary),
    'raw_text', coalesce(p_raw_text, v_interaction.raw_text),
    'next_action', coalesce(p_next_action, v_interaction.next_action),
    'occurred_at', coalesce(p_occurred_at, v_interaction.occurred_at),
    'property_id', coalesce(p_property_id, v_interaction.property_id)
  );

  -- 8. Write audit log with before/after data
  insert into public.audit_logs (
    workspace_id, actor_user_id, entity_type, entity_id, action,
    before_data, after_data
  ) values (
    v_workspace_id, v_user_id, 'interaction', p_interaction_id,
    'interaction_updated',
    v_before_data,
    v_after_data
  );

  -- 9. Return result
  return jsonb_build_object(
    'updated', true
  );
end;
$$;

grant execute on function public.update_interaction(
  uuid, public.interaction_type, text, text, text, timestamptz, uuid
) to authenticated;
revoke execute on function public.update_interaction(
  uuid, public.interaction_type, text, text, text, timestamptz, uuid
) from public, anon;

-- =============================================================================
-- 8. RPC: soft_delete_interaction
--    Sets deleted_at + audit. Verifies client-workspace consistency.
--    SECURITY DEFINER with search_path = ''.
-- =============================================================================
create or replace function public.soft_delete_interaction(
  p_interaction_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_workspace_id uuid;
  v_interaction record;
  v_now timestamptz;
begin
  -- 1. Authenticate
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'UA001';
  end if;

  -- 2. Derive workspace_id
  select workspace_id into v_workspace_id
  from public.workspace_members
  where user_id = v_user_id
    and status = 'active'
  limit 1;

  if not found then
    raise exception 'No active workspace membership'
      using errcode = '42501';
  end if;

  -- 3. Look up interaction, verify exists and not already soft-deleted
  select id, workspace_id, client_id
  into v_interaction
  from public.interactions
  where id = p_interaction_id
    and deleted_at is null;

  if not found then
    raise exception 'Interaction not found or already deleted'
      using errcode = 'P2004'; -- RESOURCE_NOT_FOUND
  end if;

  -- 4. Verify client belongs to same workspace (cross-workspace check)
  if not exists (
    select 1 from public.clients
    where id = v_interaction.client_id
      and workspace_id = v_workspace_id
      and deleted_at is null
  ) then
    raise exception 'Client not found or access denied'
      using errcode = 'P2004'; -- RESOURCE_NOT_FOUND
  end if;

  v_now := now();

  -- 5. Soft-delete: set deleted_at + updated_at
  update public.interactions
  set deleted_at = v_now,
      updated_at = v_now
  where id = p_interaction_id
    and deleted_at is null;

  -- 6. Write audit log
  insert into public.audit_logs (
    workspace_id, actor_user_id, entity_type, entity_id, action,
    before_data, after_data
  ) values (
    v_workspace_id, v_user_id, 'interaction', p_interaction_id,
    'interaction_soft_deleted',
    jsonb_build_object('deleted_at', null),
    jsonb_build_object('deleted_at', v_now)
  );

  -- 7. Return result
  return jsonb_build_object(
    'deleted', true,
    'deletedAt', v_now
  );
end;
$$;

grant execute on function public.soft_delete_interaction(uuid) to authenticated;
revoke execute on function public.soft_delete_interaction(uuid) from public, anon;

-- =============================================================================
-- Verify security settings
-- =============================================================================
do $$
begin
  -- create_interaction RPC must be SECURITY DEFINER with fixed search_path
  assert exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public'
      and p.proname = 'create_interaction'
      and p.prosecdef = true
  ), 'create_interaction RPC must be SECURITY DEFINER';

  assert exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public'
      and p.proname = 'create_interaction'
      and p.proconfig is not null
  ), 'create_interaction RPC must have fixed search_path';

  -- update_interaction RPC must be SECURITY DEFINER with fixed search_path
  assert exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public'
      and p.proname = 'update_interaction'
      and p.prosecdef = true
  ), 'update_interaction RPC must be SECURITY DEFINER';

  assert exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public'
      and p.proname = 'update_interaction'
      and p.proconfig is not null
  ), 'update_interaction RPC must have fixed search_path';

  -- soft_delete_interaction RPC must be SECURITY DEFINER with fixed search_path
  assert exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public'
      and p.proname = 'soft_delete_interaction'
      and p.prosecdef = true
  ), 'soft_delete_interaction RPC must be SECURITY DEFINER';

  assert exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public'
      and p.proname = 'soft_delete_interaction'
      and p.proconfig is not null
  ), 'soft_delete_interaction RPC must have fixed search_path';

  -- create_interaction RPC must NOT be granted to anon
  assert not exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    join information_schema.role_routine_grants g
      on g.routine_name = p.proname
      and g.routine_schema = n.nspname
    where n.nspname = 'public'
      and p.proname = 'create_interaction'
      and g.grantee = 'anon'
  ), 'create_interaction RPC must not be granted to anon';

  -- soft_delete_interaction RPC must NOT be granted to anon
  assert not exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    join information_schema.role_routine_grants g
      on g.routine_name = p.proname
      and g.routine_schema = n.nspname
    where n.nspname = 'public'
      and p.proname = 'soft_delete_interaction'
      and g.grantee = 'anon'
  ), 'soft_delete_interaction RPC must not be granted to anon';

  -- updated_at trigger must exist on interactions
  assert exists (
    select 1 from pg_trigger
    where tgname = 'trg_interactions_updated_at'
  ), 'updated_at trigger must exist on interactions';

  -- deleted_at column must exist on interactions
  assert exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'interactions'
      and column_name = 'deleted_at'
  ), 'deleted_at column must exist on interactions';

  -- updated_at column must exist and be not null
  assert exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'interactions'
      and column_name = 'updated_at'
      and is_nullable = 'NO'
  ), 'updated_at column must exist and be not null';

  -- Hardened RLS policies must exist (SELECT with deleted_at filter)
  -- We verify all 4 policy names exist on the table
  assert exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'interactions'
      and policyname = 'Workspace members can read interactions'
  ), 'SELECT policy must exist';
  assert exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'interactions'
      and policyname = 'Workspace members can create interactions'
  ), 'INSERT policy must exist';
  assert exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'interactions'
      and policyname = 'Workspace members can update interactions'
  ), 'UPDATE policy must exist';
  assert exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'interactions'
      and policyname = 'Workspace members can delete interactions'
  ), 'DELETE policy must exist';
end;
$$;

commit;
