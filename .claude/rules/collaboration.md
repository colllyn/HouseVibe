# 多 Agent 协作规则

- 同一时间最多 3–5 个活跃 Agent。
- 并行写代码前先检查 `docs/coordination/OWNERSHIP.md`。
- 共享契约冻结后禁止私自更改。
- 每个 Agent 只写 Owned Paths 和唯一 handoff 文件。
- 依赖第三方包时，向 integration-engineer 提交 dependency request，不直接改 package.json。
- 需要 migration 时，向 data-security-engineer 提交 schema request。
- 发现跨模块问题先发消息给主 Agent，不跨目录“顺手修复”。
- Reviewer 报告必须包含：严重度、文件/行、复现、影响、建议、验证方式。
- 主 Agent 必须等待依赖任务结束，不抢做 teammate 的任务。
