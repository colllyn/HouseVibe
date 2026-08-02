-- =============================================================================
-- Migration: Fix atomic RPC — secure search_path + workspace_id parameter
-- Replaces create_property_with_private_details with fully-qualified version.
-- =============================================================================

-- Drop the old version
drop function if exists public.create_property_with_private_details(
  text, text, text, text, text, text, text, integer, text, integer, integer, integer,
  numeric, integer, integer, boolean, text, text, date, integer, boolean, boolean, text,
  text[], text[], text[], text, text, text, text, text, text, text, text
) cascade;

-- =============================================================================
-- RPC v2: create_property_with_private_details
-- SECURITY DEFINER with empty search_path (fully qualified names required).
-- Requires p_workspace_id — validates caller's active membership.
-- =============================================================================

create or replace function public.create_property_with_private_details(
  p_workspace_id uuid,
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
  -- private details
  p_owner_name text default null,
  p_owner_phone text default null,
  p_owner_wechat text default null,
  p_exact_address text default null,
  p_key_location text default null,
  p_internal_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_property_id uuid;
begin
  -- 1. Get authenticated user
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- 2. Validate caller has active membership in target workspace
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = v_user_id
      and status = 'active'
  ) then
    raise exception 'Not a member of this workspace' using errcode = '42501';
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
    p_workspace_id, v_user_id, p_title, p_city, p_rental_type,
    p_district, p_business_area, p_community_name, p_address_text,
    p_monthly_rent, p_deposit_terms, p_bedrooms, p_living_rooms, p_bathrooms,
    p_area_sqm, p_floor, p_total_floors, p_has_elevator, p_orientation, p_decoration,
    p_available_from, p_minimum_lease_months, p_pets_allowed, p_cooking_allowed, p_subway_text,
    coalesce(p_tags, '{}'), coalesce(p_selling_points, '{}'),
    coalesce(p_drawbacks, '{}'), p_description, p_source_type
  ) returning id into v_property_id;

  -- 5. Insert private details if any sensitive field provided
  if coalesce(p_owner_name, p_owner_phone, p_owner_wechat,
              p_exact_address, p_key_location, p_internal_notes) is not null then
    insert into public.property_private_details (
      property_id, workspace_id,
      owner_name, owner_phone, owner_wechat,
      exact_address, key_location, internal_notes
    ) values (
      v_property_id, p_workspace_id,
      p_owner_name, p_owner_phone, p_owner_wechat,
      p_exact_address, p_key_location, p_internal_notes
    );
  end if;

  -- 6. Write audit log
  insert into public.audit_logs (
    workspace_id, actor_user_id, entity_type, entity_id, action, after_data
  ) values (
    p_workspace_id, v_user_id, 'property', v_property_id, 'property_created',
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
-- Privileges
-- =============================================================================

revoke execute on function public.create_property_with_private_details from public, anon;
grant execute on function public.create_property_with_private_details to authenticated;

-- =============================================================================
-- Verify security settings
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

  -- Verify search_path is set (empty string is stored differently)
  assert exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public'
      and p.proname = 'create_property_with_private_details'
      and p.proconfig is not null
  ), 'RPC must have fixed search_path';
end;
$$;
