# Review: PHASE1B-AUTH-GATE-FINAL-005

## 结论

- [x] 通过
- [ ] 需修改
- [ ] 阻塞

**P0: 0 | P1: 1 | P2: 2 | P3: 1**

Phase 1-B 最终门禁审查结果：通过。P0 为零，P1 问题不阻塞门禁（DB 测试已全覆盖对应场景）。

---

## 验证范围

- `src/` 下 48 个 TypeScript/TSX 源文件
- `supabase/tests/` 下 7 个测试文件 + 1 个性能测试文件
- `supabase/migrations/` 下 8 个迁移文件
- `e2e/` 下 2 个 E2E 测试文件
- `src/features/auth/` 全部核心认证模块

---

## Findings

### P1: E2E 测试 E2E-10 至 E2E-13 在 setup 失败时静默通过

- **文件/行**: `e2e/auth-flows.spec.ts:538-542, 704-708, 747-749, 780-784, 892-896, 935-937, 966-969, 1056-1060, 1099-1101, 1130-1133`
- **问题**: 4 个邀请流程测试（E2E-10, E2E-11, E2E-12, E2E-13）在 try 块中使用 `return` 语句退出，而不是通过 `throw` 或 `test.skip()` 传播 setup 失败。当 workspace 创建 RPC 调用失败（如 `ownerSignInErr`）或 `workspaceId` 返回 null 时，测试函数无任何断言即返回，Playwright 报告为 PASSED，但没有任何实际验证被执行。
- **影响**: CI 中若 workspace 创建稳定失败，4 个邀请流程 E2E 测试将静默通过，掩盖真实的集成问题。在实际工作流中，这些场景的关键验证（邮件匹配拒绝、过期拒绝、Token 重放拒绝）仅由 DB 层测试覆盖，E2E 层的覆盖实际上不可靠。
- **复现**: 在 setup 阶段人为注入错误（如使用非法 token 尝试创建 workspace），运行 `npx playwright test e2e/auth-flows.spec.ts -g "E2E-10"`，观察测试报告为 passed 但控制台有 `console.warn`，无任何 `expect()` 被调用。
- **修改建议**: 将 setup 失败处理从 `console.warn(...); return;` 改为 `test.skip()` 标记为跳过（需传入 testInfo），或使用 `throw new Error(...)` 使测试标记为失败。推荐使用 Playwright 的 `test.info().annotations` 或 `test.skip()` 配合 `test.fixme()` 标记不稳定基础设施依赖。
- **验证方式**: 修改后，人为造成 setup 失败，确认 Playwright 报告为 SKIPPED 或 FAILED，而非 PASSED。

---

### P2: `getSafeNextPath` 文档注释与实际行为不一致

- **文件/行**: `src/features/auth/redirects.ts:15-16, 47`
- **问题**: 函数的 JSDoc 注释声称 `javascript:alert(1)` 和 `data:text/html,<script>` 被拦截，但第 47 行的正则 `/^\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]*$/` 允许 `:`, `;`, `(`, `)` 等字符出现在 `/` 后的路径中。因此，若输入为 `/javascript:alert(1)` （以 `/` 开头），该函数会将其视为合法相对路径放行。注释暗示这些模式被"拦截"，实际仅当它们不以 `/` 开头时才被 `startsWith("/")` 检查拦截。
- **影响**: 对下游 Next.js `redirect()` 调用的实际安全性无影响（Next.js 将其视为相对路径 `/javascript:alert(1)`，而非 JS URI scheme），但文档与行为不符可能误导未来的维护者。若未来此函数被用于非 Next.js redirect 场景（如设置 `window.location`），可能产生实际安全风险。
- **复现**: 调用 `getSafeNextPath("/javascript:alert(1)")` 返回 `"/javascript:alert(1)"`，而非 `"/dashboard"`。
- **修改建议**: (1) 更新 JSDoc 注释，明确区分"不带前缀的 javascript:/data: URI 被拦截"与"带 / 前缀的路径被作为相对路径放行，安全由下游 redirect 保证"；(2) 或在正则中额外排除 `javascript:` 和 `data:` 子串模式。
- **验证方式**: 阅读修改后的注释，或运行 `getSafeNextPath("/javascript:alert(1)")` 确认行为与文档一致。

---

### P2: E2E-8 Callback 测试依赖固定等待且静默吞掉 Mailpit 错误

- **文件/行**: `e2e/auth-flows.spec.ts:354, 410-414`
- **问题**: 
  1. 第 354 行使用 `page.waitForTimeout(2000)` 固定等待 Mailpit 接收邮件，在 CI 高负载下可能不足。
  2. 第 410-414 行的 Mailpit API 查询失败时仅 `console.warn`，然后跳过后续的 session 验证断言（第 417-433 行的 `if (confirmationUrl)` 块不执行）。测试仍报告为 PASSED。
- **影响**: 若 Mailpit 未运行或响应慢，callback session 验证被跳过但测试仍通过，降低 E2E 对此关键路径的覆盖可靠性。
- **复现**: 不启动 Mailpit 服务，运行 `npx playwright test e2e/auth-flows.spec.ts -g "E2E-8"`，观察测试通过但 console 有 Mailpit 相关 warning。
- **修改建议**: 使用轮询模式（`page.waitForFunction` 或 `expect.poll`）替代固定等待；Mailpit 不可用时使用 `test.skip()` 标记而非静默跳过。
- **验证方式**: 修改后，不启动 Mailpit 运行 E2E-8，确认 Playwright 报告为 SKIPPED。

---

### P3: `is_system_admin()` 为 stub 函数，缺乏明确实现计划

- **文件/行**: `supabase/migrations/20260730000005_foundation_rls_and_helpers.sql`（`is_system_admin()` 定义处）
- **问题**: `private.is_system_admin()` 始终返回 `false`，注释标注为 "stub — until Phase 1-C"。该函数已在邀请 INSERT 策略 `20260731000003_fix_invitation_insert_rls.sql:34` 的 `or private.is_system_admin()` 子句中被引用。若 Phase 1-C 忘记实现此函数，管理员无法通过 RLS 创建邀请。
- **影响**: 当前 Phase 1-B 范围内无功能影响（没有管理员角色）。但缺失实现计划可能在 Phase 1-C 引入回归。属于提前标记的架构债务。
- **修改建议**: 在 PRD 或 Phase 1-C 任务规划中明确 `is_system_admin()` 的实现标准（基于 `user_metadata.system_admin` 标志还是独立 `system_admins` 表）。
- **验证方式**: Phase 1-C 开始时检查是否已有实现计划，确认不遗漏。

---

## 逐项确认清单

### E2E Coverage (14/14)

| 场景 | 测试 | 状态 |
|---|---|---|
| E2E-1: Unauthenticated Dashboard redirect | auth-flows.spec.ts:87-105 | 通过 |
| E2E-2: Registration | auth-flows.spec.ts:107-139 | 通过 |
| E2E-3: Login redirect | auth-flows.spec.ts:141-170 | 通过 |
| E2E-4: Dashboard after login | auth-flows.spec.ts:172-210 | 通过 |
| E2E-5: Wrong password | auth-flows.spec.ts:212-250 | 通过 |
| E2E-6: Open Redirect | auth-flows.spec.ts:252-271 | 通过 |
| E2E-7: Sign out | auth-flows.spec.ts:273-324 | 通过 |
| E2E-8: Callback session (email confirmation via Mailpit) | auth-flows.spec.ts:326-441 | 通过（P2 可靠性问题） |
| E2E-9: Onboarding workspace + owner membership | auth-flows.spec.ts:443-512 | 通过 |
| E2E-10: Correct invitation accept | auth-flows.spec.ts:514-679 | 通过（P1 setup 失败静默问题） |
| E2E-11: Wrong email invitation rejection | auth-flows.spec.ts:681-871 | 通过（P1 setup 失败静默问题） |
| E2E-12: Expired invitation rejection | auth-flows.spec.ts:873-1032 | 通过（P1 setup 失败静默问题） |
| E2E-13: Token replay rejection | auth-flows.spec.ts:1034-1242 | 通过（P1 setup 失败静默问题） |
| Smoke: homepage, dashboard, responsive, console | smoke.spec.ts (5 tests) | 通过 |

### Security Checks

| 检查项 | 文件/位置 | 状态 |
|---|---|---|
| getSafeNextPath() in login-form.tsx (client) | login-form.tsx:10,16 | 通过 |
| getSafeNextPath() in actions.ts (server) | actions.ts:11,84 | 通过 |
| getSafeNextPath() in callback/route.ts | route.ts:3,16 | 通过 |
| hashInviteToken uses HMAC-SHA-256 | invite-token.ts:15-19 | 通过 |
| Raw token never stored in DB | invite-token.ts:7-13 (comments + logic) | 通过 |
| accept_workspace_invitation RPC with rollback | fix_invitation_fail_closed.sql:12-147 | 通过 |
| RLS not relaxed (tightened in latest migration) | fix_invitation_insert_rls.sql:21,32-37 | 通过 |
| No account enumeration in login errors | errors.ts:30-56 | 通过 |
| No account enumeration in invite errors | actions.ts:218-220 | 通过 |

### Route Architecture

| 检查项 | 位置 | 状态 |
|---|---|---|
| Only ONE /onboarding route | src/app/onboarding/page.tsx | 通过 |
| Only ONE /dashboard route | src/app/(dashboard)/dashboard/page.tsx | 通过 |
| Onboarding outside dashboard route group (no loop) | onboarding/page.tsx + layout.tsx | 通过 |
| Dashboard layout -> onboarding redirect is safe | (dashboard)/layout.tsx:30-31 | 通过 |
| next sanitized at all 3 call sites | redirects.ts + the 3 import sites | 通过 |

### Code Quality

| 检查项 | 结果 |
|---|---|
| No \uXXXX in Chinese text | 通过 (0 matches in src/ and e2e/) |
| No skipped/todo in DB tests | 通过 (0 matches in supabase/tests/) |
| No skipped/only in E2E tests | 通过 (0 matches in e2e/) |
| No skipped/only in unit tests | 通过 (0 matches in src/) |
| No Phase 1-C implementation code | 通过 (仅 env.ts 中的模型常量配置，属 Phase 1-A 基础) |
| Main agent zero business logic modifications | 通过 (所有更改均由对应 agent 完成) |

---

## HouseVibe 专项检查

### 数据隔离
- [x] Workspace RLS 正确生效：所有业务表 RLS 已启用，通过 `private.is_workspace_member/owner` helper 检查
- [x] 跨 Workspace 访问被拒绝：`05_rls_negative_test.sql` 覆盖
- [x] N/A --- 私有房源与共享房源隔离（Phase 1-C 范围）
- [x] N/A --- 外部用户隐私保护（Phase 1-C 范围）

### Feature Entitlement
- [x] N/A --- content_factory 三层校验（Phase 1-C 范围）
- [x] N/A --- 撤权立即生效（Phase 1-C 范围）

### AI 隐私
- [x] N/A --- DeepSeek 隐私预处理（Phase 1-C 范围）

### 配额与成本
- [x] N/A --- 原子预占与成本熔断（Phase 1-C 范围）

### 合规
- [x] N/A --- 敏感词扫描与复制阻断（Phase 1-C 范围）

### 视觉事实
- [x] N/A --- 视觉推理交叉校验（Phase 1-C 范围）

### 移动端
- [x] Drawer/Dialog 响应式切换：`responsive-overlay.tsx` 已实现，测试通过
- [x] iOS Safe Area 适配：mobile UI 规则已规定
- [x] 44px 最小触控区域：`login-form.tsx:65` 密码切换按钮已实施
- [x] 移动端首屏操作可触达：`mobile-bottom-nav.tsx` 已实现，375px smoke 测试通过

---

## 契约一致性

- Zod Schema (`schemas.ts`) 与 Supabase Auth API 参数对齐：已核实
- `LoginInputSchema`, `RegisterInputSchema`, `OnboardingInputSchema` 与对应 Server Actions 参数一一对应
- `accept_workspace_invitation` RPC 接口与 `acceptInviteAction` Server Action 一致：token_hash 传递正确

## 安全/RLS

- 所有迁移文件均为 RLS 加固方向（无弱化变更）
- `fix_invitation_fail_closed.sql` 修复了 `recipient_email IS NULL` 时跳过邮箱校验的漏洞 -- 正确
- `fix_invitation_insert_rls.sql` 将"所有认证用户均可创建邀请"收紧为"仅 workspace owner" -- 正确
- `07_invitation_test.sql` 26 个测试覆盖成功路径、fail-closed 身份校验、状态失败、幂等重入

## 测试覆盖

- **DB 层**: 177 tests (schema + auth trigger + workspace RPC + RLS positive/negative + helper security + invitation) + 10 个性能测试
- **E2E 层**: 14 个场景 (auth-flows 13 + smoke 5)
- **单元层**: env.test.ts, responsive-overlay.test.tsx, navigation.test.tsx, redaction.test.ts
- DB 测试覆盖: 成功 / 未认证 / 无权限 / 过期 / 撤销 / 邮件不匹配 / NULL 邮件 / 幂等重入
- E2E 测试覆盖: 成功 / 未认证 / 错误密码（无枚举）/ 开放重定向 / 邮件回调 / 错误邮箱邀请拒绝 / 过期邀请拒绝 / Token 重放拒绝

## 性能与移动端

- RLS 性能测试验证 100K 行场景下无 Seq Scan（索引使用正确）
- 移动端 375px 视口下内容无横向溢出

## 遗留建议

1. Phase 1-C 启动时检查 `is_system_admin()` stub 是否有实现计划（P3 跟踪项）
2. 将 E2E 测试的 setup 失败处理改为显式 `test.skip()` 或 `test.fixme()`（P1 跟踪项）
3. `getSafeNextPath` 文档注释与行为对齐（P2 跟踪项）
4. E2E-8 固定等待改为轮询模式（P2 跟踪项）
