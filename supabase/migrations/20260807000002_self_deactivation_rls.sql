-- =============================================================================
-- Migration: workspace_members self-deactivation RLS
--
-- Problem: "Owner can manage members" policy only allows workspace owners to
-- UPDATE workspace_members. Non-owner members calling deleteAccountAction
-- silently fail to set their own membership to inactive (RLS blocks the update).
--
-- Fix: Add a policy allowing authenticated users to update their OWN
-- workspace_members row, restricted to setting status = 'inactive' via the
-- WITH CHECK clause.
-- =============================================================================

-- Allow members to deactivate their own workspace memberships.
-- USING: the row being updated belongs to the authenticated user.
-- WITH CHECK: the resulting row must still belong to the user AND have
--   status = 'inactive' — prevents self-promotion of role or reassignment
--   to another workspace.
create policy "Members can deactivate own membership" on public.workspace_members
  for update using (
    user_id = (select auth.uid())
  ) with check (
    user_id = (select auth.uid())
    and status = 'inactive'
  );

-- =============================================================================
-- Add partial index on profiles.deleted_at for efficient lookups.
-- The index covers only deleted profiles (WHERE deleted_at IS NOT NULL),
-- keeping the index small since most profiles are not deleted.
-- =============================================================================

create index if not exists idx_profiles_deleted_at
  on public.profiles (deleted_at)
  where deleted_at is not null;
