# 文件所有权矩阵

| Agent | 可写路径 |
|---|---|
| product-planner | `docs/plans/**`, `docs/contracts/**`, `docs/handoffs/**` |
| solution-architect | `docs/contracts/**`, `docs/decisions/**`, `docs/handoffs/**` |
| data-security-engineer | `supabase/**`, `src/lib/supabase/**`, `src/features/auth/**`, `src/features/access-control/**`, `src/app/(auth)/**`, `src/app/api/auth/**`, `src/app/api/admin/**`, `src/app/admin/users/**`, `src/app/admin/feature-access/**`, `src/app/admin/invites/**`, `src/types/database.ts`, `docs/handoffs/**` |
| property-crm-engineer | `src/features/properties/**`, `src/features/clients/**`, `src/features/matching/**`, `src/features/tasks/**`, `src/features/collaboration/**`, `src/app/(dashboard)/properties/**`, `src/app/(dashboard)/clients/**`, `src/app/(dashboard)/matches/**`, `src/app/(dashboard)/tasks/**`, `src/app/(dashboard)/shared/**`, `src/app/api/properties/**`, `src/app/api/clients/**`, `src/app/api/matches/**`, `src/app/api/tasks/**`, `src/app/api/shared-properties/**`, `docs/handoffs/**` |
| ai-deepseek-engineer | `src/lib/ai/**`, `src/lib/compliance/**`, `src/features/ai-ingestion/**`, `src/features/content/**`, `src/features/ai-admin/**`, `src/app/api/ai/**`, `src/app/(dashboard)/content/**`, `src/app/admin/ai-usage/**`, `src/app/admin/compliance/**`, `docs/handoffs/**` |
| mobile-ui-engineer | `src/components/ui/**`, `src/components/layout/**`, `src/components/responsive/**`, `src/hooks/use-responsive*.ts`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/(dashboard)/layout.tsx`, `docs/handoffs/**` |
| test-engineer | `tests/**`, `e2e/**`, `fixtures/**`, `playwright.config.*`, `vitest.config.*`, `docs/handoffs/**` |
| integration-engineer | `package.json`, lockfile, `next.config.*`, `tsconfig.json`, `eslint.config.*`, `postcss.config.*`, `tailwind.config.*`, `components.json`, `.github/**`, `scripts/**`, `src/config/**`, `src/lib/env/**`, `vercel.json`, `README.md`, `docs/handoffs/**` |
| quality-reviewer | 只读 |
| 主 Agent | 任务编排、冲突解决；仅在无人拥有的文件或明确集成任务中写入 |

## 共享文件规则

- `package.json`、lockfile：只由 integration-engineer 写。
- `supabase/migrations/**`：只由 data-security-engineer 写。
- `docs/contracts/**`：冻结前 Planner/Architect 写；冻结后仅通过 ADR 变更。
- 所有 Agent 的 handoff 文件必须使用唯一 Task ID，避免冲突。
