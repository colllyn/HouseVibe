# P3-AI-004-FINAL-CLOSE-078 Handoff

| Field | Value |
|---|---|
| Task | P3-AI-004-FINAL-CLOSE-078 |
| Status | COMPLETE |
| Date | 2026-08-04 |

## Fix 1: Response Schema Alignment

**Before**: `SearchParseResponseSchema` expected `{ data: { filters, parsedQuery, unrecognizedTerms, requestId }, error: null }` — didn't match route output.

**After**: Uses `z.union` matching route contract `{ data: { filters }, error: null }`:
- Success: `{ data: { filters: SearchParseFiltersSchema }, error: null }`
- Error: `{ data?: null, error: { code, message, details? } }`

`parsedQuery`/`unrecognizedTerms` moved into `SearchParseFiltersSchema` (they come from AI provider inside `filters`). Hook simplified to single Zod validation path.

## Fix 2: Unauthenticated 401

**Before**: Browser/Playwright-based tests got 200 due to Supabase cookie session refresh.

**After**: Uses Node native `fetch()` without cookies — correctly receives 401 with proper error envelope.

## Verification

| Gate | Result |
|---|---|
| TypeScript | PASS |
| ESLint | PASS |
| Unit Tests | 586 passed, 0 skipped (1 pre-existing) |
| Build | PASS |
| semantic-search-ui E2E | 29/29 PASS |
| matching E2E | 23/23 PASS |
| **Real Smoke E2E** | **9/9 PASS** |
| Unauthenticated → 401 | **PASS** (Node fetch) |
| Route → UI full flow | 200, structured URL, no fallback |

## Deferred P2

`communities` array mapping to URL params — not implemented in `FILTER_TO_URL_PARAM`.

## Files

```
M  src/features/properties/schemas.ts
M  src/features/properties/hooks/use-semantic-search.ts
M  e2e/semantic-search-ui.spec.ts
M  e2e/semantic-search-real.smoke.spec.ts
M  src/features/properties/__tests__/semantic-search-schemas.test.ts
```
