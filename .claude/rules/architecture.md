# 架构规则

- 使用单一 Next.js App Router 项目，不拆成 Vue 前端 + Go 后端。
- 采用按领域划分的 feature-first 结构。
- 页面组件只负责组合；业务逻辑进入 `src/features/**`。
- 服务端授权检查靠近数据访问点，不能只依赖 middleware 或隐藏按钮。
- Server Actions 只处理适合表单的轻量请求；音频、图片与模型调用使用 Route Handler。
- 外部服务必须经过 Adapter/Provider 接口，禁止页面直接调用 SDK。
- 核心契约使用 Zod 定义，并从同一 Schema 推导 TypeScript 类型。
- 数据库变化必须使用 Supabase migration，禁止直接在生产控制台手改。
- 架构变化先写 ADR。
