# 阳光智家 HouseVibe

移动端优先的房产经纪 CRM 与 AI 智能业务助手

HouseVibe 帮助房产经纪人统一管理房源、客户、跟进任务和房客匹配，并通过 AI 文字录入、结构化提取与内容工具降低日常录入和运营成本。

Production deployment is managed through Vercel.

## 核心功能

### 房源管理

- 房源 CRUD
- 图片与媒体管理
- 搜索与筛选
- 房源详情
- 软删除
- Workspace 数据隔离

### AI 房源智能录入

直接输入自然语言房源描述，AI 自动提取结构化字段并填入房源表单，用户确认和修改后再创建房源。

- AI 不直接写数据库
- 用户最终确认
- 缺失事实不会自动编造

### 客户管理

- 客户 CRUD
- 需求信息
- 跟进记录
- 客户详情

### AI 客户智能录入

输入客户信息和找房需求，AI 自动结构化提取并填写客户表单，人工确认后创建客户。

### 房客匹配

- 基于客户需求与当前 Workspace 房源进行匹配
- 匹配评分与解释
- 权重调整
- Dismiss / Archive

### 工作台

- 今日待办
- 逾期提醒
- 客户跟进提醒
- 房源、客户、匹配统计
- 快捷操作入口

### 任务与跟进

- 任务 CRUD
- 状态管理
- 到期与逾期
- 客户业务跟进

### 协作共享

- 脱敏共享房源
- 协作请求管理
- Workspace 安全边界

私人字段不会跨 Workspace 暴露。

### AI 内容能力

- AI 内容生成与版本管理
- 内容反馈（准确度、语气、格式）
- 内容事实检查
- 发布记录
- AI 使用统计与配额
- 用户 AI 偏好学习
- Circuit Breaker 成本熔断

仅授权用户可使用内容工厂（content_factory）。

### 合规预检

- 房产营销合规风险词库
- 内容预检
- 高风险命中时复制拦截

### 用户与权限

- 注册、登录、邀请制加入
- Workspace 成员管理
- 功能授权（Entitlement）管理
- 管理员可授予、撤销、设置有效期并审计

## 产品设计原则

- **Mobile-first** — 核心路径在 375px 宽度下可用，移动端底部导航
- **Workspace isolation** — 所有业务数据通过 `workspace_id` 隔离
- **RLS default-deny** — PostgreSQL Row Level Security 默认拒绝
- **AI human-in-the-loop** — AI 负责提取和辅助，不直接替用户提交关键业务事实；房源与客户数据最终均由用户确认后保存
- **Fail-closed AI provider** — AI 调用失败时拒绝服务，不回退到未经授权的模型
- **Privacy by design** — 房东/客户联系方式、精确地址、钥匙位置不发送给模型

## 技术栈

### Frontend

| 技术 | 用途 |
|------|------|
| Next.js (App Router) | 全栈框架 |
| React 19 | UI |
| TypeScript (strict) | 类型安全 |
| Tailwind CSS 4 | 样式 |
| shadcn/ui | 组件库 |
| React Hook Form | 表单 |
| Zod | Schema 校验 |

### Backend

| 技术 | 用途 |
|------|------|
| Next.js Route Handlers / Server Actions | API |
| Supabase Auth | 身份认证 |
| PostgreSQL | 数据存储 |
| Row Level Security | 数据隔离 |
| Supabase Storage | 文件存储 |

### AI

| 技术 | 用途 |
|------|------|
| DeepSeek Provider | 文本理解、抽取、内容生成与推理 |
| DeepSeek Vision Provider | 视觉理解（独立部署） |
| Structured Extraction | AI 输出结构化提取与校验 |
| AI Quota Lifecycle | 原子预占、幂等键、失败释放、成本熔断 |
| Circuit Breaker | 故障隔离与主备模型切换 |

### 测试与部署

| 技术 | 用途 |
|------|------|
| Vercel | 托管与部署 |
| GitHub Actions | CI |
| Vitest | 单元与集成测试 |
| Playwright | 浏览器 E2E 测试 |
| pgTAP | RLS 与数据库安全测试 |

## 架构与安全

每个请求链路：

```text
Auth → Workspace Membership → RLS → Route-level Authorization
```

- 所有业务 Route 在服务端验证用户身份
- Workspace 数据隔离：所有查询和写入验证成员关系
- PostgreSQL RLS default-deny，不使用 Service Role 代替正常用户权限
- AI Route 独立检查 Auth / Workspace / Entitlement
- AI 配额原子预占、结算与失败释放
- 敏感信息仅存于服务端环境变量
- PII 不进入公开日志

## 项目结构

```text
src/
  app/          Next.js App Router（页面路由）
  features/     领域功能模块（properties, clients, matching, tasks, dashboard, collaboration, ai-runtime, content-projects, compliance, entitlements, access-control, auth）
  components/   共享 UI 组件
  lib/          基础设施（AI Provider, Supabase, 配置）
  config/       环境变量与配置

supabase/
  migrations/   数据库迁移
  tests/        pgTAP 数据库测试

e2e/            Playwright E2E 测试
docs/           产品与技术文档
.claude/        Claude Code 开发工作流
```

## 本地开发

### 前置要求

- Node.js 24（CI 中使用的版本）
- Supabase CLI
- Docker（用于本地 Supabase）

### 安装与启动

```bash
npm install
npm run dev
```

启动本地 Supabase：

```bash
npx supabase start
npx supabase db reset
```

### 环境变量

复制 `.env.example` 并填入实际值：

```bash
cp .env.example .env.local
```

主要环境变量：

| 变量名 | 说明 |
|--------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anon Key（客户端安全） |
| `NEXT_PUBLIC_APP_URL` | 应用 URL |
| `DEEPSEEK_API_KEY` | DeepSeek API Key |
| `DEEPSEEK_BASE_URL` | DeepSeek API 地址 |
| `DEEPSEEK_MODEL` | 主模型 |
| `DEEPSEEK_FALLBACK_MODEL` | 备用模型 |
| `STT_BASE_URL` | STT 服务地址 |
| `STT_API_KEY` | STT API Key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key（仅服务端） |
| `INVITE_TOKEN_SECRET` | 邀请令牌密钥 |
| `CRON_SECRET` | Cron Job 密钥 |

> **注意：** 不要将生产密钥提交到仓库。所有 `NEXT_PUBLIC_*` 变量在构建时嵌入客户端代码，其余变量仅服务端可用。

## Database

本地开发：

```bash
npx supabase start
npx supabase db reset
npx supabase test db
```

生产部署：

```bash
supabase link --project-ref <project-ref>
supabase db push --dry-run
supabase db push
```

**不要对生产环境执行 `supabase db reset --linked`。**

## Testing

```bash
npm run typecheck     # TypeScript 严格模式检查
npm run lint          # ESLint
npm run test          # Vitest 单元与集成测试
npm run build         # Next.js 生产构建
npx playwright test   # 浏览器 E2E 测试
npx supabase test db  # RLS 与数据库安全测试
```

测试覆盖层级：

| 层级 | 工具 | 范围 |
|------|------|------|
| 单元 / 集成 | Vitest | Zod、匹配评分、隐私脱敏、合规扫描、Provider Mock |
| E2E | Playwright | 注册、房源、客户、匹配、内容授权、共享、撤权 |
| 数据库 | pgTAP | RLS 多租户、共享脱敏、content_factory、管理员权限 |

所有发布门禁必须在部署前通过。

## Deployment

```text
GitHub → GitHub Actions → Vercel → Production
```

数据库通过 Supabase CLI 进行迁移部署到生产 Supabase 实例。环境变量在 Vercel Production Environment Variables 中配置。

## Development Workflow

仓库包含 Claude Code 多 Agent 开发工作流，用于内部工程与代码审查。

[Claude Code Development Workflow](docs/development/claude-code.md)
