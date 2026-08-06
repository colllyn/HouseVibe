# P3-AI-017: Admin AI Usage Dashboard — Handoff

- **Task ID**: P3-AI-017
- **Agent**: ai-deepseek-engineer
- **Status**: COMPLETE (post-review fixes applied)
- **Date**: 2026-08-06

## Summary

Implemented the admin AI usage dashboard at `/admin/ai-usage` with:
- Platform-level aggregated usage stats (today/7d/30d)
- Text vs vision cost separation
- Grouped stats by feature/user/workspace/model/status
- Per-user cost limit management
- Restore blocked user access (blocked users only, with audit trail)

## Review Phase

Three reviewers completed their analysis:
- **quality-reviewer**: Found 2 P0 (groups missing, no Zod validation), 4 P1, 4 P2 — all P0/P1 resolved
- **test-engineer**: Found 2 P1 (anon rejection gaps), 7 P2 — P1 resolved
- **data-security-engineer**: Found 1 P1 (missing audit_logs), 3 P2 — P1 resolved

### Key Fixes Applied (Post-Review)

1. **P0-1**: `admin_get_ai_usage_stats` now implements grouped stats with `GROUP BY` logic based on `p_group_by` parameter, returning a `groups` JSON array
2. **P0-2**: GET route handler now validates RPC response against `UsageSummarySchema` before returning
3. **Test P1-1**: Added anon rejection tests for `admin_upsert_user_limits` and `admin_restore_user_access` in pgTAP
4. **Test P1-2**: Added anon rejection tests for PATCH and POST handlers in route tests
5. **DS P1-1**: `admin_restore_user_access` now writes to `audit_logs` on restore
6. **Quality P1-4**: `admin_restore_user_access` now rejects restore of non-blocked users (raises `42501`)
7. **P2**: Reduced table grants to `SELECT` only (removed INSERT/UPDATE), fixed default feature key to `content_factory`, added catch-block tests, added schema validation failure test, added 7d/user groupBy pgTAP tests

## Files Created

| File | Purpose |
|---|---|
| `src/features/ai-usage/schemas.ts` | Zod schemas for queries, responses, limits |
| `src/features/ai-usage/__tests__/schemas.test.ts` | Unit tests (21 tests) |
| `src/app/api/admin/ai-usage/route.ts` | GET endpoint (system admin only) + Zod response validation |
| `src/app/api/admin/ai-usage/users/[userId]/route.ts` | PATCH limits, POST restore |
| `src/app/api/admin/ai-usage/__tests__/route.test.ts` | Integration tests (22 tests: auth, validation, error paths, anon, catch blocks) |
| `src/app/admin/ai-usage/page.tsx` | Admin dashboard UI |
| `supabase/migrations/20260806000012_admin_ai_usage_rpcs.sql` | 3 RPCs + grants (post-review updated) |
| `supabase/tests/18_admin_ai_usage_rpc_test.sql` | pgTAP tests (22 assertions: admin, non-admin, anon, groups, audit, 7d period, user groupBy, restore guard) |

## Files Modified

| File | Change |
|---|---|
| `src/config/admin-navigation.ts` | Added AI 用量 and AI 模型 nav items |
| `src/components/layout/admin-shell.tsx` | Added BarChart3, Cpu icons |

## Database

- `admin_get_ai_usage_stats(period, group_by)` — Aggregated usage with grouped stats, text/vision breakdown
- `admin_upsert_user_limits(user_id, feature, request_limit, cost_limit)` — Set per-user limits
- `admin_restore_user_access(user_id, feature)` — Restore blocked user access (guarded: blocked-only, with audit_logs)
- Granted SELECT on `ai_user_limits` to `authenticated`

## Testing

- **Unit**: 21 schema tests pass
- **Integration**: 22 API route tests pass (including anon, catch-block, schema validation failure)
- **pgTAP**: 22 assertions pass (including anon for all 3 RPCs, groups verification, 7d/user groupBy, restore guard, audit_logs)
- **Full suite**: 1087 Vitest + 645 pgTAP tests pass
- **TypeScript**: strict, no errors
- **ESLint**: no new errors (pre-existing warnings only)
- **Build**: successful

## Security

- All API routes verify `isSystemAdmin()` before processing
- Database RPCs use `SECURITY DEFINER` with internal admin checks
- Non-admin users receive 403 on all endpoints
- Unauthenticated (anon) users receive 403 on all endpoints (all 3 RPCs + all 3 route handlers verified)
- Invalid UUIDs rejected at API layer
- All user input validated with strict Zod schemas
- RPC response validated against contract schema before returning to frontend
- Restore guarded: only blocked users can be restored
- Audit trail: restore actions written to `audit_logs`
- Table grants follow least-privilege (SELECT only)
