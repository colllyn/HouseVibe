# HouseVibe 验收矩阵

- 文档名称：HouseVibe 验收矩阵
- 版本：1.0
- 状态：APPROVED FOR PHASE 1
- Owner：product-planner
- 依赖 PRD 版本：v1.3
- 最后更新日期：2026-07-30

---

## 适用范围

本验收矩阵覆盖 19 个业务能力领域，每条验收条件均可客观判定真伪。不接受"功能正常""体验良好"等不可验证表述。

每条验收条件包含以下列：

| 列 | 说明 |
|---|---|
| ID | 唯一标识，格式 AC-{CAPABILITY}-{NNN} |
| 验收条件 | 可验证的、具体的陈述 |
| PRD 章节 | 对应的 PRD 章节 |
| Phase | 该条件应在哪个 Phase 达到 |
| Owner Agent | 负责确保该条件通过验证的 Agent |
| 测试类型 | Unit / Integration / RLS / E2E |
| 阻塞发布 | 是 / 否 |

---

## 1. Auth 与 Workspace

| ID | 验收条件 | PRD | Phase | Owner | 测试类型 | 阻塞发布 |
|---|---|---|---|---|---|---|
| AC-AUTH-001 | 未登录用户访问 `/dashboard` 时被重定向到 `/login`，HTTP 302 | 7.1 | Phase 1 | data-security-engineer | Integration | 是 |
| AC-AUTH-002 | 未登录用户访问 `/admin` 时被重定向到 `/login`，HTTP 302 | 7.1 | Phase 1 | data-security-engineer | Integration | 是 |
| AC-AUTH-003 | 使用有效邮箱和密码注册成功后自动登录并跳转 onboarding 页面 | 7.1, 5.6 | Phase 1 | data-security-engineer | Integration | 是 |
| AC-AUTH-004 | 注册时使用已存在邮箱返回明确错误提示，不创建重复账号 | 7.1 | Phase 1 | data-security-engineer | Integration | 是 |
| AC-AUTH-005 | 使用正确凭证登录后进入 dashboard（若已完成 onboarding） | 7.1 | Phase 1 | data-security-engineer | Integration | 是 |
| AC-AUTH-006 | 使用错误密码登录时返回"邮箱或密码错误"，不说明具体是哪个字段错误 | 7.1 | Phase 1 | data-security-engineer | Integration | 是 |
| AC-AUTH-007 | 退出登录后清理本地会话，再次访问 `/dashboard` 被重定向到 `/login` | 7.1 | Phase 1 | data-security-engineer | Integration | 是 |
| AC-AUTH-008 | 被禁用的账号无法登录，显示账号已禁用的提示 | 7.1 | Phase 1 | data-security-engineer | Integration | 是 |
| AC-AUTH-009 | 首次登录用户自动创建独立 workspace 并进入 onboarding | 7.1, 5.6 | Phase 1 | data-security-engineer | Integration | 是 |
| AC-AUTH-010 | 首次登录用户未完成 onboarding 时访问任何 dashboard 页面均被重定向到 onboarding | 7.1 | Phase 1 | data-security-engineer | Integration | 是 |
| AC-AUTH-011 | 第二次登录的用户直接进入 dashboard，不再走 onboarding 流程 | 7.1 | Phase 1 | data-security-engineer | Integration | 是 |
| AC-AUTH-012 | 用户 A 注册后创建的 workspace 中，用户 A 为 workspace owner | 3.2 | Phase 1 | data-security-engineer | Integration | 是 |
| AC-AUTH-013 | 通过有效邀请链接注册的用户自动加入对应 workspace | 7.1, 5.6 | Phase 1 | data-security-engineer | Integration | 是 |
| AC-AUTH-014 | 已过期的邀请链接无法用于注册 | 7.1 | Phase 1 | data-security-engineer | Integration | 是 |
| AC-AUTH-015 | 超过最大使用次数的邀请链接无法继续使用 | 7.1 | Phase 1 | data-security-engineer | Integration | 是 |
| AC-AUTH-016 | 被撤销的邀请链接立即失效，使用该链接访问时返回错误提示 | 7.1 | Phase 1 | data-security-engineer | Integration | 是 |
| AC-AUTH-017 | 邀请 Token 在数据库中仅保存 Hash，无明文存储 | 8.2 | Phase 1 | data-security-engineer | RLS | 是 |
| AC-AUTH-018 | 登录接口在连续 5 次失败后触发临时锁定（至少 60 秒） | 13.2 | Phase 1 | data-security-engineer | Integration | 是 |
| AC-AUTH-019 | 用户可修改个人资料（姓名、手机号、城市），修改后即时生效 | 7.1 | Phase 1 | data-security-engineer | Integration | 否 |

---

## 2. Feature Entitlement

| ID | 验收条件 | PRD | Phase | Owner | 测试类型 | 阻塞发布 |
|---|---|---|---|---|---|---|
| AC-ENT-001 | 新注册用户默认不拥有 content_factory 权限 | 3.3 | Phase 1 | data-security-engineer | Integration | 是 |
| AC-ENT-002 | 新注册用户默认拥有 ai_data_extraction、semantic_search、property_matching、shared_property_pool 权限 | 3.3 | Phase 1 | data-security-engineer | Integration | 是 |
| AC-ENT-003 | 系统管理员可搜索用户并按 feature_key 授予权限 | 7.1, 5.6 | Phase 1 | data-security-engineer | Integration | 是 |
| AC-ENT-004 | 管理员授予 content_factory 时可设置 expires_at | 5.6 | Phase 1 | data-security-engineer | Integration | 是 |
| AC-ENT-005 | 授予 content_factory 后，被授权用户可立即看到内容导航入口 | 12.1, 5.6 | Phase 1 | data-security-engineer | Integration | 是 |
| AC-ENT-006 | 系统管理员撤销 content_factory 后，用户页面导航中"内容"入口立即消失 | 5.6 | Phase 2 | data-security-engineer | Integration | 是 |
| AC-ENT-007 | 撤销 content_factory 后，用户调用 POST /api/ai/generate-content 返回 403 | 5.6 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-ENT-008 | 撤销 content_factory 后，用户直接读取 content_projects 表被 RLS 拒绝 | 9.3 | Phase 3 | data-security-engineer | RLS | 是 |
| AC-ENT-009 | set expire_at=过去时间的授权，用户无法使用对应功能 | 5.6 | Phase 1 | data-security-engineer | Integration | 是 |
| AC-ENT-010 | 对同一用户同一 feature_key 不能有两条 status=active 的授权记录 | 8.2 | Phase 1 | data-security-engineer | Integration | 是 |
| AC-ENT-011 | 普通用户调用 POST /api/admin/feature-entitlements 返回 403 | 7.1 | Phase 1 | data-security-engineer | Integration | 是 |
| AC-ENT-012 | 普通用户不能通过任何方式给自己授予 content_factory | 9.7 | Phase 1 | data-security-engineer | RLS | 是 |
| AC-ENT-013 | 所有授予、撤销、修改操作均写入 audit_logs | 9.7 | Phase 1 | data-security-engineer | Integration | 是 |
| AC-ENT-014 | 管理员可查看授权记录列表（授权人、被授权人、feature、状态、时间） | 7.1 | Phase 1 | data-security-engineer | Integration | 否 |

---

## 3. 房源管理

| ID | 验收条件 | PRD | Phase | Owner | 测试类型 | 阻塞发布 |
|---|---|---|---|---|---|---|
| AC-PROP-001 | 用户可通过表单创建房源，提交后房源出现在列表中 | 7.4 | Phase 2 | property-crm-engineer | Integration | 是 |
| AC-PROP-002 | 房源列表默认以卡片形式在移动端展示，包含封面图、标题、小区、区域、月租、户型、面积、标签、入住时间、状态 | 7.4 | Phase 2 | property-crm-engineer | Integration | 是 |
| AC-PROP-003 | 房源详情页展示基本信息、图片视频、卖点不足、内容中心、匹配客户、操作记录、共享设置、营销复用授权 Tab | 7.4 | Phase 2 | property-crm-engineer | Integration | 是 |
| AC-PROP-004 | 编辑房源后保存，字段更新即时在详情页反映 | 7.4 | Phase 2 | property-crm-engineer | Integration | 是 |
| AC-PROP-005 | 软删除房源后，默认列表不显示该房源 | 7.4 | Phase 2 | property-crm-engineer | Integration | 是 |
| AC-PROP-006 | 软删除房源不删除关联的媒体文件、内容和记录 | 7.4 | Phase 2 | property-crm-engineer | Integration | 是 |
| AC-PROP-007 | 用户 A 无法通过 API 读取用户 B 的房源列表（返回空或仅自己房源） | 7.4 | Phase 2 | property-crm-engineer | Integration | 是 |
| AC-PROP-008 | 用户 A 直接访问用户 B 的房源详情 URL（如 /properties/{B's-property-id}）返回 404 或 403 | 7.4 | Phase 2 | property-crm-engineer | Integration | 是 |
| AC-PROP-009 | 房源状态变化写入操作日志（property 级别事件记录） | 7.4 | Phase 2 | property-crm-engineer | Integration | 否 |
| AC-PROP-010 | 筛选城市 + 区域 + 租金范围组合时，结果正确且不包含其他 workspace 房源 | 7.4 | Phase 2 | property-crm-engineer | Integration | 是 |
| AC-PROP-011 | 排序切换（如按租金升序）后列表顺序即时改变 | 7.4 | Phase 2 | property-crm-engineer | Integration | 否 |
| AC-PROP-012 | 筛选条件以 Chips 展示，可单独移除某个条件 | 12.4 | Phase 2 | property-crm-engineer | Integration | 否 |
| AC-PROP-013 | 无筛选结果时显示明确空状态和放宽条件建议 | 7.4 | Phase 2 | property-crm-engineer | Integration | 否 |
| AC-PROP-014 | 敏感字段（房东姓名、电话、微信、精确地址）在房源详情中默认折叠，显示锁图标 | 12.7 | Phase 2 | property-crm-engineer | Integration | 否 |
| AC-PROP-015 | 移动端房源创建表单所有字段可单手操作（关键字段在拇指触达区域） | 12.3 | Phase 2 | mobile-ui-engineer | E2E | 否 |
| AC-PROP-016 | 图片上传后即时显示，支持设置封面图和排序 | 7.4 | Phase 2 | property-crm-engineer | Integration | 否 |
| AC-PROP-017 | 上传图片前在客户端进行压缩 | 13.1 | Phase 2 | property-crm-engineer | Integration | 否 |
| AC-PROP-018 | 图片使用懒加载，仅可视区域内的图片发起请求 | 13.1 | Phase 2 | property-crm-engineer | Integration | 否 |
| AC-PROP-019 | 房源删除需要二次确认（移动端 Drawer，桌面端 Dialog） | 12.6 | Phase 2 | property-crm-engineer | Integration | 否 |
| AC-PROP-020 | 视频上传限制大小和时长，超过限制时返回错误提示 | 13.1 | Phase 2 | property-crm-engineer | Integration | 否 |

---

## 4. 客户 CRM

| ID | 验收条件 | PRD | Phase | Owner | 测试类型 | 阻塞发布 |
|---|---|---|---|---|---|---|
| AC-CLIENT-001 | 用户可创建客户，填写姓名、预算、区域、户型等字段，保存后出现在列表中 | 7.6 | Phase 2 | property-crm-engineer | Integration | 是 |
| AC-CLIENT-002 | 客户列表展示姓名/称呼、来源平台、预算、意向区域、户型、入住时间、当前阶段、下次跟进、最近互动时间、匹配房源数 | 7.6 | Phase 2 | property-crm-engineer | Integration | 是 |
| AC-CLIENT-003 | 客户详情页展示需求摘要、联系方式、硬性条件、偏好条件、deal_breakers、来源内容、推荐房源、已发送房源、已看房源、沟通记录、待办、阶段变化记录 | 7.6 | Phase 2 | property-crm-engineer | Integration | 是 |
| AC-CLIENT-004 | 客户阶段从 new 到 closed_won/lost 的完整流转可用 | 7.6 | Phase 2 | property-crm-engineer | Integration | 是 |
| AC-CLIENT-005 | 客户阶段变化写入日志，时间线可追溯 | 7.6 | Phase 2 | property-crm-engineer | Integration | 否 |
| AC-CLIENT-006 | 用户 A 无法读取用户 B 的客户数据 | 7.6 | Phase 2 | property-crm-engineer | Integration | 是 |
| AC-CLIENT-007 | 客户的联系方式（电话、微信）仅同 workspace 成员可见，外部用户无法获取 | 7.6 | Phase 2 | property-crm-engineer | Integration | 是 |
| AC-CLIENT-008 | 可记录与客户的沟通记录（interaction），关联房源、类型、摘要 | 7.6 | Phase 2 | property-crm-engineer | Integration | 否 |
| AC-CLIENT-009 | 新增沟通记录后客户 last_interaction_at 自动更新 | 7.6 | Phase 2 | property-crm-engineer | Integration | 否 |
| AC-CLIENT-010 | 客户超过 3 天未跟进时在首页显示提醒 | 7.6 | Phase 2 | property-crm-engineer | Integration | 否 |
| AC-CLIENT-011 | 客户可关联来源内容（source_content_id）和首次咨询房源（first_property_id） | 7.10 | Phase 3 | ai-deepseek-engineer | Integration | 否 |
| AC-CLIENT-012 | 客户软删除后默认列表不显示 | 7.6 | Phase 2 | property-crm-engineer | Integration | 是 |

---

## 5. 语义搜索

| ID | 验收条件 | PRD | Phase | Owner | 测试类型 | 阻塞发布 |
|---|---|---|---|---|---|---|
| AC-SEARCH-001 | 输入"3500 以内、天河、能养猫的一房"后，搜索结果仅包含月租 <=3500、区域为天河区、pets_allowed=true、户型为 1 房的房源 | 7.5 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-SEARCH-002 | 输入"下周能入住，近三号线，独立阳台"后，AI 正确解析 available_before、subway_text 含三号线、selling_points 含阳台 | 7.5 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-SEARCH-003 | AI 仅返回白名单字段的搜索 JSON，不允许返回 SQL 或非白名单字段 | 7.5 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-SEARCH-004 | 搜索结果展示已识别筛选条件，用户可一键删除某个条件 | 7.5 | Phase 2 | property-crm-engineer | Integration | 否 |
| AC-SEARCH-005 | 无结果时显示"没有找到匹配的房源，试试放宽条件"并给出具体建议 | 7.5 | Phase 2 | property-crm-engineer | Integration | 否 |
| AC-SEARCH-006 | 搜索结果不包含其他 workspace 的私有房源 | 7.5 | Phase 2 | property-crm-engineer | Integration | 是 |
| AC-SEARCH-007 | 不支持的条件（如 AI 不理解的概念）向用户明确提示 | 7.5 | Phase 3 | ai-deepseek-engineer | Integration | 否 |
| AC-SEARCH-008 | 未登录用户调用搜索 API 返回 401 | 7.5 | Phase 3 | ai-deepseek-engineer | Integration | 是 |

---

## 6. 房客匹配

| ID | 验收条件 | PRD | Phase | Owner | 测试类型 | 阻塞发布 |
|---|---|---|---|---|---|---|
| AC-MATCH-001 | 客户预算 3000，房源月租 3500 时，该房源不被纳入匹配结果或标记为不匹配 | 7.7 | Phase 2 | property-crm-engineer | Integration | 是 |
| AC-MATCH-002 | 客户要求 pets_allowed=true，房源 pets_allowed=false 时，该房源硬性条件不满足，不标记为高匹配 | 7.7 | Phase 2 | property-crm-engineer | Integration | 是 |
| AC-MATCH-003 | 匹配结果包含匹配分数（0-100）、匹配等级、匹配原因、不匹配原因 | 7.7 | Phase 2 | property-crm-engineer | Integration | 是 |
| AC-MATCH-004 | 匹配原因可解释具体维度的得分情况（如"预算匹配 +30""区域匹配 +20"） | 7.7 | Phase 2 | property-crm-engineer | Integration | 否 |
| AC-MATCH-005 | 用户可手工调整各维度的权重，调整后重新计算匹配分数 | 7.7 | Phase 2 | property-crm-engineer | Integration | 否 |
| AC-MATCH-006 | 匹配结果可标记为"已发送""已带看""不推荐"，状态变化持久化 | 7.7 | Phase 2 | property-crm-engineer | Integration | 否 |
| AC-MATCH-007 | 客户详情页展示匹配的房源列表 | 7.7, 7.6 | Phase 2 | property-crm-engineer | Integration | 否 |
| AC-MATCH-008 | 房源详情页展示匹配的客户列表 | 7.7 | Phase 2 | property-crm-engineer | Integration | 否 |
| AC-MATCH-009 | 匹配结果仅显示当前 workspace 的房源（不会跨 workspace 匹配） | 7.7 | Phase 2 | property-crm-engineer | Integration | 是 |
| AC-MATCH-010 | 匹配评分默认权重为：预算30、区域20、户型15、入住时间15、通勤10、特殊要求10，总分100 | 7.7 | Phase 2 | property-crm-engineer | Unit | 是 |

---

## 7. 待办与跟进

| ID | 验收条件 | PRD | Phase | Owner | 测试类型 | 阻塞发布 |
|---|---|---|---|---|---|---|
| AC-TASK-001 | 用户可创建待办任务，选择类型（联系客户、发送房源、确认带看、跟进带看、更新房源状态、联系房东、发布内容、更新内容数据、跟进合作请求） | 7.11 | Phase 2 | property-crm-engineer | Integration | 是 |
| AC-TASK-002 | 任务可关联客户、房源、内容项目或合作请求 | 7.11 | Phase 2 | property-crm-engineer | Integration | 否 |
| AC-TASK-003 | 任务状态可在 todo / in_progress / done / cancelled 间流转 | 7.11 | Phase 2 | property-crm-engineer | Integration | 是 |
| AC-TASK-004 | 标记任务为 done 时记录完成时间 | 7.11 | Phase 2 | property-crm-engineer | Integration | 否 |
| AC-TASK-005 | 点击"延期一天"后 due_at 推迟 24 小时 | 7.11 | Phase 2 | property-crm-engineer | Integration | 否 |
| AC-TASK-006 | 点击"延期三天"后 due_at 推迟 72 小时 | 7.11 | Phase 2 | property-crm-engineer | Integration | 否 |
| AC-TASK-007 | 今日到期和逾期任务在首页工作台显示 | 7.11, 7.2 | Phase 2 | property-crm-engineer | Integration | 是 |
| AC-TASK-008 | 用户 A 无法读取用户 B 的待办任务 | 7.11 | Phase 2 | property-crm-engineer | Integration | 是 |

---

## 8. 合作共享库

| ID | 验收条件 | PRD | Phase | Owner | 测试类型 | 阻塞发布 |
|---|---|---|---|---|---|---|
| AC-SHARE-001 | 房源开启 is_shared=true 后出现在共享库中 | 7.8, 5.7 | Phase 2 | property-crm-engineer | Integration | 是 |
| AC-SHARE-002 | 共享库中的房源不显示房东姓名、房东电话、房东微信、精确门牌号、内部备注、原始聊天记录、钥匙位置 | 7.8 | Phase 2 | property-crm-engineer | Integration | 是 |
| AC-SHARE-003 | 共享库查询通过专用脱敏视图或 RPC，不是客户端自行过滤 | 7.8, 9.8 | Phase 2 | data-security-engineer | RLS | 是 |
| AC-SHARE-004 | 外部用户即使直接查询 properties 表也无法读取敏感字段 | 9.5 | Phase 2 | data-security-engineer | RLS | 是 |
| AC-SHARE-005 | is_shared 与 allow_marketing_reuse 为独立开关，开启 is_shared 不自动开启 allow_marketing_reuse | 7.8, 5.7 | Phase 2 | property-crm-engineer | Integration | 是 |
| AC-SHARE-006 | 房源允许营销复用时（allow_marketing_reuse=true），指定的内容用户可选择该房源生成内容 | 7.9, 5.7 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-SHARE-007 | 房源仅 is_shared=true 但 allow_marketing_reuse=false 时，内容用户不能选择该房源生成内容 | 7.9 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-SHARE-008 | 关闭营销复用后，已有的内容项目不受影响，但不能再基于该房源创建新的内容项目 | 7.8 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-SHARE-009 | 房源下架（关闭 is_shared）后外部用户无法继续在共享库中看到该房源 | 7.8 | Phase 2 | property-crm-engineer | Integration | 是 |
| AC-SHARE-010 | 共享设置了过期时间后，过期时自动不再出现在共享库 | 7.8 | Phase 2 | property-crm-engineer | Integration | 是 |
| AC-SHARE-011 | 外部用户可对共享房源发起合作请求（含留言），房源所有者收到请求 | 7.8 | Phase 2 | property-crm-engineer | Integration | 是 |
| AC-SHARE-012 | 合作请求状态变更（pending -> accepted -> completed）后双方可见 | 7.8 | Phase 2 | property-crm-engineer | Integration | 否 |
| AC-SHARE-013 | 共享配置中的"是否显示小区名""是否显示大致位置""是否显示完整图片""是否显示租金"可单独配置 | 7.8 | Phase 2 | property-crm-engineer | Integration | 否 |
| AC-SHARE-014 | 合作联系行为写入日志 | 7.8 | Phase 2 | property-crm-engineer | Integration | 否 |
| AC-SHARE-015 | 下架共享房源后，外部用户若持有之前缓存的共享媒体 URL，也不再能访问 | 9.8 | Phase 3 | data-security-engineer | RLS | 是 |

---

## 9. AI 智能录入

| ID | 验收条件 | PRD | Phase | Owner | 测试类型 | 阻塞发布 |
|---|---|---|---|---|---|---|
| AC-AI-EXT-001 | 粘贴微信聊天记录到房源解析接口后，返回结构化字段（title, city, district, monthly_rent, bedrooms 等至少 30 个字段） | 7.3 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-AI-EXT-002 | AI 解析返回的字段中，missingFields 正确列出未提取到的必填字段 | 7.3 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-AI-EXT-003 | AI 解析返回的字段中，uncertainFields 正确列出置信度不足的字段 | 7.3 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-AI-EXT-004 | AI 解析时原始文本保留在 raw_text 字段中 | 7.3 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-AI-EXT-005 | AI 解析失败时不丢失原始文本，用户可手动录入 | 7.3 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-AI-EXT-006 | 用户确认 AI 解析结果后才能保存入库，AI 不得直接写数据库 | 7.3 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-AI-EXT-007 | 在发送给 DeepSeek 的请求中，owner_name、owner_phone、owner_wechat、client_phone、client_wechat、exact_address、building_no、unit_no、room_no、internal_notes、key_location 字段已被移除 | 10.6 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-AI-EXT-008 | 未登录用户调用 POST /api/ai/extract-property 返回 401 | 11.2 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-AI-EXT-009 | 普通注册用户可以调用房源解析和客户解析接口（与 content_factory 分离） | 7.3 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-AI-EXT-010 | 解析返回的 JSON 通过 Zod Schema 校验后才返回给前端 | 10.7 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-AI-EXT-011 | AI 调用超时后返回友好错误提示，不返回原始堆栈 | 10.11 | Phase 3 | ai-deepseek-engineer | Integration | 否 |
| AC-AI-EXT-012 | 用户粘贴的文本内容中的"指令"（如"忽略前面"）不干扰 AI 解析结果 | 7.3 | Phase 3 | ai-deepseek-engineer | Integration | 否 |

---

## 10. STT 语音转文本

| ID | 验收条件 | PRD | Phase | Owner | 测试类型 | 阻塞发布 |
|---|---|---|---|---|---|---|
| AC-STT-001 | 上传有效 30 秒音频文件到 POST /api/ai/transcribe 后返回转写文本 | 11.1 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-STT-002 | 上传超过 60 秒的音频文件返回 HTTP 422，不调用外部 STT 服务 | 11.1, 13.1 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-STT-003 | 上传超过 10MB 的音频文件返回 HTTP 413，不调用外部 STT 服务 | 11.1 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-STT-004 | 上传非法 MIME 类型（如 audio/aac 不在白名单内）返回 HTTP 400 | 11.1 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-STT-005 | 请求 Content-Type 不是 multipart/form-data 时返回 HTTP 400 | 11.1 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-STT-006 | 未登录用户调用 POST /api/ai/transcribe 返回 401 | 11.1 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-STT-007 | 客户端无法获取 STT API Key（Service Role Key 或 STT Key 不出现在客户端） | 10.2 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-STT-008 | 音频不持久化到业务数据库，请求完成后临时对象被清理 | 10.2 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-STT-009 | STT 转写接口只返回文本，不直接创建房源或客户 | 11.1 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-STT-010 | 音频以 File/Readable Stream 形式转发给 STT Provider，不以 Base64 JSON 传输 | 10.2 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-STT-011 | 前端录音达到 60 秒时自动停止并提示用户 | 10.2 | Phase 3 | mobile-ui-engineer | Integration | 是 |
| AC-STT-012 | 转写结果允许用户编辑后再提交给 AI 结构化解析 | 10.2 | Phase 3 | ai-deepseek-engineer | Integration | 否 |
| AC-STT-013 | 前端录音 UI 展示录制状态、时长、实时波形和剩余时间 | 10.2 | Phase 3 | mobile-ui-engineer | Integration | 否 |

---

## 11. DeepSeek 视觉理解

| ID | 验收条件 | PRD | Phase | Owner | 测试类型 | 阻塞发布 |
|---|---|---|---|---|---|---|
| AC-VISION-001 | 对房源图片调用 POST /api/ai/analyze-property-images 后，每张图片返回结构化 ai_labels（scene_type, styles, visible_features, condition, lighting, appliances, confidence, evidence_media_ids, uncertain_labels） | 7.3 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-VISION-002 | 整套房源生成 visual_summary（如"整体为简约现代风格，客厅自然采光较好..."），且包含"不足以判断"的边界说明 | 7.3 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-VISION-003 | 文字写"有阳台"但已上传图片未展示阳台时，标记"图片未验证：建议补充阳台照片"，而不是标记"不存在阳台" | 7.3, 10.4 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-VISION-004 | 文字写"开放式厨房"但图片明确显示封闭门体时，标记"疑似冲突" | 7.3 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-VISION-005 | 视觉分析接口接收 propertyMediaIds 数组，不接受客户端传入任意 URL | 11.3 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-VISION-006 | 服务端校验用户对房源和媒体的访问权限后，才生成短期签名 URL | 11.3 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-VISION-007 | 用户 A 无法对用户 B 的房源图片发起视觉分析 | 7.3 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-VISION-008 | 视觉分析最多一次处理 8 张图片，超出时分批处理并合并结果 | 11.3 | Phase 3 | ai-deepseek-engineer | Integration | 否 |
| AC-VISION-009 | 视觉模型调用必须使用 DeepSeek-VL 系列 endpoint，不得使用文本模型处理图片 | 10.3 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-VISION-010 | 图片上传到视觉端点前移除 EXIF 元数据 | 10.6 | Phase 3 | ai-deepseek-engineer | Integration | 否 |
| AC-VISION-011 | 视觉事实校验结果区分 confirmed_visual_support / not_verified_by_images / possible_conflict / insufficient_evidence / weak_visual_support（5 级完整，参见 ADR-003） | 10.4 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-VISION-012 | visual_summary 保存到 properties.visual_summary，visual_fact_flags 保存到 properties.visual_fact_flags | 7.3 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-VISION-013 | 视觉分析可以异步返回处理中状态，但最终结果保存前必须通过 Zod 校验 | 11.3 | Phase 3 | ai-deepseek-engineer | Integration | 否 |

---

## 12. AI 纠错与 Diff

| ID | 验收条件 | PRD | Phase | Owner | 测试类型 | 阻塞发布 |
|---|---|---|---|---|---|---|
| AC-DIFF-001 | 使用 AI 解析创建房源并传入 requestId，用户修改后保存，服务端自动计算 original_output 与 user_confirmed_output 的 JSON Diff 并写入 ai_correction_logs | 7.3 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-DIFF-002 | Diff 在服务端计算，不信任客户端提交的差异结果 | 7.3 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-DIFF-003 | ai_correction_logs 中的 original_output、corrected_output 和 diff 字段不包含电话、微信、精确地址、钥匙位置等敏感信息 | 8.2, 7.3 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-DIFF-004 | 手工创建的房源（无 requestId）保存时不产生 AI 纠错日志 | 7.3 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-DIFF-005 | 用户点击 👎 后选择"事实错误"，反馈写入 ai_correction_logs 并关联 content_version_id | 7.9 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-DIFF-006 | 同类纠错达到 3 次（AI_PREFERENCE_MIN_EVIDENCE）后自动生成 ai_user_preferences 记录 | 10.5 | Phase 3 | ai-deepseek-engineer | Unit | 否 |
| AC-DIFF-007 | 用户偏好只能影响分类倾向、文案语气、长度、格式，不得改写价格、面积、联系方式、精确地址 | 10.5 | Phase 3 | ai-deepseek-engineer | Unit | 是 |
| AC-DIFF-008 | 用户可在设置页面查看和删除已学习偏好 | 10.5 | Phase 3 | ai-deepseek-engineer | Integration | 否 |
| AC-DIFF-009 | 用户 A 无法读取用户 B 的 ai_correction_logs 和 ai_user_preferences | 9.6 | Phase 3 | data-security-engineer | RLS | 是 |
| AC-DIFF-010 | 普通用户只能删除/停用自己的偏好，不得修改 evidence_count 和 confidence | 9.6 | Phase 3 | data-security-engineer | RLS | 是 |

---

## 13. 内容工厂

| ID | 验收条件 | PRD | Phase | Owner | 测试类型 | 阻塞发布 |
|---|---|---|---|---|---|---|
| AC-CONTENT-001 | 拥有 content_factory 的用户可访问 /content 页面 | 7.9 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-CONTENT-002 | 普通用户（无 content_factory）访问 /content 时返回 403 或重定向 | 7.9 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-CONTENT-003 | 普通用户调用 POST /api/ai/generate-content 返回 403 | 7.9 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-CONTENT-004 | 普通用户直接读取 content_projects 表被 RLS 拒绝 | 9.3 | Phase 3 | data-security-engineer | RLS | 是 |
| AC-CONTENT-005 | 选择房源 -> 选择平台（小红书/抖音/朋友圈）-> 配置参数（目标客群、内容角度、语气等）-> 生成内容的完整流程可用 | 7.9 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-CONTENT-006 | 小红书生成输出包含 title_options (3个)、cover_text、hook、body、image_sequence、image_captions、factual_summary、drawbacks、interaction_question、private_message_keyword、hashtags、facts_used、visual_facts_used、missing_information、risk_flags、compliance_flags、requires_fact_review | 7.9 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-CONTENT-007 | 抖音生成输出包含 hook_options (3个)、cover_text、full_voiceover、shots、subtitles、caption、comment_cta | 7.9 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-CONTENT-008 | 朋友圈生成输出包含 copy_options (3个)、nine_grid_suggestion、short_cta | 7.9 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-CONTENT-009 | 内容生成 Prompt 包含已确认的 visual_summary 和 ai_labels，不包含未确认的视觉标签 | 7.9 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-CONTENT-010 | 存在高风险事实冲突（requires_fact_review=true）时，内容可生成草稿但禁止一键复制 | 7.9 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-CONTENT-011 | 内容可编辑并保存多个版本，版本切换即时反映 | 7.9 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-CONTENT-012 | 内容状态可在 draft / ready / published / archived 间流转 | 7.10 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-CONTENT-013 | 内容生成仅调用 DeepSeek 文本模型，不调用 OpenAI、Anthropic、Gemini | 7.9 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-CONTENT-014 | 仅 workspace 自己拥有 OR (is_shared=true AND allow_marketing_reuse=true) 的房源可用于内容生成 | 7.9 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-CONTENT-015 | status=rented/offline/expired/deleted 的房源不能用于生成新内容 | 7.9 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-CONTENT-016 | 每条发布内容有唯一 content_code | 7.10 | Phase 3 | ai-deepseek-engineer | Integration | 否 |
| AC-CONTENT-017 | 私信口令默认自动生成（可编辑） | 7.10 | Phase 3 | ai-deepseek-engineer | Integration | 否 |
| AC-CONTENT-018 | 客户详情展示来源内容（source_content_id） | 7.10 | Phase 3 | ai-deepseek-engineer | Integration | 否 |
| AC-CONTENT-019 | 内容详情展示关联客户和成交数据 | 7.10 | Phase 3 | ai-deepseek-engineer | Integration | 否 |
| AC-CONTENT-020 | 失败时自动重试一次（重试使用备用 DeepSeek 模型），仍失败则返回错误 | 7.9 | Phase 3 | ai-deepseek-engineer | Integration | 否 |

---

## 14. 合规预检

| ID | 验收条件 | PRD | Phase | Owner | 测试类型 | 阻塞发布 |
|---|---|---|---|---|---|---|
| AC-COMPLIANCE-001 | 生成内容包含 block 级风险词（如"最""第一""绝对"）时，compliance_status 标记为 blocked，copyAllowed = false | 7.9 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-COMPLIANCE-002 | copyAllowed = false 时，前端"一键复制"和"标记待发布"按钮 disabled | 7.9 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-COMPLIANCE-003 | 用户修改内容移除 block 级风险词后，再次检查通过，copyAllowed 变为 true | 7.9 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-COMPLIANCE-004 | 内容包含 review 级风险词（如"投资回报率""保值增值"）时，标注为 review，用户必须修改或填写确认理由 | 7.9 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-COMPLIANCE-005 | 内容包含 highlight 级风险词时，仅高亮提示，不阻止复制 | 7.9 | Phase 3 | ai-deepseek-engineer | Integration | 否 |
| AC-COMPLIANCE-006 | 合规扫描在服务端执行（src/lib/compliance/check.ts），不在前端重新扫描 | 7.9 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-COMPLIANCE-007 | 合规命中结果持久化到 content_versions.compliance_status 和 compliance_flags | 7.9 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-COMPLIANCE-008 | 用户对 review 风险词的确认理由写入 compliance_review_logs | 7.9 | Phase 3 | ai-deepseek-engineer | Integration | 否 |
| AC-COMPLIANCE-009 | 管理员新增 block 级风险词后，已生成的新内容立即受约束 | 7.12 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-COMPLIANCE-010 | 管理员可停用风险词，停用后该词不再触发拦截 | 7.12 | Phase 3 | ai-deepseek-engineer | Integration | 否 |
| AC-COMPLIANCE-011 | 合规词库版本回滚后，后续扫描使用回滚后的词库 | 7.12 | Phase 3 | ai-deepseek-engineer | Integration | 否 |
| AC-COMPLIANCE-012 | 普通用户不能修改全局合规词库 | 7.12 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-COMPLIANCE-013 | 合规命中和处理动作（block/review/highlight）写入 audit_logs | 9.7 | Phase 3 | ai-deepseek-engineer | Integration | 否 |

---

## 15. 配额与成本熔断

| ID | 验收条件 | PRD | Phase | Owner | 测试类型 | 阻塞发布 |
|---|---|---|---|---|---|---|
| AC-QUOTA-001 | 用户在达到每日次数上限后，调用 POST /api/ai/generate-content 返回 429，且不调用 DeepSeek | 7.9 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-QUOTA-002 | 用户在达到每日成本熔断线（默认 $10）后，请求返回 429 blocked_by_cost_limit | 7.12 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-QUOTA-003 | 同一用户同时发起 10 个并发内容生成请求，仅允许不超过配额上限的请求调用 DeepSeek，超出部分返回 429 | 10.9 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-QUOTA-004 | 相同 idempotency_key 的重复请求不重复扣减配额（返回首次请求的缓存结果或幂等提示） | 10.9 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-QUOTA-005 | reserve_ai_quota RPC 在单事务中同时检查次数和成本，防止"先 count 再 insert"的非原子方式 | 10.9 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-QUOTA-006 | 429 响应中包含当日配额上限和下一次重置时间 | 11.6 | Phase 3 | ai-deepseek-engineer | Integration | 否 |
| AC-QUOTA-007 | [Future] 普通注册用户调用基础 AI 功能（extract-property、extract-client、parse-property-search）的独立配额限制——PRD 仅定义了 content_factory 的统一配额体系（AI_DAILY_CONTENT_LIMIT、AI_DAILY_COST_LIMIT_USD），未为基础 AI 功能定义独立配额。当前基础 AI 功能由 ai_usage_logs 记录用量但不设独立次数/成本上限，其 API 授权由 ai_data_extraction feature key 控制 | 7.3 | — | ai-deepseek-engineer | Integration | 否 |
| AC-QUOTA-008 | 管理员可为特定用户提高每日成本上限 | 7.12 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-QUOTA-009 | 管理员恢复被熔断用户后，该用户立即可以继续使用 AI 功能 | 7.12 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-QUOTA-010 | 恢复动作写入 audit_logs | 7.12 | Phase 3 | ai-deepseek-engineer | Integration | 否 |
| AC-QUOTA-011 | 视觉分析成本与文本生成成本在 ai_usage_logs 中分开统计 | 7.12 | Phase 3 | ai-deepseek-engineer | Integration | 否 |
| AC-QUOTA-012 | 模型价格从 ai_model_pricing 表的历史版本读取，不硬编码 | 10.9 | Phase 3 | ai-deepseek-engineer | Integration | 否 |
| AC-QUOTA-013 | 过期预占（超过 reservation_expires_at 未被结算的 reserve）自动释放 | 10.9 | Phase 3 | ai-deepseek-engineer | Integration | 否 |

---

## 16. 管理后台

| ID | 验收条件 | PRD | Phase | Owner | 测试类型 | 阻塞发布 |
|---|---|---|---|---|---|---|
| AC-ADMIN-001 | 普通用户访问 /admin 时被拒绝（返回 403 或重定向） | 7.1 | Phase 1 | data-security-engineer | Integration | 是 |
| AC-ADMIN-002 | 系统管理员可访问 /admin/users 查看用户列表（姓名、邮箱、注册时间、workspace、状态） | 7.1 | Phase 1 | data-security-engineer | Integration | 是 |
| AC-ADMIN-003 | 系统管理员可禁用账号，禁用后该用户无法登录 | 7.1 | Phase 1 | data-security-engineer | Integration | 是 |
| AC-ADMIN-004 | 系统管理员可创建邀请链接（配置 target_workspace、过期时间、最大使用次数） | 7.1 | Phase 1 | data-security-engineer | Integration | 是 |
| AC-ADMIN-005 | 系统管理员可在 /admin/feature-entitlements 授予和撤销 content_factory | 7.1 | Phase 1 | data-security-engineer | Integration | 是 |
| AC-ADMIN-006 | 系统管理员可查看 /admin/ai-usage 的成本统计（今日/7日/30日 Token、成本，按用户/功能/模型分组） | 7.12 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-ADMIN-007 | 系统管理员可在 /admin/ai-models 查看当前主/备模型状态和 Circuit Breaker 状态 | 7.12 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-ADMIN-008 | 系统管理员可强制切换文本模型为 primary/fallback/auto | 7.12 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-ADMIN-009 | 系统管理员可重置 Circuit Breaker | 7.12 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-ADMIN-010 | 系统管理员可在 /admin/ai-corrections 查看高频纠错字段和负反馈率 | 7.12 | Phase 3 | ai-deepseek-engineer | Integration | 否 |
| AC-ADMIN-011 | 系统管理员可在 /admin/compliance 管理风险词库（新增、编辑、停用、版本回滚） | 7.12 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-ADMIN-012 | 管理后台页面不展示脱敏前的联系方式或精确地址 | 7.12 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-ADMIN-013 | 授权、撤销、成本恢复、模型切换、词库修改均写入 audit_logs | 9.7 | Phase 3 | data-security-engineer | Integration | 是 |
| AC-ADMIN-014 | 管理员首页（/admin）展示各模块入口概览 | 7.1 | Phase 1 | data-security-engineer | Integration | 否 |

---

## 17. 发布与归因

| ID | 验收条件 | PRD | Phase | Owner | 测试类型 | 阻塞发布 |
|---|---|---|---|---|---|---|
| AC-PUBLISH-001 | 每发布一条内容，自动生成唯一 content_code | 7.10 | Phase 3 | ai-deepseek-engineer | Integration | 否 |
| AC-PUBLISH-002 | 私信口令默认自动生成（可编辑） | 7.10 | Phase 3 | ai-deepseek-engineer | Integration | 否 |
| AC-PUBLISH-003 | 发布记录包含平台、发布时间、发布链接、content_code、私信口令 | 7.10 | Phase 3 | ai-deepseek-engineer | Integration | 否 |
| AC-PUBLISH-004 | 发布记录可更新阅读/播放、点赞、收藏、评论、私信、有效咨询、带看、成交数据 | 7.10 | Phase 3 | ai-deepseek-engineer | Integration | 否 |
| AC-PUBLISH-005 | 创建客户时可选择来源内容（source_content_id）或输入私信口令 | 7.10 | Phase 3 | ai-deepseek-engineer | Integration | 否 |
| AC-PUBLISH-006 | 客户详情展示来源内容和首次咨询房源 | 7.10 | Phase 3 | ai-deepseek-engineer | Integration | 否 |
| AC-PUBLISH-007 | 内容详情展示关联客户、带看、成交数量 | 7.10 | Phase 3 | ai-deepseek-engineer | Integration | 否 |
| AC-PUBLISH-008 | 通过私信口令可正确归因到对应内容和房源 | 7.10 | Phase 3 | ai-deepseek-engineer | Integration | 否 |

---

## 18. 移动端体验

| ID | 验收条件 | PRD | Phase | Owner | 测试类型 | 阻塞发布 |
|---|---|---|---|---|---|---|
| AC-MOBILE-001 | 在 375px 宽度下，底部导航显示首页、房源、客户、我的（普通用户） | 6.1 | Phase 1 | mobile-ui-engineer | Integration | 是 |
| AC-MOBILE-002 | 在 375px 宽度下，底部导航显示首页、房源、客户、内容、我的（content_factory 用户） | 6.1 | Phase 1 | mobile-ui-engineer | Integration | 是 |
| AC-MOBILE-003 | 内容用户权限撤销后，底部导航"内容"入口立即消失 | 6.1 | Phase 2 | mobile-ui-engineer | Integration | 是 |
| AC-MOBILE-004 | 删除确认弹窗在移动端以 Drawer 从底部弹出，桌面端以 Dialog 居中弹出 | 12.2 | Phase 1 | mobile-ui-engineer | Integration | 是 |
| AC-MOBILE-005 | Drawer 最大高度不超过 92dvh，内部独立滚动，标题区和操作区固定 | 12.2 | Phase 1 | mobile-ui-engineer | Integration | 是 |
| AC-MOBILE-006 | 在 iOS Safari 中软键盘弹起时，Drawer 内输入框可见且可操作，提交按钮不在键盘后 | 12.2 | Phase 1 | mobile-ui-engineer | E2E | 是 |
| AC-MOBILE-007 | 打开 Overlay 时背景滚动锁定，关闭后恢复原滚动位置 | 12.2 | Phase 1 | mobile-ui-engineer | Integration | 是 |
| AC-MOBILE-008 | 筛选弹窗在移动端使用 Drawer，桌面端使用 Dialog | 12.2 | Phase 2 | mobile-ui-engineer | Integration | 是 |
| AC-MOBILE-009 | 房源列表在移动端默认卡片展示，桌面端可切换表格 | 12.4 | Phase 2 | property-crm-engineer | Integration | 否 |
| AC-MOBILE-010 | 所有异步操作展示 loading、success、empty、error、retry 状态 | 12.5 | Phase 1 | mobile-ui-engineer | Integration | 是 |
| AC-MOBILE-011 | 移动端录音按钮在拇指可触达区域，展示录制、暂停、上传和转写状态 | 12.3 | Phase 3 | mobile-ui-engineer | E2E | 否 |
| AC-MOBILE-012 | 从 375px 旋转到 1024px 时 ResponsiveOverlay 从 Drawer 切换为 Dialog，且表单状态不丢失 | 12.2 | Phase 1 | mobile-ui-engineer | Integration | 否 |
| AC-MOBILE-013 | 页面底部导航不被 iPhone Home Indicator 遮挡 | 12.2 | Phase 1 | mobile-ui-engineer | E2E | 否 |
| AC-MOBILE-014 | 敏感字段显示锁图标和"仅本门店可见"提示 | 12.7 | Phase 2 | property-crm-engineer | Integration | 否 |
| AC-MOBILE-015 | 输入框获得焦点时自动滚动到可视区域，不被软键盘遮挡 | 12.2 | Phase 1 | mobile-ui-engineer | E2E | 否 |

---

## 19. 安全与隐私

| ID | 验收条件 | PRD | Phase | Owner | 测试类型 | 阻塞发布 |
|---|---|---|---|---|---|---|
| AC-SEC-001 | 用户 A 的直接 API 请求无法读取用户 B 的私有房源数据（返回空数组或无权限错误） | 5.6 | Phase 2 | property-crm-engineer | Integration | 是 |
| AC-SEC-002 | 用户 A 的直接 API 请求无法读取用户 B 的客户数据 | 5.6 | Phase 2 | property-crm-engineer | Integration | 是 |
| AC-SEC-003 | 用户 A 的直接 API 请求无法读取用户 B 的 AI 用量日志 | 9.6 | Phase 3 | data-security-engineer | Integration | 是 |
| AC-SEC-004 | 用户 A 的直接 API 请求无法读取用户 B 的 AI 偏好 | 9.6 | Phase 3 | data-security-engineer | Integration | 是 |
| AC-SEC-005 | Supabase Service Role Key 不出现在客户端代码或环境变量中 | 13.2 | Phase 1 | integration-engineer | Integration | 是 |
| AC-SEC-006 | 文件上传接口验证 MIME 类型和文件大小 | 13.2 | Phase 2 | property-crm-engineer | Integration | 是 |
| AC-SEC-007 | content_factory 权限不在前端用邮箱字符串判断 | 3.3 | Phase 1 | data-security-engineer | Integration | 是 |
| AC-SEC-008 | content_factory 权限不在客户端变量中判断 | 3.3 | Phase 1 | data-security-engineer | Integration | 是 |
| AC-SEC-009 | 共享房源视图不包含 property_private_details 的任何字段 | 9.5 | Phase 2 | data-security-engineer | RLS | 是 |
| AC-SEC-010 | 共享房源视图不包含客户数据、原始输入文本、内部备注、钥匙位置 | 9.5 | Phase 2 | data-security-engineer | RLS | 是 |
| AC-SEC-011 | 日志（ai_usage_logs、audit_logs）不包含明文手机号、微信号、精确地址 | 8.2 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-SEC-012 | 日志不包含完整 Prompt 或用户敏感输入 | 8.2 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-SEC-013 | 视觉分析接口不接受内网 URL、file://、环回地址或云元数据地址 | 11.3 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-SEC-014 | 不存在配置非 DeepSeek LLM/VLM API Key 的代码路径 | 3.3, 10.1 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-SEC-015 | 不存在非 DeepSeek 大模型的运行时回退路径 | 10.1 | Phase 3 | ai-deepseek-engineer | Integration | 是 |
| AC-SEC-016 | ai_runtime_config 表不保存明文密钥 | 8.2 | Phase 3 | data-security-engineer | RLS | 是 |
| AC-SEC-017 | 用户可请求导出自己的数据 | 13.3 | Phase 1 | data-security-engineer | Integration | 否 |
| AC-SEC-018 | 用户可申请删除账号和数据 | 13.3 | Phase 1 | data-security-engineer | Integration | 否 |
| AC-SEC-019 | 所有 API 响应使用 CORS 限制，仅允许白名单域名 | 13.2 | Phase 1 | integration-engineer | Integration | 是 |
| AC-SEC-020 | 没有通过 URL query 参数或 Referer 泄露 workspace_id | 13.2 | Phase 1 | data-security-engineer | Integration | 否 |
| AC-SEC-021 | 管理后台 API（/api/admin/**）仅系统管理员可调用 | 11.11 | Phase 1 | data-security-engineer | Integration | 是 |
| AC-SEC-022 | 邀请 Token 在数据库中仅保存 Hash，不保存明文 | 8.2 | Phase 1 | data-security-engineer | RLS | 是 |

---

## Open Questions

无。所有 Open Questions 已转为以下实施假设，详见 `docs/plans/phase1-assumptions.md`：
- ASM-002: STT Provider 默认选型为阿里云语音识别
- ASM-001: DeepSeek 官方提供视觉 API
- ASM-006: E2E 移动端测试默认使用 BrowserStack，降级方案为 Xcode Simulator

---

## Out of Scope

以下类型的验收条件明确不包含在本矩阵中：

- 视频自动剪辑、数字人相关功能
- 在线支付、电子合同、财务记账
- 小红/抖音 API 自动发布（仅手工记录发布数据）
- 非 DeepSeek LLM/VLM 的任何功能
- 超过 1-10 人门店的复杂组织管理
- 完整地图找房

---

## Change Control

验收矩阵变更流程：

1. 新增验收条件：提交 Change Request 给主 Agent，说明条件内容、PRD 依据、阻塞发布影响。
2. 修改已有条件：说明修改原因和对已通过测试的影响。
3. 删除条件：必须说明该条件为何不再适用（如 PRD 变更或技术限制）。
4. 所有变更获得主 Agent 批准后，更新版本号并记录变更历史。
5. 冻结 Phase（Phase 1-3）开始后，对应 Phase 的验收条件数量可增加但不可减少，阈值不可降低。

---

## 变更历史

| 日期 | 版本 | 变更说明 |
|---|---|---|
| 2026-07-30 | 1.0 | 初始版本，覆盖 19 个业务能力领域共 150+ 条验收条件 |
