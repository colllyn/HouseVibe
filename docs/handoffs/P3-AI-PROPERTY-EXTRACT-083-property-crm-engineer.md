# P3-AI-PROPERTY-EXTRACT-083 Handoff

**Task**: Implement POST /api/ai/extract-property Route
**Agent**: property-crm-engineer
**Date**: 2026-08-04
**Status**: Complete

## Summary

Implemented the property extraction AI route, handler, and comprehensive test suite. The route extracts structured property facts from unstructured text (chat records, voice transcripts, etc.) using the existing `DeepSeekTextProvider.extractProperty()` method.

## Files Created

### 1. `src/app/api/ai/extract-property/route.ts`
Thin route file — only imports and exports the POST handler.

### 2. `src/lib/ai/routes/extract-property-handler.ts`
Handler factory with full request pipeline:
- **Auth**: Independent `client.auth.getUser()` → 401 UNAUTHENTICATED
- **Workspace**: Queries `workspace_members` → 403 WORKSPACE_ACCESS_DENIED
- **Entitlement**: `hasFeature("ai_data_extraction")` → 403 FEATURE_NOT_ALLOWED
- **Schema**: `ExtractPropertyRequestSchema.strict()` — only `{ text, sourceType }`
- **Provider**: Calls `provider.extractProperty(input, request.signal)` once
- **Privacy**: Strips `usage` from response, no logging, no DB writes
- **Error map**: Same as parse-property-search route

### 3. `src/app/api/ai/extract-property/__tests__/route.test.ts`
25 tests covering:
- 1: 401 unauthenticated
- 2: 403 no workspace
- 3: 403 no entitlement
- 4: 403 wrong entitlement
- 5: 422 non-JSON content type
- 6: 422 JSON parse failure
- 7: 422 empty text
- 8: 422 text over 5000 chars
- 9: 422 extra fields (strict)
- 10: 422 client workspaceId rejected
- 11: 200 success with envelope
- 12: Provider called exactly once
- 13: request.signal forwarded
- 14: Provider receives server-resolved IDs only
- 15: Success envelope shape verified
- 16: AI_NOT_CONFIGURED → 503
- 17: AI_TIMEOUT → 504
- 18: AI_RATE_LIMITED → 502
- 19: AI_UPSTREAM_ERROR → 502
- 20: AI_INVALID_RESPONSE → 502
- 21: Unknown error → 500
- 22: AI_REQUEST_ABORTED rethrows
- 23: Error response does not leak sensitive data
- 24: No database writes
- 25: No Service Role used

### 4. `.claude/skills/housevibe-ai-route-gate/SKILL.md` (updated)
- Scope updated to include both routes with distinct entitlements
- Reviewer file list extended
- PASS criteria extended for signal forwarding, distinct entitlements, no shared logic

## Verification

| Check | Result |
|---|---|
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run test` | 638 passed, 0 failed, 0 skipped |
| `npm run build` | PASS |
| E2E semantic-search-ui | 34/34 |
| E2E matching | 23/23 |

## Key Design Decisions

- **Entitlement**: `ai_data_extraction` (distinct from `semantic_search`)
- **Request DTO**: `{ text, sourceType }` only — `workspaceId`/`userId` resolved server-side
- **Signal forwarding**: `request.signal` passed to `provider.extractProperty()`
- **Privacy**: `usage` field stripped before returning to client
- **Text limit**: 5000 chars max (generous for chat transcripts, reasonable for abuse prevention)
