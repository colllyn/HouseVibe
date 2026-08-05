# P3-AI-CLIENT-EXTRACT-086 — AI Client Extraction Route Handoff

**Agent:** ai-deepseek-engineer  
**Task:** P3-AI-CLIENT-EXTRACT-086  
**Date:** 2026-08-05  
**Status:** COMPLETE (pending reviewer confirmation)

## Summary

Implemented `POST /api/ai/extract-client` — a secure AI route for extracting structured client facts from unstructured text. Strictly reuses the property extraction route's security architecture (auth → workspace → entitlement → PII redaction → narrow Provider DTO → envelope response).

## Files Created

| File | Purpose |
|---|---|
| `src/app/api/ai/extract-client/route.ts` | Thin route file — exports POST handler |
| `src/lib/ai/routes/extract-client-handler.ts` | Handler factory with injectable Provider for testing |
| `src/app/api/ai/extract-client/__tests__/route.test.ts` | 34 route tests — all Mock |
| `src/lib/ai/privacy/redact-client-input.ts` | Deterministic client PII redaction (regex, no AI) |
| `src/lib/ai/privacy/__tests__/redact-client-input.test.ts` | 25 redaction unit tests |

## Files Modified

| File | Change |
|---|---|
| `.claude/skills/housevibe-ai-route-gate/SKILL.md` | Added client extraction route checks |

## Contract

- **Route:** `POST /api/ai/extract-client`
- **Entitlement:** `ai_data_extraction` (same as property extraction)
- **Request Schema:** `{ text: string, sourcePlatform?: "wechat" | "text" | "other" }` — Zod `.strict()`
- **Response:** `{ data: { extraction: {...} }, error: null }` — standard envelope
- **Error mapping:** Same as property route (AI_NOT_CONFIGURED→503, AI_TIMEOUT→504, AI_RATE_LIMITED→502, AI_UPSTREAM_ERROR→502, AI_INVALID_RESPONSE→502, ABORTED→rethrow, unknown→500)

## Security Architecture

1. **Auth:** Independent `client.auth.getUser()` — not middleware-only
2. **Workspace:** Queries `workspace_members` — rejects client-provided workspaceId via strict schema
3. **Entitlement:** Checks `ai_data_extraction` before Provider call
4. **Schema:** Zod `.strict()` — rejects userId, workspaceId, modelName, requestId, extra fields
5. **PII Redaction:** Server-side, deterministic regex before Provider call — strips phone, landline, email, wechat, ID card, passport, contact name, exact address
6. **Provider DTO:** Narrow — only `{ text (redacted), sourcePlatform, requestId }` — no identity/workspace/config
7. **Response:** Strips usage from provider output — no raw tokens, no upstream status
8. **No DB writes** — route handler is stateless
9. **No Service Role** — uses user-context Supabase client

## Test Coverage (34 tests)

1-4: Auth/workspace/entitlement (401, 403, 403, similar entitlement blocked)  
5-11: Schema validation (non-JSON, parse fail, empty, whitespace, overlength, extra fields, client workspaceId)  
12-14: Success (envelope, call count, signal forwarding)  
15-19: PII redaction (phone, wechat, email, name, ID card)  
20: Business fact preservation (budget, district, layout, etc.)  
21: Provider DTO narrowness  
22-23: High-risk input → 422, Provider call count = 0  
24: Success envelope shape  
25-29: Provider error mapping (NOT_CONFIGURED→503, TIMEOUT→504, RATE_LIMITED→502, UPSTREAM_ERROR→502, INVALID_RESPONSE→502)  
30: Unknown error → 500  
31: ABORTED rethrows  
32: Error leaks no PII  
33-34: No DB writes, no Service Role

## Privacy Redaction Coverage (28 tests)

- Phone (mobile + landline), email, wechat, ID card, passport
- Client name (self-introduction + title + label)
- Business fact preservation (budget, district, layout, rental type, move-in, commute, pets, etc.)
- Mixed PII + facts
- Whitespace/empty → unsafe
- Pure PII → unsafe
- Clean business text → pass-through unchanged
- Non-mutating

## Verification

```
npm run typecheck  — PASS
npm run test       — 728 passed, 0 failed, 0 skipped
npm run build      — PASS
test:e2e:semantic-search-ui — 34/34
test:e2e:matching  — 23/23
```

## Provider

- No Provider Prompt or Schema modified
- No real DeepSeek calls
- No database writes
- No Service Role
