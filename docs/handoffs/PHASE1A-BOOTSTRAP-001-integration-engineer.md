# PHASE1A-BOOTSTRAP-001 integration-engineer Handoff

## 状态：完成

## 修改文件

### 根配置
- `package.json` — 项目元信息、scripts、全部依赖
- `package-lock.json` — 锁定文件（自动生成）
- `tsconfig.json` — TypeScript strict 配置，路径别名 `@/` → `./src/*`
- `next.config.ts` — Next.js 15 配置，安全 headers
- `eslint.config.mjs` — ESLint 9 flat config，TypeScript + Next.js 规则
- `postcss.config.mjs` — Tailwind v4 postcss 插件
- `components.json` — shadcn/ui 配置
- `vitest.config.ts` — Vitest 配置，jsdom，React 插件
- `playwright.config.ts` — Playwright 配置，chromium，webServer
- `.gitignore` — 标准 Next.js + Supabase 忽略规则
- `.env.example` — 所有环境变量占位符（按组分类）

### 源代码
- `src/app/layout.tsx` — Root Layout，zh-CN，metadata "HouseVibe"
- `src/app/page.tsx` — 占位首页
- `src/app/globals.css` — Tailwind v4 + shadcn/ui 设计 Token
- `src/lib/utils.ts` — cn() 工具函数
- `src/lib/types/api.ts` — ApiResponse、ErrorCode、ApiError 类型
- `src/lib/errors.ts` — AppError 类
- `src/lib/env/schema.ts` — Zod 环境变量 Schema + validateEnv()
- `src/test/setup.ts` — Vitest testing-library 初始化

## 安装依赖（精确版本）

### production
| 包 | 版本 |
|---|---|
| next | 15.5.22 |
| react | 19.2.1 |
| react-dom | 19.2.1 |
| typescript | 5.9.3 |
| tailwindcss | 4.1.17 |
| @tailwindcss/postcss | 4.1.17 |
| @supabase/supabase-js | 2.57.4 |
| @supabase/ssr | 0.8.0 |
| zod | 3.25.76 |
| react-hook-form | 7.66.1 |
| @hookform/resolvers | 5.2.2 |
| lucide-react | 0.552.0 |
| vaul | 1.1.2 |
| clsx | 2.1.1 |
| tailwind-merge | 3.4.0 |
| class-variance-authority | 0.7.1 |

### devDependencies
| 包 | 版本 |
|---|---|
| eslint | 9.39.1 |
| eslint-config-next | 15.5.22 |
| @eslint/eslintrc | 3.3.1 |
| @eslint/js | 9.39.1 |
| typescript-eslint | 8.48.1 |
| vitest | 4.1.10 |
| @vitejs/plugin-react | 5.1.2 |
| @testing-library/react | 16.3.0 |
| @testing-library/jest-dom | 6.9.1 |
| @testing-library/user-event | 14.6.1 |
| jsdom | 27.2.0 |
| @playwright/test | 1.57.0 |
| @types/react | 19.2.2 |
| @types/react-dom | 19.2.2 |
| @types/node | 26.1.2 |
| autoprefixer | 10.4.22 |
| postcss | 8.5.6 |

## Scripts

| 命令 | 说明 |
|---|---|
| `npm run dev` | Next.js 开发服务器 |
| `npm run build` | 生产构建 |
| `npm run start` | 启动生产服务器 |
| `npm run lint` | ESLint 检查 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run test` | Vitest 单元测试 |
| `npm run test:watch` | Vitest 监听模式 |
| `npm run test:e2e` | Playwright E2E 测试 |

## 验证结果

```
✅ typecheck — 通过（零错误）
✅ lint — 通过（零警告零错误）
✅ test — 通过（无测试文件，passWithNoTests=true）
✅ build — 通过（编译成功，2 条静态路由）
```

## 尚未创建的能力

以下留给其他 Agent：

- `src/config/env.ts` — data-security-engineer（Public/Server Env 分离 + getPublicEnv/getServerEnv）
- `src/lib/supabase/client.ts` — data-security-engineer
- `src/lib/supabase/server.ts` — data-security-engineer
- `src/lib/privacy/redaction.ts` — data-security-engineer
- `src/app/(dashboard)/**` — mobile-ui-engineer
- `src/components/layout/**` — mobile-ui-engineer
- `src/components/ui/responsive-overlay.tsx` — mobile-ui-engineer
- 通用状态组件 — mobile-ui-engineer
- 测试文件 — test-engineer
- supabase/migrations/** — 禁止（Phase 1-A 范围外）

## 文件边界

- 根配置（package.json、lockfile、tsconfig、eslint、postcss、tailwind、components.json、vitest、playwright、.gitignore、.env.example、next.config）：仅 integration-engineer 修改
- `src/lib/env/schema.ts`：integration-engineer 拥有（`src/lib/env/**`）
- `src/lib/types/api.ts`、`src/lib/errors.ts`：integration-engineer 拥有（`src/lib/env/**` 范围内）
- `src/lib/utils.ts`：integration-engineer 拥有
- `src/app/layout.tsx`、`src/app/page.tsx`：mobile-ui-engineer 将覆盖/扩展

## 给其他 Agent 的提醒

1. **Tailwind v4**：使用 `@import "tailwindcss"` + `@theme` 块配置，无需 tailwind.config.ts
2. **ESLint 9 flat config**：使用 `eslint.config.mjs`，不是 `.eslintrc`
3. **Vitest**：已配置 `passWithNoTests: true`，JSX/TSX 路径别名可用
4. **Playwright**：测试目录 `./e2e`，baseURL 默认 `http://localhost:3000`
5. **环境变量**：Zod schema 在 `src/lib/env/schema.ts`，data-security-engineer 需创建 `src/config/env.ts` 并实现 Public/Server 分离
6. **包管理器**：npm，不要切换为 yarn/pnpm
