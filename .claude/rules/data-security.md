# 数据、安全与 RLS 规则

- `workspace_id` 是业务隔离边界，所有查询和写入必须验证成员关系。
- RLS 默认拒绝，不允许使用 Service Role 代替正常用户权限。
- Service Role 仅限可信服务端管理任务，并必须在调用前执行系统管理员检查。
- `property_private_details`、客户联系方式和精确地址永不进入共享视图。
- 共享房源通过专用 View/RPC 读取，不允许客户端直接读取原表后自行脱敏。
- `is_shared` 与 `allow_marketing_reuse` 必须分别授权。
- `content_factory` 必须在 UI、Route Handler/Server Action、RLS 三层校验。
- `workspace_members(workspace_id, user_id)` 必须有联合唯一索引。
- RLS helper 使用稳定、单层、可 EXPLAIN 的查询，避免递归调用受保护表。
- 敏感日志必须脱敏；不得记录明文手机号、微信、Cookie、Token 或完整 Prompt。
- 所有删除软删除；审计日志不可由普通用户更新或删除。
