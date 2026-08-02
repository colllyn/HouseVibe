# HouseVibe Client Contract (P2-CLIENT-001)

| 属性 | 值 |
|---|---|
| 文档名称 | client-contract |
| 版本 | 1.0 |
| 状态 | FROZEN |
| Owner | solution-architect |
| 依赖 | PRD v1.3, domain-model v1.0, api-contract v1.0, rls-contract v1.0, migration 20260801000005 |
| 最后更新 | 2026-08-02 |

---

## 1. Scope

This contract defines the frozen API, Zod schema, permissions, stage lifecycle, audit, and error-code boundary for the Client CRUD slice (P2-CLIENT-001). The `clients` table, `client_stage` enum, and RLS policies already exist in migration `20260801000005_phase2_business_tables.sql` -- this contract extends, does not redefine, that base.

---

## 2. Client Fields

All fields are from the existing `public.clients` table (domain-model §2.7). Fields derived server-side (`workspace_id`, `created_by`, `id`, `created_at`, `updated_at`) are never accepted from the client.

### 2.1 Required Fields

| Field | Type | Notes |
|---|---|---|
| `name` | TEXT | Client name or alias. Minimum 1 character. |

All other fields are optional at creation time. Stage defaults to `new`.

### 2.2 Optional Fields

| Field | Type | Default | Notes |
|---|---|---|---|
| `phone` | TEXT | NULL | **SENSITIVE HIGH** -- excluded from list responses |
| `wechat` | TEXT | NULL | **SENSITIVE HIGH** -- excluded from list responses |
| `source_platform` | TEXT | NULL | e.g. `xiaohongshu`, `douyin`, `wechat`, `referral`, `walk_in` |
| `source_content_id` | UUID | NULL | Loose reference to content_projects (no FK constraint) |
| `first_property_id` | UUID | NULL | FK to `properties(id)` ON DELETE SET NULL |
| `budget_min` | INTEGER | NULL | Budget lower bound (RMB) |
| `budget_max` | INTEGER | NULL | Budget upper bound (RMB) |
| `preferred_districts` | TEXT[] | `'{}'` | Preferred districts |
| `preferred_communities` | TEXT[] | `'{}'` | Preferred communities |
| `bedrooms` | INTEGER | NULL | Desired bedroom count |
| `rental_type` | TEXT | NULL | `whole_unit` or `shared` |
| `available_from` | DATE | NULL | Desired move-in date |
| `minimum_lease_months` | INTEGER | NULL | Minimum lease term (months) |
| `pets_required` | BOOLEAN | NULL | Requires pet-friendly property |
| `cooking_required` | BOOLEAN | NULL | Requires cooking-allowed property |
| `commute_destination` | TEXT | NULL | Commute destination (e.g. office address) |
| `hard_requirements` | JSONB | `'[]'` | Hard requirements array |
| `soft_preferences` | JSONB | `'[]'` | Soft preferences array |
| `deal_breakers` | TEXT[] | `'{}'` | Non-negotiable bottom lines |
| `stage` | client_stage | `'new'` | Current stage (see §3) |
| `raw_input_text` | TEXT | NULL | **MEDIUM** -- raw input source text |
| `next_follow_up_at` | TIMESTAMPTZ | NULL | Next follow-up due time |
| `last_interaction_at` | TIMESTAMPTZ | NULL | Last interaction timestamp |
| `requestId` | UUID | NULL | (create-only) AI extraction request ID for diff logging |

### 2.3 Server-Derived Fields (Never from Client)

| Field | Source |
|---|---|
| `id` | gen_random_uuid() |
| `workspace_id` | Derived from `auth.uid()` via `workspace_members` lookup |
| `created_by` | `auth.uid()` |
| `created_at` | `now()` |
| `updated_at` | `now()` (trigger + explicit on update) |
| `deleted_at` | Set on soft delete, always `NULL` for active records |

### 2.4 List Response Column Set

The list endpoint MUST return these columns (all non-sensitive, non-verbose):

```
id, workspace_id, created_by, name, source_platform, source_content_id,
first_property_id, budget_min, budget_max, preferred_districts, preferred_communities,
bedrooms, rental_type, available_from, minimum_lease_months, pets_required,
cooking_required, commute_destination, stage, next_follow_up_at, last_interaction_at,
created_at, updated_at, deleted_at
```

**Excluded from list**: `phone`, `wechat` (HIGH sensitivity), `hard_requirements`, `soft_preferences`, `deal_breakers`, `raw_input_text` (verbose/detail-only).

The detail endpoint returns all columns including `phone`, `wechat`, and all detail-only fields.

---

## 3. Client Stage Lifecycle

### 3.1 Enum Values

The `client_stage` PostgreSQL enum already exists with these values (migration `20260801000005`):

| # | Value | Description |
|---|---|---|
| 1 | `new` | Newly created, needs initial qualification |
| 2 | `qualified` | Requirements confirmed, ready to send properties |
| 3 | `properties_sent` | Properties have been sent to client |
| 4 | `viewing_scheduled` | Property viewing appointment confirmed |
| 5 | `viewed` | Client has completed viewing(s) |
| 6 | `considering` | Client is evaluating options |
| 7 | `closed_won` | Deal closed (terminal active state) |
| 8 | `paused` | Follow-up temporarily paused |
| 9 | `lost` | Deal lost (terminal inactive state) |
| 10 | `deleted` | Soft-deleted (terminal inactive state) |

### 3.2 Stage Transition Rules

Per domain-model §3.2. The server MUST validate stage transitions and reject invalid ones with `VALIDATION_FAILED`.

```
new ──────> qualified ──────> properties_sent ──────> viewing_scheduled
                                                      │
  ┌───────────────────────────────────────────────────┘
  ▼
viewed ──────> considering ──────> closed_won
  │                │
  ├──> paused      ├──> paused
  └──> lost        └──> lost

any except deleted ──────> deleted
```

**Allowed transitions table**:

| From | To | Who | Precondition | Side Effect | Audit |
|---|---|---|---|---|---|
| `new` | `qualified` | Owner/Member | Client requirements sufficiently filled | None | Record stage change |
| `qualified` | `properties_sent` | Owner/Member | At least 1 property sent | Create match record | Record stage change |
| `properties_sent` | `viewing_scheduled` | Owner/Member | Viewing time set | Create task | Record stage change |
| `viewing_scheduled` | `viewed` | Owner/Member | Viewing completed | Update interaction | Record stage change |
| `viewed` | `considering` | Owner/Member | None | None | Record stage change |
| `considering` | `considering` | Owner/Member | Self-loop (re-evaluation) | None | Record stage change |
| `viewed` / `considering` / `qualified` | `paused` | Owner/Member | Pause reason required | Cancel incomplete tasks | Record stage change |
| `viewed` / `considering` / `qualified` | `lost` | Owner/Member | Loss reason required | Cancel incomplete tasks | Record stage change |
| `considered` / `qualified` / `properties_sent` / `viewing_scheduled` / `viewed` / `considering` / `paused` / `lost` / `new` | `closed_won` | Owner/Member | Deal confirmed | May update property status | Record stage change + deal event |
| Any except `closed_won` and `deleted` | `deleted` | Workspace Owner | None (soft-delete) | Sets `deleted_at`; excluded from default lists | MUST audit |

**Invalid transitions** (server MUST reject with `VALIDATION_FAILED`):
- `closed_won` or `deleted` to any other stage
- Skipping stages (e.g. `new` directly to `viewed`)
- `paused` or `lost` to `new`

**Paused → resume**: Change to `qualified` or `considering` (whichever was the most recent active stage before pausing).

### 3.3 Stage Transition Enforcement

1. Stage is updated via `PATCH /api/clients/[id]` with `stage` in the body.
2. The server MUST validate that the transition is in the allowed set.
3. Invalid transitions return `VALIDATION_FAILED` with the message specifying the invalid jump.
4. Transitions that require preconditions (e.g., `properties_sent → viewing_scheduled` needing a viewing time) are checked in the application layer; the API layer validates stage adjacency.
5. All stage changes MUST be written to `audit_logs` (entity_type = `client`, action = `stage_change`).

---

## 4. API Contract

All endpoints follow `api-contract` v1.0 conventions: cookie-based Supabase Auth, unified error envelope `{ data, error: { code, message, details? } }`, CORS headers.

### 4.1 GET /api/clients

List clients for the authenticated user's workspace.

| Attribute | Value |
|---|---|
| Method | GET |
| Auth | Required |
| Workspace | Server-derived from `workspace_members`; never from client |

**Query Parameters**:

| Parameter | Type | Default | Description |
|---|---|---|---|
| `stage` | client_stage | - | Filter by stage |
| `search` | string | - | Cross-field text search (name, preferred_districts, preferred_communities, commute_destination) |
| `minBudget` | integer | - | Minimum budget (RMB) |
| `maxBudget` | integer | - | Maximum budget (RMB) |
| `bedrooms` | integer | - | Desired bedrooms |
| `nextFollowUpBefore` | ISO date | - | Follow-up due before this timestamp |
| `nextFollowUpAfter` | ISO date | - | Follow-up due after this timestamp |
| `page` | integer | 1 | Page number (1-indexed) |
| `limit` | integer | 20 | Page size (max 100) |
| `sortBy` | string | `updated_at` | Sort field |
| `sortOrder` | string | `desc` | `asc` or `desc` |

**Valid `sortBy` values**: `updated_at` (default), `created_at`, `next_follow_up_at`, `last_interaction_at`, `budget_max`, `name`, `stage`

**Success Response** (200):
```json
{
  "data": {
    "clients": [
      {
        "id": "uuid",
        "workspace_id": "uuid",
        "created_by": "uuid",
        "name": "张三",
        "source_platform": "xiaohongshu",
        "source_content_id": null,
        "first_property_id": null,
        "budget_min": 3000,
        "budget_max": 4000,
        "preferred_districts": ["天河区", "海珠区"],
        "preferred_communities": [],
        "bedrooms": 1,
        "rental_type": "whole_unit",
        "available_from": "2026-09-01",
        "minimum_lease_months": 12,
        "pets_required": true,
        "cooking_required": true,
        "commute_destination": "珠江新城",
        "stage": "new",
        "next_follow_up_at": "2026-08-03T10:00:00Z",
        "last_interaction_at": "2026-08-01T14:30:00Z",
        "created_at": "2026-08-01T12:00:00Z",
        "updated_at": "2026-08-01T12:00:00Z",
        "deleted_at": null
      }
    ],
    "total": 42,
    "page": 1,
    "limit": 20
  },
  "error": null
}
```

**Privacy**: `phone` and `wechat` MUST NOT appear in list responses. `hard_requirements`, `soft_preferences`, `deal_breakers`, `raw_input_text` are also excluded from list to keep payloads compact.

**Mandatory Filters** (server-enforced):
- `workspace_id` = derived from authenticated user
- `deleted_at IS NULL`

**Error Responses**:
- `UNAUTHENTICATED` (401): Not logged in
- `WORKSPACE_ACCESS_DENIED` (403): No active workspace membership
- `VALIDATION_FAILED` (422): Invalid query parameters
- `INTERNAL_ERROR` (500): Database or server error

---

### 4.2 POST /api/clients

Create a new client.

| Attribute | Value |
|---|---|
| Method | POST |
| Auth | Required |
| Request Body | JSON (Zod: `CreateClientInputSchema`) |

**Request Body**:

```json
{
  "name": "张三",
  "phone": "13800138000",
  "wechat": "zhangsan_wx",
  "source_platform": "xiaohongshu",
  "source_content_id": "uuid-or-null",
  "first_property_id": "uuid-or-null",
  "budget_min": 3000,
  "budget_max": 4000,
  "preferred_districts": ["天河区"],
  "preferred_communities": ["XX花园"],
  "bedrooms": 1,
  "rental_type": "whole_unit",
  "available_from": "2026-09-01",
  "minimum_lease_months": 12,
  "pets_required": true,
  "cooking_required": true,
  "commute_destination": "珠江新城",
  "hard_requirements": [{"field": "pets", "value": "must_allow_cats"}],
  "soft_preferences": [{"field": "orientation", "value": "south"}],
  "deal_breakers": ["no_basement"],
  "stage": "new",
  "raw_input_text": "原始聊天记录...",
  "next_follow_up_at": "2026-08-03T10:00:00Z",
  "requestId": "uuid"
}
```

Only `name` is required. All other fields are optional with sensible defaults.

**Success Response** (201):
```json
{
  "data": {
    "id": "uuid",
    "name": "张三",
    "stage": "new",
    "created_at": "2026-08-02T10:00:00Z",
    "workspace_id": "uuid",
    "created_by": "uuid"
  },
  "error": null
}
```

**Server-Side Processing**:
1. Authenticate user.
2. Derive `workspace_id` from `workspace_members` lookup.
3. Validate body against `CreateClientInputSchema`.
4. Validate that `first_property_id` (if provided) belongs to the same workspace and is not deleted.
5. If `requestId` is present and non-null, record the raw body for later AI diff computation (deferred to AI extraction flow -- client CRUD does not compute diffs; that is the responsibility of the AI save path).
6. Insert record with `workspace_id`, `created_by`, `id` all server-derived.
7. Default `stage` to `new` if not provided.
8. Return created client.

**Error Responses**:
- `UNAUTHENTICATED` (401)
- `WORKSPACE_ACCESS_DENIED` (403)
- `VALIDATION_FAILED` (422): Missing `name`, invalid types, cross-workspace `first_property_id`, invalid stage
- `INTERNAL_ERROR` (500)

---

### 4.3 GET /api/clients/[id]

Get full client detail.

| Attribute | Value |
|---|---|
| Method | GET |
| Auth | Required |
| Path Param | `id` (UUID) -- client ID |

**Success Response** (200):
Returns all client columns including `phone`, `wechat`, `hard_requirements`, `soft_preferences`, `deal_breakers`, `raw_input_text`.

```json
{
  "data": {
    "id": "uuid",
    "workspace_id": "uuid",
    "created_by": "uuid",
    "name": "张三",
    "phone": "13800138000",
    "wechat": "zhangsan_wx",
    "source_platform": "xiaohongshu",
    "source_content_id": null,
    "first_property_id": null,
    "budget_min": 3000,
    "budget_max": 4000,
    "preferred_districts": ["天河区"],
    "preferred_communities": ["XX花园"],
    "bedrooms": 1,
    "rental_type": "whole_unit",
    "available_from": "2026-09-01",
    "minimum_lease_months": 12,
    "pets_required": true,
    "cooking_required": true,
    "commute_destination": "珠江新城",
    "hard_requirements": [{"field": "pets", "value": "must_allow_cats"}],
    "soft_preferences": [{"field": "orientation", "value": "south"}],
    "deal_breakers": ["no_basement"],
    "stage": "qualified",
    "raw_input_text": "原始聊天记录...",
    "next_follow_up_at": "2026-08-03T10:00:00Z",
    "last_interaction_at": "2026-08-01T14:30:00Z",
    "created_at": "2026-08-01T12:00:00Z",
    "updated_at": "2026-08-02T09:00:00Z",
    "deleted_at": null
  },
  "error": null
}
```

**Mandatory Filters** (server-enforced):
- `id` = path param
- `workspace_id` = derived from authenticated user
- `deleted_at IS NULL`

**Error Responses**:
- `UNAUTHENTICATED` (401)
- `WORKSPACE_ACCESS_DENIED` (403)
- `RESOURCE_NOT_FOUND` (404): Client does not exist, is in another workspace, or is soft-deleted
- `INTERNAL_ERROR` (500)

---

### 4.4 PATCH /api/clients/[id]

Update client fields, including stage changes.

| Attribute | Value |
|---|---|
| Method | PATCH |
| Auth | Required |
| Path Param | `id` (UUID) |
| Request Body | JSON (Zod: `UpdateClientInputSchema`) -- partial update |

**Request Body** (all fields optional):

```json
{
  "name": "张三丰",
  "phone": "13900139000",
  "stage": "qualified",
  "next_follow_up_at": "2026-08-05T10:00:00Z",
  "budget_max": 4500
}
```

**Server-Side Processing**:
1. Authenticate user and derive `workspace_id`.
2. Verify client belongs to current workspace and is not soft-deleted.
3. Validate body against `UpdateClientInputSchema`.
4. If `stage` is present, validate the transition against the allowed rules (see §3.2).
5. If `first_property_id` is present, validate it belongs to the same workspace and is not deleted.
6. Set `updated_at = now()`.
7. Perform the update.
8. If stage changed, write to `audit_logs` (entity_type = `client`, action = `stage_change`, before_data/after_data with stage values).
9. Return updated client (full detail).

**Special handling**:
- `paused` stage transition: client SHOULD provide a `paused_reason` in a dedicated field or we record it implicitly. (Phase 1 MVP: the reason can be placed in `soft_preferences` or `hard_requirements` as a structured note. Phase 2+ may add a dedicated `stage_note` field.)
- `lost` stage transition: same as paused -- reason expected.
- `closed_won` transition: triggers creation of a deal event. Phase 1 MVP: just the stage change audit. Phase 2+: deal tracking.

**Error Responses**:
- `UNAUTHENTICATED` (401)
- `WORKSPACE_ACCESS_DENIED` (403)
- `RESOURCE_NOT_FOUND` (404): Client not in workspace or soft-deleted
- `VALIDATION_FAILED` (422): Invalid fields, invalid stage transition, cross-workspace `first_property_id`
- `INTERNAL_ERROR` (500)

---

### 4.5 DELETE /api/clients/[id]

Soft-delete a client.

| Attribute | Value |
|---|---|
| Method | DELETE |
| Auth | Required |
| Path Param | `id` (UUID) |
| Permission | Workspace Owner only (per rls-contract §4.7) |

**Processing**:
1. Authenticate user and derive `workspace_id`.
2. Verify user is workspace owner.
3. Verify client belongs to workspace, is not deleted, and is not `closed_won`.
4. Set `deleted_at = now()`, `updated_at = now()`.
5. Write to `audit_logs` (entity_type = `client`, action = `soft_delete`).

**Constraint**: Cannot soft-delete a client in `closed_won` stage. Returns `VALIDATION_FAILED`.

**Success Response** (200):
```json
{
  "data": { "deleted": true, "deletedAt": "2026-08-02T10:30:00Z" },
  "error": null
}
```

**Error Responses**:
- `UNAUTHENTICATED` (401)
- `FORBIDDEN` (403): Not workspace owner
- `WORKSPACE_ACCESS_DENIED` (403)
- `RESOURCE_NOT_FOUND` (404)
- `VALIDATION_FAILED` (422): Client is `closed_won`
- `INTERNAL_ERROR` (500)

---

## 5. Permissions

### 5.1 Role Matrix

Per rls-contract §4.7 (clients table RLS already deployed in migration 20260801000005):

| Operation | Owner | Member | System Admin | External Collaborator |
|---|---|---|---|---|
| SELECT (list + detail) | Yes | Yes | No | No |
| INSERT | Yes | Yes | No | No |
| UPDATE | Yes | Yes | No | No |
| DELETE (soft) | Yes | No | No | No |

### 5.2 Cross-Workspace Protection

- `workspace_id` on all queries is server-derived from `auth.uid()` via `workspace_members` lookup. The client can never supply or override `workspace_id`.
- RLS policies enforce `is_workspace_member(workspace_id)` at the database level.
- Client `phone` and `wechat` are workspace-internal only; they MUST NOT leak via shared views, shared-property APIs, or cross-workspace collaboration APIs.

### 5.3 Action Restrictions

| Action | Restriction |
|---|---|
| View another workspace's clients | Denied (RLS + API) |
| Create client in another workspace | Denied (server derives workspace_id) |
| Set `first_property_id` to cross-workspace property | Denied (server validates property belongs to same workspace) |
| Delete a `closed_won` client | Denied (API validation) |
| Skip stages in transition | Denied (API validation) |
| Non-owner soft-delete | Denied (RLS owner-only DELETE policy) |

---

## 6. Audit Requirements

Per domain-model §3.2 and api-contract §1.6, the following client actions MUST write to `audit_logs`:

| Action | entity_type | action | before_data | after_data | Severity |
|---|---|---|---|---|---|
| Stage change | `client` | `stage_change` | `{ stage: "old_value" }` | `{ stage: "new_value" }` | Medium |
| Soft delete | `client` | `soft_delete` | `{ deleted_at: null }` | `{ deleted_at: "now" }` | High |
| Close won (deal) | `client` | `deal_closed` | `{ stage: "old" }` | `{ stage: "closed_won" }` | High |

**Privacy**: `before_data` and `after_data` in audit logs MUST be redacted -- do not record `phone`, `wechat`, or `raw_input_text` in audit log snapshots. Only record the changed fields.

---

## 7. Zod Schemas

Schemas belong in `src/features/clients/schemas.ts`. Follow the existing patterns from `src/features/properties/schemas.ts`.

### 7.1 ClientStageEnum

```typescript
import { z } from "zod";

export const ClientStageEnum = z.enum([
  "new",
  "qualified",
  "properties_sent",
  "viewing_scheduled",
  "viewed",
  "considering",
  "closed_won",
  "paused",
  "lost",
  "deleted",
]);

export type ClientStage = z.infer<typeof ClientStageEnum>;
```

### 7.2 CreateClientInputSchema

```typescript
export const CreateClientInputSchema = z.object({
  // Required
  name: z.string().min(1, "姓名不能为空").max(100, "姓名最多 100 字"),

  // Optional - sensitive
  phone: z.string().max(30, "电话格式无效").optional(),
  wechat: z.string().max(100, "微信格式无效").optional(),

  // Optional - source
  source_platform: z.string().max(50).optional(),
  source_content_id: z.string().uuid("来源内容 ID 无效").optional(),
  first_property_id: z.string().uuid("房源 ID 无效").optional(),

  // Optional - budget & requirements
  budget_min: z.coerce.number().int().min(0).optional(),
  budget_max: z.coerce.number().int().min(0).optional(),
  preferred_districts: z.array(z.string()).optional(),
  preferred_communities: z.array(z.string()).optional(),
  bedrooms: z.coerce.number().int().min(0).max(20).optional(),
  rental_type: z.enum(["whole_unit", "shared"]).optional(),
  available_from: z.string().optional(),
  minimum_lease_months: z.coerce.number().int().min(0).optional(),
  pets_required: z.coerce.boolean().optional(),
  cooking_required: z.coerce.boolean().optional(),
  commute_destination: z.string().max(200).optional(),

  // Optional - structured requirements (JSON arrays)
  hard_requirements: z.array(z.record(z.unknown())).optional(),
  soft_preferences: z.array(z.record(z.unknown())).optional(),
  deal_breakers: z.array(z.string()).optional(),

  // Optional - lifecycle
  stage: ClientStageEnum.default("new"),
  raw_input_text: z.string().max(10000).optional(),
  next_follow_up_at: z.string().optional(),
  last_interaction_at: z.string().optional(),

  // Optional - AI tracing
  requestId: z.string().uuid("请求 ID 无效").optional(),
}).refine(
  (d) => d.budget_min == null || d.budget_max == null || d.budget_min <= d.budget_max,
  { message: "最低预算不能大于最高预算", path: ["budget_min"] }
);

export type CreateClientInput = z.infer<typeof CreateClientInputSchema>;
```

### 7.3 UpdateClientInputSchema

All fields optional (partial update). Uses the same empty-to-undefined preprocess helpers as `UpdatePropertyInputSchema`.

```typescript
// Reuse helper patterns from properties/schemas.ts:
// optionalNumber(), optionalBoolean()

export const UpdateClientInputSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  phone: z.string().max(30).optional(),
  wechat: z.string().max(100).optional(),
  source_platform: z.string().max(50).optional(),
  source_content_id: z.string().uuid().optional().nullable(),
  first_property_id: z.string().uuid().optional().nullable(),
  budget_min: optionalNumber(z.coerce.number().int().min(0)),
  budget_max: optionalNumber(z.coerce.number().int().min(0)),
  preferred_districts: z.array(z.string()).optional(),
  preferred_communities: z.array(z.string()).optional(),
  bedrooms: optionalNumber(z.coerce.number().int().min(0).max(20)),
  rental_type: z.enum(["whole_unit", "shared"]).optional(),
  available_from: z.string().optional().nullable(),
  minimum_lease_months: optionalNumber(z.coerce.number().int().min(0)),
  pets_required: optionalBoolean(),
  cooking_required: optionalBoolean(),
  commute_destination: z.string().max(200).optional().nullable(),
  hard_requirements: z.array(z.record(z.unknown())).optional(),
  soft_preferences: z.array(z.record(z.unknown())).optional(),
  deal_breakers: z.array(z.string()).optional(),
  stage: ClientStageEnum.optional(),
  raw_input_text: z.string().max(10000).optional(),
  next_follow_up_at: z.string().optional().nullable(),
  last_interaction_at: z.string().optional().nullable(),
}).refine(
  (d) => d.budget_min == null || d.budget_max == null || d.budget_min == null || d.budget_max == null || d.budget_min <= d.budget_max,
  { message: "最低预算不能大于最高预算", path: ["budget_min"] }
);

export type UpdateClientInput = z.infer<typeof UpdateClientInputSchema>;
```

### 7.4 ClientQuerySchema

```typescript
export const ClientSortByEnum = z.enum([
  "updated_at",
  "created_at",
  "next_follow_up_at",
  "last_interaction_at",
  "budget_max",
  "name",
  "stage",
]);

export type ClientSortBy = z.infer<typeof ClientSortByEnum>;

export const ClientQuerySchema = z.object({
  stage: ClientStageEnum.optional(),
  search: z.string().min(1).max(200).optional(),
  minBudget: z.coerce.number().int().min(0).optional(),
  maxBudget: z.coerce.number().int().min(0).optional(),
  bedrooms: z.coerce.number().int().min(0).max(20).optional(),
  nextFollowUpBefore: z.string().optional(),
  nextFollowUpAfter: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: ClientSortByEnum.default("updated_at"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
}).refine(
  (d) => d.minBudget == null || d.maxBudget == null || d.minBudget <= d.maxBudget,
  { message: "minBudget 不能大于 maxBudget", path: ["minBudget"] }
);

export type ClientQuery = z.infer<typeof ClientQuerySchema>;
```

---

## 8. Error Codes

All existing error codes from api-contract §1.3 apply. The following are the error codes relevant to client operations:

| Error Code | HTTP | When |
|---|---|---|
| `UNAUTHENTICATED` | 401 | No valid session |
| `FORBIDDEN` | 403 | Non-owner attempting soft delete |
| `WORKSPACE_ACCESS_DENIED` | 403 | No active workspace membership; or client not in user's workspace |
| `RESOURCE_NOT_FOUND` | 404 | Client does not exist, is soft-deleted, or belongs to another workspace |
| `VALIDATION_FAILED` | 422 | Invalid input, invalid stage transition, cross-workspace `first_property_id`, deleting `closed_won`, `name` too long/short |
| `INTERNAL_ERROR` | 500 | Database failure or unhandled server error |

No new error codes are required for P2-CLIENT-001. The existing `VALIDATION_FAILED` code handles stage transition invalidity with a descriptive message (e.g., `"Stage transition 'new' -> 'viewed' is not allowed"`).

---

## 9. Deferred Features

The following are explicitly OUT OF SCOPE for P2-CLIENT-001. No code, endpoints, or schema changes for these features should be written or merged in this slice:

| Feature | Where It Lives | Phase |
|---|---|---|
| **Interactions** (communication log) | `POST/GET /api/clients/[id]/interactions` via `interactions` table | Phase 3+ |
| **Property matching for client** | `GET /api/clients/[id]/matches` via `property_matches` table | Phase 3+ (P2-MATCH-001) |
| **AI client extraction** | `POST /api/ai/extract-client` via DeepSeek | Phase 3+ (AI slice) |
| **AI diff computation on save** | Server-side JSON diff when `requestId` is present; `ai_correction_logs` | Phase 3+ (AI slice) |
| **Tasks linked to client** | `tasks` table with `client_id` FK | Phase 3+ |
| **Collaboration/sharing of clients** | Clients are never shared across workspaces | N/A (by design) |
| **Lead conversion to client** | `leads` table → `clients` conversion flow | Phase 3+ |
| **Bulk operations** | Batch stage change, batch delete | Not planned |
| **Client import/export** | CSV import, Excel export | Not planned |
| **Client deduplication** | Phone/wechat duplicate detection | Phase 4+ |
| **Client analytics** | Stage funnel, conversion rate, source attribution dashboard | Phase 4+ |

The client CRUD in this slice is purely operational: create, read, update, soft-delete. Relationships to `interactions`, `property_matches`, and `tasks` are deferred but the FK columns (`first_property_id`, `source_content_id`) are respected in validation.

---

## 10. Implementation Notes

### 10.1 Workspace ID Derivation

Every route handler MUST derive `workspace_id` from the authenticated user's `workspace_members` record -- identical to the pattern in `src/app/api/properties/route.ts`:

```typescript
const { data: member } = await client.from("workspace_members")
  .select("workspace_id")
  .eq("user_id", user.id)
  .eq("status", "active")
  .limit(1)
  .single();
if (!member) return jsonResponse(..., { status: 403 });

const workspaceId = member.workspace_id;
```

### 10.2 Soft Delete Pattern

Follow the properties DELETE pattern:
```typescript
const now = new Date().toISOString();
await client.from("clients")
  .update({ deleted_at: now, updated_at: now })
  .eq("id", id)
  .eq("workspace_id", workspaceId)
  .is("deleted_at", null);
```

### 10.3 List Column Selection

Define a `LIST_COLS` constant with the exact column list from §2.4 to avoid accidentally leaking `phone`/`wechat` in list responses.

### 10.4 RLS Trust

The existing RLS policies on `public.clients` (migration `20260801000005`) already enforce:
- SELECT: `is_workspace_member(workspace_id) AND deleted_at IS NULL`
- INSERT: `is_workspace_member(workspace_id)`
- UPDATE: `is_workspace_member(workspace_id) AND deleted_at IS NULL`
- DELETE: `is_workspace_owner(workspace_id)`

The API layer adds validation on top (stage transition rules, `first_property_id` workspace check, `closed_won` delete prevention) that RLS alone cannot express. The RLS layer is the final security boundary; the API layer provides business logic validation.

### 10.5 Stage Transition Validation

Implement a `VALID_TRANSITIONS` map in the route handler:

```typescript
const VALID_TRANSITIONS: Record<string, string[]> = {
  "new":               ["qualified", "deleted"],
  "qualified":         ["properties_sent", "paused", "lost", "closed_won", "deleted"],
  "properties_sent":   ["viewing_scheduled", "closed_won", "deleted"],
  "viewing_scheduled": ["viewed", "closed_won", "deleted"],
  "viewed":            ["considering", "paused", "lost", "closed_won", "deleted"],
  "considering":       ["considering", "paused", "lost", "closed_won", "deleted"],
  "paused":            ["qualified", "considering", "deleted"],
  "lost":              ["deleted"],  // lost is terminal; cannot reopen
  "closed_won":        [],           // terminal
  "deleted":           [],           // terminal
};
```

### 10.6 First Property ID Validation

When `first_property_id` is provided (create or update), the server MUST verify that the property belongs to the same workspace:

```typescript
const { data: property } = await client.from("properties")
  .select("id")
  .eq("id", first_property_id)
  .eq("workspace_id", workspaceId)
  .is("deleted_at", null)
  .single();
if (!property) return jsonResponse(
  { data: null, error: { code: "VALIDATION_FAILED", message: "关联房源不存在或无权访问" } },
  { status: 422 }
);
```

### 10.7 Owner Check for DELETE

DELETE requires workspace ownership:

```typescript
const { data: ownerCheck } = await client.from("workspace_members")
  .select("role")
  .eq("workspace_id", workspaceId)
  .eq("user_id", user.id)
  .eq("status", "active")
  .single();
if (!ownerCheck || ownerCheck.role !== "owner") {
  return jsonResponse(
    { data: null, error: { code: "FORBIDDEN", message: "仅工作区管理员可删除客户" } },
    { status: 403 }
  );
}
```

### 10.8 Audit Log Writing

Stage changes and soft-deletes MUST write to `audit_logs`. Use the service-level audit helper (to be provided by data-security-engineer or implemented inline with `client.from("audit_logs").insert(...)`).

Audit log entries must redact `phone`, `wechat`, and `raw_input_text` from `before_data` and `after_data` snapshots.

---

## 11. Testing Requirements

Per `.claude/rules/testing.md`, tests must cover:

- Unit: Zod schema validation (CreateClientInputSchema, UpdateClientInputSchema, ClientQuerySchema, stage transition map)
- Integration: Route handlers with Supabase mock/fixture
- RLS: Cross-workspace access denial, non-owner delete denial
- E2E: Happy path (create, list, detail, update, delete), all error paths

Specific test cases for P2-CLIENT-001:
1. Create client with only `name` -- succeeds, stage defaults to `new`
2. Create client with all fields -- succeeds
3. Create client without `name` -- 422
4. Create client with invalid stage -- 422
5. Create client with `first_property_id` from another workspace -- 422
6. List clients -- returns only workspace clients, excludes phone/wechat
7. List clients with stage filter -- correct results
8. List clients with budget range -- correct results
9. Get client detail -- includes phone/wechat
10. Get detail for cross-workspace client -- 404
11. Update client with valid stage transition -- succeeds, audit logged
12. Update client with invalid stage transition (skip) -- 422
13. Update client from `closed_won` to any -- 422
14. Soft delete client as owner -- succeeds, audit logged
15. Soft delete client as member -- 403
16. Soft delete `closed_won` client -- 422
17. Cross-workspace access -- all endpoints return 403/404
18. Deleted clients excluded from list
19. Deleted clients return 404 on detail

---

## 12. File Ownership

| Path | Owner |
|---|---|
| `docs/contracts/client-contract.md` | solution-architect |
| `src/features/clients/schemas.ts` | property-crm-engineer |
| `src/app/api/clients/route.ts` | property-crm-engineer |
| `src/app/api/clients/[id]/route.ts` | property-crm-engineer |
| `supabase/migrations/20260801000005_phase2_business_tables.sql` (clients section) | data-security-engineer (already deployed) |

---

## 13. Change Control

This contract is FROZEN. Changes to field definitions, stage transitions, API signatures, error codes, or permissions MUST:

1. Submit an ADR (`docs/decisions/ADR-XXX-client-change.md`).
2. Obtain approval from solution-architect and the main Agent.
3. Update this document version and changelog.
4. Notify property-crm-engineer and data-security-engineer.
