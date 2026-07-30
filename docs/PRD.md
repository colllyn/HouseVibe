# 阳光智家（HouseVibe）产品需求文档 PRD

> 面向多名独立房产中介开放基础房源与客户能力，并仅向指定账号开放 AI 自媒体内容工厂  
> 文档用途：供 Claude Code / 开发团队直接执行  
> 产品阶段：MVP → V1  
> 默认业务：住宅租赁  
> 预留扩展：二手房买卖、门店协作、跨门店共享房源  
> 版本：v1.3（DeepSeek 统一模型、视觉理解、纠错学习、成本审计与合规预检）

---

## 版本变更摘要

本版本在 v1.2 的多租户、权限分层、STT、RLS 性能和配额机制基础上继续增强：

1. 产品维持同一链接下的多用户 SaaS，每名中介必须注册或登录，并拥有独立 workspace。
2. 所有正式注册用户可使用房源录入、存储、查询、客户管理和房客匹配。
3. AI 自媒体内容工厂不默认开放，只允许系统管理员指定的账号使用。
4. 权限控制继续覆盖前端导航、Next.js 服务端和 Supabase RLS。
5. 文本理解、语义解析、内容生成和推理类大模型统一使用 DeepSeek，不再接入 OpenAI、Anthropic 或其他大语言模型供应商。
6. 视觉理解统一通过 `DeepSeekVisionProvider` 接入 DeepSeek-VL 系列部署；不得假设普通 DeepSeek 文本 API 可以直接接收图片。
7. 新增房源图片视觉标签、整套房源视觉摘要，以及文字与图片之间的事实交叉校验。
8. 新增 AI 纠错日志和用户偏好学习闭环，保存 AI 原始结果与人工确认结果之间的 Diff。
9. 内容结果新增 👍/👎 反馈，并支持“事实错误、语气不对、太罗嗦、格式错误”等快捷原因。
10. 新增成本统计、用户级每日成本熔断、管理员恢复和 DeepSeek 主备模型热切换。
11. 新增房产营销合规风险词库、内容预检、高亮与复制拦截。
12. 内容每日次数配额与累计成本限制均在数据库原子预占过程中校验，防止并发绕过。
13. 语音转文本仍使用独立 STT 子系统；STT 不属于大语言模型能力，不得复用 DeepSeek 文本接口伪造语音识别。
14. “允许同行查看共享房源”与“允许指定内容用户使用房源生成营销内容”继续保持为两个独立开关。

---

## 0. 给 Claude Code 的执行指令

你需要基于本 PRD 构建一个可运行、可部署、移动端优先的全栈 Web 产品。

### 固定技术栈

- Next.js 14+，App Router
- TypeScript，开启严格模式
- Tailwind CSS
- shadcn/ui
- Vaul / shadcn Drawer（移动端底部抽屉）
- Lucide Icons
- Supabase PostgreSQL
- Supabase Auth
- Supabase Storage
- Supabase Row Level Security
- Zod
- React Hook Form
- TanStack Query（可选；若 Server Actions 已能满足需求，可减少使用）
- 大语言模型：仅 DeepSeek；文本模型与视觉模型分别通过能力适配层调用
- 语音转文本适配层：Web Speech API / 独立 STT 服务可切换；不得使用客户端密钥
- 部署：Vercel

### 实现原则

1. 移动端优先，桌面端自适应。
2. MVP 必须可真实使用，不仅是静态 Demo。
3. 所有业务表必须包含 `user_id` 或 `workspace_id`。
4. 所有敏感数据必须通过 RLS 隔离。
5. 房东电话、客户电话、微信号、具体门牌号不得发送给大模型。
6. AI 输出必须使用结构化 JSON，并通过 Zod 校验。
7. 不允许 AI 虚构房源事实。
8. 所有删除采用软删除。
9. 所有生成内容均须人工确认后才能标记发布。
10. 第一阶段不实现非官方的小红书自动发布。
11. 抖音自动发布仅作为后续可选集成，不属于 MVP 必做项。
12. 先完成数据库、RLS、CRUD、查询，再接 AI。
13. 每个功能必须包含空状态、加载状态、错误状态。
14. 所有表单均应有前端和服务端双重校验。
15. 代码应按领域拆分，避免将所有逻辑放在页面组件中。
16. 所有用户必须登录后使用，禁止匿名用户录入或查看私有房源。
17. 不允许通过隐藏按钮、邮箱判断或前端变量实现内容工厂授权。
18. 内容工厂权限必须在前端、Next.js 服务端与 Supabase RLS 三层校验。
19. 所有功能授权必须可由系统管理员授予、撤销、设置有效期并审计。
20. 普通中介默认拥有基础 CRM 能力，但默认不拥有 `content_factory`。
21. 所有推理、抽取、搜索解析、内容生成和视觉理解类大模型必须为 DeepSeek 模型。
22. 禁止在运行时代码中配置 OpenAI、Anthropic、Gemini 等其他大语言模型 API Key 或回退路径。
23. DeepSeek API 的 OpenAI/Anthropic 兼容协议仅代表 SDK/请求格式兼容，实际 `base_url`、API Key 和模型必须指向 DeepSeek 或部署 DeepSeek 权重的受控推理端点。
24. 视觉分析不得直接把图片传给仅支持文本的模型；必须使用 `DeepSeekVisionProvider`。
25. AI 生成内容在复制前必须通过事实校验与合规预检。

---

# 1. 产品概述

## 1.1 产品名称

中文名：阳光智家  
英文代号：HouseVibe

## 1.2 一句话定位

阳光智家是一款面向小型房地产中介和自由经纪人的多用户移动端轻 CRM。所有注册中介都可以管理自己的房源与客户、进行智能查询和房客匹配；只有被系统管理员明确授权的指定账号，才能进入 AI 自媒体内容工厂并生成小红书、抖音和朋友圈内容。

## 1.3 目标用户

### 核心用户

- 个人租赁经纪人
- 夫妻中介店
- 1–10 人独立房产门店
- 聚焦某一区域、某一商圈或某几个小区的经纪人

### 次要用户

- 与核心用户合作的其他中介
- 门店管理员
- 未来加入的房源维护人员和内容运营人员

## 1.4 核心问题

### 获客难

用户缺少平台自然流量，不熟悉小红书、抖音和视频号的内容表达方式，无法稳定生产符合平台内容习惯的素材。

### 信息乱

房源和客户信息散落在微信、电话录音、聊天记录、备忘录和纸质笔记中，重复录入严重，查找困难。

### 跟进弱

客户需求没有结构化记录，容易遗漏跟进，也无法快速找到符合条件的房源。

### 资源孤岛

个人经纪人房源有限，需要与同行合作，但担心业主联系方式、具体门牌号等敏感信息被绕开或泄露。

## 1.5 产品目标

产品需要同时建立两个闭环。

### 基础业务闭环：面向所有正式注册中介

```text
通过统一链接注册或登录
→ 自动创建独立工作区
→ 语音/文本录入房源与客户
→ AI 提取结构化字段
→ 人工确认入库
→ 房源检索与客户管理
→ 房客智能匹配
→ 跟进、带看、成交
```

### 内容获客闭环：仅面向指定内容用户

```text
系统管理员授予 content_factory 权限
→ 指定用户选择自己有权使用的房源
→ 生成小红书/抖音/朋友圈内容
→ 人工编辑确认
→ 记录发布信息与私信口令
→ 关联客户、带看与成交
```

同时支持安全的同行合作：

```text
私有房源
→ 用户主动上架合作共享库
→ 自动隐藏房东信息与精确地址
→ 其他中介查看脱敏房源
→ 发起合作请求
```

共享房源是否可以被内容用户用于营销生成，必须由房源所有者额外授权，不得与“上架共享库”自动绑定。

## 1.6 统一访问与授权策略

- 所有人使用同一个正式产品链接。
- 所有业务操作都要求登录，不开放匿名录入。
- 每名中介首次注册后自动创建独立 workspace。
- 房源、客户、互动、匹配和任务默认只属于当前 workspace。
- 普通中介默认获得基础 CRM、AI 结构化录入、语义搜索与匹配能力。
- `content_factory` 不默认授予，由系统管理员指定账号后生效。
- 撤销 `content_factory` 后，用户必须立即失去页面、API 和数据库访问能力。
- 系统不得在代码中写死指定用户邮箱或用户 ID。

## 1.7 非目标

MVP 不包含：

- 大型房产门户
- 房源自动抓取
- 非官方平台自动登录
- 自动群发私信
- 在线支付
- 房租托管
- 电子合同签署
- 财务记账
- 经纪人绩效和复杂组织管理
- 自动房价评估
- AI 自动承诺价格、佣金或合同条款
- 视频自动剪辑
- 数字人
- 完整地图找房

---

# 2. 产品成功标准

## 2.1 产品级北极星指标

每周通过系统完成有效房源管理、客户匹配或内容获客闭环的活跃中介数。

## 2.2 基础 CRM 指标

- 房源录入平均耗时小于 2 分钟
- AI 字段解析后一次确认通过率大于 70%
- 房源搜索结果响应时间小于 2 秒
- 客户匹配结果生成时间小于 3 秒
- 每周活跃中介数
- 每名活跃中介的房源录入量
- 每名活跃中介的有效客户数
- 客户到带看转化率
- 带看到成交转化率
- 超过三天未跟进客户数量
- 敏感字段未经授权泄露率为 0

## 2.3 内容工厂指标

仅统计拥有 `content_factory` 权限的用户：

- 每套房源内容生成平均耗时小于 60 秒
- 内容生成后复制或导出率大于 50%
- 内容发布率
- 内容到有效咨询转化率
- 私信到客户建档转化率
- 内容关联带看与成交数量
- AI 内容事实错误率
- AI 调用成功率与平均成本

## 2.4 权限与安全指标

- 普通用户访问内容页面拦截率为 100%
- 普通用户调用内容生成 API 拦截率为 100%
- 普通用户直接读取内容表拦截率为 100%
- 用户 A 读取用户 B 私有房源和客户的成功率为 0
- 权限撤销后继续调用成功率为 0
- 共享房源泄露房东联系方式和精确门牌号的比例为 0

---

# 3. 用户角色、工作区与功能授权

权限模型分为三个独立维度：

1. 系统级身份：是否为系统管理员。
2. 工作区角色：用户在当前门店或个人工作区中的身份。
3. 功能授权：账号是否拥有某项可选产品能力。

## 3.1 系统级身份

### System Admin

产品运营方管理员，即你指定的后台管理账号。拥有：

- 查看平台注册用户和工作区基础信息
- 授予或撤销 `content_factory`
- 设置授权有效期
- 查看 AI 使用次数与成本
- 创建和管理邀请链接
- 禁用账号
- 查看授权审计记录

系统管理员身份必须存储在受保护的 `system_admins` 表或服务端控制的 Auth App Metadata 中，不得放在用户可修改的普通 metadata 中。

## 3.2 工作区角色

### Owner

- 管理自己的工作区
- 查看和维护本工作区全部私有房源与客户
- 管理工作区成员
- 决定某套房源是否共享
- 决定某套共享房源是否允许营销复用

### Member

- 根据工作区配置维护房源、客户、互动和任务
- 查看本工作区业务数据
- 不可删除工作区
- 不可管理系统级功能授权

### External Collaborator

- 仅查看已共享且未过期的脱敏房源
- 无法查看房东联系方式、客户信息和精确地址
- 可向房源所属工作区发起合作请求

## 3.3 功能授权 Entitlements

建议功能键：

```text
ai_data_extraction
semantic_search
property_matching
shared_property_pool
content_factory
```

默认策略：

| 功能 | 普通注册中介 | 指定内容用户 | 系统管理员 |
|---|---:|---:|---:|
| 房源 CRUD | ✓ | ✓ | 按工作区权限 |
| 客户 CRUD | ✓ | ✓ | 按工作区权限 |
| AI 结构化录入 | ✓ | ✓ | 按账号授权 |
| 自然语言搜索 | ✓ | ✓ | 按账号授权 |
| 房客匹配 | ✓ | ✓ | 按账号授权 |
| 合作共享库 | ✓ | ✓ | 管理平台规则 |
| 小红书生成 | ✕ | ✓ | 按授权 |
| 抖音脚本生成 | ✕ | ✓ | 按授权 |
| 朋友圈文案生成 | ✕ | ✓ | 按授权 |
| 内容历史与归因 | ✕ | ✓ | 按授权 |
| 用户和授权管理 | ✕ | ✕ | ✓ |

## 3.4 MVP 账户策略

- 所有用户必须注册或受邀后登录。
- 首次登录自动创建一个独立 workspace，并成为 Owner。
- 数据表统一通过 `workspace_id` 隔离，预留 1–10 人门店协作。
- 普通注册用户默认获得基础业务能力。
- `content_factory` 只能由 System Admin 主动授予。
- 当前业务可只授权一个指定用户，但数据库不建议写死“全平台只能一个人”，以便未来扩展为付费功能。

---

# 4. 核心用户故事

## 4.1 房源录入

作为经纪人，我希望粘贴微信聊天记录或口述房源信息，让系统自动提取字段，从而减少手工录入。

## 4.2 房源搜索

作为经纪人，我希望直接输入“3500 以内、近地铁、能养猫的一房”，快速得到符合条件的房源。

## 4.3 客户管理

作为经纪人，我希望记录客户预算、区域、入住时间和硬性要求，并持续更新跟进状态。

## 4.4 房客匹配

作为经纪人，我希望系统根据客户需求自动推荐房源，并解释为什么匹配或不匹配。

## 4.5 内容生成

作为经纪人，我希望选择一套房源后，一键生成小红书、抖音或朋友圈内容，并且所有信息真实可核验。

## 4.6 内容归因

作为经纪人，我希望知道某个客户来自哪条内容，以便判断什么房源和内容最有效。

## 4.7 合作共享

作为经纪人，我希望把房源脱敏后共享给同行，同时隐藏房东电话和具体门牌号。

## 4.8 基础能力开放

作为普通注册中介，我希望通过统一链接注册后立即使用房源、客户、搜索和匹配功能，而不需要获得内容工厂权限。

## 4.9 内容能力授权

作为系统管理员，我希望指定某个账号使用内容工厂，也能随时撤销或设置有效期。

## 4.10 营销复用授权

作为房源所有者，我希望分别控制“允许同行查看”和“允许指定内容用户用此房源生成营销内容”。

---

# 5. 核心业务流程

## 5.1 房源录入流程

```text
点击“快速录入”
→ 选择“语音录入”或“粘贴文本”
→ 获取原始文本
→ 调用 AI 解析接口
→ 返回结构化字段、缺失字段、风险字段
→ 弹出确认卡片
→ 用户修改
→ 保存为私有房源
→ 上传图片/视频
→ 进入房源详情页
```

### 异常流程

- AI 解析失败：保留原始文本，允许手工录入
- 语音识别失败：允许重新录音或编辑文本
- 关键字段缺失：允许保存草稿
- 重复房源：提示可能重复，不强制阻止

## 5.2 客户录入流程

```text
点击“新增客户”
→ 手工录入或粘贴聊天记录
→ AI 提取预算、区域、户型、入住时间等
→ 用户确认
→ 创建客户
→ 自动匹配房源
→ 设置下次跟进时间
```

## 5.3 内容生成流程

```text
进入房源详情
→ 点击“生成内容”
→ 选择平台
→ 选择内容角度
→ 选择目标客群
→ 选择语气、视频时长、是否真人出镜
→ AI 生成结构化内容
→ 事实校验
→ 展示风险提示
→ 用户编辑
→ 保存版本
→ 一键复制
→ 标记为已发布
→ 填写发布链接和基础数据
```

## 5.4 合作共享流程

```text
房源详情
→ 点击“上架合作库”
→ 配置可见字段
→ 配置佣金分成
→ 系统预览脱敏结果
→ 用户确认
→ 发布至合作共享库
```

## 5.5 线索归因流程

```text
内容生成并保存
→ 自动生成内容编号和私信口令
→ 用户发布
→ 收到私信
→ 新增客户
→ 选择来源平台、来源内容或私信口令
→ 关联房源
→ 后续记录带看与成交
```

---

## 5.6 注册、邀请与权限授予流程

```text
访问统一链接
→ 注册或通过邀请链接加入
→ 登录并创建独立 workspace
→ 默认获得基础 CRM 能力
→ 正常使用房源、客户、搜索和匹配
```

内容工厂授权：

```text
系统管理员进入 /admin/feature-entitlements
→ 搜索指定用户
→ 授予 content_factory
→ 可选设置 expires_at
→ 写入授权记录和审计日志
→ 用户下一次请求立即获得内容能力
```

撤销时：

```text
系统管理员撤销权限
→ entitlement 状态变为 revoked
→ 页面导航消失
→ 服务端接口返回 403
→ 内容表 RLS 拒绝访问
```

## 5.7 共享房源营销复用流程

```text
房源所有者上架合作共享库
→ 选择是否允许营销复用
→ 系统展示脱敏和素材授权预览
→ 保存 is_shared 与 allow_marketing_reuse
→ 指定内容用户仅可选择获授权房源生成内容
```


# 6. 信息架构与页面路由

## 6.1 移动端底部导航

普通用户：

- 首页
- 房源
- 客户
- 我的

拥有 `content_factory` 的指定用户：

- 首页
- 房源
- 客户
- 内容
- 我的

## 6.2 桌面端左侧导航

- 工作台
- 房源
  - 私有房源
  - 合作共享库
- 客户
- 房客匹配
- 内容工作台（仅 content_factory 用户可见）
- 发布记录（仅 content_factory 用户可见）
- 待办
- 设置

## 6.3 页面路由

```text
/
├─ /login
├─ /register
├─ /join/[inviteToken]
├─ /onboarding
├─ /dashboard
├─ /properties
│  ├─ /new
│  ├─ /import
│  ├─ /shared
│  └─ /[propertyId]
│     ├─ /edit
│     └─ /generate（仅 content_factory）
├─ /clients
│  ├─ /new
│  └─ /[clientId]
├─ /matches
├─ /content（仅 content_factory）
│  ├─ /new
│  └─ /[contentId]
├─ /publishing（仅 content_factory）
├─ /tasks
├─ /collaboration-requests
├─ /admin（仅 System Admin）
│  ├─ /users
│  ├─ /feature-entitlements
│  ├─ /invites
│  ├─ /ai-usage
│  ├─ /ai-models
│  ├─ /ai-corrections
│  └─ /compliance
└─ /settings
   ├─ /profile
   ├─ /workspace
   ├─ /ai
   └─ /privacy
```

---

# 7. 功能需求

## 7.1 注册、登录、邀请与初始化

## 功能

- 邮箱密码注册与登录
- 邮箱验证码或 Magic Link 可作为增强
- 支持公开注册入口 `/register`
- 支持邀请链接入口 `/join/[inviteToken]`
- 首次登录创建独立 workspace
- 填写经纪人姓名、门店名称、手机号、所在城市和主营区域
- 接受隐私协议和用户协议
- 普通注册用户默认获得基础业务能力
- 不默认授予 `content_factory`

## 邀请链接要求

邀请链接可配置：

- 创建者
- 过期时间
- 最大使用次数
- 是否绑定目标 workspace
- 是否自动加入某个合作圈
- 状态：active、expired、revoked

邀请创建和用户邀请必须在服务端执行，不得把 Supabase Service Role Key 暴露给浏览器。

## 功能授权与管理员后台

管理员路由：

```text
/admin/users
/admin/feature-entitlements
/admin/invites
/admin/ai-usage
/admin/ai-models
/admin/ai-corrections
/admin/compliance
```

`/admin/layout.tsx` 与 `/admin/page.tsx` 由 `data-security-engineer` 负责。

管理员可以：

- 查看用户和工作区基本信息
- 授予或撤销 `content_factory`
- 设置授权有效期
- 查看授权人、授权时间和撤销时间
- 查看 AI 调用次数、Token 和估算成本
- 禁用账号

## 验收标准

- 未登录用户无法访问业务页面
- 登录后只能访问所属 workspace 的私有数据
- 首次登录必须完成最小初始化
- 所有正常注册用户可以使用房源、客户、搜索和匹配
- 未授权用户无法看到内容工厂入口
- 未授权用户直接访问 `/content` 时被拒绝
- 未授权用户调用内容 API 时返回 403
- 系统管理员身份不可由普通用户自行修改
- 退出登录后清理本地会话

## 7.2 今日工作台

## 展示模块

- 今日待办
- 今日新增客户
- 需要跟进客户
- 最近新增房源
- 即将可入住房源
- 最近生成内容（仅内容用户）
- 未发布内容（仅内容用户）
- 最近发布效果（仅内容用户）
- 快捷入口

## 快捷入口

- 快速录房源
- 新增客户
- 生成内容（仅内容用户）
- 记录咨询
- 发布共享房源

## 验收标准

- 首页在移动端首屏展示最重要任务
- 不出现复杂企业报表
- 所有卡片可跳转详情
- 普通用户首页不请求内容相关数据，也不显示内容卡片
- 无数据时展示明确空状态

---

## 7.3 AI 智能录入与视觉理解

## 权限范围

AI 结构化录入、房源图片视觉分析、语义搜索和房客匹配属于基础智能能力，默认向所有正常注册中介开放，与 `content_factory` 分离。

## 输入方式

### 文本输入

- 粘贴微信聊天记录
- 粘贴备忘录
- 手动输入描述
- 输入内容一律视为待提取数据，不得把其中的指令当作系统指令执行

### 语音输入

- 浏览器支持时，可使用 Web Speech API 提供低延迟实时转写，但其结果必须允许编辑。
- 需要更稳定识别时，使用 MediaRecorder 录制音频并调用服务端 STT 适配层。
- 单次录音最长 60 秒；达到上限时前端自动停止录制。
- 录音时显示时长、实时波形、录制状态和剩余时间。
- 允许停止、重录、试听、删除和编辑识别文本。
- 不允许浏览器直接调用任何模型服务，任何密钥只能存在于服务端。
- 不允许通过 Server Action 直接传递 Audio Blob；音频必须提交至独立 Route Handler。

## 房源解析输出

至少包含：

- title
- city
- district
- business_area
- community_name
- address_text
- rental_type
- monthly_rent
- deposit_terms
- bedrooms
- living_rooms
- bathrooms
- area_sqm
- floor
- total_floors
- has_elevator
- orientation
- decoration
- available_from
- minimum_lease_months
- pets_allowed
- cooking_allowed
- subway_text
- facilities
- tags
- selling_points
- drawbacks
- owner_name
- owner_contact
- raw_text
- missing_fields
- uncertain_fields

## 客户解析输出

至少包含：

- name
- phone
- wechat
- source_platform
- budget_min
- budget_max
- preferred_districts
- preferred_communities
- bedrooms
- rental_type
- available_from
- minimum_lease_months
- pets_required
- cooking_required
- commute_destination
- hard_requirements
- soft_preferences
- deal_breakers
- raw_text
- missing_fields
- uncertain_fields

## 房源图片视觉分析

### 处理目标

用户上传房源图片后，系统调用 `DeepSeekVisionProvider` 生成结构化视觉事实，并将结果用于录入确认、事实校验、搜索标签和内容生成。

### 输入与调用边界

- 公共 API 优先接收 `propertyMediaIds`，服务端根据媒体 ID 校验 workspace 权限并生成短期签名 URL。
- Provider 内部接口可以使用 `imageUrls` 数组，但 URL 必须由服务端生成或经过域名白名单和 SSRF 防护。
- 不允许客户端传入任意内网 URL、`file://`、环回地址或云元数据地址。
- 单次视觉分析默认最多 8 张图片；超出时分批处理并合并结果。
- 图片发送前生成适合推理的压缩副本，原始高清图片继续保存在私有 Storage。
- 视觉模型必须是 DeepSeek-VL 系列或后续官方 DeepSeek 多模态模型，通过独立 endpoint 调用。

### 单图视觉标签

每张图片的 `ai_labels` 至少包含：

```json
{
  "sceneType": "living_room",
  "styles": ["modern", "minimal"],
  "visibleFeatures": ["floor_to_ceiling_window", "balcony_door"],
  "condition": ["well_maintained"],
  "lighting": ["bright_natural_light"],
  "appliances": ["air_conditioner"],
  "confidence": 0.86,
  "evidence": ["media-uuid"],
  "uncertainLabels": []
}
```

视觉标签示例：

- 装修风格：简约、法式、工业、原木、现代、中式
- 空间类型：客厅、卧室、厨房、卫生间、阳台、玄关、楼栋外观
- 核心亮点：落地窗、开放式厨房、独立阳台、景观面、智能家电、储物空间
- 房屋状态：维护良好、轻微老化、明显陈旧、待确认
- 光照：自然光充足、一般、偏暗、无法判断

### 整套视觉摘要

完成多图分析后，系统生成 `properties.visual_summary`，例如：

> 整体为简约现代风格，客厅自然采光较好，可见较大窗面；厨房为封闭式，部分柜体存在使用痕迹。卧室和卫生间图片不足，相关状态需线下确认。

视觉摘要必须包含“不足以判断”的边界，不得把未拍摄空间推断为不存在或状态良好。

## 文字与图片事实交叉校验

系统将文字解析结果与视觉事实进行交叉比对，输出 `visual_fact_flags`。

### 校验原则

- 图片中未出现某物，只能标记为“图片未验证”，不能直接断言该事实不存在。
- 只有图片存在明确反证时，才能标记为“疑似冲突”。
- “精装修”“采光好”“装修陈旧”等主观标签必须附带置信度，不得自动覆盖用户输入。
- 所有冲突仅作为提醒，最终以经纪人人工确认和线下事实为准。

### 示例

- 文字写“有阳台”，已上传图片未展示阳台：标记“图片未验证：建议补充阳台照片”。
- 文字写“开放式厨房”，图片明确显示封闭门体：标记“疑似冲突”。
- 文字写“精装修”，视觉标签显示明显老化：标记“描述与视觉状态可能不一致”。
- 图片出现落地窗且置信度较高：可加入视觉亮点，但在用户确认前不得作为已确认事实发布。

## 可视化确认

- 关键字段卡片化展示
- 不确定字段使用黄色标识
- 视觉疑似冲突使用橙色标识
- 高风险事实错误使用红色标识
- 缺失字段使用灰色提示
- 敏感字段使用锁图标
- 展示文字来源与图片证据缩略图
- 用户可以接受、修改或忽略单条视觉建议
- 保存前必须通过 Zod 校验

## AI 纠错 Diff 记录

当房源或客户由 AI 解析产生，客户端保存时必须提交 `requestId`。服务端保存前比较：

```text
original_output
→ user_confirmed_output
→ JSON Diff
→ ai_correction_logs
```

要求：

- Diff 必须在服务端计算，不能信任客户端提交的差异结果。
- 不记录未脱敏的电话、微信和精确地址到纠错日志。
- 只记录发生变化的字段、原值、确认值和修改类型。
- 用户直接手工创建且没有 `requestId` 时不创建 AI 纠错日志。

## 验收标准

- 原始文本必须保留
- AI 不得直接写数据库
- 用户确认后才能保存
- 解析失败时不丢失原始文本
- 隐私字段在调用 DeepSeek 前通过预处理移除或替换
- 文件转写使用 `/api/ai/transcribe`，请求格式为 `multipart/form-data`
- 服务端在调用 STT 前验证登录、文件类型、文件大小和录音时长
- 超过 60 秒或服务器配置大小限制的音频必须在调用 STT 前返回 413/422
- 转写完成后仅将文本传给 `extract-property` 或 `extract-client`，不把音频写入业务数据库
- 图片分析只能访问用户有权读取的媒体
- 每张图片保存结构化 `ai_labels`
- 房源保存整套 `visual_summary` 与 `visual_fact_flags`
- 视觉冲突必须显示证据和置信度
- 图片未展示某特征时不得自动判定该特征不存在
- 带 `requestId` 的 AI 录入保存后必须生成纠错 Diff 日志
- 转写或视觉分析失败时保留已上传素材和已输入文本，允许重试或手工继续

---

## 7.4 房源管理

## 房源状态

```text
draft
available
reserved
rented
offline
expired
deleted
```

## 房源列表

### 卡片字段

- 封面图
- 标题
- 小区
- 区域
- 月租
- 户型
- 面积
- 标签
- 入住时间
- 状态
- 是否共享
- 是否允许营销复用
- 最近内容生成时间（内容用户）

### 筛选条件

- 城市
- 区域
- 商圈
- 小区
- 租金范围
- 户型
- 面积
- 整租/合租
- 可入住时间
- 电梯
- 宠物
- 做饭
- 地铁
- 状态
- 是否共享
- 是否已生成内容

### 排序

- 最近更新
- 租金升序
- 租金降序
- 可入住时间
- 最近生成内容
- 最近发布

## 房源详情

标签页：

- 基本信息
- 图片视频
- 卖点与不足
- 内容中心
- 匹配客户
- 操作记录
- 共享设置
- 营销复用授权

## 软删除

删除后：

- 设置 `deleted_at`
- 默认列表不显示
- 不删除媒体文件
- 不删除关联内容和记录

## 验收标准

- 房源 CRUD 完整可用
- 移动端表单可单手操作
- 所有筛选条件可组合
- 敏感字段默认折叠
- 房源状态变化写入事件日志

---

## 7.5 自然语言语义搜索

## 示例

- “3500 以内、天河、能养猫的一房”
- “下周能入住，近三号线，独立阳台”
- “找最近没发过小红书的两房”
- “找适合珠江新城通勤的整租房”

## 实现原则

AI 仅输出受限制的搜索 JSON，不直接输出 SQL。

### 搜索 JSON 示例

```json
{
  "districts": ["天河区"],
  "monthly_rent_max": 3500,
  "bedrooms": 1,
  "pets_allowed": true,
  "available_before": "2026-08-10",
  "sort_by": "updated_at",
  "sort_order": "desc"
}
```

## 安全要求

- 只允许白名单字段
- 只允许白名单操作符
- 禁止模型返回 SQL
- 查询由服务端函数构造
- 所有查询必须附带 workspace 过滤

## 验收标准

- 不支持的条件应提示用户
- 搜索结果显示已识别筛选条件
- 用户可一键删除某个条件
- 无结果时推荐放宽条件

---

## 7.6 客户 CRM

## 客户阶段

```text
new
qualified
properties_sent
viewing_scheduled
viewed
considering
closed_won
paused
lost
deleted
```

## 客户列表字段

- 姓名或称呼
- 来源平台
- 预算
- 意向区域
- 户型
- 入住时间
- 当前阶段
- 下次跟进
- 最近互动时间
- 匹配房源数量

## 客户详情

- 需求摘要
- 联系方式
- 硬性条件
- 偏好条件
- 不能接受条件
- 来源内容
- 推荐房源
- 已发送房源
- 已看房源
- 沟通记录
- 待办
- 阶段变化记录

## 验收标准

- 客户可从聊天记录解析创建
- 客户可以关联来源内容和房源
- 客户阶段变化写入日志
- 超过设定时间未跟进时在首页提醒
- 联系方式仅当前 workspace 可见

---

## 7.7 房客智能匹配

## 匹配原则

先判断硬性条件，再计算偏好评分。

## 默认评分

- 预算：30
- 区域：20
- 户型：15
- 入住时间：15
- 通勤或地铁：10
- 特殊要求：10

总分 100。

## 硬性条件示例

- 租金不得超过预算上限
- 必须允许宠物
- 必须在指定日期前入住
- 必须整租
- 必须至少两房

## 偏好条件示例

- 朝向
- 装修
- 楼层
- 电梯
- 阳台
- 地铁距离

## 输出

- 匹配分数
- 匹配等级
- 匹配原因
- 不匹配原因
- 需要确认信息
- 推荐下一步操作

## 验收标准

- 硬性条件不满足时不得标记为高匹配
- 输出可解释
- 用户可手工调整权重
- 用户可以标记“已发送”“已带看”“不推荐”

---

## 7.8 合作共享库

## 发布共享字段

可展示：

- 城市
- 区域
- 商圈
- 小区
- 户型
- 面积
- 租金
- 入住时间
- 图片
- 卖点
- 不足
- 标签
- 佣金分成
- 联系经纪人按钮

默认隐藏：

- 房东姓名
- 房东电话
- 房东微信
- 客户信息
- 具体门牌号
- 内部备注
- 原始聊天记录
- 精确钥匙位置

## 分享配置

共享展示与营销复用必须分开配置：

- `is_shared`：是否进入合作共享库
- `allow_marketing_reuse`：是否允许拥有内容权限的指定用户使用该房源生成营销内容

其他配置：

- 是否显示小区名
- 是否显示大致位置
- 是否显示完整图片
- 是否显示租金
- 分成方式
- 合作备注
- 有效期

## 合作请求

状态：

```text
pending
accepted
rejected
cancelled
completed
```

## 验收标准

- 未共享房源不出现在共享库
- 外部用户永远无法读取敏感字段
- 共享库查询通过专用视图或专用 RPC
- 用户可随时下架
- 下架后外部用户不可继续访问
- 开启共享不自动开启营销复用
- 关闭营销复用后，不得继续创建新的内容项目
- 合作联系行为写入日志

---

## 7.9 AI 内容工作台

## 使用权限

本模块仅允许拥有有效 `content_factory` entitlement 的用户使用。有效条件：

- `status = active`
- `expires_at` 为空或晚于当前时间
- 当前账号未被禁用
- 未触发每日次数配额或成本熔断

权限必须在以下三层同时检查：

1. 前端：隐藏内容导航、按钮和数据请求。
2. Next.js 服务端：Layout、Server Action、Route Handler 检查。
3. Supabase：内容表、发布表和内容素材 Storage 的 RLS 检查。

普通用户即使手工访问页面、调用 API 或直接请求 Supabase，也必须被拒绝。

## DeepSeek 模型约束

- 内容生成仅调用 DeepSeek 文本模型。
- 不得配置 OpenAI、Anthropic、Gemini 等其他 LLM 回退。
- 主模型与备用模型都必须为 DeepSeek 模型，模型名称通过管理员配置或环境变量提供。
- 内容 Prompt 可使用已确认结构化字段、`visual_summary` 和经用户确认的 `ai_labels`。
- 未经用户确认的视觉标签只能作为“建议素材”，不得直接写成确定事实。

## 每日配额与成本防刷

即使用户拥有 `content_factory`，也必须同时受到每日生成次数和每日成本限制。

- 默认次数上限来自 `AI_DAILY_CONTENT_LIMIT`。
- 默认成本熔断线来自 `AI_DAILY_COST_LIMIT_USD`，默认值可设为 10 美元。
- 配额按“用户 + 功能 + 配额日期”统计；日期使用 `AI_QUOTA_TIMEZONE`。
- 前端展示的剩余次数和成本仅用于体验，服务端结果才是最终依据。
- `/api/ai/generate-content` 调用 DeepSeek 前必须执行原子配额与成本预占。
- 超过次数上限或成本熔断线时返回 `429 Too Many Requests`，不得调用模型。
- 配额检查、成本预估和用量写入必须在同一数据库事务或原子 RPC 中完成。
- 请求必须携带或由服务端生成 `idempotency_key`，相同请求重试不得重复扣减。
- 成功后使用 DeepSeek 返回的 Token Usage 对预估成本进行结算修正。
- 管理员可以设置用户级覆盖上限、解除熔断或暂停 AI 权限。

## 可使用的房源范围

内容用户只能对以下房源生成内容：

1. 当前用户所在 workspace 自己拥有的房源；
2. 已进入共享库且 `allow_marketing_reuse = true` 的其他工作区房源。

不得使用：

- 未共享的其他工作区房源
- 仅允许查看但未允许营销复用的房源
- 已出租、下架、过期或删除的房源
- 没有素材使用授权的图片或视频

## 支持平台

MVP：

- 小红书
- 抖音
- 微信朋友圈

V1：

- 视频号
- 公众号
- 房产平台详情页

## 生成参数

- 房源
- 目标平台
- 目标客群
- 内容角度
- 内容目标
- 语气
- 是否真人出镜
- 视频时长
- 是否展示缺点
- 私信口令

## 视觉上下文增强

内容 Prompt 必须包含：

- 已确认的房源结构化事实
- `properties.visual_summary`
- 已经用户确认的 `property_media.ai_labels`
- 每个视觉事实的媒体证据 ID
- 图片中无法判断的缺失项
- 文字与视觉之间尚未解决的冲突

示例：

```text
图片证据显示客厅存在较大窗面，自然光较充足，置信度 0.88。
在开头可以强调“通透感”，但不得虚构朝向、景观楼层或全天采光时长。
```

若存在未解决的高风险事实冲突，内容仍可生成草稿，但必须标记 `requires_fact_review = true`，并禁止进入可复制状态。

## 内容角度

- 房源实拍
- 通勤租房
- 同预算对比
- 小区生活
- 租房避坑
- 一周房源合集
- 宠物友好
- 地铁沿线
- 真实优缺点
- 适合谁/不适合谁
- 毕业生租房
- 情侣租房
- 独居租房

## 小红书输出结构

- title_options：3 个
- cover_text
- hook
- body
- image_sequence
- image_captions
- factual_summary
- drawbacks
- interaction_question
- private_message_keyword
- hashtags
- facts_used
- visual_facts_used
- missing_information
- risk_flags
- compliance_flags
- requires_fact_review

## 抖音输出结构

- hook_options：3 个
- cover_text
- full_voiceover
- shots
- subtitles
- caption
- comment_cta
- private_message_keyword
- hashtags
- missing_shots
- facts_used
- visual_facts_used
- missing_information
- risk_flags
- compliance_flags
- requires_fact_review

## 朋友圈输出结构

- copy_options：3 个
- nine_grid_suggestion
- short_cta
- private_message_keyword
- facts_used
- visual_facts_used
- risk_flags
- compliance_flags
- requires_fact_review

## 事实安全

内容生成前，将房源信息分为：

### 已确认事实

可直接使用。

### 已确认视觉事实

由 DeepSeek 视觉模型识别并经用户确认，可使用，但必须保留证据媒体 ID。

### 主观判断

必须弱化表达，例如“相对”“比较”“更适合”。

### 未确认信息

不得生成事实性结论。

## 合规预检 Compliance Shield

内容生成后、返回可复制状态前，必须经过 `utils/compliance-check.ts` 或等价服务端模块扫描。

### 风险词库

系统维护可配置的房产营销风险词库，包括但不限于：

- 极限与绝对化：最、第一、顶级、绝对、百分百
- 投资承诺：投资回报率、保值增值、稳赚、保证升值
- 教育属性：学区、学位保证、入读保证
- 稀缺与催促：最后一套、错过不再、今天必须定
- 未经证实的价格与资格：全网最低、内部价、保证办理

风险词命中不等于最终法律结论。系统按词条配置区分：

- `block`：必须删除或修改，不能通过用户确认绕过。
- `review`：允许有权限用户填写确认理由后继续。
- `highlight`：仅高亮提示。

### 复制拦截

- 存在未解决 `block` 风险时，禁用“一键复制”和“标记待发布”。
- 存在 `review` 风险时，用户必须修改或填写确认理由。
- 所有处理动作写入审计日志。
- 内容保存 `compliance_status`、命中词、位置、类别、严重级别和处理状态。

## 用户反馈

内容结果下方显示 👍 / 👎。

点击 👎 后显示快捷原因：

- 事实错误
- 语气不对
- 太罗嗦
- 格式错误
- 平台感不强
- 其他

反馈写入 `ai_correction_logs`，并关联 `content_version_id`、Prompt 版本和模型版本。

## 验收标准

- 未授权用户必须在所有入口被拒绝
- 所有内容 LLM 调用必须使用 DeepSeek
- AI 输出通过 JSON Schema 和 Zod 校验
- 失败时自动重试一次；重试仍使用 DeepSeek 备用模型或备用 DeepSeek endpoint
- 生成内容必须显示文字事实与视觉事实来源
- 未确认视觉标签不得作为确定事实
- 存在高风险事实冲突时禁止复制
- 内容可编辑并保存多个版本
- 可复制单个模块或全部内容，但必须先通过合规预检
- 可标记草稿、待发布、已发布、停用
- 👍/👎 与负反馈原因必须持久化
- 超出每日次数或成本限制返回 429，且不得调用 DeepSeek

---

## 7.10 内容发布与归因

## 内容状态

```text
draft
ready
published
archived
```

## 发布记录字段

- 平台
- 内容版本
- 发布时间
- 发布链接
- 内容编号
- 私信口令
- 阅读/播放
- 点赞
- 收藏
- 评论
- 私信
- 有效咨询
- 带看
- 成交

## 归因逻辑

客户可通过以下任一方式关联内容：

- 选择来源内容
- 输入私信口令
- 选择首次咨询房源
- 手工指定来源平台

## 验收标准

- 每条发布内容有唯一编号
- 私信口令默认自动生成，可编辑
- 客户详情展示来源内容
- 内容详情展示关联客户和成交

---

## 7.11 待办与跟进

## 任务类型

- 联系客户
- 发送房源
- 确认带看
- 跟进带看
- 更新房源状态
- 联系房东
- 发布内容
- 更新内容数据
- 跟进合作请求

## 任务状态

```text
todo
in_progress
done
cancelled
```

## 验收标准

- 可关联客户、房源、内容或合作请求
- 首页展示今日到期和逾期任务
- 完成任务记录完成时间
- 支持快速延期一天或三天

---

## 7.12 系统管理员 AI 管理看板

## 页面

```text
/admin/ai-usage
/admin/ai-models
/admin/compliance
/admin/ai-corrections
```

## 成本统计

`/admin/ai-usage` 展示：

- 今日、近 7 日、近 30 日总 Token 与估算成本
- 按用户、workspace、功能、模型、状态分组
- 单用户平均生成成本
- 成功、失败、合规拒绝和配额拒绝次数
- 内容用户每日成本上限和当前剩余额度
- 视觉分析与文本生成成本分开统计

模型价格不得散落硬编码在业务代码中，应从 `ai_model_pricing` 表或受控配置读取，并带生效时间。

## 成本熔断

- 默认单用户每日成本熔断线为 10 美元，可由管理员配置。
- `reserve_ai_quota` 必须同时统计成功成本和未过期预占成本。
- 达到熔断线后，用户的相关 AI 请求立即返回 429。
- 系统记录 `blocked_by_cost_limit` 状态和熔断原因。
- 管理员可提高上限、临时解除或手动恢复。
- 恢复动作必须写入 `audit_logs`。

## DeepSeek 主备模型热切换

全站只允许 DeepSeek 模型之间切换。

### 文本能力

- 主模型：`DEEPSEEK_TEXT_MODEL_PRIMARY`
- 备用模型：`DEEPSEEK_TEXT_MODEL_FALLBACK`
- 主、备模型都必须来自 DeepSeek。

### 视觉能力

- 主端点：`DEEPSEEK_VISION_BASE_URL_PRIMARY`
- 备用端点：`DEEPSEEK_VISION_BASE_URL_FALLBACK`
- 两个端点都必须部署 DeepSeek-VL 或后续 DeepSeek 多模态模型。

### 熔断规则

- 同一能力在可配置时间窗口内连续 3 次出现 5xx、连接失败或超时，打开 circuit breaker。
- 新请求自动转到备用 DeepSeek 模型或备用 DeepSeek endpoint。
- 4xx、权限错误、Schema 错误和合规拒绝不得计入供应商故障次数。
- 管理员可在 `/admin/ai-models` 一键强制使用主模型、备用模型或自动模式。
- 配置中不得保存明文 API Key，只保存环境变量引用或密钥标识。
- 所有切换、恢复和健康状态变化写入审计日志。

## 合规词库管理

管理员可以：

- 新增、编辑、停用风险词
- 设置类别、严重级别和匹配方式
- 设置 `block`、`review`、`highlight`
- 查看命中次数和处理结果
- 导入版本化词库
- 回滚到上一版本

普通内容用户不能修改全局词库。

## AI 纠错分析

`/admin/ai-corrections` 展示：

- 高频被修改字段
- 原值到确认值的常见映射
- 各功能负反馈率
- 各 Prompt 版本的纠错率
- 用户偏好学习生效情况

不得在管理员分析页面展示无必要的明文联系方式或精确地址。


# 8. 数据库设计

## 8.1 数据库原则

- 使用 UUID 主键
- 所有时间使用 UTC
- 前端按用户时区展示
- 所有核心表包含 `created_at`、`updated_at`
- 可删除业务表包含 `deleted_at`
- 使用 `workspace_id` 隔离数据
- 敏感字段尽量独立存储
- JSONB 只用于灵活数据，不替代核心结构化字段
- 为高频筛选字段建立索引

## 8.2 表清单

### profiles

```text
id
full_name
phone
avatar_url
city
created_at
updated_at
```

### workspaces

```text
id
name
owner_user_id
city
business_type
created_at
updated_at
```

### workspace_members

```text
id
workspace_id
user_id
role
status
created_at
```

### properties

```text
id
workspace_id
created_by
title
city
district
business_area
community_name
address_text
building_no
unit_no
room_no
rental_type
monthly_rent
deposit_terms
bedrooms
living_rooms
bathrooms
area_sqm
floor
total_floors
has_elevator
orientation
decoration
available_from
minimum_lease_months
pets_allowed
cooking_allowed
subway_text
facilities jsonb
tags text[]
selling_points text[]
drawbacks text[]
description
visual_summary
visual_fact_flags jsonb
status
is_shared
allow_marketing_reuse
marketing_reuse_granted_at
shared_at
shared_expires_at
commission_split
raw_input_text
source_type
created_at
updated_at
deleted_at
```

### property_private_details

```text
id
property_id
workspace_id
owner_name
owner_phone
owner_wechat
exact_address
internal_notes
key_location
created_at
updated_at
```

### property_media

```text
id
workspace_id
property_id
storage_path
media_type
scene_tag
is_cover
sort_order
width
height
duration_seconds
ai_labels jsonb
ai_analysis_status
ai_analyzed_at
created_at
deleted_at
```

### clients

```text
id
workspace_id
created_by
name
phone
wechat
source_platform
source_content_id
first_property_id
budget_min
budget_max
preferred_districts text[]
preferred_communities text[]
bedrooms
rental_type
available_from
minimum_lease_months
pets_required
cooking_required
commute_destination
hard_requirements jsonb
soft_preferences jsonb
deal_breakers text[]
stage
raw_input_text
next_follow_up_at
last_interaction_at
created_at
updated_at
deleted_at
```

### interactions

```text
id
workspace_id
client_id
property_id
interaction_type
summary
raw_text
next_action
occurred_at
created_by
created_at
```

### property_matches

```text
id
workspace_id
property_id
client_id
score
match_level
matched_reasons jsonb
unmatched_reasons jsonb
needs_confirmation jsonb
status
created_at
updated_at
```

### content_projects

```text
id
workspace_id
property_id
created_by
platform
target_audience
content_angle
content_goal
tone
video_duration_seconds
is_on_camera
status
private_message_keyword
created_at
updated_at
deleted_at
```

### content_versions

```text
id
workspace_id
content_project_id
version_number
model_provider
model_name
prompt_version
input_snapshot jsonb
output_json jsonb
facts_used jsonb
missing_information jsonb
risk_flags jsonb
compliance_status
compliance_flags jsonb
feedback_score
feedback_type
feedback_comment
created_by
created_at
```

### publishing_records

```text
id
workspace_id
content_project_id
content_version_id
platform
published_at
post_url
content_code
private_message_keyword
views
likes
favorites
comments
direct_messages
qualified_leads
viewings
deals
created_at
updated_at
```

### tasks

```text
id
workspace_id
assigned_to
task_type
title
description
property_id
client_id
content_project_id
collaboration_request_id
status
due_at
completed_at
created_at
updated_at
deleted_at
```

### leads

```text
id
workspace_id
source_platform
source_content_id
source_property_id
private_message_keyword
name
phone
wechat
raw_message
is_qualified
converted_client_id
created_at
updated_at
```

### collaboration_requests

```text
id
requester_workspace_id
owner_workspace_id
property_id
message
status
requested_at
responded_at
created_at
updated_at
```

### feature_entitlements

```text
id
user_id
feature
status
granted_by
granted_at
expires_at
revoked_at
created_at
updated_at
```

唯一约束：`unique(user_id, feature)`。

建议枚举：

```text
feature_key: ai_data_extraction | semantic_search | property_matching | shared_property_pool | content_factory
entitlement_status: active | revoked
```

### system_admins

```text
id
user_id
status
created_by
created_at
revoked_at
```

普通客户端不可写入。

### invitation_links

```text
id
token_hash
created_by
target_workspace_id
max_uses
used_count
expires_at
status
created_at
updated_at
```

不得明文存储可直接使用的邀请 Token，只保存 Hash。

### ai_usage_logs

```text
id
user_id
workspace_id
action
feature
provider
model
capability
input_tokens
output_tokens
estimated_cost_usd
reserved_estimated_cost_usd
quota_date
quota_units
status
compliance_flags jsonb
idempotency_key
request_id
reservation_expires_at
error_code
created_at
updated_at
```

日志不得包含明文手机号、微信号、精确地址或完整 Prompt。

`provider` 固定为 `deepseek` 或 `deepseek_self_hosted`；STT 使用独立日志功能标识，不得伪装成 DeepSeek LLM。

`status` 至少支持：

```text
reserved
succeeded
failed
rejected
rejected_compliance
blocked_by_cost_limit
```

内容配额与成本必须通过数据库 RPC 原子预占，禁止使用“先 count 再 insert”的两次独立请求实现，否则并发调用可能绕过上限。


### ai_correction_logs

```text
id
user_id
workspace_id
feature
request_id
entity_type
entity_id
content_version_id
prompt_version
model_name
original_output jsonb
corrected_output jsonb
diff jsonb
feedback_score
feedback_type
feedback_comment
created_at
```

隐私要求：`original_output`、`corrected_output` 和 `diff` 在写入前必须删除电话、微信、精确地址、钥匙位置等敏感字段。

### ai_user_preferences

```text
id
user_id
workspace_id
feature
preference_key
preference_value jsonb
evidence_count
confidence
status
source_correction_ids uuid[]
created_at
updated_at
```

仅当同类纠错达到配置阈值后生成偏好。偏好只能影响分类倾向、文案语气、长度和格式，不得覆盖价格、面积、联系方式等事实字段。

### ai_model_pricing

```text
id
provider
model
capability
input_usd_per_million_tokens
output_usd_per_million_tokens
image_unit_price_usd
currency
effective_from
effective_to
status
created_at
updated_at
```

价格配置必须版本化，历史用量按请求发生时生效的价格估算。

### ai_user_limits

```text
id
user_id
feature
daily_request_limit
daily_cost_limit_usd
status
blocked_at
blocked_reason
manually_restored_at
restored_by
created_at
updated_at
```

### ai_runtime_config

```text
id
capability
provider
primary_model
fallback_model
primary_endpoint_key
fallback_endpoint_key
mode
failure_threshold
failure_window_seconds
circuit_open_until
updated_by
created_at
updated_at
```

`provider` 仅允许 DeepSeek；表中不得保存明文密钥。

### compliance_terms

```text
id
term
category
severity
match_type
replacement_suggestion
status
version
created_by
created_at
updated_at
```

### compliance_review_logs

```text
id
workspace_id
content_version_id
user_id
flag_id
action
reason
before_text
after_text
created_at
```

### audit_logs

```text
id
workspace_id
actor_user_id
entity_type
entity_id
action
before_data jsonb
after_data jsonb
ip_address
user_agent
created_at
```

## 8.3 索引建议

- workspace_members(workspace_id, user_id) UNIQUE
- workspace_members(user_id, workspace_id, status)
- properties(workspace_id, status, deleted_at)
- properties(workspace_id, district, monthly_rent)
- properties(workspace_id, available_from)
- properties(is_shared, shared_expires_at)
- clients(workspace_id, stage, deleted_at)
- clients(workspace_id, next_follow_up_at)
- tasks(workspace_id, status, due_at)
- content_projects(workspace_id, platform, status)
- publishing_records(workspace_id, published_at)
- collaboration_requests(owner_workspace_id, status)
- property_media(property_id, ai_analysis_status)
- ai_correction_logs(user_id, feature, created_at desc)
- ai_usage_logs(user_id, quota_date, feature, status)
- ai_usage_logs(capability, status, created_at desc)
- ai_user_limits(user_id, feature)
- compliance_terms(status, severity, term)
- ai_model_pricing(provider, model, capability, effective_from)
- feature_entitlements(user_id, feature, status)
- feature_entitlements(feature, status, expires_at)
- system_admins(user_id, status)
- invitation_links(status, expires_at)
- ai_usage_logs(user_id, created_at)
- ai_usage_logs(user_id, feature, quota_date, status)
- ai_usage_logs(user_id, feature, idempotency_key) UNIQUE
- ai_usage_logs(feature, status, created_at)

---

# 9. RLS 与功能授权设计

## 9.1 辅助函数与 RLS 性能要求

必须创建：

```text
is_workspace_member(workspace_uuid uuid)
is_workspace_owner(workspace_uuid uuid)
is_system_admin()
has_feature(requested_feature feature_key)
reserve_ai_quota(...)
```

`has_feature` 根据 `auth.uid()` 检查：

- 用户存在有效 entitlement
- status 为 active
- expires_at 为空或尚未过期
- 用户未被禁用

函数应使用固定 `search_path`，并仅向需要的数据库角色授予 execute。

### RLS 性能与递归规避

1. 必须为 `workspace_members(workspace_id, user_id)` 建立联合唯一索引，并为反向查询建立 `workspace_members(user_id, workspace_id, status)` 索引。
2. 高频业务表的私有数据策略优先使用一次、可索引的 `EXISTS` 成员关系判断，避免一个 Policy 嵌套调用多个辅助函数。
3. 辅助函数必须保持最小职责。`is_workspace_member` 只查询 `workspace_members`，不得再查询 `properties`、`clients` 或调用自身。
4. 不得在 `workspace_members` 自身的 RLS Policy 中再次调用 `is_workspace_member`，避免递归策略。
5. 若使用 `SECURITY DEFINER`，函数必须位于非公开 schema、固定 `search_path`、完整限定表名，并严格限制 execute 权限。
6. 在 Policy 中可使用 `(select auth.uid())` 或 `(select auth.jwt())`，避免对每一行重复计算认证函数。
7. JWT Claim 仅用于系统管理员、粗粒度套餐等低频变化权限；需要立即生效的 workspace 成员关系和 entitlement 仍以数据库记录为准，避免 JWT 过期前权限滞后。
8. 私有房源与共享房源查询必须分离。不得在私有 `properties` Policy 中简单加入 `OR is_shared = true`；共享列表应通过专用脱敏 View/RPC 查询。
9. 对主要列表使用 `EXPLAIN (ANALYZE, BUFFERS)` 验证索引命中，测试数据达到至少 10 万条房源时，常用查询仍应满足性能目标。

## 9.2 基础业务数据规则

普通中介可以读取和维护其所属 workspace 的：

- properties
- property_private_details
- property_media
- clients
- interactions
- property_matches
- tasks
- leads

所有策略必须同时检查：

```text
auth.uid() 已登录
AND is_workspace_member(workspace_id)
AND deleted_at is null（适用时）
```

## 9.3 内容数据规则

以下表必须额外要求 `has_feature('content_factory')`：

- content_projects
- content_versions
- publishing_records
- 内容专用 Storage

示例逻辑：

```text
has_feature('content_factory')
AND is_workspace_member(workspace_id)
```

普通用户不得通过 Supabase 客户端直接读取、写入或更新内容表。

## 9.4 内容房源访问规则

内容生成时，服务端必须验证房源满足以下任一条件：

```text
property.workspace_id 属于当前用户工作区
OR
(property.is_shared = true AND property.allow_marketing_reuse = true)
```

同时要求房源：

- status = available
- deleted_at is null
- 共享授权未过期

## 9.5 共享房源规则

外部用户只能通过专用脱敏视图或 RPC 读取：

- `is_shared = true`
- `status = available`
- 未过期
- 未删除

共享视图不得包含：

- 房东姓名、电话、微信
- 客户数据
- 精确地址和门牌号
- 原始输入文本
- 内部备注和钥匙位置

## 9.6 AI 纠错、用量与偏好数据规则

- 用户只能读取自己产生的 `ai_correction_logs` 和 `ai_user_preferences`。
- 用户只能删除或停用自己的偏好，不得修改证据数量和置信度。
- 普通用户不得直接插入 `ai_usage_logs`，所有用量写入由服务端或受控 RPC 完成。
- 内容用户只能查看自己的用量摘要，不能读取其他用户 Token、成本或错误详情。
- `ai_model_pricing`、`ai_runtime_config`、`ai_user_limits` 和 `compliance_terms` 仅系统管理员可写。
- `compliance_review_logs` 的创建必须验证用户对对应内容版本有访问权限。
- 纠错日志、偏好记录和合规记录中的 JSON 字段必须在服务端先脱敏再写入。

## 9.7 管理员规则

- 普通用户不能读取或写入 `system_admins`。
- 普通用户不能给自己授予 `content_factory`。
- `feature_entitlements` 的写入只能通过系统管理员服务端接口执行。
- `ai_runtime_config` 不得保存明文密钥，普通用户不可读写。
- `ai_model_pricing` 与全局 `compliance_terms` 仅管理员可维护。
- Service Role Key 只存在于服务端。
- 授权、撤销、成本恢复、模型切换、词库修改和熔断重置必须写入 `audit_logs`。

## 9.8 Storage 策略

建议 Bucket：

- `property-private`
- `property-shared`
- `content-assets`
- `avatars`

规则：

- 私有媒体仅 workspace 成员可访问
- 共享媒体通过派生文件或独立共享 bucket 提供
- 内容素材仅 `content_factory` 用户可写入
- 不直接暴露私有 bucket 永久公开 URL
- 使用签名 URL
- 下架共享房源后撤销共享媒体访问

---

# 10. AI、视觉与语音系统设计

## 10.1 DeepSeek-only 模型边界

所有大语言模型和视觉语言模型统一使用 DeepSeek：

- 文本抽取、客户解析、搜索解析、内容生成：DeepSeek 文本模型。
- 图片理解和视觉事实提取：DeepSeek-VL 系列或后续 DeepSeek 多模态模型。
- 语音转文本：独立 STT 子系统，不属于 LLM；不得让文本模型模拟语音识别。

禁止：

- 配置 OpenAI、Anthropic、Gemini 等 LLM API Key。
- 以其他厂商模型作为运行时回退。
- 因 DeepSeek 接口兼容 OpenAI SDK，就把 `provider` 记录为 OpenAI。
- 将图片直接发送到未声明支持视觉输入的 DeepSeek 文本接口。

## 10.2 语音转文本（STT）处理路径

### 前端录音

- 使用 `MediaRecorder` 录制音频。
- 首选浏览器支持良好的压缩格式，例如 `audio/webm`；Safari 不支持时根据实际能力回退。
- 单次录音最长 60 秒。
- 前端在录制阶段显示波形、时长和剩余时间。
- 录音停止后生成 Audio Blob，允许试听、删除和重新录制。
- Web Speech API 可作为实时转写增强，但不可作为唯一方案。

### 上传与服务端处理

```text
MediaRecorder Audio Blob
→ POST /api/ai/transcribe
→ multipart/form-data
→ Route Handler 验证
→ TranscriptionProvider
→ 独立 STT 服务
→ 返回纯文本与可选分段
→ 用户确认文本
→ DeepSeek extract-property 或 extract-client
```

技术约束：

- 不使用 Server Action 接收二进制 Audio Blob。
- Route Handler 使用 Node.js runtime。
- 请求 Content-Type 必须为 `multipart/form-data`。
- 服务端先验证登录、功能权限、MIME、文件大小和时长。
- 文件不得转成 Base64 放入 JSON。
- 服务端以 File/Readable Stream 形式转发给 STT Provider。
- 音频默认不持久化；临时对象必须在请求完成后删除。
- STT 密钥不得进入客户端。
- 服务端设置超时和 AbortController。
- 转写完成后，结构化提取只接收文本，不重复传送音频。

### 文件限制

MVP 默认：

```text
max_duration_seconds = 60
max_upload_bytes = 10 MB
accepted_types =
  audio/webm
  audio/mp4
  audio/mpeg
  audio/wav
  audio/x-m4a
```

## 10.3 DeepSeek 模型适配层

```ts
interface TranscriptionProvider {
  transcribe(input: TranscriptionInput): Promise<TranscriptionResult>
}

interface DeepSeekTextProvider {
  extractProperty(input: PropertyExtractionInput): Promise<PropertyExtractionResult>
  extractClient(input: ClientExtractionInput): Promise<ClientExtractionResult>
  parsePropertySearch(input: SearchParseInput): Promise<PropertySearchFilters>
  generateContent(input: ContentGenerationInput): Promise<GeneratedContent>
}

interface DeepSeekVisionProvider {
  analyzePropertyImages(input: {
    imageUrls: string[]
    propertyFacts: RedactedPropertyFacts
    schemaVersion: string
  }): Promise<PropertyVisionResult>
}
```

实现要求：

- `DeepSeekTextProvider` 使用 DeepSeek 官方 API 或受控 DeepSeek 推理端点。
- `DeepSeekVisionProvider` 使用部署 DeepSeek-VL 权重的独立 GPU endpoint。
- 视觉端点不得部署在 Vercel Serverless Function 内。
- Provider 返回统一 Usage 与错误类型，便于成本和健康监控。
- 模型名称不得散落硬编码在页面和 Route Handler 中。

## 10.4 视觉理解与事实交叉校验

处理流程：

```text
propertyMediaIds
→ 校验 workspace / 共享权限
→ 生成短期签名 URL 或受控代理 URL
→ 图片压缩与批处理
→ DeepSeekVisionProvider
→ 单图 ai_labels
→ 多图 visual_summary
→ 与结构化文字事实交叉校验
→ visual_fact_flags
→ 用户确认
```

视觉输出必须结构化并通过 Zod 校验，至少包含：

- scene_type
- styles
- visible_features
- condition
- lighting
- appliances
- confidence
- evidence_media_ids
- uncertain_labels
- visual_summary
- fact_checks

事实交叉校验必须区分：

- `confirmed_visual_support`
- `not_verified_by_images`
- `possible_conflict`
- `insufficient_evidence`

不得把“图片没拍到”当作“房源没有”。

## 10.5 提示词版本、纠错日志与用户偏好学习

每次 AI 请求保存：

- prompt_version
- schema_version
- model_provider = deepseek
- model_name
- input_snapshot
- output_json
- request_id

### Diff 记录

当保存房源或客户且存在 `requestId`：

1. 服务端读取对应 AI 原始输出。
2. 对隐私字段进行脱敏或排除。
3. 比较 AI 原始输出与用户确认输出。
4. 保存字段级 JSON Diff 至 `ai_correction_logs`。

### 偏好学习

- 仅在同类纠错达到 `AI_PREFERENCE_MIN_EVIDENCE` 后生成偏好。
- 例如同一用户至少 3 次把 `residential` 改为 `apartment`，可形成低权重分类提示。
- 偏好以显式 Prompt Hint 注入，不进行在线模型微调。
- 偏好必须有置信度、证据数量和关闭开关。
- 用户可在设置中查看并删除已学习偏好。
- 不得学习或自动改写价格、面积、联系方式、精确地址等事实字段。
- 内容反馈可学习语气、长度、Emoji 密度、结构偏好和平台风格。

## 10.6 隐私预处理

发送 DeepSeek 前移除：

- owner_name
- owner_phone
- owner_wechat
- client_phone
- client_wechat
- exact_address
- building_no
- unit_no
- room_no
- internal_notes
- key_location

图片处理还必须：

- 移除不必要 EXIF 元数据。
- 禁止将永久公开 URL 发送给视觉端点。
- 视觉端点不得持久化原图，除非有明确配置和数据协议。

## 10.7 Structured Output

所有 DeepSeek 文本与视觉接口使用 JSON Schema，并通过 Zod 校验。

```text
模型返回
→ JSON 解析
→ Zod 校验
→ 文字事实校验
→ 视觉事实校验
→ 合规扫描
→ 保存
```

## 10.8 事实校验与合规预检

生成内容中的 `facts_used` 和 `visual_facts_used` 必须映射到输入字段或确认后的视觉证据。

如果输出包含不存在的事实：

- 标记 `risk_flag`
- `requires_fact_review = true`
- 禁止进入可复制状态

合规扫描必须在服务端执行，结果写入：

- `content_versions.compliance_status`
- `content_versions.compliance_flags`
- `ai_usage_logs.compliance_flags`

如果被 `block` 级规则拒绝，AI Usage 状态可以更新为 `rejected_compliance`。

## 10.9 次数配额与成本原子拦截

禁止：

```text
SELECT count(...)
→ 应用判断
→ INSERT usage log
```

必须实现数据库 RPC：

```text
reserve_ai_quota(
  p_user_id,
  p_workspace_id,
  p_feature,
  p_capability,
  p_quota_date,
  p_request_limit,
  p_daily_cost_limit_usd,
  p_reserved_estimated_cost_usd,
  p_idempotency_key,
  p_request_id
)
```

RPC 在单事务中：

1. 校验相同 `idempotency_key` 是否已存在。
2. 锁定用户当日配额维度。
3. 统计有效预占和成功次数。
4. 统计成功成本与未过期预占成本。
5. 超过次数限制时返回 `limit_reason = request_limit`。
6. 超过成本限制时返回 `limit_reason = cost_limit`。
7. 未超过时插入 `status = reserved`。
8. 返回剩余次数和成本额度。

模型调用完成后：

- 成功：用真实 Token Usage 结算为 `succeeded`。
- DeepSeek 调用失败：更新为 `failed`。
- 合规阻断：更新为 `rejected_compliance`。
- 成本熔断：更新或记录 `blocked_by_cost_limit`。
- 过期预占通过 `reservation_expires_at` 失效。

## 10.10 DeepSeek 健康检查与热切换

- 每个 capability 维护主模型、备用模型和主/备用 endpoint。
- 文本主备必须都是 DeepSeek 文本模型。
- 视觉主备必须都是 DeepSeek-VL 系列部署。
- 连续 3 次 5xx、超时或连接失败后打开 circuit breaker。
- 自动模式下后续请求切换至备用 DeepSeek 模型/endpoint。
- 4xx、权限拒绝、Schema 失败、事实冲突和合规拒绝不计为供应商健康失败。
- 管理员可强制 primary、fallback 或 auto。
- 恢复主模型前进行健康探测，避免请求抖动。

## 10.11 错误处理

- 超时：最多重试一次
- 限流：返回友好提示
- JSON 格式错误：使用 DeepSeek 备用模型进行一次结构修复
- 文本主模型不可用：切换 DeepSeek 文本备用模型
- 视觉主端点不可用：切换 DeepSeek-VL 备用端点
- 禁止把完整敏感请求写入日志
- 每次成功、失败、预占、合规拒绝或成本拒绝均写入脱敏使用日志

---

# 11. API 与服务端契约

建议优先使用 Route Handlers 或 Server Actions；二进制上传必须使用 Route Handler。

## 11.1 语音转文本

```text
POST /api/ai/transcribe
Content-Type: multipart/form-data
```

表单字段：

```text
audio: File（必填）
purpose: property|client（可选）
language: zh（可选）
requestId: uuid（建议）
```

成功输出：

```json
{
  "text": "转写后的文本",
  "segments": [],
  "durationSeconds": 32.5,
  "provider": "configured_stt",
  "requestId": "uuid"
}
```

错误约定：

- 未登录：401
- 无基础智能权限：403
- 文件缺失或格式错误：400
- 文件过大：413
- 录音超过 60 秒或内容不可处理：422
- 请求过于频繁：429
- STT 服务失败：502
- 服务端超时：504

处理要求：

- 必须在调用 STT 前完成文件验证。
- 不得在客户端暴露 STT API Key。
- 不得把音频以 Base64 JSON 传输。
- 不得把 Audio Blob 直接传给 Server Action。
- 音频默认不持久化。
- 转写接口只返回文本，不直接创建房源或客户。
- 用户确认文本后，再调用结构化提取接口。

## 11.2 房源解析

```text
POST /api/ai/extract-property
```

输入：

```json
{
  "text": "string",
  "sourceType": "text|speech|wechat",
  "requestId": "uuid"
}
```

输出：

```json
{
  "data": {},
  "missingFields": [],
  "uncertainFields": [],
  "requestId": "uuid"
}
```


## 11.3 房源图片视觉分析

```text
POST /api/ai/analyze-property-images
```

公共请求输入：

```json
{
  "propertyId": "uuid",
  "propertyMediaIds": ["uuid"],
  "requestId": "uuid"
}
```

要求：

- 不接受未经校验的任意公网或内网 URL。
- 服务端校验房源与媒体访问权限后，生成短期图片 URL。
- 内部 `DeepSeekVisionProvider` 支持 `imageUrls` 数组。
- 所有图片调用必须使用 DeepSeek 视觉模型 endpoint。
- 单次默认最多 8 张图片。
- 返回单图标签、整套摘要、事实交叉校验和置信度。
- 视觉分析可以异步显示处理中状态，但结果保存前必须通过 Zod。

输出示例：

```json
{
  "mediaResults": [],
  "visualSummary": "string",
  "factChecks": [],
  "requestId": "uuid",
  "model": "deepseek-vision-model"
}
```

## 11.4 客户解析

```text
POST /api/ai/extract-client
```

## 11.5 自然语言搜索解析

```text
POST /api/ai/parse-property-search
```

## 11.6 内容生成

```text
POST /api/ai/generate-content
```

输入必须包含 `idempotencyKey`。

要求：

- 未登录返回 401
- 没有 `content_factory` 返回 403
- 超出次数配额或成本熔断线返回 429
- 房源无访问或营销复用权限返回 403
- 权限或配额检查失败时不得调用模型
- 配额和成本必须通过 `reserve_ai_quota` 原子预占
- 调用模型前计算 `reservedEstimatedCostUsd`
- 内容生成后必须经过 `utils/compliance-check.ts`
- 存在未解决 block 级合规风险时，响应仍可返回草稿，但 `copyAllowed = false`
- Prompt 必须包含已确认 `visual_summary` 与 `ai_labels`，不得包含未脱敏联系方式
- 429 响应应包含当日上限和下一次重置时间，但不得泄露其他用户数据

## 11.7 房源 CRUD

```text
GET    /api/properties
POST   /api/properties
GET    /api/properties/:id
PATCH  /api/properties/:id
DELETE /api/properties/:id
```

DELETE 实际执行软删除。

## 11.8 客户 CRUD

```text
GET    /api/clients
POST   /api/clients
GET    /api/clients/:id
PATCH  /api/clients/:id
DELETE /api/clients/:id
```

## 11.9 匹配

```text
POST /api/matches/calculate
GET  /api/clients/:id/matches
GET  /api/properties/:id/matches
```

## 11.10 共享房源

```text
POST   /api/properties/:id/share
DELETE /api/properties/:id/share
GET    /api/shared-properties
POST   /api/shared-properties/:id/contact
```

## 11.11 功能授权管理

```text
GET    /api/admin/users
GET    /api/admin/feature-entitlements
POST   /api/admin/feature-entitlements
PATCH  /api/admin/feature-entitlements/:id
DELETE /api/admin/feature-entitlements/:id
```

仅 System Admin 可用。

## 11.12 邀请链接

```text
GET    /api/admin/invites
POST   /api/admin/invites
DELETE /api/admin/invites/:id
POST   /api/invites/:token/accept
```

## 11.13 AI 用量

```text
GET /api/admin/ai-usage
GET /api/me/ai-usage
```

管理员可以查看平台级汇总；普通用户只能查看自己的基础智能功能使用量。

## 11.14 AI 反馈与纠错

```text
POST /api/ai/feedback
GET  /api/me/ai-preferences
DELETE /api/me/ai-preferences/:id
```

保存房源或客户的 POST/PATCH API 如果收到 `requestId`，必须由服务端读取原始 AI 输出并记录 Diff。

## 11.15 管理员模型、成本与合规

```text
GET   /api/admin/ai-usage
GET   /api/admin/ai-models
PATCH /api/admin/ai-models/:capability
POST  /api/admin/ai-models/:capability/reset-circuit
GET   /api/admin/compliance-terms
POST  /api/admin/compliance-terms
PATCH /api/admin/compliance-terms/:id
GET   /api/admin/ai-corrections
PATCH /api/admin/users/:userId/ai-limits
POST  /api/admin/users/:userId/restore-ai-access
```

管理员模型接口只能在 DeepSeek 主备模型或 DeepSeek endpoint 之间切换。


---

# 12. 前端交互规范

## 12.1 权限驱动的导航

- 普通用户不显示“内容”底部导航和生成按钮。
- 内容用户显示内容工作台、内容历史和发布记录。
- 系统管理员额外显示 `/admin` 导航。
- 隐藏导航仅用于体验，不能替代服务端权限检查。
- 权限加载期间不得短暂闪现未授权菜单。

## 12.2 移动端 Overlay 与表单规范

### 响应式 Overlay

必须封装统一的 `ResponsiveOverlay` 组件：

- 移动端使用 Vaul / shadcn `Drawer`，从底部弹出。
- 桌面端使用 shadcn `Dialog`，居中展示。
- 业务组件只调用统一接口，不分别维护 Drawer 和 Dialog 两套状态。
- 切换断点时不得丢失未提交的表单状态。

优先使用响应式 Overlay 的场景：

- 删除或发布确认
- 房源筛选条件
- 客户筛选条件
- AI 智能录入确认卡片
- 共享房源脱敏预览
- 简短的状态更新表单

### 复杂表单边界

- 完整房源新增/编辑、完整客户编辑等复杂表单应使用独立页面。
- 不得把超过约 8 个主要字段的完整房源表单塞入普通 Dialog。
- Drawer 用于确认、筛选和短流程，不代替完整页面。

### iOS Safari 与软键盘适配

- Drawer 内容区使用动态视口单位 `dvh`，最大高度建议不超过 `92dvh`。
- 内容区独立滚动，标题区和底部操作区保持固定或 sticky。
- 输入框获得焦点时必须滚动到可视区域，不能被软键盘遮挡。
- 避免仅依赖 `100vh`。
- 处理 Safe Area：`env(safe-area-inset-bottom)`。
- 打开 Overlay 时锁定背景滚动，关闭后恢复原滚动位置。
- 关闭前若表单已修改，提示是否放弃未保存内容。
- 支持键盘关闭、焦点恢复和无障碍 focus trap。

## 12.3 移动端基础交互

- 底部导航固定
- 主要操作按钮放在拇指可触达区域
- 表单分组折叠
- 支持粘贴文本快速录入
- 录音按钮明显显示录制、暂停、上传和转写状态
- 图片上传支持相册和相机
- 录音达到 60 秒时自动停止并提示
- 上传和转写过程中允许取消

## 12.4 列表

- 移动端默认卡片
- 桌面端可切换表格
- 筛选使用 `ResponsiveOverlay`
- 筛选条件以 Chips 展示
- 支持保存常用筛选作为 V1 功能

## 12.5 状态反馈

所有异步操作必须有：

- loading
- success
- empty
- error
- retry

语音流程还必须有：

- recording
- recorded
- uploading
- transcribing
- transcribed
- failed
- cancelled

## 12.6 删除确认

删除房源、客户、内容时必须二次确认。

移动端使用 Drawer，桌面端使用 Dialog。

## 12.7 隐私提示

敏感字段旁显示锁图标和“仅本门店可见”。

---

# 13. 非功能需求

## 13.1 性能

- 首屏可交互小于 3 秒
- 常用列表查询小于 2 秒
- 图片使用压缩和懒加载
- 大图上传前客户端压缩
- 视频限制大小和时长
- 音频限制为服务端配置的最大时长和大小，MVP 默认 60 秒、10 MB
- STT Route Handler 不进行 Base64 转换，避免额外内存膨胀
- RLS 高频查询必须通过索引和 EXPLAIN 验证

## 13.2 安全

- API 密钥仅服务端
- Supabase Service Role 不得暴露
- RLS 默认拒绝
- 敏感字段日志脱敏
- 防止 IDOR
- 上传文件校验 MIME 和大小
- 服务端校验 workspace 权限
- AI 接口限流
- 内容生成使用数据库原子配额预占，不能只依赖前端计数
- STT 接口按用户和 IP 限流
- 登录接口防暴力尝试
- 内容权限必须前端、服务端和数据库三层防护
- 禁止通过邮箱字符串或客户端变量判断 `content_factory`
- 授权接口必须校验 `is_system_admin()`
- 撤销权限后不依赖旧客户端缓存继续放行
- 邀请 Token 只保存 Hash，且支持失效与次数限制
- 图片 URL 必须防 SSRF，公共 API 优先接收媒体 ID 而不是任意 URL
- 视觉推理图片使用短期签名 URL，并移除不必要 EXIF
- 内容复制必须受服务端合规状态控制，不能只在前端禁用按钮
- 成本限制必须包含未过期预占成本，防止并发请求瞬间突破熔断线
- 运行时禁止调用非 DeepSeek 大模型

## 13.3 隐私

- 提供隐私政策入口
- 用户可导出自己的数据
- 用户可申请删除账号和数据
- 共享前展示脱敏预览
- 所有共享操作有审计日志

## 13.4 可观测性

记录：

- API 错误
- AI 请求状态
- AI 权限拒绝次数
- 功能授权、撤销和过期事件
- AI 成本、预估成本与结算成本
- DeepSeek 主备模型健康状态和切换事件
- 合规风险命中与处理结果
- AI 纠错率和负反馈率
- 生成成功率
- 上传失败率
- 关键业务事件

不得记录明文手机号和微信号。

## 13.5 可维护性

- TypeScript strict
- ESLint
- Prettier
- 领域服务分层
- Zod Schema 与数据库类型集中管理
- DeepSeek 文本与视觉 Provider 按能力解耦
- Storage Provider 解耦
- 禁止页面中直接拼复杂 SQL

---

# 14. 分阶段开发计划

> **注意**：以下 Phase 0–7 为 PRD 原始开发阶段编号，用于详细任务拆解。
> 多 Agent 协作以 `AGENTS.md` 和 `docs/coordination/PHASE_PLAYBOOK.md` 的 **Phase 0–4** 为唯一权威阶段体系。
> 映射关系见第 19 章。

## Phase 0：项目基础

- 初始化 Next.js、Tailwind、shadcn/ui 和 Vaul
- 配置 Supabase Auth
- 建立多用户登录和首次工作区初始化
- 建立统一 `ResponsiveOverlay` 组件
- 建立环境变量校验、错误边界和审计基础

## Phase 1：多租户数据库与权限

- 创建核心业务表
- 创建 workspace 隔离 RLS
- 创建 `feature_entitlements`
- 创建 `system_admins`
- 创建 `invitation_links`
- 创建 `ai_usage_logs`
- 创建 `ai_correction_logs`、`ai_user_preferences`
- 创建 `ai_model_pricing`、`ai_user_limits`、`ai_runtime_config`
- 创建 `compliance_terms`、`compliance_review_logs`
- 创建 workspace_members 联合唯一索引和反向查询索引
- 创建 `has_feature()`、`is_system_admin()` 与 `reserve_ai_quota()`
- 创建共享房源脱敏视图
- 创建 Storage 策略
- 编写 RLS 自动化测试

## Phase 2：全员基础房源能力

- 房源列表、详情、创建和编辑
- 图片上传
- DeepSeek 视觉分析状态与结果字段
- 单图 `ai_labels`、整套 `visual_summary` 和事实冲突确认
- 组合筛选
- 房源状态管理
- 软删除
- 私有数据隔离

## Phase 3：全员客户与匹配能力

- 客户 CRUD
- 沟通记录和待办
- MediaRecorder 录音与 60 秒限制
- `/api/ai/transcribe` multipart 上传与 STT Provider
- DeepSeek 房源与客户结构化录入
- 保存时通过 requestId 记录字段级 Diff
- 用户偏好学习与关闭入口
- 自然语言搜索
- 规则匹配和解释

## Phase 4：共享合作库

- 脱敏共享
- `is_shared` 配置
- `allow_marketing_reuse` 独立配置
- 合作请求
- 下架和授权过期

## Phase 5：系统管理员后台

- 用户列表
- 功能授权和撤销
- 授权有效期
- 邀请链接
- 账号禁用
- AI 用量与成本查看
- 用户级成本上限与熔断恢复
- DeepSeek 主备模型和 endpoint 切换
- 合规风险词库管理
- AI 纠错分析
- 授权审计日志

## Phase 6：受限内容工厂

- 内容路由守卫
- 内容 API 权限检查
- 内容表 RLS
- 小红书、抖音和朋友圈生成
- 将确认后的视觉标签和视觉摘要注入 Prompt
- 内容 👍/👎 反馈与原因收集
- 服务端敏感词与合规预检
- block 风险复制拦截
- 内容版本、编辑和复制
- 房源营销复用权限检查
- 事实与风险提示
- AI 用量记录、次数/成本原子预占、成本熔断和 429 拦截

## Phase 7：发布归因与工作台

- 内容编号和私信口令
- 发布数据录入
- 客户来源关联
- 带看和成交归因
- 普通用户与内容用户差异化工作台

---

# 15. MVP 验收清单

## 登录、多租户与基础权限

- [ ] 用户可注册、登录和退出
- [ ] 首次登录自动创建独立 workspace
- [ ] 用户 A 无法读取用户 B 私有房源和客户
- [ ] 所有普通注册用户可使用房源 CRUD
- [ ] 所有普通注册用户可使用客户 CRUD
- [ ] 所有普通注册用户可使用搜索和匹配
- [ ] 未登录用户无法录入或查看私有数据

## AI 基础录入

- [ ] 普通用户可粘贴文本解析房源
- [ ] 普通用户可录音并转文字
- [ ] 录音达到 60 秒自动停止
- [ ] 音频通过 `/api/ai/transcribe` 的 multipart 请求上传
- [ ] 超时长、超大小和非法 MIME 在调用 STT 前被拒绝
- [ ] STT API Key 不进入客户端
- [ ] AI 解析结果必须人工确认
- [ ] 敏感字段不发送至模型
- [ ] AI 失败时保留原始内容
- [ ] 房源图片由 DeepSeek 视觉模型提取 `ai_labels`
- [ ] 整套房源生成 `visual_summary`
- [ ] 文字与图片冲突展示证据、置信度和确认入口
- [ ] 图片未展示某特征时不会被自动判定为不存在
- [ ] 带 requestId 的房源或客户保存会写入脱敏 Diff 日志
- [ ] 用户可查看和删除已学习偏好

## 内容工厂授权

- [ ] `content_factory` 默认不授予新用户
- [ ] 系统管理员可授予指定用户
- [ ] 系统管理员可撤销权限
- [ ] 系统管理员可设置有效期
- [ ] 普通用户看不到内容导航和生成按钮
- [ ] 普通用户访问 `/content` 被拒绝
- [ ] 普通用户调用内容 API 返回 403
- [ ] 普通用户直接读取内容表被 RLS 拒绝
- [ ] 指定用户可正常生成和保存内容
- [ ] 超出每日次数配额返回 429 且不调用 DeepSeek
- [ ] 超出每日成本熔断线返回 429 且不调用 DeepSeek
- [ ] 管理员可恢复因成本熔断被暂停的用户
- [ ] 并发请求无法绕过每日配额
- [ ] 相同 idempotency key 不重复扣减
- [ ] 撤销权限后用户立即失去访问能力

## 房源营销复用

- [ ] `is_shared` 与 `allow_marketing_reuse` 为独立开关
- [ ] 仅共享但未授权营销复用的房源不能用于内容生成
- [ ] 授权营销复用的共享房源可被指定内容用户选择
- [ ] 已下架、出租、过期或删除房源不能继续生成新内容
- [ ] 共享房源不泄露房东联系方式和精确门牌号

## 管理后台和审计

- [ ] 普通用户无法进入管理员页面
- [ ] 普通用户无法给自己授权
- [ ] 授权、撤销和邀请操作均写入审计日志
- [ ] AI 调用记录用户、功能、DeepSeek 模型、状态、Token、估算成本和合规标志
- [ ] 主模型连续 3 次 5xx/超时后切换到 DeepSeek 备用模型
- [ ] 管理员可以强制主模型、备用模型或自动模式
- [ ] 日志不记录明文敏感信息

## 内容和归因

- [ ] 指定用户可生成小红书内容
- [ ] 指定用户可生成抖音脚本
- [ ] 指定用户可生成朋友圈文案
- [ ] 内容可编辑、保存版本和复制
- [ ] 内容显示文字与视觉事实来源和风险提示
- [ ] 未解决 block 级合规风险时无法一键复制或标记待发布
- [ ] review 级风险必须修改或填写确认理由
- [ ] 内容支持 👍/👎 和负反馈原因
- [ ] 可记录发布链接、私信口令、咨询、带看和成交

---

# 16. 测试要求

## 16.1 单元测试

至少覆盖：

- Zod Schema
- 匹配评分
- 隐私脱敏
- 搜索过滤 JSON
- 内容事实校验
- 视觉事实标签 Schema 与文字/图片交叉校验
- AI 原始输出与确认输出的 JSON Diff
- 偏好学习阈值和禁止学习事实字段
- 合规词匹配、严重级别和复制拦截
- 私信口令生成
- 音频 MIME、大小和 60 秒时长校验
- 次数与成本配额原子预占、并发请求和幂等键
- `ResponsiveOverlay` 在移动端和桌面端的行为
- has_feature 权限判断
- entitlement 过期判断
- 营销复用授权判断

## 16.2 集成测试

至少覆盖：

- 登录后创建房源
- AI 解析后保存房源
- 创建客户并匹配
- 生成内容并保存版本
- 上架共享房源
- 外部用户无法读取隐私字段
- 超过 60 秒音频在模型调用前被拒绝
- 并发内容生成请求不能绕过每日配额
- 普通用户可调用基础 STT，但无法借此访问内容生成能力
- 普通用户无法创建内容项目
- 系统管理员授予和撤销内容权限
- 未授权营销复用房源不能生成内容
- DeepSeek 视觉分析只读取有权限的媒体
- 保存 AI 录入时记录脱敏 Diff
- block 级合规内容不能复制
- 连续 3 次模拟 DeepSeek 5xx 后切换备用 DeepSeek 模型
- 达到成本熔断线后请求不调用模型

## 16.3 E2E 测试

建议使用 Playwright，至少覆盖：

1. 用户 A 注册并创建 workspace。
2. 用户 A 新增房源和客户。
3. 用户 B 注册并创建独立 workspace。
4. 用户 B 无法访问用户 A 私有房源。
5. 用户 B 可以正常使用基础搜索和匹配。
6. 普通用户 B 无法看到内容导航。
7. 普通用户 B 访问内容页面和 API 均被拒绝。
8. 系统管理员授予用户 B `content_factory`。
9. 用户 B 可以进入内容工作台。
10. 用户 B 无法使用未授权营销复用的用户 A 房源。
11. 用户 A 开启 `allow_marketing_reuse` 后，用户 B 可以生成内容。
12. 系统管理员撤销用户 B 权限。
13. 用户 B 再次访问内容页面、API 和内容表均被拒绝。
14. 验证共享视图没有房东电话、微信和精确门牌号。
15. 上传合法的 30 秒音频并成功返回转写文本。
16. 上传超过 60 秒或超过大小上限的音频，并确认外部 STT 未被调用。
17. 同一用户并发发起超过每日上限的内容请求，仅允许额度内请求调用模型，其余返回 429。
18. 在移动端打开智能录入确认、筛选和删除确认时使用 Drawer；桌面端使用 Dialog。
19. iOS Safari 软键盘弹起后，Drawer 中当前输入框和底部提交按钮仍可操作。
20. 上传多张房源图片，DeepSeek 视觉服务返回标签、视觉摘要和事实校验。
21. 人工修改 AI 解析字段后，系统记录字段级 Diff，并在达到阈值后生成可关闭的用户偏好。
22. 生成包含 block 级风险词的内容，确认一键复制被禁用。
23. 模拟单用户累计成本达到 10 美元，后续请求返回 429，管理员恢复后可继续使用。
24. 模拟主 DeepSeek 文本模型连续 3 次 5xx，确认自动切换备用 DeepSeek 模型。
25. 模拟 DeepSeek 视觉主端点失败，确认切换备用 DeepSeek-VL endpoint。

---

# 17. 环境变量

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# 所有 LLM/VLM 均为 DeepSeek
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_TEXT_MODEL_PRIMARY=deepseek-chat
DEEPSEEK_TEXT_MODEL_FALLBACK=deepseek-reasoner
DEEPSEEK_REQUEST_TIMEOUT_MS=45000

# DeepSeek 视觉模型部署端点（不可部署在 Vercel Serverless 内）
DEEPSEEK_VISION_BASE_URL_PRIMARY=
DEEPSEEK_VISION_BASE_URL_FALLBACK=
DEEPSEEK_VISION_API_KEY=
DEEPSEEK_VISION_MODEL=
DEEPSEEK_VISION_MAX_IMAGES=8

# 独立 STT 子系统，不属于 LLM
TRANSCRIPTION_PROVIDER=
STT_BASE_URL=
STT_API_KEY=
MAX_AUDIO_DURATION_SECONDS=60
MAX_AUDIO_UPLOAD_BYTES=10485760

NEXT_PUBLIC_APP_URL=

# 仅用于首次部署时创建初始管理员；运行期权限以 system_admins 为准
INITIAL_SYSTEM_ADMIN_EMAIL=

AI_DAILY_CONTENT_LIMIT=
AI_DAILY_COST_LIMIT_USD=10
AI_PREFERENCE_MIN_EVIDENCE=3
AI_FAILURE_THRESHOLD=3
AI_FAILURE_WINDOW_SECONDS=300
AI_QUOTA_TIMEZONE=Asia/Shanghai
COMPLIANCE_BLOCK_COPY=true
INVITE_TOKEN_SECRET=
```

所有环境变量必须通过服务端 Schema 校验。

### DeepSeek 模型环境变量默认策略

1. 不得在代码中硬编码 API Key。
2. 模型名称允许通过环境变量覆盖。
3. `DEEPSEEK_TEXT_MODEL_PRIMARY` 缺失时，环境 Schema 使用 `deepseek-chat` 作为默认值。
4. `DEEPSEEK_TEXT_MODEL_FALLBACK` 缺失时，环境 Schema 使用 `deepseek-reasoner` 作为默认值。
5. `DEEPSEEK_API_KEY`、文本 API Base URL、视觉服务 Endpoint 不得提供危险默认值；缺少必须配置项时，应用启动必须产生清晰错误。
6. 视觉模型由独立 DeepSeek-VL 推理服务提供。
7. STT 仍是独立子系统，不属于 LLM。
8. 禁止重新引入 OpenAI、Anthropic 或 Gemini 的 API Key 或回退路径。

---

# 18. 推荐项目目录

```text
src/
├─ app/
│  ├─ (auth)/
│  ├─ (dashboard)/
│  ├─ admin/
│  └─ api/
├─ components/
│  └─ ui/
├─ features/
│  ├─ auth/
│  ├─ access-control/
│  ├─ entitlements/
│  ├─ properties/
│  ├─ clients/
│  ├─ matching/
│  ├─ tasks/
│  ├─ collaboration/
│  ├─ content-generation/
│  ├─ ai-runtime/
│  ├─ ai-corrections/
│  ├─ ai-preferences/
│  ├─ ai-quota/
│  └─ compliance/
├─ lib/
│  ├─ supabase/
│  ├─ ai/
│  ├─ compliance/
│  ├─ validation/
│  └─ privacy/
├─ schemas/
├─ types/
└─ config/
```

> **重要**：业务组件必须放在各自的 `src/features/<domain>/**` 内。
> `src/components/ui/**` 仅保存跨业务通用组件（shadcn/ui 封装、设计 Token 等）。
> 禁止创建 `src/components/properties/**`、`src/components/clients/**`、`src/components/content/**` 等业务组件目录。
> 旧版推荐目录中包含的 `src/components/properties/**`、`src/components/clients/**`、`src/components/content/**`、`src/components/forms/**`、`src/components/responsive-overlay/**`、`src/components/shared/**` 和 `src/features/transcription/**`、`src/features/vision-analysis/**`、`src/features/admin/**`、`src/features/invitations/**` 均为**旧命名，不再采用**。```

---

# 19. Claude Code 执行任务

> **阶段体系说明**：多 Agent 协作以 `AGENTS.md` 和 `docs/coordination/PHASE_PLAYBOOK.md` 的 **Phase 0–4** 为唯一权威阶段编号。
> 本章原"第一轮、第二轮、第三轮"为 **历史开发批次标记，不再作为主协调编号**。

## Phase 0–4 映射表

| 统一 Phase | 内容 | 对应旧批次 / PRD Phase |
|---|---|---|
| **Phase 0** | 需求审查、架构决策与契约冻结 | 无（新增前置阶段） |
| **Phase 1** | 项目初始化、Supabase、Auth、Workspace、RLS、基础 UI | 第一轮前半 + PRD Phase 0/1 |
| **Phase 2** | 房源、客户、匹配、待办和合作共享库 | 第一轮后半 + 第二轮共享库部分 + PRD Phase 2/3/4 |
| **Phase 3** | DeepSeek 智能录入、视觉理解、内容工厂、合规、配额和成本 | 第二轮 AI 部分 + 第三轮 + PRD Phase 5/6/7 |
| **Phase 4** | 全量测试、集成、部署、审计和发布准备 | 无（新增收尾阶段） |

> 以下为历史批次任务内容，保留供参考。实际执行请使用 Phase 0–4 编号，并由主 Agent 按 `AGENTS.md` 编排。

---

## 历史批次参考：第一轮 — 权限架构、数据模型与基础 CRUD

> **旧命名，不再采用为主协调编号。** 本批次内容已映射至 Phase 1–2。

1. 完整阅读本 PRD。
2. 输出当前理解、风险、数据库 ER 关系和受影响文件。
3. 初始化项目与依赖。
4. 创建 workspace、业务表、联合唯一索引和核心查询索引。
5. 创建 `feature_entitlements`、`system_admins`、`invitation_links`、`ai_usage_logs`。
6. 创建 `ai_correction_logs`、`ai_user_preferences`、`ai_model_pricing`、`ai_user_limits`、`ai_runtime_config`。
7. 创建 `compliance_terms` 和 `compliance_review_logs`。
8. 为 `properties`、`property_media` 和 `content_versions` 增加视觉、合规与反馈字段。
9. 创建 `is_workspace_member()`、`is_system_admin()`、`has_feature()` 和同时检查次数/成本的 `reserve_ai_quota()`。
10. 创建并测试 Supabase RLS，覆盖纠错、偏好、用量、模型配置和合规表，并验证无递归和索引命中。
11. 实现注册、登录、首次工作区初始化。
12. 实现统一 `ResponsiveOverlay`。
13. 实现房源与客户真实 CRUD。
14. 实现基础搜索与房客匹配。
15. 添加种子数据、类型检查、Lint 和测试。
16. 输出 README 和 DECISIONS.md。

## 历史批次参考：第一轮完成标准

> **旧命名，不再采用。** 本完成标准已融入 Phase 1–2 验收。

- 本地可运行
- 可注册和登录
- 每名用户拥有独立 workspace
- 用户间私有数据完全隔离
- 可创建房源和客户
- 普通用户可搜索和匹配
- `content_factory` 默认未授权
- 无 TypeScript 和 ESLint 错误
- RLS 测试通过

## 历史批次参考：第二轮 — DeepSeek 基础 AI、视觉、STT 与共享库

> **旧命名，不再采用为主协调编号。** 本批次内容已映射至 Phase 2–3。

1. MediaRecorder 录音、波形和 60 秒自动停止。
2. `/api/ai/transcribe` multipart Route Handler。
3. 独立 STT Provider、文件验证、超时和错误处理。
4. 实现 `DeepSeekTextProvider`，用于房源解析、客户解析和搜索解析。
5. 实现 `DeepSeekVisionProvider` 接口和外部 GPU endpoint 调用，不在 Vercel 加载模型权重。
6. 实现 `/api/ai/analyze-property-images`，公共请求接收媒体 ID，服务端生成短期 URL。
7. 保存单图 `ai_labels`、整套 `visual_summary` 和 `visual_fact_flags`。
8. 实现文字与图片事实交叉校验，区分未验证、证据不足和疑似冲突。
9. 房源/客户保存如带 `requestId`，服务端计算脱敏 JSON Diff 并写入 `ai_correction_logs`。
10. 达到证据阈值后生成可关闭的 `ai_user_preferences` Prompt Hint。
11. 实现隐私过滤、DeepSeek Usage 标准化和 AI 用量记录。
12. 实现合作共享库、脱敏视图、`allow_marketing_reuse` 独立开关和合作请求。

## 历史批次参考：第三轮 — 管理员、成本合规与受限内容工厂

> **旧命名，不再采用为主协调编号。** 本批次内容已映射至 Phase 3。

1. 系统管理员后台、用户列表和账号状态。
2. 功能授权、撤销、过期和邀请链接。
3. `/admin/ai-usage` 成本统计、模型价格版本和用户级每日成本上限。
4. `/admin/ai-models` DeepSeek 文本主备模型、DeepSeek-VL 主备 endpoint 和 circuit breaker。
5. `/admin/compliance` 风险词库、严重级别和版本管理。
6. `/admin/ai-corrections` 高频纠错与 Prompt 版本效果分析。
7. 内容页面、API、表和 Storage 的三层权限守卫。
8. 小红书、抖音和朋友圈生成，并注入确认后的视觉摘要与标签。
9. 实现 `src/lib/compliance-check.ts`，服务端保存命中结果并返回 `copyAllowed`。
10. 实现 block/review/highlight 处理和复制/待发布拦截。
11. 实现内容 👍/👎、负反馈原因和纠错日志。
12. 实现次数与成本原子预占、429、实际 Token 成本结算和管理员恢复。
13. 实现 DeepSeek 主模型连续失败后的自动热切换和管理员强制模式。
14. 内容发布和归因。
15. 完整单元、集成和 E2E 权限/视觉/成本/合规测试。

## 关键禁止项

- 禁止用邮箱字符串写死内容用户。
- 禁止只隐藏前端按钮。
- 禁止使用客户端 Service Role Key。
- 禁止普通用户直接修改 entitlement。
- 禁止共享房源自动获得营销复用授权。
- 禁止未通过服务端权限检查就调用内容模型。
- 禁止用“先 count 再 insert”的非原子方式实现每日配额。
- 禁止通过 Server Action 接收 Audio Blob。
- 禁止移动端复杂确认流程仅使用普通居中 Dialog。
- 禁止配置或调用非 DeepSeek 的 LLM/VLM。
- 禁止把任意用户提交 URL 直接传给视觉模型。
- 禁止把“图片未出现”当作“房源不存在该特征”。
- 禁止只在前端进行合规扫描或复制拦截。
- 禁止用硬编码模型单价计算历史成本。
- 禁止通过非原子方式分别检查次数和成本。

---


## 19.1 Claude Code 强制执行补充（适用于 Phase 1–3）

在执行 Phase 1、Phase 2、Phase 3（对应 PRD 原始 Phase 1/2/3/5/6）时，必须遵守：

1. **DeepSeek-only**：删除 OpenAI/Anthropic/Gemini 的运行时 Provider、环境变量和回退代码。SDK 可以复用兼容格式，但请求必须指向 DeepSeek。
2. **多模态解析**：properties 相关视觉任务支持 Provider 内部 `imageUrls` 数组；公共 API 优先接收 `propertyMediaIds`，服务端生成短期 URL。
3. **视觉模型部署**：DeepSeek-VL endpoint 是外部 GPU 推理服务，不在 Vercel 函数中加载模型权重。
4. **Diff 记录**：保存房源和客户时，如存在 `requestId`，必须在服务端读取 AI 原始输出，计算脱敏 Diff，并写入 `ai_correction_logs`。
5. **偏好学习**：不得直接在线微调；只生成可查看、可删除、有证据阈值的 Prompt Hint。
6. **敏感词扫描**：`/api/ai/generate-content` 返回前必须经过 `src/lib/compliance-check.ts`，并把服务端结果持久化。
7. **复制权限**：前端按钮状态必须来自服务端 `copyAllowed` / `compliance_status`，不能仅在客户端重新扫描。
8. **原子配额**：`reserve_ai_quota` 同时检查当日次数、成功成本和未过期预占成本。
9. **成本计算**：模型价格从版本化配置读取，不得散落硬编码；成功后根据实际 Usage 结算。
10. **热切换**：仅允许 DeepSeek 主模型 ↔ DeepSeek 备用模型，以及 DeepSeek-VL 主 endpoint ↔ 备用 endpoint。
11. **事实边界**：图片没有拍到的区域不得判定不存在；所有视觉判断必须带置信度和证据媒体 ID。
12. **测试先行**：以上能力必须有单元、集成和 E2E 测试，不能仅实现 UI。

---

# 20. 最终产品判断标准

产品必须同时满足“广泛可用”和“严格受控”：

```text
同一个产品链接
→ 所有中介注册并拥有独立工作区
→ 所有人可录入、存储、搜索和匹配自己的房源客户
→ 私有数据不会跨工作区泄露
→ 共享房源仅展示脱敏信息
→ 只有指定账号拥有 content_factory
→ 前端、服务端和数据库三层同时限制
→ 房源所有者决定是否允许营销复用
```

产品成功不以“隐藏了一个按钮”为判断，而以以下安全事实为判断：

- 普通用户无法通过任何技术路径调用内容生成；
- 指定用户可在授权范围内稳定使用内容工厂；
- 权限可动态授予、撤销和过期；
- 每个中介的私有房源和客户始终相互隔离；
- 共享与营销复用均由房源所有者主动授权；
- 所有授权、内容调用和敏感操作均可审计。
