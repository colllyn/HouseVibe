# HouseVibe Interaction Contract (P2-CLIENT-002)

| 属性 | 值 |
|---|---|
| 文档名称 | interaction-contract |
| 版本 | 1.0 |
| 状态 | FROZEN |
| Owner | solution-architect |
| 依赖 | PRD v1.3, domain-model v1.0, api-contract v1.0, rls-contract v1.0, client-contract v1.0, migration 20260801000005 |
| 最后更新 | 2026-08-03 |

---

## 1. Scope

This contract defines the frozen API, Zod schema, permissions, soft-delete lifecycle, audit trail, RLS requirements, and error-code boundary for the Client Interaction (沟通记录) slice (P2-CLIENT-002). The `interactions` table and `interaction_type` enum already exist in migration `20260801000005_phase2_business_tables.sql` -- this contract extends that base by adding `updated_at` and `deleted_at` columns, converting to soft-delete semantics, and updating RLS policies.

Interactions are scoped under a specific client at `/api/clients/[clientId]/interactions`. No cross-client or cross-workspace interaction views are supported.

**Deferred (NOT in scope for P2-CLIENT-002):**
- AI summaries/摘要 of interactions
- Task/待办 creation from interactions
- Automated client stage transitions triggered by interactions
- File/image/audio/video attachments on interactions
- Voice transcription/STT on interaction content
- Interaction-match linkage (matching stays deferred)
- Reminder notifications for follow-ups
- Bulk interaction import
- Interaction templates

---

## 2. Interaction Fields

### 2.1 Existing Fields (from migration `20260801000005`)

| Field | Type | Nullable | Description |
|---|---|---|---|
| `id` | UUID (PK) | NO | `gen_random_uuid()` |
| `workspace_id` | UUID (FK) | NO | FK to `workspaces(id)` ON DELETE CASCADE |
| `client_id` | UUID (FK) | NO | FK to `clients(id)` ON DELETE CASCADE |
| `property_id` | UUID (FK) | YES | FK to `properties(id)` ON DELETE SET NULL |
| `interaction_type` | `interaction_type` (enum) | NO | One of 9 communication types (see section 3) |
| `summary` | TEXT | YES | Human-written or AI-generated summary |
| `raw_text` | TEXT | YES | Full transcript or raw notes |
| `next_action` | TEXT | YES | Planned follow-up action |
| `occurred_at` | TIMESTAMPTZ | NO | When the interaction actually occurred |
| `created_by` | UUID (FK) | NO | FK to `profiles(id)` -- user who logged it |
| `created_at` | TIMESTAMPTZ | NO | `now()` on insert |

### 2.2 New Fields Required (Migration)

| Field | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `updated_at` | TIMESTAMPTZ | NO | `now()` | Auto-updated via trigger on any UPDATE |
| `deleted_at` | TIMESTAMPTZ | YES | NULL | Soft-delete timestamp; NULL = active |

A `set_updated_at` trigger MUST be created for `public.interactions`, following the same pattern as existing triggers for `properties`, `clients`, `property_matches`, `tasks`, and `collaboration_requests` (migration `20260801000005` lines 397-413).

### 2.3 Server-Derived Fields (Never Accepted from Client)

| Field | Source |
|---|---|
| `id` | `gen_random_uuid()` |
| `workspace_id` | Derived from `auth.uid()` via `workspace_members` lookup |
| `created_by` | `auth.uid()` |
| `created_at` | `now()` |
| `updated_at` | `now()` (trigger + explicit on update) |
| `deleted_at` | Set on soft delete; always NULL for active records |

### 2.4 Editable Fields (PATCH)

| Field | Notes |
|---|---|
| `summary` | Optional; nullable to clear |
| `raw_text` | Optional; nullable to clear |
| `next_action` | Optional; nullable to clear |
| `occurred_at` | Optional; valid ISO-8601 timestamp |
| `interaction_type` | Optional; valid `interaction_type` enum value |
| `property_id` | Optional; validated as same-workspace, non-deleted; nullable to clear |

**Immutable after creation**: `client_id`, `workspace_id`, `created_by`, `created_at`, `id`.

### 2.5 Required Fields for Creation

| Field | Required | Source |
|---|---|---|
| `interaction_type` | YES | Request body |
| `occurred_at` | YES | Request body; ISO-8601 timestamp |

All other fields are optional and nullable. `client_id` is derived from the URL path `[clientId]`.

### 2.6 List Response Column Set

The list endpoint MUST return these non-verbose columns:

```
id, workspace_id, client_id, property_id, interaction_type, summary,
next_action, occurred_at, created_by, created_at, updated_at, deleted_at
```

**Excluded from list**: `raw_text` (potentially large; detail-only).

The detail endpoint returns all columns including `raw_text`.

### 2.7 Timeline Display Columns

For client-facing timeline display:
- `interaction_type` -- badge/icon
- `summary` -- primary content line
- `occurred_at` -- formatted datetime
- `created_by` name (from profiles join)

---

## 3. Interaction Type Enum

### 3.1 Enum Values

The `interaction_type` PostgreSQL enum already exists in migration `20260801000005` with these values. No new values are added in this contract.

| # | Value | Chinese Label | Icon (Lucide) | Description |
|---|---|---|---|---|
| 1 | `phone_call` | 电话 | `Phone` | Phone call with the client |
| 2 | `wechat_message` | 微信 | `MessageCircle` | WeChat message exchange |
| 3 | `in_person_meeting` | 见面 | `Users` | Face-to-face meeting |
| 4 | `property_viewing` | 带看 | `Eye` | Client viewed a specific property |
| 5 | `follow_up` | 跟进 | `RefreshCw` | Follow-up check-in |
| 6 | `negotiation` | 谈判 | `Handshake` | Price/terms negotiation |
| 7 | `contract_signing` | 签约 | `FileText` | Contract signing process |
| 8 | `complaint` | 投诉 | `AlertCircle` | Client complaint or concern |
| 9 | `other` | 其他 | `MoreHorizontal` | Any other type |

### 3.2 Type Label Map (UI)

```typescript
const INTERACTION_TYPE_LABELS: Record<string, string> = {
  phone_call: "电话",
  wechat_message: "微信",
  in_person_meeting: "见面",
  property_viewing: "带看",
  follow_up: "跟进",
  negotiation: "谈判",
  contract_signing: "签约",
  complaint: "投诉",
  other: "其他",
};
```

---

## 4. Client Association Rules

### 4.1 Same-Workspace Constraint

The `client_id` in the URL path MUST identify a client that:
1. Belongs to the authenticated user's workspace (`workspace_id` match)
2. Is not soft-deleted (`deleted_at IS NULL`)

If the client does not exist, belongs to another workspace, or is soft-deleted, the server returns `RESOURCE_NOT_FOUND` (404).

### 4.2 Property Association (Optional)

When `property_id` is provided in create or update:
1. The property MUST belong to the same workspace as the client.
2. The property MUST NOT be soft-deleted (`deleted_at IS NULL`).

If validation fails, return `VALIDATION_FAILED` (422) with a message specifying the invalid property reference.

Setting `property_id` to `null` clears the association; no validation is needed.

### 4.3 Cascade Behavior

- **Client soft-delete**: Interactions are NOT automatically soft-deleted. The database FK uses `ON DELETE CASCADE` which only triggers on physical DELETE, which does not happen in soft-delete workflows. Interactions remain accessible for audit/history even after a client is soft-deleted.
- **Property physical delete**: `ON DELETE SET NULL` clears `property_id` without deleting the interaction.
- **Workspace delete**: `ON DELETE CASCADE` physically removes interactions. This is acceptable because workspace deletion is an admin-level operation that cascades all data.

---

## 5. Permissions

### 5.1 Role Matrix

| Operation | Owner | Member | System Admin | External Collaborator |
|---|---|---|---|---|
| SELECT (list + detail) | Yes | Yes | No | No |
| INSERT | Yes | Yes | No | No |
| UPDATE (PATCH) | Yes | Yes | No | No |
| DELETE (soft) | Yes | Yes | No | No |

Unlike clients (where soft-delete is owner-only), any workspace member can view, create, edit, or soft-delete any interaction within their workspace. Interactions are daily communication records that all agents need to manage.

### 5.2 Cross-Workspace Protection

- `workspace_id` on all queries is server-derived from `auth.uid()` via `workspace_members` lookup. The client can never supply or override `workspace_id`.
- RLS policies enforce `is_workspace_member(workspace_id)` at the database level.
- `client_id` is validated to belong to the authenticated user's workspace before any interaction operation.
- `property_id` (if provided) is validated as same-workspace and non-deleted.

### 5.3 Action Restrictions

| Action | Restriction |
|---|---|
| View interactions for a client in another workspace | Denied (server rejects at client validation) |
| Create interaction for a soft-deleted client | Denied (server rejects at client validation) |
| Reference property from another workspace | Denied (server validates) |
| Reference a soft-deleted property | Denied (server validates) |
| Modify `client_id` of an existing interaction | Denied (immutable after creation) |
| View interactions without workspace membership | Denied (RLS + API) |

---

## 6. API Contract

All endpoints follow `api-contract` v1.0 conventions: cookie-based Supabase Auth, unified error envelope `{ data, error: { code, message } }`, CORS headers.

### 6.1 Endpoint Summary

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/clients/[clientId]/interactions` | List interactions for a client |
| POST | `/api/clients/[clientId]/interactions` | Create a new interaction |
| GET | `/api/clients/[clientId]/interactions/[interactionId]` | Get single interaction detail |
| PATCH | `/api/clients/[clientId]/interactions/[interactionId]` | Update an interaction |
| DELETE | `/api/clients/[clientId]/interactions/[interactionId]` | Soft-delete an interaction |

---

### 6.2 GET /api/clients/[clientId]/interactions

List interactions for a specific client.

| Attribute | Value |
|---|---|
| Method | GET |
| Auth | Required |
| Path Param | `clientId` (UUID) |

**Preconditions** (server-enforced):
1. Authenticate user.
2. Derive `workspace_id` from `workspace_members`.
3. Verify `clientId` belongs to workspace and is not soft-deleted. If not, return `RESOURCE_NOT_FOUND`.

**Query Parameters**:

| Parameter | Type | Default | Description |
|---|---|---|---|
| `type` | `interaction_type` | - | Filter by interaction type (one enum value) |
| `page` | integer | 1 | Page number, 1-indexed |
| `limit` | integer | 20 | Page size, max 50 |
| `sortOrder` | `asc` \| `desc` | `desc` | Sort direction for `occurred_at` |

**Sorting**: Primary sort is `occurred_at` + tie-breaker `created_at`. `sortOrder` controls the direction of both. Default: most recent first (`desc`). Final deterministic tie-breaker: `id ASC`.

**Server-enforced filters**:
- `workspace_id` = derived from authenticated user
- `client_id` = `[clientId]` from URL path
- `deleted_at IS NULL`

**Success Response** (200):
```json
{
  "data": {
    "interactions": [
      {
        "id": "uuid",
        "workspace_id": "uuid",
        "client_id": "uuid",
        "property_id": "uuid",
        "interaction_type": "phone_call",
        "summary": "客户询问天河区一居室房源",
        "next_action": "发送3套匹配房源",
        "occurred_at": "2026-08-02T14:30:00Z",
        "created_by": "uuid",
        "created_at": "2026-08-02T14:35:00Z",
        "updated_at": "2026-08-02T14:35:00Z",
        "deleted_at": null
      }
    ],
    "total": 15,
    "page": 1,
    "limit": 20
  },
  "error": null
}
```

`raw_text` is excluded from list. Detail-only.

**Error Responses**:
| Code | HTTP | When |
|---|---|---|
| `UNAUTHENTICATED` | 401 | No valid session |
| `WORKSPACE_ACCESS_DENIED` | 403 | No active workspace membership |
| `RESOURCE_NOT_FOUND` | 404 | Client not found, cross-workspace, or soft-deleted |
| `VALIDATION_FAILED` | 422 | Invalid query parameters (invalid `type`, `page` < 1, `limit` > 50, invalid `sortOrder`) |
| `INTERNAL_ERROR` | 500 | Database or server error |

---

### 6.3 POST /api/clients/[clientId]/interactions

Create a new interaction.

| Attribute | Value |
|---|---|
| Method | POST |
| Auth | Required |
| Path Param | `clientId` (UUID) |
| Request Body | JSON (Zod: `CreateInteractionInputSchema`) |

**Request Body**:
```json
{
  "interaction_type": "phone_call",
  "occurred_at": "2026-08-02T14:30:00Z",
  "summary": "客户询问天河区一居室房源",
  "raw_text": "客户：您好，我想了解天河区一居室的房源...",
  "next_action": "发送3套匹配房源",
  "property_id": "uuid-or-null"
}
```

**Required**: `interaction_type`, `occurred_at`.
**Optional**: `summary`, `raw_text`, `next_action`, `property_id`.

**Server-Side Processing**:
1. Authenticate user and derive `workspace_id`.
2. Verify `clientId` belongs to workspace and is not soft-deleted. If not, `RESOURCE_NOT_FOUND`.
3. Validate body against `CreateInteractionInputSchema`.
4. If `property_id` is provided and non-null: verify same workspace, non-soft-deleted.
5. Insert record with server-derived `id`, `workspace_id`, `created_by`, `created_at`, `updated_at`.
6. Write to `audit_logs` (see section 8).
7. Return 201 with full interaction detail.

**Success Response** (201):
```json
{
  "data": {
    "id": "uuid",
    "workspace_id": "uuid",
    "client_id": "uuid",
    "property_id": "uuid",
    "interaction_type": "phone_call",
    "summary": "客户询问天河区一居室房源",
    "raw_text": "客户：您好，我想了解天河区一居室的房源...",
    "next_action": "发送3套匹配房源",
    "occurred_at": "2026-08-02T14:30:00Z",
    "created_by": "uuid",
    "created_at": "2026-08-02T14:35:00Z",
    "updated_at": "2026-08-02T14:35:00Z",
    "deleted_at": null
  },
  "error": null
}
```

**Error Responses**:
| Code | HTTP | When |
|---|---|---|
| `UNAUTHENTICATED` | 401 | No valid session |
| `WORKSPACE_ACCESS_DENIED` | 403 | No active workspace membership |
| `RESOURCE_NOT_FOUND` | 404 | Client not found, cross-workspace, or soft-deleted |
| `VALIDATION_FAILED` | 422 | Missing `interaction_type` or `occurred_at`; invalid enum; invalid `property_id`; field type errors |
| `INTERNAL_ERROR` | 500 | Database or server error |

---

### 6.4 GET /api/clients/[clientId]/interactions/[interactionId]

Get a single interaction detail.

| Attribute | Value |
|---|---|
| Method | GET |
| Auth | Required |
| Path Params | `clientId` (UUID), `interactionId` (UUID) |

**Preconditions**:
1. Authenticate user and derive `workspace_id`.
2. Verify `clientId` belongs to workspace and is not soft-deleted.
3. Verify `interactionId` belongs to workspace, is linked to `clientId`, and is not soft-deleted.

**Success Response** (200):
Returns all interaction columns including `raw_text`. Same shape as POST 201 response.

**Error Responses**:
| Code | HTTP | When |
|---|---|---|
| `UNAUTHENTICATED` | 401 | No valid session |
| `WORKSPACE_ACCESS_DENIED` | 403 | No active workspace membership |
| `RESOURCE_NOT_FOUND` | 404 | Client or interaction not found, cross-workspace, or soft-deleted |
| `INTERNAL_ERROR` | 500 | Database or server error |

---

### 6.5 PATCH /api/clients/[clientId]/interactions/[interactionId]

Update an interaction. All fields optional (partial update).

| Attribute | Value |
|---|---|
| Method | PATCH |
| Auth | Required |
| Path Params | `clientId` (UUID), `interactionId` (UUID) |
| Request Body | JSON (Zod: `UpdateInteractionInputSchema`) |

**Request Body** (all fields optional):
```json
{
  "interaction_type": "phone_call",
  "occurred_at": "2026-08-02T15:00:00Z",
  "summary": "更正：客户询问天河区两居室房源",
  "raw_text": "更正后的聊天记录...",
  "next_action": "发送5套匹配房源",
  "property_id": "uuid-or-null"
}
```

**Editable fields**: `interaction_type`, `occurred_at`, `summary`, `raw_text`, `next_action`, `property_id`.

**Immutable fields**: `client_id`, `workspace_id`, `created_by`, `created_at`, `id`.

**Preconditions**:
1. Authenticate user and derive `workspace_id`.
2. Verify `clientId` belongs to workspace and is not soft-deleted.
3. Verify `interactionId` belongs to workspace, is linked to `clientId`, and is not soft-deleted.
4. Validate body. Reject requests that attempt to modify immutable fields.
5. If `property_id` is provided and non-null: verify same workspace, non-soft-deleted.

**Server-Side Processing**:
1. Perform validations.
2. `updated_at` is auto-set by trigger.
3. Apply the partial update -- only fields present in body are changed.
4. Compute diff of changed fields for audit.
5. Write to `audit_logs` with before/after snapshot of changed fields only.
6. Return updated interaction (same shape as GET detail).

**Success Response** (200):
Returns full updated interaction detail.

**Error Responses**:
| Code | HTTP | When |
|---|---|---|
| `UNAUTHENTICATED` | 401 | No valid session |
| `WORKSPACE_ACCESS_DENIED` | 403 | No active workspace membership |
| `RESOURCE_NOT_FOUND` | 404 | Client or interaction not found, cross-workspace, or soft-deleted |
| `VALIDATION_FAILED` | 422 | Invalid field values; invalid enum; cross-workspace property; empty body (no fields to update) |
| `INTERNAL_ERROR` | 500 | Database or server error |

---

### 6.6 DELETE /api/clients/[clientId]/interactions/[interactionId]

Soft-delete an interaction.

| Attribute | Value |
|---|---|
| Method | DELETE |
| Auth | Required |
| Path Params | `clientId` (UUID), `interactionId` (UUID) |

**Processing**:
1. Authenticate user and derive `workspace_id`.
2. Verify `clientId` belongs to workspace and is not soft-deleted.
3. Fetch the interaction, verify it exists in the workspace, is linked to `clientId`.
4. **Idempotency**: If `deleted_at` is already set (already soft-deleted), return the existing timestamp with `deleted: true`. Do not update again.
5. If not yet deleted: set `deleted_at = now()` via UPDATE (not physical DELETE).
6. Write to `audit_logs`.
7. Return success.

**Success Response** (200):
```json
{
  "data": {
    "deleted": true,
    "deletedAt": "2026-08-03T10:30:00Z"
  },
  "error": null
}
```

Repeated DELETE on an already soft-deleted interaction returns the original `deletedAt` timestamp.

**Error Responses**:
| Code | HTTP | When |
|---|---|---|
| `UNAUTHENTICATED` | 401 | No valid session |
| `WORKSPACE_ACCESS_DENIED` | 403 | No active workspace membership |
| `RESOURCE_NOT_FOUND` | 404 | Client or interaction not found, cross-workspace (interaction not yet deleted at first access) |
| `INTERNAL_ERROR` | 500 | Database or server error |

---

## 7. Zod Schemas

Schemas belong in `src/features/clients/schemas.ts`, alongside existing client schemas.

### 7.1 InteractionTypeEnum

```typescript
import { z } from "zod";

export const InteractionTypeEnum = z.enum([
  "phone_call",
  "wechat_message",
  "in_person_meeting",
  "property_viewing",
  "follow_up",
  "negotiation",
  "contract_signing",
  "complaint",
  "other",
]);

export type InteractionType = z.infer<typeof InteractionTypeEnum>;
```

### 7.2 CreateInteractionInputSchema

```typescript
export const CreateInteractionInputSchema = z.object({
  interaction_type: InteractionTypeEnum,
  occurred_at: z.string().refine(
    (val) => !isNaN(Date.parse(val)),
    { message: "发生时间格式无效" }
  ),
  summary: z.string().max(5000, "摘要最多 5000 字").optional().nullable(),
  raw_text: z.string().max(50000, "原始记录最多 50000 字").optional().nullable(),
  next_action: z.string().max(1000, "跟进事项最多 1000 字").optional().nullable(),
  property_id: z.string().uuid("房源 ID 无效").optional().nullable(),
});

export type CreateInteractionInput = z.infer<typeof CreateInteractionInputSchema>;
```

### 7.3 UpdateInteractionInputSchema

All fields optional (partial update). Supports explicit `null` to clear optional text fields.

```typescript
export const UpdateInteractionInputSchema = z.object({
  interaction_type: InteractionTypeEnum.optional(),
  occurred_at: z.string().refine(
    (val) => !isNaN(Date.parse(val)),
    { message: "发生时间格式无效" }
  ).optional(),
  summary: z.string().max(5000, "摘要最多 5000 字").optional().nullable(),
  raw_text: z.string().max(50000, "原始记录最多 50000 字").optional().nullable(),
  next_action: z.string().max(1000, "跟进事项最多 1000 字").optional().nullable(),
  property_id: z.string().uuid("房源 ID 无效").optional().nullable(),
}).refine(
  (d) => Object.keys(d).length > 0,
  { message: "至少需要一个更新字段" }
);

export type UpdateInteractionInput = z.infer<typeof UpdateInteractionInputSchema>;
```

### 7.4 InteractionQuerySchema

```typescript
export const InteractionQuerySchema = z.object({
  type: InteractionTypeEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type InteractionQuery = z.infer<typeof InteractionQuerySchema>;
```

---

## 8. Audit Requirements

Per `api-contract` v1.0 section 1.6 and the architecture rule that all deletions use soft-delete with audit trail, every interaction CUD operation MUST write to `audit_logs`.

### 8.1 Audit Actions

| Action | entity_type | action | before_data | after_data | Severity |
|---|---|---|---|---|---|
| CREATE | `interaction` | `interaction_created` | `null` | `{ interaction_type, summary_truncated, client_id, occurred_at }` | Low |
| UPDATE | `interaction` | `interaction_updated` | `{ changed_field: "old" }` | `{ changed_field: "new" }` | Low |
| DELETE | `interaction` | `interaction_soft_deleted` | `{ deleted_at: null }` | `{ deleted_at: "<timestamp>" }` | Medium |

### 8.2 Audit Redaction Rules

- `raw_text` MUST NOT appear in `before_data` or `after_data` of audit log entries.
- Only record changed fields in the audit snapshot, not the entire row.
- For create: record `interaction_type`, `client_id`, `occurred_at`, and `summary` truncated to 200 characters.
- For update: compute diff -- only include fields that actually changed.
- For delete: record only `deleted_at` transition.

### 8.3 Audit Implementation

Audit writes can be performed in the API route handler directly (matching the client CRUD pattern) or via a SECURITY DEFINER RPC for atomicity. Both are acceptable. The key constraint is that audit must be written before returning the response -- no fire-and-forget audit.

Audit log entries are immutable. Once written, neither the end user nor the API can update or delete them.

---

## 9. RLS Requirements

### 9.1 Required Schema Changes

Before RLS policies can be finalized, the following migration MUST be applied:

```sql
-- Add updated_at and deleted_at columns
alter table public.interactions
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

-- Add updated_at trigger (same pattern as other tables)
create trigger trg_interactions_updated_at
  before update on public.interactions
  for each row execute function private.set_updated_at();
```

### 9.2 Updated RLS Policies

The existing RLS policies in migration `20260801000005` section 16 MUST be updated:

**SELECT** -- add `deleted_at IS NULL` filter:
```sql
drop policy if exists "Workspace members can read interactions" on public.interactions;

create policy "Workspace members can read interactions" on public.interactions
  for select using (
    private.is_workspace_member(workspace_id)
    and deleted_at is null
  );
```

**INSERT** -- unchanged from existing (insert has no `deleted_at` to check):
```sql
-- Existing policy is kept as-is:
-- create policy "Workspace members can create interactions" on public.interactions
--   for insert with check (
--     private.is_workspace_member(workspace_id)
--   );
```

**UPDATE** -- add `deleted_at IS NULL` filter:
```sql
drop policy if exists "Workspace members can update interactions" on public.interactions;

create policy "Workspace members can update interactions" on public.interactions
  for update using (
    private.is_workspace_member(workspace_id)
    and deleted_at is null
  ) with check (
    private.is_workspace_member(workspace_id)
  );
```

**DELETE** -- remove existing policy. Physical DELETE is denied; soft-delete uses UPDATE:
```sql
-- Drop the existing permissive DELETE policy
drop policy if exists "Workspace members can delete interactions" on public.interactions;

-- Optionally, add owner-only physical delete for emergency admin cleanup:
create policy "Owner can physically delete interactions" on public.interactions
  for delete using (
    private.is_workspace_owner(workspace_id)
  );
```

### 9.3 RLS Explanation and Performance Strategy

- All RLS policies use `private.is_workspace_member(workspace_id)` -- a stable, single-layer function that does NOT recursively query protected tables. It is EXPLAIN-able and achieves a single index lookup.
- `deleted_at IS NULL` is a simple column check that uses existing indexes.
- For efficient workspace-scoped, non-deleted listing with sort, the following composite index is recommended:

```sql
create index idx_interactions_workspace_deleted_occurred
  on public.interactions(workspace_id, deleted_at, occurred_at desc);
```

- The existing index `idx_interactions_client_occurred (client_id, occurred_at DESC)` supports the primary query pattern.
- All RLS queries can be EXPLAIN ANALYZEd without recursion or nested policy evaluation.

---

## 10. Error Codes

All error codes follow `api-contract` v1.0 convention, with the established per-endpoint HTTP mappings from `client-contract` v1.0.

| Error Code | HTTP | When |
|---|---|---|
| `UNAUTHENTICATED` | 401 | No valid Supabase Auth session |
| `WORKSPACE_ACCESS_DENIED` | 403 | Authenticated user has no active workspace membership |
| `RESOURCE_NOT_FOUND` | 404 | Client does not exist, is cross-workspace, or is soft-deleted; interaction does not exist, is not linked to the specified client, or is soft-deleted |
| `VALIDATION_FAILED` | 422 | Invalid request body (missing required fields, invalid enum, invalid types, cross-workspace `property_id`, invalid `occurred_at`); invalid query parameters (`page` < 1, `limit` > 50, invalid `type`, invalid `sortOrder`); empty PATCH body |
| `CONFLICT` | 409 | Reserved for concurrent modification detection (e.g., `updated_at` version-stamp mismatch). Not used in Phase 1 but declared to prevent ad-hoc error codes. |
| `INTERNAL_ERROR` | 500 | Unhandled database or server error; all error messages sanitized |

### 10.1 Error Messages (Chinese)

| Error Code | Default Message |
|---|---|
| `UNAUTHENTICATED` | "请先登录" |
| `WORKSPACE_ACCESS_DENIED` | "无权限访问此工作区" |
| `RESOURCE_NOT_FOUND` | "客户或沟通记录不存在" |
| `VALIDATION_FAILED` | "参数校验失败" (details field provides field-level messages) |
| `CONFLICT` | "操作冲突，请重试" |
| `INTERNAL_ERROR` | "服务器内部错误，请稍后重试" |

---

## 11. Attachments Policy

**Attachments are NOT supported in this slice (Deferred).**

Interactions do not accept file uploads (images, audio, video, documents). The `raw_text` field can contain text references or descriptions of external media, but binary storage is deferred to a future phase.

When attachment support is added, it will use a separate `interaction_attachments` child table with Supabase Storage and RLS-gated access. This contract will be amended via ADR at that time.

---

## 12. Implementation Notes

### 12.1 Client Validation Pattern

Every interaction endpoint MUST validate `clientId` before proceeding:

```typescript
const { data: clientCheck, error: clientErr } = await supabase
  .from("clients")
  .select("id, workspace_id")
  .eq("id", clientId)
  .eq("workspace_id", workspaceId)
  .is("deleted_at", null)
  .single();

if (clientErr || !clientCheck) {
  return NextResponse.json(
    { data: null, error: { code: "RESOURCE_NOT_FOUND", message: "客户不存在或已删除" } },
    { status: 404 }
  );
}
```

### 12.2 Property Validation Pattern

```typescript
if (body.property_id) {
  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("id", body.property_id)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .single();

  if (!property) {
    return NextResponse.json(
      { data: null, error: { code: "VALIDATION_FAILED", message: "关联房源不存在或无权访问" } },
      { status: 422 }
    );
  }
}
```

### 12.3 Soft-Delete Implementation (Idempotent)

```typescript
const { data: existing, error: fetchErr } = await supabase
  .from("interactions")
  .select("id, deleted_at")
  .eq("id", interactionId)
  .eq("workspace_id", workspaceId)
  .eq("client_id", clientId)
  .single();

if (fetchErr || !existing) {
  return NextResponse.json(
    { data: null, error: { code: "RESOURCE_NOT_FOUND", message: "沟通记录不存在" } },
    { status: 404 }
  );
}

// Idempotent: already soft-deleted
if (existing.deleted_at) {
  return NextResponse.json({
    data: { deleted: true, deletedAt: existing.deleted_at },
    error: null,
  });
}

const now = new Date().toISOString();
const { error: updateErr } = await supabase
  .from("interactions")
  .update({ deleted_at: now })
  .eq("id", interactionId)
  .is("deleted_at", null);

// ... write audit_logs ...
```

### 12.4 List Column Selection

Define a column constant to prevent accidentally including `raw_text`:

```typescript
const INTERACTION_LIST_COLS =
  "id,workspace_id,client_id,property_id,interaction_type,summary,next_action,occurred_at,created_by,created_at,updated_at,deleted_at";
```

### 12.5 Sort Implementation

Always use compound sort: `occurred_at` primary, `created_at` tie-breaker:

```typescript
const ascending = sortOrder === "asc";
const query = supabase
  .from("interactions")
  .select(INTERACTION_LIST_COLS, { count: "exact" })
  .eq("workspace_id", workspaceId)
  .eq("client_id", clientId)
  .is("deleted_at", null)
  .order("occurred_at", { ascending })
  .order("created_at", { ascending })
  .range((page - 1) * limit, page * limit - 1);
```

### 12.6 Workspace ID Derivation

Follow the same pattern as `src/app/api/properties/route.ts` and `src/app/api/clients/route.ts`:

```typescript
const { data: member } = await supabase
  .from("workspace_members")
  .select("workspace_id")
  .eq("user_id", user.id)
  .eq("status", "active")
  .limit(1)
  .single();

if (!member) {
  return NextResponse.json(
    { data: null, error: { code: "WORKSPACE_ACCESS_DENIED", message: "无权限访问此工作区" } },
    { status: 403 }
  );
}

const workspaceId = member.workspace_id;
```

### 12.7 Audit Log Writing

For create (in API route handler):
```typescript
await supabase.from("audit_logs").insert({
  workspace_id: workspaceId,
  actor_user_id: user.id,
  entity_type: "interaction",
  entity_id: result.id,
  action: "interaction_created",
  before_data: null,
  after_data: {
    interaction_type: body.interaction_type,
    summary: (body.summary || "").substring(0, 200),
    client_id: clientId,
    occurred_at: body.occurred_at,
  },
});
```

For update: compute a diff of changed fields; include only changed fields in `before_data` and `after_data`. Never include `raw_text`.

### 12.8 Security Headers

Apply standard CORS and security headers as defined in `api-contract` v1.0 section 1.2.

---

## 13. UI Specification

### 13.1 Timeline on Client Detail Page

- Placed as a section on `/clients/[clientId]` page.
- Mobile-first card layout; each card shows: interaction type badge/icon, summary preview, occurred_at time.
- Cards ordered by `occurred_at DESC` (most recent first).
- "新增沟通记录" button opens create Drawer (mobile) / Dialog (desktop).

### 13.2 Create/Edit Form

- ResponsiveOverlay wrapping the form (Drawer on mobile, Dialog on desktop).
- Fields: `interaction_type` (select/dropdown), `occurred_at` (datetime input), `summary` (text), `raw_text` (textarea), `next_action` (text), `property_id` (optional).
- Required fields marked with asterisk: `interaction_type`, `occurred_at`.
- Submit: loading state with disabled button.
- Success: close overlay, refresh timeline.
- Error: inline error message.

### 13.3 Interaction Detail View

- Tapping a timeline card opens detail (Drawer or inline expand).
- Shows all fields including `raw_text`, `next_action`, property reference.
- Edit and Delete buttons in detail view.

### 13.4 Type Filter

- Horizontal scrollable chip/button bar above timeline.
- Options: "全部" + each `interaction_type` with Chinese label.
- Active filter visually highlighted.

### 13.5 Delete Confirmation

- Alert dialog: "确定要删除这条沟通记录吗？删除后不可见但保留审计记录。"
- Confirm/Cancel buttons.

### 13.6 State Coverage

| State | UI |
|---|---|
| **Loading** | Skeleton cards (3-4 placeholder cards) |
| **Empty** | "暂无沟通记录" with illustration; "新增沟通记录" CTA |
| **Error** | Error message with retry button |
| **Submitting** | Button disabled with spinner; overlay prevents double-click |

### 13.7 Mobile Requirements

- 375px width: no horizontal overflow.
- Touch targets: minimum 44px.
- Cards: full width, safe area padding.
- Drawer: `max-height: 92dvh`, internal scroll.

---

## 14. Testing Requirements

Per `.claude/rules/testing.md`, tests must cover success, unauthenticated, unauthorized, edge cases, and concurrency.

### 14.1 Unit Tests (Zod Schemas)

1. `CreateInteractionInputSchema` accepts valid input with all fields present
2. `CreateInteractionInputSchema` rejects input missing `interaction_type`
3. `CreateInteractionInputSchema` rejects input missing `occurred_at`
4. `CreateInteractionInputSchema` rejects invalid `interaction_type` enum values
5. `CreateInteractionInputSchema` rejects malformed `occurred_at` (not ISO-8601)
6. `CreateInteractionInputSchema` rejects `summary` exceeding 5000 characters
7. `CreateInteractionInputSchema` rejects `raw_text` exceeding 50000 characters
8. `CreateInteractionInputSchema` rejects `next_action` exceeding 1000 characters
9. `CreateInteractionInputSchema` accepts `property_id` as null or valid UUID
10. `UpdateInteractionInputSchema` accepts empty body (all fields optional) -- actually rejects per `.refine()` requiring at least one field; test both: empty body = 422, partial body = OK
11. `UpdateInteractionInputSchema` accepts partial fields
12. `UpdateInteractionInputSchema` accepts `null` to clear optional text fields
13. `InteractionQuerySchema` enforces `limit` max 50 (51 = 422)
14. `InteractionQuerySchema` enforces `page` min 1 (0 = 422)
15. `InteractionQuerySchema` rejects invalid `sortOrder` values
16. `InteractionQuerySchema` rejects invalid `type` enum value

### 14.2 Integration Tests (Route Handlers)

17. POST creates interaction successfully -- returns 201 with full detail
18. POST fails 422 when missing `interaction_type`
19. POST fails 422 when missing `occurred_at`
20. POST fails 404 when client not found
21. POST fails 404 when client belongs to another workspace
22. POST fails 404 when client is soft-deleted
23. POST fails 422 when `property_id` belongs to another workspace
24. POST fails 422 when `property_id` is soft-deleted
25. POST writes to `audit_logs` (entity_type=interaction, action=interaction_created)
26. GET list returns interactions sorted `occurred_at DESC`, then `created_at DESC`
27. GET list with `type` filter returns only matching interaction_type
28. GET list with `sortOrder=asc` returns oldest first
29. GET list enforces `limit` max 50 (51 returns 422)
30. GET list excludes `raw_text` from response
31. GET list paginates correctly (page 1 vs page 2)
32. GET list returns empty array + total=0 when no interactions
33. GET list excludes soft-deleted interactions
34. GET detail returns interaction with `raw_text`
35. GET detail fails 404 when interaction belongs to different client
36. GET detail fails 404 when interaction is soft-deleted
37. PATCH updates interaction and returns 200
38. PATCH updates only the provided fields (partial update verify)
39. PATCH fails 404 when interaction not found
40. PATCH fails 422 when `property_id` is cross-workspace
41. PATCH clears a field when explicit `null` is sent
42. PATCH writes diff to `audit_logs`
43. DELETE soft-deletes -- returns `{ deleted: true, deletedAt: "..." }`
44. DELETE is idempotent -- second call returns original timestamp, not updated
45. DELETE fails 404 when interaction not found
46. DELETE writes to `audit_logs`
47. All endpoints return 401 when unauthenticated
48. All endpoints return 403 when no workspace membership
49. Error responses sanitized (no raw DB errors in `message`)

### 14.3 RLS Tests (pgTAP)

New file: `supabase/tests/15_interactions_rls_test.sql`

50. Schema: table exists, columns exist (including `updated_at`, `deleted_at`)
51. Trigger: `trg_interactions_updated_at` exists and fires
52. SELECT: workspace member reads only non-deleted interactions in their workspace
53. SELECT: soft-deleted interactions excluded
54. INSERT: workspace member creates interaction
55. INSERT: denied for cross-workspace (must fail at API level; RLS alone cannot validate `client_id` workspace consistency, but `workspace_id` is server-derived)
56. UPDATE: workspace member updates non-deleted interaction
57. UPDATE: denied on soft-deleted interaction (deleted_at IS NOT NULL)
58. DELETE: physical delete denied for members; only owner can physical-delete
59. Anon: all operations denied
60. Ordering: `occurred_at DESC` + `created_at DESC` via index
61. Cross-workspace isolation: member of workspace A cannot see workspace B's interactions

### 14.4 E2E Tests

New file: `e2e/client-interactions.spec.ts`

62. Empty timeline (no interactions yet) -- shows empty state with CTA
63. Create interaction -- appears in timeline immediately
64. Refresh -- interaction persists
65. Edit interaction -- updated in timeline
66. Type badge/icon displayed correctly for each type
67. Type filter -- selecting type filters timeline correctly
68. Time ordering -- most recent first by default
69. Soft delete -- removed from timeline after confirmation
70. Deleted interaction not visible after refresh
71. Cross-workspace access denied
72. Unauthenticated access denied
73. Mobile layout at 375px
74. Form validation errors displayed inline
75. Double submit creates only one record + one audit

---

## 15. File Ownership

| Path | Owner |
|---|---|
| `docs/contracts/interaction-contract.md` | solution-architect |
| `src/features/clients/schemas.ts` (interaction schemas) | property-crm-engineer |
| `src/app/api/clients/[clientId]/interactions/route.ts` | property-crm-engineer |
| `src/app/api/clients/[clientId]/interactions/[interactionId]/route.ts` | property-crm-engineer |
| `supabase/migrations/20260801000005_phase2_business_tables.sql` (interactions section) | data-security-engineer (already deployed) |
| `supabase/migrations/*_interaction_schema_update.sql` (new migration for `updated_at`, `deleted_at`, trigger, RLS updates, index) | data-security-engineer |
| `supabase/tests/15_interactions_rls_test.sql` | test-engineer |
| `src/app/api/clients/[id]/interactions/__tests__/route.test.ts` | test-engineer |
| `e2e/client-interactions.spec.ts` | test-engineer |

---

## 16. Change Control

This contract is FROZEN. Changes to field definitions, `interaction_type` enum values, API endpoint signatures, error codes, permissions, sorting rules, or pagination limits MUST:

1. Submit an ADR (`docs/decisions/ADR-XXX-interaction-change.md`).
2. Obtain approval from solution-architect and the main Agent.
3. Update this document version and changelog.
4. Notify property-crm-engineer and data-security-engineer.

Inline clarifications (typos, formatting, non-semantic corrections) do not require an ADR but should be documented in the contract's git history.
