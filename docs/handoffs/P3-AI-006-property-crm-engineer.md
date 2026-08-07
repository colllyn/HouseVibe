# P3-AI-006 — 房源图片视觉分析 UI 集成

- 任务：实现房源图片 AI 视觉分析的前端 UI
- Owner：property-crm-engineer
- 日期：2026-08-07

## 变更

| # | 文件 | 操作 | 说明 |
|---|------|------|------|
| 1 | `src/features/properties/components/analyze-images-button.tsx` | 新建 | 触发 POST /api/ai/analyze-property-images 的客户端按钮，含 loading/error/success 状态 |
| 2 | `src/features/properties/components/visual-summary-section.tsx` | 新建 | 展示 AI 视觉摘要和事实交叉校验结果，支持 4 种判决类型 |
| 3 | `src/features/properties/components/__tests__/visual-summary-section.test.tsx` | 新建 | 9 个单元测试：空状态、摘要渲染、事实标记、判决标签 |
| 4 | `src/app/(dashboard)/properties/[propertyId]/page.tsx` | 修改 | 集成分析按钮和视觉摘要区域到房源详情页 |
| 5 | `src/features/properties/actions.ts` | 修改 | getPropertyById 增加 media_count 查询 |

## 设计决策

1. **按钮状态管理** — 使用 React useState 管理 loading/error/success，避免全局状态污染
2. **组件化展示** — VisualSummarySection 独立组件，支持仅摘要、仅标记、两者混合三种模式
3. **类型安全** — VisualFactFlag 接口与数据库 visual_fact_flags JSONB 结构一致
4. **判决 UI** — 4 种判决类型（verified/unverified/conflict/insufficient）各有独立配色和图标
5. **空状态友好** — 无分析数据时组件返回 null，不占页面空间

## 门禁

| 门禁 | 结果 |
|------|------|
| `npm run typecheck` | ✓ 0 errors |
| `npm run lint` | ✓ 0 errors |
| `npm run test` | ✓ 1355/1355（55 文件） |
| `npm run build` | ✓ 41/41 页面 |
| `npx supabase test db` | ✓ 24/24（719 tests） |
| `npx supabase db lint` | ✓ pre-existing only |

## 依赖

- P3-AI-005（DeepSeek Vision Provider）— API 已实现
- P2-PROP-003（Property Media）— 图片上传已实现
- POST /api/ai/analyze-property-images — Route Handler 已实现
