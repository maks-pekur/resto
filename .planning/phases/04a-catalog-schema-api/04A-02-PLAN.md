---
phase: 04a-catalog-schema-api
plan: 02
type: execute
wave: 2
depends_on: ['04a-01']
files_modified:
  - packages/db/src/schema/menu.ts
  - packages/db/src/schema/tenants.ts
  - packages/db/migrations/0029_catalog_phase4a_menu_items_extend.sql
  - packages/db/migrations/0030_catalog_phase4a_menu_items_drop_image_key.sql
  - packages/db/migrations/0031_catalog_phase4a_categories_parent.sql
  - packages/db/migrations/0032_catalog_phase4a_tenants_first_publish.sql
  - packages/db/migrations/0033_catalog_phase4a_menu_versions_seq.sql
  - packages/db/migrations/meta/_journal.json
autonomous: true
requirements:
  - CAT-02
  - CAT-10
tags: [catalog, schema, drizzle, migration]
goal: Extend `menu_items` with BJU + photos JSONB + source provenance + needs_review + sourceExternalId, add nullable `parent_id` to `menu_categories`, add `menu_first_published_at` to tenants, create `menu_versions_seq` Postgres sequence, generate + apply Drizzle migrations.

must_haves:
  truths:
    - "`menu_items` table has columns: photos (jsonb not null default `[]`), proteins, fats, carbs (numeric(5,2) nullable), kcal (smallint nullable), nutrition_estimated (boolean not null default false), source (text not null default 'manual'), needs_review (boolean not null default false), source_external_id (text nullable)."
    - '`menu_items.image_s3_key` column is dropped after backfill into photos[0].s3Key.'
    - '`menu_categories` table has nullable `parent_id` column with composite tenant FK back to `menu_categories(id, tenant_id)` ON DELETE RESTRICT.'
    - '`tenants` table has nullable `menu_first_published_at TIMESTAMPTZ` column.'
    - 'Postgres sequence `menu_versions_seq` exists, starts at 1, no cycle.'
    - 'All migrations applied via `pnpm db:migrate` against dev Postgres without error; idempotent (re-run is no-op).'
    - '`pnpm db:audit-fks` exits 0 (composite-FK audit still passes — no regression on existing tenant-scoped children).'
  artifacts:
    - path: 'packages/db/src/schema/menu.ts'
      provides: 'Extended menuItems table + parent_id on menuCategories + MenuItemPhoto interface'
      contains: 'MenuItemPhoto'
    - path: 'packages/db/src/schema/tenants.ts'
      provides: 'menuFirstPublishedAt column'
      contains: 'menuFirstPublishedAt'
    - path: 'packages/db/migrations/0029_catalog_phase4a_menu_items_extend.sql'
      provides: 'ADD COLUMNS + backfill on menu_items'
      contains: 'photos jsonb'
    - path: 'packages/db/migrations/0033_catalog_phase4a_menu_versions_seq.sql'
      provides: 'CREATE SEQUENCE menu_versions_seq'
      contains: 'CREATE SEQUENCE'
  key_links:
    - from: 'packages/db/src/schema/menu.ts'
      to: 'MenuItemPhoto interface'
      via: 'TypeScript export'
      pattern: 'export interface MenuItemPhoto'
    - from: 'packages/db/migrations/0029_*.sql'
      to: 'packages/db/migrations/meta/_journal.json'
      via: 'drizzle-kit migration registration'
      pattern: '0029_catalog_phase4a'
---

<objective>
Extend the existing `menu_items` and `menu_categories` Drizzle schema with all new columns required by CAT-02 (BJU, photos, source provenance) and the iiko alignment (D-4a-01, D-4a-02, D-4a-03). Add `menu_first_published_at` to the `tenants` table to support first-publish detection (D-4a-06, plan 06 wires the detection). Create the `menu_versions_seq` Postgres sequence for the Redis-fallback path in CAT-10 (plan 06 wires `MenuVersionPort.bump()` fallback).

This plan is forward-only — zero paying customers per STATE.md. Migrations A–D + K from `04A-SCHEMA-MAP.md §Migration Strategy` execute here. Migrations E (`menu_stop_list`) and I (`menu_item_slug_aliases`) land in plan 03 because they depend on `menu_items` being final. Migrations F/G/H (renames) land in plan 04 because they depend on no consumer reading the old names yet.

Purpose: Establish the canonical column shape for `menu_items` so the DTO in plan 05 and the services in plan 06 can be built against the final schema. No DROPs of existing tables (additive + 1 column drop + 1 sequence + 1 parent_id self-FK).
Output: 5 migration SQL files committed, schema files extended, `pnpm db:migrate` green, `pnpm db:audit-fks` green.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/04a-catalog-schema-api/04a-CONTEXT.md
@.planning/phases/04a-catalog-schema-api/04A-RESEARCH.md
@.planning/phases/04a-catalog-schema-api/04A-SCHEMA-MAP.md
@.planning/phases/04a-catalog-schema-api/04A-PATTERNS.md
@packages/db/src/schema/menu.ts
@packages/db/src/schema/tenants.ts
@packages/db/src/schema/_columns.ts
@packages/db/migrations/0025_composite_tenant_fk_phase_3b.sql

<interfaces>
Drizzle helper imports already present in `packages/db/src/schema/menu.ts` lines 1–23 (per PATTERNS.md):
- `sql` from `drizzle-orm`
- `boolean, check, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, uniqueIndex, uuid` from `drizzle-orm/pg-core`
- `money, type LocalizedText` from `./_types`
- `compositeTenantFk, pkUuid, tenantIdColumn, tenantParentUniqueIndex, timestampsColumns` from `./_columns`
- `tenants` from `./tenants`

This plan ADDS imports: `numeric, smallint, timestamp` from `drizzle-orm/pg-core`.

`menuCategories` already has `tenantParentUniqueIndex('menu_categories', { id: table.id, tenantId: table.tenantId })` (verified line 56 of current menu.ts) — the unique index `menu_categories_id_tenant_uq` already exists (migration 0025) — `parent_id` composite self-FK can reference it without a new unique index.

`tenants` schema (verified): `pgTable('tenants', { id: pkUuid(), ... })` — add `menuFirstPublishedAt: timestamp('menu_first_published_at', { withTimezone: true, mode: 'date' })` (nullable, no default).

Existing migration pattern (`packages/db/migrations/0025_composite_tenant_fk_phase_3b.sql`):

- Header: `-- RES-XXX Phase 4a: <description>. ADR-0020 I-2: ...`
- Every DDL statement separated by `--> statement-breakpoint`
- Drizzle-kit recognises the breakpoint and chunks statements

`MenuItemPhoto` interface to export from `packages/db/src/schema/menu.ts` (per PATTERNS.md):

```ts
export interface MenuItemPhoto {
  s3Key: string;
  sortOrder: number;
  alt?: string;
  width?: number;
  height?: number;
  isPrimary?: boolean;
}
```

Drizzle JSONB with typed default (PATTERNS.md):

```ts
photos: jsonb('photos').$type<MenuItemPhoto[]>().notNull().default(sql`'[]'::jsonb`),
```

</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Extend Drizzle schema — menu_items + menu_categories + tenants</name>
  <files>packages/db/src/schema/menu.ts, packages/db/src/schema/tenants.ts</files>
  <read_first>
    packages/db/src/schema/menu.ts (lines 1-104 — menuCategories + menuItems current shape)
    packages/db/src/schema/tenants.ts (full file — for menuFirstPublishedAt placement)
    packages/db/src/schema/_columns.ts (compositeTenantFk + tenantParentUniqueIndex signatures)
    .planning/phases/04a-catalog-schema-api/04A-SCHEMA-MAP.md (§Drizzle table: menu_items, menu_categories — exact target shape)
    .planning/phases/04a-catalog-schema-api/04A-PATTERNS.md (§packages/db/src/schema/menu.ts — JSONB default pattern, MenuItemPhoto interface)
  </read_first>
  <action>
    Edit `packages/db/src/schema/menu.ts`:

    1. Extend the top-level imports to add `numeric, smallint, timestamp` from `drizzle-orm/pg-core`.

    2. Add `MenuItemPhoto` interface export near the `menuItems` table declaration per D-4a-02:
       - Required: `s3Key: string`, `sortOrder: number`.
       - Optional: `alt?: string`, `width?: number`, `height?: number`, `isPrimary?: boolean`.

    3. Modify `menuCategories` (lines 30-58 region) — add `parentId: uuid('parent_id')` (nullable) after `brandId` AND add a `compositeTenantFk` self-reference in the `(table) => [...]` block per D-4a-01 hierarchy (SCHEMA-MAP §Drizzle table: menu_categories):
       - name: `menu_categories_parent_fk`
       - child: `{ id: table.parentId, tenantId: table.tenantId }`
       - parent: `{ id: menuCategories.id, tenantId: menuCategories.tenantId }`
       - `.onDelete('restrict')`

       Note: `menu_categories_id_tenant_uq` already exists (migration 0025) so the composite FK can resolve. Use `menuCategories` self-reference (works because Drizzle resolves the constraint expression lazily).

    4. Modify `menuItems` (lines 60-104 region) per D-4a-02 + D-4a-03 + D-4a-01 + CAT-02:
       - REMOVE `imageS3Key: text('image_s3_key')` from columns block.
       - ADD `photos: jsonb('photos').$type<MenuItemPhoto[]>().notNull().default(sql\`'[]'::jsonb\`)` (D-4a-02).
       - ADD `proteins: numeric('proteins', { precision: 5, scale: 2 })` nullable (D-4a-03).
       - ADD `fats: numeric('fats', { precision: 5, scale: 2 })` nullable (D-4a-03).
       - ADD `carbs: numeric('carbs', { precision: 5, scale: 2 })` nullable (D-4a-03).
       - ADD `kcal: smallint('kcal')` nullable (D-4a-03).
       - ADD `nutritionEstimated: boolean('nutrition_estimated').notNull().default(false)` (D-4a-03).
       - ADD `source: text('source').notNull().default('manual')` (D-4a-01).
       - ADD `needsReview: boolean('needs_review').notNull().default(false)` (D-4a-01 — paired with source for AI/imported reviews).
       - ADD `sourceExternalId: text('source_external_id')` nullable (D-4a-01).
       - ADD a `check` constraint: `menu_items_source_chk` with `sql\`${table.source} IN ('manual','ai_generated','imported_iiko','imported_csv')\``.

    Edit `packages/db/src/schema/tenants.ts`:

    5. Add `menuFirstPublishedAt: timestamp('menu_first_published_at', { withTimezone: true, mode: 'date' })` (nullable, no default) to the `tenants` `pgTable` columns block. Place it after the last existing timestamp column (preserve alphabetical / logical ordering of existing fields).

    DO NOT modify `menu_variants`, `menu_modifiers`, `menu_modifier_options`, `menu_item_modifiers` in this plan — those rename in plan 04. DO NOT add `menu_stop_list` or `menu_item_slug_aliases` here — plan 03.

  </action>
  <verify>
    <automated>pnpm --filter @resto/db typecheck 2>&amp;1 | grep -vE "^\\$|^Done|^>" | grep -E "error|Error" || echo "TS OK"</automated>
  </verify>
  <done>
    - `packages/db/src/schema/menu.ts` exports `MenuItemPhoto` interface.
    - `menuItems` has photos, BJU, source, needsReview, sourceExternalId, nutritionEstimated columns; no longer has imageS3Key.
    - `menuCategories` has parentId + self-FK.
    - `tenants` has menuFirstPublishedAt.
    - `pnpm --filter @resto/db typecheck` exits 0.
  </done>
  <acceptance_criteria>
    - `grep -c "export interface MenuItemPhoto" packages/db/src/schema/menu.ts` returns 1.
    - `grep -c "photos: jsonb('photos')" packages/db/src/schema/menu.ts` returns 1.
    - `grep -c "imageS3Key: text" packages/db/src/schema/menu.ts` returns 0 (column removed from schema TS).
    - `grep -c "parentId: uuid('parent_id')" packages/db/src/schema/menu.ts` returns 1.
    - `grep -c "menu_categories_parent_fk" packages/db/src/schema/menu.ts` returns 1.
    - `grep -c "menuFirstPublishedAt" packages/db/src/schema/tenants.ts` returns 1.
    - `pnpm --filter @resto/db typecheck` exits 0.
  </acceptance_criteria>
</task>

<task type="auto" tdd="false">
  <name>Task 2: [BLOCKING] Generate Drizzle migrations + fix backfill SQL by hand</name>
  <files>packages/db/migrations/0029_catalog_phase4a_menu_items_extend.sql, packages/db/migrations/0030_catalog_phase4a_menu_items_drop_image_key.sql, packages/db/migrations/0031_catalog_phase4a_categories_parent.sql, packages/db/migrations/0032_catalog_phase4a_tenants_first_publish.sql, packages/db/migrations/0033_catalog_phase4a_menu_versions_seq.sql, packages/db/migrations/meta/_journal.json</files>
  <read_first>
    packages/db/migrations/0025_composite_tenant_fk_phase_3b.sql (header comment style + `--> statement-breakpoint` cadence)
    .planning/phases/04a-catalog-schema-api/04A-SCHEMA-MAP.md (§Migration Strategy — steps A,B,C,D,J,K — note: A+B+C collapse into 0029+0030 here; K is 0033)
    .planning/phases/04a-catalog-schema-api/04A-PATTERNS.md (§Migration files — Header pattern, RLS migration pattern, Backfill pattern, Sequence creation pattern)
    .planning/phases/04a-catalog-schema-api/04A-RESEARCH.md (§Pitfall 3: column rename pattern; §Pitfall 4: RLS DDL required)
  </read_first>
  <action>
    Generate the migration files using `pnpm --filter @resto/db db:generate` AFTER Task 1 schema edits. Drizzle-kit will emit a single combined SQL file with auto-generated name (e.g. `0029_<auto-name>.sql`). Rename and split it into 5 files manually for clean ordering — Drizzle-kit's combined emission is acceptable input but split for backfill clarity (D-4a-02 photos backfill is hand-written per RESEARCH.md Pitfall 6 reasoning — `image_s3_key` data must move into `photos[0].s3Key` before DROP).

    Concrete file contents:

    **`0029_catalog_phase4a_menu_items_extend.sql`** (Migration A — ADD COLUMNS, keep image_s3_key for now):
    - Header: `-- Phase 4a-02 step A: extend menu_items with photos + BJU + source provenance.`
    - `-- D-4a-01 (source enum), D-4a-02 (photos JSONB), D-4a-03 (structured BJU). CAT-02.`
    - `ALTER TABLE menu_items ADD COLUMN photos jsonb NOT NULL DEFAULT '[]'::jsonb;` --> statement-breakpoint
    - `ALTER TABLE menu_items ADD COLUMN proteins numeric(5,2);` --> statement-breakpoint
    - `ALTER TABLE menu_items ADD COLUMN fats numeric(5,2);` --> statement-breakpoint
    - `ALTER TABLE menu_items ADD COLUMN carbs numeric(5,2);` --> statement-breakpoint
    - `ALTER TABLE menu_items ADD COLUMN kcal smallint;` --> statement-breakpoint
    - `ALTER TABLE menu_items ADD COLUMN nutrition_estimated boolean NOT NULL DEFAULT false;` --> statement-breakpoint
    - `ALTER TABLE menu_items ADD COLUMN source text NOT NULL DEFAULT 'manual';` --> statement-breakpoint
    - `ALTER TABLE menu_items ADD COLUMN needs_review boolean NOT NULL DEFAULT false;` --> statement-breakpoint
    - `ALTER TABLE menu_items ADD COLUMN source_external_id text;` --> statement-breakpoint
    - `ALTER TABLE menu_items ADD CONSTRAINT menu_items_source_chk CHECK (source IN ('manual','ai_generated','imported_iiko','imported_csv'));` --> statement-breakpoint
    - Backfill (D-4a-02): `UPDATE menu_items SET photos = jsonb_build_array(jsonb_build_object('s3Key', image_s3_key, 'sortOrder', 0, 'isPrimary', true)) WHERE image_s3_key IS NOT NULL AND image_s3_key <> '';` --> statement-breakpoint

    **`0030_catalog_phase4a_menu_items_drop_image_key.sql`** (Migration C):
    - Header: `-- Phase 4a-02 step C: drop image_s3_key after backfill into photos[0].`
    - `-- D-4a-02. Forward-only migration; zero paying customers per STATE.md.`
    - `ALTER TABLE menu_items DROP COLUMN image_s3_key;` --> statement-breakpoint

    **`0031_catalog_phase4a_categories_parent.sql`** (Migration D):
    - Header: `-- Phase 4a-02 step D: add parent_id to menu_categories for iiko Группа tree.`
    - `-- D-4a-01 (iiko alignment). ADR-0020 I-2: composite tenant FK.`
    - `ALTER TABLE menu_categories ADD COLUMN parent_id uuid;` --> statement-breakpoint
    - `ALTER TABLE menu_categories ADD CONSTRAINT menu_categories_parent_fk FOREIGN KEY (parent_id, tenant_id) REFERENCES menu_categories(id, tenant_id) ON DELETE RESTRICT;` --> statement-breakpoint

    **`0032_catalog_phase4a_tenants_first_publish.sql`** (Migration J):
    - Header: `-- Phase 4a-02 step J: add menu_first_published_at to tenants for first-publish detection.`
    - `-- D-4a-06 (distinct first-publish vs republish event types). Plan 06 wires the detection.`
    - `ALTER TABLE tenants ADD COLUMN menu_first_published_at timestamptz;` --> statement-breakpoint

    **`0033_catalog_phase4a_menu_versions_seq.sql`** (Migration K):
    - Header: `-- Phase 4a-02 step K: create menu_versions_seq for Redis-fallback path.`
    - `-- D-4a-07 + CAT-10. MenuVersionPort.bump() falls back to nextval('menu_versions_seq') when Redis is unavailable.`
    - `CREATE SEQUENCE IF NOT EXISTS menu_versions_seq START WITH 1 INCREMENT BY 1 NO CYCLE;` --> statement-breakpoint

    Update `packages/db/migrations/meta/_journal.json` to register all 5 new migrations with the next sequential idx and matching tag. Drizzle-kit's `db:generate` will produce a partial journal entry — extend it manually to cover all 5 files in order.

    Pitfall awareness:
    - Drizzle-kit `db:generate` may emit a single mega-migration combining all schema deltas. After running `db:generate`, split the resulting SQL into the 5 files above by table/concern; delete the auto-generated combined file so the journal reflects the split.
    - Per RESEARCH.md Pitfall 3: column renames are not handled by drizzle-kit, but this plan has NO column renames (only ADD + DROP + CREATE SEQUENCE) — those land in plan 04. So this plan is safe to mostly accept drizzle-kit output.

  </action>
  <verify>
    <automated>test -f packages/db/migrations/0029_catalog_phase4a_menu_items_extend.sql &amp;&amp; test -f packages/db/migrations/0030_catalog_phase4a_menu_items_drop_image_key.sql &amp;&amp; test -f packages/db/migrations/0031_catalog_phase4a_categories_parent.sql &amp;&amp; test -f packages/db/migrations/0032_catalog_phase4a_tenants_first_publish.sql &amp;&amp; test -f packages/db/migrations/0033_catalog_phase4a_menu_versions_seq.sql &amp;&amp; grep -c "0029_catalog_phase4a" packages/db/migrations/meta/_journal.json</automated>
  </verify>
  <done>
    - All 5 migration files exist with the exact filenames above.
    - Header comments reference D-4a-XX decisions + CAT requirement IDs.
    - `--> statement-breakpoint` separator is present between every DDL statement.
    - `_journal.json` has 5 new entries in monotonic idx order.
  </done>
  <acceptance_criteria>
    - `ls packages/db/migrations/0029_catalog_phase4a*.sql 0030_catalog_phase4a*.sql 0031_catalog_phase4a*.sql 0032_catalog_phase4a*.sql 0033_catalog_phase4a*.sql 2>/dev/null | wc -l` returns 5.
    - `grep -v '^--' packages/db/migrations/0029_catalog_phase4a_menu_items_extend.sql | grep -c "ALTER TABLE menu_items ADD COLUMN"` returns 9 (photos, proteins, fats, carbs, kcal, nutrition_estimated, source, needs_review, source_external_id).
    - `grep -v '^--' packages/db/migrations/0029_catalog_phase4a_menu_items_extend.sql | grep -c "menu_items_source_chk"` returns 1.
    - `grep -v '^--' packages/db/migrations/0030_catalog_phase4a_menu_items_drop_image_key.sql | grep -c "DROP COLUMN image_s3_key"` returns 1.
    - `grep -v '^--' packages/db/migrations/0031_catalog_phase4a_categories_parent.sql | grep -c "menu_categories_parent_fk"` returns 1.
    - `grep -v '^--' packages/db/migrations/0032_catalog_phase4a_tenants_first_publish.sql | grep -c "menu_first_published_at"` returns 1.
    - `grep -v '^--' packages/db/migrations/0033_catalog_phase4a_menu_versions_seq.sql | grep -c "CREATE SEQUENCE"` returns 1.
    - `grep -c "0029_catalog_phase4a" packages/db/migrations/meta/_journal.json` returns ≥ 1 (journal updated).
  </acceptance_criteria>
</task>

<task type="auto" tdd="false">
  <name>Task 3: [BLOCKING] Apply migrations to dev DB + run composite-FK audit</name>
  <files>(no file writes — verification only)</files>
  <read_first>
    packages/db/CLAUDE.md (§Rules — db:migrate requires DATABASE_ADMIN_URL in non-dev)
    packages/db/src/cli/audit-fks.ts (audit logic — confirms tenant-scoped tables have composite FK)
  </read_first>
  <action>
    Run migrations against the dev Postgres (started in plan 01 task 3):

    1. `pnpm --filter @resto/db db:migrate` — apply all 5 new migrations 0029–0033.
    2. Confirm idempotency: re-run `pnpm --filter @resto/db db:migrate` and verify drizzle-kit reports zero pending migrations (the meta journal records what's applied).
    3. Smoke-check the schema landed:
       - `psql $DATABASE_URL -c "SELECT column_name FROM information_schema.columns WHERE table_name='menu_items' AND column_name IN ('photos','proteins','fats','carbs','kcal','source','needs_review','source_external_id','nutrition_estimated');"` should list all 9 column names.
       - `psql $DATABASE_URL -c "SELECT column_name FROM information_schema.columns WHERE table_name='menu_items' AND column_name='image_s3_key';"` should return zero rows.
       - `psql $DATABASE_URL -c "SELECT parent_id FROM menu_categories LIMIT 1;"` should succeed (column exists).
       - `psql $DATABASE_URL -c "SELECT menu_first_published_at FROM tenants LIMIT 1;"` should succeed.
       - `psql $DATABASE_URL -c "SELECT nextval('menu_versions_seq');"` should return 1 on first call (validates sequence exists).
    4. Run `pnpm --filter @resto/db db:audit-fks` — must exit 0 with no NEW composite-FK violations (existing tables unaffected; `menu_categories.parent_id` correctly references `menu_categories(id, tenant_id)` so no audit failure).

    If `pnpm db:audit-fks` reports a violation on the new `menu_categories.parent_id`, that means the FK was emitted incorrectly — re-read SCHEMA-MAP §Drizzle table: menu_categories and confirm the migration writes `FOREIGN KEY (parent_id, tenant_id) REFERENCES menu_categories(id, tenant_id)`.

    On any migration failure: forward-only is acceptable (zero customers), so reset is allowed: `pnpm --filter @resto/db db:reset` (requires `RESTO_CONFIRM_RESET=yes-wipe-my-dev-db NODE_ENV=development` per db CLAUDE.md), then re-run `db:migrate`.

  </action>
  <verify>
    <automated>pnpm --filter @resto/db db:migrate &amp;&amp; pnpm --filter @resto/db db:audit-fks</automated>
  </verify>
  <done>
    - All 5 migrations applied without error.
    - Re-running `db:migrate` reports zero pending.
    - All schema smoke-checks return expected values.
    - `pnpm db:audit-fks` exits 0.
  </done>
  <acceptance_criteria>
    - `pnpm --filter @resto/db db:migrate` exits 0.
    - `pnpm --filter @resto/db db:audit-fks` exits 0.
    - The `menu_versions_seq` sequence is callable (returns 1 on first `nextval`).
    - `menu_items.image_s3_key` column does not exist in live DB.
    - `menu_items.photos`, `menu_items.source`, `menu_categories.parent_id`, `tenants.menu_first_published_at` columns all exist.
  </acceptance_criteria>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary               | Description                                                                    |
| ---------------------- | ------------------------------------------------------------------------------ |
| application → Postgres | RLS double-enforced on existing tables; new columns inherit RLS from the table |
| migration → live DB    | DDL runs as `resto_admin`; `resto_app` runtime role unchanged                  |

## STRIDE Threat Register

| Threat ID   | Category       | Component                                       | Disposition | Mitigation Plan                                                                                                                             |
| ----------- | -------------- | ----------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| T-04a-02-01 | Tampering      | menu_items.photos JSONB injection               | mitigate    | DTO-level Zod refine in plan 05 rejects URL-shaped values (s3Key MUST NOT start with `http:`); per-photo `s3Key.max(1024)` cap to bound DoS |
| T-04a-02-02 | Tampering      | menu_categories.parent_id cross-tenant chaining | mitigate    | Composite FK `(parent_id, tenant_id)` makes cross-tenant parent reference structurally impossible (ADR-0020 I-2)                            |
| T-04a-02-03 | DoS            | menu_items.source CHECK constraint bypass       | mitigate    | DB-level CHECK (`menu_items_source_chk`) rejects values outside the 4-element enum even if app layer is bypassed                            |
| T-04a-02-04 | Tampering      | Migration race during deploy                    | accept      | Forward-only migration; zero paying customers per STATE.md; `pnpm db:migrate` is k8s pre-deploy Job per stack note                          |
| T-04a-02-05 | InfoDisclosure | BJU overflow leak via decimal precision         | mitigate    | `numeric(5,2)` (0.00–999.99) caps stored values; Zod schema in plan 05 enforces same bound                                                  |

</threat_model>

<verification>
- `pnpm --filter @resto/db typecheck` exits 0.
- `pnpm --filter @resto/db db:migrate` applies 5 new migrations cleanly.
- Re-running `db:migrate` reports zero pending.
- `pnpm --filter @resto/db db:audit-fks` exits 0.
- All schema smoke-checks from Task 3 return expected values.
- `grep -v '^--' packages/db/migrations/0029_catalog_phase4a_menu_items_extend.sql | grep -c "ADD COLUMN"` returns 9.
- `grep -c "0029_catalog_phase4a" packages/db/migrations/meta/_journal.json` returns ≥ 1.
</verification>

<success_criteria>

- CAT-02 schema columns (БЖУ, photos, source provenance) present on `menu_items`.
- CAT-10 sequence `menu_versions_seq` created and callable.
- D-4a-01 source enum + D-4a-02 photos JSONB + D-4a-03 structured BJU + D-4a-06 first-publish detection column all landed.
- Migrations are committed to git alongside schema TS changes.
  </success_criteria>

<output>
Create `.planning/phases/04a-catalog-schema-api/04A-02-SUMMARY.md` when done summarizing:
- The 5 migration filenames + their numbered idx in `_journal.json`.
- The exact column types as confirmed via `\d menu_items` in psql.
- `nextval('menu_versions_seq')` first call result (should be 1).
- `db:audit-fks` output line confirming no violations.
</output>
