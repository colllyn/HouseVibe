-- Migration: AI User Preferences Table + RLS + Upsert RPC
-- Contract: PRD §8.2 (ai_user_preferences), §10.5 (preference learning)
--           domain-model.md §2.21, rls-contract.md §4.21
-- Task: P3-AI-013 (User Preference Learning)
-- Owner: ai-deepseek-engineer
--
-- Provides:
--   1. ai_user_preferences table for learned user preferences
--   2. RLS: users read/delete own; admins read all; insert only via RPC
--   3. upsert_ai_preference RPC: server-side safe upsert with workspace derivation
--   4. learn_preferences RPC: pattern detection from ai_correction_logs
--   5. get_active_preferences RPC: retrieve preferences for prompt injection

begin;

-- =============================================================================
-- 1. preference_status enum
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'preference_status') then
    create type public.preference_status as enum ('active', 'disabled');
  end if;
end$$;

-- =============================================================================
-- 2. ai_user_preferences table
-- =============================================================================

create table if not exists public.ai_user_preferences (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  feature public.feature_key not null,
  preference_key text not null,
  preference_value jsonb not null,
  evidence_count integer not null default 0 check (evidence_count >= 0),
  confidence numeric(3,2) not null default 0 check (confidence >= 0 and confidence <= 1),
  status public.preference_status not null default 'active',
  source_correction_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ai_user_preferences is 'Learned user preferences from AI correction patterns. Preferences only influence tone/style/format — never fact fields.';
comment on column public.ai_user_preferences.preference_key is 'Stable key identifying the preference pattern (e.g. "tone_formal", "classification_apartment").';
comment on column public.ai_user_preferences.preference_value is 'JSON object with preference details: {correctionDirection, originalPattern, preferredPattern, hint}.';
comment on column public.ai_user_preferences.evidence_count is 'Number of consistent corrections supporting this preference.';
comment on column public.ai_user_preferences.confidence is 'Confidence score 0.0–1.0 derived from evidence_count and consistency.';
comment on column public.ai_user_preferences.source_correction_ids is 'UUID array of ai_correction_logs rows that contributed to this preference.';

-- Index: user preferences lookup
create index if not exists idx_ai_user_prefs_user
  on public.ai_user_preferences (user_id, feature, status);

-- Index: preference key lookup for dedup
create index if not exists idx_ai_user_prefs_key
  on public.ai_user_preferences (user_id, feature, preference_key);

-- Unique constraint: one active preference per user+feature+key
create unique index if not exists uq_ai_user_prefs_active
  on public.ai_user_preferences (user_id, feature, preference_key)
  where status = 'active';

-- =============================================================================
-- 3. RLS — enable and policies
-- =============================================================================

alter table public.ai_user_preferences enable row level security;

-- Users can read their own preferences
create policy "Users can read own preferences" on public.ai_user_preferences
  for select using (
    user_id = (select auth.uid())
    or private.is_system_admin()
  );

-- Users can update status of their own preferences (enable/disable)
-- Column-level restriction enforced by BEFORE UPDATE trigger below
create policy "Users can update own preference status" on public.ai_user_preferences
  for update using (
    user_id = (select auth.uid())
  ) with check (
    user_id = (select auth.uid())
  );

-- BEFORE UPDATE trigger: reject changes to anything except status and updated_at
create or replace function private.check_preference_update_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Allow only status changes (and updated_at which the caller should set)
  if new.id <> old.id then
    raise exception 'Cannot change preference id';
  end if;
  if new.user_id <> old.user_id then
    raise exception 'Cannot change user_id';
  end if;
  if new.workspace_id <> old.workspace_id then
    raise exception 'Cannot change workspace_id';
  end if;
  if new.feature <> old.feature then
    raise exception 'Cannot change feature';
  end if;
  if new.preference_key <> old.preference_key then
    raise exception 'Cannot change preference_key';
  end if;
  if new.preference_value::text <> old.preference_value::text then
    raise exception 'Cannot change preference_value';
  end if;
  if new.evidence_count <> old.evidence_count then
    raise exception 'Cannot change evidence_count';
  end if;
  if new.confidence <> old.confidence then
    raise exception 'Cannot change confidence';
  end if;
  if new.source_correction_ids <> old.source_correction_ids then
    raise exception 'Cannot change source_correction_ids';
  end if;
  if new.created_at <> old.created_at then
    raise exception 'Cannot change created_at';
  end if;
  -- status and updated_at are the only allowed changes
  return new;
end;
$$;

create trigger trg_check_preference_update_columns
  before update on public.ai_user_preferences
  for each row execute function private.check_preference_update_columns();

-- Users can delete their own preferences
create policy "Users can delete own preferences" on public.ai_user_preferences
  for delete using (
    user_id = (select auth.uid())
  );

-- No direct INSERT — use RPC only

-- =============================================================================
-- 4. upsert_ai_preference RPC — server-side safe upsert
-- =============================================================================

create or replace function public.upsert_ai_preference(
  p_user_id uuid,
  p_workspace_id uuid,
  p_feature public.feature_key,
  p_preference_key text,
  p_preference_value jsonb,
  p_evidence_count integer,
  p_confidence numeric,
  p_source_correction_ids uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_existing_id uuid;
  v_new_evidence_count integer;
  v_new_confidence numeric;
  v_merged_source_ids uuid[];
begin
  -- Verify caller is authenticated and matches p_user_id
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  end if;

  if auth.uid() != p_user_id then
    return jsonb_build_object('success', false, 'error', 'USER_ID_MISMATCH');
  end if;

  -- Verify workspace membership
  if not exists (
    select 1 from public.workspace_members
    where user_id = p_user_id
    and workspace_id = p_workspace_id
    and status = 'active'
  ) then
    return jsonb_build_object('success', false, 'error', 'WORKSPACE_ACCESS_DENIED');
  end if;

  -- Reject fact fields (defense-in-depth; learn_preferences also filters these)
  -- Extract base field name from preference_key format: "fieldName_changeType"
  if split_part(p_preference_key, '_modified', 1) in (
    'monthlyRent', 'monthly_rent', 'rentPrice', 'rent_price',
    'area', 'squareMeters', 'square_meters', 'propertyArea',
    'ownerPhone', 'owner_phone', 'ownerWechat', 'owner_wechat',
    'ownerName', 'owner_name', 'clientPhone', 'client_phone',
    'clientWechat', 'client_wechat', 'clientName', 'client_name',
    'clientIdNumber', 'client_id_number',
    'exactAddress', 'exact_address', 'buildingNo', 'building_no',
    'unitNo', 'unit_no', 'roomNo', 'room_no',
    'keyLocation', 'key_location', 'internalNotes', 'internal_notes',
    'price', 'phone', 'wechat', 'address', 'contact'
  ) or split_part(p_preference_key, '_added', 1) in (
    'monthlyRent', 'monthly_rent', 'rentPrice', 'rent_price',
    'area', 'squareMeters', 'square_meters', 'propertyArea',
    'ownerPhone', 'owner_phone', 'ownerWechat', 'owner_wechat',
    'ownerName', 'owner_name', 'clientPhone', 'client_phone',
    'clientWechat', 'client_wechat', 'clientName', 'client_name',
    'clientIdNumber', 'client_id_number',
    'exactAddress', 'exact_address', 'buildingNo', 'building_no',
    'unitNo', 'unit_no', 'roomNo', 'room_no',
    'keyLocation', 'key_location', 'internalNotes', 'internal_notes',
    'price', 'phone', 'wechat', 'address', 'contact'
  ) or split_part(p_preference_key, '_removed', 1) in (
    'monthlyRent', 'monthly_rent', 'rentPrice', 'rent_price',
    'area', 'squareMeters', 'square_meters', 'propertyArea',
    'ownerPhone', 'owner_phone', 'ownerWechat', 'owner_wechat',
    'ownerName', 'owner_name', 'clientPhone', 'client_phone',
    'clientWechat', 'client_wechat', 'clientName', 'client_name',
    'clientIdNumber', 'client_id_number',
    'exactAddress', 'exact_address', 'buildingNo', 'building_no',
    'unitNo', 'unit_no', 'roomNo', 'room_no',
    'keyLocation', 'key_location', 'internalNotes', 'internal_notes',
    'price', 'phone', 'wechat', 'address', 'contact'
  ) then
    return jsonb_build_object('success', false, 'error', 'FACT_FIELD_BLOCKED');
  end if;

  -- Check if existing preference for this user+feature+key
  select id, evidence_count, source_correction_ids
  into v_existing_id, v_new_evidence_count, v_merged_source_ids
  from public.ai_user_preferences
  where user_id = p_user_id
  and feature = p_feature
  and preference_key = p_preference_key
  and status = 'active';

  if found then
    -- Merge: update evidence count, confidence, source IDs
    v_new_evidence_count := v_new_evidence_count + p_evidence_count;
    v_merged_source_ids := array(
      select distinct unnest(v_merged_source_ids || p_source_correction_ids)
    );
    v_new_confidence := least(1.0, v_new_confidence + p_confidence);

    update public.ai_user_preferences
    set
      preference_value = p_preference_value,
      evidence_count = v_new_evidence_count,
      confidence = v_new_confidence,
      source_correction_ids = v_merged_source_ids,
      updated_at = now()
    where id = v_existing_id
    returning id into v_existing_id;

    return jsonb_build_object(
      'success', true,
      'action', 'updated',
      'id', v_existing_id,
      'evidence_count', v_new_evidence_count,
      'confidence', v_new_confidence
    );
  else
    -- Insert new preference
    insert into public.ai_user_preferences (
      user_id, workspace_id, feature, preference_key,
      preference_value, evidence_count, confidence,
      source_correction_ids
    ) values (
      p_user_id, p_workspace_id, p_feature, p_preference_key,
      p_preference_value, p_evidence_count, p_confidence,
      p_source_correction_ids
    )
    returning id into v_existing_id;

    return jsonb_build_object(
      'success', true,
      'action', 'created',
      'id', v_existing_id,
      'evidence_count', p_evidence_count,
      'confidence', p_confidence
    );
  end if;
end;
$$;

grant execute on function public.upsert_ai_preference(
  uuid, uuid, public.feature_key, text, jsonb, integer, numeric, uuid[]
) to authenticated;
revoke execute on function public.upsert_ai_preference(
  uuid, uuid, public.feature_key, text, jsonb, integer, numeric, uuid[]
) from public, anon;

-- =============================================================================
-- 5. learn_preferences RPC — detect patterns from correction logs
-- =============================================================================

create or replace function public.learn_preferences(
  p_user_id uuid,
  p_min_evidence integer default 3
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_corrections record;
  v_result jsonb;
  v_learned_count integer := 0;
begin
  -- Verify caller
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  end if;

  if auth.uid() != p_user_id then
    return jsonb_build_object('success', false, 'error', 'USER_ID_MISMATCH');
  end if;

  -- Detect patterns: group corrections by feature + changed field
  -- Only consider corrections where the same field was changed consistently
  for v_corrections in
    with field_diffs as (
      select
        acl.user_id,
        acl.feature,
        acl.workspace_id,
        acl.id as correction_id,
        jsonb_array_elements(acl.diff) as field_diff
      from public.ai_correction_logs acl
      where acl.user_id = p_user_id
      and acl.diff is not null
      and jsonb_typeof(acl.diff) = 'array'
      and jsonb_array_length(acl.diff) > 0
      and acl.created_at > now() - interval '90 days'
    ),
    extracted as (
      select
        fd.user_id,
        fd.workspace_id,
        fd.feature,
        fd.correction_id,
        fd.field_diff->>'field' as field_name,
        fd.field_diff->>'changeType' as change_type,
        fd.field_diff->>'originalValue' as original_value,
        fd.field_diff->>'confirmedValue' as confirmed_value
      from field_diffs fd
      where fd.field_diff->>'field' is not null
    )
    select
      user_id,
      workspace_id,
      feature,
      field_name,
      change_type,
      original_value,
      confirmed_value,
      array_agg(distinct correction_id) as correction_ids,
      count(distinct correction_id) as occurrence_count
    from extracted
    group by user_id, workspace_id, feature, field_name, change_type, original_value, confirmed_value
    having count(distinct correction_id) >= p_min_evidence
  loop
    -- Skip fact fields (price, area, contacts, address)
    -- These are checked server-side in the application layer as well;
    -- this is a defense-in-depth DB-level guard
    if v_corrections.field_name in (
      'monthlyRent', 'monthly_rent', 'rentPrice', 'rent_price',
      'area', 'squareMeters', 'square_meters', 'propertyArea',
      'ownerPhone', 'owner_phone', 'ownerWechat', 'owner_wechat',
      'ownerName', 'owner_name', 'clientPhone', 'client_phone',
      'clientWechat', 'client_wechat', 'clientName', 'client_name',
      'clientIdNumber', 'client_id_number',
      'exactAddress', 'exact_address', 'buildingNo', 'building_no',
      'unitNo', 'unit_no', 'roomNo', 'room_no',
      'keyLocation', 'key_location', 'internalNotes', 'internal_notes',
      'price', 'phone', 'wechat', 'address', 'contact'
    ) then
      continue;
    end if;

    -- Generate preference key
    -- Format: {field_name}_{change_type}
    declare
      v_pref_key text;
      v_pref_value jsonb;
      v_confidence numeric;
      v_hint text;
    begin
      v_pref_key := v_corrections.field_name || '_' || v_corrections.change_type;

      -- Build hint based on the pattern
      -- IMPORTANT: Do NOT inline original_value or confirmed_value — they may
      -- contain PII (phone numbers, names, addresses) embedded in free-text fields.
      -- Use type-level descriptions only.
      if v_corrections.change_type = 'modified' then
        v_hint := format(
          '用户偏好：字段 "%s" 通常需要修正（基于 %s 次历史修正）',
          v_corrections.field_name,
          v_corrections.occurrence_count::text
        );
      elsif v_corrections.change_type = 'added' then
        v_hint := format(
          '用户偏好：字段 "%s" 通常需要补充（基于 %s 次历史修正）',
          v_corrections.field_name,
          v_corrections.occurrence_count::text
        );
      else
        v_hint := format(
          '用户偏好：字段 "%s" 通常需要调整（基于 %s 次历史修正）',
          v_corrections.field_name,
          v_corrections.occurrence_count::text
        );
      end if;

      -- Confidence: min(1.0, occurrence_count / (p_min_evidence * 2))
      v_confidence := least(1.0, v_corrections.occurrence_count::numeric / (p_min_evidence * 2));

      v_pref_value := jsonb_build_object(
        'correctionDirection', v_corrections.change_type,
        'originalPattern', left(coalesce(v_corrections.original_value, ''), 50),
        'preferredPattern', left(coalesce(v_corrections.confirmed_value, ''), 50),
        'hint', v_hint
      );

      -- Upsert the preference
      v_result := public.upsert_ai_preference(
        v_corrections.user_id,
        v_corrections.workspace_id,
        v_corrections.feature,
        v_pref_key,
        v_pref_value,
        v_corrections.occurrence_count,
        v_confidence,
        v_corrections.correction_ids
      );

      if (v_result->>'success')::boolean then
        v_learned_count := v_learned_count + 1;
      end if;
    end;
  end loop;

  return jsonb_build_object(
    'success', true,
    'learned_count', v_learned_count
  );
end;
$$;

grant execute on function public.learn_preferences(uuid, integer) to authenticated;
revoke execute on function public.learn_preferences(uuid, integer) from public, anon;

-- =============================================================================
-- 6. get_active_preferences RPC — retrieve for prompt injection
-- =============================================================================

create or replace function public.get_active_preferences(
  p_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefs jsonb;
begin
  -- Verify caller
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  end if;

  if auth.uid() != p_user_id then
    return jsonb_build_object('success', false, 'error', 'USER_ID_MISMATCH');
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', aup.id,
      'feature', aup.feature,
      'preferenceKey', aup.preference_key,
      'preferenceValue', aup.preference_value,
      'evidenceCount', aup.evidence_count,
      'confidence', aup.confidence,
      'status', aup.status,
      'createdAt', aup.created_at,
      'updatedAt', aup.updated_at
    )
    order by aup.confidence desc, aup.evidence_count desc
  ) into v_prefs
  from public.ai_user_preferences aup
  where aup.user_id = p_user_id
  and aup.status = 'active';

  return jsonb_build_object(
    'success', true,
    'preferences', coalesce(v_prefs, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_active_preferences(uuid) to authenticated;
revoke execute on function public.get_active_preferences(uuid) from public, anon;

commit;
