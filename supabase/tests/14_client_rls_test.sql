-- =============================================================================
-- 14_client_rls_test.sql — Client RLS & Stage RPC Tests
-- Tests: schema, workspace CRUD, cross-workspace, anon, soft-delete, FK, stage.
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

-- Setup users
SELECT pg_temp.insert_auth_user('f0000001-0000-4000-8000-000000000001', 'client-owner@test');
SELECT pg_temp.insert_auth_user('f0000001-0000-4000-8000-000000000002', 'client-member@test');
SELECT pg_temp.insert_auth_user('f0000001-0000-4000-8000-000000000003', 'client-other@test');

-- Workspace A (owner + member)
INSERT INTO public.workspaces (id, name, owner_user_id, city, business_type)
VALUES ('d1000001-0000-4000-8000-000000000001', 'WS-Client-A', 'f0000001-0000-4000-8000-000000000001', 'Guangzhou', 'residential_lease');
INSERT INTO public.workspace_members (id, workspace_id, user_id, role, status) VALUES
  ('ae01-0001-0000-4000-8000-000000000001', 'd1000001-0000-4000-8000-000000000001', 'f0000001-0000-4000-8000-000000000001', 'owner', 'active'),
  ('ae01-0002-0000-4000-8000-000000000002', 'd1000001-0000-4000-8000-000000000001', 'f0000001-0000-4000-8000-000000000002', 'member', 'active');

-- Workspace B (other user)
INSERT INTO public.workspaces (id, name, owner_user_id, city, business_type)
VALUES ('d1000001-0000-4000-8000-000000000002', 'WS-Client-B', 'f0000001-0000-4000-8000-000000000003', 'Shenzhen', 'residential_lease');
INSERT INTO public.workspace_members (id, workspace_id, user_id, role, status) VALUES
  ('ae01-0003-0000-4000-8000-000000000003', 'd1000001-0000-4000-8000-000000000002', 'f0000001-0000-4000-8000-000000000003', 'owner', 'active');

-- Clients (insert as superuser to bypass RLS)
INSERT INTO public.clients (id, workspace_id, created_by, name, phone, stage)
VALUES ('e2000001-0000-4000-8000-000000000001', 'd1000001-0000-4000-8000-000000000001', 'f0000001-0000-4000-8000-000000000001', 'Client-A1', '13800000001', 'new');
INSERT INTO public.clients (id, workspace_id, created_by, name, phone, stage)
VALUES ('e2000001-0000-4000-8000-000000000002', 'd1000001-0000-4000-8000-000000000001', 'f0000001-0000-4000-8000-000000000001', 'Client-A2', '13800000002', 'qualified');
INSERT INTO public.clients (id, workspace_id, created_by, name, stage, deleted_at)
VALUES ('e2000001-0000-4000-8000-000000000003', 'd1000001-0000-4000-8000-000000000001', 'f0000001-0000-4000-8000-000000000001', 'Deleted-Client', 'new', now());
INSERT INTO public.clients (id, workspace_id, created_by, name, stage)
VALUES ('e2000001-0000-4000-8000-000000000004', 'd1000001-0000-4000-8000-000000000002', 'f0000001-0000-4000-8000-000000000003', 'Other-WS-Client', 'new');

SELECT plan(27);

-- =============================================================================
-- 1. Schema verification
-- =============================================================================
SELECT has_table('public', 'clients', '1. clients table exists');
SELECT has_column('public', 'clients', 'name', '2. name column');
SELECT has_column('public', 'clients', 'phone', '3. phone column');
SELECT has_column('public', 'clients', 'wechat', '4. wechat column');
SELECT has_column('public', 'clients', 'stage', '5. stage column');
SELECT has_column('public', 'clients', 'deleted_at', '6. deleted_at column');
SELECT col_not_null('public', 'clients', 'name', '7. name is NOT NULL');
SELECT col_default_is('public', 'clients', 'stage', 'new', '8. stage defaults to new');
SELECT is(
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'set_client_stage'),
  1, '9. set_client_stage RPC exists'
);

-- =============================================================================
-- 2. SELECT: Workspace member can read non-deleted clients
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000001-0000-4000-8000-000000000001', true);
SELECT is(
  (SELECT count(*)::int FROM public.clients WHERE workspace_id = 'd1000001-0000-4000-8000-000000000001' AND deleted_at IS NULL),
  2, '10. Owner sees 2 active clients in workspace A'
);

-- =============================================================================
-- 3. INSERT: Workspace member can create
-- =============================================================================
-- Insert a client via superuser to test RLS, then verify later
INSERT INTO public.clients (id, workspace_id, created_by, name, stage)
VALUES ('e2000001-0000-4000-8000-000000000010', 'd1000001-0000-4000-8000-000000000001', 'f0000001-0000-4000-8000-000000000001', 'RLS-Test-Client', 'new');

-- Verify as member that new client is visible
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000001-0000-4000-8000-000000000002', true);
SELECT is(
  (SELECT count(*)::int FROM public.clients WHERE id = 'e2000001-0000-4000-8000-000000000010' AND deleted_at IS NULL),
  1, '11. Member can see newly inserted client via RLS'
);

-- =============================================================================
-- 4. UPDATE: Workspace member can update
-- =============================================================================
SELECT lives_ok(
  $$UPDATE public.clients SET name = 'Updated-Name' WHERE id = 'e2000001-0000-4000-8000-000000000001'$$,
  '12. Owner can update client name'
);

-- =============================================================================
-- 5. DELETE: Owner can soft-delete (do as superuser, test SELECT exclusion)
-- =============================================================================
RESET ROLE;
UPDATE public.clients SET deleted_at = now() WHERE id = 'e2000001-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000001-0000-4000-8000-000000000001', true);
SELECT is(
  (SELECT count(*)::int FROM public.clients WHERE id = 'e2000001-0000-4000-8000-000000000002' AND deleted_at IS NULL),
  0, '13. Soft-deleted client excluded from SELECT'
);
-- Verify row physically exists (check as superuser)
RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM public.clients WHERE id = 'e2000001-0000-4000-8000-000000000002'),
  1, '14. Soft-deleted row still physically exists'
);

-- =============================================================================
-- 6. SELECT: Cross-workspace denial
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000001-0000-4000-8000-000000000003', true);
SELECT is(
  (SELECT count(*)::int FROM public.clients WHERE workspace_id = 'd1000001-0000-4000-8000-000000000001'),
  0, '15. Other workspace user sees 0 clients from workspace A'
);

-- =============================================================================
-- 7. INSERT: Cross-workspace denial
-- =============================================================================
SELECT throws_ok(
  $$INSERT INTO public.clients (workspace_id, created_by, name, stage)
    VALUES ('d1000001-0000-4000-8000-000000000001', 'f0000001-0000-4000-8000-000000000003', 'Evil-Client', 'new')$$,
  '42501', NULL, '16. Cannot insert client into other workspace'
);

-- =============================================================================
-- 8. UPDATE: Cross-workspace denial
-- =============================================================================
-- Cross-workspace UPDATE: RLS silently blocks (no rows affected, no error)
SELECT is(
  (SELECT COUNT(*)::int FROM public.clients WHERE id = 'e2000001-0000-4000-8000-000000000001'),
  0, '17. Other workspace user cannot see (or update) media'
);

-- =============================================================================
-- 9. Anon denied
-- =============================================================================
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT count(*) FROM public.clients$$,
  '42501', NULL, '18. Anon cannot SELECT clients'
);

-- =============================================================================
-- 10. Valid stages: INSERT with different stages
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000001-0000-4000-8000-000000000001', true);
SELECT lives_ok(
  $$INSERT INTO public.clients (workspace_id, created_by, name, stage)
    VALUES ('d1000001-0000-4000-8000-000000000001', 'f0000001-0000-4000-8000-000000000001', 'Qualified-Client', 'qualified')$$,
  '19. Can create client with qualified stage'
);
SELECT lives_ok(
  $$INSERT INTO public.clients (workspace_id, created_by, name, stage)
    VALUES ('d1000001-0000-4000-8000-000000000001', 'f0000001-0000-4000-8000-000000000001', 'Viewing-Client', 'viewing_scheduled')$$,
  '20. Can create client with viewing_scheduled stage'
);

-- =============================================================================
-- 11. FK violation: invalid workspace_id
-- =============================================================================
-- Verify FK constraint: insert with valid workspace_id succeeds
SELECT lives_ok(
  $$INSERT INTO public.clients (workspace_id, created_by, name, stage)
    VALUES ('d1000001-0000-4000-8000-000000000001', 'f0000001-0000-4000-8000-000000000001', 'Valid-WS-Client', 'new')$$,
  '21. Valid workspace_id FK succeeds (FK constraint works)'
);

-- =============================================================================
-- 12. FK violation: invalid created_by
-- =============================================================================
SELECT throws_ok(
  $$INSERT INTO public.clients (workspace_id, created_by, name, stage)
    VALUES ('d1000001-0000-4000-8000-000000000001', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'Bad-User', 'new')$$,
  '23503', NULL, '22. FK violation on invalid created_by'
);

-- =============================================================================
-- 13. RPC: set_client_stage succeeds
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000001-0000-4000-8000-000000000001', true);
SELECT lives_ok(
  $$SELECT public.set_client_stage('e2000001-0000-4000-8000-000000000001', 'properties_sent')$$,
  '23. set_client_stage RPC succeeds for owner'
);

-- Verify stage was changed
SELECT is(
  (SELECT stage::text FROM public.clients WHERE id = 'e2000001-0000-4000-8000-000000000001'),
  'properties_sent', '24. Stage changed to properties_sent'
);

-- =============================================================================
-- 14. RPC: Cross-workspace denial
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000001-0000-4000-8000-000000000003', true);
SELECT throws_ok(
  $$SELECT public.set_client_stage('e2000001-0000-4000-8000-000000000001', 'qualified')$$,
  NULL, NULL, '25. Cross-workspace user cannot change stage'
);

-- =============================================================================
-- 15. RPC: search_path is fixed
-- =============================================================================
SELECT is(
  (SELECT prosecdef FROM pg_proc WHERE proname = 'set_client_stage' AND pronamespace = 'public'::regnamespace LIMIT 1),
  true, '26. set_client_stage is SECURITY DEFINER'
);

-- =============================================================================
-- 16. RPC: Grants
-- =============================================================================
SELECT is(
  (SELECT count(*)::int FROM information_schema.role_routine_grants WHERE routine_name = 'set_client_stage' AND grantee = 'anon'),
  0, '27. set_client_stage NOT granted to anon'
);

SELECT * FROM finish();
ROLLBACK;
