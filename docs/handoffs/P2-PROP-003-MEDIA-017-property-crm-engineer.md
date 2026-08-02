# Handoff: P2-PROP-003-MEDIA-017 — Property Media CRUD

| 属性 | 值 |
|---|---|
| Agent | property-crm-engineer |
| Task ID | P2-PROP-003-MEDIA-017 |
| 日期 | 2026-08-02 |
| 状态 | DONE |

## 实现摘要

按照 `docs/contracts/property-media-contract.md` 实现了房源媒体管理的全部 API 和 Server Action。

## 修改的文件

### 1. `src/features/properties/schemas.ts` (追加)

- 导出常量: `ALLOWED_MEDIA_MIME_TYPES`, `MAX_MEDIA_FILE_SIZE`, `MAX_MEDIA_PER_PROPERTY`, `MAX_FILES_PER_UPLOAD`
- 导出 Schema: `UpdateMediaInputSchema` + 类型 `UpdateMediaInput`

### 2. `src/app/api/properties/[id]/media/route.ts` (新建)

**GET** `/api/properties/[id]/media`:
- 验证身份 → workspace 成员 → 房源所有权
- 查询 `property_media` WHERE deleted_at IS NULL, ORDER BY sort_order ASC, created_at ASC
- 为每条记录生成签名 URL（使用 `createClient` 登录态 + `MEDIA_SIGNED_URL_EXPIRY_SECONDS` 配置，默认 3600 秒）
- 返回 camelCase 格式（匹配契约）

**POST** `/api/properties/[id]/media`:
- 验证身份 → workspace 成员 → 房源所有权
- 检查 Content-Type: `multipart/form-data`
- 解析 form field `files`（1-5 个文件）
- 计数现有媒体 + 检查上限（最多 20 张）
- 逐文件处理（最多 5 个）:
  - 白名单 MIME 验证（仅 image/png, image/jpeg, image/webp, image/gif）
  - 视频 MIME 拒绝（MEDIA_VIDEO_DEFERRED）
  - 文件大小验证（≤ 10 MB）
  - 生成路径: `{workspace_id}/{user_id}/{crypto.randomUUID()}.{ext}`
  - 上传到 `property-private` bucket（使用 `createClient`，非 service_role）
  - 插入 `property_media` 行
  - 若 DB 插入失败 → 补偿删除 storage 对象
- 若无现有封面，首个成功上传的文件自动获得 `is_cover = true`
- 返回 201（全部成功）或 207（部分失败）+ 已上传列表和拒绝列表

### 3. `src/app/api/properties/[id]/media/[mediaId]/route.ts` (新建)

**PATCH** `/api/properties/[id]/media/[mediaId]`:
- 验证身份 → workspace 成员 → 房源所有权 → 媒体所有权
- Zod 验证 `UpdateMediaInputSchema`（isCover, sortOrder, sceneTag，均为可选）
- 若设置 `isCover = true`：先取消该房源下所有其他媒体的封面标记
- 更新后返回完整媒体记录 + 签名 URL

**DELETE** `/api/properties/[id]/media/[mediaId]`:
- 验证身份 → workspace 成员 → **角色必须是 "owner"**
- 验证房源所有权 → 媒体所有权
- 软删除: `SET deleted_at = now()`（不删除 storage 对象，不重新分配封面）
- 返回 `{ deleted: true, mediaId, deletedAt }`

### 4. `src/features/properties/actions.ts` (追加)

- 新增 `getPropertyMedia(propertyId)` Server Action
- 复用 `getUserWorkspaceId()` 模式
- 验证房源属于当前 workspace
- 查询非删除媒体 + 为每条记录生成签名 URL
- 返回 camelCase 格式数组

## 待处理事项

### `src/lib/types/api.ts` — ErrorCode union 更新

需要 **data-security-engineer** 将以下错误码添加到 `ErrorCode` union 类型:

```typescript
| "MEDIA_LIMIT_EXCEEDED"     // 422
| "MEDIA_UNSUPPORTED_TYPE"   // 415
| "MEDIA_FILE_TOO_LARGE"     // 413
| "MEDIA_VIDEO_DEFERRED"     // 422
```

路由处理器已经使用这些字符串字面量。运行时行为正常，但 TypeScript 不会将它们视为有效的 `ErrorCode`（`response` 体标注了 error code）。此文件不在 property-crm-engineer 的 owned paths 范围内。

## 设计决策

1. **签名 URL 生成**: 所有路由在 GET/PATCH/POST 中生成签名 URL。使用 `createClient()`（非 `createRouteHandlerClient`）进行 storage 操作，以符合任务说明。两个 client 使用相同的 auth cookie，`auth.uid()` 保持一致。

2. **WxH 维度**: 未提取图像尺寸（需要 `sharp`/`image-size` 依赖；当前未安装）。`width` 和 `height` 在响应中返回 `null`。属于 Phase 3 / EXIF 处理的 deferral。

3. **storage 路径格式**: 严格遵循 frozen migration: `{workspace_id}/{user_id}/{uuid}.{ext}`。此格式是 `private.storage_workspace_id()` 和 `private.storage_user_id()` RLS helper 正确解析路径所必需的。

4. **DELETE 所有权检查**: 通过对 `workspace_members.role` 进行查询来验证 workspace owner 身份（查询 role 而非调用 `private.is_workspace_owner()` RPC，因为该函数由 RLS 在内部使用，Route Handler 无法直接访问）。

5. **部分上传失败**: 当部分文件成功、部分失败时返回 HTTP 207。响应包括 `data.media`（已上传）+ `data.rejections`（每个失败都有 index/code/message）。

## 安全检查清单

- [x] 无 service_role 密钥使用
- [x] 所有数据访问通过 `workspace_id` 隔离
- [x] Cookie-only auth
- [x] 拒绝视频 MIME 类型
- [x] 无 SVG/HTML/executable 内容（白名单 MIME）
- [x] 无客户端提供的 workspace_id 或 storage_path
- [x] 签名 URL 在服务端生成
- [x] 软删除（DELETE）
- [x] DELETE 需要 workspace owner 角色
- [x] Compensation（storage 删除）在 DB 插入失败时触发

## 门禁

```
typecheck: PASS
lint:      PASS (仅预存的无关警告)
test:      PASS (256 tests, 11 files)
build:     PASS
```
