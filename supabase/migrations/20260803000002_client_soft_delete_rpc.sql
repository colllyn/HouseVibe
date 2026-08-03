-- Migration: Client Soft-Delete RPC (Owner-Only)
-- Creates atomic soft_delete_client RPC for owner-only client soft-deletion.
-- SECURITY DEFINER with search_path = ''. Validates workspace ownership,
-- checks closed_won constraint, writes audit trail, returns result.
-- Per client-contract v1.0 §4.5 and §5.1.

begin;

-- =============================================================================
-- soft_delete_client RPC
-- =============================================================================

create or replace function public.soft_delete_client(
  p_client_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_workspace_id uuid;
  v_client_stage public.client_stage;
  v_deleted_at timestamptz;
  v_now timestamptz;
begin
  -- 1. Authenticate via auth.uid()
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'UA001';
  end if;

  -- 2. Look up client's workspace_id and current stage, verify not soft-deleted
  select workspace_id, stage into v_workspace_id, v_client_stage
  from public.clients
  where id = p_client_id
    and deleted_at is null;

  if not found then
    raise exception 'Client not found' using errcode = 'US001';
  end if;

  -- 3. Verify caller is the workspace OWNER (not just a member)
  --    Check workspaces.owner_user_id directly for definitive ownership
  if not exists (
    select 1 from public.workspaces
    where id = v_workspace_id
      and owner_user_id = v_user_id
  ) then
    raise exception 'Only workspace owner can delete clients'
      using errcode = '42501';  -- insufficient_privilege
  end if;

  -- 4. Verify caller is an active member (defense in depth)
  if not private.is_workspace_member(v_workspace_id) then
    raise exception 'Access denied: not a workspace member'
      using errcode = '42501';
  end if;

  -- 5. Cannot delete closed_won clients
  if v_client_stage = 'closed_won' then
    raise exception 'Cannot delete a closed_won client'
      using errcode = 'US002';
  end if;

  -- 6. Perform atomic soft-delete
  v_now := now();

  update public.clients
  set deleted_at = v_now,
      stage = 'deleted',
      updated_at = v_now
  where id = p_client_id
    and deleted_at is null
  returning deleted_at into v_deleted_at;

  if v_deleted_at is null then
    raise exception 'Delete failed: client may have been concurrently deleted'
      using errcode = 'US003';
  end if;

  -- 7. Write audit log entry (redacted: no phone, wechat, raw_input_text)
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
    'soft_delete',
    jsonb_build_object('deleted_at', null, 'stage', v_client_stage),
    jsonb_build_object('deleted_at', v_now, 'stage', 'deleted')
  );

  -- 8. Return result matching API contract
  return jsonb_build_object(
    'deleted', true,
    'deletedAt', v_now
  );
end;
$$;

-- Grant execute to authenticated role; revoke default PUBLIC/anon access
grant execute on function public.soft_delete_client(uuid) to authenticated;
revoke execute on function public.soft_delete_client(uuid) from public, anon;

-- =============================================================================
-- Verify security settings
-- =============================================================================
do $$
begin
  assert exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public'
      and p.proname = 'soft_delete_client'
      and p.prosecdef = true
  ), 'RPC must be SECURITY DEFINER';

  assert exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public'
      and p.proname = 'soft_delete_client'
      and p.proconfig is not null
  ), 'RPC must have fixed search_path';
end;
$$;

commit;
