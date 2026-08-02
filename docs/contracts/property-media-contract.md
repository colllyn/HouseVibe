# Property Media Management Contract — P2-PROP-003

| 属性 | 值 |
|---|---|
| 文档名称 | property-media-contract |
| 版本 | 1.0 |
| 状态 | FROZEN |
| Owner | solution-architect |
| 依赖 | PRD v1.3 (SS7.3, SS8.2), domain-model v1.0 (SS2.6), rls-contract v1.0 (SS4.6, SS5.1), api-contract v1.0 |
| 关联 Migration | `20260801000005` (table), `20260801000003` (bucket) |
| 最后更新 | 2026-08-02 |

---

## 1. Supported Media

### 1.1 Images (MVP Active)

| Format | MIME | Extension |
|---|---|---|
| PNG | `image/png` | `.png` |
| JPEG | `image/jpeg` | `.jpg` / `.jpeg` |
| WebP | `image/webp` | `.webp` |
| GIF | `image/gif` | `.gif` |

### 1.2 Prohibited

SVG (`image/svg+xml`), HTML, XML, archives (`.zip`, `.tar`), executables — rejected at Route Handler layer.

### 1.3 Video: DEFERRED

The `media_type` enum includes `video` and the bucket allows `video/mp4`/`video/webm`, but video upload is DEFERRED. Route Handler MUST reject video MIME types at this phase.

---

## 2. File Constraints

| Constraint | Value | Enforced |
|---|---|---|
| Max file size | 10 MB | Route Handler pre-check + bucket limit |
| Allowed MIME | `image/png`, `image/jpeg`, `image/webp`, `image/gif` | Route Handler + bucket |
| Max files per request | 5 | Route Handler |
| Max media per property | 20 | Route Handler (count pre-check) |
| Request Content-Type | `multipart/form-data` | Route Handler |

> **CONFLICT NOTED**: The bucket migration sets `file_size_limit = 52428800` (50 MB). The PRD SS7.3 specifies images only (no audio/video size limits defined for this context). A follow-up migration should reduce the bucket limit to 10485760 (10 MB) or the Route Handler MUST serve as the primary enforcement point.

---

## 3. Storage Bucket

### 3.1 Bucket: `property-private` (Already Created)

- Bucket: `property-private` (migration `20260801000003`)
- Public: `false` (all access via signed URLs)
- RLS: Workspace member SELECT/INSERT/UPDATE; Workspace owner DELETE

### 3.2 Object Path Convention (MUST FOLLOW FROZEN MIGRATION)

```
{workspace_id}/{user_id}/{uuid}.{ext}
```

| Segment | Source | Note |
|---|---|---|
| `workspace_id` | Server-side from `workspace_members` | Extracted by `private.storage_workspace_id()` for RLS |
| `user_id` | Server-side from `auth.uid()` | Extracted by `private.storage_user_id()` for accountability |
| `uuid` | Server-generated `crypto.randomUUID()` | Guarantees uniqueness |
| `ext` | Derived from validated MIME type | NOT from user filename |

Example: `d290f1ee-6c54-4b01-90e6-d701748f0851/3f2504e0-4f89-11d3-9a0c-0305e82c3301/a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg`

> **CRITICAL**: This path follows the FROZEN migration `20260801000003_storage_buckets.sql`. The `storage_workspace_id()` and `storage_user_id()` RLS helpers depend on this exact segment layout. Changing to `{workspace_id}/{property_id}/{media_id}` would require a new migration to update both functions and would break existing RLS policies. DO NOT change.

### 3.3 Signed URLs

- All media access via signed URLs (bucket is private).
- Signed URL expiry: `MEDIA_SIGNED_URL_EXPIRY_SECONDS` env var (default 3600).
- Signed URLs generated server-side after workspace + property verification.

---

## 4. `property_media` Table (Already Created)

Migration `20260801000005_phase2_business_tables.sql`. See domain-model v1.0 SS2.6 for full field definitions.

| Field | Type | Key Fields for This Contract |
|---|---|---|
| `id` | UUID PK | Generated |
| `workspace_id` | UUID NOT NULL | FK → workspaces |
| `property_id` | UUID NOT NULL | FK → properties |
| `storage_path` | TEXT NOT NULL | Full path in bucket |
| `media_type` | `media_type` ENUM | `image` (video deferred) |
| `scene_tag` | TEXT NULL | e.g. `living_room`, `bedroom` |
| `is_cover` | BOOLEAN, default `false` | Cover image flag |
| `sort_order` | INTEGER, default `0` | Display order |
| `width` | INTEGER NULL | Image width px (server-extracted) |
| `height` | INTEGER NULL | Image height px (server-extracted) |
| `duration_seconds` | NUMERIC NULL | Video duration (deferred) |
| `ai_labels` | JSONB NULL | AI visual labels (deferred) |
| `ai_analysis_status` | `ai_analysis_status` ENUM, default `pending` | `pending`, `processing`, `completed`, `failed` |
| `ai_analyzed_at` | TIMESTAMPTZ NULL | Analysis completion time |
| `created_at` | TIMESTAMPTZ NOT NULL | |
| `deleted_at` | TIMESTAMPTZ NULL | Soft-delete |

RLS on table (migration `20260801000005`):
- SELECT: workspace member (`deleted_at IS NULL`) OR shared property media
- INSERT: workspace member
- UPDATE: workspace member (`deleted_at IS NULL`)
- DELETE: workspace owner only

---

## 5. API Endpoints

All endpoints nested under `/api/properties/[id]/media`. Owner: property-crm-engineer. Auth: required. Workspace rule: must be member of the property's workspace.

### 5.1 GET /api/properties/[id]/media — List Media

Returns all non-deleted media for the property, ordered by `sort_order ASC, created_at ASC`. Generates signed URLs for each record.

**Success (200)**:
```json
{
  "data": {
    "media": [{
      "id": "uuid",
      "propertyId": "uuid",
      "storagePath": "ws_id/user_id/uuid.jpg",
      "mediaType": "image",
      "sceneTag": "living_room",
      "isCover": true,
      "sortOrder": 0,
      "width": 1920,
      "height": 1080,
      "aiLabels": null,
      "aiAnalysisStatus": "pending",
      "signedUrl": "https://...?token=...",
      "signedUrlExpiresAt": "2026-08-02T11:00:00Z",
      "createdAt": "2026-08-02T10:00:00Z"
    }],
    "total": 3
  },
  "error": null
}
```

### 5.2 POST /api/properties/[id]/media — Upload Media

**Content-Type**: `multipart/form-data`

**Form field**: `files` (File[], 1–5 required)

Processing:
1. Auth + workspace membership + property ownership check.
2. Count existing active media; reject if `count + new_count > 20`.
3. For each file: validate MIME → validate size → reject video → generate path → upload to storage → extract dimensions → insert `property_media` row.
4. First upload gets `is_cover = true` if no existing cover.

**Success (201)**: Returns created media records with signed URLs.

**Partial Failure (207)**: If some files succeed and some fail, return uploaded items + rejections list.

**Errors**: 401, 403, 404, 400 (all invalid), 413 (too large), 415 (bad MIME), 422 (video deferred / limit exceeded), 429, 500.

### 5.3 PATCH /api/properties/[id]/media/[mediaId] — Update Metadata

**Body** (all optional):
```json
{
  "isCover": true,
  "sortOrder": 0,
  "sceneTag": "bedroom"
}
```

If `isCover: true` — unset cover on all other media for this property first.

**Success (200)**: Returns updated media record.

### 5.4 DELETE /api/properties/[id]/media/[mediaId] — Soft-Delete

Owner only. Sets `deleted_at = now()`. Does NOT delete storage object. Does NOT auto-reassign cover.

**Success (200)**: `{ "data": { "deleted": true, "mediaId": "uuid", "deletedAt": "..." } }`

---

## 6. Authorization Matrix

| Operation | Workspace Owner | Workspace Member | External Collaborator |
|---|---|---|---|
| GET list | Yes | Yes | No |
| POST upload | Yes | Yes | No |
| PATCH metadata | Yes | Yes | No |
| DELETE | Yes | **No** | No |

All operations verified at three layers: Route Handler (auth + workspace + role), Storage RLS (path-based workspace check), Table RLS (workspace_id column check).

---

## 7. Zod Schemas (Place in `src/features/properties/schemas.ts`)

```typescript
export const UpdateMediaInputSchema = z.object({
  isCover: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  sceneTag: z.string().max(50, "场景标签最多 50 字").optional(),
});
export type UpdateMediaInput = z.infer<typeof UpdateMediaInputSchema>;
```

---

## 8. Deferred Features

| Feature | Status | Owner |
|---|---|---|
| Video upload/playback | Schema ready; API rejects | Future ADR |
| AI visual analysis (`ai_labels`, `ai_analysis_status`) | Schema ready; defaults to `pending` | ai-deepseek-engineer (Phase 3) |
| `property-shared` bucket media copy | Bucket + RLS ready; no copy logic | Future ADR |
| Image editing/cropping | Out of scope | Future ADR |
| Bulk reorder | Sequential PATCH supported | Frontend |
| EXIF stripping | Required before visual endpoint (ai-deepseek-engineer) | Phase 3 |
| Client-side compression | Recommended | mobile-ui-engineer |

---

## 9. Error Codes (Add to `src/lib/types/api.ts` ErrorCode union)

| Code | HTTP | Description |
|---|---|---|
| `MEDIA_LIMIT_EXCEEDED` | 422 | Per-property count would exceed 20 |
| `MEDIA_UNSUPPORTED_TYPE` | 415 | File MIME not allowed |
| `MEDIA_FILE_TOO_LARGE` | 413 | File exceeds 10 MB |
| `MEDIA_VIDEO_DEFERRED` | 422 | Video upload not yet supported |

---

## 10. File Placement

```
src/app/api/properties/[id]/media/route.ts          — GET list, POST upload
src/app/api/properties/[id]/media/[mediaId]/route.ts — PATCH metadata, DELETE
src/features/properties/schemas.ts                    — add UpdateMediaInputSchema
src/lib/types/api.ts                                  — add new ErrorCodes
```

---

## 11. CONFLICT RESOLUTION LOG

| ID | Conflict | Resolution | Status |
|---|---|---|---|
| C1 | Bucket `file_size_limit` is 50 MB in migration; this contract specifies 10 MB | Route Handler enforces 10 MB as primary check. Bucket limit serves as secondary safeguard. File a follow-up migration ticket to reduce bucket limit. | RESOLVED — no migration change needed now |
| C2 | Path convention in frozen migration is `{workspace_id}/{user_id}`; alternative `{workspace_id}/{property_id}` was considered | MUST use `{workspace_id}/{user_id}` per frozen migration. `property_id` is in the `property_media` table row, not the path. RLS helpers depend on this layout. | RESOLVED — follow frozen migration |
| C3 | RLS migration says `is_workspace_owner` for table DELETE but "Admin" was mentioned as inheriting owner | System Admin is NOT in the RLS policy for DELETE on `property_media` table. `is_system_admin()` is not checked. Admin access is via service_role on the admin console, not user-facing API. | RESOLVED — RLS as-is is correct |

---

## 12. Change Control

FROZEN. Changes require ADR + solution-architect review + notification to all affected agents.
