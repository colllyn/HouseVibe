# HouseVibe Domain Model

| 属性 | 值 |
|---|---|
| 文档名称 | domain-model |
| 版本 | 1.0 |
| 状态 | FROZEN FOR PHASE 1 |
| Owner | solution-architect |
| 依赖 | PRD v1.3 |
| 最后更新 | 2026-07-30 |

---

## 1. 设计原则

1. 所有实体主键使用 UUID v4。
2. 所有时间使用 UTC 存储，前端按用户时区展示。
3. 所有核心表包含 `created_at`、`updated_at`。
4. 可删除业务表包含 `deleted_at`（软删除）。
5. 业务数据通过 `workspace_id` 隔离。
6. 敏感字段独立存储于 `property_private_details`。
7. JSONB 仅用于灵活/半结构数据，不得替代核心结构化字段。
8. `provider` 固定为 `deepseek` 或 `deepseek_self_hosted`，不得记录为 OpenAI/Anthropic/Gemini。
9. 字段描述使用中文实际 UTF-8 字符。
10. 所有枚举使用 PostgreSQL native ENUM 或 CHECK 约束。

---

## 2. 核心实体定义

### 2.1 profiles

**业务含义**：用户个人资料，与 Supabase Auth `auth.users` 关联。

| 字段 | 类型 | 必填 | 默认值 | 说明 | 敏感级别 |
|---|---|---|---|---|---|
| `id` | UUID PK | YES | gen_random_uuid() | 主键，与 auth.users.id 对应 | LOW |
| `full_name` | TEXT | NO | NULL | 用户全名 | MEDIUM |
| `phone` | TEXT | NO | NULL | 手机号 | HIGH |
| `avatar_url` | TEXT | NO | NULL | 头像 URL | LOW |
| `city` | TEXT | NO | NULL | 所在城市 | LOW |
| `created_at` | TIMESTAMPTZ | YES | now() | 创建时间 | LOW |
| `updated_at` | TIMESTAMPTZ | YES | now() | 更新时间 | LOW |

**关联关系**：
- 1:1 → `auth.users`（通过 id）
- 1:N → `workspace_members`（一个用户可加入多个 workspace）

**唯一约束**：`id` (PK)

**索引建议**：无额外索引

**删除策略**：不直接删除，通过账号禁用实现软删除。

**可传给 DeepSeek 的字段**：无。用户资料不可直接传给 DeepSeek。

---

### 2.2 workspaces

**业务含义**：独立工作区/门店，是业务数据隔离的边界。

| 字段 | 类型 | 必填 | 默认值 | 说明 | 敏感级别 |
|---|---|---|---|---|---|
| `id` | UUID PK | YES | gen_random_uuid() | 主键 | LOW |
| `name` | TEXT | YES | - | 工作区/门店名称 | LOW |
| `owner_user_id` | UUID | YES | - | 创建者 user_id | LOW |
| `city` | TEXT | NO | NULL | 所在城市 | LOW |
| `business_type` | TEXT | NO | 'residential_lease' | 业务类型，默认住宅租赁 | LOW |
| `created_at` | TIMESTAMPTZ | YES | now() | 创建时间 | LOW |
| `updated_at` | TIMESTAMPTZ | YES | now() | 更新时间 | LOW |

**关联关系**：
- 1:N → `workspace_members`
- 1:N → `properties`, `clients`, `content_projects` 等所有业务表

**唯一约束**：`id` (PK)

**索引建议**：`owner_user_id`

**删除策略**：软删除（future: 工作区归档），MVP 不删除。

**可传给 DeepSeek 的字段**：无直接传递。

---

### 2.3 workspace_members

**业务含义**：用户在某个 workspace 中的成员关系与角色。

**Role 枚举**：`owner`, `member`, `external_collaborator`

**Status 枚举**：`active`, `inactive`, `invited`

| 字段 | 类型 | 必填 | 默认值 | 说明 | 敏感级别 |
|---|---|---|---|---|---|
| `id` | UUID PK | YES | gen_random_uuid() | 主键 | LOW |
| `workspace_id` | UUID | YES | - | 所属 workspace | LOW |
| `user_id` | UUID | YES | - | 用户 ID | LOW |
| `role` | workspace_role | YES | 'member' | 工作区角色 | LOW |
| `status` | member_status | YES | 'invited' | 成员状态 | LOW |
| `created_at` | TIMESTAMPTZ | YES | now() | 加入时间 | LOW |

**关联关系**：
- N:1 → `workspaces`
- N:1 → `profiles`

**唯一约束**：`UNIQUE(workspace_id, user_id)`

**索引建议**：
- `UNIQUE(workspace_id, user_id)` -- 成员关系查询核心索引
- `(user_id, workspace_id, status)` -- 反向查询，"用户的所有 workspace"

**删除策略**：设置 `status = 'inactive'`，不物理删除。

**RLS 策略依赖**：此表是 `is_workspace_member()` 辅助函数的核心查询目标。自身 RLS 不得递归调用该函数。

**可传给 DeepSeek 的字段**：无。

---

### 2.4 properties

**业务含义**：房源信息，是系统的核心业务实体。

**Status 枚举**：`draft`, `available`, `reserved`, `rented`, `offline`, `expired`, `deleted`

| 字段 | 类型 | 必填 | 默认值 | 说明 | 敏感级别 |
|---|---|---|---|---|---|
| `id` | UUID PK | YES | gen_random_uuid() | 主键 | LOW |
| `workspace_id` | UUID | YES | - | 所属 workspace | LOW |
| `created_by` | UUID | YES | - | 创建者 user_id | LOW |
| `title` | TEXT | YES | - | 房源标题 | LOW |
| `city` | TEXT | YES | - | 城市 | LOW |
| `district` | TEXT | NO | NULL | 区域 | LOW |
| `business_area` | TEXT | NO | NULL | 商圈 | LOW |
| `community_name` | TEXT | NO | NULL | 小区名称 | LOW |
| `address_text` | TEXT | NO | NULL | 地址描述（不含精确门牌号） | MEDIUM |
| `building_no` | TEXT | NO | NULL | 楼号 | HIGH |
| `unit_no` | TEXT | NO | NULL | 单元号 | HIGH |
| `room_no` | TEXT | NO | NULL | 室号 | HIGH |
| `rental_type` | TEXT | YES | 'whole_unit' | 整租/合租 | LOW |
| `monthly_rent` | INTEGER | NO | NULL | 月租（人民币元） | LOW |
| `deposit_terms` | TEXT | NO | NULL | 押金方式 | LOW |
| `bedrooms` | INTEGER | NO | NULL | 卧室数 | LOW |
| `living_rooms` | INTEGER | NO | NULL | 客厅数 | LOW |
| `bathrooms` | INTEGER | NO | NULL | 卫生间数 | LOW |
| `area_sqm` | NUMERIC | NO | NULL | 面积（平方米） | LOW |
| `floor` | INTEGER | NO | NULL | 所在楼层 | MEDIUM |
| `total_floors` | INTEGER | NO | NULL | 总楼层 | LOW |
| `has_elevator` | BOOLEAN | NO | NULL | 是否有电梯 | LOW |
| `orientation` | TEXT | NO | NULL | 朝向 | LOW |
| `decoration` | TEXT | NO | NULL | 装修情况 | LOW |
| `available_from` | DATE | NO | NULL | 可入住日期 | LOW |
| `minimum_lease_months` | INTEGER | NO | NULL | 最短租期（月） | LOW |
| `pets_allowed` | BOOLEAN | NO | NULL | 是否允许宠物 | LOW |
| `cooking_allowed` | BOOLEAN | NO | NULL | 是否允许烹饪 | LOW |
| `subway_text` | TEXT | NO | NULL | 地铁信息描述 | LOW |
| `facilities` | JSONB | NO | '[]' | 设施列表 | LOW |
| `tags` | TEXT[] | NO | '{}' | 标签数组 | LOW |
| `selling_points` | TEXT[] | NO | '{}' | 卖点 | LOW |
| `drawbacks` | TEXT[] | NO | '{}' | 缺点/不足 | LOW |
| `description` | TEXT | NO | NULL | 详细描述 | LOW |
| `visual_summary` | TEXT | NO | NULL | DeepSeek 视觉生成的整套房源摘要 | LOW |
| `visual_fact_flags` | JSONB | NO | '[]' | 文字与图片事实交叉校验结果 | LOW |
| `status` | property_status | YES | 'draft' | 房源状态 | LOW |
| `is_shared` | BOOLEAN | YES | false | 是否进入合作共享库 | LOW |
| `allow_marketing_reuse` | BOOLEAN | YES | false | 是否允许内容用户用于营销生成 | LOW |
| `marketing_reuse_granted_at` | TIMESTAMPTZ | NO | NULL | 营销复用授权时间 | LOW |
| `shared_at` | TIMESTAMPTZ | NO | NULL | 上架共享库时间 | LOW |
| `shared_expires_at` | TIMESTAMPTZ | NO | NULL | 共享过期时间 | LOW |
| `commission_split` | TEXT | NO | NULL | 佣金分成描述 | LOW |
| `raw_input_text` | TEXT | NO | NULL | 原始输入文本 | MEDIUM |
| `source_type` | TEXT | NO | 'manual' | 来源类型 | LOW |
| `created_at` | TIMESTAMPTZ | YES | now() | 创建时间 | LOW |
| `updated_at` | TIMESTAMPTZ | YES | now() | 更新时间 | LOW |
| `deleted_at` | TIMESTAMPTZ | NO | NULL | 软删除时间 | LOW |

**关联关系**：
- N:1 → `workspaces`
- 1:1 → `property_private_details`
- 1:N → `property_media`
- 1:N → `property_matches`
- 1:N → `content_projects`

**索引建议**：
- `(workspace_id, status, deleted_at)` -- 工作区房源列表
- `(workspace_id, district, monthly_rent)` -- 房源筛选
- `(workspace_id, available_from)` -- 可入住时间筛选
- `(is_shared, shared_expires_at)` -- 共享库查询

**可传给 DeepSeek 的字段**：title, city, district, business_area, community_name, address_text, rental_type, monthly_rent, deposit_terms, bedrooms, living_rooms, bathrooms, area_sqm, floor, total_floors, has_elevator, orientation, decoration, available_from, minimum_lease_months, pets_allowed, cooking_allowed, subway_text, facilities, tags, selling_points, drawbacks, description, visual_summary

**禁止传给 DeepSeek 的字段**：building_no, unit_no, room_no（虽位于 `properties` 表，但不得进入共享视图 `shared_properties_view`，不得发送至 DeepSeek（参见 ai-contract 隐私字段清单第 3 节））

---

### 2.5 property_private_details

**业务含义**：房源敏感信息独立存储，所有字段标记为 HIGH 敏感级别。

| 字段 | 类型 | 必填 | 默认值 | 说明 | 敏感级别 |
|---|---|---|---|---|---|
| `id` | UUID PK | YES | gen_random_uuid() | 主键 | HIGH |
| `property_id` | UUID | YES | - | 关联房源 | HIGH |
| `workspace_id` | UUID | YES | - | 所属 workspace | HIGH |
| `owner_name` | TEXT | NO | NULL | 房东姓名 | HIGH |
| `owner_phone` | TEXT | NO | NULL | 房东电话 | HIGH |
| `owner_wechat` | TEXT | NO | NULL | 房东微信 | HIGH |
| `exact_address` | TEXT | NO | NULL | 精确地址 | HIGH |
| `internal_notes` | TEXT | NO | NULL | 内部备注 | HIGH |
| `key_location` | TEXT | NO | NULL | 钥匙位置 | HIGH |
| `created_at` | TIMESTAMPTZ | YES | now() | 创建时间 | HIGH |
| `updated_at` | TIMESTAMPTZ | YES | now() | 更新时间 | HIGH |

**关联关系**：
- 1:1 → `properties` (property_id)

**唯一约束**：`UNIQUE(property_id)`

**索引建议**：`(property_id)`, `(workspace_id)`

**安全规则**：
- 即使用户属于同一 workspace，共享视图和共享 API 也 MUST NOT 包含此表任何字段。
- 此表字段 MUST NOT 传给 DeepSeek 或任何外部 AI 服务。
- RLS 仅限当前 workspace member 访问。

**可传给 DeepSeek 的字段**：无。全部禁止。

---

### 2.6 property_media

**业务含义**：房源关联的图片与视频文件。

**Media Type 枚举**：`image`, `video`

**AI Analysis Status 枚举**：`pending`, `processing`, `completed`, `failed`

| 字段 | 类型 | 必填 | 默认值 | 说明 | 敏感级别 |
|---|---|---|---|---|---|
| `id` | UUID PK | YES | gen_random_uuid() | 主键 | LOW |
| `workspace_id` | UUID | YES | - | 所属 workspace | LOW |
| `property_id` | UUID | YES | - | 关联房源 | LOW |
| `storage_path` | TEXT | YES | - | Supabase Storage 路径 | MEDIUM |
| `media_type` | media_type | YES | 'image' | 媒体类型 | LOW |
| `scene_tag` | TEXT | NO | NULL | 空间类型标签（living_room 等） | LOW |
| `is_cover` | BOOLEAN | YES | false | 是否为封面图 | LOW |
| `sort_order` | INTEGER | YES | 0 | 排序 | LOW |
| `width` | INTEGER | NO | NULL | 图片宽度 | LOW |
| `height` | INTEGER | NO | NULL | 图片高度 | LOW |
| `duration_seconds` | NUMERIC | NO | NULL | 视频时长 | LOW |
| `ai_labels` | JSONB | NO | NULL | DeepSeek 视觉分析标签 | LOW |
| `ai_analysis_status` | ai_analysis_status | YES | 'pending' | 视觉分析状态 | LOW |
| `ai_analyzed_at` | TIMESTAMPTZ | NO | NULL | 分析完成时间 | LOW |
| `created_at` | TIMESTAMPTZ | YES | now() | 创建时间 | LOW |
| `deleted_at` | TIMESTAMPTZ | NO | NULL | 软删除时间 | LOW |

**关联关系**：
- N:1 → `properties`

**索引建议**：
- `(property_id, ai_analysis_status)`
- `(property_id, sort_order)`

**ai_labels JSONB 结构**：
```json
{
  "sceneType": "living_room",
  "styles": ["modern", "minimal"],
  "visibleFeatures": ["floor_to_ceiling_window"],
  "condition": ["well_maintained"],
  "lighting": ["bright_natural_light"],
  "appliances": ["air_conditioner"],
  "confidence": 0.86,
  "evidence": ["media-uuid"],
  "uncertainLabels": []
}
```

**可传给 DeepSeek 的字段**：storage_path（由服务端生成短期签名 URL 后传出）。不可将永久公开 URL 或原始文件直接传给视觉端点。

---

### 2.7 clients

**业务含义**：客户信息与需求。

**Stage 枚举**：`new`, `qualified`, `properties_sent`, `viewing_scheduled`, `viewed`, `considering`, `closed_won`, `paused`, `lost`, `deleted`

| 字段 | 类型 | 必填 | 默认值 | 说明 | 敏感级别 |
|---|---|---|---|---|---|
| `id` | UUID PK | YES | gen_random_uuid() | 主键 | LOW |
| `workspace_id` | UUID | YES | - | 所属 workspace | LOW |
| `created_by` | UUID | YES | - | 创建者 user_id | LOW |
| `name` | TEXT | YES | - | 姓名或称呼 | MEDIUM |
| `phone` | TEXT | NO | NULL | 手机号 | HIGH |
| `wechat` | TEXT | NO | NULL | 微信号 | HIGH |
| `source_platform` | TEXT | NO | NULL | 来源平台 | LOW |
| `source_content_id` | UUID | NO | NULL | 来源内容 ID | LOW |
| `first_property_id` | UUID | NO | NULL | 首次咨询房源 | LOW |
| `budget_min` | INTEGER | NO | NULL | 预算下限 | LOW |
| `budget_max` | INTEGER | NO | NULL | 预算上限 | LOW |
| `preferred_districts` | TEXT[] | NO | '{}' | 偏好区域 | LOW |
| `preferred_communities` | TEXT[] | NO | '{}' | 偏好小区 | LOW |
| `bedrooms` | INTEGER | NO | NULL | 需求卧室数 | LOW |
| `rental_type` | TEXT | NO | NULL | 整租/合租 | LOW |
| `available_from` | DATE | NO | NULL | 期望入住时间 | LOW |
| `minimum_lease_months` | INTEGER | NO | NULL | 最短租期 | LOW |
| `pets_required` | BOOLEAN | NO | NULL | 是否需要宠物友好 | LOW |
| `cooking_required` | BOOLEAN | NO | NULL | 是否需要允许烹饪 | LOW |
| `commute_destination` | TEXT | NO | NULL | 通勤目的地 | LOW |
| `hard_requirements` | JSONB | NO | '[]' | 硬性条件 | LOW |
| `soft_preferences` | JSONB | NO | '[]' | 偏好条件 | LOW |
| `deal_breakers` | TEXT[] | NO | '{}' | 不能接受的底线条件 | LOW |
| `stage` | client_stage | YES | 'new' | 客户阶段 | LOW |
| `raw_input_text` | TEXT | NO | NULL | 原始输入文本 | MEDIUM |
| `next_follow_up_at` | TIMESTAMPTZ | NO | NULL | 下次跟进时间 | LOW |
| `last_interaction_at` | TIMESTAMPTZ | NO | NULL | 最近互动时间 | LOW |
| `created_at` | TIMESTAMPTZ | YES | now() | 创建时间 | LOW |
| `updated_at` | TIMESTAMPTZ | YES | now() | 更新时间 | LOW |
| `deleted_at` | TIMESTAMPTZ | NO | NULL | 软删除时间 | LOW |

**关联关系**：
- N:1 → `workspaces`
- N:1 → `content_projects` (source_content_id)
- N:1 → `properties` (first_property_id)
- 1:N → `interactions`
- 1:N → `property_matches`

**索引建议**：
- `(workspace_id, stage, deleted_at)` -- 客户列表
- `(workspace_id, next_follow_up_at)` -- 跟进提醒

**可传给 DeepSeek 的字段**：name（不含 phone/wechat）、source_platform、budget_min、budget_max、preferred_districts、preferred_communities、bedrooms、rental_type、available_from、minimum_lease_months、pets_required、cooking_required、commute_destination、hard_requirements、soft_preferences、deal_breakers

**禁止传给 DeepSeek 的字段**：phone, wechat

---

### 2.8 interactions

**业务含义**：与客户之间的沟通与互动记录。

| 字段 | 类型 | 必填 | 默认值 | 说明 | 敏感级别 |
|---|---|---|---|---|---|
| `id` | UUID PK | YES | gen_random_uuid() | 主键 | LOW |
| `workspace_id` | UUID | YES | - | 所属 workspace | LOW |
| `client_id` | UUID | YES | - | 关联客户 | LOW |
| `property_id` | UUID | NO | NULL | 关联房源 | LOW |
| `interaction_type` | TEXT | YES | - | 互动类型 | LOW |
| `summary` | TEXT | NO | NULL | 互动摘要 | MEDIUM |
| `raw_text` | TEXT | NO | NULL | 原始文本 | MEDIUM |
| `next_action` | TEXT | NO | NULL | 下一步行动 | LOW |
| `occurred_at` | TIMESTAMPTZ | YES | - | 互动发生时间 | LOW |
| `created_by` | UUID | YES | - | 记录创建者 | LOW |
| `created_at` | TIMESTAMPTZ | YES | now() | 创建时间 | LOW |

**interaction_type 枚举建议**：`phone_call`, `wechat_message`, `in_person_meeting`, `property_viewing`, `follow_up`, `negotiation`, `contract_signing`, `complaint`, `other`

**关联关系**：
- N:1 → `workspaces`
- N:1 → `clients`
- N:1 → `properties`

**索引建议**：`(client_id, occurred_at DESC)`, `(workspace_id, created_at)`

**可传给 DeepSeek 的字段**：无直接传递。

---

### 2.9 property_matches

**业务含义**：房源与客户之间的匹配结果。

**Match Level 枚举**：`excellent`, `good`, `fair`, `low`

**Status 枚举**：`active`, `dismissed`, `archived`

| 字段 | 类型 | 必填 | 默认值 | 说明 | 敏感级别 |
|---|---|---|---|---|---|
| `id` | UUID PK | YES | gen_random_uuid() | 主键 | LOW |
| `workspace_id` | UUID | YES | - | 所属 workspace | LOW |
| `property_id` | UUID | YES | - | 关联房源 | LOW |
| `client_id` | UUID | YES | - | 关联客户 | LOW |
| `score` | INTEGER | YES | 0 | 匹配分数（0-100） | LOW |
| `match_level` | match_level | YES | 'low' | 匹配等级 | LOW |
| `matched_reasons` | JSONB | NO | '[]' | 匹配原因 | LOW |
| `unmatched_reasons` | JSONB | NO | '[]' | 不匹配原因 | LOW |
| `needs_confirmation` | JSONB | NO | '[]' | 需要确认的信息 | LOW |
| `status` | match_status | YES | 'active' | 匹配状态 | LOW |
| `created_at` | TIMESTAMPTZ | YES | now() | 创建时间 | LOW |
| `updated_at` | TIMESTAMPTZ | YES | now() | 更新时间 | LOW |

**关联关系**：
- N:1 → `workspaces`
- N:1 → `properties`
- N:1 → `clients`

**唯一约束**：`UNIQUE(property_id, client_id)` -- 同一房源与同一客户仅保留一条活跃匹配

**索引建议**：`(workspace_id, status)`, `(client_id, score DESC)`, `(property_id, score DESC)`

**可传给 DeepSeek 的字段**：matched_reasons, unmatched_reasons 的文本内容（服务端生成，不直接包含客户或房东联系信息）。

---

### 2.10 content_projects

**业务含义**：内容创作项目，每个项目针对一个房源在一个平台上的一组内容。

**Platform 枚举**：`xiaohongshu`, `douyin`, `wechat_moments`

**Status 枚举**：`draft`, `ready`, `published`, `archived`

| 字段 | 类型 | 必填 | 默认值 | 说明 | 敏感级别 |
|---|---|---|---|---|---|
| `id` | UUID PK | YES | gen_random_uuid() | 主键 | LOW |
| `workspace_id` | UUID | YES | - | 所属 workspace | LOW |
| `property_id` | UUID | YES | - | 关联房源 | LOW |
| `created_by` | UUID | YES | - | 创建者 user_id | LOW |
| `platform` | content_platform | YES | 'xiaohongshu' | 目标平台 | LOW |
| `target_audience` | TEXT | NO | NULL | 目标客群 | LOW |
| `content_angle` | TEXT | NO | NULL | 内容角度 | LOW |
| `content_goal` | TEXT | NO | NULL | 内容目标 | LOW |
| `tone` | TEXT | NO | NULL | 语气 | LOW |
| `video_duration_seconds` | INTEGER | NO | NULL | 视频时长（秒，仅抖音） | LOW |
| `is_on_camera` | BOOLEAN | NO | false | 是否真人出镜 | LOW |
| `status` | content_project_status | YES | 'draft' | 项目状态 | LOW |
| `private_message_keyword` | TEXT | NO | NULL | 私信口令 | LOW |
| `created_at` | TIMESTAMPTZ | YES | now() | 创建时间 | LOW |
| `updated_at` | TIMESTAMPTZ | YES | now() | 更新时间 | LOW |
| `deleted_at` | TIMESTAMPTZ | NO | NULL | 软删除时间 | LOW |

**关联关系**：
- N:1 → `workspaces`
- N:1 → `properties`
- 1:N → `content_versions`
- 1:N → `publishing_records`

**索引建议**：`(workspace_id, platform, status)`, `(property_id)`

**访问控制**：此表需要 `has_feature('content_factory')` 检查。

**可传给 DeepSeek 的字段**：platform, target_audience, content_angle, content_goal, tone, video_duration_seconds, is_on_camera

---

### 2.11 content_versions

**业务含义**：内容项目的每次生成版本，保存 AI 输出与用户编辑结果。

**Compliance Status 枚举**：`clean`, `review_required`, `blocked`

| 字段 | 类型 | 必填 | 默认值 | 说明 | 敏感级别 |
|---|---|---|---|---|---|
| `id` | UUID PK | YES | gen_random_uuid() | 主键 | LOW |
| `workspace_id` | UUID | YES | - | 所属 workspace | LOW |
| `content_project_id` | UUID | YES | - | 关联内容项目 | LOW |
| `version_number` | INTEGER | YES | 1 | 版本号 | LOW |
| `model_provider` | TEXT | YES | 'deepseek' | 模型供应商（固定 deepseek） | LOW |
| `model_name` | TEXT | YES | - | 实际调用的模型名 | LOW |
| `prompt_version` | TEXT | YES | - | Prompt 版本号 | LOW |
| `input_snapshot` | JSONB | YES | - | 生成时的输入快照（已脱敏） | MEDIUM |
| `output_json` | JSONB | YES | - | AI 生成的完整输出 | MEDIUM |
| `facts_used` | JSONB | NO | '[]' | 使用的事实来源 | LOW |
| `missing_information` | JSONB | NO | '[]' | 缺失信息 | LOW |
| `risk_flags` | JSONB | NO | '[]' | 风险标记 | LOW |
| `compliance_status` | compliance_status | YES | 'clean' | 合规检查状态 | LOW |
| `compliance_flags` | JSONB | NO | '[]' | 合规命中详情 | LOW |
| `feedback_score` | INTEGER | NO | NULL | 反馈（1 = 👍, -1 = 👎） | LOW |
| `feedback_type` | TEXT | NO | NULL | 负反馈原因 | LOW |
| `feedback_comment` | TEXT | NO | NULL | 反馈补充说明 | LOW |
| `created_by` | UUID | YES | - | 创建者 | LOW |
| `created_at` | TIMESTAMPTZ | YES | now() | 创建时间 | LOW |

**关联关系**：
- N:1 → `workspaces`
- N:1 → `content_projects`

**索引建议**：`(content_project_id, version_number DESC)`

**访问控制**：此表需要 `has_feature('content_factory')` 检查。

**合规要求**：`input_snapshot` 和 `output_json` 在存储前 MUST 完成隐私脱敏。

**可传给 DeepSeek 的字段**：无直接传递（AI 输出目标）。

---

### 2.12 publishing_records

**业务含义**：内容发布后的跟踪记录。

| 字段 | 类型 | 必填 | 默认值 | 说明 | 敏感级别 |
|---|---|---|---|---|---|
| `id` | UUID PK | YES | gen_random_uuid() | 主键 | LOW |
| `workspace_id` | UUID | YES | - | 所属 workspace | LOW |
| `content_project_id` | UUID | YES | - | 关联内容项目 | LOW |
| `content_version_id` | UUID | YES | - | 关联版本 | LOW |
| `platform` | TEXT | YES | - | 发布平台 | LOW |
| `published_at` | TIMESTAMPTZ | YES | - | 发布时间 | LOW |
| `post_url` | TEXT | NO | NULL | 发布链接 | LOW |
| `content_code` | TEXT | NO | NULL | 内容编号 | LOW |
| `private_message_keyword` | TEXT | NO | NULL | 私信口令 | LOW |
| `views` | INTEGER | YES | 0 | 阅读/播放 | LOW |
| `likes` | INTEGER | YES | 0 | 点赞 | LOW |
| `favorites` | INTEGER | YES | 0 | 收藏 | LOW |
| `comments` | INTEGER | YES | 0 | 评论 | LOW |
| `direct_messages` | INTEGER | YES | 0 | 私信 | LOW |
| `qualified_leads` | INTEGER | YES | 0 | 有效咨询 | LOW |
| `viewings` | INTEGER | YES | 0 | 带看 | LOW |
| `deals` | INTEGER | YES | 0 | 成交 | LOW |
| `created_at` | TIMESTAMPTZ | YES | now() | 创建时间 | LOW |
| `updated_at` | TIMESTAMPTZ | YES | now() | 更新时间 | LOW |

**关联关系**：
- N:1 → `workspaces`
- N:1 → `content_projects`
- N:1 → `content_versions`

**索引建议**：`(workspace_id, published_at DESC)`, `(content_project_id)`

**访问控制**：此表需要 `has_feature('content_factory')` 检查。

**可传给 DeepSeek 的字段**：无。

---

### 2.13 tasks

**业务含义**：待办任务与跟进提醒。

**Task Type 枚举**：`contact_client`, `send_property`, `confirm_viewing`, `follow_up_viewing`, `update_property_status`, `contact_owner`, `publish_content`, `update_content_data`, `follow_up_collaboration`

**Status 枚举**：`todo`, `in_progress`, `done`, `cancelled`

| 字段 | 类型 | 必填 | 默认值 | 说明 | 敏感级别 |
|---|---|---|---|---|---|
| `id` | UUID PK | YES | gen_random_uuid() | 主键 | LOW |
| `workspace_id` | UUID | YES | - | 所属 workspace | LOW |
| `assigned_to` | UUID | YES | - | 指派人 user_id | LOW |
| `task_type` | task_type | YES | - | 任务类型 | LOW |
| `title` | TEXT | YES | - | 任务标题 | LOW |
| `description` | TEXT | NO | NULL | 任务描述 | LOW |
| `property_id` | UUID | NO | NULL | 关联房源 | LOW |
| `client_id` | UUID | NO | NULL | 关联客户 | LOW |
| `content_project_id` | UUID | NO | NULL | 关联内容项目 | LOW |
| `collaboration_request_id` | UUID | NO | NULL | 关联合作请求 | LOW |
| `status` | task_status | YES | 'todo' | 任务状态 | LOW |
| `due_at` | TIMESTAMPTZ | NO | NULL | 截止时间 | LOW |
| `completed_at` | TIMESTAMPTZ | NO | NULL | 完成时间 | LOW |
| `created_at` | TIMESTAMPTZ | YES | now() | 创建时间 | LOW |
| `updated_at` | TIMESTAMPTZ | YES | now() | 更新时间 | LOW |
| `deleted_at` | TIMESTAMPTZ | NO | NULL | 软删除时间 | LOW |

**关联关系**：
- N:1 → `workspaces`
- N:1 → `properties`
- N:1 → `clients`
- N:1 → `content_projects`
- N:1 → `collaboration_requests`

**索引建议**：`(workspace_id, status, due_at)`, `(assigned_to, status)`

**可传给 DeepSeek 的字段**：title, description（不含关联实体的敏感信息）。

---

### 2.14 leads

**业务含义**：潜在线索，来自内容互动、私信或其他渠道。

| 字段 | 类型 | 必填 | 默认值 | 说明 | 敏感级别 |
|---|---|---|---|---|---|
| `id` | UUID PK | YES | gen_random_uuid() | 主键 | LOW |
| `workspace_id` | UUID | YES | - | 所属 workspace | LOW |
| `source_platform` | TEXT | NO | NULL | 来源平台 | LOW |
| `source_content_id` | UUID | NO | NULL | 来源内容 | LOW |
| `source_property_id` | UUID | NO | NULL | 来源房源 | LOW |
| `private_message_keyword` | TEXT | NO | NULL | 私信口令 | LOW |
| `name` | TEXT | NO | NULL | 姓名 | MEDIUM |
| `phone` | TEXT | NO | NULL | 手机号 | HIGH |
| `wechat` | TEXT | NO | NULL | 微信号 | HIGH |
| `raw_message` | TEXT | NO | NULL | 原始消息 | MEDIUM |
| `is_qualified` | BOOLEAN | YES | false | 是否合格线索 | LOW |
| `converted_client_id` | UUID | NO | NULL | 转化客户 ID | LOW |
| `created_at` | TIMESTAMPTZ | YES | now() | 创建时间 | LOW |
| `updated_at` | TIMESTAMPTZ | YES | now() | 更新时间 | LOW |

**关联关系**：
- N:1 → `workspaces`
- N:1 → `content_projects` (source_content_id)
- N:1 → `properties` (source_property_id)
- N:1 → `clients` (converted_client_id)

**索引建议**：`(workspace_id, is_qualified, created_at DESC)`

**可传给 DeepSeek 的字段**：raw_message（脱敏后）, source_platform

**敏感处理**：phone, wechat MUST NOT 传给 DeepSeek。

---

### 2.15 collaboration_requests

**业务含义**：跨 workspace 的合作请求（外部中介查看共享房源后发起）。

**Status 枚举**：`pending`, `accepted`, `rejected`, `cancelled`, `completed`

| 字段 | 类型 | 必填 | 默认值 | 说明 | 敏感级别 |
|---|---|---|---|---|---|
| `id` | UUID PK | YES | gen_random_uuid() | 主键 | LOW |
| `requester_workspace_id` | UUID | YES | - | 请求方 workspace | LOW |
| `owner_workspace_id` | UUID | YES | - | 房源方 workspace | LOW |
| `property_id` | UUID | YES | - | 关联房源 | LOW |
| `message` | TEXT | NO | NULL | 合作留言 | LOW |
| `status` | collab_req_status | YES | 'pending' | 请求状态 | LOW |
| `requested_at` | TIMESTAMPTZ | YES | now() | 请求时间 | LOW |
| `responded_at` | TIMESTAMPTZ | NO | NULL | 响应时间 | LOW |
| `created_at` | TIMESTAMPTZ | YES | now() | 创建时间 | LOW |
| `updated_at` | TIMESTAMPTZ | YES | now() | 更新时间 | LOW |

**关联关系**：
- N:1 → `workspaces` (requester_workspace_id)
- N:1 → `workspaces` (owner_workspace_id)
- N:1 → `properties`

**索引建议**：`(owner_workspace_id, status)`, `(requester_workspace_id, status)`

**可传给 DeepSeek 的字段**：message（不含联系方式）。

---

### 2.16 feature_entitlements

**业务含义**：用户功能授权记录。

**Feature Key 枚举**：`ai_data_extraction`, `semantic_search`, `property_matching`, `shared_property_pool`, `content_factory`

**Status 枚举**：`active`, `revoked`

| 字段 | 类型 | 必填 | 默认值 | 说明 | 敏感级别 |
|---|---|---|---|---|---|
| `id` | UUID PK | YES | gen_random_uuid() | 主键 | LOW |
| `user_id` | UUID | YES | - | 被授权用户 | LOW |
| `feature` | feature_key | YES | - | 功能标识 | LOW |
| `status` | entitlement_status | YES | 'active' | 授权状态 | LOW |
| `granted_by` | UUID | YES | - | 授权管理员 | LOW |
| `granted_at` | TIMESTAMPTZ | YES | now() | 授权时间 | LOW |
| `expires_at` | TIMESTAMPTZ | NO | NULL | 过期时间 | LOW |
| `revoked_at` | TIMESTAMPTZ | NO | NULL | 撤销时间 | LOW |
| `created_at` | TIMESTAMPTZ | YES | now() | 创建时间 | LOW |
| `updated_at` | TIMESTAMPTZ | YES | now() | 更新时间 | LOW |

**唯一约束**：`UNIQUE(user_id, feature)`

**索引建议**：
- `UNIQUE(user_id, feature, status)` -- has_feature() 核心依赖
- `(feature, status, expires_at)` -- 管理员列表查询

**访问控制**：普通用户可读取自己的授权状态。写入仅限 `is_system_admin()`。

**可传给 DeepSeek 的字段**：无。

---

### 2.17 system_admins

**业务含义**：系统管理员身份记录。

| 字段 | 类型 | 必填 | 默认值 | 说明 | 敏感级别 |
|---|---|---|---|---|---|
| `id` | UUID PK | YES | gen_random_uuid() | 主键 | LOW |
| `user_id` | UUID | YES | - | 管理员 user_id | LOW |
| `status` | TEXT | YES | 'active' | 状态 | LOW |
| `created_by` | UUID | NO | NULL | 创建者 | LOW |
| `created_at` | TIMESTAMPTZ | YES | now() | 创建时间 | LOW |
| `revoked_at` | TIMESTAMPTZ | NO | NULL | 撤销时间 | LOW |

**索引建议**：`UNIQUE(user_id, status)` -- is_system_admin() 核心依赖

**访问控制**：普通用户 MUST NOT 读取或写入此表。

**可传给 DeepSeek 的字段**：无。

---

### 2.18 invitation_links

**业务含义**：邀请链接，用于邀请用户加入 workspace。

**Status 枚举**：`active`, `expired`, `revoked`

| 字段 | 类型 | 必填 | 默认值 | 说明 | 敏感级别 |
|---|---|---|---|---|---|
| `id` | UUID PK | YES | gen_random_uuid() | 主键 | LOW |
| `token_hash` | TEXT | YES | - | 邀请 Token 的 Hash 值 | MEDIUM |
| `created_by` | UUID | YES | - | 创建者 | LOW |
| `target_workspace_id` | UUID | NO | NULL | 目标 workspace | LOW |
| `max_uses` | INTEGER | NO | NULL | 最大使用次数 | LOW |
| `used_count` | INTEGER | YES | 0 | 已使用次数 | LOW |
| `expires_at` | TIMESTAMPTZ | NO | NULL | 过期时间 | LOW |
| `status` | invite_status | YES | 'active' | 状态 | LOW |
| `created_at` | TIMESTAMPTZ | YES | now() | 创建时间 | LOW |
| `updated_at` | TIMESTAMPTZ | YES | now() | 更新时间 | LOW |

**安全要求**：MUST NOT 存储明文 Token，仅保存 Hash。

**索引建议**：`(status, expires_at)`

**可传给 DeepSeek 的字段**：无。

---

### 2.19 ai_usage_logs

**业务含义**：AI 调用使用日志，包含配额预占、结算和合规拒绝记录。

**Status 枚举**：`reserved`, `succeeded`, `failed`, `rejected`, `rejected_compliance`, `blocked_by_cost_limit`

**Provider 枚举（固定）**：`deepseek`, `deepseek_self_hosted`

| 字段 | 类型 | 必填 | 默认值 | 说明 | 敏感级别 |
|---|---|---|---|---|---|
| `id` | UUID PK | YES | gen_random_uuid() | 主键 | LOW |
| `user_id` | UUID | YES | - | 调用用户 | LOW |
| `workspace_id` | UUID | YES | - | 所属 workspace | LOW |
| `action` | TEXT | YES | - | 操作标识 | LOW |
| `feature` | feature_key | YES | - | 功能标识 | LOW |
| `provider` | TEXT | YES | 'deepseek' | 模型供应商 | LOW |
| `model` | TEXT | YES | - | 实际模型名 | LOW |
| `capability` | TEXT | YES | - | 能力标识（text/vision） | LOW |
| `input_tokens` | INTEGER | NO | NULL | 输入 Token 数 | LOW |
| `output_tokens` | INTEGER | NO | NULL | 输出 Token 数 | LOW |
| `estimated_cost_usd` | NUMERIC | NO | NULL | 结算成本（USD） | LOW |
| `reserved_estimated_cost_usd` | NUMERIC | NO | NULL | 预占成本（USD） | LOW |
| `quota_date` | DATE | YES | - | 配额日期 | LOW |
| `quota_units` | INTEGER | YES | 1 | 占用配额单位 | LOW |
| `status` | ai_usage_status | YES | 'reserved' | 用量状态 | LOW |
| `compliance_flags` | JSONB | NO | NULL | 合规标志 | LOW |
| `idempotency_key` | TEXT | YES | - | 幂等键 | LOW |
| `request_id` | UUID | YES | - | 请求追踪 ID | LOW |
| `reservation_expires_at` | TIMESTAMPTZ | NO | NULL | 预占过期时间 | LOW |
| `error_code` | TEXT | NO | NULL | 错误码 | LOW |
| `created_at` | TIMESTAMPTZ | YES | now() | 创建时间 | LOW |
| `updated_at` | TIMESTAMPTZ | YES | now() | 更新时间 | LOW |

**唯一约束**：`UNIQUE(user_id, feature, idempotency_key)` -- 幂等功能核心

**索引建议**：
- `(user_id, quota_date, feature, status)` -- 配额统计
- `(capability, status, created_at DESC)` -- 管理员用量查看
- `(user_id, created_at)` -- 用户用量历史
- `UNIQUE(user_id, feature, idempotency_key)` -- 幂等

**安全要求**：MUST NOT 记录明文手机号、微信号、精确地址或完整 Prompt。

**访问控制**：用户只能查看自己的日志。管理员可查看平台汇总。

**可传给 DeepSeek 的字段**：无。

---

### 2.20 ai_correction_logs

**业务含义**：AI 原始输出与用户确认输出之间的差异记录。

**Feature 枚举**：`ai_data_extraction`, `content_factory`

**Entity Type 枚举**：`property`, `client`, `content`

| 字段 | 类型 | 必填 | 默认值 | 说明 | 敏感级别 |
|---|---|---|---|---|---|
| `id` | UUID PK | YES | gen_random_uuid() | 主键 | LOW |
| `user_id` | UUID | YES | - | 用户 ID | LOW |
| `workspace_id` | UUID | YES | - | 所属 workspace | LOW |
| `feature` | feature_key | YES | - | 功能标识 | LOW |
| `request_id` | UUID | YES | - | AI 请求 ID | LOW |
| `entity_type` | TEXT | YES | - | 实体类型 | LOW |
| `entity_id` | UUID | YES | - | 实体 ID | LOW |
| `content_version_id` | UUID | NO | NULL | 关联内容版本 | LOW |
| `prompt_version` | TEXT | YES | - | Prompt 版本 | LOW |
| `model_name` | TEXT | YES | - | 模型名称 | LOW |
| `original_output` | JSONB | YES | - | AI 原始输出（已脱敏） | MEDIUM |
| `corrected_output` | JSONB | YES | - | 用户确认输出（已脱敏） | MEDIUM |
| `diff` | JSONB | YES | - | 字段级差异 | MEDIUM |
| `feedback_score` | INTEGER | NO | NULL | 反馈评分 | LOW |
| `feedback_type` | TEXT | NO | NULL | 反馈类型 | LOW |
| `feedback_comment` | TEXT | NO | NULL | 反馈说明 | LOW |
| `created_at` | TIMESTAMPTZ | YES | now() | 创建时间 | LOW |

**索引建议**：`(user_id, feature, created_at DESC)`

**隐私要求**：`original_output`、`corrected_output` 和 `diff` 在写入前 MUST 删除电话、微信、精确地址、钥匙位置等敏感字段。

**访问控制**：用户只能读取自己的纠错日志。

**可传给 DeepSeek 的字段**：无。

---

### 2.21 ai_user_preferences

**业务含义**：基于用户历史纠错行为学习的偏好，以 Prompt Hint 形式注入。

| 字段 | 类型 | 必填 | 默认值 | 说明 | 敏感级别 |
|---|---|---|---|---|---|
| `id` | UUID PK | YES | gen_random_uuid() | 主键 | LOW |
| `user_id` | UUID | YES | - | 用户 ID | LOW |
| `workspace_id` | UUID | YES | - | 所属 workspace | LOW |
| `feature` | feature_key | YES | - | 功能标识 | LOW |
| `preference_key` | TEXT | YES | - | 偏好标识 | LOW |
| `preference_value` | JSONB | YES | - | 偏好内容 | LOW |
| `evidence_count` | INTEGER | YES | 1 | 证据数量 | LOW |
| `confidence` | NUMERIC | YES | 0.0 | 置信度（0-1） | LOW |
| `status` | TEXT | YES | 'active' | 状态 | LOW |
| `source_correction_ids` | UUID[] | NO | '{}' | 来源纠错 ID 列表 | LOW |
| `created_at` | TIMESTAMPTZ | YES | now() | 创建时间 | LOW |
| `updated_at` | TIMESTAMPTZ | YES | now() | 更新时间 | LOW |

**约束**：仅当同类纠错达到 `AI_PREFERENCE_MIN_EVIDENCE` 阈值（默认 3）后生成偏好。偏好 MUST NOT 覆盖价格、面积、联系方式等事实字段。

**访问控制**：用户只能查看、删除自己的偏好。不得修改 evidence_count 和 confidence。

**可传给 DeepSeek 的字段**：preference_value 作为 Prompt Hint 注入。

---

### 2.22 ai_model_pricing

**业务含义**：模型定价版本记录，用于成本计算。

**Provider 枚举（固定）**：`deepseek`, `deepseek_self_hosted`

| 字段 | 类型 | 必填 | 默认值 | 说明 | 敏感级别 |
|---|---|---|---|---|---|
| `id` | UUID PK | YES | gen_random_uuid() | 主键 | LOW |
| `provider` | TEXT | YES | 'deepseek' | 供应商 | LOW |
| `model` | TEXT | YES | - | 模型名 | LOW |
| `capability` | TEXT | YES | - | 能力标识 | LOW |
| `input_usd_per_million_tokens` | NUMERIC | YES | - | 输入价格（USD/百万Token） | LOW |
| `output_usd_per_million_tokens` | NUMERIC | YES | - | 输出价格（USD/百万Token） | LOW |
| `image_unit_price_usd` | NUMERIC | NO | NULL | 图片单价（视觉模型） | LOW |
| `currency` | TEXT | YES | 'USD' | 货币单位 | LOW |
| `effective_from` | TIMESTAMPTZ | YES | - | 生效时间 | LOW |
| `effective_to` | TIMESTAMPTZ | NO | NULL | 失效时间 | LOW |
| `status` | TEXT | YES | 'active' | 状态 | LOW |
| `created_at` | TIMESTAMPTZ | YES | now() | 创建时间 | LOW |
| `updated_at` | TIMESTAMPTZ | YES | now() | 更新时间 | LOW |

**索引建议**：`(provider, model, capability, effective_from)`

**访问控制**：仅 `is_system_admin()` 可写。普通用户无读权限。

**可传给 DeepSeek 的字段**：无。

---

### 2.23 ai_user_limits

**业务含义**：用户级 AI 使用限制覆盖。

| 字段 | 类型 | 必填 | 默认值 | 说明 | 敏感级别 |
|---|---|---|---|---|---|
| `id` | UUID PK | YES | gen_random_uuid() | 主键 | LOW |
| `user_id` | UUID | YES | - | 用户 ID | LOW |
| `feature` | feature_key | YES | - | 功能标识 | LOW |
| `daily_request_limit` | INTEGER | NO | NULL | 每日次数上限覆盖 | LOW |
| `daily_cost_limit_usd` | NUMERIC | NO | NULL | 每日成本上限覆盖 | LOW |
| `status` | TEXT | YES | 'active' | 状态 | LOW |
| `blocked_at` | TIMESTAMPTZ | NO | NULL | 熔断时间 | LOW |
| `blocked_reason` | TEXT | NO | NULL | 熔断原因 | LOW |
| `manually_restored_at` | TIMESTAMPTZ | NO | NULL | 手动恢复时间 | LOW |
| `restored_by` | UUID | NO | NULL | 恢复操作管理员 | LOW |
| `created_at` | TIMESTAMPTZ | YES | now() | 创建时间 | LOW |
| `updated_at` | TIMESTAMPTZ | YES | now() | 更新时间 | LOW |

**索引建议**：`(user_id, feature)`

**访问控制**：仅 `is_system_admin()` 可写。

**可传给 DeepSeek 的字段**：无。

---

### 2.24 ai_runtime_config

**业务含义**：AI 运行时配置，包含主备模型和熔断状态。

**Mode 枚举**：`auto`, `primary`, `fallback`

| 字段 | 类型 | 必填 | 默认值 | 说明 | 敏感级别 |
|---|---|---|---|---|---|
| `id` | UUID PK | YES | gen_random_uuid() | 主键 | LOW |
| `capability` | TEXT | YES | - | 能力标识 | LOW |
| `provider` | TEXT | YES | 'deepseek' | 供应商（固定） | LOW |
| `primary_model` | TEXT | YES | - | 主模型名 | LOW |
| `fallback_model` | TEXT | YES | - | 备用模型名 | LOW |
| `primary_endpoint_key` | TEXT | YES | - | 主端点环境变量标识 | MEDIUM |
| `fallback_endpoint_key` | TEXT | YES | - | 备用端点环境变量标识 | MEDIUM |
| `mode` | TEXT | YES | 'auto' | 运行模式 | LOW |
| `failure_threshold` | INTEGER | YES | 3 | 故障阈值 | LOW |
| `failure_window_seconds` | INTEGER | YES | 300 | 故障窗口（秒） | LOW |
| `circuit_open_until` | TIMESTAMPTZ | NO | NULL | 熔断开启截止时间 | LOW |
| `updated_by` | UUID | YES | - | 更新人 | LOW |
| `created_at` | TIMESTAMPTZ | YES | now() | 创建时间 | LOW |
| `updated_at` | TIMESTAMPTZ | YES | now() | 更新时间 | LOW |

**安全要求**：`provider` 仅允许 `deepseek`。表中 MUST NOT 保存明文 API Key，只保存环境变量引用标识。

**访问控制**：仅 `is_system_admin()` 可写。

**可传给 DeepSeek 的字段**：无。

---

### 2.25 compliance_terms

**业务含义**：房产营销合规风险词库。

**Severity 枚举**：`block`, `review`, `highlight`

| 字段 | 类型 | 必填 | 默认值 | 说明 | 敏感级别 |
|---|---|---|---|---|---|
| `id` | UUID PK | YES | gen_random_uuid() | 主键 | LOW |
| `term` | TEXT | YES | - | 风险词/正则 | LOW |
| `category` | TEXT | YES | - | 风险类别 | LOW |
| `severity` | compliance_severity | YES | 'review' | 严重级别 | LOW |
| `match_type` | TEXT | YES | 'exact' | 匹配方式 | LOW |
| `replacement_suggestion` | TEXT | NO | NULL | 替换建议 | LOW |
| `status` | TEXT | YES | 'active' | 状态 | LOW |
| `version` | INTEGER | YES | 1 | 词库版本 | LOW |
| `created_by` | UUID | YES | - | 创建者 | LOW |
| `created_at` | TIMESTAMPTZ | YES | now() | 创建时间 | LOW |
| `updated_at` | TIMESTAMPTZ | YES | now() | 更新时间 | LOW |

**索引建议**：`(status, severity, term)`

**访问控制**：仅 `is_system_admin()` 可写。`compliance_review_logs` 创建时 MUST 验证用户对对应内容版本有访问权限。

**可传给 DeepSeek 的字段**：无。

---

### 2.26 compliance_review_logs

**业务含义**：合规风险处理日志。

| 字段 | 类型 | 必填 | 默认值 | 说明 | 敏感级别 |
|---|---|---|---|---|---|
| `id` | UUID PK | YES | gen_random_uuid() | 主键 | LOW |
| `workspace_id` | UUID | YES | - | 所属 workspace | LOW |
| `content_version_id` | UUID | YES | - | 关联内容版本 | LOW |
| `user_id` | UUID | YES | - | 操作用户 | LOW |
| `flag_id` | UUID | YES | - | 关联词条 ID | LOW |
| `action` | TEXT | YES | - | 处理动作 | LOW |
| `reason` | TEXT | NO | NULL | 处理理由 | LOW |
| `before_text` | TEXT | NO | NULL | 修改前文本 | LOW |
| `after_text` | TEXT | NO | NULL | 修改后文本 | LOW |
| `created_at` | TIMESTAMPTZ | YES | now() | 创建时间 | LOW |

**关联关系**：
- N:1 → `workspaces`
- N:1 → `content_versions`
- N:1 → `compliance_terms` (flag_id)

**可传给 DeepSeek 的字段**：无。

---

### 2.27 audit_logs

**业务含义**：系统审计日志，不可由普通用户更新或删除。

| 字段 | 类型 | 必填 | 默认值 | 说明 | 敏感级别 |
|---|---|---|---|---|---|
| `id` | UUID PK | YES | gen_random_uuid() | 主键 | LOW |
| `workspace_id` | UUID | YES | - | 所属 workspace | LOW |
| `actor_user_id` | UUID | YES | - | 操作者 user_id | LOW |
| `entity_type` | TEXT | YES | - | 实体类型 | LOW |
| `entity_id` | UUID | YES | - | 实体 ID | LOW |
| `action` | TEXT | YES | - | 操作动作 | LOW |
| `before_data` | JSONB | NO | NULL | 操作前数据（已脱敏） | HIGH |
| `after_data` | JSONB | NO | NULL | 操作后数据（已脱敏） | HIGH |
| `ip_address` | TEXT | NO | NULL | IP 地址 | MEDIUM |
| `user_agent` | TEXT | NO | NULL | User Agent | LOW |
| `created_at` | TIMESTAMPTZ | YES | now() | 创建时间 | LOW |

**安全要求**：
- 普通用户 MUST NOT 更新或删除 audit_logs。
- `before_data` 和 `after_data` MUST 脱敏后写入。
- 写入必须由服务端受控执行。

**索引建议**：`(entity_type, entity_id)`, `(actor_user_id, created_at DESC)`, `(workspace_id, created_at DESC)`

**可传给 DeepSeek 的字段**：无。

---

## 3. 状态机

### 3.1 房源状态 (properties.status)

```
draft ─────────> available ──────> reserved ──────> rented
  │                  │                │
  │                  ├──> offline     │
  │                  ├──> expired     │
  │                  └──> deleted     │
  └──────────────────> deleted
```

| 转换 | 来源 | 目标 | 谁可执行 | 前置条件 | 副作用 | 审计要求 |
|---|---|---|---|---|---|---|
| 发布房源 | draft | available | Workspace Owner/Member | 必填字段完整 | 无 | 记录状态变更 |
| 标记预留 | available | reserved | Workspace Owner/Member | 房源为 available | 无 | 记录状态变更 |
| 标记已租 | reserved/available | rented | Workspace Owner/Member | 无 | 匹配记录可更新 | 记录成交事件 |
| 下架房源 | available | offline | Workspace Owner | 无 | 共享房源失效 | 记录状态变更、共享失效 |
| 标记过期 | available/reserved | expired | 系统自动 | shared_expires_at 已过 | 共享失效 | 系统自动记录 |
| 软删除 | any except rented | deleted | Workspace Owner | 设置 deleted_at | 默认列表不显示；不删除媒体和关联数据 | 必须审计 |
| 重新上架 | offline/expired | available | Workspace Owner | 必填字段完整 | 共享需重新配置 | 记录状态变更 |

### 3.2 客户阶段 (clients.stage)

```
new ──────> qualified ──────> properties_sent ──────> viewing_scheduled
                                                    │
  ┌─────────────────────────────────────────────────┘
  ▼
viewed ──────> considering ──────> closed_won
  │                │
  ├──> paused      ├──> paused
  └──> lost        └──> lost

any except deleted ──────> deleted
```

| 转换 | 来源 | 目标 | 谁可执行 | 前置条件 | 副作用 | 审计要求 |
|---|---|---|---|---|---|---|
| 需求确认 | new | qualified | Workspace Owner/Member | 客户需求信息完整 | 无 | 记录阶段变更 |
| 发送房源 | qualified | properties_sent | Workspace Owner/Member | 至少发送 1 套房源 | 创建 match 记录 | 记录阶段变更 |
| 预约看房 | properties_sent | viewing_scheduled | Workspace Owner/Member | 设置了看房时间 | 创建待办任务 | 记录阶段变更 |
| 完成看房 | viewing_scheduled | viewed | Workspace Owner/Member | 看房已完成 | 更新 interaction | 记录阶段变更 |
| 考虑中 | viewed/considering | considering | Workspace Owner/Member | 无 | 无 | 记录阶段变更 |
| 成交 | any active | closed_won | Workspace Owner/Member | 确认成交 | 可关联房源状态 | 记录成交事件 |
| 暂停跟进 | qualified/considering | paused | Workspace Owner/Member | 填写暂停原因 | 取消未完成待办 | 记录阶段变更 |
| 丢单 | any active | lost | Workspace Owner/Member | 填写丢单原因 | 取消未完成待办 | 记录阶段变更 |
| 软删除 | any except closed_won | deleted | Workspace Owner | 设置 deleted_at | 默认列表不显示 | 必须审计 |

### 3.3 内容状态 (content_projects.status)

```
draft ──────> ready ──────> published ──────> archived
  │              │
  └──> archived  └──> archived
```

| 转换 | 来源 | 目标 | 谁可执行 | 前置条件 | 副作用 | 审计要求 |
|---|---|---|---|---|---|---|
| 标记就绪 | draft | ready | Content Factory 用户 | 合规检查通过（无 block 级风险） | 创建 content_version | 记录版本和合规状态 |
| 标记发布 | ready | published | Content Factory 用户 | 内容已发布到平台 | 创建 publishing_record | 记录发布事件 |
| 归档 | draft/ready/published | archived | Content Factory 用户 | 无 | 内容不再活跃 | 记录归档事件 |

### 3.4 任务状态 (tasks.status)

```
todo ──────> in_progress ──────> done
  │               │
  └──> cancelled  └──> cancelled
```

| 转换 | 来源 | 目标 | 谁可执行 | 前置条件 | 副作用 | 审计要求 |
|---|---|---|---|---|---|---|
| 开始处理 | todo | in_progress | 被指派人 | 无 | 无 | 无需审计 |
| 完成任务 | in_progress | done | 被指派人 | 所有子步骤完成 | 设置 completed_at | 记录完成 |
| 取消任务 | todo/in_progress | cancelled | Workspace Owner/被指派人 | 无 | 无 | 无需审计 |

### 3.5 合作请求状态 (collaboration_requests.status)

```
pending ──┬──> accepted ──> completed
          ├──> rejected
          └──> cancelled
```

| 转换 | 来源 | 目标 | 谁可执行 | 前置条件 | 副作用 | 审计要求 |
|---|---|---|---|---|---|---|
| 接受请求 | pending | accepted | Owner Workspace Member | 房源仍在共享 | 通知请求方 | 记录合作建立 |
| 拒绝请求 | pending | rejected | Owner Workspace Member | 无 | 通知请求方 | 无需审计 |
| 取消请求 | pending | cancelled | Requester Workspace Member | 请求尚未被处理 | 无 | 无需审计 |
| 合作完成 | accepted | completed | Owner Workspace Member | 合作结束 | 无 | 记录合作完成 |

### 3.6 Feature Entitlement 状态 (feature_entitlements.status)

```
active ──────> revoked
```

| 转换 | 来源 | 目标 | 谁可执行 | 前置条件 | 副作用 | 审计要求 |
|---|---|---|---|---|---|---|
| 撤销授权 | active | revoked | System Admin | 无 | has_feature 立即返回 false；前端导航消失；API 返回 403；RLS 拒绝 | 必须写入 audit_logs |

注意：`active` 状态还需检查 `expires_at`，若已过期，`has_feature` 返回 false（无需 `revoked` 转换）。

### 3.7 AI Usage 状态 (ai_usage_logs.status)

```
reserved ──┬──> succeeded
           ├──> failed
           ├──> rejected
           ├──> rejected_compliance
           └──> (expired via reservation_expires_at)
```

| 转换 | 来源 | 目标 | 谁可执行 | 前置条件 | 副作用 | 审计要求 |
|---|---|---|---|---|---|---|
| 调用成功 | reserved | succeeded | 服务端自动 | DeepSeek 返回成功响应 | 用实际 Token Usage 结算成本 | 记录用量和成本 |
| 调用失败 | reserved | failed | 服务端自动 | DeepSeek 调用失败 | 释放预占 | 记录错误码 |
| 权限拒绝 | reserved | rejected | 服务端自动 | 权限/配额检查失败 | 释放预占 | 记录拒绝原因 |
| 合规拒绝 | reserved | rejected_compliance | 服务端自动 | 合规扫描 block | 释放预占 | 记录合规命中 |
| 预占过期 | reserved | (不变, expired) | 系统自动/Cron | reservation_expires_at 已过 | 预占失效，不计入配额统计 | 无需单独审计 |

---

## 4. 数据命名约定

| 概念 | 页面 URL | API 路径 | 数据库表 | 其他名称 |
|---|---|---|---|---|
| 共享房源 | `/properties/shared` | `/api/shared-properties` | `properties`（通过共享视图查询） | 共享库、合作库 |
| 功能授权 | `/admin/feature-entitlements` | `/api/admin/feature-entitlements` | `feature_entitlements` | Entitlement |
| 内容工厂 | `/content` | `/api/ai/generate-content` | `content_projects`, `content_versions` | Content Factory |
| 合作请求 | `/collaboration-requests` | `/api/collaboration-requests` | `collaboration_requests` | 合作请求 |

---

## 5. Open Questions

无。所有影响 Phase 1 的问题均已在 HouseVibe Phase 0 v1.0 中冻结。

以下未来扩展方向已记录在 `docs/plans/phase0-backlog.md` 中，不阻塞 Phase 1:
- **业务类型扩展**：`workspaces.business_type` 已预留，当前默认 `residential_lease`。扩展到二手房买卖需 Phase 2+ ADR。
- **视频支持优先级**：`property_media.media_type` 已预留 `video`，视觉分析当前仅支持图片。视频分析需 Phase 3+ 独立 ADR（ADR-004 预留）。
- **多语言支持**：当前全栈中文。多语言需 PRD 变更后才能评估 schema 影响。

## 6. Out of Scope (MVP)

- 在线支付与房租托管
- 电子合同签署
- 财务记账
- 经纪人绩效与复杂组织管理
- 自动房价评估
- 视频自动剪辑与数字人
- 完整地图找房
- 抖音/小红书自动发布（非官方平台自动登录）
- 门店多层级组织架构
- 跨门店复杂权限继承

## 7. Change Control

本文档冻结后，任何对实体定义、字段类型、枚举值、状态机转换的修改 MUST：

1. 先提交 `docs/decisions/ADR-XXX-domain-change.md`。
2. 经 solution-architect 和主 Agent 审查批准。
3. 更新本文档版本号并记录变更摘要。
4. 通知所有受影响 Agent（data-security-engineer、property-crm-engineer、ai-deepseek-engineer、mobile-ui-engineer）。
