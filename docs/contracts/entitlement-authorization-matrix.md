# HouseVibe Entitlement & Authorization Matrix

| 属性 | 值 |
|---|---|
| 文档名称 | entitlement-authorization-matrix |
| 版本 | 1.0 |
| 状态 | FROZEN FOR PHASE 1 |
| Owner | solution-architect |
| 依赖 | PRD v1.3, domain-model v1.0, rls-contract v1.0 |
| 最后更新 | 2026-07-30 |

---

## 1. Feature Key 定义

| Feature Key | 含义 | 默认授予 |
|---|---|---|
| `ai_data_extraction` | AI 结构化录入（房源/客户） | 所有注册用户 |
| `semantic_search` | 自然语言搜索解析 | 所有注册用户 |
| `property_matching` | 房客智能匹配 | 所有注册用户 |
| `shared_property_pool` | 合作共享库访问 | 所有注册用户 |
| `content_factory` | AI 自媒体内容工厂 | **仅管理员授予** |

---

## 2. 默认权限矩阵

| 功能 | 普通注册中介 | 指定内容用户 | 系统管理员 |
|---|---|---|---|
| 房源 CRUD | 本 workspace | 本 workspace | 按 workspace 权限 |
| 客户 CRUD | 本 workspace | 本 workspace | 按 workspace 权限 |
| `ai_data_extraction` | 默认 | 默认 | 具备 |
| `semantic_search` | 默认 | 默认 | 具备 |
| `property_matching` | 默认 | 默认 | 具备 |
| `shared_property_pool` | 默认 | 默认 | 管理平台规则 |
| `content_factory` | **禁止** | 需授权 | 具备（可管理授权） |
| 管理员功能 | 禁止 | 禁止 | 具备 |

**注意**：虽然 `ai_data_extraction`、`semantic_search`、`property_matching`、`shared_property_pool` 默认授予所有用户，但数据库 schema 仍通过 `feature_entitlements` 表管理，以便未来支持差异化套餐和付费功能。

---

## 3. 三层守卫详解

### 3.1 content_factory

三层守卫要求：

#### Layer 1: 前端 UI

| 守卫点 | 方式 | 实现位置 |
|---|---|---|
| 底部导航"内容"入口 | 条件渲染，检查 `has_feature('content_factory')` | `mobile-ui-engineer` 的布局组件 |
| 桌面侧栏"内容工作台" | 条件渲染 | `mobile-ui-engineer` 的布局组件 |
| 房源详情"生成内容"按钮 | 条件渲染 | `property-crm-engineer` 的房源详情页 |
| `/content` 路由访问 | Middleware 或 Layout 检查 | `ai-deepseek-engineer` 的 layout.tsx |
| 权限加载期间 | MUST NOT 短暂闪现未授权菜单 | 使用 loading skeleton 或 null |

#### Layer 2: 服务端 (Route Handler / Server Action / Server Component)

| 守卫点 | 方式 |
|---|---|
| GET/POST /api/ai/generate-content | Route Handler 入口检查 `has_feature('content_factory')` |
| POST /api/ai/content-feedback | Route Handler 入口检查 |
| Server Component 数据获取 | Server Component 渲染前检查 |
| Layout.tsx 重定向 | 未授权用户访问 `/content` 时重定向到 `/dashboard` |

#### Layer 3: 数据库 (RLS)

| 表 | 检查方式 |
|---|---|
| `content_projects` | `has_feature('content_factory') AND is_workspace_member(workspace_id)` |
| `content_versions` | 同上 |
| `publishing_records` | 同上 |
| Storage: `content-assets` | 仅 content_factory 用户可写入 |

#### 撤权行为

撤销 `content_factory` 后：
- `has_feature('content_factory')` 立即返回 false。
- 前端导航消失（下次渲染时）。
- API 返回 403。
- RLS 拒绝 content 表访问。
- 已创建内容保留，不可创建新内容。

#### 过期行为

`expires_at` 过期后：
- `has_feature` 返回 false（`expires_at IS NULL OR expires_at > now()` 条件失败）。
- 行为同撤权。
- 管理员可延长 `expires_at` 恢复权限。

---

### 3.2 shared_property_pool

虽然默认授予，但共享房源的**发布**由房源所有者单独控制：

| 守卫点 | 方式 |
|---|---|
| 上架/下架共享按钮 | `is_workspace_owner` 检查（仅 Owner 可操作） |
| POST/DELETE /api/properties/:id/share | 验证 `is_workspace_owner` |
| 共享房源脱敏视图 | 只返回 `is_shared = true AND status = 'available' AND 未过期` |
| 外部用户读取 | 通过共享视图，不包括敏感字段 |

---

### 3.3 property_matching

| 守卫点 | 方式 |
|---|---|
| POST /api/matches/calculate | 验证 `has_feature('property_matching')` |
| 匹配结果 RLS | `is_workspace_member` 隔离 |

---

### 3.4 ai_data_extraction

| 守卫点 | 方式 |
|---|---|
| POST /api/ai/extract-property | 验证 `has_feature('ai_data_extraction')` |
| POST /api/ai/extract-client | 验证 `has_feature('ai_data_extraction')` |
| POST /api/ai/analyze-property-images | 验证 `has_feature('ai_data_extraction')` |

---

### 3.5 semantic_search

| 守卫点 | 方式 |
|---|---|
| POST /api/ai/parse-property-search | 验证 `has_feature('semantic_search')` |

---

## 4. 管理员规则

### 4.1 system_admin 数据来源

- `system_admins` 表为唯一权威来源。
- 初始管理员可通过 `INITIAL_SYSTEM_ADMIN_EMAIL` 环境变量在首次部署时创建。
- 运行期权限以 `system_admins` 表记录为准。
- MUST NOT 使用 `user_metadata` 或 JWT `app_metadata` 存储授权。
- JWT claim 仅用于低频变化权限的辅助判断，不替代数据库查询。

### 4.2 Admin 页面/API 权限

- 所有 `/admin/*` 页面和 `/api/admin/*` API MUST 验证 `is_system_admin()`。
- `system_admins` 表的写入仅由 service_role 执行。

### 4.3 授权/撤权/过期/禁用流程

#### 授予 content_factory

```text
System Admin 进入 /admin/feature-entitlements
→ 搜索目标用户
→ 选择 feature = content_factory
→ 可选设置 expires_at
→ POST /api/admin/feature-entitlements
→ 服务端验证 is_system_admin()
→ 检查是否已存在 active entitlement → 409
→ 创建 feature_entitlements 记录 (status = active)
→ 写入 audit_logs
```

#### 撤销 content_factory

```text
System Admin 进入 /admin/feature-entitlements
→ 找到目标用户
→ PATCH /api/admin/feature-entitlements/:id { status: "revoked" }
→ 服务端验证 is_system_admin()
→ 更新 status = revoked, revoked_at = now()
→ 写入 audit_logs
→ 用户下次请求立即失去权限（has_feature 返回 false）
```

#### 禁用账号

```text
System Admin 进入 /admin/users/:id
→ PATCH { disabled: true }
→ 用户 Session 失效或下次请求被拒绝
→ 写入 audit_logs
```

### 4.4 审计日志要求

以下操作 MUST 写入 `audit_logs`：
- Feature 授予（granted_by, user_id, feature, expires_at）
- Feature 撤销（revoked_at）
- Feature 延期（修改 expires_at）
- 账号禁用/启用
- 管理员模型切换
- 成本熔断恢复
- 合规词库修改
- 邀请链接创建/撤销

---

## 5. 授权检查实现位置

| Feature | 前端检查 | 服务端检查 | RLS 检查 |
|---|---|---|---|
| `ai_data_extraction` | 无（默认开放） | Route Handler | N/A（不直接限制表访问） |
| `semantic_search` | 无（默认开放） | Route Handler | N/A |
| `property_matching` | 无（默认开放） | Route Handler | property_matches 表 |
| `shared_property_pool` | 无（默认开放） | API 返回脱敏数据 | shared_properties_view |
| `content_factory` | 导航/按钮/路由 | Layout + Route Handler + Server Action | content_projects, content_versions, publishing_records, content-assets Storage |

---

## 6. 系统管理员权限汇总

| 能力 | 权限 |
|---|---|
| 查看所有用户和 workspace | 是 |
| 授予/撤销/延期 feature_entitlements | 是 |
| 创建/撤销邀请链接 | 是 |
| 禁用/启用账号 | 是 |
| 查看 AI 用量与成本（全平台） | 是 |
| 设置用户级 AI 限制 | 是 |
| 成本熔断恢复 | 是 |
| DeepSeek 主备模型切换 | 是 |
| 合规词库管理 | 是 |
| AI 纠错分析 | 是 |
| 查看 audit_logs | 是 |
| 操作其他用户私有数据 | 否（除管理员功能外） |
| 删除 audit_logs | 否 |

---

## 7. 权限验证流程伪代码

```ts
// Route Handler 中的标准权限检查流程
async function checkAIAccess(feature: FeatureKey) {
  // 1. 身份验证
  const user = await getAuthenticatedUser();
  if (!user) throw new AppError('UNAUTHENTICATED', 401);

  // 2. 功能授权
  const hasAccess = await hasFeature(user.id, feature);
  if (!hasAccess) {
    if (feature === 'content_factory') {
      throw new AppError('CONTENT_FACTORY_NOT_ALLOWED', 403);
    }
    throw new AppError('FEATURE_NOT_ALLOWED', 403);
  }

  // 3. Workspace 成员验证 (如适用)
  if (workspaceId && !(await isWorkspaceMember(user.id, workspaceId))) {
    throw new AppError('WORKSPACE_ACCESS_DENIED', 403);
  }

  return user;
}
```

---

## 8. 依赖与归属

- `feature_entitlements` 表和 `has_feature()` 函数：**data-security-engineer**
- Admin 根布局和用户/entitlement 管理页面：**data-security-engineer**
- Content Factory 授权检查（服务端）：**ai-deepseek-engineer**
- Content Factory 前端导航守卫：**mobile-ui-engineer** (布局) + **ai-deepseek-engineer** (content layout)
- 共享房源授权逻辑：**property-crm-engineer**
- `is_shared` 与 `allow_marketing_reuse` 独立授权检查：**property-crm-engineer**

---

## 9. Open Questions

无。所有影响 Phase 1 的问题均已在 HouseVibe Phase 0 v1.0 中冻结。
