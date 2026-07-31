-- Invitation Links: Schema, RLS, and accept_workspace_invitation RPC Tests
-- Phase 1-B2: Auth, Onboarding, and Invitation Join
-- EXPANDED: Success path, fail-closed identity, and state failure tests
--
-- Test UUIDs:
--   User D: dddddddd-dddd-dddd-dddd-dddddddddddd (inviter, workspace owner)
--   User E: eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee (invitee with matching email)
--   User F: ffffffff-ffff-ffff-ffff-ffffffffffff (invitee with wrong email)
--   User 0A: 0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a (invitee with NULL email)
--   Workspace D: dddddddd-0000-4000-8000-dddddddddddd

BEGIN;

SET LOCAL search_path TO public, extensions;

-- =============================================================================
-- Helper: insert auth user for testing (with full auth record including email)
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
-- Setup: Create test users, workspace, and invitation records
-- =============================================================================

-- User D (inviter, workspace owner)
SELECT pg_temp.insert_auth_user('dddddddd-dddd-dddd-dddd-dddddddddddd', 'inviter-d@example.invalid', 'Inviter D');
-- User E (correct invitee — matching email)
SELECT pg_temp.insert_auth_user('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'invitee-e@example.invalid', 'Invitee E');
-- User F (wrong invitee — mismatched email)
SELECT pg_temp.insert_auth_user('ffffffff-ffff-ffff-ffff-ffffffffffff', 'wrong-f@example.invalid', 'Wrong F');
-- User 0A (NULL email invitee — triggers UA002)
SELECT pg_temp.insert_auth_user('0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a', NULL, 'NullEmail 0A');

-- Create Workspace D with User D as owner
INSERT INTO public.workspaces (id, name, owner_user_id, city, business_type)
VALUES ('dddddddd-0000-4000-8000-dddddddddddd', 'Workspace D',
  'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Beijing', 'residential_lease');

-- User D is owner of Workspace D
INSERT INTO public.workspace_members (id, workspace_id, user_id, role, status)
VALUES ('7a7d0001-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-dddddddddddd',
  'dddddddd-dddd-dddd-dddd-dddddddddddd', 'owner', 'active');

-- =============================================================================
-- Invitation records for testing (inserted directly, bypassing app-level HMAC)
-- =============================================================================

-- INV-ACTIVE: Active invitation for User E (correct email, member role)
INSERT INTO public.invitation_links (id, token_hash, created_by, target_workspace_id,
  recipient_email, workspace_role, status, expires_at)
VALUES ('7a7d1001-0000-4000-8000-000000000001', 'test_invite_hash_success_001',
  'dddddddd-dddd-dddd-dddd-dddddddddddd', 'dddddddd-0000-4000-8000-dddddddddddd',
  'invitee-e@example.invalid', 'member', 'active',
  now() + interval '7 days');

-- INV-NULL: Invitation with NULL recipient_email (fail-closed IV006)
INSERT INTO public.invitation_links (id, token_hash, created_by, target_workspace_id,
  recipient_email, workspace_role, status, expires_at)
VALUES ('7a7d1002-0000-4000-8000-000000000002', 'test_invite_hash_null_email',
  'dddddddd-dddd-dddd-dddd-dddddddddddd', 'dddddddd-0000-4000-8000-dddddddddddd',
  NULL, 'member', 'active',
  now() + interval '7 days');

-- INV-WRONG-EMAIL: Active invitation for a specific email (not User F's)
INSERT INTO public.invitation_links (id, token_hash, created_by, target_workspace_id,
  recipient_email, workspace_role, status, expires_at)
VALUES ('7a7d1003-0000-4000-8000-000000000003', 'test_invite_hash_wrong_email',
  'dddddddd-dddd-dddd-dddd-dddddddddddd', 'dddddddd-0000-4000-8000-dddddddddddd',
  'correct-only@example.invalid', 'member', 'active',
  now() + interval '7 days');

-- INV-EXPIRED: Expired invitation (expires_at in the past, auto-expired by RPC)
INSERT INTO public.invitation_links (id, token_hash, created_by, target_workspace_id,
  recipient_email, workspace_role, status, expires_at)
VALUES ('7a7d1004-0000-4000-8000-000000000004', 'test_invite_hash_expired',
  'dddddddd-dddd-dddd-dddd-dddddddddddd', 'dddddddd-0000-4000-8000-dddddddddddd',
  'invitee-e@example.invalid', 'member', 'active',
  now() - interval '1 hour');

-- INV-REVOKED: Revoked invitation (status = 'revoked')
INSERT INTO public.invitation_links (id, token_hash, created_by, target_workspace_id,
  recipient_email, workspace_role, status, expires_at)
VALUES ('7a7d1005-0000-4000-8000-000000000005', 'test_invite_hash_revoked',
  'dddddddd-dddd-dddd-dddd-dddddddddddd', 'dddddddd-0000-4000-8000-dddddddddddd',
  'invitee-e@example.invalid', 'member', 'revoked',
  now() + interval '7 days');

-- INV-COLLAB-ROLE: Active invitation for User E with external_collaborator role
INSERT INTO public.invitation_links (id, token_hash, created_by, target_workspace_id,
  recipient_email, workspace_role, status, expires_at)
VALUES ('7a7d1006-0000-4000-8000-000000000006', 'test_invite_hash_collab_role',
  'dddddddd-dddd-dddd-dddd-dddddddddddd', 'dddddddd-0000-4000-8000-dddddddddddd',
  'invitee-e@example.invalid', 'external_collaborator', 'active',
  now() + interval '7 days');

-- =============================================================================
-- Tests (plan: 26)
-- =============================================================================
SELECT plan(26);

-- =============================================================================
-- SECTION A: Schema and RLS checks (tests 1-12)
-- =============================================================================

-- Test 1-6: Table and columns
SELECT has_table('public', 'invitation_links', '1. invitation_links table exists');
SELECT has_column('public', 'invitation_links', 'token_hash', '2. has token_hash');
SELECT has_column('public', 'invitation_links', 'workspace_role', '3. has workspace_role');
SELECT has_column('public', 'invitation_links', 'used_count', '4. has used_count');
SELECT has_column('public', 'invitation_links', 'accepted_by', '5. has accepted_by');
SELECT has_column('public', 'invitation_links', 'accepted_at', '6. has accepted_at');

-- Test 7: Status check constraint
SELECT col_has_check('public', 'invitation_links', 'status', '7. status has CHECK constraint');

-- Test 8-9: Indexes
SELECT has_index('public', 'invitation_links', 'idx_invitation_links_token_hash',
  '8. token_hash has index');
SELECT has_index('public', 'invitation_links', 'idx_invitation_links_status_expires',
  ARRAY['status', 'expires_at'], '9. status+expires_at has index');

-- Test 10: RLS enabled
SELECT is(
  (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.invitation_links'::regclass),
  true,
  '10. RLS enabled on invitation_links'
);

-- Test 11: RPC function exists and is SECURITY DEFINER
SELECT has_function('public', 'accept_workspace_invitation', ARRAY['text'],
  '11. accept_workspace_invitation(text) exists');

SELECT is(
  (SELECT prosecdef FROM pg_catalog.pg_proc
   WHERE proname = 'accept_workspace_invitation'
     AND pronamespace = 'public'::regnamespace),
  true,
  '12. accept_workspace_invitation is SECURITY DEFINER'
);

-- =============================================================================
-- SECTION B: Success path (tests 13-17)
-- =============================================================================

-- Test 13: Correct auth user accepts invitation with matching email
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', true);

SELECT lives_ok(
  $$SELECT public.accept_workspace_invitation('test_invite_hash_success_001')$$,
  '13. SUCCESS: User E with matching email can accept invitation'
);

-- Test 14: Created membership has correct role from invitation
-- (User E can read their own workspace_members row via RLS)
SELECT is(
  (SELECT role FROM public.workspace_members
   WHERE workspace_id = 'dddddddd-0000-4000-8000-dddddddddddd'
     AND user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  'member'::public.workspace_role,
  '14. SUCCESS: Created membership has role "member" from invitation'
);

-- Tests 15-16 verify invitation_links state (RLS restricts to creator only,
-- so we use postgres role to bypass RLS)
RESET ROLE;

-- Test 15: Invitation accepted_by set properly
SELECT ok(
  (SELECT accepted_by = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid
   FROM public.invitation_links
   WHERE token_hash = 'test_invite_hash_success_001'),
  '15. SUCCESS: accepted_by set to User E'
);

-- Test 16: Invitation accepted_at is set
SELECT ok(
  (SELECT accepted_at IS NOT NULL
   FROM public.invitation_links
   WHERE token_hash = 'test_invite_hash_success_001'),
  '16. SUCCESS: accepted_at is set'
);

-- Test 17: external_collaborator role — User E accepts collab role invitation
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', true);

SELECT lives_ok(
  $$SELECT public.accept_workspace_invitation('test_invite_hash_collab_role')$$,
  '17. SUCCESS: User E can accept external_collaborator role invitation'
);

-- =============================================================================
-- SECTION C: Fail-closed identity tests (tests 18-22)
-- =============================================================================

-- Test 18: Invitation with NULL recipient_email is rejected (IV006)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', true);

SELECT throws_ok(
  $$SELECT public.accept_workspace_invitation('test_invite_hash_null_email')$$,
  'IV006',
  NULL,
  '18. FAIL-CLOSED: NULL recipient_email rejected with IV006'
);

-- Test 19: Auth user with NULL email is rejected (UA002)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a', true);

SELECT throws_ok(
  $$SELECT public.accept_workspace_invitation('test_invite_hash_success_001')$$,
  'UA002',
  NULL,
  '19. FAIL-CLOSED: User with NULL email rejected with UA002'
);

-- Test 20: Wrong email is rejected (IV005)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'ffffffff-ffff-ffff-ffff-ffffffffffff', true);

SELECT throws_ok(
  $$SELECT public.accept_workspace_invitation('test_invite_hash_wrong_email')$$,
  'IV005',
  NULL,
  '20. FAIL-CLOSED: Wrong email rejected with IV005'
);

-- Test 21: Unauthenticated user is rejected (UA001)
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

SELECT throws_ok(
  $$SELECT public.accept_workspace_invitation('test_invite_hash_success_001')$$,
  'UA001',
  NULL,
  '21. FAIL-CLOSED: Unauthenticated user rejected with UA001'
);

-- Test 22: Anon role has no execute privilege (42501)
RESET ROLE;
SET LOCAL ROLE anon;

SELECT throws_ok(
  $$SELECT public.accept_workspace_invitation('test_invite_hash_success_001')$$,
  '42501',
  NULL,
  '22. FAIL-CLOSED: Anon role has no execute grant (42501)'
);

-- =============================================================================
-- SECTION D: State failure tests (tests 23-26)
-- =============================================================================

-- Test 23: Expired invitation rejected (IV003)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', true);

SELECT throws_ok(
  $$SELECT public.accept_workspace_invitation('test_invite_hash_expired')$$,
  'IV003',
  NULL,
  '23. STATE-FAIL: Expired invitation rejected with IV003'
);

-- Test 24: Revoked invitation rejected (IV002)
SELECT throws_ok(
  $$SELECT public.accept_workspace_invitation('test_invite_hash_revoked')$$,
  'IV002',
  NULL,
  '24. STATE-FAIL: Revoked invitation rejected with IV002'
);

-- Test 25: Nonexistent token rejected (IV001)
SELECT throws_ok(
  $$SELECT public.accept_workspace_invitation('nonexistent_token_hash_xyz')$$,
  'IV001',
  NULL,
  '25. STATE-FAIL: Nonexistent token rejected with IV001'
);

-- Test 26: Already-accepted invitation — idempotent via upsert
-- (The function uses ON CONFLICT upsert; re-accepting should not fail)
SELECT lives_ok(
  $$SELECT public.accept_workspace_invitation('test_invite_hash_success_001')$$,
  '26. STATE: Already-accepted invitation accept is idempotent (upsert)'
);

-- =============================================================================
-- Cleanup
-- =============================================================================
RESET ROLE;
SELECT * FROM finish();

ROLLBACK;
