---
phase: 04a-catalog-schema-api
plan: 04
type: execute
wave: 4
depends_on: ['04A-02', '04A-03']
files_modified:
  - packages/db/src/schema/menu.ts
  - packages/db/src/schema/index.ts
  - packages/db/migrations/0037_catalog_phase4a_menu_variants_rename.sql
  - packages/db/migrations/0038_catalog_phase4a_menu_modifiers_rename.sql
  - packages/db/migrations/0039_catalog_phase4a_modifier_options_extend.sql
  - packages/db/migrations/meta/_journal.json
autonomous: true
requirements:
  - CAT-04
  - CAT-05
tags: [catalog, schema, rename, drizzle, migration]
goal: Rename `menu_variants` → `menu_item_sizes` (with price_delta → absolute price semantic change), rename `menu_modifiers` → `menu_modifier_groups` (with cascading FK column renames), rename `menu_item_modifiers` junction → `menu_item_modifier_groups`, and extend `menu_modifier_options` with iiko `defaultAmount` + `freeAmount` columns.

must_haves:
  truths:
    - 'Table `menu_variants` renamed to `menu_item_sizes`; column `price_delta` renamed to `price` (now absolute price per size, not delta). All existing rows backfilled with `price = menu_items.base_price + variant.price_delta` (which equals `base_price` since seed data has priceDelta=0 per RESEARCH.md A1).'
    - 'Table `menu_modifiers` renamed to `menu_modifier_groups`.'
    - 'Column `menu_modifier_options.modifier_id` renamed to `modifier_group_id` (and FK constraint updated to point at the renamed group table).'
    - 'Table `menu_item_modifiers` renamed to `menu_item_modifier_groups`; column `modifier_id` renamed to `modifier_group_id`; FK constraints updated.'
    - '`menu_modifier_options` has new columns: `default_amount SMALLINT NOT NULL DEFAULT 0`, `free_amount SMALLINT NOT NULL DEFAULT 0` (D-4a iiko alignment per SCHEMA-MAP §Entity Mapping Table).'
    - 'All existing composite-FK constraints from migration 0025 are re-created with their new constraint names so `pnpm db:audit-fks` passes.'
    - 'Drizzle schema TS file uses new names; `pnpm --filter @resto/db typecheck` is green.'
  artifacts:
    - path: 'packages/db/src/schema/menu.ts'
      provides: 'menuItemSizes, menuModifierGroups, menuItemModifierGroups, menuModifierOptions (extended)'
      contains: 'menuItemSizes'
    - path: 'packages/db/migrations/0037_catalog_phase4a_menu_variants_rename.sql'
      provides: 'RENAME variants → item_sizes + price_delta → price semantics'
      contains: 'ALTER TABLE menu_variants RENAME TO menu_item_sizes'
    - path: 'packages/db/migrations/0038_catalog_phase4a_menu_modifiers_rename.sql'
      provides: 'RENAME modifiers → modifier_groups + cascading FK column rename'
      contains: 'ALTER TABLE menu_modifiers RENAME TO menu_modifier_groups'
    - path: 'packages/db/migrations/0039_catalog_phase4a_modifier_options_extend.sql'
      provides: 'ADD default_amount + free_amount on modifier_options'
      contains: 'default_amount'
  key_links:
    - from: 'menu_modifier_options.modifier_group_id'
      to: 'menu_modifier_groups(id, tenant_id)'
      via: 'composite FK menu_modifier_options_group_fk'
      pattern: "REFERENCES menu_modifier_groups\\(id, tenant_id\\)"
    - from: 'menu_item_modifier_groups.modifier_group_id'
      to: 'menu_modifier_groups(id, tenant_id)'
      via: 'composite FK menu_item_modifier_groups_group_fk'
      pattern: 'menu_item_modifier_groups_group_fk'
---

<objective>
Execute the three rename migrations (F, G, H from SCHEMA-MAP §Migration Strategy) that finalize the iiko nomenclature alignment:

- **F:** `menu_variants` → `menu_item_sizes` with `price_delta` semantic change to absolute `price` (CAT-05 — variants/sizes schema; D-4a per iiko `NSizeModel`).
- **G:** `menu_modifiers` → `menu_modifier_groups` + FK column rename in `menu_modifier_options.modifier_id → modifier_group_id` + junction `menu_item_modifiers` → `menu_item_modifier_groups` (CAT-04 — modifier groups schema; D-4a per iiko `Группа модификаторов`).
- **H:** Add `default_amount` + `free_amount` SMALLINT columns on `menu_modifier_options` (iiko `NPModifierModel.default_amount` + `free_of_charge_amount`).

RESEARCH.md Pitfall 3 warns: Drizzle-kit `db:generate` treats column renames as DROP + ADD (data loss). All renames MUST be hand-written SQL.

This is the highest-risk plan in 4a — RESEARCH.md `Migration F` flagged the price-semantic change as the riskiest step. Pitfall 6 warns: any consumer reading `variant.priceDelta` and adding to `item.basePrice` will double-count after rename. Plan 06 refactors the repository to read absolute `price`; this plan only does the DDL + data backfill. No app-layer code is consuming the new names yet (repository refactor happens in plan 06), so the rename is structurally safe.

Purpose: Land the entity renames so plan 05 can define DTOs against the new names and plan 06 can refactor the repository against the final schema.
Output: 3 migration files + extended schema TS + `db:audit-fks` green.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/04a-catalog-schema-api/04A-RESEARCH.md
@.planning/phases/04a-catalog-schema-api/04A-SCHEMA-MAP.md
@.planning/phases/04a-catalog-schema-api/04A-PATTERNS.md
@packages/db/src/schema/menu.ts
@packages/db/migrations/0025_composite_tenant_fk_phase_3b.sql

<interfaces>
**Existing `menu_variants` constraint names (verified from `packages/db/src/schema/menu.ts` lines 113-141 + migration 0025):**
- `menu_variants_tenant_fk` (FK to tenants)
- `menu_variants_item_fk` (composite FK to menu_items)
- `menu_variants_tenant_item_idx` (regular index)
- `menu_variants_one_default_per_item_uq` (partial unique on isDefault=true)
- `menu_variants_id_tenant_uq` (from migration 0025 — unique (id, tenant_id))

**Existing `menu_modifiers` constraint names:**

- `menu_modifiers_tenant_fk`
- `menu_modifiers_selectable_range_chk`
- `menu_modifiers_id_tenant_uq` (from migration 0025)

**Existing `menu_modifier_options` constraint names:**

- `menu_modifier_options_tenant_fk`
- `menu_modifier_options_modifier_fk` (composite — will rename to `..._group_fk`)
- `menu_modifier_options_tenant_modifier_idx` (will rename to `...tenant_group_idx`)

**Existing `menu_item_modifiers` constraint names:**

- `menu_item_modifiers_pk`
- `menu_item_modifiers_tenant_fk`
- `menu_item_modifiers_item_fk`
- `menu_item_modifiers_modifier_fk` (composite — will rename)
- `menu_item_modifiers_tenant_item_idx`

Renaming a constraint in Postgres requires `ALTER TABLE <table> RENAME CONSTRAINT <old> TO <new>`. Renaming a table automatically follows the renamed-constraint convention but indexes/sequences attached to the old name remain at their old name unless explicitly `ALTER INDEX ... RENAME`.

**Backfill (Migration F per RESEARCH.md A1):** All current `menu_variants.price_delta` values are 0 in dev seed. The backfill `price = base_price + price_delta` simplifies to `price = base_price`. Use a SQL UPDATE with subquery join.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Refactor Drizzle schema — rename tables + columns + add iiko option fields</name>
  <files>packages/db/src/schema/menu.ts, packages/db/src/schema/index.ts</files>
  <read_first>
    packages/db/src/schema/menu.ts (current shape after plans 02+03 — menuVariants, menuModifiers, menuModifierOptions, menuItemModifiers definitions to refactor)
    .planning/phases/04a-catalog-schema-api/04A-SCHEMA-MAP.md (§Drizzle table: menu_item_sizes, §Drizzle table: menu_modifier_groups, §Drizzle table: menu_modifier_options extended, §Drizzle table: menu_item_modifier_groups)
    .planning/phases/04a-catalog-schema-api/04A-PATTERNS.md (§packages/db/src/schema/menu.ts — composite FK pattern)
  </read_first>
  <action>
    Refactor `packages/db/src/schema/menu.ts`:

    1. **Rename `menuVariants` → `menuItemSizes`** (line 113 region):
       - `export const menuItemSizes = pgTable('menu_item_sizes', { ... })`.
       - Column `priceDelta: money('price_delta')` → `price: money('price')` (absolute price; matches iiko `NPSizePriceModel.price.current_price` per SCHEMA-MAP §Q2).
       - Constraint names: rename to `menu_item_sizes_tenant_fk`, `menu_item_sizes_item_fk`, `menu_item_sizes_tenant_item_idx`, `menu_item_sizes_one_default_per_item_uq`.
       - Keep `tenantParentUniqueIndex('menu_item_sizes', ...)` line at end of constraints block.

    2. **Rename `menuModifiers` → `menuModifierGroups`** (line 149 region):
       - `export const menuModifierGroups = pgTable('menu_modifier_groups', { ... })`.
       - All columns unchanged.
       - Constraint names: `menu_modifier_groups_tenant_fk`, `menu_modifier_groups_selectable_range_chk`.

    3. **Refactor `menuModifierOptions`** (line 179 region):
       - Column `modifierId: uuid('modifier_id').notNull()` → `modifierGroupId: uuid('modifier_group_id').notNull()`.
       - ADD `defaultAmount: smallint('default_amount').notNull().default(0)` (iiko alignment).
       - ADD `freeAmount: smallint('free_amount').notNull().default(0)` (iiko alignment per SCHEMA-MAP §Entity Mapping Table: `free_of_charge_amount` → `free_amount`).
       - Constraint names: `menu_modifier_options_group_fk` (was `..._modifier_fk`), index `menu_modifier_options_tenant_group_idx` (was `..._tenant_modifier_idx`).
       - Composite FK parent: `{ id: menuModifierGroups.id, tenantId: menuModifierGroups.tenantId }`.
       - Add `tenantParentUniqueIndex('menu_modifier_options', { id: table.id, tenantId: table.tenantId })` if not already present (for consistency with peer tables).

    4. **Rename `menuItemModifiers` → `menuItemModifierGroups`** (line 214 region):
       - `export const menuItemModifierGroups = pgTable('menu_item_modifier_groups', { ... })`.
       - Column `modifierId: uuid('modifier_id').notNull()` → `modifierGroupId: uuid('modifier_group_id').notNull()`.
       - Primary key: `primaryKey({ name: 'menu_item_modifier_groups_pk', columns: [table.menuItemId, table.modifierGroupId] })`.
       - Constraint names: `menu_item_modifier_groups_tenant_fk`, `menu_item_modifier_groups_item_fk`, `menu_item_modifier_groups_group_fk` (composite FK to renamed `menuModifierGroups`).
       - Index: `menu_item_modifier_groups_tenant_item_idx`.

    Update `packages/db/src/schema/index.ts` re-exports:
    - Replace `menuVariants` with `menuItemSizes`.
    - Replace `menuModifiers` with `menuModifierGroups`.
    - Replace `menuItemModifiers` with `menuItemModifierGroups`.
    - `menuModifierOptions` stays exported (same name, internal columns differ).

    Per Pitfall 6 (RESEARCH.md): the semantic change from delta to absolute price is invisible to the type system. Verify the only consumer of `menu_variants.priceDelta` is `apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts` (refactored in plan 06). Run `grep -rn "priceDelta\\|price_delta" apps/api/src packages/db/src packages/domain/src` and note any remaining references — plan 06 will fix them. Do NOT fix repository.ts here; this plan is schema-only.

  </action>
  <verify>
    <automated>grep -c "export const menuItemSizes" packages/db/src/schema/menu.ts &amp;&amp; grep -c "export const menuModifierGroups" packages/db/src/schema/menu.ts &amp;&amp; grep -c "export const menuItemModifierGroups" packages/db/src/schema/menu.ts &amp;&amp; grep -c "defaultAmount: smallint" packages/db/src/schema/menu.ts &amp;&amp; grep -c "freeAmount: smallint" packages/db/src/schema/menu.ts &amp;&amp; pnpm --filter @resto/db typecheck</automated>
  </verify>
  <done>
    - `menuItemSizes`, `menuModifierGroups`, `menuItemModifierGroups` exported with renamed columns + constraints.
    - `menuModifierOptions` has `modifierGroupId`, `defaultAmount`, `freeAmount` columns.
    - Old exports (`menuVariants`, `menuModifiers`, `menuItemModifiers`) no longer present.
    - `packages/db/src/schema/index.ts` reflects new names.
    - `pnpm --filter @resto/db typecheck` exits 0 (the catalog repository in apps/api will be broken — that's plan 06; the TS compile of the schema package alone is the gate here).
  </done>
  <acceptance_criteria>
    - `grep -c "export const menuItemSizes" packages/db/src/schema/menu.ts` returns 1.
    - `grep -c "export const menuModifierGroups" packages/db/src/schema/menu.ts` returns 1.
    - `grep -c "export const menuItemModifierGroups" packages/db/src/schema/menu.ts` returns 1.
    - `grep -c "export const menuVariants\\b" packages/db/src/schema/menu.ts` returns 0.
    - `grep -c "export const menuModifiers\\b" packages/db/src/schema/menu.ts` returns 0.
    - `grep -c "modifierGroupId: uuid" packages/db/src/schema/menu.ts` returns 2 (options + junction).
    - `grep -c "defaultAmount: smallint('default_amount')" packages/db/src/schema/menu.ts` returns 1.
    - `grep -c "freeAmount: smallint('free_amount')" packages/db/src/schema/menu.ts` returns 1.
    - `pnpm --filter @resto/db typecheck` exits 0.
  </acceptance_criteria>
</task>

<task type="auto" tdd="false">
  <name>Task 2: [BLOCKING] Hand-write 3 rename migrations (Pitfall 3 — no drizzle-kit auto-rename)</name>
  <files>packages/db/migrations/0037_catalog_phase4a_menu_variants_rename.sql, packages/db/migrations/0038_catalog_phase4a_menu_modifiers_rename.sql, packages/db/migrations/0039_catalog_phase4a_modifier_options_extend.sql, packages/db/migrations/meta/_journal.json</files>
  <read_first>
    packages/db/migrations/0025_composite_tenant_fk_phase_3b.sql (constraint drop + re-add pattern + statement-breakpoint)
    .planning/phases/04a-catalog-schema-api/04A-RESEARCH.md (§Pitfall 3 — column rename hand-written; §Pitfall 6 — price semantic change; §A1 — all current variants have priceDelta=0)
    .planning/phases/04a-catalog-schema-api/04A-SCHEMA-MAP.md (§Step ordering — F, G, H)
    .planning/phases/04a-catalog-schema-api/04A-PATTERNS.md (§Migration files — Column rename pattern)
  </read_first>
  <action>
    Do NOT run `pnpm db:generate` for the renames — it will generate DROP + ADD (data loss per Pitfall 3). Hand-write all three migrations.

    **`0037_catalog_phase4a_menu_variants_rename.sql`** (Migration F):
    - Header:
      - `-- Phase 4a-04 step F: rename menu_variants → menu_item_sizes; price_delta → absolute price.`
      - `-- D-4a CAT-05 (iiko NSizeModel alignment). RESEARCH.md A1 confirms all existing priceDelta = 0.`
      - `-- Pitfall 6: semantic change from delta to absolute. Plan 06 refactors repository.`
    - Statements (each separated by `--> statement-breakpoint`):
      - `ALTER TABLE menu_variants DROP CONSTRAINT menu_variants_tenant_fk;`
      - `ALTER TABLE menu_variants DROP CONSTRAINT menu_variants_item_fk;`
      - `ALTER INDEX menu_variants_tenant_item_idx RENAME TO menu_item_sizes_tenant_item_idx;`
      - `ALTER INDEX menu_variants_one_default_per_item_uq RENAME TO menu_item_sizes_one_default_per_item_uq;`
      - `ALTER INDEX menu_variants_id_tenant_uq RENAME TO menu_item_sizes_id_tenant_uq;`
      - `ALTER TABLE menu_variants RENAME COLUMN price_delta TO price;`
      - `UPDATE menu_item_sizes ... -- handled after the table rename below; see ordering`
      - `ALTER TABLE menu_variants RENAME TO menu_item_sizes;`
      - Backfill (per RESEARCH.md A1 + Pitfall 6 + SCHEMA-MAP §Migration F — "since all existing priceDelta = 0, price = item.basePrice"):
        - `UPDATE menu_item_sizes SET price = (SELECT base_price FROM menu_items WHERE menu_items.id = menu_item_sizes.menu_item_id AND menu_items.tenant_id = menu_item_sizes.tenant_id) WHERE price = '0' OR price IS NULL;`
      - Re-add composite tenant FK with new name:
        - `ALTER TABLE menu_item_sizes ADD CONSTRAINT menu_item_sizes_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;`
        - `ALTER TABLE menu_item_sizes ADD CONSTRAINT menu_item_sizes_item_fk FOREIGN KEY (menu_item_id, tenant_id) REFERENCES menu_items(id, tenant_id) ON DELETE CASCADE;`

      Statement ordering nuance: `ALTER TABLE menu_variants RENAME COLUMN ...` must run BEFORE `ALTER TABLE menu_variants RENAME TO ...` (the column rename references the old table name; once renamed, you'd say `ALTER TABLE menu_item_sizes ...` instead). The backfill UPDATE must run AFTER the table rename (uses new name `menu_item_sizes`).

    **`0038_catalog_phase4a_menu_modifiers_rename.sql`** (Migration G):
    - Header:
      - `-- Phase 4a-04 step G: rename menu_modifiers → menu_modifier_groups; cascade FK rename in menu_modifier_options + junction.`
      - `-- D-4a CAT-04 (iiko Группа модификаторов alignment). RESEARCH.md Pitfall 3: hand-written rename.`
    - Statements:
      - Drop dependent composite FKs first (PG requires FK removal before rename of referenced table):
        - `ALTER TABLE menu_modifier_options DROP CONSTRAINT menu_modifier_options_modifier_fk;`
        - `ALTER TABLE menu_modifier_options DROP CONSTRAINT menu_modifier_options_tenant_fk;`
        - `ALTER TABLE menu_item_modifiers DROP CONSTRAINT menu_item_modifiers_modifier_fk;`
        - `ALTER TABLE menu_item_modifiers DROP CONSTRAINT menu_item_modifiers_item_fk;`
        - `ALTER TABLE menu_item_modifiers DROP CONSTRAINT menu_item_modifiers_tenant_fk;`
        - `ALTER TABLE menu_modifiers DROP CONSTRAINT menu_modifiers_tenant_fk;`
      - Rename tables:
        - `ALTER TABLE menu_modifiers RENAME TO menu_modifier_groups;`
        - `ALTER TABLE menu_item_modifiers RENAME TO menu_item_modifier_groups;`
      - Rename columns:
        - `ALTER TABLE menu_modifier_options RENAME COLUMN modifier_id TO modifier_group_id;`
        - `ALTER TABLE menu_item_modifier_groups RENAME COLUMN modifier_id TO modifier_group_id;`
      - Rename indexes/constraints:
        - `ALTER INDEX menu_modifiers_id_tenant_uq RENAME TO menu_modifier_groups_id_tenant_uq;`
        - `ALTER TABLE menu_modifier_groups RENAME CONSTRAINT menu_modifiers_selectable_range_chk TO menu_modifier_groups_selectable_range_chk;`
        - `ALTER INDEX menu_modifier_options_tenant_modifier_idx RENAME TO menu_modifier_options_tenant_group_idx;`
        - `ALTER INDEX menu_item_modifiers_tenant_item_idx RENAME TO menu_item_modifier_groups_tenant_item_idx;`
        - `ALTER TABLE menu_item_modifier_groups RENAME CONSTRAINT menu_item_modifiers_pk TO menu_item_modifier_groups_pk;`
      - Re-add composite + tenant FKs with new names:
        - `ALTER TABLE menu_modifier_groups ADD CONSTRAINT menu_modifier_groups_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;`
        - `ALTER TABLE menu_modifier_options ADD CONSTRAINT menu_modifier_options_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;`
        - `ALTER TABLE menu_modifier_options ADD CONSTRAINT menu_modifier_options_group_fk FOREIGN KEY (modifier_group_id, tenant_id) REFERENCES menu_modifier_groups(id, tenant_id) ON DELETE CASCADE;`
        - `ALTER TABLE menu_item_modifier_groups ADD CONSTRAINT menu_item_modifier_groups_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;`
        - `ALTER TABLE menu_item_modifier_groups ADD CONSTRAINT menu_item_modifier_groups_item_fk FOREIGN KEY (menu_item_id, tenant_id) REFERENCES menu_items(id, tenant_id) ON DELETE CASCADE;`
        - `ALTER TABLE menu_item_modifier_groups ADD CONSTRAINT menu_item_modifier_groups_group_fk FOREIGN KEY (modifier_group_id, tenant_id) REFERENCES menu_modifier_groups(id, tenant_id) ON DELETE CASCADE;`

    **`0039_catalog_phase4a_modifier_options_extend.sql`** (Migration H):
    - Header:
      - `-- Phase 4a-04 step H: add default_amount + free_amount on menu_modifier_options.`
      - `-- D-4a CAT-04 (iiko NPModifierModel.default_amount + free_of_charge_amount).`
    - Statements:
      - `ALTER TABLE menu_modifier_options ADD COLUMN default_amount smallint NOT NULL DEFAULT 0;`
      - `ALTER TABLE menu_modifier_options ADD COLUMN free_amount smallint NOT NULL DEFAULT 0;`

    Update `_journal.json` to register 0037, 0038, 0039 in sequential idx after plan 03's 0036.

    Idempotency: this batch is NOT re-runnable by itself (RENAME on an already-renamed table errors with "relation does not exist"). Drizzle's `_journal.json` ensures `db:migrate` skips already-applied entries, so the BLOCKING requirement "re-run is no-op" is satisfied by the journal mechanism, not by the SQL itself.

  </action>
  <verify>
    <automated>test -f packages/db/migrations/0037_catalog_phase4a_menu_variants_rename.sql &amp;&amp; test -f packages/db/migrations/0038_catalog_phase4a_menu_modifiers_rename.sql &amp;&amp; test -f packages/db/migrations/0039_catalog_phase4a_modifier_options_extend.sql &amp;&amp; grep -v '^--' packages/db/migrations/0037_catalog_phase4a_menu_variants_rename.sql | grep -c "RENAME TO menu_item_sizes"</automated>
  </verify>
  <done>
    - 3 rename migrations exist with the exact filenames above.
    - Backfill UPDATE for `price` runs after table rename.
    - Composite tenant FKs are dropped before any RENAME and re-added after — Postgres rejects RENAME of a table referenced by an FK pointing back.
    - `default_amount` and `free_amount` added on `menu_modifier_options`.
  </done>
  <acceptance_criteria>
    - `grep -v '^--' packages/db/migrations/0037_catalog_phase4a_menu_variants_rename.sql | grep -c "RENAME TO menu_item_sizes"` returns 1.
    - `grep -v '^--' packages/db/migrations/0037_catalog_phase4a_menu_variants_rename.sql | grep -c "RENAME COLUMN price_delta TO price"` returns 1.
    - `grep -v '^--' packages/db/migrations/0037_catalog_phase4a_menu_variants_rename.sql | grep -c "UPDATE menu_item_sizes SET price"` returns 1.
    - `grep -v '^--' packages/db/migrations/0038_catalog_phase4a_menu_modifiers_rename.sql | grep -c "RENAME TO menu_modifier_groups"` returns 1.
    - `grep -v '^--' packages/db/migrations/0038_catalog_phase4a_menu_modifiers_rename.sql | grep -c "RENAME TO menu_item_modifier_groups"` returns 1.
    - `grep -v '^--' packages/db/migrations/0038_catalog_phase4a_menu_modifiers_rename.sql | grep -c "RENAME COLUMN modifier_id TO modifier_group_id"` returns 2.
    - `grep -v '^--' packages/db/migrations/0038_catalog_phase4a_menu_modifiers_rename.sql | grep -c "menu_modifier_options_group_fk"` returns 1.
    - `grep -v '^--' packages/db/migrations/0039_catalog_phase4a_modifier_options_extend.sql | grep -c "ADD COLUMN default_amount smallint"` returns 1.
    - `grep -v '^--' packages/db/migrations/0039_catalog_phase4a_modifier_options_extend.sql | grep -c "ADD COLUMN free_amount smallint"` returns 1.
    - `_journal.json` lists 0037, 0038, 0039 in sequential idx order.
  </acceptance_criteria>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Apply migrations + run audit-fks + smoke-check renames in live DB</name>
  <files>(no file writes — verification only)</files>
  <read_first>
    packages/db/CLAUDE.md (§Schema — composite FK invariant)
    .planning/phases/04a-catalog-schema-api/04A-RESEARCH.md (§Pitfall 6 — verify priceDelta consumers)
  </read_first>
  <action>
    1. `pnpm --filter @resto/db db:migrate` — applies 0037, 0038, 0039.
    2. Smoke checks via psql:
       - `\d menu_item_sizes` — table exists; column `price` (no `price_delta`); has FK to `menu_items(id, tenant_id)`.
       - `\d menu_modifier_groups` — table exists; check constraint `menu_modifier_groups_selectable_range_chk`.
       - `\d menu_modifier_options` — column `modifier_group_id` (no `modifier_id`); `default_amount` SMALLINT NOT NULL DEFAULT 0; `free_amount` SMALLINT NOT NULL DEFAULT 0.
       - `\d menu_item_modifier_groups` — table exists; column `modifier_group_id`; PK `menu_item_modifier_groups_pk` on (menu_item_id, modifier_group_id).
       - `SELECT to_regclass('menu_variants');` returns NULL (old table gone).
       - `SELECT to_regclass('menu_modifiers');` returns NULL.
       - `SELECT to_regclass('menu_item_modifiers');` returns NULL.
       - `SELECT count(*) FROM information_schema.columns WHERE table_name='menu_item_sizes' AND column_name='price_delta';` returns 0.
    3. `pnpm --filter @resto/db db:audit-fks` — must exit 0. New composite FKs (`menu_item_sizes_item_fk`, `menu_modifier_options_group_fk`, `menu_item_modifier_groups_item_fk`, `menu_item_modifier_groups_group_fk`) all reference `(id, tenant_id)` so the audit passes.
    4. Type-check root: `pnpm typecheck` — `packages/db` passes; `apps/api` will fail because the catalog repository still references old names. THAT IS EXPECTED — plan 06 refactors the repository. Note this in plan SUMMARY as "expected break — apps/api typecheck fixed in plan 06".
  </action>
  <verify>
    <automated>pnpm --filter @resto/db db:migrate &amp;&amp; pnpm --filter @resto/db db:audit-fks</automated>
  </verify>
  <done>
    - All 3 migrations applied; `_journal.json` records them.
    - Renamed tables exist; old tables removed.
    - Composite FKs intact; audit green.
    - Drizzle schema package typecheck green; apps/api typecheck broken (fixed in plan 06).
  </done>
  <acceptance_criteria>
    - `pnpm --filter @resto/db db:migrate` exits 0.
    - `pnpm --filter @resto/db db:audit-fks` exits 0.
    - `psql $DATABASE_URL -tAc "SELECT to_regclass('menu_item_sizes'), to_regclass('menu_modifier_groups'), to_regclass('menu_item_modifier_groups');"` returns three non-NULL identifiers.
    - `psql $DATABASE_URL -tAc "SELECT to_regclass('menu_variants'), to_regclass('menu_modifiers'), to_regclass('menu_item_modifiers');"` returns three NULLs.
    - `psql $DATABASE_URL -tAc "SELECT count(*) FROM information_schema.columns WHERE table_name='menu_modifier_options' AND column_name IN ('modifier_group_id','default_amount','free_amount');"` returns 3.
  </acceptance_criteria>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                        | Description                                                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| migration → live data           | DROP CONSTRAINT + RENAME + re-ADD CONSTRAINT must be atomic per transaction; partial failure leaves orphaned data |
| consumer code → renamed columns | Any consumer reading `priceDelta` will silently double-count after rename (plan 06 fixes)                         |

## STRIDE Threat Register

| Threat ID   | Category       | Component                                       | Disposition | Mitigation Plan                                                                                                                                                                                         |
| ----------- | -------------- | ----------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-04a-04-01 | Tampering      | Price semantic regression (Pitfall 6)           | mitigate    | Backfill `UPDATE menu_item_sizes SET price = base_price` runs in same migration as RENAME; plan 06 refactors repository to read absolute price; A1 confirms zero non-zero priceDelta values in dev seed |
| T-04a-04-02 | Tampering      | FK constraint re-add references wrong table     | mitigate    | Re-added FK names explicit per SCHEMA-MAP; `db:audit-fks` BLOCKING gate in Task 3 verifies; e2e cross-tenant test in plan 07 re-runs against new names                                                  |
| T-04a-04-03 | DoS            | Migration failure leaves table half-renamed     | accept      | Forward-only migration on dev DB with zero customers; `pnpm db:reset` is the recovery path per packages/db/CLAUDE.md                                                                                    |
| T-04a-04-04 | Tampering      | Drizzle-kit auto-generates DROP+ADD (data loss) | mitigate    | Pitfall 3 explicit in RESEARCH.md; Task 2 mandates hand-written SQL; `db:generate` NOT run for these renames                                                                                            |
| T-04a-04-05 | InfoDisclosure | Lingering `priceDelta` consumers in app code    | mitigate    | Plan 06 includes `grep -rn priceDelta` check + repository refactor; this plan's SUMMARY notes the expected apps/api typecheck break                                                                     |

</threat_model>

<verification>
- `pnpm --filter @resto/db typecheck` exits 0 (schema package).
- `pnpm --filter @resto/db db:migrate` applies 0037–0039 cleanly.
- `pnpm --filter @resto/db db:audit-fks` exits 0.
- Smoke-check SQL in Task 3 returns expected values (renamed tables exist; old tables gone; new columns present).
- Expected: `pnpm --filter @resto/api typecheck` FAILS (catalog repository broken) — this is fixed in plan 06; SUMMARY documents the expected break.
</verification>

<success_criteria>

- CAT-04: `menu_modifier_groups` correctly named (matches iiko `Группа модификаторов`).
- CAT-05: `menu_item_sizes` correctly named (matches iiko `NSizeModel`) with absolute price semantics.
- iiko alignment: `default_amount` + `free_amount` columns on options.
- Composite-FK audit BLOCKING gate passes.
- Schema TS package typecheck green; downstream catalog repository break is documented for plan 06.
  </success_criteria>

<output>
Create `.planning/phases/04a-catalog-schema-api/04A-04-SUMMARY.md` when done summarizing:
- Final rename map: `menu_variants` → `menu_item_sizes`, `menu_modifiers` → `menu_modifier_groups`, `menu_item_modifiers` → `menu_item_modifier_groups`, `menu_modifier_options.modifier_id` → `modifier_group_id`.
- Backfill row count: how many `menu_item_sizes` rows had their `price` updated.
- Audit-fks output snippet confirming no violations.
- The expected apps/api typecheck break (handed off to plan 06).
</output>
