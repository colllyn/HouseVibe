-- =============================================================================
-- 03_workspace_rpc_test.sql -- create_workspace_with_owner RPC Tests
-- Verifies the workspace creation RPC function behaviour.
--
-- Test UUIDs:
--   User A: a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0 (owner)
--   User B: b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0 (another user)
-- =============================================================================

BEGIN;

SET LOCAL search_path TO public, extensions;

-- Helper: insert auth user for testing
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

-- Create test users
SELECT pg_temp.insert_auth_user('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'user-a@example.invalid', 'User A');
SELECT pg_temp.insert_auth_user('b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0', 'user-b@example.invalid', 'User B');

SELECT plan(11);

-- =============================================================================
-- Test 1: Authenticated user successfully creates workspace
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', true);

SELECT lives_ok(
  $$SELECT public.create_workspace_with_owner('Test WS A', 'Beijing', 'residential_lease')$$,
  'Authenticated user can create workspace'
);

-- =============================================================================
-- Test 2: Creator becomes owner with correct role and status
-- =============================================================================
DO $$
DECLARE
  v_result jsonb;
  v_ws_id uuid;
BEGIN
  v_result := public.create_workspace_with_owner('Test WS A2', 'Shanghai', 'residential_lease');
  v_ws_id := (v_result ->> 'workspace_id')::uuid;

  -- Verify the result structure
  PERFORM set_config('test.ws_id', v_ws_id::text, true);
  PERFORM set_config('test.ws_result', v_result::text, true);
END;
$$;

SELECT is(
  (SELECT role FROM public.workspace_members
   WHERE workspace_id = current_setting('test.ws_id')::uuid
     AND user_id = 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0'
   LIMIT 1),
  'owner'::public.workspace_role,
  'Creator role is owner'
);

SELECT is(
  (SELECT status FROM public.workspace_members
   WHERE workspace_id = current_setting('test.ws_id')::uuid
     AND user_id = 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0'
   LIMIT 1),
  'active'::public.member_status,
  'Creator status is active'
);

-- =============================================================================
-- Test 3: Workspace AND membership created in same transaction
-- =============================================================================
DO $$
DECLARE
  v_result jsonb;
  v_ws_id uuid;
  v_ws_count integer;
  v_member_count integer;
BEGIN
  -- Create workspace
  v_result := public.create_workspace_with_owner('Test WS A3', 'Guangzhou', 'residential_lease');
  v_ws_id := (v_result ->> 'workspace_id')::uuid;

  -- Both workspace and membership must exist
  SELECT count(*) INTO v_ws_count FROM public.workspaces WHERE id = v_ws_id;
  SELECT count(*) INTO v_member_count FROM public.workspace_members WHERE workspace_id = v_ws_id;

  IF v_ws_count != 1 OR v_member_count != 1 THEN
    RAISE EXCEPTION 'Workspace or membership not created atomically';
  END IF;

  PERFORM set_config('test.ws_id3', v_ws_id::text, true);
END;
$$;

SELECT ok(
  EXISTS (SELECT 1 FROM public.workspaces WHERE id = current_setting('test.ws_id3')::uuid),
  'Workspace exists after RPC call'
);
SELECT ok(
  EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = current_setting('test.ws_id3')::uuid),
  'Owner membership exists after RPC call'
);

-- =============================================================================
-- Test 4: Result JSON contains expected fields
-- =============================================================================
SELECT is(
  (public.create_workspace_with_owner('Test WS A4', 'Shenzhen', 'residential_lease') ->> 'role'),
  'owner',
  'Result JSON includes role field'
);
SELECT is(
  (public.create_workspace_with_owner('Test WS A5', 'Chengdu', 'residential_lease') ->> 'status'),
  'active',
  'Result JSON includes status field'
);

-- =============================================================================
-- Test 5a: Authenticated role without JWT sub cannot create workspace (defense-in-depth)
-- =============================================================================
-- Clear the JWT sub claim (set by previous tests) so auth.uid() returns null
SELECT set_config('request.jwt.claim.sub', '', true);
-- We are still in authenticated role from the previous test
SELECT throws_ok(
  $$SELECT public.create_workspace_with_owner('Bad WS', 'City', 'residential_lease')$$,
  'UA001',
  'Authentication required',
  'Authenticated role without JWT sub cannot create workspace (UA001)'
);

-- =============================================================================
-- Test 5b: Anonymous role cannot execute the RPC (no EXECUTE grant)
-- =============================================================================
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT public.create_workspace_with_owner('Bad WS', 'City', 'residential_lease')$$,
  '42501',
  NULL,
  'Anon role cannot call create_workspace_with_owner (no execute grant)'
);

-- Re-authenticate as User A for subsequent tests
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', true);

-- =============================================================================
-- Test 6: Owner is always the calling auth.uid(), cannot specify others
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0', true);

-- The RPC does not accept a user_id parameter; owner is always auth.uid()
-- So we verify that User B's workspace has User B as owner
DO $$
DECLARE
  v_result jsonb;
  v_ws_id uuid;
  v_owner uuid;
BEGIN
  v_result := public.create_workspace_with_owner('Test WS B1', 'Nanjing', 'residential_lease');
  v_ws_id := (v_result ->> 'workspace_id')::uuid;
  v_owner := (v_result ->> 'owner_user_id')::uuid;

  IF v_owner != 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0'::uuid THEN
    RAISE EXCEPTION 'Owner is not the calling user';
  END IF;
END;
$$;

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.workspaces
    WHERE name = 'Test WS B1'
      AND owner_user_id = 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0'
  ),
  'RPC always sets owner_user_id to auth.uid()'
);

-- =============================================================================
-- Test 7: Default business_type when not specified
-- =============================================================================
DO $$
DECLARE
  v_result jsonb;
BEGIN
  -- Call with only 1 argument (name), using defaults for city and business_type
  v_result := (SELECT public.create_workspace_with_owner('Test WS B2'));
END;
$$;

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.workspaces
    WHERE name = 'Test WS B2'
      AND business_type = 'residential_lease'
  ),
  'Default business_type is residential_lease when not specified'
);

-- =============================================================================
-- Cleanup
-- =============================================================================
RESET ROLE;
SELECT * FROM finish();

ROLLBACK;
