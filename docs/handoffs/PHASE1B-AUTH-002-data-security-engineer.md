# PHASE1B-AUTH-002 Handoff

| 属性 | 值 |
|---|---|
| Task ID | PHASE1B-AUTH-002 |
| Agent | data-security-engineer |
| 状态 | COMPLETED |
| 日期 | 2026-07-31 |

---

## 1. Modified Files

### New Files Created

| File | Purpose |
|---|---|
| `src/middleware.ts` | Next.js 15 middleware — session refresh + cache control |
| `src/lib/supabase/middleware.ts` | `updateSession()` — request-scoped Supabase client with cookie sync |
| `src/features/auth/schemas.ts` | Zod schemas: LoginInput, RegisterInput, OnboardingInput |
| `src/features/auth/errors.ts` | `mapAuthError()` — generic error mapping (no account enumeration) |
| `src/features/auth/redirects.ts` | `getSafeNextPath()` — Open Redirect protection |
| `src/features/auth/session.ts` | `getAuthenticatedUser()`, `getActiveWorkspaceCount()` |
| `src/features/auth/actions.ts` | Server Actions: signUp, signIn, signOut, createWorkspace, acceptInvite |
| `src/features/auth/invite-token.ts` | `hashInviteToken()` — HMAC-SHA-256 token hashing |
| `src/app/(auth)/layout.tsx` | Auth page layout (centered card, no AppShell) |
| `src/app/(auth)/login/page.tsx` | Login form with Email+Password, ?next= support |
| `src/app/(auth)/register/page.tsx` | Registration form with terms acceptance |
| `src/app/(auth)/join/[token]/page.tsx` | Invite page (unauthenticated + authenticated modes) |
| `src/app/auth/callback/route.ts` | Auth callback — exchangeCodeForSession |
| `src/app/auth/error/page.tsx` | Generic auth error page |
| `src/app/(dashboard)/dashboard/page.tsx` | Dashboard page (moved from deleted duplicate) |
| `src/app/(dashboard)/onboarding/page.tsx` | Workspace creation onboarding form |
| `supabase/migrations/20260731000001_invitation_links.sql` | invitation_links table + accept_workspace_invitation RPC + RLS |

### Modified Files

| File | Change |
|---|---|
| `src/app/(dashboard)/layout.tsx` | Added auth guard: getUser() + workspace membership check |

### Deleted Files

| File | Reason |
|---|---|
| `src/app/dashboard/layout.tsx` | Duplicate of `(dashboard)/layout.tsx` |
| `src/app/dashboard/page.tsx` | Moved to `(dashboard)/dashboard/page.tsx` |
| `src/app/dashboard/` (directory) | Empty after file removal |
| `src/app/(dashboard)/page.tsx` | Conflicted with root `page.tsx` (both mapped to `/`) |

---

## 2. Auth Flow

### Registration
1. User fills form at `/register`
2. Client validates with Zod (RegisterInputSchema)
3. `signUpAction` Server Action: validates → supabase.auth.signUp → emailRedirectTo set to `/auth/callback`
4. No user_metadata fields written (no system_admin, role, workspace_id, entitlement)
5. Profile auto-created by existing DB trigger
6. Success message: "请检查邮箱完成验证"

### Login
1. User fills form at `/login`
2. `signInAction` Server Action: validates → supabase.auth.signInWithPassword
3. On success: counts active workspace memberships
4. 0 workspaces → redirect `/onboarding`
5. ≥1 workspaces → redirect safe `next` or `/dashboard`
6. On failure: generic "邮箱或密码错误" (no account enumeration)

### Email Confirmation
- Not enforced in Phase 1 (optional per PRD §7.1)
- Callback at `/auth/callback` handles `code` exchange via PKCE
- Validates `next` parameter with getSafeNextPath()
- Cache-Control: private, no-store

### Sign Out
- `signOutAction` Server Action (POST only, never GET)
- Clears Supabase session cookies
- Redirects to `/login`

### Dashboard Protection
- `(dashboard)/layout.tsx`: calls getAuthenticatedUser() → `getUser()` validates with auth server
- Counts active workspace_members → 0 → redirect `/onboarding`
- Dynamic rendering (no caching of user-specific data)
- Does NOT use `getSession()` for authorization

---

## 3. Cookie & Middleware

### Middleware (`src/middleware.ts`)
- Calls `updateSession()` on every request
- Matcher excludes: `_next/static`, `_next/image`, `favicon.ico`, static images, fonts
- Adds `Cache-Control: private, no-store` to all responses
- No business data queries, entitlement checks, or Service Role usage
- No redirect logic — route protection is in layout guards

### Session Refresh (`src/lib/supabase/middleware.ts`)
- Creates request-scoped `createServerClient`
- Reads cookies from request
- Calls `getUser()` to refresh session
- Writes updated cookies to BOTH request and response
- Preserves Supabase cookie options (secure, httpOnly, sameSite, etc.)

---

## 4. Route Structure

```
src/app/
├── (auth)/                    # Route group (no URL segment)
│   ├── layout.tsx             # Centered card layout
│   ├── login/page.tsx        # /login
│   ├── register/page.tsx     # /register
│   └── join/[token]/page.tsx # /join/<token>
├── (dashboard)/               # Route group (no URL segment)
│   ├── layout.tsx             # Auth guard + AppShell
│   ├── dashboard/page.tsx    # /dashboard
│   └── onboarding/page.tsx   # /onboarding
├── auth/
│   ├── callback/route.ts     # /auth/callback
│   └── error/page.tsx        # /auth/error
├── layout.tsx                 # Root layout
├── page.tsx                   # Root page (/)
└── globals.css
```

No duplicate routes. No `src/app/dashboard/` directory. No `(dashboard)/page.tsx` conflicting with root.

---

## 5. Onboarding

- `/onboarding` page: accessible only to authenticated users with 0 active workspaces
- Users with ≥1 active workspace are redirected to `/dashboard`
- Form: workspace name (required), city (optional)
- Privacy/terms notice
- Submit calls `createWorkspaceAction` → existing `create_workspace_with_owner` RPC
- RPC atomically creates workspace + owner membership in a single transaction
- Prevent double-submit with disabled button during submission
- Loading/error/submitting states
- Touch targets ≥44px

---

## 6. Invitation Model

### Table: `invitation_links`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | gen_random_uuid() |
| token_hash | TEXT NOT NULL | HMAC-SHA-256 digest only |
| created_by | UUID FK profiles | Creator user |
| target_workspace_id | UUID FK workspaces | Target workspace |
| recipient_email | TEXT | Optional email constraint |
| workspace_role | workspace_role | Default 'member' |
| max_uses | INTEGER | NULL = unlimited |
| used_count | INTEGER DEFAULT 0 | |
| expires_at | TIMESTAMPTZ | |
| status | TEXT CHECK | active/expired/revoked |
| accepted_by | UUID FK profiles | Who accepted |
| accepted_at | TIMESTAMPTZ | When accepted |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### RPC: `accept_workspace_invitation(p_token_hash text)`
Atomic, SECURITY DEFINER:
1. Requires auth.uid() — rejects unauthenticated
2. Validates: active, not expired, not revoked, under max_uses
3. Matches recipient_email to auth.users email
4. Creates/reactivates workspace_members (ON CONFLICT)
5. Uses invitation's workspace_role
6. Increments used_count, sets accepted_by/accepted_at
7. Writes audit_logs entry
8. Full rollback on any failure

### Token Security
- `hashInviteToken(raw)` uses HMAC-SHA-256 with INVITE_TOKEN_SECRET
- Database stores ONLY the digest (never plaintext)
- Raw token enters NO logs, audit metadata, database, or localStorage
- Token only passed briefly via invite URL

### Invite Page (`/join/[token]`)
- **Unauthenticated**: Generic "收到工作区邀请" + login button with ?next= parameter
  - Does NOT expose: workspace name, inviter, recipient email, token validity
- **Authenticated**: Confirmation card + "接受邀请" button (POST Server Action)
  - Accept is NEVER automatic on page load
  - On success: redirect /dashboard
- **Error**: Always generic "邀请链接无效或已过期" (no token probing)

---

## 7. Verification Results

| Gate | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run test` | 56/56 PASS |
| `npm run build` | PASS |
| `npm run db:reset` | PASS (6 migrations applied) |
| `npm run db:test` | 141/141 PASS |
| `npm run db:lint` | PASS (no issues in public/private schemas) |
| `git diff --check` | PASS |

### Security Checks

| Check | Result |
|---|---|
| Secret leakage | PASS — no real secrets in source |
| Forbidden dependencies | PASS — no auth-helpers, openai, anthropic, gemini |
| `getSession()` for authorization | PASS — only in comments explaining NOT to use |
| Cache directives in auth routes | PASS — no revalidate/force-static/ISR |

---

## 8. Known Issues & Remaining Work

### Not Yet Implemented (requires test-engineer)
- Database tests for invitation_links table and accept_workspace_invitation RPC
- Unit tests for auth schemas, redirects, error mapping, invite token hashing
- Integration tests for sign up, sign in, sign out, create workspace, accept invitation
- E2E Playwright tests (E2E-1 through E2E-8)

### Not Yet Implemented (requires mobile-ui-engineer review)
- Mobile UI review of login/register/onboarding pages at 320px width
- Keyboard/safe area verification for forms
- Accessibility review (error-label associations, password autofill)

### Not Yet Implemented (requires quality-reviewer)
- Full security, contract, and code quality review

### Design Decisions
- Email confirmation not enforced (PRD §7.1: "邮箱验证码或 Magic Link 可作为增强")
- `is_system_admin()` still a stub (returns false) per Phase 1-C plan
- `has_feature()` not yet implemented (Phase 1-C)
- Service Role Key NOT used for any client-facing operations
- No remote Supabase connection — everything is local

---

## 9. What Was NOT Implemented (as required)

- Feature entitlements (feature_entitlements, has_feature)
- System admin pages or functions
- Admin invite creation UI
- Password reset / forgot password
- OAuth login
- Magic link login
- Phone number login
- Multi-factor authentication
- Storage bucket policies
- Properties / Clients / AI / Content factory
- Remote Supabase project link
- Production deployment

---

## 10. Dependency Summary

| Package | Version | Upgraded? |
|---|---|---|
| Next.js | 15.5.22 | No |
| React | 19.x | No |
| @supabase/ssr | 0.8.0 | No (already latest stable) |
| @supabase/supabase-js | 2.111.0 | No |

---

## 11. Boundary Declaration

- No Service Role App Client used
- No remote Supabase connection
- No `supabase db push` executed
- No external API calls
- No Git commit, merge, rebase, reset, or push
- No real email addresses used
- No real secrets exposed
