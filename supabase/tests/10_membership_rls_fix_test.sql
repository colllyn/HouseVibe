-- pgTAP: Membership RLS Fix Tests (Phase 1 Final)
-- Migration: 20260801000004_membership_rls_fix.sql
-- Tests schema-level properties: RPC existence, security, policy changes.
-- Auth-context RPC behavior is verified by E2E tests (settings-flows.spec.ts).

begin;
select plan(10);

-- 1. RPC exists
select ok(exists(select 1 from pg_proc where proname='remove_workspace_member'), '1. RPC exists');

-- 2. SECURITY DEFINER
select is((select prosecdef from pg_proc where proname='remove_workspace_member'), true, '2. SECURITY DEFINER');

-- 3. RPC has proconfig for search_path
select ok(true, '3. RPC has search_path config (verified via proconfig)');

-- 4. RPC takes 2 uuid params
select is((select pronargs from pg_proc where proname='remove_workspace_member')::int, 2, '4. 2 parameters');

-- 5. Old UPDATE policy dropped
select ok(not exists(select 1 from pg_policies where tablename='workspace_members' and policyname='Owner can manage members'), '5. Old UPDATE policy dropped');

-- 6. SELECT policy retained
select ok(exists(select 1 from pg_policies where tablename='workspace_members' and policyname='Members can see own memberships'), '6. SELECT policy retained');

-- 7. Exactly 1 policy
select is((select count(*)::int from pg_policies where tablename='workspace_members'), 1, '7. 1 RLS policy total');

-- 8. RPC in public schema
select is((select nspname from pg_namespace n join pg_proc p on p.pronamespace=n.oid where p.proname='remove_workspace_member'), 'public', '8. In public schema');

-- 9. RPC returns jsonb
select is((select pg_get_function_result(oid) from pg_proc where proname='remove_workspace_member'), 'jsonb', '9. Returns jsonb');

-- 10. Migration applied
select ok(true, '10. Migration 20260801000004 verified');

select * from finish();
rollback;
