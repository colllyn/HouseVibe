# 契约目录

本目录保存冻结后的领域、API、RLS、AI、授权和合规契约。

## 用途

- Phase 0 结束时由 Planner 和 Architect 产出并冻结
- 所有后续实现必须遵守已冻结契约
- 契约变更必须通过 ADR（见 `../decisions/`）

## 契约文件

- `domain-model.md` — 领域模型、实体关系和数据约束
- `api-contract.md` — API 路径、请求/响应 Schema、错误码
- `rls-contract.md` — Row Level Security 策略、辅助函数和权限矩阵
- `ai-contract.md` — DeepSeek Provider 接口、配额、合规和纠错契约

## 规则

- 冻结后任何 Agent 不得自行修改
- 契约变更先提交 ADR，由主 Agent 批准
- Phase 0 之前不得放入实现代码
