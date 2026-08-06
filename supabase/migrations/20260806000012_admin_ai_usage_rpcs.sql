-- Migration: Admin AI Usage RPCs — P3-AI-017
-- Provides: admin_get_ai_usage_stats, admin_upsert_user_limits, admin_restore_user_access
-- All RPCs: SECURITY DEFINER, search_path = '', verify is_system_admin()

begin;

-- =============================================================================
-- 1. admin_get_ai_usage_stats — aggregated AI usage for admin dashboard
--    Returns JSONB with totals, text/vision breakdown, and grouped stats
-- =============================================================================

create or replace function public.admin_get_ai_usage_stats(
  p_period text default 'today',
  p_group_by text default 'feature'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_uid uuid;
  v_is_admin boolean;
  v_start_date date;
  v_end_date date;
  v_result jsonb;
begin
  -- Verify system admin
  v_auth_uid := (select auth.uid());
  if v_auth_uid is null then
    raise exception 'Authentication required' using errcode = 'UA001';
  end if;

  select exists (
    select 1 from public.system_admins
    where user_id = v_auth_uid and status = 'active'
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  -- Resolve date range
  v_end_date := (now() at time zone 'Asia/Shanghai')::date;
  case p_period
    when 'today' then v_start_date := v_end_date;
    when '7d' then v_start_date := v_end_date - interval '6 days';
    when '30d' then v_start_date := v_end_date - interval '29 days';
    else v_start_date := v_end_date;
  end case;

  -- Build result
  with filtered as (
    select *
    from public.ai_usage_logs
    where quota_date between v_start_date and v_end_date
  ),
  totals as (
    select
      coalesce(sum(coalesce(input_tokens, 0) + coalesce(output_tokens, 0)), 0) as total_tokens,
      coalesce(sum(estimated_cost_usd), 0) as total_cost_usd,
      count(*) as total_requests,
      coalesce(count(*) filter (where status = 'succeeded'), 0) as succeeded,
      coalesce(count(*) filter (where status in ('failed', 'released')), 0) as failed,
      coalesce(count(*) filter (where status = 'rejected_compliance'), 0) as rejected_compliance,
      coalesce(count(*) filter (where status = 'blocked_by_cost_limit'), 0) as blocked_by_cost_limit
    from filtered
  ),
  text_stats as (
    select
      coalesce(sum(coalesce(input_tokens, 0) + coalesce(output_tokens, 0)), 0) as total_tokens,
      coalesce(sum(estimated_cost_usd), 0) as total_cost_usd,
      count(*) as total_requests
    from filtered
    where capability = 'text_generation'
  ),
  vision_stats as (
    select
      coalesce(sum(coalesce(input_tokens, 0) + coalesce(output_tokens, 0)), 0) as total_tokens,
      coalesce(sum(estimated_cost_usd), 0) as total_cost_usd,
      count(*) as total_requests
    from filtered
    where capability = 'visual_analysis'
  ),
  distinct_users as (
    select count(distinct user_id) as user_count
    from filtered
  ),
  grouped as (
    select
      case
        when p_group_by = 'feature' then feature
        when p_group_by = 'user' then user_id::text
        when p_group_by = 'workspace' then workspace_id::text
        when p_group_by = 'model' then coalesce(model, capability, 'unknown')
        when p_group_by = 'status' then status
        else feature
      end as key,
      case
        when p_group_by = 'feature' then feature
        when p_group_by = 'user' then user_id::text
        when p_group_by = 'workspace' then workspace_id::text
        when p_group_by = 'model' then coalesce(model, capability, 'unknown')
        when p_group_by = 'status' then
          case status
            when 'succeeded' then '成功'
            when 'failed' then '失败'
            when 'rejected' then '拒绝'
            when 'rejected_compliance' then '合规拒绝'
            when 'blocked_by_cost_limit' then '成本熔断'
            when 'released' then '已释放'
            when 'reserved' then '预占'
            else status
          end
        else feature
      end as label,
      coalesce(sum(coalesce(input_tokens, 0) + coalesce(output_tokens, 0)), 0) as total_tokens,
      coalesce(sum(input_tokens), 0) as input_tokens,
      coalesce(sum(output_tokens), 0) as output_tokens,
      coalesce(sum(estimated_cost_usd), 0) as estimated_cost_usd,
      count(*) as total_requests,
      coalesce(count(*) filter (where status = 'succeeded'), 0) as succeeded,
      coalesce(count(*) filter (where status in ('failed', 'released')), 0) as failed,
      coalesce(count(*) filter (where status = 'rejected_compliance'), 0) as rejected_compliance,
      coalesce(count(*) filter (where status = 'blocked_by_cost_limit'), 0) as blocked_by_cost_limit
    from filtered
    group by key, label
  ),
  groups_array as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'key', key,
        'label', label,
        'total_tokens', total_tokens,
        'input_tokens', input_tokens,
        'output_tokens', output_tokens,
        'estimated_cost_usd', estimated_cost_usd,
        'total_requests', total_requests,
        'succeeded', succeeded,
        'failed', failed,
        'rejected_compliance', rejected_compliance,
        'blocked_by_cost_limit', blocked_by_cost_limit,
        'avg_cost_per_request', case
          when total_requests > 0 then round((estimated_cost_usd / total_requests)::numeric, 6)
          else 0
        end
      ) order by estimated_cost_usd desc
    ), '[]'::jsonb) as groups
    from grouped
  )
  select jsonb_build_object(
    'period', p_period,
    'groupBy', p_group_by,
    'totals', jsonb_build_object(
      'total_tokens', coalesce((select total_tokens from totals), 0),
      'total_cost_usd', coalesce((select total_cost_usd from totals), 0),
      'total_requests', coalesce((select total_requests from totals), 0),
      'succeeded', coalesce((select succeeded from totals), 0),
      'failed', coalesce((select failed from totals), 0),
      'rejected_compliance', coalesce((select rejected_compliance from totals), 0),
      'blocked_by_cost_limit', coalesce((select blocked_by_cost_limit from totals), 0)
    ),
    'text', jsonb_build_object(
      'total_tokens', coalesce((select total_tokens from text_stats), 0),
      'total_cost_usd', coalesce((select total_cost_usd from text_stats), 0),
      'total_requests', coalesce((select total_requests from text_stats), 0)
    ),
    'vision', jsonb_build_object(
      'total_tokens', coalesce((select total_tokens from vision_stats), 0),
      'total_cost_usd', coalesce((select total_cost_usd from vision_stats), 0),
      'total_requests', coalesce((select total_requests from vision_stats), 0)
    ),
    'userCount', coalesce((select user_count from distinct_users), 0),
    'avgCostPerUser', case
      when coalesce((select user_count from distinct_users), 0) > 0
      then coalesce((select total_cost_usd from totals), 0) / (select user_count from distinct_users)
      else 0
    end,
    'groups', coalesce((select groups from groups_array), '[]'::jsonb),
    'dateRange', jsonb_build_object(
      'start', v_start_date,
      'end', v_end_date
    )
  ) into v_result;

  return v_result;
end;
$$;

-- =============================================================================
-- 2. admin_upsert_user_limits — admin sets per-user AI limits
-- =============================================================================

create or replace function public.admin_upsert_user_limits(
  p_user_id uuid,
  p_feature text default 'content_factory',
  p_daily_request_limit integer default null,
  p_daily_cost_limit_usd numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_uid uuid;
  v_is_admin boolean;
  v_existing_id uuid;
begin
  -- Verify system admin
  v_auth_uid := (select auth.uid());
  if v_auth_uid is null then
    raise exception 'Authentication required' using errcode = 'UA001';
  end if;

  select exists (
    select 1 from public.system_admins
    where user_id = v_auth_uid and status = 'active'
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  -- Upsert: update if exists, insert if not
  select id into v_existing_id
  from public.ai_user_limits
  where user_id = p_user_id and feature = p_feature;

  if found then
    update public.ai_user_limits
    set
      daily_request_limit = coalesce(p_daily_request_limit, daily_request_limit),
      daily_cost_limit_usd = coalesce(p_daily_cost_limit_usd, daily_cost_limit_usd),
      updated_at = now()
    where id = v_existing_id;
  else
    insert into public.ai_user_limits (
      user_id, feature, daily_request_limit, daily_cost_limit_usd, status
    ) values (
      p_user_id, p_feature, p_daily_request_limit, p_daily_cost_limit_usd, 'active'
    )
    returning id into v_existing_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'id', v_existing_id,
    'user_id', p_user_id,
    'feature', p_feature
  );
end;
$$;

-- =============================================================================
-- 3. admin_restore_user_access — restore a blocked user's AI access
-- =============================================================================

create or replace function public.admin_restore_user_access(
  p_user_id uuid,
  p_feature text default 'content_factory'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_uid uuid;
  v_is_admin boolean;
  v_existing record;
  v_workspace_id uuid;
begin
  -- Verify system admin
  v_auth_uid := (select auth.uid());
  if v_auth_uid is null then
    raise exception 'Authentication required' using errcode = 'UA001';
  end if;

  select exists (
    select 1 from public.system_admins
    where user_id = v_auth_uid and status = 'active'
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  -- Find existing limit record
  select id, status
  into v_existing
  from public.ai_user_limits
  where user_id = p_user_id and feature = p_feature;

  if found then
    -- Guard: only restore blocked users
    if v_existing.status != 'blocked' then
      raise exception '用户未被熔断，无需恢复' using errcode = '42501';
    end if;

    update public.ai_user_limits
    set
      status = 'active',
      manually_restored_at = now(),
      restored_by = v_auth_uid,
      blocked_reason = null,
      updated_at = now()
    where id = v_existing.id;
  else
    -- No existing record — create an active one (user was never blocked)
    raise exception '用户未被熔断，无需恢复' using errcode = '42501';
  end if;

  -- Look up a valid workspace for the audit entry (target user's, or admin's)
  select workspace_id into v_workspace_id
  from (
    select workspace_id from public.workspace_members
    where user_id = p_user_id and status = 'active'
    union all
    select workspace_id from public.workspace_members
    where user_id = v_auth_uid and status = 'active'
  ) sub
  limit 1;

  -- Insert audit log entry
  insert into public.audit_logs (
    workspace_id,
    actor_user_id,
    entity_type,
    entity_id,
    action,
    after_data
  ) values (
    coalesce(v_workspace_id, '00000000-0000-0000-0000-000000000000'),
    v_auth_uid,
    'ai_user_limits',
    v_existing.id,
    'restore_ai_access',
    jsonb_build_object(
      'restored_user_id', p_user_id,
      'feature', p_feature,
      'restored_by', v_auth_uid,
      'restored_at', now()
    )
  );

  return jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'feature', p_feature,
    'message', '用户 AI 访问已恢复'
  );
end;
$$;

-- =============================================================================
-- 4. Grant execute permissions (authenticated only; admin check inside RPC)
-- =============================================================================

-- Ensure authenticated role has table access for RLS policies to work
grant select on public.ai_user_limits to authenticated;

grant execute on function public.admin_get_ai_usage_stats(text, text) to authenticated;
grant execute on function public.admin_upsert_user_limits(uuid, text, integer, numeric) to authenticated;
grant execute on function public.admin_restore_user_access(uuid, text) to authenticated;

revoke execute on function public.admin_get_ai_usage_stats(text, text) from public, anon;
revoke execute on function public.admin_upsert_user_limits(uuid, text, integer, numeric) from public, anon;
revoke execute on function public.admin_restore_user_access(uuid, text) from public, anon;

commit;
