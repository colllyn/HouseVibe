-- =============================================================================
-- 04_rls_positive_test.sql -- Positive RLS Tests
-- Verifies authorized users CAN perform operations they are entitled to.
--
-- Test UUIDs:
--   User A: a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0 (owner of Workspace A)
--   User B: b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0 (member of Workspace A)
--   Workspace A: a1111111-a111-a111-a111-a111111111a1
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

-- =============================================================================
-- Setup: Create users, profiles, workspace, memberships (as postgres)
-- =============================================================================
SELECT pg_temp.insert_auth_user('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'user-a@example.invalid', 'User A');
SELECT pg_temp.insert_auth_user('b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0', 'user-b@example.invalid', 'User B');

-- Create Workspace A with User A as owner
INSERT INTO public.workspaces (id, name, owner_user_id, city, business_type)
VALUES ('a1111111-a111-a111-a111-a111111111a1', 'Workspace A',
  'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'Beijing', 'residential_lease');

-- User A is owner (this should have been done via RPC, but we insert directly for test setup)
INSERT INTO public.workspace_members (id, workspace_id, user_id, role, status)
VALUES
  ('6a3d0001-0000-4000-8000-000000000001', 'a1111111-a111-a111-a111-a111111111a1',
   'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'owner', 'active'),
  ('6a3d0002-0000-4000-8000-000000000002', 'a1111111-a111-a111-a111-a111111111a1',
   'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0', 'member', 'active');

SELECT plan(10);

-- =============================================================================
-- Test 1: User A reads own profile
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', true);

SELECT results_eq(
  $$SELECT full_name FROM public.profiles WHERE id = 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0'$$,
  $$VALUES ('User A'::text)$$,
  'User A can read own profile'
);

-- =============================================================================
-- Test 2: User A reads own workspace (as member/owner)
-- =============================================================================
SELECT results_eq(
  $$SELECT name FROM public.workspaces WHERE id = 'a1111111-a111-a111-a111-a111111111a1'$$,
  $$VALUES ('Workspace A'::text)$$,
  'User A (owner) can read own workspace'
);

-- =============================================================================
-- Test 3: User B (member) reads workspace
-- =============================================================================
SELECT set_config('request.jwt.claim.sub', 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0', true);

SELECT results_eq(
  $$SELECT name FROM public.workspaces WHERE id = 'a1111111-a111-a111-a111-a111111111a1'$$,
  $$VALUES ('Workspace A'::text)$$,
  'User B (member) can read workspace they belong to'
);

-- =============================================================================
-- Test 4: User B reads own membership record
-- =============================================================================
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0'
      AND workspace_id = 'a1111111-a111-a111-a111-a111111111a1'
  ),
  'User B can see own membership record'
);

-- =============================================================================
-- Test 5: Owner (User A) reads memberships in own workspace
-- =============================================================================
SELECT set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', true);

SELECT is(
  (SELECT count(*) FROM public.workspace_members
   WHERE workspace_id = 'a1111111-a111-a111-a111-a111111111a1'),
  2::bigint,
  'Owner can see all memberships in own workspace'
);

-- =============================================================================
-- Test 6: Owner can update workspace name
-- =============================================================================
UPDATE public.workspaces
SET name = 'Workspace A Updated'
WHERE id = 'a1111111-a111-a111-a111-a111111111a1';

SELECT results_eq(
  $$SELECT name FROM public.workspaces WHERE id = 'a1111111-a111-a111-a111-a111111111a1'$$,
  $$VALUES ('Workspace A Updated'::text)$$,
  'Owner can update workspace name'
);

-- =============================================================================
-- Test 7: Owner can update workspace city
-- =============================================================================
UPDATE public.workspaces
SET city = 'Shanghai'
WHERE id = 'a1111111-a111-a111-a111-a111111111a1';

SELECT results_eq(
  $$SELECT city FROM public.workspaces WHERE id = 'a1111111-a111-a111-a111-a111111111a1'$$,
  $$VALUES ('Shanghai'::text)$$,
  'Owner can update workspace city'
);

-- =============================================================================
-- Test 8: Direct UPDATE on workspace_members revoked (20260801000004)
-- =============================================================================
SELECT throws_ok(
  $$UPDATE public.workspace_members SET status = 'inactive'
    WHERE workspace_id = 'a1111111-a111-a111-a111-a111111111a1'
      AND user_id = 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0'$$,
  '42501',
  NULL,
  'Owner cannot directly UPDATE workspace_members (use RPC)'
);

SELECT is(
  (SELECT status FROM public.workspace_members
   WHERE workspace_id = 'a1111111-a111-a111-a111-a111111111a1'
     AND user_id = 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0'),
  'active'::public.member_status,
  'Member status unchanged after denied direct UPDATE'
);

-- =============================================================================
-- Test 9: Both members still active (no REST bypass possible)
-- =============================================================================
SELECT is(
  (SELECT count(*)::int FROM public.workspace_members
   WHERE workspace_id = 'a1111111-a111-a111-a111-a111111111a1'
     AND status = 'active'),
  2,
  'Both members still active after UPDATE revoked'
);

-- =============================================================================
-- Cleanup
-- =============================================================================
RESET ROLE;
SELECT * FROM finish();

ROLLBACK;
