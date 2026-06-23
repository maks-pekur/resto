---
phase: quick-260623-waj
plan: "01"
subsystem: catalog
tags: [cr-03a, modifier-groups, catalog, admin, e2e]
dependency_graph:
  requires: []
  provides: [PUT /v1/catalog/items/:id/modifier-groups]
  affects: [catalog-drizzle.repository, catalog.controller, admin queries]
tech_stack:
  added: [tools/sql-esm-loader.mjs]
  patterns: [replace-links DELETE+INSERT, scoped.insertInto loop, DO-block guarded GRANT]
key_files:
  created:
    - packages/db/migrations/0053_grant_delete_menu_item_modifier_groups.sql
    - apps/api/src/contexts/catalog/application/set-item-modifier-groups.service.ts
    - tools/sql-esm-loader.mjs
  modified:
    - packages/db/migrations/meta/_journal.json
    - packages/db/sql/roles.sql
    - apps/api/src/contexts/catalog/application/dto.ts
    - apps/api/src/contexts/catalog/domain/ports.ts
    - apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts
    - apps/api/src/contexts/catalog/catalog.module.ts
    - apps/api/src/contexts/catalog/interfaces/http/catalog.controller.ts
    - apps/admin/src/lib/queries/catalog.ts
    - docs/api/openapi.yaml
    - packages/api-client/src/generated/api.ts
    - apps/api/test/e2e/catalog.e2e.spec.ts
    - apps/api/test/unit/catalog/publish-menu.service.spec.ts
    - apps/api/package.json
decisions:
  - Loop with `for...of entries()` for sequential insertInto calls — scoped.insertInto takes a single row, no batch overload
  - Empty string stub for .sql imports in ESM openapi:emit context — SQL content unused during document generation
  - `--experimental-loader` flag chosen over `--import` — Node's ESM hook worker thread isolation prevents `--import` hook from intercepting before ERR_UNKNOWN_FILE_EXTENSION fires
metrics:
  duration: ~45min
  completed_date: "2026-06-23"
  tasks: 5
  files: 14
---

# Quick Task 260623-waj: CR-03a — Item Modifier-Group Links Endpoint

**One-liner:** PUT /v1/catalog/items/:id/modifier-groups with replace semantics, DELETE grant migration, admin repoint, and e2e coverage for set/subset/clear/cross-brand rejection.

## Tasks Completed

| #   | Task                                                                         | Commit  | Files |
| --- | ---------------------------------------------------------------------------- | ------- | ----- |
| 1   | Grant DELETE on menu_item_modifier_groups (migration + journal + roles.sql)  | 45fb1c1 | 3     |
| 2   | Backend — DTO, repo replaceItemModifierGroups, service, route, module wiring | be64970 | 7     |
| 3   | Repoint admin client to PUT items/:id/modifier-groups                        | 064e74e | 1     |
| 4   | Regenerate + commit OpenAPI drift artifacts                                  | 04d4cfb | 4     |
| 5   | e2e — replace semantics, empty clear, cross-brand rejection                  | 5c39f9a | 1     |

## Verification Results

```
# Task 1
journal ok
migration ok
roles.sql ok

# Task 2
api:typecheck: SUCCESS
eslint (changed files): 0 errors

# Task 3
admin:typecheck: SUCCESS

# Task 4
pnpm openapi:check: artefacts are in sync.
grep items/{id}/modifier-groups docs/api/openapi.yaml: FOUND

# Task 5
catalog.e2e.spec.ts: 25 tests PASSED (30343ms)
  includes: set [g1,g2] → GET=[g1,g2], subset [g1] → GET=[g1], clear [] → GET=[], cross-brand gB → 404, GET=[]
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added replaceItemModifierGroups to publish-menu.service.spec.ts mock**

- **Found during:** Task 2
- **Issue:** `satisfies CatalogRepository` on the test mock caused a typecheck failure when the interface gained `replaceItemModifierGroups`. TypeScript strict check on the `satisfies` keyword.
- **Fix:** Added `replaceItemModifierGroups: vi.fn()` to the mock object.
- **Files modified:** `apps/api/test/unit/catalog/publish-menu.service.spec.ts`
- **Commit:** be64970 (included in same task commit)

**2. [Rule 1 - Bug] Fixed lint errors — no-non-null-assertion and no-misused-spread**

- **Found during:** Task 2
- **Issue:** `dedupedIds[i] as string` triggered `non-nullable-type-assertion-style`; spreading `input` (class instance) triggered `no-misused-spread`.
- **Fix:** Replaced `for` index loop with `for...of entries()` pattern; passed `modifierGroupIds` explicitly instead of spreading class instance.
- **Files modified:** `catalog-drizzle.repository.ts`, `catalog.controller.ts`
- **Commit:** be64970

**3. [Rule 3 - Blocking] Pre-existing openapi:emit broken by tsx ESM + .sql import**

- **Found during:** Task 4
- **Issue:** `roles.ts` at commit 98a84e0 switched from `readFileSync` to `import GRANTS_SQL from '../sql/roles.sql'`. Node ESM rejects `.sql` files (`ERR_UNKNOWN_FILE_EXTENSION`) before any loader hook fires via `--import`. This broke `pnpm openapi:check` which was pre-existing drift since 98a84e0.
- **Fix:** Created `tools/sql-esm-loader.mjs` (ESM hook using `--experimental-loader`); updated `apps/api/package.json` `openapi:emit` script to use it. The loader resolves `.sql` specifiers to `data:text/javascript,export default '';` so the import succeeds. The empty string is safe because `GRANTS_SQL` is never executed during OpenAPI document generation.
- **Files modified/created:** `tools/sql-esm-loader.mjs`, `apps/api/package.json`
- **Commit:** 04d4cfb

**4. [Rule 3 - Blocking] scoped.insertInto takes single row, not array**

- **Found during:** Task 2 implementation
- **Issue:** Plan said "Use a mapped values array in one insert if the scoped helper supports batch values; otherwise a sequential loop." — checked `packages/db/src/client.ts` and confirmed it only accepts a single row.
- **Fix:** Used `for...of dedupedIds.entries()` sequential loop as specified by the plan's fallback.
- **Commit:** be64970

### OpenAPI Artifact Pre-existing Drift

The full `docs/api/openapi.yaml` and `packages/api-client/src/generated/api.ts` regeneration included pre-existing drift (routes added since 003a881: `/v1/tenants/me/offboard`, internal catalog routes removed from public spec, etc.) in addition to the new PUT modifier-groups route. All drift is now resolved and artifacts are in sync.

## Known Stubs

None. The PUT endpoint is fully wired end-to-end.

## Threat Flags

No new trust-boundary surface beyond the intended `PUT /v1/catalog/items/:id/modifier-groups` documented in the plan's threat model (T-waj-01 through T-waj-04, all mitigated).

## Self-Check: PASSED

Files created/exist:

- packages/db/migrations/0053_grant_delete_menu_item_modifier_groups.sql ✓
- apps/api/src/contexts/catalog/application/set-item-modifier-groups.service.ts ✓
- tools/sql-esm-loader.mjs ✓

Commits exist:

- 45fb1c1 feat(db): grant DELETE on menu_item_modifier_groups ✓
- be64970 feat(api): add item modifier-group links endpoint ✓
- 064e74e feat(admin): repoint item modifier-group links to PUT ✓
- 04d4cfb chore(api): regenerate OpenAPI artifacts + fix openapi:emit sql loader ✓
- 5c39f9a test(api): cover item modifier-group link replace + cross-brand ✓
