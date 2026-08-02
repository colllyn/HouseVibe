# P2-CLIENT-001 Handoff — property-crm-engineer

## Summary
Created client CRUD API routes, Zod schemas, and server actions for the clients table.

## Files Changed

### 1. `src/features/properties/schemas.ts` (appended, lines 234-280)
- `ClientStageEnum` — matches migration `client_stage` ENUM (10 values)
- `CreateClientInputSchema` — validates create body; `name` required, all others optional
- `UpdateClientInputSchema` — all fields optional for PATCH

### 2. `src/app/api/clients/route.ts` (new, 141 lines)
- **GET** `/api/clients?stage=&search=` — list clients, excludes phone/wechat, ordered by updated_at DESC
- **POST** `/api/clients` — create client, workspace_id from server auth, created_by from auth.uid(), validates body with Zod, returns 201

### 3. `src/app/api/clients/[id]/route.ts` (new, 131 lines)
- **GET** `/api/clients/[id]` — full detail including phone/wechat
- **PATCH** `/api/clients/[id]` — partial update with type coercion (bool/int/date/array), stage validated against ClientStageEnum
- **DELETE** `/api/clients/[id]` — soft delete, owner-only (checks workspace_members.role === "owner")

### 4. `src/features/properties/actions.ts` (appended, lines 68-98)
- `getClientById(clientId)` — full detail including phone/wechat, returns null if not found
- `getClients()` — list without phone/wechat, ordered by updated_at DESC

## Verification

| Check | Result |
|-------|--------|
| `npm run typecheck` | Clean (0 errors) |
| `npm run lint` | Clean for new files; 2 pre-existing errors in media-route.test.ts, 4 warnings in unrelated files |
| `npm run test` | 12 files / 295 tests passed |
| `npm run build` | Compiled successfully; lint step blocked by pre-existing issues (not from these changes) |

## Pre-existing Issues (not caused by this task)
- `src/app/api/properties/__tests__/media-route.test.ts:1037` — `updateCallCount` assigned but never used
- `src/app/api/properties/__tests__/media-route.test.ts:1111` — `updateCalls` never reassigned, use `const`
- `src/components/ui/media-grid.tsx` — 2 alt-text warnings + 1 `<img>` warning
- `src/components/ui/media-uploader.tsx` — 1 `<img>` warning
- `src/lib/supabase/route-handler.ts` — unused eslint-disable directive

## Patterns Followed
- Same auth pattern: `getUser()` -> `workspace_members` check -> `workspace_id` from server
- Same CORS pattern: `urlOrigin` / `cors` helper
- Same error format: `jsonResponse({ error: "..." }, { status: N, headers: h })`
- Same error messages in Chinese
- No service_role used anywhere
- workspace_id always bound from server
- created_by always set from `auth.uid()`
- Soft delete via UPDATE (set deleted_at)
- Owner check for DELETE uses workspace_members.role column

## Notes
- `preferred_districts` and `preferred_communities` stored as `text[]` in DB; inputs accepted as comma-separated strings and converted to arrays
- `phone` and `wechat` excluded from list endpoints and `getClients()` server action; included in detail endpoints and `getClientById()` only
- RLS policies from migration 20260801000005 remain in effect (workspace members SELECT/INSERT/UPDATE; owner DELETE)
