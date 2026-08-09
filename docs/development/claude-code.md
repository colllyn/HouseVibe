# HouseVibe Claude Code Development Workflow

本仓库使用 Claude Code 多 Agent 工作流进行内部工程开发、代码审查和质量门禁。

## 概述

Claude Code 项目级自定义 Agent 使用：

```text
.claude/agents/*.md
```

每个文件由 YAML frontmatter 和 Markdown 系统提示组成。

Legacy TOML agent configuration is no longer used.

## 安装

1. 确保项目已初始化 Git 并安装 Node.js 与项目依赖。
2. 保留 `docs/PRD.md` 为唯一 PRD。
3. 启动 Claude Code。
4. 运行 `/context`，确认 `CLAUDE.md` 已加载。
5. 按 `docs/coordination/PHASE_PLAYBOOK.md` 启动各阶段。

如果 `.claude/agents/` 是在当前 Claude Code 会话启动后首次创建，重启一次 Claude Code。

## 项目级指令文件

### CLAUDE.md

项目全局指令文件，位于仓库根目录。Claude Code 启动时自动加载。包含：

- 唯一产品依据（PRD、Agent 协作规范、架构与安全规则）
- 固定技术栈声明
- 不可破坏的约束（workspace 隔离、RLS 默认拒绝、DeepSeek-only 等）
- 主 Agent 职责与并行规则
- 开发门禁命令

### AGENTS.md

多 Agent 协作规范，定义：

- 运行模式（主 Agent + 专业 Agent）
- Agent 清单与职责
- 契约优先原则
- 文件所有权规则
- 任务格式要求
- 推荐阶段编排（Phase 0–4）
- 质量级别（P0–P3）
- Handoff 协议
- 集成规则

## Agent 清单

- `product-planner`：需求拆解、验收标准、任务依赖
- `solution-architect`：模块边界、契约、ADR、非功能设计
- `data-security-engineer`：Supabase、RLS、Auth、Workspace、Entitlement、邀请与管理员访问
- `property-crm-engineer`：房源、客户、匹配、待办、共享业务
- `ai-deepseek-engineer`：DeepSeek、STT 代理、视觉理解、内容工厂、合规、配额、成本与 AI 管理看板
- `mobile-ui-engineer`：全局移动端 UI、布局、ResponsiveOverlay、设计系统
- `test-engineer`：单元、集成、RLS、E2E 测试；不修改生产逻辑
- `quality-reviewer`：在规划期间、规划完成后和实现完成后执行只读质量、安全与契约审查；只报告不修复
- `integration-engineer`：依赖、根配置、CI、构建、部署与最终集成

## 项目目录

- `CLAUDE.md`：项目全局指令
- `AGENTS.md`：协作协议
- `.claude/agents/`：可复用专业 Agent
- `.claude/rules/`：分领域规则
- `.claude/settings.json`：团队开关、敏感文件保护和 Hooks
- `.claude/hooks/`：目录边界、UTF-8 检查
- `docs/coordination/`：所有权、Handoff、审查和启动手册
- `docs/PRD.md`：HouseVibe 产品需求文档

## Phase Playbook

详见 `docs/coordination/PHASE_PLAYBOOK.md`。

### Phase 0：规划与冻结

并行运行 product-planner、solution-architect、quality-reviewer。主 Agent 综合后冻结契约。

### Phase 1：基础架构

并行运行 data-security-engineer、mobile-ui-engineer、integration-engineer。三者文件所有权互不重叠。

### Phase 2：基础业务

并行运行 property-crm-engineer、data-security-engineer（补充 RPC/RLS）、test-engineer（按已冻结契约先写测试）。

### Phase 3：AI 与内容

并行运行 ai-deepseek-engineer、data-security-engineer（AI 日志、配额、RLS）、mobile-ui-engineer（仅全局组件）、test-engineer。

### Phase 4：审核与集成

并行只读审查 quality-reviewer、test-engineer、solution-architect。最后由 integration-engineer 与主 Agent 完成构建、部署和冒烟测试。

## 开发建议

- 每阶段使用 3–5 个 Agent，而不是同时启动全部 Agent。
- 先冻结契约，再并行写代码。
- 同一文件不要并行编辑。
- 生产实现使用 DeepSeek-only；Claude Code 只是开发工具。
- 不允许两个 Agent 同时解决同一冲突。
- 集成失败回退给文件所有者修复。

## 相关文档

- [AGENTS.md](../../AGENTS.md)
- [CLAUDE.md](../../CLAUDE.md)
- [PRD](../PRD.md)
- [Phase Playbook](../coordination/PHASE_PLAYBOOK.md)
- [Ownership](../coordination/OWNERSHIP.md)
- [Architecture Rules](../../.claude/rules/architecture.md)
- [Data Security Rules](../../.claude/rules/data-security.md)
- [DeepSeek AI Rules](../../.claude/rules/deepseek-ai.md)
- [Mobile UI Rules](../../.claude/rules/mobile-ui.md)
- [Testing Rules](../../.claude/rules/testing.md)
- [Collaboration Rules](../../.claude/rules/collaboration.md)
