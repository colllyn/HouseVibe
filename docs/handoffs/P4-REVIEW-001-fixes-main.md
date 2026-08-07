# P4-REVIEW-001-fixes — Handoff Report

**Date:** 2026-08-07
**Agent:** main (Team Lead)
**Phase:** Phase 4 Quality Review Remediation

## Summary

Executed NEXT-FULL-SLICE-125 methodology: identified P0/P1 findings from quality review, implemented all fixes, verified gates pass (typecheck, lint, test, build).

## Fixed Issues

### P0-001: Add quota lifecycle to extraction endpoints (CRITICAL)
- **Problem:** 3 AI extraction endpoints (`extract-property`, `extract-client`, `parse-property-search`) had NO quota enforcement. Users could bypass AI rate limits entirely.
- **Fix:** Created shared `quota-helpers.ts` module with `reserveQuota`/`settleQuota`/`releaseQuota` wrappers matching the existing `generate-content-handler.ts` pattern. Applied atomic quota lifecycle (reserve → Provider call → settle/release) to all 3 handlers.
- **Files:**
  - `src/lib/ai/routes/quota-helpers.ts` (new) — shared quota lifecycle helpers
  - `src/lib/ai/routes/extract-property-handler.ts` — quota lifecycle @ property extraction
  - `src/lib/ai/routes/extract-client-handler.ts` — quota lifecycle @ client extraction
  - `src/lib/ai/routes/parse-property-search-handler.ts` — quota lifecycle @ semantic search
  - `src/config/env.ts` — added `AI_DAILY_EXTRACTION_LIMIT`, `AI_DAILY_SEARCH_LIMIT`
  - 3 test files updated with `getServerEnv()` mocks and quota RPC return shapes

### P0-002: STT hardcoded limits (configuration drift)
- **Problem:** Audio upload limits were hardcoded constants instead of environment variables.
- **Fix:** Replaced hardcoded `MAX_FILE_BYTES` and `MAX_AUDIO_DURATION_SECONDS` with `getServerEnv()` values.
- **File:** `src/lib/ai/routes/transcribe-handler.ts`

### P1-001: Strip EXIF from vision images
- **Problem:** Images uploaded to Supabase Storage retained GPS, camera, and other EXIF metadata. Signed URLs passed to DeepSeek Vision Provider could leak location data.
- **Fix:** Created `src/lib/media/strip-exif.ts` using sharp to auto-rotate and strip all EXIF metadata at upload time. Integrated into the media upload POST handler with a safe fallback (original file used if stripping fails).
- **Files:** `src/lib/media/strip-exif.ts` (new), `src/app/api/properties/[id]/media/route.ts`

### P1-002: Middleware session validation (weak auth check)
- **Problem:** Middleware checked for a valid session by inspecting cookie length (`c.value.length > 20`) instead of actual auth server validation.
- **Fix:** Changed `updateSession()` to return the validated user from `getUser()`. Middleware now checks `if (!user)` instead of cookie length inspection.
- **Files:** `src/lib/supabase/middleware.ts`, `src/middleware.ts`

### P1-003: Remove dead `toPublicFlags` function
- **Problem:** Dead function with severity-conversion bug, 0 call sites.
- **Fix:** Removed function.
- **File:** `src/lib/compliance/check.ts`

### P1-004: Fix stub privacy actions
- **Problem:** `exportDataAction` and `deleteAccountAction` were stubs (placeholder messages).
- **Fix:** Implemented actual data export (profile + memberships) and soft-delete account.
- **Files:** `src/app/(dashboard)/settings/privacy/actions.ts`, `supabase/migrations/20260807000001_add_profiles_deleted_at.sql` (new)

### Infrastructure
- Added `/content` and `/publishing` to middleware PROTECTED paths list (P1-002 follow-up)

## Gate Results

| Gate | Status |
|------|--------|
| `npx tsc --noEmit` | ✅ 0 errors |
| `npm run lint` | ✅ 0 errors (pre-existing warnings only) |
| `npm run test` | ✅ 1282/1282 passed (51 files) |
| `npm run build` | ✅ Production build successful |

## Remaining P2/P3 Items (Backlog)

- P2 items from quality review: documented in reviewer report, deferred per methodology
- P3 items: UX polish, performance tuning — backlog

## Reviewer Findings (post-fix)

All P0 and P1 findings from the quality review have been addressed. No regressions detected in the test suite. Test mocks updated to reflect new quota lifecycle (3 test files updated with `getServerEnv()` mocks).

## Architectural Notes

- Quota lifecycle pattern extracted to `quota-helpers.ts` — all AI handlers now share the same reserve/settle/release flow
- `RpcClient` interface uses structural typing to avoid coupling to specific Supabase client types
- EXIF stripping at upload time (earliest possible point) — defense-in-depth for all downstream consumers including vision provider
- Middleware session check now relies on actual `getUser()` validation per Supabase best practices
