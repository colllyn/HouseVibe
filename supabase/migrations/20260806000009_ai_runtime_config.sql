-- Migration: AI Runtime Config + Circuit Breaker State
-- P3-AI-016: DeepSeek primary/backup model hot-switch
--
-- Provides:
--   1. ai_runtime_config table for circuit breaker state and admin overrides
--   2. RLS: system admins only
--   3. force_model_mode RPC for admin model mode changes
--   4. Audit logging trigger for config changes

begin;

-- =============================================================================
-- 1. model_mode enum
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'model_mode') then
    create type public.model_mode as enum ('auto', 'primary', 'fallback');
  end if;
end$$;

-- =============================================================================
-- 2. ai_runtime_config table
-- =============================================================================

create table if not exists public.ai_runtime_config (
  capability text not null primary key check (capability in ('text', 'vision')),
  mode public.model_mode not null default 'auto',
  -- Circuit breaker state
  circuit_open boolean not null default false,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  first_failure_at timestamptz default null,
  last_failure_at timestamptz default null,
  last_health_check_at timestamptz default null,
  last_health_check_ok boolean default null,
  -- Admin override tracking
  forced_by uuid references auth.users(id) default null,
  forced_at timestamptz default null,
  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ai_runtime_config is 'AI model runtime configuration and circuit breaker state. One row per capability (text/vision).';
comment on column public.ai_runtime_config.circuit_open is 'True when the circuit breaker has tripped (3+ consecutive 5xx/timeout failures).';
comment on column public.ai_runtime_config.consecutive_failures is 'Count of consecutive 5xx/connection/timeout failures within the window. Reset on success.';
comment on column public.ai_runtime_config.mode is 'Model mode: auto (circuit breaker controls), primary (forced), fallback (forced).';

-- Seed initial rows for text and vision capabilities
insert into public.ai_runtime_config (capability) values ('text')
  on conflict (capability) do nothing;
insert into public.ai_runtime_config (capability) values ('vision')
  on conflict (capability) do nothing;

-- =============================================================================
-- 3. RLS — system admins only
-- =============================================================================

alter table public.ai_runtime_config enable row level security;

-- Only system admins can read config
create policy "System admins can read ai_runtime_config" on public.ai_runtime_config
  for select using (
    (select private.is_system_admin())
  );

-- Only system admins can update config (via RPC)
create policy "System admins can update ai_runtime_config" on public.ai_runtime_config
  for update using (
    (select private.is_system_admin())
  ) with check (
    (select private.is_system_admin())
  );

-- No direct INSERT/DELETE — seed only through migration, update via RPC

-- =============================================================================
-- 4. force_model_mode RPC — admin sets primary/fallback/auto
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

  -- Audit log
  insert into public.audit_logs (
    workspace_id, actor_user_id, action,
    target_type, target_id, details
  ) values (
    '00000000-0000-0000-0000-000000000000',  -- system-wide, no specific workspace
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
-- 5. update_circuit_state RPC — server-side circuit breaker state update
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

grant execute on function public.update_circuit_state(text, boolean, boolean) to authenticated;
revoke execute on function public.update_circuit_state(text, boolean, boolean) from public, anon;

-- =============================================================================
-- 6. get_runtime_config RPC — read circuit breaker state
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

grant execute on function public.get_runtime_config(text) to authenticated;
revoke execute on function public.get_runtime_config(text) from public, anon;

commit;
