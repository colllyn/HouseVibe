# P2-DASH-001 — 今日工作台仪表盘

- 任务：实现 PRD §7.2 差异化工作台仪表盘
- Owner：property-crm-engineer
- 日期：2026-08-07

## 变更

| # | 文件 | 操作 | 说明 |
|---|------|------|------|
| 1 | `src/features/dashboard/schemas.ts` | 新建 | Zod schemas：TaskStat, ClientStat, PropertyStat, ContentStat, DashboardData（含 .min(0) 校验） |
| 2 | `src/features/dashboard/actions.ts` | 新建 | 服务端数据聚合：getWorkspaceContext、fetchTaskStats、fetchClientStats、fetchPropertyStats、fetchContentStats |
| 3 | `src/features/dashboard/__tests__/schemas.test.ts` | 新建 | 12 个测试：schema 校验、空状态、负值拒绝、missing fields |
| 4 | `src/app/(dashboard)/dashboard/page.tsx` | 替换 | 完整工作台：数据概览卡片、逾期/跟进提醒、快捷操作、内容用户专属区块 |
| 5 | `e2e/dashboard-flows.spec.ts` | 新建 | 13 个浏览器 E2E：加载、统计卡、导航链接、快捷操作、空状态、移动端、工作区隔离、非内容用户权限 |
| 6 | `playwright.config.ts` | 修改 | 新增 dashboard E2E 项目 |
| 7 | `package.json` | 修改 | 新增 test:e2e:dashboard 脚本 |

## 设计决策

1. **服务端聚合** — 使用 `"use server"` Server Action 直接查询 Supabase，避免额外 API 调用
2. **差异化展示** — content_factory 用户额外看到近期内容/未发布内容统计和"生成内容"快捷入口
3. **逾期/跟进醒目提示** — 逾期任务用 amber 卡片高亮，需跟进客户用 blue 卡片提示
4. **空状态友好** — 数据为 0 时显示"暂无待办"/"暂无客户"等友好提示，而非空白
5. **Mobile-first** — 使用 grid 布局，375px 下正常显示；快捷操作按钮最小 48px 触摸目标

## 门禁

| 门禁 | 结果 |
|------|------|
| `npm run typecheck` | ✓ 0 errors |
| `npm run lint` | ✓ 0 errors（仅既存警告） |
| `npm run test` | ✓ 1330/1330（54 文件） |
| `npm run build` | ✓ 41/41 页面 |
| `npx supabase test db` | ✓ 24/24（719 tests） |
| E2E dashboard | ✓ 13/13 |
| E2E semantic-search | ✓ 34/34 |
| E2E matching | ✓ 23/23 |
