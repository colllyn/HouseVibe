-- Migration: Admin AI Corrections Stats RPC — P3-AI-019
-- Provides: admin_get_ai_corrections_stats
-- SECURITY DEFINER, search_path = '', verify is_system_admin()
-- Privacy-safe: never returns plaintext contact info or exact addresses (stripped at insert)

begin;

-- =============================================================================
-- admin_get_ai_corrections_stats — aggregated correction analysis for admin
-- Returns JSONB with:
--   - topCorrectedFields: most frequently corrected fields
--   - valueMappings: common original→confirmed value patterns per field
--   - feedbackByFeature: negative feedback rate per feature
--   - correctionRateByPrompt: correction rate per prompt version
--   - preferenceEffectiveness: user preference learning impact
--   - totals: overall counts
-- =============================================================================

create or replace function public.admin_get_ai_corrections_stats(
  p_feature text default null,
  p_days integer default 30
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
  v_start_date := (now() at time zone 'Asia/Shanghai')::date - (p_days - 1);

  with filtered as (
    select *
    from public.ai_correction_logs
    where created_at >= v_start_date::timestamptz
      and (p_feature is null or feature = p_feature::public.feature_key)
  ),
  totals as (
    select
      count(*) as total_corrections,
      count(distinct user_id) as active_users,
      count(distinct entity_id) as affected_entities,
      coalesce(count(*) filter (where feedback_score is not null), 0) as feedback_count,
      coalesce(avg(feedback_score) filter (where feedback_score is not null), 0) as avg_feedback_score,
      coalesce(count(*) filter (where feedback_score <= 2), 0) as negative_feedback_count,
      coalesce(count(distinct user_id) filter (where feedback_score <= 2), 0) as negative_feedback_users
    from filtered
  ),
  -- Top corrected fields: expand diff[] JSONB, count by field name
  -- Only counts changeType = 'modified' to align with "被修改字段" label
  top_fields as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'field', field_name,
        'count', field_count,
        'lastCorrectedAt', last_at
      ) order by field_count desc
    ) filter (where field_name is not null), '[]'::jsonb) as items
    from (
      select
        d->>'field' as field_name,
        count(*) as field_count,
        max(created_at) as last_at
      from filtered f,
      lateral jsonb_array_elements(f.diff) d
      where d->>'changeType' = 'modified'
      group by d->>'field'
      order by count(*) desc
      limit 30
    ) sub
  ),
  -- Field examples with row numbers: pre-compute for value_mappings LIMIT
  field_examples as (
    select
      d->>'field' as field_name,
      d->>'originalValue' as original_value,
      d->>'confirmedValue' as corrected_value,
      row_number() over (partition by d->>'field' order by f.created_at desc) as rn
    from filtered f,
    lateral jsonb_array_elements(f.diff) d
    where d->>'changeType' = 'modified'
  ),
  -- Value mappings: for top fields, show common original→corrected pairs
  -- Inner examples capped at 20 per field to prevent unbounded response growth
  value_mappings as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'field', field_name,
        'examples', examples
      ) order by field_count desc
    ) filter (where field_name is not null), '[]'::jsonb) as items
    from (
      select
        field_name,
        count(*) as field_count,
        coalesce(jsonb_agg(
          jsonb_build_object(
            'originalValue', original_value,
            'correctedValue', corrected_value
          )
        ) filter (where rn <= 20), '[]'::jsonb) as examples
      from field_examples
      group by field_name
      order by count(*) desc
      limit 10
    ) sub
  ),
  -- Feedback by feature
  feedback_by_feature as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'feature', feature,
        'total', total_count,
        'withFeedback', feedback_count,
        'negativeFeedback', negative_count,
        'negativeRate', case when feedback_count > 0
          then round((negative_count::numeric / feedback_count) * 100, 1)
          else 0
        end,
        'avgScore', round(avg_score, 2)
      ) order by total_count desc
    ), '[]'::jsonb) as items
    from (
      select
        feature,
        count(*) as total_count,
        coalesce(count(*) filter (where feedback_score is not null), 0) as feedback_count,
        coalesce(count(*) filter (where feedback_score <= 2), 0) as negative_count,
        coalesce(avg(feedback_score) filter (where feedback_score is not null), 0) as avg_score
      from filtered
      group by feature
    ) sub
  ),
  -- Correction rate by prompt version
  correction_by_prompt as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'promptVersion', prompt_version,
        'totalCorrections', total_count,
        'uniqueUsers', user_count,
        'avgFieldsChanged', round(avg_fields, 1)
      ) order by prompt_version
    ), '[]'::jsonb) as items
    from (
      select
        prompt_version,
        count(*) as total_count,
        count(distinct user_id) as user_count,
        coalesce(avg(jsonb_array_length(diff)), 0) as avg_fields
      from filtered
      group by prompt_version
    ) sub
  ),
  -- User preference effectiveness: users with preferences vs without
  preference_effectiveness as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'hasPreferences', has_prefs,
        'userCount', user_count,
        'avgCorrectionsPerUser', round(avg_corrections, 1),
        'avgFeedbackScore', round(avg_fb, 2)
      ) order by has_prefs desc
    ), '[]'::jsonb) as items
    from (
      select
        case when up.id is not null then true else false end as has_prefs,
        count(distinct f.user_id) as user_count,
        count(*)::numeric / nullif(count(distinct f.user_id), 0) as avg_corrections,
        coalesce(avg(feedback_score) filter (where feedback_score is not null), 0) as avg_fb
      from filtered f
      left join public.ai_user_preferences up
        on f.user_id = up.user_id and up.deleted_at is null and up.status = 'active'
      group by case when up.id is not null then true else false end
    ) sub
  )
  select jsonb_build_object(
    'period', jsonb_build_object('days', p_days, 'feature', p_feature),
    'totals', (select row_to_json(totals.*)::jsonb from totals),
    'topCorrectedFields', (select items from top_fields),
    'valueMappings', (select items from value_mappings),
    'feedbackByFeature', (select items from feedback_by_feature),
    'correctionByPrompt', (select items from correction_by_prompt),
    'preferenceEffectiveness', (select items from preference_effectiveness)
  ) into v_result;

  return v_result;
end;
$$;

-- Grant execute
grant execute on function public.admin_get_ai_corrections_stats(text, integer) to authenticated;
revoke execute on function public.admin_get_ai_corrections_stats(text, integer) from public, anon;

commit;
