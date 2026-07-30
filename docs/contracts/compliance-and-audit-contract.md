# HouseVibe Compliance & Audit Contract

| 属性 | 值 |
|---|---|
| 文档名称 | compliance-and-audit-contract |
| 版本 | 1.0 |
| 状态 | FROZEN FOR PHASE 1 |
| Owner | solution-architect |
| 依赖 | PRD v1.3, domain-model v1.0, ai-contract v1.0 |
| 最后更新 | 2026-07-30 |

---

## 1. 合规词库 (Compliance Terms)

### 1.1 词条结构

| 字段 | 类型 | 说明 |
|---|---|---|
| `term` | TEXT | 风险词或正则表达式 |
| `category` | TEXT | 风险类别 |
| `severity` | block / review / highlight | 严重级别 |
| `match_type` | TEXT | 匹配方式（exact / contains / regex） |
| `replacement_suggestion` | TEXT | 建议替换词 |
| `status` | TEXT | active / inactive |
| `version` | INTEGER | 词库版本号 |

### 1.2 风险类别

| 类别 | 说明 | 示例 |
|---|---|---|
| `absolute_claim` | 极限与绝对化用语 | 最、第一、顶级、绝对、百分百 |
| `investment_promise` | 投资承诺 | 投资回报率、保值增值、稳赚、保证升值 |
| `education_claim` | 教育属性承诺 | 学区、学位保证、入读保证 |
| `scarcity_urge` | 稀缺与催促 | 最后一套、错过不再、今天必须定 |
| `unverified_price` | 未经证实的价格与资格 | 全网最低、内部价、保证办理 |
| `false_advertising` | 虚假宣传 | 其他不实描述 |

### 1.3 严重级别定义

| 级别 | 行为 | 复制拦截 |
|---|---|---|
| `block` | MUST 删除或修改，不能通过用户确认绕过 | 一键复制和标记待发布均禁止 |
| `review` | 允许用户修改或填写确认理由后继续 | 需确认后方可复制 |
| `highlight` | 仅高亮提示，不影响复制 | 可复制，但显示风险提示 |

### 1.4 管理员维护

- 管理员可新增、编辑、停用风险词（通过 `/admin/compliance`）。
- 支持设置类别、严重级别和匹配方式。
- 词库版本化：每次修改生成新版本号。
- 支持回滚到上一版本。
- 普通内容用户 MUST NOT 修改全局词库。

### 1.5 词库管理权限

- 查看：`is_system_admin()`
- 创建/更新/停用：`is_system_admin()` 通过服务端 API
- 回滚：`is_system_admin()`
- 审计：所有修改写入 `audit_logs`

---

## 2. 内容扫描流程

```
DeepSeek 生成 content
→ Structured Output 校验 (Zod)
→ 事实校验 (facts_used vs property facts)
→ 合规扫描 (Compliance Shield: src/lib/compliance/check.ts)
→ 风险标注 (compliance_flags)
→ 决定 copyAllowed
```

### 2.1 扫描输入

- AI 生成的完整输出文本
- 当前平台（xiaohongshu/douyin/wechat_moments）
- 活跃词库（`status = active`）

### 2.2 扫描输出

```ts
interface ComplianceScanResult {
  status: 'clean' | 'review_required' | 'blocked';
  flags: ComplianceFlag[];
  copyAllowed: boolean;
}

interface ComplianceFlag {
  termId: string;
  term: string;
  category: string;
  severity: 'block' | 'review' | 'highlight';
  matchedText: string;
  position: { start: number; end: number };
  replacementSuggestion?: string;
  field: string; // 命中的字段名 (body, title, hook, etc.)
}
```

### 2.3 拦截规则

| 存在未解决… | 结果 |
|---|---|
| `block` 级风险 | `compliance_status = 'blocked'`，`copyAllowed = false` |
| `block` 级风险 + `review` 级未确认 | `compliance_status = 'blocked'`，`copyAllowed = false` |
| 仅 `review` 级未确认 | `compliance_status = 'review_required'`，`copyAllowed = false`（需确认） |
| only `highlight` 或全部已处理 | `compliance_status = 'clean'`，`copyAllowed = true` |

### 2.4 用户处理

- `block` 级：MUST 修改内容（删除或替换命中词）。
- `review` 级：可修改内容，或填写确认理由。
- 所有处理动作写入 `compliance_review_logs`。

### 2.5 实现约束

- 合规扫描 MUST 在服务端执行（`src/lib/compliance/check.ts`）。
- 前端按钮状态 MUST 来自服务端 `copyAllowed` / `compliance_status`。
- MUST NOT 仅在前端进行合规扫描或复制拦截。
- 扫描结果写入 `content_versions.compliance_status` 和 `content_versions.compliance_flags`。

---

## 3. AI Usage 状态

### 3.1 状态枚举

| 状态 | 含义 | 触发条件 |
|---|---|---|
| `reserved` | 配额已预占，等待模型调用 | `reserve_ai_quota()` 成功后 |
| `succeeded` | 模型调用成功 | DeepSeek 返回成功响应 |
| `failed` | 模型调用失败 | DeepSeek 返回错误或超时 |
| `rejected` | 权限/配额/资源拒绝 | 调用前检查失败 |
| `rejected_compliance` | 合规 block | 合规扫描 block，`copyAllowed = false` |
| `blocked_by_cost_limit` | 成本熔断 | 累计成本超过上限 |

### 3.2 状态转换

```
reserved → succeeded (成功结算)
reserved → failed (模型失败)
reserved → rejected (检查失败)
reserved → rejected_compliance (合规拒绝)
reserved → (expired) (reservation_expires_at 过期)
直接插入 → blocked_by_cost_limit (预检时已超成本限)
```

---

## 4. 原子配额 reserve_ai_quota()

### 4.1 函数签名

```sql
reserve_ai_quota(
  p_user_id UUID,
  p_workspace_id UUID,
  p_feature feature_key,
  p_capability TEXT,
  p_quota_date DATE,
  p_request_limit INTEGER,
  p_daily_cost_limit_usd NUMERIC,
  p_reserved_estimated_cost_usd NUMERIC,
  p_idempotency_key TEXT,
  p_request_id UUID
)
RETURNS TABLE(
  allowed BOOLEAN,
  limit_reason TEXT,          -- 'request_limit' | 'cost_limit' | NULL
  remaining_requests INTEGER,
  remaining_cost_usd NUMERIC,
  reservation_id UUID,
  error_message TEXT
)
```

### 4.2 单事务操作流程

```
BEGIN TRANSACTION;

-- Step 1: 幂等检查
SELECT id, status, reservation_expires_at
FROM ai_usage_logs
WHERE user_id = p_user_id
  AND feature = p_feature
  AND idempotency_key = p_idempotency_key;

IF found AND status IN ('succeeded', 'reserved' AND NOT expired) THEN
  RETURN 已有记录的结果;
END IF;

-- Step 2: 锁定用户当日配额（FOR UPDATE 防止并发）
-- (无具体锁定行，通过 ai_usage_logs 的条件聚合实现)

-- Step 3: 统计有效预占次数 + 成功次数
SELECT
  COUNT(*) FILTER (WHERE status = 'succeeded') AS success_count,
  COUNT(*) FILTER (WHERE status = 'reserved' AND reservation_expires_at > now()) AS reserved_count,
  COALESCE(SUM(estimated_cost_usd) FILTER (WHERE status = 'succeeded'), 0) AS success_cost,
  COALESCE(SUM(reserved_estimated_cost_usd) FILTER (WHERE status = 'reserved' AND reservation_expires_at > now()), 0) AS reserved_cost
FROM ai_usage_logs
WHERE user_id = p_user_id
  AND feature = p_feature
  AND quota_date = p_quota_date;

-- Step 4: 检查次数
IF success_count >= p_request_limit THEN
  RETURN (allowed=false, limit_reason='request_limit', ...);
END IF;

-- Step 5: 检查成本（成功成本 + 未过期预占成本）
IF (success_cost + reserved_cost + p_reserved_estimated_cost_usd) > p_daily_cost_limit_usd THEN
  -- 不插入 reserved 记录，直接插入 blocked_by_cost_limit
  INSERT INTO ai_usage_logs (...) VALUES (..., status='blocked_by_cost_limit');
  RETURN (allowed=false, limit_reason='cost_limit', ...);
END IF;

-- Step 6: 插入 reserved 记录
INSERT INTO ai_usage_logs (
  user_id, workspace_id, feature, capability, quota_date, quota_units,
  reserved_estimated_cost_usd, idempotency_key, request_id,
  status, reservation_expires_at, ...
) VALUES (
  p_user_id, p_workspace_id, p_feature, p_capability, p_quota_date, 1,
  p_reserved_estimated_cost_usd, p_idempotency_key, p_request_id,
  'reserved', now() + INTERVAL '5 minutes', ...
);

-- Step 7: 返回剩余额度
RETURN (allowed=true, remaining_requests=..., remaining_cost_usd=...);

COMMIT;
```

### 4.3 调用方使用流程

```ts
// 在 Route Handler 中：
const quotaResult = await reserveAiQuota({...});

if (!quotaResult.allowed) {
  throw new AppError(
    quotaResult.limitReason === 'request_limit' ? 'QUOTA_EXCEEDED' : 'COST_LIMIT_EXCEEDED',
    429,
    { remaining: ..., resetAt: ... }
  );
}

// 调用 DeepSeek
try {
  const result = await deepseekProvider.generateContent(input);
  await settleAiQuota(quotaResult.reservationId, 'succeeded', result.usage);
  return result;
} catch (error) {
  await settleAiQuota(quotaResult.reservationId, 'failed', null);
  throw error;
}
```

### 4.4 幂等键

- `idempotency_key` 由客户端提供（如 UUID）或由服务端生成。
- `UNIQUE(user_id, feature, idempotency_key)` 约束确保相同请求不重复扣减。
- 已成功的幂等请求直接返回缓存结果。
- 预占记录的 `reservation_expires_at` 默认为 5 分钟后。

---

## 5. 成本熔断

### 5.1 默认配置

| 参数 | 默认值 | 环境变量 | 可覆盖 |
|---|---|---|---|
| 单用户每日成本上线 | $10.00 | `AI_DAILY_COST_LIMIT_USD` | 是（`ai_user_limits`） |
| 单用户每日内容生成次数 | 10 | `AI_DAILY_CONTENT_LIMIT` | 是（`ai_user_limits`） |
| 预占过期时间 | 5 分钟 | (硬编码) | 否 |

### 5.2 熔断行为

- `reserve_ai_quota` 统计时同时计算成功成本 + 未过期预占成本。
- 超过成本熔断线时返回 `COST_LIMIT_EXCEEDED` (429)，MUST NOT 调用模型。
- 记录 `status = 'blocked_by_cost_limit'` 和熔断原因。
- 429 响应包含当日上限和下一次重置时间，但不得泄露其他用户数据。

### 5.3 恢复流程

- 管理员在 `/admin/users/:id` 查看用户状态。
- 执行 `POST /api/admin/users/:userId/restore-ai-access`。
- 可同时调整 `ai_user_limits.daily_cost_limit_usd` 提高上限。
- 恢复动作 MUST 写入 `audit_logs`。

### 5.4 失败调用成本处理

- `failed` 状态的用量不计算成功成本。
- 预占成本通过 `reservation_expires_at` 过期后自动释放。
- 过期预占不计入后续配额统计。

---

## 6. 模型单价版本管理

### 6.1 ai_model_pricing 使用

- 成本计算 MUST 从 `ai_model_pricing` 表读取，不得硬编码。
- 查询时使用 `effective_from <= now() AND (effective_to IS NULL OR effective_to > now())`。
- 历史用量按请求发生时生效的价格估算。
- 管理员可通过 `/admin/ai-models` 配置新价格（新增记录，不修改旧记录）。

### 6.2 成本估算公式

```
estimated_cost_usd =
  (input_tokens / 1000000) * input_usd_per_million_tokens
  + (output_tokens / 1000000) * output_usd_per_million_tokens
  + image_count * image_unit_price_usd  // 仅视觉模型
```

---

## 7. 审计日志

### 7.1 必须审计的动作清单

| 动作 | entity_type | action | 记录内容 |
|---|---|---|---|
| 登录异常（多次失败） | `auth` | `login_failed_repeated` | IP, 次数 |
| Feature 授予 | `feature_entitlement` | `granted` | 授予人, 被授予人, feature, expires_at |
| Feature 撤销 | `feature_entitlement` | `revoked` | 撤销人, 被撤销人, feature |
| Feature 延期 | `feature_entitlement` | `extended` | 操作人, 新 expires_at |
| 账号禁用 | `user` | `disabled` | 操作人, 原因 |
| 账号启用 | `user` | `enabled` | 操作人 |
| 房源上架共享 | `property` | `shared` | 操作人, property_id |
| 房源下架共享 | `property` | `unshared` | 操作人, property_id |
| 营销复用授权 | `property` | `marketing_reuse_granted` | 操作人, property_id |
| 营销复用撤销 | `property` | `marketing_reuse_revoked` | 操作人, property_id |
| 内容风险确认 | `content` | `compliance_reviewed` | 用户, content_version_id, 动作 |
| 配额拒绝 | `ai_usage` | `quota_exceeded` | user_id, feature, quota_date |
| 成本熔断 | `ai_usage` | `cost_limit_exceeded` | user_id, 累计成本 |
| 成本熔断恢复 | `ai_usage` | `cost_restored` | 管理员, 被恢复用户 |
| 管理员模型切换 | `ai_runtime` | `model_switched` | 操作人, capability, 新模式 |
| 熔断器重置 | `ai_runtime` | `circuit_reset` | 操作人, capability |
| 合规词库修改 | `compliance_term` | `created/updated/deactivated` | 操作人, term_id |
| 合作请求操作 | `collaboration` | `accepted/rejected/cancelled` | 操作人 |
| 邀请链接创建 | `invitation` | `created` | 创建人, target_workspace |
| 邀请链接撤销 | `invitation` | `revoked` | 操作人 |

### 7.2 审计日志不可篡改

- `audit_logs` 表的 INSERT 仅由服务端受控执行。
- 普通用户和系统管理员 MUST NOT 能 UPDATE 或 DELETE audit_logs。
- 审计日志中的 `before_data` 和 `after_data` MUST 脱敏后写入。

---

## 8. 依赖与归属

- 合规词库管理：**ai-deepseek-engineer** (管理员 UI + API)，**data-security-engineer** (表结构 + RLS)
- 合规扫描模块 (`src/lib/compliance/check.ts`)：**ai-deepseek-engineer**
- `reserve_ai_quota()` 数据库函数：**data-security-engineer** (实现)，**ai-deepseek-engineer** (调用方接口协商)
- AI Usage Logs 写入：**ai-deepseek-engineer** 调用 RPC
- 成本熔断逻辑：**ai-deepseek-engineer** (服务端逻辑)，**data-security-engineer** (ai_user_limits 表)
- 审计日志写入：各 Agent 在服务端代码中调用统一的 `audit()` 工具函数
- 审计日志表结构 + RLS：**data-security-engineer**

---

## 9. Open Questions

无。所有影响 Phase 1 的问题均已在 HouseVibe Phase 0 v1.0 中冻结。
