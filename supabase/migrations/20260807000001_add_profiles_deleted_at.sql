-- Migration: Add deleted_at to profiles for soft-delete support (P4-REVIEW-001 P1-004 fix)
-- Profiles soft-delete enables account deletion without data loss.
-- Auth still works — application layer checks deleted_at to show deactivated state.

begin;

alter table public.profiles
  add column if not exists deleted_at timestamptz;

comment on column public.profiles.deleted_at is 'Soft-delete timestamp. When set, user account is deactivated.';

commit;
