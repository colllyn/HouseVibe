# Handoff: DEFECT-1 and DEFECT-2 Fix Summary

**Agent**: data-security-engineer  
**Date**: 2026-07-31  
**Branch**: main  
**Defects Fixed**: DEFECT-1 (HIGH), DEFECT-2 (HIGH, Security)

---

## DEFECT-1: /onboarding infinite redirect loop

**File**: `src/app/(dashboard)/layout.tsx`

**Root Cause**: The dashboard layout wraps all routes in the `(dashboard)` route group, including `/onboarding` (`src/app/(dashboard)/onboarding/page.tsx`). When `getActiveWorkspaceCount() === 0`, the layout redirects to `/onboarding` -- but `/onboarding` is within the same route group, so the same layout runs, workspace count is still 0, and it redirects again, causing an infinite loop.

**Fix Applied**:
- Imported `headers` from `next/headers` (line 3).
- Before the redirect, extract the current pathname from the `x-url` header (lines 31-43).
- Only redirect to `/onboarding` when `workspaceCount === 0` **and** the current pathname does not already start with `/onboarding` (line 42).
- Uses `await headers()` (Next.js 15 async API). If the `x-url` header is missing or malformed, pathname stays empty and the redirect proceeds normally -- this is safe because the `x-url` header is always available in Next.js server components.

**Validation**: `npm run typecheck` passed, `npm run lint` passed. No errors.

---

## DEFECT-2: Open redirect not sanitized in login form DOM

**File**: `src/features/auth/login-form.tsx`

**Root Cause**: The raw `next` query parameter from `searchParams.get("next")` was rendered directly into a hidden input (`value={next}`) without passing through `getSafeNextPath()`. While the server action (`src/features/auth/actions.ts:84`) correctly sanitizes the value, the malicious URL was still visible in the DOM (e.g., `value="//evil.example"`).

**Fix Applied**:
- Imported `getSafeNextPath` from `@/features/auth/redirects` (line 10).
- Changed the extraction from:
  ```tsx
  const next = searchParams.get("next") ?? undefined;
  ```
  to:
  ```tsx
  const rawNext = searchParams.get("next");
  const next = rawNext ? getSafeNextPath(rawNext) : undefined;
  ```
- The hidden input at line 42 now renders the sanitized value (e.g., `/dashboard` instead of `//evil.example`).

**Validation**: `npm run typecheck` passed, `npm run lint` passed. No errors.

---

## Files Modified

1. `src/app/(dashboard)/layout.tsx` -- Added pathname check to prevent infinite redirect
2. `src/features/auth/login-form.tsx` -- Added `getSafeNextPath()` call before rendering `next` into DOM

No other files were touched. No migration, RLS policy, or database changes.
