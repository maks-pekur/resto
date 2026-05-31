---
phase: 04a-catalog-schema-api
plan: 06
subsystem: catalog
tags:
  [
    catalog,
    services,
    repository,
    delayed-publish,
    redis-fallback,
    slug-auto-derive,
  ]
dependency-graph:
  requires: [04A-05]
  provides: [04A-07]
  affects:
    - apps/api/src/contexts/catalog/domain/ports.ts
    - apps/api/src/contexts/catalog/domain/published-menu.ts
    - apps/api/src/contexts/catalog/application/delayed-publish.service.ts
    - apps/api/src/contexts/catalog/application/publish-menu.service.ts
    - apps/api/src/contexts/catalog/application/stop-list.service.ts
    - apps/api/src/contexts/catalog/application/upsert-category.service.ts
    - apps/api/src/contexts/catalog/application/upsert-item.service.ts
    - apps/api/src/contexts/catalog/application/upsert-item-size.service.ts
    - apps/api/src/contexts/catalog/application/upsert-modifier-group.service.ts
    - apps/api/src/contexts/catalog/application/upsert-modifier-option.service.ts
    - apps/api/src/contexts/catalog/application/slug-util.ts
    - apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts
    - apps/api/src/contexts/catalog/infrastructure/redis-catalog-cache.adapter.ts
    - apps/api/src/contexts/catalog/catalog.module.ts
    - apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts
    - apps/api/src/contexts/catalog/interfaces/http/public-menu.controller.ts
    - apps/api/test/unit/catalog/*.spec.ts
    - apps/api/test/e2e/catalog.e2e.spec.ts
    - packages/db/migrations/0040_catalog_phase4a_grant_delete_stop_list.sql
    - packages/db/sql/roles.sql
    - packages/db/src/index.ts
    - packages/db/src/withoutTenant.allowlist.ts
    - packages/db/test/unit/withoutTenant-allowlist.spec.ts
    - apps/api/eslint.config.mjs

tech-stack:
  added: []
  patterns:
    - 'Delayed-publish in-memory 5s timer per tenant — Map<tenantId, NodeJS.Timeout> + OnModuleDestroy cleanup (RESEARCH.md Pattern 1, Pitfall 1, Pitfall 7).'
    - 'First-publish vs republish split via tenants.menu_first_published_at + outbox emit in same tx (RESEARCH.md Pattern 3).'
    - 'Stop-list overlay at read time (parallel scoped selects + Set filter) + cache invalidate after write (RESEARCH.md Pattern 2 Option B).'
    - 'Cyrillic slug auto-derive via transliteration package + normalize chain (RESEARCH.md Pattern 4) + alias insert on slug change (D-4a-04).'
    - 'MenuVersionPort.bump nextval fallback via db.withoutTenant on Redis outage (RESEARCH.md MenuVersionPort code example).'
    - 'Repository owns publish-finalize same-tx orchestration so application layer stays free of direct tx.update (ESLint ADR-0020 I-1 enforcement).'

key-files:
  created:
    - apps/api/src/contexts/catalog/application/delayed-publish.service.ts
    - apps/api/src/contexts/catalog/application/stop-list.service.ts
    - apps/api/src/contexts/catalog/application/upsert-modifier-group.service.ts
    - apps/api/src/contexts/catalog/application/upsert-modifier-option.service.ts
    - apps/api/src/contexts/catalog/application/upsert-item-size.service.ts
    - apps/api/src/contexts/catalog/application/slug-util.ts
    - packages/db/migrations/0040_catalog_phase4a_grant_delete_stop_list.sql
    - apps/api/test/unit/catalog/upsert-modifier-group.service.spec.ts
    - .planning/phases/04a-catalog-schema-api/deferred-items.md
  modified:
    - apps/api/src/contexts/catalog/domain/ports.ts
    - apps/api/src/contexts/catalog/domain/published-menu.ts
    - apps/api/src/contexts/catalog/application/publish-menu.service.ts
    - apps/api/src/contexts/catalog/application/upsert-category.service.ts
    - apps/api/src/contexts/catalog/application/upsert-item.service.ts
    - apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts
    - apps/api/src/contexts/catalog/infrastructure/redis-catalog-cache.adapter.ts
    - apps/api/src/contexts/catalog/catalog.module.ts
    - apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts
    - apps/api/src/contexts/catalog/interfaces/http/public-menu.controller.ts
    - apps/api/test/e2e/catalog.e2e.spec.ts
    - apps/api/test/unit/catalog/get-menu-item.service.spec.ts
    - apps/api/test/unit/catalog/get-published-menu.service.spec.ts
    - apps/api/test/unit/catalog/publish-menu.service.spec.ts
    - apps/api/test/unit/catalog/upsert-category.service.spec.ts
    - apps/api/test/unit/catalog/upsert-item.service.spec.ts
    - packages/db/sql/roles.sql
    - packages/db/src/index.ts
    - packages/db/src/withoutTenant.allowlist.ts
    - packages/db/test/unit/withoutTenant-allowlist.spec.ts
    - packages/db/migrations/meta/_journal.json
    - apps/api/eslint.config.mjs
  removed:
    - apps/api/src/contexts/catalog/application/upsert-modifier.service.ts (renamed → upsert-modifier-group.service.ts)
    - apps/api/test/unit/catalog/upsert-modifier.service.spec.ts (renamed → upsert-modifier-group.service.spec.ts)

decisions:
  - 'Repository owns finalizeMenuPublish — moved the same-tx orchestration (read menuFirstPublishedAt + conditional update + outbox emit) from the application service into the repository. The application service holds tx.update only at the cost of an ESLint override; the repo layer is the sanctioned home for raw tx.* calls per ADR-0020 I-1.'
  - 'PublishMenuService.execute() retained as a thin ALS-bound wrapper. Plan 06 already changes the constructor signature (adds CATALOG_REPOSITORY) and updates the spec; plan 07 will rewire the controller to call DelayedPublishService.schedule directly.'
  - 'deriveSlugFromName picks the first non-empty locale: ru → en → first key. LocalizedText has no built-in default locale, and the project market is RU-primary; this priority is the project convention without altering @resto/domain.'
  - 'Migration 0040 wrapped in DO-block role+table existence guard (mirrors 0028). On fresh testcontainer migrate the resto_app role does not yet exist; restating the GRANT in sql/roles.sql keeps the end state convergent.'
  - 'Test sanity-count for WITHOUT_TENANT_ALLOWLIST bumped from 12 → 13 to admit redis-catalog-cache.adapter.ts. Mirrored in apps/api/eslint.config.mjs override block.'

metrics:
  duration: ~140min
  completed: 2026-05-31
requirements: [CAT-06, CAT-10]
---

# Phase 04a Plan 06: Catalog Services + Infrastructure Refactor Summary

Phase 04a/Plan 06 lands the runtime behaviour for the iiko-aligned catalog: delayed-publish revert mechanism (CAT-06), Redis menu-version with Postgres `nextval` fallback (CAT-10), stop-list overlay at read time + cache invalidate on write, slug auto-derive via `transliteration` with alias on rename, plus the full repository refactor against renamed tables (`menu_item_sizes`, `menu_modifier_groups`, `menu_item_modifier_groups`) with photos JSONB array + BJU read model.

## What Was Done

### Task 1: Domain ports + published-menu types + repository refactor (commit `36ae3e8`)

- **`apps/api/src/contexts/catalog/domain/ports.ts`** — extended `CatalogRepository` with 7 new methods (`upsertModifierGroup`, `upsertModifierOption`, `upsertItemSize`, `addToStopList`, `removeFromStopList`, `getMenuFirstPublishedAt`, `insertSlugAlias`) plus the `finalizeMenuPublish` orchestration method. Renamed `upsertModifier` → `upsertModifierGroup`. `CatalogCachePort` gained `invalidate(tenantId, version, brandId?)` for the stop-list write path. 5 new row types: `UpsertModifierGroupRow`, `UpsertModifierOptionRow`, `UpsertItemSizeRow`, `StopListInsertRow`, plus the `UpsertItemRow` shape widened to carry `photos[]` + BJU + provenance fields directly (forward-shim `imageS3Key` removed).
- **`apps/api/src/contexts/catalog/domain/published-menu.ts`** — `PublishedMenuVariant` → `PublishedMenuItemSize` (renamed + `priceDelta` → absolute `price`); `PublishedMenuModifier` → `PublishedMenuModifierGroup`; new `PublishedMenuItemPhoto` carrying presigned URL + S3 key for forward-compat multi-photo galleries. `PublishedMenuItem` extended with `photos[]`, BJU (`proteins`/`fats`/`carbs`/`kcal`/`nutritionEstimated`), `sizes`, `modifierGroupIds`; `imageUrl` retained as backward-compat convenience (= `photos[0].url`). `PublishedMenu.modifiers` → `modifierGroups`.
- **`apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts`** — full refactor against renamed tables: `signPhotos` helper presigns ALL photo entries (not just first), `loadPublishedMenu` does 4 parallel scoped selects (categories + items + stop-list + brand) and filters stopped items BEFORE the size + modifier-group join queries fire. New write methods implement the 7 new port methods. `finalizeMenuPublish` is the same-tx publish-finalize orchestration (read first-published-at → conditional update + outbox emit) — sole tx.update site, sanctioned in the repo layer per ADR-0020 I-1 + apps/api ESLint override.
- **`apps/api/src/contexts/catalog/interfaces/http/public-menu.controller.ts`** — DTO Zod schemas updated to match the new published-menu shape (photos array, sizes, modifier groups, BJU). The controller itself unchanged (plan 07 wires new endpoints).
- **`apps/api/test/e2e/catalog.e2e.spec.ts`** — payload updated from legacy `imageS3Key` to `photos: [{ s3Key, sortOrder }]`.
- **`packages/db/migrations/0040_catalog_phase4a_grant_delete_stop_list.sql`** — new migration: `GRANT DELETE ON menu_stop_list TO resto_app` for the unstop path. Wrapped in DO-block existence guards so test-container fresh migrate (resto_app not yet provisioned) does not crash. `packages/db/sql/roles.sql` restates the GRANT for fresh-reset convergence.
- **`packages/db/src/index.ts`** — exports `MenuItemPhoto` type so the catalog repo + application layers can speak the shape across the package boundary.

### Task 2: Redis cache adapter nextval fallback + invalidate (commit `3270786`)

- **`apps/api/src/contexts/catalog/infrastructure/redis-catalog-cache.adapter.ts`** — constructor now injects `TenantAwareDb`. `bump(tenantId)` calls `#nextvalBump` when `this.client === null` (no `REDIS_URL`) or on a Redis runtime error. `#nextvalBump` calls `db.withoutTenant('menu version nextval fallback — Redis unavailable', tx => SELECT nextval('menu_versions_seq'))` — `menu_versions_seq` is a global Postgres sequence (no tenant binds). Result row parsed, returned. New `invalidate(tenantId, version, brandId?)` method `DEL`s the menu cache key (no-ops if Redis disabled); used by `StopListService` after the write commits.
- **`packages/db/src/withoutTenant.allowlist.ts`** — new entry `apps/api/src/contexts/catalog/infrastructure/redis-catalog-cache.adapter.ts` with rationale comment (CAT-10 / D-4a-07). Parity test count bumped 12 → 13.
- **`apps/api/eslint.config.mjs`** — adapter added to the `@withoutTenant-allowlist` override block so the per-file `no-restricted-syntax` exception covers the new bypass call site.

### Task 3: Application services + module wiring + spec updates (commit `df1ca01`)

- **`apps/api/src/contexts/catalog/application/delayed-publish.service.ts`** (NEW) — `@Injectable` + `OnModuleDestroy`. `#pending = Map<tenantId, { timerId }>`, `#DELAY_MS = 5_000`. `schedule(tenantId)` cancels any existing timer for this tenant, installs a new 5s timer whose callback calls `publisher.doPublish(tenantId)` (Pitfall 7: setTimeout escapes ALS — `doPublish` accepts explicit tenantId). Returns `{ cancel: () => boolean }` valid for the 5s window: `true` if undo in time, `false` if already published. `onModuleDestroy` clears all timers (Pitfall 1: pending publishes die with the process; deferred to Phase 4b for persistent pending tracking if it proves observable).
- **`apps/api/src/contexts/catalog/application/publish-menu.service.ts`** — `execute()` retained as an ALS-bound thin wrapper; new `doPublish(tenantId)` accepts an explicit tenantId for the setTimeout callback path. Both delegate to `repo.finalizeMenuPublish` for the same-tx version bump + outbox emit + conditional `menu_first_published_at` stamp.
- **`apps/api/src/contexts/catalog/application/stop-list.service.ts`** (NEW) — `stop(input)` inserts the row via `repo.addToStopList` (onConflictDoNothing for idempotency) and emits `ItemStoppedV1` in the same `db.withTenant` transaction. After commit, calls `cachePort.invalidate(tenantId, currentVersion, brandId)` (RESEARCH.md Pattern 2 Option B). `unstop(itemId)` mirrors — deletes the row (migration 0040 grants the privilege), emits `ItemUnstoppedV1`, invalidates the cache; throws `StopListItemNotFoundError` if no row to delete.
- **`apps/api/src/contexts/catalog/application/upsert-modifier-group.service.ts`** (NEW; renamed from `upsert-modifier.service.ts`).
- **`apps/api/src/contexts/catalog/application/upsert-modifier-option.service.ts`** (NEW) — handles modifier-option upsert with `priceDelta`, `defaultAmount`, `freeAmount` (iiko `NPModifierModel` fields).
- **`apps/api/src/contexts/catalog/application/upsert-item-size.service.ts`** (NEW) — handles per-item size upsert with absolute `price`.
- **`apps/api/src/contexts/catalog/application/slug-util.ts`** (NEW) — `normalizeSlug` runs `transliteration.slugify(text, { lowercase, separator: '-', trim })` then strips non-`[a-z0-9-]`, collapses repeat dashes, trims edge dashes. `pickDefaultLocaleValue` chooses `ru` → `en` → first non-empty locale. `deriveSlugFromName` is the application-facing helper.
- **`apps/api/src/contexts/catalog/application/upsert-category.service.ts`** — drops the `slug ?? ''` shim; uses `deriveSlugFromName(input.name)` when slug absent. Passes `parentId` through.
- **`apps/api/src/contexts/catalog/application/upsert-item.service.ts`** — drops the `imageS3Key: input.photos[0]?.s3Key ?? null` shim; passes full `photos[]` + BJU + provenance fields through. Slug auto-derive identical to category. Slug-change alias creation happens at the repository layer inside the same upsert transaction (idempotent via `onConflictDoNothing`).
- **`apps/api/src/contexts/catalog/catalog.module.ts`** — providers list now includes `DelayedPublishService`, `StopListService`, `UpsertModifierGroupService`, `UpsertModifierOptionService`, `UpsertItemSizeService`, plus the existing services.
- **`apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts`** — DI rename: `UpsertModifierService` → `UpsertModifierGroupService`. Plan 07 will add the new endpoints + rewire publish to `DelayedPublishService.schedule`.
- **Unit specs** — `publish-menu.service.spec.ts` updated for new constructor (versions + repo, no db direct); `upsert-category.service.spec.ts` + `upsert-item.service.spec.ts` updated for the new row shape (photos[] + parentId + BJU + source) and added slug-auto-derive coverage with Cyrillic input; `upsert-modifier-group.service.spec.ts` renamed from `upsert-modifier.service.spec.ts`; `get-menu-item.service.spec.ts` + `get-published-menu.service.spec.ts` updated for the renamed `modifiers` → `modifierGroups` and new repo interface shape.

## doPublish Flow Diagram

```
HTTP POST /internal/v1/catalog/publish
      ↓
(plan 07 will rewire) DelayedPublishService.schedule(tenantId)
      ↓
setTimeout(5s) — pending in Map<tenantId, { timerId }>
      ↓ (after 5s, no cancel)
PublishMenuService.doPublish(tenantId)
      ↓
MenuVersionPort.bump(tenantId) — Redis INCR, or nextval('menu_versions_seq') on Redis outage
      ↓
CatalogRepository.finalizeMenuPublish({ tenantId, version })
      ↓
db.withTenant / withTenantId — same transaction:
   SELECT tenants.menu_first_published_at
   ├─ NULL → UPDATE tenants SET menu_first_published_at = NOW()
   │         appendToOutbox(MenuFirstPublishedV1)
   └─ NOT NULL → appendToOutbox(MenuRepublishedV1)
      ↓
return { version }
```

## Repository Rename Map (already applied in plan 04)

| Old (pre-04a)              | New (post-04a)                                                     |
| -------------------------- | ------------------------------------------------------------------ |
| `schema.menuVariants`      | `schema.menuItemSizes`                                             |
| `schema.menuModifiers`     | `schema.menuModifierGroups`                                        |
| `schema.menuItemModifiers` | `schema.menuItemModifierGroups`                                    |
| `r.imageS3Key`             | `r.photos[]`                                                       |
| `m.modifierId`             | `m.modifierGroupId`                                                |
| `v.priceDelta`             | `v.price` (absolute)                                               |
| `PublishedMenuVariant`     | `PublishedMenuItemSize`                                            |
| `PublishedMenuModifier`    | `PublishedMenuModifierGroup`                                       |
| `PublishedMenu.modifiers`  | `PublishedMenu.modifierGroups`                                     |
| `imageUrl` (raw)           | `imageUrl` (presigned from photos[0]) + `photos[]` (all presigned) |

## MenuVersionPort Fallback Chain

```
RedisCatalogCacheAdapter.bump(tenantId)
  ├─ this.client === null (no REDIS_URL)
  │    → #nextvalBump(tenantId)
  ├─ this.client.incr(VERSION_KEY) — happy path (Redis OK)
  │    → returns new version
  └─ catch (Redis runtime error)
       → logger.warn({ tenantId, err }, 'Redis unavailable — falling back to menu_versions_seq')
       → #nextvalBump(tenantId)

#nextvalBump:
  db.withoutTenant('menu version nextval fallback — Redis unavailable', async (tx) =>
    tx.execute(sql`SELECT nextval('menu_versions_seq') AS v`)
  )
  → Number(result[0].v)

current(tenantId): Redis only — returns 1 if Redis disabled or empty (read-side is
  best-effort; a write-side bump still produces a globally-unique version via nextval).
```

## Pitfall 1 (Timer Lost on Restart) Acknowledgement

`DelayedPublishService.onModuleDestroy` clears pending `setTimeout` handles for graceful shutdown — pending publishes at process death are silently dropped. RESEARCH.md §Pitfall 1 documented two options:

- **(a)** Accept the failure mode — operator must click Publish again (current 4a-06 implementation).
- **(b)** Add `menu_pending_publish` table + boot-time scan to replay timers that survived restart.

4a-06 lands option (a). The class-level comment block in `delayed-publish.service.ts` references both RESEARCH.md Pitfall 1 (timer-lost) and Pitfall 7 (setTimeout ALS escape) so the next reader sees the tradeoff before changing the shape. Phase 4b or later can add the persistent pending-publish table if production observability shows the failure mode is hit (no current operators → no signal).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] `finalizeMenuPublish` moved from PublishMenuService into the repository**

- **Found during:** Task 3 lint run (`pnpm exec nx run api:lint` flagged the `tx.update(schema.tenants)` call in `publish-menu.service.ts` per the ADR-0020 I-1 ESLint rule that forbids direct `tx.*` calls outside `*-drizzle.repository.ts` files).
- **Issue:** Plan said `doPublish` should do `tx.update(schema.tenants) + appendToOutbox` inline. The ESLint rule (`no-restricted-syntax` `CallExpression[callee.object.name='tx'][callee.property.name=/^(select|insert|update|delete)$/]`) refuses any commit that places those calls outside a repository adapter file.
- **Fix:** Added `finalizeMenuPublish({ tenantId, version }): Promise<{ isFirstPublish: boolean }>` to `CatalogRepository`, implemented in `catalog-drizzle.repository.ts`. The method internally probes ALS once to decide between `db.withTenant` (ALS-bound HTTP path) and `db.withTenantId` (setTimeout callback / no ALS) and runs the SAME same-tx orchestration the plan described. `PublishMenuService.doPublish` becomes a 3-line orchestrator (bump → finalize → log).
- **Files modified:** `apps/api/src/contexts/catalog/domain/ports.ts` (added port method), `apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts` (implementation + outbox imports), `apps/api/src/contexts/catalog/application/publish-menu.service.ts` (collapsed body).
- **Verification:** `pnpm exec nx run api:lint` no longer flags any catalog file; `pnpm exec nx run api:typecheck` passes; unit spec `publish-menu.service.spec.ts` exercises both ALS-bound (execute) and explicit-id (doPublish) paths via `finalizeMenuPublish` mock.
- **Forward-compat note:** Plan 06's interfaces block specified the publisher should call `tx.update + appendToOutbox + buildEnvelope` inline; the rewrite preserves the contract (same-tx isolation, same outbox events) but lifts the SQL into the repository where ADR-0020 I-1 + lint policy expect it.

**2. [Rule 3 — Blocking] Migration 0040 wrapped in DO-block existence guards**

- **Found during:** First `db:test` run with the bare `GRANT DELETE ON menu_stop_list TO resto_app;` migration.
- **Issue:** The testcontainer runs migrations BEFORE `provisionAppRole` creates `resto_app`. The unguarded GRANT fails with `role "resto_app" does not exist`.
- **Fix:** Wrapped the GRANT in a `DO $$ ... $$` block that probes `pg_roles` + `pg_tables` first (mirrors 0028's `inbox_processed` pattern). Restated the GRANT in `packages/db/sql/roles.sql` so a fresh `db:reset` converges to the same end state regardless of which step runs first.
- **Files modified:** `packages/db/migrations/0040_catalog_phase4a_grant_delete_stop_list.sql`, `packages/db/sql/roles.sql`.
- **Verification:** `db:test` integration tests pass for migration application (the 2 remaining failures are pre-existing — see deferred-items.md).

**3. [Rule 3 — Blocking] Public menu controller DTO Zod schemas updated**

- **Found during:** Task 1 typecheck (the controller's Zod-derived DTOs referenced the old `variants` / `modifierIds` / `modifiers` fields).
- **Issue:** Plan 06 changed the `PublishedMenu` interface; the controller's runtime DTO had to track it or `api:typecheck` fails.
- **Fix:** Replaced `PublishedMenuVariantSchema` → `PublishedMenuItemSizeSchema`, added `PublishedMenuItemPhotoSchema`, extended `PublishedMenuItemSchema` with photos + BJU + sizes + modifierGroupIds, renamed `PublishedMenuModifierSchema` → `PublishedMenuModifierGroupSchema` (adding `defaultAmount`/`freeAmount` to the option), changed `PublishedMenuSchema.modifiers` → `modifierGroups`.
- **Files modified:** `apps/api/src/contexts/catalog/interfaces/http/public-menu.controller.ts`.
- **Note:** Plan 07 owns the broader controller refactor + new endpoints; this is the minimal change to keep typecheck green. The openapi.yaml regen in plan 07 will pick up the schema change.

### Deferred Out-of-Scope Issue

**Pre-existing: `tenancy_erase_tenant` references the OLD catalog table names.** The PL/pgSQL function created in migration 0011 still issues `DELETE FROM menu_modifiers / menu_variants`, which were renamed by plan 04. Two integration specs fail on a fresh testcontainer migrate. Logged in `.planning/phases/04a-catalog-schema-api/deferred-items.md` for plan 04a-07 (or a small follow-up) to address. NOT touched by this plan because (a) it predates this plan's change set, (b) no paying tenants → no production impact, (c) the fix scope (new migration that recreates the function with renamed tables + the two new tables) is plan 04a-07-sized.

## Verification

- **`pnpm exec nx run api:typecheck`** → green.
- **`pnpm exec nx run db:typecheck`** → green.
- **`pnpm exec nx affected -t typecheck --uncommitted --parallel=3`** (pre-commit gate) → green.
- **`pnpm exec nx run api:lint`** → no catalog-related lint errors (4 pre-existing errors in unrelated files: `assert-system-roles-present.ts`, `resend.adapter.ts`, two e2e specs — baseline before my changes was also failing on these; out of scope).
- **`pnpm vitest run test/unit/catalog`** (apps/api) → 35 tests passed in 7 files.
- **`pnpm vitest run test/unit/withoutTenant-allowlist.spec.ts`** (packages/db) → 2 tests passed (allowlist parity).
- **`pnpm db:migrate`** against dev DB on port 5433 → migration 0040 applied cleanly.
- **`docker exec resto-postgres psql -c "SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants WHERE grantee = 'resto_app' AND privilege_type = 'DELETE'"`** → returns `inbox_processed` and `menu_stop_list` (the new GRANT is live).
- **`pnpm db:audit-fks`** → exit 0, `"no I-2 violations"`.

### Acceptance grep gates (all pass)

| Gate                                                                               | Result                           |
| ---------------------------------------------------------------------------------- | -------------------------------- |
| Old table-name refs in repo (`menuVariants\|menuModifiers\b\|menuItemModifiers\b`) | 0 ✓                              |
| New table-name refs in repo (≥5)                                                   | 28 ✓                             |
| `imageS3Key` in repo (=0)                                                          | 0 ✓                              |
| `signPhotos` references (≥2)                                                       | 3 ✓                              |
| Stop-list overlay refs (`stoppedItemIds\|menuStopList`)                            | 12 ✓                             |
| New port methods in ports.ts (≥7)                                                  | 7 ✓                              |
| `CatalogCachePort.invalidate` (≥1)                                                 | 1 ✓                              |
| `0040_catalog_phase4a_grant_delete_stop_list.sql` exists                           | ✓                                |
| `GRANT DELETE ON menu_stop_list` in migration (=1)                                 | 1 ✓                              |
| New domain types in published-menu.ts (≥3)                                         | 6 ✓                              |
| `nextval('menu_versions_seq')` in redis adapter (=1)                               | 1 ✓ (extra match is the comment) |
| `async invalidate` in redis adapter (=1)                                           | 1 ✓                              |
| `menu version nextval fallback` reason string                                      | 1 ✓                              |
| `redis-catalog-cache` in `withoutTenant.allowlist.ts`                              | 1 ✓                              |
| `OnModuleDestroy` in `delayed-publish.service.ts` (≥1)                             | 2 ✓                              |
| `#DELAY_MS = 5_000` (≥1)                                                           | 1 ✓                              |
| `MenuFirstPublishedV1\|MenuRepublishedV1` in publish path (≥2, now in repo)        | 5 ✓                              |
| `buildEnvelope` in publish path (≥2, repo)                                         | 3 ✓                              |
| `appendToOutbox` in publish path (≥2, repo)                                        | 3 ✓                              |
| `ItemStoppedV1\|ItemUnstoppedV1` in stop-list service (≥2)                         | 5 ✓                              |
| `cachePort.invalidate` calls in stop-list service (≥2)                             | 2 ✓                              |
| Slug auto-derive in upsert-item (≥1)                                               | 2 ✓                              |
| `insertSlugAlias\|menuItemSlugAliases` in repo                                     | 3 ✓                              |
| `parentId` in upsert-category (≥1)                                                 | 1 ✓                              |
| New service providers registered in `catalog.module.ts` (≥5)                       | 10 ✓                             |

## Task Commits

1. **Task 1** — `36ae3e8` — `feat(04a-06): extend ports, refactor catalog repository, grant DELETE on menu_stop_list`
2. **Task 2** — `3270786` — `feat(04a-06): redis cache nextval fallback + invalidate method (CAT-10)`
3. **Task 3** — `df1ca01` — `feat(04a-06): catalog services — delayed publish, stop list, slug auto-derive, modifier/size`

## Threat Flags

No new trust boundaries beyond the threat model documented in the plan's `<threat_model>` block. All STRIDE register mitigations (T-04a-06-01 through T-04a-06-09) are addressed by the implemented services. The `db.withoutTenant` call in `redis-catalog-cache.adapter.ts` is allow-listed with rationale (CAT-10 / D-4a-07).

## Self-Check: PASSED

- Files: all 9 created paths exist on disk in the worktree; all 22 modified paths show in git diff.
- Commits: `36ae3e8`, `3270786`, `df1ca01` all present in `git log --oneline`.
- Migration: `0040_catalog_phase4a_grant_delete_stop_list.sql` is the 41st journal entry (idx 40).
- Tests: 35 catalog unit tests pass; allowlist parity test passes.
- Acceptance gates: all 25 grep / file-existence assertions pass.

## Next Steps

- **Plan 04A-07** — wire new HTTP endpoints (`POST /modifier-groups`, `POST /modifier-options`, `POST /item-sizes`, `POST /stop-list`, `DELETE /stop-list/:itemId`); rewire `POST /publish` to call `DelayedPublishService.schedule`; add new `DELETE /publish` for cancel; regen `docs/api/openapi.yaml` + `packages/api-client/src/generated/api.ts`; add `pnpm openapi:check` CI gate; refactor e2e specs (cross-tenant isolation matrix, BJU + photos round-trip); follow up on the deferred `tenancy_erase_tenant` function (renamed tables).

---

_Phase: 04a-catalog-schema-api_
_Plan: 06_
_Completed: 2026-05-31_
