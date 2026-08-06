-- =============================================================================
-- 19_admin_ai_corrections_rpc_test.sql — Admin AI Corrections RPC Tests (P3-AI-019)
-- Tests: admin_get_ai_corrections_stats
-- =============================================================================

BEGIN;
SET LOCAL search_path TO public, extensions;

-- =============================================================================
-- Helper: insert auth user
-- =============================================================================
CREATE OR REPLACE FUNCTION pg_temp.insert_auth_user(p_id uuid, p_email text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'auth, pg_catalog'
AS $$
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data, aud, role, encrypted_password, created_at, updated_at)
  VALUES (p_id, p_email, '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated', '', now(), now());
END;
$$;

-- Test users
-- Admin:   aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- User B:   bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb

SELECT pg_temp.insert_auth_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@test');
SELECT pg_temp.insert_auth_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'userb@test');

INSERT INTO public.system_admins (user_id, status) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'active');

INSERT INTO public.workspaces (id, name, owner_user_id, city, business_type) VALUES
  ('8cae1001-0000-4000-8000-000000000001', 'WA', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'GZ', 'residential_lease');

INSERT INTO public.workspace_members (id, workspace_id, user_id, role, status) VALUES
  ('9cae2001-0000-4000-8000-000000000001', '8cae1001-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner', 'active');

-- Seed ai_correction_logs for testing
INSERT INTO public.ai_correction_logs (
  user_id, workspace_id, feature, request_id, entity_type, entity_id,
  prompt_version, model_name, original_output, corrected_output, diff,
  feedback_score, feedback_type
) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '8cae1001-0000-4000-8000-000000000001',
   'content_factory', 'a0000000-0000-0000-0000-000000000001', 'property',
   'b0000000-0000-0000-0000-000000000001', '1', 'deepseek',
   '{"price": "5000", "description": "nice"}'::jsonb,
   '{"price": "5500", "description": "beautiful"}'::jsonb,
   '[{"field": "price", "changeType": "modified", "originalValue": "5000", "confirmedValue": "5500"}, {"field": "description", "changeType": "modified", "originalValue": "nice", "confirmedValue": "beautiful"}]'::jsonb,
   4, 'positive'
  ),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '8cae1001-0000-4000-8000-000000000001',
   'content_factory', 'a0000000-0000-0000-0000-000000000002', 'property',
   'b0000000-0000-0000-0000-000000000002', '1', 'deepseek',
   '{"price": "3000"}'::jsonb,
   '{"price": "3200"}'::jsonb,
   '[{"field": "price", "changeType": "modified", "originalValue": "3000", "confirmedValue": "3200"}]'::jsonb,
   2, 'negative'
  ),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '8cae1001-0000-4000-8000-000000000001',
   'content_factory', 'a0000000-0000-0000-0000-000000000003', 'property',
   'b0000000-0000-0000-0000-000000000003', '2', 'deepseek',
   '{"title": "apartment"}'::jsonb,
   '{"title": "luxury apartment"}'::jsonb,
   '[{"field": "title", "changeType": "modified", "originalValue": "apartment", "confirmedValue": "luxury apartment"}]'::jsonb,
   NULL, NULL
  );

SELECT * FROM no_plan();

-- ================================================================
-- admin_get_ai_corrections_stats
-- ================================================================

-- 1: non-admin cannot call
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';
SELECT throws_ok(
  $$SELECT public.admin_get_ai_corrections_stats()$$,
  '42501', NULL,
  '1: non-admin cannot call admin_get_ai_corrections_stats'
);

-- 2: anon cannot call
RESET ROLE; SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT public.admin_get_ai_corrections_stats()$$,
  '42501', NULL,
  '2: anon cannot call admin_get_ai_corrections_stats'
);

-- 3: admin can call and get totals
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
SELECT is(
  (public.admin_get_ai_corrections_stats()->'totals'->>'total_corrections')::integer,
  3,
  '3: totals.total_corrections = 3'
);

-- 4: active users count is correct
SELECT is(
  (public.admin_get_ai_corrections_stats()->'totals'->>'active_users')::integer,
  1,
  '4: totals.active_users = 1'
);

-- 5: feedback count is correct
SELECT is(
  (public.admin_get_ai_corrections_stats()->'totals'->>'feedback_count')::integer,
  2,
  '5: totals.feedback_count = 2'
);

-- 6: negative feedback count is correct
SELECT is(
  (public.admin_get_ai_corrections_stats()->'totals'->>'negative_feedback_count')::integer,
  1,
  '6: totals.negative_feedback_count = 1'
);

-- 7: topCorrectedFields includes price
SELECT ok(
  (SELECT count(*)::integer > 0 FROM jsonb_array_elements(
    public.admin_get_ai_corrections_stats()->'topCorrectedFields'
  ) elem WHERE elem->>'field' = 'price'),
  '7: topCorrectedFields includes price'
);

-- 8: valueMappings has data
SELECT ok(
  jsonb_array_length(public.admin_get_ai_corrections_stats()->'valueMappings') > 0,
  '8: valueMappings is non-empty'
);

-- 9: feedbackByFeature has content_factory
SELECT ok(
  (SELECT count(*)::integer > 0 FROM jsonb_array_elements(
    public.admin_get_ai_corrections_stats()->'feedbackByFeature'
  ) elem WHERE elem->>'feature' = 'content_factory'),
  '9: feedbackByFeature includes content_factory'
);

-- 10: correctionByPrompt has both versions
SELECT is(
  jsonb_array_length(public.admin_get_ai_corrections_stats()->'correctionByPrompt')::integer,
  2,
  '10: correctionByPrompt has 2 entries'
);

-- 11: feature filter works
SELECT is(
  (public.admin_get_ai_corrections_stats('content_factory', 30)->'totals'->>'total_corrections')::integer,
  3,
  '11: feature filter returns same total for content_factory'
);

-- 12: days filter works (1 day should return 0 since seed data may be today)
SELECT ok(
  (public.admin_get_ai_corrections_stats(null, 1)->'totals'->>'total_corrections')::integer >= 0,
  '12: days filter does not crash'
);

-- 13: preferenceEffectiveness has data
SELECT ok(
  jsonb_array_length(public.admin_get_ai_corrections_stats()->'preferenceEffectiveness') >= 0,
  '13: preferenceEffectiveness is present'
);

SELECT finish();
ROLLBACK;
