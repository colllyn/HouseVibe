# P2-MATCH-001 Handoff — property-crm-engineer

## Task Completed

Implemented the property-client matching dashboard (Phase 2, MATCH-001).

## Summary

The matching engine, Zod schemas, React components, and all API routes already existed. The gap was: **no dashboard page** to wire them together, and **no navigation entry** — making the matching feature invisible to end users.

## Changes

| File | Action | Description |
|------|--------|-------------|
| `src/features/matching/components/match-list.tsx` | MODIFY | Export `MatchItem` interface, add `onArchive` prop, forward to MatchCard |
| `src/app/(dashboard)/matches/page.tsx` | CREATE | Full dashboard: client selector, weight editor, calculate, stats, match list, dismiss/archive |
| `src/components/layout/desktop-sidebar.tsx` | MODIFY | Add "房客匹配" nav entry with GitMerge icon |
| `src/components/layout/navigation.test.tsx` | MODIFY | Update test expectations for new sidebar item |
| `src/app/(dashboard)/clients/[clientId]/page.tsx` | MODIFY | Add "房源匹配" section with MatchList, calculate button, dismiss/archive |
| `src/app/(dashboard)/properties/[propertyId]/matches-section.tsx` | CREATE | Client wrapper for server-rendered property detail page |
| `src/app/(dashboard)/properties/[propertyId]/page.tsx` | MODIFY | Integrate PropertyMatchSection via Suspense |

## Key Design Decisions

1. **Mobile nav unchanged** — Already at 5 items (PRD max). Desktop sidebar only.
2. **Dashboard refetch after POST** — The calculate endpoint returns computed results without persisted IDs. Refetch from GET endpoint for dismiss/archive to work.
3. **Property view is read-only** — Matches are calculated per-client, so property detail only lists existing matches.
4. **Type safety** — `MatchItem` exported from match-list.tsx now, eliminating type duplication.

## Gates (all passing)

- `npm run typecheck` — 0 errors
- `npm run lint` — 0 errors (pre-existing warnings only)
- `npm run test` — 1318 passed, 53 files
- `npm run build` — ✓ 41/41 static pages

## Commit

`41681a3` — `feat: implement property-client matching dashboard (P2-MATCH-001)`
