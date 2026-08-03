# Handoff: P2-MATCH-002 — Non-AI Semantic Search UI Shell

| 属性 | 值 |
|---|---|
| Task ID | P2-MATCH-002-IMPLEMENT-049 |
| Agent | property-crm-engineer |
| Status | COMPLETE |
| Date | 2026-08-03 |
| Contract | docs/contracts/property-semantic-search-ui-contract.md |

## Summary

Implemented the Phase 2 semantic search UI shell on the property listing page. This provides a natural language search input with full fallback matrix handling, URL-based filter chip management, and `semantic_search` entitlement gating. No AI/NLP/DeepSeek/STT is included — the `/api/ai/parse-property-search` endpoint is called but NOT created by this task.

## Files Changed

### Created
- `src/features/properties/components/search-input.tsx` — NL search input with example prompts, submit/clear, loading, mobile-first (44px targets, role="search")
- `src/features/properties/components/search-chips.tsx` — Filter chip display with deduplication and accessible remove buttons
- `src/features/properties/hooks/use-semantic-search.ts` — Core hook: input validation, POST to parser, fallback matrix, URL param generation
- `src/features/properties/hooks/use-feature-entitlement.ts` — Client-side entitlement check via Supabase RLS
- `src/features/properties/__tests__/semantic-search-schemas.test.ts` — 28 Zod schema unit tests
- `e2e/semantic-search-ui.spec.ts` — 24 E2E test scenarios

### Modified
- `src/features/properties/schemas.ts` — Added SearchParseInputSchema, SearchParseFiltersSchema, SearchParseResponseSchema, SemanticSearchPhase
- `src/app/(dashboard)/properties/page.tsx` — Integrated search input, chips, entitlement gate
- `playwright.config.ts` — Added semantic-search-ui project
- `package.json` — Added test:e2e:semantic-search-ui script

## Fallback Matrix Implementation

| Status | Phase | Fallback? | UI |
|---|---|---|---|
| 200 | structured | No | Structured chips from AI filters |
| 401 | error_auth | NO | "请先登录" |
| 403 | error_forbidden | NO | "需要 semantic_search 权限"; input hidden |
| 404/501 | fallback_text | YES | Text search + "智能搜索即将上线" badge |
| 422 | error_validation | NO | "输入校验失败" |
| 5xx/network | fallback_error | YES | Text search + "智能解析暂不可用" toast |

## Entitlement

- `useFeatureEntitlement("semantic_search")` queries `feature_entitlements` via browser Supabase client
- Default: `entitled: false`; only set to `true` after confirming active, non-expired entitlement
- `SearchInput` returns `null` when `!entitled`
- `GET /api/properties?search=` is NOT gated (existing text search)

## Known Issues (addressed)

- P2-1: Multi-district → first value used as URL param (current schema limitation)
- P2-5: Schema field names aligned with contract (subwayText, communityName)
- P2-4: Chip deduplication implemented
- P2-2: Focus returns to input after chip removal

## Phase 3 Readiness

Phase 3 requires ZERO code changes to this UI shell. When `POST /api/ai/parse-property-search` is deployed:
- 200 responses will flow through existing SearchParseResponseSchema validation
- Structured chips will appear automatically via filtersToChips()
- URL params will be set via filtersToUrlParams() → pushState → re-fetch
- unrecognizedTerms will be displayed non-blockingly

## Verification

```bash
npm run typecheck  # PASS
npm run lint       # PASS (0 new errors)
npm run test       # 462 passed (16 files)
npm run build      # Pre-existing @ts-nocheck issue in matching tests (not from this task)
```
