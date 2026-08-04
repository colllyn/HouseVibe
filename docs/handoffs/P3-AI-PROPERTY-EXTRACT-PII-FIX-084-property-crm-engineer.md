# P3-AI-PROPERTY-EXTRACT-PII-FIX-084 Handoff

**Task**: Server-side PII redaction for extract-property route
**Agent**: property-crm-engineer
**Date**: 2026-08-04
**Status**: Complete

## Summary

Added deterministic server-side PII redaction (`redactPropertyInput()`) that runs BEFORE the text reaches the DeepSeek Provider. The redaction uses regex patterns only — no AI model involvement.

## Redaction Rules (in order)

| Rule | Category | Placeholder |
|---|---|---|
| Landline numbers | landline | [REDACTED_PHONE] |
| Email addresses | email | [REDACTED_EMAIL] |
| WeChat wxid_ IDs | wechat | [REDACTED_WECHAT] |
| WeChat label patterns | wechat | [REDACTED_WECHAT] |
| ID card (17+1 digits) | id_card | [REDACTED_ID_CARD] |
| Identity document labels | id_card | [REDACTED_ID_CARD] |
| Mobile phones | phone | [REDACTED_PHONE] |
| Contact names | contact_name | [REDACTED_NAME] |
| Exact addresses | exact_address | [REDACTED_EXACT_ADDRESS] |
| Door numbers | exact_address | [REDACTED_EXACT_ADDRESS] |
| Key locations | key_location | [REDACTED_KEY_LOCATION] |
| Internal notes | internal_note | [REDACTED_INTERNAL_NOTE] |

Order: ID card before mobile phone to prevent substring match (18-digit IDs contain 11-digit prefixes that would match the mobile pattern).

## Rejection Semantics

- 80%+ text removed by a single rule → `safeToSend: false`
- Stripped text (placeholders removed) < 5 chars → `safeToSend: false`
- Handler returns 422 with Provider call count = 0

## Files

- `src/lib/ai/privacy/redact-property-input.ts` (new, 112 lines)
- `src/lib/ai/privacy/__tests__/redact-property-input.test.ts` (new, 23 tests)
- `src/lib/ai/routes/extract-property-handler.ts` (modified — redaction integration)
- `src/app/api/ai/extract-property/__tests__/route.test.ts` (modified — 4 new PII tests)

## Verification

| Check | Result |
|---|---|
| `npm run test` | 665 passed, 0 failed, 0 skipped |
| `npm run build` | PASS |
| E2E | 54/54 |
