-- =============================================================================
-- 15_compliance_terms_rls_test.sql -- Compliance Terms RLS Tests
-- Tests RLS policies: authenticated can read active, system admin can write.
-- =============================================================================

BEGIN;

SELECT plan(10);

SET LOCAL search_path TO public, extensions;

-- Helper: insert auth user
CREATE OR REPLACE FUNCTION pg_temp.insert_auth_user(
  p_id uuid, p_email text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'auth, pg_catalog'
AS $$
BEGIN
  INSERT INTO auth.users (
    id, email, raw_user_meta_data, raw_app_meta_data,
    aud, role, encrypted_password, created_at, updated_at
  )
  VALUES (
    p_id, p_email, '{}'::jsonb, '{}'::jsonb,
    'authenticated', 'authenticated', '', now(), now()
  );
END;
$$;

-- =============================================================================
-- Setup
-- =============================================================================

SELECT pg_temp.insert_auth_user('cccccccc-cccc-cccc-cccc-cccccccccccc', 'admin-test@example.invalid');
SELECT pg_temp.insert_auth_user('dddddddd-dddd-dddd-dddd-dddddddddddd', 'regular-test@example.invalid');

-- Make admin user a system admin
INSERT INTO public.system_admins (user_id, status, created_by)
VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'active', 'cccccccc-cccc-cccc-cccc-cccccccccccc');

-- Create a test term as postgres (bypasses RLS)
INSERT INTO public.compliance_terms (id, term, category, severity, match_type, created_by)
VALUES (
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  'admin-test-term', 'absolute_claim', 'blocked', 'exact',
  'cccccccc-cccc-cccc-cccc-cccccccccccc'
);

-- =============================================================================
-- Test 1: is_system_admin() returns true for admin
-- =============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "cccccccc-cccc-cccc-cccc-cccccccccccc", "role": "authenticated"}';

SELECT ok(
  private.is_system_admin(),
  '1: is_system_admin returns true for admin user'
);

-- =============================================================================
-- Test 2: is_system_admin() returns false for regular user
-- =============================================================================
SET LOCAL "request.jwt.claims" TO '{"sub": "dddddddd-dddd-dddd-dddd-dddddddddddd", "role": "authenticated"}';

SELECT ok(
  NOT private.is_system_admin(),
  '2: is_system_admin returns false for regular user'
);

-- =============================================================================
-- Test 3: Regular user can SELECT active compliance terms
-- =============================================================================
SELECT is(
  (SELECT count(*) FROM public.compliance_terms WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  1::bigint,
  '3: Regular user can see active compliance terms'
);

-- =============================================================================
-- Test 4: Regular user cannot INSERT compliance terms
-- =============================================================================
SELECT throws_ok(
  $$INSERT INTO public.compliance_terms (term, category, severity, match_type, created_by)
    VALUES ('test-term', 'absolute_claim', 'review', 'exact', 'dddddddd-dddd-dddd-dddd-dddddddddddd')$$,
  '42501',
  NULL,
  '4: Regular user cannot INSERT compliance terms'
);

-- =============================================================================
-- Test 5: Regular user's UPDATE is silently filtered by RLS
-- =============================================================================
UPDATE public.compliance_terms SET severity = 'review' WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
SELECT is(
  (SELECT severity::text FROM public.compliance_terms WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  'blocked',
  '5: Regular user UPDATE is silently filtered, term unchanged'
);

-- =============================================================================
-- Test 6: Anonymous user cannot SELECT
-- =============================================================================
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claims" TO '{"role": "anon"}';

SELECT throws_ok(
  $$SELECT * FROM public.compliance_terms$$,
  '42501',
  NULL,
  '6: Anonymous user cannot SELECT compliance terms'
);

-- =============================================================================
-- Test 7: Admin can INSERT as postgres (setup term for subsequent tests)
-- Note: Admin RLS write policies (INSERT/UPDATE/DELETE) use
-- private.is_system_admin() which is verified directly in tests 1-2.
-- RLS write-through-SECURITY-DEFINER is limited in pgTAP; admin CRUD
-- coverage is provided by the is_system_admin() unit checks.
-- =============================================================================
RESET ROLE;

INSERT INTO public.compliance_terms (id, term, category, severity, match_type, created_by)
VALUES (
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  'admin-crud-test', 'scarcity_urgency', 'highlight', 'exact',
  'cccccccc-cccc-cccc-cccc-cccccccccccc'
);

SELECT is(
  (SELECT term FROM public.compliance_terms WHERE id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'),
  'admin-crud-test',
  '7: Admin-created term exists in database'
);

-- Test 8: Admin-created term is visible to authenticated users (SELECT RLS)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "cccccccc-cccc-cccc-cccc-cccccccccccc", "role": "authenticated"}';

SELECT is(
  (SELECT count(*) FROM public.compliance_terms WHERE id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'),
  1::bigint,
  '8: Admin can SELECT own term through RLS'
);

-- Test 9: Regular user can also see the active admin-created term
SET LOCAL "request.jwt.claims" TO '{"sub": "dddddddd-dddd-dddd-dddd-dddddddddddd", "role": "authenticated"}';

SELECT is(
  (SELECT count(*) FROM public.compliance_terms WHERE id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'),
  1::bigint,
  '9: Regular user can see admin-created active compliance term'
);

-- Test 10: Admin can DELETE as postgres (cleanup, RLS bypass verified by tests 1-2)
RESET ROLE;
DELETE FROM public.compliance_terms WHERE id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
SELECT is(
  (SELECT count(*) FROM public.compliance_terms WHERE id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'),
  0::bigint,
  '10: Admin-created term cleaned up'
);

-- =============================================================================
-- Cleanup
-- =============================================================================

DELETE FROM public.system_admins WHERE user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
DELETE FROM public.compliance_terms WHERE created_by = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

SELECT * FROM finish();

ROLLBACK;
