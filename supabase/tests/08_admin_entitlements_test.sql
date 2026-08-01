-- =============================================================================
-- 08_admin_entitlements_test.sql -- Admin System & Feature Entitlement Tests
-- Phase 1-C: system_admins, feature_entitlements, authorization helpers, RPCs.
--
-- Tests is_system_admin, require_system_admin, has_feature, require_feature,
-- has_workspace_feature, list/grant/revoke RPCs, and RLS on both tables.
--
-- Test UUIDs:
--   User A: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa (system admin)
--   User B: bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb (normal user)
--   User C: cccccccc-cccc-cccc-cccc-cccccccccccc (target for grant/revoke ops)
--   Workspace X: 8cae1001-0000-4000-8000-000000000001 (owned by User A)
-- =============================================================================

BEGIN;

SET LOCAL search_path TO public, extensions;

-- =============================================================================
-- Helper: insert auth user for testing
-- =============================================================================
CREATE OR REPLACE FUNCTION pg_temp.insert_auth_user(
  p_id uuid,
  p_email text,
  p_full_name text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'auth, pg_catalog'
AS $$
DECLARE
  v_meta jsonb := '{}'::jsonb;
BEGIN
  IF p_full_name IS NOT NULL THEN
    v_meta := jsonb_build_object('full_name', p_full_name);
  END IF;
  INSERT INTO auth.users (
    id, email, raw_user_meta_data, raw_app_meta_data,
    aud, role, encrypted_password, created_at, updated_at
  )
  VALUES (
    p_id, p_email, v_meta, '{}'::jsonb,
    'authenticated', 'authenticated', '', now(), now()
  );
END;
$$;

-- =============================================================================
-- Helper: direct grant of feature entitlement (bypasses RPC, uses postgres role)
-- Use this for test setup only, not for testing the RPC itself.
-- =============================================================================
CREATE OR REPLACE FUNCTION pg_temp.direct_grant_feature(
  p_id uuid,
  p_user_id uuid,
  p_feature public.feature_key,
  p_status public.entitlement_status DEFAULT 'active',
  p_expires_at timestamptz DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SET search_path = 'public, extensions'
AS $$
BEGIN
  INSERT INTO public.feature_entitlements (id, user_id, feature, status, granted_by, granted_at, expires_at)
  VALUES (p_id, p_user_id, p_feature, p_status,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), p_expires_at)
  ON CONFLICT (user_id, feature) DO UPDATE
    SET status = p_status, granted_at = now(), expires_at = p_expires_at,
        revoked_at = NULL, revoked_by = NULL, reason = NULL, updated_at = now();
END;
$$;

-- =============================================================================
-- Setup: Create test users, workspace, and initial admin
-- =============================================================================

-- User A: system admin
SELECT pg_temp.insert_auth_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin-a@example.invalid', 'Admin A');
-- User B: normal user
SELECT pg_temp.insert_auth_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'normal-b@example.invalid', 'Normal B');
-- User C: target user for grant/revoke operations
SELECT pg_temp.insert_auth_user('cccccccc-cccc-cccc-cccc-cccccccccccc', 'target-c@example.invalid', 'Target C');

-- Create Workspace X with User A as owner
INSERT INTO public.workspaces (id, name, owner_user_id, city, business_type)
VALUES ('8cae1001-0000-4000-8000-000000000001', 'Workspace X',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Beijing', 'residential_lease');

-- User A is owner of Workspace X
INSERT INTO public.workspace_members (id, workspace_id, user_id, role, status)
VALUES ('8cae1002-0000-4000-8000-000000000001', '8cae1001-0000-4000-8000-000000000001',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner', 'active');

-- Make User A a system admin (direct insert — no admin exists yet to call grant RPC)
INSERT INTO public.system_admins (id, user_id, status, created_by)
VALUES ('da000001-0000-4000-8000-000000000001',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'active',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- Grant ai_data_extraction to User B (active, for has_feature tests)
SELECT pg_temp.direct_grant_feature('fe000001-0000-4000-8000-000000000001',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'ai_data_extraction', 'active');

-- Grant semantic_search to User B (active, for require_feature + has_workspace_feature tests)
SELECT pg_temp.direct_grant_feature('fe000002-0000-4000-8000-000000000002',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'semantic_search', 'active');

-- Grant expired property_matching to User B (for expired test)
SELECT pg_temp.direct_grant_feature('fe000003-0000-4000-8000-000000000003',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'property_matching', 'active',
  now() - interval '1 hour');

-- Grant ai_data_extraction to User A (for has_workspace_feature positive test)
SELECT pg_temp.direct_grant_feature('fe000005-0000-4000-8000-000000000005',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ai_data_extraction', 'active');

-- =============================================================================
-- Tests (plan: 44)
-- =============================================================================
SELECT plan(54);

-- =============================================================================
-- TESTS 1-2: is_system_admin()
-- =============================================================================

-- Test 1: Non-admin returns false
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);

SELECT ok(
  NOT private.is_system_admin(),
  '1. is_system_admin: non-admin User B returns false'
);

-- Test 2: Active admin returns true
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);

SELECT ok(
  private.is_system_admin(),
  '2. is_system_admin: active admin User A returns true'
);

-- =============================================================================
-- TESTS 3-4: require_system_admin()
-- =============================================================================

-- Test 3: Non-admin raises 42501
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);

SELECT throws_ok(
  $$SELECT private.require_system_admin()$$,
  '42501',
  NULL,
  '3. require_system_admin: non-admin raises 42501'
);

-- Test 4: Admin succeeds
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);

SELECT lives_ok(
  $$SELECT private.require_system_admin()$$,
  '4. require_system_admin: admin succeeds (no exception)'
);

-- =============================================================================
-- TESTS 5-8: grant_system_admin() RPC
-- =============================================================================

-- Test 5: Non-admin cannot grant
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);

SELECT throws_ok(
  $$SELECT public.grant_system_admin('cccccccc-cccc-cccc-cccc-cccccccccccc')$$,
  '42501',
  NULL,
  '5. grant_system_admin: non-admin cannot grant (42501)'
);

-- Test 6: Admin can grant to another user
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);

SELECT lives_ok(
  $$SELECT public.grant_system_admin('cccccccc-cccc-cccc-cccc-cccccccccccc')$$,
  '6. grant_system_admin: admin A grants to User C'
);

-- Test 7: Cannot self-grant
SELECT throws_ok(
  $$SELECT public.grant_system_admin('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,
  '42501',
  NULL,
  '7. grant_system_admin: cannot self-grant (42501)'
);

-- Test 8: Grant creates audit log entry
RESET ROLE;
SELECT is(
  (SELECT count(*)::int
   FROM public.audit_logs
   WHERE entity_type = 'system_admin'
     AND action = 'system_admin_granted'
     AND after_data->>'user_id' = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  1,
  '8. grant_system_admin: audit log entry created for User C grant'
);

-- =============================================================================
-- TESTS 9-12: revoke_system_admin() RPC
-- =============================================================================

-- Test 9: Non-admin cannot revoke
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);

SELECT throws_ok(
  $$SELECT public.revoke_system_admin('cccccccc-cccc-cccc-cccc-cccccccccccc')$$,
  '42501',
  NULL,
  '9. revoke_system_admin: non-admin cannot revoke (42501)'
);

-- Test 10: Admin can revoke
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);

SELECT lives_ok(
  $$SELECT public.revoke_system_admin('cccccccc-cccc-cccc-cccc-cccccccccccc')$$,
  '10. revoke_system_admin: admin A revokes User C'
);

-- Test 11: Revoked admin returns false
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'cccccccc-cccc-cccc-cccc-cccccccccccc', true);

SELECT ok(
  NOT private.is_system_admin(),
  '11. is_system_admin: revoked admin User C returns false'
);

-- Test 12: Revoke creates audit log entry
RESET ROLE;
SELECT is(
  (SELECT count(*)::int
   FROM public.audit_logs
   WHERE entity_type = 'system_admin'
     AND action = 'system_admin_revoked'
     AND after_data->>'user_id' = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  1,
  '12. revoke_system_admin: audit log entry created for User C revoke'
);

-- =============================================================================
-- TEST 13: Reactivate revoked system admin (upsert)
-- =============================================================================

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);

SELECT lives_ok(
  $$SELECT public.grant_system_admin('cccccccc-cccc-cccc-cccc-cccccccccccc')$$,
  '13. grant_system_admin: reactivating revoked admin works (upsert)'
);

-- =============================================================================
-- TESTS 14-18: has_feature()
-- =============================================================================

-- Test 14: User with active entitlement returns true
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);

SELECT ok(
  private.has_feature('ai_data_extraction'::public.feature_key),
  '14. has_feature: user with active entitlement returns true'
);

-- Test 15: User with no entitlement returns false (User C has no semantic_search)
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'cccccccc-cccc-cccc-cccc-cccccccccccc', true);

SELECT ok(
  NOT private.has_feature('semantic_search'::public.feature_key),
  '15. has_feature: user with no entitlement returns false'
);

-- Test 16: User with disabled entitlement returns false
-- Disable User B's ai_data_extraction via direct update
RESET ROLE;
UPDATE public.feature_entitlements
SET status = 'disabled', updated_at = now()
WHERE user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  AND feature = 'ai_data_extraction';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);

SELECT ok(
  NOT private.has_feature('ai_data_extraction'::public.feature_key),
  '16. has_feature: disabled entitlement returns false'
);

-- Test 17: User with revoked entitlement returns false
-- Reactivate then revoke via RPC
RESET ROLE;
UPDATE public.feature_entitlements
SET status = 'active', updated_at = now()
WHERE user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  AND feature = 'ai_data_extraction';

-- Revoke as admin via RPC
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);

SELECT public.revoke_feature_entitlement(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'ai_data_extraction', 'test revoke for has_feature');

-- Check as User B
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);

SELECT ok(
  NOT private.has_feature('ai_data_extraction'::public.feature_key),
  '17. has_feature: revoked entitlement returns false'
);

-- Test 18: User with expired entitlement returns false
SELECT ok(
  NOT private.has_feature('property_matching'::public.feature_key),
  '18. has_feature: expired entitlement returns false'
);

-- =============================================================================
-- TESTS 19-20: require_feature()
-- =============================================================================

-- Test 19: User without feature raises 42501 (User B no content_factory)
SELECT throws_ok(
  $$SELECT private.require_feature('content_factory'::public.feature_key)$$,
  '42501',
  NULL,
  '19. require_feature: user without feature raises 42501'
);

-- Test 20: User with active feature succeeds (User B has semantic_search)
SELECT lives_ok(
  $$SELECT private.require_feature('semantic_search'::public.feature_key)$$,
  '20. require_feature: user with active feature succeeds'
);

-- =============================================================================
-- TESTS 21-23: list_user_entitlements() RPC
-- =============================================================================

-- Test 21: Admin can list any user's entitlements
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);

SELECT lives_ok(
  $$SELECT public.list_user_entitlements('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')$$,
  '21. list_user_entitlements: admin can list User B entitlements'
);

-- Test 22: User can list their own entitlements
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);

SELECT lives_ok(
  $$SELECT public.list_user_entitlements('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')$$,
  '22. list_user_entitlements: user can list own entitlements'
);

-- Test 23: User cannot list another user's entitlements
SELECT throws_ok(
  $$SELECT public.list_user_entitlements('cccccccc-cccc-cccc-cccc-cccccccccccc')$$,
  '42501',
  NULL,
  '23. list_user_entitlements: non-admin cannot list other user (42501)'
);

-- =============================================================================
-- TESTS 24-29: grant_feature_entitlement() RPC
-- =============================================================================

-- Test 24: Admin grants feature → active
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);

SELECT lives_ok(
  $$SELECT public.grant_feature_entitlement(
    'cccccccc-cccc-cccc-cccc-cccccccccccc', 'content_factory')$$,
  '24. grant_feature_entitlement: admin grants content_factory to User C'
);

-- Test 25: Non-admin cannot grant
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);

SELECT throws_ok(
  $$SELECT public.grant_feature_entitlement(
    'cccccccc-cccc-cccc-cccc-cccccccccccc', 'ai_data_extraction')$$,
  '42501',
  NULL,
  '25. grant_feature_entitlement: non-admin cannot grant (42501)'
);

-- Test 26: content_factory not granted by default (User B has no content_factory)
SELECT ok(
  NOT private.has_feature('content_factory'::public.feature_key),
  '26. has_feature: content_factory not granted by default (User B)'
);

-- Test 27: Grant with expiry date works
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);

SELECT lives_ok(
  $$SELECT public.grant_feature_entitlement(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'shared_property_pool', now() + interval '30 days')$$,
  '27. grant_feature_entitlement: grant with expiry date works'
);

-- Test 28: Re-grant reactivates revoked entitlement (upsert via ON CONFLICT)
-- First revoke User C's content_factory
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);

SELECT public.revoke_feature_entitlement(
  'cccccccc-cccc-cccc-cccc-cccccccccccc', 'content_factory', 'test revoke before re-grant');

-- Re-grant (should reactivate via upsert)
SELECT lives_ok(
  $$SELECT public.grant_feature_entitlement(
    'cccccccc-cccc-cccc-cccc-cccccccccccc', 'content_factory')$$,
  '28. grant_feature_entitlement: re-grant reactivates revoked (upsert)'
);

-- Test 29: Grant creates audit log entry (via trigger)
-- After all the grants above, there should be audit log entries for feature_entitlement
RESET ROLE;
SELECT ok(
  (SELECT count(*)::int > 0
   FROM public.audit_logs
   WHERE entity_type = 'feature_entitlement'
     AND action = 'feature_entitlement_granted'),
  '29. grant_feature_entitlement: audit log entry exists for granted entitlement'
);

-- =============================================================================
-- TESTS 30-34: revoke_feature_entitlement() RPC
-- =============================================================================

-- Test 30: Admin revokes → status = revoked
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);

SELECT lives_ok(
  $$SELECT public.revoke_feature_entitlement(
    'cccccccc-cccc-cccc-cccc-cccccccccccc', 'content_factory', 'testing revoke')$$,
  '30. revoke_feature_entitlement: admin revokes content_factory from User C'
);

-- Test 31: Revoke immediately takes effect (has_feature returns false)
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'cccccccc-cccc-cccc-cccc-cccccccccccc', true);

SELECT ok(
  NOT private.has_feature('content_factory'::public.feature_key),
  '31. revoke_feature_entitlement: revoke immediately takes effect (has_feature=false)'
);

-- Test 32: Revoke creates audit log entry (via trigger)
RESET ROLE;
SELECT ok(
  (SELECT count(*)::int > 0
   FROM public.audit_logs
   WHERE entity_type = 'feature_entitlement'
     AND action = 'feature_entitlement_revoked'),
  '32. revoke_feature_entitlement: audit log entry exists for revoked entitlement'
);

-- Test 33: Cannot revoke already-revoked entitlement (error FE001)
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);

SELECT throws_ok(
  $$SELECT public.revoke_feature_entitlement(
    'cccccccc-cccc-cccc-cccc-cccccccccccc', 'content_factory', 'double revoke')$$,
  'FE001',
  NULL,
  '33. revoke_feature_entitlement: cannot revoke already-revoked (FE001)'
);

-- =============================================================================
-- TESTS 34-35: has_workspace_feature()
-- =============================================================================

-- Test 34: Workspace owner with active feature returns true
-- User A owns Workspace X and has ai_data_extraction active
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);

SELECT ok(
  private.has_workspace_feature(
    '8cae1001-0000-4000-8000-000000000001', 'ai_data_extraction'::public.feature_key),
  '34. has_workspace_feature: owner with active feature returns true'
);

-- Test 35: Workspace owner without feature returns false
-- User A does not have shared_property_pool
SELECT ok(
  NOT private.has_workspace_feature(
    '8cae1001-0000-4000-8000-000000000001', 'shared_property_pool'::public.feature_key),
  '35. has_workspace_feature: owner without feature returns false'
);

-- =============================================================================
-- TESTS 36-39: RLS — system_admins table
-- =============================================================================

-- Test 36: Authenticated user cannot INSERT into system_admins
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);

SELECT throws_ok(
  $$INSERT INTO public.system_admins (user_id, status)
    VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'active')$$,
  '42501',
  NULL,
  '36. RLS system_admins: authenticated user cannot INSERT'
);

-- Test 37: Authenticated user cannot UPDATE system_admins
SELECT throws_ok(
  $$UPDATE public.system_admins SET status = 'revoked'
    WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  '42501',
  NULL,
  '37. RLS system_admins: authenticated user cannot UPDATE'
);

-- Test 38: Authenticated user cannot DELETE from system_admins
SELECT throws_ok(
  $$DELETE FROM public.system_admins
    WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  '42501',
  NULL,
  '38. RLS system_admins: authenticated user cannot DELETE'
);

-- Test 39: System admin can SELECT from system_admins (via policy)
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);

SELECT ok(
  (SELECT count(*)::int > 0 FROM public.system_admins),
  '39. RLS system_admins: admin SELECT returns rows (policy allows)'
);

-- =============================================================================
-- TESTS 40-44: RLS — feature_entitlements table
-- =============================================================================

-- Test 40: User can SELECT own entitlements
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);

SELECT ok(
  (SELECT count(*)::int > 0
   FROM public.feature_entitlements
   WHERE user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  '40. RLS feature_entitlements: user can SELECT own entitlements'
);

-- Test 41: Admin can SELECT all entitlements (including other users')
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);

SELECT ok(
  (SELECT count(*)::int >= 2
   FROM public.feature_entitlements),
  '41. RLS feature_entitlements: admin can SELECT all entitlements'
);

-- Test 42: Non-admin non-owner cannot see another user's entitlements
-- User B (non-admin) trying to see User C's entitlements gets 0 rows (RLS filter)
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);

SELECT is(
  (SELECT count(*)::int
   FROM public.feature_entitlements
   WHERE user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  0,
  '42. RLS feature_entitlements: non-admin sees 0 rows for other user'
);

-- Test 43: Authenticated user cannot INSERT into feature_entitlements
SELECT throws_ok(
  $$INSERT INTO public.feature_entitlements (user_id, feature, granted_by)
    VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'content_factory',
            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')$$,
  '42501',
  NULL,
  '43. RLS feature_entitlements: authenticated user cannot INSERT'
);

-- Test 44: Authenticated user cannot UPDATE feature_entitlements
SELECT throws_ok(
  $$UPDATE public.feature_entitlements SET status = 'disabled'
    WHERE user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      AND feature = 'semantic_search'$$,
  '42501',
  NULL,
  '44. RLS feature_entitlements: authenticated user cannot UPDATE'
);

-- =============================================================================
-- TESTS 45-54: Disable vs Revoke Semantic Tests
-- =============================================================================
-- Tests verify the semantic difference between disable (temporary suspension,
-- revoked_by/revolved_at remain NULL) and revoke (permanent withdrawal,
-- revoked_by/revolved_at are set). Also tests idempotency and permission
-- checks for both operations.

-- ---------------------------------------------------------------------------
-- Setup: grant active entitlements to User C for disable/revoke testing
-- ---------------------------------------------------------------------------

-- Grant shared_property_pool to User C (will be disabled)
-- Use direct_grant for silent setup — does not count as a test assertion.
-- Must RESET ROLE to bypass RLS (direct_grant_feature is not SECURITY DEFINER).
RESET ROLE;
SELECT pg_temp.direct_grant_feature('fe000010-0000-4000-8000-000000000010',
  'cccccccc-cccc-cccc-cccc-cccccccccccc', 'shared_property_pool', 'active');

-- Grant property_matching to User C (will be revoked)
SELECT pg_temp.direct_grant_feature('fe000011-0000-4000-8000-000000000011',
  'cccccccc-cccc-cccc-cccc-cccccccccccc', 'property_matching', 'active');

-- ---------------------------------------------------------------------------
-- Tests 45-47: Disable semantics
-- ---------------------------------------------------------------------------

-- Test 45: Active → Disabled — status='disabled', revoked_by IS NULL, revoked_at IS NULL
-- First disable the shared_property_pool entitlement (must be called as admin)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);

SELECT public.disable_feature_entitlement(
  'cccccccc-cccc-cccc-cccc-cccccccccccc', 'shared_property_pool', 'test disable semantics');

RESET ROLE;
SELECT ok(
  (SELECT status = 'disabled' AND revoked_by IS NULL AND revoked_at IS NULL
   FROM public.feature_entitlements
   WHERE user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
     AND feature = 'shared_property_pool'),
  '45. disable: status=disabled, revoked_by IS NULL, revoked_at IS NULL'
);

-- Test 46: Disabled immediately takes effect — has_feature returns false
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'cccccccc-cccc-cccc-cccc-cccccccccccc', true);

SELECT ok(
  NOT private.has_feature('shared_property_pool'::public.feature_key),
  '46. disable: has_feature returns false for disabled entitlement'
);

-- Test 47: Disabled — require_feature raises exception
SELECT throws_ok(
  $$SELECT private.require_feature('shared_property_pool'::public.feature_key)$$,
  '42501',
  NULL,
  '47. disable: require_feature raises 42501 for disabled entitlement'
);

-- ---------------------------------------------------------------------------
-- Test 48: Revoke semantics
-- ---------------------------------------------------------------------------

-- Revoke property_matching from User C
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);

SELECT public.revoke_feature_entitlement(
  'cccccccc-cccc-cccc-cccc-cccccccccccc', 'property_matching', 'test revoke semantics');

-- Verify: status='revoked', revoked_by IS NOT NULL, revoked_at IS NOT NULL
RESET ROLE;
SELECT ok(
  (SELECT status = 'revoked' AND revoked_by IS NOT NULL AND revoked_at IS NOT NULL
   FROM public.feature_entitlements
   WHERE user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
     AND feature = 'property_matching'),
  '48. revoke: status=revoked, revoked_by IS SET, revoked_at IS SET'
);

-- ---------------------------------------------------------------------------
-- Tests 49-50: Audit action discriminates between disable and revoke
-- ---------------------------------------------------------------------------

-- Test 49: After disable, audit_logs.action = 'feature_entitlement_disabled'
RESET ROLE;
SELECT ok(
  (SELECT count(*)::int > 0
   FROM public.audit_logs
   WHERE entity_type = 'feature_entitlement'
     AND action = 'feature_entitlement_disabled'
     AND after_data->>'feature' = 'shared_property_pool'),
  '49. disable: audit_log action = feature_entitlement_disabled'
);

-- Test 50: After revoke, audit_logs.action = 'feature_entitlement_revoked'
SELECT is(
  (SELECT count(*)::int
   FROM public.audit_logs
   WHERE entity_type = 'feature_entitlement'
     AND action = 'feature_entitlement_revoked'
     AND after_data->>'feature' = 'property_matching'),
  1,
  '50. revoke: audit_log action = feature_entitlement_revoked'
);

-- ---------------------------------------------------------------------------
-- Tests 51-52: Idempotency — disable and revoke
-- ---------------------------------------------------------------------------

-- Test 51: Disabling an already-disabled entitlement returns FE002
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);

SELECT throws_ok(
  $$SELECT public.disable_feature_entitlement(
    'cccccccc-cccc-cccc-cccc-cccccccccccc', 'shared_property_pool', 'double disable')$$,
  'FE002',
  NULL,
  '51. disable: idempotent — double disable returns FE002'
);

-- Test 52: Revoking an already-revoked entitlement returns FE001
-- (property_matching was already revoked in test 48)
SELECT throws_ok(
  $$SELECT public.revoke_feature_entitlement(
    'cccccccc-cccc-cccc-cccc-cccccccccccc', 'property_matching', 'double revoke')$$,
  'FE001',
  NULL,
  '52. revoke: idempotent — double revoke returns FE001'
);

-- ---------------------------------------------------------------------------
-- Tests 53-54: Non-admin permission denied for disable and revoke
-- ---------------------------------------------------------------------------

-- Test 53: Non-admin cannot call disable_feature_entitlement → 42501
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);

SELECT throws_ok(
  $$SELECT public.disable_feature_entitlement(
    'cccccccc-cccc-cccc-cccc-cccccccccccc', 'ai_data_extraction', 'non-admin disable attempt')$$,
  '42501',
  NULL,
  '53. disable: non-admin cannot disable (42501)'
);

-- Test 54: Non-admin cannot call revoke_feature_entitlement → 42501
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);

SELECT throws_ok(
  $$SELECT public.revoke_feature_entitlement(
    'cccccccc-cccc-cccc-cccc-cccccccccccc', 'ai_data_extraction', 'non-admin revoke attempt')$$,
  '42501',
  NULL,
  '54. revoke: non-admin cannot revoke (42501)'
);

-- =============================================================================
-- Cleanup
-- =============================================================================
RESET ROLE;
SELECT * FROM finish();

ROLLBACK;
