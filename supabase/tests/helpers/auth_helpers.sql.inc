-- =============================================================================
-- auth_helpers.sql -- Shared authentication helpers for pgTAP tests
-- =============================================================================
-- Not a production migration. Creates helper functions in the tests schema
-- for simulating Supabase authentication state in pgTAP test transactions.
--
-- Usage (in any test file):
--   SELECT tests.authenticate_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
--   SELECT tests.authenticate_as_anon();
--   SELECT tests.clear_authentication();
--
-- All helpers use SET LOCAL so state is scoped to the current transaction.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS tests;

-- Authenticate as a specific user (authenticated role + JWT sub claim)
CREATE OR REPLACE FUNCTION tests.authenticate_as(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
END;
$$;

-- Switch to anonymous role (no authentication, no JWT)
CREATE OR REPLACE FUNCTION tests.authenticate_as_anon()
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RESET ROLE;
  SET LOCAL ROLE anon;
END;
$$;

-- Clear all authentication state (return to postgres, clear JWT claims)
CREATE OR REPLACE FUNCTION tests.clear_authentication()
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;
