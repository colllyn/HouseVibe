---
name: housevibe-property-gate
description: Verify HouseVibe property CRUD, filtering, sorting, media storage, RLS, RPC, UI and regression gates before property-related commits.
disable-model-invocation: true
---

# HouseVibe Property Gate

Run only when the user explicitly invokes:

`/housevibe-property-gate`

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

## Required Property Coverage

Confirm actual executable coverage for:

### Property CRUD & Atomic RPC
- Property creation via `create_property_with_private_details` RPC
- Property update with proper type coercion (booleans, dates, integers, arrays)
- Soft delete with `deleted_at` timestamp
- Private details (owner_name, owner_phone, etc.) created and updated atomically
- Audit logs written for property operations

### Workspace RLS
- `workspace_id` filter applied on all queries
- Cross-workspace access denied (404 or 403)
- Non-members cannot read, create, update, or delete properties

### Private Field Isolation
- `building_no`, `unit_no`, `room_no` excluded from list responses
- `property_private_details` only accessible to workspace members
- Shared property views do not expose sensitive fields

### Filtering & Sorting (15 filters + 4 sorts)
- Filters: status, district, city, businessArea, communityName, rentalType, bedrooms, minRent, maxRent, minArea, maxArea, petsAllowed, cookingAllowed, hasElevator, isShared, availableBefore, availableAfter, subwayText, search
- Sorts: updated_at, monthly_rent_asc, monthly_rent_desc, available_from
- Deferred parameters (`hasContent`, `last_content_at`, `last_published_at`) return 422

### Media: Storage & API
- Private `property-private` bucket, RLS-enforced
- Object path: `{workspace_id}/{user_id}/{uuid}.{ext}`
- MIME validation (images only, no SVG/HTML/executables)
- Size limit 10MB, count limit 5/request, 20/property
- Upload failure compensation: DB failure → storage cleanup
- Delete: RPC soft-delete + storage object removal (no orphans)

### Media: Sort & Cover Atomicity
- `set_media_sort_order` RPC with FOR UPDATE lock
- `set_media_cover` RPC with unique cover enforcement
- Concurrent operations produce valid state

### Security
- Signed URLs (default 3600s expiry)
- No Service Role client in application code
- All RPCs are SECURITY DEFINER with fixed `search_path = ''`
- RPC grants revoked from `public` and `anon`

### Phase Boundaries
- No AI analysis code in property/media modules
- No client, matching, or content generation code
- `ai_labels` and `ai_analysis_status` default to `pending`

### Test Coverage
- No skipped tests (`test.skip`, `describe.skip`, `it.skip`, `todo`, `xit`, `xdescribe`)
- P0 = 0, P1 = 0

## Reviewer

Ask `quality-reviewer` to perform a final read-only review of:

1. Property CRUD API routes and RPC
2. Property filter/sort query logic
3. Property media upload, storage, and delete flows
4. RLS policies on properties, property_private_details, and property_media
5. Storage RLS on property-private bucket
6. UI integration (detail page, edit page, media components)

PASS requires:
- All database tests pass
- Lint, typecheck, unit tests, and build pass
- All 6 E2E suites pass (auth, admin, settings, properties, property-filters, property-media)
- No skipped tests
- Required property coverage confirmed
- P0 = 0, P1 = 0

## Output

Return a concise report containing:

- overall conclusion
- database results
- application results
- E2E results (all 6 suites)
- property coverage checklist
- reviewer P0–P3
- Git status
- blockers

The conclusion must be exactly one of:

`PASS: HouseVibe Property Gate 全部通过`

`FAIL: HouseVibe Property Gate 未通过`
