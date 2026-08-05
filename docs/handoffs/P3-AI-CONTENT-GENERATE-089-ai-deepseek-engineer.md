# P3-AI-CONTENT-GENERATE-089 — AI Content Generation Route Handoff

**Agent:** ai-deepseek-engineer
**Task:** P3-AI-CONTENT-GENERATE-089
**Date:** 2026-08-05
**Status:** COMPLETE (pending reviewer confirmation)

## Summary

Implemented `POST /api/ai/generate-content` — a secure AI route for generating platform-specific marketing content (xiaohongshu, douyin, wechat_moments) from safe property facts. Strictly reuses the existing AI route security architecture.

## Scope

This is a lightweight route providing core AI content generation with the standard security checks. It does NOT include quota reservation, compliance scanning, property DB validation, or content_versions persistence — those are full production features outside this slice.

## Files Created

| File | Purpose |
|---|---|
| `src/app/api/ai/generate-content/route.ts` | Thin route file |
| `src/lib/ai/routes/generate-content-handler.ts` | Handler factory with injectable Provider |
| `src/app/api/ai/generate-content/__tests__/route.test.ts` | 34 route tests — all Mock |

## Files Modified

| File | Change |
|---|---|
| `.claude/skills/housevibe-ai-route-gate/SKILL.md` | Added content generation route checks |

## Contract

- **Route:** `POST /api/ai/generate-content`
- **Entitlement:** `content_factory`
- **Error code on denial:** `CONTENT_FACTORY_NOT_ALLOWED` (403)
- **Request Schema:** `{ platform, propertyFacts, ...contentOptions }` — Zod `.strict()`
- **Response:** `{ data: { content: {...} }, error: null }`
- **Platforms:** `xiaohongshu`, `douyin`, `wechat_moments`

## Security Architecture

1. Auth → Workspace → Entitlement (content_factory) — same pattern as all AI routes
2. Schema: `.strict()` — rejects userId, workspaceId, requestId, modelName, extra fields
3. PII Redaction: `redactPropertyInput()` on description field — deterministic regex
4. Provider DTO: `ContentGenerationInput` — no userId, workspaceId, propertyId, clientId
5. Response: returns `{ content }` — no model, tokens, usage, requestId, upstreamStatus
6. No DB writes, no Service Role, signal forwarded

## Test Coverage (34 tests)

1-5: Auth/workspace/entitlement denial
6-12: Schema validation (non-JSON, parse fail, empty, overlength, invalid enum, extra fields, identity fields)
13-15: Success, call count, signal
16-20: DTO narrowness, identity exclusion, PII redaction, facts preservation
21-24: Envelope, factualSummary, requiresFactReview, contract types
25-29: Provider error mapping
30-31: Unknown → 500, abort rethrow
32-34: Error PII leak, no DB writes, no Service Role

## Verification

```
npm run typecheck  — PASS
npm run test       — 762 passed, 0 failed, 0 skipped
npm run build      — PASS (compiled)
```

## Provider

- No Provider Prompt or Schema modified
- No real DeepSeek calls
- No database writes
- No Service Role
