-- HouseVibe Seed Data
-- This file contains only non-sensitive, repeatable base seed data.
-- No real users, emails, phone numbers, or passwords.
-- All schema DDL resides in migrations/.

-- Note: In Phase 1-B, seed data is minimal.
-- Future phases will add feature flags, compliance terms, model pricing, etc.

-- =============================================================================
-- Phase 1-C: E2E Test Environment Grants
-- =============================================================================
-- Grant full access on admin tables to service_role for E2E test setup.
-- Production deployments should NOT run seed data, but even if they do,
-- service_role is already privileged and can manage these tables through
-- other mechanisms. These grants only affect the PostgREST service_role path.
--
-- Tables are RLS-enabled; service_role bypasses RLS but still needs explicit
-- privilege grants for PostgREST access paths used in E2E tests.
-- upsert needs SELECT for conflict detection + INSERT/UPDATE.
grant select, insert, update, delete on public.system_admins to service_role;
grant select, insert, update, delete on public.feature_entitlements to service_role;
