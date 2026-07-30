# Handoff: PHASE0-CONTRACTS-001

- Task ID: PHASE0-CONTRACTS-001
- Agent: product-planner
- 日期: 2026-07-30
- 状态: COMPLETED

---

## 修改文件清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `docs/plans/implementation-plan.md` | 新建 | Phase 0–4 实施计划，含完整任务拆分与依赖图 |
| `docs/plans/acceptance-matrix.md` | 新建 | 19 个业务能力领域的验收矩阵，共 150+ 条可验证条件 |

未修改任何已有文件。

---

## 关键决策说明

### 1. 阶段映射

PRD 第 14 节的 Phase 0–7 与 AGENTS.md 的 Phase 0–4 存在两套编号体系。本实施计划以 AGENTS.md 和 PHASE_PLAYBOOK.md 的 **Phase 0–4** 为唯一权威阶段编号。映射关系：

- **Phase 1** = PRD Phase 0/1 + 历史"第一轮"前半（项目基础、DB、Auth、RLS、基础 UI）
- **Phase 2** = PRD Phase 2/3/4 + 历史"第一轮"后半 + "第二轮"共享库部分（房源、客户、匹配、待办、共享）
- **Phase 3** = PRD Phase 5/6/7 + 历史"第二轮"AI 部分 + "第三轮"（AI、内容工厂、合规、配额）
- **Phase 4** = 无 PRD 对应（新增收尾阶段：全量测试、审查、部署）

### 2. 跨 Phase 功能拆解

某些功能横跨 Phase 2 和 Phase 3。具体处理方式：

- **自然语言搜索**：Phase 2 实现搜索 UI 和条件展示骨架，Phase 3 实现 AI 搜索解析后端。Phase 2 的搜索 UI 暂时调用搜索解析的 mock/占位接口。
- **待办任务中的内容相关任务**：Phase 2 实现所有任务类型的 CRUD（包括"发布内容""更新内容数据"），但内容相关任务的实际触发在 Phase 3 内容工厂完成后才有意义。
- **客户来源归因**：Phase 2 实现客户模型中的 source_content_id 字段，Phase 3 实现完整的归因 UI 和逻辑。

### 3. 任务所有权分配

遵循 OWNERSHIP.md 的严格边界：

- **data-security-engineer** 拥有所有 Supabase migration、RLS、Auth、Admin 根布局、用户/授权/邀请管理
- **ai-deepseek-engineer** 拥有所有 AI 管理页面（ai-usage、ai-models、ai-corrections、compliance），但不可修改 Admin 根布局
- **property-crm-engineer** 拥有房源/客户/匹配/待办/共享的所有业务页面和 API
- **mobile-ui-engineer** 拥有全局 UI 组件、ResponsiveOverlay、设计系统，以及通用的录音 UI 和 AI 确认卡片（这些被放在 `src/components/ui/` 作为跨业务通用组件）
- **test-engineer** 只写测试资产
- **integration-engineer** 拥有项目初始化、配置、CI、部署

### 4. 任务并行策略

Phase 1 中 data-security-engineer、mobile-ui-engineer、integration-engineer 的文件所有权完全互不重叠，可完全并行执行。

Phase 2 中 property-crm-engineer 和 data-security-engineer（补充 RLS）可并行，但需警惕 RLS migration 与业务表 migration 的版本序列问题。

Phase 3 中 ai-deepseek-engineer 的任务数量最多（21 个），具有显著的内部顺序依赖，建议按顺序分批执行：STT -> 文本提取 -> 视觉分析 -> 内容生成 -> 合规 -> 配额 -> 管理后台。

### 5. P0 风险项识别

- **P1-DB-003（全部 RLS Policy）**：如 RLS 实施不完整，直接造成数据泄露风险。需要在 Phase 1 完成 pgTAP 全覆盖测试。
- **P3-AI-014（配额原子预占 RPC）**：如果用"先 count 再 insert"实现，并发请求可绕过配额。必须使用数据库事务实现原子操作。
- **P2-SHARE-001（共享脱敏视图）**：如果共享视图实现为客户端过滤而非专用 View/RPC，房东隐私数据可能泄露。必须在 Phase 2 中通过专用 RLS 视图实现。
- **P3-AI-008（内容生成接口）**：需同时校验三层权限、配额预占、房源营销复用授权、事实校验、合规扫描，是所有接口中最复杂的，建议优先实现和测试。

---

## 与其他 Agent 契约的交叉引用

### domain-model.md

- 实施计划中所有 Phase 1 DB 任务的输入契约是 `docs/contracts/domain-model.md`（由 solution-architect 产出）
- 所有业务表（第 8.2 节）和索引（第 8.3 节）已在 PRD 中完整定义

### api-contract.md

- Phase 1 Auth/Entitlement 任务依赖 api-contract 中的 API 路径定义
- Phase 2 CRUD 任务完全基于 api-contract 的第 11.7–11.10 节
- Phase 3 AI 任务完全基于 api-contract 的第 11.1–11.6、11.13–11.15 节
- 验收矩阵中大量 AC 直接引用 API 路径

### rls-contract.md

- P1-DB-002、P1-DB-003、P2-RLS-001、P3-RLS-001/002/003 的输入契约
- 实施计划中已明确 RLS Policy 的覆盖范围和验收标准

### ai-contract.md

- Phase 3 全部 AI 任务的输入契约
- DeepSeekTextProvider、DeepSeekVisionProvider、TranscriptionProvider 接口定义
- 验收矩阵第 9-15 项（AI 智能录入、STT、视觉理解、纠错 Diff、内容工厂、合规预检、配额熔断）依赖 ai-contract

### 目录所有权

实施计划中每个任务的"允许修改路径"严格遵循 OWNERSHIP.md。特别注意：

- `src/app/admin/layout.tsx` 和 `src/app/admin/page.tsx` 仅 data-security-engineer 拥有
- `src/app/admin/ai-usage/**`、`src/app/admin/ai-models/**`、`src/app/admin/ai-corrections/**`、`src/app/admin/compliance/**` 由 ai-deepseek-engineer 拥有
- 业务组件必须在 `src/features/<domain>/**` 内，不可放在 `src/components/<domain>/**`

---

## 未解决的问题

1. **DeepSeek-VL 视觉 API 可用性**：DeepSeek 是否提供官方视觉 API，还是需要自托管 DeepSeek-VL 权重？这直接影响 P3-AI-005（DeepSeekVisionProvider）的实现方式。自托管方案需要额外的 GPU 服务器部署步骤。

2. **STT Provider 选型**：PRD 未具体指定 STT Provider。Implementation Plan 中 P3-STT-001 的 TranscriptionProvider 接口设计为可替换，但具体选型（阿里云、讯飞、Deepgram）会影响成本估算和实现细节。

3. **Vercel Serverless 限制**：视觉推理不能在 Vercel Function 内运行，STT Route Handler 使用 Node.js runtime。需要在 Vercel 配置中明确 runtime 分配。

4. **E2E 测试设备覆盖**：验收矩阵中的 AC-MOBILE-006（iOS Safari 软键盘）和 AC-MOBILE-013（Home Indicator 遮挡）需要真实设备或云设备测试。是否需要 BrowserStack 或等价方案？

5. **Supabase 项目类型**：使用 Supabase Cloud 还是自托管？影响 CI 中 supabase db lint/test db 的环境配置。

---

## 建议 Reviewer 重点检查的部分

### solution-architect

1. 本计划中的 API 路径列表是否与 api-contract.md 一致。特别注意共享房源使用了 `GET /api/shared-properties` 而非 `/api/properties/shared`（与 OWNERSHIP.md 命名约定一致）。
2. 数据库表清单是否与 domain-model.md 完全匹配（27 张表）。
3. Phase 间依赖是否存在循环依赖风险。

### quality-reviewer

1. P0 风险项（RLS、配额原子预占、共享脱敏视图、内容三层权限）的缓解措施是否充分。
2. 验收矩阵中所有"阻塞发布=是"的 AC 是否有对应的测试任务覆盖。
3. 跨 Agent 并行任务的 Owned Paths 是否存在重叠（特别注意 data-security-engineer 和 ai-deepseek-engineer 在 admin 路径下的边界）。

### data-security-engineer

1. Phase 1 任务 13 个，Phase 2 任务 1 个（P2-RLS-001），Phase 3 任务 3 个（P3-RLS-001/002/003）。确认 migration 版本顺序和函数依赖可管理。
2. `reserve_ai_quota` RPC 由 ai-deepseek-engineer 定义但需要 data-security-engineer 的 migration 支持，需确认协作接口。

### test-engineer

1. 六个测试任务（P1-TEST-001/002/003, P2-TEST-001/002/003, P3-TEST-001/002/003/004/005, P4-TEST-001/002）的依赖是否正确——test-engineer 需要在对应功能基本完成后才能开始测试。
2. Phase 4 的 E2E 25 条场景是否可映射到验收矩阵中的具体 AC。

---

## 修复轮记录

### 修复轮 1 (2026-07-30)

**触发：** quality-reviewer 审查发现 4 项修复需求。

**修复项：**

#### P2-6: AC-QUOTA-007 无 PRD 依据

- **问题：** AC-QUOTA-007 声称基础 AI 功能有独立配额限制，但 PRD 仅定义了 content_factory 的统一配额体系（AI_DAILY_CONTENT_LIMIT、AI_DAILY_COST_LIMIT_USD），未为基础 AI 功能定义独立配额。
- **修复：** 将 AC-QUOTA-007 标记为 `[Future]`，说明 PRD 现状（基础 AI 功能仅由 ai_usage_logs 记录用量，不设独立次数/成本上限，授权由 ai_data_extraction feature key 控制），并将 "阻塞发布" 从 "是" 改为 "否"。
- **文件：** `docs/plans/acceptance-matrix.md` 第 325 行。

#### P2-7: AC-AUTH-018 未指定登录限流阈值

- **问题：** AC-AUTH-018 描述为 "登录接口在连续 N 次失败后触发限流保护"，N 未指定。api-contract 2.2 节要求 "至少 5 次失败后临时锁定"。
- **修复：** 将描述改为 "登录接口在连续 5 次失败后触发临时锁定（至少 60 秒）"，明确阈值和锁定时长。
- **文件：** `docs/plans/acceptance-matrix.md` 第 51 行。

#### P2-8: Handoff 表数量 28→27

- **问题：** Handoff 文件中 "建议 Reviewer 重点检查的部分 -> solution-architect" 中写 "28 张表"，但 PRD 第 8.2 节和 implementation-plan.md 实际列举 27 张核心表（profiles, workspaces, workspace_members, properties, property_private_details, property_media, clients, interactions, property_matches, content_projects, content_versions, publishing_records, tasks, leads, collaboration_requests, feature_entitlements, system_admins, invitation_links, ai_usage_logs, ai_correction_logs, ai_user_preferences, ai_model_pricing, ai_user_limits, ai_runtime_config, compliance_terms, compliance_review_logs, audit_logs）。
- **修复：** 将 28 改为 27。
- **文件：** `docs/handoffs/PHASE0-CONTRACTS-001-product-planner.md` 第 122 行。

#### 额外修复: P3-RLS-001 输出包含 RLS 营销复用职责

- **问题：** P3-RLS-001 的 "具体输出" 中包含 "内容表 RLS 验证营销复用权限（allow_marketing_reuse）"，但 rls-contract 已明确营销复用权限验证为 API 层职责，不应由 RLS 在数据库层拦截。
- **修复：** 将描述改为 "API 层验证营销复用权限（allow_marketing_reuse），RLS 不对营销复用进行数据库层拦截（由 rls-contract 明确为 API 层职责）"。
- **文件：** `docs/plans/implementation-plan.md` 第 1816 行。
