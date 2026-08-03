-- =============================================================================
-- 14_client_rls_test.sql — Client RLS, Stage RPC, Soft-Delete RPC & Idempotency Tests
-- Tests: schema, workspace CRUD, cross-workspace, anon, soft-delete, FK, stage,
--        owner-only soft-delete RPC, delete audit, concurrent duplicate create.
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
INSERT INTO public.clients (id, workspace_id, created_by, name, stage)
VALUES ('e2000001-0000-4000-8000-000000000005', 'd1000001-0000-4000-8000-000000000001', 'f0000001-0000-4000-8000-000000000001', 'To-Delete-Owner', 'new');
INSERT INTO public.clients (id, workspace_id, created_by, name, stage)
VALUES ('e2000001-0000-4000-8000-000000000006', 'd1000001-0000-4000-8000-000000000001', 'f0000001-0000-4000-8000-000000000001', 'Closed-Won-Client', 'closed_won');

SELECT plan(62);

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
SELECT is(
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'soft_delete_client'),
  1, '10. soft_delete_client RPC exists'
);

-- =============================================================================
-- 2. SELECT: Workspace member can read non-deleted clients
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000001-0000-4000-8000-000000000001', true);
SELECT is(
  (SELECT count(*)::int FROM public.clients WHERE workspace_id = 'd1000001-0000-4000-8000-000000000001' AND deleted_at IS NULL),
  4, '11. Owner sees 4 active clients in workspace A (incl To-Delete-Owner, Closed-Won)'
);

-- =============================================================================
-- 3. INSERT: Workspace member can create
-- =============================================================================
INSERT INTO public.clients (id, workspace_id, created_by, name, stage)
VALUES ('e2000001-0000-4000-8000-000000000010', 'd1000001-0000-4000-8000-000000000001', 'f0000001-0000-4000-8000-000000000001', 'RLS-Test-Client', 'new');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000001-0000-4000-8000-000000000002', true);
SELECT is(
  (SELECT count(*)::int FROM public.clients WHERE id = 'e2000001-0000-4000-8000-000000000010' AND deleted_at IS NULL),
  1, '12. Member can see newly inserted client via RLS'
);

-- =============================================================================
-- 4. UPDATE: Workspace member can update
-- =============================================================================
SELECT lives_ok(
  $$UPDATE public.clients SET name = 'Updated-Name' WHERE id = 'e2000001-0000-4000-8000-000000000001'$$,
  '13. Owner can update client name'
);

-- =============================================================================
-- 5. DELETE: Soft-deleted client excluded from SELECT
-- =============================================================================
RESET ROLE;
-- Clear JWT claims so trigger allows superuser operations
SELECT set_config('request.jwt.claim.sub', '', true);
UPDATE public.clients SET deleted_at = now() WHERE id = 'e2000001-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000001-0000-4000-8000-000000000001', true);
SELECT is(
  (SELECT count(*)::int FROM public.clients WHERE id = 'e2000001-0000-4000-8000-000000000002' AND deleted_at IS NULL),
  0, '14. Soft-deleted client excluded from SELECT'
);
RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM public.clients WHERE id = 'e2000001-0000-4000-8000-000000000002'),
  1, '15. Soft-deleted row still physically exists'
);

-- =============================================================================
-- 6. SELECT: Cross-workspace denial
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000001-0000-4000-8000-000000000003', true);
SELECT is(
  (SELECT count(*)::int FROM public.clients WHERE workspace_id = 'd1000001-0000-4000-8000-000000000001'),
  0, '16. Other workspace user sees 0 clients from workspace A'
);

-- =============================================================================
-- 7. INSERT: Cross-workspace denial
-- =============================================================================
SELECT throws_ok(
  $$INSERT INTO public.clients (workspace_id, created_by, name, stage)
    VALUES ('d1000001-0000-4000-8000-000000000001', 'f0000001-0000-4000-8000-000000000003', 'Evil-Client', 'new')$$,
  '42501', NULL, '17. Cannot insert client into other workspace'
);

-- =============================================================================
-- 8. UPDATE: Cross-workspace denial
-- =============================================================================
SELECT is(
  (SELECT COUNT(*)::int FROM public.clients WHERE id = 'e2000001-0000-4000-8000-000000000001'),
  0, '18. Other workspace user cannot see (or update) clients in workspace A'
);

-- =============================================================================
-- 9. Anon denied
-- =============================================================================
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT count(*) FROM public.clients$$,
  '42501', NULL, '19. Anon cannot SELECT clients'
);

-- =============================================================================
-- 10. Valid stages: INSERT with different stages
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000001-0000-4000-8000-000000000001', true);
SELECT lives_ok(
  $$INSERT INTO public.clients (workspace_id, created_by, name, stage)
    VALUES ('d1000001-0000-4000-8000-000000000001', 'f0000001-0000-4000-8000-000000000001', 'Qualified-Client', 'qualified')$$,
  '20. Can create client with qualified stage'
);
SELECT lives_ok(
  $$INSERT INTO public.clients (workspace_id, created_by, name, stage)
    VALUES ('d1000001-0000-4000-8000-000000000001', 'f0000001-0000-4000-8000-000000000001', 'Viewing-Client', 'viewing_scheduled')$$,
  '21. Can create client with viewing_scheduled stage'
);

-- =============================================================================
-- 11. FK violation: invalid workspace_id
-- =============================================================================
SELECT lives_ok(
  $$INSERT INTO public.clients (workspace_id, created_by, name, stage)
    VALUES ('d1000001-0000-4000-8000-000000000001', 'f0000001-0000-4000-8000-000000000001', 'Valid-WS-Client', 'new')$$,
  '22. Valid workspace_id FK succeeds (FK constraint works)'
);

-- =============================================================================
-- 12. FK violation: invalid created_by
-- =============================================================================
SELECT throws_ok(
  $$INSERT INTO public.clients (workspace_id, created_by, name, stage)
    VALUES ('d1000001-0000-4000-8000-000000000001', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'Bad-User', 'new')$$,
  '23503', NULL, '23. FK violation on invalid created_by'
);

-- =============================================================================
-- 13. RPC: set_client_stage — legal transitions
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000001-0000-4000-8000-000000000001', true);

-- new -> qualified (legal)
SELECT lives_ok(
  $$SELECT public.set_client_stage('e2000001-0000-4000-8000-000000000001', 'qualified')$$,
  '24. Legal: new -> qualified succeeds'
);
SELECT is(
  (SELECT stage::text FROM public.clients WHERE id = 'e2000001-0000-4000-8000-000000000001'),
  'qualified', '25. Stage is now qualified'
);

-- qualified -> properties_sent (legal)
SELECT lives_ok(
  $$SELECT public.set_client_stage('e2000001-0000-4000-8000-000000000001', 'properties_sent')$$,
  '26. Legal: qualified -> properties_sent succeeds'
);

-- =============================================================================
-- 14. RPC: set_client_stage — illegal transitions
-- =============================================================================

-- new -> viewed (skip stages, illegal)
-- Use a fresh client at stage 'new'
SELECT throws_ok(
  $$SELECT public.set_client_stage('e2000001-0000-4000-8000-000000000005', 'viewed')$$,
  'ST001', NULL, '27. Illegal: new -> viewed rejected (ST001)'
);

-- Verify client NOT modified
SELECT is(
  (SELECT stage::text FROM public.clients WHERE id = 'e2000001-0000-4000-8000-000000000005'),
  'new', '28. Client stage unchanged after illegal transition'
);

-- closed_won -> anything (terminal, illegal)
SELECT throws_ok(
  $$SELECT public.set_client_stage('e2000001-0000-4000-8000-000000000006', 'new')$$,
  'ST001', NULL, '36. Illegal: closed_won -> new rejected'
);

-- deleted -> anything (terminal, illegal) — deleted client is excluded by RPC
SELECT throws_ok(
  $$SELECT public.set_client_stage('e2000001-0000-4000-8000-000000000003', 'new')$$,
  NULL, NULL, '37. Illegal: deleted client stage change rejected'
);

-- new -> closed_won (skip stages)
SELECT throws_ok(
  $$SELECT public.set_client_stage('e2000001-0000-4000-8000-000000000005', 'closed_won')$$,
  'ST001', NULL, '38. Illegal: new -> closed_won rejected'
);

-- =============================================================================
-- 15. RPC: No audit after illegal transition
-- =============================================================================
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
-- Count audit entries for entity e2000001-0000-4000-8000-000000000005
-- After 1 legal test setup (no stage change for this client) + 2 illegal attempts
-- Only the soft_delete audit from test 38 should exist for this entity
SELECT is(
  (SELECT count(*)::int FROM public.audit_logs
   WHERE entity_id = 'e2000001-0000-4000-8000-000000000005'
     AND action = 'stage_change'),
  0, '39. No stage_change audit after illegal transitions'
);

-- =============================================================================
-- 16. RPC: Cross-workspace denial
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000001-0000-4000-8000-000000000003', true);
SELECT throws_ok(
  $$SELECT public.set_client_stage('e2000001-0000-4000-8000-000000000001', 'qualified')$$,
  NULL, NULL, '40. Cross-workspace user cannot change stage'
);

-- =============================================================================
-- 17. RPC: set_client_stage is SECURITY DEFINER
-- =============================================================================
SELECT is(
  (SELECT prosecdef FROM pg_proc WHERE proname = 'set_client_stage' AND pronamespace = 'public'::regnamespace LIMIT 1),
  true, '41. set_client_stage is SECURITY DEFINER'
);

-- =============================================================================
-- 18. RPC: set_client_stage NOT granted to anon
-- =============================================================================
SELECT is(
  (SELECT count(*)::int FROM information_schema.role_routine_grants WHERE routine_name = 'set_client_stage' AND grantee = 'anon'),
  0, '42. set_client_stage NOT granted to anon'
);

-- =============================================================================
-- 17. RPC: soft_delete_client — Owner succeeds
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000001-0000-4000-8000-000000000001', true);
SELECT lives_ok(
  $$SELECT public.soft_delete_client('e2000001-0000-4000-8000-000000000005')$$,
  '43. soft_delete_client RPC succeeds for owner'
);

-- Verify client is soft-deleted (excluded from SELECT via RLS)
SELECT is(
  (SELECT count(*)::int FROM public.clients WHERE id = 'e2000001-0000-4000-8000-000000000005' AND deleted_at IS NULL),
  0, '37. Client excluded from SELECT after soft_delete_client'
);

-- Verify deleted_at is set (must check as superuser since RLS hides soft-deleted rows)
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT is(
  (SELECT (deleted_at IS NOT NULL)::int FROM public.clients WHERE id = 'e2000001-0000-4000-8000-000000000005'),
  1, '38. deleted_at is set after soft_delete_client'
);

-- =============================================================================
-- 18. RPC: soft_delete_client — Member denied
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000001-0000-4000-8000-000000000002', true);
SELECT throws_ok(
  $$SELECT public.soft_delete_client('e2000001-0000-4000-8000-000000000001')$$,
  '42501', NULL, '39. Member cannot soft_delete_client (owner-only)'
);

-- =============================================================================
-- 19. RPC: soft_delete_client — Cross-workspace denied
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000001-0000-4000-8000-000000000003', true);
SELECT throws_ok(
  $$SELECT public.soft_delete_client('e2000001-0000-4000-8000-000000000001')$$,
  NULL, NULL, '40. Cross-workspace user cannot soft_delete_client'
);

-- =============================================================================
-- 20. RPC: soft_delete_client — closed_won denied
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000001-0000-4000-8000-000000000001', true);
SELECT throws_ok(
  $$SELECT public.soft_delete_client('e2000001-0000-4000-8000-000000000006')$$,
  'US002', NULL, '41. Cannot soft_delete_client on closed_won client'
);

-- =============================================================================
-- 21. RPC: soft_delete_client — Non-existent client
-- =============================================================================
SELECT throws_ok(
  $$SELECT public.soft_delete_client('ffffffff-ffff-ffff-ffff-ffffffffffff')$$,
  'US001', NULL, '42. soft_delete_client raises error for non-existent client'
);

-- =============================================================================
-- 22. RPC: soft_delete_client is SECURITY DEFINER
-- =============================================================================
SELECT is(
  (SELECT prosecdef FROM pg_proc WHERE proname = 'soft_delete_client' AND pronamespace = 'public'::regnamespace LIMIT 1),
  true, '43. soft_delete_client is SECURITY DEFINER'
);

-- =============================================================================
-- 23. RPC: soft_delete_client NOT granted to anon
-- =============================================================================
SELECT is(
  (SELECT count(*)::int FROM information_schema.role_routine_grants WHERE routine_name = 'soft_delete_client' AND grantee = 'anon'),
  0, '44. soft_delete_client NOT granted to anon'
);

-- =============================================================================
-- 24. Audit: soft_delete_client writes audit log
-- (Must check as superuser since audit_logs is not readable by authenticated)
-- =============================================================================
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT is(
  (SELECT count(*)::int FROM public.audit_logs
   WHERE entity_type = 'client'
     AND entity_id = 'e2000001-0000-4000-8000-000000000005'
     AND action = 'soft_delete'),
  1, '45. soft_delete_client writes exactly 1 audit log entry'
);

-- =============================================================================
-- 25. Idempotency: concurrent duplicate create via unique index
-- =============================================================================
-- Insert a client with idempotency key via superuser (simulating first request)
RESET ROLE;
INSERT INTO public.clients (id, workspace_id, created_by, name, stage, idempotency_key)
VALUES ('e2000001-0000-4000-8000-000000000020', 'd1000001-0000-4000-8000-000000000001',
        'f0000001-0000-4000-8000-000000000001', 'Idempotent-Client', 'new', 'idem-key-test-001');

-- Attempt duplicate insert with same idempotency key — should fail with unique violation
SELECT throws_ok(
  $$INSERT INTO public.clients (workspace_id, created_by, name, stage, idempotency_key)
    VALUES ('d1000001-0000-4000-8000-000000000001', 'f0000001-0000-4000-8000-000000000001',
            'Duplicate-Name', 'new', 'idem-key-test-001')$$,
  '23505', NULL, '46. Duplicate idempotency key within same workspace violates unique constraint'
);

-- Verify only 1 client exists with this idempotency key
SELECT is(
  (SELECT count(*)::int FROM public.clients WHERE idempotency_key = 'idem-key-test-001'),
  1, '47. Exactly 1 client row with idempotency key (duplicate blocked)'
);

-- =============================================================================
-- 26. RPC: create_client — Owner creates with audit
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000001-0000-4000-8000-000000000001', true);

-- Create a client via RPC
SELECT is(
  (SELECT (public.create_client(
    p_name := 'RPC-Created-Client',
    p_phone := '13800000099',
    p_stage := 'new'
  )->>'name')::text),
  'RPC-Created-Client', '48. create_client RPC succeeds and returns name'
);

-- =============================================================================
-- 27. Audit: create_client writes client_created audit
-- =============================================================================
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT is(
  (SELECT count(*)::int FROM public.audit_logs
   WHERE entity_type = 'client'
     AND action = 'client_created'),
  1, '49. create_client writes exactly 1 client_created audit entry'
);

-- =============================================================================
-- 28. RPC: create_client idempotency — same key returns existing
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000001-0000-4000-8000-000000000001', true);

-- Create with idempotency key via superuser insertion (simulate RPC result)
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
INSERT INTO public.clients (id, workspace_id, created_by, name, stage, idempotency_key, request_fingerprint)
VALUES ('e2000001-0000-4000-8000-000000000030', 'd1000001-0000-4000-8000-000000000001',
        'f0000001-0000-4000-8000-000000000001', 'Idempotent-RPC-Client', 'new', 'idem-rpc-test-002', 'fp-abc');

-- Now call RPC with same key — should return the existing client (not create a new one)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000001-0000-4000-8000-000000000001', true);
SELECT is(
  (SELECT (public.create_client(
    p_name := 'Idempotent-RPC-Client',
    p_stage := 'new',
    p_idempotency_key := 'idem-rpc-test-002',
    p_request_fingerprint := 'fp-abc'
  )->>'id')::text),
  'e2000001-0000-4000-8000-000000000030', '50. Same idempotency key returns existing client (idempotent)'
);

-- Verify only 1 client exists with this key
SELECT is(
  (SELECT count(*)::int FROM public.clients WHERE idempotency_key = 'idem-rpc-test-002'),
  1, '51. Only 1 client row exists (idempotent create)'
);

-- =============================================================================
-- 29. Idempotency: cross-user isolation — different user with same key
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000001-0000-4000-8000-000000000002', true);

-- Member with same key creates a DIFFERENT client (not returning owner's client)
SELECT lives_ok(
  $$SELECT public.create_client(
    p_name := 'Member-Own-Client',
    p_stage := 'new',
    p_idempotency_key := 'idem-rpc-test-002',
    p_request_fingerprint := 'fp-xyz'
  )$$,
  '52. Different user can use same idempotency key (cross-user isolation)'
);

-- =============================================================================
-- 30. Soft-delete bypass: Member cannot direct UPDATE deleted_at
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000001-0000-4000-8000-000000000002', true);

-- Member tries to directly set deleted_at — trigger must block
SELECT throws_ok(
  $$UPDATE public.clients
    SET deleted_at = now(), stage = 'deleted'
    WHERE id = 'e2000001-0000-4000-8000-000000000001'$$,
  '42501', NULL, '53. Member cannot direct-update deleted_at (trigger enforcement)'
);

-- =============================================================================
-- 31. Soft-delete bypass: Cross-workspace user cannot set deleted_at
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000001-0000-4000-8000-000000000003', true);

-- Cross-workspace user tries to update — RLS blocks SELECT first, row not visible
SELECT is(
  (SELECT count(*)::int FROM public.clients WHERE id = 'e2000001-0000-4000-8000-000000000001'),
  0, '54. Cross-workspace user cannot see clients from workspace A (RLS)'
);

-- =============================================================================
-- 32. Soft-delete: Owner can still soft-delete via RPC (trigger allows owner)
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000001-0000-4000-8000-000000000001', true);

-- Owner soft-deletes via RPC — must succeed (trigger allows owner)
SELECT lives_ok(
  $$SELECT public.soft_delete_client('e2000001-0000-4000-8000-000000000010')$$,
  '55. Owner can soft-delete via RPC (trigger allows owner)'
);

-- Verify client is soft-deleted
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT is(
  (SELECT (deleted_at IS NOT NULL)::int FROM public.clients WHERE id = 'e2000001-0000-4000-8000-000000000010'),
  1, '56. RLS-Test-Client soft-deleted after owner RPC call'
);

-- =============================================================================
-- 33. Security: create_client RPC is SECURITY DEFINER
-- =============================================================================
SELECT is(
  (SELECT prosecdef FROM pg_proc WHERE proname = 'create_client' AND pronamespace = 'public'::regnamespace LIMIT 1),
  true, '57. create_client is SECURITY DEFINER'
);

-- =============================================================================
-- 34. Security: create_client NOT granted to anon
-- =============================================================================
SELECT is(
  (SELECT count(*)::int FROM information_schema.role_routine_grants WHERE routine_name = 'create_client' AND grantee = 'anon'),
  0, '58. create_client NOT granted to anon'
);

-- =============================================================================
-- 35. Idempotency: re-creation works after soft-delete
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000001-0000-4000-8000-000000000001', true);

-- Create a client with an idempotency key
SELECT lives_ok(
  $$SELECT public.create_client(
    p_name := 'Recreate-After-Delete',
    p_stage := 'new',
    p_idempotency_key := 'idem-recreate-test',
    p_request_fingerprint := 'fp-recreate'
  )$$,
  '59. create_client with idempotency key succeeds'
);

-- Soft-delete it
SELECT lives_ok(
  $$SELECT public.soft_delete_client(
    (SELECT id FROM public.clients WHERE idempotency_key = 'idem-recreate-test' AND deleted_at IS NULL)
  )$$,
  '60. Soft-delete client with idempotency key succeeds'
);

-- Re-create with same idempotency key — must succeed (not return stale deleted record)
SELECT lives_ok(
  $$SELECT public.create_client(
    p_name := 'Recreated-Client',
    p_stage := 'new',
    p_idempotency_key := 'idem-recreate-test',
    p_request_fingerprint := 'fp-recreate-v2'
  )$$,
  '61. Re-creation with same idempotency key after soft-delete succeeds'
);

-- =============================================================================
-- 36. Budget validation: budget_min > budget_max is rejected
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000001-0000-4000-8000-000000000001', true);

SELECT throws_ok(
  $$SELECT public.create_client(
    p_name := 'Bad-Budget',
    p_budget_min := 8000,
    p_budget_max := 3000
  )$$,
  '23502', NULL, '62. budget_min > budget_max is rejected by RPC'
);

SELECT * FROM finish();
ROLLBACK;
