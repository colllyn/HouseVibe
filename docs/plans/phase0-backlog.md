# Phase 0 Backlog

- 文档名称：Phase 0 Backlog
- 版本：1.0
- 状态：APPROVED FOR PHASE 1
- Owner：product-planner
- 最后更新日期：2026-07-30

---

## 概述

本文档记录了在 Phase 0 规划期间识别但明确不属于 MVP（Phase 1-4）范围的事项。这些事项不阻塞发布，但应在未来版本中评估和规划。

---

## Backlog 项

| Backlog ID | 描述 | 优先级 | Owner | 目标 Phase | 不阻塞 Phase 1 的理由 | 是否需要未来 ADR |
|---|---|---|---|---|---|---|
| BL-001 | SEO 与内容页面公开 | P3 | product-planner | Future | PRD 无 SEO 或公开内容落地页需求，共享房源和内容页面当前仅对登录用户可见 | 需要（新增公开页面功能涉及路由、鉴权和缓存策略） |
| BL-002 | 业务类型扩展（二手房买卖） | P3 | solution-architect | Phase 2+ | workspaces.business_type 已预留字段，MVP 默认 residential_lease；当前所有功能围绕租赁设计 | 需要（新增状态值、扩展房源字段和匹配逻辑） |
| BL-003 | 视频分析支持 | P3 | ai-deepseek-engineer | Phase 3+ | property_media.media_type 已预留 video；视觉分析当前仅处理图片，视频需独立 Vision Provider 扩展 | 需要（ADR-004 已在架构设计中预留） |
| BL-004 | 多语言支持 | P3 | product-planner | Future | PRD 无多语言需求；数据库 TEXT/JSONB 字段天然兼容 UTF-8，前端中文不可写成 \uXXXX | 需要（涉及 i18n 架构、翻译工作流和 DeepSeek Prompt 多语言适配） |

---

## 优先级定义

- **P3**：可维护性或体验优化，可在未来版本中评估。不阻塞当前发布。

---

## 纳入流程

1. 当 PRD 更新或用户反馈明确需要某 Backlog 项时，由 product-planner 提交纳入评估。
2. 如涉及架构变化，需先通过 ADR 批准。
3. 纳入后从本文件移除，添加至对应 Phase 的实施计划中。

---

## 变更历史

| 日期 | 版本 | 变更说明 |
|---|---|---|
| 2026-07-30 | 1.0 | 初始版本，收录 implementation-plan.md 中 4 条 Backlog 事项 |
