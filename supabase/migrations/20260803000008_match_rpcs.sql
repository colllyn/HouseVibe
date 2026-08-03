-- Migration: Property matching RPCs — upsert, status transitions, client/property match queries.
-- Per ADR-005 match_status resolution and api-contract v1.0 §7.
-- 1. upsert_property_match: calculates and upserts a match for (client, property) pair.
-- 2. update_match_status: updates match status with ADR-005 state transition validation + audit.
-- 3. get_client_matches: returns all active/dismissed matches for a client, ordered by score DESC.
-- 4. get_property_matches: returns all active/dismissed matches for a property, ordered by score DESC.
-- All RPCs are SECURITY DEFINER with search_path = ''.

begin;

-- =============================================================================
-- 1. RPC: upsert_property_match
--    Calculates/upserts a match for ONE (client, property) pair.
--    Validates: auth, workspace membership, client not soft-deleted, property not soft-deleted,
--    client and property share the same workspace.
--    ON CONFLICT (property_id, client_id) DO UPDATE resets status to 'active'.
--    SECURITY DEFINER with search_path = ''.
-- =============================================================================
create or replace function public.upsert_property_match(
  p_client_id uuid,
  p_property_id uuid,
  p_score integer,
  p_match_level public.match_level,
  p_matched_reasons jsonb,
  p_unmatched_reasons jsonb,
  p_needs_confirmation jsonb,
  p_status public.match_status default 'active'
)
returns public.property_matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_workspace_id uuid;
  v_client_ws_id uuid;
  v_property_ws_id uuid;
  v_result public.property_matches;
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
  select workspace_id into v_client_ws_id
  from public.clients
  where id = p_client_id
    and deleted_at is null;

  if not found then
    raise exception 'Client not found or access denied'
      using errcode = 'P2004';
  end if;

  if v_client_ws_id != v_workspace_id then
    raise exception 'Client does not belong to your workspace'
      using errcode = '42501';
  end if;

  -- 4. Verify property exists, is not soft-deleted, and belongs to same workspace
  select workspace_id into v_property_ws_id
  from public.properties
  where id = p_property_id
    and deleted_at is null;

  if not found then
    raise exception 'Property not found or access denied'
      using errcode = 'P2004';
  end if;

  if v_property_ws_id != v_workspace_id then
    raise exception 'Property does not belong to your workspace'
      using errcode = '42501';
  end if;

  -- 5. Upsert into property_matches
  --    On conflict: reset all match fields, force status to 'active' per ADR-005,
  --    and bump updated_at.
  insert into public.property_matches (
    workspace_id, property_id, client_id,
    score, match_level,
    matched_reasons, unmatched_reasons,
    needs_confirmation, status
  ) values (
    v_workspace_id, p_property_id, p_client_id,
    p_score, p_match_level,
    p_matched_reasons, p_unmatched_reasons,
    p_needs_confirmation, p_status
  )
  on conflict (property_id, client_id) do update
  set
    score            = excluded.score,
    match_level      = excluded.match_level,
    matched_reasons  = excluded.matched_reasons,
    unmatched_reasons = excluded.unmatched_reasons,
    needs_confirmation = excluded.needs_confirmation,
    status           = 'active',
    updated_at       = now()
  returning * into v_result;

  return v_result;
end;
$$;

-- Grant execute to authenticated; revoke from public/anon
grant execute on function public.upsert_property_match(
  uuid, uuid, integer, public.match_level, jsonb, jsonb, jsonb, public.match_status
) to authenticated;
revoke execute on function public.upsert_property_match(
  uuid, uuid, integer, public.match_level, jsonb, jsonb, jsonb, public.match_status
) from public, anon;

-- =============================================================================
-- 2. RPC: update_match_status
--    Update a match's status with ADR-005 state transition validation.
--    Allowed via this RPC:
--      active  → dismissed  (manual dismissal)
--      active  → archived   (manual archiving)
--      dismissed → archived  (system cleanup)
--    Disallowed via this RPC (reserved for upsert recalculation):
--      dismissed → active
--      archived  → active
--    Disallowed entirely:
--      archived → dismissed   (final state irreversibility per ADR-005)
--    Writes audit log on status change.
--    SECURITY DEFINER with search_path = ''.
-- =============================================================================
create or replace function public.update_match_status(
  p_match_id uuid,
  p_new_status public.match_status
)
returns public.property_matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_workspace_id uuid;
  v_old_status public.match_status;
  v_match_row public.property_matches;
  v_action text;
begin
  -- 1. Authenticate
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'UA001';
  end if;

  -- 2. Look up match record
  select * into v_match_row
  from public.property_matches
  where id = p_match_id;

  if not found then
    raise exception 'Match not found' using errcode = 'US001';
  end if;

  v_workspace_id := v_match_row.workspace_id;
  v_old_status   := v_match_row.status;

  -- 3. Verify caller is an active workspace member
  if not private.is_workspace_member(v_workspace_id) then
    raise exception 'Access denied: not a workspace member'
      using errcode = '42501';
  end if;

  -- 4. No-op: status unchanged — return existing match without audit
  if v_old_status = p_new_status then
    return v_match_row;
  end if;

  -- 5. Validate transition against ADR-005 transition matrix
  --    Allowed via status-change RPC:
  if v_old_status = 'active' and p_new_status = 'dismissed' then
    v_action := 'match_dismissed';
  elsif v_old_status = 'active' and p_new_status = 'archived' then
    v_action := 'match_archived';
  elsif v_old_status = 'dismissed' and p_new_status = 'archived' then
    v_action := 'match_archived';
  --    Disallowed via status-change RPC (reserved for recalculation via upsert):
  elsif v_old_status = 'dismissed' and p_new_status = 'active' then
    raise exception 'Match status transition from dismissed to active is not allowed via update_match_status (use recalculation)'
      using errcode = 'ST001';
  elsif v_old_status = 'archived' and p_new_status = 'active' then
    raise exception 'Match status transition from archived to active is not allowed via update_match_status (use recalculation)'
      using errcode = 'ST001';
  --    Disallowed entirely (archived is final for manual operations):
  elsif v_old_status = 'archived' and p_new_status = 'dismissed' then
    raise exception 'Match status transition from archived to dismissed is not allowed'
      using errcode = 'ST001';
  else
    raise exception 'Invalid match status transition from % to %', v_old_status, p_new_status
      using errcode = 'ST001';
  end if;

  -- 6. Update match status atomically
  update public.property_matches
  set status     = p_new_status,
      updated_at = now()
  where id = p_match_id
  returning * into v_match_row;

  -- 7. Write audit log
  insert into public.audit_logs (
    workspace_id,
    actor_user_id,
    entity_type,
    entity_id,
    action,
    before_data,
    after_data
  ) values (
    v_workspace_id,
    v_user_id,
    'property_match',
    p_match_id,
    v_action,
    jsonb_build_object('status', v_old_status),
    jsonb_build_object('status', p_new_status)
  );

  -- 8. Return updated match row
  return v_match_row;
end;
$$;

-- Grant execute to authenticated; revoke from public/anon
grant execute on function public.update_match_status(uuid, public.match_status) to authenticated;
revoke execute on function public.update_match_status(uuid, public.match_status) from public, anon;

-- =============================================================================
-- 3. RPC: get_client_matches
--    Returns all non-archived match records for a client, ordered by score DESC.
--    Verifies client belongs to workspace where auth.uid() is a member.
--    SECURITY DEFINER with search_path = ''.
-- =============================================================================
create or replace function public.get_client_matches(
  p_client_id uuid
)
returns setof public.property_matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_workspace_id uuid;
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

  -- 3. Verify client belongs to user's workspace and is not soft-deleted
  if not exists (
    select 1 from public.clients
    where id = p_client_id
      and workspace_id = v_workspace_id
      and deleted_at is null
  ) then
    raise exception 'Client not found or access denied'
      using errcode = 'P2004';
  end if;

  -- 4. Return matches ordered by score DESC, updated_at DESC, created_at ASC
  --    Exclude archived matches
  return query
  select *
  from public.property_matches
  where client_id = p_client_id
    and workspace_id = v_workspace_id
    and status != 'archived'
  order by score desc, updated_at desc, created_at asc;
end;
$$;

-- Grant execute to authenticated; revoke from public/anon
grant execute on function public.get_client_matches(uuid) to authenticated;
revoke execute on function public.get_client_matches(uuid) from public, anon;

-- =============================================================================
-- 4. RPC: get_property_matches
--    Returns all non-archived match records for a property, ordered by score DESC.
--    Verifies property belongs to workspace where auth.uid() is a member.
--    SECURITY DEFINER with search_path = ''.
-- =============================================================================
create or replace function public.get_property_matches(
  p_property_id uuid
)
returns setof public.property_matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_workspace_id uuid;
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

  -- 3. Verify property belongs to user's workspace and is not soft-deleted
  if not exists (
    select 1 from public.properties
    where id = p_property_id
      and workspace_id = v_workspace_id
      and deleted_at is null
  ) then
    raise exception 'Property not found or access denied'
      using errcode = 'P2004';
  end if;

  -- 4. Return matches ordered by score DESC
  return query
  select *
  from public.property_matches
  where property_id = p_property_id
    and workspace_id = v_workspace_id
    and status != 'archived'
  order by score desc;
end;
$$;

-- Grant execute to authenticated; revoke from public/anon
grant execute on function public.get_property_matches(uuid) to authenticated;
revoke execute on function public.get_property_matches(uuid) from public, anon;

-- =============================================================================
-- Verify security settings
-- =============================================================================
do $$
begin
  -- upsert_property_match must be SECURITY DEFINER with fixed search_path
  assert exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public'
      and p.proname = 'upsert_property_match'
      and p.prosecdef = true
  ), 'upsert_property_match must be SECURITY DEFINER';

  assert exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public'
      and p.proname = 'upsert_property_match'
      and p.proconfig is not null
  ), 'upsert_property_match must have fixed search_path';

  -- update_match_status must be SECURITY DEFINER with fixed search_path
  assert exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public'
      and p.proname = 'update_match_status'
      and p.prosecdef = true
  ), 'update_match_status must be SECURITY DEFINER';

  assert exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public'
      and p.proname = 'update_match_status'
      and p.proconfig is not null
  ), 'update_match_status must have fixed search_path';

  -- get_client_matches must be SECURITY DEFINER with fixed search_path
  assert exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public'
      and p.proname = 'get_client_matches'
      and p.prosecdef = true
  ), 'get_client_matches must be SECURITY DEFINER';

  assert exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public'
      and p.proname = 'get_client_matches'
      and p.proconfig is not null
  ), 'get_client_matches must have fixed search_path';

  -- get_property_matches must be SECURITY DEFINER with fixed search_path
  assert exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public'
      and p.proname = 'get_property_matches'
      and p.prosecdef = true
  ), 'get_property_matches must be SECURITY DEFINER';

  assert exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public'
      and p.proname = 'get_property_matches'
      and p.proconfig is not null
  ), 'get_property_matches must have fixed search_path';

  -- upsert_property_match must NOT be granted to anon
  assert not exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    join information_schema.role_routine_grants g
      on g.routine_name = p.proname
      and g.routine_schema = n.nspname
    where n.nspname = 'public'
      and p.proname = 'upsert_property_match'
      and g.grantee = 'anon'
  ), 'upsert_property_match must not be granted to anon';

  -- update_match_status must NOT be granted to anon
  assert not exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    join information_schema.role_routine_grants g
      on g.routine_name = p.proname
      and g.routine_schema = n.nspname
    where n.nspname = 'public'
      and p.proname = 'update_match_status'
      and g.grantee = 'anon'
  ), 'update_match_status must not be granted to anon';

  -- get_client_matches must NOT be granted to anon
  assert not exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    join information_schema.role_routine_grants g
      on g.routine_name = p.proname
      and g.routine_schema = n.nspname
    where n.nspname = 'public'
      and p.proname = 'get_client_matches'
      and g.grantee = 'anon'
  ), 'get_client_matches must not be granted to anon';

  -- get_property_matches must NOT be granted to anon
  assert not exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    join information_schema.role_routine_grants g
      on g.routine_name = p.proname
      and g.routine_schema = n.nspname
    where n.nspname = 'public'
      and p.proname = 'get_property_matches'
      and g.grantee = 'anon'
  ), 'get_property_matches must not be granted to anon';
end;
$$;

commit;
