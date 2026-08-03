-- P2-MATCH-001: Matching RLS & RPC Tests
-- Tests: upsert, status transitions, cross-workspace, anon, audit, RPC grants.

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

-- Setup users
SELECT pg_temp.insert_auth_user('e0000101-0000-4000-8000-000000000001', 'match-owner@test');
SELECT pg_temp.insert_auth_user('e0000101-0000-4000-8000-000000000002', 'match-other@test');

-- Workspace setup
INSERT INTO public.workspaces (id, name, owner_user_id, city, business_type)
VALUES ('d2000101-0000-4000-8000-000000000001', 'WS-Match-A', 'e0000101-0000-4000-8000-000000000001', 'Guangzhou', 'residential_lease');
INSERT INTO public.workspaces (id, name, owner_user_id, city, business_type)
VALUES ('d2000101-0000-4000-8000-000000000002', 'WS-Match-B', 'e0000101-0000-4000-8000-000000000002', 'Shenzhen', 'residential_lease');

INSERT INTO public.workspace_members (id, workspace_id, user_id, role, status) VALUES
  ('ae02-0001-0000-4000-8000-000000000001', 'd2000101-0000-4000-8000-000000000001', 'e0000101-0000-4000-8000-000000000001', 'owner', 'active'),
  ('ae02-0002-0000-4000-8000-000000000002', 'd2000101-0000-4000-8000-000000000002', 'e0000101-0000-4000-8000-000000000002', 'owner', 'active');

-- Grant property_matching entitlement
INSERT INTO public.feature_entitlements (user_id, feature, status, granted_by)
VALUES ('e0000101-0000-4000-8000-000000000001', 'property_matching', 'active', 'e0000101-0000-4000-8000-000000000001');

-- Test clients (workspace A)
INSERT INTO public.clients (id, workspace_id, created_by, name) VALUES
  ('c2000101-0000-4000-8000-000000000001', 'd2000101-0000-4000-8000-000000000001', 'e0000101-0000-4000-8000-000000000001', 'Client-A');

-- Test properties (workspace A)
INSERT INTO public.properties (id, workspace_id, created_by, title, city, status) VALUES
  ('b2000101-0000-4000-8000-000000000001', 'd2000101-0000-4000-8000-000000000001', 'e0000101-0000-4000-8000-000000000001', 'Property-A', 'Guangzhou', 'available');

SELECT plan(15);

-- ============================================================================
-- 1. Anon cannot read property_matches
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT results_eq(
  $$SELECT count(*)::integer FROM public.property_matches$$,
  $$SELECT 0::integer$$,
  '1. Anon cannot read property_matches'
);

-- ============================================================================
-- 2. Authenticated user creates match via upsert
SELECT set_config('request.jwt.claim.sub', 'e0000101-0000-4000-8000-000000000001', true);
SELECT lives_ok(
  $$SELECT public.upsert_property_match(
    'c2000101-0000-4000-8000-000000000001',
    'b2000101-0000-4000-8000-000000000001',
    85, 'excellent',
    '[{"code":"budget","label":"预算匹配","scoreContribution":30,"detail":"测试"}]'::jsonb,
    '[]'::jsonb, '[]'::jsonb, 'active'
  )$$,
  '2. upsert_property_match succeeds'
);

-- 3. Match created (exactly 1)
SELECT results_eq(
  $$SELECT count(*)::integer FROM public.property_matches
    WHERE client_id = 'c2000101-0000-4000-8000-000000000001'$$,
  $$SELECT 1::integer$$,
  '3. upsert creates exactly 1 match'
);

-- 4. Unique constraint: re-upsert does not duplicate
SELECT lives_ok(
  $$SELECT public.upsert_property_match(
    'c2000101-0000-4000-8000-000000000001',
    'b2000101-0000-4000-8000-000000000001',
    90, 'excellent',
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'active'
  )$$,
  '4. Re-upsert succeeds (no duplicate)'
);

SELECT results_eq(
  $$SELECT count(*)::integer FROM public.property_matches
    WHERE client_id = 'c2000101-0000-4000-8000-000000000001'$$,
  $$SELECT 1::integer$$,
  '4b. Still exactly 1 match after re-upsert'
);

-- 5. Score updated on re-upsert
SELECT results_eq(
  $$SELECT score::integer FROM public.property_matches
    WHERE client_id = 'c2000101-0000-4000-8000-000000000001' LIMIT 1$$,
  $$SELECT 90::integer$$,
  '5. Score updated on re-upsert'
);

-- 6. Re-calc resets dismissed to active
SELECT public.update_match_status(
  (SELECT id FROM public.property_matches WHERE client_id = 'c2000101-0000-4000-8000-000000000001' LIMIT 1),
  'dismissed'
);
SELECT public.upsert_property_match(
  'c2000101-0000-4000-8000-000000000001',
  'b2000101-0000-4000-8000-000000000001',
  95, 'excellent',
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'active'
);
SELECT results_eq(
  $$SELECT status::text FROM public.property_matches
    WHERE client_id = 'c2000101-0000-4000-8000-000000000001' LIMIT 1$$,
  $$SELECT 'active'::text$$,
  '6. Re-calc resets dismissed to active'
);

-- ============================================================================
-- 7. Cross-workspace access blocked (other user tries workspace A's client)
SELECT set_config('request.jwt.claim.sub', 'e0000101-0000-4000-8000-000000000002', true);
SELECT throws_ok(
  $$SELECT public.upsert_property_match(
    'c2000101-0000-4000-8000-000000000001',
    'b2000101-0000-4000-8000-000000000001',
    50, 'fair', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
  )$$,
  '42501'
);

-- 8. Anon blocked from upsert_property_match
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT throws_ok(
  $$SELECT public.upsert_property_match(
    'c2000101-0000-4000-8000-000000000001',
    'b2000101-0000-4000-8000-000000000001',
    50, 'fair', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
  )$$,
  'UA001'
);

-- 9. State transitions (back to owner)
SELECT set_config('request.jwt.claim.sub', 'e0000101-0000-4000-8000-000000000001', true);

-- active → dismissed
SELECT lives_ok(
  $$SELECT public.update_match_status(
    (SELECT id FROM public.property_matches WHERE client_id = 'c2000101-0000-4000-8000-000000000001' LIMIT 1),
    'dismissed'
  )$$,
  '9. active → dismissed succeeds'
);

-- dismissed → archived
SELECT lives_ok(
  $$SELECT public.update_match_status(
    (SELECT id FROM public.property_matches WHERE client_id = 'c2000101-0000-4000-8000-000000000001' LIMIT 1),
    'archived'
  )$$,
  '9b. dismissed → archived succeeds'
);

-- archived → dismissed BLOCKED
SELECT throws_ok(
  $$SELECT public.update_match_status(
    (SELECT id FROM public.property_matches WHERE client_id = 'c2000101-0000-4000-8000-000000000001' LIMIT 1),
    'dismissed'
  )$$,
  'ST001'
);

-- ============================================================================
-- 10. Audit log written on dismiss
-- Create new match for audit test
SELECT public.upsert_property_match(
  'c2000101-0000-4000-8000-000000000001',
  'b2000101-0000-4000-8000-000000000001',
  80, 'good',
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'active'
);
SELECT public.update_match_status(
  (SELECT id FROM public.property_matches WHERE client_id = 'c2000101-0000-4000-8000-000000000001' LIMIT 1),
  'dismissed'
);
SELECT ok(
  (SELECT count(*) >= 1 FROM public.audit_logs
    WHERE entity_type = 'property_match'
      AND action = 'match_dismissed'
      AND workspace_id = 'd2000101-0000-4000-8000-000000000001'),
  '10. Dismissal writes audit log in current workspace'
);

-- ============================================================================
-- 11-12. get_client_matches / get_property_matches
SELECT set_config('request.jwt.claim.sub', 'e0000101-0000-4000-8000-000000000001', true);
SELECT lives_ok(
  $$SELECT * FROM public.get_client_matches('c2000101-0000-4000-8000-000000000001')$$,
  '11. get_client_matches returns results'
);

SELECT lives_ok(
  $$SELECT * FROM public.get_property_matches('b2000101-0000-4000-8000-000000000001')$$,
  '12. get_property_matches returns results'
);

SELECT * FROM finish();
ROLLBACK;
