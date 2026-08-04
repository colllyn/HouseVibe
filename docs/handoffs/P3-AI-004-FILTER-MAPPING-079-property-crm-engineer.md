# P3-AI-004-FILTER-MAPPING-079 Handoff

**Task**: Fix semantic search communities/features URL mapping  
**Agent**: property-crm-engineer  
**Date**: 2026-08-04  
**Status**: Complete  

## Summary

Fixed the bidirectional URL mapping for `communities` and `features` array fields from AI semantic search responses. These fields were defined in `SearchParseFiltersSchema` and returned by the AI parser, but were silently dropped at every downstream stage — they never reached URL params, chips, or refresh recovery.

## Changes

### 1. `src/features/properties/hooks/use-semantic-search.ts`

- Added `communities` and `features` to `FILTER_TO_URL_PARAM` mapping table
- Added `community` and `feature` labels to `CHIP_LABELS`
- Created `ARRAY_FILTER_FIELDS` constant: `["districts", "communities", "features"]`
- Refactored `filtersToUrlParams()` to use `ARRAY_FILTER_FIELDS` for repeated URL params with trim/dedup/sort
- Refactored `filtersToChips()` to use `ARRAY_FILTER_FIELDS` for per-value chip generation
- Exported `filtersToUrlParams`, `filtersToChips`, and `ARRAY_FILTER_FIELDS` for testing

### 2. `src/app/(dashboard)/properties/page.tsx`

- Added `community` (小区) and `feature` (特色) to `URL_CHIP_LABELS`
- Fixed `onUrlUpdate` to use `append()` instead of `set()` for array params (prevents overwriting repeated values)
- Added explicit deletion of stale array params before reapplying
- Updated `activeFilters` to generate compound keys (`param-value`) for array params (enables individual chip removal on refresh)
- Generalized `onRemoveUrlChip` to handle `community-*` and `feature-*` prefixes (alongside existing `district-*`)

### 3. `e2e/semantic-search-ui.spec.ts`

- Added `COMMUNITIES_FEATURES_200_BODY` mock response
- Added 5 new E2E tests (27–31):
  - 27: communities + features → repeated URL params and chips visible
  - 28: remove single community chip → others preserved
  - 29: remove single feature chip → others preserved
  - 30: page refresh restores communities and features from URL
  - 31: communities + features do NOT trigger text fallback
- Updated header: 31 business scenarios + 3 setup = 34 total

### 4. `src/features/properties/__tests__/semantic-search-filter-mapping.test.ts` (new)

- 26 new unit tests covering:
  - Single/multiple communities → URL params
  - Single/multiple features → URL params
  - Trim, empty string filtering, deduplication
  - Communities/features → chips with correct labels
  - URL → filter recovery simulation
  - Independent chip deletion for array params
  - Combined AI response mapping
  - Error response handling (no fallback)
  - Mapping function purity (no HTTP dependency)

### 5. `.claude/skills/housevibe-semantic-search-gate/SKILL.md`

- Added communities/features array verification checks to URL and Chips section
- Updated test counts (31 business E2E, 26 filter mapping unit tests)
- Added filter mapping test file to reviewer list

## Verification

| Check | Result |
|---|---|
| `git diff --check` | PASS |
| `npm run lint` | PASS (pre-existing warning only) |
| `npm run typecheck` | PASS |
| `npm run test` | 612 passed, 1 pre-existing failure |
| `npm run build` | PASS |
| E2E semantic-search-ui | 34/34 passed |
| E2E matching | 23/23 passed |

## URL Parameter Contract

```
community=珠江新城
community=猎德
feature=近地铁
feature=带阳台
```

- Arrays use repeated params (not comma-separated, not JSON-encoded)
- Values are trimmed, deduplicated, and sorted
- Each value produces an independent chip with unique compound key
- Deleting one value removes only that URL param, preserving others
- Page refresh reconstructs all chips from URL params
