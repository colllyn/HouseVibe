# HouseVibe Matching Contract

- 文档名称：matching-contract
- 版本：1.0
- 状态：FROZEN FOR P2-MATCH-001
- Owner：solution-architect
- 依赖：domain-model.md v1.0, api-contract.md, client-contract.md v1.0
- 最后更新：2026-08-03

---

## 1. 匹配引擎输入

### 1.1 从 Client 读取的字段

| 字段 | 来源表 | 用途 | 缺失处理 |
|---|---|---|---|
| `budget_min` | clients | 租金硬性下限 | 无下限限制 |
| `budget_max` | clients | 租金硬性上限（hard must-pass） | 无上限限制 |
| `preferred_districts` | clients | 区域偏好评分（20 分维度） | 该维度按 0 分计 |
| `preferred_communities` | clients | 小区偏好加分 | 不额外加分 |
| `bedrooms` | clients | 户型硬性条件（must-pass） | 不限制 |
| `rental_type` | clients | 整租/合租硬性条件（must-pass） | 不限制 |
| `available_from` | clients | 入住时间（15 分维度） | 该维度按 0 分计 |
| `pets_required` | clients | 宠物硬性条件（must-pass） | 不限制 |
| `cooking_required` | clients | 做饭硬性条件（must-pass） | 不限制 |
| `commute_destination` | clients | 通勤偏好（10 分维度） | 该维度按 0 分计 |
| `hard_requirements` | clients | 硬性条件（must-pass），JSONB | 无不额外条件 |
| `soft_preferences` | clients | 偏好条件评分，JSONB | 不额外加分 |
| `deal_breakers` | clients | 不能接受条件（must-pass），text[] | 无不额外条件 |

### 1.2 从 Property 读取的字段

| 字段 | 来源表 | 用途 |
|---|---|---|
| `monthly_rent` | properties | 租金匹配（预算维度） |
| `district` | properties | 区域匹配 |
| `community_name` | properties | 小区匹配 |
| `bedrooms` | properties | 户型匹配 |
| `rental_type` | properties | 整租/合租匹配 |
| `available_from` | properties | 入住时间匹配 |
| `pets_allowed` | properties | 宠物匹配 |
| `cooking_allowed` | properties | 做饭匹配 |
| `subway_text` | properties | 地铁/通勤匹配 |
| `area_sqm` | properties | 面积参考（影响偏好评分） |
| `has_elevator` | properties | 电梯参考（影响偏好评分） |
| `status` | properties | 仅匹配 `status = 'available'` 的房源 |
| `deleted_at` | properties | 排除已删除房源 |

---

## 2. 硬性过滤条件（Must-Pass）

以下条件任一不满足，房源直接排除，不进入评分阶段：

| # | 条件 | 来源字段 | 逻辑 |
|---|---|---|---|
| 1 | 租金上限 | `clients.budget_max` vs `properties.monthly_rent` | `monthly_rent <= budget_max`（若 budget_max 非空） |
| 2 | 宠物 | `clients.pets_required` vs `properties.pets_allowed` | `pets_required = true → pets_allowed = true` |
| 3 | 整租/合租 | `clients.rental_type` vs `properties.rental_type` | 若 client 指定 → 精确匹配 |
| 4 | 入住时间 | `clients.available_from` vs `properties.available_from` | `properties.available_from <= clients.available_from`（若 available_from 非空） |
| 5 | 最少卧室 | `clients.bedrooms` vs `properties.bedrooms` | `properties.bedrooms >= clients.bedrooms`（若 bedrooms 非空） |
| 6 | 做饭 | `clients.cooking_required` vs `properties.cooking_allowed` | `cooking_required = true → cooking_allowed = true` |
| 7 | 硬性要求 | `clients.hard_requirements` (JSONB) | 按配置逐条过滤 |
| 8 | 不能接受 | `clients.deal_breakers` (text[]) | 房源标签/特征包含 deal_breaker → 排除 |
| 9 | 房源可用 | `properties.status`, `properties.deleted_at` | `status = 'available' AND deleted_at IS NULL` |

---

## 3. 100 分评分维度与默认权重

### 3.1 维度定义

| 维度 | 权重 | 满分条件 | 评分逻辑 |
|---|---|---|---|
| 预算匹配 | **30** | 租金在预算范围内且接近偏好中点 | 租金 ≤ budget_max 得满分 30；无 budget_max → 默认 30 |
| 区域匹配 | **20** | 房源区域在首选区域内 | 精确匹配 district → 20；同城不同区 → 10；无 preferred_districts → 默认 20 |
| 户型匹配 | **15** | 卧室数精确匹配 | 精确匹配 → 15；差 1 → 8；差 ≥2 → 0；无 bedrooms 要求 → 默认 15 |
| 入住时间 | **15** | 可入住时间不晚于客户要求 | `available_from ≤ client.available_from` → 15；每超过 7 天扣 5 分；无要求 → 默认 15 |
| 通勤/地铁 | **10** | 地铁文本匹配通勤目的地 | 模糊匹配 → 6–10；无匹配 → 0；无 commute_destination → 默认 10 |
| 特殊要求 | **10** | soft_preferences 逐项匹配 | 每匹配 1 项偏好 → +2 分，上限 10 分 |

### 3.2 权重规则

- 所有权重必须为非负整数。
- 默认总和 100 分（30+20+15+15+10+10=100）。
- 用户可通过 `weightOverrides` 调整任意维度权重。
- 调整后权重总和不必为 100；允许权重为 0（禁用该维度）。
- 非整数或负权重 → 422 错误。

### 3.3 缺失字段计分

- 若 client 未提供某维度的输入（如无 `preferred_districts`），该维度**满分**（不扣分）。
- 若 property 缺少某维度数据，该维度按 0 分计（仅当 client 有要求时）。

---

## 4. 输出

### 4.1 分数

0–100 整数（四舍五入到最近整数）。计算公式：

```
score = round(sum(dimension_score_i * weight_i / base_weight_i))
```

每个维度 `base_weight_i` 为该维度的默认权重。

### 4.2 等级

| 分数范围 | match_level |
|---|---|
| 85–100 | `excellent` |
| 65–84 | `good` |
| 40–64 | `fair` |
| 0–39 | `low` |

### 4.3 匹配原因 `matchedReasons`

JSONB 数组，每项包含：

```json
{
  "code": "budget",
  "label": "预算匹配",
  "scoreContribution": 30,
  "detail": "月租 ¥2500 在预算 ¥3000 以内"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `code` | string | 维度代码（budget/district/roomType/availability/commute/specialRequirements） |
| `label` | string | 用户可读的维度标签（中文） |
| `scoreContribution` | integer | 该维度贡献的分数 |
| `detail` | string | 匹配原因详细说明 |

### 4.4 不匹配原因 `unmatchedReasons`

JSONB 数组，列出不满足的硬性条件：

```json
{
  "code": "pets_not_allowed",
  "label": "不允许宠物",
  "detail": "该房源不允许养宠物"
}
```

### 4.5 待确认信息 `needsConfirmation`

JSONB 数组，列出无法自动判断的项：

```json
{
  "code": "subway_distance_unknown",
  "label": "地铁距离未确认",
  "detail": "地铁距离需确认，未在房源信息中明确标注"
}
```

### 4.6 推荐下一步操作

基于 `match_level` 建议：
- `excellent` → "推荐立即发送房源给客户"
- `good` → "可发送房源，建议标注待确认信息"
- `fair` → "部分条件不匹配，可参考但不优先推荐"
- `low` → "不建议推荐，多数条件不匹配"

---

## 5. 稳定排序和 Tie-Breaker

匹配结果排序：

1. `score DESC`（分数高者优先）
2. `properties.updated_at DESC`（最近更新的房源优先）
3. `property_matches.created_at ASC`（先创建的匹配记录优先）

同分保证确定性排序。

---

## 6. 重新计算行为

- 每次 `POST /api/matches/calculate` 对指定 (client, properties) 重新计算匹配。
- 已存在的 `property_matches` 记录执行 upsert（`UNIQUE(property_id, client_id)`）。
- 更新 `score`, `match_level`, `matched_reasons`, `unmatched_reasons`, `needs_confirmation`, `updated_at`。
- `status` 重置为 `active`（除非已在硬性过滤中被排除 → `archived`）。
- 不产生重复记录。

---

## 7. 幂等与重复计算

- 同一 (client_id, property_id) 的多次 `calculate` 调用产生相同结果（确定性算法）。
- Upsert 语义保证只有 1 条记录。
- 不依赖 idempotency key。

---

## 8. property_matches 唯一性

```sql
UNIQUE(property_id, client_id)
```

同一客户与同一房源只有一条匹配记录。

---

## 9. match_status

权威定义见 ADR-005。

| 值 | 含义 |
|---|---|
| `active` | 默认，匹配有效 |
| `dismissed` | 经纪人手动关闭 |
| `archived` | 房源或客户不再可用 |

- 转换矩阵：`active → dismissed | archived`，重新计算 → `active`
- 终态：`archived`（不可逆到 `dismissed`）
- 外展追踪（已发送/已带看）通过 `interactions` 表实现

---

## 10. access control

- 匹配功能是 Workspace 核心功能，任何认证的 workspace 成员均可使用。
- 无需 `property_matching` feature entitlement（已移除，2026-08-09）。
- 安全性依赖 Auth（getUser → 401）+ Workspace 成员关系（→ 403）+ 资源 workspace scoping + RLS。
- `property_matching` feature key 保留在数据库 enum 中用于管理追踪，不再作为 API 访问门控。
- Workspace 之间数据不可串用。

---

## 11. Workspace 隔离

- 所有匹配计算仅查询当前 workspace 的 clients 和 properties
- `property_matches.workspace_id` 必须与 client 和 property 的 workspace_id 一致
- RLS 策略：`is_workspace_member(workspace_id)` + `status IN ('active', 'dismissed')`（列表展示排除 archived）

---

## 12. Audit

匹配计算不写 audit log（纯计算操作，非业务变更）。

匹配状态变更（dismiss/archive）写入 audit log：
- `entity_type`: `property_match`
- `action`: `match_dismissed` / `match_archived`
- `before_data`: 旧 status
- `after_data`: 新 status

---

## 13. API 响应格式

### POST /api/matches/calculate

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

### GET /api/clients/:id/matches

```json
{
  "data": [{
    "id": "uuid",
    "propertyId": "uuid",
    "propertyTitle": "精装两房 近地铁",
    "score": 85,
    "matchLevel": "excellent",
    "status": "active",
    "createdAt": "2026-08-03T00:00:00Z",
    "updatedAt": "2026-08-03T00:00:00Z"
  }],
  "error": null
}
```

### GET /api/properties/:id/matches

```json
{
  "data": [{
    "id": "uuid",
    "clientId": "uuid",
    "clientName": "张先生",
    "score": 85,
    "matchLevel": "excellent",
    "status": "active",
    "createdAt": "2026-08-03T00:00:00Z",
    "updatedAt": "2026-08-03T00:00:00Z"
  }],
  "error": null
}
```

---

## 14. 明确 Deferred

- AI 增强匹配评分（DeepSeek 语义分析）— Phase 3
- AI 自然语言匹配查询 — Phase 3
- 图片视觉特征参与匹配 — Phase 3
- STT 语音匹配查询 — Phase 3
- 跨 workspace 共享房源匹配 — Phase 2（P2-SHARE-001 完成后）
- 匹配通知推送 — Future
- 批量匹配性能优化 — Future

---

## 15. 不可破坏的约束

- 匹配结果不得泄露其他 workspace 的房源/客户信息
- `matched_reasons` 不包含联系方式、精确地址
- 硬性条件不满足的房源不得出现在匹配结果中（除 `unmatchedReasons` 列表）
- 权重覆盖必须校验合法范围
- 匹配状态变更必须写入 audit log
- 不调用 DeepSeek 或任何 AI 模型
