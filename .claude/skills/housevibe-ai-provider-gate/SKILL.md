---
name: housevibe-ai-provider-gate
description: Verify HouseVibe DeepSeek text provider security, schemas, retry behavior, privacy, tests, and scope.
disable-model-invocation: true
---

# HouseVibe AI Provider Gate

Run only when the user explicitly invokes:

`/housevibe-ai-provider-gate`

This skill is verification-only.

## Rules

- Do not modify files.
- Do not fix failures.
- Do not use worktrees.
- Do not connect to remote Supabase.
- Do not use real secrets.
- Do not run `db push`.
- Do not execute Git commit, merge, rebase, reset, clean, or push.
- Report every failure as a blocker.
- Never convert a failed or skipped check into PASS.

## Contracts

This gate is sourced from the following frozen contracts:

- `docs/contracts/ai-contract.md` v2.0 — DeepSeekTextProvider interface, error types, retry strategy, JSON output rules, env config
- `docs/contracts/api-contract.md` §10 — AI API endpoints
- `docs/contracts/error-and-env-conventions.md` — error codes, HTTP mapping, env variables
- `docs/handoffs/P3-AI-001-IMPLEMENT-067.md` — implementation completion report

## Scope

This gate verifies the DeepSeek Text Provider implementation under `src/lib/ai/`. It does NOT verify:

- `/api/ai/` Route Handlers (P3-AI-004) — routes may exist; this gate only checks that `src/lib/ai/` has no HTTP handler dependencies
- Vision Provider (P3-AI-005)
- Real DeepSeek API smoke tests (deferred)
- Database or UI code

**Post-P3-AI-004**: The "no AI Route" rule is refined. `src/app/api/ai/` routes are legitimate deliverables of P3-AI-004. This gate verifies only that the Provider code under `src/lib/ai/providers/` remains self-contained — it must not import from route handler modules, contain `NextRequest`/`NextResponse` references, or embed HTTP handler logic. The route handler itself must delegate to the Provider through clean interfaces.

## Gate Checks

### 1. Key Security

```bash
# No hardcoded Key in production code, no NEXT_PUBLIC_ prefix
# Exclude __tests__ dir to avoid false positives from test fixtures
# Scan provider, schemas, types, and config call paths
grep -RniE "DEEPSEEK_API_KEY\s*[=:]\s*['\"]sk-" \
  src/lib/ai/types.ts \
  src/lib/ai/schemas.ts \
  src/lib/ai/providers/deepseek-text-provider.ts \
  2>/dev/null && echo "CHECK_1A_FAIL: hardcoded key in production code" || echo "CHECK_1A_PASS: no hardcoded key in production code"

grep -Rni "NEXT_PUBLIC_DEEPSEEK" src/lib/ai 2>/dev/null && echo "CHECK_1B_FAIL: client-side key found" || echo "CHECK_1B_PASS: no NEXT_PUBLIC_DEEPSEEK"

# Key only read server-side via getServerEnv()
grep -Rni "DEEPSEEK_API_KEY" src/lib/ai/providers/deepseek-text-provider.ts 2>/dev/null
echo "CHECK_1C: verify all references are via env config, not process.env directly"
```

**Requirement**: No hardcoded API keys. No `NEXT_PUBLIC_` prefix. Key only accessed via `getServerEnv()` or injected config.

### 2. No Service Role Key

```bash
grep -Rni "SUPABASE_SERVICE_ROLE_KEY" src/lib/ai 2>/dev/null && echo "CHECK_2_FAIL" || echo "CHECK_2_PASS"
```

**Requirement**: Must return empty (no matches).

### 3. Narrow DTOs — No Full Objects

```bash
grep -RniE "Property\b|Client\b|User\b" src/lib/ai/types.ts 2>/dev/null | grep -i "input" | head -20
echo "CHECK_3: verify only RedactedPropertyFacts, RedactedClientFacts, or SearchParseInput used in method signatures"
```

**Requirement**: Provider methods accept only narrow DTOs (`PropertyExtractionInput`, `ClientExtractionInput`, `SearchParseInput`, `ContentGenerationInput`). No full `Property`, `Client`, or `User` objects.

### 4. No Sensitive Data in Logs or Errors

```bash
grep -RniE "console\.(log|info|debug|warn|error).*query|console\.(log|info|debug|warn|error).*prompt" src/lib/ai 2>/dev/null && echo "CHECK_4A_FAIL" || echo "CHECK_4A_PASS: no query/prompt in logs"

grep -RniE "Authorization|apiKey|api_key" src/lib/ai/providers/deepseek-text-provider.ts 2>/dev/null | grep -v "Authorization.*Bearer" | grep -v "Authorization.*Header" | grep -v "apiKey.*env" | grep -v "apiKey.*config" | grep -v "DEEPSEEK_API_KEY.*env" | grep -v "message.*not.*contain" | grep -v "logStructured" | grep -v "//"
echo "CHECK_4B: verify Authorization only in HTTP header construction, not in logs/errors"
```

**Requirement**: Prompt, query, API Key, Authorization header, and raw response never appear in logs or error objects. Only `requestId`, `provider`, `modelName`, `durationMs`, `retryCount`, `errorCode`, `inputTokens`, `outputTokens` allowed in structured logs.

### 5. PropertySearchFilterSchema strict()

```bash
grep -A5 "PropertySearchFilterSchema" src/lib/ai/schemas.ts | grep "strict"
echo "CHECK_5: must show .strict() on the schema"
```

**Requirement**: `PropertySearchFilterSchema` must use Zod `.strict()`, rejecting extra fields. Only whitelisted fields allowed. No SQL, code, or arbitrary extra properties.

### 6. Correct API Configuration

```bash
grep -E "deepseek-v4-flash|deepseek-v4-pro|v1/chat/completions|json_object|disabled" src/lib/ai/providers/deepseek-text-provider.ts 2>/dev/null | head -10
echo "CHECK_6: verify correct model IDs, endpoint, response_format, and thinking settings"
```

**Requirement**: 
- Base URL: `POST /v1/chat/completions`
- Primary: `deepseek-v4-flash`
- Fallback: `deepseek-v4-pro`
- `response_format: { type: "json_object" }`
- `thinking: { type: "disabled" }`
- No deprecated model IDs (`deepseek-chat`, `deepseek-reasoner`)

### 7. Max 2 HTTP Requests

```bash
grep -n "MAX_ATTEMPTS\|attempt < MAX_ATTEMPTS\|attempt.*<.*2" src/lib/ai/providers/deepseek-text-provider.ts 2>/dev/null
echo "CHECK_7: must show MAX_ATTEMPTS = 2"
```

**Requirement**: Each Provider call makes at most 2 HTTP requests. No third attempt. No recursive retry.

### 8. Retry Rules

```bash
grep -B2 -A5 "AI_RATE_LIMITED\|AI_UPSTREAM_ERROR\|AI_TIMEOUT\|DEEPSEEK_FALLBACK_MODEL" src/lib/ai/providers/deepseek-text-provider.ts 2>/dev/null | head -40
echo "CHECK_8: verify retry logic matches contract §10.2"
```

**Requirement**:
- 429 → same model retry once (with Retry-After backoff)
- 500/502/503/504 → fallback model retry once
- Network error → fallback model retry once
- Timeout → fallback model retry once
- finish_reason=length truncated JSON → retry once

### 9. No-Retry Rules

```bash
grep -B2 -A3 "AI_REQUEST_ABORTED\|400\|401\|402\|403\|404\|422\|retryable.*false\|Zod.*fail" src/lib/ai/providers/deepseek-text-provider.ts 2>/dev/null | head -30
echo "CHECK_9: verify no-retry cases match contract"
```

**Requirement**:
- Abort → no retry, immediate stop
- 400/401/402/403/404/422 → no retry
- finish_reason=stop with unparseable JSON → no retry
- Valid JSON but Zod validation fails → no retry

### 10. Six Provider Error Types

```bash
grep -E "AI_NOT_CONFIGURED|AI_TIMEOUT|AI_RATE_LIMITED|AI_UPSTREAM_ERROR|AI_INVALID_RESPONSE|AI_REQUEST_ABORTED" src/lib/ai/types.ts 2>/dev/null
echo "CHECK_10: must show all 6 error codes"
```

**Requirement**: All six error codes present. Public error boundary (`DeepSeekProviderErrorCode`) and internal error handling distinct. Error-to-HTTP mapping follows contract §19.2.

### 11. Mock Fetch Only — No Real DeepSeek

```bash
grep -Rni "mockFetchResponse\|vi\.fn\|mockResolvedValue\|mockRejectedValue" src/lib/ai/providers/__tests__/deepseek-text-provider.test.ts 2>/dev/null | head -5
echo "CHECK_11A: tests must use mock fetch"

grep -Rni "DEEPSEEK_API_KEY\s*=\s*['\"]sk-[a-zA-Z0-9]" src/lib/ai/providers/__tests__/ 2>/dev/null && echo "CHECK_11B_FAIL: real key in tests" || echo "CHECK_11B_PASS: no real key in tests"
```

**Requirement**: All unit tests use mock fetch. No real `DEEPSEEK_API_KEY` in test files. No real DeepSeek network calls in unit tests.

### 12. No Smoke Test, No AI Route

```bash
# Cover all smoke file naming conventions
SMOKE_FILES=$(find src/lib/ai \( -name "*.smoke.test.ts" -o -name "*.smoke.test.tsx" -o -name "*.smoke.spec.ts" -o -name "*.smoke.spec.tsx" \) 2>/dev/null || true)
if [ -n "$SMOKE_FILES" ]; then
  echo "CHECK_12A_FAIL: smoke test found: $SMOKE_FILES"
else
  echo "CHECK_12A_PASS: no smoke test"
fi

AI_ROUTE_FILES=$(find src/app/api/ai -type f 2>/dev/null || true)
if [ -n "$AI_ROUTE_FILES" ]; then
  echo "CHECK_12B_INFO: AI routes found (legitimate post-P3-AI-004): $AI_ROUTE_FILES"
  # Routes may exist; verify Provider code has no HTTP handler imports
  if grep -RniE "NextRequest|NextResponse|route-handler" src/lib/ai/providers/ 2>/dev/null; then
    echo "CHECK_12B_FAIL: Provider code has route handler dependencies"
  else
    echo "CHECK_12B_PASS: Provider code is independent of route handlers"
  fi
else
  echo "CHECK_12B_PASS: no AI routes (pre-P3-AI-004 state)"
fi
```

**Requirement**: No `*.smoke.test.ts` files. Provider code under `src/lib/ai/providers/` must be independent of HTTP route handler modules — no `NextRequest`, `NextResponse`, or `route-handler` imports.

### 13. No Skipped Tests

```bash
grep -RniE "test\.skip|describe\.skip|it\.skip|todo\(|xit\(|xdescribe\(" src/lib/ai 2>/dev/null && echo "CHECK_13_FAIL: skipped tests found" || echo "CHECK_13_PASS: no skipped tests"
```

**Requirement**: No skipped or TODO tests in the AI provider code.

### 14. Build Gate

```bash
npm run lint 2>&1 | tail -3
npm run typecheck 2>&1 | tail -1
npm run test 2>&1 | tail -5
npm run build 2>&1 | tail -5
```

**Requirement**: Lint, typecheck, unit tests, and build must all pass. Unit tests must be ≥515 passed, 0 failed, 0 skipped.

### 15. Working Tree Status

```bash
git status --short
```

**Requirement**: Working tree may show untracked files being reviewed but MUST NOT have modified (`M`) or deleted (`D`) files unless explicitly acknowledged. New `??` files are acceptable if they are the gate skill itself or approved additions.

## Deprecated Model Check

```bash
grep -RniE "deepseek-chat|deepseek-reasoner" src/lib/ai 2>/dev/null && echo "DEPRECATED_FAIL" || echo "DEPRECATED_PASS"
```

**Requirement**: No deprecated model IDs anywhere in the AI code.

## Verification Summary

After running all checks above, count:
- Number of `_PASS` results
- Number of `_FAIL` results

## PASS Criteria

ALL of the following must be true:

1. All 15 gate checks above return PASS (no `_FAIL` in any check)
2. Deprecated model check returns PASS
3. `npm run lint` exits 0
4. `npm run typecheck` exits 0
5. `npm run test` shows ≥515 passed, 0 failed, 0 skipped
6. `npm run build` exits 0
7. Working tree shows no modified (`M`) files
8. No `P0` or `P1` findings from quality reviewer
9. `PropertySearchFilterSchema` uses Zod `.strict()`
10. No real DeepSeek API calls in tests
11. Provider code under `src/lib/ai/providers/` has no HTTP handler dependencies
12. No smoke test files exist
13. No skipped/todo tests in `src/lib/ai/`
14. No `SUPABASE_SERVICE_ROLE_KEY` in AI code
15. No `NEXT_PUBLIC_DEEPSEEK` in AI code
16. No deprecated model IDs

## Output

Return a concise report containing:

- overall conclusion (PASS or FAIL)
- each gate check result (pass/fail) with evidence
- deprecated model check result
- lint/typecheck/test/build results with exact counts
- working tree status
- quality reviewer findings (P0–P3)
- blockers (if any)

The conclusion must be exactly one of:

`PASS：HouseVibe DeepSeek Provider Gate 通过`

`FAIL：HouseVibe DeepSeek Provider Gate 未通过`

Any of the following MUST cause FAIL:

- Test failure or skipped tests
- Agent unavailable or timeout
- Key or PII leak detected
- More than 2 HTTP request attempts
- Schema not using strict()
- Real network test detected
- AI Route detected
- P0 > 0 or P1 > 0
