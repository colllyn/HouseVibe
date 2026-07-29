# 旧 Agent 配置检查与迁移报告

## 结论

旧配置不建议继续修补，应整体替换。

## 阻塞问题

### 1. 文件格式不被 Claude Code 项目 Agent 直接识别

旧角色使用 `.toml`，而项目级自定义 Agent 应放在 `.claude/agents/*.md`，使用 YAML frontmatter。

### 2. 技术栈与 HouseVibe PRD 完全冲突

- Planner 强制 MySQL。
- Backend 强制 Go + Gin + GORM。
- Frontend 强制 Vue 3 + Pinia + Element Plus。
- HouseVibe 实际是 Next.js App Router + Supabase PostgreSQL + shadcn/ui。

这不是局部差异，而是会让 Agent 从第一轮就生成错误项目。

### 3. 目录模型错误

旧 AGENTS 假设存在 `/frontend` 与 `/backend`，并把主 Agent 的集成验证写成 Vite 代理、Go 后端配置。HouseVibe 是单一 Next.js 全栈项目，不应按前后端仓库切割。

### 4. Reviewer 职责矛盾

旧 Reviewer 一方面要求“为核心业务编写单元测试”，另一方面又要求“不要直接修改业务代码”。应拆成：

- test-engineer：只写测试；
- quality-reviewer：只读审查。

### 5. 缺少真正的多 Agent 协作基础

旧配置缺少：

- 共享契约文件
- 文件所有权矩阵
- Migration/lockfile 独占规则
- Task ID 与 Handoff
- 并行任务依赖
- Agent Team 开关
- 目录越界的确定性 Hook
- DeepSeek、RLS、内容权限、合规和成本 Agent

### 6. 质量门禁过松

“P2 ≤ 2 即通过”不适用于存储客户、房东隐私的产品。新的规则要求 P0–P2 发布前清零，尤其是权限、RLS、隐私、配额和合规问题。

## 迁移映射

| 旧文件 | 新方案 |
|---|---|
| `AGENTS.md` | 新 `CLAUDE.md` + `AGENTS.md` + `.claude/rules/**` |
| `planner.toml` | `.claude/agents/product-planner.md` + `solution-architect.md` |
| `frontend.toml` | `mobile-ui-engineer.md` + 领域实现 Agent |
| `backend.toml` | `data-security-engineer.md` + `property-crm-engineer.md` + `ai-deepseek-engineer.md` |
| `reviewer.toml` | `quality-reviewer.md` + `test-engineer.md` |
