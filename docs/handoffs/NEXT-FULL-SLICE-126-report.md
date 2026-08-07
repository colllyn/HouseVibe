# NEXT-FULL-SLICE-126 完成报告

## 总览

| 阶段 | 内容 | 提交 |
|------|------|------|
| Phase A | 关闭 b922ceb：P0/P1 修复 + E2E 证据 + 三门审查 | `08a2514` |
| Phase B | 下一个权威切片：P2-MATCH-001 房客匹配仪表盘 | `41681a3` |

---

## Phase A — 关闭 b922ceb

### 修复的 P0/P1 问题

| 严重度 | 文件 | 问题 | 修复 |
|--------|------|------|------|
| P1 | `src/lib/ai/routes/parse-property-search-handler.ts` | `let filters` 无类型标注 | 添加 `PropertySearchFilters` 类型导入 |
| P1 | `src/lib/media/strip-exif.ts` | GIF 格式绕过 EXIF 剥离 | GIF 强制转换为 PNG（`image/gif → "png"`） |
| P1 | `src/app/api/properties/[id]/media/route.ts` | 上传失败时回退至原始文件 | 拒绝上传并返回 `MEDIA_EXIF_STRIP_FAILED` 错误码 |
| P1 | `src/lib/supabase/middleware.ts` | 软删除用户仍可访问受保护路由 | 增加 `profiles.deleted_at` 检查，返回 `deleted` 标志 |
| P1 | `src/middleware.ts` | 软删除用户无拦截 | 受保护路由重定向至 `/login?notice=account_deleted` |
| P1 | `src/app/(dashboard)/settings/privacy/actions.ts` | 重复删除无防护 | 增加双重删除守卫 + workspace_members 停用日志 |

### 新增测试

| 文件 | 测试数 | 覆盖 |
|------|--------|------|
| `src/app/api/ai/parse-property-search/__tests__/route.test.ts` | +6 (24→30) | 配额生命周期：reserve/settle/release + 错误场景 |
| `src/app/api/ai/extract-property/__tests__/route.test.ts` | +6 (29→35) | 同上 |
| `src/app/api/ai/extract-client/__tests__/route.test.ts` | +6 (34→40) | 同上 |
| `src/app/api/properties/__tests__/media-route.test.ts` | 修复 | jsdom File.arrayBuffer polyfill + vi.hoisted mock |
| `src/lib/media/__tests__/strip-exif.test.ts` | +8 (新建) | sharp 调用、格式转换、GIF→PNG、错误传播 |
| `src/app/(dashboard)/settings/privacy/__tests__/actions.test.ts` | +8 (新建) | exportDataAction(4) + deleteAccountAction(4) |
| `e2e/p4-review-closure.spec.ts` | +7 (新建) | /content /publishing 鉴权重定向、隐私导出、删除确认、工作区隔离 |
| **总计新增** | **+34** | **1282 → 1316** |

### 门禁结果

| 门禁 | 结果 |
|------|------|
| `git diff --check` | ✓ |
| `npm run lint` | ✓ 0 errors |
| `npm run typecheck` | ✓ 0 errors |
| `npm run test` | ✓ 1316/1316 |
| `npm run build` | ✓ |
| `npx supabase test db` | ✓ |
| `/housevibe-ai-route-gate` | ✓ 所有检查通过 |
| `/housevibe-ai-quota-gate` | ✓ 所有检查通过 |
| 三位 Reviewer | ✓ AGENT_READY, P0=0, P1=0 |

---

## Phase B — P2-MATCH-001 房客匹配仪表盘

### 问题

匹配引擎、Zod schemas、React 组件（MatchCard/MatchList/MatchStats/WeightEditor）和所有 API 路由（POST /api/matches/calculate、PATCH /api/matches/[id]、GET /api/clients/[id]/matches、GET /api/properties/[id]/matches）**已存在**，但缺少把它们连接起来的仪表盘页面和导航入口——最终用户无法通过 UI 使用匹配功能。

### 修改的文件

| # | 文件 | 操作 | 说明 |
|---|------|------|------|
| 1 | `src/features/matching/components/match-list.tsx` | 修改 | 导出 `MatchItem` 接口，增加 `onArchive` prop 并转发至 MatchCard |
| 2 | `src/app/(dashboard)/matches/page.tsx` | 新建 | 完整仪表盘：客户选择器、权重编辑器、计算按钮、统计面板、匹配列表、dismiss/archive |
| 3 | `src/components/layout/desktop-sidebar.tsx` | 修改 | 添加 `GitMerge` 图标 + "房客匹配" 导航项，位于客户与内容之间 |
| 4 | `src/components/layout/navigation.test.tsx` | 修改 | 更新测试期望以覆盖新增的导航项 |
| 5 | `src/app/(dashboard)/clients/[clientId]/page.tsx` | 修改 | 新增 "房源匹配" 区域（MatchList + 计算匹配按钮 + dismiss/archive） |
| 6 | `src/app/(dashboard)/properties/[propertyId]/matches-section.tsx` | 新建 | 属性详情页的客户端包装组件（只读匹配列表） |
| 7 | `src/app/(dashboard)/properties/[propertyId]/page.tsx` | 修改 | 通过 `<Suspense>` 集成 PropertyMatchSection |

### 设计决策

1. **移动端导航不变**——移动端底部导航已有 5 项（PRD 上限），仅在桌面侧栏增加匹配入口
2. **仪表盘 POST 后重新 GET**——`POST /api/matches/calculate` 返回的计算结果不含持久化 ID，dismiss/archive 需重新从 GET 端点获取
3. **属性页只读**——匹配以客户为维度计算，属性详情页仅展示已存在的匹配列表
4. **类型安全**——从 `match-list.tsx` 导出 `MatchItem`，消除消费者处的类型重复

### 门禁结果

| 门禁 | 结果 |
|------|------|
| `npm run typecheck` | ✓ 0 errors |
| `npm run lint` | ✓ 0 errors（仅有既存警告） |
| `npm run test` | ✓ 1318/1318（53 文件） |
| `npm run build` | ✓ 41/41 页面 |

### 文件统计

```
 7 files changed, 543 insertions(+), 3 deletions(-)
```

### Handoff

`docs/handoffs/P2-MATCH-001-property-crm-engineer.md`

---

## 最终状态

| 指标 | 值 |
|------|-----|
| 提交数 | 2 |
| 总测试数 | 1318 |
| 测试文件数 | 53 |
| 工作区状态 | clean |
| P0/P1 安全问题 | 0 |
| 构建状态 | ✓ |
