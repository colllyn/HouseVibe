-- =============================================================================
-- 20_content_tables_rls_test.sql — Content Tables RLS Tests (P3-AI-021 prereq)
-- Tests: content_projects, content_versions, publishing_records RLS
-- =============================================================================

BEGIN;
SET LOCAL search_path TO public, extensions;

-- =============================================================================
-- Helper: insert auth user
-- =============================================================================
CREATE OR REPLACE FUNCTION pg_temp.insert_auth_user(p_id uuid, p_email text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'auth, pg_catalog'
AS $$
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data, aud, role, encrypted_password, created_at, updated_at)
  VALUES (p_id, p_email, '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated', '', now(), now());
END;
$$;

-- Test users
-- User A (content_factory): aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- User B (no content_factory): bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb
-- User C (workspace B, content_factory): cccccccc-cccc-cccc-cccc-cccccccccccc
-- User D (no workspace at all): dddddddd-dddd-dddd-dddd-dddddddddddd

SELECT pg_temp.insert_auth_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'usera@test');
SELECT pg_temp.insert_auth_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'userb@test');
SELECT pg_temp.insert_auth_user('cccccccc-cccc-cccc-cccc-cccccccccccc', 'userc@test');
SELECT pg_temp.insert_auth_user('dddddddd-dddd-dddd-dddd-dddddddddddd', 'userd@test');

-- Workspaces
INSERT INTO public.workspaces (id, name, owner_user_id, city, business_type) VALUES
  ('8cae1001-0000-4000-8000-000000000001', 'WA', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'GZ', 'residential_lease'),
  ('8cae1002-0000-4000-8000-000000000002', 'WB', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'GZ', 'residential_lease');

-- Memberships
INSERT INTO public.workspace_members (id, workspace_id, user_id, role, status) VALUES
  ('9cae2001-0000-4000-8000-000000000001', '8cae1001-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner', 'active'),
  ('9cae2002-0000-4000-8000-000000000002', '8cae1001-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member', 'active'),
  ('9cae2003-0000-4000-8000-000000000003', '8cae1002-0000-4000-8000-000000000002', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'owner', 'active');

-- Feature entitlements: User A has content_factory, User B does not, User C has it
INSERT INTO public.feature_entitlements (user_id, feature, status, granted_by) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'content_factory', 'active', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'content_factory', 'active', 'cccccccc-cccc-cccc-cccc-cccccccccccc');

-- Property for testing
INSERT INTO public.properties (id, workspace_id, created_by, title, city, district, rental_type, monthly_rent, status, allow_marketing_reuse)
VALUES ('9cae3001-0000-4000-8000-000000000001', '8cae1001-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test Apt', 'GZ', 'Tianhe', 'whole_unit', 5000, 'draft', true);

SELECT * FROM no_plan();

-- ================================================================
-- content_projects RLS
-- ================================================================

-- 1: User A (has content_factory) can INSERT into own workspace
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
SELECT lives_ok(
  $$INSERT INTO public.content_projects (workspace_id, property_id, created_by, platform)
    VALUES ('8cae1001-0000-4000-8000-000000000001', '9cae3001-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'xiaohongshu')$$,
  '1: user with content_factory can insert content_project'
);

-- 2: User B (no content_factory) cannot INSERT
SET LOCAL "request.jwt.claims" TO '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';
SELECT throws_ok(
  $$INSERT INTO public.content_projects (workspace_id, property_id, created_by, platform)
    VALUES ('8cae1001-0000-4000-8000-000000000001', '9cae3001-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'xiaohongshu')$$,
  '42501', NULL,
  '2: user without content_factory cannot insert content_project'
);

-- 3: User C (content_factory but different workspace) cannot see WA's content
-- First, switch back to A and read
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
SELECT is(
  (SELECT count(*)::integer FROM public.content_projects WHERE workspace_id = '8cae1001-0000-4000-8000-000000000001'),
  1,
  '3: user A can see own workspace content'
);

-- 4: User C cannot see WA's content
SET LOCAL "request.jwt.claims" TO '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}';
SELECT is(
  (SELECT count(*)::integer FROM public.content_projects WHERE workspace_id = '8cae1001-0000-4000-8000-000000000001'),
  0,
  '4: user C cannot see other workspace content'
);

-- 5: Anon cannot read content
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT * FROM public.content_projects$$,
  '42501', NULL,
  '5: anon cannot read content_projects'
);

-- 6: Update works for owner with content_factory
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
SELECT lives_ok(
  $$UPDATE public.content_projects SET status = 'ready' WHERE workspace_id = '8cae1001-0000-4000-8000-000000000001'$$,
  '6: user A can update own content_project'
);

-- 7: User B cannot UPDATE — RLS silently filters (statement succeeds, but 0 rows affected)
SET LOCAL "request.jwt.claims" TO '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';
-- The UPDATE should succeed (no error) but affect 0 rows because RLS filters
SELECT lives_ok(
  $$UPDATE public.content_projects SET status = 'draft' WHERE workspace_id = '8cae1001-0000-4000-8000-000000000001'$$,
  '7: user without content_factory UPDATE does not throw (RLS silent filter)'
);
-- Verify user A still sees the row with status 'ready' (user B's UPDATE had no effect)
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
SELECT is(
  (SELECT status::text FROM public.content_projects WHERE workspace_id = '8cae1001-0000-4000-8000-000000000001' LIMIT 1),
  'ready',
  '7b: status still ready — user B update had no effect'
);

-- 8: Verify soft delete (update deleted_at) works
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
SELECT lives_ok(
  $$UPDATE public.content_projects SET deleted_at = now(), status = 'archived' WHERE workspace_id = '8cae1001-0000-4000-8000-000000000001'$$,
  '8: soft delete via update works'
);

-- 9: Deleted project not visible (filtered by WHERE deleted_at IS NULL)
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
SELECT is(
  (SELECT count(*)::integer FROM public.content_projects WHERE workspace_id = '8cae1001-0000-4000-8000-000000000001' AND deleted_at IS NULL),
  0,
  '9: soft-deleted project not returned when filtering deleted_at IS NULL'
);

-- ================================================================
-- content_versions RLS
-- ================================================================

-- 10: User A can insert content_version for own workspace
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
-- First, create a non-deleted content project
INSERT INTO public.content_projects (id, workspace_id, property_id, created_by, platform)
VALUES ('acae4001-0000-4000-8000-000000000001', '8cae1001-0000-4000-8000-000000000001', '9cae3001-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'xiaohongshu');

SELECT lives_ok(
  $$INSERT INTO public.content_versions (workspace_id, content_project_id, version_number, model_name, prompt_version, input_snapshot, output_json, created_by)
    VALUES ('8cae1001-0000-4000-8000-000000000001', 'acae4001-0000-4000-8000-000000000001', 1, 'deepseek', '1', '{}'::jsonb, '{}'::jsonb, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,
  '10: user A can insert content_version'
);

-- 11: User B cannot insert content_version
SET LOCAL "request.jwt.claims" TO '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';
SELECT throws_ok(
  $$INSERT INTO public.content_versions (workspace_id, content_project_id, version_number, model_name, prompt_version, input_snapshot, output_json, created_by)
    VALUES ('8cae1001-0000-4000-8000-000000000001', 'acae4001-0000-4000-8000-000000000001', 2, 'deepseek', '1', '{}'::jsonb, '{}'::jsonb, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')$$,
  '42501', NULL,
  '11: user B cannot insert content_version'
);

-- ================================================================
-- publishing_records RLS
-- ================================================================

-- 12: User A can insert publishing_record
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
SELECT lives_ok(
  $$INSERT INTO public.publishing_records (workspace_id, content_project_id, content_version_id, platform, published_at)
    VALUES ('8cae1001-0000-4000-8000-000000000001', 'acae4001-0000-4000-8000-000000000001',
            (SELECT id FROM public.content_versions WHERE content_project_id = 'acae4001-0000-4000-8000-000000000001' LIMIT 1),
            'xiaohongshu', now())$$,
  '12: user A can insert publishing_record'
);

-- 13: User B cannot insert publishing_record
SET LOCAL "request.jwt.claims" TO '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';
SELECT throws_ok(
  $$INSERT INTO public.publishing_records (workspace_id, content_project_id, content_version_id, platform, published_at)
    VALUES ('8cae1001-0000-4000-8000-000000000001', 'acae4001-0000-4000-8000-000000000001',
            (SELECT id FROM public.content_versions WHERE content_project_id = 'acae4001-0000-4000-8000-000000000001' LIMIT 1),
            'xiaohongshu', now())$$,
  '42501', NULL,
  '13: user B cannot insert publishing_record'
);

-- 14: User A can SELECT publishing_records
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
SELECT is(
  (SELECT count(*)::integer FROM public.publishing_records
   WHERE workspace_id = '8cae1001-0000-4000-8000-000000000001'),
  1,
  '14: user A can SELECT publishing_records'
);

-- 15: User B (no content_factory) cannot SELECT publishing_records
SET LOCAL "request.jwt.claims" TO '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';
SELECT is(
  (SELECT count(*)::integer FROM public.publishing_records),
  0,
  '15: user B sees 0 publishing_records (no content_factory)'
);

-- 16: User C (workspace B, content_factory) cannot see workspace A records
SET LOCAL "request.jwt.claims" TO '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}';
SELECT is(
  (SELECT count(*)::integer FROM public.publishing_records
   WHERE workspace_id = '8cae1001-0000-4000-8000-000000000001'),
  0,
  '16: user C cannot SELECT workspace A publishing_records'
);

-- 17: Anon cannot SELECT publishing_records (no table privilege)
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claims" TO '';
SELECT throws_ok(
  $$SELECT count(*) FROM public.publishing_records$$,
  '42501', NULL,
  '17: anon denied SELECT on publishing_records'
);
SET LOCAL ROLE authenticated;

-- 18: User A can UPDATE publishing_records
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
SELECT lives_ok(
  $$UPDATE public.publishing_records SET views = 100
    WHERE workspace_id = '8cae1001-0000-4000-8000-000000000001'$$,
  '18: user A can UPDATE publishing_records'
);

-- 19: User B (no content_factory) cannot UPDATE — RLS silently filters
SET LOCAL "request.jwt.claims" TO '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';
SELECT lives_ok(
  $$UPDATE public.publishing_records SET views = 999
    WHERE workspace_id = '8cae1001-0000-4000-8000-000000000001'$$,
  '19: user B UPDATE does not throw (RLS silent filter)'
);

-- 19b: Verify User A still sees original views value (User B update had no effect)
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
SELECT is(
  (SELECT views::integer FROM public.publishing_records
   WHERE workspace_id = '8cae1001-0000-4000-8000-000000000001' LIMIT 1),
  100,
  '19b: views still 100 — user B update had no effect'
);

-- 20: User D (no workspace) cannot insert
SET LOCAL "request.jwt.claims" TO '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd"}';
SELECT throws_ok(
  $$INSERT INTO public.publishing_records (workspace_id, content_project_id, content_version_id, platform, published_at)
    VALUES ('8cae1001-0000-4000-8000-000000000001', 'acae4001-0000-4000-8000-000000000001',
            (SELECT id FROM public.content_versions WHERE content_project_id = 'acae4001-0000-4000-8000-000000000001' LIMIT 1),
            'xiaohongshu', now())$$,
  '42501', NULL,
  '20: user D (no workspace) cannot insert publishing_record'
);

SELECT finish();
ROLLBACK;
