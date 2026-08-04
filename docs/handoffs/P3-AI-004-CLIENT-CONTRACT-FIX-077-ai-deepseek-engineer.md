# P3-AI-004-CLIENT-CONTRACT-FIX-077 Handoff

| Field | Value |
|---|---|
| Task | P3-AI-004-CLIENT-CONTRACT-FIX-077 |
| Status | COMPLETE |
| Date | 2026-08-04 |

## Fix Applied

**Hook request body projection** (`use-semantic-search.ts:199`):
- Changed `JSON.stringify(validation.data)` → `JSON.stringify({ query: validation.data.query })`
- Route `ParseSearchRequestSchema.strict()` unchanged — continues to reject extra fields
- `requestId` stays in client-side `SearchParseInputSchema` for internal tracking only

**Hook response parsing tolerance** (`use-semantic-search.ts:271-307`):
- Accepts both contract shape `{ data: { filters, parsedQuery, unrecognizedTerms, requestId } }` and minimal shape `{ data: { filters } }`
- Extracts `parsedQuery`/`unrecognizedTerms` from `filters` when not at `data` level

## Verification

| Gate | Result |
|---|---|
| TypeScript | PASS |
| ESLint | PASS |
| Unit Tests | 582 passed, 0 skipped |
| Build | PASS |
| semantic-search-ui E2E | 29/29 PASS |
| matching E2E | 23/23 PASS |
| **Real Smoke E2E** | **9/9 PASS** |
| Real Route HTTP | 200 with valid schema |
| No fallback triggered | Confirmed (URL has structured params) |
| Auth/Entitlement | 403 for no entitlement, 422 for extra requestId |

## Review Findings

| Level | Finding | Status |
|---|---|---|
| P0 | None | — |
| P1 | Route response shape vs SearchParseResponseSchema mismatch (dead Zod path in hook) | Preexisting, documented |
| P2 | `communities` array dropped in URL param mapping | Preexisting |

## Key Safety

- No API key, prompt, query text, or raw model response in committed files
- No `.env.local` staged
- No Service Role in production AI code

## Files Changed

```
M  src/features/properties/hooks/use-semantic-search.ts
M  package.json
M  playwright.config.ts
A  e2e/semantic-search-real.smoke.spec.ts
A  src/features/properties/__tests__/semantic-search-hook.test.tsx
```
