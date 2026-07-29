# 测试规则

- 单元测试：Zod、匹配评分、隐私脱敏、合规扫描、Diff、口令、配额计算。
- 数据库测试：RLS 多租户、共享脱敏、content_factory、营销复用、管理员权限。
- 集成测试：Route Handler、STT 上传、DeepSeek Provider Mock、原子配额、错误码。
- E2E：注册、房源、客户、匹配、内容授权、共享、撤权立即生效。
- 测试必须覆盖成功、未认证、无权限、配额超限、模型失败、格式错误和并发情况。
- 测试不得调用真实 DeepSeek 付费接口；使用固定 fixture/mock。
- 修复生产代码只能由对应所有者完成，test-engineer 只提交测试和缺陷报告。
- 不接受仅有 happy path 的“测试完成”。
