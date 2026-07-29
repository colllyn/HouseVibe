# Claude Code 多 Agent 启动手册

## 启动前

1. 确保项目已初始化 Git。
2. 确保 `.claude/settings.json` 已生效。
3. 运行 `/context`，确认加载 `CLAUDE.md`。
4. 不要删除 `docs/PRD.md`。

## Phase 0 Prompt

```text
阅读 CLAUDE.md、AGENTS.md 和 docs/PRD.md。
启动一个 agent team，包含：
- product-planner
- solution-architect
- quality-reviewer

要求 Planner 和 Architect 先分别工作，Reviewer 从可执行性、安全和多 Agent 冲突角度挑战方案。
最终由主 Agent 综合并生成/冻结 docs/contracts 下四份契约和 docs/plans/implementation-plan.md。
此阶段禁止修改业务代码。
```

## Phase 1 Prompt

```text
根据已冻结契约启动 agent team：
- data-security-engineer
- mobile-ui-engineer
- integration-engineer

为每名 teammate 创建带 Task ID、Owned Paths、依赖和验收命令的任务。
要求 plan approval 后再实施。禁止文件所有权重叠。
完成后等待全部 teammate，运行质量门禁并生成 handoff。
```

## Phase 2 Prompt

```text
启动 agent team：
- property-crm-engineer
- data-security-engineer
- test-engineer

实现房源、客户、匹配、待办、共享与相关 RLS。
数据库 Agent 独占 migrations；测试 Agent 不修改生产代码。
完成后使用 quality-reviewer 做增量审查，P0-P2 清零。
```

## Phase 3 Prompt

```text
启动 agent team：
- ai-deepseek-engineer
- data-security-engineer
- test-engineer
- mobile-ui-engineer

实现 STT 代理、DeepSeek 文本/视觉、智能录入、内容工厂、配额、成本熔断、纠错和合规。
严格按 OWNERSHIP 分配，不允许修改同一文件。
完成后进行权限、隐私、并发配额和移动端 Drawer 专项测试。
```

## Phase 4 Prompt

```text
启动只读审查 team：
- quality-reviewer
- solution-architect
- test-engineer

并行审查安全/RLS、架构契约和测试覆盖。
修复任务回派给原文件所有者。
全部 P0-P2 清零后，由 integration-engineer 执行 typecheck、lint、test、build、Supabase 测试和部署冒烟。
```
