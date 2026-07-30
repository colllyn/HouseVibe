# Phase 1 实施假设

- 文档名称：Phase 1 实施假设
- 版本：1.0
- 状态：APPROVED FOR PHASE 1
- Owner：product-planner
- 最后更新日期：2026-07-30

---

## 概述

本文档记录了实施计划中所有 Open Questions 转化后的实施假设。这些假设 **不影响 Phase 0 冻结契约**（domain-model、api-contract、rls-contract、ai-contract），但影响 Phase 1-4 的具体实施方式。

每条假设如果在确认时间点被证明错误，对应 Agent 应按回退方式调整，并通过 ADR 记录偏差。

---

## 实施假设清单

| ID | 假设 | Owner Agent | 最迟确认任务 | 受影响文件 | 若假设错误的回退方式 |
|---|---|---|---|---|---|
| ASM-001 | DeepSeek 官方提供视觉 API（DeepSeek-VL） | ai-deepseek-engineer | Phase 3 启动前评估任务 | ai-contract, DeepSeekVisionProvider | 自托管 DeepSeek-VL 权重，更新 Vision endpoint 环境变量 |
| ASM-002 | STT Provider 默认选型为阿里云语音识别 | ai-deepseek-engineer | Phase 3 启动前评估任务 | TranscriptionProvider 实现 | 切换到 Deepgram 或其他提供商，接口兼容 TranscriptionProvider |
| ASM-003 | Supabase Cloud 作为部署平台 | integration-engineer | Phase 1 Day 0（CI 配置前） | CI 配置, .env | 自托管需配置独立 CI 数据库连接 |
| ASM-004 | 视觉推理服务独立于 Vercel 部署 | integration-engineer | Phase 4 部署前 | vercel.json, 部署文档 | 需确认自托管 GPU 服务器的网络连通性和超时配置 |
| ASM-005 | INVITE_TOKEN_SECRET 轮换策略下沉 Phase 4 | data-security-engineer | Phase 4 | 无代码影响 | 如提前需要轮换，可在 Phase 1 实现基础轮换 API |
| ASM-006 | E2E 移动端测试使用 BrowserStack | test-engineer | Phase 4 开始前 | playwright.config | 降级为 Xcode Simulator + 人工验证关键路径 |

---

## 为什么不影响冻结契约

### ASM-001 & ASM-002 (DeepSeek-VL 与 STT Provider)

- `ai-contract.md` 中已定义 `DeepSeekVisionProvider` 和 `TranscriptionProvider` 的接口，不绑定具体 endpoint 实现。
- 环境变量 `DEEPSEEK_VISION_BASE_URL_PRIMARY` 和 `STT_PROVIDER` 提供了配置切换点，Provider 实现只需遵循接口。
- 确认假设错误时，只需替换 Provider 实现，不影响契约级别定义。

### ASM-003 (Supabase Cloud)

- PRD 和 RLS 契约基于 Supabase PostgreSQL 设计，与 Supabase Cloud 或自托管在数据库层面兼容。
- 自托管仅增加 CI 配置成本，不改变数据库 Schema、RLS 语义或 API 接口。

### ASM-004 (视觉推理独立部署)

- 架构规则（`.claude/rules/architecture.md`）已明确规定视觉推理不在 Vercel Function 内加载模型。
- 独立部署是架构要求，具体部署位置（自托管 vs. 外部推理端点）是运维层面选择，不影响 API 契约。

### ASM-005 (INVITE_TOKEN_SECRET 轮换)

- `INVITE_TOKEN_SECRET` 的环境变量已在 error-and-env-conventions.md 中冻结为必填（最小 32 字符）。
- 轮换策略不改变邀请 Token 的生成和验证逻辑（签名 + Hash），仅影响运维 checklist。

### ASM-006 (E2E 设备测试)

- 验收矩阵中的移动端 E2E 条件（AC-MOBILE-006、AC-MOBILE-013 等）定义了"必须验证"的行为，不规定验证工具。
- BrowserStack / Xcode Simulator 的选择不影响验收条件的判定标准。

---

## 假设确认时间线

```text
Phase 1 (Day 0):     ASM-003 确认（CI 配置前）
Phase 3 (启动前):    ASM-001, ASM-002 确认（实现 DeepSeekVisionProvider 和 TranscriptionProvider 前）
Phase 4 (开始前):    ASM-006 确认（E2E 测试执行前）
Phase 4 (部署前):    ASM-004 确认（生产部署前）
Phase 4 (运维):      ASM-005 确认（运维 checklist 中）
```

---

## 变更历史

| 日期 | 版本 | 变更说明 |
|---|---|---|
| 2026-07-30 | 1.0 | 初始版本，收录 implementation-plan.md 和 acceptance-matrix.md 中所有 Open Questions 转化后的 6 条实施假设 |
