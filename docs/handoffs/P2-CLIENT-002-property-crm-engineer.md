# P2-CLIENT-002 Client Interactions — Handoff

- Task ID：P2-CLIENT-002
- Agent：property-crm-engineer
- 完成日期：2026-08-03
- 状态：COMPLETE

---

## 完成范围

### 数据库

| 项目 | 详情 |
|---|---|
| Migration | `20260803000007_interactions_hardening.sql` |
| 列 | id, workspace_id, client_id, property_id, interaction_type, summary, raw_text, next_action, occurred_at, created_by, created_at, updated_at, deleted_at |
| 触发 | trg_interactions_updated_at（自动更新 updated_at） |

### API

| 路由 | 方法 | 功能 |
|---|---|---|
| `/api/clients/[id]/interactions` | GET | 列表（分页、类型筛选、时间排序） |
| `/api/clients/[id]/interactions` | POST | 创建 |
| `/api/clients/[id]/interactions/[interactionId]` | PATCH | 更新 |
| `/api/clients/[id]/interactions/[interactionId]` | DELETE | 软删除 |

### RPC（SECURITY DEFINER, SET search_path = ''）

| RPC | 功能 | Audit |
|---|---|---|
| `create_interaction` | 原子创建 + 跨 workspace 客户端验证 | interaction_created |
| `update_interaction` | 部分更新 + before/after 对比 | interaction_updated |
| `soft_delete_interaction` | 软删除 + 跨 workspace 验证 | interaction_soft_deleted |

### RLS

| 策略 | 条件 |
|---|---|
| SELECT | `is_workspace_member(workspace_id) AND deleted_at IS NULL` |
| INSERT | workspace 成员 + client 同 workspace + client 未删除 |
| UPDATE | workspace 成员 + deleted_at IS NULL + client-workspace 一致性 |
| DELETE | workspace 成员 + deleted_at IS NULL |

### UI

| 组件 | 文件 |
|---|---|
| Interaction Timeline | `src/features/clients/components/interaction-timeline.tsx` |
| Interaction Form | `src/features/clients/components/interaction-form.tsx` |
| Interaction Detail | `src/features/clients/components/interaction-detail.tsx` |
| Stage Badge | `src/features/clients/components/stage-badge.tsx` |

### Interaction Types（9 种）

`phone_call`, `wechat_message`, `in_person_meeting`, `property_viewing`, `follow_up`, `negotiation`, `contract_signing`, `complaint`, `other`

---

## 测试精确结果

| 测试套件 | 文件 | 结果 |
|---|---|---|
| pgTAP RLS | `15_interactions_rls_test.sql` | PASS |
| Unit/Integration | `src/app/api/clients/[id]/interactions/__tests__/route.test.ts` | PASS |
| E2E Interactions | `e2e/client-interactions.spec.ts` | 15 tests PASS |

E2E 覆盖：空时间线、创建、时间线可见、刷新保持、编辑、9 种类型、类型筛选、时间排序（occurred_at DESC, created_at DESC, id ASC）、软删除、删除后刷新、跨 workspace、未认证、mobile 375px、表单验证、防重复提交。

---

## 已知 Deferred

- AI 自动生成交互摘要（Phase 3）
- 交互语音记录（Phase 3，STT）

---

## 对 P2-MATCH-001 的可用字段和约束

- `interactions` 表支持通过 `client_id` 和 `property_id` 关联匹配
- 外展追踪（已发送/已带看）通过 `interactions` 实现：
  - "已发送房源" → `interaction_type = 'property_viewing'` 或 `'follow_up'`
  - "已带看" → `interaction_type = 'property_viewing'`
- `property_viewing` 类型的 interaction 可关联 `property_id`

---

## 不可破坏的合同

- 所有 interaction 必须绑定同 workspace 的未删除 client
- Interaction 创建/更新/软删除均写 audit
- 跨 workspace 访问默认拒绝，不泄露资源存在性
- 时间线排序：occurred_at DESC, created_at DESC, id ASC
- RPC 均为 SECURITY DEFINER + SET search_path = '' + auth.uid()

---

## Commit Hash

`5ec0082` — feat: add secure client interaction timeline
