---
phase: 04b-catalog-admin-ui
plan: 02
subsystem: catalog
tags: [catalog, http, admin-api, openapi, drift-check, migration, rls]
dependency-graph:
  requires: [04b-01]
  provides: []
  affects:
    - apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts
    - apps/api/src/contexts/catalog/interfaces/http/error-mapping.ts
    - apps/api/src/contexts/catalog/application/dto.ts
    - apps/api/src/contexts/catalog/application/list-categories.service.ts
    - apps/api/src/contexts/catalog/application/list-items.service.ts
    - apps/api/src/contexts/catalog/application/get-item.service.ts
    - apps/api/src/contexts/catalog/application/list-modifier-groups.service.ts
    - apps/api/src/contexts/catalog/application/get-modifier-group.service.ts
    - apps/api/src/contexts/catalog/application/get-stop-list.service.ts
    - apps/api/src/contexts/catalog/application/get-draft-diff.service.ts
    - apps/api/src/contexts/catalog/application/archive-category.service.ts
    - apps/api/src/contexts/catalog/application/archive-item.service.ts
    - apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts
    - apps/api/src/contexts/catalog/domain/ports.ts
    - apps/api/src/contexts/catalog/domain/errors.ts
    - apps/api/src/contexts/catalog/catalog.module.ts
    - apps/api/test/unit/catalog/error-mapping.spec.ts
    - apps/api/test/unit/catalog/publish-menu.service.spec.ts
    - apps/api/test/e2e/catalog-reads.e2e.spec.ts
    - packages/db/migrations/0042_catalog_phase4b_categories_status.sql
    - packages/db/migrations/meta/_journal.json
    - packages/db/src/schema/menu.ts
    - packages/db/test/integration/menu-categories-status.spec.ts
    - docs/api/openapi.yaml
    - packages/api-client/src/generated/api.ts

tech-stack:
  added: []
  patterns:
    - 'Read-side application services follow `requireTenantContext()` + repo call via `ScopedTx` — ADR-0020 I-1 RLS double-enforcement; mirrors `GetMenuItemService` shape.'
    - "Archive services soft-flip `status='archived'` via `scoped.updateTable(...)` — idempotent on re-call; 404 (`MenuItemNotFoundError`/`MenuCategoryNotFoundError`) when the row is not visible to the calling tenant."
    - "`menu_categories.status` migration mirrors the 0029 menu_items.status idiom: ADD COLUMN with `default 'draft'`, NOT EXISTS-guarded CHECK constraint, backfill UPDATE to 'published' for existing rows."
    - 'Items list returns thin rows with `hasSizes: boolean` flag + `stoppedAt` (when paused) for the >24h stale-warning UI. Default `status` filter is `active` (excludes archived).'
    - 'Draft-diff is items-only for MVP-1 (Open Question #5 RESOLVED): items qualify as draft/modified/archived per their status + updated_at vs `tenants.menu_first_published_at`. Cap at 100 rows; surplus surfaces via `truncatedCount`.'

key-files:
  created:
    - apps/api/src/contexts/catalog/application/list-categories.service.ts
    - apps/api/src/contexts/catalog/application/list-items.service.ts
    - apps/api/src/contexts/catalog/application/get-item.service.ts
    - apps/api/src/contexts/catalog/application/list-modifier-groups.service.ts
    - apps/api/src/contexts/catalog/application/get-modifier-group.service.ts
    - apps/api/src/contexts/catalog/application/get-stop-list.service.ts
    - apps/api/src/contexts/catalog/application/get-draft-diff.service.ts
    - apps/api/src/contexts/catalog/application/archive-category.service.ts
    - apps/api/src/contexts/catalog/application/archive-item.service.ts
    - packages/db/migrations/0042_catalog_phase4b_categories_status.sql
    - packages/db/test/integration/menu-categories-status.spec.ts
    - apps/api/test/e2e/catalog-reads.e2e.spec.ts
    - .planning/phases/04b-catalog-admin-ui/04b-02-SUMMARY.md
  modified:
    - apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts
    - apps/api/src/contexts/catalog/interfaces/http/error-mapping.ts
    - apps/api/src/contexts/catalog/application/dto.ts
    - apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts
    - apps/api/src/contexts/catalog/domain/ports.ts
    - apps/api/src/contexts/catalog/domain/errors.ts
    - apps/api/src/contexts/catalog/catalog.module.ts
    - apps/api/test/unit/catalog/error-mapping.spec.ts
    - apps/api/test/unit/catalog/publish-menu.service.spec.ts
    - packages/db/migrations/meta/_journal.json
    - packages/db/src/schema/menu.ts
    - docs/api/openapi.yaml
    - packages/api-client/src/generated/api.ts

decisions:
  - "Item list `status` query param accepts `'all' | 'active' | 'draft' | 'published' | 'archived'`. `'active'` is the documented default — excludes archived only (admin D-03 default view: draft + published + paused visible). Implementations route into a `ne(status, 'archived')` predicate, not three OR'd equalities."
  - 'Idempotent archive: re-archiving an already-archived row is a no-op 204, not 409. Plan behavior spec dictates this. The two `*AlreadyArchivedError` classes ship anyway in `domain/errors.ts` and map to 409 in `error-mapping.ts` so a future strict-mode caller has the slot wired without revisiting the controller.'
  - 'Items list filtering on JSONB `name` uses `<col>::text ILIKE ...` rather than a JSONB-path operator — keeps the predicate trivially RLS-composable and works on every PG 16 build without a search-config dependency. Performance is acceptable for MVP-1 scale (< 1000 items per tenant).'
  - 'Draft-diff hits the in-memory partition path: load all items via `ScopedTx`, then bucket on the application side. Plan capped at 100 entries, the realistic MVP-1 catalog is well under that — moving the bucketing into SQL was deferred until catalog size warrants the index work.'
  - "Migration 0042 uses `ADD COLUMN IF NOT EXISTS` + a `DO $$ NOT EXISTS pg_constraint` wrapper around the CHECK ADD so re-running the migration on a partially-applied DB is safe. The backfill UPDATE is naturally idempotent (only flips `status='draft'`)."

metrics:
  duration: ~40min
  completed: 2026-05-31
requirements: [CAT-01, CAT-02, CAT-04, CAT-05, CAT-07, CAT-08]
---

# Phase 04b Plan 02: Wave 1 Backend Addendum Summary

Lands the **read + archive HTTP surface** that the 4b admin UI consumes: 7 new GET endpoints, 2 new PATCH archive endpoints, the underlying application services + repository methods, schema migration `0042_catalog_phase4b_categories_status.sql` (adds `menu_categories.status`), updated DTOs, OpenAPI regen, and the migration applied to the dev Postgres so live queries on the new column succeed.

## What Was Done

### Task 1 — Migration 0042 + Drizzle schema patch (commit `4013cb0`)

- **`packages/db/migrations/0042_catalog_phase4b_categories_status.sql`** — 3-statement migration:
  1. `ALTER TABLE menu_categories ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';`
  2. `DO $$` block that adds CHECK constraint `status IN ('draft','published','archived')` guarded by `pg_constraint` NOT EXISTS lookup.
  3. Backfill UPDATE that flips existing `status='draft'` rows to `'published'` (rows that pre-existed the migration were already visible by definition).
- **`packages/db/src/schema/menu.ts`** — `menuCategories` table extended with `status: text('status').notNull().default('draft')` + the matching `check('menu_categories_status_chk', …)` mirroring the existing `menuItems.status` idiom.
- **`packages/db/migrations/meta/_journal.json`** — appended idx 42 entry with timestamp `1779841800000`.
- **`packages/db/test/integration/menu-categories-status.spec.ts`** — 5-test integration spec validating: default 'draft' for new inserts; CHECK rejection on invalid value (asserted against the driver's `err.cause.constraint_name`); accepts 'published' + 'archived'; backfill UPDATE is idempotent on already-published rows.
- **`tenant-isolation.spec.ts`** — 29 tests continue passing; the single-column DDL did not require additional composite-FK gymnastics (PATTERNS callout #6).

### Task 2 — Application services + repository extensions + DTOs (commit `21380e1`)

- **9 new application services**, each `@Injectable()`, depending on `CATALOG_REPOSITORY` symbol, calling `requireTenantContext()` before any repo call:
  - `ListCategoriesService.execute({ parentId })` — filters by parentId (null = top-level); sortOrder ASC + slug ASC.
  - `ListItemsService.execute({ status?, categoryId?, q?, limit, offset })` — thin row projection with `hasSizes` boolean + `stoppedAt`; default `status='active'`; pagination capped at 200, default 50.
  - `GetItemService.execute({ id })` — full item with embedded `sizes[]` + `modifierGroupIds[]`; throws `MenuItemNotFoundError` on miss.
  - `ListModifierGroupsService.execute()` — option-count + usage-count per group.
  - `GetModifierGroupService.execute({ id })` — embedded `options[]`; throws `MenuModifierGroupNotFoundError` on miss.
  - `GetStopListService.execute()` — joined item + category names with `stoppedAt` exposed; sorted by `stoppedAt DESC`.
  - `GetDraftDiffService.execute()` — `{ unpublishedCount, items, truncatedCount }`; items-only per Open Question #5; capped at 100.
  - `ArchiveCategoryService.execute(id)` — sets `status='archived'`; throws `MenuCategoryNotFoundError` if row not visible; idempotent on re-call.
  - `ArchiveItemService.execute(id)` — sets `status='archived'`; throws `MenuItemNotFoundError` if row not visible; idempotent on re-call.
- **`catalog-drizzle.repository.ts`** — added 9 repo methods. Every method uses `db.withTenant(...)` and `ScopedTx.selectFrom/updateTable` — no raw `tx` access (ADR-0020 I-1). Draft-diff uses the "load all items + partition in app code" path (sub-100-row catalog assumption for MVP-1; SQL-side bucketing is deferred until catalogue size warrants the index work).
- **`domain/ports.ts`** — extended `CatalogRepository` interface with the 9 new method signatures + 7 row type interfaces (`CategoryListRow`, `ItemListRow`, `ItemDetailRow`, `ModifierGroupListRow`, `ModifierGroupDetailRow`, `StopListEntryRow`, `DraftDiffEntryRow`). Added `ItemStatusFilter` discriminated union (`'all' | 'draft' | 'published' | 'archived' | 'active'`).
- **`domain/errors.ts`** — added `MenuCategoryAlreadyArchivedError` + `MenuItemAlreadyArchivedError` (defensive; archive services are idempotent so they aren't thrown in current flows; the union stays exhaustive for future strict-mode callers).
- **`application/dto.ts`** — 7 new Zod response schemas + `createZodDto(...)` class wrappers (`CategoryListResponseDto`, `ItemListResponseDto`, `ItemDetailResponseDto`, `ModifierGroupListResponseDto`, `ModifierGroupDetailResponseDto`, `StopListResponseDto`, `DraftDiffResponseDto`).
- **`catalog.module.ts`** — registered all 9 new services in `providers[]`.
- **`publish-menu.service.spec.ts`** — extended the `satisfies CatalogRepository` mock with the 9 new method stubs so the unit test typechecks against the broadened port.

### Task 3 — Controller wiring + error mapping + OpenAPI regen (commit `c86f4be`)

- **`internal-catalog.controller.ts`** — added 9 HTTP methods:
  - `@Get('categories')` → `listCategoriesService` with `parentId?` query.
  - `@Get('items')` → `listItemsService` with `status?`, `categoryId?`, `q?`, `limit?`, `offset?` query params; status query is validated against the allowed enum and coerced to `undefined` (falls back to service default `'active'`) when missing/invalid.
  - `@Get('items/:id')` → `getItemService`.
  - `@Get('modifier-groups')` → `listModifierGroupsService`.
  - `@Get('modifier-groups/:id')` → `getModifierGroupService`.
  - `@Get('stop-list')` → `getStopListService`.
  - `@Get('draft-diff')` → `getDraftDiffService`.
  - `@Patch('categories/:id/archive')` → `archiveCategoryService` (204 No Content).
  - `@Patch('items/:id/archive')` → `archiveItemService` (204 No Content).
- All 9 methods wrapped with `wrap(() => …)` (Pattern S3); class-level decorators (`@Public`, `@UseGuards(InternalTokenGuard)`, `@Controller('internal/v1/catalog')`) unchanged. New imports: `Get`, `Patch`, `Query` added to `@nestjs/common`.
- **`error-mapping.ts`** — extended `isCatalogDomainError` + `mapKnown` to cover `MenuCategoryAlreadyArchivedError` (`catalog.menu_category_already_archived` → 409) and `MenuItemAlreadyArchivedError` (`catalog.menu_item_already_archived` → 409). Exhaustive-switch invariant preserved.
- **`test/unit/catalog/error-mapping.spec.ts`** — 2 new assertions for the two new error codes; total 9/9 unit tests pass.
- **`test/e2e/catalog-reads.e2e.spec.ts`** — 12 new e2e tests covering all 9 endpoints + cross-tenant isolation:
  1. GET /categories sorted by sortOrder + parentId filter.
  2. GET /items with `hasSizes` flag and status filter.
  3. GET /items/:id with embedded sizes + modifierGroupIds.
  4. GET /items/:id cross-tenant 404.
  5. GET /modifier-groups with option-count + usage-count.
  6. GET /modifier-groups/:id with embedded options.
  7. GET /modifier-groups/:id 404 for unknown id.
  8. GET /stop-list with stoppedAt timestamp.
  9. GET /draft-diff returns `unpublishedCount` + `truncatedCount`.
  10. PATCH /categories/:id/archive idempotent.
  11. PATCH /categories/:id/archive cross-tenant 404.
  12. PATCH /items/:id/archive flips status.
- **`docs/api/openapi.yaml`** — regenerated; all 9 new operationIds present (`InternalCatalogController_{listCategories, listItems, getItem, listModifierGroups, getModifierGroup, listStopList, getDraftDiff, archiveCategory, archiveItem}`).
- **`packages/api-client/src/generated/api.ts`** — regenerated by the `openapi-typescript` codegen; in sync with `docs/api/openapi.yaml`.
- **`pnpm openapi:check`** exits 0.

### Task 4 [BLOCKING] — Apply migration 0042 to dev Postgres

- Ran `DATABASE_ADMIN_URL=postgres://resto:***@localhost:5433/resto pnpm --filter @resto/db db:migrate`. The dev Postgres container listens on host port 5433 (mapped from container 5432 because another process holds 5432) — the env URL was overridden inline; `.env` ships the conventional 5432 mapping that is correct on a fresh checkout.
- Verified via `docker exec resto-postgres psql -U resto -d resto -c "..."`:
  - `menu_categories.status` column exists with `data_type=text` and `column_default='draft'::text`.
  - CHECK constraint `menu_categories_status_chk` exists with definition `((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))`.
- Re-running `db:migrate` is a no-op (no new journal entries).
- No source files modified by this task — it is a database state change only.

## HTTP Endpoint Map (Internal Catalog API after Plan 04b-02)

Pre-existing 04a write surface (unchanged):

| Method | Path                                     | Service                               | Returns                        |
| ------ | ---------------------------------------- | ------------------------------------- | ------------------------------ |
| POST   | `/internal/v1/catalog/categories`        | `UpsertCategoryService`               | `{ id: uuid }`                 |
| POST   | `/internal/v1/catalog/items`             | `UpsertItemService`                   | `{ id: uuid }`                 |
| POST   | `/internal/v1/catalog/modifier-groups`   | `UpsertModifierGroupService`          | `{ id: uuid }`                 |
| POST   | `/internal/v1/catalog/modifier-options`  | `UpsertModifierOptionService`         | `{ id: uuid }`                 |
| POST   | `/internal/v1/catalog/item-sizes`        | `UpsertItemSizeService`               | `{ id: uuid }`                 |
| POST   | `/internal/v1/catalog/stop-list`         | `StopListService.stop`                | `{ id: uuid }`                 |
| DELETE | `/internal/v1/catalog/stop-list/:itemId` | `StopListService.unstop`              | 204 No Content                 |
| POST   | `/internal/v1/catalog/publish`           | `DelayedPublishService.schedule`      | `{ scheduled, cancelAfterMs }` |
| DELETE | `/internal/v1/catalog/publish`           | `DelayedPublishService.cancelPending` | `{ cancelled: boolean }`       |

Phase 4b additions (this plan):

| Method | Path                                                | Service                     | Returns                                       |
| ------ | --------------------------------------------------- | --------------------------- | --------------------------------------------- |
| GET    | `/internal/v1/catalog/categories?parentId=`         | `ListCategoriesService`     | `{ items: CategoryListItem[] }`               |
| GET    | `/internal/v1/catalog/items?status=&categoryId=&q=` | `ListItemsService`          | `{ items, total, limit, offset }`             |
| GET    | `/internal/v1/catalog/items/:id`                    | `GetItemService`            | `ItemDetailResponse`                          |
| GET    | `/internal/v1/catalog/modifier-groups`              | `ListModifierGroupsService` | `{ items: ModifierGroupListItem[] }`          |
| GET    | `/internal/v1/catalog/modifier-groups/:id`          | `GetModifierGroupService`   | `ModifierGroupDetailResponse`                 |
| GET    | `/internal/v1/catalog/stop-list`                    | `GetStopListService`        | `{ items: StopListEntry[] }`                  |
| GET    | `/internal/v1/catalog/draft-diff`                   | `GetDraftDiffService`       | `{ unpublishedCount, items, truncatedCount }` |
| PATCH  | `/internal/v1/catalog/categories/:id/archive`       | `ArchiveCategoryService`    | 204 No Content                                |
| PATCH  | `/internal/v1/catalog/items/:id/archive`            | `ArchiveItemService`        | 204 No Content                                |

All 9 new endpoints inherit class-level `@Public()` + `@UseGuards(InternalTokenGuard)` + `wrap(mapCatalogError)`. Validation: path/query params are typed at the controller; bodies are absent (these are pure reads or empty-body PATCHes).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Pre-commit hook `@typescript-eslint/no-non-null-assertion` on the menu-categories-status spec**

- **Found during:** Task 1 commit.
- **Issue:** Initial spec used `const id = row!.id;` for the row returned from `.returning({...})`.
- **Fix:** Replaced with `if (!row) throw new Error('seed already-published row'); const id = row.id;` — matches the established style in `repository-base.spec.ts`.
- **Files modified:** `packages/db/test/integration/menu-categories-status.spec.ts`.
- **Commit:** `4013cb0`.

**2. [Rule 1 — Bug] Initial integration spec assertion against `Failed query …` regex was too broad**

- **Found during:** Task 1 test run.
- **Issue:** The driver wraps Postgres' constraint-violation error with a generic "Failed query …" prefix; `expect(...).rejects.toThrow(/menu_categories_status_chk/)` failed because the constraint name lives on `err.cause.constraint_name`, not the top-level message.
- **Fix:** Switched to a `try/catch` + assertion on `caught.cause.code === '23514'` AND `caught.cause.constraint_name === 'menu_categories_status_chk'`. The assertion now pins to the SPECIFIC constraint instead of any failing INSERT.
- **Files modified:** `packages/db/test/integration/menu-categories-status.spec.ts`.
- **Commit:** `4013cb0`.

**3. [Rule 1 — Bug] Initial repository extension lost type inference on `categoryRows`**

- **Found during:** Task 2 typecheck.
- **Issue:** `Promise.resolve([] as Awaited<ReturnType<typeof scoped.selectFrom>>)` widened the row type to the union of every tenant-scoped table's `$inferSelect`, breaking `.id` access in `listItems`.
- **Fix:** Replaced the universal cast with an explicit `type CategoryRow = typeof schema.menuCategories.$inferSelect;` and `categoryRows: CategoryRow[]` annotation on both branches of the conditional. Type-correct, no `as` casts needed.
- **Files modified:** `apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts`.
- **Commit:** `21380e1`.

**4. [Rule 2 — Missing Functionality] Unit-test mocks for `publish-menu.service.spec.ts` did not satisfy the broadened `CatalogRepository` port**

- **Found during:** Task 2 typecheck.
- **Issue:** Adding 9 new methods to `CatalogRepository` broke the `satisfies CatalogRepository` constraint in `publish-menu.service.spec.ts` (and silently nothing in the other 5 specs because those use `as unknown as CatalogRepository` double-casts).
- **Fix:** Added stub `vi.fn()` entries for the 9 new methods. Other specs are insulated by the double-cast and continued to typecheck without changes.
- **Files modified:** `apps/api/test/unit/catalog/publish-menu.service.spec.ts`.
- **Commit:** `21380e1`.

**5. [Rule 1 — Bug] Pre-commit hook `@typescript-eslint/no-unnecessary-condition` on repository null-coalescing**

- **Found during:** Task 2 commit.
- **Issue:** `r.photos` and `r.allergens` have NOT NULL DDL → Drizzle infers them as non-nullable. Two `?? []` and one `?? null` triggered `no-unnecessary-condition`.
- **Fix:** Removed the redundant `??` on `r.photos` (used `r.photos.find(...)` directly) and on the `getItemById` projection.
- **Files modified:** `apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts`.
- **Commit:** `21380e1`.

### Pre-existing Out-of-Scope Items (Deferred)

- **`apps/api` lint baseline:** 12 pre-existing errors in unrelated files (`assert-system-roles-present.ts`, `resend.adapter.ts`, `cross-tenant-nats-mix.e2e.spec.ts`, `gdpr-retention.e2e.spec.ts`). Mirrors the 04A-07 deferred-items note; not caused by this plan. The catalog code added by 04b-02 is lint-clean (verified with `pnpm exec eslint src/contexts/catalog test/unit/catalog test/e2e/catalog-reads.e2e.spec.ts` → 0 errors).

## D-4b-07 Acceptance Verification

| Acceptance gate                                                     | Result                                              |
| ------------------------------------------------------------------- | --------------------------------------------------- | --- |
| `pnpm exec tsc -p apps/api/tsconfig.json --noEmit` exits 0          | ✓                                                   |
| `pnpm openapi:check` exits 0                                        | ✓                                                   |
| `pnpm --filter @resto/api exec vitest run test/unit` → 402/402 pass | ✓                                                   |
| `catalog-reads.e2e.spec.ts` → 12/12 pass                            | ✓                                                   |
| `catalog.e2e.spec.ts` (regression) → 16/16 pass                     | ✓                                                   |
| `menu-categories-status.spec.ts` → 5/5 pass                         | ✓                                                   |
| `tenant-isolation.spec.ts` (regression) → 29/29 pass                | ✓                                                   |
| `grep -c '@Get\\                                                    | @Patch' internal-catalog.controller.ts` returns ≥ 9 | 9 ✓ |
| 9 operationIds present in `docs/api/openapi.yaml`                   | 9 ✓                                                 |
| `menu_categories.status` exists in dev DB (Task 4)                  | ✓                                                   |
| CHECK constraint `menu_categories_status_chk` exists in dev DB      | ✓                                                   |
| Re-running `db:migrate` is a no-op                                  | ✓                                                   |
| Catalog code is lint-clean                                          | ✓                                                   |

## Threat Register Verification

| Threat ID   | Mitigation                                                                                                                                                             |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-04b-02-01 | Every new service calls `requireTenantContext()` + `db.withTenant(...)`; e2e cross-tenant tests (GET /items/:id, PATCH /categories/:id/archive) confirm 404 for sniff. |
| T-04b-02-02 | Archive services set `status='archived'` via `scoped.updateTable(...)`; no DELETE on `menu_categories` or `menu_items` (no privilege grant change needed).             |
| T-04b-02-03 | Class-level `@UseGuards(InternalTokenGuard)` covers the 2 new PATCH endpoints; e2e suite exercises the auth path for them.                                             |
| T-04b-02-04 | Draft-diff hard-caps at 100 entries via `entries.slice(0, 100)` + `truncatedCount` sentinel; uses `menu_items_tenant_status_sort_idx` for the underlying scan.         |
| T-04b-02-05 | `pnpm openapi:check` is green after regen; CI workflow `openapi-drift` enforces the same gate.                                                                         |
| T-04b-02-06 | Out of scope for this plan (auto-save flood is a frontend concern landing in Wave 3+).                                                                                 |

## Task Commits

1. **Task 1** — `4013cb0` — `feat(04b-02): add menu_categories.status column + migration 0042`
2. **Task 2** — `21380e1` — `feat(04b-02): add catalog read + archive application services`
3. **Task 3** — `c86f4be` — `feat(04b-02): add catalog GET + archive PATCH endpoints`
4. **Task 4** — no source commit (database state change only; verified via `psql` query against dev container).

## Next Steps (next plan / Wave 2)

- **04b-03** — Wave 2 backend addendum: `presignPut` adapter method + `POST /photo-upload-url` endpoint + S3/MinIO bucket CORS [BLOCKING].
- **04b-04..09** — Frontend (sidebar, route group layout, CRUD pages, editors, sticky publish bar + countdown toast).

## Self-Check: PASSED

- Files: all 13 created paths exist on disk:
  - `[ -f packages/db/migrations/0042_catalog_phase4b_categories_status.sql ]` ✓
  - `[ -f packages/db/test/integration/menu-categories-status.spec.ts ]` ✓
  - `[ -f apps/api/src/contexts/catalog/application/list-categories.service.ts ]` ✓ (+ 8 sibling services)
  - `[ -f apps/api/test/e2e/catalog-reads.e2e.spec.ts ]` ✓
- Commits: `4013cb0`, `21380e1`, `c86f4be` all in `git log --oneline`.
- Migration: idx 42 in `_journal.json`; `menu_categories.status` column live in dev Postgres.
- OpenAPI: 9 new operationIds in `docs/api/openapi.yaml`; `pnpm openapi:check` exits 0.
- Tests: 402 unit + 12 + 16 e2e + 5 + 29 integration all green.

---

_Phase: 04b-catalog-admin-ui_
_Plan: 02_
_Completed: 2026-05-31_
