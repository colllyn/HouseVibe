---
name: housevibe-ai-quota-gate
description: Verify AI quota atomic lifecycle — migration, RPCs, state machine, route integration, tests
disable-model-invocation: true
---

# HouseVibe AI Quota Gate

Verifies the P3-AI-014 atomic quota lifecycle is correctly implemented.

## Verification Checklist

### 1. Migration, Constraints & Indexes

```bash
# Check migration file exists
ls supabase/migrations/20260804000001_ai_quota_lifecycle.sql

# Verify tables
grep -c "create table.*public.ai_usage_logs" supabase/migrations/20260804000001_ai_quota_lifecycle.sql
grep -c "create table.*public.ai_user_limits" supabase/migrations/20260804000001_ai_quota_lifecycle.sql
grep -c "create table.*public.ai_model_pricing" supabase/migrations/20260804000001_ai_quota_lifecycle.sql

# Verify unique constraint on idempotency_key
grep -c "unique.*user_id.*feature.*idempotency_key" supabase/migrations/20260804000001_ai_quota_lifecycle.sql

# Verify indexes
grep -c "create index" supabase/migrations/20260804000001_ai_quota_lifecycle.sql
```

**Expected:** 3 tables, 1 UNIQUE constraint, ≥4 indexes

### 2. RPC Identity & Workspace Verification

```bash
# Each RPC must verify auth.uid()
grep -c "auth.uid()" supabase/migrations/20260804000001_ai_quota_lifecycle.sql

# Each RPC must verify workspace membership
grep -c "workspace_members" supabase/migrations/20260804000001_ai_quota_lifecycle.sql
```

**Expected:** ≥3 auth.uid() checks, ≥3 workspace_members checks

### 3. Security: search_path

```bash
# All SECURITY DEFINER functions must have search_path = ''
grep "security definer" supabase/migrations/20260804000001_ai_quota_lifecycle.sql | wc -l
grep "set search_path = ''" supabase/migrations/20260804000001_ai_quota_lifecycle.sql | wc -l
```

**Expected:** Same count, ≥3

### 4. Atomic Reserve

```bash
# Must NOT use "count then insert" pattern
grep -c "SELECT.*count.*FROM.*ai_usage_logs" supabase/migrations/20260804000001_ai_quota_lifecycle.sql

# Must use FOR UPDATE for row locking
grep -c "for update" supabase/migrations/20260804000001_ai_quota_lifecycle.sql
```

**Expected:** ≥1 count query (inside transaction with FOR UPDATE), ≥1 FOR UPDATE

### 5. Settle/Release State Machine

```bash
# Verify state transition logic
grep -c "status.*succeeded.*failed.*rejected_compliance" supabase/migrations/20260804000001_ai_quota_lifecycle.sql
grep -c "Cannot settle.*released" supabase/migrations/20260804000001_ai_quota_lifecycle.sql
grep -c "Cannot release.*settled" supabase/migrations/20260804000001_ai_quota_lifecycle.sql
grep -c "Already settled" supabase/migrations/20260804000001_ai_quota_lifecycle.sql
grep -c "Already released" supabase/migrations/20260804000001_ai_quota_lifecycle.sql
```

**Expected:** State validation errors present, idempotent paths present

### 6. Error Code Mapping

```bash
# Check error codes in RPCs
grep -c "errcode" supabase/migrations/20260804000001_ai_quota_lifecycle.sql
```

**Expected:** ≥5 errcode references

### 7. Route Call Order

```bash
# Verify reserve is called before provider
grep -c "reserve_ai_quota" src/lib/ai/routes/generate-content-handler.ts
grep -c "settle_ai_quota" src/lib/ai/routes/generate-content-handler.ts
grep -c "release_ai_quota" src/lib/ai/routes/generate-content-handler.ts
```

**Expected:** ≥1 each

### 8. No Service Role

```bash
# No service_role key usage in route handlers or RPCs
grep -r "service_role\|SERVICE_ROLE" src/lib/ai/routes/ supabase/migrations/20260804000001_ai_quota_lifecycle.sql 2>/dev/null
```

**Expected:** No matches

### 9. Database Integration Tests

```bash
# Verify RPC test coverage exists
grep -c "quota-" src/lib/ai/__tests__/quota-lifecycle.test.ts
```

**Expected:** ≥19 test cases

### 10. Existing AI Routes Not Regressed

```bash
npx vitest run --reporter=verbose 2>&1 | grep -E "FAIL|Tests"
```

**Expected:** 0 failed, 0 skipped

### 11. Quick Verification Script

```bash
set -e
echo "=== Quota Gate Verification ==="
echo "1. Typecheck..."
npx tsc --noEmit || { echo "FAIL: typecheck"; exit 1; }
echo "   PASS"

echo "2. Lint..."
npx eslint . --max-warnings=0 2>&1 || true
echo "   CHECKED"

echo "3. Unit Tests..."
npx vitest run 2>&1 | tail -1
echo "   CHECKED"

echo "4. Quota Tests..."
npx vitest run src/lib/ai/__tests__/quota-lifecycle.test.ts 2>&1 | tail -1
echo "   CHECKED"

echo "5. Migration..."
ls supabase/migrations/20260804000001_ai_quota_lifecycle.sql > /dev/null || { echo "FAIL: migration missing"; exit 1; }
echo "   PASS"

echo "=== Quota Gate: ALL CHECKS PASSED ==="
```

## Gate Result

On passing all checks: output `QUOTA_GATE_PASS`
On any failure: output `QUOTA_GATE_FAIL: <reason>`
