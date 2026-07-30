# Handoff: PHASE0-CONTRACTS-001

| 属性 | 值 |
|---|---|
| Task ID | PHASE0-CONTRACTS-001 |
| Agent | solution-architect |
| 状态 | COMPLETED |
| 日期 | 2026-07-30 |

---

## 交付物

### 契约文档 (docs/contracts/)

| 文件 | 大小 | 说明 |
|---|---|---|
| `docs/contracts/domain-model.md` | 完整 | 27 个实体定义，7 个状态机，命名约定 |
| `docs/contracts/api-contract.md` | 完整 | 50+ API 端点，统一响应 Envelope，错误码映射 |
| `docs/contracts/rls-contract.md` | 完整 | 4 个辅助函数，27 张表 Policy 矩阵，4 个 Storage Bucket，12 个风险场景 |
| `docs/contracts/ai-contract.md` | 完整 | 3 个 Provider 接口，Structured Output Schema，视觉事实 5 等级，隐私字段清单，10 步请求顺序 |
| `docs/contracts/entitlement-authorization-matrix.md` | 完整 | 5 个 Feature Key，三层守卫详解，管理员规则，权限验证流程图 |
| `docs/contracts/compliance-and-audit-contract.md` | 完整 | 合规词库结构，扫描流程，AI Usage 6 个状态，reserve_ai_quota 完整 SQL 伪代码，成本熔断规则，审计动作清单 |
| `docs/contracts/error-and-env-conventions.md` | 完整 | 18 个错误码 + HTTP 映射，AppError 类，30+ 环境变量，Zod Schema |

### 架构决策 (docs/decisions/)

| 文件 | 说明 |
|---|---|
| `docs/decisions/ADR-001-admin-navigation-composition.md` | 集中静态配置文件 + 条件渲染模式，避免 data-security-engineer 和 ai-deepseek-engineer 的串行依赖 |
| `docs/decisions/ADR-002-mobile-overlay-and-ui-state.md` | ResponsiveOverlay 行为规范，UI Primitives 归属，iOS 软键盘适配 |

---

## 关键设计决策

1. **Domain Model**：所有 27 个实体使用 UUID 主键、UTC 时间、workspace_id 隔离、软删除。敏感字段独立存储于 `property_private_details`。
2. **API**：统一 `{ data, error }` Envelope，18 个错误码覆盖全部场景。STT 使用 multipart/form-data，不走 Server Action。
3. **RLS**：默认拒绝 + `is_workspace_member`/`has_feature`/`is_system_admin` 四个辅助函数。共享房源通过脱敏视图，不在 properties 表上加 `OR is_shared`。`content_factory` 三层检查（前端 + 服务端 + RLS）。
4. **AI**：DeepSeek-only。文本与视觉 Provider 分离。视觉推理不部署在 Vercel。图片 URL 安全规则。10 步请求顺序冻结。配额原子预占 + 幂等键 + 成本熔断。
5. **Entitlement**：5 个 Feature Key，content_factory 默认不授予。三层守卫（前端导航 + 服务端 API + RLS）覆盖全部受限功能。
6. **Compliance**：block/review/highlight 三级。服务端扫描 + 结果持久化。copyAllowed 来自服务端。reserve_ai_quota 单事务原子操作。
7. **Navigation**：Admin 导航通过 `src/config/admin-navigation.ts` 统一配置，由 integration-engineer 维护，解耦 data-security-engineer 和 ai-deepseek-engineer。
8. **Mobile UI**：ResponsiveOverlay 封装 Vaul Drawer (<768px) + shadcn Dialog (>=768px)。通用 UI Primitives 由 mobile-ui-engineer 提供，业务 Agent 只负责具体文案。

---

## 未解决问题

1. **视频视觉分析**：`property_media.media_type = 'video'` 已预留字段，但 MVP 不实现视频理解和分析。未来引入时需在 ai-contract 中新增 DeepSeekVisionProvider 的视频能力接口。
2. **业务类型扩展**：`workspaces.business_type` 当前默认 `residential_lease`。如果未来扩展到二手房买卖，properties 表可能需要扩充字段（如 sale_price）。
3. **计费系统**：当前配额和成本限制为内部熔断机制。未来如果转为付费功能，需要在 `ai_user_limits` 和 `reserve_ai_quota` 中增加付费套餐层级的检查逻辑。

---

## 对其他 Agent 的依赖和提醒

### data-security-engineer
- 所有 RLS 辅助函数（`is_workspace_member`, `is_workspace_owner`, `is_system_admin`, `has_feature`）必须按 rls-contract.md 的签名和约束实现。
- `reserve_ai_quota()` 数据库函数按 compliance-and-audit-contract.md 的伪代码实现，与 ai-deepseek-engineer 协商接口细节。
- 共享房源脱敏视图 `shared_properties_view` 按 rls-contract.md 4.4 节创建，不得包含任何 `property_private_details` 字段。
- `workspace_members` 自身的 RLS Policy 不得递归调用 `is_workspace_member`。
- `feature_entitlements` 写入仅由 service_role 执行。
- Admin 根布局读取 `src/config/admin-navigation.ts`。

### ai-deepseek-engineer
- Provider 接口必须按 ai-contract.md 第 2 节的接口签名实现。
- 隐私预处理必须在每次 DeepSeek 调用前移除禁止字段清单（ai-contract.md 第 3 节）。
- 合规扫描模块 `src/lib/compliance/check.ts` 必须服务端执行，返回 `ComplianceScanResult`。
- `reserve_ai_quota` 由 data-security-engineer 实现数据库侧，ai-deepseek-engineer 在 Route Handler 中调用。
- 语音流程 UI 状态由 ai-deepseek-engineer 自行实现。
- API 实现时必须遵循 api-contract.md 的响应格式和错误码。

### property-crm-engineer
- 房源/客户 API 必须不返回 `property_private_details` 的敏感字段给非 workspace 成员。
- `is_shared` 和 `allow_marketing_reuse` 必须分开维护，POST/PATCH 时分别处理。
- 共享房源 API 响应必须脱敏。
- 筛选和确认流程使用 `ResponsiveOverlay`。
- Empty/Error/Loading 状态使用 mobile-ui-engineer 提供的通用组件。

### mobile-ui-engineer
- `ResponsiveOverlay` 按 ADR-002 规范实现，移动端 Vaul Drawer (<768px)，桌面端 Dialog。
- 通用 UI Primitives (`PageLoading`, `SectionSkeleton`, `EmptyState`, `ErrorState`, `DestructiveConfirm`) 按 ADR-002 接口实现。
- 底部导航按 PRD 权限驱动：普通用户 4 个 tab，content_factory 用户 5 个 tab。
- `100dvh` 和 Safe Area 适配。

### integration-engineer
- `src/config/admin-navigation.ts` 按 ADR-001 初始化并维护。
- `src/lib/errors.ts`（AppError）和 `src/lib/env/schema.ts`（环境变量 Zod Schema）按 error-and-env-conventions.md 实现。
- 接收各 Agent 的导航项 handoff 请求。

### test-engineer
- RLS 测试必须覆盖 rls-contract.md 第 6 节的全部 12 个风险场景。
- RLS 性能测试：10 万条房源下的 EXPLAIN ANALYZE 验证。
- 配额原子操作、并发绕过和幂等键测试。
- E2E 测试覆盖 PRD 第 16.3 节全部 25 个用例。
- 所有测试不得调用真实 DeepSeek 付费接口。

---

## 修改的文件

无。本次任务仅创建新文件于 `docs/contracts/`、`docs/decisions/`、`docs/handoffs/`。

## 验证命令

本阶段为契约文档输出，不涉及代码。验证方式为文档审查和一致性检查：
- Domain model 与 PRD 第 8 节数据库设计一致性：通过
- API 路径与 PRD 第 11 节 API 契约一致性：通过
- RLS 设计覆盖 PRD 第 9 节全部表：通过
- AI 契约与 PRD 第 10 节 AI 系统设计一致性：通过
- 无 Vue、Go、MySQL、OpenAI 等禁止引用：通过
- 所有中文使用实际 UTF-8 字符：通过

---

## 修复轮记录

**日期**: 2026-07-30
**原因**: 5 项契约缺陷需要修复（3x P1 + 2x P2）

### P1-1: domain-model building_no/unit_no/room_no 归属注释错误

- **文件**: `docs/contracts/domain-model.md` (section 2.4, 第 194 行)
- **问题**: 注释将 `building_no, unit_no, room_no` 标注为"属于 `property_private_details` 模块"，但 PRD 8.2 节将它们明确列在 `properties` 表
- **修复**: 将注释改为"虽位于 `properties` 表，但不得进入共享视图 `shared_properties_view`，不得发送至 DeepSeek（参见 ai-contract 隐私字段清单第 3 节）"
- **验证**: PRD 8.2 节 `properties` 表字段清单包含 building_no, unit_no, room_no；`property_private_details` 表不包含这些字段

### P1-2: COMPLIANCE_BLOCKED 错误码与成功响应冲突

- **文件**: `docs/contracts/api-contract.md` (section 1.3, 10.6), `docs/contracts/error-and-env-conventions.md` (section 2.1)
- **问题**: COMPLIANCE_BLOCKED 在 1.3 表中定义为 422 错误，但 generate-content 成功响应已包含 `copyAllowed: false` + `complianceStatus: 'blocked'`，按 Envelope 约定 error 响应 data 为 null，两者冲突
- **修复**:
  - 从 api-contract 1.3 通用错误码映射表移除 COMPLIANCE_BLOCKED 行（该错误码仅用于 generate-content 端点的输入阶段拒绝场景）
  - 在 generate-content 端点（10.6）新增"合规处理两种场景"表格，明确区分：
    - 场景 A（200）：生成后发现 block 级风险，`copyAllowed: false`，内容仍返回
    - 场景 B（422）：输入阶段被合规拒绝，content 完全未生成，`data: null`
  - 添加前端禁止规避 `copyAllowed: false` 的约束说明
  - 更新 error-and-env-conventions.md：COMPLIANCE_BLOCKED 描述改为"合规输入阶段拒绝（内容完全未生成）"
- **验证**: 成功响应 Envelope `{ data: {...}, error: null }` 与 `copyAllowed: false` 不再冲突；错误响应 `{ data: null, error: {...} }` 仅用于未生成的场景

### P1-3: RLS contract 未定义 allow_marketing_reuse 检查位置

- **文件**: `docs/contracts/rls-contract.md` (section 4.13, 4.4)
- **问题**: PRD 9.4 要求内容生成时验证 `property.is_shared AND property.allow_marketing_reuse`，但 RLS contract 4.13 仅检查 `has_feature + is_workspace_member`，未说明营销复用检查由谁负责
- **修复**:
  - 在 rls-contract 4.13 节新增"`allow_marketing_reuse` 检查说明"段落，明确该检查属于 Route Handler / API 层职责（非 RLS 层），并说明技术原因（RLS Policy 无法跨表动态关联 properties 字段）
  - 在 `shared_properties_view` 中添加 `allow_marketing_reuse` 和 `is_shared` 字段供 API 层查询
  - 更新共享视图的 MUST NOT 列表说明，补充 `allow_marketing_reuse` 必须包含的注释
  - 更新风险场景表中的"未授权营销复用"行，明确检查位置为 API 层
- **验证**: 实现时 generate-content Route Handler 在步骤 4 查询 `shared_properties_view.allow_marketing_reuse`；RLS Policy 不承担此职责

### P2-4: STT 时长错误码不一致

- **文件**: `docs/contracts/api-contract.md` (section 1.3, 10.1), `docs/contracts/error-and-env-conventions.md` (section 2.1, 2.2)
- **问题**: PRD 11.1 定义录音超过 60 秒返回 422，但 api-contract 10.1 映射为 VALIDATION_FAILED (400)
- **修复**:
  - 新增错误码 `TRANSCRIPTION_DURATION_EXCEEDED` (422)，替代原 VALIDATION_FAILED (400) 映射
  - 更新 api-contract 1.3 通用错误码映射表，添加 TRANSCRIPTION_DURATION_EXCEEDED 行
  - 更新 api-contract 10.1 transcribe 端点错误响应列表
  - 同步更新 error-and-env-conventions.md：错误码表添加 TRANSCRIPTION_DURATION_EXCEEDED 行，TypeScript ErrorCode 联合类型添加该值
  - VALIDATION_FAILED (400) 仍保留用于其他参数校验场景（如文件缺失）
- **验证**: 时长 > 60s 返回 422，文件 > 10MB 返回 413（TRANSCRIPTION_TOO_LARGE），语义不重叠

### P2-5: VisualFactLevel 5 级 vs PRD 4 级

- **文件**: `docs/decisions/ADR-003-visual-fact-levels.md`（新建）
- **问题**: ai-contract 定义 5 级 VisualFactLevel（含 weak_visual_support），PRD 10.4 仅定义 4 级
- **修复**: 创建 ADR-003 说明从 4 级扩展到 5 级的原因、语义、前端展示颜色、触发条件和替代方案
- **决策要点**:
  - `weak_visual_support` 填补 insufficient_evidence 和 confirmed_visual_support 之间的语义缺口
  - 前端使用浅绿色/蓝色展示，区别于绿色（已确认）和灰色（证据不足）
  - 触发条件：置信度 0.4-0.7，或图片角度/光照/遮挡导致无法完全确认
  - 向后兼容：去掉 weak_visual_support 后其余 4 级与 PRD 完全一致
- **验证**: ai-contract 5 级体系已冻结，PRD 4 级为其子集，无需 schema migration

### 修改文件清单

| 文件 | 修改内容 |
|---|---|
| `docs/contracts/domain-model.md` | P1-1: 修复 building_no/unit_no/room_no 归属注释 |
| `docs/contracts/api-contract.md` | P1-2: 移除 COMPLIANCE_BLOCKED 通用映射，新增 generate-content 双场景说明；P2-4: 新增 TRANSCRIPTION_DURATION_EXCEEDED，更新 transcribe 错误响应 |
| `docs/contracts/error-and-env-conventions.md` | P1-2: 更新 COMPLIANCE_BLOCKED 描述；P2-4: 新增 TRANSCRIPTION_DURATION_EXCEEDED 错误码和类型定义 |
| `docs/contracts/rls-contract.md` | P1-3: 新增 allow_marketing_reuse 检查位置说明，更新 shared_properties_view 包含该字段，更新风险场景表 |
| `docs/decisions/ADR-003-visual-fact-levels.md` | P2-5: 新建，说明 5 级扩展理由、语义、前端映射和决策依据 |
