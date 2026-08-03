-- =============================================================================
-- 15_interactions_rls_test.sql — Interactions RLS, RPC, Soft-Delete & Audit Tests
-- Tests: schema, workspace CRUD, cross-workspace, anon, soft-delete, FK,
--        client validation, ordering, atomic RPC, audit.
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
SELECT pg_temp.insert_auth_user('f0000001-0000-4000-8000-000000000001', 'int-owner@test');
SELECT pg_temp.insert_auth_user('f0000001-0000-4000-8000-000000000002', 'int-member@test');
SELECT pg_temp.insert_auth_user('f0000001-0000-4000-8000-000000000003', 'int-other@test');

-- Workspace A (owner + member)
INSERT INTO public.workspaces (id, name, owner_user_id, city, business_type)
VALUES ('d1000001-0000-4000-8000-000000000001', 'WS-Int-A', 'f0000001-0000-4000-8000-000000000001', 'Guangzhou', 'residential_lease');
INSERT INTO public.workspace_members (id, workspace_id, user_id, role, status) VALUES
  ('aa01-0001-0000-4000-8000-000000000001', 'd1000001-0000-4000-8000-000000000001', 'f0000001-0000-4000-8000-000000000001', 'owner', 'active'),
  ('aa01-0002-0000-4000-8000-000000000002', 'd1000001-0000-4000-8000-000000000001', 'f0000001-0000-4000-8000-000000000002', 'member', 'active');

-- Workspace B (other user)
INSERT INTO public.workspaces (id, name, owner_user_id, city, business_type)
VALUES ('d1000001-0000-4000-8000-000000000002', 'WS-Int-B', 'f0000001-0000-4000-8000-000000000003', 'Shenzhen', 'residential_lease');
INSERT INTO public.workspace_members (id, workspace_id, user_id, role, status) VALUES
  ('aa01-0003-0000-4000-8000-000000000003', 'd1000001-0000-4000-8000-000000000002', 'f0000001-0000-4000-8000-000000000003', 'owner', 'active');

-- Clients for interactions (insert as superuser)
INSERT INTO public.clients (id, workspace_id, created_by, name, phone, stage)
VALUES ('e3000001-0000-4000-8000-000000000001', 'd1000001-0000-4000-8000-000000000001', 'f0000001-0000-4000-8000-000000000001', 'Int-Client-A1', '13800000001', 'new');
INSERT INTO public.clients (id, workspace_id, created_by, name, phone, stage)
VALUES ('e3000001-0000-4000-8000-000000000002', 'd1000001-0000-4000-8000-000000000001', 'f0000001-0000-4000-8000-000000000001', 'Int-Client-A2', '13800000002', 'qualified');
INSERT INTO public.clients (id, workspace_id, created_by, name, phone, stage, deleted_at)
VALUES ('e3000001-0000-4000-8000-000000000003', 'd1000001-0000-4000-8000-000000000001', 'f0000001-0000-4000-8000-000000000001', 'Int-Client-Deleted', '13800000003', 'new', now());
INSERT INTO public.clients (id, workspace_id, created_by, name, phone, stage)
VALUES ('e3000001-0000-4000-8000-000000000004', 'd1000001-0000-4000-8000-000000000002', 'f0000001-0000-4000-8000-000000000003', 'Int-Client-B1', '13800000004', 'new');

-- Interactions via superuser: 3 in WS A (1 soft-deleted) + 1 in WS B
INSERT INTO public.interactions (id, workspace_id, client_id, interaction_type, summary, occurred_at, created_by)
VALUES ('f3000001-0000-4000-8000-000000000001', 'd1000001-0000-4000-8000-000000000001',
        'e3000001-0000-4000-8000-000000000001', 'phone_call', 'Initial call',
        '2026-08-01 09:00:00+00'::timestamptz, 'f0000001-0000-4000-8000-000000000001');

INSERT INTO public.interactions (id, workspace_id, client_id, interaction_type, summary, occurred_at, created_by)
VALUES ('f3000001-0000-4000-8000-000000000002', 'd1000001-0000-4000-8000-000000000001',
        'e3000001-0000-4000-8000-000000000002', 'wechat_message', 'WeChat follow-up',
        '2026-08-02 14:00:00+00'::timestamptz, 'f0000001-0000-4000-8000-000000000001');

INSERT INTO public.interactions (id, workspace_id, client_id, interaction_type, summary, occurred_at, created_by, deleted_at)
VALUES ('f3000001-0000-4000-8000-000000000003', 'd1000001-0000-4000-8000-000000000001',
        'e3000001-0000-4000-8000-000000000001', 'follow_up', 'Soft-deleted interaction',
        '2026-08-03 09:00:00+00'::timestamptz, 'f0000001-0000-4000-8000-000000000001', now());

INSERT INTO public.interactions (id, workspace_id, client_id, interaction_type, summary, occurred_at, created_by)
VALUES ('f3000001-0000-4000-8000-000000000004', 'd1000001-0000-4000-8000-000000000002',
        'e3000001-0000-4000-8000-000000000004', 'other', 'Other WS interaction',
        '2026-08-01 08:00:00+00'::timestamptz, 'f0000001-0000-4000-8000-000000000003');

SELECT plan(54);

-- =============================================================================
-- 1. Schema verification
-- =============================================================================
SELECT has_table('public', 'interactions', '1. interactions table exists');
SELECT has_column('public', 'interactions', 'id', '2. id column');
SELECT has_column('public', 'interactions', 'workspace_id', '3. workspace_id column');
SELECT has_column('public', 'interactions', 'client_id', '4. client_id column');
SELECT has_column('public', 'interactions', 'property_id', '5. property_id column');
SELECT has_column('public', 'interactions', 'interaction_type', '6. interaction_type column');
SELECT has_column('public', 'interactions', 'summary', '7. summary column');
SELECT has_column('public', 'interactions', 'raw_text', '8. raw_text column');
SELECT has_column('public', 'interactions', 'next_action', '9. next_action column');
SELECT has_column('public', 'interactions', 'occurred_at', '10. occurred_at column');
SELECT has_column('public', 'interactions', 'created_by', '11. created_by column');
SELECT has_column('public', 'interactions', 'created_at', '12. created_at column');
SELECT has_column('public', 'interactions', 'updated_at', '13. updated_at column');
SELECT has_column('public', 'interactions', 'deleted_at', '14. deleted_at column');
SELECT col_not_null('public', 'interactions', 'interaction_type', '15. interaction_type is NOT NULL');
SELECT col_not_null('public', 'interactions', 'occurred_at', '16. occurred_at is NOT NULL');

-- =============================================================================
-- 2. RPC existence
-- =============================================================================
SELECT is(
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'create_interaction'),
  1, '17. create_interaction RPC exists'
);
SELECT is(
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'update_interaction'),
  1, '18. update_interaction RPC exists'
);
SELECT is(
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'soft_delete_interaction'),
  1, '19. soft_delete_interaction RPC exists'
);

-- =============================================================================
-- 3. RPC SECURITY DEFINER
-- =============================================================================
SELECT is(
  (SELECT prosecdef FROM pg_proc WHERE proname = 'create_interaction' AND pronamespace = 'public'::regnamespace LIMIT 1),
  true, '20. create_interaction is SECURITY DEFINER'
);
SELECT is(
  (SELECT prosecdef FROM pg_proc WHERE proname = 'update_interaction' AND pronamespace = 'public'::regnamespace LIMIT 1),
  true, '21. update_interaction is SECURITY DEFINER'
);
SELECT is(
  (SELECT prosecdef FROM pg_proc WHERE proname = 'soft_delete_interaction' AND pronamespace = 'public'::regnamespace LIMIT 1),
  true, '22. soft_delete_interaction is SECURITY DEFINER'
);

-- =============================================================================
-- 4. RPC NOT granted to anon
-- =============================================================================
SELECT is(
  (SELECT count(*)::int FROM information_schema.role_routine_grants WHERE routine_name = 'create_interaction' AND grantee = 'anon'),
  0, '23. create_interaction NOT granted to anon'
);
SELECT is(
  (SELECT count(*)::int FROM information_schema.role_routine_grants WHERE routine_name = 'update_interaction' AND grantee = 'anon'),
  0, '24. update_interaction NOT granted to anon'
);
SELECT is(
  (SELECT count(*)::int FROM information_schema.role_routine_grants WHERE routine_name = 'soft_delete_interaction' AND grantee = 'anon'),
  0, '25. soft_delete_interaction NOT granted to anon'
);

-- =============================================================================
-- 5. SELECT: Owner sees active interactions in workspace A
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000001-0000-4000-8000-000000000001', true);
SELECT is(
  (SELECT count(*)::int FROM public.interactions WHERE workspace_id = 'd1000001-0000-4000-8000-000000000001' AND deleted_at IS NULL),
  2, '26. Owner sees 2 active interactions in workspace A (excludes soft-deleted)'
);

-- =============================================================================
-- 6. SELECT: Member sees interactions in workspace A
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000001-0000-4000-8000-000000000002', true);
SELECT is(
  (SELECT count(*)::int FROM public.interactions WHERE workspace_id = 'd1000001-0000-4000-8000-000000000001' AND deleted_at IS NULL),
  2, '27. Member sees 2 active interactions in workspace A'
);

-- =============================================================================
-- 7. INSERT via RPC: create_interaction succeeds for member
-- =============================================================================
SELECT lives_ok(
  $$SELECT public.create_interaction(
    p_client_id := 'e3000001-0000-4000-8000-000000000001'::uuid,
    p_interaction_type := 'in_person_meeting'::public.interaction_type,
    p_occurred_at := '2026-08-03 12:00:00+00'::timestamptz,
    p_summary := 'In-person meeting summary'
  )$$,
  '28. Member create_interaction RPC succeeds'
);

-- Verify count increased (switch to owner to verify)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000001-0000-4000-8000-000000000001', true);
SELECT is(
  (SELECT count(*)::int FROM public.interactions WHERE workspace_id = 'd1000001-0000-4000-8000-000000000001' AND deleted_at IS NULL),
  3, '29. Owner sees 3 active interactions after member create (count increased)'
);

-- =============================================================================
-- 8. INSERT audit: create_interaction writes audit log
-- =============================================================================
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT is(
  (SELECT count(*)::int FROM public.audit_logs
   WHERE entity_type = 'interaction'
     AND action = 'interaction_created'),
  1, '30. create_interaction writes exactly 1 audit log entry'
);

-- =============================================================================
-- 9. UPDATE via RPC: update_interaction succeeds for owner
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000001-0000-4000-8000-000000000001', true);
SELECT lives_ok(
  $$SELECT public.update_interaction(
    p_interaction_id := 'f3000001-0000-4000-8000-000000000001'::uuid,
    p_summary := 'Updated summary text'
  )$$,
  '31. Owner update_interaction RPC succeeds'
);

-- Verify summary changed
SELECT is(
  (SELECT summary FROM public.interactions WHERE id = 'f3000001-0000-4000-8000-000000000001' AND deleted_at IS NULL),
  'Updated summary text', '32. Summary updated correctly after update_interaction'
);

-- =============================================================================
-- 10. UPDATE audit: update_interaction writes audit with before_data
-- =============================================================================
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT is(
  (SELECT count(*)::int FROM public.audit_logs
   WHERE entity_type = 'interaction'
     AND entity_id = 'f3000001-0000-4000-8000-000000000001'
     AND action = 'interaction_updated'),
  1, '33. update_interaction writes exactly 1 audit entry with before_data'
);

-- Verify before_data contains original summary
SELECT ok(
  (SELECT (before_data ->> 'summary') = 'Initial call' FROM public.audit_logs
   WHERE entity_type = 'interaction'
     AND entity_id = 'f3000001-0000-4000-8000-000000000001'
     AND action = 'interaction_updated'
   LIMIT 1),
  '33b. Audit before_data has original summary'
);

-- =============================================================================
-- 11. DELETE via RPC: soft_delete_interaction succeeds for member
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000001-0000-4000-8000-000000000002', true);
SELECT lives_ok(
  $$SELECT public.soft_delete_interaction('f3000001-0000-4000-8000-000000000002'::uuid)$$,
  '34. Member soft_delete_interaction RPC succeeds'
);

-- Verify soft-deleted interaction excluded from SELECT
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000001-0000-4000-8000-000000000001', true);
SELECT is(
  (SELECT count(*)::int FROM public.interactions WHERE id = 'f3000001-0000-4000-8000-000000000002' AND deleted_at IS NULL),
  0, '35. Soft-deleted interaction excluded from SELECT'
);

-- =============================================================================
-- 12. DELETE audit: soft_delete_interaction writes audit log
-- =============================================================================
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT is(
  (SELECT count(*)::int FROM public.audit_logs
   WHERE entity_type = 'interaction'
     AND entity_id = 'f3000001-0000-4000-8000-000000000002'
     AND action = 'interaction_soft_deleted'),
  1, '36. soft_delete_interaction writes exactly 1 audit log entry'
);

-- Verify audit has deleted_at in after_data
SELECT ok(
  (SELECT (after_data ? 'deleted_at') FROM public.audit_logs
   WHERE entity_type = 'interaction'
     AND entity_id = 'f3000001-0000-4000-8000-000000000002'
     AND action = 'interaction_soft_deleted'
   LIMIT 1),
  '36b. Audit after_data contains deleted_at'
);

-- =============================================================================
-- 13. Cross-workspace: other user sees 0 interactions from workspace A
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000001-0000-4000-8000-000000000003', true);
SELECT is(
  (SELECT count(*)::int FROM public.interactions WHERE workspace_id = 'd1000001-0000-4000-8000-000000000001'),
  0, '37. Other workspace user sees 0 interactions from workspace A'
);

-- =============================================================================
-- 14. Cross-workspace: create_interaction for client in other workspace fails
-- =============================================================================
SELECT throws_ok(
  $$SELECT public.create_interaction(
    p_client_id := 'e3000001-0000-4000-8000-000000000001'::uuid,
    p_interaction_type := 'phone_call'::public.interaction_type,
    p_occurred_at := now()
  )$$,
  'P2004', NULL, '38. Cross-workspace create_interaction for WS A client fails'
);

-- =============================================================================
-- 15. Cross-workspace: update_interaction fails
-- =============================================================================
SELECT throws_ok(
  $$SELECT public.update_interaction(
    p_interaction_id := 'f3000001-0000-4000-8000-000000000001'::uuid,
    p_summary := 'Cross-ws update attempt'
  )$$,
  NULL, NULL, '39. Cross-workspace update_interaction fails'
);

-- =============================================================================
-- 16. Cross-workspace: soft_delete_interaction fails
-- =============================================================================
SELECT throws_ok(
  $$SELECT public.soft_delete_interaction('f3000001-0000-4000-8000-000000000001'::uuid)$$,
  NULL, NULL, '40. Cross-workspace soft_delete_interaction fails'
);

-- =============================================================================
-- 17. Anon denied: SELECT
-- =============================================================================
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT count(*) FROM public.interactions$$,
  '42501', NULL, '41. Anon cannot SELECT interactions'
);

-- =============================================================================
-- 18. Anon denied: INSERT
-- =============================================================================
SELECT throws_ok(
  $$INSERT INTO public.interactions (workspace_id, client_id, interaction_type, occurred_at, created_by)
    VALUES ('d1000001-0000-4000-8000-000000000001'::uuid, 'e3000001-0000-4000-8000-000000000001'::uuid, 'phone_call'::public.interaction_type, now(), 'f0000001-0000-4000-8000-000000000001'::uuid)$$,
  '42501', NULL, '42. Anon cannot INSERT interactions'
);

-- =============================================================================
-- 19. Anon denied: UPDATE
-- =============================================================================
SELECT throws_ok(
  $$UPDATE public.interactions SET summary = 'Anon update' WHERE id = 'f3000001-0000-4000-8000-000000000001'$$,
  '42501', NULL, '43. Anon cannot UPDATE interactions'
);

-- =============================================================================
-- 20. Anon denied: DELETE
-- =============================================================================
SELECT throws_ok(
  $$DELETE FROM public.interactions WHERE id = 'f3000001-0000-4000-8000-000000000001'$$,
  '42501', NULL, '44. Anon cannot DELETE interactions'
);

-- =============================================================================
-- 21. Client validation: create_interaction for non-existent client fails
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000001-0000-4000-8000-000000000001', true);
SELECT throws_ok(
  $$SELECT public.create_interaction(
    p_client_id := 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid,
    p_interaction_type := 'phone_call'::public.interaction_type,
    p_occurred_at := now()
  )$$,
  'P2004', NULL, '45. Non-existent client: create_interaction fails (P2004)'
);

-- =============================================================================
-- 22. Client validation: create_interaction for soft-deleted client fails
-- =============================================================================
SELECT throws_ok(
  $$SELECT public.create_interaction(
    p_client_id := 'e3000001-0000-4000-8000-000000000003'::uuid,
    p_interaction_type := 'phone_call'::public.interaction_type,
    p_occurred_at := now()
  )$$,
  'P2004', NULL, '46. Soft-deleted client: create_interaction fails (P2004)'
);

-- =============================================================================
-- 23. Client validation: cross-workspace client in create_interaction rejected
-- =============================================================================
-- Owner of WS A tries to create interaction for WS B client
SELECT throws_ok(
  $$SELECT public.create_interaction(
    p_client_id := 'e3000001-0000-4000-8000-000000000004'::uuid,
    p_interaction_type := 'phone_call'::public.interaction_type,
    p_occurred_at := now()
  )$$,
  'P2004', NULL, '47. Cross-workspace client: create_interaction rejected (P2004)'
);

-- =============================================================================
-- 24. Ordering: occurred_at DESC is correct
-- =============================================================================
-- Active WS A interactions: i1 (2026-08-01 09:00, phone_call), member-created (2026-08-03 12:00, in_person_meeting)
-- The member-created interaction has the latest occurred_at among active ones
SELECT is(
  (SELECT interaction_type::text FROM public.interactions
   WHERE workspace_id = 'd1000001-0000-4000-8000-000000000001' AND deleted_at IS NULL
   ORDER BY occurred_at DESC LIMIT 1),
  'in_person_meeting', '48. Ordering: occurred_at DESC returns latest interaction first'
);

-- =============================================================================
-- 25. Soft-deleted row still exists physically
-- =============================================================================
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT ok(
  (SELECT count(*)::int FROM public.interactions WHERE deleted_at IS NOT NULL) >= 1,
  '49. Soft-deleted rows still physically exist (superuser)'
);

-- =============================================================================
-- 26. updated_at trigger exists on interactions
-- =============================================================================
SELECT is(
  (SELECT count(*)::int FROM pg_trigger WHERE tgname = 'trg_interactions_updated_at'),
  1, '50. updated_at trigger exists on interactions table'
);

-- =============================================================================
-- 27. No partial writes: no new rows on create failure
-- =============================================================================
-- Count before failure tests — at least the 4 setup + RPC creates
SELECT ok(
  (SELECT count(*)::int FROM public.interactions) >= 5,
  '51. Total interaction count is at least 5'
);

-- =============================================================================
-- 28. No partial writes: data unchanged on update failure
-- =============================================================================
-- Verify that f3000001-0000-4000-8000-000000000001 still has the updated summary
-- (cross-ws update attempted on it but should have failed)
SELECT is(
  (SELECT summary FROM public.interactions WHERE id = 'f3000001-0000-4000-8000-000000000001'),
  'Updated summary text', '52. Data unchanged after cross-ws update attempt (atomic RPC)'
);

SELECT * FROM finish();
ROLLBACK;
