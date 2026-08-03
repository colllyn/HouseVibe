-- Migration: Update set_client_stage RPC with transition validation.
-- Per client-contract v1.0 §3.2 stage lifecycle and transition rules.
-- Replaces the old version which allowed any valid stage value.
-- Illegal transitions return a clear business error and do NOT modify the client or write audit.

begin;

-- =============================================================================
-- set_client_stage RPC v2 — with transition validation
-- =============================================================================

create or replace function public.set_client_stage(
  p_client_id uuid,
  p_new_stage public.client_stage
)
returns setof public.clients
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_workspace_id uuid;
  v_old_stage public.client_stage;
  v_client_row public.clients;
  v_allowed text[];
begin
  -- 1. Authenticate via auth.uid()
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'UA001';
  end if;

  -- 2. Look up client's workspace_id and current stage, verify not soft-deleted
  select workspace_id, stage into v_workspace_id, v_old_stage
  from public.clients
  where id = p_client_id
    and deleted_at is null;

  if not found then
    raise exception 'Client not found' using errcode = 'US001';
  end if;

  -- 3. Verify caller is an active workspace member
  if not private.is_workspace_member(v_workspace_id) then
    raise exception 'Access denied: not a workspace member'
      using errcode = '42501';
  end if;

  -- 4. No-op: stage unchanged — return existing client without audit
  if v_old_stage = p_new_stage then
    select * into v_client_row from public.clients where id = p_client_id;
    return next v_client_row;
    return;
  end if;

  -- 5. Validate transition against frozen contract §3.2
  --    Only these transitions are allowed:
  v_allowed := case v_old_stage
    when 'new'               then array['qualified', 'deleted']
    when 'qualified'         then array['properties_sent', 'paused', 'lost', 'closed_won', 'deleted']
    when 'properties_sent'   then array['viewing_scheduled', 'closed_won', 'deleted']
    when 'viewing_scheduled' then array['viewed', 'closed_won', 'deleted']
    when 'viewed'            then array['considering', 'paused', 'lost', 'closed_won', 'deleted']
    when 'considering'       then array['considering', 'paused', 'lost', 'closed_won', 'deleted']
    when 'paused'            then array['qualified', 'considering', 'deleted']
    when 'lost'              then array['deleted']
    when 'closed_won'        then array[]::text[]
    when 'deleted'           then array[]::text[]
    else array[]::text[]
  end;

  if not (p_new_stage::text = any(v_allowed)) then
    raise exception 'Stage transition from % to % is not allowed', v_old_stage, p_new_stage
      using errcode = 'ST001';
  end if;

  -- 6. Update the stage and updated_at atomically
  update public.clients
  set stage = p_new_stage,
      updated_at = now()
  where id = p_client_id
  returning * into v_client_row;

  -- 7. Write audit log entry
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
    'client',
    p_client_id,
    'stage_change',
    jsonb_build_object('stage', v_old_stage),
    jsonb_build_object('stage', p_new_stage)
  );

  -- 8. Return updated client row
  return next v_client_row;
  return;
end;
$$;

-- Grant execute to authenticated; revoke from public/anon
grant execute on function public.set_client_stage(uuid, public.client_stage) to authenticated;
revoke execute on function public.set_client_stage(uuid, public.client_stage) from public, anon;

-- =============================================================================
-- Verify security settings
-- =============================================================================
do $$
begin
  assert exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public'
      and p.proname = 'set_client_stage'
      and p.prosecdef = true
  ), 'set_client_stage must be SECURITY DEFINER';

  assert exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public'
      and p.proname = 'set_client_stage'
      and p.proconfig is not null
  ), 'set_client_stage must have fixed search_path';
end;
$$;

commit;
