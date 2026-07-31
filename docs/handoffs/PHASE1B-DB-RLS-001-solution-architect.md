# PHASE1B-DB-RLS-001 Solution Architect Handoff

## 状态

只读确认完成。无阻塞性契约冲突。

## 审查的文档

- `docs/contracts/domain-model.md` v1.0 — FROZEN FOR PHASE 1
- `docs/contracts/rls-contract.md` v1.0 — FROZEN FOR PHASE 1
- `docs/contracts/api-contract.md` v1.0 — FROZEN FOR PHASE 1
- `docs/contracts/error-and-env-conventions.md` v1.0 — FROZEN FOR PHASE 1
- `docs/contracts/entitlement-authorization-matrix.md` v1.0 — FROZEN FOR PHASE 1

## 关键决策

| 决策 | 选择 | 理由 |
|---|---|---|
| profiles.id 与 auth.users.id | Trigger 中设置 `NEW.id` | domain-model 2.1 指明 1:1 对应 |
| is_system_admin() | 无条件 `false` 桩函数 | system_admins 留给 Phase 1-C |
| audit_logs SELECT 策略 | 省略（仅 service_role） | Phase 1-C 添加 is_system_admin() |
| workspace_members UPDATE/DELETE | 直接 EXISTS owner_check | 避免 RLS 递归 |
| workspace_members.updated_at | 不添加 | 遵循 domain-model 2.3 字段定义 |

## 四张基础表字段

全部与 domain-model v1.0 一致。无字段缺失或多余。

## 枚举

- workspace_role: owner, member, external_collaborator — 确认
- member_status: active, inactive, invited — 确认

## 函数清单

| 函数 | 本轮实现 | 备注 |
|---|---|---|
| is_workspace_member(uuid) | 是 | 核心 RLS 依赖 |
| is_workspace_owner(uuid) | 是 | Owner 策略依赖 |
| is_system_admin() | 桩 | Phase 1-C 升级 |
| has_feature() | 推迟 | Phase 1-C |
| reserve_ai_quota() | 推迟 | Phase 1-C |
| create_workspace_with_owner() | 是 | 原子 RPC |

## RLS Policy

| 表 | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| profiles | own + admin stub | N | own | N |
| workspaces | members | N | owner | N |
| workspace_members | own/owner (direct EXISTS) | N | owner | N |
| audit_logs | N (service_role) | N | N | N |

## 索引

全部确认。无遗漏。

## 契约矛盾

无阻塞性矛盾。发现 6 个轻微问题，均已由 data-security-engineer 在实现中解决。

## 修改的冻结契约

无。

## 连接远程 Supabase

否。
