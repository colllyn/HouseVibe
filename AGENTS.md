# HouseVibe 多 Agent 协作规范

## 1. 运行模式

Claude Code 当前项目使用“主 Agent + 专业 Agent”模式：

- **Agent Team**：用于规划、并行审查、以及文件完全不重叠的并行实现。
- **普通 Subagent + worktree**：用于可能影响较多文件、需要独立分支验证的实现任务。
- 不为顺序性强、只改一个文件的小任务启动团队。

Agent Team 为实验功能。若团队模式异常，退回前台 Subagent 串行执行，不得牺牲质量门禁。

## 2. Agent 清单

- `product-planner`：需求拆解、验收标准、任务依赖。
- `solution-architect`：模块边界、契约、ADR、非功能设计。
- `data-security-engineer`：Supabase、RLS、Auth、Workspace、Entitlement、邀请与管理员访问。
- `property-crm-engineer`：房源、客户、匹配、待办、共享业务。
- `ai-deepseek-engineer`：DeepSeek、STT 代理、视觉理解、内容工厂、合规、配额与成本。
- `mobile-ui-engineer`：全局移动端 UI、布局、ResponsiveOverlay、设计系统。
- `test-engineer`：单元、集成、RLS、E2E 测试；不修改生产逻辑。
- `quality-reviewer`：契约、代码、安全、性能与测试审查；只报告不修复。
- `integration-engineer`：依赖、根配置、CI、构建、部署与最终集成。

## 3. 契约优先

开始实现前，Planner 与 Architect 必须产出并冻结：

- `docs/contracts/domain-model.md`
- `docs/contracts/api-contract.md`
- `docs/contracts/rls-contract.md`
- `docs/contracts/ai-contract.md`
- `docs/plans/implementation-plan.md`

冻结后，任何 Agent 不得自行改变：

- 数据库字段与枚举
- API 路径与响应错误码
- Zod/JSON Schema
- RLS 权限语义
- 目录所有权

确需调整时，先提交 `docs/decisions/ADR-XXX-*.md`，由主 Agent 批准。

## 4. 文件所有权

详见 `docs/coordination/OWNERSHIP.md`。

规则：

1. 每个任务必须声明 Owned Paths。
2. 并行任务的 Owned Paths 不得重叠。
3. 根目录配置、`package.json` 与 lockfile 仅由 `integration-engineer` 修改。
4. Supabase migration 仅由 `data-security-engineer` 修改。
5. 非数据 Agent 需要 Schema 变更时，只提交 handoff，不直接改 migration。
6. 所有 Agent 可写唯一命名的 `docs/handoffs/<task-id>-<agent>.md`。
7. Agent 不得用 Bash 重定向、`sed -i`、脚本批量写文件绕过边界 Hook。

## 5. 任务格式

主 Agent 创建任务时必须包含：

- Task ID
- 目标
- PRD 章节
- 前置依赖
- Owned Paths
- Read-only Dependencies
- 明确不做什么
- 验收命令
- 交付物
- Handoff 文件路径

没有这些信息的任务不得开始。

## 6. 推荐阶段编排

### Phase 0：规划与冻结

并行：

- product-planner
- solution-architect
- quality-reviewer（仅审查 PRD 风险）

主 Agent综合后冻结契约。

### Phase 1：基础架构

并行：

- data-security-engineer
- mobile-ui-engineer
- integration-engineer

前提：三者文件所有权互不重叠。

### Phase 2：基础业务

并行：

- property-crm-engineer
- data-security-engineer（补充 RPC/RLS）
- test-engineer（按已冻结契约先写测试）

### Phase 3：AI 与内容

并行：

- ai-deepseek-engineer
- data-security-engineer（AI 日志、配额、RLS）
- mobile-ui-engineer（仅全局组件）
- test-engineer

### Phase 4：审核与集成

并行只读审查：

- quality-reviewer
- test-engineer
- solution-architect

最后由 integration-engineer 与主 Agent 完成构建、部署和冒烟测试。

## 7. 质量级别

- **P0**：数据泄漏、越权、密钥泄漏、不可逆数据损坏。立即停止。
- **P1**：核心流程不可用、RLS 绕过、配额绕过、AI 隐私泄漏。必须清零。
- **P2**：明显功能缺陷、性能不达标、移动端阻塞问题。发布前必须清零。
- **P3**：可维护性或体验优化。可进入 backlog。

不再采用“P2 ≤ 2 即通过”。HouseVibe 涉及客户和房东隐私，安全、权限、合规相关 P2 不允许遗留。

## 8. Handoff

实现 Agent 完成后必须写 handoff，包含：

- 修改文件
- 数据库/API 变化
- 测试命令和结果
- 未解决问题
- 对其他 Agent 的依赖或提醒

Reviewer 只审查任务差异和 handoff，不修改生产代码。

## 9. 集成规则

- 主 Agent 等待所有依赖任务完成再集成。
- 不允许两个 Agent 同时解决同一冲突。
- 集成失败回退给文件所有者修复。
- 同一问题连续两轮失败，升级给 Architect；三轮失败停止并请求人工决策。
- 禁止自动 `git push`、强制 reset、清理用户分支或修改真实生产环境。
