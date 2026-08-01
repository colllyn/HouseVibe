# Handoff: P1-DB-004 Storage Buckets and RLS Policies

- **Task:** P1-DB-004
- **Agent:** data-security-engineer
- **Date:** 2026-08-01
- **Status:** COMPLETE

## What was implemented

Created migration `supabase/migrations/20260801000003_storage_buckets.sql` with:

### 4 Storage Buckets

| Bucket | Size Limit | Allowed MIME Types | Public |
|---|---|---|---|
| `property-private` | 50 MiB | image/png, image/jpeg, image/webp, image/gif, video/mp4, video/webm | false |
| `property-shared` | 50 MiB | image/png, image/jpeg, image/webp, image/gif | false |
| `content-assets` | 50 MiB | image/png, image/jpeg, image/webp, image/gif, video/mp4, video/webm, application/pdf | false |
| `avatars` | 5 MiB | image/png, image/jpeg, image/webp, image/gif | false |

### Object Path Format

- `property-private`: `{workspace_id}/{user_id}/{filename}`
- `property-shared`: `{workspace_id}/{property_id}/{filename}`
- `content-assets`: `{workspace_id}/{user_id}/{filename}`
- `avatars`: `{user_id}/{filename}`

### 2 Path-Extraction Helpers (private schema)

- `private.storage_workspace_id(object_path text) -> uuid` — extracts workspace UUID from first path segment with regex validation; returns NULL for malformed paths
- `private.storage_user_id(object_path text, is_avatar boolean) -> uuid` — extracts user UUID from appropriate path segment

### 15 RLS Policies on storage.objects

**property-private (4 policies):**
- SELECT: workspace member (via `private.is_workspace_member()`)
- INSERT: workspace member + extension whitelist
- UPDATE: workspace member + extension whitelist
- DELETE: workspace owner only

**property-shared (3 policies):**
- SELECT: any authenticated user
- UPDATE: workspace owner + extension whitelist
- DELETE: workspace owner
- INSERT: no policy (default-deny; service_role copies from property-private)

**content-assets (4 policies):**
- All operations: `has_feature('content_factory')` + `is_workspace_member()` + extension whitelist (where applicable)

**avatars (4 policies):**
- SELECT: any authenticated user
- INSERT/UPDATE/DELETE: `storage_user_id(name, true) = auth.uid()` + extension whitelist (where applicable)

## Security Design

- All buckets are private (public=false) — no permanent public URLs
- RLS default-deny; only explicit policies grant access
- Path-based workspace/user identity extraction prevents path forgery
- Extension whitelists prevent executable/shell/archive uploads
- File-size limits enforced at bucket config level
- Signed URL validity (max 1 hour) to be enforced at application layer via `storage.createSignedUrl()` expiry parameter
- Service role bypass for property-shared INSERT (server-side derivation only)

## Verification Results

| Check | Result |
|---|---|
| `npx supabase db reset` | Clean apply |
| `npx supabase db lint` | No issues (only pre-existing pgtap extension warnings) |
| `npm run typecheck` | Clean |
| `npm run lint` | Only 2 pre-existing `<img>` warnings |
| `npm run test` | 8 files, 141 tests, all passed |
| `npx supabase test db` | 9 files, 287 tests, all passed |

## Notes for Future Phases

- Phase 2 (P2-PROP-003 property media management) will upload to `property-private` and potentially derive to `property-shared`
- When implementing signed URL generation (Route Handlers), enforce max 1-hour expiry and verify workspace membership before signing
- `property-shared` INSERT is reserved for service_role — the application server must use service_role key when copying shared media
- No storage-level RLS tests were added (P1-TEST-002 covers database RLS; storage policy testing is deferred to P2 or Phase 4 integration testing per implementation plan)
