# HouseVibe Claude Code 多 Agent 配置包

本目录可直接覆盖/合并到 HouseVibe 项目根目录。

## 为什么不再使用 TOML

Claude Code 项目级自定义 Agent 使用：

```text
.claude/agents/*.md
```

每个文件由 YAML frontmatter 和 Markdown 系统提示组成。旧的 `planner.toml`、`backend.toml` 等应归档，不要继续作为运行配置。

## 安装

1. 将本包全部文件复制到项目根目录。
2. 保留 `docs/PRD.md` 为唯一 PRD。
3. 确保已安装 Node.js 与项目依赖。
4. 启动 Claude Code。
5. 运行 `/context`，确认 `CLAUDE.md` 已加载。
6. 按 `docs/coordination/PHASE_PLAYBOOK.md` 启动各阶段。

如果 `.claude/agents/` 是在当前 Claude Code 会话启动后首次创建，重启一次 Claude Code。

## 目录

- `CLAUDE.md`：项目全局指令
- `AGENTS.md`：协作协议
- `.claude/agents/`：可复用专业 Agent
- `.claude/rules/`：分领域规则
- `.claude/settings.json`：团队开关、敏感文件保护和 Hooks
- `.claude/hooks/`：目录边界、UTF-8 检查
- `docs/coordination/`：所有权、Handoff、审查和启动手册
- `docs/PRD.md`：HouseVibe v1.3 PRD

## 建议

- 每阶段使用 3–5 个 Agent，而不是同时启动全部 Agent。
- 先冻结契约，再并行写代码。
- 同一文件不要并行编辑。
- 生产实现使用 DeepSeek-only；Claude Code 只是开发工具。
