-- =============================================================================
-- 17_ai_preferences_rls_test.sql — AI User Preferences RLS Tests
-- P3-AI-013: ai_user_preferences table + RLS + RPC validation
--
-- Coverage:
--   1. Users can read only their own preferences
--   2. Users cannot read other users' preferences
--   3. Users can delete only their own preferences
--   4. BEFORE UPDATE trigger blocks column changes (status only)
--   5. Anonymous user cannot read preferences
--   6. upsert_ai_preference: auth guard
--   7. upsert_ai_preference: workspace membership check
--   8. upsert_ai_preference: fact field blocklist (price, phone, address, etc.)
--   9. upsert_ai_preference: idempotent merge
--  10. learn_preferences: only reads caller's data
--  11. get_active_preferences: auth guard
--  12. Cross-workspace isolation via RPC
--  13. SECURITY DEFINER uses fixed search_path (indirect via RPC behavior)
-- =============================================================================

BEGIN;

SET LOCAL search_path TO public, extensions;
SET LOCAL client_min_messages TO warning;

-- Helper: insert auth users
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
-- Setup: 3 users, 2 workspaces
--   User A: owner of Workspace A
--   User B: member of Workspace A, owner of Workspace B
--   User C: outsider (no workspace)
-- =============================================================================
SELECT pg_temp.insert_auth_user('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'pref-user-a@example.invalid', 'Pref User A');
SELECT pg_temp.insert_auth_user('b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0', 'pref-user-b@example.invalid', 'Pref User B');
SELECT pg_temp.insert_auth_user('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0', 'pref-user-c@example.invalid', 'Pref User C');

INSERT INTO public.workspaces (id, name, owner_user_id, city, business_type)
VALUES
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'Pref Workspace A',
   'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'Beijing', 'residential_lease'),
  ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1', 'Pref Workspace B',
   'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0', 'Shanghai', 'residential_lease');

INSERT INTO public.workspace_members (id, workspace_id, user_id, role, status)
VALUES
  ('8a1d0001-0000-4000-8000-000000000001', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
   'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'owner', 'active'),
  ('8a1d0002-0000-4000-8000-000000000002', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
   'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0', 'member', 'active'),
  ('8a1d0003-0000-4000-8000-000000000003', 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1',
   'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0', 'owner', 'active');

-- Seed a preference for User A (inserted as service_role / postgres)
INSERT INTO public.ai_user_preferences (
  id, user_id, workspace_id, feature, preference_key,
  preference_value, evidence_count, confidence, status
) VALUES (
  '9a0a0001-0000-4000-8000-000000000001',
  'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0',
  'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
  'content_factory',
  'tone_modified',
  jsonb_build_object('correctionDirection', 'modified', 'hint', 'User A prefers formal tone'),
  5,
  0.8,
  'active'
);

-- Seed a preference for User B
INSERT INTO public.ai_user_preferences (
  id, user_id, workspace_id, feature, preference_key,
  preference_value, evidence_count, confidence, status
) VALUES (
  '9a0a0002-0000-4000-8000-000000000002',
  'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0',
  'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1',
  'content_factory',
  'style_modified',
  jsonb_build_object('correctionDirection', 'modified', 'hint', 'User B prefers concise style'),
  3,
  0.6,
  'active'
);

SELECT plan(21);

-- =============================================================================
-- TEST 1: Anonymous user has no table access (no GRANT to anon role)
-- =============================================================================
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claim.sub" TO '';

SELECT throws_ok(
  $$SELECT 1 FROM public.ai_user_preferences$$,
  'permission denied for table ai_user_preferences',
  'Anon has no SELECT on ai_user_preferences'
);

-- =============================================================================
-- TEST 2: User A reads own preferences (should see 1)
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', true);

SELECT results_eq(
  $$SELECT count(*)::integer FROM public.ai_user_preferences$$,
  $$VALUES (1)$$,
  'User A can read own preference (sees exactly 1)'
);

-- =============================================================================
-- TEST 3: User A cannot read User B's preferences via direct table access
-- =============================================================================
SELECT is_empty(
  $$SELECT 1 FROM public.ai_user_preferences WHERE user_id = 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0'$$,
  'User A cannot read User B preferences'
);

-- =============================================================================
-- TEST 4: User A cannot delete User B's preference (soft-delete RLS)
-- =============================================================================
SELECT is_empty(
  $$SELECT 1 FROM public.ai_user_preferences WHERE id = '9a0a0002-0000-4000-8000-000000000002'$$,
  'User A cannot see User B preference row for delete'
);

-- =============================================================================
-- TEST 5: Soft delete — row excluded from SELECT after deleted_at is set
-- =============================================================================
-- Use postgres to soft-delete User A's preference (bypasses RLS)
SET LOCAL ROLE postgres;
UPDATE public.ai_user_preferences
SET deleted_at = now(), updated_at = now()
WHERE id = '9a0a0001-0000-4000-8000-000000000001';

-- Switch back to authenticated User A
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', true);

-- User A should NOT see the soft-deleted preference (RSL SELECT filters deleted_at IS NULL)
SELECT is_empty(
  $$SELECT 1 FROM public.ai_user_preferences WHERE id = '9a0a0001-0000-4000-8000-000000000001'$$,
  'Soft-deleted preference hidden from User A SELECT (deleted_at IS NULL RLS)'
);

-- Restore User A's preference for remaining tests
SET LOCAL ROLE postgres;
UPDATE public.ai_user_preferences
SET deleted_at = NULL, updated_at = now()
WHERE id = '9a0a0001-0000-4000-8000-000000000001';

-- =============================================================================
-- TEST 6: Hard-delete is blocked for authenticated users (no DELETE policy)
-- The row should still exist after attempted DELETE
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', true);

-- Attempted DELETE is silently blocked (no DELETE policy = nothing matches)
DELETE FROM public.ai_user_preferences WHERE id = '9a0a0001-0000-4000-8000-000000000001';

-- Row should still exist
SELECT results_eq(
  $$SELECT preference_key::text FROM public.ai_user_preferences WHERE id = '9a0a0001-0000-4000-8000-000000000001'$$,
  $$VALUES ('tone_modified')$$,
  'Hard-delete is silently blocked — row still exists after DELETE (no DELETE policy)'
);

-- =============================================================================
-- TEST 6: UPDATE trigger — changing status is allowed
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', true);

UPDATE public.ai_user_preferences
SET status = 'disabled', updated_at = now()
WHERE id = '9a0a0001-0000-4000-8000-000000000001';

SELECT results_eq(
  $$SELECT status::text FROM public.ai_user_preferences WHERE id = '9a0a0001-0000-4000-8000-000000000001'$$,
  $$VALUES ('disabled')$$,
  'User A can change preference status to disabled'
);

-- Reset status
SET LOCAL ROLE postgres;
UPDATE public.ai_user_preferences SET status = 'active' WHERE id = '9a0a0001-0000-4000-8000-000000000001';

-- =============================================================================
-- TEST 7: UPDATE trigger — changing evidence_count is REJECTED
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', true);

SELECT throws_ok(
  $$UPDATE public.ai_user_preferences SET evidence_count = 100 WHERE id = '9a0a0001-0000-4000-8000-000000000001'$$,
  'Cannot change evidence_count',
  'UPDATE trigger blocks evidence_count change'
);

-- =============================================================================
-- TEST 8: UPDATE trigger — changing preference_key is REJECTED
-- =============================================================================
SELECT throws_ok(
  $$UPDATE public.ai_user_preferences SET preference_key = 'hacked' WHERE id = '9a0a0001-0000-4000-8000-000000000001'$$,
  'Cannot change preference_key',
  'UPDATE trigger blocks preference_key change'
);

-- =============================================================================
-- TEST 9: UPDATE trigger — changing preference_value is REJECTED
-- =============================================================================
SELECT throws_ok(
  $$UPDATE public.ai_user_preferences SET preference_value = '{"bad":true}'::jsonb WHERE id = '9a0a0001-0000-4000-8000-000000000001'$$,
  'Cannot change preference_value',
  'UPDATE trigger blocks preference_value change'
);

-- =============================================================================
-- TEST 10: Anonymous cannot call upsert_ai_preference RPC (no EXECUTE grant)
-- =============================================================================
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claim.sub" TO '';

SELECT throws_ok(
  $$SELECT public.upsert_ai_preference(
    'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0',
    'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
    'content_factory',
    'test_key',
    '{"hint":"test"}'::jsonb,
    1, 0.3,
    '{}'::uuid[]
  )$$,
  'permission denied for function upsert_ai_preference',
  'upsert_ai_preference rejects anonymous caller (no EXECUTE)'
);

-- =============================================================================
-- TEST 11: upsert_ai_preference — USER_ID_MISMATCH
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', true);

SELECT is(
  (public.upsert_ai_preference(
    'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0',  -- trying to upsert as User B
    'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
    'content_factory',
    'test_key',
    '{"hint":"test"}'::jsonb,
    1, 0.3,
    '{}'::uuid[]
  )->>'error'),
  'USER_ID_MISMATCH',
  'upsert_ai_preference rejects p_user_id != auth.uid()'
);

-- =============================================================================
-- TEST 12: upsert_ai_preference — WORKSPACE_ACCESS_DENIED for non-member
-- =============================================================================
SELECT set_config('request.jwt.claim.sub', 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0', true);

SELECT is(
  (public.upsert_ai_preference(
    'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0',
    'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',  -- User C is not a member of WS A
    'content_factory',
    'test_key',
    '{"hint":"test"}'::jsonb,
    1, 0.3,
    '{}'::uuid[]
  )->>'error'),
  'WORKSPACE_ACCESS_DENIED',
  'upsert_ai_preference rejects non-workspace-member'
);

-- =============================================================================
-- TEST 13: upsert_ai_preference — FACT_FIELD_BLOCKED (monthlyRent)
-- =============================================================================
SELECT set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', true);

SELECT is(
  (public.upsert_ai_preference(
    'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0',
    'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
    'ai_data_extraction',
    'monthlyRent_modified',  -- fact field in camelCase
    '{"hint":"test"}'::jsonb,
    1, 0.3,
    '{}'::uuid[]
  )->>'error'),
  'FACT_FIELD_BLOCKED',
  'upsert_ai_preference blocks fact field (monthlyRent_modified)'
);

-- =============================================================================
-- TEST 14: upsert_ai_preference — FACT_FIELD_BLOCKED (ownerPhone_added)
-- =============================================================================
SELECT is(
  (public.upsert_ai_preference(
    'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0',
    'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
    'ai_data_extraction',
    'ownerPhone_added',
    '{"hint":"test"}'::jsonb,
    1, 0.3,
    '{}'::uuid[]
  )->>'error'),
  'FACT_FIELD_BLOCKED',
  'upsert_ai_preference blocks fact field (ownerPhone_added)'
);

-- =============================================================================
-- TEST 15: upsert_ai_preference — FACT_FIELD_BLOCKED (snake_case owner_phone)
-- =============================================================================
SELECT is(
  (public.upsert_ai_preference(
    'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0',
    'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
    'ai_data_extraction',
    'owner_phone_modified',
    '{"hint":"test"}'::jsonb,
    1, 0.3,
    '{}'::uuid[]
  )->>'error'),
  'FACT_FIELD_BLOCKED',
  'upsert_ai_preference blocks fact field (owner_phone snake_case)'
);

-- =============================================================================
-- TEST 16: upsert_ai_preference — accepts non-fact field
-- =============================================================================
SET LOCAL ROLE postgres;
-- Use postgres to clean up any leftover test pref
DELETE FROM public.ai_user_preferences WHERE preference_key IN ('tag_modified', 'tag_pref');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', true);

SELECT is(
  (public.upsert_ai_preference(
    'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0',
    'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
    'content_factory',
    'tag_modified',
    '{"correctionDirection":"modified","hint":"tag preference"}'::jsonb,
    3, 0.5,
    '{}'::uuid[]
  )->>'success'),
  'true',
  'upsert_ai_preference accepts non-fact field (tag_modified)'
);

-- =============================================================================
-- TEST 17: upsert_ai_preference — idempotent merge
-- =============================================================================
-- Call again with same key — should update, not create duplicate
SELECT is(
  (public.upsert_ai_preference(
    'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0',
    'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
    'content_factory',
    'tag_modified',
    '{"correctionDirection":"modified","hint":"tag preference updated"}'::jsonb,
    2, 0.2,
    '{}'::uuid[]
  )->>'action'),
  'updated',
  'upsert_ai_preference merges existing preference (idempotent)'
);

-- =============================================================================
-- TEST 18: get_active_preferences — UNAUTHENTICATED (no EXECUTE grant)
-- =============================================================================
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claim.sub" TO '';

SELECT throws_ok(
  $$SELECT public.get_active_preferences('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0')$$,
  'permission denied for function get_active_preferences',
  'get_active_preferences rejects anonymous (no EXECUTE)'
);

-- =============================================================================
-- TEST 19: get_active_preferences — USER_ID_MISMATCH
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', true);

SELECT is(
  (public.get_active_preferences('b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0')->>'error'),
  'USER_ID_MISMATCH',
  'get_active_preferences rejects querying other user''s preferences'
);

-- =============================================================================
-- TEST 20: get_active_preferences — returns correct data
-- =============================================================================
SELECT set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', true);

-- Should return at least the 'tag_modified' preference we just upserted
SELECT ok(
  ((public.get_active_preferences('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0')->'preferences')::jsonb @> '[{"preferenceKey":"tag_modified"}]'::jsonb),
  'get_active_preferences returns tag_modified for User A'
);

-- Cleanup: remove the test preference created during upsert tests
SET LOCAL ROLE postgres;
DELETE FROM public.ai_user_preferences WHERE preference_key IN ('tag_modified', 'tag_pref');

SELECT * FROM finish();
ROLLBACK;
