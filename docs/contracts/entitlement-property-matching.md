# Entitlement Addendum: property_matching

- 文档类型：Contract Addendum
- 版本：2.0
- 状态：SUPERSEDED (2026-08-09) — 匹配已调整为 Workspace 核心功能
- 基准合同：matching-contract.md §10 (updated)
- 决议人：solution-architect
- 日期：2026-08-09

---

## 1. 状态变更

**匹配功能已调整为 Workspace 核心功能（2026-08-09）。**

`property_matching` feature entitlement 不再作为匹配 API 的门控。
认证 workspace 成员即可使用匹配功能，无需额外 entitlement。

### 1.1 Feature Key 保留

`property_matching` feature key 仍保留在 `public.feature_key` 数据库 enum 中，
`feature_entitlements` 表的历史记录不变。仅 API-level enforcement 已移除。

以下为原合同内容（历史参考）：

| API 路由 | 方法 | 校验点 |
|---|---|---|
| `/api/matches/calculate` | POST | Route Handler 入口 |
| `/api/clients/:id/matches` | GET | Route Handler 入口 |
| `/api/properties/:id/matches` | GET | Route Handler 入口 |
| 匹配状态变更（dismiss） | PATCH | Route Handler 入口 |

### 1.2 未授权响应

```json
{
  "data": null,
  "error": {
    "code": "FEATURE_NOT_ALLOWED",
    "message": "需要 property_matching 权限"
  }
}
```

HTTP Status: `403 Forbidden`

### 1.3 默认授权

PRD §3.3 规定普通注册中介默认拥有 `property_matching`。注册时自动授予。

### 1.4 撤销行为

系统管理员撤销 `property_matching` 后：
- 用户调用匹配 API → 403 FEATURE_NOT_ALLOWED
- 客户端详情页匹配 tab → 不显示或显示"无权限"提示
- 房源详情页匹配 tab → 同上
- 已有的 `property_matches` 记录保留（RLS 通过 workspace 隔离），但 API 拒绝访问

---

## 2. UI 行为

| 角色 | entitlement 状态 | 匹配入口 | 行为 |
|---|---|---|---|
| Owner | active | 显示 | 正常使用 |
| Member | active | 显示 | 正常使用 |
| Owner/Member | revoked/expired | **隐藏或禁用** | 导航不显示匹配入口；直接访问 URL 时服务端返回 403 |
| Admin | active | 显示 | 按 workspace 权限正常使用 |

UI 隐藏仅用于体验优化；后端独立校验不可省略。

---

## 3. Workspace 隔离

- entitlement 绑定到 `user_id`，不绑定到 `workspace_id`
- 同一用户在所有 workspace 共享 entitlements
- 用户 A 的 `property_matching` 不得被用户 B 使用
- 撤销一个用户的 entitlement 不影响同 workspace 其他用户

---

## 4. 验收标准

| ID | 验收条件 | 测试类型 |
|---|---|---|
| ENT-MATCH-001 | 默认注册用户拥有 property_matching，可调用匹配 API | Integration |
| ENT-MATCH-002 | 撤销 property_matching 后，API 返回 403 FEATURE_NOT_ALLOWED | Integration |
| ENT-MATCH-003 | 未授权用户直接访问 URL `/api/matches/calculate` 被拒绝 | Integration |
| ENT-MATCH-004 | 撤销后 UI 导航隐藏匹配入口 | E2E |
| ENT-MATCH-005 | 用户 A 的 entitlement 不被用户 B 使用 | RLS |
| ENT-MATCH-006 | calculate、list、dismiss 三个端点均校验 entitlement | Integration |

---

## 5. 不可破坏的约束

- 前端隐藏 + 服务端校验 + RLS 三层防护
- 不得仅依赖 UI 隐藏
- 不得用 `getSession()` 结果代替 entitlement 数据库校验
- 撤销必须立即生效（不依赖 JWT 过期）
