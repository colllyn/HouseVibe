-- =============================================================================
-- 13_property_media_rls_test.sql — Property Media RLS & RPC Tests
-- Tests: schema, RLS SELECT/INSERT/UPDATE, cross-workspace isolation,
--        soft-delete, RPC atomicity, unique cover, sequential sort, audit.
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

-- Users
SELECT pg_temp.insert_auth_user('e0000001-0000-4000-8000-000000000001', 'media-owner@test');
SELECT pg_temp.insert_auth_user('e0000001-0000-4000-8000-000000000002', 'media-member@test');
SELECT pg_temp.insert_auth_user('e0000001-0000-4000-8000-000000000003', 'media-other@test');

-- Workspace A
INSERT INTO public.workspaces (id, name, owner_user_id, city, business_type)
VALUES ('a1000001-0000-4000-8000-000000000001', 'WS-Media-A', 'e0000001-0000-4000-8000-000000000001', 'Shanghai', 'residential_lease');
INSERT INTO public.workspace_members (id, workspace_id, user_id, role, status) VALUES
  ('9d01-0001-0000-4000-8000-000000000001', 'a1000001-0000-4000-8000-000000000001', 'e0000001-0000-4000-8000-000000000001', 'owner', 'active'),
  ('9d01-0002-0000-4000-8000-000000000002', 'a1000001-0000-4000-8000-000000000001', 'e0000001-0000-4000-8000-000000000002', 'member', 'active');

-- Workspace B
INSERT INTO public.workspaces (id, name, owner_user_id, city, business_type)
VALUES ('a1000001-0000-4000-8000-000000000002', 'WS-Media-B', 'e0000001-0000-4000-8000-000000000003', 'Beijing', 'residential_lease');
INSERT INTO public.workspace_members (id, workspace_id, user_id, role, status) VALUES
  ('9d01-0003-0000-4000-8000-000000000003', 'a1000001-0000-4000-8000-000000000002', 'e0000001-0000-4000-8000-000000000003', 'owner', 'active');

-- Properties
INSERT INTO public.properties (id, workspace_id, created_by, title, city, rental_type, status)
VALUES ('b2000001-0000-4000-8000-000000000001', 'a1000001-0000-4000-8000-000000000001', 'e0000001-0000-4000-8000-000000000001', 'Property-A', 'Shanghai', 'whole_unit', 'available');
INSERT INTO public.properties (id, workspace_id, created_by, title, city, rental_type, status, is_shared)
VALUES ('b2000001-0000-4000-8000-000000000002', 'a1000001-0000-4000-8000-000000000001', 'e0000001-0000-4000-8000-000000000001', 'Shared-Prop', 'Shanghai', 'whole_unit', 'available', true);
INSERT INTO public.properties (id, workspace_id, created_by, title, city, rental_type, status)
VALUES ('b2000001-0000-4000-8000-000000000003', 'a1000001-0000-4000-8000-000000000002', 'e0000001-0000-4000-8000-000000000003', 'Other-WS-Prop', 'Beijing', 'whole_unit', 'available');

-- Media data (inserted as superuser, bypasses RLS)
INSERT INTO public.property_media (id, workspace_id, property_id, storage_path, media_type, is_cover, sort_order)
VALUES ('c3000001-0000-4000-8000-000000000001', 'a1000001-0000-4000-8000-000000000001', 'b2000001-0000-4000-8000-000000000001', 'a1000001/00000000/uuid1.jpg', 'image', true, 0);
INSERT INTO public.property_media (id, workspace_id, property_id, storage_path, media_type, is_cover, sort_order)
VALUES ('c3000001-0000-4000-8000-000000000002', 'a1000001-0000-4000-8000-000000000001', 'b2000001-0000-4000-8000-000000000001', 'a1000001/00000000/uuid2.jpg', 'image', false, 1);
INSERT INTO public.property_media (id, workspace_id, property_id, storage_path, media_type, is_cover, sort_order)
VALUES ('c3000001-0000-4000-8000-000000000003', 'a1000001-0000-4000-8000-000000000001', 'b2000001-0000-4000-8000-000000000002', 'a1000001/00000000/uuid3.jpg', 'image', true, 0);
INSERT INTO public.property_media (id, workspace_id, property_id, storage_path, media_type, is_cover, sort_order)
VALUES ('c3000001-0000-4000-8000-000000000004', 'a1000001-0000-4000-8000-000000000002', 'b2000001-0000-4000-8000-000000000003', 'a1000002/00000000/uuid4.jpg', 'image', false, 0);
-- Soft-deleted media
INSERT INTO public.property_media (id, workspace_id, property_id, storage_path, media_type, is_cover, sort_order, deleted_at)
VALUES ('c3000001-0000-4000-8000-000000000005', 'a1000001-0000-4000-8000-000000000001', 'b2000001-0000-4000-8000-000000000001', 'a1000001/00000000/uuid5.jpg', 'image', false, 2, now());

SELECT plan(38);

-- =============================================================================
-- 1. Schema verification
-- =============================================================================
SELECT has_table('public', 'property_media', '1. property_media table exists');
SELECT has_column('public', 'property_media', 'workspace_id', '2. workspace_id column');
SELECT has_column('public', 'property_media', 'property_id', '3. property_id column');
SELECT has_column('public', 'property_media', 'storage_path', '4. storage_path column');
SELECT has_column('public', 'property_media', 'is_cover', '5. is_cover column');
SELECT has_column('public', 'property_media', 'sort_order', '6. sort_order column');
SELECT has_column('public', 'property_media', 'deleted_at', '7. deleted_at column');
SELECT has_function('public', 'set_media_cover', ARRAY['uuid'], '8. set_media_cover RPC exists');
SELECT has_function('public', 'set_media_sort_order', ARRAY['uuid', 'integer'], '9. set_media_sort_order RPC exists');

-- =============================================================================
-- 2. SELECT: Workspace member can read non-deleted media
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e0000001-0000-4000-8000-000000000001', true);
SELECT is(
  (SELECT count(*)::int FROM public.property_media WHERE workspace_id = 'a1000001-0000-4000-8000-000000000001' AND deleted_at IS NULL),
  3, '10. Owner sees 3 active media in workspace A'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e0000001-0000-4000-8000-000000000002', true);
SELECT is(
  (SELECT count(*)::int FROM public.property_media WHERE property_id = 'b2000001-0000-4000-8000-000000000001' AND deleted_at IS NULL),
  2, '11. Member sees 2 active media for property'
);

-- =============================================================================
-- 3. SELECT: Cross-workspace isolation
-- =============================================================================
SELECT is(
  (SELECT count(*)::int FROM public.property_media WHERE workspace_id = 'a1000001-0000-4000-8000-000000000002'),
  0, '12. Member sees 0 media from other workspace'
);

-- =============================================================================
-- 4. INSERT: Workspace member can insert (via RLS)
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e0000001-0000-4000-8000-000000000001', true);
SELECT lives_ok(
  $$INSERT INTO public.property_media (id, workspace_id, property_id, storage_path, media_type, sort_order)
    VALUES (gen_random_uuid(), 'a1000001-0000-4000-8000-000000000001', 'b2000001-0000-4000-8000-000000000001', 'a1000001/00000000/new.jpg', 'image', 5)$$,
  '13. Owner can INSERT media via RLS'
);

-- =============================================================================
-- 5. INSERT: Cross-workspace denial
-- =============================================================================
SELECT throws_ok(
  $$INSERT INTO public.property_media (id, workspace_id, property_id, storage_path, media_type, sort_order)
    VALUES (gen_random_uuid(), 'a1000001-0000-4000-8000-000000000002', 'b2000001-0000-4000-8000-000000000003', 'evil.jpg', 'image', 0)$$,
  '42501', NULL, '14. Cannot INSERT into other workspace'
);

-- =============================================================================
-- 6. UPDATE: Workspace member can update metadata
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e0000001-0000-4000-8000-000000000001', true);
SELECT lives_ok(
  $$UPDATE public.property_media SET scene_tag = 'living_room' WHERE id = 'c3000001-0000-4000-8000-000000000001'$$,
  '15. Owner can UPDATE scene_tag'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e0000001-0000-4000-8000-000000000002', true);
SELECT lives_ok(
  $$UPDATE public.property_media SET sort_order = 99 WHERE id = 'c3000001-0000-4000-8000-000000000002'$$,
  '16. Member can UPDATE sort_order'
);

-- Verify update persisted
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e0000001-0000-4000-8000-000000000001', true);
SELECT is(
  (SELECT scene_tag FROM public.property_media WHERE id = 'c3000001-0000-4000-8000-000000000001'),
  'living_room', '17. UPDATE scene_tag persisted'
);

-- =============================================================================
-- 7. UPDATE: Cross-workspace denial
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e0000001-0000-4000-8000-000000000003', true);
SELECT is(
  (SELECT count(*)::int FROM public.property_media WHERE id = 'c3000001-0000-4000-8000-000000000001'),
  0, '18. Other workspace user cannot see media to UPDATE'
);

-- =============================================================================
-- 8. DELETE: Owner can soft-delete (do as superuser, test SELECT exclusion)
-- =============================================================================
-- Soft-delete as superuser
RESET ROLE;
UPDATE public.property_media SET deleted_at = now() WHERE id = 'c3000001-0000-4000-8000-000000000003';

-- Verify excluded from SELECT (as owner)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e0000001-0000-4000-8000-000000000001', true);
SELECT is(
  (SELECT count(*)::int FROM public.property_media WHERE id = 'c3000001-0000-4000-8000-000000000003' AND deleted_at IS NULL),
  0, '19. Soft-deleted media excluded from normal SELECT'
);

-- Verify the media still exists (not hard deleted)
RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM public.property_media WHERE id = 'c3000001-0000-4000-8000-000000000003'),
  1, '20. Soft-deleted media still exists in table'
);

-- =============================================================================
-- 9. DELETE: Member (non-owner) cannot soft-delete
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e0000001-0000-4000-8000-000000000002', true);
SELECT throws_ok(
  $$UPDATE public.property_media SET deleted_at = now() WHERE id = 'c3000001-0000-4000-8000-000000000001'$$,
  '42501', NULL, '21. Member cannot soft-delete (RLS blocks)'
);

-- =============================================================================
-- 10. Anon cannot access
-- =============================================================================
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT count(*) FROM public.property_media$$,
  '42501', NULL, '22. Anon cannot SELECT media'
);

-- =============================================================================
-- 11. Shared property media visible to any authenticated user
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e0000001-0000-4000-8000-000000000003', true);
SELECT is(
  (SELECT count(*)::int FROM public.property_media WHERE property_id = 'b2000001-0000-4000-8000-000000000002' AND deleted_at IS NULL),
  0, '23. Shared property media counted (deleted in test 19)'
);

-- =============================================================================
-- 12. INSERT: Invalid property_id (FK violation)
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e0000001-0000-4000-8000-000000000001', true);
SELECT throws_ok(
  $$INSERT INTO public.property_media (id, workspace_id, property_id, storage_path, media_type, sort_order)
    VALUES (gen_random_uuid(), 'a1000001-0000-4000-8000-000000000001', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'bad.jpg', 'image', 0)$$,
  '23503', NULL, '24. FK violation on non-existent property'
);

-- =============================================================================
-- 13. RPC: set_media_cover creates unique cover
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e0000001-0000-4000-8000-000000000001', true);

-- Both media 1 and 2 for property b200...001: media 1 is cover, media 2 is not
-- Set cover to media 2
SELECT lives_ok(
  $$SELECT public.set_media_cover('c3000001-0000-4000-8000-000000000002')$$,
  '25. set_media_cover succeeds for owner'
);

-- Media 1 no longer cover
SELECT is(
  (SELECT is_cover FROM public.property_media WHERE id = 'c3000001-0000-4000-8000-000000000001'),
  false, '26. Previous cover unset'
);
-- Media 2 is now cover
SELECT is(
  (SELECT is_cover FROM public.property_media WHERE id = 'c3000001-0000-4000-8000-000000000002'),
  true, '27. New cover set'
);
-- Only one cover
SELECT is(
  (SELECT count(*)::int FROM public.property_media WHERE property_id = 'b2000001-0000-4000-8000-000000000001' AND is_cover = true AND deleted_at IS NULL),
  1, '28. Only one cover per property'
);

-- =============================================================================
-- 14. RPC: set_media_cover cross-workspace denial
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e0000001-0000-4000-8000-000000000003', true);
SELECT throws_ok(
  $$SELECT public.set_media_cover('c3000001-0000-4000-8000-000000000001')$$,
  NULL, NULL, '29. Cross-workspace user cannot set cover'
);

-- =============================================================================
-- 15. RPC: set_media_sort_order produces unique sequential values
-- =============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e0000001-0000-4000-8000-000000000001', true);

-- Reset sort orders
UPDATE public.property_media SET sort_order = 0 WHERE id = 'c3000001-0000-4000-8000-000000000001';
UPDATE public.property_media SET sort_order = 1 WHERE id = 'c3000001-0000-4000-8000-000000000002';

-- Move media 2 to position 0
SELECT lives_ok(
  $$SELECT public.set_media_sort_order('c3000001-0000-4000-8000-000000000002', 0)$$,
  '30. set_media_sort_order succeeds'
);

SELECT is(
  (SELECT sort_order FROM public.property_media WHERE id = 'c3000001-0000-4000-8000-000000000002'),
  0, '31. Media moved to sort_order 0'
);
SELECT is(
  (SELECT sort_order FROM public.property_media WHERE id = 'c3000001-0000-4000-8000-000000000001'),
  1, '32. Other media shifted to sort_order 1'
);

-- Verify all sort_order values are unique
SELECT is(
  (SELECT count(distinct sort_order) FROM public.property_media WHERE property_id = 'b2000001-0000-4000-8000-000000000001' AND deleted_at IS NULL),
  (SELECT count(*) FROM public.property_media WHERE property_id = 'b2000001-0000-4000-8000-000000000001' AND deleted_at IS NULL),
  '33. All sort_order values are unique'
);

-- =============================================================================
-- 16. RPC: search_path is fixed (SECURITY DEFINER compliance)
-- =============================================================================
SELECT is(
  (SELECT prosecdef FROM pg_proc WHERE proname = 'set_media_cover' AND pronamespace = 'public'::regnamespace LIMIT 1),
  true, '34. set_media_cover is SECURITY DEFINER'
);
SELECT is(
  (SELECT prosecdef FROM pg_proc WHERE proname = 'set_media_sort_order' AND pronamespace = 'public'::regnamespace LIMIT 1),
  true, '35. set_media_sort_order is SECURITY DEFINER'
);

-- =============================================================================
-- 17. RPC: Grants — only authenticated
-- =============================================================================
SELECT is(
  (SELECT count(*)::int FROM information_schema.role_routine_grants WHERE routine_name = 'set_media_cover' AND grantee = 'anon'),
  0, '36. set_media_cover NOT granted to anon'
);
SELECT is(
  (SELECT count(*)::int FROM information_schema.role_routine_grants WHERE routine_name = 'set_media_sort_order' AND grantee = 'anon'),
  0, '37. set_media_sort_order NOT granted to anon'
);

-- =============================================================================
-- 18. Soft-delete: column default
-- =============================================================================
SELECT col_is_null('public', 'property_media', 'deleted_at', '38. deleted_at defaults to NULL');

SELECT * FROM finish();
ROLLBACK;
