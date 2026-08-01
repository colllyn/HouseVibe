-- Migration: Storage Buckets and RLS Policies
-- Phase 1-D / P1-DB-004: Supabase Storage Bucket and Policy for Phase 1.
--
-- Creates 4 private storage buckets with RLS policies:
--   1. property-private  — workspace members only
--   2. property-shared   — any authenticated user (view); system insert only
--   3. content-assets    — content_factory + workspace member
--   4. avatars           — user manages own only
--
-- Object path conventions:
--   property-private / content-assets:  {workspace_id}/{user_id}/{filename}
--   property-shared:                    {workspace_id}/{property_id}/{filename}
--   avatars:                            {user_id}/{filename}
--
-- Design decisions:
--   - All buckets are private (public = false); no permanent public URLs.
--   - RLS is default-deny on storage.objects (already enabled by Supabase).
--   - Workspace membership verified via path-segment extraction + private.is_workspace_member().
--   - File-type whitelisting in INSERT WITH CHECK — no executables, scripts, or archives.
--   - File-size limits enforced via storage.buckets.file_size_limit.
--   - Signed URL validity (max 1 hour) is enforced at the application layer (Route Handler)
--     when calling storage.createSignedUrl().
--   - All policies use 'to authenticated'. anon (public) has zero access via Supabase defaults.
--   - storage.objects and storage.buckets are owned by supabase_storage_admin;
--     this migration does NOT ALTER, GRANT, or REVOKE on those tables.
--     RLS is already enabled; base grants are already in place.

begin;

-- =============================================================================
-- 1. Create Storage Buckets (idempotent)
-- =============================================================================

do $$
begin
  -- property-private: private property media
  if not exists (select 1 from storage.buckets where id = 'property-private') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'property-private',
      'property-private',
      false,
      52428800,  -- 50 MiB
      array['image/png', 'image/jpeg', 'image/webp', 'image/gif',
            'video/mp4', 'video/webm']::text[]
    );
  end if;

  -- property-shared: shared property media (system-derived; no user upload)
  if not exists (select 1 from storage.buckets where id = 'property-shared') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'property-shared',
      'property-shared',
      false,
      52428800,  -- 50 MiB
      array['image/png', 'image/jpeg', 'image/webp', 'image/gif']::text[]
    );
  end if;

  -- content-assets: content project assets
  if not exists (select 1 from storage.buckets where id = 'content-assets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'content-assets',
      'content-assets',
      false,
      52428800,  -- 50 MiB
      array['image/png', 'image/jpeg', 'image/webp', 'image/gif',
            'video/mp4', 'video/webm', 'application/pdf']::text[]
    );
  end if;

  -- avatars: user profile avatars
  if not exists (select 1 from storage.buckets where id = 'avatars') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'avatars',
      'avatars',
      false,
      5242880,   -- 5 MiB
      array['image/png', 'image/jpeg', 'image/webp', 'image/gif']::text[]
    );
  end if;
end;
$$;

-- =============================================================================
-- 2. Path-extraction helper: returns workspace UUID from first path segment,
--    or NULL if the segment cannot be cast (malformed path — deny access).
--    SECURITY DEFINER allows RLS policies on storage.objects (owned by
--    supabase_storage_admin) to safely call into the private schema.
-- =============================================================================
create or replace function private.storage_workspace_id(object_path text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when object_path is null then null
    when object_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
      then (split_part(object_path, '/', 1))::uuid
    else null
  end;
$$;

-- =============================================================================
-- 3. Path-extraction helper: returns user UUID from the appropriate segment.
--    For workspace-bucketed paths (is_avatar=false): second segment.
--    For avatar paths (is_avatar=true): first segment.
-- =============================================================================
create or replace function private.storage_user_id(
  object_path text,
  is_avatar boolean default false
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when object_path is null then null
    when is_avatar then
      case when object_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
        then (split_part(object_path, '/', 1))::uuid
        else null
      end
    else
      case when split_part(object_path, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
        then (split_part(object_path, '/', 2))::uuid
        else null
      end
  end;
$$;

-- =============================================================================
-- 4. ═══ property-private RLS Policies ═══
--    Path: {workspace_id}/{user_id}/{filename}
--    Operations: workspace member (SELECT, INSERT, UPDATE), owner only (DELETE)
-- =============================================================================

create policy "property-private: workspace members can select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'property-private'
    and private.is_workspace_member(
      private.storage_workspace_id(name)
    )
  );

create policy "property-private: workspace members can insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'property-private'
    and private.is_workspace_member(
      private.storage_workspace_id(name)
    )
    and storage.extension(name) = any(
      array['png','jpg','jpeg','webp','gif','mp4','webm']
    )
  );

create policy "property-private: workspace members can update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'property-private'
    and private.is_workspace_member(
      private.storage_workspace_id(name)
    )
  )
  with check (
    bucket_id = 'property-private'
    and private.is_workspace_member(
      private.storage_workspace_id(name)
    )
    and storage.extension(name) = any(
      array['png','jpg','jpeg','webp','gif','mp4','webm']
    )
  );

create policy "property-private: workspace owner can delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'property-private'
    and private.is_workspace_owner(
      private.storage_workspace_id(name)
    )
  );

-- =============================================================================
-- 5. ═══ property-shared RLS Policies ═══
--    Path: {workspace_id}/{property_id}/{filename}
--    SELECT: any authenticated user.  INSERT: no policy → default-deny
--    (service_role copies from property-private; bypasses RLS).
-- =============================================================================

create policy "property-shared: any authenticated can select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'property-shared'
  );

create policy "property-shared: workspace owner can update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'property-shared'
    and private.is_workspace_owner(
      private.storage_workspace_id(name)
    )
  )
  with check (
    bucket_id = 'property-shared'
    and private.is_workspace_owner(
      private.storage_workspace_id(name)
    )
    and storage.extension(name) = any(
      array['png','jpg','jpeg','webp','gif']
    )
  );

create policy "property-shared: workspace owner can delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'property-shared'
    and private.is_workspace_owner(
      private.storage_workspace_id(name)
    )
  );

-- =============================================================================
-- 6. ═══ content-assets RLS Policies ═══
--    Path: {workspace_id}/{user_id}/{filename}
--    Operations: content_factory + workspace member (all CRUD)
-- =============================================================================

create policy "content-assets: content_factory members can select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'content-assets'
    and private.has_feature('content_factory')
    and private.is_workspace_member(
      private.storage_workspace_id(name)
    )
  );

create policy "content-assets: content_factory members can insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'content-assets'
    and private.has_feature('content_factory')
    and private.is_workspace_member(
      private.storage_workspace_id(name)
    )
    and storage.extension(name) = any(
      array['png','jpg','jpeg','webp','gif','mp4','webm','pdf']
    )
  );

create policy "content-assets: content_factory members can update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'content-assets'
    and private.has_feature('content_factory')
    and private.is_workspace_member(
      private.storage_workspace_id(name)
    )
  )
  with check (
    bucket_id = 'content-assets'
    and private.has_feature('content_factory')
    and private.is_workspace_member(
      private.storage_workspace_id(name)
    )
    and storage.extension(name) = any(
      array['png','jpg','jpeg','webp','gif','mp4','webm','pdf']
    )
  );

create policy "content-assets: content_factory members can delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'content-assets'
    and private.has_feature('content_factory')
    and private.is_workspace_member(
      private.storage_workspace_id(name)
    )
  );

-- =============================================================================
-- 7. ═══ avatars RLS Policies ═══
--    Path: {user_id}/{filename}
--    SELECT: any authenticated user.
--    INSERT/UPDATE/DELETE: user manages own path only.
-- =============================================================================

create policy "avatars: any authenticated can select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'avatars'
  );

create policy "avatars: user can insert own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and private.storage_user_id(name, true) = (select auth.uid())
    and storage.extension(name) = any(
      array['png','jpg','jpeg','webp','gif']
    )
  );

create policy "avatars: user can update own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and private.storage_user_id(name, true) = (select auth.uid())
  )
  with check (
    bucket_id = 'avatars'
    and private.storage_user_id(name, true) = (select auth.uid())
    and storage.extension(name) = any(
      array['png','jpg','jpeg','webp','gif']
    )
  );

create policy "avatars: user can delete own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and private.storage_user_id(name, true) = (select auth.uid())
  );

commit;
