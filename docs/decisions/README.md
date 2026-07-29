# 架构决策记录（ADR）

本目录保存 Architecture Decision Record。

## ADR 格式

每个 ADR 文件以 `ADR-XXX-简短描述.md` 命名，至少包含：

- **背景**：为什么需要做这个决策
- **决策**：做出了什么决定
- **替代方案**：考虑过哪些其他方案及其取舍
- **影响**：对架构、Agent 分工、API 或数据库的影响
- **状态**：proposed / accepted / deprecated / superseded

## 规则

- 架构变化、契约变更和跨模块重构必须先写 ADR
- ADR 由 solution-architect 起草，主 Agent 批准
- 被取代的 ADR 不删除，标记为 superseded 并引用新 ADR
