-- =============================================================================
-- 06_helper_security_test.sql -- Helper Security Tests
-- Verifies private helper functions are secure and correctly restricted.
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

-- Create test user with workspace
SELECT pg_temp.insert_auth_user('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'user-a@example.invalid', 'User A');

INSERT INTO public.workspaces (id, name, owner_user_id, city, business_type)
VALUES ('a1111111-a111-a111-a111-a111111111a1', 'Helper Test WS',
  'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'Beijing', 'residential_lease');

INSERT INTO public.workspace_members (id, workspace_id, user_id, role, status)
VALUES ('8c5e0001-0000-4000-8000-000000000001', 'a1111111-a111-a111-a111-a111111111a1',
  'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'owner', 'active');

SELECT plan(12);

-- =============================================================================
-- Test 1: anon role cannot execute private.is_workspace_member
-- =============================================================================
SET LOCAL ROLE anon;

SELECT throws_ok(
  $$SELECT private.is_workspace_member('a1111111-a111-a111-a111-a111111111a1'::uuid)$$,
  '42501',
  NULL,
  'anon cannot execute private.is_workspace_member'
);

-- =============================================================================
-- Test 2: anon role cannot execute private.is_workspace_owner
-- =============================================================================
SELECT throws_ok(
  $$SELECT private.is_workspace_owner('a1111111-a111-a111-a111-a111111111a1'::uuid)$$,
  '42501',
  NULL,
  'anon cannot execute private.is_workspace_owner'
);

-- =============================================================================
-- Test 3: anon role cannot execute private.is_system_admin
-- =============================================================================
SELECT throws_ok(
  $$SELECT private.is_system_admin()$$,
  '42501',
  NULL,
  'anon cannot execute private.is_system_admin'
);

-- =============================================================================
-- Test 4: authenticated can execute is_workspace_member
-- =============================================================================
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', true);

SELECT lives_ok(
  $$SELECT private.is_workspace_member('a1111111-a111-a111-a111-a111111111a1'::uuid)$$,
  'authenticated can execute is_workspace_member'
);

-- =============================================================================
-- Test 5: is_workspace_member returns true for active member
-- =============================================================================
SELECT ok(
  private.is_workspace_member('a1111111-a111-a111-a111-a111111111a1'::uuid),
  'is_workspace_member returns true for active owner'
);

-- =============================================================================
-- Test 6: is_workspace_member returns false for non-existent workspace
-- =============================================================================
SELECT ok(
  NOT private.is_workspace_member('ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid),
  'is_workspace_member returns false for non-existent workspace'
);

-- =============================================================================
-- Test 7: authenticated can execute is_workspace_owner
-- =============================================================================
SELECT lives_ok(
  $$SELECT private.is_workspace_owner('a1111111-a111-a111-a111-a111111111a1'::uuid)$$,
  'authenticated can execute is_workspace_owner'
);

-- =============================================================================
-- Test 8: is_workspace_owner returns true for actual owner
-- =============================================================================
SELECT ok(
  private.is_workspace_owner('a1111111-a111-a111-a111-a111111111a1'::uuid),
  'is_workspace_owner returns true for workspace owner'
);

-- =============================================================================
-- Test 9: is_system_admin always returns false (stub)
-- =============================================================================
SELECT ok(
  NOT private.is_system_admin(),
  'is_system_admin returns false (stub until Phase 1-C)'
);

-- =============================================================================
-- Test 10: Helpers are SECURITY DEFINER
-- =============================================================================
SELECT is(
  (SELECT prosecdef FROM pg_proc
   WHERE pronamespace = 'private'::regnamespace
     AND proname = 'is_workspace_member'
   LIMIT 1),
  true,
  'is_workspace_member is SECURITY DEFINER'
);
SELECT is(
  (SELECT prosecdef FROM pg_proc
   WHERE pronamespace = 'private'::regnamespace
     AND proname = 'is_workspace_owner'
   LIMIT 1),
  true,
  'is_workspace_owner is SECURITY DEFINER'
);
SELECT is(
  (SELECT prosecdef FROM pg_proc
   WHERE pronamespace = 'private'::regnamespace
     AND proname = 'is_system_admin'
   LIMIT 1),
  true,
  'is_system_admin is SECURITY DEFINER'
);

-- =============================================================================
-- Cleanup
-- =============================================================================
RESET ROLE;
SELECT * FROM finish();

ROLLBACK;
