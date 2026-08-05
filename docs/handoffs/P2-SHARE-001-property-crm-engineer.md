# P2-SHARE-001: Collaborative Sharing Library — Handoff

**Agent:** property-crm-engineer
**Date:** 2026-08-05
**Status:** Complete

## Summary

Implemented the full collaborative sharing library feature slice:
- Share/unshare property to shared library
- Browse shared properties across workspaces (desensitized)
- Initiate collaboration requests
- Manage incoming/outgoing collaboration requests (accept/reject)

## Files Created

### Schemas
- `src/features/collaboration/schemas.ts` — Zod schemas for share input, contact input, shared property query, collaboration request status enum, respond schema, desensitized column whitelist

### API Routes
- `src/app/api/properties/[id]/share/route.ts` — POST (share) and DELETE (unshare)
- `src/app/api/shared-properties/route.ts` — GET (browse shared library with entitlement check)
- `src/app/api/shared-properties/[id]/contact/route.ts` — POST (initiate collaboration request)
- `src/app/api/collaboration-requests/route.ts` — GET (list received/sent requests with enrichment)
- `src/app/api/collaboration-requests/[id]/route.ts` — PATCH (accept/reject requests)

### Feature Components
- `src/features/collaboration/components/share-form.tsx` — Share configuration form in ResponsiveOverlay
- `src/features/collaboration/components/contact-form.tsx` — Contact owner form with message input
- `src/features/collaboration/components/shared-property-card.tsx` — Desensitized property card with contact button
- `src/features/collaboration/components/collaboration-request-card.tsx` — Request card with status badges and accept/reject buttons
- `src/features/collaboration/components/property-share-section.tsx` — Client wrapper for property detail sharing section

### Pages
- `src/app/(dashboard)/properties/shared/page.tsx` — Shared properties browser with filters, pagination, empty/error states
- `src/app/(dashboard)/collaboration-requests/page.tsx` — Received/Sent tabs with request cards

### Modified Files
- `src/app/(dashboard)/properties/[propertyId]/page.tsx` — Replaced static sharing section with `PropertyShareSection` client component

### Tests
- `src/app/api/properties/[id]/share/__tests__/route.test.ts` — 14 tests: auth, membership, 404, cross-workspace, success, audit log, validation, error sanitization
- `src/app/api/shared-properties/__tests__/route.test.ts` — 17 tests: auth, membership, entitlement, expiry, desensitization, pagination, self-request prevention, duplicate detection, validation

## Key Design Decisions

1. **Desensitized views use explicit column whitelist** (`SHARED_PROPERTY_COLS`) — never `SELECT *`
2. **Entitlement gating** — shared-properties GET and contact POST both check `shared_property_pool` entitlement with expiry
3. **Both flags reset on unshare** — `is_shared` and `allow_marketing_reuse` both reset to false; existing collaboration requests unaffected
4. **Self-request prevention** — cannot initiate collaboration with own workspace's property
5. **Duplicate request detection** — checks for existing pending request before creating new one
6. **All API responses use `{ data, error }` envelope** with `jsonResponse()` for cookie writeback
7. **Server-derived workspace_id** — never from client input, always from `workspace_members` lookup

## Verification

```
npm run typecheck  — PASS (0 errors)
npm run lint      — PASS (0 new errors, only pre-existing warnings)
npm run test      — PASS (877 tests, 31 files)
npm run build     — PASS (28 static pages generated)
```

## Notes

- Navigation entries for shared properties and collaboration requests are NOT added to the bottom nav or sidebar (not in allowed paths; users access via direct links from within property sections)
- Audit log entries are written for share/unshare actions (fires-and-forgets, non-blocking)
- `allow_marketing_reuse` is controlled independently from `is_shared` but both reset on unshare
