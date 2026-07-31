# PHASE1B-DB-RLS-001 Handoff

| 属性 | 值 |
|---|---|
| Task ID | PHASE1B-DB-RLS-001 |
| Agent | data-security-engineer |
| 状态 | COMPLETED (with caveat) |
| 日期 | 2026-07-30 |

---

## 1. 修改的文件清单

### supabase/ (工作区路径)

| 文件 | 操作 | 说明 |
|---|---|---|
| `supabase/config.toml` | 创建/配置 | 本地开发配置，project_id = "housevibe-local" |
| `supabase/.gitignore` | 创建 | Supabase 忽略规则 |
| `supabase/seed.sql` | 创建 | 空种子文件，仅含注释 |
| `supabase/migrations/20260730000001_foundation_extensions_and_schemas.sql` | 创建 | 扩展、枚举、私有 schema |
| `supabase/migrations/20260730000002_profiles_and_auth_trigger.sql` | 创建 | profiles 表、auth trigger、updated_at 工具 |
| `supabase/migrations/20260730000003_workspaces_and_members.sql` | 创建 | workspaces、workspace_members 表、索引 |
| `supabase/migrations/20260730000004_audit_logs.sql` | 创建 | audit_logs 表、索引 |
| `supabase/migrations/20260730000005_foundation_rls_and_helpers.sql` | 创建 | RLS helpers、RPC、所有 RLS policies |

### src/ (工作区路径)

| 文件 | 操作 | 说明 |
|---|---|---|
| `src/lib/supabase/database.types.ts` | 创建 | 手动生成的 Database 类型定义 |

---

## 2. Schema 摘要

### 表（4 张）

| 表名 | 主键 | 关键约束 | 索引 |
|---|---|---|---|
| `public.profiles` | `id` (UUID, = auth.users.id) | -- | -- |
| `public.workspaces` | `id` (UUID) | FK→profiles | `idx_workspaces_owner(owner_user_id)` |
| `public.workspace_members` | `id` (UUID) | UNIQUE(workspace_id, user_id), FK→workspaces, FK→profiles | `idx_workspace_members_user_workspace_status(user_id, workspace_id, status)` |
| `public.audit_logs` | `id` (UUID) | FK→workspaces, FK→profiles | `idx_audit_logs_entity`, `idx_audit_logs_actor`, `idx_audit_logs_workspace` |

### 枚举（2 个）

- `public.workspace_role`: `'owner'`, `'member'`, `'external_collaborator'`
- `public.member_status`: `'active'`, `'inactive'`, `'invited'`

### Schema

- `private`: 存放 helper 函数和内部逻辑，已撤销 public/anon/authenticated 的 USAGE 权限

### 设计决策执行

| 决策 | 执行情况 |
|---|---|
| profiles.id = auth.users.id | handle_new_user trigger 显式设置 `NEW.id` |
| is_system_admin() 桩函数 | 返回 `select false`，Phase 1-C 替换 |
| audit_logs SELECT 无策略 | 仅 service_role 可读 |
| workspace_members 无 updated_at | 已省略 |
| workspace_members UPDATE/DELETE 用直接 EXISTS | 未调用 is_workspace_member，避免递归 |

---

## 3. Function 清单

### Helper Functions（private schema，SECURITY DEFINER）

| 函数 | 签名 | 类型 | 说明 |
|---|---|---|---|
| `private.is_workspace_member` | `(workspace_uuid uuid) -> boolean` | STABLE SQL | 检查当前用户是否是指定 workspace 的活跃成员 |
| `private.is_workspace_owner` | `(workspace_uuid uuid) -> boolean` | STABLE SQL | 检查当前用户是否是指定 workspace 的 owner |
| `private.is_system_admin` | `() -> boolean` | STABLE SQL | 桩函数，始终返回 false |

### Trigger Functions

| 函数 | 触发条件 | 说明 |
|---|---|---|
| `private.handle_new_user()` | AFTER INSERT ON auth.users | 自动创建 profiles 行 |
| `private.set_updated_at()` | BEFORE UPDATE ON profiles, workspaces | 自动更新 updated_at 列 |

### RPC Functions（public schema）

| 函数 | 签名 | 返回 | 说明 |
|---|---|---|---|
| `public.create_workspace_with_owner` | `(workspace_name text, workspace_city text DEFAULT NULL, workspace_business_type text DEFAULT 'residential_lease')` | jsonb | 原子创建 workspace + owner membership |

---

## 4. RLS Policy 清单

### profiles（3 个策略）

| 策略名 | 操作 | 条件 |
|---|---|---|
| "Users can read own profile" | SELECT | `id = (select auth.uid())` |
| "System admins can read all profiles" | SELECT | `private.is_system_admin()` (桩) |
| "Users can update own profile" | UPDATE | `id = (select auth.uid())` WITH CHECK `id = (select auth.uid())` |

### workspaces（2 个策略）

| 策略名 | 操作 | 条件 |
|---|---|---|
| "Members can read own workspaces" | SELECT | `private.is_workspace_member(id) OR private.is_system_admin()` |
| "Owner can update workspace" | UPDATE | `private.is_workspace_owner(id)` WITH CHECK `private.is_workspace_owner(id)` |

### workspace_members（2 个策略）

| 策略名 | 操作 | 条件 |
|---|---|---|
| "Members can see own memberships" | SELECT | 自己的记录 OR 同 workspace owner 可读全组成员（直接 EXISTS） |
| "Owner can manage members" | UPDATE | 同 workspace owner（直接 EXISTS，无递归） |

### audit_logs（0 个策略）

- 无 SELECT/INSERT/UPDATE/DELETE 策略
- 仅 service_role 可读写
- Phase 1-C 将添加 `is_system_admin()` SELECT 策略

### 默认拒绝验证

- 所有 4 张表已启用 RLS（`alter table ... enable row level security`）
- 无匹配策略时返回 0 行

---

## 5. 验证命令和结果

| 命令 | 结果 | 备注 |
|---|---|---|
| `npm run typecheck` | PASS | TypeScript strict 无错误 |
| `npm run lint` | PASS | No ESLint warnings or errors |
| `npm run test` | PASS | 56 tests passed (4 files) |
| `npx supabase start` | FAIL | Docker registry 不可达（TLS handshake timeout） |
| `npx supabase db lint` | SKIP | 数据库未启动 |
| `npx supabase gen types` | SKIP | 数据库未启动，手动创建了 database.types.ts |

### 环境限制说明

当前执行环境的 Docker registry (docker.io, ghcr.io) 存在 TLS 连接问题，导致无法拉取 Supabase 所需的 PostgreSQL、Kong、realtime 等容器镜像。已成功拉取 4/12+ 个镜像：
- postgrest/postgrest:v14.15
- supabase/gotrue:v2.193.0
- ghcr.io/supabase/mailpit:v1.30.2
- public.ecr.aws/supabase/postgres-meta:v0.96.6

受阻镜像：supabase/postgres:17.6.1.143, supabase/kong, supabase/realtime, supabase/edge-runtime, supabase/logflare, timberio/vector 等。

所有 Migration 文件已严格按照冻结契约编写。当网络恢复后，执行 `supabase start && supabase db reset` 即可应用。

---

## 6. Security Findings

### 通过项

1. **无硬编码密钥**：config.toml 中所有 OAuth secret 使用 `env(VAR_NAME)`，无明文密钥
2. **SECURITY DEFINER 函数安全**：
   - 所有 helper 函数使用 `SET search_path = ''`
   - 所有表名完整限定（`public.table_name`）
   - `extensions.gen_random_uuid()` 全限定调用
3. **GRANT EXECUTE 最小化**：仅向 `authenticated` 角色授予
4. **无递归 RLS**：workspace_members 自身策略使用直接 EXISTS，不调用 is_workspace_member
5. **RLS 默认拒绝**：4 张表全部启用 RLS
6. **auth.uid() 安全使用**：通过子查询 `(select auth.uid())` 获取，不接受用户传入的 UUID
7. **is_system_admin 桩函数**：始终返回 false，不会意外授权

### 未发现的问题

- 无 SECURITY DEFINER 函数接受可伪造的 User ID 参数
- 无跨 schema 的隐式权限提升路径
- audit_logs 无法被普通用户访问或修改

---

## 7. 剩余风险

| 风险 | 严重度 | 缓解 |
|---|---|---|
| Migration 未在真实 PostgreSQL 上验证 | MEDIUM | 迁移语法与冻结契约完全对齐；网络恢复后 `supabase start` + `db reset` 可验证 |
| database.types.ts 手动生成可能与 supabase gen types 输出略有差异 | LOW | 类型结构与 migration 完全对应；建议网络恢复后重新生成 |
| `set_updated_at()` 未使用 SECURITY DEFINER（仅 search_path=''） | LOW | 触发器以表所有者权限运行；函数仅设时间戳，无提权风险 |
| smtp 配置未设置真实凭据（本地开发预期行为） | NONE | 本地使用 mailpit 捕获邮件 |

---

## 8. 给 test-engineer 的接口

### 需要测试的表

| 表名 | 关键测试点 |
|---|---|
| `public.profiles` | RLS: 用户读写自己的 profile，不能读写他人的 |
| `public.workspaces` | RLS: 成员读本 workspace，非成员返回 0；仅 owner 可 update |
| `public.workspace_members` | RLS: 直接 EXISTS 策略正确性；owner 可管理成员 |
| `public.audit_logs` | RLS: 普通用户读返回 0 行，无法 INSERT/UPDATE/DELETE |

### 需要测试的 RPC

| RPC | 关键测试点 |
|---|---|
| `public.create_workspace_with_owner(text, text, text)` | anon 调用失败 (UA001)；authenticated 调用成功；返回正确 jsonb；workspace + membership 原子创建 |

### 需要测试的 Helper Functions

| 函数 | 测试点 |
|---|---|
| `private.is_workspace_member(uuid)` | 活跃成员返回 true；非成员返回 false；invited 状态返回 false |
| `private.is_workspace_owner(uuid)` | owner 返回 true；member 返回 false；external_collaborator 返回 false |
| `private.is_system_admin()` | 始终返回 false（桩） |

### 触发器测试

| 触发器 | 测试点 |
|---|---|
| `on_auth_user_created` | auth.users INSERT 后自动创建 profiles 行 |
| `set_updated_at` | profiles/workspaces UPDATE 后 updated_at 更新 |

---

## 9. 给 PHASE1B-AUTH-002 的接口

### 可用的数据库资产

1. **`public.profiles`** 表：由 `on_auth_user_created` trigger 自动填充。注册后无需手动创建 profile。

2. **`public.create_workspace_with_owner(name, city?, business_type?)`** RPC：
   - 用于注册流程中创建用户的首个 workspace
   - 调用方式：`supabase.rpc('create_workspace_with_owner', { workspace_name: '...', workspace_city: '...' })`
   - 返回：`{ workspace_id, workspace_name, owner_user_id, member_id, role, status }`

3. **`private.is_workspace_member(workspace_uuid)`** helper：可用于 server-side 权限检查

4. **`private.is_system_admin()`** helper：桩函数，Phase 1-C 前始终返回 false

### Auth 注册流程建议

```
1. supabase.auth.signUp({ email, password, options: { data: { full_name } } })
2. → on_auth_user_created trigger 自动创建 profiles 行
3. → 调用 create_workspace_with_owner RPC 创建首个 workspace
4. → 返回 user + workspace 信息
```

### 数据库类型

使用 `src/lib/supabase/database.types.ts` 中的 `Database` 类型：

```typescript
import type { Database } from "@/lib/supabase/database.types";
const supabase = createClient<Database>();
```

---

## 10. 契约遵从性

### 是否修改了冻结契约？

**否。** 所有迁移严格按照以下冻结文档执行：
- `docs/contracts/domain-model.md` v1.0
- `docs/contracts/rls-contract.md` v1.0
- `docs/contracts/api-contract.md` v1.0

### 是否连接了远程 Supabase？

**否。** 所有配置仅针对本地开发环境（project_id = "housevibe-local"）。

### 未实现的表

以下 domain-model 定义的表留待后续 Phase：
- properties, property_private_details, property_media
- clients, interactions
- property_matches, content_projects, content_versions, publishing_records
- tasks, leads, collaboration_requests
- feature_entitlements, system_admins, invitation_links
- ai_usage_logs, ai_correction_logs, ai_user_preferences
- ai_model_pricing, ai_user_limits, ai_runtime_config
- compliance_terms, compliance_review_logs

---

## 11. 工作区路径说明

本 agent 工作树路径: `/Users/colyn/HouseVibe/.claude/worktrees/agent-a8331a05af948429c`

所有文件写入均使用工作树路径。主 checkout 路径 (`/Users/colyn/HouseVibe`) 的 supabase/ 目录由 `supabase init` 生成，与本工作树分离。
