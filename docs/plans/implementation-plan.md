# HouseVibe Phase 0–4 实施计划

- 文档名称：HouseVibe Phase 0–4 实施计划
- 版本：1.1
- 状态：APPROVED FOR PHASE 1
- Owner：product-planner
- 依赖 PRD 版本：v1.3
- 最后更新日期：2026-07-30

---

## 1. 产品目标

### 核心用户

- 个人租赁经纪人
- 夫妻中介店
- 1–10 人独立房产门店
- 聚焦某一区域、某一商圈或某几个小区的经纪人

### 三个核心用户闭环

**基础业务闭环（面向所有正式注册中介）：**

```text
注册/登录
→ 自动创建独立工作区
→ 语音/文本录入房源与客户
→ AI 提取结构化字段
→ 人工确认入库
→ 房源检索与客户管理
→ 房客智能匹配
→ 跟进、带看、成交
```

**内容获客闭环（仅面向指定内容用户）：**

```text
系统管理员授予 content_factory 权限
→ 指定用户选择自己有权使用的房源
→ 生成小红书/抖音/朋友圈内容
→ 人工编辑确认
→ 记录发布信息与私信口令
→ 关联客户、带看与成交
```

**同行合作闭环：**

```text
私有房源
→ 用户主动上架合作共享库
→ 自动隐藏房东信息与精确地址
→ 其他中介查看脱敏房源
→ 发起合作请求
```

### MVP 范围摘要

- 多租户注册、登录、workspace 自动创建
- 完整的房源 CRUD（文本录入、图片上传、状态管理、软删除）
- 完整的客户 CRM（阶段管理、跟进提醒、沟通记录）
- AI 结构化录入（文本解析 + 语音转文本 + DeepSeek 提取）
- 房源图片视觉分析（DeepSeek-VL 视觉标签、整套摘要、事实交叉校验）
- 自然语言语义搜索
- 房客规则匹配与评分解释
- 待办与跟进任务
- 合作共享库（脱敏共享、合作请求、is_shared 与 allow_marketing_reuse 独立控制）
- 受限内容工厂（content_factory 权限控制、小红书/抖音/朋友圈生成、合规预检、配额与成本熔断）
- 发布归因（私信口令、客户来源关联、带看与成交归因）
- 系统管理员后台（用户管理、feature 授权、AI 用量看板、模型切换、合规词库）
- 今日工作台（差异化仪表盘，普通用户与内容用户不同）
- 三层权限控制（前端 UI、服务端 API、Supabase RLS）
- DeepSeek-only 模型策略（文本 + 视觉，无其他 LLM/VLM）
- AI 纠错日志与用户偏好学习
- 隐私预处理（敏感字段永不发送给模型）
- 每日配额与成本原子预占

### 明确非目标

参考 PRD 1.7 节。MVP 不包含：

- 大型房产门户、房源自动抓取
- 非官方平台自动登录、自动群发私信
- 在线支付、房租托管、电子合同签署、财务记账
- 经纪人绩效和复杂组织管理
- 自动房价评估、AI 自动承诺价格/佣金
- 视频自动剪辑、数字人、完整地图找房

### 北极星指标

**每周通过系统完成有效房源管理、客户匹配或内容获客闭环的活跃中介数。**

辅助指标见 PRD 第 2 节。

---

## 2. Phase 0–4 实施计划

统一采用以下阶段体系（与 `AGENTS.md` 和 `docs/coordination/PHASE_PLAYBOOK.md` 一致）：

| Phase | 名称 | 说明 |
|---|---|---|
| Phase 0 | 契约冻结 | 需求审查、架构决策、契约冻结 |
| Phase 1 | 项目基础 | Auth、Workspace、Supabase、RLS、基础 UI |
| Phase 2 | 基础业务 | 房源、客户、匹配、待办、合作共享库 |
| Phase 3 | AI 与内容 | DeepSeek 智能录入、视觉理解、内容工厂、合规、配额、成本 |
| Phase 4 | 全量测试与发布 | 集成、部署、审计、发布准备 |

---

### Phase 0：契约冻结

**目标：** 在实现代码前冻结所有产品与架构决策。

**输入契约：** `docs/PRD.md`

**并行 Agent：**
- product-planner（本任务）
- solution-architect
- quality-reviewer

**任务清单：**

| Task ID | 描述 | Owner |
|---|---|---|
| P0-CONTRACTS-001 | 创建 implementation-plan.md 与 acceptance-matrix.md | product-planner |
| P0-CONTRACTS-002 | 创建 domain-model.md | solution-architect |
| P0-CONTRACTS-003 | 创建 api-contract.md | solution-architect |
| P0-CONTRACTS-004 | 创建 rls-contract.md | solution-architect |
| P0-CONTRACTS-005 | 创建 ai-contract.md | solution-architect |
| P0-REVIEW-001 | PRD 风险审查 | quality-reviewer |

**交付物：**
- `docs/plans/implementation-plan.md`
- `docs/plans/acceptance-matrix.md`
- `docs/contracts/domain-model.md`
- `docs/contracts/api-contract.md`
- `docs/contracts/rls-contract.md`
- `docs/contracts/ai-contract.md`

**完成条件：**
- 五份契约文件全部冻结
- quality-reviewer 风险报告已产出
- 主 Agent 综合确认无阻塞性冲突

**不属于本阶段的内容：**
- 任何业务代码
- 数据库 migration
- UI 组件

**进入下一阶段的门禁：**
- 所有契约文件获得主 Agent 批准冻结
- P0 级风险已列出缓解计划

---

### Phase 1：项目基础、Auth、Workspace、Supabase、RLS 和基础 UI

**目标：** 建立项目骨架、身份认证、多租户隔离、权限基础设施和全局移动端 UI。

**输入契约：**
- `docs/contracts/domain-model.md`
- `docs/contracts/rls-contract.md`
- `docs/contracts/api-contract.md`

**并行 Agent：**
- data-security-engineer
- mobile-ui-engineer
- integration-engineer

**任务清单：** 详见第 3 节「原子任务拆分」。

**完成条件：**
- Supabase 项目初始化完成，所有表、索引、约束已建成
- 所有 RLS Policy 已实施并通过 pgTAP 测试
- Storage Bucket 与 Policy 已配置
- 用户可注册、登录、自动创建 workspace
- Admin 根布局与用户/授权/邀请管理页面可用
- 全局 App Shell（移动端底部导航、桌面端侧栏）实现
- ResponsiveOverlay、全局状态组件、设计 Token 完成
- Next.js 项目通过 typecheck、lint、build
- CI 流水线配置完成

**不属于本阶段的内容：**
- 业务功能（房源、客户、匹配、内容等）
- AI 集成
- 共享库

**进入下一阶段的门禁：**
- TypeScript strict 无错误
- ESLint 无错误
- Vitest 单元测试全部通过
- Supabase db lint 无问题
- pgTAP RLS 测试全部通过
- Build 成功
- 用户注册登录 E2E 路径通过

---

### Phase 2：房源、客户、匹配、待办和合作共享库

**目标：** 实现所有基础 CRM 业务能力和同行合作共享。

**输入契约：**
- `docs/contracts/domain-model.md`（冻结）
- `docs/contracts/api-contract.md`（冻结）
- `docs/contracts/rls-contract.md`（冻结）

**并行 Agent：**
- property-crm-engineer
- data-security-engineer（补充 RPC/RLS）
- test-engineer

**任务清单：** 详见第 3 节「原子任务拆分」。

**完成条件：**
- 房源 CRUD 完整可用（列表、详情、创建、编辑、软删除、状态管理）
- 客户 CRUD 完整可用（列表、详情、创建、编辑、阶段管理）
- 房源筛选与排序所有组合可用
- 自然语言语义搜索可用
- 房客匹配规则引擎可用（含评分、解释、手工权重调整）
- 待办任务 CRUD 可用
- 合作共享库可用（脱敏共享、下架、合作请求）
- is_shared 与 allow_marketing_reuse 独立控制
- 今日工作台展示差异化仪表盘

**不属于本阶段的内容：**
- AI 智能录入与视觉分析
- 内容工厂
- 合规扫描
- 配额与成本管理

**进入下一阶段的门禁：**
- 所有业务表 RLS 测试通过
- 共享视图脱敏验证通过（房东电话、精确地址不可见）
- 合作请求生命周期完整
- TypeScript、Lint、Build 全部通过
- Phase 2 所有 Vitest + pgTAP 测试通过
- 集成测试覆盖 CRUD 与匹配核心路径

---

### Phase 3：DeepSeek 智能录入、视觉理解、内容工厂、合规、配额和成本

**目标：** 实现所有 AI 能力、内容生成、合规预检和成本管理。

**输入契约：**
- `docs/contracts/ai-contract.md`（冻结）
- `docs/contracts/api-contract.md`（冻结）
- `docs/contracts/rls-contract.md`（冻结）

**并行 Agent：**
- ai-deepseek-engineer
- data-security-engineer（AI 日志、配额、RLS）
- mobile-ui-engineer（录音 UI、AI 确认卡片等全局组件）
- test-engineer

**任务清单：** 详见第 3 节「原子任务拆分」。

**完成条件：**
- STT 语音转文本 Route Handler 可用（multipart/form-data，60 秒限制）
- DeepSeekTextProvider 实现并可用（房源解析、客户解析、搜索解析）
- DeepSeekVisionProvider 实现并可用（单图标签、整套摘要、事实交叉校验）
- 所有 AI 接口通过隐私预处理（敏感字段不发送模型）
- AI 纠错 Diff 自动记录（含 requestId 的保存触发）
- 用户偏好学习可用（阈值触发、可查看、可删除）
- 内容工厂三层权限控制生效
- 小红书、抖音、朋友圈内容生成可用
- 合规预检模块实现（block/review/highlight 三级处理）
- 复制拦截基于服务端状态
- 原子配额预占 RPC 实现
- 成本熔断与管理员恢复可用
- DeepSeek 主备模型热切换可用
- AI 管理看板可用（用量、模型、纠错、合规词库）
- 内容 👍/👎 反馈与纠错日志

**不属于本阶段的内容：**
- 新业务功能
- 非 DeepSeek 模型集成

**进入下一阶段的门禁：**
- 所有 AI 接口三层权限验证通过
- content_factory 拒绝非授权用户的所有访问路径
- 配额并发测试通过（并发请求无法绕过每日上限）
- 成本熔断测试通过（达到上限返回 429）
- 合规 block 级别拦截测试通过
- 隐私预处理测试通过（敏感字段未泄露给模型）
- 所有单元、集成、RLS、E2E 测试通过

---

### Phase 4：全量测试、集成、部署、审计和发布准备

**目标：** 全面审查、修复、最终集成和发布。

**输入契约：** 所有已冻结契约

**并行 Agent（只读审查）：**
- quality-reviewer
- test-engineer
- solution-architect

**后续 Agent：**
- integration-engineer（修复后的最终集成与部署）
- 主 Agent（冒烟测试与发布决策）

**任务清单：** 详见第 3 节「原子任务拆分」。

**完成条件：**
- quality-reviewer 安全性、合规性、架构一致性审查完成
- 所有 P0/P1/P2 问题清零
- E2E 全流程（PRD 第 16.3 节全部 25 条场景）通过
- 构建、部署、冒烟测试成功
- 审计日志验证通过

**不属于本阶段的内容：**
- 新功能开发
- 架构重构

**发布门禁：**
- P0 问题数为 0
- P1 问题数为 0
- P2 问题数为 0
- TypeScript strict 无错误
- ESLint 无错误
- 全部测试套件通过
- Build 成功
- Vercel 部署成功
- 冒烟测试通过

---

## 3. 原子任务拆分

### Phase 1 任务详情

---

#### P1-DB-001：创建 Supabase 项目、初始 migration（全部表、索引、约束）

- **Owner Agent：** data-security-engineer
- **输入文件：** `docs/contracts/domain-model.md`、`docs/contracts/rls-contract.md`
- **允许修改路径：** `supabase/migrations/**`、`docs/handoffs/**`
- **依赖任务：** P0-CONTRACTS-002（domain-model.md）
- **具体输出：**
  - 创建所有 PRD 第 8.2 节定义的表（profiles、workspaces、workspace_members、properties、property_private_details、property_media、clients、interactions、property_matches、content_projects、content_versions、publishing_records、tasks、leads、collaboration_requests、feature_entitlements、system_admins、invitation_links、ai_usage_logs、ai_correction_logs、ai_user_preferences、ai_model_pricing、ai_user_limits、ai_runtime_config、compliance_terms、compliance_review_logs、audit_logs）
  - 创建所有 PRD 第 8.3 节定义的索引（至少 20 个索引）
  - 创建 `workspace_members(workspace_id, user_id)` 联合唯一约束
  - 所有主键使用 UUID
  - 所有时间戳使用 `timestamptz`
  - 所有定义 `deleted_at` 的表完成软删除列
- **验收标准：**
  - `supabase db lint` 无错误
  - 所有表可通过 `supabase db reset` 重建
  - migration 可正向和回滚执行
  - 索引覆盖 PRD 第 8.3 节所有建议
- **测试要求：** `supabase test db` 通过
- **风险等级：** P0（数据模型是系统基础）

---

#### P1-DB-002：创建 RLS 辅助函数（is_workspace_member, is_workspace_owner, is_system_admin, has_feature）

- **Owner Agent：** data-security-engineer
- **输入文件：** `docs/contracts/domain-model.md`、`docs/contracts/rls-contract.md`
- **允许修改路径：** `supabase/migrations/**`、`docs/handoffs/**`
- **依赖任务：** P1-DB-001
- **具体输出：**
  - `is_workspace_member(workspace_uuid uuid)` 函数：通过 `workspace_members` 表判断当前 `auth.uid()` 是否属于指定 workspace
  - `is_workspace_owner(workspace_uuid uuid)` 函数：判断当前用户是否为 workspace 的 owner
  - `is_system_admin()` 函数：通过 `system_admins` 表判断当前用户是否为系统管理员
  - `has_feature(requested_feature text)` 函数：检查当前用户是否拥有指定 feature 的有效授权（status=active, expires_at 为空或未过期）
  - 所有函数使用固定 `search_path`、`SECURITY DEFINER`、完全限定表名
  - 限制 execute 权限仅给需要的数据库角色
- **验收标准：**
  - 函数不产生递归调用
  - 每个函数可通过 EXPLAIN 验证索引命中
  - 函数在未登录状态下返回 false 而非报错
  - `has_feature` 正确判断 active/expired/revoked 三种状态
- **测试要求：** pgTAP 测试覆盖所有函数的正常/边界/未登录/无权限场景
- **风险等级：** P0（RLS 基础）

---

#### P1-DB-003：创建全部 RLS Policy

- **Owner Agent：** data-security-engineer
- **输入文件：** `docs/contracts/rls-contract.md`
- **允许修改路径：** `supabase/migrations/**`、`docs/handoffs/**`
- **依赖任务：** P1-DB-001、P1-DB-002
- **具体输出：**
  - 为所有业务表启用 RLS
  - 基础业务表（properties、property_private_details、property_media、clients、interactions、property_matches、tasks、leads）Policy：auth.uid() 已登录 AND is_workspace_member(workspace_id) AND deleted_at IS NULL
  - 内容表（content_projects、content_versions、publishing_records）Policy：额外要求 has_feature('content_factory')
  - 内容版本表的合规与反馈字段允许 content_factory 用户更新
  - 共享房源视图/RPC 的访问权限（外部用户仅读脱敏数据）
  - feature_entitlements 仅系统管理员可写
  - system_admins 仅系统管理员可读写
  - ai_usage_logs 用户只读自己，插入仅限服务端
  - ai_correction_logs、ai_user_preferences 用户只读自己
  - ai_model_pricing、ai_runtime_config、compliance_terms 仅管理员可写
  - audit_logs 仅管理员可读，任何人不可改/删
  - 所有 Policy 使用一次 EXISTS 成员关系判断，避免多层嵌套
  - workspace_members 自身的 RLS 不调用 is_workspace_member
- **验收标准：**
  - 所有表默认拒绝（未登录用户无法读取任何业务数据）
  - 用户 A 无法读取用户 B 的私有房源和客户
  - 普通用户无法读取内容表
  - 系统管理员可读取平台级数据
  - 每个 Policy 可通过 EXPLAIN 验证
- **测试要求：** pgTAP 测试覆盖每张表的 SELECT/INSERT/UPDATE/DELETE 权限，至少覆盖：已登录 + 有权限、已登录 + 无权限、未登录 三种场景
- **风险等级：** P0（安全核心）

---

#### P1-DB-004：创建 Storage Bucket 与 Policy

- **Owner Agent：** data-security-engineer
- **输入文件：** `docs/contracts/rls-contract.md`
- **允许修改路径：** `supabase/migrations/**`、`supabase/storage-policies/**`、`docs/handoffs/**`
- **依赖任务：** P1-DB-001
- **具体输出：**
  - 创建四个 Bucket：`property-private`、`property-shared`、`content-assets`、`avatars`
  - 私有媒体仅 workspace 成员可访问
  - 共享媒体通过派生文件或独立共享 bucket 提供
  - 内容素材仅 content_factory 用户可写入
  - 不直接暴露私有 bucket 永久公开 URL
  - 使用签名 URL
- **验收标准：**
  - 未登录用户无法读取私有 bucket 文件
  - 非 workspace 成员无法读取其他 workspace 的私有媒体
  - 普通用户无法写入 `content-assets`
- **测试要求：** pgTAP 或集成测试覆盖 Storage Policy
- **风险等级：** P0（数据泄露风险）

---

#### P1-AUTH-001：实现注册/登录/邀请加入页面

- **Owner Agent：** data-security-engineer
- **输入文件：** `docs/contracts/api-contract.md`、`docs/contracts/rls-contract.md`
- **允许修改路径：** `src/app/(auth)/**`、`src/features/auth/**`、`src/lib/supabase/**`、`docs/handoffs/**`
- **依赖任务：** P1-DB-001、P1-UI-001
- **具体输出：**
  - `/login` 页面（邮箱密码登录、错误提示）
  - `/register` 页面（邮箱密码注册、姓名、手机号、城市、协议勾选）
  - `/join/[inviteToken]` 页面（受邀加入流程）
  - Supabase Auth 客户端初始化（服务端 + 客户端）
  - Session 管理与中间件（保护业务路由）
  - 登录接口防暴力尝试
  - 邮箱验证（Magic Link 可作为增强）
- **验收标准：**
  - 未登录用户访问 `/dashboard` 时被重定向到 `/login`，HTTP 302
  - 注册成功后自动登录并跳转 onboarding
  - 登录失败显示明确的错误信息
  - 退出登录后清理本地会话，访问受保护路由被重定向
  - 邀请 Token 只保存 Hash
- **测试要求：** 集成测试覆盖注册、登录、退出、无效凭证、过期邀请
- **风险等级：** P0（入口功能）

---

#### P1-AUTH-002：实现 workspace 自动创建与 onboarding 流程

- **Owner Agent：** data-security-engineer
- **输入文件：** `docs/contracts/domain-model.md`
- **允许修改路径：** `src/app/onboarding/**`、`src/features/auth/**`、`src/lib/supabase/**`、`docs/handoffs/**`
- **依赖任务：** P1-AUTH-001、P1-DB-001
- **具体输出：**
  - 首次登录自动创建独立 workspace
  - Onboarding 页面：收集经纪人姓名、门店名称、手机号、所在城市、主营区域
  - 隐私协议和用户协议确认
  - 完成 onboarding 后进入 dashboard
  - 用户默认为 workspace owner
  - 未完成 onboarding 的用户始终重定向到 onboarding 页面
- **验收标准：**
  - 首次登录用户必须完成 onboarding 才能访问业务页面
  - 第二次登录不再走 onboarding
  - workspace 与用户正确关联
  - 中途退出后重新登录仍进入 onboarding
- **测试要求：** 集成测试覆盖首次登录、完成 onboarding、再次登录
- **风险等级：** P1

---

#### P1-ADMIN-001：实现 Admin 根布局与导航壳

- **Owner Agent：** data-security-engineer
- **输入文件：** `docs/contracts/domain-model.md`
- **允许修改路径：** `src/app/admin/layout.tsx`、`src/app/admin/page.tsx`、`docs/handoffs/**`
- **依赖任务：** P1-DB-002、P1-UI-001
- **具体输出：**
  - `/admin/layout.tsx`：管理员布局壳
  - `/admin/page.tsx`：管理员首页（概览跳转）
  - 管理员路由守卫：仅 is_system_admin() 用户可访问
  - Admin 导航项：用户管理、Feature 授权、邀请链接、AI 用量、AI 模型、AI 纠错、合规（后四项在 Phase 3 加入）
  - 普通用户访问 `/admin/**` 返回 403 或重定向
- **验收标准：**
  - 系统管理员可访问 `/admin` 并看到导航
  - 普通用户访问 `/admin/users` 时被拒绝（返回 403 或重定向）
  - 未登录用户访问 `/admin` 时被重定向到 `/login`
  - Admin 导航组合模式支持各 feature Agent 贡献导航项
- **测试要求：** 集成测试覆盖管理员访问、普通用户拒绝、未登录重定向
- **风险等级：** P0（权限核心）

---

#### P1-ADMIN-002：实现用户管理页面（/admin/users）

- **Owner Agent：** data-security-engineer
- **输入文件：** `docs/contracts/api-contract.md`
- **允许修改路径：** `src/app/admin/users/**`、`src/app/api/admin/users/**`、`docs/handoffs/**`
- **依赖任务：** P1-DB-001、P1-ADMIN-001
- **具体输出：**
  - `/admin/users` 页面：用户列表（姓名、邮箱、注册时间、workspace、状态）
  - 用户详情查看：基本信息、workspace 成员关系、feature 授权状态
  - 禁用/启用账号功能
  - 搜索用户（按邮箱、姓名）
- **验收标准：**
  - 仅系统管理员可访问
  - 普通用户调用 API 返回 403
  - 禁用账号后该用户无法登录
  - 用户列表分页加载
- **测试要求：** 集成测试覆盖管理员查看用户列表、禁用账号
- **风险等级：** P1

---

#### P1-ADMIN-003：实现 Feature Entitlement 管理页面（/admin/feature-entitlements）

- **Owner Agent：** data-security-engineer
- **输入文件：** `docs/contracts/api-contract.md`、`docs/contracts/rls-contract.md`
- **允许修改路径：** `src/app/admin/feature-entitlements/**`、`src/app/api/admin/feature-entitlements/**`、`docs/handoffs/**`
- **依赖任务：** P1-DB-001、P1-ADMIN-001、P1-ENT-001
- **具体输出：**
  - `/admin/feature-entitlements` 页面
  - 搜索指定用户
  - 授予 content_factory（可选设置 expires_at）
  - 撤销权限
  - 查看授权历史（授权人、时间、状态、有效期）
  - 支持 feature 列表：ai_data_extraction、semantic_search、property_matching、shared_property_pool、content_factory
- **验收标准：**
  - 管理员可搜索用户并授予 content_factory
  - 授予后用户立即获得内容能力
  - 撤销后用户立即失去内容能力（页面导航消失 + API 403 + RLS 拒绝）
  - 授权操作写入 audit_logs
  - 普通用户调用授权 API 返回 403
- **测试要求：** 集成测试覆盖授予、撤销、过期授权、普通用户调用拒绝
- **风险等级：** P0（content_factory 权限是核心安全边界）

---

#### P1-ADMIN-004：实现邀请链接管理页面（/admin/invites）

- **Owner Agent：** data-security-engineer
- **输入文件：** `docs/contracts/api-contract.md`
- **允许修改路径：** `src/app/admin/invites/**`、`src/app/api/admin/invites/**`、`src/app/api/invites/**`、`docs/handoffs/**`
- **依赖任务：** P1-DB-001、P1-ADMIN-001
- **具体输出：**
  - `/admin/invites` 页面
  - 创建邀请链接：配置 target_workspace_id、过期时间、最大使用次数、auto_join
  - 查看邀请链接列表与状态（active、expired、revoked）
  - 撤销邀请链接
  - `/api/invites/[token]/accept` 接受邀请接口
- **验收标准：**
  - 管理员可创建邀请链接并复制 URL
  - 邀请链接过期后无法使用
  - 超过最大使用次数后无法使用
  - 撤销后立即失效
  - Token 只保存 Hash，不保存明文
- **测试要求：** 集成测试覆盖创建、接受、过期、超次数、撤销
- **风险等级：** P1

---

#### P1-ENT-001：实现 feature_entitlements 的 Server Actions 与 API

- **Owner Agent：** data-security-engineer
- **输入文件：** `docs/contracts/api-contract.md`、`docs/contracts/rls-contract.md`
- **允许修改路径：** `src/features/entitlements/**`、`src/app/api/admin/feature-entitlements/**`、`docs/handoffs/**`
- **依赖任务：** P1-DB-001、P1-DB-002
- **具体输出：**
  - `GET /api/admin/feature-entitlements`：列出所有授权记录
  - `POST /api/admin/feature-entitlements`：创建授权（grant）
  - `PATCH /api/admin/feature-entitlements/:id`：更新授权（设置有效期、撤销）
  - `DELETE /api/admin/feature-entitlements/:id`：删除授权记录
  - 所有接口校验 is_system_admin()
  - 授权、撤销、更新操作写入 audit_logs
  - Server Action 版本作为轻量场景补充
- **验收标准：**
  - 仅系统管理员可调用
  - 对同一用户同一 feature 不能有两条 active 授权（唯一约束）
  - 撤销操作正确设置 status='revoked' 和 revoked_at
  - 过期授权在 has_feature() 中正确返回 false
- **测试要求：** 集成测试覆盖 CRUD、权限检查、唯一约束冲突、过期判断
- **风险等级：** P0（授权核心）

---

#### P1-SETTINGS-001：实现 settings 页面（profile, workspace, privacy）

- **Owner Agent：** data-security-engineer
- **输入文件：** `docs/contracts/domain-model.md`
- **允许修改路径：** `src/app/(dashboard)/settings/**`、`src/app/(dashboard)/profile/**`、`docs/handoffs/**`
- **依赖任务：** P1-DB-001、P1-UI-001
- **具体输出：**
  - `/settings/profile`：编辑个人资料（姓名、手机号、头像、城市）
  - `/settings/workspace`：查看/编辑 workspace 信息（名称、城市、业务类型）、成员管理
  - `/settings/privacy`：隐私政策入口、数据导出、账号删除申请
- **验收标准：**
  - 个人资料修改即时生效
  - workspace owner 可查看和移除成员
  - 普通成员不可修改 workspace 名称
  - 数据导出返回用户自己的数据
- **测试要求：** 集成测试覆盖资料编辑、成员管理权限
- **风险等级：** P2

---

#### P1-UI-001：实现全局 App Shell（移动端底部导航、桌面端侧栏）

- **Owner Agent：** mobile-ui-engineer
- **输入文件：** `docs/contracts/api-contract.md`
- **允许修改路径：** `src/components/layout/**`、`src/app/(dashboard)/layout.tsx`、`src/app/(dashboard)/page.tsx`、`src/app/layout.tsx`、`docs/handoffs/**`
- **依赖任务：** P1-INT-001（项目初始化）
- **具体输出：**
  - Dashboard Layout：包含移动端底部导航和桌面端侧栏
  - 移动端底部导航配置：首页、房源、客户、[内容（仅 content_factory）]、我的
  - 桌面端侧栏导航配置：工作台、房源（私有+共享）、客户、房客匹配、[内容工作台]、[发布记录]、待办、设置
  - 导航项根据用户权限动态显示/隐藏
  - 权限加载期间不短暂闪现未授权菜单
  - `/dashboard` 首页显示今日工作台
- **验收标准：**
  - 移动端（375px 宽度）底部导航正常显示
  - 桌面端侧栏正常显示
  - 普通用户看不到"内容"导航
  - content_factory 用户看到"内容"导航
  - 系统管理员额外看到"管理"入口
  - 权限加载期间不闪现未授权菜单
- **测试要求：** 组件测试覆盖移动端/桌面端渲染、权限驱动导航显示/隐藏
- **风险等级：** P1

---

#### P1-UI-002：实现 ResponsiveOverlay（Drawer/Dialog 响应式封装）

- **Owner Agent：** mobile-ui-engineer
- **输入文件：** 无特定契约依赖
- **允许修改路径：** `src/components/responsive/**`、`src/hooks/use-responsive*.ts`、`src/components/ui/**`、`docs/handoffs/**`
- **依赖任务：** P1-INT-001
- **具体输出：**
  - `ResponsiveOverlay` 组件：移动端使用 Vaul/shadcn Drawer（底部弹出），桌面端使用 shadcn Dialog（居中）
  - Drawer 配置：`max-height: 92dvh`、内部滚动、Safe Area (`env(safe-area-inset-bottom)`)
  - 切换断点时不丢失未提交表单状态
  - 打开 Overlay 时锁定背景滚动
  - iOS Safari 软键盘适配（动态视口单位 dvh、输入框不被遮挡）
  - 关闭前若表单已修改，提示是否放弃
  - 无障碍 focus trap 支持
- **验收标准：**
  - 在 375px 宽度下确认弹窗以 Drawer 形式从底部弹出
  - 在 1024px 宽度下以 Dialog 形式居中弹出
  - 切换断点（如旋转设备）时表单状态不丢失
  - iOS Safari 软键盘弹起后输入框可见且可操作
  - Drawer 内部可滚动，标题和底部操作区保持固定
- **测试要求：** 组件测试覆盖移动端 Drawer 行为、桌面端 Dialog 行为、断点切换、表单状态保持
- **风险等级：** P1

---

#### P1-UI-003：实现全局 loading/empty/error/retry 组件

- **Owner Agent：** mobile-ui-engineer
- **输入文件：** 无特定契约依赖
- **允许修改路径：** `src/components/ui/**`、`docs/handoffs/**`
- **依赖任务：** P1-INT-001
- **具体输出：**
  - Loading 组件（骨架屏/Spinner）
  - Empty 组件（空状态插画 + 引导文案）
  - Error 组件（错误信息 + Retry 按钮）
  - Retry 组件（带回调的重新加载按钮）
  - 组合使用模式（如列表：loading -> empty / error -> 数据）
- **验收标准：**
  - Loading 状态展示骨架屏或 Spinner
  - 无数据时展示明确空状态和引导
  - 错误状态展示错误信息并提供 Retry 按钮
  - 点击 Retry 触发重新加载
- **测试要求：** 组件测试覆盖各状态渲染
- **风险等级：** P2

---

#### P1-UI-004：实现设计 Token 与 CSS 变量

- **Owner Agent：** mobile-ui-engineer
- **输入文件：** 无特定契约依赖
- **允许修改路径：** `src/app/globals.css`、`tailwind.config.*`、`docs/handoffs/**`
- **依赖任务：** P1-INT-002（Tailwind 配置）
- **具体输出：**
  - 设计 Token：颜色、间距、圆角、阴影、字体大小、动画时长
  - CSS 变量定义（在 globals.css 中）
  - Tailwind 主题扩展（映射到设计 Token）
  - 不硬编码魔法颜色
  - 支持深色模式（暗色主题变量）
- **验收标准：**
  - 所有组件颜色通过 CSS 变量引用
  - 在一个位置修改品牌色后全局生效
  - 无硬编码颜色值（如 `#1a1a2e`）出现在组件样式里
- **测试要求：** 视觉回归测试（V1 或人工检查）
- **风险等级：** P2

---

#### P1-UI-005：实现 globals.css（含 Safe Area、100dvh）

- **Owner Agent：** mobile-ui-engineer
- **输入文件：** 无特定契约依赖
- **允许修改路径：** `src/app/globals.css`、`docs/handoffs/**`
- **依赖任务：** P1-INT-002
- **具体输出：**
  - Tailwind 指令（`@tailwind base/components/utilities`）
  - 全局重置样式
  - Safe Area CSS 变量定义（`env(safe-area-inset-*)`）
  - 动态视口单位工具类（`min-h-screen-dynamic`、`h-screen-dynamic`）
  - 底部导航固定定位适配
  - 滚动行为优化
- **验收标准：**
  - iOS Safari 底部导航不被 Home Indicator 遮挡
  - 使用 100dvh 而非 100vh 的容器正确填充可视区域
  - 滚动容器在移动端流畅
- **测试要求：** 组件测试 + 移动端真机验证
- **风险等级：** P2

---

#### P1-INT-001：初始化 Next.js 项目、安装依赖

- **Owner Agent：** integration-engineer
- **输入文件：** `docs/PRD.md` 第 17 节（环境变量）、第 18 节（项目目录）
- **允许修改路径：** `package.json`、lockfile、`next.config.*`、`tsconfig.json`、`eslint.config.*`、`postcss.config.*`、`tailwind.config.*`、`components.json`、`docs/handoffs/**`
- **依赖任务：** 无（Phase 0 冻结后开始）
- **具体输出：**
  - `npx create-next-app` 或等价方式初始化
  - 安装所有固定依赖：shadcn/ui、Vaul、Lucide、Zod、React Hook Form、Tailwind CSS、@supabase/ssr、@supabase/supabase-js
  - 初始化 shadcn/ui（`npx shadcn@latest init`）
  - 添加 Vaul 作为 Drawer 依赖
  - 安装 TanStack Query（可选）
- **验收标准：**
  - `npm run dev` 启动成功
  - 项目目录结构符合 PRD 第 18 节规范
  - 无依赖版本冲突
- **测试要求：** 无（初始化阶段）
- **风险等级：** P0（项目基础）

---

#### P1-INT-002：配置 TypeScript、ESLint、Tailwind、shadcn/ui

- **Owner Agent：** integration-engineer
- **输入文件：** `.claude/rules/architecture.md`
- **允许修改路径：** `tsconfig.json`、`eslint.config.*`、`tailwind.config.*`、`postcss.config.*`、`components.json`、`docs/handoffs/**`
- **依赖任务：** P1-INT-001
- **具体输出：**
  - TypeScript strict 模式开启
  - ESLint 配置（继承 Next.js 推荐 + 自定义规则）
  - Tailwind 配置（content 路径、主题扩展）
  - shadcn/ui 组件列表初始化
  - Prettier 配置
- **验收标准：**
  - `npm run typecheck` 通过（空项目初始状态）
  - `npm run lint` 通过
  - Tailwind 类名智能提示可用
- **测试要求：** 无（配置阶段）
- **风险等级：** P0（开发体验基础）

---

#### P1-INT-003：配置环境变量 Schema（src/lib/env/）

- **Owner Agent：** integration-engineer
- **输入文件：** `docs/PRD.md` 第 17 节
- **允许修改路径：** `src/lib/env/**`、`docs/handoffs/**`
- **依赖任务：** P1-INT-001
- **具体输出：**
  - 环境变量 Zod Schema 定义（覆盖 PRD 第 17 节全部变量）
  - 服务端环境变量校验（启动时验证）
  - 客户端安全变量前缀（NEXT_PUBLIC_）校验
  - 缺失必填变量时应用启动报错
  - 默认值处理（如 DEEPSEEK_TEXT_MODEL_PRIMARY 默认为 deepseek-chat）
- **验收标准：**
  - 缺少 DEEPSEEK_API_KEY 时启动报错并输出清晰错误信息
  - 环境变量类型错误时启动报错
  - 没有把服务端密钥暴露到 `NEXT_PUBLIC_` 前缀
- **测试要求：** 单元测试覆盖有效配置、缺失必填变量、类型错误、默认值
- **风险等级：** P0（安全与可运维性）

---

#### P1-INT-004：配置 CI（GitHub Actions）

- **Owner Agent：** integration-engineer
- **输入文件：** `CLAUDE.md`
- **允许修改路径：** `.github/**`、`docs/handoffs/**`
- **依赖任务：** P1-INT-001
- **具体输出：**
  - GitHub Actions workflow：typecheck + lint + test + build
  - Supabase CLI 集成（db lint + test db）
  - PR 门禁：所有检查通过才允许合并
- **验收标准：**
  - 推送 PR 后自动触发 CI
  - TypeScript/Lint/Test/Build 任何一项失败时 CI 标红
  - Supabase 相关测试在 CI 中执行
- **测试要求：** CI 自身通过（即 workflow 可正常执行）
- **风险等级：** P1

---

#### P1-INT-005：配置 Vercel 部署

- **Owner Agent：** integration-engineer
- **输入文件：** 无特定契约依赖
- **允许修改路径：** `vercel.json`、`docs/handoffs/**`
- **依赖任务：** P1-INT-001
- **具体输出：**
  - `vercel.json` 配置（如果框架自动检测不足）
  - 环境变量映射到 Vercel 项目设置
  - 预览部署配置（PR 自动部署预览）
- **验收标准：**
  - 推送到 main 分支自动部署到生产
  - PR 自动创建预览部署
  - 预览部署 URL 可访问
- **测试要求：** 部署后可访问首页
- **风险等级：** P1

---

#### P1-TEST-001：编写 workspace 隔离的 Vitest 单元测试

- **Owner Agent：** test-engineer
- **输入文件：** `docs/contracts/domain-model.md`、`docs/contracts/rls-contract.md`
- **允许修改路径：** `tests/**`、`vitest.config.*`、`src/**（仅 .test.ts/.test.tsx 文件）`、`docs/handoffs/**`
- **依赖任务：** P1-DB-001、P1-ENT-001
- **具体输出：**
  - Zod Schema 单元测试
  - has_feature 权限判断测试（active/expired/revoked）
  - entitlement 过期判断测试
  - workspace 隔离逻辑测试
  - 隐私脱敏函数测试
  - 环境变量 Schema 测试
- **验收标准：**
  - 所有测试通过
  - 测试覆盖成功、未认证、无权限、过期、边界值等场景
- **测试要求：** 自身必须通过
- **风险等级：** P1

---

#### P1-TEST-002：编写 Supabase RLS 测试（pgTAP）

- **Owner Agent：** test-engineer
- **输入文件：** `docs/contracts/rls-contract.md`
- **允许修改路径：** `supabase/tests/**`、`docs/handoffs/**`
- **依赖任务：** P1-DB-003、P1-DB-002
- **具体输出：**
  - pgTAP 测试：每张业务表的 RLS Policy 验证
  - 覆盖场景：已登录 + 同 workspace、已登录 + 不同 workspace、未登录
  - 覆盖操作：SELECT、INSERT、UPDATE、DELETE
  - 共享视图脱敏验证
  - content_factory RLS 拒绝验证
  - 系统管理员 RLS 权限验证
- **验收标准：**
  - `supabase test db` 全部通过
  - 用户 A 读取用户 B 私有数据的所有尝试均被拒绝
  - 普通用户直接读取内容表被拒绝
- **测试要求：** 自身必须通过
- **风险等级：** P0（数据安全核心）

---

#### P1-TEST-003：编写 Auth 与 Entitlement 集成测试

- **Owner Agent：** test-engineer
- **输入文件：** `docs/contracts/api-contract.md`
- **允许修改路径：** `tests/**`、`vitest.config.*`、`src/**（仅 .test.ts/.test.tsx 文件）`、`docs/handoffs/**`
- **依赖任务：** P1-AUTH-001、P1-AUTH-002、P1-ENT-001、P1-ADMIN-003
- **具体输出：**
  - 注册流程测试（成功、重复邮箱、无效输入）
  - 登录流程测试（成功、无效密码、禁用账号）
  - 邀请链接测试（有效邀请、过期邀请、超次数邀请）
  - Feature 授权测试（授予、撤销、过期、管理员权限检查）
  - 未登录重定向测试
- **验收标准：**
  - 所有测试通过
  - 覆盖正常路径和异常路径
- **测试要求：** 自身必须通过
- **风险等级：** P1

---

### Phase 2 任务详情

---

#### P2-PROP-001：实现房源 CRUD（列表、详情、创建、编辑、软删除）

- **Owner Agent：** property-crm-engineer
- **输入文件：** `docs/contracts/api-contract.md`、`docs/contracts/domain-model.md`
- **允许修改路径：** `src/features/properties/**`、`src/app/(dashboard)/properties/**`、`src/app/api/properties/**`、`docs/handoffs/**`
- **依赖任务：** P1-DB-001、P1-DB-003、P1-UI-001、P1-UI-002
- **具体输出：**
  - 房源列表页（卡片/表格双模式、按权限动态显示字段）
  - 房源详情页（Tab 切换：基本信息、图片视频、卖点不足、内容中心、匹配客户、操作记录、共享设置、营销复用授权）
  - 房源创建页（复杂表单，独立页面而非 Dialog）
  - 房源编辑页
  - 房源软删除（二次确认 Overlay）
  - 房源状态管理（draft/available/reserved/rented/offline/expired/deleted）
  - 私有数据隔离（property_private_details 独立读写）
- **验收标准：**
  - 房源 CRUD 完整可用
  - 移动端表单可单手操作
  - 软删除后房源默认列表不显示
  - 敏感字段默认折叠（锁图标 + "仅本门店可见"）
  - 房源状态变化写入事件/操作日志
  - 所有权限通过 workspace_id 校验
- **测试要求：** 集成测试覆盖 CRUD 正常/异常路径、软删除后不可见、跨 workspace 隔离
- **风险等级：** P1

---

#### P2-PROP-002：实现房源筛选与排序

- **Owner Agent：** property-crm-engineer
- **输入文件：** `docs/contracts/api-contract.md`
- **允许修改路径：** `src/features/properties/**`、`src/app/api/properties/**`、`docs/handoffs/**`
- **依赖任务：** P2-PROP-001
- **具体输出：**
  - 筛选条件（PRD 7.4 节完整列表：城市、区域、商圈、小区、租金范围、户型、面积、整租/合租、可入住时间、电梯、宠物、做饭、地铁、状态、是否共享、是否已生成内容）
  - 排序选项（最近更新、租金升降、可入住时间、最近生成内容、最近发布）
  - 筛选条件以 Chips 展示
  - 筛选使用 ResponsiveOverlay（移动端 Drawer、桌面端 Dialog）
  - 所有筛选条件可组合
  - 无结果时展示空状态
- **验收标准：**
  - 城市+区域+租金范围组合筛选结果正确
  - 排序切换即时生效
  - 筛选 Chips 可单独移除
  - 清除所有筛选恢复正常列表
- **测试要求：** 集成测试覆盖多条件组合筛选、排序、空结果
- **风险等级：** P2

---

#### P2-PROP-003：实现房源图片/媒体管理

- **Owner Agent：** property-crm-engineer
- **输入文件：** `docs/contracts/domain-model.md`
- **允许修改路径：** `src/features/properties/**`、`src/app/api/properties/**`、`docs/handoffs/**`
- **依赖任务：** P1-DB-004、P2-PROP-001
- **具体输出：**
  - 图片上传（相册/相机）
  - 上传前客户端压缩
  - 图片排序、设置封面图
  - 图片删除（软删除）
  - 图片懒加载
  - 视频限制大小和时长
  - 媒体类型标识（图片/视频）
  - AI 视觉分析状态展示（pending/analyzing/done/failed）
- **验收标准：**
  - 上传图片后即时显示
  - 封面图在列表卡片中展示
  - 删除图片后列表不显示
  - 其他 workspace 用户无法访问私有图片
- **测试要求：** 集成测试覆盖上传、排序、封面设置、软删除、跨 workspace 访问拒绝
- **风险等级：** P1

---

#### P2-CLIENT-001：实现客户 CRUD

- **Owner Agent：** property-crm-engineer
- **输入文件：** `docs/contracts/api-contract.md`、`docs/contracts/domain-model.md`
- **允许修改路径：** `src/features/clients/**`、`src/app/(dashboard)/clients/**`、`src/app/api/clients/**`、`docs/handoffs/**`
- **依赖任务：** P1-DB-001、P1-DB-003、P1-UI-001
- **具体输出：**
  - 客户列表页（卡片/表格双模式）
  - 客户详情页（需求摘要、联系方式、硬性条件、偏好条件、不能接受条件、来源内容、推荐房源、已发送房源、已看房源、沟通记录、待办、阶段变化记录）
  - 客户创建页
  - 客户编辑页
  - 客户阶段管理（new/qualified/properties_sent/viewing_scheduled/viewed/considering/closed_won/paused/lost/deleted）
  - 客户软删除
  - 阶段变化写入日志
  - 联系方式仅当前 workspace 可见
- **验收标准：**
  - 客户 CRUD 完整可用
  - 阶段变化可追溯
  - 客户可关联来源内容和房源
  - 超过设定时间未跟进在首页提醒
  - 联系方式（电话/微信）在共享场景下不可见
- **测试要求：** 集成测试覆盖 CRUD、阶段流转、跨 workspace 隔离、联系方式隐私
- **风险等级：** P1

---

#### P2-CLIENT-002：实现客户沟通记录（interactions）

- **Owner Agent：** property-crm-engineer
- **输入文件：** `docs/contracts/domain-model.md`
- **允许修改路径：** `src/features/clients/**`、`src/app/api/clients/**`、`docs/handoffs/**`
- **依赖任务：** P2-CLIENT-001
- **具体输出：**
  - 沟通记录新增（关联客户、房源、类型、摘要）
  - 客户详情页展示沟通时间线
  - 沟通后自动更新客户 last_interaction_at
  - 沟通类型枚举（电话、微信、带看、面谈等）
- **验收标准：**
  - 新增沟通后客户详情时间线更新
  - last_interaction_at 自动更新
  - 沟通记录仅同 workspace 可见
- **测试要求：** 集成测试覆盖新增沟通、时间线展示、权限隔离
- **风险等级：** P2

---

#### P2-MATCH-001：实现房客匹配引擎

- **Owner Agent：** property-crm-engineer
- **输入文件：** `docs/contracts/api-contract.md`、`docs/contracts/domain-model.md`
- **允许修改路径：** `src/features/matching/**`、`src/app/api/matches/**`、`docs/handoffs/**`
- **依赖任务：** P2-PROP-001、P2-CLIENT-001
- **具体输出：**
  - 规则匹配引擎：先判断硬性条件（must-pass），再计算偏好评分
  - 默认评分权重（预算30、区域20、户型15、入住时间15、通勤地铁10、特殊要求10）
  - 输出匹配分数、匹配等级、匹配原因、不匹配原因、需要确认信息、推荐下一步操作
  - 用户可手工调整权重
    - 记录匹配状态（active/dismissed/archived，见 ADR-005）；外展追踪（已发送/已带看）通过 interactions 实现
  - `POST /api/matches/calculate`：计算指定客户与所有房源的匹配
  - `GET /api/clients/:id/matches`：获取客户的匹配房源列表
  - `GET /api/properties/:id/matches`：获取房源的匹配客户列表
- **验收标准：**
  - 硬性条件不满足时不得标记为高匹配（如预算不够、不允许宠物）
  - 匹配原因必须可解释
  - 手工调整权重后重新计算匹配分数
    - 可通过 interactions 记录外展动作（已发送/已带看）；通过 match_status dismissed 标记不推荐
- **测试要求：** 单元测试覆盖匹配评分计算（各维度组合）、硬性条件过滤；集成测试覆盖完整匹配流程
- **风险等级：** P1

---

#### P2-MATCH-002：实现自然语言语义搜索

- **Owner Agent：** property-crm-engineer（搜索 UI 部分）+ ai-deepseek-engineer（搜索解析 API 在 Phase 3 实现，此处提供 UI 骨架与 API 调用）
- **输入文件：** `docs/contracts/api-contract.md`
- **允许修改路径：** `src/features/properties/**`、`src/app/(dashboard)/properties/**`、`docs/handoffs/**`
- **依赖任务：** P2-PROP-001
- **具体输出：**
  - 房源列表页搜索框（支持自然语言输入）
  - 搜索结果显示已识别筛选条件
  - 用户可一键删除某个条件
  - 无结果时推荐放宽条件
  - 不支持的条件提示用户
  - 搜索 UI 调用 `/api/ai/parse-property-search`（后端在 Phase 3 实现）
- **验收标准：**
  - 搜索框接受自然语言输入
  - 解析后的筛选条件可视化展示
  - 无结果时显示建议
- **测试要求：** 集成测试覆盖自然语言输入、条件展示、移除条件、空结果
- **风险等级：** P2（搜索 UI 在 Phase 2，AI 解析在 Phase 3）

---

#### P2-TASK-001：实现待办任务 CRUD

- **Owner Agent：** property-crm-engineer
- **输入文件：** `docs/contracts/domain-model.md`
- **允许修改路径：** `src/features/tasks/**`、`src/app/(dashboard)/tasks/**`、`src/app/api/tasks/**`、`docs/handoffs/**`
- **依赖任务：** P1-DB-001、P2-PROP-001、P2-CLIENT-001
- **具体输出：**
  - 任务列表页
  - 任务创建（关联客户/房源/内容项目/合作请求）
  - 任务类型：联系客户、发送房源、确认带看、跟进带看、更新房源状态、联系房东、发布内容、更新内容数据、跟进合作请求
  - 任务状态：todo/in_progress/done/cancelled
  - 快捷延期（一天/三天）
  - 完成任务记录完成时间
- **验收标准：**
  - 可关联客户、房源、内容或合作请求
  - 首页展示今日到期和逾期任务
  - 任务完成后记录完成时间
  - 快捷延期正确计算新截止时间
- **测试要求：** 集成测试覆盖创建、状态变更、延期、关联实体
- **风险等级：** P2

---

#### P2-SHARE-001：实现合作共享库（is_shared 配置与脱敏共享）

- **Owner Agent：** property-crm-engineer
- **输入文件：** `docs/contracts/api-contract.md`、`docs/contracts/rls-contract.md`
- **允许修改路径：** `src/features/collaboration/**`、`src/app/(dashboard)/properties/shared/**`、`src/app/api/shared-properties/**`、`docs/handoffs/**`
- **依赖任务：** P2-PROP-001、P1-DB-003
- **具体输出：**
  - 房源共享配置（is_shared、allow_marketing_reuse 独立开关）
  - 共享预览（脱敏后效果模拟展示）
  - 共享字段可配置：是否显示小区名、大致位置、完整图片、租金、分成方式、合作备注、有效期
  - `POST /api/properties/:id/share`：上架共享库
  - `DELETE /api/properties/:id/share`：下架
  - `GET /api/shared-properties`：浏览共享库（通过专用脱敏视图/RPC）
  - 脱敏字段默认隐藏：房东姓名、电话、微信、客户信息、具体门牌号、内部备注、原始聊天记录、钥匙位置
  - 共享有效期控制
- **验收标准：**
  - 未共享房源不出现在共享库
  - 外部用户永远无法读取敏感字段（通过专用视图而非客户端过滤）
  - 用户可随时下架
  - 下架后外部用户不可继续访问该房源
  - 开启共享不自动开启营销复用（两个独立开关）
  - 共享操作写入审计日志
- **测试要求：** 集成测试覆盖上架、下架、脱敏字段验证、权限过期、跨 workspace 隔离；RLS 测试验证视图不暴露敏感字段
- **风险等级：** P0（数据泄露风险）

---

#### P2-SHARE-002：实现合作请求

- **Owner Agent：** property-crm-engineer
- **输入文件：** `docs/contracts/api-contract.md`
- **允许修改路径：** `src/features/collaboration/**`、`src/app/(dashboard)/collaboration-requests/**`、`src/app/api/collaboration-requests/**`、`docs/handoffs/**`
- **依赖任务：** P2-SHARE-001
- **具体输出：**
  - 合作请求列表页（发送/接收）
  - 发起合作请求（关联共享房源 + 留言）
  - 合作请求状态管理：pending/accepted/rejected/cancelled/completed
  - `POST /api/shared-properties/:id/contact`：发起联系
  - 合作请求通知（站内消息）
- **验收标准：**
  - 外部用户可对共享房源发起合作请求
  - 房源所有者可接受/拒绝请求
  - 合作请求状态流转正确
  - 合作联系行为写入日志
- **测试要求：** 集成测试覆盖请求生命周期、跨 workspace 交互、状态流转
- **风险等级：** P1

---

#### P2-RLS-001：补充 Phase 2 业务表 RLS Policy

- **Owner Agent：** data-security-engineer
- **输入文件：** `docs/contracts/rls-contract.md`
- **允许修改路径：** `supabase/migrations/**`、`docs/handoffs/**`
- **依赖任务：** P1-DB-003、P2-PROP-001、P2-CLIENT-001、P2-SHARE-001
- **具体输出：**
  - properties 表完整 RLS（CRUD 均需 workspace 成员验证）
  - property_private_details 表 RLS（仅 workspace 成员可读，外部不可见）
  - clients 表完整 RLS
  - interactions 表 RLS
  - property_matches 表 RLS
  - tasks 表 RLS
  - collaboration_requests 表 RLS（请求方和接收方均可查看）
  - 共享房源脱敏视图/RPC（外部用户仅读 is_shared=true 的脱敏数据）
  - 所有策略通过 EXPLAIN 验证索引命中
- **验收标准：**
  - 用户 A 读取用户 B 私有 property_private_details 被拒绝
  - 外部用户读取共享房源时不包含敏感字段
  - 所有 RLS 策略无递归调用
- **测试要求：** pgTAP 测试覆盖所有策略
- **风险等级：** P0

---

#### P2-TEST-001：编写 Property CRUD 与搜索测试

- **Owner Agent：** test-engineer
- **输入文件：** `docs/contracts/api-contract.md`
- **允许修改路径：** `tests/**`、`src/**（仅 .test 文件）`、`docs/handoffs/**`
- **依赖任务：** P2-PROP-001、P2-PROP-002、P2-PROP-003
- **具体输出：**
  - 房源 CRUD 集成测试
  - 筛选与排序测试
  - 软删除后不可见测试
  - 图片上传与删除测试
  - 跨 workspace 隔离测试
- **验收标准：** 所有测试通过
- **测试要求：** 自身通过
- **风险等级：** P1

---

#### P2-TEST-002：编写 Client CRUD 与匹配测试

- **Owner Agent：** test-engineer
- **输入文件：** `docs/contracts/api-contract.md`
- **允许修改路径：** `tests/**`、`src/**（仅 .test 文件）`、`docs/handoffs/**`
- **依赖任务：** P2-CLIENT-001、P2-CLIENT-002、P2-MATCH-001
- **具体输出：**
  - 客户 CRUD 集成测试
  - 客户阶段管理测试
  - 匹配引擎单元测试（各类组合）
  - 匹配流程集成测试
  - 跨 workspace 隔离测试
- **验收标准：** 所有测试通过
- **测试要求：** 自身通过
- **风险等级：** P1

---

#### P2-TEST-003：编写共享库与 RLS 测试

- **Owner Agent：** test-engineer
- **输入文件：** `docs/contracts/rls-contract.md`
- **允许修改路径：** `supabase/tests/**`、`tests/**`、`docs/handoffs/**`
- **依赖任务：** P2-SHARE-001、P2-SHARE-002、P2-RLS-001
- **具体输出：**
  - 共享房源脱敏测试（外部用户不可见敏感字段）
  - 合作请求流程测试
  - is_shared 与 allow_marketing_reuse 独立性测试
  - 下架后不可访问测试
- **验收标准：** 所有测试通过，脱敏验证 P0 级
- **测试要求：** 自身通过
- **风险等级：** P0

---

### Phase 3 任务详情

---

#### P3-STT-001：实现 STT 语音转文本 Route Handler

- **Owner Agent：** ai-deepseek-engineer
- **输入文件：** `docs/contracts/ai-contract.md`、`docs/contracts/api-contract.md`
- **允许修改路径：** `src/app/api/ai/transcribe/**`、`src/lib/ai/**`、`docs/handoffs/**`
- **依赖任务：** P1-DB-001、P1-INT-003（环境变量）
- **具体输出：**
  - `POST /api/ai/transcribe` Route Handler（multipart/form-data，非 Server Action）
  - 请求验证：登录、功能权限、MIME 类型（audio/webm, audio/mp4, audio/mpeg, audio/wav, audio/x-m4a）、文件大小（max 10 MB）
  - 时长验证：超过 MAX_AUDIO_DURATION_SECONDS（60 秒）返回 422
  - TranscriptionProvider 接口实现
  - STT Provider 适配层（独立 STT 服务调用）
  - 服务端仅以 File/Readable Stream 转发，不转 Base64
  - 音频默认不持久化，临时对象请求完成后删除
  - 返回纯文本与可选分段
  - 服务端超时与 AbortController
  - Node.js runtime
- **验收标准：**
  - 有效音频文件返回转写文本
  - 超过 60 秒音频返回 422
  - 超过大小限制返回 413
  - 非法 MIME 返回 400
  - STT API Key 不进入客户端
  - 音频不持久化到业务数据库
  - 未登录返回 401
- **测试要求：** 集成测试覆盖成功转写、超时拒绝、大小拒绝、MIME 拒绝、未登录拒绝、STT Provider Mock
- **风险等级：** P1

---

#### P3-AI-001：实现 DeepSeekTextProvider 基础实现

- **Owner Agent：** ai-deepseek-engineer
- **输入文件：** `docs/contracts/ai-contract.md`
- **允许修改路径：** `src/lib/ai/**`、`docs/handoffs/**`
- **依赖任务：** P1-INT-003
- **具体输出：**
  - `DeepSeekTextProvider` 类实现（extractProperty, extractClient, parsePropertySearch, generateContent 方法）
  - DeepSeek API 调用（使用 DeepSeek 官方 API 或受控推理端点）
  - 隐私预处理（调用前移除敏感字段）
  - JSON Schema 请求约束
  - Structured Output：返回 JSON -> Zod 校验
  - 统一 Usage 对象（input_tokens, output_tokens, estimated_cost_usd）
  - 统一错误类型（timeout, rate_limit, invalid_json, provider_error）
  - 超时处理（DEEPSEEK_REQUEST_TIMEOUT_MS，默认 45000ms）
  - 失败重试（最多 1 次，重试使用备用 DeepSeek 模型）
  - Provider 定义为 `deepseek`
- **验收标准：**
  - 所有方法返回结构化数据
  - 不向 DeepSeek 发送敏感字段（owner_phone, client_phone, exact_address 等）
  - 超时后产生明确错误
  - 重试切换至备用 DeepSeek 模型
  - 模型名称不硬编码在业务代码中
- **测试要求：** 单元测试覆盖 Mock DeepSeek 响应的正常/异常路径，隐私预处理验证
- **风险等级：** P0（AI 核心）

---

#### P3-AI-002：实现房源解析接口

- **Owner Agent：** ai-deepseek-engineer
- **输入文件：** `docs/contracts/ai-contract.md`、`docs/contracts/api-contract.md`
- **允许修改路径：** `src/app/api/ai/extract-property/**`、`src/lib/ai/**`、`docs/handoffs/**`
- **依赖任务：** P3-AI-001
- **具体输出：**
  - `POST /api/ai/extract-property` Route Handler
  - 输入验证（text 字段、sourceType、requestId）
  - 先验证登录、基础智能权限
  - 调用 DeepSeekTextProvider.extractProperty()
  - 输出结构化字段（PRD 7.3 节完整字段列表）
  - 输出 missingFields、uncertainFields
  - 原始文本保留
  - AI 输出不入库，仅返回给用户确认
- **验收标准：**
  - 粘贴微信聊天记录后返回结构化房源字段
  - missingFields 正确标识缺失项
  - uncertainFields 正确标识不确定项
  - 未登录返回 401
  - 隐私字段未出现在 DeepSeek 请求中
  - AI 调用失败时返回错误但不丢失原始文本
- **测试要求：** 集成测试覆盖正常解析、缺失字段、AI 失败回退
- **风险等级：** P1

---

#### P3-AI-003：实现客户解析接口

- **Owner Agent：** ai-deepseek-engineer
- **输入文件：** `docs/contracts/ai-contract.md`
- **允许修改路径：** `src/app/api/ai/extract-client/**`、`src/lib/ai/**`、`docs/handoffs/**`
- **依赖任务：** P3-AI-001
- **具体输出：**
  - `POST /api/ai/extract-client` Route Handler
  - 客户结构化字段输出（PRD 7.3 节完整列表）
  - 与房源解析相同级别的隐私处理与错误处理
- **验收标准：**
  - 粘贴聊天记录后返回结构化客户字段
  - 预算、区域、户型、入住时间等正确提取
  - hard_requirements 与 soft_preferences 正确区分
- **测试要求：** 集成测试覆盖正常解析、隐私预处理
- **风险等级：** P1

---

#### P3-AI-004：实现自然语言搜索解析接口

- **Owner Agent：** ai-deepseek-engineer
- **输入文件：** `docs/contracts/ai-contract.md`、`docs/contracts/api-contract.md`
- **允许修改路径：** `src/app/api/ai/parse-property-search/**`、`src/lib/ai/**`、`docs/handoffs/**`
- **依赖任务：** P3-AI-001
- **具体输出：**
  - `POST /api/ai/parse-property-search` Route Handler
  - 输入：自然语言搜索字符串
  - 输出：结构化搜索 JSON（districts, monthly_rent_max, bedrooms, pets_allowed, available_before, sort_by, sort_order）
  - 仅允许白名单字段和操作符
  - 禁止模型返回 SQL
  - 服务端根据搜索 JSON 构造 SQL 查询
  - 所有查询附带 workspace 过滤
- **验收标准：**
  - "3500以内、天河、能养猫的一房"正确解析
  - "下周能入住，近三号线，独立阳台"正确解析
  - 不支持的字段不进入最终查询
  - 不支持的条件提示用户
  - 搜索结果附带已识别筛选条件
- **测试要求：** 单元测试覆盖搜索 JSON 解析、白名单验证；集成测试覆盖端到端搜索
- **风险等级：** P1

---

#### P3-AI-005：实现 DeepSeekVisionProvider

- **Owner Agent：** ai-deepseek-engineer
- **输入文件：** `docs/contracts/ai-contract.md`
- **允许修改路径：** `src/lib/ai/**`、`docs/handoffs/**`
- **依赖任务：** P1-INT-003
- **具体输出：**
  - `DeepSeekVisionProvider` 接口实现
  - 调用 DeepSeek-VL 部署 endpoint（独立 GPU 推理服务）
  - 支持 imageUrls 数组（内部使用）
  - 公共 API 接收 propertyMediaIds，服务端生成短期签名 URL
  - SSRF 防护（禁止内网 URL、file://、环回地址、云元数据地址）
  - 图片压缩（生成适合推理的副本）
  - 单次默认最多 8 张图片
  - 返回结构化输出（scene_type, styles, visible_features, condition, lighting, appliances, confidence, evidence_media_ids, uncertain_labels）
  - Zod 校验视觉输出
  - 移除不必要 EXIF 元数据
- **验收标准：**
  - 调用 DeepSeek-VL endpoint 返回视觉标签
  - 单图输出 ai_labels（含置信度、证据媒体 ID、不确定标签）
  - 不接受任意客户端提交 URL
  - 视觉端点不得部署在 Vercel Serverless Function 内
  - 图片压缩后质量可接受且推理可用
- **测试要求：** 集成测试覆盖 Mock DeepSeek-VL 响应的正常/异常路径、SSRF 防护
- **风险等级：** P0（视觉是内容生成的关键输入）

---

#### P3-AI-006：实现房源图片视觉分析接口

- **Owner Agent：** ai-deepseek-engineer
- **输入文件：** `docs/contracts/ai-contract.md`、`docs/contracts/api-contract.md`
- **允许修改路径：** `src/app/api/ai/analyze-property-images/**`、`src/lib/ai/**`、`src/features/ai-runtime/**`、`docs/handoffs/**`
- **依赖任务：** P3-AI-005、P2-PROP-003
- **具体输出：**
  - `POST /api/ai/analyze-property-images` Route Handler
  - 输入：propertyId, propertyMediaIds[], requestId
  - 服务端校验房源与媒体访问权限
  - 生成短期签名 URL
  - 调用 DeepSeekVisionProvider
  - 返回单图标签（mediaResults）、整套视觉摘要（visualSummary）、事实交叉校验（factChecks）
  - 保存 ai_labels 到 property_media
  - 保存 visual_summary 和 visual_fact_flags 到 properties
  - 异步处理支持（处理中状态）
- **验收标准：**
  - 上传多张图片后返回结构化标签
  - visualSummary 包含"不足以判断"的边界说明
  - 不得把未拍摄空间推断为不存在或状态良好
  - 未授权用户不能分析其他 workspace 的媒体
- **测试要求：** 集成测试覆盖正常分析、权限校验、异步状态、图片数量限制
- **风险等级：** P1

---

#### P3-AI-007：实现文字与图片事实交叉校验

- **Owner Agent：** ai-deepseek-engineer
- **输入文件：** `docs/contracts/ai-contract.md`
- **允许修改路径：** `src/lib/ai/**`、`src/features/ai-runtime/**`、`docs/handoffs/**`
- **依赖任务：** P3-AI-005、P3-AI-006
- **具体输出：**
  - 交叉校验逻辑：文字解析结果 vs 视觉事实
  - 输出 visual_fact_flags（confirmed_visual_support, not_verified_by_images, possible_conflict, insufficient_evidence）
  - 校验规则：
    - 图片中未出现某物 -> "图片未验证"，不判定不存在
    - 图片存在明确反证 -> "疑似冲突"
    - 主观标签附带置信度
  - 可视化确认界面（使用 ResponsiveOverlay）
    - 关键字段卡片化展示
    - 不确定字段黄色标识
    - 疑似冲突橙色标识
    - 高风险事实错误红色标识
    - 缺失字段灰色提示
    - 敏感字段锁图标
    - 展示文字来源与图片证据缩略图
  - 用户可接受、修改或忽略单条视觉建议
- **验收标准：**
  - 文字写"有阳台"但图片未展示：标记"图片未验证：建议补充阳台照片"
  - 文字写"开放式厨房"但图片明确显示封闭门体：标记"疑似冲突"
  - 图片未展示某特征不等同于反证
  - 用户确认界面正确展示各状态的颜色和图标
- **测试要求：** 单元测试覆盖各校验场景、视觉标签与文字交叉比对逻辑
- **风险等级：** P1

---

#### P3-AI-008：实现内容生成接口

- **Owner Agent：** ai-deepseek-engineer
- **输入文件：** `docs/contracts/ai-contract.md`、`docs/contracts/api-contract.md`、`docs/contracts/rls-contract.md`
- **允许修改路径：** `src/app/api/ai/generate-content/**`、`src/features/content-generation/**`、`src/lib/ai/**`、`docs/handoffs/**`
- **依赖任务：** P3-AI-001、P3-AI-014（quota RPC）、P3-AI-010（compliance）
- **具体输出：**
  - `POST /api/ai/generate-content` Route Handler
  - 三层权限检查：前端隐藏、服务端 has_feature('content_factory')、RLS 拒绝
  - 房源访问权限：workspace 自己的房源 OR (is_shared=true AND allow_marketing_reuse=true)
  - 配额与成本原子预占（调用前 reserve_ai_quota）
  - idempotency_key 支持（请求头或请求体）
  - 调用 DeepSeekTextProvider.generateContent()
  - Prompt 包含：已确认结构化字段、visual_summary、已确认 ai_labels、证据媒体 ID、缺失项、未解决冲突
  - 内容输出按平台区分：小红书（title_options, cover_text, hook, body...）、抖音（hook_options, cover_text, full_voiceover, shots...）、朋友圈（copy_options, nine_grid_suggestion, short_cta...）
  - 事实校验：facts_used 映射到输入字段
  - 合规预检（调用 src/lib/compliance/check.ts）
  - 存在 block 级风险时 copyAllowed=false
  - 成功调用后结算实际 Token Usage
  - 所有内容生成仅使用 DeepSeek 文本模型
- **验收标准：**
  - 指定内容用户可生成小红书/抖音/朋友圈内容
  - 未授权用户调用返回 403
  - 超出配额返回 429
  - idempotency_key 重复请求不额外扣减
  - 存在 block 级合规风险时 copyAllowed=false
  - 内容中不包含未确认的视觉标签
  - 未授权营销复用的房源不能用于生成内容
- **测试要求：** 集成测试覆盖三种平台生成、权限拒绝、配额拒绝、合规拒绝、事实来源验证、idempotency
- **风险等级：** P0（内容工厂核心 + 安全）

---

#### P3-AI-009：实现内容事实校验

- **Owner Agent：** ai-deepseek-engineer
- **输入文件：** `docs/contracts/ai-contract.md`
- **允许修改路径：** `src/lib/ai/**`、`src/features/content-generation/**`、`docs/handoffs/**`
- **依赖任务：** P3-AI-008
- **具体输出：**
  - 服务端事实校验逻辑：输出中的 facts_used 和 visual_facts_used 必须能映射到已确认数据
  - 虚构事实检测：标记 risk_flag
  - requires_fact_review = true 时禁止进入可复制状态
  - 高风险事实冲突时内容仍可生成草稿但 require_fact_review=true
  - 事实安全分级（已确认事实、已确认视觉事实、主观判断、未确认信息）
- **验收标准：**
  - 输出包含不存在的事实时标记 risk_flag
  - requires_fact_review=true 时禁用一键复制
  - 内容显示文字与视觉事实来源
- **测试要求：** 单元测试覆盖事实映射、虚构检测
- **风险等级：** P1

---

#### P3-AI-010：实现合规预检模块（src/lib/compliance/check.ts）

- **Owner Agent：** ai-deepseek-engineer
- **输入文件：** `docs/contracts/ai-contract.md`
- **允许修改路径：** `src/lib/compliance/**`、`src/features/compliance/**`、`docs/handoffs/**`
- **依赖任务：** P1-DB-001（compliance_terms 表）
- **具体输出：**
  - `src/lib/compliance/check.ts` 合规扫描模块
  - 风险词库匹配（极限绝对化、投资承诺、教育属性、稀缺催促、价格资格）
  - 三级严重级别处理：
    - block：必须删除或修改
    - review：允许用户填写确认理由后继续
    - highlight：仅高亮提示
  - 扫描结果持久化到 content_versions.compliance_status 与 compliance_flags
  - 合规处置写入 compliance_review_logs
  - copyAllowed 计算（存在未解决 block -> false）
- **验收标准：**
  - 内容含"最""第一"等 block 词时 copyAllowed = false
  - block 级别命中时一站式复制和"标记待发布"按钮禁用
  - review 级别命中时必须修改或填写确认理由
  - 所有处理动作写入审计日志
  - 复制拦截基于服务端状态，不能仅在前端判断
- **测试要求：** 单元测试覆盖所有词库类别、三级严重级别、copyAllowed 逻辑
- **风险等级：** P0（合规核心）

---

#### P3-AI-011：实现内容反馈（👍/👎）与纠错收集

- **Owner Agent：** ai-deepseek-engineer
- **输入文件：** `docs/contracts/api-contract.md`
- **允许修改路径：** `src/app/api/ai/feedback/**`、`src/features/ai-corrections/**`、`docs/handoffs/**`
- **依赖任务：** P3-AI-008
- **具体输出：**
  - `POST /api/ai/feedback` 接口
  - 👍/👎 前端 UI
  - 负反馈快捷原因（事实错误、语气不对、太罗嗦、格式错误、平台感不强、其他）
  - 反馈写入 ai_correction_logs
  - 关联 content_version_id、prompt_version、model_name
- **验收标准：**
  - 👍/👎 与负反馈原因持久化存储
  - 反馈可关联到具体内容版本和 Prompt 版本
  - 相同内容可多次反馈（覆盖上次）
- **测试要求：** 集成测试覆盖反馈提交、存储验证
- **风险等级：** P2

---

#### P3-AI-012：实现 AI 纠错 Diff 记录

- **Owner Agent：** ai-deepseek-engineer
- **输入文件：** `docs/contracts/ai-contract.md`
- **允许修改路径：** `src/features/ai-corrections/**`、`src/lib/ai/**`、`docs/handoffs/**`
- **依赖任务：** P3-AI-002、P3-AI-003
- **具体输出：**
  - 房源/客户保存时如带 requestId，服务端计算 Diff
  - Diff 逻辑：original_output -> user_confirmed_output -> JSON Diff（字段级）
  - 写入 ai_correction_logs（脱敏后写入）
  - 脱敏规则：不记录未脱敏的电话、微信和精确地址
  - 只记录发生变化的字段、原值、确认值、修改类型
  - 服务端计算 Diff，不信任客户端提交的差异
  - 手工创建（无 requestId）不触发 Diff
- **验收标准：**
  - AI 解析后修改字段 -> 保存时自动记录 Diff
  - Diff 日志不包含敏感字段（电话/微信/地址）
  - 手工创建的房源不产生 Diff 日志
  - Diff 服务端计算且不可篡改
- **测试要求：** 单元测试覆盖 Diff 计算、脱敏；集成测试覆盖完整 Diff 记录流程
- **风险等级：** P1

---

#### P3-AI-013：实现用户偏好学习

- **Owner Agent：** ai-deepseek-engineer
- **输入文件：** `docs/contracts/ai-contract.md`
- **允许修改路径：** `src/features/ai-preferences/**`、`src/app/api/me/ai-preferences/**`、`docs/handoffs/**`
- **依赖任务：** P3-AI-012
- **具体输出：**
  - 同类纠错达到 AI_PREFERENCE_MIN_EVIDENCE（默认 3）后自动生成偏好
  - 偏好以显式 Prompt Hint 注入
  - 不进行在线模型微调
  - 偏好包含置信度、证据数量、关闭开关
  - `GET /api/me/ai-preferences`：查看已学习偏好
  - `DELETE /api/me/ai-preferences/:id`：删除偏好
  - 设置页面可查看/删除偏好
  - 限制：不得学习或改写价格、面积、联系方式、精确地址等事实字段
  - 内容反馈可学习语气、长度、Emoji 密度、结构偏好和平台风格
- **验收标准：**
  - 同一用户至少 3 次同类纠错后生成偏好
  - 偏好以 Prompt Hint 形式注入
  - 用户可查看和删除偏好
  - 不能学习事实字段（价格、面积等）
  - 偏好有置信度和证据数量
- **测试要求：** 单元测试覆盖阈值触发、禁止学习事实字段、Prompt Hint 生成
- **风险等级：** P2

---

#### P3-AI-014：实现配额原子预占 RPC（reserve_ai_quota）

- **Owner Agent：** ai-deepseek-engineer（RPC 定义） + data-security-engineer（数据库 migration）
- **输入文件：** `docs/contracts/ai-contract.md`
- **允许修改路径：** `src/features/ai-quota/**`、`supabase/migrations/**`、`docs/handoffs/**`
- **依赖任务：** P1-DB-001、P1-DB-002
- **具体输出：**
  - `reserve_ai_quota()` 数据库 RPC
  - 单事务中完成：
    1. 校验 idempotency_key 是否已存在
    2. 锁定用户当日配额维度
    3. 统计有效预占和成功次数
    4. 统计成功成本与未过期预占成本
    5. 超过次数限制返回 limit_reason=request_limit
    6. 超过成本限制返回 limit_reason=cost_limit
    7. 未超过时插入 status=reserved
    8. 返回剩余次数和成本额度
  - 禁止"先 count 再 insert"的非原子方式
  - 预占过期机制（reservation_expires_at）
- **验收标准：**
  - 并发请求无法绕过每日配额上限
  - 相同 idempotency_key 不重复扣减
  - 超过成本熔断线返回 limit_reason=cost_limit
  - 预占到期后正确释放
- **测试要求：** 单元测试 + pgTAP 测试覆盖并发绕过、幂等键、成本熔断、预占过期
- **风险等级：** P0（配额绕过是安全红线）

---

#### P3-AI-015：实现成本跟踪与熔断

- **Owner Agent：** ai-deepseek-engineer
- **输入文件：** `docs/contracts/ai-contract.md`
- **允许修改路径：** `src/features/ai-quota/**`、`src/lib/ai/**`、`docs/handoffs/**`
- **依赖任务：** P3-AI-014
- **具体输出：**
  - 成本计算使用版本化 ai_model_pricing 配置（不硬编码）
  - ai_usage_logs 记录 estimated_cost_usd 与 reserved_estimated_cost_usd
  - 调用成功后用实际 Token Usage 结算修正
  - 每日成本熔断线默认 $10/用户（AI_DAILY_COST_LIMIT_USD）
  - 熔断时立即返回 429 blocked_by_cost_limit
  - 管理员可提高上限、临时解除或手动恢复（写入 audit_logs）
  - 视觉分析与文本生成成本分开统计
  - 成本统计按用户、功能、模型、状态分组
- **验收标准：**
  - 用户累计成本达到 $10 后请求返回 429
  - 管理员恢复后用户可继续使用
  - 恢复动作写入 audit_logs
  - 价格变更后历史成本按生效时价格估算
  - 并发请求无法瞬间突破熔断线（预占成本包含在内）
- **测试要求：** 集成测试覆盖熔断触发、恢复、并发绕过、价格版本化
- **风险等级：** P0（成本安全）

---

#### P3-AI-016：实现 DeepSeek 主备模型热切换

- **Owner Agent：** ai-deepseek-engineer
- **输入文件：** `docs/contracts/ai-contract.md`
- **允许修改路径：** `src/lib/ai/**`、`src/features/ai-runtime/**`、`docs/handoffs/**`
- **依赖任务：** P3-AI-001、P3-AI-005
- **具体输出：**
  - 健康检查：每个 capability 维护主/备模型和 endpoint
  - Circuit breaker：配置时间窗口内（默认 300s）连续 3 次 5xx/连接失败/超时 -> 打开
  - 自动切换至备用 DeepSeek 模型/endpoint
  - 4xx/Schema 失败/合规拒绝不计入供应商故障
  - 管理员可强制 primary/fallback/auto 模式（/admin/ai-models）
  - 恢复前健康探测
  - 文本主备均为 DeepSeek 文本模型，视觉主备均为 DeepSeek-VL
  - 所有切换/恢复写入 audit_logs
  - 配置不保存明文 API Key
- **验收标准：**
  - 连续 3 次 DeepSeek 主模型 5xx 后自动切换备用模型
  - 4xx 错误不触发切换
  - 管理员强制 primary 模式后不自动切换
  - 恢复前进行健康探测
  - 不允许配置非 DeepSeek 模型
- **测试要求：** 集成测试覆盖自动切换、4xx 不计入、管理员强制模式、恢复探测；Mock DeepSeek 主端点返回 5xx
- **风险等级：** P1

---

#### P3-AI-017：实现管理后台 AI 用量看板（/admin/ai-usage）

- **Owner Agent：** ai-deepseek-engineer
- **输入文件：** `docs/contracts/api-contract.md`
- **允许修改路径：** `src/app/admin/ai-usage/**`、`src/app/api/admin/ai-usage/**`、`docs/handoffs/**`
- **依赖任务：** P1-ADMIN-001、P3-AI-014、P3-AI-015
- **具体输出：**
  - `/admin/ai-usage` 页面展示：
    - 今日、近 7 日、近 30 日总 Token 与估算成本
    - 按用户、workspace、功能、模型、状态分组
    - 单用户平均生成成本
    - 成功、失败、合规拒绝、配额拒绝次数
    - 内容用户每日成本上限和当前剩余额度
    - 视觉分析与文本生成成本分开统计
  - `GET /api/admin/ai-usage` 接口（仅系统管理员）
  - `PATCH /api/admin/users/:userId/ai-limits`：设置用户级成本上限
  - `POST /api/admin/users/:userId/restore-ai-access`：恢复被熔断用户
- **验收标准：**
  - 管理员可查看平台级 AI 使用汇总
  - 成本统计区分视觉分析与文本生成
  - 管理员可调整用户成本上限
  - 普通用户无法访问
- **测试要求：** 集成测试覆盖数据展示、权限检查、用户级成本调整
- **风险等级：** P1

---

#### P3-AI-018：实现 AI 模型管理页面（/admin/ai-models）

- **Owner Agent：** ai-deepseek-engineer
- **输入文件：** `docs/contracts/api-contract.md`
- **允许修改路径：** `src/app/admin/ai-models/**`、`src/app/api/admin/ai-models/**`、`docs/handoffs/**`
- **依赖任务：** P1-ADMIN-001、P3-AI-016
- **具体输出：**
  - `/admin/ai-models` 页面：查看当前主/备模型配置
  - 强制模式切换（primary/fallback/auto）
  - Circuit breaker 状态显示
  - 重置 circuit breaker（POST /api/admin/ai-models/:capability/reset-circuit）
  - 文本和视觉配置分别管理
  - 配置不展示明文密钥
- **验收标准：**
  - 管理员查看当前文本/视觉主备模型和健康状态
  - 强制 primary 后不再自动切换
  - 重置 circuit breaker 后状态恢复
  - 不允许配置非 DeepSeek 模型
- **测试要求：** 集成测试覆盖模式切换、状态查看、权限检查
- **风险等级：** P2

---

#### P3-AI-019：实现 AI 纠错分析页面（/admin/ai-corrections）

- **Owner Agent：** ai-deepseek-engineer
- **输入文件：** `docs/contracts/api-contract.md`
- **允许修改路径：** `src/app/admin/ai-corrections/**`、`src/app/api/admin/ai-corrections/**`、`docs/handoffs/**`
- **依赖任务：** P1-ADMIN-001、P3-AI-012
- **具体输出：**
  - `/admin/ai-corrections` 页面展示：
    - 高频被修改字段
    - 原值到确认值的常见映射
    - 各功能负反馈率
    - 各 Prompt 版本的纠错率
    - 用户偏好学习生效情况
  - `GET /api/admin/ai-corrections` 接口
  - 不得展示明文联系方式或精确地址
- **验收标准：**
  - 管理员可查看纠错统计
  - 不展示脱敏前的联系方式
  - 普通用户无法访问
- **测试要求：** 集成测试覆盖数据展示、隐私脱敏、权限检查
- **风险等级：** P2

---

#### P3-AI-020：实现合规词库管理页面（/admin/compliance）

- **Owner Agent：** ai-deepseek-engineer
- **输入文件：** `docs/contracts/api-contract.md`
- **允许修改路径：** `src/app/admin/compliance/**`、`src/app/api/admin/compliance-terms/**`、`docs/handoffs/**`
- **依赖任务：** P1-ADMIN-001、P3-AI-010
- **具体输出：**
  - `/admin/compliance` 页面
  - 风险词库 CRUD（新增、编辑、停用）
  - 设置类别、严重级别、匹配方式
  - 设置 block/review/highlight
  - 查看命中次数和处理结果
  - 版本化词库（导入、回滚）
  - `GET/POST/PATCH /api/admin/compliance-terms` 接口
  - 普通用户不能修改全局词库
- **验收标准：**
  - 管理员可新增风险词
  - 修改 block/review/highlight 后立即生效
  - 词库版本回滚后生效
  - 普通用户无法修改词库
- **测试要求：** 集成测试覆盖词库 CRUD、版本回滚、权限检查
- **风险等级：** P1

---

#### P3-AI-021：实现内容 UI（生成、版本、发布、归因页面）

- **Owner Agent：** ai-deepseek-engineer
- **输入文件：** `docs/contracts/api-contract.md`
- **允许修改路径：** `src/app/(dashboard)/content/**`、`src/app/(dashboard)/publishing/**`、`src/features/content-generation/**`、`docs/handoffs/**`
- **依赖任务：** P3-AI-008、P1-UI-001、P1-UI-002
- **具体输出：**
  - `/content` 内容工作台（列表、新建）
  - `/content/new` 内容创建页（选择房源 -> 选择平台 -> 配置参数 -> 生成 -> 预览 -> 确认）
  - `/content/[contentId]` 内容详情（版本管理、编辑、复制、标记状态）
  - `/publishing` 发布记录页（列表、详情、数据录入）
  - 内容版本管理（保存多个版本、版本切换）
  - 一键复制模块或全部（受 copyAllowed 控制）
  - 内容状态管理（draft/ready/published/archived）
  - 👍/👎 反馈按钮与快捷原因
  - 事实来源展示（文字事实 + 视觉事实 + 证据 ID）
  - 风险提示与合规状态展示
  - 私信口令自动生成与编辑
  - 发布记录录入（平台、链接、数据：阅读/点赞/收藏/评论/私信/咨询/带看/成交）
  - 客户来源关联（选择来源内容、私信口令、首次咨询房源）
  - 归因展示（内容详情展示关联客户和成交）
- **验收标准：**
  - 仅 content_factory 用户可访问所有内容页面
  - 普通用户访问 /content 返回 403 或重定向
  - 内容生成流程完整（选择房源 -> 参数配置 -> 生成 -> 预览 -> 编辑 -> 保存）
  - 版本管理可用
  - 一键复制在合规 block 时禁用
  - 发布数据可录入和更新
  - 归因关联正确展示
- **测试要求：** 集成测试覆盖完整内容生成流程、权限拒绝、版本管理、发布归因
- **风险等级：** P1

---

#### P3-RLS-001：内容表 RLS Policy

- **Owner Agent：** data-security-engineer
- **输入文件：** `docs/contracts/rls-contract.md`
- **允许修改路径：** `supabase/migrations/**`、`docs/handoffs/**`
- **依赖任务：** P1-DB-003、P3-AI-008
- **具体输出：**
  - content_projects、content_versions、publishing_records RLS：需要 has_feature('content_factory') + is_workspace_member
  - content-assets Storage Policy：仅 content_factory 用户可写入
  - API 层验证营销复用权限（allow_marketing_reuse），RLS 不对营销复用进行数据库层拦截（由 rls-contract 明确为 API 层职责）
- **验收标准：**
  - 普通用户直接读取内容表被 RLS 拒绝
  - 未授权营销复用房源的内容生成被 API 层拒绝
- **测试要求：** pgTAP 测试
- **风险等级：** P0

---

#### P3-RLS-002：AI 数据表 RLS Policy

- **Owner Agent：** data-security-engineer
- **输入文件：** `docs/contracts/rls-contract.md`
- **允许修改路径：** `supabase/migrations/**`、`docs/handoffs/**`
- **依赖任务：** P1-DB-003、P3-AI-014
- **具体输出：**
  - ai_usage_logs RLS：用户只读自己，插入仅限服务端
  - ai_correction_logs RLS：用户只读自己
  - ai_user_preferences RLS：用户只读自己，可删除/停用
  - ai_model_pricing RLS：仅管理员可写
  - ai_runtime_config RLS：仅管理员可读写
  - ai_user_limits RLS：用户只读自己，仅管理员可写
  - compliance_terms RLS：所有人可读，仅管理员可写
  - compliance_review_logs RLS：需验证内容版本访问权限
- **验收标准：**
  - 用户 A 无法读取用户 B 的 AI 用量
  - 普通用户无法写入 ai_model_pricing
  - 合规日志写入需权限验证
- **测试要求：** pgTAP 测试
- **风险等级：** P0

---

#### P3-RLS-003：补充 Storage Bucket Policy

- **Owner Agent：** data-security-engineer
- **输入文件：** `docs/contracts/rls-contract.md`
- **允许修改路径：** `supabase/migrations/**`、`docs/handoffs/**`
- **依赖任务：** P1-DB-004、P3-AI-006
- **具体输出：**
  - content-assets Bucket 细化策略（仅 content_factory 用户可写）
  - 视觉分析图片短期 URL 生成与访问控制
  - 共享媒体 Bucket 的下架后撤销访问
- **验收标准：**
  - 下架共享房源后外部用户无法访问对应媒体
  - 临时签名 URL 过期后无法访问
  - 普通用户无法写入 content-assets
- **测试要求：** 集成测试 + pgTAP 测试
- **风险等级：** P0

---

#### P3-UI-001：实现录音 UI 组件与状态管理

- **Owner Agent：** mobile-ui-engineer
- **输入文件：** `docs/contracts/ai-contract.md`
- **允许修改路径：** `src/components/ui/**`（录音组件作为通用 UI 组件）、`src/hooks/**`、`docs/handoffs/**`
- **依赖任务：** P1-UI-001、P1-UI-005
- **具体输出：**
  - MediaRecorder 封装 Hook
  - 录音 UI 组件：录音按钮、波形显示、时长显示、剩余时间
  - 录音状态管理：recording/recorded/uploading/transcribing/transcribed/failed/cancelled
  - 60 秒自动停止并提示
  - 允许停止、重录、试听、删除
  - 上传进度显示
  - 转写结果文本编辑区域
  - 软键盘适配
- **验收标准：**
  - 录音 60 秒时自动停止
  - 各状态有明确的视觉反馈
  - 重录后丢弃上次录音
  - 移动端录音按钮在拇指可触达区域
- **测试要求：** 组件测试覆盖各状态渲染、60 秒自动停止
- **风险等级：** P1

---

#### P3-UI-002：实现 AI 确认卡片 UI

- **Owner Agent：** mobile-ui-engineer
- **输入文件：** `docs/contracts/ai-contract.md`
- **允许修改路径：** `src/components/ui/**`、`src/components/responsive/**`、`docs/handoffs/**`
- **依赖任务：** P1-UI-002（ResponsiveOverlay）
- **具体输出：**
  - AI 解析结果确认卡片（作为可复用 UI 组件）
  - 字段卡片化展示
  - 不确定字段黄色标识
  - 视觉疑似冲突橙色标识
  - 高风险事实错误红色标识
  - 缺失字段灰色提示
  - 敏感字段锁图标
  - 文字来源与图片证据缩略图
  - 用户可接受/修改/忽略单条建议
  - 保存前 Zod 校验状态展示
- **验收标准：**
  - 各颜色标识符合 PRD 定义
  - 修改字段后即时反馈
  - 确认后正确提交
- **测试要求：** 组件测试覆盖各字段状态渲染、用户交互
- **风险等级：** P1

---

#### P3-TEST-001：编写 STT 与 AI 提取集成测试

- **Owner Agent：** test-engineer
- **输入文件：** `docs/contracts/ai-contract.md`
- **允许修改路径：** `tests/**`、`src/**（仅 .test 文件）`、`docs/handoffs/**`
- **依赖任务：** P3-STT-001、P3-AI-002、P3-AI-003
- **具体输出：**
  - STT 转写集成测试（成功、超时、大小拒绝、MIME 拒绝）
  - 房源解析集成测试（正常、缺失字段、AI 失败回退）
  - 客户解析集成测试
  - 隐私预处理验证测试
  - 未登录/无权限拒绝测试
- **验收标准：** 所有测试通过
- **测试要求：** 自身通过
- **风险等级：** P1

---

#### P3-TEST-002：编写视觉分析集成测试

- **Owner Agent：** test-engineer
- **输入文件：** `docs/contracts/ai-contract.md`
- **允许修改路径：** `tests/**`、`src/**（仅 .test 文件）`、`docs/handoffs/**`
- **依赖任务：** P3-AI-005、P3-AI-006、P3-AI-007
- **具体输出：**
  - DeepSeekVisionProvider Mock 测试
  - 视觉分析接口测试（权限校验、图片数量限制、SSRF 防护）
  - 事实交叉校验单元测试
  - 视觉标签保存测试
- **验收标准：** 所有测试通过
- **测试要求：** 自身通过
- **风险等级：** P1

---

#### P3-TEST-003：编写内容生成与合规集成测试

- **Owner Agent：** test-engineer
- **输入文件：** `docs/contracts/ai-contract.md`
- **允许修改路径：** `tests/**`、`src/**（仅 .test 文件）`、`docs/handoffs/**`
- **依赖任务：** P3-AI-008、P3-AI-009、P3-AI-010
- **具体输出：**
  - 内容生成权限测试（content_factory 拒绝、营销复用拒绝）
  - 合规扫描单元测试（各词类、严重级别）
  - copyAllowed 逻辑测试
  - 内容生成完整流程测试
  - 事实校验测试
  - 内容反馈测试
- **验收标准：** 所有测试通过
- **测试要求：** 自身通过
- **风险等级：** P1

---

#### P3-TEST-004：编写配额与熔断测试

- **Owner Agent：** test-engineer
- **输入文件：** `docs/contracts/ai-contract.md`
- **允许修改路径：** `tests/**`、`supabase/tests/**`、`docs/handoffs/**`
- **依赖任务：** P3-AI-014、P3-AI-015
- **具体输出：**
  - reserve_ai_quota RPC 单元测试（pgTAP）：并发绕过、幂等键、成本熔断、预占过期
  - 配额原子预占集成测试
  - 成本熔断触发与恢复测试
  - idempotency_key 重复请求测试
  - 429 响应格式验证测试
- **验收标准：** 所有测试通过，并发请求无法绕过上限
- **测试要求：** 自身通过
- **风险等级：** P0

---

#### P3-TEST-005：编写热切换集成测试

- **Owner Agent：** test-engineer
- **输入文件：** `docs/contracts/ai-contract.md`
- **允许修改路径：** `tests/**`、`docs/handoffs/**`
- **依赖任务：** P3-AI-016
- **具体输出：**
  - Circuit breaker 单元测试
  - 自动切换集成测试（Mock DeepSeek 主模型 3 次 5xx -> 验证切换备用模型）
  - 4xx 不计入故障测试
  - 管理员强制模式测试
  - 恢复探测测试
- **验收标准：** 所有测试通过
- **测试要求：** 自身通过
- **风险等级：** P1

---

### Phase 4 任务详情

---

#### P4-REVIEW-001：quality-reviewer 全面安全与合规审查

- **Owner Agent：** quality-reviewer
- **输入文件：** 所有已冻结契约 + 所有已实现代码
- **允许修改路径：** 只读，无写权限
- **依赖任务：** Phase 1-3 全部完成
- **具体输出：**
  - 安全审查报告（数据泄露、越权、密钥泄露风险）
  - 合规审查报告（内容授权、隐私、RLS 完整性）
  - 架构一致性审查（对照冻结契约）
  - P0/P1/P2 问题清单
- **验收标准：**
  - 审查覆盖所有 19 个业务能力领域
  - 每个发现附带严重度、文件/行、复现、影响、建议
- **测试要求：** 不适用（审查任务）
- **风险等级：** P0

---

#### P4-REVIEW-002：solution-architect 架构契约一致性审查

- **Owner Agent：** solution-architect
- **输入文件：** 所有已冻结契约 + 所有已实现代码
- **允许修改路径：** 只读，无写权限
- **依赖任务：** Phase 1-3 全部完成
- **具体输出：**
  - API 契约一致性报告
  - 数据库 Schema 与 domain-model 一致性报告
  - RLS 实现与 rls-contract 一致性报告
  - AI 提供者接口实现与 ai-contract 一致性报告
  - 目录结构与 OWNERSHIP 一致性报告
- **验收标准：**
  - 每项不一致附带建议修复方案
- **测试要求：** 不适用（审查任务）
- **风险等级：** P0

---

#### P4-TEST-001：全量 E2E 测试执行

- **Owner Agent：** test-engineer
- **输入文件：** `docs/PRD.md` 第 16.3 节（25 条 E2E 场景）
- **允许修改路径：** `e2e/**`、`tests/**`、`playwright.config.*`、`docs/handoffs/**`
- **依赖任务：** Phase 1-3 全部完成
- **具体输出：**
  - Playwright E2E 测试套件（覆盖 PRD 第 16.3 节全部 25 条场景）
  - 测试结果报告
  - 失败用例详情
- **验收标准：**
  - 25 条 E2E 场景全部通过
  - 覆盖多用户注册、workspace 隔离、content_factory 授权/撤销、共享脱敏、配额并发、合规拦截、热切换
- **测试要求：** 自身通过 + 全部 E2E 用例通过
- **风险等级：** P0

---

#### P4-TEST-002：全量集成与单元测试最终执行

- **Owner Agent：** test-engineer
- **输入文件：** 所有测试资产
- **允许修改路径：** `tests/**`、`docs/handoffs/**`
- **依赖任务：** Phase 1-3 全部完成
- **具体输出：**
  - 全量 Vitest 单元测试执行报告
  - 全量集成测试执行报告
  - 全量 pgTAP RLS 测试执行报告
  - 覆盖率报告
  - 失败用例清单
- **验收标准：**
  - 所有单元测试通过
  - 所有集成测试通过
  - 所有 pgTAP 测试通过
  - 覆盖率达标
- **测试要求：** 自身通过
- **风险等级：** P0

---

#### P4-INT-001：最终构建验证与集成

- **Owner Agent：** integration-engineer
- **输入文件：** 全部代码
- **允许修改路径：** `package.json`、lockfile、`docs/handoffs/**`
- **依赖任务：** P4-REVIEW-001、P4-REVIEW-002、P4-TEST-001、P4-TEST-002（所有问题清零后）
- **具体输出：**
  - 执行 `npm run typecheck`
  - 执行 `npm run lint`
  - 执行 `npm run build`
  - 执行 `supabase db lint`
  - 执行 `supabase test db`
  - 依赖版本最终一致性检查
  - MANIFEST.txt 更新
- **验收标准：**
  - typecheck 无错误
  - lint 无错误
  - build 成功
  - supabase 检查通过
  - 无依赖冲突
- **测试要求：** 所有门禁命令通过
- **风险等级：** P0

---

#### P4-INT-002：Vercel 部署与配置

- **Owner Agent：** integration-engineer
- **输入文件：** `vercel.json`、环境变量模板
- **允许修改路径：** `vercel.json`、`docs/handoffs/**`
- **依赖任务：** P4-INT-001
- **具体输出：**
  - 生产环境部署
  - 环境变量配置（所有 PRD 第 17 节变量）
  - 自定义域名配置
  - SSL/TLS 配置
  - 部署后验证
- **验收标准：**
  - 生产 URL 可访问
  - 环境变量正确加载
  - HTTPS 生效
- **测试要求：** 冒烟测试
- **风险等级：** P1

---

#### P4-SMOKE-001：生产冒烟测试

- **Owner Agent：** 主 Agent
- **输入文件：** 部署完成的生产环境
- **允许修改路径：** 无（只读验证）
- **依赖任务：** P4-INT-002
- **具体输出：**
  - 注册 -> 登录 -> 创建 workspace -> 录入房源 -> 录入客户 -> 匹配 -> 共享 -> 合作请求 完整路径验证
  - content_factory 权限授予 -> 内容生成 -> 合规预检 -> 发布归因 完整路径验证
  - 权限拒绝验证（普通用户访问内容页、调用内容 API）
  - 移动端（375px）核心路径可用性验证
  - 冒烟测试报告
- **验收标准：**
  - 所有冒烟用例通过
  - 无 P0/P1 问题
- **测试要求：** 冒烟测试全部通过
- **风险等级：** P0

---

## 4. 任务依赖图

### Phase 间依赖

```text
Phase 0 (契约冻结)
    │
    ▼
Phase 1 (项目基础)
    │
    ├── data-security-engineer (DB + Auth + Admin)
    ├── mobile-ui-engineer (UI 壳)
    └── integration-engineer (项目配置)
    │
    ▼
Phase 2 (基础业务)
    │
    ├── property-crm-engineer (房源 + 客户 + 匹配 + 待办 + 共享)
    ├── data-security-engineer (补充 RLS)
    └── test-engineer (Phase 1-2 测试)
    │
    ▼
Phase 3 (AI 与内容)
    │
    ├── ai-deepseek-engineer (AI + 内容 + 合规 + 配额)
    ├── data-security-engineer (AI RLS)
    ├── mobile-ui-engineer (录音 UI + 确认卡片)
    └── test-engineer (Phase 3 测试)
    │
    ▼
Phase 4 (测试与发布)
    │
    ├── quality-reviewer (只读审查)
    ├── solution-architect (只读审查)
    ├── test-engineer (E2E + 全量测试)
    ├── integration-engineer (构建 + 部署)
    └── 主 Agent (冒烟测试)
```

### Phase 内并行策略

**Phase 1：** data-security-engineer、mobile-ui-engineer、integration-engineer 三者互不依赖对方的文件，可完全并行。data-security-engineer 内部的任务有顺序依赖（DB -> Auth -> Admin -> RLS）。

**Phase 2：** property-crm-engineer 与 data-security-engineer (RLS 补充) 并行；test-engineer 等待两者基本完成后开始。property-crm-engineer 内部：房源 -> 客户 -> 匹配 -> 共享（顺序依赖）。

**Phase 3：** ai-deepseek-engineer、data-security-engineer (AI RLS)、mobile-ui-engineer (录音 UI) 并行；test-engineer 在各自交付后开始。ai-deepseek-engineer 内部：STT + TextProvider -> VisionProvider -> 内容生成 -> 合规 -> 配额 -> 管理后台（顺序依赖）。

**Phase 4：** quality-reviewer、solution-architect、test-engineer 三者并行只读审查。修复后由 integration-engineer 与主 Agent 串行完成。

---

## 5. Assumptions & Backlog

### 5.1 Phase 1 实施假设

以下假设不影响冻结契约，但影响 Phase 1-4 的具体实施方式。详见 `docs/plans/phase1-assumptions.md`。

| ID | 假设 | 最迟确认 Phase |
|---|---|---|
| ASM-001 | DeepSeek 官方提供视觉 API（DeepSeek-VL） | Phase 3 开始前 |
| ASM-002 | STT Provider 默认选型为阿里云语音识别 | Phase 3 开始前 |
| ASM-003 | Supabase Cloud 作为部署平台 | Phase 1 Day 0 |
| ASM-004 | 视觉推理服务独立于 Vercel 部署 | Phase 4 部署前 |
| ASM-005 | INVITE_TOKEN_SECRET 轮换策略下沉 Phase 4 | Phase 4 |

### 5.2 Backlog

详见 `docs/plans/phase0-backlog.md`。

| ID | 事项 | 优先级 | 目标 Phase |
|---|---|---|---|
| BL-001 | SEO 与内容页面公开 | P3 | Future |
| BL-002 | 业务类型扩展到二手房买卖 | P3 | Phase 2+ |
| BL-003 | 视频分析支持 | P3 | Phase 3+ |
| BL-004 | 多语言支持 | P3 | Future |

---

## 6. Out of Scope

本实施计划明确不包括以下内容，这些在 `docs/PRD.md` 第 1.7 节已声明为非目标：

- 大型房产门户
- 房源自动抓取
- 非官方平台自动登录与自动群发私信
- 在线支付、房租托管、电子合同签署、财务记账
- 经纪人绩效和复杂组织管理（超过 10 人的门店管理不在 MVP）
- 自动房价评估
- AI 自动承诺价格、佣金或合同条款
- 视频自动剪辑、数字人、完整地图找房
- 非 DeepSeek 的 LLM/VLM（OpenAI、Anthropic、Gemini 等）
- 抖音/小红书 API 自动发布（仅生成内容，发布为手工记录）

---

## 7. Change Control

计划变更流程：

1. 任何 Agent 发现需要变更本计划时，必须提交书面的 Change Request 给主 Agent。
2. Change Request 必须包含：变更原因、影响范围（任务、依赖、Owner）、替代方案、回滚方案。
3. 主 Agent 评估影响后批准或拒绝。
4. 批准的变更：更新本文件版本号，记录变更历史，通知所有受影响 Agent。
5. 涉及已冻结契约的变更，还须先通过 ADR（`docs/decisions/ADR-XXX-*.md`）批准。
6. Phase 1 开始后，Phase 2-4 的任务分配可在不改变整体目标的情况下由主 Agent 微调，但任务 ID 和依赖关系变化必须记录。

---

## 变更历史

| 日期 | 版本 | 变更说明 |
|---|---|---|
| 2026-07-30 | 1.0 | 初始版本，覆盖 Phase 0–4 全部任务拆分 |
| 2026-07-30 | 1.1 | Open Questions 清零并转为实施假设（phase1-assumptions.md）与 Backlog（phase0-backlog.md） |
