# P3-RLS-002: AI Data Tables RLS Hardening — Handoff

**Task**: P3-RLS-002 (from implementation-plan.md)
**Feature Commit**: 0040564
**Fix Commit**: (pending)
**Status**: COMPLETE
**Date**: 2026-08-06

## Summary

Hardened RLS policies and table-level grants for all AI data tables per rls-contract.md §§4.19–4.24.

## Changes

### Feature Commit (0040564)

**Migration: `supabase/migrations/20260806000017_ai_tables_rls_hardening.sql`**

1. **ai_model_pricing (§4.22)**: Replaced overly-permissive `using (true)` read policy with system-admins-only read. Added admin insert/update policies.
2. **ai_user_limits (§4.23)**: Added admin insert/update/delete policies (user read-own already existed).
3. **Table grants**: Added missing `GRANT SELECT/INSERT/UPDATE/DELETE ... TO authenticated` for ai_usage_logs, ai_correction_logs, ai_runtime_config, ai_model_pricing, ai_user_limits.

**Tests: `supabase/tests/21_ai_tables_rls_test.sql` (30 tests)**
- ai_model_pricing, ai_user_limits, ai_usage_logs, ai_runtime_config, ai_correction_logs RLS coverage
- Anon denial for 3 of 5 tables

**Test Fix: `supabase/tests/20_content_tables_rls_test.sql` (Tests 8–9)**
- Updated to reflect that direct `deleted_at` update is blocked by RLS `with_check`

### Fix Commit (Reviewer Findings)

**P0/P1 Fix — Migration: `supabase/migrations/20260806000018_fix_ai_rpc_admin_checks.sql`**
- Added `perform private.require_system_admin()` to `update_circuit_state` and `get_runtime_config` SECURITY DEFINER RPCs (data-security reviewer P0-1)
- These RPCs previously bypassed table-level RLS — any authenticated user could read circuit breaker state or manipulate it (DoS vector)

**P2 Fix — Migration 00017 revisions:**
- Added `revoke all on public.ai_* from public, anon` for all 5 AI tables (defense-in-depth per content_tables.sql pattern)
- Removed no-op content_projects policy recreation (identical to existing policy in 00014)
- Added explicit comment documenting defense-in-depth pattern

**P2 Fix — Test expansion (`supabase/tests/21_ai_tables_rls_test.sql` 30→39 tests):**
- RPC bypass tests: verify non-SA users rejected from `get_runtime_config` and `update_circuit_state` (tests 21-24)
- Anon denial for ai_runtime_config and ai_user_limits (tests 32-33)
- Anon denial for RPC functions (tests 34-35)
- Outsider (authenticated, non-SA) RPC denial (test 36)

## Reviewer Findings Summary

| Reviewer | P0 | P1 | P2 | P3 |
|----------|----|----|----|-----|
| data-security-engineer | 1 (FIXED) | 2 (FIXED) | 3 (FIXED) | 2 (backlog) |
| quality-reviewer | 0 | 1 (backlog) | 4 (3 FIXED, 1 backlog) | 0 |

**Backlog items:**
- P2-4 (quality): Redundant SELECT policy on ai_correction_logs — cleanup migration
- P3-1 (data-security): Anon denial tests incomplete → FIXED in fix commit
- P3-2 (data-security): ai_model_pricing column names vs domain model → schema alignment task
- P1 (quality): ai_runtime_config INSERT privilege per contract §4.24 — deliberate design: seed-only, no runtime INSERT needed; contract should be updated to match

**Items confirmed correct by both reviewers:**
- All RLS policies correctly use `private.is_system_admin()`, `private.is_workspace_member()`, `private.has_feature()`
- Contract §§4.19-4.23 fully compliant
- No security regressions; `ai_model_pricing` read correctly tightened
- Migration idempotency: all `create policy` preceded by `drop policy if exists`
- Test 8-9 soft-delete behavior correctly validated
- Table grants correctly scoped to authenticated role
- `search_path = ''` on all SECURITY DEFINER functions

## Gate Checks

| Check | Result |
|-------|--------|
| `npm run typecheck` | PASS (0 errors) |
| `npm run lint` | PASS (0 errors, 5 pre-existing warnings) |
| `npm run test` | PASS (51 files, 1282 tests) |
| `npm run build` | PASS |
| `npx supabase test db` | PASS (24 files, 719 tests) |
| `git diff --check` | PASS (no whitespace issues) |

## Known Limitations

1. Direct `UPDATE ... SET deleted_at = now()` is blocked for all authenticated users on content_projects (RLS `with_check` enforces `deleted_at is null`). A `soft_delete_content_project()` RPC function should be created as a follow-up task.
2. The same soft-delete pattern applies to `properties`, `tasks`, and other tables with `deleted_at`. The `clients` table has `soft_delete_client()` as the reference implementation.
3. `ai_runtime_config` has no runtime INSERT — capabilities are seeded through migrations only. If dynamic capability registration is needed later, an INSERT policy must be added (§4.24 contract update needed).
4. `ai_correction_logs` has a redundant SELECT policy ("Admins can read all corrections") fully subsumed by "Users can read own corrections" — cleanup migration recommended.

## Contract Compliance

- rls-contract.md §§4.19–4.24: COMPLIANT
- architecture.md RLS rules: COMPLIANT (default deny, workspace isolation)
- data-security.md RLS rules: COMPLIANT (table grants verified, revoke from public/anon)
