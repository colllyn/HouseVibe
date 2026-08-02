-- =============================================================================
-- Migration: Property Media Atomic RPCs
-- Provides set_media_sort_order() and set_media_cover() as atomic database
-- operations with workspace isolation, audit logging, and SECURITY DEFINER.
-- =============================================================================

-- =============================================================================
-- RPC 1: set_media_sort_order
-- Moves a media item to a new position within its property's sort order,
-- reassigning sequential sort_order (0-indexed) for all affected media.
--
-- Auth: verified via private.is_workspace_member()
-- Returns: the updated property_media row
-- =============================================================================

create or replace function public.set_media_sort_order(
  p_media_id uuid,
  p_new_sort_order integer
) returns setof public.property_media
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_workspace_id uuid;
  v_property_id uuid;
  v_media_ids uuid[] := '{}'::uuid[];
  v_total integer;
  v_pos integer;
  v_len integer;
begin
  -- 1. Get authenticated user (from JWT, not parameter)
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- 2. Find workspace_id and property_id from the media record (must be non-deleted)
  select workspace_id, property_id into v_workspace_id, v_property_id
  from public.property_media
  where id = p_media_id and deleted_at is null;

  if not found then
    raise exception 'Media not found or has been deleted' using errcode = 'P0002';
  end if;

  -- 3. Verify caller is a workspace member
  if not private.is_workspace_member(v_workspace_id) then
    raise exception 'Not a member of this workspace' using errcode = '42501';
  end if;

  -- 4. Collect all non-deleted media IDs for this property in current order, excluding the target
  select array_agg(id order by sort_order asc, created_at asc)
  into v_media_ids
  from public.property_media
  where property_id = v_property_id and deleted_at is null and id != p_media_id;

  v_total := coalesce(array_length(v_media_ids, 1), 0) + 1;

  -- 5. Clamp desired position (0-indexed) to valid range [0, v_total - 1]
  v_pos := p_new_sort_order;
  if v_pos < 0 then
    v_pos := 0;
  end if;
  if v_pos >= v_total then
    v_pos := v_total - 1;
  end if;

  -- 6. Splice the target at the desired position (v_pos is 0-indexed, arrays are 1-indexed)
  v_len := coalesce(array_length(v_media_ids, 1), 0);

  if v_pos = 0 then
    -- Insert at the very beginning
    v_media_ids := array_prepend(p_media_id, coalesce(v_media_ids, '{}'::uuid[]));
  elsif v_pos >= v_len then
    -- Append to the end (after all existing items)
    v_media_ids := array_append(coalesce(v_media_ids, '{}'::uuid[]), p_media_id);
  else
    -- Insert in the middle: prefix[1..v_pos] + target + suffix[(v_pos+1)..v_len]
    v_media_ids := array_cat(
      array_cat(
        v_media_ids[1:v_pos],
        array[p_media_id]
      ),
      v_media_ids[(v_pos + 1):v_len]
    );
  end if;

  -- 7. Reassign sequential sort_order (0-indexed) for all affected media
  for v_i in 1..array_length(v_media_ids, 1) loop
    update public.property_media
    set sort_order = v_i - 1
    where id = v_media_ids[v_i];
  end loop;

  -- 8. Write audit log (sensitive-field safe: only records property_id and new order)
  insert into public.audit_logs (
    workspace_id, actor_user_id, entity_type, entity_id, action, after_data
  ) values (
    v_workspace_id, v_user_id, 'property_media', p_media_id, 'media_sort_order_changed',
    jsonb_build_object(
      'property_id', v_property_id,
      'new_sort_order', v_pos
    )
  );

  -- 9. Return the updated target media row
  return query select * from public.property_media where id = p_media_id;
end;
$$;

-- =============================================================================
-- RPC 2: set_media_cover
-- Designates a media item as the cover image for its property.
-- Unsets any existing cover for the same property before setting the new one.
--
-- Auth: verified via private.is_workspace_member()
-- Returns: the updated property_media row
-- =============================================================================

create or replace function public.set_media_cover(
  p_media_id uuid
) returns setof public.property_media
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_workspace_id uuid;
  v_property_id uuid;
  v_old_cover_id uuid;
begin
  -- 1. Get authenticated user (from JWT, not parameter)
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- 2. Find workspace_id and property_id from the media record (must be non-deleted)
  select workspace_id, property_id into v_workspace_id, v_property_id
  from public.property_media
  where id = p_media_id and deleted_at is null;

  if not found then
    raise exception 'Media not found or has been deleted' using errcode = 'P0002';
  end if;

  -- 3. Verify caller is a workspace member
  if not private.is_workspace_member(v_workspace_id) then
    raise exception 'Not a member of this workspace' using errcode = '42501';
  end if;

  -- 4. Find the current cover (if any) for audit trail before the swap
  select id into v_old_cover_id
  from public.property_media
  where property_id = v_property_id and is_cover = true and deleted_at is null
  limit 1;

  -- 5. Unset any existing cover for this property (entire operation is a single function transaction)
  update public.property_media
  set is_cover = false
  where property_id = v_property_id and deleted_at is null;

  -- 6. Set the new cover
  update public.property_media
  set is_cover = true
  where id = p_media_id and deleted_at is null;

  -- 7. Write audit log (sensitive-field safe: only records property_id and cover change)
  insert into public.audit_logs (
    workspace_id, actor_user_id, entity_type, entity_id, action, after_data
  ) values (
    v_workspace_id, v_user_id, 'property_media', p_media_id, 'media_cover_set',
    jsonb_build_object(
      'property_id', v_property_id,
      'previous_cover_id', v_old_cover_id,
      'new_cover_id', p_media_id
    )
  );

  -- 8. Return the updated media row
  return query select * from public.property_media where id = p_media_id;
end;
$$;

-- =============================================================================
-- Privileges: authenticated users only; no public/anon access
-- =============================================================================

revoke execute on function public.set_media_sort_order(uuid, integer) from public, anon;
grant execute on function public.set_media_sort_order(uuid, integer) to authenticated;

revoke execute on function public.set_media_cover(uuid) from public, anon;
grant execute on function public.set_media_cover(uuid) to authenticated;

-- =============================================================================
-- Verify: functions exist, are SECURITY DEFINER, and have fixed search_path
-- =============================================================================
do $$
begin
  -- set_media_sort_order
  assert exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public'
      and p.proname = 'set_media_sort_order'
      and p.prosecdef = true
  ), 'set_media_sort_order must be SECURITY DEFINER';

  assert exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public'
      and p.proname = 'set_media_sort_order'
      and p.proconfig is not null
  ), 'set_media_sort_order must have fixed search_path';

  -- set_media_cover
  assert exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public'
      and p.proname = 'set_media_cover'
      and p.prosecdef = true
  ), 'set_media_cover must be SECURITY DEFINER';

  assert exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public'
      and p.proname = 'set_media_cover'
      and p.proconfig is not null
  ), 'set_media_cover must have fixed search_path';
end;
$$;
