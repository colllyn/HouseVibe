# PHASE1B-DB-RLS-001 Integration Engineer Handoff

## Supabase CLI Version

- **Package**: `supabase` (npm, as devDependency)
- **Precise Version**: `2.110.0`
- **Verification**: `npx supabase --version` outputs `2.110.0`

## Modified Files

1. **`package.json`** -- Added `supabase` devDependency and 7 new scripts
2. **`package-lock.json`** -- Updated by npm install (auto-generated)

No other files were modified.

## Scripts Added

| Script | Command | Purpose |
|--------|---------|---------|
| `supabase:start` | `supabase start` | Start local Supabase stack (Docker) |
| `supabase:stop` | `supabase stop` | Stop all local Supabase containers |
| `supabase:status` | `supabase status` | Show status of local containers |
| `db:reset` | `supabase db reset` | Reset local database (re-runs migrations) |
| `db:test` | `supabase test db` | Run database tests (pgTAP) |
| `db:lint` | `supabase db lint` | Lint database migrations |
| `db:types` | `supabase gen types typescript --local` | Generate TypeScript types from local DB (stdout) |

All scripts use the project-locked `supabase` binary from `node_modules/.bin/` via `npm run`.

## Local Runtime Prerequisites

1. **Docker** must be installed and running (required by `supabase start`)
2. A valid `supabase/config.toml` must exist in the project root
3. Database migrations must be present in `supabase/migrations/`
4. Run `supabase start` before using `db:reset`, `db:test`, `db:lint`, or `db:types`

## Operations NOT Executed (Per Constraints)

- **No `db push`** -- Not added as a script; not executed
- **No `supabase link`** -- No project linking was performed
- **No remote Supabase connection** -- All scripts use `--local` flag or operate on local stack only
- **No database type file generation** -- `db:types` outputs to stdout only; no redirection to file
- **No `supabase login`** -- No authentication was performed

## Gate Verification Results

| Gate | Status | Notes |
|------|--------|-------|
| `npm run typecheck` | PASS | Zero TypeScript errors |
| `npm run lint` | PASS | Zero ESLint warnings or errors |
| `npm run test` | 56/56 PASS | All tests passing |

## Usage for data-security-engineer

1. Ensure Docker is running locally
2. Start the local Supabase stack:
   ```bash
   npm run supabase:start
   ```
3. Verify the stack is healthy:
   ```bash
   npm run supabase:status
   ```
4. Run database migrations (if not already applied):
   ```bash
   npm run db:reset
   ```
5. Lint migrations:
   ```bash
   npm run db:lint
   ```
6. Run database tests (pgTAP):
   ```bash
   npm run db:test
   ```
7. Generate TypeScript types (pipe to file as needed):
   ```bash
   npm run db:types > src/types/database.ts
   ```
8. Stop the stack when done:
   ```bash
   npm run supabase:stop
   ```

## Rollback (if needed)

To remove the Supabase CLI:
```bash
npm uninstall supabase
```
Then remove the 7 added scripts from `package.json`.
