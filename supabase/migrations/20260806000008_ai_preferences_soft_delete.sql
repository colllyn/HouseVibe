-- Migration: AI Preferences Soft Delete
-- P3-AI-013 post-review fix: add soft delete support
-- Reviewer P0-1: "所有删除使用软删除"
--
-- Adds:
--   1. deleted_at column to ai_user_preferences
--   2. Updated RLS SELECT policy to exclude soft-deleted rows
--   3. Updated RLS DELETE policy → replaced with soft-delete UPDATE
--   4. Updated unique index to exclude soft-deleted rows
--   5. Updated get_active_preferences RPC to exclude deleted rows

begin;

-- 1. Add deleted_at column
alter table public.ai_user_preferences
  add column if not exists deleted_at timestamptz default null;

comment on column public.ai_user_preferences.deleted_at is 'Soft delete timestamp. Non-null means the preference is deleted.';

-- 2. Index for filtering active (non-deleted) preferences
create index if not exists idx_ai_user_prefs_active
  on public.ai_user_preferences (user_id, feature, status)
  where deleted_at is null;

-- 3. Drop existing RLS policies that need updating
drop policy if exists "Users can read own preferences" on public.ai_user_preferences;
drop policy if exists "Users can delete own preferences" on public.ai_user_preferences;
drop policy if exists "Users can update own preference status" on public.ai_user_preferences;

-- 4. Re-create SELECT policy: exclude soft-deleted rows
create policy "Users can read own preferences" on public.ai_user_preferences
  for select using (
    deleted_at is null
    and (
      (auth.uid() is not null and user_id = auth.uid())
      or (auth.uid() is not null and (select private.is_system_admin()))
    )
  );

-- 5. Single merged UPDATE policy: allows status changes AND soft-delete.
-- The BEFORE UPDATE trigger restricts which columns can be modified
-- (status + updated_at for users; all columns for RPC merge via bypass flag).
create policy "Users can update own preferences" on public.ai_user_preferences
  for update using (
    user_id = (select auth.uid())
  ) with check (
    user_id = (select auth.uid())
  );

-- 6. Update unique index to only apply to non-deleted rows
drop index if exists uq_ai_user_prefs_active;
create unique index if not exists uq_ai_user_prefs_active
  on public.ai_user_preferences (user_id, feature, preference_key)
  where status = 'active' and deleted_at is null;

-- 7. Update get_active_preferences RPC to exclude deleted rows
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
  and aup.status = 'active'
  and aup.deleted_at is null;

  return jsonb_build_object(
    'success', true,
    'preferences', coalesce(v_prefs, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_active_preferences(uuid) to authenticated;
revoke execute on function public.get_active_preferences(uuid) from public, anon;

commit;
