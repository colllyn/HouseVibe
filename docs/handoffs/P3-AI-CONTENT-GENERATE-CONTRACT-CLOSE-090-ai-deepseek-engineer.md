# P3-AI-CONTENT-GENERATE-CONTRACT-CLOSE-090 — Contract Resolution Handoff

**Agent:** ai-deepseek-engineer
**Task:** P3-AI-CONTENT-GENERATE-CONTRACT-CLOSE-090
**Date:** 2026-08-05
**Architect Decision:** Path A — §10.6 is mandatory
**Status:** COMPLETE

## Summary

Resolved contract conflict between the lightweight route (eea85c3) and api-contract.md §10.6 by aligning the route with the full contract. Solution-architect selected Path A: the current route must match §10.6.

## Architectural Decision

Solution-architect: `AGENT_READY, SELECTED_PATH = A, P0 = 0, P1 = 0`

Evidence: PRD §7.9 mandates quota and compliance for content generation. Implementation plan P3-AI-008 lists full pipeline requirements with dependencies on P3-AI-014 (quota RPC) and P3-AI-010 (compliance). The lightweight route was an intermediate scaffold, not a contract-compliant feature.

## Changes

| File | Change |
|---|---|
| `src/lib/ai/routes/generate-content-handler.ts` | Rewritten: propertyId-based, DB loading, quota step, full §10.6 response |
| `src/app/api/ai/generate-content/__tests__/route.test.ts` | Rewritten: 31 tests covering full pipeline including property/marketing/quota |
| `docs/handoffs/P3-AI-CONTENT-GENERATE-CONTRACT-CLOSE-090-ai-deepseek-engineer.md` | This handoff |

## Route Pipeline (10 steps)

1. Auth (getUser) ✓
2. Workspace membership ✓
3. Entitlement (content_factory) ✓
4. Request validation (strict) ✓
5. Property DB load + ownership/marketing_reuse check ✓
6. Quota reserve (structural — enforced when RPC exists) ✓
7. PII redaction (description, addressText) ✓
8. Provider call (narrow DTO, signal forwarded) ✓
9. Structured Output (Provider Schema) ✓
10. Fact/Compliance (structural — pending/copyAllowed per requiresFactReview) ✓

## Response Shape (§10.6)

```json
{
  "data": {
    "contentVersionId": null,
    "platform": "xiaohongshu",
    "output": { ...GeneratedContent },
    "copyAllowed": true,
    "complianceStatus": "pending",
    "model": null,
    "usage": null,
    "requestId": null
  },
  "error": null
}
```

## New Error Codes

| Code | HTTP | Trigger |
|---|---|---|
| `PROPERTY_NOT_MARKETING_REUSABLE` | 403 | Property not authorized for content generation |
| `QUOTA_EXCEEDED` | 429 | Quota RPC returns error |
| `RESOURCE_NOT_FOUND` | 404 | Property does not exist or is deleted |

## Test Coverage (31 tests)

Auth/workspace/entitlement (5), schema validation (7), property loading/marketing/quota (3), success + envelope + output types (3), signal/call count (2), PII redaction (1), copyAllowed (1), error mapping (5 + unknown + abort), error PII leak + service role (2).

## Verification

```
typecheck: PASS | test: 759/759 | build: PASS
E2E semantic-search: 34/34 | E2E matching: 23/23
Provider Gate: PASS | AI Route Gate: PASS | Semantic Search Gate: PASS
```

## Dependencies (Deferred)

- P3-AI-014: quota RPC (structural placeholder — returns QUOTA_EXCEEDED on RPC error)
- P3-AI-010: compliance module (complianceStatus "pending" until module exists)
- P3-AI-009: fact verification (copyAllowed gated on requiresFactReview from Provider)
