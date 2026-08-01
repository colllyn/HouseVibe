---
name: housevibe-auth-gate
description: Run the complete HouseVibe authentication, onboarding, invitation, database, and E2E security gate before committing or entering the next phase.
disable-model-invocation: true
---

# HouseVibe Auth Gate

Run this gate only when the user explicitly invokes:

`/housevibe-auth-gate`

This skill is verification-only.

## Rules

- Do not modify files.
- Do not fix failures.
- Do not use worktrees.
- Do not connect to remote Supabase.
- Do not use real secrets.
- Do not run `db push`.
- Do not execute Git commit, merge, rebase, reset, clean, or push.
- Report every failure as a blocker.
- Never convert a failed or skipped check into PASS.

## Agent gate

Start these agents in the current workspace:

- `test-engineer`
- `quality-reviewer`

They must not use worktrees.

If either agent is unavailable, return FAIL.

## Run the gate

Execute from the Git root:

```bash
git diff --check
git status --short

npx supabase status

npm run db:reset
npm run db:test
npm run db:test
npm run db:lint
npm run db:test:performance
npm run db:test:performance

npm run lint
npm run typecheck
npm run test
npm run build

npm run test:e2e -- --list
npm run test:e2e:auth
```

Check for disabled tests:

```bash
grep -RniE \
  "test\.skip|describe\.skip|it\.skip|todo\(|xit\(|xdescribe\(" \
  src e2e supabase/tests || true
```

## Required Auth coverage

Confirm actual executable coverage for:

1. Unauthenticated Dashboard
2. Registration
3. Email confirmation
4. Callback Session
5. Onboarding
6. Owner Membership
7. Sign out
8. Sign in again
9. Invalid password
10. Open Redirect
11. Valid invitation
12. Wrong Email
13. Expired Invitation
14. Token Replay

Also confirm:

* E2E setup fails with a non-zero exit code;
* raw invitation tokens are not stored;
* invitation acceptance is atomic;
* no `getSession()` result is used for authorization;
* no Service Role client exists in application code;
* no remote Supabase connection is used.

## Reviewer

Ask `quality-reviewer` to perform a final read-only review.

PASS requires:

* DB tests pass twice;
* performance tests pass twice;
* lint, typecheck, unit tests, and build pass;
* Auth E2E passes;
* all 14 Auth scenarios are covered;
* no skipped tests;
* P0 = 0;
* P1 = 0.

## Output

Return a concise report containing:

* overall conclusion;
* database results;
* application results;
* Auth E2E results;
* 14-scenario coverage;
* reviewer P0–P3;
* Git status;
* blockers.

The conclusion must be exactly one of:

`PASS: HouseVibe Auth Gate 全部通过`

`CONDITIONAL PASS: Auth Gate 仍有未关闭门禁`

`FAIL: Auth Gate 验证失败`
