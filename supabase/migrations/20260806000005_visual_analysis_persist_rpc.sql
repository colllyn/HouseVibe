-- Migration: Atomic visual analysis persistence RPC
-- P3-AI-006 follow-up: single-transaction save of AI labels, visual summary,
-- fact flags, and quota settlement for property image analysis.
--
-- Replaces the non-transactional loop in the route handler.

-- ============================================================
-- persist_visual_analysis RPC
-- ============================================================
create or replace function public.persist_visual_analysis(
  p_property_id uuid,
  p_media_labels jsonb,   -- [{mediaId, aiLabels, aiAnalysisStatus}]
  p_visual_summary text,
  p_visual_fact_flags jsonb,
  p_user_id uuid,
  p_workspace_id uuid,
  p_idempotency_key text,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_actual_cost_usd numeric,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_media_label jsonb;
  v_media_id uuid;
  v_property_owner_id uuid;
begin
  -- Verify property belongs to workspace (defense-in-depth)
  select owner_user_id into v_property_owner_id
  from public.properties
  where id = p_property_id and workspace_id = p_workspace_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'property_not_found');
  end if;

  -- Update per-media ai_labels and status
  for v_media_label in select * from jsonb_array_elements(p_media_labels)
  loop
    v_media_id := (v_media_label->>'mediaId')::uuid;

    update public.property_media
    set
      ai_labels = (v_media_label->'aiLabels'),
      ai_analysis_status = (v_media_label->>'aiAnalysisStatus'),
      ai_analyzed_at = now()
    where id = v_media_id
      and property_id = p_property_id
      and workspace_id = p_workspace_id;

    if not found then
      return jsonb_build_object('success', false, 'error', 'media_not_found_or_not_owned');
    end if;
  end loop;

  -- Update property-level visual data
  update public.properties
  set
    visual_summary = p_visual_summary,
    visual_fact_flags = p_visual_fact_flags,
    ai_analysis_status = 'completed',
    ai_analyzed_at = now()
  where id = p_property_id;

  -- Settle quota within the same transaction
  perform public.settle_ai_quota(
    p_user_id := p_user_id,
    p_workspace_id := p_workspace_id,
    p_idempotency_key := p_idempotency_key,
    p_status := 'succeeded',
    p_input_tokens := p_input_tokens,
    p_output_tokens := p_output_tokens,
    p_actual_cost_usd := p_actual_cost_usd,
    p_model := p_model,
    p_request_id := p_request_id
  );

  return jsonb_build_object('success', true);
exception
  when others then
    return jsonb_build_object(
      'success', false,
      'error', 'persist_failed',
      'detail', SQLERRM
    );
end;
$$;

grant execute on function public.persist_visual_analysis(
  uuid, jsonb, text, jsonb, uuid, uuid, text, text, integer, integer, numeric, text
) to authenticated;
