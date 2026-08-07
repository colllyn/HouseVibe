# P1-INT-005 — Vercel 部署配置

- 任务：配置 Vercel 部署
- Owner：integration-engineer
- 日期：2026-08-07

## 变更

| # | 文件 | 操作 | 说明 |
|---|------|------|------|
| 1 | `vercel.json` | 新建 | Vercel 部署配置（区域、构建、安全头、AI 路由超时） |

## 配置详情

### vercel.json

- **Framework:** `nextjs`（显式声明）
- **Region:** `hkg1`（香港，最近中国用户）
- **Build:** `npm run build` / `npm ci`
- **AI 路由:** `maxDuration: 60s`（视觉推理等长请求）
- **安全头:** `nosniff`, `DENY` framing, `strict-origin-when-cross-origin`
- **GitHub:** `autoJobCancelation: true`（新推送取消旧预览构建）

### Vercel 项目环境变量

部署前需在 Vercel Dashboard → Settings → Environment Variables 中配置以下变量：

| 变量名 | 环境 | 说明 |
|--------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | All | Supabase 项目 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All | Supabase Anon Key |
| `NEXT_PUBLIC_APP_URL` | All | 应用 URL（生产为实际域名） |
| `SUPABASE_SERVICE_ROLE_KEY` | All | Supabase Service Role Key（服务端） |
| `DEEPSEEK_API_KEY` | All | DeepSeek API Key |
| `DEEPSEEK_BASE_URL` | All | DeepSeek API 地址 |
| `DEEPSEEK_MODEL` | All | 主模型（deepseek-v4-flash） |
| `DEEPSEEK_FALLBACK_MODEL` | All | 备用模型（deepseek-v4-pro） |
| `STT_BASE_URL` | All | STT 服务地址 |
| `STT_API_KEY` | All | STT API Key |
| `INVITE_TOKEN_SECRET` | All | 邀请令牌密钥（≥32 字符） |
| `CRON_SECRET` | All | Cron Job 密钥 |

> **注意：** 所有 `NEXT_PUBLIC_*` 变量在构建时嵌入客户端代码，其余变量仅服务端可用。不要将 `SUPABASE_SERVICE_ROLE_KEY` 设为 `NEXT_PUBLIC_*`。

### 预览部署

- Vercel GitHub App 自动为每个 PR 创建预览部署
- 预览 URL 格式：`https://{project-name}-git-{branch}-{org}.vercel.app`
- 预览环境使用独立的环境变量（可在 Vercel Dashboard 中为 Preview 环境配置不同值）
- `autoJobCancelation: true`：同一 PR 新推送自动取消旧构建

### 生产部署

- 推送到 `main` 分支自动部署到生产
- Vercel GitHub App 监听 push 事件，自动触发构建和部署
- 无需额外 CI 步骤（Vercel 平台自身处理构建、部署、CDN 分发）

## 门禁

| 门禁 | 结果 |
|------|------|
| `npm run typecheck` | ✓ 0 errors |
| `npm run lint` | ✓ pre-existing only |
| `npm run test` | ✓ 1378/1378 |
| `npm run build` | ✓ |
| `npx supabase test db` | ✓ 25/25 (744 tests) |
| `npx supabase db lint` | ✓ pre-existing warnings only |

## 部署验证清单

完成 Vercel 项目关联后验证：

- [ ] 推送到 `main` → 生产部署成功
- [ ] 创建 PR → 自动创建预览部署
- [ ] 预览部署 URL 可访问
- [ ] 首页加载正常
- [ ] API 路由正常响应（检查 `/api/health` 或等效端点）
- [ ] 环境变量正确注入（检查 Supabase 连接）

## 依赖

- P1-INT-001（项目初始化）— package.json / next.config.ts 已就绪
- P1-INT-004（CI 流水线）— GitHub Actions 已配置
