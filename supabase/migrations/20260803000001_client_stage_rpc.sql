-- Migration: Client Stage Transition RPC
-- Creates atomic set_client_stage RPC for client lifecycle management.
-- Validates workspace membership, writes audit trail, returns updated client.
-- Stage transitions: no restriction (any valid stage to any valid stage).
-- Per domain-model v3.2 client stage state machine.

begin;

-- =============================================================================
-- set_client_stage RPC
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
begin
  -- 1. Authenticate via auth.uid()
  v_user_id := (select auth.uid());
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
      using errcode = '42501';  -- insufficient_privilege
  end if;

  -- 4. Validate stage: handled by PostgreSQL type system.
  --    p_new_stage is typed as public.client_stage enum, so only valid values
  --    are accepted. No restriction on transitions (any stage -> any valid stage).
  --    The enum includes all 10 values from domain-model.

  -- 5. Update the stage and updated_at atomically
  update public.clients
  set stage = p_new_stage,
      updated_at = now()
  where id = p_client_id
  returning * into v_client_row;

  -- 6. Write audit log entry
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
    'client_stage_changed',
    jsonb_build_object('stage', v_old_stage),
    jsonb_build_object('stage', p_new_stage)
  );

  -- 7. Return updated client row
  return next v_client_row;
  return;
end;
$$;

-- Grant execute to authenticated role; revoke default PUBLIC/anon access
grant execute on function public.set_client_stage(uuid, public.client_stage) to authenticated;
revoke execute on function public.set_client_stage(uuid, public.client_stage) from public, anon;

commit;
