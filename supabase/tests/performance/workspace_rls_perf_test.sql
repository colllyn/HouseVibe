-- =============================================================================
-- workspace_rls_perf_test.sql -- RLS Performance Benchmark (pgTAP)
-- =============================================================================
-- Generates 100,000+ workspace_members rows and validates index usage
-- for queries used in RLS policies. All data rolled back after test.
--
-- Run: cd /Users/colyn/HouseVibe && npx supabase db test --local supabase/tests/performance/workspace_rls_perf_test.sql
-- =============================================================================

BEGIN;

SET LOCAL search_path TO public, extensions;
SET LOCAL client_min_messages TO WARNING;

SELECT plan(10);

-- =============================================================================
-- Helper: runs EXPLAIN (FORMAT JSON) and returns plan text for analysis
-- =============================================================================
CREATE OR REPLACE FUNCTION pg_temp.capture_plan_json(
  p_query text
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_plan jsonb;
BEGIN
  EXECUTE 'EXPLAIN (FORMAT JSON, COSTS, BUFFERS) ' || p_query INTO v_plan;
  RETURN v_plan;
END;
$$;

-- Helper: returns true if the plan JSON does NOT contain a Seq Scan on the given table
CREATE OR REPLACE FUNCTION pg_temp.no_seq_scan(
  p_query text,
  p_table_name text
) RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_plan jsonb;
BEGIN
  SELECT pg_temp.capture_plan_json(p_query) INTO v_plan;
  -- Search for "Node Type": "Seq Scan" alongside "Relation Name": "<table>"
  RETURN v_plan::text NOT LIKE '%"Node Type": "Seq Scan"%"Relation Name": "' || p_table_name || '"%';
END;
$$;

-- =============================================================================
-- Setup: Create synthetic users and workspaces (100K+ membership rows)
-- =============================================================================

-- Create 1,000 synthetic auth users
INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data, aud, role, encrypted_password, created_at, updated_at)
SELECT
  ('00000000-0000-0000-0000-' || LPAD(i::text, 12, '0'))::uuid,
  'perf-user-' || i || '@example.invalid',
  jsonb_build_object('full_name', 'Perf User ' || i),
  '{}'::jsonb,
  'authenticated', 'authenticated', '', now(), now()
FROM generate_series(1, 1000) AS i
ON CONFLICT (id) DO NOTHING;

-- Create 100 synthetic workspaces
INSERT INTO public.workspaces (id, name, owner_user_id, city, business_type)
SELECT
  ('a0000000-0000-0000-0000-' || LPAD(i::text, 12, '0'))::uuid,
  'Perf Workspace ' || i,
  ('00000000-0000-0000-0000-' || LPAD(i::text, 12, '0'))::uuid,
  'PerfCity', 'residential_lease'
FROM generate_series(1, 100) AS i;

-- Create 100,000+ workspace_members rows
INSERT INTO public.workspace_members (id, workspace_id, user_id, role, status)
SELECT
  gen_random_uuid(),
  ('a0000000-0000-0000-0000-' || LPAD(ws::text, 12, '0'))::uuid,
  ('00000000-0000-0000-0000-' || LPAD(member::text, 12, '0'))::uuid,
  CASE WHEN member = ws THEN 'owner'::public.workspace_role ELSE 'member'::public.workspace_role END,
  'active'::public.member_status
FROM generate_series(1, 100) AS ws,
     generate_series(1, 1000) AS member
WHERE member <= 1000;

-- Update statistics for accurate planner decisions
ANALYZE public.workspace_members;
ANALYZE public.workspaces;

-- =============================================================================
-- Test 1-2: Verify row counts (data generation)
-- =============================================================================
SELECT is(
  (SELECT count(*) FROM public.workspaces),
  100::bigint,
  'Test 1: 100 workspaces generated'
);

SELECT is(
  (SELECT count(*) FROM public.workspace_members),
  100000::bigint,
  'Test 2: 100,000 workspace_members rows generated'
);

-- =============================================================================
-- Test 3-6: Query execution checks (lives_ok)
-- =============================================================================

-- Test 3: Scenario A — Member lookup by (workspace_id, user_id)
SELECT lives_ok(
  $$SELECT 1 FROM public.workspace_members
    WHERE workspace_id = 'a0000000-0000-0000-0000-000000000050'::uuid
      AND user_id = '00000000-0000-0000-0000-000000000500'::uuid$$,
  'Test 3: Scenario A — Member lookup query executes'
);

-- Test 4: Scenario B — User workspace list (user_id + status)
SELECT lives_ok(
  $$SELECT workspace_id FROM public.workspace_members
    WHERE user_id = '00000000-0000-0000-0000-000000000500'::uuid
      AND status = 'active'$$,
  'Test 4: Scenario B — User workspace list query executes'
);

-- Test 5: Scenario C — Owner check via workspaces table
SELECT lives_ok(
  $$SELECT EXISTS (
    SELECT 1 FROM public.workspaces
    WHERE id = 'a0000000-0000-0000-0000-000000000050'::uuid
      AND owner_user_id = '00000000-0000-0000-0000-000000000050'::uuid
  )$$,
  'Test 5: Scenario C — Owner check query executes'
);

-- Test 6: Scenario D — Owner reads all members of a workspace
SELECT lives_ok(
  $$SELECT user_id, role, status FROM public.workspace_members
    WHERE workspace_id = 'a0000000-0000-0000-0000-000000000050'::uuid$$,
  'Test 6: Scenario D — Owner member list query executes'
);

-- =============================================================================
-- Test 7-10: Plan verification — no Seq Scan on 100K-row workspace_members
-- =============================================================================

-- Test 7: Scenario A must use index, not Seq Scan on 100K table
SELECT ok(
  pg_temp.no_seq_scan(
    $$SELECT 1 FROM public.workspace_members
      WHERE workspace_id = 'a0000000-0000-0000-0000-000000000050'::uuid
        AND user_id = '00000000-0000-0000-0000-000000000500'::uuid$$,
    'workspace_members'
  ),
  'Test 7: Scenario A — No Seq Scan on workspace_members (composite lookup)'
);

-- Test 8: Scenario B must use index, not Seq Scan on 100K table
SELECT ok(
  pg_temp.no_seq_scan(
    $$SELECT workspace_id FROM public.workspace_members
      WHERE user_id = '00000000-0000-0000-0000-000000000500'::uuid
        AND status = 'active'$$,
    'workspace_members'
  ),
  'Test 8: Scenario B — No Seq Scan on workspace_members (user reverse lookup)'
);

-- Test 9: Scenario C — Owner check returns correct boolean result
-- (Seq Scan on small workspaces table is acceptable; 100 rows is trivial)
SELECT is(
  (SELECT EXISTS (
    SELECT 1 FROM public.workspaces
    WHERE id = 'a0000000-0000-0000-0000-000000000050'::uuid
      AND owner_user_id = '00000000-0000-0000-0000-000000000050'::uuid
  )),
  true,
  'Test 9: Scenario C — Owner check returns true for correct owner'
);

-- Test 10: Scenario D must use index, not Seq Scan on 100K table
SELECT ok(
  pg_temp.no_seq_scan(
    $$SELECT user_id, role, status FROM public.workspace_members
      WHERE workspace_id = 'a0000000-0000-0000-0000-000000000050'::uuid$$,
    'workspace_members'
  ),
  'Test 10: Scenario D — No Seq Scan on workspace_members (single workspace read)'
);

-- =============================================================================
-- Cleanup
-- =============================================================================
SELECT * FROM finish();

ROLLBACK;
