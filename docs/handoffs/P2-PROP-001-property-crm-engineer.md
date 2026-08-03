# P2-PROP-001 Property CRUD — Handoff

- Task ID：P2-PROP-001
- Agent：property-crm-engineer
- 完成日期：2026-08-02
- 状态：COMPLETE

---

## 完成范围

### 数据库

| 项目 | 详情 |
|---|---|
| Migration | `20260801000005_phase2_business_tables.sql`（properties, property_private_details 表） |
| Atomic RPC | `20260801000006_atomic_property_creation.sql`（create_property_with_private_details） |
| RPC Fix | `20260801000007_fix_atomic_rpc_search_path.sql`（search_path 修复） |
| 索引 | workspace_id + status + deleted_at, district + monthly_rent, available_from, is_shared + shared_expires_at |

### API

| 路由 | 方法 | 功能 |
|---|---|---|
| `/api/properties` | GET | 列表（分页、筛选、排序） |
| `/api/properties` | POST | 创建（含 private_details） |
| `/api/properties/[id]` | GET | 详情 |
| `/api/properties/[id]` | PATCH | 更新（类型转换：booleans, dates, integers, arrays） |
| `/api/properties/[id]` | DELETE | 软删除 |

### UI

| 路由 | 功能 |
|---|---|
| `/properties` | 列表页（卡片模式，移动端优先） |
| `/properties/new` | 创建页（复杂表单，独立页面） |
| `/properties/[propertyId]` | 详情页 |
| `/properties/[propertyId]/edit` | 编辑页 |

### RLS

- `properties`：workspace 成员可 CRUD，deleted_at IS NULL 过滤
- `property_private_details`：仅 workspace 成员可读，外部不可见
- 跨 workspace 访问：404/403，不泄露存在性

### RPC

- `create_property_with_private_details`：SECURITY DEFINER, `SET search_path = ''`, auth.uid(), atomic insert + audit
- RPC grants 已从 public, anon 撤销

---

## 测试精确结果

| 测试套件 | 文件 | 测试数 | 结果 |
|---|---|---|---|
| pgTAP RLS | `12_atomic_rpc_and_audit_test.sql` | — | PASS |
| pgTAP RLS | `13_property_media_rls_test.sql` | — | PASS |
| Unit/Integration | `src/app/api/properties/__tests__/route.test.ts` | — | PASS |
| E2E Properties | `e2e/property-flows.spec.ts` | 17 | PASS |
| E2E Filters | `e2e/property-filters.spec.ts` | 12 | PASS |
| E2E Media | `e2e/property-media.spec.ts` | 15 | PASS |

全部门禁：DB test 16/16 files (554 tests), unit 14/14 files (367 tests), E2E 8 suites (131 tests), 0 failed, 0 skipped.

---

## 已知 Deferred

- AI 智能录入（Phase 3）
- 房源图片视觉分析（Phase 3）
- 自然语言搜索 AI 解析（Phase 3）

---

## 后续依赖

- P2-CLIENT-001（客户 CRUD）— 已完成
- P2-MATCH-001（匹配引擎）— 依赖本模块的 properties 表、property_private_details、API

---

## 对 P2-MATCH-001 的可用字段和约束

### properties 表可用字段

| 字段 | 类型 | 用于匹配 | 说明 |
|---|---|---|---|
| `id` | UUID | ✅ | 主键 |
| `workspace_id` | UUID | ✅ | 隔离 |
| `monthly_rent` | INTEGER | ✅ | 预算维度 |
| `district` | TEXT | ✅ | 区域维度 |
| `community_name` | TEXT | ✅ | 小区维度 |
| `bedrooms` | INTEGER | ✅ | 户型维度 |
| `rental_type` | TEXT | ✅ | 枚举: whole_unit, shared |
| `available_from` | DATE | ✅ | 入住时间维度 |
| `pets_allowed` | BOOLEAN | ✅ | 宠物硬性条件 |
| `cooking_allowed` | BOOLEAN | ✅ | 做饭硬性条件 |
| `subway_text` | TEXT | ✅ | 通勤维度 |
| `area_sqm` | NUMERIC | ✅ | 面积参考 |
| `has_elevator` | BOOLEAN | ✅ | 电梯参考 |
| `status` | property_status | ✅ | 仅 available 可用 |
| `deleted_at` | TIMESTAMPTZ | ✅ | 排除已删除 |

### 筛选约束

- 匹配引擎必须添加 `WHERE status = 'available' AND deleted_at IS NULL`
- 不得通过 REST API 直接读取 property_private_details（使用专用 RPC）

---

## 不可破坏的合同

- 所有查询通过 `workspace_id` 过滤
- 敏感字段（building_no, unit_no, room_no, property_private_details）不进入匹配
- 软删除房源不出现在匹配中
- RLS 默认拒绝

---

## Commit Hash

| 类型 | Hash | 描述 |
|---|---|---|
| 主功能 | `b97f308` | feat: complete secure property CRUD slice |

### 验证

```bash
git show --stat b97f308  # 36 files, 4189 insertions — Property CRUD 主提交
```
