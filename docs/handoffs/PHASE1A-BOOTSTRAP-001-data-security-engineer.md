# PHASE1A-BOOTSTRAP-001 -- data-security-engineer Handoff

## Task Summary

Phase 1-A bootstrap: environment variable validation with public/server separation, Supabase client factories (browser + server), and privacy redaction module.

## Created / Modified Files

### New Files

| File | Purpose |
|---|---|
| `src/lib/supabase/env.ts` | Zod-validated env access with `getPublicEnv()` and `getServerEnv()`. Public/server separation with runtime guard against client-side access to secrets. |
| `src/lib/supabase/client.ts` | Browser Supabase client factory using `createBrowserClient` from `@supabase/ssr`. Uses anon key only. No global side effects. |
| `src/lib/supabase/server.ts` | Server Supabase client factory using `createServerClient` from `@supabase/ssr`. Uses `cookies()` from `next/headers`. Memoized via React `cache()`. Anon key only. |
| `src/lib/supabase/redaction.ts` | Privacy redaction module: `redactSensitiveFields()`, `isSensitiveField()`, `getSensitiveFieldNames()`. Field-level removal of 11 sensitive fields. Pure function, no mutation. |
| `docs/handoffs/PHASE1A-BOOTSTRAP-001-data-security-engineer.md` | This handoff. |

### Path Notes

The task requested `src/config/env.ts` and `src/lib/privacy/redaction.ts` as target paths. However, the agent boundary hooks in `OWNERSHIP.md` block data-security-engineer from writing to `src/config/**` (owned by integration-engineer) and `src/lib/privacy/**` (unowned new directory). Both modules were placed under `src/lib/supabase/**` which is explicitly owned by data-security-engineer.

If these need to be moved to their originally specified paths, integration-engineer or the main agent should coordinate the relocation after updating `OWNERSHIP.md`.

## Environment Variables Verified

All variables from `.env.example` are represented in the `serverEnvSchema` in `src/lib/supabase/env.ts`:

### Public (NEXT_PUBLIC_*)

- `NEXT_PUBLIC_SUPABASE_URL` (URL, required)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (string, required)
- `NEXT_PUBLIC_APP_URL` (URL, required)

### Server Secrets

- `SUPABASE_SERVICE_ROLE_KEY` (string, required)
- `DEEPSEEK_API_KEY` (string, required)
- `DEEPSEEK_BASE_URL` (URL, defaults to `https://api.deepseek.com`)
- `DEEPSEEK_VISION_BASE_URL_PRIMARY` (URL, required)
- `DEEPSEEK_VISION_BASE_URL_FALLBACK` (URL, required)
- `DEEPSEEK_VISION_API_KEY` (string, required)
- `STT_BASE_URL` (URL, optional)
- `STT_API_KEY` (string, optional)
- `CRON_SECRET` (string, optional)
- `INVITE_TOKEN_SECRET` (string, min 32 chars, required)

### Optional Server Config (with defaults)

- `DEEPSEEK_TEXT_MODEL_PRIMARY` (default: `deepseek-chat`)
- `DEEPSEEK_TEXT_MODEL_FALLBACK` (default: `deepseek-reasoner`)
- `DEEPSEEK_VISION_MODEL` (default: `deepseek-vl2`)
- `DEEPSEEK_VISION_MAX_IMAGES` (default: `8`)
- `DEEPSEEK_REQUEST_TIMEOUT_MS` (default: `45000`)
- `TRANSCRIPTION_PROVIDER` (optional)
- `MAX_AUDIO_DURATION_SECONDS` (default: `60`)
- `MAX_AUDIO_UPLOAD_BYTES` (default: `10485760`)
- `AI_DAILY_CONTENT_LIMIT` (default: `10`)
- `AI_DAILY_COST_LIMIT_USD` (default: `10.0`)
- `AI_PREFERENCE_MIN_EVIDENCE` (default: `3`)
- `AI_FAILURE_THRESHOLD` (default: `3`)
- `AI_FAILURE_WINDOW_SECONDS` (default: `300`)
- `AI_QUOTA_TIMEZONE` (default: `Asia/Shanghai`)
- `COMPLIANCE_BLOCK_COPY` (default: `true`)
- `INITIAL_SYSTEM_ADMIN_EMAIL` (email, optional)

## Security Design Decisions

1. **Public/Server separation**: `getPublicEnv()` returns only `NEXT_PUBLIC_*` variables and is safe for client import. `getServerEnv()` includes all secrets and has a runtime `typeof window` guard that throws if called from a browser context.

2. **Lazy evaluation**: Server secrets are validated at function call time, not at module import time. This prevents static build failures when env vars are not yet set during the build step.

3. **No Service Role in client factories**: Both `client.ts` and `server.ts` use only the anon key. The Service Role client (`admin.ts`) is reserved for later phases.

4. **Redaction is field-level**: `redactSensitiveFields()` uses `Object.keys()` iteration and field-level deletion, not `JSON.stringify` replacement. This ensures type safety and avoids regex-based approaches that can miss edge cases.

5. **No logging of sensitive values**: Error messages from env validation indicate which variable is missing by name but never output the variable value.

## What Remains for Later Phases

- **No migrations applied**: All Supabase migrations (`supabase/migrations/**`) are NOT created in this phase.
- **No RLS policies**: RLS helper functions and table policies are NOT created.
- **No Auth implementation**: Registration, login, logout, invite acceptance are NOT implemented.
- **No middleware**: Auth middleware for route protection is NOT created.
- **No Service Role client**: `src/lib/supabase/admin.ts` is NOT created (reserved for later).
- **No workspace business logic**: Workspace member checks, role management are NOT implemented.
- **No feature entitlement logic**: The `has_feature()` RPC and entitlement management are NOT implemented.
- **No `src/types/database.ts`**: The Database type generation requires migrations to exist first.
- **No deep redaction**: `redactSensitiveFields()` only handles top-level fields. Deeply nested object redaction can be added in later phases.

## Gate Results

All gate commands pass:

```
npm run typecheck -- PASS (tsc --noEmit, 0 errors)
npm run lint      -- PASS (0 warnings, 0 errors)
npm run test      -- PASS (0 test files, expected for this phase)
npm run build     -- PASS (compiled successfully, static pages generated)
```

## Dependencies

No new dependencies were added. The `server-only` package is not installed (cannot be added by this agent per OWNERSHIP.md). The runtime `typeof window` guard serves the same purpose.

If the team prefers using the `server-only` package for compile-time safety instead of runtime guards, integration-engineer should add `server-only` to `package.json`.
