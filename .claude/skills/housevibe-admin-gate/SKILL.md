---
name: housevibe-admin-gate
description: Verify HouseVibe system-admin, feature-entitlement, admin invitation, RLS, audit, and Admin E2E security gates before committing or entering another phase.
disable-model-invocation: true
---

# HouseVibe Admin Gate

Run only when the user explicitly invokes:

`/housevibe-admin-gate`

This skill is verification-only.

## Rules

- Do not modify or fix files.
- Do not use worktrees.
- Do not connect to remote Supabase.
- Do not use real secrets.
- Do not run `db push`.
- Do not execute Git commit, merge, rebase, reset, clean, or push.
- Any failed or skipped check blocks PASS.

## Agent gate

Start in the current workspace:

- `test-engineer`
- `quality-reviewer`

Return FAIL if either agent is unavailable.

## Run verification

Execute from the Git root:

```bash
git diff --check
git status --short

npx supabase status

npm run db:reset
npm run db:test
npm run db:lint
npm run db:test:performance

npm run lint
npm run typecheck
npm run test
npm run build

npm run test:e2e -- --list
npm run test:e2e:auth
npm run test:e2e:admin
```

Check for disabled tests:

```bash
grep -RniE \
  "test\.skip|describe\.skip|it\.skip|todo\(|xit\(|xdescribe\(" \
  src e2e supabase/tests || true
```

Check forbidden application credentials:

```bash
grep -RniE \
  "SUPABASE_SERVICE_ROLE_KEY|service_role" \
  src || true
```

## Required Admin coverage

Confirm executable coverage for:

1. Non-admin cannot see Admin navigation.
2. Non-admin cannot access Admin routes.
3. System Admin can access the Admin shell.
4. Users cannot promote themselves to System Admin.
5. Users cannot grant themselves Features.
6. Feature grant becomes active.
7. Disabled Feature immediately becomes unavailable.
8. Revoked Feature immediately becomes unavailable.
9. Expired Feature is unavailable.
10. `content_factory` is denied by default.
11. Disable and Revoke use different RPCs and statuses.
12. Disable does not set `revoked_by` or `revoked_at`.
13. Revoke sets `revoked_by` and `revoked_at`.
14. Audit distinguishes granted, disabled, and revoked.
15. Admin invitation creation and revocation work.
16. Raw invitation Token is returned once and is not persisted.

Also confirm:

* authorization uses trusted users and database enforcement;
* Admin Layout, Actions, and Routes verify permissions server-side;
* RLS and RPC cannot be bypassed through direct REST requests;
* `SECURITY DEFINER` functions use a fixed `search_path`;
* Admin responses are not publicly cached;
* application code contains no Service Role client;
* seed data contains no real user, email, or secret.

## Reviewer

Ask `quality-reviewer` for a final read-only review.

PASS requires:

* all database tests pass;
* performance tests pass;
* lint, typecheck, unit tests, and build pass;
* Auth and Admin E2E pass;
* no skipped tests;
* required Admin scenarios are covered;
* P0 = 0;
* P1 = 0.

## Output

Return a concise report containing:

* overall conclusion;
* database and application results;
* Auth and Admin E2E results;
* Admin security coverage;
* Disable/Revoke semantics;
* reviewer P0-P3;
* Git status;
* blockers.

The conclusion must be exactly one of:

`PASS: HouseVibe Admin Gate 全部通过`

`CONDITIONAL PASS: Admin Gate 仍有未关闭门禁`

`FAIL: Admin Gate 验证失败`
