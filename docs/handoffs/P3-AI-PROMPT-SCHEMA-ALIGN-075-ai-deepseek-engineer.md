# P3-AI-PROMPT-SCHEMA-ALIGN-075 Handoff

| Field | Value |
|---|---|
| Task | P3-AI-PROMPT-SCHEMA-ALIGN-075 |
| Status | COMPLETE |
| Commit | `e8219e5` |
| Date | 2026-08-04 |

## Root Causes

1. **parsePropertySearch**: The DeepSeek model occasionally omitted the required `parsedQuery` field for minimal inputs like "广州租房". The prompt described `parsedQuery` as optional ("均为可选"), contradicting the Zod schema where it is required (`z.string()`).

2. **generateContent**: The prompt lacked field-by-field type definitions for sub-objects (`imageSequence`, `factsUsed`, `riskFlags`, `complianceFlags`). The model returned strings instead of structured objects, arrays instead of booleans, and omitted `factualSummary`.

## Fixes Applied

### Provider (`deepseek-text-provider.ts`)
- Rewrote `buildParsePropertySearchPrompt`: `parsedQuery` and `unrecognizedTerms` now marked as **required** fields; two examples provided (with and without filters)
- Added `ensureParsedQuery()` fallback: safely fills `parsedQuery` from input query when model omits it (deterministic, only fills missing field)
- Rewrote `buildGenerateContentPrompt`: complete field-by-field schema definitions per platform; full valid JSON examples sourced from shared fixtures; explicit type rules (booleans must be `true`/`false`, arrays of objects must have correct shape)
- Added Zod error detail extraction in `validateAndTransform()`: safe field-path-only messages for debugging

### Fixtures (`fixtures.ts`)
- Single source of truth: 5 valid JSON examples (`SEARCH_FILTER_FIXTURE`, `SEARCH_FILTER_MINIMAL_FIXTURE`, `XIAOHONGSHU_FIXTURE`, `DOUYIN_FIXTURE`, `WECHAT_MOMENTS_FIXTURE`)
- Imported by both prompt builders (programmatic `JSON.stringify()`) and tests (Zod validation)

### Tests
- 17 new P3-075 tests (parsedQuery fallback × 6, generateContent strict types × 6, regression × 2, multi-platform × 2, error safety × 1)
- Fixtures validation test (16 tests): all 5 fixtures pass their Zod schemas, strict/non-strict enforcement verified
- All tests: 74/74 pass, 0 skipped

## Schema Changes

**None.** No Zod schemas were modified. The frozen `src/lib/ai/schemas.ts` is unchanged.

## Verification

| Gate | Result |
|---|---|
| TypeScript | PASS |
| ESLint | PASS (pre-existing warnings only) |
| Unit Tests | 571 passed, 0 skipped (1 pre-existing env.test.ts failure) |
| Build | PASS |
| AI Provider Gate | PASS (15/15 checks) |
| Semantic Search Gate (static) | PASS (relevant checks) |
| Real Smoke Test | **8/8 PASS** |
| P0 Findings | 0 |
| P1 Findings | 0 |
| P2 Findings | 0 |

## Files

```
M  src/lib/ai/providers/deepseek-text-provider.ts
M  src/lib/ai/providers/__tests__/deepseek-text-provider.test.ts
A  src/lib/ai/fixtures.ts
A  src/lib/ai/__tests__/fixtures.test.ts
A  scripts/smoke-deepseek.ts
```

## Key Safety

- No API key, prompt, query text, or raw model response in any committed file
- No `.env.local` staged
- Key only checked via `test -n "$DEEPSEEK_API_KEY"`

## Next Step

Provider 真实 Smoke 已关闭，可以恢复 P3-AI-004 Route/UI 真实验收。
