# Property Semantic Search UI Contract

| 属性 | 值 |
|---|---|
| 文档名称 | property-semantic-search-ui-contract |
| 版本 | v1.0 |
| 状态 | FROZEN FOR P2-MATCH-002 |
| Owner | solution-architect |
| 依赖 | api-contract.md §10.5, PRD §7.5, implementation-plan.md P2-MATCH-002/P3-AI-004 |
| 最后更新 | 2026-08-03 |

---

## 1. Phase 2 Scope (UI Shell)

P2-MATCH-002 implements the **search UI shell only**. AI natural-language-to-structured-filter parsing is deferred to Phase 3.

### 1.1 Included in Phase 2

| 项 | 说明 |
|---|---|
| Natural language search input box | Full-width text input on the property listing page. Accepts free-form Chinese text. |
| Example prompts | Display clickable example prompts below the input (e.g., "3500以内、天河、能养猫的一房"). Clicking a prompt fills the input. |
| Submit button | Sends the raw `query` string to `POST /api/ai/parse-property-search`. |
| API response handling | Per §3 response matrix below: 200 → structured chips; 404/501 → text-search fallback; network/5xx → degraded fallback; 401/403/422 → no fallback. |
| Structured filter chips | Displayed ONLY when the Phase 3 parser returns a 200 with valid `filters`. Each chip maps to exactly one `PropertyQuerySchema` field. |
| Chip removal | One-click removal of a single chip. Removes the corresponding URL query param and re-fetches results. |
| No-results suggestions | When `GET /api/properties` returns zero properties, display suggestions: remove restrictive filters, or broaden the query. |
| Phase 3 readiness indicator | When fallback is active (parser unavailable), display a non-intrusive badge: "智能搜索即将上线 · 当前使用文本匹配". |

### 1.2 Explicitly NOT in Phase 2

| 排除项 | 归属 |
|---|---|
| DeepSeek API calls | Phase 3 (P3-AI-001, P3-AI-004) |
| Natural language to structured filter parsing | Phase 3 |
| `POST /api/ai/parse-property-search` Route Handler | Phase 3 (P3-AI-004) |
| Client-side keyword/regex NLP | Never (prohibited) |
| Search history persistence | Future (no plan) |
| Audit logs for search | Never (read-only operation) |
| Database schema changes | None needed |
| STT / voice search | Future |
| `semantic_search` entitlement revocation UI | Existing admin panel (P1-ADMIN-001) |

---

## 2. Page and Component Paths

| 路径 | 内容 | Owner |
|---|---|---|
| `src/app/(dashboard)/properties/page.tsx` | Existing property list page. Extended with NL search input and chip area. | property-crm-engineer |
| `src/features/properties/components/search-input.tsx` | New: NL search input component (text input, example prompts, submit, loading/error states). | property-crm-engineer |
| `src/features/properties/components/search-chips.tsx` | New: structured filter chip display (from AI response or existing URL params). | property-crm-engineer |
| `src/features/properties/schemas.ts` | Extended: `SearchParseInputSchema`, `SearchParseFiltersSchema`, response type. | property-crm-engineer |

No files under `src/app/api/ai/`, `src/lib/ai/`, or `src/features/ai-*/` are created or modified in Phase 2.

---

## 3. Phase 2 Request Behavior and Fallback Matrix

### 3.1 Request Flow

```
User types NL query → clicks submit
  → POST /api/ai/parse-property-search { query, requestId }
  → Response handling per matrix below
```

### 3.2 Response Matrix

| HTTP Status | Behavior | Fallback? | UI Indicator |
|---|---|---|---|
| **200** | Extract `data.filters` → validate against `PropertyQuerySchema` → convert to URL query params → `pushState` → display chips → re-fetch properties | No fallback needed | Chips visible, "智能" badge |
| **401 UNAUTHENTICATED** | **No fallback.** Redirect to login or show auth error. | **NO** | Auth error state |
| **403 FEATURE_NOT_ALLOWED** | **No fallback.** Hide/disable search entry point. Show permission error: "需要 semantic_search 权限". | **NO** | Entitlement error state |
| **404 NOT FOUND** | Parser route not deployed (Phase 3 pending). Fallback to `GET /api/properties?search=<query>` (text match). | **YES** | "智能搜索即将上线 · 当前使用文本匹配" |
| **501 NOT IMPLEMENTED** | Same as 404: parser not yet available. Fallback to text search. | **YES** | "智能搜索即将上线 · 当前使用文本匹配" |
| **422 VALIDATION_FAILED** | **No fallback.** Show validation error (query too long, empty, invalid). | **NO** | Validation error state |
| **500 / 502 / 503 / 504** | Server/parser error. Fallback to `GET /api/properties?search=<query>`. Show non-blocking toast: "智能解析暂不可用，已使用文本搜索". | **YES** | Toast + text search active |
| **Network error / timeout** | Same as 5xx: fallback to text search. Show toast. | **YES** | Toast + text search active |
| **Any unexpected non-2xx** | Fallback to text search. Show generic error toast. | **YES** | Toast + text search active |

### 3.3 Prohibited Fallback Pattern

The following is **explicitly prohibited**:

```typescript
// FORBIDDEN — swallows auth/permission/validation errors
if (!response.ok) {
  fallbackToTextSearch();
}
```

The implementation MUST distinguish 401, 403, and 422 from fallback-eligible errors. A 401 must never silently fall back to text search.

### 3.4 Phase 3 Integration Contract

When `POST /api/ai/parse-property-search` returns 200, the response shape is:

```json
{
  "data": {
    "filters": {
      "districts": ["天河区"],
      "monthlyRentMax": 3500,
      "bedrooms": 1,
      "petsAllowed": true
    },
    "parsedQuery": "预算3500以内，天河区，一房，允许养宠物",
    "unrecognizedTerms": [],
    "requestId": "uuid"
  },
  "error": null
}
```

`filters` fields map directly to `PropertyQuerySchema` fields. Only fields present in both the AI response AND `PropertyQuerySchema` are accepted. Unknown fields are silently dropped (server already validates whitelist).

Phase 3 requires **zero code changes** to Phase 2 UI — the same fetch call, same response handler, same chip mapping logic.

---

## 4. Entitlement

### 4.1 Entitlement Key

`semantic_search` (distinct from `property_matching`, `content_factory`, `ai_data_extraction`, `shared_property_pool`).

### 4.1.1 Default Grant

Per PRD §3.3, `semantic_search` is default-granted to all registered users at registration time. The entitlement is active immediately upon registration with no admin action required. Revocation behavior: when `semantic_search` is revoked by an admin, the NL search input is hidden/disabled in the UI (Phase 2), and the parser endpoint returns 403 (Phase 3). The `GET /api/properties?search=` text fallback remains available regardless of `semantic_search` status.

### 4.2 Enforcement Points

| Layer | Enforcement | Phase |
|---|---|---|
| UI visibility | Search input hidden/disabled when `hasFeature('semantic_search')` is false | Phase 2 |
| Route Handler | `POST /api/ai/parse-property-search` checks `hasFeature('semantic_search')` independently | Phase 3 |
| Fallback safety | `GET /api/properties?search=` is NOT gated on `semantic_search` — it is existing text search, unchanged by this task | — |

### 4.3 Entitlement Error Behavior

- 403 `FEATURE_NOT_ALLOWED` from the parser endpoint: **no fallback**. The UI shows the entitlement error and disables/hides the search entry point.
- Revoking `semantic_search` must take immediate effect (no JWT expiry dependency).

### 4.4 Entitlement Boundary

- `semantic_search` and `property_matching` are independent. Revoking one does not affect the other.
- `semantic_search` cannot be bypassed by calling `GET /api/properties?search=` (which is not gated on any semantic entitlement).
- The Phase 3 parser `POST /api/ai/parse-property-search` must independently verify `semantic_search` even if the Phase 2 UI already checked it.

---

## 5. Input Schema

```typescript
// Frozen for P2-MATCH-002
export const SearchParseInputSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1, "请输入搜索内容")
    .max(500, "搜索内容最多 500 字")
    .refine((v) => !/^[\s\p{P}\p{S}]+$/u.test(v), "搜索内容不能仅为标点或特殊字符"),
  requestId: z.string().uuid(),
});
```

| 规则 | 值 |
|---|---|
| Empty/whitespace-only | Block submission. Disable submit button. |
| Max length | 500 characters. |
| Pure special characters | Defined as Unicode Punctuation (`\p{P}`) and Symbol (`\p{S}`) categories. Reject. |
| Exceeding limits | Do not send request. Show inline validation error. |
| URL encoding | Query string is URL-encoded before being placed in `GET /api/properties?search=`. |
| HTML/script injection | Input is treated as plain text. Never rendered as HTML. React's default escaping is sufficient. |

### 5.1 No Query Persistence

- Search query text is **not persisted** to any database table.
- Search query text is **not written** to audit logs.
- Search query text **may appear transiently** in server access logs (standard HTTP logging). No additional application-level logging of query content.

---

## 6. Chips and Filters

### 6.1 Chip Sources

| Source | When | Example |
|---|---|---|
| Existing URL `PropertyQuerySchema` params | Always (current behavior) | `district=天河区` → chip [天河区] |
| AI parser 200 response | Phase 3 only | `{ filters: { bedrooms: 1 } }` → chip [1室] |
| Text search fallback | Phase 2, when parser unavailable | `search=天河一房` → chip [搜索: 天河一房] |

### 6.2 Chip Generation Rules

1. **Phase 2 (parser unavailable)**: Zero structured chips are generated from the NL input. The only chip from the search path is a single `search` chip displaying the raw query text.
2. **Phase 3 (parser 200)**: Each `filters` field that maps to a `PropertyQuerySchema` field generates one chip. Invalid/unknown fields are silently dropped.
3. **No client-side guessing**: The client MUST NOT attempt to extract districts, rent ranges, bedroom counts, or any structured data from the raw query string.
4. **No duplicate filter schema**: Chips always map to the single source of truth `PropertyQuerySchema`. No parallel or shadow filter system.

### 6.3 Chip Deletion

- Clicking X on a chip removes the corresponding URL query parameter.
- If the removed chip came from AI parsing, the `parsedQuery` state is cleared and the NL input is preserved as-is.
- URL `pushState` is called after chip removal.
- The property list re-fetches with updated URL params.

### 6.4 URL State

- URL query parameters are the single source of truth for all filter state.
- Navigation (back/forward) restores the previous URL → re-fetches with those params.
- `searchParams.toString()` is used as the React effect dependency.
- The NL input value is separate from URL state: it is preserved in component state (not URL) so it survives chip removals.

### 6.5 AI Field Mapping

AI response `filters` fields are validated against `PropertyQuerySchema` before conversion to URL params:

| AI Field | PropertyQuerySchema Field | Type |
|---|---|---|
| `districts` | `district` | string (first value used; multiple districts not supported in current schema) |
| `monthlyRentMax` | `maxRent` | number |
| `monthlyRentMin` | `minRent` | number |
| `bedrooms` | `bedrooms` | number |
| `petsAllowed` | `petsAllowed` | boolean |
| `cookingAllowed` | `cookingAllowed` | boolean |
| `availableBefore` | `availableBefore` | string (date) |
| `rentalType` | `rentalType` | string |
| `communityName` | `communityName` | string |
| `subwayText` | `subwayText` | string |
| `sortBy` | `sortBy` | PropertySortByEnum |
| `sortOrder` | `sortOrder` | "asc" / "desc" |

Fields not in this mapping are silently dropped. The Phase 3 backend is responsible for the whitelist; the Phase 2 UI applies redundant validation as defense-in-depth.

---

## 7. UI States

### 7.1 Loading

- When `POST /api/ai/parse-property-search` is in-flight, show an inline spinner within the search area.
- The property list below the search area may show a skeleton while re-fetching.
- Existing `LoadingState` / `Skeleton` components are reused.

### 7.2 Empty (No Results)

- When `GET /api/properties` returns zero results, show the existing `NoResults` component.
- If AI parsing returned chips, suggest removing restrictive chips.
- If fallback text search was used, suggest broadening the query.
- Display: "未找到匹配房源 · 尝试删除筛选条件或修改搜索词".

### 7.3 Error

- 401/403/422 errors: Show appropriate error state in the search area. Do NOT fall back.
- Parser 5xx/network error: Show non-blocking toast. Fall back to text search.
- Existing `ErrorState` component with retry button is reused.

### 7.4 Mobile

- 375px minimum width. No horizontal scroll at 320px.
- Search input: full width, `min-height: 44px`.
- Chips: flex-wrap, no overflow.
- Soft keyboard: `dvh` units, input not obscured.
- Consistent with existing mobile-first layout.

### 7.5 Accessibility

- Search container: `role="search"`.
- Input: `aria-label="自然语言搜索房源"`.
- Submit button: visible text label, `min-width: 44px`.
- Chips: each has `aria-label="删除筛选条件: {label}"` on the remove button.
- Focus management: after chip removal, focus returns to the search input.
- Keyboard: Enter submits, Escape clears input.

### 7.6 Phase 3 Readiness Indicator

- When fallback is active, display a subtle badge or tooltip near the search area.
- Text: "智能搜索即将上线 · 当前使用文本匹配".
- Non-blocking, non-modal.
- Automatically disappears when parser returns 200 (Phase 3 deployed).

---

## 8. Deferred to Phase 3

| 项 | Phase 3 任务 |
|---|---|
| `POST /api/ai/parse-property-search` Route Handler | P3-AI-004 |
| `DeepSeekTextProvider.parsePropertySearch()` | P3-AI-001 |
| DeepSeek API integration | P3-AI-001 |
| AI response Zod validation (`SearchParseFiltersSchema`) | P3-AI-004 |
| `semantic_search` server-side entitlement enforcement | P3-AI-004 |
| Unrecognized terms display logic | P3-AI-004 |

## 9. Explicitly Prohibited

| 禁止项 | 原因 |
|---|---|
| Client-side NLP / regex keyword extraction | Duplicates Phase 3; risks behavioral divergence |
| Sending query to any AI API from browser | No DeepSeek key in client; security boundary |
| `if (!response.ok) fallback()` fallback logic | Swallows 401/403/422 |
| Persisting search query to database | No table, no RLS, no audit plan |
| Writing search audit logs | Read-only operation per matching-contract §12 |
| Creating `/api/ai/` routes in Phase 2 | ai-deepseek-engineer domain |
| Creating shadow/double PropertyQuerySchema | Single source of truth |
| Using `semantic_search` on `GET /api/properties?search=` | Existing text search is not gated |
| Generating structured chips from client-side parsing | Phase 3 parser is the only source |
| Showing chips for Phase 3 AI fields before parser exists | Would display fabricated data |

---

## 10. Test Contract

| # | Test | Phase | Type |
|---|---|---|---|
| 1 | NL input accepts text and submit is clickable | Phase 2 | E2E |
| 2 | Empty/whitespace input disables submit | Phase 2 | Unit (Zod) |
| 3 | Max 500 characters enforced (Zod) | Phase 2 | Unit (Zod) |
| 4 | Pure-punctuation query rejected | Phase 2 | Unit (Zod) |
| 5 | Parser 404 → fallback to text search + indicator shown | Phase 2 | Integration (mock) |
| 6 | Parser 501 → fallback to text search | Phase 2 | Integration (mock) |
| 7 | Parser 200 → structured chips displayed, URL updated | Phase 2 | Integration (mock) |
| 8 | Parser network error → fallback + toast | Phase 2 | Integration (mock) |
| 9 | Parser 401 → NO fallback, auth error shown | Phase 2 | Integration (mock) |
| 10 | Parser 403 → NO fallback, permission error shown | Phase 2 | Integration (mock) |
| 11 | Parser 422 → NO fallback, validation error shown | Phase 2 | Integration (mock) |
| 12 | Chip removal → URL param removed → re-fetch | Phase 2 | E2E |
| 13 | No results → suggestions shown | Phase 2 | E2E |
| 14 | Mobile 375px no horizontal scroll | Phase 2 | E2E |
| 15 | `semantic_search` revoked → search hidden/disabled | Phase 2 | Integration |
| 16 | Structured chips NOT generated from text-search fallback | Phase 2 | Integration |
| 17 | No client phone/wechat in search results | Phase 2 | E2E |
| 18 | Back navigation restores previous filter state | Phase 2 | E2E |
| 19 | AI 200 → filters validated against PropertyQuerySchema | Phase 3 | Integration |
| 20 | Unrecognized terms displayed | Phase 3 | Integration |

---

## 11. Unbreakable Constraints

1. Phase 2 MUST NOT contain AI, DeepSeek, STT, or natural language parsing of any kind.
2. 401, 403, and 422 responses MUST NOT trigger fallback to text search.
3. `semantic_search` entitlement is independent of `property_matching`.
4. No structured chips are generated from client-side parsing of the raw query.
5. No search query text is persisted or audit-logged.
6. No database changes are required or permitted.
7. The Phase 3 parser integrates with zero Phase 2 code changes.
8. All filter state uses existing `PropertyQuerySchema` via URL query params.
9. `GET /api/properties?search=` remains ungated by `semantic_search`.
10. No `/api/ai/` routes are created or modified in Phase 2.
