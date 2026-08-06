-- =============================================================================
-- 21_ai_tables_rls_test.sql — AI Data Tables RLS Tests (P3-RLS-002)
--
-- Coverage:
--   1. ai_model_pricing: SA read/insert/update, normal cannot read/insert/update
--   2. ai_user_limits: user reads own, SA insert/update/delete, normal cannot write
--   3. ai_usage_logs: user reads own, normal cannot read others/write
--   4. ai_runtime_config: SA read/update, normal cannot read/update
--   5. ai_correction_logs: user reads own, normal cannot read others/write
--   6. anon cannot access any AI data table
-- =============================================================================

BEGIN;

SELECT plan(39);

SET LOCAL search_path TO public, extensions;
SET LOCAL client_min_messages TO warning;

-- Helper: insert auth users
CREATE OR REPLACE FUNCTION pg_temp.insert_auth_user(
  p_id uuid, p_email text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'auth, pg_catalog'
AS $$
BEGIN
  INSERT INTO auth.users (
    id, email, raw_user_meta_data, raw_app_meta_data,
    aud, role, encrypted_password, created_at, updated_at
  )
  VALUES (
    p_id, p_email, '{}'::jsonb, '{}'::jsonb,
    'authenticated', 'authenticated', '', now(), now()
  );
END;
$$;

-- =============================================================================
-- Setup: Admin (SA), User A, User B (same workspace), User C (outsider)
-- =============================================================================

SELECT pg_temp.insert_auth_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'ai-rls-admin@test');
SELECT pg_temp.insert_auth_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'ai-rls-usera@test');
SELECT pg_temp.insert_auth_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'ai-rls-userb@test');
SELECT pg_temp.insert_auth_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'ai-rls-userc@test');

-- Make admin a system admin
INSERT INTO public.system_admins (user_id, status, created_by)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'active', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1');

-- Workspace
INSERT INTO public.workspaces (id, name, owner_user_id, city, business_type)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'AI-RLS-WS',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'Guangzhou', 'residential_lease');

-- Members: User A and User B in same workspace
INSERT INTO public.workspace_members (id, workspace_id, user_id, role, status)
VALUES
  ('cccccccc-cccc-cccc-cccc-ccccccccccc1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'owner', 'active'),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc2', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'member', 'active');

-- Seed data as postgres (bypasses RLS)
-- ai_model_pricing
INSERT INTO public.ai_model_pricing (id, provider, model, capability, input_price_per_1k_tokens, output_price_per_1k_tokens)
VALUES ('dddddddd-dddd-dddd-dddd-ddddddddddd1', 'deepseek', 'test-model', 'text_generation', 0.001, 0.002);

-- ai_usage_logs for User A
INSERT INTO public.ai_usage_logs (id, user_id, workspace_id, feature, provider, model, capability, input_tokens, output_tokens, estimated_cost_usd, quota_date, status, idempotency_key, request_id)
VALUES ('dddddddd-dddd-dddd-dddd-ddddddddddd2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'content_generation', 'deepseek', 'test-model',
  'text_generation', 100, 200, 0.001, current_date, 'reserved', 'idem-test-1', 'req-test-1');

-- ai_usage_logs for User B
INSERT INTO public.ai_usage_logs (id, user_id, workspace_id, feature, provider, model, capability, input_tokens, output_tokens, estimated_cost_usd, quota_date, status, idempotency_key, request_id)
VALUES ('dddddddd-dddd-dddd-dddd-ddddddddddd3', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'content_generation', 'deepseek', 'test-model',
  'text_generation', 50, 100, 0.0005, current_date, 'reserved', 'idem-test-2', 'req-test-2');

-- ai_correction_logs for User A
INSERT INTO public.ai_correction_logs (id, user_id, workspace_id, feature, request_id, entity_type, entity_id, original_output, corrected_output, diff)
VALUES ('dddddddd-dddd-dddd-dddd-ddddddddddd4', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'content_factory', 'dddddddd-dddd-dddd-dddd-dddddddddd01', 'content',
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb);

-- ai_correction_logs for User B
INSERT INTO public.ai_correction_logs (id, user_id, workspace_id, feature, request_id, entity_type, entity_id, original_output, corrected_output, diff)
VALUES ('dddddddd-dddd-dddd-dddd-ddddddddddd5', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'content_factory', 'dddddddd-dddd-dddd-dddd-dddddddddd02', 'content',
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb);

-- ai_runtime_config (capability must be 'text' or 'vision')
-- NOTE: 'text' capability may already exist from seed migrations; use ON CONFLICT
INSERT INTO public.ai_runtime_config (capability, mode, circuit_open, consecutive_failures)
VALUES ('text', 'auto', false, 0)
ON CONFLICT (capability) DO UPDATE SET mode = 'auto', circuit_open = false, consecutive_failures = 0;

-- ai_user_limits for User A
INSERT INTO public.ai_user_limits (id, user_id, feature, daily_request_limit, daily_cost_limit_usd)
VALUES ('dddddddd-dddd-dddd-dddd-ddddddddddd6', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
  'content_generation', 50, 10.0);

-- =============================================================================
-- ai_model_pricing RLS (contract §4.22: SA-only read, SA write)
-- =============================================================================

-- 1: Normal user (User A) cannot read ai_model_pricing
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::integer FROM public.ai_model_pricing),
  0,
  '1: normal user cannot read ai_model_pricing'
);

-- 2: System admin can read ai_model_pricing (may include seed data from prior migrations)
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1","role":"authenticated"}';
SELECT ok(
  (SELECT count(*)::integer FROM public.ai_model_pricing) >= 1,
  '2: system admin can read ai_model_pricing'
);

-- 3: Normal user cannot insert ai_model_pricing
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2","role":"authenticated"}';
SELECT throws_ok(
  $$INSERT INTO public.ai_model_pricing (provider, model, capability, input_price_per_1k_tokens, output_price_per_1k_tokens)
    VALUES ('deepseek', 'bad-model', 'text_generation', 1.0, 2.0)$$,
  '42501', NULL,
  '3: normal user cannot insert ai_model_pricing'
);

-- 4: System admin can insert ai_model_pricing
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1","role":"authenticated"}';
SELECT lives_ok(
  $$INSERT INTO public.ai_model_pricing (provider, model, capability, input_price_per_1k_tokens, output_price_per_1k_tokens)
    VALUES ('deepseek', 'admin-model', 'text_generation', 0.01, 0.02)$$,
  '4: system admin can insert ai_model_pricing'
);

-- 5: System admin can update ai_model_pricing
SELECT lives_ok(
  $$UPDATE public.ai_model_pricing SET input_price_per_1k_tokens = 0.015
    WHERE model = 'admin-model'$$,
  '5: system admin can update ai_model_pricing'
);

-- =============================================================================
-- ai_user_limits RLS (contract §4.23: user reads own, SA write)
-- =============================================================================

-- 6: User A can read own limits
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::integer FROM public.ai_user_limits),
  1,
  '6: user can read own ai_user_limits'
);

-- 7: User B cannot read User A's limits
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::integer FROM public.ai_user_limits),
  0,
  '7: user B cannot read user A ai_user_limits'
);

-- 8: Normal user cannot insert ai_user_limits
SELECT throws_ok(
  $$INSERT INTO public.ai_user_limits (user_id, feature, daily_request_limit, daily_cost_limit_usd)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'content_generation', 100, 50.0)$$,
  '42501', NULL,
  '8: normal user cannot insert ai_user_limits'
);

-- 9: Normal user cannot update ai_user_limits (RLS using filter + with check prevents)
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2","role":"authenticated"}';
-- Store original value first, then attempt update and verify unchanged
SELECT is(
  (SELECT daily_request_limit::integer FROM public.ai_user_limits WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'),
  50,
  '9: original daily_request_limit is 50'
);
-- Attempt update — RLS using clause silently filters, so statement succeeds with 0 rows affected.
-- The with check clause would throw for INSERT, but for UPDATE the using filter prevents row matching.
-- Verify the value is unchanged.
SELECT lives_ok(
  $$UPDATE public.ai_user_limits SET daily_request_limit = 999 WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'$$,
  '9b: normal user UPDATE attempt does not throw (RLS silent filter)'
);
SELECT is(
  (SELECT daily_request_limit::integer FROM public.ai_user_limits WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'),
  50,
  '9c: value unchanged — normal user cannot update ai_user_limits'
);

-- 10: System admin can insert ai_user_limits
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1","role":"authenticated"}';
SELECT lives_ok(
  $$INSERT INTO public.ai_user_limits (user_id, feature, daily_request_limit, daily_cost_limit_usd)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'visual_analysis', 10, 5.0)$$,
  '10: system admin can insert ai_user_limits'
);

-- 11: System admin can update ai_user_limits
SELECT lives_ok(
  $$UPDATE public.ai_user_limits SET daily_request_limit = 200
    WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'$$,
  '11: system admin can update ai_user_limits'
);

-- 12: System admin can delete ai_user_limits
SELECT lives_ok(
  $$DELETE FROM public.ai_user_limits
    WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3' AND feature = 'visual_analysis'$$,
  '12: system admin can delete ai_user_limits'
);

-- =============================================================================
-- ai_usage_logs RLS (contract §4.19: user reads own, no direct writes)
-- =============================================================================

-- 13: User A can read own usage logs
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::integer FROM public.ai_usage_logs),
  1,
  '13: user can read own ai_usage_logs'
);

-- 14: User B cannot read User A's usage logs
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::integer FROM public.ai_usage_logs WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'),
  0,
  '14: user B cannot read user A ai_usage_logs'
);

-- 15: Normal user cannot insert ai_usage_logs
SELECT throws_ok(
  $$INSERT INTO public.ai_usage_logs (user_id, workspace_id, feature, quota_date, status, idempotency_key, request_id)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
            'content_generation', current_date, 'reserved', 'bad-key-1', 'bad-req-1')$$,
  '42501', NULL,
  '15: normal user cannot insert ai_usage_logs'
);

-- 16: Normal user cannot update ai_usage_logs (no UPDATE policy = denied by default)
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2","role":"authenticated"}';
-- ai_usage_logs has no UPDATE policy at all → permission denied at privilege level
SELECT throws_ok(
  $$UPDATE public.ai_usage_logs SET status = 'settled' WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'$$,
  '42501', NULL,
  '16: normal user cannot update ai_usage_logs'
);

-- =============================================================================
-- ai_runtime_config RLS (contract §4.24: SA-only read/write)
-- =============================================================================

-- 17: Normal user cannot read ai_runtime_config
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::integer FROM public.ai_runtime_config),
  0,
  '17: normal user cannot read ai_runtime_config'
);

-- 18: Normal user cannot update ai_runtime_config (RLS using filter prevents)
-- RLS using clause silently filters — verify mode is unchanged after attempted update
SELECT lives_ok(
  $$UPDATE public.ai_runtime_config SET mode = 'primary' WHERE capability = 'text'$$,
  '18: normal user UPDATE attempt does not throw (RLS silent filter)'
);

-- 18b: Verify mode unchanged (admin verifies)
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1","role":"authenticated"}';
SELECT is(
  (SELECT mode::text FROM public.ai_runtime_config WHERE capability = 'text'),
  'auto',
  '18b: mode still auto — normal user update had no effect'
);

-- 19: System admin can read ai_runtime_config
SELECT ok(
  (SELECT count(*)::integer FROM public.ai_runtime_config) >= 1,
  '19: system admin can read ai_runtime_config'
);

-- 20: System admin can update ai_runtime_config
SELECT lives_ok(
  $$UPDATE public.ai_runtime_config SET mode = 'fallback' WHERE capability = 'text'$$,
  '20: system admin can update ai_runtime_config'
);

-- =============================================================================
-- ai_runtime_config RPC bypass tests
-- SECURITY DEFINER RPCs must enforce admin checks (P3-RLS-002 reviewer finding)
-- =============================================================================

-- 21: Normal user cannot call get_runtime_config (RPC must enforce admin check)
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.get_runtime_config('text')$$,
  '42501', NULL,
  '21: normal user cannot call get_runtime_config (admin check enforced)'
);

-- 22: System admin can call get_runtime_config
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1","role":"authenticated"}';
SELECT lives_ok(
  $$SELECT public.get_runtime_config('text')$$,
  '22: system admin can call get_runtime_config'
);

-- 23: Normal user cannot call update_circuit_state (RPC must enforce admin check)
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.update_circuit_state('text', true, false)$$,
  '42501', NULL,
  '23: normal user cannot call update_circuit_state (admin check enforced)'
);

-- 24: System admin can call update_circuit_state
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1","role":"authenticated"}';
SELECT lives_ok(
  $$SELECT public.update_circuit_state('text', true, false)$$,
  '24: system admin can call update_circuit_state'
);

-- =============================================================================
-- ai_correction_logs RLS (contract §4.20: user reads own, no direct writes)
-- =============================================================================

-- 25: User A can read own correction logs
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::integer FROM public.ai_correction_logs),
  1,
  '25: user can read own ai_correction_logs'
);

-- 26: User B cannot read User A's correction logs
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::integer FROM public.ai_correction_logs WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'),
  0,
  '26: user B cannot read user A ai_correction_logs'
);

-- 27: Normal user cannot insert ai_correction_logs
SELECT throws_ok(
  $$INSERT INTO public.ai_correction_logs (user_id, workspace_id, feature, request_id, entity_type, entity_id, original_output, corrected_output, diff)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
            'content_factory', 'dddddddd-dddd-dddd-dddd-dddddddddd03', 'content', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee3',
            '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)$$,
  '42501', NULL,
  '27: normal user cannot insert ai_correction_logs'
);

-- 28: System admin can read all correction logs
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1","role":"authenticated"}';
SELECT ok(
  (SELECT count(*)::integer FROM public.ai_correction_logs) >= 2,
  '28: system admin can read all ai_correction_logs'
);

-- =============================================================================
-- Anon access denied
-- =============================================================================

-- 29: Anon cannot read ai_model_pricing
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claims" TO '';
SELECT throws_ok(
  $$SELECT count(*) FROM public.ai_model_pricing$$,
  '42501', NULL,
  '29: anon denied ai_model_pricing'
);

-- 30: Anon cannot read ai_usage_logs
SELECT throws_ok(
  $$SELECT count(*) FROM public.ai_usage_logs$$,
  '42501', NULL,
  '30: anon denied ai_usage_logs'
);

-- 31: Anon cannot read ai_correction_logs
SELECT throws_ok(
  $$SELECT count(*) FROM public.ai_correction_logs$$,
  '42501', NULL,
  '31: anon denied ai_correction_logs'
);

-- 32: Anon cannot read ai_runtime_config
SELECT throws_ok(
  $$SELECT count(*) FROM public.ai_runtime_config$$,
  '42501', NULL,
  '32: anon denied ai_runtime_config'
);

-- 33: Anon cannot read ai_user_limits
SELECT throws_ok(
  $$SELECT count(*) FROM public.ai_user_limits$$,
  '42501', NULL,
  '33: anon denied ai_user_limits'
);

-- 34: Anon cannot read ai_runtime_config via RPC
SET LOCAL "request.jwt.claims" TO '';
SELECT throws_ok(
  $$SELECT public.get_runtime_config('text')$$,
  '42501', NULL,
  '34: anon denied get_runtime_config RPC'
);

-- 35: Anon cannot call update_circuit_state via RPC
SELECT throws_ok(
  $$SELECT public.update_circuit_state('text', true, false)$$,
  '42501', NULL,
  '35: anon denied update_circuit_state RPC'
);

-- 36: Outsider (authenticated, no workspace) cannot read ai_runtime_config via RPC
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.get_runtime_config('text')$$,
  '42501', NULL,
  '36: outsider user denied get_runtime_config RPC (not system admin)'
);

SELECT finish();
ROLLBACK;
