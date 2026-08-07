# P3-AI-015 — 成本追踪审计与熔断器手动重置

- 任务：补齐 admin AI 用量管理权限变更的审计日志，并实现熔断器手动重置
- Owner：ai-deepseek-engineer
- 日期：2026-08-07

## 变更

| # | 文件 | 操作 | 说明 |
|---|------|------|------|
| 1 | `supabase/migrations/20260807000003_cost_tracking_audit_and_circuit_reset.sql` | 新建 | 修改 admin_upsert_user_limits 添加 audit_log INSERT，新建 admin_reset_circuit RPC |
| 2 | `src/features/ai-runtime/schemas.ts` | 修改 | 新增 ResetCircuitRequestSchema（Zod strict） |
| 3 | `src/app/api/admin/ai-models/route.ts` | 修改 | 新增 POST handler 调用 admin_reset_circuit RPC |
| 4 | `src/app/admin/ai-models/page.tsx` | 修改 | 熔断器断开时显示"重置熔断器"按钮 |
| 5 | `src/app/admin/ai-usage/page.tsx` | 修改 | groupBy 选择器增加"按工作区"选项 |
| 6 | `src/features/ai-runtime/__tests__/circuit-breaker.test.ts` | 新建 | 23 个单元测试：端点解析、健康检查、错误分类 |
| 7 | `e2e/cost-tracking-circuit-breaker.spec.ts` | 新建 | 8 个 E2E 测试：工作区分组、熔断器重置、非管理员拒绝、移动端布局 |

## 设计决策

1. **审计日志模式** — admin_upsert_user_limits 的审计写入完全遵循 admin_restore_user_access 的模式：先解析 workspace_id，再 INSERT 到 audit_logs
2. **熔断器重置** — 独立 RPC `admin_reset_circuit`，将 circuit_open 置为 false、consecutive_failures 清零，并写入审计日志（action: "ai_circuit_manually_reset"）
3. **工作区分组** — schema 和 RPC 早已支持 workspace 维度，只需在 UI 的 groupBy 数组中增加一项
4. **重置按钮** — 仅在熔断器断开（isCircuitOpen）时显示，避免误操作；重置后自动刷新页面状态
5. **严格输入校验** — ResetCircuitRequestSchema 使用 Zod .strict()，拒绝额外字段

## 安全考量

- admin_reset_circuit RPC 使用 SECURITY DEFINER + `set search_path = ''` + `private.is_system_admin()` 检查
- admin_upsert_user_limits 审计日志使用 `auth.uid()` 记录操作人
- POST handler 在调用 RPC 前先执行 `isSystemAdmin()` 守卫
- 所有管理员页面受 middleware 保护（非管理员被重定向）
- 无 Service Role 使用

## 门禁

| 门禁 | 结果 |
|------|------|
| `npm run typecheck` | ✓ 0 errors |
| `npm run lint` | ✓ 0 new errors（仅预存 warnings） |
| `npm run test` | ✓ 1378/1378（56 文件）含新增 23 tests |
| `npm run build` | ✓ 41/41 页面 |

## 依赖

- P3-AI-016（AI Runtime Config / Circuit Breaker）— 基础架构已实现
- P3-AI-017（Admin AI Usage Dashboard）— UI 基础已实现
- 迁移 20260806000012（admin_ai_usage_rpcs）— admin_upsert_user_limits 原有实现
- 迁移 20260806000011（fix_audit_log_columns）— audit_logs 列名修正与 actor_user_id nullable

## E2E 测试覆盖

| # | 测试 | 状态 |
|---|------|------|
| 1 | workspace grouping selector visible and clickable | ✓ |
| 2 | workspace grouping loads grouped data | ✓ |
| 3 | circuit breaker page loads with model cards | ✓ |
| 4 | reset button hidden when circuit is closed | ✓ |
| 5 | reset button visible and functional when circuit is open | ✓ |
| 6 | non-admin cannot access AI models page | ✓ |
| 7 | mobile 375px layout for AI usage dashboard | ✓ |
| 8 | mobile 375px layout for AI models page | ✓ |
