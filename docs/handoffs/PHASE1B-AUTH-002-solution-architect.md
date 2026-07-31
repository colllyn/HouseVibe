# PHASE1B-AUTH-002 Solution Architect Handoff

## 状态

只读契约确认完成。发现 1 个 P0 阻塞问题（路由冲突导致构建失败）、1 个 P1 缺少数据库 RPC、2 个 P2 字段缺失需 flag。

## 审查的文件

| 文件 | 版本 | 状态 |
|---|---|---|
| `docs/contracts/domain-model.md` | v1.0 | FROZEN |
| `docs/contracts/api-contract.md` | v1.0 | FROZEN |
| `docs/contracts/rls-contract.md` | v1.0 | FROZEN |
| `docs/PRD.md` | v1.3 | 需求源 |
| `docs/plans/implementation-plan.md` | v1.1 | APPROVED |
| `docs/plans/acceptance-matrix.md` | - | APPROVED |
| `docs/coordination/OWNERSHIP.md` | - | ACTIVE |
| `supabase/migrations/20260730000001..00005` | - | 已部署 |
| `src/app/` 当前路由树 | - | 现场快照 |

---

## 1. Auth Routes 确认

### 1.1 终局 URL 路径（冻结契约权威来源）

| 页面 | 终局 URL | 来源 | 实现形式 |
|---|---|---|---|
| Login | `/login` | PRD 6.3, P1-AUTH-001 | page.tsx |
| Register | `/register` | PRD 6.3, P1-AUTH-001 | page.tsx |
| Logout | 无独立页面 | api-contract 2.3 | POST + redirect |
| Email Confirmation | 无定义 | PRD 7.1: "可作为增强" | Phase 1 不实现 |
| Auth Error | 无定义 | 合同未规定 | 建议 `/auth/error` 但非冻结要求 |
| Onboarding | `/onboarding` | PRD 6.3, P1-AUTH-002 | page.tsx |
| Dashboard | `/dashboard` | PRD 6.3 | page.tsx |
| Invite View | `/join/[inviteToken]` | **PRD 6.3**（权威） | page.tsx |
| Invite Accept | 无独立页面 | api-contract 2.6 | POST `/api/invites/:token/accept` |
| Admin Invites | `/admin/invites` | PRD 6.3, P1-ADMIN-004 | page.tsx |

### 1.2 `/join/[inviteToken]` vs `/invites/[token]` 歧义解决

**决心：PRD 是权威来源。** `可以路径 = /join/[inviteToken]`。

证据链：
- PRD 6.3 路由树：`├─ /join/[inviteToken]`
- PRD 7.1 功能：`支持邀请链接入口 /join/[inviteToken]`
- api-contract 3.9 `CreateInviteInputSchema` 响应示例：`"url": "https://housevibe.com/join/generated-invite-token"`
- implementation-plan P1-AUTH-001 输出：`/join/[inviteToken] 页面（受邀加入流程）`

`/invites/[token]` 出现在 implementation-plan 的 API 路径 `POST /api/invites/:token/accept` **这是 API 路径，不是页面路径**。命名规则：页面 URL 使用 `join`，API 路径使用 `invites`。这与 4. 节数据命名约定一致（API 路径与页面 URL 可以不同）。

---

## 2. 路由冲突（P0 阻塞）

### 2.1 现状

```
src/app/
  page.tsx                          -> /         (landing page)
  (dashboard)/layout.tsx            -> /         路由组布局（AppShell）
  (dashboard)/page.tsx              -> /         ← CONFLICT with page.tsx above
  dashboard/layout.tsx              -> /dashboard 布局（AppShell 副本）
  dashboard/page.tsx                -> /dashboard ← ALSO CONFLICT with group page
```

Next.js 不允许同一 URL 有两个 `page.tsx`。`(dashboard)` 是路由组，不添加 URL 段，
因此 `(dashboard)/page.tsx` 解析为 `/`，与 `src/app/page.tsx` 冲突。

**当前构建极大概率已失败。**

### 2.2 所有权

| 文件 | Owner（OWNERSHIP.md） |
|---|---|
| `src/app/(dashboard)/layout.tsx` | mobile-ui-engineer |
| `src/app/(dashboard)/page.tsx` | mobile-ui-engineer |
| `src/app/dashboard/layout.tsx` | **不归任何人所有** |
| `src/app/dashboard/page.tsx` | **不归任何人所有** |
| `src/app/page.tsx` | mobile-ui-engineer（隐含，`src/app/layout.tsx` 已列出） |

### 2.3 解决方案

**推荐方案（符合 PRD 6.3 路由树和 AppShell 设计）：**

```
src/app/
  page.tsx                                  -> /         (landing)
  (auth)/layout.tsx                         -> 最小认证布局
  (auth)/login/page.tsx                     -> /login
  (auth)/register/page.tsx                  -> /register
  (dashboard)/layout.tsx                    -> AppShell（全局认证壳）
  (dashboard)/dashboard/page.tsx            -> /dashboard
  join/[inviteToken]/page.tsx               -> /join/[inviteToken]
  onboarding/page.tsx                       -> /onboarding
```

**删除的文件清单：**

1. **删除** `src/app/(dashboard)/page.tsx` — 与 `src/app/page.tsx` 冲突（同为 `/`）
2. **删除** `src/app/dashboard/layout.tsx` — `(dashboard)/layout.tsx` 副本
3. **删除** `src/app/dashboard/page.tsx` 内容 — 内容移至 `src/app/(dashboard)/dashboard/page.tsx`

**谁执行：** data-security-engineer（拥有 `(auth)/**`、`onboarding/**`、middleware，此次需触碰 `(dashboard)/dashboard/**`）。
需与 mobile-ui-engineer 协调 `(dashboard)/layout.tsx` 保持不变及 OWNERSHIP.md 更新。

**OWNERSHIP.md 需更新：**
- `src/app/(dashboard)/page.tsx` → `src/app/(dashboard)/dashboard/page.tsx`（mobile-ui-engineer）
- 新增 `src/app/(dashboard)/dashboard/**` → mobile-ui-engineer

---

## 3. Workspace 行为（来自冻结合同）

### 3.1 路由逻辑

| 条件 | 目标 URL | 来源 |
|---|---|---|
| 未登录，访问受保护路由 | 302 → `/login` | P1-AUTH-001 验收标准 |
| 已登录，0 active memberships，未完成 onboarding | `/onboarding` | AC-AUTH-010, P1-AUTH-002 |
| 已登录，0 active memberships，已完成 onboarding | `/onboarding`（需检查） | 合同未覆盖此边界 |
| 已登录，>=1 active memberships，未完成 onboarding | `/onboarding` | AC-AUTH-010 |
| 已登录，>=1 active memberships，已完成 onboarding | `/dashboard` | AC-AUTH-005, AC-AUTH-011 |
| 已登录，>=2 active memberships | `/dashboard` | 合同未规定 workspace switcher |

### 3.2 关键判定

- **"active" membership 定义：** `workspace_members.status = 'active'`。`inactive` 和 `invited` 不算有效成员关系。`is_workspace_member()` 已实现此逻辑（`status = 'active'`）。
- **Onboarding "完成" 判定：** 合同未明确定义完成条件。P1-AUTH-002 输出："首次登录自动创建独立 workspace" + "完成 onboarding 后进入 dashboard"。隐含逻辑：`workspace_members` 存在 `status = 'active'` 的记录即为已完成。
- **"Current workspace" 持久化：** Phase 1 不需要。无 workspace switcher。
- **Multi-workspace：** 合同未覆盖。Phase 1 默认行为：取第一个 active membership（任意顺序）。

### 3.3 Middleware 伪代码

```typescript
// middleware.ts 路由保护逻辑
if (!session) {
  return redirect('/login');
}
if (needsOnboarding(user)) {
  return redirect('/onboarding');
}
// continue to requested page (dashboard, properties, etc.)
```

`needsOnboarding()` 条件：`is_workspace_member()` 对所有 workspace 返回 false 且 0 active memberships。

---

## 4. Invitation Model 确认

### 4.1 冻结名称

| 属性 | 冻结值 | 合同来源 |
|---|---|---|
| 表名 | `invitation_links` | domain-model 2.18, PRD 8.2, PRD 8.3 索引 |
| Status enum | `active`, `expired`, `revoked` | domain-model 2.18, PRD 7.1 |
| Token 字段 | `token_hash` (TEXT, MEDIUM sensitivity) | domain-model 2.18, PRD 8.2 |
| Expiry 字段 | `expires_at` (TIMESTAMPTZ, nullable) | domain-model 2.18 |
| Created By | `created_by` (UUID, YES) | domain-model 2.18 |
| 页面 URL | `/join/[inviteToken]` | PRD 6.3（权威） |
| API 路径（查看邀请） | `GET /api/invites/:token` | api-contract 2.5 |
| API 路径（接受邀请） | `POST /api/invites/:token/accept` | api-contract 2.6 |
| Admin API 路径 | `/api/admin/invites` | api-contract 3.8-3.10 |
| Admin 页面 | `/admin/invites` | PRD 6.3, P1-ADMIN-004 |

### 4.2 字段缺失（需 flag）

| 缺失字段 | 影响 | 优先级 |
|---|---|---|
| `role` | 邀请接受后角色默认为 `member`。无法通过链接邀请 owner。合同未要求此能力。 | P2 — 不阻塞 Phase 1 |
| `accepted_by` / `accepted_at` | 无法追溯哪个用户接受了邀请。仅通过 `workspace_members` 间接记录。used_count 跟踪总接受次数。 | P2 — 不阻塞 Phase 1 |
| `recipient_email` | **不需要**。邀请是链接型（link-based），非邮件型。受邀人接受时已认证，身份来自 `auth.users.email`。 | N/A |

### 4.3 接受邀请 RPC（未冻结）

**api-contract 2.6 定义了 API 端点但冻结合同中不存在对应的数据库 RPC。**

需在本 Phase 创建。建议命名：`accept_invitation(invite_token_text text)` 或内联在 Route Handler 中以事务方式执行。

**原子操作（单事务）：**

1. 根据 `invite_token_text` 通过 HMAC (INVITE_TOKEN_SECRET) 计算 `token_hash`
2. SELECT ... FOR UPDATE 锁定 invitation_links 行
3. 验证：`status = 'active'`、`expires_at > now()`、`(max_uses IS NULL OR used_count < max_uses)`
4. `UPDATE invitation_links SET used_count = used_count + 1`（如达上限则 SET status = 'expired'）
5. `INSERT INTO workspace_members (workspace_id, user_id, role, status) VALUES (target_workspace_id, auth.uid(), 'member', 'active')` — 若 `UNIQUE(workspace_id, user_id)` 冲突则 `ON CONFLICT UPDATE status = 'active'`（重新激活已存在的 invited/inactive 记录）
6. 返回 workspace 信息

**安全要求（api-contract 3.9）：**
- Token 明文仅在管理员创建时返回一次
- 数据库仅保存 SHA-256 HMAC hash
- 验证用 `INVITE_TOKEN_SECRET`（32+ 字符，已在 `error-and-env-conventions.md` 冻结）

### 4.4 命名一致性汇总

无阻塞性命名矛盾。一条文档差异需要 flag：

| 对比项 | 值 A | 值 B | 结论 |
|---|---|---|---|
| Page URL | PRD: `/join/[inviteToken]` | Task: `/invites/[token]` | **PRD 为权威。** Task 描述中的 `/invites/[token]` 应为 API 路径 `/api/invites/:token` |
| API param name | api-contract: `:token` | Page param: `[inviteToken]` | Next.js convention. `[inviteToken]` → param.inviteToken 暴露给 Route Handler 前作为 `:token` |

---

## 5. Email Confirmation（Phase 1 不实现）

PRD 7.1 明确："邮箱验证码或 Magic Link **可作为增强**"。

**决心：Phase 1-B2 不实现邮箱确认。**

- 无回调 URL 定义
- 无 PKCE/code 方案定义
- 无 redirect-after-confirm 路径定义
- Supabase Auth 默认行为由 `supabase/config.toml` 控制。`enable_confirmations = false` 适用于此 Phase。

**若未来启用：** Supabase 自动处理 `/auth/callback?code=...`。确认后默认重定向到站点 URL。需额外配置可自定义。

---

## 6. P0/P1 歧义清单

### P0（阻塞 Phase 1-B2）

| ID | 问题 | 影响 | 处理建议 |
|---|---|---|---|
| **ROUTE-001** | `(dashboard)/page.tsx` 与 `page.tsx` 均映射到 `/` — Next.js 构建错误 | 阻塞构建 | 见第 2 节解决方案。data-security-engineer 在执行 P1-AUTH-001/002 时清理。 |

### P1（可在 Phase 内解决，不阻塞启动）

| ID | 问题 | 影响 | 处理建议 |
|---|---|---|---|
| **INVITE-001** | 冻结合同未定义 `accept_invitation` RPC。api-contract 2.6 定义了端点但无数据库实现 | 阻塞 `/invites/:token/accept` 实现 | 需要新 migration。data-security-engineer 创建 RPC。参见第 4.3 节建议规范。 |

### P2（记录留待未来）

| ID | 问题 | 影响 | 处理建议 |
|---|---|---|---|
| **INVITE-002** | `invitation_links` 缺少 `role` 字段。所有受邀人默认获得 `member` 角色。 | 无法通过邀请授予 owner 角色。MVP 可接受。 | Phase 2+ 添加 |
| **INVITE-003** | `invitation_links` 缺少 `accepted_by`/`accepted_at` 字段。接受仅通过 `workspace_members` 间接记录。 | 无法审计邀请使用的来源链。MVP 可接受。 | Phase 2+ 添加 |
| **WS-001** | 合同未定义多 workspace 用户行为。无 workspace switcher。 | 仅影响受邀加入第二个 workspace 的用户。 | 首个 active membership（任意顺序）为默认。Phase 2 添加 switcher。 |

---

## 7. Invitation Table 设计确认

### 7.1 终局字段（基于冻结契约）

```sql
CREATE TYPE public.invite_status AS ENUM ('active', 'expired', 'revoked');

CREATE TABLE public.invitation_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL,                    -- SHA-256 HMAC of invite token (NOT plaintext)
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  target_workspace_id UUID REFERENCES public.workspaces(id),
  max_uses INTEGER,                             -- NULL = unlimited
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,                       -- NULL = never expires
  status public.invite_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 索引（domain-model 2.18 + PRD 8.3）
CREATE INDEX idx_invitation_links_status_expires
  ON public.invitation_links(status, expires_at);
```

### 7.2 字段决策说明

| 字段 | 存在？ | 说明 |
|---|---|---|
| `id` (UUID PK) | YES | 所有实体标准 |
| `token_hash` (TEXT) | YES | Token 明文不存储。HMAC-SHA256(token, INVITE_TOKEN_SECRET) |
| `created_by` (UUID) | YES | 谁创建了邀请 |
| `target_workspace_id` (UUID, nullable) | YES | nullable 允许未来无绑定 workspace 的通用邀请 |
| `max_uses` (INTEGER, nullable) | YES | NULL = unlimited |
| `used_count` (INTEGER) | YES | 每次接受原子递增 |
| `expires_at` (TIMESTAMPTZ, nullable) | YES | NULL = 永不过期 |
| `status` (enum) | YES | active/expired/revoked |
| `created_at`, `updated_at` | YES | 标准审计 |
| `recipient_email` | **NO** | 邀请是链接型，接受时用户已认证 |
| `role` | **NO** | 默认 'member'。见 P2 INVITE-002 |
| `accepted_by`, `accepted_at` | **NO** | 通过 workspace_members 间接跟踪。见 P2 INVITE-003 |

### 7.3 接受流程中的 Email 匹配

接受邀请时，无需将 `recipient_email` 与 `auth.users.email` 匹配，因为：

1. 邀请是 URL 链接，可由任何认证用户使用
2. `POST /api/invites/:token/accept` 需要认证（api-contract 2.6）
3. 当前认证用户身份由 `auth.uid()` 在 RPC 中获取
4. 匹配是隐式的：token 有效 → user 加入 workspace。无 email 参与匹配。

如果未来需要 **email-gated 邀请**（只有特定邮箱可接受），则需要在 `invitation_links` 添加 `recipient_email` 字段并在接受时验证。

---

## 8. 文件所有权与并行性

### 8.1 Phase 1-B2 涉及的所有权

| 目录 | Owner | 本 Phase 操作 |
|---|---|---|
| `src/app/(auth)/**` | data-security-engineer | CREATE |
| `src/features/auth/**` | data-security-engineer | CREATE |
| `src/lib/supabase/**` | data-security-engineer | UPDATE（middleware, session） |
| `src/app/onboarding/**` | data-security-engineer | CREATE |
| `src/app/(dashboard)/layout.tsx` | **mobile-ui-engineer** | 读取（不修改） |
| `src/app/(dashboard)/page.tsx` | mobile-ui-engineer | **DELETE（需协调）** |
| `src/app/(dashboard)/dashboard/page.tsx` | **无人拥有** | **需分配**（建议 mobile-ui-engineer） |
| `src/app/dashboard/layout.tsx` | **无人拥有** | **DELETE** |
| `src/app/dashboard/page.tsx` | **无人拥有** | **DELETE/MOVE** |
| `src/middleware.ts` | **无人拥有** | **CREATE（需分配）** |
| `supabase/migrations/` | data-security-engineer | CREATE（invitation_links 表 + accept RPC） |
| `src/app/api/auth/**` | data-security-engineer | CREATE |
| `src/app/api/invites/**` | data-security-engineer | CREATE |
| `src/app/join/[inviteToken]/**` | data-security-engineer | CREATE |

### 8.2 并行工作影响

data-security-engineer **不应**与 mobile-ui-engineer 并行修改 `(dashboard)/layout.tsx`。
data-security-engineer 在创建 `(dashboard)/dashboard/` 时应通知 mobile-ui-engineer 更新 OWNERSHIP.md。

其他路径均可独立并行（`(auth)/**`、`api/auth/**`、`api/invites/**`、`onboarding/**`、`supabase/migrations/**` 与其他 Agent 不冲突）。

---

## 9. Contract Amendment Required

### 9.1 OWNERSHIP.md 更新（必需）

```diff
-| mobile-ui-engineer | ...src/app/(dashboard)/layout.tsx`、`src/app/(dashboard)/page.tsx`...
+| mobile-ui-engineer | ...`src/app/(dashboard)/layout.tsx`、`src/app/(dashboard)/dashboard/page.tsx`...
```

### 9.2 RLS Contract 补充（建议）

`rls-contract.md` 第 4.18 节 `invitation_links` 仅有策略矩阵，无具体 SQL。需在本 Phase 补充。

### 9.3 Domain Model 补充（P2，可选）

如实现 email-gated 或 role-gated 邀请，需通过 ADR 向 domain-model 2.18 添加字段。

---

## 10. Summary

| 判定 | 数量 | 明细 |
|---|---|---|
| 契约一致性 | 通过 | 无阻塞性命名或语义矛盾 |
| P0 阻塞 | **1** | ROUTE-001: `(dashboard)/page.tsx` 与 `page.tsx` 路由冲突 |
| P1 需在本 phase 解决 | **1** | INVITE-001: `accept_invitation` RPC 不存在 |
| P2 留待未来 | **3** | INVITE-002 (role), INVITE-003 (accepted_by), WS-001 (multi-workspace) |
| 冻结契约无需修改 | 是 | 仅 OWNERSHIP.md 需更新 |
| 可安全开始实现 | **是** | P0 阻塞项已在 handoff 中提供解决方案，data-security-engineer 在执行 P1-AUTH-001 时一并清理 |
