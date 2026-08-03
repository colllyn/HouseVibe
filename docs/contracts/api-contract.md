# HouseVibe API Contract

| 属性 | 值 |
|---|---|
| 文档名称 | api-contract |
| 版本 | 1.0 |
| 状态 | FROZEN FOR PHASE 1 |
| Owner | solution-architect |
| 依赖 | PRD v1.3, domain-model v1.0 |
| 最后更新 | 2026-07-30 |

---

## 1. 通用约定

### 1.1 认证
所有 API 端点（除 `/api/auth/register`, `/api/auth/login`, `/api/invites/:token`）均需要有效的 Supabase Auth Session。通过 Cookie-based session 自动处理。

### 1.2 统一响应 Envelope

成功响应：
```json
{
  "data": {},
  "error": null
}
```

错误响应：
```json
{
  "data": null,
  "error": {
    "code": "ERROR_CODE",
    "message": "人类可读的中文描述",
    "details": {}
  }
}
```

### 1.3 错误码到 HTTP 状态码映射

| 错误码 | HTTP 状态码 | 说明 |
|---|---|---|
| `UNAUTHENTICATED` | 401 | 未登录或 Session 过期 |
| `FORBIDDEN` | 403 | 无权执行此操作 |
| `FEATURE_NOT_ALLOWED` | 403 | 缺少所需功能授权 |
| `CONTENT_FACTORY_NOT_ALLOWED` | 403 | 缺少 content_factory 授权 |
| `WORKSPACE_ACCESS_DENIED` | 403 | 不属于目标 workspace |
| `QUOTA_EXCEEDED` | 429 | AI 每日次数配额已用完 |
| `COST_LIMIT_EXCEEDED` | 429 | AI 每日成本熔断 |
| `RESOURCE_NOT_FOUND` | 404 | 资源不存在 |
| `VALIDATION_FAILED` | 400 | 请求参数校验失败 |
| `TRANSCRIPTION_DURATION_EXCEEDED` | 422 | 录音时长超过上限 |
| `COMPLIANCE_BLOCKED` | 422 | 合规输入阶段拒绝（内容完全未生成，不返回 data） |
| `INVALID_AI_OUTPUT` | 502 | AI 输出格式不符合 Schema |
| `TRANSCRIPTION_TOO_LARGE` | 413 | 音频文件超过大小上限 |
| `TRANSCRIPTION_UNSUPPORTED_MEDIA` | 415 | 音频格式不支持 |
| `TRANSCRIPTION_TIMEOUT` | 504 | STT 服务超时 |
| `AI_NOT_CONFIGURED` | 503 | DeepSeek API Key 或 Base URL 未配置 |
| `AI_TIMEOUT` | 504 | DeepSeek 请求超时 |
| `AI_RATE_LIMITED` | 502 | DeepSeek API 返回 429（区别于用户级 `RATE_LIMITED`） |
| `AI_UPSTREAM_ERROR` | 502 | DeepSeek 5xx 或连接失败 |
| `AI_INVALID_RESPONSE` | 502 | DeepSeek 响应 JSON 解析或 Schema 校验失败 |
| `PROPERTY_NOT_MARKETING_REUSABLE` | 403 | 房源未授权营销复用 |
| `CONFLICT` | 409 | 资源冲突 |
| `RATE_LIMITED` | 429 | 请求频率限制 |
| `INTERNAL_ERROR` | 500 | 服务端内部错误 |

### 1.4 幂等性
- `POST /api/ai/generate-content`：需要 `idempotencyKey` header 或 body，相同 key 的重复请求返回相同结果。
- `POST /api/ai/transcribe`：可选 `X-Idempotency-Key` header。
- 其他 POST 端点：客户端可带 `X-Idempotency-Key` header，服务端 SHOULD 支持。

### 1.5 限流
- 所有 API 端点：默认 60 requests/minute per user。
- AI 相关端点：额外 10 requests/minute per user。
- `/api/ai/transcribe`：5 requests/minute per user。
- 超限返回 `RATE_LIMITED` (429)。

### 1.6 审计
以下操作 MUST 写入 `audit_logs`：
- Feature 授予/撤销
- 共享房源上架/下架
- 营销复用授权变更
- 内容风险确认
- 管理员模型切换
- 成本熔断恢复
- 账号禁用/启用

### 1.7 隐私处理
- 严禁在 API 响应中返回 `property_private_details` 字段给非 workspace 成员。
- 共享房源 API 的响应 MUST NOT 包含：owner_name, owner_phone, owner_wechat, exact_address, building_no, unit_no, room_no, internal_notes, key_location。
- 错误响应的 `details` 字段 MUST NOT 包含敏感数据。

---

## 2. Auth 与 Workspace API

### 2.1 POST /api/auth/register

| 属性 | 值 |
|---|---|
| Owner Agent | data-security-engineer |
| 认证 | 不需要 |
| Feature 权限 | 不需要 |

**Request Body** (Zod: `RegisterInputSchema`):
```json
{
  "email": "user@example.com",
  "password": "min8chars",
  "fullName": "张三",
  "phone": "13800138000"
}
```

**成功响应** (201):
```json
{
  "data": {
    "user": { "id": "uuid", "email": "user@example.com" },
    "workspace": { "id": "uuid", "name": "张三的工作区" }
  },
  "error": null
}
```

**错误响应**:
- `VALIDATION_FAILED` (400): 参数校验失败
- `CONFLICT` (409): 邮箱已注册

**审计要求**: 记录注册事件。

---

### 2.2 POST /api/auth/login

| 属性 | 值 |
|---|---|
| Owner Agent | data-security-engineer |
| 认证 | 不需要 |

**Request Body** (Zod: `LoginInputSchema`):
```json
{
  "email": "user@example.com",
  "password": "min8chars"
}
```

**成功响应** (200):
```json
{
  "data": { "redirectTo": "/dashboard" },
  "error": null
}
```

**安全要求**: 防暴力尝试（至少 5 次失败后临时锁定）。

---

### 2.3 POST /api/auth/logout

| 属性 | 值 |
|---|---|
| Owner Agent | data-security-engineer |
| 认证 | 需要 |

**成功响应** (200): 清除 session。

---

### 2.4 GET /api/auth/me

| 属性 | 值 |
|---|---|
| Owner Agent | data-security-engineer |
| 认证 | 需要 |

**成功响应** (200):
```json
{
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "fullName": "张三",
    "phone": "13800138000",
    "avatarUrl": "url",
    "city": "广州",
    "workspaces": [{ "id": "uuid", "name": "张三的工作区", "role": "owner" }],
    "isSystemAdmin": false,
    "entitlements": [{ "feature": "content_factory", "status": "active", "expiresAt": null }]
  },
  "error": null
}
```

---

### 2.5 GET /api/invites/:token

| 属性 | 值 |
|---|---|
| Owner Agent | data-security-engineer |
| 认证 | 不需要 |
| Path 参数 | `token` (string) - 邀请 Token |

**成功响应** (200):
```json
{
  "data": {
    "workspaceName": "XX门店",
    "workspaceCity": "广州",
    "expiresAt": "2026-08-30T00:00:00Z",
    "valid": true
  },
  "error": null
}
```

**错误响应**:
- `RESOURCE_NOT_FOUND` (404): Token 无效或已过期

---

### 2.6 POST /api/invites/:token/accept

| 属性 | 值 |
|---|---|
| Owner Agent | data-security-engineer |
| 认证 | 需要 |
| Path 参数 | `token` (string) |

**成功响应** (200):
```json
{
  "data": { "workspace": { "id": "uuid", "name": "XX门店" } },
  "error": null
}
```

**错误响应**:
- `RESOURCE_NOT_FOUND` (404): Token 无效
- `CONFLICT` (409): 已使用或次数已满

**审计要求**: 记录成员加入事件。

---

## 3. Admin API

所有 `/api/admin/*` 端点 MUST 验证 `is_system_admin()`。

### 3.1 GET /api/admin/users

| 属性 | 值 |
|---|---|
| Owner Agent | data-security-engineer |
| Query 参数 | `search` (string, 可选), `status` (string, 可选), `page` (int, 默认 1), `limit` (int, 默认 20) |

**成功响应** (200):
```json
{
  "data": {
    "users": [{ "id": "uuid", "email": "...", "fullName": "...", "workspaceCount": 1, "createdAt": "..." }],
    "total": 100,
    "page": 1
  },
  "error": null
}
```

---

### 3.2 GET /api/admin/users/:id

| 属性 | 值 |
|---|---|
| Owner Agent | data-security-engineer |

**成功响应** (200): 返回用户详情、workspace 列表、entitlements、AI 用量摘要

---

### 3.3 PATCH /api/admin/users/:id

| 属性 | 值 |
|---|---|
| Owner Agent | data-security-engineer |

**Request Body** (部分更新):
```json
{
  "disabled": true,
  "disableReason": "违规操作"
}
```

**审计要求**: 记录禁用/启用操作。

---

### 3.4 GET /api/admin/feature-entitlements

| 属性 | 值 |
|---|---|
| Owner Agent | data-security-engineer |
| Query 参数 | `userId` (UUID, 可选), `feature` (string, 可选), `status` (string, 可选) |

**成功响应** (200):
```json
{
  "data": {
    "entitlements": [{ "id": "uuid", "userId": "uuid", "feature": "content_factory", "status": "active", "grantedAt": "...", "expiresAt": null }],
    "total": 10
  },
  "error": null
}
```

---

### 3.5 POST /api/admin/feature-entitlements

| 属性 | 值 |
|---|---|
| Owner Agent | data-security-engineer |

**Request Body** (Zod: `GrantEntitlementInputSchema`):
```json
{
  "userId": "uuid",
  "feature": "content_factory",
  "expiresAt": "2026-12-31T00:00:00Z"
}
```

**成功响应** (201): 返回创建的 entitlement。

**错误响应**:
- `CONFLICT` (409): 该用户已存在此 feature 的 active entitlement

**审计要求**: 记录授权操作（授予人、被授予人、功能、时间）。

---

### 3.6 PATCH /api/admin/feature-entitlements/:id

| 属性 | 值 |
|---|---|
| Owner Agent | data-security-engineer |

**Request Body**:
```json
{
  "status": "revoked"
}
```

或更新 expires_at:
```json
{
  "expiresAt": "2027-12-31T00:00:00Z"
}
```

**审计要求**: 记录撤销或延期操作。

---

### 3.7 DELETE /api/admin/feature-entitlements/:id

| 属性 | 值 |
|---|---|
| Owner Agent | data-security-engineer |

等同于 PATCH 设置 `status = 'revoked'`。不物理删除。

**审计要求**: 记录撤销操作。

---

### 3.8 GET /api/admin/invites

| 属性 | 值 |
|---|---|
| Owner Agent | data-security-engineer |

---

### 3.9 POST /api/admin/invites

| 属性 | 值 |
|---|---|
| Owner Agent | data-security-engineer |

**Request Body** (Zod: `CreateInviteInputSchema`):
```json
{
  "targetWorkspaceId": "uuid",
  "maxUses": 10,
  "expiresAt": "2026-08-30T00:00:00Z"
}
```

**成功响应** (201):
```json
{
  "data": {
    "token": "generated-invite-token",
    "expiresAt": "...",
    "url": "https://housevibe.com/join/generated-invite-token"
  },
  "error": null
}
```

**安全要求**: Token 只保存 Hash，明文仅在创建响应中返回一次。

---

### 3.10 DELETE /api/admin/invites/:id

| 属性 | 值 |
|---|---|
| Owner Agent | data-security-engineer |

设置 status = 'revoked'。

---

## 4. 房源 API

### 4.1 GET /api/properties

| 属性 | 值 |
|---|---|
| Owner Agent | property-crm-engineer |
| 认证 | 需要 |
| Workspace 规则 | 只返回当前用户所属 workspace 的房源 |

**Query 参数**:
- `status` (string, 可选)
- `district` (string, 可选)
- `city` (string, 可选)
- `businessArea` (string, 可选)
- `communityName` (string, 可选)
- `rentalType` (string, 可选)
- `bedrooms` (int, 可选)
- `minRent` (int, 可选)
- `maxRent` (int, 可选)
- `minArea` (numeric, 可选)
- `maxArea` (numeric, 可选)
- `petsAllowed` (boolean, 可选)
- `cookingAllowed` (boolean, 可选)
- `hasElevator` (boolean, 可选)
- `availableBefore` (date, 可选)
- `availableAfter` (date, 可选)
- `isShared` (boolean, 可选)
- `subwayText` (string, 可选)
- `hasContent` (boolean, 可选) - 仅 content_factory 用户；非授权用户忽略
- `search` (string, 可选) - 跨字段文本搜索
- `page` (int, 默认 1)
- `limit` (int, 默认 20, 最大 100)
- `sortBy` (string, 默认 'updated_at')
- `sortOrder` (string, 默认 'desc')

**成功响应** (200):
```json
{
  "data": {
    "properties": [],
    "total": 50,
    "page": 1
  },
  "error": null
}
```

**隐私处理**: 响应中 SHOULD 包含 `hasPrivateDetails` 标志，指示是否有敏感信息。敏感字段（building_no, unit_no, room_no）仅在详情接口返回。

---

### 4.2 POST /api/properties

| 属性 | 值 |
|---|---|
| Owner Agent | property-crm-engineer |

**Request Body** (Zod: `CreatePropertyInputSchema`):
必须包含至少 title, city, rental_type。完整字段见 domain-model 2.4。

**成功响应** (201): 返回创建的房源。

---

### 4.3 GET /api/properties/:id

| 属性 | 值 |
|---|---|
| Owner Agent | property-crm-engineer |
| Workspace 规则 | 必须属于当前用户 workspace 且未删除 |

**成功响应** (200): 返回完整房源信息，包含 `property_private_details`（如果是 workspace member）和 `property_media` 列表。

**隐私处理**: 敏感字段仅在用户是当前 workspace member 时返回。

---

### 4.4 PATCH /api/properties/:id

| 属性 | 值 |
|---|---|
| Owner Agent | property-crm-engineer |

**Request Body** (Zod: `UpdatePropertyInputSchema`): 部分更新。

**额外验证**:
- `is_shared` 和 `allow_marketing_reuse` 必须分开设置。
- 设置 `allow_marketing_reuse = true` 时，`is_shared` SHOULD 同时为 true（或在 service 层自动处理）。
- 状态转换必须符合状态机规则。

**审计要求**: 共享/营销复用变更写入 audit_logs。

---

### 4.5 DELETE /api/properties/:id

| 属性 | 值 |
|---|---|
| Owner Agent | property-crm-engineer |

执行软删除（设置 `deleted_at`）。不删除媒体文件和关联内容。

**成功响应** (200):
```json
{
  "data": { "deleted": true, "deletedAt": "..." },
  "error": null
}
```

---

### 4.6 POST /api/properties/:id/share

| 属性 | 值 |
|---|---|
| Owner Agent | property-crm-engineer |
| Workspace 规则 | 房源所有者 workspace owner/member |

上架到合作共享库。设置 `is_shared = true`、`shared_at = now()`、可选 `shared_expires_at`。

**Request Body** (Zod: `SharePropertyInputSchema`):
```json
{
  "sharedExpiresAt": "2026-12-31T00:00:00Z",
  "allowMarketingReuse": false,
  "commissionSplit": "50/50"
}
```

**成功响应** (200):
```json
{
  "data": { "shared": true, "sharedAt": "..." },
  "error": null
}
```

**审计要求**: 记录共享上架事件。

---

### 4.7 DELETE /api/properties/:id/share

| 属性 | 值 |
|---|---|
| Owner Agent | property-crm-engineer |

下架共享（设置 `is_shared = false`、`allow_marketing_reuse = false`）。已发出的合作请求不受影响。

**审计要求**: 记录共享下架事件。

---

## 5. 共享房源 API

### 5.1 GET /api/shared-properties

| 属性 | 值 |
|---|---|
| Owner Agent | property-crm-engineer |
| 认证 | 需要 |
| Feature 权限 | 需要 `shared_property_pool` |
| Workspace 规则 | 返回所有 workspace 的共享房源（脱敏） |

**Query 参数**: 同 GET /api/properties，但不包含 status=deleted。

**成功响应** (200): 返回脱敏房源列表。

**隐私处理**: MUST NOT 包含字段：owner_name, owner_phone, owner_wechat, exact_address, building_no, unit_no, room_no, internal_notes, key_location, raw_input_text。

---

### 5.2 POST /api/shared-properties/:id/contact

| 属性 | 值 |
|---|---|
| Owner Agent | property-crm-engineer |

发起合作联系请求。创建 collaboration_request。

**Request Body** (Zod: `ContactSharedPropertyInputSchema`):
```json
{
  "message": "我对这套房源感兴趣，能否合作？"
}
```

**成功响应** (201):
```json
{
  "data": { "collaborationRequestId": "uuid", "status": "pending" },
  "error": null
}
```

**审计要求**: 记录合作联系行为。

---

## 6. 客户 API

### 6.1 GET /api/clients

| 属性 | 值 |
|---|---|
| Owner Agent | property-crm-engineer |

**Query 参数**: `stage`, `search`, `minBudget`, `maxBudget`, `bedrooms`, `nextFollowUpBefore`, `page`, `limit`, `sortBy`, `sortOrder`

**成功响应** (200): 返回客户列表（phone/wechat 仅在详情返回）。

---

### 6.2 POST /api/clients

| 属性 | 值 |
|---|---|
| Owner Agent | property-crm-engineer |

**Request Body** (Zod: `CreateClientInputSchema`):
包含 requestId 时，服务端需读取 AI 原始输出并计算脱敏 Diff。

**成功响应** (201): 返回创建的客户。

---

### 6.3 GET /api/clients/:id

| 属性 | 值 |
|---|---|
| Owner Agent | property-crm-engineer |

返回完整客户信息，包含 phone/wechat、interactions、匹配房源。

---

### 6.4 PATCH /api/clients/:id

| 属性 | 值 |
|---|---|
| Owner Agent | property-crm-engineer |

**额外验证**: 阶段转换必须符合状态机规则。

**审计要求**: 阶段变更写入事件日志。

---

### 6.5 DELETE /api/clients/:id

| 属性 | 值 |
|---|---|
| Owner Agent | property-crm-engineer |

软删除。

---

## 7. 匹配 API

### 7.1 POST /api/matches/calculate

| 属性 | 值 |
|---|---|
| Owner Agent | property-crm-engineer |
| Feature 权限 | 需要 `property_matching` |

计算指定客户与可选房源池之间的匹配。

**Request Body** (Zod: `CalculateMatchInputSchema`):
```json
{
  "clientId": "uuid",
  "propertyIds": ["uuid"],
  "weightOverrides": { "budget": 30, "district": 20, "roomType": 15, "availability": 15, "commute": 10, "specialRequirements": 10 }
}
```

**成功响应** (200):
```json
{
  "data": {
    "matches": [{
      "propertyId": "uuid",
      "score": 85,
      "matchLevel": "excellent",
      "matchedReasons": [{
        "code": "budget",
        "label": "预算匹配",
        "scoreContribution": 30,
        "detail": "月租 ¥2500 在预算 ¥3000 以内"
      }],
      "unmatchedReasons": [],
      "needsConfirmation": [],
      "nextAction": "推荐立即发送房源给客户"
    }],
    "totalProperties": 50,
    "matchedCount": 12
  },
  "error": null
}
```

---

### 7.2 GET /api/clients/:id/matches

| 属性 | 值 |
|---|---|
| Owner Agent | property-crm-engineer |

返回指定客户的所有活跃匹配记录。

---

### 7.3 GET /api/properties/:id/matches

| 属性 | 值 |
|---|---|
| Owner Agent | property-crm-engineer |

返回指定房源的所有活跃匹配记录。

---

## 8. 任务 API

### 8.1 GET /api/tasks

| 属性 | 值 |
|---|---|
| Owner Agent | property-crm-engineer |

**Query 参数**: `status`, `taskType`, `assignedTo`, `dueBefore`, `dueAfter`, `page`, `limit`

---

### 8.2 POST /api/tasks

| 属性 | 值 |
|---|---|
| Owner Agent | property-crm-engineer |

**Request Body** (Zod: `CreateTaskInputSchema`):
```json
{
  "taskType": "contact_client",
  "title": "联系客户确认看房时间",
  "description": "",
  "clientId": "uuid",
  "propertyId": "uuid",
  "dueAt": "2026-08-01T10:00:00Z"
}
```

---

### 8.3 GET/PATCH/DELETE /api/tasks/:id

标准 CRUD，DELETE 为软删除。

---

## 9. 合作请求 API

### 9.1 GET /api/collaboration-requests

| 属性 | 值 |
|---|---|
| Owner Agent | property-crm-engineer |

**Query 参数**: `status`, `direction` (incoming/outgoing), `page`, `limit`

---

### 9.2 PATCH /api/collaboration-requests/:id

| 属性 | 值 |
|---|---|
| Owner Agent | property-crm-engineer |

**Request Body**:
```json
{
  "status": "accepted"
}
```

或:
```json
{
  "status": "rejected"
}
```

**权限**: 只有 owner_workspace 成员可以 accept/reject。requester_workspace 成员可以 cancel。

---

## 10. AI API

所有 AI API 端点 MUST 遵循 DeepSeek AI 规则中的 10 步请求顺序。

### 10.1 POST /api/ai/transcribe

| 属性 | 值 |
|---|---|
| Owner Agent | ai-deepseek-engineer |
| 认证 | 需要 |
| Feature 权限 | 不需要（基础能力） |
| Content-Type | multipart/form-data |
| Runtime | Node.js（不支持 Edge） |

**表单字段**:
- `audio`: File (必填) -- 音频文件
- `purpose`: "property" | "client" (可选)
- `language`: "zh" (可选, 默认)
- `requestId`: UUID (建议)

**文件限制**:
- 最大时长: 60 秒
- 最大大小: 10 MB
- 允许 MIME: `audio/webm`, `audio/mp4`, `audio/mpeg`, `audio/wav`, `audio/x-m4a`

**成功响应** (200):
```json
{
  "data": {
    "text": "转写后的完整文本",
    "segments": [],
    "durationSeconds": 32.5,
    "provider": "configured_stt",
    "requestId": "uuid"
  },
  "error": null
}
```

**错误响应**:
- `UNAUTHENTICATED` (401): 未登录
- `TRANSCRIPTION_TOO_LARGE` (413): 文件 > 10MB
- `TRANSCRIPTION_UNSUPPORTED_MEDIA` (415): 不支持的格式
- `TRANSCRIPTION_DURATION_EXCEEDED` (422): 录音时长 > 60s
- `TRANSCRIPTION_TIMEOUT` (504): STT 超时
- `RATE_LIMITED` (429): 超频

**处理要求**:
- 服务端在调用 STT 前完成所有验证。
- MUST NOT 暴露 STT API Key 给客户端。
- MUST NOT 以 Base64 JSON 传输音频。
- 音频默认不持久化，请求完成后删除临时文件。
- 转写接口只返回文本，不直接创建房源或客户。

---

### 10.2 POST /api/ai/extract-property

| 属性 | 值 |
|---|---|
| Owner Agent | ai-deepseek-engineer |
| Feature 权限 | 需要 `ai_data_extraction` |

**Request Body** (Zod: `ExtractPropertyInputSchema`):
```json
{
  "text": "粘贴的聊天记录或口述文本",
  "sourceType": "text",
  "requestId": "uuid"
}
```

**成功响应** (200):
```json
{
  "data": {
    "title": "天河区温馨一房",
    "city": "广州",
    "district": "天河区",
    "communityName": "XX花园",
    "rentalType": "whole_unit",
    "monthlyRent": 3500,
    "bedrooms": 1,
    "livingRooms": 1,
    "bathrooms": 1,
    "areaSqm": 45,
    "floor": 12,
    "totalFloors": 30,
    "hasElevator": true,
    "orientation": "南",
    "decoration": "精装修",
    "availableFrom": "2026-08-15",
    "petsAllowed": false,
    "cookingAllowed": true,
    "subwayText": "距3号线体育西路站500米",
    "facilities": ["空调", "洗衣机", "冰箱"],
    "tags": ["近地铁", "采光好"],
    "sellingPoints": ["朝南大阳台", "新装修"],
    "drawbacks": ["无独立厨房"],
    "description": "...",
    "rawText": "原始文本",
    "missingFields": ["depositTerms", "minimumLeaseMonths"],
    "uncertainFields": [{"field": "floor", "reason": "文本中未明确"}],
    "requestId": "uuid"
  },
  "error": null
}
```

**重试策略**: 失败时自动重试 1 次，使用备用 DeepSeek 模型。
**超时策略**: 45 秒（DEEPSEEK_REQUEST_TIMEOUT_MS）。

---

### 10.3 POST /api/ai/extract-client

| 属性 | 值 |
|---|---|
| Owner Agent | ai-deepseek-engineer |
| Feature 权限 | 需要 `ai_data_extraction` |

**Request Body** (Zod: `ExtractClientInputSchema`):
```json
{
  "text": "聊天记录文本",
  "sourcePlatform": "wechat",
  "requestId": "uuid"
}
```

**成功响应** (200): 返回结构化客户字段（不含 phone/wechat 原始文本中的值需保留在 rawText 中）。

---

### 10.4 POST /api/ai/analyze-property-images

| 属性 | 值 |
|---|---|
| Owner Agent | ai-deepseek-engineer |
| Feature 权限 | 需要 `ai_data_extraction`（基础能力） |

**Request Body** (Zod: `AnalyzeImagesInputSchema`):
```json
{
  "propertyId": "uuid",
  "propertyMediaIds": ["uuid"],
  "requestId": "uuid"
}
```

**限制**: 单次最多 8 张图片。

**处理流程**:
1. 校验房源和媒体访问权限。
2. 生成短期签名 URL。
3. 调用 DeepSeekVisionProvider。
4. 返回单图标签、整套摘要、事实交叉校验。

**成功响应** (200):
```json
{
  "data": {
    "mediaResults": [{
      "mediaId": "uuid",
      "aiLabels": {
        "sceneType": "living_room",
        "styles": ["modern", "minimal"],
        "visibleFeatures": ["floor_to_ceiling_window"],
        "condition": ["well_maintained"],
        "lighting": ["bright_natural_light"],
        "appliances": ["air_conditioner"],
        "confidence": 0.86,
        "evidence": ["media-uuid"],
        "uncertainLabels": []
      },
      "aiAnalysisStatus": "completed"
    }],
    "visualSummary": "整体为简约现代风格，客厅自然采光较好...",
    "factChecks": [{
      "textClaim": "有阳台",
      "visualResult": "not_verified_by_images",
      "confidence": 0.0,
      "suggestion": "建议补充阳台照片"
    }],
    "requestId": "uuid",
    "model": "deepseek-vl-xxx"
  },
  "error": null
}
```

**安全要求**:
- MUST NOT 接受未经校验的任意 URL。
- 图片 URL MUST 通过域名白名单和 SSRF 防护。
- 发送前移除不必要 EXIF 元数据。
- MUST NOT 将永久公开 URL 发送给视觉端点。

---

### 10.5 POST /api/ai/parse-property-search

| 属性 | 值 |
|---|---|
| Owner Agent | ai-deepseek-engineer |
| Feature 权限 | 需要 `semantic_search` |

**Request Body** (Zod: `ParseSearchInputSchema`):
```json
{
  "query": "3500以内、天河、能养猫的一房",
  "requestId": "uuid"
}
```

**成功响应** (200):
```json
{
  "data": {
    "filters": {
      "districts": ["天河区"],
      "monthlyRentMax": 3500,
      "bedrooms": 1,
      "petsAllowed": true,
      "sortBy": "updated_at",
      "sortOrder": "desc"
    },
    "parsedQuery": "预算3500以内，天河区，一房，允许养宠物",
    "unrecognizedTerms": [],
    "requestId": "uuid"
  },
  "error": null
}
```

**安全要求**: 只允许白名单字段和操作符。MUST NOT 输出 SQL。

**错误响应**:

| 错误码 | HTTP 状态码 | 说明 |
|---|---|---|
| `UNAUTHENTICATED` | 401 | 未登录或 Session 过期 |
| `FEATURE_NOT_ALLOWED` | 403 | 缺少 `semantic_search` 功能授权 |
| `VALIDATION_FAILED` | 400 | 请求参数校验失败（query 为空、超长或纯标点） |
| `RATE_LIMITED` | 429 | 用户请求频率超限 |
| `AI_TIMEOUT` | 504 | DeepSeek 请求超时 |
| `AI_UPSTREAM_ERROR` | 502 | DeepSeek 返回 5xx 或连接失败 |
| `AI_INVALID_RESPONSE` | 502 | DeepSeek 响应 JSON 解析或 Schema 校验失败 |
| `AI_RATE_LIMITED` | 502 | DeepSeek API 返回 429（区别于用户级 `RATE_LIMITED`） |
| `INTERNAL_ERROR` | 500 | 服务端内部错误 |

**注意**: 该端点属于 Phase 3 (P3-AI-004)。Phase 2 UI 在收到 404/501 时会 fallback 到文本搜索（见 `property-semantic-search-ui-contract.md` §3.2）。

---

### 10.6 POST /api/ai/generate-content

| 属性 | 值 |
|---|---|
| Owner Agent | ai-deepseek-engineer |
| Feature 权限 | 需要 `content_factory` |
| 幂等性 | 必须提供 `idempotencyKey` |

**Request Body** (Zod: `GenerateContentInputSchema`):
```json
{
  "propertyId": "uuid",
  "platform": "xiaohongshu",
  "targetAudience": "年轻白领",
  "contentAngle": "通勤租房",
  "contentGoal": "获取咨询",
  "tone": "亲切自然",
  "videoDurationSeconds": null,
  "isOnCamera": false,
  "showDrawbacks": true,
  "privateMessageKeyword": "阳光租房",
  "idempotencyKey": "unique-key",
  "requestId": "uuid"
}
```

**前置检查顺序**:
1. 身份验证
2. content_factory 授权
3. 原子配额与成本预占 (reserve_ai_quota)
4. 房源访问权限与营销复用授权
5. 隐私预处理
6. 模型调用
7. Structured Output + Zod
8. 事实校验
9. 合规扫描
10. 用量结算

**成功响应** (200):
```json
{
  "data": {
    "contentVersionId": "uuid",
    "platform": "xiaohongshu",
    "output": {
      "titleOptions": ["...", "...", "..."],
      "coverText": "...",
      "hook": "...",
      "body": "...",
      "imageSequence": [],
      "imageCaptions": [],
      "factualSummary": "...",
      "drawbacks": "...",
      "interactionQuestion": "...",
      "privateMessageKeyword": "阳光租房",
      "hashtags": ["...", "..."],
      "factsUsed": [],
      "visualFactsUsed": [],
      "missingInformation": [],
      "riskFlags": [],
      "complianceFlags": [],
      "requiresFactReview": false
    },
    "copyAllowed": true,
    "complianceStatus": "clean",
    "model": "deepseek-v4-flash",
    "usage": {
      "inputTokens": 1200,
      "outputTokens": 800,
      "estimatedCostUsd": 0.002
    },
    "requestId": "uuid"
  },
  "error": null
}
```

**错误响应**:
- `UNAUTHENTICATED` (401)
- `CONTENT_FACTORY_NOT_ALLOWED` (403)
- `PROPERTY_NOT_MARKETING_REUSABLE` (403)
- `QUOTA_EXCEEDED` (429): 包含当日上限和重置时间
- `COST_LIMIT_EXCEEDED` (429): 包含成本上限和当前累计
- `INVALID_AI_OUTPUT` (502): AI 输出不符合 Schema
- `COMPLIANCE_BLOCKED` (422): 内容因合规在**输入阶段**被拒绝（content 完全未生成），`data` 为 `null`。Block 级风险在生成后发现时，通过成功响应（200）中的 `copyAllowed: false` + `complianceStatus: 'blocked'` 表达，此时内容仍返回

**合规处理两种场景**：

| 场景 | HTTP Status | 响应内容 |
|---|---|---|
| 生成后发现 block 级合规风险 | 200 | `data` 包含完整输出，`copyAllowed: false`，`complianceStatus: 'blocked'` |
| 输入阶段被合规拒绝（内容完全未生成） | 422 | `data: null`，错误码 `COMPLIANCE_BLOCKED` |

注意：`copyAllowed: false` 时 UI 必须禁用一键复制按钮和"标记待发布"操作，用户需先修改风险内容或完成人工确认。前端不得在 `copyAllowed: false` 时通过修改 DOM 绕过复制限制。

**429 响应示例**:
```json
{
  "data": null,
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "今日内容生成次数已用完（10/10），请明天再试",
    "details": {
      "dailyLimit": 10,
      "used": 10,
      "remaining": 0,
      "resetAt": "2026-07-31T00:00:00+08:00"
    }
  }
}
```

---

### 10.7 POST /api/ai/content-feedback

| 属性 | 值 |
|---|---|
| Owner Agent | ai-deepseek-engineer |
| Feature 权限 | 需要 `content_factory` |

**Request Body** (Zod: `ContentFeedbackInputSchema`):
```json
{
  "contentVersionId": "uuid",
  "feedbackScore": -1,
  "feedbackType": "factual_error",
  "feedbackComment": "面积写错了"
}
```

**成功响应** (200): 记录反馈。

---

### 10.8 GET /api/me/ai-usage

| 属性 | 值 |
|---|---|
| Owner Agent | ai-deepseek-engineer |

返回当前用户的 AI 用量摘要（当日次数、累计成本、各功能使用量）。

---

### 10.9 GET /api/me/ai-preferences

| 属性 | 值 |
|---|---|
| Owner Agent | ai-deepseek-engineer |

返回当前用户的已学习偏好列表。

---

### 10.10 DELETE /api/me/ai-preferences/:id

| 属性 | 值 |
|---|---|
| Owner Agent | ai-deepseek-engineer |

删除指定偏好（软删除或设置 status = 'disabled'）。

---

## 11. Admin AI API

所有以下端点 MUST 验证 `is_system_admin()`。

### 11.1 GET /api/admin/ai-usage

| 属性 | 值 |
|---|---|
| Owner Agent | ai-deepseek-engineer |

**Query 参数**: `period` (today/7d/30d), `userId`, `workspaceId`, `feature`, `capability`, `page`, `limit`

---

### 11.2 GET /api/admin/ai-models

| 属性 | 值 |
|---|---|
| Owner Agent | ai-deepseek-engineer |

返回当前各 capability 的模型配置和运行状态。

---

### 11.3 PATCH /api/admin/ai-models/:capability

| 属性 | 值 |
|---|---|
| Owner Agent | ai-deepseek-engineer |

**Request Body**:
```json
{
  "mode": "primary"
}
```

或:
```json
{
  "mode": "fallback"
}
```

或:
```json
{
  "mode": "auto"
}
```

**限制**: 只能在 `provider = deepseek` 的模型之间切换。

**审计要求**: 记录模型切换操作。

---

### 11.4 POST /api/admin/ai-models/:capability/reset-circuit

| 属性 | 值 |
|---|---|
| Owner Agent | ai-deepseek-engineer |

手动关闭熔断器，恢复主模型。

**审计要求**: 记录熔断恢复操作。

---

### 11.5 GET /api/admin/ai-corrections

| 属性 | 值 |
|---|---|
| Owner Agent | ai-deepseek-engineer |

**Query 参数**: `feature`, `dateRange`, `page`, `limit`

返回高频被修改字段、常见映射、负反馈率等分析数据。

**隐私处理**: MUST NOT 在管理员分析页面展示明文联系方式或精确地址。

---

### 11.6 GET /api/admin/compliance-terms

| 属性 | 值 |
|---|---|
| Owner Agent | ai-deepseek-engineer |

**Query 参数**: `severity`, `status`, `category`, `page`, `limit`

---

### 11.7 POST /api/admin/compliance-terms

| 属性 | 值 |
|---|---|
| Owner Agent | ai-deepseek-engineer |

**Request Body** (Zod: `CreateComplianceTermInputSchema`):
```json
{
  "term": "绝对升值",
  "category": "investment_promise",
  "severity": "block",
  "matchType": "contains",
  "replacementSuggestion": "具有升值潜力"
}
```

---

### 11.8 PATCH /api/admin/compliance-terms/:id

| 属性 | 值 |
|---|---|
| Owner Agent | ai-deepseek-engineer |

更新词条（包括 severity、status 等）。

**审计要求**: 记录词条修改。

---

### 11.9 PATCH /api/admin/users/:userId/ai-limits

| 属性 | 值 |
|---|---|
| Owner Agent | ai-deepseek-engineer |

**Request Body**:
```json
{
  "dailyRequestLimit": 20,
  "dailyCostLimitUsd": 15.0
}
```

**审计要求**: 记录限制修改。

---

### 11.10 POST /api/admin/users/:userId/restore-ai-access

| 属性 | 值 |
|---|---|
| Owner Agent | ai-deepseek-engineer |

恢复因成本熔断被暂停的用户 AI 访问权限。

**审计要求**: 必须写入 audit_logs（恢复人、被恢复人、时间）。

---

## 12. Owner Agent 映射总结

| API 前缀 | Owner Agent |
|---|---|
| `/api/auth/**` | data-security-engineer |
| `/api/invites/**` | data-security-engineer |
| `/api/admin/users/**` | data-security-engineer |
| `/api/admin/feature-entitlements/**` | data-security-engineer |
| `/api/admin/invites/**` | data-security-engineer |
| `/api/properties/**` | property-crm-engineer |
| `/api/clients/**` | property-crm-engineer |
| `/api/matches/**` | property-crm-engineer |
| `/api/tasks/**` | property-crm-engineer |
| `/api/shared-properties/**` | property-crm-engineer |
| `/api/collaboration-requests/**` | property-crm-engineer |
| `/api/ai/**` | ai-deepseek-engineer |
| `/api/admin/ai-usage/**` | ai-deepseek-engineer |
| `/api/admin/ai-models/**` | ai-deepseek-engineer |
| `/api/admin/ai-corrections/**` | ai-deepseek-engineer |
| `/api/admin/compliance-terms/**` | ai-deepseek-engineer |

---

## 13. Open Questions

无。所有影响 Phase 1 的问题均已在 HouseVibe Phase 0 v1.0 中冻结。
