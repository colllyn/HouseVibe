-- Migration: Property Media Soft-Delete RPC
-- P2-PROP-003-MEDIA-017
-- The UPDATE RLS policy's WITH CHECK clause blocks setting deleted_at via
-- the PostgREST API (42501). This RPC provides a SECURITY DEFINER path
-- that verifies ownership and performs the soft-delete server-side.

begin;

-- =============================================================================
-- soft_delete_media: Owner-only soft-delete for property media.
-- SECURITY DEFINER with fixed search_path to safely bypass the UPDATE RLS
-- while still verifying workspace ownership.
-- =============================================================================
create or replace function public.soft_delete_media(p_media_id uuid)
returns setof public.property_media
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_property_id uuid;
  v_user_id uuid;
begin
  -- 1. Authenticate
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  -- 2. Look up the media record (must exist and not be deleted)
  select workspace_id, property_id
  into v_workspace_id, v_property_id
  from public.property_media
  where id = p_media_id
    and deleted_at is null;

  if not found then
    raise exception 'Media not found or already deleted';
  end if;

  -- 3. Verify caller is workspace OWNER
  if not private.is_workspace_owner(v_workspace_id) then
    raise exception 'Only workspace owner can delete media';
  end if;

  -- 4. Soft-delete the media
  update public.property_media
  set deleted_at = now()
  where id = p_media_id
    and workspace_id = v_workspace_id
    and deleted_at is null;

  -- 5. Audit log
  insert into public.audit_logs (workspace_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  values (v_workspace_id, v_user_id, 'property_media', p_media_id, 'media_deleted',
          jsonb_build_object('deleted', false),
          jsonb_build_object('deleted', true, 'deleted_at', now()));

  -- 6. Return the updated row
  return query
    select * from public.property_media
    where id = p_media_id
      and workspace_id = v_workspace_id;
end;
$$;

-- Grant: authenticated only
grant execute on function public.soft_delete_media(uuid) to authenticated;
revoke execute on function public.soft_delete_media(uuid) from public, anon;

-- Verification
do $$
begin
  assert exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public'
      and p.proname = 'soft_delete_media'
      and p.prosecdef = true
  ), 'soft_delete_media must be SECURITY DEFINER';
end;
$$;

commit;
