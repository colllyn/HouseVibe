# HouseVibe RLS Contract

| 属性 | 值 |
|---|---|
| 文档名称 | rls-contract |
| 版本 | 1.0 |
| 状态 | FROZEN FOR PHASE 1 |
| Owner | solution-architect |
| 依赖 | PRD v1.3, domain-model v1.0 |
| 最后更新 | 2026-07-30 |

---

## 1. 默认原则

1. **RLS 默认拒绝**：所有表默认启用 RLS，无匹配策略时返回 0 行。
2. **workspace_id 隔离**：所有业务数据通过 `workspace_id` 隔离，策略验证 `is_workspace_member(workspace_id)`。
3. **Service Role 仅服务端**：Service Role Key 仅存在于服务端，用于受控管理任务。每次使用前 MUST 执行系统管理员检查。
4. **前端不可依赖 Service Role**：所有客户端请求使用 anon key + 用户 JWT。
5. **共享房源通过脱敏视图/RPC**：外部用户 MUST NOT 直接读取原表后自行脱敏。
6. **property_private_details 永不进入共享查询**：共享视图/共享 API MUST NOT 包含此表的任何字段。
7. **is_shared 与 allow_marketing_reuse 独立**：共享和营销复用是独立授权。
8. **content_factory 三层校验**：UI 层、Route Handler/Server Action 层、RLS 层均需检查。
9. **所有删除软删除**：`deleted_at IS NULL` 策略过滤。
10. **敏感日志脱敏**：不得记录明文手机号、微信、Token 或完整 Prompt。

---

## 2. 辅助函数

### 2.1 函数签名与实现约束

#### is_workspace_member(workspace_uuid uuid) RETURNS boolean

```sql
-- 稳定、单层、可 EXPLAIN 的查询
-- 只查询 workspace_members 表，不得再查询 properties、clients 或调用自身
-- 使用 (select auth.uid()) 获取当前用户
-- SECURITY DEFINER，固定 search_path，仅向 authenticated 角色授予 execute
CREATE OR REPLACE FUNCTION is_workspace_member(workspace_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM workspace_members
    WHERE workspace_id = workspace_uuid
      AND user_id = (select auth.uid())
      AND status = 'active'
  );
$$;
```

#### is_workspace_owner(workspace_uuid uuid) RETURNS boolean

```sql
CREATE OR REPLACE FUNCTION is_workspace_owner(workspace_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM workspace_members
    WHERE workspace_id = workspace_uuid
      AND user_id = (select auth.uid())
      AND role = 'owner'
      AND status = 'active'
  );
$$;
```

#### is_system_admin() RETURNS boolean

```sql
-- 检查 system_admins 表，状态必须为 active
CREATE OR REPLACE FUNCTION is_system_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM system_admins
    WHERE user_id = (select auth.uid())
      AND status = 'active'
  );
$$;
```

#### has_feature(requested_feature feature_key) RETURNS boolean

```sql
-- 检查 feature_entitlements 表
-- status = active 且 (expires_at IS NULL OR expires_at > now())
-- 用户未被禁用
CREATE OR REPLACE FUNCTION has_feature(requested_feature feature_key)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM feature_entitlements
    WHERE user_id = (select auth.uid())
      AND feature = requested_feature
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;
```

#### reserve_ai_quota(...) RETURNS record

```sql
-- 原子 RPC，在单事务中：
-- 1. 校验 idempotency_key 是否已存在
-- 2. 锁定用户当日配额维度
-- 3. 统计有效预占和成功次数
-- 4. 统计成功成本与未过期预占成本
-- 5. 超限时返回 limit_reason
-- 6. 未超限时插入 status = reserved
-- 7. 返回剩余次数和成本额度
-- 详细参数见 compliance-and-audit-contract.md
```

### 2.2 权限授予

```sql
-- 仅向 authenticated 角色授予 execute
GRANT EXECUTE ON FUNCTION is_workspace_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_workspace_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_system_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION has_feature(feature_key) TO authenticated;
```

### 2.3 SECURITY DEFINER 安全要求

- 函数 MUST 位于非 public schema（如 `rls_helpers`）。
- 函数 MUST 设置 `SET search_path = ''`。
- 表名 MUST 使用完整限定名（schema.table）。
- 函数 MUST NOT 接受来自用户的可变参数直接拼接到动态 SQL 中。

---

## 3. RLS Performance Requirements

### 3.1 必须建立的索引

| 索引 | 说明 |
|---|---|
| `workspace_members(workspace_id, user_id) UNIQUE` | is_workspace_member 核心 |
| `workspace_members(user_id, workspace_id, status)` | 反向查询 |
| `feature_entitlements(user_id, feature, status)` | has_feature 核心 |
| `system_admins(user_id, status)` | is_system_admin 核心 |

### 3.2 策略性能规则

1. MUST NOT 在 `workspace_members` 自身 RLS Policy 中调用 `is_workspace_member`，避免递归。
2. 高频路径使用简单 `EXISTS` 而非嵌套子查询。
3. 避免一个 Policy 嵌套调用多个辅助函数。
4. JWT `app_metadata` 仅用于系统管理员等低频变化权限。需要立即生效的 workspace 成员关系和 entitlement 以数据库记录为准。
5. Policy 中使用 `(select auth.uid())` 而非 `auth.uid()`（后者在某些上下文中可能有性能差异）。
6. 私有房源与共享房源查询 MUST 分离，不得在私有 properties Policy 中简单加入 `OR is_shared = true`。
7. 共享列表通过专用脱敏 View/RPC 查询。

### 3.3 性能验证要求

- 测试数据至少达到 10 万条房源。
- 对主要列表查询使用 `EXPLAIN (ANALYZE, BUFFERS)` 验证。
- 确认索引命中（Index Scan / Bitmap Index Scan），避免 Seq Scan。
- 常用查询响应时间 < 2 秒。

---

## 4. Policy 矩阵

### 图例

- **W**: 当前 Workspace 成员
- **O**: Workspace Owner
- **SA**: 系统管理员 (System Admin)
- **EC**: 外部合作用户 (External Collaborator)
- **N**: 无权限
- **R**: 仅读
- **RW**: 读/写
- **RWD**: 读/写/删（软删除）
- **\*** = 仅自己的数据

---

### 4.1 profiles

| 操作 | W | O | SA | EC | Policy 描述 |
|---|---|---|---|---|---|
| SELECT | R* | R* | R(all) | N | 用户可读自己的 profile；系统管理员可读所有 |
| INSERT | N (系统自动) | N | N | N | 注册时由 trigger/service_role 创建 |
| UPDATE | RW* | RW* | N | N | 用户仅更新自己的 profile |
| DELETE | N | N | N | N | 不支持直接删除 |

```sql
-- SELECT policy
CREATE POLICY "Users can read own profile" ON profiles
  FOR SELECT USING (id = (select auth.uid()));

CREATE POLICY "System admins can read all profiles" ON profiles
  FOR SELECT USING (is_system_admin());

-- UPDATE policy
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));
```

---

### 4.2 workspaces

| 操作 | W | O | SA | EC | Policy 描述 |
|---|---|---|---|---|---|
| SELECT | R | R | R(all) | R(有限) | 成员可读自己的 workspace；SA 可读所有 |
| INSERT | N (系统自动) | N | N | N | 注册时由 trigger/service_role 创建 |
| UPDATE | N | RW | N | N | 仅 Owner 可更新 workspace 信息 |
| DELETE | N | N | N | N | MVP 不支持删除 |

```sql
CREATE POLICY "Members can read own workspaces" ON workspaces
  FOR SELECT USING (
    is_workspace_member(id)
    OR is_system_admin()
  );

CREATE POLICY "Owner can update workspace" ON workspaces
  FOR UPDATE USING (is_workspace_owner(id))
  WITH CHECK (is_workspace_owner(id));
```

---

### 4.3 workspace_members

**重要**：此表被 `is_workspace_member()` 函数查询，自身 RLS MUST NOT 递归调用该函数。

| 操作 | W | O | SA | EC | Policy 描述 |
|---|---|---|---|---|---|
| SELECT | R | R | R(all) | N | 使用直接 EXISTS 检查，不调用 is_workspace_member |
| INSERT | N | N | N | N | 通过邀请系统由 service_role 创建 |
| UPDATE | N | RW | N | N | Owner 可管理成员（仅本 workspace） |
| DELETE | N | RW | N | N | Owner 可移除成员（软删除：设置 inactive） |

```sql
-- SELECT: 直接 EXISTS，避免递归
CREATE POLICY "Members can see own memberships" ON workspace_members
  FOR SELECT USING (
    user_id = (select auth.uid())
    OR is_system_admin()
    OR EXISTS (
      SELECT 1 FROM workspace_members AS owner_check
      WHERE owner_check.workspace_id = workspace_members.workspace_id
        AND owner_check.user_id = (select auth.uid())
        AND owner_check.role = 'owner'
        AND owner_check.status = 'active'
    )
  );
```

---

### 4.4 properties

| 操作 | W | O | SA | EC | Policy 描述 |
|---|---|---|---|---|---|
| SELECT | R | R | R(all) | R(仅共享) | 成员读本 workspace 未删除房源 + 通过共享视图读共享房源 |
| INSERT | RW | RW | N | N | 成员可创建房源 |
| UPDATE | RW | RW* | N | N | 成员可更新本 workspace 房源；Owner 可有更多权限 |
| DELETE | N | RWD | N | N | 仅 Owner 可软删除 |

```sql
-- SELECT: 私有房源
CREATE POLICY "Workspace members can read properties" ON properties
  FOR SELECT USING (
    is_workspace_member(workspace_id)
    AND deleted_at IS NULL
  );

-- INSERT
CREATE POLICY "Workspace members can create properties" ON properties
  FOR INSERT WITH CHECK (
    is_workspace_member(workspace_id)
  );

-- UPDATE
CREATE POLICY "Workspace members can update properties" ON properties
  FOR UPDATE USING (
    is_workspace_member(workspace_id)
    AND deleted_at IS NULL
  ) WITH CHECK (
    is_workspace_member(workspace_id)
  );

-- DELETE (软删除): 仅 Owner
CREATE POLICY "Owner can soft-delete properties" ON properties
  FOR DELETE USING (
    is_workspace_owner(workspace_id)
  );
```

**共享房源查询**：外部用户通过专用脱敏 View/RPC 查询，不在 properties 表上直接加 `OR is_shared = true`。

```sql
-- 共享房源脱敏视图
CREATE VIEW shared_properties_view AS
SELECT
  id, workspace_id, title, city, district, business_area,
  community_name, rental_type, monthly_rent, deposit_terms,
  bedrooms, living_rooms, bathrooms, area_sqm,
  has_elevator, orientation, decoration,
  available_from, minimum_lease_months,
  pets_allowed, cooking_allowed, subway_text,
  facilities, tags, selling_points, drawbacks,
  description, visual_summary, visual_fact_flags,
  is_shared, allow_marketing_reuse,
  commission_split, shared_at, shared_expires_at,
  created_at, updated_at
FROM properties
WHERE is_shared = true
  AND status = 'available'
  AND deleted_at IS NULL
  AND (shared_expires_at IS NULL OR shared_expires_at > now());
```

**注意**：此视图 MUST NOT 包含：
- property_private_details 的任何字段
- building_no, unit_no, room_no
- raw_input_text
- created_by

**注意**：`is_shared` 和 `allow_marketing_reuse` 必须包含在此视图中，供 API 层（Route Handler）在内容生成和房源选择器中查询营销复用授权状态。

---

### 4.5 property_private_details

| 操作 | W | O | SA | EC | Policy 描述 |
|---|---|---|---|---|---|
| SELECT | R | R | N | N | 仅 workspace 成员可读 |
| INSERT | RW | RW | N | N | 仅 workspace 成员可创建 |
| UPDATE | RW | RW | N | N | 仅 workspace 成员可更新 |
| DELETE | N | N | N | N | 随 properties 软删除 |

```sql
CREATE POLICY "Workspace members can read private details" ON property_private_details
  FOR SELECT USING (is_workspace_member(workspace_id));

CREATE POLICY "Workspace members can insert private details" ON property_private_details
  FOR INSERT WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY "Workspace members can update private details" ON property_private_details
  FOR UPDATE USING (is_workspace_member(workspace_id))
  WITH CHECK (is_workspace_member(workspace_id));
```

**此表字段 MUST NOT 进入任何共享视图或共享 API 响应。**

---

### 4.6 property_media

| 操作 | W | O | SA | EC | Policy 描述 |
|---|---|---|---|---|---|
| SELECT | R | R | N | R(仅共享房源的媒体) | 成员读本 workspace；共享媒体通过专用策略 |
| INSERT | RW | RW | N | N | 成员可上传 |
| UPDATE | RW | RW | N | N | 成员可更新（如 ai_labels） |
| DELETE | N | RWD | N | N | Owner 可软删除 |

```sql
CREATE POLICY "Workspace members can read media" ON property_media
  FOR SELECT USING (
    is_workspace_member(workspace_id)
    AND deleted_at IS NULL
  );

-- 共享媒体：通过关联 properties 的 is_shared 和 status 判断
CREATE POLICY "Shared property media is viewable" ON property_media
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = property_media.property_id
        AND properties.is_shared = true
        AND properties.status = 'available'
        AND properties.deleted_at IS NULL
    )
    AND property_media.deleted_at IS NULL
  );
```

---

### 4.7 clients

| 操作 | W | O | SA | EC | Policy 描述 |
|---|---|---|---|---|---|
| SELECT | R | R | N | N | 仅 workspace 成员 |
| INSERT | RW | RW | N | N | 仅 workspace 成员 |
| UPDATE | RW | RW | N | N | 仅 workspace 成员 |
| DELETE | N | RWD | N | N | 仅 Owner 可软删除 |

```sql
CREATE POLICY "Workspace members can read clients" ON clients
  FOR SELECT USING (
    is_workspace_member(workspace_id)
    AND deleted_at IS NULL
  );
-- INSERT/UPDATE/DELETE similarly
```

**注意**：客户联系方式 (phone/wechat) 仅在 workspace 内部可见。MUST NOT 进入共享视图。

---

### 4.8 interactions

| 操作 | W | O | SA | EC | 遵循 clients 的 workspace 隔离 |
|---|---|---|---|---|---|
| SELECT | R | R | N | N |  |
| INSERT/UPDATE/DELETE | RW | RW | N | N |  |

---

### 4.9 property_matches

| 操作 | W | O | SA | EC | 遵循 workspace 隔离 |
|---|---|---|---|---|---|
| SELECT | R | R | N | N |  |
| INSERT/UPDATE | RW | RW | N | N |  |

---

### 4.10 tasks

| 操作 | W | O | SA | EC | Policy 描述 |
|---|---|---|---|---|---|
| SELECT | R | R | N | N | 成员可读本 workspace 任务 |
| INSERT | RW | RW | N | N | 成员可创建 |
| UPDATE | RW | RW | N | N | 成员可更新（指派人可改状态） |
| DELETE | RW | RW | N | N | 软删除 |

---

### 4.11 leads

| 操作 | W | O | SA | EC | 遵循 workspace 隔离 |
|---|---|---|---|---|---|
| SELECT | R | R | N | N |  |
| INSERT/UPDATE | RW | RW | N | N |  |

---

### 4.12 collaboration_requests

| 操作 | W(requester) | W(owner) | O | SA | EC |
|---|---|---|---|---|---|
| SELECT | R(自己的请求) | R(收到的请求) | 同 W | R(all) | N |
| INSERT | RW | N(由系统自动) | N | N | N |
| UPDATE | N | RW(status) | RW | N | N |

```sql
CREATE POLICY "Requesters can read own requests" ON collaboration_requests
  FOR SELECT USING (
    is_workspace_member(requester_workspace_id)
  );

CREATE POLICY "Owners can read received requests" ON collaboration_requests
  FOR SELECT USING (
    is_workspace_member(owner_workspace_id)
  );
```

---

### 4.13 content_projects

**需要 `has_feature('content_factory')`**

| 操作 | W | O | SA | EC | Policy 描述 |
|---|---|---|---|---|---|
| SELECT | R (需 content_factory) | R | R(all) | N | has_feature + workspace member |
| INSERT | RW (需 content_factory) | RW | N | N |  |
| UPDATE | RW (需 content_factory) | RW | N | N |  |
| DELETE | RWD (需 content_factory) | RWD | N | N | 软删除 |

```sql
CREATE POLICY "Content factory users can read content" ON content_projects
  FOR SELECT USING (
    has_feature('content_factory')
    AND is_workspace_member(workspace_id)
    AND deleted_at IS NULL
  );

-- INSERT/UPDATE/DELETE similarly
```

**普通用户直接读取此表 MUST 返回 0 rows。**

**`allow_marketing_reuse` 检查说明**：

PRD 9.4 节要求内容生成时验证 `property.is_shared AND property.allow_marketing_reuse`。此检查属于 **Route Handler / API 层职责（非 RLS 层）**，因为 RLS 在 `content_projects` 表的 Policy 中无法跨表动态关联 `properties.allow_marketing_reuse` 字段。

实现约束：
- `content_projects` 的 RLS Policy 仅检查 `has_feature('content_factory')` + `is_workspace_member(workspace_id)` + `deleted_at IS NULL`。
- `allow_marketing_reuse` 和 `property.is_shared` 的验证在 `POST /api/ai/generate-content` 的 Route Handler 中执行（参见 api-contract 10.6 节的前置检查顺序第 4 步）。
- `shared_properties_view` 必须包含 `allow_marketing_reuse` 字段（见下文更新），供 API 层在房源选择器和内容生成时查询。

### 已知限制：直接 Supabase REST 调用的数据完整性

`content_projects` 的 INSERT RLS Policy 不校验 `property_id` 是否属于当前 workspace 或已授权营销复用的共享房源。

**风险评估**：拥有 `content_factory` 权限的用户可以通过 Supabase REST API（绕过 Next.js API 层）向 `content_projects` 表插入指向未授权房源的记录。
- 这些记录为空 draft，无法触发 AI 内容生成（DeepSeek 调用仅在 Route Handler 中发生）。
- 但可能污染内容历史展示和归因数据。

**缓解措施**：
1. API 层（`POST /api/ai/generate-content`）有完整的 10 步前置检查，步骤 4 校验房源访问权限和营销复用授权。实际的 AI 生成安全性不受影响。
2. Phase 1 RLS 实现时，如果 Supabase 版本支持跨表 Policy 子查询，建议在 content_projects/content_versions 的 INSERT/UPDATE Policy 中增加：
   ```sql
   AND EXISTS (
     SELECT 1 FROM properties p
     WHERE p.id = property_id
       AND (p.workspace_id = content_projects.workspace_id
            OR (p.is_shared = true AND p.allow_marketing_reuse = true))
       AND p.deleted_at IS NULL
       AND p.status = 'available'
   )
   ```
3. Phase 2 测试中必须覆盖 "Supabase REST 直调绕过 API 层" 的负面测试用例。
4. 如果 RLS 层最终因技术限制不实现此校验，本限制 MUST 写入部署文档和安全白皮书。

---

### 4.14 content_versions

**需要 `has_feature('content_factory')`**，策略同 content_projects。

**已知限制**：与 `content_projects` 相同（参见 4.13 的"已知限制：直接 Supabase REST 调用的数据完整性"）。`content_versions` 的 INSERT/UPDATE RLS Policy 同样不校验关联 `content_project` 的 `property_id` 归属。Phase 1 RLS 实现时建议与 4.13 所列的跨表 Policy 子查询同步处理。

---

### 4.15 publishing_records

**需要 `has_feature('content_factory')`**，策略同 content_projects。

---

### 4.16 feature_entitlements

| 操作 | W | O | SA | EC | Policy 描述 |
|---|---|---|---|---|---|
| SELECT | R(自己的) | R(自己的) | R(all) | N | 用户读自己的；SA 读所有 |
| INSERT | N | N | RW | N | 仅 SA 通过服务端 API 写入 |
| UPDATE | N | N | RW | N | 仅 SA 通过服务端 API 写入 |
| DELETE | N | N | N | N | 不物理删除 |

```sql
CREATE POLICY "Users can read own entitlements" ON feature_entitlements
  FOR SELECT USING (
    user_id = (select auth.uid())
    OR is_system_admin()
  );

-- 写入由 service_role 执行，不在 RLS 中开放给普通用户
```

---

### 4.17 system_admins

| 操作 | W | O | SA | EC | Policy 描述 |
|---|---|---|---|---|---|
| SELECT | N | N | R | N | 仅 SA 可读 |
| INSERT/UPDATE/DELETE | N | N | N | N | 仅 service_role |

```sql
CREATE POLICY "System admins can read admin table" ON system_admins
  FOR SELECT USING (is_system_admin());
```

**普通用户 MUST NOT 能读取此表。**

---

### 4.18 invitation_links

| 操作 | W | O | SA | EC |
|---|---|---|---|---|
| SELECT | R(自己创建的) | R | R(all) | N |
| INSERT | N(SA 创建) | N | RW | N |
| UPDATE | N | N | RW | N |
| DELETE | N | N | RW | N |

---

### 4.19 ai_usage_logs

| 操作 | W | O | SA | EC | Policy 描述 |
|---|---|---|---|---|---|
| SELECT | R(自己的) | R(自己的) | R(all) | N | 用户读自己的；SA 读所有 |
| INSERT | N | N | N | N | 由服务端 RPC/reserve_ai_quota 写入 |
| UPDATE | N | N | N | N | 由服务端 RPC 写入 |

```sql
CREATE POLICY "Users can read own AI usage" ON ai_usage_logs
  FOR SELECT USING (
    user_id = (select auth.uid())
    OR is_system_admin()
  );
```

**普通用户 MUST NOT 能直接插入此表。**

---

### 4.20 ai_correction_logs

| 操作 | W | O | SA | EC |
|---|---|---|---|---|
| SELECT | R(自己的) | R(自己的) | R(all) | N |
| INSERT | N | N | N | N (服务端写入) |
| UPDATE/DELETE | N | N | N | N |

```sql
CREATE POLICY "Users can read own corrections" ON ai_correction_logs
  FOR SELECT USING (
    user_id = (select auth.uid())
    OR is_system_admin()
  );
```

---

### 4.21 ai_user_preferences

| 操作 | W | O | SA | EC |
|---|---|---|---|---|
| SELECT | R(自己的) | R(自己的) | R(all) | N |
| INSERT | N | N | N | N (服务端写入) |
| UPDATE | RW(仅 status) | RW(仅 status) | N | N |
| DELETE | RW(软删除) | RW(软删除) | N | N |

```sql
CREATE POLICY "Users can manage own preferences" ON ai_user_preferences
  FOR ALL USING (
    user_id = (select auth.uid())
  ) WITH CHECK (
    user_id = (select auth.uid())
  );
-- 注意：用户不得修改 evidence_count 和 confidence，通过应用层和 WITH CHECK 控制
```

---

### 4.22 ai_model_pricing

| 操作 | W | O | SA | EC |
|---|---|---|---|---|
| SELECT | N | N | R | N |
| INSERT/UPDATE | N | N | RW | N |
| DELETE | N | N | N | N |

---

### 4.23 ai_user_limits

| 操作 | W | O | SA | EC |
|---|---|---|---|---|
| SELECT | R(自己的) | R(自己的) | R(all) | N |
| INSERT/UPDATE/DELETE | N | N | RW | N |

---

### 4.24 ai_runtime_config

| 操作 | W | O | SA | EC |
|---|---|---|---|---|
| SELECT | N | N | R | N |
| INSERT/UPDATE | N | N | RW | N |
| DELETE | N | N | N | N |

---

### 4.25 compliance_terms

| 操作 | W | O | SA | EC |
|---|---|---|---|---|
| SELECT | N | N | R | N |
| INSERT/UPDATE | N | N | RW | N |
| DELETE | N | N | N | N |

---

### 4.26 compliance_review_logs

| 操作 | W | O | SA | EC |
|---|---|---|---|---|
| SELECT | R(自己的) | R(自己的) | R(all) | N |
| INSERT | N | N | N | N (服务端写入) |

```sql
CREATE POLICY "Users can read own compliance reviews" ON compliance_review_logs
  FOR SELECT USING (
    user_id = (select auth.uid())
    OR is_system_admin()
  );
```

---

### 4.27 audit_logs

| 操作 | W | O | SA | EC |
|---|---|---|---|---|
| SELECT | N | N | R | N |
| INSERT | N | N | N | N (服务端写入) |
| UPDATE/DELETE | N | N | N | N |

**普通用户 MUST NOT 更新或删除 audit_logs。**

---

## 5. Storage Bucket 策略

### 5.1 property-private

| 操作 | 权限 |
|---|---|
| SELECT | workspace member（通过签名 URL） |
| INSERT | workspace member |
| UPDATE | workspace member |
| DELETE | workspace owner |

### 5.2 property-shared

| 操作 | 权限 |
|---|---|
| SELECT | 任何认证用户（仅共享房源媒体的派生副本） |
| INSERT | 系统自动（从 property-private 派生） |
| DELETE | workspace owner / 系统自动（下架时撤销） |

### 5.3 content-assets

| 操作 | 权限 |
|---|---|
| SELECT | content_factory + workspace member |
| INSERT | content_factory + workspace member |
| DELETE | content_factory + workspace member |

### 5.4 avatars

| 操作 | 权限 |
|---|---|
| SELECT | 任何认证用户 |
| INSERT | 用户只能上传自己的头像 |
| DELETE | 用户只能删除自己的头像 |

---

## 6. 风险场景与预期行为

| 场景 | 预期行为 | 验证方式 |
|---|---|---|
| 用户 A 访问用户 B 私有房源 | 0 rows returned | RLS 策略：workspace_id 不匹配 |
| 普通用户读取 content_projects | 0 rows returned | RLS 策略：has_feature('content_factory') = false |
| 撤销 content_factory 后继续调用 API | 403 FORBIDDEN | Route Handler 检查 has_feature |
| 共享房源读取房东电话 | 字段不在共享视图中 | shared_properties_view 不包含 property_private_details 字段 |
| 未授权营销复用 | 403 PROPERTY_NOT_MARKETING_REUSABLE | API 层（Route Handler）检查 allow_marketing_reuse，非 RLS 层 |
| 伪造 workspace_id | 拒绝 | is_workspace_member 返回 false |
| 直接调用 Supabase REST 绕过 API | RLS 生效 | 客户端使用 anon key，RLS policy 仍然执行 |
| 过期 Entitlement | has_feature 返回 false | expires_at 检查 |
| 软删除记录不显示 | deleted_at IS NULL 策略过滤 | 列表查询不含已删除项 |
| 并发配额绕过 | 原子 RPC 锁定 | reserve_ai_quota 单事务执行 |
| policy 递归调用 | 不允许 | workspace_members 自身 policy 使用直接 EXISTS |
| 共享房源下架后外部用户仍可访问 | 立即拒绝 | shared_properties_view 过滤 is_shared = true |

---

## 7. 依赖与归属

- 所有 migration 文件由 **data-security-engineer** 拥有和维护。
- 所有 RLS helper 函数由 **data-security-engineer** 实现。
- `reserve_ai_quota` 函数由 **data-security-engineer** 实现（与 ai-deepseek-engineer 协商接口）。
- 共享房源视图由 **data-security-engineer** 实现。
- Storage bucket 策略由 **data-security-engineer** 配置。
- RLS 自动化测试由 **test-engineer** 编写。

---

## 8. Open Questions

无。所有影响 Phase 1 的问题均已在 HouseVibe Phase 0 v1.0 中冻结。
