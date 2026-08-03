# ADR-005：match_status 枚举决议

- 状态：APPROVED
- 日期：2026-08-03
- 决议人：solution-architect
- 审查人：quality-reviewer, data-security-engineer
- 触发：P2-MATCH-001-PREFLIGHT-036

---

## 背景

P2-MATCH-001 启动前发现三套定义冲突：

| 来源 | 枚举值 | 语义 |
|---|---|---|
| `domain-model.md`（已冻结） | `active`, `dismissed`, `archived` | 匹配记录生命周期状态 |
| `implementation-plan.md` P2-MATCH-001 | `pending`, `sent`, `viewed`, `not_interested` | 经纪人外展追踪状态 |
| Database migration `20260801000005` | `active`, `dismissed`, `archived` | 与 domain-model 一致 |

PRD §7.7 区分了匹配结果（分数、等级、原因）与外展动作（"已发送""已带看""不推荐"），但未定义数据库枚举名。

## 决议

### 权威定义

以已冻结的 `domain-model.md` 和数据库 migration 为唯一权威来源。

### 最终枚举值

```sql
CREATE TYPE public.match_status AS ENUM (
  'active',
  'dismissed',
  'archived'
);
```

### 每个状态的业务含义

| 状态 | 含义 | 何时设置 |
|---|---|---|
| `active` | 匹配记录有效，可用于展示和排序 | 创建时默认；重新计算时保持或更新 |
| `dismissed` | 经纪人主动关闭（不推荐/不感兴趣） | 经纪人手动标记"不推荐"时 |
| `archived` | 匹配已过时（客户阶段变更、房源下架/删除等） | 系统自动或经纪人手动归档 |

### 允许转换矩阵

```
        ┌──────────┐
        │  active  │  ← 默认状态（创建/重新计算）
        └────┬─────┘
             │
      ┌──────┴──────┐
      ▼              ▼
┌──────────┐   ┌──────────┐
│ dismissed│   │ archived │
└──────────┘   └──────────┘
      │              │
      └──────┬───────┘
             ▼
      重新计算匹配
      → 重置为 active
```

- `active` → `dismissed`：经纪人手动操作
- `active` → `archived`：系统自动（客户或房源不再可用）
- `dismissed` → `active`：重新计算匹配时重置
- `archived` → `active`：重新计算匹配时重置
- `dismissed` → `archived`：允许（系统清理）
- `archived` → `dismissed`：不允许（终态语义）

### 默认状态

`active`

### 终态

`archived`（不可逆到 `dismissed`，但可重新计算为 `active`）

### 谁可以修改

- 创建/重新计算：服务端 API（`POST /api/matches/calculate`）
- `active` → `dismissed`：workspace 成员通过 API
- `active` → `archived`：服务端自动（客户阶段变更、房源下架等）
- 禁止客户端直接写入 `match_status`

### 外展追踪（分离关注点）

实施计划中的 `pending/sent/viewed/not_interested` 语义由独立的 `interactions` 表承担：

- 匹配计算后，客户详情展示房源匹配列表，经纪人可"发送房源" → 创建 `interaction` 记录（类型 `property_viewing` 或 `follow_up`）
- "已带看" → `interaction` 类型 `property_viewing`
- "不推荐" → 将 match 标记为 `dismissed`

不新增独立的外展追踪字段。`interactions` 表已完整实现（P2-CLIENT-002），无需新增 schema。

### 是否需要数据库 Migration

**否。** 当前 migration `20260801000005` 已定义正确的 `match_status` 枚举。无需修订。

### 现有数据迁移策略

`property_matches` 表当前无数据（功能尚未实现）。无需数据迁移。

### 实施计划修订

P2-MATCH-001 任务描述中 `pending/sent/viewed/not_interested` 应更新为使用 `match_status`（`active/dismissed/archived`），外展动作通过 `interactions` 实现。

## 后果

- Domain Model、API Contract、Database 现已一致
- 实施计划 P2-MATCH-001 任务描述需在启动时同步修订
- 本决议冻结后不得再出现 `pending/sent/viewed/not_interested` 作为 `match_status`
