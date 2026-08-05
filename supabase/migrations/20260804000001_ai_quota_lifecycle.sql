-- Migration: AI Quota Atomic Lifecycle — tables, indexes, RLS, and RPCs
-- Contract: PRD §8 (ai_usage_logs, ai_model_pricing, ai_user_limits), §10.9
--           api-contract.md §10.6, ai-contract.md §16
-- Provides: reserve_ai_quota, settle_ai_quota, release_ai_quota
-- All RPCs: SECURITY DEFINER, search_path = '', verify auth.uid() + workspace membership
-- Atomicity: SELECT FOR UPDATE row locks + unique constraints prevent race conditions

begin;

-- =============================================================================
-- 1. ai_model_pricing — versioned pricing for cost estimation
-- =============================================================================

create table if not exists public.ai_model_pricing (
  id uuid primary key default extensions.gen_random_uuid(),
  provider text not null check (provider in ('deepseek', 'deepseek_self_hosted')),
  model text not null,
  capability text not null,
  input_price_per_1k_tokens numeric not null check (input_price_per_1k_tokens >= 0),
  output_price_per_1k_tokens numeric not null check (output_price_per_1k_tokens >= 0),
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.ai_model_pricing is 'Versioned DeepSeek model pricing for cost estimation and settlement.';
comment on column public.ai_model_pricing.provider is 'Must be deepseek or deepseek_self_hosted.';
comment on column public.ai_model_pricing.capability is 'AI capability: text_generation, visual_analysis, etc.';

-- Index: current pricing lookup
create index if not exists idx_model_pricing_lookup
  on public.ai_model_pricing (provider, model, capability, effective_from desc);

-- =============================================================================
-- 2. ai_user_limits — per-user quota overrides (defaults from env vars)
-- =============================================================================

create table if not exists public.ai_user_limits (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null,
  daily_request_limit integer not null check (daily_request_limit >= 0),
  daily_cost_limit_usd numeric not null check (daily_cost_limit_usd >= 0),
  status text not null default 'active' check (status in ('active', 'blocked')),
  blocked_at timestamptz,
  blocked_reason text,
  manually_restored_at timestamptz,
  restored_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, feature)
);

comment on table public.ai_user_limits is 'Per-user AI quota overrides. Defaults come from env vars when no row exists.';

-- Index for limit lookups
create index if not exists idx_ai_user_limits_lookup
  on public.ai_user_limits (user_id, feature, status);

-- =============================================================================
-- 3. ai_usage_logs — every AI usage tracked with status lifecycle
-- =============================================================================

create table if not exists public.ai_usage_logs (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  action text,
  feature text not null,
  provider text not null default 'deepseek' check (provider in ('deepseek', 'deepseek_self_hosted')),
  model text,
  capability text,
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  estimated_cost_usd numeric check (estimated_cost_usd >= 0),
  reserved_estimated_cost_usd numeric check (reserved_estimated_cost_usd >= 0),
  quota_date date not null,
  quota_units integer not null default 1 check (quota_units >= 0),
  status text not null default 'reserved'
    check (status in (
      'reserved', 'succeeded', 'failed', 'rejected',
      'rejected_compliance', 'blocked_by_cost_limit', 'released'
    )),
  compliance_flags jsonb,
  idempotency_key text not null,
  request_id text not null,
  reservation_expires_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, feature, idempotency_key)
);

comment on table public.ai_usage_logs is 'Immutable audit log of all AI usage with atomic quota tracking.';
comment on column public.ai_usage_logs.status is 'Lifecycle: reserved → succeeded/failed/rejected_compliance/released.';
comment on column public.ai_usage_logs.idempotency_key is 'Unique per (user_id, feature) — prevents duplicate reservations.';

-- Indexes for quota counting and lookups
create index if not exists idx_ai_usage_logs_quota_count
  on public.ai_usage_logs (user_id, feature, quota_date, status)
  where status in ('reserved', 'succeeded');

create index if not exists idx_ai_usage_logs_reservation_expiry
  on public.ai_usage_logs (reservation_expires_at)
  where status = 'reserved';

create index if not exists idx_ai_usage_logs_workspace_date
  on public.ai_usage_logs (workspace_id, quota_date);

create index if not exists idx_ai_usage_logs_request_id
  on public.ai_usage_logs (request_id);

-- =============================================================================
-- 4. RLS — default deny for ai_usage_logs and ai_user_limits
-- =============================================================================

alter table public.ai_usage_logs enable row level security;
alter table public.ai_user_limits enable row level security;
alter table public.ai_model_pricing enable row level security;

-- ai_usage_logs: users can read their own records
create policy "Users can read own usage logs"
  on public.ai_usage_logs
  for select
  using (user_id = (select auth.uid()));

-- ai_user_limits: users can read their own limits
create policy "Users can read own limits"
  on public.ai_user_limits
  for select
  using (user_id = (select auth.uid()));

-- ai_model_pricing: authenticated users can read pricing
create policy "Authenticated users can read model pricing"
  on public.ai_model_pricing
  for select
  using (true);

-- No insert/update/delete policies — all writes go through SECURITY DEFINER RPCs

-- =============================================================================
-- 5. reserve_ai_quota — atomic quota reservation
--    PRD §10.9, api-contract §10.6 step 3
--    In a single serializable transaction:
--      1. Verify auth.uid() matches p_user_id
--      2. Verify active workspace membership
--      3. Check idempotency_key — if exists, return existing result
--      4. Lock user limits row (SELECT FOR UPDATE)
--      5. Count today's effective reserved + succeeded
--      6. Check request_limit and cost_limit
--      7. Insert status='reserved' if under limits
--      8. Return success/failure with remaining counts
-- =============================================================================

create or replace function public.reserve_ai_quota(
  p_user_id uuid,
  p_workspace_id uuid,
  p_feature text,
  p_capability text default null,
  p_quota_date date default null,
  p_request_limit integer default null,
  p_daily_cost_limit_usd numeric default null,
  p_reserved_estimated_cost_usd numeric default 0,
  p_idempotency_key text default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_uid uuid;
  v_member_exists boolean;
  v_existing_record record;
  v_limit_row record;
  v_used_requests integer;
  v_used_cost_usd numeric;
  v_limit_reason text;
  v_quota_date date;
  v_request_limit integer;
  v_cost_limit numeric;
  v_new_id uuid;
  v_expires_at timestamptz;
begin
  -- 1. Verify caller is the claimed user
  v_auth_uid := (select auth.uid());
  if v_auth_uid is null then
    raise exception 'Authentication required' using errcode = 'UA001';
  end if;
  if v_auth_uid != p_user_id then
    raise exception 'User ID mismatch' using errcode = '42501';
  end if;

  -- 2. Verify active workspace membership
  select exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = v_auth_uid
      and status = 'active'
  ) into v_member_exists;

  if not v_member_exists then
    raise exception 'No active workspace membership' using errcode = '42501';
  end if;

  -- 3. Check for existing idempotency_key
  if p_idempotency_key is not null then
    select id, status, reserved_estimated_cost_usd, quota_units
    into v_existing_record
    from public.ai_usage_logs
    where user_id = p_user_id
      and feature = p_feature
      and idempotency_key = p_idempotency_key;

    if found then
      return jsonb_build_object(
        'success', true,
        'already_reserved', true,
        'reservation_id', v_existing_record.id,
        'status', v_existing_record.status,
        'limit_reason', null
      );
    end if;
  end if;

  -- 4. Resolve quota_date, limits
  v_quota_date := coalesce(p_quota_date, (now() at time zone 'Asia/Shanghai')::date);
  v_request_limit := coalesce(p_request_limit, 10);
  v_cost_limit := coalesce(p_daily_cost_limit_usd, 10.0);

  -- 5. Serialize concurrent reservations for same user+feature+date
  --    pg_advisory_xact_lock ensures no two transactions can count+insert
  --    simultaneously, preventing race conditions when no ai_user_limits row exists.
  --    Lock is auto-released at transaction end.
  perform pg_advisory_xact_lock(
    hashtext('ai_quota_reserve_' || p_user_id::text || '_' || p_feature || '_' || v_quota_date::text)
  );

  -- 6. Lock user limits row (or skip if no row exists)
  select id, daily_request_limit, daily_cost_limit_usd, status
  into v_limit_row
  from public.ai_user_limits
  where user_id = p_user_id
    and feature = p_feature
  for update;

  -- If user has custom limits, use them
  if found and v_limit_row.status = 'blocked' then
    return jsonb_build_object(
      'success', false,
      'limit_reason', 'cost_limit',
      'message', '用户 AI 功能已被管理员暂停',
      'remaining_requests', 0,
      'remaining_cost_usd', 0,
      'daily_limit', 0,
      'daily_cost_limit_usd', 0,
      'used_requests', 0,
      'used_cost_usd', 0
    );
  end if;

  if found and v_limit_row.daily_request_limit is not null then
    v_request_limit := v_limit_row.daily_request_limit;
  end if;
  if found and v_limit_row.daily_cost_limit_usd is not null then
    v_cost_limit := v_limit_row.daily_cost_limit_usd;
  end if;

  -- 6. Count today's effective usage (succeeded + reserved but not expired)
  select
    coalesce(count(*) filter (where status = 'succeeded'), 0)
      + coalesce(count(*) filter (where status = 'reserved'
        and (reservation_expires_at is null or reservation_expires_at > now())), 0),
    coalesce(sum(estimated_cost_usd) filter (where status = 'succeeded'), 0)
      + coalesce(sum(reserved_estimated_cost_usd) filter (where status = 'reserved'
        and (reservation_expires_at is null or reservation_expires_at > now())), 0)
  into v_used_requests, v_used_cost_usd
  from public.ai_usage_logs
  where user_id = p_user_id
    and feature = p_feature
    and quota_date = v_quota_date;

  -- 7. Check limits
  if v_used_requests >= v_request_limit then
    v_limit_reason := 'request_limit';
  elsif (v_used_cost_usd + p_reserved_estimated_cost_usd) > v_cost_limit then
    v_limit_reason := 'cost_limit';
  end if;

  if v_limit_reason is not null then
    -- Per compliance-and-audit-contract §4.2 step 5: insert blocked_by_cost_limit record
    if v_limit_reason = 'cost_limit' then
      begin
        insert into public.ai_usage_logs (
          id, user_id, workspace_id, feature, provider, capability,
          reserved_estimated_cost_usd, quota_date, quota_units,
          status, idempotency_key, request_id
        ) values (
          extensions.gen_random_uuid(), p_user_id, p_workspace_id, p_feature, 'deepseek', p_capability,
          p_reserved_estimated_cost_usd, v_quota_date, 0,
          'blocked_by_cost_limit', p_idempotency_key, p_request_id
        );
      exception when unique_violation then
        -- idempotency_key already exists, ignore
      end;
    end if;

    return jsonb_build_object(
      'success', false,
      'limit_reason', v_limit_reason,
      'remaining_requests', greatest(v_request_limit - v_used_requests, 0),
      'remaining_cost_usd', greatest(v_cost_limit - v_used_cost_usd, 0),
      'daily_limit', v_request_limit,
      'daily_cost_limit_usd', v_cost_limit,
      'used_requests', v_used_requests,
      'used_cost_usd', v_used_cost_usd
    );
  end if;

  -- 8. Calculate reservation expiry (5 minutes per compliance-and-audit-contract §4.2)
  v_expires_at := now() + interval '5 minutes';

  -- 9. Insert reserved usage log (with unique_violation guard for concurrent idempotency)
  v_new_id := extensions.gen_random_uuid();
  begin
    insert into public.ai_usage_logs (
      id, user_id, workspace_id, feature, provider, capability,
      reserved_estimated_cost_usd, quota_date, quota_units,
      status, idempotency_key, request_id, reservation_expires_at
    ) values (
      v_new_id, p_user_id, p_workspace_id, p_feature, 'deepseek', p_capability,
      p_reserved_estimated_cost_usd, v_quota_date, 1,
      'reserved', p_idempotency_key, p_request_id, v_expires_at
    );
  exception when unique_violation then
    -- Concurrent request with same idempotency_key won the INSERT race.
    -- Return the winner's record gracefully instead of a raw SQL error.
    select id, status, reserved_estimated_cost_usd, quota_units
    into v_existing_record
    from public.ai_usage_logs
    where user_id = p_user_id
      and feature = p_feature
      and idempotency_key = p_idempotency_key;

    return jsonb_build_object(
      'success', true,
      'already_reserved', true,
      'reservation_id', v_existing_record.id,
      'status', v_existing_record.status,
      'limit_reason', null
    );
  end;

  return jsonb_build_object(
    'success', true,
    'already_reserved', false,
    'reservation_id', v_new_id,
    'status', 'reserved',
    'limit_reason', null,
    'remaining_requests', v_request_limit - v_used_requests - 1,
    'remaining_cost_usd', v_cost_limit - v_used_cost_usd - p_reserved_estimated_cost_usd,
    'daily_limit', v_request_limit,
    'daily_cost_limit_usd', v_cost_limit,
    'used_requests', v_used_requests + 1,
    'used_cost_usd', v_used_cost_usd + p_reserved_estimated_cost_usd,
    'reservation_expires_at', v_expires_at,
    'quota_date', v_quota_date
  );
end;
$$;

-- =============================================================================
-- 6. settle_ai_quota — settle reserved quota with actual usage
--    PRD §10.9: model call complete → update status with real token/cost
--    Idempotent: repeat calls with same idempotency_key are safe
--    State machine: reserved → succeeded | failed | rejected_compliance
--    Error: cannot settle if already released
-- =============================================================================

create or replace function public.settle_ai_quota(
  p_user_id uuid,
  p_workspace_id uuid,
  p_idempotency_key text,
  p_status text,
  p_input_tokens integer default 0,
  p_output_tokens integer default 0,
  p_actual_cost_usd numeric default 0,
  p_model text default null,
  p_request_id text default null,
  p_error_code text default null,
  p_compliance_flags jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_uid uuid;
  v_member_exists boolean;
  v_existing record;
begin
  -- 1. Verify caller is the claimed user
  v_auth_uid := (select auth.uid());
  if v_auth_uid is null then
    raise exception 'Authentication required' using errcode = 'UA001';
  end if;
  if v_auth_uid != p_user_id then
    raise exception 'User ID mismatch' using errcode = '42501';
  end if;

  -- 2. Verify active workspace membership
  select exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = v_auth_uid
      and status = 'active'
  ) into v_member_exists;

  if not v_member_exists then
    raise exception 'No active workspace membership' using errcode = '42501';
  end if;

  -- 3. Validate target status
  if p_status not in ('succeeded', 'failed', 'rejected_compliance') then
    raise exception 'Invalid settle status: %', p_status using errcode = '22023';
  end if;

  -- 4. Find existing record
  select id, status, workspace_id
  into v_existing
  from public.ai_usage_logs
  where user_id = p_user_id
    and idempotency_key = p_idempotency_key;

  if not found then
    raise exception 'No reserved record found for idempotency_key: %', p_idempotency_key
      using errcode = 'P2004';
  end if;

  -- 5. Workspace isolation
  if v_existing.workspace_id != p_workspace_id then
    raise exception 'Workspace mismatch' using errcode = '42501';
  end if;

  -- 6. State machine enforcement
  if v_existing.status in ('succeeded', 'failed', 'rejected_compliance') then
    -- Already settled: idempotent return
    return jsonb_build_object(
      'success', true,
      'idempotent', true,
      'id', v_existing.id,
      'status', v_existing.status,
      'message', 'Already settled'
    );
  end if;

  if v_existing.status = 'released' then
    raise exception 'Cannot settle a released reservation' using errcode = '22023';
  end if;

  -- 7. Update to settled status with actual usage
  update public.ai_usage_logs
  set
    status = p_status,
    input_tokens = p_input_tokens,
    output_tokens = p_output_tokens,
    estimated_cost_usd = p_actual_cost_usd,
    model = p_model,
    request_id = coalesce(p_request_id, request_id),
    error_code = p_error_code,
    compliance_flags = coalesce(p_compliance_flags, compliance_flags),
    updated_at = now()
  where id = v_existing.id;

  return jsonb_build_object(
    'success', true,
    'idempotent', false,
    'id', v_existing.id,
    'status', p_status,
    'message', 'Settled'
  );
end;
$$;

-- =============================================================================
-- 7. release_ai_quota — release a reserved quota (abort, error paths)
--    PRD §10.9: failure paths that don't consume quota → release
--    Idempotent: repeat calls are safe
--    State machine: reserved → released
--    Error: cannot release if already settled
-- =============================================================================

create or replace function public.release_ai_quota(
  p_user_id uuid,
  p_workspace_id uuid,
  p_idempotency_key text,
  p_reason text default 'released'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_uid uuid;
  v_member_exists boolean;
  v_existing record;
begin
  -- 1. Verify caller is the claimed user
  v_auth_uid := (select auth.uid());
  if v_auth_uid is null then
    raise exception 'Authentication required' using errcode = 'UA001';
  end if;
  if v_auth_uid != p_user_id then
    raise exception 'User ID mismatch' using errcode = '42501';
  end if;

  -- 2. Verify active workspace membership
  select exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = v_auth_uid
      and status = 'active'
  ) into v_member_exists;

  if not v_member_exists then
    raise exception 'No active workspace membership' using errcode = '42501';
  end if;

  -- 3. Find existing record
  select id, status, workspace_id
  into v_existing
  from public.ai_usage_logs
  where user_id = p_user_id
    and idempotency_key = p_idempotency_key;

  if not found then
    raise exception 'No reserved record found for idempotency_key: %', p_idempotency_key
      using errcode = 'P2004';
  end if;

  -- 4. Workspace isolation
  if v_existing.workspace_id != p_workspace_id then
    raise exception 'Workspace mismatch' using errcode = '42501';
  end if;

  -- 5. State machine enforcement
  if v_existing.status = 'released' then
    -- Already released: idempotent return
    return jsonb_build_object(
      'success', true,
      'idempotent', true,
      'id', v_existing.id,
      'status', 'released',
      'message', 'Already released'
    );
  end if;

  if v_existing.status in ('succeeded', 'failed', 'rejected_compliance') then
    raise exception 'Cannot release a settled reservation (status: %)', v_existing.status
      using errcode = '22023';
  end if;

  -- 6. Update to released
  update public.ai_usage_logs
  set
    status = 'released',
    error_code = p_reason,
    updated_at = now()
  where id = v_existing.id;

  return jsonb_build_object(
    'success', true,
    'idempotent', false,
    'id', v_existing.id,
    'status', 'released',
    'message', 'Released'
  );
end;
$$;

-- =============================================================================
-- 8. Grant execute permissions
-- =============================================================================

grant execute on function public.reserve_ai_quota(
  uuid, uuid, text, text, date, integer, numeric, numeric, text, text
) to authenticated;

grant execute on function public.settle_ai_quota(
  uuid, uuid, text, text, integer, integer, numeric, text, text, text, jsonb
) to authenticated;

grant execute on function public.release_ai_quota(
  uuid, uuid, text, text
) to authenticated;

revoke execute on function public.reserve_ai_quota(
  uuid, uuid, text, text, date, integer, numeric, numeric, text, text
) from public, anon;

revoke execute on function public.settle_ai_quota(
  uuid, uuid, text, text, integer, integer, numeric, text, text, text, jsonb
) from public, anon;

revoke execute on function public.release_ai_quota(
  uuid, uuid, text, text
) from public, anon;

-- =============================================================================
-- 9. Seed default model pricing (DeepSeek standard models)
--    Prices are estimates — adjust based on actual DeepSeek pricing
-- =============================================================================

insert into public.ai_model_pricing (provider, model, capability, input_price_per_1k_tokens, output_price_per_1k_tokens)
values
  ('deepseek', 'deepseek-v4-flash', 'text_generation',  0.00014, 0.00028),
  ('deepseek', 'deepseek-v4-pro',   'text_generation',  0.00055, 0.00219)
on conflict do nothing;

commit;
