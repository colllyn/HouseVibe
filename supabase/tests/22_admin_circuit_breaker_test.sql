-- =============================================================================
-- 22_admin_circuit_breaker_test.sql — P3-AI-015
-- Tests: admin_reset_circuit, admin_upsert_user_limits audit logging,
--        SECURITY DEFINER search_path, cross-workspace isolation
-- =============================================================================

BEGIN;
SET LOCAL search_path TO public, extensions;

-- =============================================================================
-- Helpers
-- =============================================================================

CREATE OR REPLACE FUNCTION pg_temp.insert_auth_user(p_id uuid, p_email text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'auth, pg_catalog'
AS $$
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data, aud, role, encrypted_password, created_at, updated_at)
  VALUES (p_id, p_email, '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated', '', now(), now());
END;
$$;

-- Helper to read circuit state as postgres (bypasses RLS)
CREATE OR REPLACE FUNCTION pg_temp.get_circuit_open(p_cap text) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = 'public'
AS $$ SELECT circuit_open FROM public.ai_runtime_config WHERE capability = p_cap; $$;

CREATE OR REPLACE FUNCTION pg_temp.get_consecutive_failures(p_cap text) RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = 'public'
AS $$ SELECT consecutive_failures FROM public.ai_runtime_config WHERE capability = p_cap; $$;

-- Test users
-- Admin:   aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- User B:  bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb
-- User C:  cccccccc-cccc-cccc-cccc-cccccccccccc

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

-- Ensure ai_runtime_config rows exist
INSERT INTO public.ai_runtime_config (capability, mode, circuit_open, consecutive_failures)
VALUES ('text', 'auto', false, 0), ('vision', 'auto', false, 0)
ON CONFLICT (capability) DO NOTHING;

SELECT * FROM no_plan();

-- =============================================================================
-- 1. admin_reset_circuit — auth & authorization
-- =============================================================================

-- 1: anon cannot call admin_reset_circuit
RESET ROLE; SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT public.admin_reset_circuit('text')$$,
  '42501', NULL,
  '1: anon cannot call admin_reset_circuit'
);

-- 2: regular authenticated user cannot call
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';
SELECT throws_ok(
  $$SELECT public.admin_reset_circuit('text')$$,
  '42501', NULL,
  '2: regular user cannot call admin_reset_circuit'
);

-- 3: admin can call admin_reset_circuit (circuit closed — reset is idempotent)
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
SELECT is(
  (public.admin_reset_circuit('text')->>'success')::boolean,
  true,
  '3: admin can call admin_reset_circuit on closed circuit'
);

-- 4: circuit state stays closed after reset of already-closed circuit
SELECT is(
  pg_temp.get_circuit_open('text'),
  false,
  '4: circuit_open remains false after reset on closed circuit'
);

SELECT is(
  pg_temp.get_consecutive_failures('text'),
  0,
  '4b: consecutive_failures is 0 after reset on closed circuit'
);

-- =============================================================================
-- 2. admin_reset_circuit — reset of open circuit
-- =============================================================================

-- Force circuit open for text (as postgres, bypasses RLS)
RESET ROLE;
UPDATE public.ai_runtime_config
SET circuit_open = true, consecutive_failures = 5, last_failure_at = now()
WHERE capability = 'text';

-- 5: verify circuit is open
SELECT is(
  pg_temp.get_circuit_open('text'),
  true,
  '5: circuit_open is true before reset (pre-condition)'
);

-- 6: admin resets open circuit
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
SELECT is(
  (public.admin_reset_circuit('text')->>'success')::boolean,
  true,
  '6: admin can reset an open circuit'
);

-- 7: circuit is now closed
SELECT is(
  pg_temp.get_circuit_open('text'),
  false,
  '7: circuit_open is false after reset'
);

-- 8: consecutive_failures zeroed
SELECT is(
  pg_temp.get_consecutive_failures('text'),
  0,
  '8: consecutive_failures is 0 after reset'
);

-- =============================================================================
-- 3. admin_reset_circuit — audit log
-- =============================================================================

RESET ROLE;

-- 9: audit_log entry created for manual reset (text circuit reset twice: closed→closed then open→closed)
-- Verify the open→closed reset entry specifically
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs
   WHERE entity_type = 'ai_runtime_config'
     AND action = 'ai_circuit_manually_reset'
     AND entity_id = 'text'),
  2,
  '9: two audit_log entries for text circuit reset (one idempotent, one open→closed)'
);

-- 10: the open→closed reset entry has before_data.circuit_open = true
SELECT is(
  (SELECT (before_data->>'circuit_open')::boolean FROM public.audit_logs
   WHERE action = 'ai_circuit_manually_reset' AND entity_id = 'text'
     AND (before_data->>'circuit_open')::boolean = true
   ORDER BY created_at DESC LIMIT 1),
  true,
  '10: open→closed reset entry has before_data.circuit_open = true'
);

-- 11: audit_log entry has after_data with reset info
SELECT is(
  (SELECT (after_data->>'circuit_open')::boolean FROM public.audit_logs
   WHERE action = 'ai_circuit_manually_reset' AND entity_id = 'text'
   ORDER BY created_at DESC LIMIT 1),
  false,
  '11: audit_log after_data.circuit_open = false (reset confirmed)'
);

-- =============================================================================
-- 4. admin_reset_circuit — invalid capability
-- =============================================================================

-- 12: invalid capability is rejected
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
SELECT throws_ok(
  $$SELECT public.admin_reset_circuit('invalid')$$,
  'DT001', NULL,
  '12: invalid capability rejected with DT001'
);

-- =============================================================================
-- 5. admin_upsert_user_limits — audit log (new in P3-AI-015)
-- =============================================================================

-- 13: admin upserts limits — audit_log entry is created
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
SELECT is(
  (public.admin_upsert_user_limits('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'content_generation', 75, 30.0)->>'success')::boolean,
  true,
  '13: admin can upsert user limits'
);

-- 14: audit_log entry for update_ai_limits
RESET ROLE;
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs
   WHERE entity_type = 'ai_user_limits'
     AND action = 'update_ai_limits'
     AND actor_user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1,
  '14: audit_log entry created for limit update'
);

-- 15: audit_log after_data contains target_user_id
SELECT is(
  (SELECT after_data->>'target_user_id' FROM public.audit_logs
   WHERE action = 'update_ai_limits'
   ORDER BY created_at DESC LIMIT 1),
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '15: audit_log after_data.target_user_id = target user'
);

-- 16: audit_log after_data contains feature
SELECT is(
  (SELECT after_data->>'feature' FROM public.audit_logs
   WHERE action = 'update_ai_limits'
   ORDER BY created_at DESC LIMIT 1),
  'content_generation',
  '16: audit_log after_data.feature = content_generation'
);

-- =============================================================================
-- 6. SECURITY DEFINER search_path hardening
-- =============================================================================

-- 17: admin_reset_circuit has SECURITY DEFINER (search_path enforced at DDL)
RESET ROLE;
SELECT is(
  (SELECT prosecdef FROM pg_proc p
   JOIN pg_namespace n ON p.pronamespace = n.oid
   WHERE n.nspname = 'public' AND p.proname = 'admin_reset_circuit'),
  true,
  '17: admin_reset_circuit is SECURITY DEFINER'
);

-- 18: admin_upsert_user_limits has SECURITY DEFINER (replaced in P3-AI-015)
SELECT is(
  (SELECT prosecdef FROM pg_proc p
   JOIN pg_namespace n ON p.pronamespace = n.oid
   WHERE n.nspname = 'public' AND p.proname = 'admin_upsert_user_limits'),
  true,
  '18: admin_upsert_user_limits is SECURITY DEFINER'
);

-- =============================================================================
-- 7. Cross-workspace privilege escalation prevention
-- =============================================================================

-- User B is only in workspace WB. They should NOT be able to affect
-- anything in workspace WA through admin RPCs.

-- 19: user B cannot call admin_upsert_user_limits (non-admin)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';
SELECT throws_ok(
  $$SELECT public.admin_upsert_user_limits('cccccccc-cccc-cccc-cccc-cccccccccccc', 'content_generation', 10, 5.0)$$,
  '42501', NULL,
  '19: user B cannot call admin_upsert_user_limits (non-admin, no cross-workspace escalation)'
);

-- 20: user B cannot call admin_reset_circuit (non-admin)
SELECT throws_ok(
  $$SELECT public.admin_reset_circuit('text')$$,
  '42501', NULL,
  '20: user B cannot call admin_reset_circuit (non-admin)'
);

-- 21: admin can reset vision circuit too
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
SELECT is(
  (public.admin_reset_circuit('vision')->>'success')::boolean,
  true,
  '21: admin can reset vision circuit'
);

-- =============================================================================
-- 8. Grants verification
-- =============================================================================

-- 22: authenticated role has execute on admin_reset_circuit
RESET ROLE;
SELECT ok(
  (SELECT has_function_privilege('authenticated', 'public.admin_reset_circuit(text)', 'EXECUTE')),
  '22: authenticated role has EXECUTE on admin_reset_circuit'
);

-- 23: anon role does NOT have execute on admin_reset_circuit
SELECT ok(
  NOT (SELECT has_function_privilege('anon', 'public.admin_reset_circuit(text)', 'EXECUTE')),
  '23: anon role does NOT have EXECUTE on admin_reset_circuit'
);

-- 24: public role does NOT have execute on admin_reset_circuit
SELECT ok(
  NOT (SELECT has_function_privilege('public', 'public.admin_reset_circuit(text)', 'EXECUTE')),
  '24: public role does NOT have EXECUTE on admin_reset_circuit'
);

SELECT finish();
ROLLBACK;
