-- =============================================================================
-- 18_admin_ai_usage_rpc_test.sql — Admin AI Usage RPC Tests (P3-AI-017)
-- Tests: admin_get_ai_usage_stats, admin_upsert_user_limits, admin_restore_user_access
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

-- Create a helper to verify user limits as postgres (bypasses RLS)
CREATE OR REPLACE FUNCTION pg_temp.get_user_limit_daily_req(p_uid uuid, p_feat text) RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = 'public'
AS $$ SELECT daily_request_limit FROM public.ai_user_limits WHERE user_id = p_uid AND feature = p_feat; $$;

CREATE OR REPLACE FUNCTION pg_temp.get_user_limit_status(p_uid uuid, p_feat text) RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = 'public'
AS $$ SELECT status FROM public.ai_user_limits WHERE user_id = p_uid AND feature = p_feat; $$;

CREATE OR REPLACE FUNCTION pg_temp.get_user_limit_restored(p_uid uuid, p_feat text) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = 'public'
AS $$ SELECT manually_restored_at IS NOT NULL FROM public.ai_user_limits WHERE user_id = p_uid AND feature = p_feat; $$;

-- Test users
-- Admin:   aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- User B:   bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb
-- User C:   cccccccc-cccc-cccc-cccc-cccccccccccc

SELECT pg_temp.insert_auth_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@test');
SELECT pg_temp.insert_auth_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'userb@test');
SELECT pg_temp.insert_auth_user('cccccccc-cccc-cccc-cccc-cccccccccccc', 'userc@test');

INSERT INTO public.system_admins (user_id, status) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'active');

INSERT INTO public.workspaces (id, name, owner_user_id, city, business_type) VALUES
  ('8cae1001-0000-4000-8000-000000000001', 'WA', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'GZ', 'residential_lease'),
  ('8cae1001-0000-4000-8000-000000000002', 'WB', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'SZ', 'residential_lease');

INSERT INTO public.workspace_members (id, workspace_id, user_id, role, status) VALUES
  ('9cae2001-0000-4000-8000-000000000001', '8cae1001-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner', 'active'),
  ('9cae2001-0000-4000-8000-000000000002', '8cae1001-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'owner', 'active');

-- Seed ai_usage_logs for testing
INSERT INTO public.ai_usage_logs (user_id, workspace_id, feature, capability, input_tokens, output_tokens, estimated_cost_usd, quota_date, status, idempotency_key, request_id)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '8cae1001-0000-4000-8000-000000000001', 'content_generation', 'text_generation', 500, 300, 0.00015, (now() at time zone 'Asia/Shanghai')::date, 'succeeded', 'test-001', 'req-001'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '8cae1001-0000-4000-8000-000000000002', 'content_generation', 'text_generation', 200, 100, 0.00006, (now() at time zone 'Asia/Shanghai')::date, 'succeeded', 'test-002', 'req-002'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '8cae1001-0000-4000-8000-000000000001', 'content_generation', 'visual_analysis', 100, 50, 0.00003, (now() at time zone 'Asia/Shanghai')::date, 'succeeded', 'test-003', 'req-003'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '8cae1001-0000-4000-8000-000000000001', 'content_generation', 'text_generation', 100, 50, 0.00003, (now() at time zone 'Asia/Shanghai')::date, 'failed', 'test-004', 'req-004'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '8cae1001-0000-4000-8000-000000000001', 'content_generation', 'text_generation', 50, 25, 0.00002, (now() at time zone 'Asia/Shanghai')::date, 'rejected_compliance', 'test-005', 'req-005'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '8cae1001-0000-4000-8000-000000000001', 'content_generation', 'text_generation', 0, 0, 0.001, (now() at time zone 'Asia/Shanghai')::date, 'blocked_by_cost_limit', 'test-006', 'req-006');

SELECT * FROM no_plan();

-- ================================================================
-- admin_get_ai_usage_stats
-- ================================================================

-- 1: non-admin cannot call
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';
SELECT throws_ok(
  $$SELECT public.admin_get_ai_usage_stats('today', 'feature')$$,
  '42501', NULL,
  '1: non-admin cannot call admin_get_ai_usage_stats'
);

-- 2: admin can call with defaults
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
SELECT is(
  (public.admin_get_ai_usage_stats('today', 'feature')->>'period'),
  'today',
  '2: admin_get_ai_usage_stats returns period=today'
);

-- 3: totals are correct
SELECT is(
  (public.admin_get_ai_usage_stats('today', 'feature')->'totals'->>'total_requests')::integer,
  6,
  '3: totals.total_requests = 6'
);

-- 4: succeeded count
SELECT is(
  (public.admin_get_ai_usage_stats('today', 'feature')->'totals'->>'succeeded')::integer,
  3,
  '4: totals.succeeded = 3'
);

-- 5: text vs vision separation
SELECT is(
  (public.admin_get_ai_usage_stats('today', 'feature')->'text'->>'total_requests')::integer,
  5,
  '5: text.total_requests = 5'
);

-- 6: vision stats
SELECT is(
  (public.admin_get_ai_usage_stats('today', 'feature')->'vision'->>'total_requests')::integer,
  1,
  '6: vision.total_requests = 1'
);

-- 7: groups array is present and non-empty
SELECT ok(
  jsonb_array_length(public.admin_get_ai_usage_stats('today', 'feature')->'groups') > 0,
  '7: groups array is non-empty'
);

-- 8: anon cannot call
RESET ROLE; SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT public.admin_get_ai_usage_stats('today', 'feature')$$,
  '42501', NULL,
  '8: anon cannot call admin_get_ai_usage_stats'
);

-- ================================================================
-- admin_upsert_user_limits
-- ================================================================

-- 9: non-admin cannot upsert
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';
SELECT throws_ok(
  $$SELECT public.admin_upsert_user_limits('cccccccc-cccc-cccc-cccc-cccccccccccc', 'content_generation', 50, 20.0)$$,
  '42501', NULL,
  '9: non-admin cannot upsert user limits'
);

-- 10: anon cannot upsert
RESET ROLE; SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT public.admin_upsert_user_limits('cccccccc-cccc-cccc-cccc-cccccccccccc', 'content_generation', 50, 20.0)$$,
  '42501', NULL,
  '10: anon cannot call admin_upsert_user_limits'
);

-- 11: admin can upsert (insert new)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
SELECT is(
  (public.admin_upsert_user_limits('cccccccc-cccc-cccc-cccc-cccccccccccc', 'content_generation', 50, 20.0)->>'success')::boolean,
  true,
  '11: admin can insert new user limits'
);

-- 12: verify limits were set (use SECURITY DEFINER helper to bypass RLS)
SELECT is(
  pg_temp.get_user_limit_daily_req('cccccccc-cccc-cccc-cccc-cccccccccccc', 'content_generation'),
  50,
  '12: daily_request_limit = 50'
);

-- 13: admin can upsert (update existing)
SELECT is(
  (public.admin_upsert_user_limits('cccccccc-cccc-cccc-cccc-cccccccccccc', 'content_generation', 100, NULL)->>'success')::boolean,
  true,
  '13: admin can update existing user limits'
);

SELECT is(
  pg_temp.get_user_limit_daily_req('cccccccc-cccc-cccc-cccc-cccccccccccc', 'content_generation'),
  100,
  '13b: daily_request_limit updated to 100'
);

-- ================================================================
-- admin_restore_user_access
-- ================================================================

-- 14-15: block user first (as postgres, bypasses RLS)
RESET ROLE;
UPDATE public.ai_user_limits
SET status = 'blocked', blocked_at = now(), blocked_reason = 'cost limit exceeded'
WHERE user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' AND feature = 'content_generation';

-- 14: verify blocked state
SELECT is(
  pg_temp.get_user_limit_status('cccccccc-cccc-cccc-cccc-cccccccccccc', 'content_generation'),
  'blocked',
  '14: user is blocked'
);

-- 15: non-admin cannot restore
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';
SELECT throws_ok(
  $$SELECT public.admin_restore_user_access('cccccccc-cccc-cccc-cccc-cccccccccccc', 'content_generation')$$,
  '42501', NULL,
  '15: non-admin cannot restore user access'
);

-- 16: anon cannot restore
RESET ROLE; SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT public.admin_restore_user_access('cccccccc-cccc-cccc-cccc-cccccccccccc', 'content_generation')$$,
  '42501', NULL,
  '16: anon cannot call admin_restore_user_access'
);

-- 17: admin can restore
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
SELECT is(
  (public.admin_restore_user_access('cccccccc-cccc-cccc-cccc-cccccccccccc', 'content_generation')->>'success')::boolean,
  true,
  '17: admin can restore user access'
);

-- Verify restored (use helpers to bypass RLS)
SELECT is(
  pg_temp.get_user_limit_status('cccccccc-cccc-cccc-cccc-cccccccccccc', 'content_generation'),
  'active',
  '17b: status restored to active'
);

SELECT is(
  pg_temp.get_user_limit_restored('cccccccc-cccc-cccc-cccc-cccccccccccc', 'content_generation'),
  true,
  '17c: manually_restored_at is set'
);

-- 18: audit_logs entry was created for restore (run as postgres — audit_logs is restricted)
RESET ROLE;
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs
   WHERE entity_type = 'ai_user_limits'
     AND action = 'restore_ai_access'
     AND after_data->>'restored_user_id' = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  1,
  '18: audit_logs entry created for restore'
);

-- Switch back to authenticated admin for remaining tests
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';

-- 19: verify restore returns 7d period works
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
SELECT is(
  (public.admin_get_ai_usage_stats('7d', 'feature')->>'period'),
  '7d',
  '19: admin_get_ai_usage_stats returns period=7d'
);

-- 20: verify user groupBy works
SELECT is(
  (public.admin_get_ai_usage_stats('today', 'user')->>'groupBy'),
  'user',
  '20: admin_get_ai_usage_stats returns groupBy=user'
);

-- 21: verify user groupBy produces groups
SELECT ok(
  jsonb_array_length(public.admin_get_ai_usage_stats('today', 'user')->'groups') > 0,
  '21: user groupBy produces non-empty groups'
);

-- 22: restoring an already-active user is rejected
-- First verify user C is already active from test 17
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
SELECT throws_ok(
  $$SELECT public.admin_restore_user_access('cccccccc-cccc-cccc-cccc-cccccccccccc', 'content_generation')$$,
  '42501', NULL,
  '22: restoring an already-active user is rejected'
);

SELECT finish();
ROLLBACK;
