---
name: housevibe-ai-route-gate
description: Verify HouseVibe AI Route authentication, workspace isolation, entitlement, request schemas, provider boundaries, privacy, error mapping, and tests.
disable-model-invocation: true
---

# HouseVibe AI Route Gate

Run only when the user explicitly invokes:

`/housevibe-ai-route-gate`

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

- `docs/contracts/ai-contract.md` v2.0 — DeepSeekTextProvider interface, error types, request/response contracts
- `docs/contracts/api-contract.md` §10 — AI API endpoints, status codes, error envelopes
- `docs/contracts/error-and-env-conventions.md` — error codes, HTTP mapping, privacy rules
- `src/lib/ai/types.ts` — `DeepSeekProviderError`, `DeepSeekProviderErrorCode`, `SearchParseInput`, `PropertySearchFilters`
- `src/lib/ai/schemas.ts` — `PropertySearchFilterSchema`
- `src/lib/ai/routes/parse-property-search-handler.ts` — Route handler factory

## Scope

This gate verifies every AI API route under `src/app/api/ai/**/route.ts`. Currently:

- `POST /api/ai/parse-property-search` — P3-AI-004 (semantic_search entitlement)
- `POST /api/ai/extract-property` — P3-AI-083 (ai_data_extraction entitlement)
- `POST /api/ai/extract-client` — P3-AI-086 (ai_data_extraction entitlement)

Each route uses its own precise entitlement, narrow DTO, and no shared prompt/retry logic.
Future AI routes (e.g., P3-AI-005 Vision) must be added to this gate when implemented.

## Agent Gate

Start these agents in the current workspace:

- `ai-deepseek-engineer`
- `data-security-engineer`
- `test-engineer`
- `quality-reviewer`

They must not use worktrees.

If any agent is unavailable, return FAIL. Do not substitute.

Each agent must return `AGENT_READY` before the gate proceeds. If any agent fails to return `AGENT_READY`, the skill must FAIL. The main agent must not perform the agent's work.

---

## Phase Boundary Verification

Confirm Route-only scope:

```bash
# 1. AI routes exist under src/app/api/ai/
find src/app/api/ai -type f 2>/dev/null
echo "---"

# 2. No client-side NLP or keyword extraction in property code
grep -RniE "parseQuery|extractDistrict|keywordMap|nlp|naturalLanguage" \
  src/features/properties \
  "src/app/(dashboard)/properties" \
  || true
echo "---"

# 3. No DEEPSEEK_API_KEY in route handler code (must use Provider interface)
grep -Rni "DEEPSEEK_API_KEY" src/app/api/ai 2>/dev/null && echo "FAIL: Route directly reads API key" || echo "PASS: No direct key in Route"
echo "---"

# 4. No NEXT_PUBLIC_DEEPSEEK anywhere
grep -Rni "NEXT_PUBLIC_DEEPSEEK" src/app/api/ai 2>/dev/null && echo "FAIL: Client-side key in Route" || echo "PASS: No NEXT_PUBLIC_DEEPSEEK"
```

Requirements:
- AI routes exist under `src/app/api/ai/`
- No client NLP in property code
- Route code does not read DEEPSEEK_API_KEY directly (must use Provider)
- No NEXT_PUBLIC_DEEPSEEK in route code

---

## Run the Gate

Execute from the Git root:

```bash
git diff --check
git status --short

npm run lint
npm run typecheck
npm run test
npm run build

npm run test:e2e:semantic-search-ui
npm run test:e2e:matching
```

Requirements:
- Unit ≥ 613, 0 failed, 0 skipped
- Build PASS
- E2E semantic-search-ui ≥ 34
- E2E matching = 23

---

## Gate Checks

### 1. Authentication

For every `src/app/api/ai/**/route.ts`:

```bash
# Must call getUser()
grep -n "getUser\|auth\.getUser" src/app/api/ai/parse-property-search/route.ts src/lib/ai/routes/parse-property-search-handler.ts 2>/dev/null
echo "CHECK_1A: verify getUser() is called in each route handler"

# Must return 401 for null user
grep -n "status.*401\|\.status.*401" src/lib/ai/routes/parse-property-search-handler.ts 2>/dev/null
echo "CHECK_1B: verify 401 returned for unauthenticated"

# Must NOT trust client userId
grep -n "body\.userId\|body\.user_id\|json\.userId" src/lib/ai/routes/parse-property-search-handler.ts 2>/dev/null && echo "CHECK_1C_FAIL: trusts client userId" || echo "CHECK_1C_PASS: does not trust client userId"

# Must NOT only rely on middleware
grep -n "getUser" src/lib/ai/routes/parse-property-search-handler.ts 2>/dev/null
echo "CHECK_1D: verify getUser() is present (independent auth, not middleware-only)"
```

Requirements:
- Every route calls `client.auth.getUser()` independently
- Returns 401 for null/absent user
- Does not read userId from request body
- Does not rely solely on middleware for auth

### 2. Workspace Isolation

```bash
# Must query workspace_members for membership
grep -n "workspace_members\|from.*workspace" src/lib/ai/routes/parse-property-search-handler.ts 2>/dev/null
echo "CHECK_2A: verify workspace_members query"

# Must return 403 for no membership
grep -n "WORKSPACE_ACCESS_DENIED\|status.*403" src/lib/ai/routes/parse-property-search-handler.ts 2>/dev/null
echo "CHECK_2B: verify 403 for workspace denial"

# Must NOT accept workspaceId from client
grep -n "body\.workspace\|json\.workspace_id\|body\.workspace_id" src/lib/ai/routes/parse-property-search-handler.ts 2>/dev/null && echo "CHECK_2C_FAIL: trusts client workspaceId" || echo "CHECK_2C_PASS: does not trust client workspaceId"

# Must NOT use Service Role (uses createRouteHandlerClient with user-context cookie)
grep -n "SUPABASE_SERVICE_ROLE_KEY\|service.role\|service_role" src/lib/ai/routes/parse-property-search-handler.ts 2>/dev/null && echo "CHECK_2D_FAIL: uses Service Role" || echo "CHECK_2D_PASS: no Service Role"
```

Requirements:
- Workspace resolved server-side from authenticated session
- Validates active workspace_members membership
- Returns 403 WORKSPACE_ACCESS_DENIED for non-members
- Rejects client-provided workspaceId
- No Service Role key usage

### 3. Entitlement

```bash
# Must check semantic_search (not property_matching)
grep -n "hasFeature\|semantic_search\|property_matching\|FEATURE_NOT_ALLOWED" src/lib/ai/routes/parse-property-search-handler.ts 2>/dev/null
echo "CHECK_3A: verify entitlement check"

# Check must occur before Provider call
grep -n "hasFeature\|getProvider\|parsePropertySearch" src/lib/ai/routes/parse-property-search-handler.ts 2>/dev/null
echo "CHECK_3B: verify entitlement check ordering (must be before provider call)"
```

Requirements:
- Checks exact `semantic_search` entitlement (not `property_matching`)
- Entitlement check occurs before Provider instantiation/call
- Provider call count = 0 when entitlement denied
- Returns 403 FEATURE_NOT_ALLOWED

### 4. Request Schema

```bash
# Must use Zod .strict()
grep -n "\.strict()" src/lib/ai/routes/parse-property-search-handler.ts 2>/dev/null
echo "CHECK_4A: verify Zod .strict()"

# Must reject requestId in body
grep -n "requestId\|query.*transform\|trim" src/lib/ai/routes/parse-property-search-handler.ts 2>/dev/null
echo "CHECK_4B: verify request schema fields"

# Must have length/type limits
grep -n "min(1)\|max(500)" src/lib/ai/routes/parse-property-search-handler.ts 2>/dev/null
echo "CHECK_4C: verify query length limits"
```

Requirements:
- ParseSearchRequestSchema uses Zod `.strict()`
- Rejects extra fields (requestId, modelName, workspaceId, userId, etc.)
- Query: min 1 char after trim, max 500 chars
- Whitespace-only → 422
- Returns 422 VALIDATION_FAILED for invalid input

### 5. Provider Boundary

```bash
# Must use Provider interface (not direct fetch)
grep -n "parsePropertySearch\|createDeepSeekTextProvider\|DeepSeekTextProvider" src/lib/ai/routes/parse-property-search-handler.ts 2>/dev/null
echo "CHECK_5A: verify Provider interface usage"

# Must NOT duplicate prompt/retry/model logic
grep -n "Authorization.*Bearer\|system.*prompt\|system_prompt\|retry\|attempt\b" src/lib/ai/routes/parse-property-search-handler.ts 2>/dev/null && echo "CHECK_5B_FAIL: Route duplicates Provider logic" || echo "CHECK_5B_PASS: no Provider logic in Route"

# Must NOT return raw model response
grep -n "usage\|tokens\|rawText\|raw_response\|finish_reason" src/lib/ai/routes/parse-property-search-handler.ts 2>/dev/null && echo "CHECK_5C_FAIL: Route leaks raw response fields" || echo "CHECK_5C_PASS: no raw response leak"
```

Requirements:
- Calls provider.parsePropertySearch() through Provider interface
- Does not duplicate Prompt, retry, or model request logic
- Provider called exactly once per request (no retry loop in route)
- Does not read DeepSeek API Key directly
- Does not return raw model response (usage, tokens, finish_reason)
- Does not implement text fallback

### 6. Response Contract

```bash
# Success envelope must be { data: { filters }, error: null }
grep -n "data.*filters\|error.*null\|data: null" src/lib/ai/routes/parse-property-search-handler.ts 2>/dev/null
echo "CHECK_6A: verify success/error envelope shapes"

# Must NOT use any/unknown bypass
grep -n "as any\|as PropertySearchFilters\|zod.*parse\|safeParse" src/lib/ai/routes/parse-property-search-handler.ts 2>/dev/null
echo "CHECK_6B: verify no raw casting bypass"

# Must NOT return model, tokens, usage, requestId, prompt, upstreamStatus in response
grep -n "modelName\|tokens\|usage\|requestId\|prompt.*version\|upstream" src/lib/ai/routes/parse-property-search-handler.ts 2>/dev/null
echo "CHECK_6C: verify response contract exclusivity"
```

Requirements:
- Success: `{ data: { filters }, error: null }` with status 200
- Error: `{ data: null, error: { code, message } }` with appropriate status
- No raw casting or `any` bypass of Zod
- Filters must pass through PropertySearchFilterSchema.strict()
- Response must NOT include: model, tokens, usage, requestId, prompt, upstreamStatus

### 7. Error Mapping

```bash
# Verify all 5 mappable error codes
grep -n "AI_NOT_CONFIGURED.*503\|AI_TIMEOUT.*504\|AI_RATE_LIMITED.*502\|AI_UPSTREAM_ERROR.*502\|AI_INVALID_RESPONSE.*502" src/lib/ai/routes/parse-property-search-handler.ts 2>/dev/null
echo "CHECK_7A: verify error-to-HTTP mapping"

# AI_REQUEST_ABORTED must rethrow (not produce 499 or Response)
grep -n "AI_REQUEST_ABORTED" src/lib/ai/routes/parse-property-search-handler.ts 2>/dev/null
echo "CHECK_7B: verify AI_REQUEST_ABORTED handling"

# Unknown errors → 500 with safe message
grep -n "INTERNAL_ERROR\|status.*500" src/lib/ai/routes/parse-property-search-handler.ts 2>/dev/null
echo "CHECK_7C: verify unknown error → 500"
```

Requirements:

| Error Code | HTTP Status |
|---|---|
| AI_NOT_CONFIGURED | 503 |
| AI_TIMEOUT | 504 |
| AI_RATE_LIMITED | 502 |
| AI_UPSTREAM_ERROR | 502 |
| AI_INVALID_RESPONSE | 502 |
| AI_REQUEST_ABORTED | rethrow (no Response) |
| Unknown | 500 INTERNAL_ERROR |

- Upstream 401 must NOT map to user 401
- Unknown errors safely map to 500 with generic message
- AI_REQUEST_ABORTED rethrows, does not produce 499 or a Response
- Public error codes match DeepSeekProviderErrorCode boundary

### 8. Privacy

```bash
# No query/prompt/raw response in logs
grep -RniE "console\.(log|info|debug|warn|error).*query|console\.(log|info|debug|warn|error).*body" src/lib/ai/routes/ 2>/dev/null && echo "CHECK_8A_FAIL: sensitive data in logs" || echo "CHECK_8A_PASS: no sensitive data in logs"

# No search persistence to database
grep -n "\.insert\|\.update\|\.upsert\|\.save" src/lib/ai/routes/parse-property-search-handler.ts 2>/dev/null && echo "CHECK_8B_FAIL: Route writes to database" || echo "CHECK_8B_PASS: no database writes"

# No Service Role Key
grep -n "SUPABASE_SERVICE_ROLE_KEY" src/lib/ai/routes/parse-property-search-handler.ts 2>/dev/null && echo "CHECK_8C_FAIL: Service Role in Route" || echo "CHECK_8C_PASS: no Service Role"

# No NEXT_PUBLIC_DEEPSEEK
grep -n "NEXT_PUBLIC_DEEPSEEK" src/lib/ai/routes/parse-property-search-handler.ts 2>/dev/null && echo "CHECK_8D_FAIL: client-side key in Route" || echo "CHECK_8D_PASS: no NEXT_PUBLIC_DEEPSEEK"

# Authorization header must not be in response
grep -n "Authorization" src/lib/ai/routes/parse-property-search-handler.ts 2>/dev/null && echo "CHECK_8E: verify Authorization is only in Provider, not Route response" || echo "CHECK_8E_PASS: no Authorization in Route"
```

Requirements:
- No logging of query, prompt, or raw model response
- Search query text NOT persisted to any database table
- No real customer PII in request/response paths
- No SUPABASE_SERVICE_ROLE_KEY
- No NEXT_PUBLIC_DEEPSEEK
- Authorization header never exposed in response

### 9. Test Coverage

```bash
# Count route tests
grep -c "it(" src/app/api/ai/parse-property-search/__tests__/route.test.ts 2>/dev/null
echo "CHECK_9A: route test count"

# Verify no skipped tests
grep -RniE "test\.skip|describe\.skip|it\.skip|todo\(|xit\(|xdescribe\(" src/app/api/ai/parse-property-search/__tests__/ 2>/dev/null && echo "CHECK_9B_FAIL: skipped tests" || echo "CHECK_9B_PASS: no skipped tests"

# Verify mock usage (no real fetch)
grep -n "mock\|vi\.fn\|mockResolvedValue" src/app/api/ai/parse-property-search/__tests__/route.test.ts 2>/dev/null | head -5
echo "CHECK_9C: verify mock usage — no real network calls"
```

Each AI route must have tests covering:
- ✅ 401 (unauthenticated)
- ✅ 403 (no workspace membership)
- ✅ 403 (no entitlement)
- ✅ 403 (wrong entitlement — e.g., property_matching ≠ semantic_search)
- ✅ 422 (invalid request — empty query, overlength, whitespace-only, non-JSON content type)
- ✅ 422 (extra fields via strict schema — rejects requestId, workspaceId, modelName)
- ✅ 200 (success envelope)
- ✅ Provider error mapping (AI_NOT_CONFIGURED→503, AI_TIMEOUT→504, AI_RATE_LIMITED→502, AI_UPSTREAM_ERROR→502, AI_INVALID_RESPONSE→502)
- ✅ Unknown error → 500
- ✅ AI_REQUEST_ABORTED rethrows (no 499, no secondary Response)
- ✅ Provider called exactly once per request
- ✅ Provider receives only query (trimmed, no workspaceId/userId/PII)
- ✅ Error response does not leak query, key, prompt, requestId, or upstreamStatus
- ✅ No Service Role required
- ✅ All tests use Mock Provider (no real DeepSeek calls)

### 10. POST /api/ai/parse-property-search — Full Trace

Run this full verification script:

```bash
echo "=== 10.1 Authentication ==="
grep -c "getUser\|auth\.getUser" src/lib/ai/routes/parse-property-search-handler.ts
echo "=== 10.2 Workspace ==="
grep -c "workspace_members" src/lib/ai/routes/parse-property-search-handler.ts
echo "=== 10.3 Entitlement ==="
grep -c "semantic_search\|hasFeature" src/lib/ai/routes/parse-property-search-handler.ts
echo "=== 10.4 Strict Schema ==="
grep -c "\.strict()" src/lib/ai/routes/parse-property-search-handler.ts
echo "=== 10.5 Provider Boundary ==="
grep -c "parsePropertySearch\|DeepSeekTextProvider" src/lib/ai/routes/parse-property-search-handler.ts
echo "=== 10.6 Error Mapping ==="
grep -c "AI_NOT_CONFIGURED\|AI_TIMEOUT\|AI_RATE_LIMITED\|AI_UPSTREAM_ERROR\|AI_INVALID_RESPONSE\|AI_REQUEST_ABORTED\|INTERNAL_ERROR" src/lib/ai/routes/parse-property-search-handler.ts
echo "=== 10.7 Response Envelope ==="
grep -n 'data.*null\|error.*null\|data.*filters' src/lib/ai/routes/parse-property-search-handler.ts
echo "=== 10.8 No Fallback ==="
grep -c "fallback\|text.*search\|keyword" src/lib/ai/routes/parse-property-search-handler.ts || echo "0 (PASS: no fallback)"
echo "=== 10.9 No DB Write ==="
grep -c "\.insert\|\.update\|\.upsert" src/lib/ai/routes/parse-property-search-handler.ts || echo "0 (PASS: no DB write)"
echo "=== 10.10 Body Contract ==="
grep -c "query.*min.*max\|query.*trim" src/lib/ai/routes/parse-property-search-handler.ts
```

---

## Static Scans

Check for disabled tests across the entire AI route layer:

```bash
grep -RniE "test\.skip|describe\.skip|it\.skip|todo\(|xit\(|xdescribe\(" \
  src/app/api/ai \
  src/lib/ai/routes \
  || true
```

Every hit must be explained. Real skips in AI route paths must FAIL.

---

## Reviewer

Ask `quality-reviewer` to perform a final read-only review of:

1. Route files: `src/app/api/ai/parse-property-search/route.ts`, `src/app/api/ai/extract-property/route.ts`, `src/app/api/ai/extract-client/route.ts`
2. Handlers: `src/lib/ai/routes/parse-property-search-handler.ts`, `src/lib/ai/routes/extract-property-handler.ts`, `src/lib/ai/routes/extract-client-handler.ts`
3. Route tests: `src/app/api/ai/parse-property-search/__tests__/route.test.ts`, `src/app/api/ai/extract-property/__tests__/route.test.ts`, `src/app/api/ai/extract-client/__tests__/route.test.ts`
4. AI types: `src/lib/ai/types.ts` (error types, provider interface, input/output DTOs)
5. AI schemas: `src/lib/ai/schemas.ts` (PropertySearchFilterSchema, PropertyExtractionOutputSchema, ClientExtractionOutputSchema — strict checks)
6. Privacy: `src/lib/ai/privacy/redact-client-input.ts` (client PII redaction)

`data-security-engineer` must independently confirm:
- 401/403/422 responses do NOT trigger text fallback on all three routes
- Client workspaceId is rejected by strict schema on all three routes
- No Service Role key in route code on any route
- No DEEPSEEK_API_KEY read in route code on any route
- No NEXT_PUBLIC_DEEPSEEK in route code on any route
- AI_REQUEST_ABORTED rethrows (no 499, no secondary response) on all three routes
- Search query / extraction text is not persisted to database on any route
- Error responses do not leak query, text, key, prompt, requestId, or upstreamStatus
- Each route uses its own precise entitlement (semantic_search ≠ ai_data_extraction)
- property_matching does not substitute for semantic_search
- request.signal is forwarded to Provider on all three routes
- Provider does NOT receive workspaceId/userId from client on any route
- extract-client route performs server-side PII redaction before Provider call
- Client PII (phone, wechat, email, name, ID, passport) redacted deterministically
- High-risk client input returns 422 with Provider call count = 0
- extract-client Provider DTO is narrow (no userId, workspaceId, modelName, promptVersion)

`quality-reviewer` must confirm:
- P0 = 0, P1 = 0
- Frontmatter is correct
- `disable-model-invocation: true`
- All contract sections are covered
- Auth, workspace, entitlement checks present and in correct order on all three routes
- Each route uses its own distinct entitlement (no sharing)
- Schema is strict (rejects extra fields) on all three routes
- Provider boundary is clean (no prompt/retry/model logic in any route)
- Error mapping matches contract
- AI_REQUEST_ABORTED rethrows (not wrapped in Response)
- Unknown errors → 500
- No text fallback in any route
- No database writes from any route
- All tests use Mock Provider (no real DeepSeek calls)
- request.signal forwarded on all three routes
- No shared or duplicated prompt/retry logic between routes
- extract-property route performs server-side PII redaction before Provider call
- extract-client route performs server-side PII redaction before Provider call
- Original text must not be sent directly to Provider for extraction on either property or client route
- redactPropertyInput() and redactClientInput() are deterministic regex-based (no AI model involvement)
- Tests prove Provider never receives raw PII (phone, email, ID, address, key location on property; phone, email, wechat, name, ID, passport on client)
- High-risk input (mostly PII after stripping) returns 422 with Provider call count = 0 on both extraction routes
- Client redaction does not duplicate or drift from property redaction regex patterns

---

## PASS Criteria

ALL of the following must be true:

1. All gate checks (1–10) return PASS
2. `npm run lint` exits 0
3. `npm run typecheck` exits 0
4. `npm run test` shows ≥ 613 passed, 0 failed, 0 skipped
5. `npm run build` exits 0
6. E2E semantic-search-ui = 34/34 or higher
7. E2E matching = 23/23
8. Working tree shows no modified (`M`) files
9. No P0 or P1 findings from quality reviewer
10. Each AI route independently calls `getUser()`
11. Each AI route validates workspace membership
12. Each AI route checks exact entitlement before Provider call
13. Request schema uses Zod `.strict()`
14. No Service Role in route code
15. No DEEPSEEK_API_KEY direct read in route code
16. No NEXT_PUBLIC_DEEPSEEK in route code
17. AI_REQUEST_ABORTED rethrows (no 499, no Response)
18. All 5 provider error codes mapped correctly to HTTP statuses on all routes
19. Unknown errors map to 500 on all routes
20. Error responses do not leak sensitive data on all routes
21. No text fallback in route code on any route
22. No database writes in any route
23. All tests use Mock Provider (no real network calls)
24. No skipped/todo tests in AI route tests
25. request.signal forwarded to Provider on all three routes
26. Each route uses distinct entitlement (no entitlement sharing)
27. No shared prompt/retry/model logic between routes
28. All 4 agents returned AGENT_READY
29. Semantic Search Gate PASS
30. AI Provider Gate PASS
31. extract-client route has server-side PII redaction
32. extract-client Provider DTO is narrow (no identity/workspace/config)
33. High-risk client input fail closed (422, Provider calls = 0)
34. Client redaction patterns aligned with property redaction (no drift)

Any of the following MUST cause FAIL:

- P0 > 0 or P1 > 0
- Agent unavailable or timeout
- Unit/Build failure or skipped tests
- Missing auth, workspace, or entitlement check on any route
- Route uses Service Role
- Route directly reads DeepSeek Key
- Schema not using strict()
- AI_REQUEST_ABORTED returning 499
- Sensitive data in error responses
- Real network calls in tests
- Working tree has unaccounted `M` or `??` files
- Text fallback in route code
- Raw PII sent to Provider on either property or client route
- Provider DTO contains userId, workspaceId, modelName, or promptVersion
- High-risk input not rejected (must fail closed, Provider call count = 0)
- Client redaction duplicates or drifts from property redaction regex patterns

---

## Output

Return a concise report containing:

- overall conclusion (PASS or FAIL)
- each gate check result (pass/fail) with evidence
- route-specific checks for POST /api/ai/parse-property-search
- test count and coverage verification
- lint/typecheck/test/build results with exact counts
- E2E results
- working tree status
- agent readiness evidence
- quality reviewer findings (P0–P3)
- data-security-engineer independent confirmation
- blockers (if any)

The conclusion must be exactly one of:

`PASS：HouseVibe AI Route Gate 通过`

`FAIL：HouseVibe AI Route Gate 未通过`
