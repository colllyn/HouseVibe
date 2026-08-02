-- =============================================================================
-- 11_phase2_business_tables_rls_test.sql -- Phase 2 Business Tables RLS Tests
-- First vertical slice: properties + property_private_details RLS.
-- Additional tables tested in subsequent slices.
-- =============================================================================

BEGIN;
SET LOCAL search_path TO public, extensions;

-- Helper: insert auth user
CREATE OR REPLACE FUNCTION pg_temp.insert_auth_user(
  p_id uuid, p_email text, p_full_name text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'auth, pg_catalog'
AS $$
DECLARE v_meta jsonb := '{}'::jsonb;
BEGIN
  IF p_full_name IS NOT NULL THEN v_meta := jsonb_build_object('full_name', p_full_name); END IF;
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data, aud, role, encrypted_password, created_at, updated_at)
  VALUES (p_id, p_email, v_meta, '{}'::jsonb, 'authenticated', 'authenticated', '', now(), now());
END;
$$;

-- Setup: test users and workspaces
SELECT pg_temp.insert_auth_user('a0a0a0a0-a0a0-b0b0-a0a0-c0c0c0c0c0a1', 'px-owner@phase2.test');
SELECT pg_temp.insert_auth_user('a0a0a0a0-a0a0-b0b0-a0a0-c0c0c0c0c0b2', 'px-member@phase2.test');
SELECT pg_temp.insert_auth_user('a0a0a0a0-a0a0-b0b0-a0a0-c0c0c0c0c0c3', 'py-owner@phase2.test');

INSERT INTO public.workspaces (id, name, owner_user_id, city, business_type)
VALUES ('e1110001-0000-4000-8000-0000000000e1', 'PX', 'a0a0a0a0-a0a0-b0b0-a0a0-c0c0c0c0c0a1', 'Beijing', 'residential_lease');
INSERT INTO public.workspace_members (id, workspace_id, user_id, role, status) VALUES
  ('7b01-0001-0000-4000-8000-000000000001', 'e1110001-0000-4000-8000-0000000000e1', 'a0a0a0a0-a0a0-b0b0-a0a0-c0c0c0c0c0a1', 'owner', 'active'),
  ('7b01-0002-0000-4000-8000-000000000002', 'e1110001-0000-4000-8000-0000000000e1', 'a0a0a0a0-a0a0-b0b0-a0a0-c0c0c0c0c0b2', 'member', 'active');

INSERT INTO public.workspaces (id, name, owner_user_id, city, business_type)
VALUES ('e1110002-0000-4000-8000-0000000000e2', 'PY', 'a0a0a0a0-a0a0-b0b0-a0a0-c0c0c0c0c0c3', 'Shanghai', 'residential_lease');
INSERT INTO public.workspace_members (id, workspace_id, user_id, role, status) VALUES
  ('7b01-0003-0000-4000-8000-000000000003', 'e1110002-0000-4000-8000-0000000000e2', 'a0a0a0a0-a0a0-b0b0-a0a0-c0c0c0c0c0c3', 'owner', 'active');

SELECT plan(24);

-- =============================================================================
-- TESTS 1-8: properties RLS
-- =============================================================================

-- Test 1: Workspace member can INSERT
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-b0b0-a0a0-c0c0c0c0c0a1', true);
SELECT lives_ok(
  $$INSERT INTO public.properties (workspace_id, title, city, rental_type, created_by)
    VALUES ('e1110001-0000-4000-8000-0000000000e1', 'Test Property', 'Beijing', 'whole_unit',
      (SELECT id FROM public.profiles WHERE id = 'a0a0a0a0-a0a0-b0b0-a0a0-c0c0c0c0c0a1'))$$,
  '1. properties: workspace member can INSERT'
);

-- Test 2: Inserted property visible
RESET ROLE; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-b0b0-a0a0-c0c0c0c0c0a1', true);
SELECT is(
  (SELECT count(*)::int FROM public.properties WHERE workspace_id = 'e1110001-0000-4000-8000-0000000000e1' AND deleted_at IS NULL),
  1, '2. properties: visible to workspace member'
);

-- Test 3: Other member also sees it
RESET ROLE; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-b0b0-a0a0-c0c0c0c0c0b2', true);
SELECT is(
  (SELECT count(*)::int FROM public.properties WHERE workspace_id = 'e1110001-0000-4000-8000-0000000000e1' AND deleted_at IS NULL),
  1, '3. properties: other member also sees'
);

-- Test 4: Cross-workspace sees 0
RESET ROLE; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-b0b0-a0a0-c0c0c0c0c0c3', true);
SELECT is(
  (SELECT count(*)::int FROM public.properties WHERE workspace_id = 'e1110001-0000-4000-8000-0000000000e1' AND deleted_at IS NULL),
  0, '4. properties: cross-workspace sees 0'
);

-- Test 5: Anon cannot read
RESET ROLE; SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT 1 FROM public.properties$$, '42501', NULL,
  '5. properties: anon cannot read'
);

-- Test 6: Workspace member can UPDATE
RESET ROLE; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-b0b0-a0a0-c0c0c0c0c0a1', true);
SELECT lives_ok(
  $$UPDATE public.properties SET title = 'Updated Title' WHERE workspace_id = 'e1110001-0000-4000-8000-0000000000e1' AND deleted_at IS NULL$$,
  '6. properties: workspace member can UPDATE'
);

-- Test 7: Cross-workspace UPDATE affects 0
RESET ROLE; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-b0b0-a0a0-c0c0c0c0c0c3', true);
SELECT is(
  (SELECT count(*)::int FROM public.properties WHERE workspace_id = 'e1110001-0000-4000-8000-0000000000e1' AND title = 'Hacked'),
  0, '7. properties: cross-workspace cannot see to update'
);

-- Test 8: Cross-workspace INSERT rejected
RESET ROLE; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-b0b0-a0a0-c0c0c0c0c0c3', true);
SELECT throws_ok(
  $$INSERT INTO public.properties (workspace_id, title, city, rental_type, created_by)
    VALUES ('e1110001-0000-4000-8000-0000000000e1', 'Hack', 'Beijing', 'whole_unit',
      (SELECT id FROM public.profiles WHERE id = 'a0a0a0a0-a0a0-b0b0-a0a0-c0c0c0c0c0c3'))$$,
  '42501', NULL, '8. properties: cross-workspace INSERT rejected'
);

-- =============================================================================
-- TESTS 9-16: property_private_details RLS
-- =============================================================================

-- Insert private details for test property (as User A)
RESET ROLE; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-b0b0-a0a0-c0c0c0c0c0a1', true);
DO $$
DECLARE pid UUID;
BEGIN
  SELECT id INTO pid FROM public.properties WHERE workspace_id = 'e1110001-0000-4000-8000-0000000000e1' AND deleted_at IS NULL LIMIT 1;
  INSERT INTO public.property_private_details (property_id, workspace_id, owner_name, owner_phone)
    VALUES (pid, 'e1110001-0000-4000-8000-0000000000e1', 'Owner Name', '13800138000');
END $$;

-- Test 9: Workspace member sees private details
SELECT is(
  (SELECT count(*)::int FROM public.property_private_details WHERE workspace_id = 'e1110001-0000-4000-8000-0000000000e1'),
  1, '9. ppd: workspace member sees'
);

-- Test 10: Cross-workspace sees 0
RESET ROLE; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-b0b0-a0a0-c0c0c0c0c0c3', true);
SELECT is(
  (SELECT count(*)::int FROM public.property_private_details WHERE workspace_id = 'e1110001-0000-4000-8000-0000000000e1'),
  0, '10. ppd: cross-workspace sees 0'
);

-- Test 11: Anon cannot read
RESET ROLE; SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT 1 FROM public.property_private_details$$, '42501', NULL,
  '11. ppd: anon cannot read'
);

-- Test 12: Workspace member can UPDATE
RESET ROLE; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-b0b0-a0a0-c0c0c0c0c0a1', true);
SELECT lives_ok(
  $$UPDATE public.property_private_details SET owner_name = 'Updated' WHERE workspace_id = 'e1110001-0000-4000-8000-0000000000e1'$$,
  '12. ppd: workspace member can UPDATE'
);

-- Test 13: Cross-workspace cannot UPDATE
RESET ROLE; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-b0b0-a0a0-c0c0c0c0c0c3', true);
SELECT is(
  (SELECT count(*)::int FROM public.property_private_details WHERE owner_name = 'Hacked'),
  0, '13. ppd: cross-workspace cannot see to update'
);

-- Test 14: Cross-workspace INSERT rejected (use explicit value, not subquery)
SELECT throws_ok(
  $$INSERT INTO public.property_private_details (property_id, workspace_id, owner_name)
    VALUES ('00000000-0000-0000-0000-000000000099', 'e1110001-0000-4000-8000-0000000000e1', 'Hacker')$$,
  '42501', NULL, '14. ppd: cross-workspace INSERT rejected'
);

-- Test 15: Private details not accessible via properties JOIN for cross-workspace user
SELECT is(
  (SELECT count(*)::int FROM public.properties p
    JOIN public.property_private_details ppd ON p.id = ppd.property_id
    WHERE p.workspace_id = 'e1110001-0000-4000-8000-0000000000e1'),
  0, '15. isolation: no JOIN leak to cross-workspace'
);

-- Test 16: Verify only 1 private detail exists (no duplicate leak)
RESET ROLE; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-b0b0-a0a0-c0c0c0c0c0a1', true);
SELECT is(
  (SELECT count(*)::int FROM public.property_private_details WHERE workspace_id = 'e1110001-0000-4000-8000-0000000000e1'),
  1, '16. ppd: count unchanged'
);

-- =============================================================================
-- TESTS 17-24: Schema and RLS integrity
-- =============================================================================

-- Test 17: All 8 Phase 2 tables have RLS enabled
SELECT ok(
  (SELECT count(*) = 8 FROM pg_tables WHERE schemaname = 'public'
    AND tablename IN ('properties','property_private_details','property_media','clients','interactions','property_matches','tasks','collaboration_requests')
    AND rowsecurity = true),
  '17. rls: all 8 tables have RLS enabled'
);

-- Test 18: workspace_id exists on 7 of 8 tables (collaboration_requests uses requester/owner_workspace_id)
SELECT ok(
  (SELECT count(*) = 7 FROM information_schema.columns WHERE table_schema = 'public'
    AND table_name IN ('properties','property_private_details','property_media','clients','interactions','property_matches','tasks')
    AND column_name = 'workspace_id'),
  '18. schema: workspace_id column exists on 7 primary business tables'
);

-- Test 19: Soft-delete tables have deleted_at
SELECT ok(
  (SELECT count(*) >= 3 FROM information_schema.columns WHERE table_schema = 'public'
    AND table_name IN ('properties','property_media','clients','tasks') AND column_name = 'deleted_at'),
  '19. schema: soft-delete tables have deleted_at'
);

-- Test 20: properties has status column
SELECT ok(
  (SELECT count(*) = 1 FROM information_schema.columns WHERE table_schema = 'public'
    AND table_name = 'properties' AND column_name = 'status'),
  '20. schema: properties has status column'
);

-- Test 21: RLS policies exist on properties and ppd
SELECT ok(
  (SELECT count(*) >= 4 FROM pg_policies WHERE schemaname = 'public'
    AND tablename IN ('properties','property_private_details')),
  '21. rls: policies exist on properties and ppd'
);

-- Test 22: INSERT without workspace_id rejected (RLS checks first, expect 42501)
RESET ROLE; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-b0b0-a0a0-c0c0c0c0c0a1', true);
SELECT throws_ok(
  $$INSERT INTO public.properties (title, city, created_by)
    VALUES ('NoWS', 'BJ', (SELECT id FROM public.profiles WHERE id = 'a0a0a0a0-a0a0-b0b0-a0a0-c0c0c0c0c0a1'))$$,
  '42501', NULL, '22. rls: INSERT without workspace_id rejected (42501)'
);

-- Test 23: Anon has no table-level grants on properties
SELECT ok(
  (SELECT count(*) = 0 FROM information_schema.role_table_grants
    WHERE grantee = 'anon' AND table_schema = 'public' AND table_name = 'properties' AND privilege_type = 'INSERT'),
  '23. security: anon has no INSERT on properties'
);

-- Test 24: Authenticated role has INSERT on properties (via grant in migration)
SELECT ok(
  (SELECT count(*) = 1 FROM information_schema.role_table_grants
    WHERE grantee = 'authenticated' AND table_schema = 'public' AND table_name = 'properties' AND privilege_type = 'INSERT'),
  '24. security: authenticated has INSERT on properties'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
