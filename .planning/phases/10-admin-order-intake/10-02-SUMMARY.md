---
phase: 10-admin-order-intake
plan: 02
subsystem: auth
tags: [rbac, better-auth, postgres, cli, drizzle]

requires:
  - phase: 08.3-owner-managed-roles-and-permissions
    provides: NON_DELEGATABLE guard, PRESET_ROLES seeding at provisioning, containsNonDelegatable
  - phase: 08.4-location-scoped-access
    provides: LocationPermissionChecker (built, unwired), LocationScopeGuard non-owner branch, member_location_scope
provides:
  - order:cancel verb in PERMISSIONS_STATEMENT, granted to owner/admin/all three presets
  - SyncPresetRolesService — idempotent re-sync of PRESET_ROLES onto existing tenants' organization_role rows
  - pnpm resto:seed sync-preset-roles [--tenant <uuid>|--all] operational CLI tool
  - D-07 third explicit re-defer of LocationPermissionChecker wiring, recorded in deferred-items.md
affects:
  [10-03, 10-04, 10-05, 10-06, 10-07, 10-08, 10-09, 10-10, 10-11, 10-12, 10-13]

tech-stack:
  added: []
  patterns:
    - 'PRESET_ROLES lives in packages/domain/src/rbac (scope:shared) — CLI tools and apps/api share one source of truth without crossing the Nx scope:tools→scope:api boundary'
    - 'CLI-side DB sync tools connect directly to BETTER_AUTH_DATABASE_URL via raw postgres (no NestJS app-context bootstrap in tsx CLIs — RES-113 precedent)'

key-files:
  created:
    - packages/domain/src/rbac/preset-roles.ts
    - packages/domain/src/rbac/non-delegatable.spec.ts
    - apps/api/src/contexts/identity/application/sync-preset-roles.service.ts
    - apps/api/test/unit/identity/sync-preset-roles.spec.ts
    - tools/scripts/seed/commands/sync-preset-roles.ts
    - .planning/phases/10-admin-order-intake/deferred-items.md
  modified:
    - packages/domain/src/rbac/permissions.ts
    - packages/domain/src/rbac/system-roles.ts
    - packages/domain/src/rbac/index.ts
    - apps/api/src/contexts/identity/application/preset-roles.ts
    - apps/api/test/unit/identity/preset-roles.spec.ts
    - apps/api/src/contexts/identity/identity-core.module.ts
    - tools/scripts/seed/cli.ts

key-decisions:
  - "Moved PRESET_ROLES from apps/api to packages/domain/src/rbac (Nx module boundary blocks scope:tools importing scope:api); apps/api's preset-roles.ts is now a re-export shim so every existing import path keeps working unchanged"
  - 'SyncPresetRolesService is a real NestJS-injectable service (per the plan) but the CLI does NOT resolve it in-process — CLI hand-rolls the identical sync algorithm via direct SQL, mirroring RES-113 (no Nest app-context bootstrap in this tsx+esbuild CLI setup)'
  - "--all discovers tenants via SELECT id FROM tenants WHERE status NOT IN ('archived','erased') over BETTER_AUTH_DATABASE_URL — safe because Better Auth's organization concept IS the tenants table (packages/db/src/schema/auth.ts), and resto_auth already holds SELECT on tenants (packages/db/sql/auth-role.sql)"
  - "Redirected the Task 1 api-side regression spec to the already-CI-executed apps/api/test/unit/identity/preset-roles.spec.ts instead of the plan's literal apps/api/src/.../preset-roles.spec.ts path, which the api project's nx test target (vitest run test/unit) never scans"

requirements-completed: [ORDINT-03, ORDINT-05]

duration: 53min
completed: 2026-08-13
---

# Phase 10 Plan 02: Order-Cancel RBAC Verb + Preset Re-Sync Summary

**Added a delegatable `order:cancel` verb to owner/admin/all three staff presets (closing D-06 — non-owners can now reject/cancel an order), built and ran an idempotent CLI tool that re-synced the change onto all 24 already-provisioned dev tenants, and recorded D-07's third LocationPermissionChecker re-defer in writing.**

## Performance

- **Duration:** 53 min
- **Started:** 2026-08-13T13:12:00Z (approx, first tool-installation step)
- **Completed:** 2026-08-13T14:05:09Z
- **Tasks:** 3 (Task 1 as TDD RED+GREEN = 2 commits)
- **Files modified:** 13

## Accomplishments

- `PERMISSIONS_STATEMENT.order`, `SYSTEM_ROLES.owner.order`, `SYSTEM_ROLES.admin.order`, and all three `PRESET_ROLES[].permission.order` arrays now include `'cancel'`; `SYSTEM_ROLES.staff` still has no `order` key at all (bare staff role stays order-less by design)
- `NON_DELEGATABLE` is byte-unchanged — `containsNonDelegatable({ order: ['cancel'] })` is `false`, `containsNonDelegatable({ billing: ['update'] })` is still `true` — pinned by a new regression spec
- Built `SyncPresetRolesService` (idempotent, skip-archived, update-if-stale, insert-if-missing) and a matching `pnpm resto:seed sync-preset-roles [--tenant <uuid>|--all]` CLI command
- **Ran the sync live against the shared local dev database**: found 24 real pre-existing tenants whose `organization_role` rows predated this code change — first run updated 71 rows (3 presets × 24 tenants) with zero errors; second run reported 0 updates (idempotency proven by observed output, not by reading the code)
- D-07 disposed of in writing: `.planning/phases/10-admin-order-intake/deferred-items.md` records the third explicit re-defer with the two concrete gaps, the compensating `LocationScopeGuard` control, and the trigger condition for picking it up

## Task Commits

1. **Task 1 (RED): add failing order:cancel regression tests** - `934846e` (test)
2. **Task 1 (GREEN): add order:cancel verb to owner/admin/presets** - `039ff5a` (feat)
3. **Task 2: re-sync preset roles onto existing tenants (D-06)** - `23ba102` (feat)
4. **Task 3: record D-07 third LocationPermissionChecker re-defer** - `f2f9ecf` (docs)

## Files Created/Modified

- `packages/domain/src/rbac/permissions.ts` - `order` gains `'cancel'`
- `packages/domain/src/rbac/system-roles.ts` - `owner.order` and `admin.order` gain `'cancel'`; `staff` untouched (no `order` key)
- `packages/domain/src/rbac/non-delegatable.spec.ts` - new co-located regression pin (D-06 + Skeptic BLOCK-4)
- `packages/domain/src/rbac/preset-roles.ts` - `PRESET_ROLES` + `PresetRoleDefinition`, moved here from apps/api (see Deviations)
- `packages/domain/src/rbac/index.ts` - barrel export for the moved `preset-roles.ts`
- `apps/api/src/contexts/identity/application/preset-roles.ts` - now a thin re-export shim from `@resto/domain`
- `apps/api/test/unit/identity/preset-roles.spec.ts` - extended with an `order:cancel` assertion for all three presets
- `apps/api/src/contexts/identity/application/sync-preset-roles.service.ts` - new NestJS service; idempotent re-sync of one tenant's preset roles
- `apps/api/test/unit/identity/sync-preset-roles.spec.ts` - 4 unit tests: insert-all, update-stale, idempotent-noop, skip-archived
- `apps/api/src/contexts/identity/identity-core.module.ts` - registers + exports `SyncPresetRolesService`
- `tools/scripts/seed/cli.ts` - wires the `sync-preset-roles` command + help text
- `tools/scripts/seed/commands/sync-preset-roles.ts` - new CLI command; direct-SQL sync against `BETTER_AUTH_DATABASE_URL`
- `.planning/phases/10-admin-order-intake/deferred-items.md` - D-07 third re-defer record

## Live Database Run (Task 2 verification)

Dev database: `postgres://…@localhost:5433/resto` (docker container `resto-postgres`).

**First run** (`pnpm resto:seed sync-preset-roles --all`) — 24 tenants found, all pre-dated the `order:cancel` change:

```
{"event":"sync-preset-roles.done","tenants":24,"updated":71,"inserted":1,"skippedArchived":0}
```

(The `inserted:1` and one tenant's `updated:2` come from a throwaway fixture tenant created solely to also exercise the "missing preset row" and "stale-permission" paths end-to-end before running against the real 23 tenants — see Deviations. The other 23 real tenants each reported `updated:3, inserted:0, skippedArchived:0` — every pre-existing preset row was stale by exactly the one field this plan touches.)

**Second run** (immediately after, no changes in between):

```
{"event":"sync-preset-roles.done","tenants":24,"updated":0,"inserted":0,"skippedArchived":0}
```

Idempotency proven by observed output.

**Live query** (`SELECT role, permission FROM organization_role WHERE role IN ('manager','cashier-foh','kitchen') AND archived_at IS NULL`) — 72 rows returned (24 tenants × 3 presets), **0 rows missing `"cancel"`** in their `order` array. Sample rows:

```json
{"slug":"manager","permission":"{\"menu\":[\"read\",\"create\",\"update\",\"delete\"],\"order\":[\"read\",\"update-status\",\"cancel\"],\"staff\":[\"invite\"],\"reports\":[\"read\"],\"brand\":[\"read\",\"update\"],\"settings\":[\"update\"]}"}
{"slug":"cashier-foh","permission":"{\"order\":[\"read\",\"update-status\",\"cancel\"],\"menu\":[\"read\"],\"brand\":[\"read\"]}"}
{"slug":"kitchen","permission":"{\"order\":[\"read\",\"update-status\",\"cancel\"],\"brand\":[\"read\"]}"}
```

The throwaway fixture tenant (`slug: 10-02-sync-fixture`) and its `organization_role` rows were deleted immediately after verification — no test data left in the shared dev database.

## Decisions Made

- **PRESET_ROLES moved to `@resto/domain`.** The Nx module-boundary ESLint rule (`packages/config-eslint/base.mjs`: `scope:tools` may only depend on `scope:shared`) blocks `tools/scripts/seed` from importing `apps/api` source. Since the CLI needs the exact same preset data the NestJS service uses (to avoid re-introducing the drift this plan exists to close), `PRESET_ROLES` + `PresetRoleDefinition` moved into `packages/domain/src/rbac/preset-roles.ts` — the natural home alongside `permissions.ts`/`system-roles.ts`/`non-delegatable.ts`. `apps/api/.../preset-roles.ts` is now a one-line re-export shim; the sole existing consumer (`SeedPresetRolesService`) needed no changes.
- **CLI does not invoke `SyncPresetRolesService` in-process.** `tools/scripts/seed/commands/provision-tenant.ts` carries an explicit RES-113 comment: bootstrapping a NestJS application context from this tsx+esbuild CLI setup was tried and abandoned. Rather than reintroduce that, the CLI hand-rolls the identical algorithm (skip-archived / update-if-stale / insert-if-missing) via direct `postgres` SQL against `BETTER_AUTH_DATABASE_URL`, mirroring the existing `tools/scripts/seed/lib/auth-db.ts` convention. `SyncPresetRolesService` still exists, is registered + exported from `IdentityCoreModule`, and is unit-tested — it satisfies the plan's literal requirement and is available for a future in-process caller (e.g. an admin action), but is not on the CLI's call path today.
- **`--all` tenant discovery.** Better Auth's `organization` concept is mapped directly onto the `tenants` table (`packages/db/src/schema/auth.ts:88`, `export const organization = tenants`), and `resto_auth` already holds `GRANT SELECT, UPDATE ON tenants` (`packages/db/sql/auth-role.sql`). `--all` therefore queries `SELECT id FROM tenants WHERE status NOT IN ('archived', 'erased')` over the same `BETTER_AUTH_DATABASE_URL` connection already used for `organization_role` — no second DB connection, no new internal HTTP endpoint needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `pnpm --filter api test -- preset-roles` (the plan's verify command) is a non-functional no-op**

- **Found during:** Task 1 setup, before writing any test
- **Issue:** `apps/api/package.json` has no `"test"` script. `pnpm --filter api run test` silently exits 0 with zero output (pnpm special-cases the `test`/`start`/`stop`/`restart` lifecycle script names to no-op when absent, unlike any other script name). The actually-runnable command is `pnpm exec nx run api:test`, whose target is `vitest run test/unit` — a hardcoded directory, not the `include` glob in `vitest.config.ts`.
- **Fix:** Used `pnpm exec nx run api:test` (equivalently `cd apps/api && pnpm exec vitest run test/unit/...`) for all api verification in this plan. No source change needed — documenting for the phase verifier and any future plan reusing this plan's literal verify text.
- **Verification:** Confirmed by running both forms side-by-side; the `--filter` form printed nothing and exited 0 even with a deliberately-broken test present.

**2. [Rule 1 - Bug] Co-located `apps/api/src/**/\*.spec.ts` files never run in CI or via the standard test command\*\*

- **Found during:** Task 1, before writing `preset-roles.spec.ts`
- **Issue:** `apps/api/vitest.config.ts`'s `include` covers `src/**/*.{spec,test}.ts`, but the Nx `api:test` target (used by CI's `nx affected -t test`) hardcodes `vitest run test/unit`, which never resolves into `src/`. 17 pre-existing co-located specs under `apps/api/src/` are already silently unrun by CI (pre-existing, out of this plan's scope — logged below, not fixed). Creating the plan's literally-specified `apps/api/src/contexts/identity/application/preset-roles.spec.ts` would have produced a dead regression pin for `order:cancel`, defeating Task 1's own purpose.
- **Fix:** Extended the pre-existing, CI-executed `apps/api/test/unit/identity/preset-roles.spec.ts` with the `order:cancel` assertion instead of creating a new file at the plan's specified (non-executing) path.
- **Files modified:** `apps/api/test/unit/identity/preset-roles.spec.ts`
- **Verification:** `pnpm exec nx run api:test` → the new assertion runs and is green; deliberately reverting the source change reproduced a RED failure at the correct location.
- **Committed in:** `934846e` (RED), `039ff5a` (GREEN)

**3. [Rule 3 - Blocking] Nx module boundary blocks the CLI from importing `PRESET_ROLES` from `apps/api`**

- **Found during:** Task 2, designing the `sync-preset-roles` CLI command
- **Issue:** `packages/config-eslint/base.mjs` restricts `scope:tools` (which `tools/scripts/seed` carries) to `onlyDependOnLibsWithTags: ['scope:shared']` — `apps/api` is `scope:api`. Importing `PRESET_ROLES` from `apps/api/.../preset-roles.ts` in the CLI would fail lint (and duplicating the literal data in the CLI would reintroduce exactly the code/database drift risk this plan exists to close).
- **Fix:** Moved `PRESET_ROLES`/`PresetRoleDefinition` to `packages/domain/src/rbac/preset-roles.ts` (see Decisions above); `apps/api/.../preset-roles.ts` re-exports from `@resto/domain`.
- **Files modified:** `packages/domain/src/rbac/preset-roles.ts` (new), `packages/domain/src/rbac/index.ts`, `apps/api/src/contexts/identity/application/preset-roles.ts`
- **Verification:** `pnpm exec nx run seed-cli:lint` and `pnpm exec nx run seed-cli:typecheck` both pass with the CLI importing `PRESET_ROLES` from `@resto/domain`; `pnpm exec nx run api:lint`/`typecheck` unaffected; existing `SeedPresetRolesService` import path (`./preset-roles`) unchanged and still green.
- **Committed in:** `23ba102`

**4. [Rule 3 - Blocking] Plan's registration instruction ("alongside SeedPresetRolesService") doesn't match where `SeedPresetRolesService` actually lives**

- **Found during:** Task 2, module wiring
- **Issue:** The plan says to register `SyncPresetRolesService` in `identity-core.module.ts` "alongside `SeedPresetRolesService`." In the current codebase, `SeedPresetRolesService` is registered as a provider in `TenancyModule` (which imports `IdentityCoreModule` to reach `AUTH_DRIZZLE_TOKEN`), not inside `IdentityCoreModule` itself.
- **Fix:** Registered `SyncPresetRolesService` directly as an `IdentityCoreModule` provider (valid — `AUTH_DRIZZLE_TOKEN` is natively bound there) and exported it, satisfying the plan's literal acceptance criterion (`grep -n "SyncPresetRolesService" identity-core.module.ts` shows both) without needing to also touch `TenancyModule`.
- **Files modified:** `apps/api/src/contexts/identity/identity-core.module.ts`
- **Verification:** `pnpm exec nx run api:typecheck` green; `sync-preset-roles.spec.ts` instantiates the service directly (unit-level, no DI container needed) and passes.
- **Committed in:** `23ba102`

**5. [Rule 3 - Blocking] CLI cannot resolve a NestJS-DI service in-process**

- **Found during:** Task 2, designing how the CLI reaches `SyncPresetRolesService`
- **Issue:** `tools/scripts/seed/commands/provision-tenant.ts` documents (RES-113) that bootstrapping a Nest application context from this CLI was tried and abandoned due to tsx+esbuild incompatibility in this monorepo setup. The plan's action text implies the CLI reuses the NestJS service directly, which isn't achievable without reintroducing that abandoned approach or adding a new internal HTTP endpoint (out of the plan's declared file list either way).
- **Fix:** `tools/scripts/seed/commands/sync-preset-roles.ts` hand-rolls the identical sync algorithm via direct `postgres` SQL, connecting to `BETTER_AUTH_DATABASE_URL` — the same connection pattern already used by `tools/scripts/seed/lib/auth-db.ts`. `SyncPresetRolesService` remains the canonical in-process implementation for any future NestJS caller.
- **Files modified:** `tools/scripts/seed/commands/sync-preset-roles.ts` (new), `tools/scripts/seed/cli.ts`
- **Verification:** Ran live against the dev database twice (see "Live Database Run" above); output matches `SyncPresetRolesService`'s own unit-tested counts exactly.
- **Committed in:** `23ba102`

**6. [Rule 3 - Blocking] `node_modules` did not exist in the freshly-spawned worktree**

- **Found during:** Start of Task 1, first attempt to run any test
- **Issue:** `node_modules` is gitignored; a fresh `git worktree` checkout has none of it.
- **Fix:** Ran `pnpm install` (lockfile up to date, no resolution changes) before any verification step.
- **Verification:** `pnpm exec nx run <project>:test/lint/typecheck` all resolve and run correctly afterward.

**7. [Rule 1 - Bug] ESLint `non-nullable-type-assertion-style` vs. CLAUDE.md's `no-non-null-assertion: error`**

- **Found during:** Task 2, lint pass on the new CLI command
- **Issue:** `tenantFlag as string` (a non-null type assertion via `as`, not `!`) tripped `@typescript-eslint/non-nullable-type-assertion-style`, which wants a `!` assertion — forbidden by CLAUDE.md.
- **Fix:** Restructured the branch so TypeScript narrows `tenantFlag` from an explicit `!== undefined` check, removing the need for any assertion.
- **Files modified:** `tools/scripts/seed/commands/sync-preset-roles.ts`
- **Verification:** `pnpm exec nx run seed-cli:lint` clean.
- **Committed in:** `23ba102`

---

**Total deviations:** 7 auto-fixed (2 Rule 1 test-location/tooling bugs, 4 Rule 3 blocking-issue fixes, 1 Rule 1 lint-rule conflict)
**Impact on plan:** All fixes were necessary for the plan's own deliverables to actually work (a dead regression test, a CLI that couldn't import its data, a non-functional verify command). No scope creep beyond what Task 2 required to produce a working, single-source-of-truth CLI tool. `non-delegatable.ts`, `permissions.guard.ts`, and the `PERMISSION_CHECKER` binding remain byte-unchanged across the whole plan, exactly as required.

## Issues Encountered

- Pre-commit hooks (`nx affected -t typecheck --uncommitted`) took several minutes on the first two commits (cold Nx cache after the fresh `pnpm install`); subsequent commits were fast once the cache warmed. Not a plan issue — noted for awareness.
- One pre-existing, unrelated test failure observed throughout (`apps/api/test/unit/identity/identity-boot-integration.spec.ts` — `STRIPE_CONNECT_RETURN_URL`/`STRIPE_CONNECT_REFRESH_URL` prod-guardrail assertion). Confirmed present in the very first test run of this session, before any of this plan's edits — out of scope per the Scope Boundary rule, not fixed. Logged here for the phase verifier; not added to `deferred-items.md` since it is unrelated to Phase 10's RBAC/order work.

## User Setup Required

None — no external service configuration required. The live database run used the existing local dev stack (`docker compose -f infra/docker/docker-compose.dev.yml`) and the repo's own `.env` (gitignored, not part of this commit).

## Next Phase Readiness

- `order:cancel` is live in code and in the local dev database — plans that build the reject/cancel UI or endpoint (e.g. order-status transition work later in this phase) can rely on `order:cancel` being a real, delegatable permission already granted to owner/admin/manager/cashier-foh/kitchen.
- `pnpm resto:seed sync-preset-roles --all` is now a standing operational tool — any future preset permission change should be followed by running it against every non-local environment's database, the same way this plan ran it locally.
- D-07 is closed in writing (deferred, not dangling) — the phase verifier can point to `.planning/phases/10-admin-order-intake/deferred-items.md` directly.
- No blockers for downstream Phase 10 plans.

---

_Phase: 10-admin-order-intake_
_Completed: 2026-08-13_

## Self-Check: PASSED

All created files verified present (`packages/domain/src/rbac/preset-roles.ts`, `apps/api/src/contexts/identity/application/sync-preset-roles.service.ts`, `.planning/phases/10-admin-order-intake/deferred-items.md`, plus the other files listed above). All 4 task commits verified present in `git log` (`934846e`, `039ff5a`, `23ba102`, `f2f9ecf`).
