---
name: housevibe-client-gate
description: Verify HouseVibe client CRUD, interaction CRUD, stage transitions, idempotency, RLS, RPC, audit, and UI E2E gates before client-related commits.
disable-model-invocation: true
---

# HouseVibe Client Gate

Run only when the user explicitly invokes:

`/housevibe-client-gate`

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

npx supabase status

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

## Required Client Coverage

Confirm actual executable coverage for:

### Client CRUD
1. Client creation via `create_client` RPC with `workspace_id` from server, `created_by` from auth
2. `name` is mandatory and non-empty
3. Client list does not leak `phone` or `wechat` in list responses
4. Client update with proper type coercion (booleans, integers, arrays, nullable strings)
5. Soft delete with `deleted_at` timestamp, owner-only
6. Member cannot directly write `deleted_at` or `stage='deleted'` to bypass

### Idempotent Creation
7. Workspace, user, and request fingerprint binding
8. Duplicate or concurrent requests produce exactly 1 client
9. Duplicate request returns existing client (200, not 201)
10. Different content with same `x-idempotency-key` returns 409 CONFLICT
11. Exactly 1 `client_created` audit log written per unique client

### Stage Transition Matrix (10 stages)
12. `new` → `qualified`, `deleted`
13. `qualified` → `properties_sent`, `paused`, `lost`, `closed_won`, `deleted`
14. `properties_sent` → `viewing_scheduled`, `closed_won`, `deleted`
15. `viewing_scheduled` → `viewed`, `closed_won`, `deleted`
16. `viewed` → `considering`, `paused`, `lost`, `closed_won`, `deleted`
17. `considering` → `considering`, `paused`, `lost`, `closed_won`, `deleted`
18. `paused` → `qualified`, `considering`, `deleted`
19. `lost` → `deleted`
20. `closed_won` → (no transitions)
21. `deleted` → (no transitions)

### Stage Change Semantics
22. Illegal stage transition returns 422 with business error
23. Illegal transition does NOT modify the client record
24. Illegal transition does NOT write an audit log
25. Stage change and field update cannot be mixed in one PATCH
26. No-op (same stage) returns client without writing audit
27. Client creation, update, stage change, and deletion all write audit logs

### Interaction CRUD
28. Interaction creation: POST `/api/clients/:id/interactions` with required `interaction_type` and `occurred_at`
29. Interaction update: PATCH `/api/clients/:id/interactions/:interactionId`
30. Interaction soft-delete: DELETE `/api/clients/:id/interactions/:interactionId`
31. Interaction must bind to a non-deleted client in the same workspace
32. Interaction creation, update, and soft-deletion all write audit logs
33. Interaction update and delete cannot be bypassed via direct table write

### Interaction Types (9)
34. `phone_call`
35. `wechat_message`
36. `in_person_meeting`
37. `property_viewing`
38. `follow_up`
39. `negotiation`
40. `contract_signing`
41. `complaint`
42. `other`

### Interaction Timeline Sort
43. Timeline sorted by `occurred_at DESC`, `created_at DESC`, `id ASC`
44. Stable sort order across repeated queries

### Security & Isolation
45. Cross-workspace access default-deny — must not leak resource existence
46. Route Handler independently calls `getUser()`, validates workspace membership, and checks permissions
47. RLS/RPC database layer cannot be bypassed via direct REST calls
48. `SECURITY DEFINER` RPCs use `SET search_path = ''`
49. `SECURITY DEFINER` RPCs use fully-qualified table names
50. `SECURITY DEFINER` RPCs authenticate via `auth.uid()`
51. Standard `{ data, error }` error contract on all API routes

### Test Coverage
52. No skipped tests (`test.skip`, `describe.skip`, `it.skip`, `todo`, `xit`, `xdescribe`)
53. Unit/integration tests for client routes and interaction routes
54. pgTAP/RLS tests for clients and interactions
55. UI E2E for client CRUD and stage flows
56. UI E2E for client interactions
57. All regression E2E suites pass (auth, admin, settings, properties, property-filters, property-media)
58. P0 = 0, P1 = 0

### Phase Boundaries
59. No AI analysis code in client or interaction modules
60. No matching, task, reminder, voice, or attachment code in client/interaction modules
61. No next-business-slice content (content_factory, marketing, AI labels)

## Security Review (data-security-engineer)

The `data-security-engineer` must independently verify:

- RLS policies on `clients` and `client_interactions` tables
- `SECURITY DEFINER` RPCs: `create_client`, `set_client_stage`, and any interaction RPCs
- Cross-workspace isolation — member of workspace A cannot read/write workspace B clients
- Soft-delete bypass paths — member cannot directly set `deleted_at` or `stage='deleted'`
- Audit log integrity — all mutations produce correct audit entries, no gaps
- Interaction delete/update bypass paths — cannot modify via direct table write
- Idempotency key and fingerprint collision handling
- No Service Role client in application code
- RPC grants revoked from `public` and `anon`

## Reviewer

Ask `quality-reviewer` to perform a final read-only review of:

1. Client API routes and RPCs
2. Interaction API routes
3. Stage transition RPC and validation logic
4. RLS policies on clients and client_interactions
5. Idempotency logic and fingerprint computation
6. UI integration (client list, detail, edit, create, interaction timeline)

PASS requires:
- All database tests pass
- Lint, typecheck, unit tests, and build pass
- All 8 E2E suites pass (auth, admin, settings, properties, property-filters, property-media, clients, client-interactions)
- No skipped tests
- Required client and interaction coverage confirmed
- P0 = 0, P1 = 0

## Output

Return a concise report containing:

- overall conclusion
- database results
- application results
- E2E results (all 8 suites)
- client coverage checklist (items 1–61)
- interaction coverage checklist (items 28–44)
- security review results
- reviewer P0–P3
- Git status
- blockers

The conclusion must be exactly one of:

`PASS: HouseVibe Client Gate 全部通过`

`FAIL: HouseVibe Client Gate 未通过`
