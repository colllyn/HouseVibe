-- Migration: Cost Tracking Audit & Circuit Breaker Manual Reset
-- Phase 3 / P3-AI-015
--
-- 1. Replaces admin_upsert_user_limits to add audit_log writes
--    (follows the same pattern as admin_restore_user_access).
-- 2. Creates admin_reset_circuit RPC for manual circuit breaker reset.
--    Writes audit log entry for the reset action.
--
-- All functions: SECURITY DEFINER, set search_path = '', admin-only.

begin;

-- =============================================================================
-- 0. Fix entity_id type — existing RPCs (force_model_mode, update_circuit_state,
--    admin_restore_user_access) pass text values (e.g. 'text', 'vision') to
--    audit_logs.entity_id, but the column was typed uuid. Change to text so
--    all entity IDs (UUIDs and capability strings) coexist.
-- =============================================================================

alter table public.audit_logs
  alter column entity_id type text using entity_id::text;

comment on column public.audit_logs.entity_id is 'Entity identifier — may be a UUID (properties, clients) or a text key (capabilities, features).';

-- =============================================================================
-- 1. Replace admin_upsert_user_limits — add audit_log INSERT
-- =============================================================================

create or replace function public.admin_upsert_user_limits(
  p_user_id uuid,
  p_feature text default 'content_factory',
  p_daily_request_limit integer default null,
  p_daily_cost_limit_usd numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_uid uuid;
  v_is_admin boolean;
  v_existing_id uuid;
  v_workspace_id uuid;
begin
  -- Verify system admin
  v_auth_uid := (select auth.uid());
  if v_auth_uid is null then
    raise exception 'Authentication required' using errcode = 'UA001';
  end if;

  select exists (
    select 1 from public.system_admins
    where user_id = v_auth_uid and status = 'active'
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  -- Upsert: update if exists, insert if not
  select id into v_existing_id
  from public.ai_user_limits
  where user_id = p_user_id and feature = p_feature;

  if found then
    update public.ai_user_limits
    set
      daily_request_limit = coalesce(p_daily_request_limit, daily_request_limit),
      daily_cost_limit_usd = coalesce(p_daily_cost_limit_usd, daily_cost_limit_usd),
      updated_at = now()
    where id = v_existing_id;
  else
    insert into public.ai_user_limits (
      user_id, feature, daily_request_limit, daily_cost_limit_usd, status
    ) values (
      p_user_id, p_feature, p_daily_request_limit, p_daily_cost_limit_usd, 'active'
    )
    returning id into v_existing_id;
  end if;

  -- Resolve workspace for audit entry (target user's, or admin's)
  select workspace_id into v_workspace_id
  from (
    select workspace_id from public.workspace_members
    where user_id = p_user_id and status = 'active'
    union all
    select workspace_id from public.workspace_members
    where user_id = v_auth_uid and status = 'active'
  ) sub
  limit 1;

  -- Insert audit log entry (P3-AI-015)
  insert into public.audit_logs (
    workspace_id,
    actor_user_id,
    entity_type,
    entity_id,
    action,
    after_data
  ) values (
    coalesce(v_workspace_id, '00000000-0000-0000-0000-000000000000'),
    v_auth_uid,
    'ai_user_limits',
    v_existing_id,
    'update_ai_limits',
    jsonb_build_object(
      'target_user_id', p_user_id,
      'feature', p_feature,
      'daily_request_limit', p_daily_request_limit,
      'daily_cost_limit_usd', p_daily_cost_limit_usd,
      'updated_by', v_auth_uid,
      'updated_at', now()
    )
  );

  return jsonb_build_object(
    'success', true,
    'id', v_existing_id,
    'user_id', p_user_id,
    'feature', p_feature
  );
end;
$$;

-- =============================================================================
-- 2. Create admin_reset_circuit — manual circuit breaker reset
-- =============================================================================

create or replace function public.admin_reset_circuit(
  p_capability text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_uid uuid;
  v_is_admin boolean;
  v_previous_state record;
begin
  -- Verify system admin
  v_auth_uid := (select auth.uid());
  if v_auth_uid is null then
    raise exception 'Authentication required' using errcode = 'UA001';
  end if;

  select exists (
    select 1 from public.system_admins
    where user_id = v_auth_uid and status = 'active'
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  -- Validate capability
  if p_capability not in ('text', 'vision') then
    raise exception 'Invalid capability: must be text or vision' using errcode = 'DT001';
  end if;

  -- Capture previous state for audit
  select circuit_open, consecutive_failures, mode
  into v_previous_state
  from public.ai_runtime_config
  where capability = p_capability;

  if not found then
    -- Initialize row if it doesn't exist
    insert into public.ai_runtime_config (capability, mode, circuit_open, consecutive_failures)
    values (p_capability, 'auto', false, 0)
    on conflict (capability) do nothing;

    return jsonb_build_object(
      'success', true,
      'capability', p_capability,
      'circuit_open', false,
      'consecutive_failures', 0,
      'message', 'Circuit breaker initialized'
    );
  end if;

  -- Reset circuit state
  update public.ai_runtime_config
  set
    circuit_open = false,
    consecutive_failures = 0,
    last_health_check_at = now(),
    last_health_check_ok = true,
    forced_by = v_auth_uid,
    forced_at = now(),
    updated_at = now()
  where capability = p_capability;

  -- Write audit log
  insert into public.audit_logs (
    workspace_id,
    actor_user_id,
    entity_type,
    entity_id,
    action,
    before_data,
    after_data
  ) values (
    null,
    v_auth_uid,
    'ai_runtime_config',
    p_capability,
    'ai_circuit_manually_reset',
    jsonb_build_object(
      'circuit_open', v_previous_state.circuit_open,
      'consecutive_failures', v_previous_state.consecutive_failures,
      'mode', v_previous_state.mode
    ),
    jsonb_build_object(
      'capability', p_capability,
      'reset_by', v_auth_uid,
      'reset_at', now(),
      'circuit_open', false,
      'consecutive_failures', 0
    )
  );

  return jsonb_build_object(
    'success', true,
    'capability', p_capability,
    'circuit_open', false,
    'consecutive_failures', 0,
    'message', 'Circuit breaker has been reset'
  );
end;
$$;

-- =============================================================================
-- 3. Grants — authenticated users can execute (admin check inside RPC)
-- =============================================================================

grant execute on function public.admin_upsert_user_limits(uuid, text, integer, numeric) to authenticated;
grant execute on function public.admin_reset_circuit(text) to authenticated;
revoke execute on function public.admin_upsert_user_limits(uuid, text, integer, numeric) from public, anon;
revoke execute on function public.admin_reset_circuit(text) from public, anon;

commit;
