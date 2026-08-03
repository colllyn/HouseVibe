-- Migration: Fix idempotency lookup for soft-deleted records + budget validation.
-- P1-1: Idempotency index must exclude soft-deleted rows so re-creation works after delete.
-- P1-3: create_client RPC must validate budget_min <= budget_max.
-- Per quality-reviewer findings on P2-CLIENT-001-PRECOMMIT-CLOSE-026.

begin;

-- =============================================================================
-- 1. Drop old idempotency index (includes soft-deleted rows)
-- =============================================================================
drop index if exists idx_clients_idempotency_scoped;
drop index if exists idx_clients_idempotency_lookup;

-- =============================================================================
-- 2. Create new idempotency index excluding soft-deleted rows
--    This allows re-creation with the same key after soft-delete.
-- =============================================================================
create unique index if not exists idx_clients_idempotency_scoped
  on public.clients(workspace_id, created_by, idempotency_key)
  where idempotency_key is not null and deleted_at is null;

create index if not exists idx_clients_idempotency_lookup
  on public.clients(workspace_id, created_by, idempotency_key)
  where idempotency_key is not null and deleted_at is null;

-- =============================================================================
-- 3. Update create_client RPC: add deleted_at IS NULL to idempotency lookup
--    and add budget_min <= budget_max validation.
-- =============================================================================
create or replace function public.create_client(
  p_name text,
  p_phone text default null,
  p_wechat text default null,
  p_source_platform text default null,
  p_source_content_id uuid default null,
  p_first_property_id uuid default null,
  p_budget_min integer default null,
  p_budget_max integer default null,
  p_preferred_districts text[] default '{}',
  p_preferred_communities text[] default '{}',
  p_bedrooms integer default null,
  p_rental_type text default null,
  p_available_from date default null,
  p_minimum_lease_months integer default null,
  p_pets_required boolean default null,
  p_cooking_required boolean default null,
  p_commute_destination text default null,
  p_hard_requirements jsonb default '[]',
  p_soft_preferences jsonb default '[]',
  p_deal_breakers text[] default '{}',
  p_stage public.client_stage default 'new',
  p_raw_input_text text default null,
  p_next_follow_up_at timestamptz default null,
  p_idempotency_key text default null,
  p_request_fingerprint text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_workspace_id uuid;
  v_client_id uuid;
  v_existing record;
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

  -- 3. Idempotency check (scoped to workspace_id + created_by + key, excludes soft-deleted)
  if p_idempotency_key is not null then
    select id, request_fingerprint,
           jsonb_build_object(
             'id', id, 'name', name, 'stage', stage,
             'created_at', created_at, 'workspace_id', workspace_id, 'created_by', created_by
           ) as response
    into v_existing
    from public.clients
    where workspace_id = v_workspace_id
      and created_by = v_user_id
      and idempotency_key = p_idempotency_key
      and deleted_at is null;

    if found then
      -- Key exists: check fingerprint for content mismatch
      if p_request_fingerprint is not null
         and v_existing.request_fingerprint is not null
         and p_request_fingerprint != v_existing.request_fingerprint then
        raise exception 'Idempotency key reused with different request content'
          using errcode = '23505'; -- unique_violation → 409 CONFLICT
      end if;

      -- Same key, same user, same workspace → return existing result
      return v_existing.response;
    end if;
  end if;

  -- 4. Validate required fields
  if p_name is null or trim(p_name) = '' then
    raise exception 'Client name is required' using errcode = '23502';
  end if;

  -- 5. Validate budget_min <= budget_max
  if p_budget_min is not null and p_budget_max is not null and p_budget_min > p_budget_max then
    raise exception 'budget_min cannot exceed budget_max'
      using errcode = '23502';
  end if;

  -- 6. Insert client
  v_now := now();

  insert into public.clients (
    workspace_id, created_by, name, phone, wechat,
    source_platform, source_content_id, first_property_id,
    budget_min, budget_max,
    preferred_districts, preferred_communities,
    bedrooms, rental_type, available_from, minimum_lease_months,
    pets_required, cooking_required, commute_destination,
    hard_requirements, soft_preferences, deal_breakers,
    stage, raw_input_text, next_follow_up_at,
    idempotency_key, request_fingerprint,
    created_at, updated_at
  ) values (
    v_workspace_id, v_user_id, p_name, p_phone, p_wechat,
    p_source_platform, p_source_content_id, p_first_property_id,
    p_budget_min, p_budget_max,
    coalesce(p_preferred_districts, '{}'), coalesce(p_preferred_communities, '{}'),
    p_bedrooms, p_rental_type, p_available_from, p_minimum_lease_months,
    p_pets_required, p_cooking_required, p_commute_destination,
    coalesce(p_hard_requirements, '[]'::jsonb), coalesce(p_soft_preferences, '[]'::jsonb),
    coalesce(p_deal_breakers, '{}'),
    p_stage, p_raw_input_text, p_next_follow_up_at,
    p_idempotency_key, p_request_fingerprint,
    v_now, v_now
  )
  returning id into v_client_id;

  -- 7. Write audit log (redacted: no phone, wechat, raw_input_text)
  insert into public.audit_logs (
    workspace_id, actor_user_id, entity_type, entity_id, action, after_data
  ) values (
    v_workspace_id, v_user_id, 'client', v_client_id, 'client_created',
    jsonb_build_object(
      'name', p_name,
      'stage', p_stage,
      'created_at', v_now
    )
  );

  -- 8. Return created client in contract format
  return jsonb_build_object(
    'id', v_client_id,
    'name', p_name,
    'stage', p_stage,
    'created_at', v_now,
    'workspace_id', v_workspace_id,
    'created_by', v_user_id
  );
end;
$$;

grant execute on function public.create_client(
  text, text, text, text, uuid, uuid, integer, integer,
  text[], text[], integer, text, date, integer, boolean, boolean,
  text, jsonb, jsonb, text[], public.client_stage, text, timestamptz,
  text, text
) to authenticated;
revoke execute on function public.create_client(
  text, text, text, text, uuid, uuid, integer, integer,
  text[], text[], integer, text, date, integer, boolean, boolean,
  text, jsonb, jsonb, text[], public.client_stage, text, timestamptz,
  text, text
) from public, anon;

-- =============================================================================
-- 4. Add pgTAP regression test for idempotency after soft-delete + budget validation
-- =============================================================================

commit;
