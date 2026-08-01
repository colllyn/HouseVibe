# PHASE1B-AUTH-002 test-engineer handoff

**Gate**: PHASE1B-AUTH-E2E-GATE-004
**Date**: 2026-07-31
**Agent**: test-engineer
**Status**: COMPLETE (gate failed — 3 production defects found, 6/7 tests failed)

---

## 1. Auth E2E Files

| File | Tests | Type |
|---|---|---|
| `e2e/auth-flows.spec.ts` | 7 | Auth E2E (Playwright) |
| `e2e/smoke.spec.ts` | 7 | Smoke E2E (Playwright) |

Total: 14 E2E tests across 2 files. Auth suite has 7 tests; the `test:e2e:auth` npm script does NOT exist — using `npx playwright test e2e/auth-flows.spec.ts` directly.

---

## 2. Execution Command

```bash
NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..." \
SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
NEXT_PUBLIC_APP_URL="http://localhost:3000" \
INVITE_TOKEN_SECRET="test-invite-token-local-e2e-32-chars-min" \
npx playwright test e2e/auth-flows.spec.ts
```

Playwright config auto-started the Next.js dev server via `webServer` option.

---

## 3. Test Results

| Test | Status | Duration (est.) | Root Cause |
|---|---|---|---|
| E2E-1: Unauthenticated redirect | PASSED | ~3s | — |
| E2E-2: Registration success | FAILED | ~15s | Test defect: ambiguous locator `text=注册成功` matches 2 elements |
| E2E-3: Login redirect | FAILED | ~15s | Production defect: /onboarding infinite redirect loop |
| E2E-4: Dashboard after login | FAILED | ~15s | Same root cause as E2E-3 |
| E2E-5: Wrong password | FAILED | ~10s | Global empty alert element interferes with test |
| E2E-6: Open redirect sanitization | FAILED | ~3s | Production defect: `getSafeNextPath()` not called before form render |
| E2E-7: Sign out | FAILED | ~15s | Same root cause as E2E-3 |

- **Total**: 7
- **Passed**: 1
- **Failed**: 6
- **Skipped**: 0
- **Exit code**: 1

---

## 4. Scenario Coverage

The test suite has 7 tests. The gate listed 14 scenarios. Coverage mapping:

| # | Scenario | Covered By | Result |
|---|---|---|---|
| 1 | Unauthenticated access to Dashboard | E2E-1 | PASSED |
| 2 | Registration | E2E-2 | FAILED (test locator, not prod) |
| 3 | Email confirmation | NOT COVERED | Suite uses `email_confirm: true` (admin API bypass) |
| 4 | Callback establishing Session | NOT COVERED | No separate callback test |
| 5 | Onboarding creating Workspace | NOT COVERED | /onboarding unreachable due to redirect loop |
| 6 | Owner Membership | NOT COVERED | Depends on workspace creation |
| 7 | Logout | E2E-7 | FAILED (same root cause as E2E-3) |
| 8 | Re-login | NOT COVERED | No separate re-login test |
| 9 | Wrong password | E2E-5 | FAILED (global alert interference) |
| 10 | Open Redirect | E2E-6 | FAILED (prod defect) |
| 11 | Correct invitation | NOT COVERED | No invitation test in suite |
| 12 | Wrong Email | NOT COVERED | No separate test |
| 13 | Expired Invitation | NOT COVERED | No invitation test in suite |
| 14 | Token Replay | NOT COVERED | No token replay test |

**Covered**: 7 of 14 scenarios mapped (with only 1 passing)
**Not covered**: 7 scenarios (3 email confirmation/callback, 4 invitation-related)

---

## 5. Production Defects Found

### DEFECT-1: /onboarding infinite redirect loop
- **Severity**: HIGH
- **Affected tests**: E2E-3, E2E-4, E2E-7
- **File**: `src/app/(dashboard)/layout.tsx:27-28`
- **Root cause**: Dashboard layout wraps all routes in `(dashboard)` route group including `/onboarding`. When `getActiveWorkspaceCount()` returns 0, it redirects to `/onboarding`, which hits the same layout and triggers the redirect again.
- **Expected**: `/onboarding` should be reachable for workspace-less users.
- **Suggested fix** (owner only): Check `pathname` and skip the redirect when already on `/onboarding`.
- **Reproduction**: Login with any user (test creates via admin API with `email_confirm: true`). User has 0 workspaces and gets caught in redirect loop.

### DEFECT-2: Open redirect not sanitized in login form
- **Severity**: HIGH (security)
- **Affected tests**: E2E-6
- **File**: `src/features/auth/login-form.tsx:40`
- **Root cause**: The `next` query parameter from `searchParams` is rendered directly into the hidden input without calling `getSafeNextPath()`. The function exists and works correctly (`src/features/auth/redirects.ts:19`), and IS called on the server action side (`src/features/auth/actions.ts:84`), but the DOM exposes the raw malicious URL.
- **Expected**: Hidden input should contain sanitized `/dashboard` for `?next=//evil.example`.
- **Received**: Hidden input contains `//evil.example`.
- **Reproduction**: Visit `/login?next=//evil.example` and inspect `input[name="next"][type="hidden"]`.

### DEFECT-3 (POTENTIAL): Global empty alert element
- **Severity**: LOW (environmental)
- **Affected tests**: E2E-5
- **Observation**: A global `<div role="alert">` with empty text content appears on every page (seen in both E2E-5 and E2E-6 page snapshots at root level). This interferes with tests that use broad `[role="alert"]` selectors. Source may be Next.js Dev Tools or a development component.
- **Impact**: E2E-5's `page.locator('[role="alert"]')` matches this global element instead of the form error, causing `textContent()` to return `""`.
- **Note**: The form's actual error rendering could not be verified due to this interference. The form error may or may not render correctly — this needs investigation with a more specific selector.

---

## 6. Test Defect Found

### TEST-DEFECT-1: Ambiguous locator in E2E-2
- **Severity**: LOW
- **File**: `e2e/auth-flows.spec.ts:127`
- **Root cause**: `page.locator("text=注册成功")` matches both `<h1>注册成功</h1>` and `<p>注册成功！请检查邮箱完成验证后登录。</p>`, causing Playwright strict mode violation.
- **Registration flow itself WORKS correctly** — the success page renders properly.
- **Suggested fix**: Use `page.getByRole('heading', { name: '注册成功' })` or `page.locator("text=注册成功").first()`.

---

## 7. Chromium / Environment

| Item | Detail |
|---|---|
| Chromium version | Chrome for Testing 151.0.7922.34 (Playwright chromium v1234) |
| Install location | `/Users/colyn/Library/Caches/ms-playwright/chromium-1234` |
| Playwright version | From project (see package.json) |
| Base URL | `http://localhost:3000` |
| Dev server | Auto-started by Playwright `webServer` config |
| OS | macOS Darwin 25.5.0 (arm64) |

---

## 8. Local Supabase Confirmation

| Check | Result |
|---|---|
| Supabase running locally | YES (`127.0.0.1:54322` PG, `127.0.0.1:54321` API) |
| Connected to remote Supabase | NO — all URLs are `127.0.0.1` |
| Mailpit (local email) | YES (`127.0.0.1:54324`) |
| Supabase version | Local CLI stack |
| `SERVICE_ROLE_KEY` used | YES (for test user create/delete via admin API) |
| Real email used | NO — all `@example.invalid` addresses |

---

## 9. Email Confirmation Method

Tests use two approaches:
- **E2E-2 (Registration)**: Real UI registration flow. Supabase sends confirmation email to local Mailpit, but the test does NOT verify the email flow — it only checks the success message page.
- **E2E-3 through E2E-7**: Admin API `createUser` with `email_confirm: true` bypasses email confirmation entirely.

Neither approach actually tests the end-to-end email confirmation + callback flow. This is a gap in the E2E suite.

---

## 10. Invitation Tests

**Not covered.** The 14-scenario gate list includes invitation tests (scenarios 11-14: correct invitation, wrong email, expired invitation, token replay) but the E2E suite has ZERO invitation tests. The `acceptInviteAction` exists in `src/features/auth/actions.ts` but is not exercised by any E2E test.

---

## 11. Data Cleanup

| Item | Status | Detail |
|---|---|---|
| Test Auth Users | CLEANED | 1 leftover (E2E-2 registration) manually deleted. Others cleaned by `finally` blocks. |
| Test Workspaces | NONE | No workspace ever created (onboarding loop prevented it) |
| Memberships | NONE | No workspace = no memberships |
| Invitations | NONE | No invitation tests in suite |
| Audit data | UNCHECKED | `psql` not available in environment; REST API permission denied for service_role on workspaces table |
| Leftover processes | NONE | Dev server stopped by Playwright. No port occupations on 3000 or 9323. |
| Test secrets on disk | NONE | No `.env.local` written. Only Supabase `.temp/start-secrets` (normal local stack). |
| `.env.local` | NOT CREATED | Env vars passed inline via command line |

---

## 12. Worktree

**Not used.** All work performed in the main workspace at `/Users/colyn/HouseVibe`.

---

## 13. Remote Supabase

**Not connected.** Confirmed all endpoints are `127.0.0.1` (local). No remote project ref in play.

---

## 14. Residual Risks

1. **`psql` unavailable** — Could not verify database-level cleanup (workspace_members, audit_logs, invitations tables). No test workspaces were created due to the redirect loop, so risk is low.
2. **Email confirmation gap** — No E2E test covers the full email confirmation + callback flow. Test users are created with `email_confirm: true` bypass.
3. **Invitation gap** — Full invitation lifecycle (create, accept, expired, token replay) has zero E2E coverage.
4. **Onboarding gap** — Workspace creation cannot be tested until the redirect loop is fixed.
5. **E2E-5 inconclusive** — Could not determine whether the login form error message renders correctly due to global alert interference.
6. **`test:e2e:auth` script missing** — `package.json` has `test:e2e` (all E2E) but no `test:e2e:auth` (auth-only).

---

## 15. Conclusion

**GATE STATUS: FAIL**

The Auth E2E suite has 6 of 7 tests failing. Two HIGH-severity production defects found:
1. `/onboarding` infinite redirect loop (`src/app/(dashboard)/layout.tsx:27-28`)
2. Open redirect not sanitized in login form DOM (`src/features/auth/login-form.tsx:40`)

These defects block the gate. The suite also has significant coverage gaps: no email confirmation flow test, no invitation tests, no onboarding workspace creation test. Only 7 of 14 gate scenarios are addressed, and only 1 passes.

**Recommendation**: Fix DEFECT-1 and DEFECT-2 first, then re-run. Consider adding invitation and email confirmation E2E tests to close the coverage gaps.
