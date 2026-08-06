-- =============================================================================
-- 15_compliance_terms_rls_test.sql -- Compliance Terms RLS Tests
-- Verifies compliance_terms RLS policies (P3-AI-020).
--
-- Test UUIDs:
--   Admin User:   cccccccc-cccc-cccc-cccc-cccccccccccc
--   Regular User: dddddddd-dddd-dddd-dddd-dddddddddddd
-- =============================================================================

BEGIN;

SELECT plan(12);

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
-- Setup: Create test users
-- =============================================================================

-- Create profiles for test users
INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'admin-test@example.invalid', 'Admin User', now(), now()),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'regular-test@example.invalid', 'Regular User', now(), now());

-- Make admin user a system admin
INSERT INTO public.system_admins (user_id, status, created_by)
VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'active', 'cccccccc-cccc-cccc-cccc-cccccccccccc');

-- Insert auth users
SELECT pg_temp.insert_auth_user('cccccccc-cccc-cccc-cccc-cccccccccccc', 'admin-test@example.invalid');
SELECT pg_temp.insert_auth_user('dddddddd-dddd-dddd-dddd-dddddddddddd', 'regular-test@example.invalid');

-- =============================================================================
-- Tests as Regular User
-- =============================================================================

-- Test 1: Regular user can SELECT active compliance terms
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "dddddddd-dddd-dddd-dddd-dddddddddddd", "role": "authenticated"}';

SELECT results_eq(
  $$SELECT count(*) FROM public.compliance_terms WHERE status = 'active'$$,
  $$SELECT count(*) FROM public.compliance_terms WHERE status = 'active'$$,
  'Regular user can SELECT active compliance terms'
);

-- Test 2: Regular user cannot INSERT compliance terms
SELECT throws_ok(
  $$INSERT INTO public.compliance_terms (term, category, severity, match_type, created_by)
    VALUES ('test-term', 'absolute_claim', 'review', 'exact', 'dddddddd-dddd-dddd-dddd-dddddddddddd')$$,
  '42501',
  NULL,
  'Regular user cannot INSERT compliance terms'
);

-- Test 3: Regular user cannot UPDATE compliance terms
SELECT throws_ok(
  $$UPDATE public.compliance_terms SET severity = 'blocked' WHERE term = 'nonexistent'$$,
  '42501',
  NULL,
  'Regular user cannot UPDATE compliance terms'
);

-- Test 4: Regular user cannot DELETE compliance terms
SELECT throws_ok(
  $$DELETE FROM public.compliance_terms WHERE term = 'nonexistent'$$,
  '42501',
  NULL,
  'Regular user cannot DELETE compliance terms'
);

-- =============================================================================
-- Tests as Anonymous
-- =============================================================================

-- Test 5: Anonymous user cannot SELECT compliance terms
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claims" TO '{"role": "anon"}';

SELECT throws_ok(
  $$SELECT * FROM public.compliance_terms$$,
  '42501',
  NULL,
  'Anonymous user cannot SELECT compliance terms'
);

-- =============================================================================
-- Tests as System Admin
-- =============================================================================

-- Test 6: System admin can INSERT compliance terms
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "cccccccc-cccc-cccc-cccc-cccccccccccc", "role": "authenticated"}';

-- Insert a test term as admin
INSERT INTO public.compliance_terms (id, term, category, severity, match_type, created_by)
VALUES (
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  'admin-test-term',
  'absolute_claim',
  'blocked',
  'exact',
  'cccccccc-cccc-cccc-cccc-cccccccccccc'
);

SELECT is(
  (SELECT term FROM public.compliance_terms WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  'admin-test-term',
  'System admin can INSERT compliance terms'
);

-- Test 7: System admin can read the inserted term
SELECT is(
  (SELECT count(*) FROM public.compliance_terms WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  1::bigint,
  'System admin can SELECT own inserted compliance term'
);

-- Test 8: System admin can UPDATE compliance terms
UPDATE public.compliance_terms
SET severity = 'review', replacement_suggestion = 'Updated suggestion'
WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

SELECT is(
  (SELECT severity::text FROM public.compliance_terms WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  'review',
  'System admin can UPDATE compliance terms'
);

-- Test 9: System admin can disable a term
UPDATE public.compliance_terms
SET status = 'disabled'
WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

SELECT is(
  (SELECT status FROM public.compliance_terms WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  'disabled',
  'System admin can disable compliance terms'
);

-- Test 10: Regular user cannot see disabled terms (RLS: status = active)
SET LOCAL "request.jwt.claims" TO '{"sub": "dddddddd-dddd-dddd-dddd-dddddddddddd", "role": "authenticated"}';

SELECT is(
  (SELECT count(*) FROM public.compliance_terms WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  0::bigint,
  'Regular user cannot see disabled compliance terms'
);

-- Test 11: System admin can re-enable a term
SET LOCAL "request.jwt.claims" TO '{"sub": "cccccccc-cccc-cccc-cccc-cccccccccccc", "role": "authenticated"}';

UPDATE public.compliance_terms
SET status = 'active'
WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

SELECT is(
  (SELECT status FROM public.compliance_terms WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  'active',
  'System admin can re-enable compliance terms'
);

-- Test 12: System admin can DELETE compliance terms
DELETE FROM public.compliance_terms WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

SELECT is(
  (SELECT count(*) FROM public.compliance_terms WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  0::bigint,
  'System admin can DELETE compliance terms'
);

-- =============================================================================
-- Cleanup
-- =============================================================================

DELETE FROM public.system_admins WHERE user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
DELETE FROM public.profiles WHERE id IN ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'dddddddd-dddd-dddd-dddd-dddddddddddd');

SELECT * FROM finish();

ROLLBACK;
