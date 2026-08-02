-- =============================================================================
-- Migration: Atomic Property Creation RPC
-- Provides create_property_with_private_details() as a single database transaction
-- that creates properties + property_private_details + audit_log in one atomic operation.
-- =============================================================================

-- =============================================================================
-- RPC: create_property_with_private_details
-- SECURITY DEFINER, fixed search_path, uses auth.uid() for caller identity.
-- Workspace is server-determined from active membership.
-- Returns the new property UUID on success.
-- Entire operation is a single transaction: any failure rolls back everything.
-- =============================================================================

create or replace function public.create_property_with_private_details(
  p_title text,
  p_city text,
  p_rental_type text default 'whole_unit',
  p_district text default null,
  p_business_area text default null,
  p_community_name text default null,
  p_address_text text default null,
  p_monthly_rent integer default null,
  p_deposit_terms text default null,
  p_bedrooms integer default null,
  p_living_rooms integer default null,
  p_bathrooms integer default null,
  p_area_sqm numeric default null,
  p_floor integer default null,
  p_total_floors integer default null,
  p_has_elevator boolean default null,
  p_orientation text default null,
  p_decoration text default null,
  p_available_from date default null,
  p_minimum_lease_months integer default null,
  p_pets_allowed boolean default null,
  p_cooking_allowed boolean default null,
  p_subway_text text default null,
  p_tags text[] default null,
  p_selling_points text[] default null,
  p_drawbacks text[] default null,
  p_description text default null,
  p_source_type text default 'manual',
  -- private details (property_private_details)
  p_owner_name text default null,
  p_owner_phone text default null,
  p_owner_wechat text default null,
  p_exact_address text default null,
  p_key_location text default null,
  p_internal_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = 'public, extensions'
as $$
declare
  v_user_id uuid;
  v_workspace_id uuid;
  v_property_id uuid;
begin
  -- 1. Get authenticated user (from JWT, not parameter)
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- 2. Look up active workspace for this user (server-determined)
  select wm.workspace_id into v_workspace_id
  from public.workspace_members wm
  where wm.user_id = v_user_id
    and wm.status = 'active'
  order by wm.created_at
  limit 1;

  if v_workspace_id is null then
    raise exception 'No active workspace membership' using errcode = '42501';
  end if;

  -- 3. Validate required fields
  if p_title is null or trim(p_title) = '' then
    raise exception 'title is required' using errcode = '23502';
  end if;
  if p_city is null or trim(p_city) = '' then
    raise exception 'city is required' using errcode = '23502';
  end if;

  -- 4. Insert property
  insert into public.properties (
    workspace_id, created_by, title, city, rental_type,
    district, business_area, community_name, address_text,
    monthly_rent, deposit_terms, bedrooms, living_rooms, bathrooms,
    area_sqm, floor, total_floors, has_elevator, orientation, decoration,
    available_from, minimum_lease_months, pets_allowed, cooking_allowed, subway_text,
    tags, selling_points, drawbacks, description, source_type
  ) values (
    v_workspace_id, v_user_id, p_title, p_city, p_rental_type,
    p_district, p_business_area, p_community_name, p_address_text,
    p_monthly_rent, p_deposit_terms, p_bedrooms, p_living_rooms, p_bathrooms,
    p_area_sqm, p_floor, p_total_floors, p_has_elevator, p_orientation, p_decoration,
    p_available_from, p_minimum_lease_months, p_pets_allowed, p_cooking_allowed, p_subway_text,
    coalesce(p_tags, '{}'), coalesce(p_selling_points, '{}'), coalesce(p_drawbacks, '{}'), p_description, p_source_type
  ) returning id into v_property_id;

  -- 5. Insert private details if any sensitive field is provided
  if coalesce(p_owner_name, p_owner_phone, p_owner_wechat,
              p_exact_address, p_key_location, p_internal_notes) is not null then
    insert into public.property_private_details (
      property_id, workspace_id,
      owner_name, owner_phone, owner_wechat,
      exact_address, key_location, internal_notes
    ) values (
      v_property_id, v_workspace_id,
      p_owner_name, p_owner_phone, p_owner_wechat,
      p_exact_address, p_key_location, p_internal_notes
    );
  end if;

  -- 6. Write audit log
  insert into public.audit_logs (
    workspace_id, actor_user_id, entity_type, entity_id, action, after_data
  ) values (
    v_workspace_id, v_user_id, 'property', v_property_id, 'property_created',
    jsonb_build_object(
      'title', p_title,
      'city', p_city,
      'rental_type', p_rental_type,
      'has_private_details', coalesce(p_owner_name, p_owner_phone, p_owner_wechat,
                                       p_exact_address, p_key_location, p_internal_notes) is not null
    )
  );

  return v_property_id;
end;
$$;

-- =============================================================================
-- Privileges: authenticated users only; no public/anon access
-- =============================================================================

revoke execute on function public.create_property_with_private_details from public, anon;
grant execute on function public.create_property_with_private_details to authenticated;

-- =============================================================================
-- Verify: function exists and is SECURITY DEFINER
-- =============================================================================
do $$
begin
  assert exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public'
      and p.proname = 'create_property_with_private_details'
      and p.prosecdef = true
  ), 'RPC must be SECURITY DEFINER';
end;
$$;
