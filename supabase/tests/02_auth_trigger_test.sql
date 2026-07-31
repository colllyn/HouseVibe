-- =============================================================================
-- 02_auth_trigger_test.sql -- Auth Trigger Tests
-- Verifies handle_new_user trigger auto-creates profiles on auth.users INSERT.
--
-- Determinisic test UUIDs:
--   User A: a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0
--   User B: b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0
--   User X: c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0 (on conflict test)
-- =============================================================================

BEGIN;

SET LOCAL search_path TO public, extensions;

-- Create a temporary helper function for inserting auth users.
-- Tests run as postgres, so we have direct access to auth schema.
-- The helper wraps the insert to handle potential column variations.
CREATE OR REPLACE FUNCTION pg_temp.insert_auth_user(
  p_id uuid,
  p_email text,
  p_full_name text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'auth, pg_catalog'
AS $$
DECLARE
  v_meta jsonb := '{}'::jsonb;
BEGIN
  IF p_full_name IS NOT NULL THEN
    v_meta := jsonb_build_object('full_name', p_full_name);
  END IF;

  INSERT INTO auth.users (
    id, email, raw_user_meta_data, raw_app_meta_data,
    aud, role, encrypted_password, created_at, updated_at
  )
  VALUES (
    p_id, p_email, v_meta, '{}'::jsonb,
    'authenticated', 'authenticated', '', now(), now()
  );
END;
$$;

SELECT plan(9);

-- =============================================================================
-- Test 1: Profile auto-created when auth user is created
-- =============================================================================
SELECT pg_temp.insert_auth_user(
  'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0',
  'user-a@example.invalid',
  'User A'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0'
  ),
  'Profile auto-created when auth user is inserted'
);

-- =============================================================================
-- Test 2: Profile ID matches auth user ID
-- =============================================================================
SELECT is(
  (SELECT id FROM public.profiles WHERE id = 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0'),
  'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0'::uuid,
  'Profile ID matches auth user ID'
);

-- =============================================================================
-- Test 3: Full name from raw_user_meta_data is used
-- =============================================================================
SELECT is(
  (SELECT full_name FROM public.profiles WHERE id = 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0'),
  'User A',
  'Full name from raw_user_meta_data is stored in profile'
);

-- =============================================================================
-- Test 4: Default timestamps are set
-- =============================================================================
SELECT ok(
  (SELECT created_at IS NOT NULL FROM public.profiles WHERE id = 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0'),
  'Profile created_at should be set'
);
SELECT ok(
  (SELECT updated_at IS NOT NULL FROM public.profiles WHERE id = 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0'),
  'Profile updated_at should be set'
);

-- =============================================================================
-- Test 5: Auth user without full_name creates profile with NULL full_name
-- =============================================================================
SELECT pg_temp.insert_auth_user(
  'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0',
  'user-b@example.invalid',
  NULL
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0'
  ),
  'Profile created even when full_name is not provided'
);
SELECT is(
  (SELECT full_name FROM public.profiles WHERE id = 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0'),
  NULL,
  'Profile full_name is NULL when not in raw_user_meta_data'
);

-- =============================================================================
-- Test 6: ON CONFLICT DO NOTHING -- direct insert into profiles with same ID is safe
-- =============================================================================
SELECT lives_ok(
  $$INSERT INTO public.profiles (id, full_name) VALUES ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'Should Be Ignored') ON CONFLICT (id) DO NOTHING$$,
  'ON CONFLICT DO NOTHING on profiles is safe'
);

-- Profile should still have original full_name (not altered by conflict insert)
SELECT is(
  (SELECT full_name FROM public.profiles WHERE id = 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0'),
  'User A',
  'Profile full_name unchanged after ON CONFLICT DO NOTHING'
);

-- =============================================================================
-- Cleanup
-- =============================================================================
SELECT * FROM finish();

ROLLBACK;
