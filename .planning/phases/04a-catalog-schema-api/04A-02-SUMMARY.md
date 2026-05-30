---
phase: 04a-catalog-schema-api
plan: 02
subsystem: catalog
tags: [catalog, schema, drizzle, migration]
requires:
  - '04A-01 (transliteration installed, dev stack healthy)'
provides:
  - '`menu_items` extended with photos JSONB + БЖУ (proteins/fats/carbs/kcal/nutrition_estimated) + source provenance (source/needs_review/source_external_id)'
  - '`menu_items.image_s3_key` dropped after no-op backfill (table was empty)'
  - '`menu_categories.parent_id` nullable + composite tenant self-FK ON DELETE RESTRICT'
  - '`tenants.menu_first_published_at` nullable timestamptz column'
  - 'Postgres sequence `menu_versions_seq` (start 1, no cycle) for CAT-10 Redis-fallback'
  - 'unblocks plans 03 (menu_stop_list, menu_item_slug_aliases) and 04 (renames) and 05 (DTO) and 06 (services)'
affects:
  - packages/db/src/schema/menu.ts
  - packages/db/src/schema/tenants.ts
  - packages/db/migrations/0029_catalog_phase4a_menu_items_extend.sql
  - packages/db/migrations/0030_catalog_phase4a_menu_items_drop_image_key.sql
  - packages/db/migrations/0031_catalog_phase4a_categories_parent.sql
  - packages/db/migrations/0032_catalog_phase4a_tenants_first_publish.sql
  - packages/db/migrations/0033_catalog_phase4a_menu_versions_seq.sql
  - packages/db/migrations/meta/_journal.json
  - apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts
tech_stack:
  added: []
  patterns:
    - 'Drizzle JSONB column with typed default via `.$type<MenuItemPhoto[]>().notNull().default(sql\`''[]''::jsonb\`)`'
    - 'Composite self-referencing FK using `foreignKey({ columns: [parentId, tenantId], foreignColumns: [id, tenantId] })` (works against the table being defined; the existing `menu_categories_id_tenant_uq` from migration 0025 satisfies the parent unique constraint)'
    - 'Hand-written SQL migrations (not drizzle-kit generated) with `--> statement-breakpoint` separators — matches the existing 0025 pattern'
key_files:
  created:
    - packages/db/migrations/0029_catalog_phase4a_menu_items_extend.sql
    - packages/db/migrations/0030_catalog_phase4a_menu_items_drop_image_key.sql
    - packages/db/migrations/0031_catalog_phase4a_categories_parent.sql
    - packages/db/migrations/0032_catalog_phase4a_tenants_first_publish.sql
    - packages/db/migrations/0033_catalog_phase4a_menu_versions_seq.sql
  modified:
    - packages/db/src/schema/menu.ts
    - packages/db/src/schema/tenants.ts
    - packages/db/migrations/meta/_journal.json
    - apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts
decisions:
  - 'Migration 0029 collapses Migration A (ADD COLUMN) + Migration B (backfill) from SCHEMA-MAP into one SQL file because the backfill is a single UPDATE and the file stays under 30 lines — splitting buys nothing.'
  - "Backfill is intentionally idempotent (UPDATE WHERE image_s3_key IS NOT NULL AND image_s3_key <> ''): on an empty `menu_items` table (dev DB had zero rows) it is a no-op; if a populated DB ever runs this it still produces correct photos[0] entries."
  - 'Used direct `foreignKey({...})` (not the `compositeTenantFk` helper) for the menu_categories self-FK — the helper takes `parent: { id, tenantId }` as `PgColumn` references, which fails for a self-referencing constraint declared inside the same `pgTable` callback. The direct form references `table.id`/`table.tenantId` which Drizzle resolves at constraint-emit time.'
  - 'Added the unregistered legacy migration `0028_grant_delete_inbox_processed` to `_journal.json` so the full migrate-from-clean flow used in dev `pnpm db:reset && pnpm db:migrate` applies everything including the pre-existing GRANT (the file shipped without a journal entry — pre-existing tech debt). The migration is guarded with `DO $$ IF EXISTS … END $$;` so it is safe to run before or after `resto_app` role provisioning.'
metrics:
  duration: '25m'
  completed: '2026-05-30T22:30Z'
requirements: [CAT-02, CAT-10]
---

# Phase 04a Plan 02: Catalog Schema Extension Summary

Extended `menu_items` with the iiko-aligned shape (photos JSONB array, БЖУ columns, provenance fields), added `parent_id` for hierarchical categories, registered `tenants.menu_first_published_at` for first-publish detection, and created `menu_versions_seq` for the Redis-fallback menu-version path — all via five hand-written forward-only migrations applied cleanly to dev Postgres on port 5433.

## What Was Built

### Drizzle schema changes (`packages/db/src/schema/`)

- `menu.ts` — extended imports with `numeric, smallint`; declared `MenuItemPhoto` interface (the JSONB row shape: `s3Key`, `sortOrder`, optional `alt/width/height/isPrimary`); extended `menuItems` with `photos jsonb $type<MenuItemPhoto[]>` (default `'[]'::jsonb`), `proteins/fats/carbs numeric(5,2)`, `kcal smallint`, `nutritionEstimated boolean default false`, `source text default 'manual'`, `needsReview boolean default false`, `sourceExternalId text`, plus a CHECK constraint `menu_items_source_chk` restricting `source` to `('manual', 'ai_generated', 'imported_iiko', 'imported_csv')`. Removed `imageS3Key: text('image_s3_key')`.
- `menu.ts` — extended `menuCategories` with nullable `parentId` and a self-referencing composite FK `menu_categories_parent_fk (parent_id, tenant_id) → menu_categories(id, tenant_id) ON DELETE RESTRICT`. Existing `menu_categories_id_tenant_uq` from migration 0025 satisfies the unique-target requirement.
- `tenants.ts` — added nullable `menuFirstPublishedAt timestamptz`.

### Hand-written SQL migrations (`packages/db/migrations/`)

| Migration                                            | Purpose                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| `0029_catalog_phase4a_menu_items_extend.sql`         | ADD 9 columns + CHECK + backfill `photos` from `image_s3_key`      |
| `0030_catalog_phase4a_menu_items_drop_image_key.sql` | DROP `image_s3_key` after backfill                                 |
| `0031_catalog_phase4a_categories_parent.sql`         | ADD `parent_id` + composite tenant self-FK                         |
| `0032_catalog_phase4a_tenants_first_publish.sql`     | ADD `menu_first_published_at`                                      |
| `0033_catalog_phase4a_menu_versions_seq.sql`         | `CREATE SEQUENCE IF NOT EXISTS menu_versions_seq START 1 NO CYCLE` |

Journal updated (`meta/_journal.json`): registered idx 28 (the legacy `0028_grant_delete_inbox_processed` that had been committed without a journal entry — see Deviations) AND the five new entries idx 29–33, all sequential and monotonic.

### API repository compatibility shim (`apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts`)

The plan removes `imageS3Key` from the Drizzle schema TS, but `apps/api`'s `CatalogDrizzleRepository` still references it at lines 121, 213, 267, 281. Without a shim the pre-commit hook (`nx affected -t typecheck`) blocks every commit. Plan 06 will replace this with the full photos-array projection. The temporary shim:

- READ path (`loadPublishedMenu`, `findPublishedItem`): replaced `r.imageS3Key` with `r.photos[0]?.s3Key ?? null` so `signImage(...)` returns the presigned URL for the primary photo when present.
- WRITE path (`upsertItem`): converted the legacy input field `input.imageS3Key` into a single-element `photos` array `[{ s3Key, sortOrder: 0, isPrimary: true }]` before writing (`{ photos }` replaces `{ imageS3Key }` in both INSERT and ON CONFLICT UPDATE blocks).

The port-layer `UpsertItemRow.imageS3Key` field is untouched — plans 05 and 06 widen the DTO and refactor the port to the full photos array.

### CHECK constraint

The `menu_items_source_chk` constraint at DB level rejects unknown `source` values (T-04a-02-03 mitigation). Combined with the Zod enum in plan 05, this is a defence-in-depth: even if the application layer is bypassed, the DB refuses an out-of-enum value.

## Commits

| Task | Description                                                  | Commit    | Files                                                                                                                                                  |
| ---- | ------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Extend Drizzle schema + API repo shim                        | `22613a5` | `packages/db/src/schema/menu.ts`, `packages/db/src/schema/tenants.ts`, `apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts`    |
| 2    | Add five Phase 4a migrations + journal update                | `9ac377b` | `packages/db/migrations/0029…0033_catalog_phase4a_*.sql`, `packages/db/migrations/meta/_journal.json`                                                  |
| 3    | Apply migrations + audit (verification only, no file writes) | —         | `pnpm db:reset && pnpm db:migrate && pnpm db:audit-fks` against dev Postgres (port 5433); verified columns/sequence/FK shape; idempotency re-confirmed |

## Verification Artifacts — Task 3

All checks below were run inside the worktree against `postgres://resto:***@localhost:5433/resto`.

### `pnpm db:migrate` first run

```
{"level":30,"msg":"Applying migrations…","url":"postgres://resto:***@localhost:5433/resto"}
NOTICE: extension "pgcrypto" already exists, skipping
{"level":30,"msg":"Migrations applied."}
```

Exit 0. (Required prep: drop the `drizzle` internal schema in addition to `public` — see Deviations.)

### `pnpm db:migrate` second run (idempotency)

```
NOTICE: relation "__drizzle_migrations" already exists, skipping
{"level":30,"msg":"Migrations applied."}
```

Exit 0. Zero pending migrations on re-run.

### `\d menu_items` smoke check (only new columns shown)

```
photos              | jsonb                    | not null | '[]'::jsonb
proteins            | numeric(5,2)             |          |
fats                | numeric(5,2)             |          |
carbs               | numeric(5,2)             |          |
kcal                | smallint                 |          |
nutrition_estimated | boolean                  | not null | false
source              | text                     | not null | 'manual'::text
needs_review        | boolean                  | not null | false
source_external_id  | text                     |          |
```

`image_s3_key` is absent: `SELECT column_name FROM information_schema.columns WHERE table_name='menu_items' AND column_name='image_s3_key';` returns 0 rows.

CHECK constraint present: `"menu_items_source_chk" CHECK (source = ANY (ARRAY['manual'::text, 'ai_generated'::text, 'imported_iiko'::text, 'imported_csv'::text]))`.

### `\d menu_categories` smoke check (new FK)

```
parent_id | uuid |  |  |
"menu_categories_parent_fk" FOREIGN KEY (parent_id, tenant_id)
  REFERENCES menu_categories(id, tenant_id) ON DELETE RESTRICT
```

### `tenants.menu_first_published_at` smoke check

```
       column_name       |        data_type
-------------------------+--------------------------
 menu_first_published_at | timestamp with time zone
(1 row)
```

### `menu_versions_seq` first call

```
SELECT nextval('menu_versions_seq');
 nextval
---------
       1
(1 row)
```

### `pnpm db:audit-fks`

```
{"level":30,"msg":"db:audit-fks: no I-2 violations."}
exit=0
```

ADR-0020 I-2 compliance preserved: the new `menu_categories.parent_id` references `(id, tenant_id)` via composite FK and the audit reports zero violations across the whole schema.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Pre-commit `nx affected -t typecheck` failed on Task 1 commit attempt**

- **Found during:** Task 1 commit attempt.
- **Issue:** Removing `imageS3Key: text('image_s3_key')` from `menuItems` immediately broke three call sites in `apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts` (`r.imageS3Key` reads at lines 121 + 213; `imageS3Key` inserts at lines 267 + 281). The full repository refactor lives in plan 06, but plan 02's commit cannot land without `api:typecheck` passing.
- **Fix:** Applied minimal forward-compatible shim in the API repository — reads project `photos[0]?.s3Key ?? null` into `signImage(...)`; writes convert `input.imageS3Key` to a single-element `photos` array. The port-layer `UpsertItemRow.imageS3Key` is untouched (DTOs and ports refactor in plans 05/06).
- **Files modified:** `apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts` (3 hunks, ~10 lines net).
- **Commit:** `22613a5` (bundled with the schema commit, since the shim is required to make the schema change compile).

**2. [Rule 3 — Blocking] `pnpm db:migrate` failed because drizzle's internal `drizzle.__drizzle_migrations` table survived `db:reset`**

- **Found during:** Task 3 first migrate attempt after `db:reset`.
- **Issue:** `db:reset` drops only the `public` schema; drizzle stores its migration tracker in a separate `drizzle` schema (`drizzle.__drizzle_migrations`). After reset, the tracker still recorded migrations 0000–0027 as applied (from the prior pre-existing state where someone had presumably manually loaded the schema). Drizzle therefore skipped to 0029 and tried `ALTER TABLE menu_items` on a `public` schema that had just been wiped.
- **Fix:** Manually dropped the `drizzle` schema via `docker exec resto-postgres psql -U resto -d resto -c "DROP SCHEMA IF EXISTS drizzle CASCADE;"` before re-running `pnpm db:migrate`. The second migrate run then applied 0000–0033 cleanly.
- **Files modified:** None.
- **Commit:** None (verification step, no code change). Documented here so plan 03/04 executors know to drop both schemas during a reset.

**3. [Rule 2 — Missing critical functionality] Pre-existing `0028_grant_delete_inbox_processed.sql` had no `_journal.json` entry**

- **Found during:** Task 2 journal update.
- **Issue:** Migration file `0028_grant_delete_inbox_processed.sql` was committed in `29b302d` (`feat(db): grant narrow DELETE on inbox_processed for retention sweep`) without a corresponding entry in `_journal.json`. Drizzle's `readMigrationFiles` (verified by reading `node_modules/.pnpm/drizzle-orm@0.45.2/.../migrator.js`) walks only journal entries — so 0028 would never apply via `pnpm db:migrate`. After a `db:reset`, the GRANT would be silently missing.
- **Fix:** Added the missing `idx: 28, tag: "0028_grant_delete_inbox_processed"` entry to the journal alongside my five 0029–0033 entries. The migration's body is `DO $$ IF EXISTS pg_roles WHERE rolname='resto_app' THEN GRANT … END $$;` — safe under any role-provisioning order.
- **Files modified:** `packages/db/migrations/meta/_journal.json`.
- **Commit:** `9ac377b` (same commit as the 5 new migrations; one-line journal addition for 0028 is bundled with the 5 new entries).

### Architectural Changes

None.

### Tasks Not in Original Plan

None.

## Authentication Gates

None.

## Known Stubs

**1. `apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts` — `imageUrl` projection from `photos[0]?.s3Key`**

This is an intentional plan-spanning shim. The full photos-array projection is wired in plan 06 (`CatalogDrizzleRepository` refactor in PATTERNS.md §catalog-drizzle.repository.ts). Until plan 06 lands, the legacy `imageUrl` field on `PublishedMenuItem` continues to carry the presigned URL of the first photo, preserving qr-menu / e2e backward compatibility. The schema's `photos: jsonb` column is correctly populated by `upsertItem` writes.

**2. `apps/api/src/contexts/catalog/application/upsert-item.service.ts` — still consumes `input.imageS3Key` via the port-layer `UpsertItemRow`**

The DTO (`UpsertItemInputSchema`) and port (`UpsertItemRow`) both still carry `imageS3Key: string | null` in plan 02 — plan 05 widens the DTO to accept `photos: MenuItemPhoto[]` and plan 06 mirrors the port. Until then, the repository shim translates the single legacy key into a single-photo array internally.

## Threat Flags

None.

## Self-Check: PASSED

- `packages/db/src/schema/menu.ts` `export interface MenuItemPhoto`: **FOUND** (line 71, verified via `grep -c`).
- `packages/db/src/schema/menu.ts` `photos: jsonb('photos')`: **FOUND** (1 occurrence).
- `packages/db/src/schema/menu.ts` `imageS3Key: text`: **NOT FOUND** (0 occurrences, only a comment mentioning the legacy column name).
- `packages/db/src/schema/menu.ts` `parentId: uuid('parent_id')`: **FOUND** (1 occurrence).
- `packages/db/src/schema/menu.ts` `menu_categories_parent_fk`: **FOUND** (1 occurrence).
- `packages/db/src/schema/tenants.ts` `menuFirstPublishedAt`: **FOUND** (1 occurrence).
- 5 migration files exist (`0029…0033_catalog_phase4a_*.sql`): **FOUND** (`ls | wc -l` = 5).
- 0029 ADD COLUMN count = 9: **PASSED**.
- 0029 `menu_items_source_chk` present: **PASSED**.
- 0030 `DROP COLUMN image_s3_key` present: **PASSED**.
- 0031 `menu_categories_parent_fk` present: **PASSED**.
- 0032 `menu_first_published_at` present: **PASSED**.
- 0033 `CREATE SEQUENCE` present: **PASSED**.
- `meta/_journal.json` includes `0029_catalog_phase4a` entry: **PASSED** (and 0028–0033 all present, sequential idx).
- Commits `22613a5` + `9ac377b` exist on `worktree-agent-a18b7d1d3f629af55`: **PASSED** (`git log --oneline -3` confirms).
- `pnpm --filter @resto/db typecheck` exits 0: **PASSED** (also `api:typecheck`, `events:typecheck`, `domain:typecheck` all green via Nx).
- `pnpm db:migrate` exits 0, idempotent re-run also exits 0: **PASSED**.
- `pnpm db:audit-fks` exits 0: **PASSED** (no I-2 violations).
- `SELECT nextval('menu_versions_seq')` returns 1 on first call: **PASSED**.
