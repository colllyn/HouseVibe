-- =============================================================================
-- 12_atomic_rpc_and_audit_test.sql — Atomic RPC v2 Tests
-- Tests: search_path, workspace_id validation, multi-workspace, atomicity, audit.
-- =============================================================================

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

-- Setup: User A in Workspace X, User A also in Workspace Z (multi-workspace)
SELECT pg_temp.insert_auth_user('d0d0d0d0-1111-4000-8000-000000000001', 'u1@test');
SELECT pg_temp.insert_auth_user('d0d0d0d0-1111-4000-8000-000000000002', 'u2@test');
SELECT pg_temp.insert_auth_user('d0d0d0d0-1111-4000-8000-000000000003', 'u3@test');

-- Workspace X (User A owner, User B member)
INSERT INTO public.workspaces (id, name, owner_user_id, city, business_type)
VALUES ('f1000001-0000-4000-8000-000000000001', 'WS-X', 'd0d0d0d0-1111-4000-8000-000000000001', 'Beijing', 'residential_lease');
INSERT INTO public.workspace_members (id, workspace_id, user_id, role, status) VALUES
  ('8c01-0001-0000-4000-8000-000000000001', 'f1000001-0000-4000-8000-000000000001', 'd0d0d0d0-1111-4000-8000-000000000001', 'owner', 'active'),
  ('8c01-0002-0000-4000-8000-000000000002', 'f1000001-0000-4000-8000-000000000001', 'd0d0d0d0-1111-4000-8000-000000000002', 'member', 'active');

-- Workspace Z (User A also a member here — multi-workspace user)
INSERT INTO public.workspaces (id, name, owner_user_id, city, business_type)
VALUES ('f1000002-0000-4000-8000-000000000002', 'WS-Z', 'd0d0d0d0-1111-4000-8000-000000000003', 'Shanghai', 'residential_lease');
INSERT INTO public.workspace_members (id, workspace_id, user_id, role, status) VALUES
  ('8c01-0003-0000-4000-8000-000000000003', 'f1000002-0000-4000-8000-000000000002', 'd0d0d0d0-1111-4000-8000-000000000003', 'owner', 'active'),
  ('8c01-0004-0000-4000-8000-000000000004', 'f1000002-0000-4000-8000-000000000002', 'd0d0d0d0-1111-4000-8000-000000000001', 'member', 'active');

SELECT plan(22);

-- =============================================================================
-- 1-4: Basic success (User A in WS-X)
-- =============================================================================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd0d0d0d0-1111-4000-8000-000000000001', true);

-- Test 1: Create in WS-X succeeds
SELECT lives_ok(
  $$SELECT public.create_property_with_private_details(
    'f1000001-0000-4000-8000-000000000001',
    'Atomic V2', 'Beijing', 'whole_unit',
    p_bedrooms := 2, p_owner_name := 'Owner X'
  )$$,
  '1. RPC: create in WS-X succeeds'
);

-- Test 2: Property exists in WS-X
RESET ROLE; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd0d0d0d0-1111-4000-8000-000000000001', true);
SELECT is(
  (SELECT count(*)::int FROM public.properties WHERE title = 'Atomic V2' AND workspace_id = 'f1000001-0000-4000-8000-000000000001' AND deleted_at IS NULL),
  1, '2. RPC: property in WS-X'
);

-- Test 3: Private details created
SELECT is(
  (SELECT count(*)::int FROM public.property_private_details WHERE owner_name = 'Owner X'),
  1, '3. RPC: private details in WS-X'
);

-- Test 4: Audit log written (check as postgres)
RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM public.audit_logs WHERE action = 'property_created' AND after_data->>'title' = 'Atomic V2'),
  1, '4. RPC: audit log for WS-X'
);

-- =============================================================================
-- 5-8: Multi-workspace — User A creates in WS-Z
-- =============================================================================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd0d0d0d0-1111-4000-8000-000000000001', true);

-- Test 5: Create in WS-Z succeeds (User A is member of WS-Z)
SELECT lives_ok(
  $$SELECT public.create_property_with_private_details(
    'f1000002-0000-4000-8000-000000000002',
    'Multi WS Property', 'Shanghai', 'shared',
    p_owner_name := 'Multi Owner'
  )$$,
  '5. RPC: multi-ws user creates in WS-Z'
);

-- Test 6: Property is in WS-Z, not WS-X
RESET ROLE; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd0d0d0d0-1111-4000-8000-000000000001', true);
SELECT is(
  (SELECT count(*)::int FROM public.properties WHERE title = 'Multi WS Property' AND workspace_id = 'f1000002-0000-4000-8000-000000000002'),
  1, '6. RPC: property correctly in WS-Z'
);

-- Test 7: Property NOT in WS-X
SELECT is(
  (SELECT count(*)::int FROM public.properties WHERE title = 'Multi WS Property' AND workspace_id = 'f1000001-0000-4000-8000-000000000001'),
  0, '7. RPC: property NOT leaked to WS-X'
);

-- Test 8: Audit in WS-Z
RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM public.audit_logs WHERE after_data->>'title' = 'Multi WS Property'),
  1, '8. RPC: audit for WS-Z'
);

-- =============================================================================
-- 9-12: Security — workspace_id validation
-- =============================================================================

-- Test 9: Create in workspace where caller is NOT a member (User B tries WS-Z)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd0d0d0d0-1111-4000-8000-000000000002', true);
SELECT throws_ok(
  $$SELECT public.create_property_with_private_details(
    'f1000002-0000-4000-8000-000000000002', 'Hack WS', 'City'
  )$$,
  '42501', NULL,
  '9. RPC: non-member of target workspace rejected'
);

-- Test 10: Fake/non-existent workspace ID rejected
SELECT throws_ok(
  $$SELECT public.create_property_with_private_details(
    '00000000-0000-0000-0000-000000000099', 'Fake WS', 'City'
  )$$,
  '42501', NULL,
  '10. RPC: fake workspace_id rejected'
);

-- Test 11: Anon rejected
RESET ROLE; SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT public.create_property_with_private_details(
    'f1000001-0000-4000-8000-000000000001', 'Anon', 'City'
  )$$,
  '42501', NULL,
  '11. RPC: anon rejected'
);

-- Test 12: RPC returns valid UUID on success
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd0d0d0d0-1111-4000-8000-000000000001', true);
SELECT ok(
  (SELECT public.create_property_with_private_details(
    'f1000001-0000-4000-8000-000000000001', 'Return Test', 'City'
  ) IS NOT NULL),
  '12. RPC: returns non-null UUID'
);

-- =============================================================================
-- 13-16: Atomicity — failure rolls back everything
-- =============================================================================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd0d0d0d0-1111-4000-8000-000000000001', true);

-- Test 13: Null title causes full rollback (no property, no ppd, no audit)
SELECT throws_ok(
  $$SELECT public.create_property_with_private_details(
    'f1000001-0000-4000-8000-000000000001', null, 'City'
  )$$,
  '23502', NULL,
  '13. RPC: null title rejected, all rolled back'
);

-- Test 14: No property left behind from failed attempt
RESET ROLE; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd0d0d0d0-1111-4000-8000-000000000001', true);
SELECT is(
  (SELECT count(*)::int FROM public.properties WHERE title IS NULL),
  0, '14. atomicity: no null-title property exists'
);

-- Test 15: Audit entries all have non-null titles (no orphaned audit from failed creates)
RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM public.audit_logs WHERE action = 'property_created' AND (after_data->>'title') IS NULL),
  0, '15. atomicity: all audit entries have titles'
);

-- Test 16: No private details from failed attempt
RESET ROLE; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd0d0d0d0-1111-4000-8000-000000000001', true);
SELECT is(
  (SELECT count(*)::int FROM public.property_private_details WHERE owner_name IS NULL AND internal_notes IS NULL),
  0, '16. atomicity: no orphaned ppd rows'
);

-- =============================================================================
-- 17-20: Security properties
-- =============================================================================

-- Test 17: RPC is SECURITY DEFINER
RESET ROLE;
SELECT ok(
  (SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'create_property_with_private_details'),
  '17. security: SECURITY DEFINER'
);

-- Test 18: search_path is set (non-null proconfig)
SELECT ok(
  (SELECT proconfig IS NOT NULL FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'create_property_with_private_details'),
  '18. security: fixed search_path'
);

-- Test 19: Anon has no execute
SELECT ok(
  (SELECT count(*) = 0 FROM information_schema.role_routine_grants
    WHERE grantee = 'anon' AND routine_name = 'create_property_with_private_details'),
  '19. security: anon has no execute'
);

-- Test 20: Authenticated has execute
SELECT ok(
  (SELECT count(*) = 1 FROM information_schema.role_routine_grants
    WHERE grantee = 'authenticated' AND routine_name = 'create_property_with_private_details' AND privilege_type = 'EXECUTE'),
  '20. security: authenticated has execute'
);

-- =============================================================================
-- 21-22: End-to-end verification
-- =============================================================================

-- Test 21: Create without private details (only property + audit)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd0d0d0d0-1111-4000-8000-000000000001', true);
SELECT lives_ok(
  $$SELECT public.create_property_with_private_details(
    'f1000001-0000-4000-8000-000000000001', 'No PPD', 'City'
  )$$,
  '21. RPC: create without private details succeeds'
);

-- Test 22: Verify no ppd row when no sensitive fields
SELECT is(
  (SELECT count(*)::int FROM public.property_private_details
    WHERE property_id IN (SELECT id FROM public.properties WHERE title = 'No PPD')),
  0, '22. RPC: no ppd row when no sensitive fields'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
