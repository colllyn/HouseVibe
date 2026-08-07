# P1-INT-004 — CI 持续集成配置

- 任务：配置 GitHub Actions CI 流水线
- Owner：integration-engineer
- 日期：2026-08-07

## 变更

| # | 文件 | 操作 | 说明 |
|---|------|------|------|
| 1 | `.github/workflows/ci.yml` | 新建 | GitHub Actions 工作流：fast checks + Supabase DB |

## CI 流水线

### check job（每次 push/PR）
- TypeScript strict typecheck（`npm run typecheck`）
- ESLint（`npm run lint`）
- Vitest 单元测试（`npm run test`）
- Next.js 生产构建（`npm run build`）

### supabase job（每次 push/PR）
- Supabase DB lint（`supabase db lint`）
- Supabase pgTAP tests（`supabase test db`）

### 配置
- 触发：push to main + PR to main
- Node 24，npm ci 安装依赖
- 超时：15 分钟/任务
- 并发：同一 ref 取消旧运行（cancel-in-progress）

## 门禁

| 门禁 | 结果 |
|------|------|
| `npm run typecheck` | ✓ 0 errors |
| `npm run lint` | ✓ pre-existing only |
| `npm run test` | ✓ 1378/1378 |
| `npm run build` | ✓ 41/41 |
| `npx supabase test db` | ✓ 24/25（1 pre-existing） |

## 依赖

- P1-INT-001（项目初始化）— package.json / tsconfig 已就绪
