---
name: housevibe-matching-gate
description: Validate HouseVibe deterministic property matching, entitlement, security, persistence, UI and regression gates.
disable-model-invocation: true
---

# HouseVibe Matching Gate

Run only when the user explicitly invokes:

`/housevibe-matching-gate`

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

## Agent Gate

Start these agents in the current workspace:

- `property-crm-engineer`
- `data-security-engineer`
- `test-engineer`
- `quality-reviewer`

They must not use worktrees.

If any agent is unavailable, return FAIL. Do not substitute.

Each agent must return `AGENT_READY` before the gate proceeds. If any agent fails to return `AGENT_READY`, the skill must FAIL. The main agent must not perform the agent's work.

## Run the Gate

Execute from the Git root:

```bash
git diff --check
git status --short

npm run db:reset
npm run db:test
npm run db:lint
npm run db:test:performance

npm run lint
npm run typecheck
npm run test
npm run build

npm run test:e2e:auth
npm run test:e2e:admin
npm run test:e2e:settings
npm run test:e2e:properties
npm run test:e2e:property-filters
npm run test:e2e:property-media
npm run test:e2e:clients
npm run test:e2e:client-interactions
npm run test:e2e:matching
```

Then run:

```text
/housevibe-property-gate
/housevibe-client-gate
```

Check for disabled tests:

```bash
grep -RniE "test\.skip|describe\.skip|it\.skip|todo\(|xit\(|xdescribe\(" src e2e supabase/tests || true
```

Check forbidden application credentials:

```bash
grep -RniE "SUPABASE_SERVICE_ROLE_KEY|service_role" src || true
```

Check no AI/STT in matching code:

```bash
grep -RniE "DeepSeek|DEEPSEEK_API_KEY|STT|speech.to.text" src/features/matching src/app/api/matches || true
```

## Required Matching Coverage

Confirm actual executable coverage for:

### Rule Engine
- 9 hard-filter conditions (budget_max, pets, rental_type, available_from, bedrooms, cooking, hard_requirements, deal_breakers, status/deleted_at)
- Six-dimension scoring with default weights (budget=30, district=20, roomType=15, availability=15, commute=10, specialRequirements=10)
- Custom weight overrides
- Invalid weights → 422
- Score range 0–100 and level thresholds (excellent≥85, good≥65, fair≥40, low<40)
- Missing field semantics (client missing → full marks; property missing → 0 + needsConfirmation)
- Reason object Schema (code, label, scoreContribution, detail)
- Deterministic: same input → same output across multiple runs
- Stable sort: score DESC → updated_at DESC → created_at ASC (contract §5, enforced in RPC layer)

### Persistence
- `UNIQUE(property_id, client_id)` enforced
- Recalculation does not produce duplicate records
- Stale matches (no longer passing hard filters) automatically archived on recalculation
- Dismissed matches reset to active on recalculation (ADR-005)
- Archived terminal state cannot be bypassed via status-change RPC
- Status changes write audit log (`entity_type: property_match`)
- Failed operations leave no partial match or partial audit

### Entitlement
- `property_matching` entitlement enforced server-side on all 4 endpoints
- `POST /api/matches/calculate` — `hasFeature('property_matching')`
- `GET /api/clients/:id/matches` — `hasFeature('property_matching')`
- `GET /api/properties/:id/matches` — `hasFeature('property_matching')`
- `PATCH /api/matches/:id` — `hasFeature('property_matching')`
- Unauthorized returns HTTP 403 + error code `FEATURE_NOT_ALLOWED`
- UI hides or disables matching entry points when entitlement is revoked/expired
- Entitlement not shared across users or workspaces

### Security
- Client, property, and match must belong to same workspace
- RLS default-deny on `property_matches`
- All RPCs use `SECURITY DEFINER` with `set search_path = ''`
- All RPCs authenticate via `auth.uid()`
- Grant from `public` and `anon` revoked for all matching RPCs
- Client cannot forge score, reasons, or workspace_id
- Property-perspective match view does not leak client phone or wechat
- No Service Role key in application code
- No DeepSeek, STT, or natural language parsing in matching code path

### API / UI
- `POST /api/matches/calculate` — calculate and persist matches
- `GET /api/clients/:id/matches` — client perspective match list
- `GET /api/properties/:id/matches` — property perspective match list
- `PATCH /api/matches/:id` — match status update (dismiss/archive)
- Score, match level, matchedReasons, unmatchedReasons, needsConfirmation, nextAction displayed
- Mobile-first: 320px no horizontal scroll, 44px touch targets
- Level not expressed by color alone (always includes text label)

### Test Coverage
- Unit tests: rule-engine.test.ts covers all hard filters, six dimensions, levels, actions, weights, determinism, sort, edge cases
- pgTAP: 16_matching_rls_test.sql covers RLS, cross-workspace, RPC grants, upsert, state transitions, audit, entitlement, failure atomicity
- E2E: matching-flows.spec.ts covers 20 scenarios including empty state, calculate, sort, persist, recalculate, dismiss, archive, entitlement UI/API, cross-workspace, unauthenticated, mobile layout, privacy
- No skipped tests
- P0 = 0, P1 = 0

## Reviewer

Ask `quality-reviewer` to perform a final read-only review of:

1. Rule engine implementation (`src/features/matching/rule-engine.ts`)
2. API route handlers (`src/app/api/matches/`, `src/app/api/clients/[id]/matches/`, `src/app/api/properties/[id]/matches/`)
3. Database migration (`supabase/migrations/20260803000008_match_rpcs.sql`)
4. RLS policies on `property_matches`
5. Entitlement enforcement across all endpoints
6. UI components (`src/features/matching/components/`)
7. E2E matching tests (`e2e/matching-flows.spec.ts`)

PASS requires:
- All database tests pass (17/17 files, 0 failed)
- Lint, typecheck, unit tests, and build pass
- All 9 E2E suites pass (auth, admin, settings, properties, property-filters, property-media, clients, client-interactions, matching)
- No skipped tests
- No forbidden credentials
- No AI/STT in matching code
- Required matching coverage confirmed
- Property Gate PASS
- Client Gate PASS
- P0 = 0, P1 = 0

## Output

Return a concise report containing:

- overall conclusion
- database results (17/17)
- application results (typecheck, lint, test, build)
- E2E results (all 9 suites)
- matching coverage checklist (Rule Engine, Persistence, Entitlement, Security, API/UI)
- reviewer P0–P3
- agent completion evidence
- Git status
- blockers

The conclusion must be exactly one of:

`PASS：HouseVibe Matching Gate 全部通过`

`FAIL：HouseVibe Matching Gate 存在功能、安全或测试门禁`
