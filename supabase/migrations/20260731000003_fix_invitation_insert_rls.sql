-- Migration: Fix invitation INSERT RLS — restrict to workspace owners
-- Phase 1-B2: P1 review fix
-- Drops the permissive "Authenticated users can create invitations" policy
-- and replaces it with a stricter owner-only policy.

-- =============================================================================
-- Drop old permissive policy (guarded: only if table and policy exist)
-- =============================================================================
do $$
begin
  if exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'invitation_links'
  ) then
    if exists (
      select 1 from pg_catalog.pg_policy
      where polname = 'Authenticated users can create invitations'
        and polrelid = 'public.invitation_links'::regclass
    ) then
      drop policy "Authenticated users can create invitations" on public.invitation_links;
    end if;

    -- =============================================================================
    -- Create new owner-only INSERT policy (only if not already exists)
    -- =============================================================================
    if not exists (
      select 1 from pg_catalog.pg_policy
      where polname = 'Workspace owners can create invitations'
        and polrelid = 'public.invitation_links'::regclass
    ) then
      create policy "Workspace owners can create invitations" on public.invitation_links
        for insert with check (
          private.is_workspace_owner(target_workspace_id)
          or private.is_system_admin()
        );
    end if;
  end if;
end;
$$;
