-- Migration: Add disable_feature_entitlement RPC
-- Separates "disable" (status='disabled', no revoked_by/at) from "revoke"
-- (status='revoked', with revoked_by/at).
--
-- The entitlement_status enum already includes 'disabled' (created in
-- 20260801000001_admin_entitlements.sql). The audit trigger also already
-- distinguishes feature_entitlement_disabled from feature_entitlement_revoked.
--
-- Idempotent: only disables active entitlements. Already-disabled or revoked
-- entitlements return a clean FE002 error.

-- =============================================================================
-- disable_feature_entitlement RPC
-- =============================================================================

create or replace function public.disable_feature_entitlement(
  p_user_id uuid,
  p_feature public.feature_key,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_entitlement_id uuid;
  v_result jsonb;
begin
  -- 1. Authorization: only active system admins
  perform private.require_system_admin();

  -- 2. Determine actor from the authenticated JWT — never trusts client input
  v_admin_id := (select auth.uid());

  -- 3. Find an active entitlement (only active can be disabled)
  --    Already-disabled or revoked entitlements should not be re-disabled.
  select id into v_entitlement_id
  from public.feature_entitlements
  where user_id = p_user_id
    and feature = p_feature
    and status = 'active';

  if not found then
    raise exception 'No active entitlement found for user "%" feature "%"',
      p_user_id, p_feature
      using errcode = 'FE002';
  end if;

  -- 4. Disable: set status = 'disabled', do NOT touch revoked_by/revoked_at
  update public.feature_entitlements
  set status = 'disabled',
      reason = p_reason,
      updated_at = now()
  where id = v_entitlement_id;

  -- 5. Audit: handled by existing trigger (audit_feature_entitlement_change)
  --    which emits feature_entitlement_disabled when new.status = 'disabled'
  --    and old.status != 'disabled'.

  -- 6. Return result
  select jsonb_build_object(
    'id', v_entitlement_id,
    'user_id', p_user_id,
    'feature', p_feature,
    'status', 'disabled',
    'disabled_by', v_admin_id,
    'disabled_at', now(),
    'reason', p_reason
  ) into v_result;

  return v_result;
end;
$$;

-- Only authenticated users can call this function (admin check is internal).
grant execute on function public.disable_feature_entitlement(uuid, public.feature_key, text) to authenticated;
revoke execute on function public.disable_feature_entitlement(uuid, public.feature_key, text) from public, anon;
