-- AI Quota RPC Atomicity Tests
-- Requires: local Supabase instance (supabase start)
-- Run: supabase test db
--
-- Tests reserve_ai_quota, settle_ai_quota, release_ai_quota
-- for atomicity, idempotency, state machine, and workspace isolation.

-- =============================================================================
-- Setup: Create test users and workspace
-- =============================================================================

\begin{pgttap}

-- Test 1: reserve_ai_quota succeeds for authenticated workspace member
SELECT is(
  (SELECT (public.reserve_ai_quota(
    p_user_id := auth.uid(),
    p_workspace_id := current_setting('test.workspace_id')::uuid,
    p_feature := 'content_factory',
    p_request_limit := 10,
    p_daily_cost_limit_usd := 10.0,
    p_reserved_estimated_cost_usd := 0.01,
    p_idempotency_key := 'test-idem-001',
    p_request_id := 'test-req-001'
  )->>'success')::boolean,
  true,
  'reserve_ai_quota should succeed for valid request'
);

-- Test 2: Same idempotency_key returns already_reserved
SELECT is(
  (SELECT (public.reserve_ai_quota(
    p_user_id := auth.uid(),
    p_workspace_id := current_setting('test.workspace_id')::uuid,
    p_feature := 'content_factory',
    p_request_limit := 10,
    p_daily_cost_limit_usd := 10.0,
    p_reserved_estimated_cost_usd := 0.01,
    p_idempotency_key := 'test-idem-001',
    p_request_id := 'test-req-001'
  )->>'already_reserved')::boolean,
  true,
  'repeat idempotency_key should return already_reserved'
);

-- Test 3: settle_ai_quota transitions reserved → succeeded
-- (Requires the reservation_id from test 1)

-- Test 4: Repeat settle is idempotent

-- Test 5: release_ai_quota transitions reserved → released

-- Test 6: Repeat release is idempotent

-- Test 7: Settled cannot be released (state machine violation)

-- Test 8: Released cannot be settled (state machine violation)

-- Test 9: Cross-workspace isolation — user cannot operate on other workspace quota

-- Test 10: Unauthenticated user cannot call RPC (auth.uid() null → UA001 error)

\end{pgttap}
