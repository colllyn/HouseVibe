-- AI Quota RPC Atomicity Tests
BEGIN;
SET LOCAL search_path TO public, extensions;

CREATE OR REPLACE FUNCTION pg_temp.insert_auth_user(p_id uuid, p_email text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'auth, pg_catalog'
AS $$
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data, aud, role, encrypted_password, created_at, updated_at)
  VALUES (p_id, p_email, '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated', '', now(), now());
END;
$$;

SELECT pg_temp.insert_auth_user('aaaaaaaa-1111-4000-8000-000000000001', 'ua@test');
SELECT pg_temp.insert_auth_user('aaaaaaaa-1111-4000-8000-000000000002', 'ub@test');
SELECT pg_temp.insert_auth_user('aaaaaaaa-1111-4000-8000-000000000003', 'uc@test');
INSERT INTO public.workspaces (id, name, owner_user_id, city, business_type) VALUES
  ('bbbbbbbb-1111-4000-8000-000000000001', 'W1', 'aaaaaaaa-1111-4000-8000-000000000001', 'GZ', 'residential_lease'),
  ('bbbbbbbb-1111-4000-8000-000000000002', 'W2', 'aaaaaaaa-1111-4000-8000-000000000002', 'SZ', 'residential_lease');
INSERT INTO public.workspace_members (id, workspace_id, user_id, role, status) VALUES
  ('cccccccc-1111-4000-8000-000000000001', 'bbbbbbbb-1111-4000-8000-000000000001', 'aaaaaaaa-1111-4000-8000-000000000001', 'owner', 'active'),
  ('cccccccc-1111-4000-8000-000000000002', 'bbbbbbbb-1111-4000-8000-000000000002', 'aaaaaaaa-1111-4000-8000-000000000002', 'owner', 'active');

SELECT plan(18);
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-1111-4000-8000-000000000001"}';

SELECT is((public.reserve_ai_quota(p_user_id:='aaaaaaaa-1111-4000-8000-000000000001',p_workspace_id:='bbbbbbbb-1111-4000-8000-000000000001',p_feature:='content_factory',p_request_limit:=10,p_daily_cost_limit_usd:=10.0,p_reserved_estimated_cost_usd:=0.01,p_idempotency_key:='idem-001',p_request_id:='req-001')->>'success')::boolean, true, '1: reserve succeeds');
SELECT is((public.reserve_ai_quota(p_user_id:='aaaaaaaa-1111-4000-8000-000000000001',p_workspace_id:='bbbbbbbb-1111-4000-8000-000000000001',p_feature:='content_factory',p_request_limit:=10,p_daily_cost_limit_usd:=10.0,p_reserved_estimated_cost_usd:=0.01,p_idempotency_key:='idem-001',p_request_id:='req-001')->>'already_reserved')::boolean, true, '3: same idempotency_key already_reserved');
SELECT is((public.settle_ai_quota(p_user_id:='aaaaaaaa-1111-4000-8000-000000000001',p_workspace_id:='bbbbbbbb-1111-4000-8000-000000000001',p_idempotency_key:='idem-001',p_status:='succeeded',p_input_tokens:=1200,p_output_tokens:=800,p_actual_cost_usd:=0.002,p_model:='deepseek-v4-flash',p_request_id:='req-001')->>'success')::boolean, true, '4: settle reserved->succeeded');
SELECT is((public.settle_ai_quota(p_user_id:='aaaaaaaa-1111-4000-8000-000000000001',p_workspace_id:='bbbbbbbb-1111-4000-8000-000000000001',p_idempotency_key:='idem-001',p_status:='succeeded',p_input_tokens:=1200,p_output_tokens:=800,p_actual_cost_usd:=0.002,p_model:='deepseek-v4-flash',p_request_id:='req-001')->>'idempotent')::boolean, true, '5: repeat settle idempotent');
SELECT is((public.reserve_ai_quota(p_user_id:='aaaaaaaa-1111-4000-8000-000000000001',p_workspace_id:='bbbbbbbb-1111-4000-8000-000000000001',p_feature:='content_factory',p_request_limit:=10,p_daily_cost_limit_usd:=10.0,p_reserved_estimated_cost_usd:=0.01,p_idempotency_key:='idem-002',p_request_id:='req-002')->>'success')::boolean, true, '6: second reserve succeeds');
SELECT is((public.release_ai_quota(p_user_id:='aaaaaaaa-1111-4000-8000-000000000001',p_workspace_id:='bbbbbbbb-1111-4000-8000-000000000001',p_idempotency_key:='idem-002',p_reason:='test_release')->>'success')::boolean, true, '7: release reserved->released');
SELECT is((public.release_ai_quota(p_user_id:='aaaaaaaa-1111-4000-8000-000000000001',p_workspace_id:='bbbbbbbb-1111-4000-8000-000000000001',p_idempotency_key:='idem-002',p_reason:='test_release')->>'idempotent')::boolean, true, '8: repeat release idempotent');
SELECT throws_ok($$SELECT public.release_ai_quota('aaaaaaaa-1111-4000-8000-000000000001','bbbbbbbb-1111-4000-8000-000000000001','idem-001','test')$$, '22023', NULL, '9: settled cannot be released');
SELECT throws_ok($$SELECT public.settle_ai_quota('aaaaaaaa-1111-4000-8000-000000000001','bbbbbbbb-1111-4000-8000-000000000001','idem-002','succeeded',100,100,0.001,'deepseek-v4-flash','req-099')$$, '22023', NULL, '10: released cannot be settled');
SELECT throws_ok($$SELECT public.reserve_ai_quota('aaaaaaaa-1111-4000-8000-000000000001','bbbbbbbb-1111-4000-8000-000000000002','content_factory',NULL,NULL,10,10.0,0.01,'idem-w2-001','req-w2-001')$$, '42501', NULL, '11: cross-workspace reserve fails');
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-1111-4000-8000-000000000002"}';
SELECT throws_ok($$SELECT public.settle_ai_quota('aaaaaaaa-1111-4000-8000-000000000001','bbbbbbbb-1111-4000-8000-000000000001','idem-001','succeeded',100,100,0.001,'deepseek-v4-flash','req-099')$$, '42501', NULL, '12: User B cannot settle User A');
RESET ROLE; SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.reserve_ai_quota('aaaaaaaa-1111-4000-8000-000000000001','bbbbbbbb-1111-4000-8000-000000000001','content_factory',NULL,NULL,10,10.0,0.01,'idem-anon-001','req-anon-001')$$, '42501', NULL, '13: anon cannot reserve');
SELECT throws_ok($$SELECT public.settle_ai_quota('aaaaaaaa-1111-4000-8000-000000000001','bbbbbbbb-1111-4000-8000-000000000001','idem-001','succeeded',100,100,0.001,'deepseek-v4-flash','req-099')$$, '42501', NULL, '14: anon cannot settle');
SELECT throws_ok($$SELECT public.release_ai_quota('aaaaaaaa-1111-4000-8000-000000000001','bbbbbbbb-1111-4000-8000-000000000001','idem-001','test')$$, '42501', NULL, '15: anon cannot release');
RESET ROLE; SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-1111-4000-8000-000000000001"}';
SELECT is((public.reserve_ai_quota(p_user_id:='aaaaaaaa-1111-4000-8000-000000000001',p_workspace_id:='bbbbbbbb-1111-4000-8000-000000000001',p_feature:='content_factory',p_request_limit:=1,p_daily_cost_limit_usd:=10.0,p_reserved_estimated_cost_usd:=0.01,p_idempotency_key:='idem-limit-001',p_request_id:='req-limit-001')->>'success')::boolean, false, '16: request limit exceeded');
SELECT is((public.reserve_ai_quota(p_user_id:='aaaaaaaa-1111-4000-8000-000000000001',p_workspace_id:='bbbbbbbb-1111-4000-8000-000000000001',p_feature:='content_factory',p_request_limit:=1,p_daily_cost_limit_usd:=10.0,p_reserved_estimated_cost_usd:=0.01,p_idempotency_key:='idem-limit-001',p_request_id:='req-limit-001')->>'limit_reason'), 'request_limit', '17: limit_reason=request_limit');
RESET ROLE; SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-1111-4000-8000-000000000001"}';
SELECT lives_ok($$SELECT public.reserve_ai_quota('aaaaaaaa-1111-4000-8000-000000000001','bbbbbbbb-1111-4000-8000-000000000001','content_factory',NULL,NULL,10,10.0,0.01,'idem-comp-001','req-comp-001')$$, '18: reserve for compliance test');
SELECT is((public.settle_ai_quota(p_user_id:='aaaaaaaa-1111-4000-8000-000000000001',p_workspace_id:='bbbbbbbb-1111-4000-8000-000000000001',p_idempotency_key:='idem-comp-001',p_status:='rejected_compliance',p_input_tokens:=500,p_output_tokens:=300,p_actual_cost_usd:=0.001,p_model:='deepseek-v4-flash',p_request_id:='req-comp-001')->>'success')::boolean, true, '19: settle rejected_compliance succeeds');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
