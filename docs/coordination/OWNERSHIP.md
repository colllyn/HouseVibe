# 文件所有权矩阵

| Agent | 可写路径 |
|---|---|
| product-planner | `docs/plans/**`, `docs/handoffs/**` |
| solution-architect | `docs/contracts/**`, `docs/decisions/**`, `docs/handoffs/**` |
| data-security-engineer | `supabase/**`, `src/lib/supabase/**`, `src/features/auth/**`, `src/features/access-control/**`, `src/features/entitlements/**`, `src/app/(auth)/**`, `src/app/onboarding/**`, `src/app/admin/layout.tsx`, `src/app/admin/page.tsx`, `src/app/admin/users/**`, `src/app/admin/feature-entitlements/**`, `src/app/admin/invites/**`, `src/app/api/auth/**`, `src/app/api/invites/**`, `src/app/api/admin/users/**`, `src/app/api/admin/feature-entitlements/**`, `src/app/api/admin/invites/**`, `src/app/(dashboard)/settings/**`, `src/app/(dashboard)/profile/**`, `src/config/env.ts`, `src/config/**/*.test.ts`, `src/lib/privacy/**`, `src/types/database.ts`, `docs/handoffs/**` |
| property-crm-engineer | `src/features/properties/**`, `src/features/clients/**`, `src/features/matching/**`, `src/features/tasks/**`, `src/features/collaboration/**`, `src/app/(dashboard)/properties/**`, `src/app/(dashboard)/properties/shared/**`, `src/app/(dashboard)/clients/**`, `src/app/(dashboard)/matches/**`, `src/app/(dashboard)/tasks/**`, `src/app/(dashboard)/collaboration-requests/**`, `src/app/api/properties/**`, `src/app/api/clients/**`, `src/app/api/matches/**`, `src/app/api/tasks/**`, `src/app/api/shared-properties/**`, `src/app/api/collaboration-requests/**`, `docs/handoffs/**` |
| ai-deepseek-engineer | `src/lib/ai/**`, `src/lib/compliance/**`, `src/features/content-generation/**`, `src/features/ai-runtime/**`, `src/features/ai-corrections/**`, `src/features/ai-preferences/**`, `src/features/ai-quota/**`, `src/features/compliance/**`, `src/app/api/ai/**`, `src/app/(dashboard)/content/**`, `src/app/(dashboard)/publishing/**`, `src/app/admin/ai-usage/**`, `src/app/admin/ai-models/**`, `src/app/admin/ai-corrections/**`, `src/app/admin/compliance/**`, `src/app/api/admin/ai-usage/**`, `src/app/api/admin/ai-models/**`, `src/app/api/admin/ai-corrections/**`, `src/app/api/admin/compliance-terms/**`, `docs/handoffs/**` |
| mobile-ui-engineer | `src/components/ui/**`, `src/components/layout/**`, `src/components/responsive/**`, `src/hooks/use-responsive*.ts`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/(dashboard)/layout.tsx`, `src/app/(dashboard)/page.tsx`, `docs/handoffs/**` |
| test-engineer | 只修改测试资产；测试文件（`.test.ts`, `.test.tsx`, `.spec.ts`, `.spec.tsx`）可放在 `src/**` 下；`tests/**`, `e2e/**`, `supabase/tests/**`, `playwright.config.*`, `vitest.config.*`, `docs/handoffs/**` |
| integration-engineer | `package.json`, lockfile（`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`）, `next.config.*`, `tsconfig.json`, `eslint.config.*`, `postcss.config.*`, `tailwind.config.*`, `components.json`, `.github/**`, `scripts/**`, `src/config/**`, `src/lib/env/**`, `vercel.json`, `README.md`, `docs/handoffs/**` |
| quality-reviewer | 只读，无 Owned Write Paths |
| 主 Agent | 任务编排、冲突解决；仅在无人拥有的文件或明确集成任务中写入 |

## 领域边界

### data-security-engineer

拥有 Admin 根布局（`src/app/admin/layout.tsx`、`src/app/admin/page.tsx`）和用户、邀请、Entitlement 管理。
Feature Entitlement 管理页面 URL：`/admin/feature-entitlements`，API：`/api/admin/feature-entitlements/**`，数据库表：`feature_entitlements`。
不拥有 AI 模型、AI 用量、AI 纠错和合规词库业务实现。

### ai-deepseek-engineer

拥有所有 AI 管理页面和 API（ai-usage、ai-models、ai-corrections、compliance）。
不可修改 Admin 根布局，不可修改用户、邀请和 entitlement 管理 API。

### property-crm-engineer

拥有所有房源、客户、匹配、待办、共享和协作业务页面与 API。

共享房源命名约定：
- 用户页面 URL：`/properties/shared`（路径：`src/app/(dashboard)/properties/shared/**`）
- API 端点：`/api/shared-properties/**`（页面 URL 与 API 资源名可以不同，必须在 API 契约中明确）

### test-engineer

只能修改测试资产。当测试文件位于 `src/**` 下时，Hook 根据测试文件后缀精确判断，不授予整个生产目录的写权限。

## 共享文件规则

- `package.json`、lockfile：只由 integration-engineer 写。
- `supabase/migrations/**`：只由 data-security-engineer 写。
- `docs/contracts/**`：冻结前 Planner/Architect 写；冻结后仅通过 ADR 变更。
- 所有 Agent 的 handoff 文件必须使用唯一 Task ID，避免冲突。
- Admin 导航变更：各 feature 模块通过 admin-nav 组合模式贡献导航项，避免串行依赖 data-security-engineer。
