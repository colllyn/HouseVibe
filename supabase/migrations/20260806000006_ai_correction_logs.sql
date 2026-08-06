-- Migration: AI Correction Logs Table + RLS + Safe Insert RPC
-- Contract: domain-model.md §2.20, rls-contract.md §4.20, ai-contract.md §9
-- Task: P3-AI-012 (AI Correction Diff Persistence)
-- Owner: ai-deepseek-engineer / data-security-engineer
--
-- Provides:
--   1. ai_correction_logs table for field-level AI correction diffs
--   2. RLS: users read own; system admins read all; insert only via RPC
--   3. record_ai_correction RPC: server-side safe insert with workspace derivation

begin;

-- =============================================================================
-- 1. ai_correction_logs table
-- =============================================================================

create table if not exists public.ai_correction_logs (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  feature public.feature_key not null,
  request_id uuid not null,
  entity_type text not null check (entity_type in ('property', 'client', 'content')),
  entity_id uuid not null,
  content_version_id uuid,
  prompt_version text not null default '1',
  model_name text not null default 'deepseek',
  original_output jsonb not null,
  corrected_output jsonb not null,
  diff jsonb not null,
  feedback_score integer check (feedback_score >= 0 and feedback_score <= 5),
  feedback_type text,
  feedback_comment text,
  created_at timestamptz not null default now()
);

comment on table public.ai_correction_logs is 'AI correction diffs between original output and user-confirmed data. Sensitive fields must be stripped before insert.';
comment on column public.ai_correction_logs.original_output is 'AI original output (sanitized — no phone/wechat/address).';
comment on column public.ai_correction_logs.corrected_output is 'User-confirmed output (sanitized — no phone/wechat/address).';
comment on column public.ai_correction_logs.diff is 'Field-level JSON diff (changed fields only).';

-- Index: user corrections lookup (most common query pattern)
create index if not exists idx_ai_correction_logs_user
  on public.ai_correction_logs (user_id, feature, created_at desc);

-- Index: request_id lookup for idempotency
create unique index if not exists idx_ai_correction_logs_request
  on public.ai_correction_logs (request_id, entity_type, entity_id);

-- =============================================================================
-- 2. RLS — enable and policies
-- =============================================================================

alter table public.ai_correction_logs enable row level security;

-- Users can read their own correction logs
create policy "Users can read own corrections" on public.ai_correction_logs
  for select using (
    user_id = (select auth.uid())
    or private.is_system_admin()
  );

-- System admins can read all
create policy "Admins can read all corrections" on public.ai_correction_logs
  for select using (
    private.is_system_admin()
  );

-- No direct INSERT/UPDATE/DELETE — only via RPC
-- (no policy grants for these operations)

-- =============================================================================
-- 3. record_ai_correction RPC — safe server-side insert
-- =============================================================================

create or replace function public.record_ai_correction(
  p_user_id uuid,
  p_workspace_id uuid,
  p_feature public.feature_key,
  p_request_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_content_version_id uuid default null,
  p_prompt_version text default '1',
  p_model_name text default 'deepseek',
  p_original_output jsonb default '{}'::jsonb,
  p_corrected_output jsonb default '{}'::jsonb,
  p_diff jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
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

  -- Idempotency: check if correction already exists for this request+entity
  if exists (
    select 1 from public.ai_correction_logs
    where request_id = p_request_id
    and entity_type = p_entity_type
    and entity_id = p_entity_id
  ) then
    -- Return existing record (idempotent — no duplicate write)
    select jsonb_build_object(
      'success', true,
      'idempotent', true,
      'id', id,
      'created_at', created_at
    ) into v_result
    from public.ai_correction_logs
    where request_id = p_request_id
    and entity_type = p_entity_type
    and entity_id = p_entity_id;
    return v_result;
  end if;

  -- Insert correction log
  insert into public.ai_correction_logs (
    user_id, workspace_id, feature, request_id,
    entity_type, entity_id, content_version_id,
    prompt_version, model_name,
    original_output, corrected_output, diff
  ) values (
    p_user_id, p_workspace_id, p_feature, p_request_id,
    p_entity_type, p_entity_id, p_content_version_id,
    p_prompt_version, p_model_name,
    p_original_output, p_corrected_output, p_diff
  )
  returning id into v_result;

  return jsonb_build_object(
    'success', true,
    'idempotent', false,
    'id', v_result
  );
end;
$$;

-- Grant execute to authenticated users only (RPC does its own auth checks)
grant execute on function public.record_ai_correction(
  uuid, uuid, public.feature_key, uuid, text, uuid, uuid, text, text, jsonb, jsonb, jsonb
) to authenticated;
revoke execute on function public.record_ai_correction(
  uuid, uuid, public.feature_key, uuid, text, uuid, uuid, text, text, jsonb, jsonb, jsonb
) from public, anon;

commit;
