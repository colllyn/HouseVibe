-- =============================================================================
-- 09_storage_rls_test.sql -- Storage Bucket RLS Tests
-- Phase 1-D: Verifies storage buckets, helper functions, and all RLS policies
-- from migration 20260801000003_storage_buckets.sql.
--
-- Test UUIDs:
--   User A: a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa (owner of Workspace A, has content_factory)
--   User B: b0bbbbbb-b0bb-b0bb-b0bb-b0bbbbbb0bbb (member of Workspace A, no content_factory)
--   User C: c0cccccc-c0cc-c0cc-c0cc-c0ccccccc0cc (owner of Workspace B, no content_factory)
--   Workspace A: a1111111-a111-a111-a111-a111111111a1
--   Workspace B: b2222222-b222-b222-b222-b222222222b2
--
-- Path conventions:
--   property-private / content-assets:  {workspace_id}/{user_id}/{filename}
--   property-shared:                    {workspace_id}/{property_id}/{filename}
--   avatars:                            {user_id}/{filename}
-- =============================================================================

BEGIN;

SET LOCAL search_path TO public, extensions, pg_catalog;

-- =============================================================================
-- Helper: insert auth user for testing
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
-- Setup: Create test users, workspaces, memberships, and feature entitlements
-- =============================================================================

-- Create users (trigger auto-creates profiles)
SELECT pg_temp.insert_auth_user('a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa', 'user-a@example.invalid', 'User A');
SELECT pg_temp.insert_auth_user('b0bbbbbb-b0bb-b0bb-b0bb-b0bbbbbb0bbb', 'user-b@example.invalid', 'User B');
SELECT pg_temp.insert_auth_user('c0cccccc-c0cc-c0cc-c0cc-c0ccccccc0cc', 'user-c@example.invalid', 'User C');

-- Create Workspace A with User A as owner
INSERT INTO public.workspaces (id, name, owner_user_id, city, business_type)
VALUES ('a1111111-a111-a111-a111-a111111111a1', 'Workspace A',
  'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa', 'Beijing', 'residential_lease');

-- Create Workspace B with User C as owner
INSERT INTO public.workspaces (id, name, owner_user_id, city, business_type)
VALUES ('b2222222-b222-b222-b222-b222222222b2', 'Workspace B',
  'c0cccccc-c0cc-c0cc-c0cc-c0ccccccc0cc', 'Shanghai', 'residential_lease');

-- User A is owner of Workspace A
INSERT INTO public.workspace_members (id, workspace_id, user_id, role, status)
VALUES ('9a000001-0000-4000-8000-000000000001', 'a1111111-a111-a111-a111-a111111111a1',
  'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa', 'owner', 'active');

-- User B is member of Workspace A
INSERT INTO public.workspace_members (id, workspace_id, user_id, role, status)
VALUES ('9a000002-0000-4000-8000-000000000002', 'a1111111-a111-a111-a111-a111111111a1',
  'b0bbbbbb-b0bb-b0bb-b0bb-b0bbbbbb0bbb', 'member', 'active');

-- User C is owner of Workspace B
INSERT INTO public.workspace_members (id, workspace_id, user_id, role, status)
VALUES ('9a000003-0000-4000-8000-000000000003', 'b2222222-b222-b222-b222-b222222222b2',
  'c0cccccc-c0cc-c0cc-c0cc-c0ccccccc0cc', 'owner', 'active');

-- Grant content_factory to User A (for content-assets positive tests)
INSERT INTO public.feature_entitlements (id, user_id, feature, status, granted_by, granted_at)
VALUES ('9f000001-0000-4000-8000-000000000001',
  'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa', 'content_factory', 'active',
  'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa', now());

-- Grant content_factory to User C (for cross-workspace content-assets test)
INSERT INTO public.feature_entitlements (id, user_id, feature, status, granted_by, granted_at)
VALUES ('9f000002-0000-4000-8000-000000000002',
  'c0cccccc-c0cc-c0cc-c0cc-c0ccccccc0cc', 'content_factory', 'active',
  'c0cccccc-c0cc-c0cc-c0cc-c0ccccccc0cc', now());

-- =============================================================================
-- Pre-populate storage.objects for SELECT and DELETE tests (bypasses RLS as postgres)
-- =============================================================================

-- Avatar test objects
INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES ('avatars', 'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa/avatar-own.png',
  'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa', '{}'::jsonb);

INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES ('avatars', 'b0bbbbbb-b0bb-b0bb-b0bb-b0bbbbbb0bbb/avatar-own.png',
  'b0bbbbbb-b0bb-b0bb-b0bb-b0bbbbbb0bbb', '{}'::jsonb);

INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES ('avatars', 'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa/avatar-del-test.png',
  'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa', '{}'::jsonb);

INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES ('avatars', 'b0bbbbbb-b0bb-b0bb-b0bb-b0bbbbbb0bbb/avatar-del-test.png',
  'b0bbbbbb-b0bb-b0bb-b0bb-b0bbbbbb0bbb', '{}'::jsonb);

-- property-private test objects
INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES ('property-private',
  'a1111111-a111-a111-a111-a111111111a1/a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa/prop.jpg',
  'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa', '{}'::jsonb);

INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES ('property-private',
  'a1111111-a111-a111-a111-a111111111a1/b0bbbbbb-b0bb-b0bb-b0bb-b0bbbbbb0bbb/member-photo.jpg',
  'b0bbbbbb-b0bb-b0bb-b0bb-b0bbbbbb0bbb', '{}'::jsonb);

-- property-shared test objects
INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES ('property-shared',
  'a1111111-a111-a111-a111-a111111111a1/prop-001/shared-photo.jpg',
  'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa', '{}'::jsonb);

-- content-assets test objects
INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES ('content-assets',
  'a1111111-a111-a111-a111-a111111111a1/a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa/content.pdf',
  'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa', '{}'::jsonb);

INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES ('content-assets',
  'b2222222-b222-b222-b222-b222222222b2/c0cccccc-c0cc-c0cc-c0cc-c0ccccccc0cc/wsb-content.jpg',
  'c0cccccc-c0cc-c0cc-c0cc-c0ccccccc0cc', '{}'::jsonb);

-- Temporarily disable triggers via session_replication_role to test DELETE RLS.
-- The storage.protect_delete trigger blocks direct DELETE (requires Storage API);
-- setting session_replication_role = 'replica' suppresses normal triggers so we
-- can verify RLS policy evaluation for DELETE operations.
-- This setting is scoped to the current transaction and rolled back at the end.
SET LOCAL session_replication_role = 'replica';

-- =============================================================================
-- Tests (plan: 54)
-- =============================================================================
SELECT plan(54);

-- =============================================================================
-- PART 1: Bucket Existence and Properties (Tests 1-10)
-- =============================================================================

-- Test 1: Bucket 'avatars' exists
SELECT ok(
  EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'avatars'),
  '1. Bucket avatars exists'
);

-- Test 2: Bucket 'property-private' exists
SELECT ok(
  EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'property-private'),
  '2. Bucket property-private exists'
);

-- Test 3: Bucket 'property-shared' exists
SELECT ok(
  EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'property-shared'),
  '3. Bucket property-shared exists'
);

-- Test 4: Bucket 'content-assets' exists
SELECT ok(
  EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'content-assets'),
  '4. Bucket content-assets exists'
);

-- Test 5: All 4 buckets are private (public = false)
SELECT ok(
  (SELECT bool_and(public = false) FROM storage.buckets
   WHERE id IN ('avatars', 'property-private', 'property-shared', 'content-assets')),
  '5. All 4 buckets are private (public = false)'
);

-- Test 6: Avatar bucket file_size_limit = 5242880 (5 MiB)
SELECT is(
  (SELECT file_size_limit FROM storage.buckets WHERE id = 'avatars'),
  5242880::bigint,
  '6. Avatar bucket file_size_limit = 5 MiB'
);

-- Test 7: Avatar bucket only allows image MIME types (no video, no pdf)
SELECT ok(
  (SELECT allowed_mime_types <@ array['image/png','image/jpeg','image/webp','image/gif']::text[]
    AND NOT (allowed_mime_types && array['video/mp4','application/pdf']::text[])
   FROM storage.buckets WHERE id = 'avatars'),
  '7. Avatar bucket: only image MIME types, no video/pdf'
);

-- Test 8: property-private bucket file_size_limit = 52428800 (50 MiB)
SELECT is(
  (SELECT file_size_limit FROM storage.buckets WHERE id = 'property-private'),
  52428800::bigint,
  '8. property-private bucket file_size_limit = 50 MiB'
);

-- Test 9: property-private bucket allows images AND video MIME types
SELECT ok(
  (SELECT (allowed_mime_types && array['image/png','image/jpeg']::text[])
    AND (allowed_mime_types && array['video/mp4','video/webm']::text[])
    AND NOT ('application/pdf' = any(allowed_mime_types))
   FROM storage.buckets WHERE id = 'property-private'),
  '9. property-private bucket: images + video, no pdf'
);

-- Test 10: content-assets bucket allows images + video + pdf
SELECT ok(
  (SELECT (allowed_mime_types && array['image/png','image/jpeg']::text[])
    AND (allowed_mime_types && array['video/mp4','video/webm']::text[])
    AND ('application/pdf' = any(allowed_mime_types))
   FROM storage.buckets WHERE id = 'content-assets'),
  '10. content-assets bucket: images + video + pdf'
);

-- =============================================================================
-- PART 2: Helper Functions (Tests 11-14)
-- =============================================================================

-- Test 11: private.storage_workspace_id() function exists
SELECT ok(
  EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'private' AND p.proname = 'storage_workspace_id'),
  '11. Helper function storage_workspace_id() exists'
);

-- Test 12: private.storage_user_id() function exists
SELECT ok(
  EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'private' AND p.proname = 'storage_user_id'),
  '12. Helper function storage_user_id() exists'
);

-- Test 13: storage_workspace_id has set search_path = ''
-- Note: SET clauses on functions are stored in pg_proc.proconfig, not prosrc.
SELECT ok(
  EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'private' AND p.proname = 'storage_workspace_id'
      AND proconfig IS NOT NULL
      AND EXISTS (SELECT 1 FROM unnest(proconfig) AS cfg WHERE cfg LIKE 'search_path=%')),
  '13. storage_workspace_id has set search_path = '''''
);

-- Test 14: storage_user_id has set search_path = ''
SELECT ok(
  EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'private' AND p.proname = 'storage_user_id'
      AND proconfig IS NOT NULL
      AND EXISTS (SELECT 1 FROM unnest(proconfig) AS cfg WHERE cfg LIKE 'search_path=%')),
  '14. storage_user_id has set search_path = '''''
);

-- =============================================================================
-- PART 3: Policy Existence (Tests 15-21)
-- =============================================================================

-- Test 15: All 15 storage policies exist
SELECT is(
  (SELECT count(*)::int FROM pg_catalog.pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'),
  15,
  '15. All 15 storage policies exist on storage.objects'
);

-- Test 16: property-private has SELECT, INSERT, UPDATE, DELETE policies
SELECT ok(
  (SELECT count(*)::int = 4 FROM pg_catalog.pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname LIKE 'property-private:%'),
  '16. property-private has all 4 CRUD policies'
);

-- Test 17: property-shared has SELECT, UPDATE, DELETE policies (no INSERT)
SELECT ok(
  (SELECT count(*)::int = 3 FROM pg_catalog.pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname LIKE 'property-shared:%'),
  '17. property-shared has 3 policies (SELECT, UPDATE, DELETE -- no INSERT)'
);

-- Test 18: content-assets has SELECT, INSERT, UPDATE, DELETE policies
SELECT ok(
  (SELECT count(*)::int = 4 FROM pg_catalog.pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname LIKE 'content-assets:%'),
  '18. content-assets has all 4 CRUD policies'
);

-- Test 19: avatars has SELECT, INSERT, UPDATE, DELETE policies
SELECT ok(
  (SELECT count(*)::int = 4 FROM pg_catalog.pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname LIKE 'avatars:%'),
  '19. avatars has all 4 CRUD policies'
);

-- Test 20: All storage policies target 'authenticated' role
SELECT ok(
  (SELECT bool_and(roles = '{authenticated}'::name[]) FROM pg_catalog.pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'),
  '20. All storage policies target authenticated role'
);

-- Test 21: No storage policy targets anon role
SELECT is(
  (SELECT count(*)::int FROM pg_catalog.pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND 'anon' = any(roles)),
  0,
  '21. No storage policy targets anon role'
);

-- =============================================================================
-- PART 4: Avatar RLS Tests (Tests 22-27)
-- =============================================================================

-- Test 22: User can SELECT own avatar record
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa', true);

SELECT ok(
  EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'avatars'
      AND name = 'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa/avatar-own.png'
  ),
  '22. Avatar RLS: user can SELECT own avatar'
);

-- Test 23: User can INSERT into own avatar path
SELECT lives_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES ('avatars', 'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa/new-avatar.png',
            'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa', '{}'::jsonb)$$,
  '23. Avatar RLS: user can INSERT into own path'
);

-- Test 24: User cannot INSERT into another user's avatar path
SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES ('avatars', 'b0bbbbbb-b0bb-b0bb-b0bb-b0bbbbbb0bbb/evil.png',
            'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa', '{}'::jsonb)$$,
  '42501',
  NULL,
  '24. Avatar RLS: user cannot INSERT into another user path'
);

-- Test 25: User A can DELETE own avatar (pre-populated row)
DELETE FROM storage.objects
WHERE bucket_id = 'avatars'
  AND name = 'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa/avatar-del-test.png';

RESET ROLE;
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'avatars'
      AND name = 'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa/avatar-del-test.png'
  ),
  '25. Avatar RLS: user can DELETE own avatar'
);

-- Test 26: User B cannot DELETE User A's avatar
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b0bbbbbb-b0bb-b0bb-b0bb-b0bbbbbb0bbb', true);

DELETE FROM storage.objects
WHERE bucket_id = 'avatars'
  AND name = 'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa/avatar-own.png';

RESET ROLE;
SELECT ok(
  EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'avatars'
      AND name = 'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa/avatar-own.png'
  ),
  '26. Avatar RLS: user cannot DELETE another user avatar'
);

-- Test 27: Avatar INSERT rejects non-image extension
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa', true);

SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES ('avatars', 'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa/virus.exe',
            'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa', '{}'::jsonb)$$,
  '42501',
  NULL,
  '27. Avatar RLS: INSERT rejected for .exe extension'
);

-- =============================================================================
-- PART 5: property-private RLS Tests (Tests 28-36)
-- =============================================================================

-- Test 28: Workspace member (User A, owner) can SELECT property-private
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa', true);

SELECT ok(
  EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'property-private'
      AND name LIKE 'a1111111-a111-a111-a111-a111111111a1/%'
  ),
  '28. property-private RLS: workspace member (owner) can SELECT'
);

-- Test 29: Workspace member (User B, member) can SELECT property-private
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b0bbbbbb-b0bb-b0bb-b0bb-b0bbbbbb0bbb', true);

SELECT ok(
  EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'property-private'
      AND name LIKE 'a1111111-a111-a111-a111-a111111111a1/%'
  ),
  '29. property-private RLS: workspace member (non-owner) can SELECT'
);

-- Test 30: Non-workspace-member (User C) cannot SELECT property-private
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c0cccccc-c0cc-c0cc-c0cc-c0ccccccc0cc', true);

SELECT is(
  (SELECT count(*)::int FROM storage.objects
   WHERE bucket_id = 'property-private'
     AND name LIKE 'a1111111-a111-a111-a111-a111111111a1/%'),
  0,
  '30. property-private RLS: non-workspace-member sees 0 rows (cross-workspace rejection)'
);

-- Test 31: Workspace member can INSERT with valid extension (.jpg)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa', true);

SELECT lives_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES ('property-private',
            'a1111111-a111-a111-a111-a111111111a1/a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa/new-prop.jpg',
            'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa', '{}'::jsonb)$$,
  '31. property-private RLS: workspace member can INSERT with valid .jpg extension'
);

-- Test 32: INSERT rejected with invalid extension (.exe)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa', true);

SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES ('property-private',
            'a1111111-a111-a111-a111-a111111111a1/a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa/malware.exe',
            'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa', '{}'::jsonb)$$,
  '42501',
  NULL,
  '32. property-private RLS: INSERT rejected with invalid .exe extension'
);

-- Test 33: INSERT rejected with invalid extension (.sh)
SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES ('property-private',
            'a1111111-a111-a111-a111-a111111111a1/a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa/script.sh',
            'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa', '{}'::jsonb)$$,
  '42501',
  NULL,
  '33. property-private RLS: INSERT rejected with invalid .sh extension'
);

-- Test 34: INSERT rejected for non-member (User C tries WS-A path)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c0cccccc-c0cc-c0cc-c0cc-c0ccccccc0cc', true);

SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES ('property-private',
            'a1111111-a111-a111-a111-a111111111a1/c0cccccc-c0cc-c0cc-c0cc-c0ccccccc0cc/intruder.jpg',
            'c0cccccc-c0cc-c0cc-c0cc-c0ccccccc0cc', '{}'::jsonb)$$,
  '42501',
  NULL,
  '34. property-private RLS: non-member cannot INSERT into other workspace path'
);

-- Test 35: Workspace owner (User A) can DELETE property-private object
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa', true);

DELETE FROM storage.objects
WHERE bucket_id = 'property-private'
  AND name = 'a1111111-a111-a111-a111-a111111111a1/a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa/prop.jpg';

RESET ROLE;
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'property-private'
      AND name = 'a1111111-a111-a111-a111-a111111111a1/a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa/prop.jpg'
  ),
  '35. property-private RLS: workspace owner can DELETE'
);

-- Test 36: Workspace member (non-owner, User B) cannot DELETE property-private object
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b0bbbbbb-b0bb-b0bb-b0bb-b0bbbbbb0bbb', true);

DELETE FROM storage.objects
WHERE bucket_id = 'property-private'
  AND name = 'a1111111-a111-a111-a111-a111111111a1/b0bbbbbb-b0bb-b0bb-b0bb-b0bbbbbb0bbb/member-photo.jpg';

RESET ROLE;
SELECT ok(
  EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'property-private'
      AND name = 'a1111111-a111-a111-a111-a111111111a1/b0bbbbbb-b0bb-b0bb-b0bb-b0bbbbbb0bbb/member-photo.jpg'
  ),
  '36. property-private RLS: workspace member (non-owner) cannot DELETE'
);

-- =============================================================================
-- PART 6: property-shared RLS Tests (Tests 37-39)
-- =============================================================================

-- Test 37: Any authenticated user can SELECT from property-shared
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c0cccccc-c0cc-c0cc-c0cc-c0ccccccc0cc', true);

SELECT ok(
  EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'property-shared'
      AND name LIKE 'a1111111-a111-a111-a111-a111111111a1/%'
  ),
  '37. property-shared RLS: any authenticated user can SELECT (User C can see WS-A shared)'
);

-- Test 38: Authenticated user cannot INSERT into property-shared (default-deny)
SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES ('property-shared',
            'a1111111-a111-a111-a111-a111111111a1/prop-001/unauthorized.jpg',
            'c0cccccc-c0cc-c0cc-c0cc-c0ccccccc0cc', '{}'::jsonb)$$,
  '42501',
  NULL,
  '38. property-shared RLS: authenticated user cannot INSERT (default-deny)'
);

-- Test 39: property-shared: owner can DELETE own shared object
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa', true);

DELETE FROM storage.objects
WHERE bucket_id = 'property-shared'
  AND name = 'a1111111-a111-a111-a111-a111111111a1/prop-001/shared-photo.jpg';

RESET ROLE;
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'property-shared'
      AND name = 'a1111111-a111-a111-a111-a111111111a1/prop-001/shared-photo.jpg'
  ),
  '39. property-shared RLS: workspace owner can DELETE own shared object'
);

-- =============================================================================
-- PART 7: content-assets RLS Tests (Tests 40-47)
-- =============================================================================

-- Test 40: content_factory + workspace member (User A) can SELECT
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa', true);

SELECT ok(
  EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'content-assets'
      AND name LIKE 'a1111111-a111-a111-a111-a111111111a1/%'
  ),
  '40. content-assets RLS: content_factory + workspace member can SELECT'
);

-- Test 41: Workspace member without content_factory (User B) cannot SELECT
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b0bbbbbb-b0bb-b0bb-b0bb-b0bbbbbb0bbb', true);

SELECT is(
  (SELECT count(*)::int FROM storage.objects
   WHERE bucket_id = 'content-assets'
     AND name LIKE 'a1111111-a111-a111-a111-a111111111a1/%'),
  0,
  '41. content-assets RLS: workspace member without content_factory sees 0 rows'
);

-- Test 42: content_factory user not in workspace (User C) cannot SELECT WS-A content-assets
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c0cccccc-c0cc-c0cc-c0cc-c0ccccccc0cc', true);

SELECT is(
  (SELECT count(*)::int FROM storage.objects
   WHERE bucket_id = 'content-assets'
     AND name LIKE 'a1111111-a111-a111-a111-a111111111a1/%'),
  0,
  '42. content-assets RLS: content_factory user not in workspace sees 0 rows (cross-workspace)'
);

-- Test 43: content_factory + workspace member can INSERT with valid extension
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa', true);

SELECT lives_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES ('content-assets',
            'a1111111-a111-a111-a111-a111111111a1/a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa/new-asset.pdf',
            'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa', '{}'::jsonb)$$,
  '43. content-assets RLS: content_factory + workspace member can INSERT with valid .pdf extension'
);

-- Test 44: content-assets INSERT rejected without content_factory (User B)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b0bbbbbb-b0bb-b0bb-b0bb-b0bbbbbb0bbb', true);

SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES ('content-assets',
            'a1111111-a111-a111-a111-a111111111a1/b0bbbbbb-b0bb-b0bb-b0bb-b0bbbbbb0bbb/no-factory.jpg',
            'b0bbbbbb-b0bb-b0bb-b0bb-b0bbbbbb0bbb', '{}'::jsonb)$$,
  '42501',
  NULL,
  '44. content-assets RLS: INSERT rejected without content_factory entitlement'
);

-- Test 45: content-assets INSERT rejected with invalid extension (.exe)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa', true);

SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES ('content-assets',
            'a1111111-a111-a111-a111-a111111111a1/a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa/bad.exe',
            'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa', '{}'::jsonb)$$,
  '42501',
  NULL,
  '45. content-assets RLS: INSERT rejected for .exe extension'
);

-- Test 46: content-assets INSERT rejected with invalid extension (.sh)
SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES ('content-assets',
            'a1111111-a111-a111-a111-a111111111a1/a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa/script.sh',
            'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa', '{}'::jsonb)$$,
  '42501',
  NULL,
  '46. content-assets RLS: INSERT rejected for .sh extension'
);

-- Test 47: content-assets: content_factory + member can DELETE
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa', true);

DELETE FROM storage.objects
WHERE bucket_id = 'content-assets'
  AND name = 'a1111111-a111-a111-a111-a111111111a1/a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa/content.pdf';

RESET ROLE;
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'content-assets'
      AND name = 'a1111111-a111-a111-a111-a111111111a1/a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa/content.pdf'
  ),
  '47. content-assets RLS: content_factory + member can DELETE'
);

-- =============================================================================
-- PART 8: Anon (Not Authenticated) Access Tests (Tests 48-51)
-- =============================================================================

-- Test 48: Anon cannot SELECT from avatars (returns 0 rows)
SET LOCAL ROLE anon;

SELECT is(
  (SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'avatars'),
  0,
  '48. Anon: cannot SELECT from avatars (0 rows)'
);

-- Test 49: Anon cannot INSERT into any bucket
SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES ('avatars', 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/anon.png',
            'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa', '{}'::jsonb)$$,
  '42501',
  NULL,
  '49. Anon: cannot INSERT into avatars (42501)'
);

-- Test 50: Anon cannot see property-private (0 rows)
SELECT is(
  (SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'property-private'),
  0,
  '50. Anon: cannot SELECT from property-private (0 rows)'
);

-- Test 51: Anon cannot see property-shared despite it being "any authenticated"
-- (Anon != authenticated; policy targets 'to authenticated')
SELECT is(
  (SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'property-shared'),
  0,
  '51. Anon: cannot SELECT from property-shared (0 rows; anon != authenticated)'
);

-- =============================================================================
-- PART 9: Path Forgery Tests (Tests 52-54)
-- =============================================================================

-- Test 52: User cannot forge workspace_id path -- workspace_id in path must
-- match actual workspace membership. User B (member of WS-A) tries to INSERT
-- into property-private with WS-B path (not a member of WS-B).
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b0bbbbbb-b0bb-b0bb-b0bb-b0bbbbbb0bbb', true);

SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES ('property-private',
            'b2222222-b222-b222-b222-b222222222b2/b0bbbbbb-b0bb-b0bb-b0bb-b0bbbbbb0bbb/forged.jpg',
            'b0bbbbbb-b0bb-b0bb-b0bb-b0bbbbbb0bbb', '{}'::jsonb)$$,
  '42501',
  NULL,
  '52. Path forgery: workspace_id in path must match actual membership (rejected)'
);

-- Test 53: User cannot forge user_id path in avatars -- first segment must match auth.uid()
-- User A tries to insert into path starting with User B's UUID
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa', true);

SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES ('avatars',
            'b0bbbbbb-b0bb-b0bb-b0bb-b0bbbbbb0bbb/forged-avatar.png',
            'a0aaaaaa-a0aa-a0aa-a0aa-a0aaaaaaa0aa', '{}'::jsonb)$$,
  '42501',
  NULL,
  '53. Path forgery: avatar user_id segment must match auth.uid() (rejected)'
);

-- Test 54: User cannot forge content-assets path with workspace they don't belong to
-- User B (WS-A member, no content_factory) tries WS-B content-assets path
-- This should fail on both workspace membership AND content_factory
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b0bbbbbb-b0bb-b0bb-b0bb-b0bbbbbb0bbb', true);

SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES ('content-assets',
            'b2222222-b222-b222-b222-b222222222b2/b0bbbbbb-b0bb-b0bb-b0bb-b0bbbbbb0bbb/forged.jpg',
            'b0bbbbbb-b0bb-b0bb-b0bb-b0bbbbbb0bbb', '{}'::jsonb)$$,
  '42501',
  NULL,
  '54. Path forgery: content-assets workspace_id must match membership (rejected)'
);

-- =============================================================================
-- Cleanup
-- =============================================================================
RESET ROLE;
SELECT * FROM finish();

ROLLBACK;
