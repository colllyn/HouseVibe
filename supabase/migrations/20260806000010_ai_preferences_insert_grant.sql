-- Migration: Grant INSERT on ai_user_preferences for service_role (E2E seeding)
-- Without this, even service_role cannot insert directly into the table
-- because only the upsert RPC was granted execute (which requires auth.uid()).
-- E2E tests need direct insert via service_role for seeding.

begin;

grant insert on public.ai_user_preferences to service_role;

commit;
