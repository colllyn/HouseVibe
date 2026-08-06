-- ============================================================
-- Migration: AI Data Tables RLS Hardening — P3-RLS-002
-- Contract: docs/contracts/rls-contract.md §§4.19–4.24
--
-- Fixes:
--   1. ai_model_pricing: tighten read policy from all-authenticated
--      to system-admins-only per rls-contract §4.22
--   2. ai_model_pricing: add admin insert/update policies
--   3. ai_user_limits: add admin insert/update/delete policies per §4.23
--   4. Add missing table-level grants for ai_usage_logs, ai_correction_logs,
--      ai_runtime_config, ai_model_pricing so RLS policies are reachable
--   5. Add missing table-level grants for ai_user_limits write operations
-- ============================================================

begin;

-- ============================================================
-- 1. ai_model_pricing — fix overly-permissive read policy
-- ============================================================

-- Drop the old policy that allowed any authenticated user to read pricing
drop policy if exists "Authenticated users can read model pricing"
  on public.ai_model_pricing;

-- Replace with SA-only read policy per rls-contract §4.22
create policy "System admins can read model pricing"
  on public.ai_model_pricing
  for select
  using (private.is_system_admin());

-- Admin insert policy
create policy "System admins can insert model pricing"
  on public.ai_model_pricing
  for insert
  with check (private.is_system_admin());

-- Admin update policy
create policy "System admins can update model pricing"
  on public.ai_model_pricing
  for update
  using (private.is_system_admin())
  with check (private.is_system_admin());

-- ============================================================
-- 2. ai_user_limits — add admin write policies per §4.23
-- ============================================================

-- Admin insert policy
create policy "System admins can insert user limits"
  on public.ai_user_limits
  for insert
  with check (private.is_system_admin());

-- Admin update policy
create policy "System admins can update user limits"
  on public.ai_user_limits
  for update
  using (private.is_system_admin())
  with check (private.is_system_admin());

-- Admin delete policy
create policy "System admins can delete user limits"
  on public.ai_user_limits
  for delete
  using (private.is_system_admin());

-- ============================================================
-- 3. Add missing table-level grants for authenticated role
--    Without these, even RLS policies cannot be reached because
--    the authenticated role has no table privilege at all.
--    Explicit revoke from public, anon follows the pattern in
--    content_tables.sql (lines 259-261) for defense-in-depth.
-- ============================================================

-- ai_usage_logs: missing SELECT grant (users read own + SA read all)
grant select on public.ai_usage_logs to authenticated;
revoke all on public.ai_usage_logs from public, anon;

-- ai_correction_logs: missing SELECT grant (users read own + SA read all)
grant select on public.ai_correction_logs to authenticated;
revoke all on public.ai_correction_logs from public, anon;

-- ai_runtime_config: missing SELECT and UPDATE grants (SA-only read/write per §4.24)
grant select, update on public.ai_runtime_config to authenticated;
revoke all on public.ai_runtime_config from public, anon;

-- ai_model_pricing: missing all table grants (SA-only read + write per §4.22)
grant select, insert, update on public.ai_model_pricing to authenticated;
revoke all on public.ai_model_pricing from public, anon;

-- ai_user_limits: missing write grants (SA write per §4.23; SELECT already granted)
grant insert, update, delete on public.ai_user_limits to authenticated;
revoke all on public.ai_user_limits from public, anon;

commit;
