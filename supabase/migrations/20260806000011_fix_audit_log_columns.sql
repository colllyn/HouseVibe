-- Migration: Fix audit_logs column names in ai_runtime_config RPCs
-- P0-1, P0-2 from data-security-review: force_model_mode and update_circuit_state
-- used non-existent columns (target_type, target_id, details).
-- Correct columns: entity_type, entity_id, after_data.
-- Also: allow NULL actor_user_id for system-level audit entries (circuit breaker).

begin;

-- Allow NULL actor_user_id for system-level audit entries (circuit breaker, etc.)
alter table public.audit_logs
  alter column actor_user_id drop not null;

-- =============================================================================
-- Fixed force_model_mode RPC
-- =============================================================================

create or replace function public.force_model_mode(
  p_capability text,
  p_mode public.model_mode
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Verify admin
  if not (select private.is_system_admin()) then
    return jsonb_build_object('success', false, 'error', 'ADMIN_REQUIRED');
  end if;

  -- Validate capability
  if p_capability not in ('text', 'vision') then
    return jsonb_build_object('success', false, 'error', 'INVALID_CAPABILITY');
  end if;

  update public.ai_runtime_config
  set
    mode = p_mode,
    forced_by = auth.uid(),
    forced_at = now(),
    updated_at = now()
  where capability = p_capability;

  if not found then
    return jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  end if;

  -- Audit log with correct column names
  insert into public.audit_logs (
    workspace_id, actor_user_id, action,
    entity_type, entity_id, after_data
  ) values (
    null,
    auth.uid(),
    'ai_model_mode_change',
    'ai_runtime_config',
    p_capability,
    jsonb_build_object('mode', p_mode, 'capability', p_capability)
  );

  return jsonb_build_object('success', true, 'mode', p_mode);
end;
$$;

grant execute on function public.force_model_mode(text, public.model_mode) to authenticated;
revoke execute on function public.force_model_mode(text, public.model_mode) from public, anon;

-- =============================================================================
-- Fixed update_circuit_state RPC
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

    -- Audit log for circuit trip — correct column names
    insert into public.audit_logs (
      workspace_id, actor_user_id, action,
      entity_type, entity_id, after_data
    ) values (
      null,
      null,  -- system action, no specific user
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

grant execute on function public.update_circuit_state(text, boolean, boolean) to authenticated;
revoke execute on function public.update_circuit_state(text, boolean, boolean) from public, anon;

commit;
