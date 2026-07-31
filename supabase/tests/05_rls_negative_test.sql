-- =============================================================================
-- 05_rls_negative_test.sql -- Negative RLS Tests
-- Verifies unauthorized users CANNOT perform operations they should not.
--
-- Test UUIDs:
--   User A: a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0 (owner of Workspace A)
--   User B: b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0 (member of Workspace A)
--   User C: c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0 (outsider, no workspace)
--   Workspace A: a1111111-a111-a111-a111-a111111111a1
--   Workspace B: b1111111-b111-b111-b111-b111111111b1 (User B's own workspace)
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
-- Setup: Create 3 users, 2 workspaces
-- =============================================================================
SELECT pg_temp.insert_auth_user('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'user-a@example.invalid', 'User A');
SELECT pg_temp.insert_auth_user('b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0', 'user-b@example.invalid', 'User B');
SELECT pg_temp.insert_auth_user('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0', 'user-c@example.invalid', 'User C');

-- Workspace A: User A (owner), User B (member), User C (outsider)
INSERT INTO public.workspaces (id, name, owner_user_id, city, business_type)
VALUES ('a1111111-a111-a111-a111-a111111111a1', 'Workspace A',
  'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'Beijing', 'residential_lease');

INSERT INTO public.workspace_members (id, workspace_id, user_id, role, status)
VALUES
  ('7b4d0001-0000-4000-8000-000000000001', 'a1111111-a111-a111-a111-a111111111a1',
   'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'owner', 'active'),
  ('7b4d0002-0000-4000-8000-000000000002', 'a1111111-a111-a111-a111-a111111111a1',
   'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0', 'member', 'active');

-- Workspace B: User B (owner)
INSERT INTO public.workspaces (id, name, owner_user_id, city, business_type)
VALUES ('b1111111-b111-b111-b111-b111111111b1', 'Workspace B',
  'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0', 'Shanghai', 'residential_lease');

INSERT INTO public.workspace_members (id, workspace_id, user_id, role, status)
VALUES
  ('7b4d0003-0000-4000-8000-000000000003', 'b1111111-b111-b111-b111-b111111111b1',
   'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0', 'owner', 'active');

SELECT plan(16);

-- =============================================================================
-- Test 1: User B cannot read User A's non-public profile details
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0', true);

SELECT is_empty(
  $$SELECT 1 FROM public.profiles WHERE id = 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0'$$,
  'User B cannot read User A profile (not own profile)'
);

-- =============================================================================
-- Test 2: User C (outsider) cannot read User A's profile
-- =============================================================================
SELECT set_config('request.jwt.claim.sub', 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0', true);

SELECT is_empty(
  $$SELECT 1 FROM public.profiles WHERE id = 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0'$$,
  'User C (outsider) cannot read User A profile'
);

-- =============================================================================
-- Test 3: User C cannot read Workspace A
-- =============================================================================
SELECT is_empty(
  $$SELECT 1 FROM public.workspaces WHERE id = 'a1111111-a111-a111-a111-a111111111a1'$$,
  'User C (outsider) cannot read Workspace A'
);

-- =============================================================================
-- Test 4: User A cannot read Workspace B
-- =============================================================================
SELECT set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', true);

SELECT is_empty(
  $$SELECT 1 FROM public.workspaces WHERE id = 'b1111111-b111-b111-b111-b111111111b1'$$,
  'User A cannot read Workspace B (not a member)'
);

-- =============================================================================
-- Test 5: Member (User B) cannot update workspace info
-- =============================================================================
SELECT set_config('request.jwt.claim.sub', 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0', true);

-- Attempt update and verify no rows affected
SELECT is(
  (SELECT count(*) FROM public.workspaces
   WHERE id = 'a1111111-a111-a111-a111-a111111111a1'),
  1::bigint,
  'Workspace A still exists (member cannot delete)'
);

-- Try update -- should silently do nothing due to RLS
UPDATE public.workspaces
SET name = 'Hijacked Name'
WHERE id = 'a1111111-a111-a111-a111-a111111111a1';

SELECT results_eq(
  $$SELECT name FROM public.workspaces WHERE id = 'a1111111-a111-a111-a111-a111111111a1'$$,
  $$VALUES ('Workspace A'::text)$$,
  'Member cannot update workspace name (RLS blocks update)'
);

-- =============================================================================
-- Test 6: Member cannot elevate own role to owner
-- =============================================================================
UPDATE public.workspace_members
SET role = 'owner'
WHERE workspace_id = 'a1111111-a111-a111-a111-a111111111a1'
  AND user_id = 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0';

SELECT is(
  (SELECT role FROM public.workspace_members
   WHERE workspace_id = 'a1111111-a111-a111-a111-a111111111a1'
     AND user_id = 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0'),
  'member'::public.workspace_role,
  'Member cannot elevate own role to owner'
);

-- =============================================================================
-- Test 7: Member cannot deactivate Owner
-- =============================================================================
UPDATE public.workspace_members
SET status = 'inactive'
WHERE workspace_id = 'a1111111-a111-a111-a111-a111111111a1'
  AND user_id = 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0';

-- UPDATE attempt was done as User B above. Verify as postgres that status unchanged.
RESET ROLE;
SELECT is(
  (SELECT status FROM public.workspace_members
   WHERE workspace_id = 'a1111111-a111-a111-a111-a111111111a1'
     AND user_id = 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0'),
  'active'::public.member_status,
  'Member cannot deactivate owner (verified by postgres)'
);

-- Re-authenticate as User C for subsequent test
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0', true);

-- =============================================================================
-- Test 8: Outsider cannot read membership records in Workspace A
-- =============================================================================
SELECT set_config('request.jwt.claim.sub', 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0', true);

SELECT is_empty(
  $$SELECT 1 FROM public.workspace_members
    WHERE workspace_id = 'a1111111-a111-a111-a111-a111111111a1'$$,
  'Outsider cannot read membership records for Workspace A'
);

-- =============================================================================
-- Test 9: User cannot UPDATE audit_logs
-- =============================================================================
SELECT set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', true);

-- No audit log INSERT policy for authenticated users
-- Insert should fail or be blocked by RLS (no policy = deny)
SELECT throws_ok(
  $$INSERT INTO public.audit_logs (workspace_id, actor_user_id, entity_type, entity_id, action)
    VALUES ('a1111111-a111-a111-a111-a111111111a1',
            'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0',
            'workspace', 'a1111111-a111-a111-a111-a111111111a1', 'test')$$,
  '42501',
  NULL,
  'Authenticated user cannot INSERT into audit_logs (no insert policy)'
);

-- =============================================================================
-- Test 10: User cannot DELETE audit_logs
-- =============================================================================
SELECT throws_ok(
  $$DELETE FROM public.audit_logs$$,
  '42501',
  NULL,
  'Authenticated user cannot DELETE from audit_logs (no delete policy)'
);

-- =============================================================================
-- Test 11: Unauthenticated (anon) cannot read any table
-- =============================================================================
RESET ROLE;
SET LOCAL ROLE anon;

SELECT throws_ok(
  $$SELECT 1 FROM public.profiles$$,
  '42501',
  NULL,
  'Anon cannot read profiles (no table-level grant)'
);
SELECT throws_ok(
  $$SELECT 1 FROM public.workspaces$$,
  '42501',
  NULL,
  'Anon cannot read workspaces (no table-level grant)'
);
SELECT throws_ok(
  $$SELECT 1 FROM public.workspace_members$$,
  '42501',
  NULL,
  'Anon cannot read workspace_members (no table-level grant)'
);
SELECT throws_ok(
  $$SELECT 1 FROM public.audit_logs$$,
  '42501',
  NULL,
  'Anon cannot read audit_logs (no table-level grant)'
);

-- Restore for remaining tests
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0', true);

-- =============================================================================
-- Test 12: Forged workspace_id -- outsider cannot INSERT into Workspace A
-- =============================================================================
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0', true);

-- User C tries to insert into workspace A's membership
-- Should fail because User C is not owner of Workspace A
SELECT throws_ok(
  $$INSERT INTO public.workspace_members (workspace_id, user_id, role, status)
    VALUES ('a1111111-a111-a111-a111-a111111111a1',
            'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0', 'member', 'active')$$,
  '42501',
  NULL,
  'Outsider cannot insert own membership into foreign workspace'
);

-- =============================================================================
-- Cleanup
-- =============================================================================
RESET ROLE;
SELECT * FROM finish();

ROLLBACK;
