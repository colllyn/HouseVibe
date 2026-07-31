-- Migration: Profiles Table and Auth Trigger
-- Creates the profiles table, handle_new_user trigger, and set_updated_at utility.

-- =============================================================================
-- profiles table
-- =============================================================================
create table public.profiles (
  id uuid primary key,
  full_name text,
  phone text,
  avatar_url text,
  city text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================================================
-- Trigger function: auto-create profile when auth.users row is inserted
-- =============================================================================
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', null))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Trigger on auth.users
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- =============================================================================
-- Utility trigger function: set updated_at on row update
-- =============================================================================
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Trigger on profiles
create trigger set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
