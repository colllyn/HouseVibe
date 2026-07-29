# 交接记录目录

本目录保存 Agent 间交接记录。

## 用途

- 每个实现 Agent 完成任务后必须写 handoff
- Reviewer 基于 handoff 和 diff 进行审查
- 主 Agent 通过 handoff 跟踪集成状态

## Handoff 格式

文件命名：`<task-id>-<agent>.md`

内容至少包含：

- 修改文件列表
- 完成内容摘要
- 未解决问题
- 验证命令和测试结果
- 后续责任人或依赖提醒
- 数据库/API 变化（如有）

## 规则

- 所有 Agent 可写唯一命名的 handoff 文件
- 文件名中的 Task ID 必须唯一，避免并行任务冲突
- Handoff 不替代代码审查；Reviewer 仍需独立检查
