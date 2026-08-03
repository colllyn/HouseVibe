---
name: housevibe-semantic-search-gate
description: Validate HouseVibe non-AI semantic property search UI, fallback, entitlement, URL filters, security and regression gates.
disable-model-invocation: true
---

# HouseVibe Semantic Search Gate

Run only when the user explicitly invokes:

`/housevibe-semantic-search-gate`

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

- `docs/contracts/property-semantic-search-ui-contract.md` (FROZEN FOR P2-MATCH-002)
- `docs/contracts/api-contract.md` §10.5 — `POST /api/ai/parse-property-search`
- `docs/contracts/ai-contract.md` — `DeepSeekTextProvider.parsePropertySearch()`
- `src/features/properties/schemas.ts` — `PropertyQuerySchema`, `SearchParseInputSchema`, `SearchParseFiltersSchema`, `SearchParseResponseSchema`
- `docs/handoffs/P2-MATCH-002-property-crm-engineer.md` — Implementation handoff

## Agent Gate

Start these agents in the current workspace:

- `property-crm-engineer`
- `mobile-ui-engineer`
- `data-security-engineer`
- `test-engineer`
- `quality-reviewer`

They must not use worktrees.

If any agent is unavailable, return FAIL. Do not substitute.

Each agent must return `AGENT_READY` before the gate proceeds. If any agent fails to return `AGENT_READY`, the skill must FAIL. The main agent must not perform the agent's work.

## Phase Boundary Verification

Confirm Phase 2-only scope:

```bash
# 1. No /api/ai/ routes created
find src/app/api/ai -type f 2>/dev/null

# 2. No DeepSeek API Key in property/search code
grep -RniE "DEEPSEEK_API_KEY|DeepSeek|speech.to.text|STT" \
  src/features/properties \
  "src/app/(dashboard)/properties" \
  || true

# 3. No client-side NLP or keyword mapping
grep -RniE "parseQuery|extractDistrict|keywordMap|nlp|naturalLanguage" \
  src/features/properties \
  "src/app/(dashboard)/properties" \
  || true
```

Requirements:
- `find src/app/api/ai -type f` MUST return empty (no `/api/ai/` routes)
- No DeepSeek API Key, DeepSeek provider, STT, or speech-to-text in property code
- No client-side NLP, regex keyword extraction, or keyword mapping
- Phase 3 integration points (POST /api/ai/parse-property-search call) remain compatible (no code changes needed in Phase 3)

## Run the Gate

Execute from the Git root:

```bash
git diff --check
git status --short

npm run db:reset
npm run db:test
npm run db:lint
npm run db:test:performance

npm run lint
npm run typecheck
npm run test
npm run build

npm run test:e2e:auth
npm run test:e2e:admin
npm run test:e2e:settings
npm run test:e2e:properties
npm run test:e2e:property-filters
npm run test:e2e:property-media
npm run test:e2e:clients
npm run test:e2e:client-interactions
npm run test:e2e:matching
npm run test:e2e:semantic-search-ui
```

Then run:

```text
/housevibe-property-gate
/housevibe-client-gate
/housevibe-matching-gate
```

Requirements:
- DB = 0 failed
- Unit = 0 failed
- All E2E = 0 failed, 0 skipped
- P0 = 0, P1 = 0
- No pre-existing issues used as exemption

## Static Scans

Check for disabled tests:

```bash
grep -RniE "test\.skip|describe\.skip|it\.skip|todo\(|xit\(|xdescribe\(" \
  src e2e supabase/tests \
  || true
```

Every hit must be explained by the reviewer. Real skips in semantic search paths must FAIL.

Check for XSS and storage leaks:

```bash
grep -RniE "dangerouslySetInnerHTML|innerHTML|localStorage|sessionStorage" \
  src/features/properties \
  "src/app/(dashboard)/properties" \
  || true
```

Any hit in property/search code must be explained. Unsafe rendering or query persistence must FAIL.

## Fallback Matrix Verification

The implementation MUST distinguish the following status codes. The prohibited pattern is:

```typescript
// FORBIDDEN — swallows auth/permission/validation errors
if (!response.ok) {
  fallbackToTextSearch();
}
```

Verify each status code behavior:

| HTTP Status | Fallback? | Requirement |
|---|---|---|
| 200 | No fallback needed | Validate response via `SearchParseResponseSchema` → update URL → display structured chips |
| 401 | **NO** | Auth error shown; no text search |
| 403 | **NO** | Permission/entitlement error shown; no text search; input hidden/disabled |
| 404 | YES | Text search fallback + "智能搜索即将上线" badge |
| 501 | YES | Text search fallback + "智能搜索即将上线" badge |
| 422 | **NO** | Validation error shown; no text search |
| 500/502/503/504 | YES | Text search fallback + "智能解析暂不可用" toast |
| Network error / timeout | YES | Text search fallback + toast |
| HTTP 200 but invalid response | **NO** | Show validation error; do NOT modify URL; do NOT fallback |

- `SearchParseResponseSchema` validation MUST run before URL/chip updates on 200 responses.
- AI field mapping (contract §6.5) MUST drop unknown fields silently.
- No client-side structured data extraction from raw query text.

## Entitlement Verification

- `semantic_search` entitlement key is distinct from `property_matching`
- UI entry point (semantic search input) is gated on `hasFeature('semantic_search')`
- When `semantic_search` is revoked, the search input is hidden/disabled
- 403 `FEATURE_NOT_ALLOWED` from parser MUST NOT trigger fallback
- `GET /api/properties?search=` is NOT gated on `semantic_search` (existing text search)
- `property_matching` revocation does not affect semantic search
- `semantic_search` revocation does not affect property matching
- Permission revocation takes immediate effect at response handling

## URL and Chips Verification

- URL query parameters are the single source of truth for all filter state
- `PropertyQuerySchema` is the only filter schema (no shadow/duplicate schema)
- Fallback only generates a single `search` chip with the raw query text
- Structured chips are only generated from parser 200 responses (Phase 3)
- Multiple districts are fully preserved in URL (repeated params or comma-separated)
- Each district generates an independent chip
- Deleting one chip does not delete chips for other fields
- Browser back/forward restores previous filter state
- Page refresh restores filter state from URL
- Illegal parser responses do NOT modify URL
- Chip removal returns focus to search input

## Privacy and Security Verification

- Search query text is NOT persisted to any database table
- Search query text is NOT written to audit logs
- Search query text is NOT stored in localStorage or sessionStorage
- Search query text is NOT application-logged
- Input is rendered as plain text (React default escaping)
- No `dangerouslySetInnerHTML` in search components
- `GET /api/properties` maintains authentication, workspace, and RLS isolation
- No Service Role key in property search code
- No client NLP, keyword extraction, or structured parsing

## UI Verification

- Search container: `role="search"`
- Input: `aria-label="自然语言搜索房源"` (on the `<input>` element, NOT only on container)
- Submit button: visible text label on ALL viewports, `min-width: 44px`
- Clear input button: `min-width: 44px`, `min-height: 44px`
- Example prompts: each `min-height: 44px`
- Chips: each chip container `min-height: 44px`
- Chips: each remove button `min-width: 44px`, `min-height: 44px`, `aria-label="删除筛选条件: {label} {value}"`
- Clear-all chips button: `min-height: 44px`
- Loading state during parser request
- Fallback indicator: "智能搜索即将上线 · 当前使用文本匹配"
- Error states for auth, permission, validation errors
- Empty state with suggestions
- Example prompts displayed and clickable
- Enter submits, Escape clears input
- 320px: no horizontal scroll
- Mobile: 375px minimum
- Chips: flex-wrap, no overflow
- Focus returns to input after chip removal
- `dvh` units for soft keyboard adaptation (`min-h-dvh` on page container)
- All URL filter chips have human-readable labels (not raw param names)
- Submit button accessible name includes "智能搜索" on all viewports
- No hardcoded magic colors; design tokens or Tailwind theme colors only
- `maxLength={500}` on input (not 501)

## Required Semantic Search Coverage

Confirm actual executable coverage for:

### Schema
- `SearchParseInputSchema`: query min 1 char, max 500 chars, pure-punctuation rejection, requestId UUID
- `SearchParseFiltersSchema`: all contract fields, unknown fields dropped
- `SearchParseResponseSchema`: envelope validation, null data/error handling

### Fallback Matrix (Integration)
- Parser 200 → structured chips + URL update
- Parser 404 → text search fallback + badge
- Parser 501 → text search fallback + badge
- Parser 401 → NO fallback, auth error
- Parser 403 → NO fallback, permission error
- Parser 422 → NO fallback, validation error
- Parser 5xx → text search fallback + toast
- Network error → text search fallback + toast
- HTTP 200 invalid response → NO fallback, validation error, URL unchanged

### Entitlement
- UI hidden/disabled when `semantic_search` revoked
- 403 no-fallback independent of `property_matching`
- Text search remains available regardless of entitlement

### URL/Chips
- URL is authoritative state source
- No duplicate filter schema
- Fallback generates only search chip
- Multi-district preservation
- Independent chip deletion
- Back/forward/refresh state restoration
- Illegal response does not pollute URL

### E2E
- 26 business scenarios in `e2e/semantic-search-ui.spec.ts` (plus 3 shared setup = 29 Playwright total)
- Setup tests (3) and business tests (26) MUST be distinguished in gate output
- No skipped tests in semantic search E2E
- E2E covers: all 9 fallback matrix statuses including illegal HTTP 200, multi-district, chip removal, touch targets on all interactive elements, accessible names on all controls
- Arithmetic total errors (confusing setup tests with business scenarios) MUST cause FAIL

### Unit Tests
- 28 Zod schema unit tests in `src/features/properties/__tests__/semantic-search-schemas.test.ts`

## Reviewer

Ask `quality-reviewer` to perform a final read-only review of:

1. Search input component (`src/features/properties/components/search-input.tsx`)
2. Search chips component (`src/features/properties/components/search-chips.tsx`)
3. Semantic search hook (`src/features/properties/hooks/use-semantic-search.ts`)
4. Entitlement hook (`src/features/properties/hooks/use-feature-entitlement.ts`)
5. Property listing page integration (`src/app/(dashboard)/properties/page.tsx`)
6. Schemas (`src/features/properties/schemas.ts` — semantic search section)
7. E2E tests (`e2e/semantic-search-ui.spec.ts`)
8. Unit tests (`src/features/properties/__tests__/semantic-search-schemas.test.ts`)

`data-security-engineer` must independently confirm:
- 401/403/422 do NOT trigger fallback
- HTTP 200 with invalid response does NOT modify URL
- Search query text is not persisted or logged
- `semantic_search` entitlement is not bypassable
- No XSS vectors (`dangerouslySetInnerHTML`, `innerHTML`)
- No client-side NLP or keyword extraction

`quality-reviewer` must confirm:
- P0 = 0, P1 = 0
- Frontmatter is correct
- `disable-model-invocation: true`
- All contract sections are covered
- Semantic Search E2E: 26 business scenarios + 3 setup = 29 total (no skips)
- Multi-district chips work correctly (no data loss)
- E2E failures prevent PASS
- No AI/STT boundary violations
- Setup tests and business scenarios are correctly distinguished in gate output
- Reviewer findings marked P2 that conflict with frozen contract items MUST NOT be accepted as PASS — they must be fixed or the gate FAILs

PASS requires:
- All database tests pass (0 failed)
- Lint, typecheck, unit tests, and build pass
- All 10 E2E suites pass (auth, admin, settings, properties, property-filters, property-media, clients, client-interactions, matching, semantic-search-ui)
- No skipped tests
- No AI/STT code in property/search paths
- No `/api/ai/` routes created
- Fallback matrix verified per status code (including illegal HTTP 200 → NO fallback, URL unchanged)
- Entitlement gate verified
- URL/Chips state management verified
- Privacy and security scans clean
- UI accessibility verified
- All critical interactive elements have ≥44px touch targets (submit, clear input, chip remove, clear all, example prompts) — verified by E2E bounding box checks
- Input `aria-label="自然语言搜索房源"` on the `<input>` element
- Chip remove buttons have `aria-label` containing the filter label and value
- All URL filter chips have human-readable labels
- Submit button has visible accessible name on all viewports
- `maxLength={500}` on search input (not 501)
- `dvh` units used on the properties page container
- `clearAllFilters` does not use full page reload
- Property Gate PASS
- Client Gate PASS
- Matching Gate PASS
- All 5 agents returned AGENT_READY
- P0 = 0, P1 = 0

## Output

Return a concise report containing:

- overall conclusion (PASS or FAIL)
- Phase boundary result
- Fallback matrix verification (each status code)
- Entitlement verification
- URL/Chips verification
- Privacy and security verification
- UI verification
- Database results
- Application results (typecheck, lint, test, build)
- E2E results (all 10 suites with exact pass/fail/skip counts)
- Semantic search coverage checklist (Schema, Fallback, Entitlement, URL/Chips, E2E)
- Agent readiness evidence (all 5 agents)
- Reviewer P0–P3
- `data-security-engineer` independent confirmation
- `quality-reviewer` final confirmation
- Git status
- Blockers

The conclusion must be exactly one of:

`PASS：HouseVibe Semantic Search Gate 全部通过`

`FAIL：HouseVibe Semantic Search Gate 存在 Phase、Fallback、安全或测试门禁`
