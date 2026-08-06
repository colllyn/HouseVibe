-- =============================================================================
-- Migration: Fix AI RPC Admin Checks — P3-RLS-002 reviewer finding
-- Contract: rls-contract.md §4.24 (ai_runtime_config SA-only)
--
-- Fixes P0-1: update_circuit_state and get_runtime_config are SECURITY DEFINER
-- functions that bypass the table RLS policy. Any authenticated user could
-- read circuit breaker state or manipulate it (DoS). Added explicit
-- private.require_system_admin() checks at function entry.
-- =============================================================================

begin;

-- =============================================================================
-- 1. update_circuit_state — add admin check
-- =============================================================================

create or replace function public.update_circuit_state(
  p_capability text,
  p_success boolean,
  p_is_server_error boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config record;
  v_window_seconds integer := 300;  -- 5-minute window
  v_threshold integer := 3;         -- 3 consecutive failures
begin
  -- Admin check: only system admins can update circuit state
  perform private.require_system_admin();

  -- Validate capability
  if p_capability not in ('text', 'vision') then
    return jsonb_build_object('success', false, 'error', 'INVALID_CAPABILITY');
  end if;

  select * into v_config
  from public.ai_runtime_config
  where capability = p_capability;

  if not found then
    return jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  end if;

  -- If admin has forced a mode, don't update circuit state
  if v_config.mode != 'auto' then
    return jsonb_build_object(
      'success', true,
      'circuit_open', v_config.circuit_open,
      'mode', v_config.mode,
      'reason', 'mode_forced'
    );
  end if;

  if p_success then
    -- Reset circuit on success
    update public.ai_runtime_config
    set
      circuit_open = false,
      consecutive_failures = 0,
      first_failure_at = null,
      last_failure_at = null,
      last_health_check_at = now(),
      last_health_check_ok = true,
      updated_at = now()
    where capability = p_capability;

    return jsonb_build_object(
      'success', true,
      'circuit_open', false,
      'consecutive_failures', 0
    );
  end if;

  -- Failure path — only count server errors (5xx/connection/timeout)
  if not p_is_server_error then
    -- 4xx / schema / compliance — not a server fault, don't count
    return jsonb_build_object(
      'success', true,
      'circuit_open', v_config.circuit_open,
      'consecutive_failures', v_config.consecutive_failures,
      'reason', 'non_server_error_ignored'
    );
  end if;

  -- Server error: increment failures
  -- Check if within the window
  if v_config.first_failure_at is null or
     v_config.first_failure_at < (now() - (v_window_seconds || ' seconds')::interval) then
    -- New window
    update public.ai_runtime_config
    set
      consecutive_failures = 1,
      first_failure_at = now(),
      last_failure_at = now(),
      last_health_check_at = now(),
      last_health_check_ok = false,
      updated_at = now()
    where capability = p_capability;

    return jsonb_build_object(
      'success', true,
      'circuit_open', false,
      'consecutive_failures', 1
    );
  end if;

  -- Within window: increment
  update public.ai_runtime_config
  set
    consecutive_failures = consecutive_failures + 1,
    last_failure_at = now(),
    last_health_check_at = now(),
    last_health_check_ok = false,
    updated_at = now()
  where capability = p_capability;

  -- Check if circuit should open
  if v_config.consecutive_failures + 1 >= v_threshold then
    update public.ai_runtime_config
    set
      circuit_open = true,
      updated_at = now()
    where capability = p_capability;

    -- Audit log for circuit trip
    insert into public.audit_logs (
      workspace_id, actor_user_id, action,
      target_type, target_id, details
    ) values (
      '00000000-0000-0000-0000-000000000000',
      '00000000-0000-0000-0000-000000000000',  -- system action
      'ai_circuit_tripped',
      'ai_runtime_config',
      p_capability,
      jsonb_build_object(
        'capability', p_capability,
        'consecutive_failures', v_config.consecutive_failures + 1,
        'threshold', v_threshold
      )
    );

    return jsonb_build_object(
      'success', true,
      'circuit_open', true,
      'consecutive_failures', v_config.consecutive_failures + 1,
      'reason', 'circuit_tripped'
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'circuit_open', false,
    'consecutive_failures', v_config.consecutive_failures + 1
  );
end;
$$;

-- Re-establish grants
grant execute on function public.update_circuit_state(text, boolean, boolean) to authenticated;
revoke execute on function public.update_circuit_state(text, boolean, boolean) from public, anon;

-- =============================================================================
-- 2. get_runtime_config — add admin check
-- =============================================================================

create or replace function public.get_runtime_config(
  p_capability text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config record;
begin
  -- Admin check: only system admins can read runtime config
  perform private.require_system_admin();

  if p_capability not in ('text', 'vision') then
    return jsonb_build_object('success', false, 'error', 'INVALID_CAPABILITY');
  end if;

  select * into v_config
  from public.ai_runtime_config
  where capability = p_capability;

  if not found then
    return jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  end if;

  return jsonb_build_object(
    'success', true,
    'capability', v_config.capability,
    'mode', v_config.mode,
    'circuit_open', v_config.circuit_open,
    'consecutive_failures', v_config.consecutive_failures,
    'first_failure_at', v_config.first_failure_at,
    'last_failure_at', v_config.last_failure_at,
    'last_health_check_at', v_config.last_health_check_at,
    'last_health_check_ok', v_config.last_health_check_ok,
    'forced_by', v_config.forced_by,
    'forced_at', v_config.forced_at
  );
end;
$$;

-- Re-establish grants
grant execute on function public.get_runtime_config(text) to authenticated;
revoke execute on function public.get_runtime_config(text) from public, anon;

commit;
