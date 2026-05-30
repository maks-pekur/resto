---
phase: 04a-catalog-schema-api
plan: 03
type: execute
wave: 3
depends_on: ['04a-02']
files_modified:
  - packages/db/src/schema/menu.ts
  - packages/db/src/schema/index.ts
  - packages/db/migrations/0034_catalog_phase4a_menu_stop_list.sql
  - packages/db/migrations/0035_catalog_phase4a_item_slug_aliases.sql
  - packages/db/migrations/0036_catalog_phase4a_new_tables_rls.sql
  - packages/db/migrations/meta/_journal.json
  - packages/db/src/cli/audit-fks.ts
autonomous: true
requirements:
  - CAT-06
  - CAT-09
tags: [catalog, schema, drizzle, migration, rls, stop-list, slug-aliases]
goal: Create `menu_stop_list` table (D-4a-10 stop-list shape) + `menu_item_slug_aliases` table (D-4a-04 slug aliases) with composite FK + RLS ENABLE/FORCE + composite-FK audit allowlist update; both tables get their own migration files and meta journal entries.

must_haves:
  truths:
    - '`menu_stop_list` table exists with composite FK `(item_id, tenant_id) REFERENCES menu_items(id, tenant_id) ON DELETE CASCADE`, RLS ENABLE + FORCE, and policy `menu_stop_list_iso` using `tenant_id = current_tenant_id()`.'
    - '`menu_stop_list` has nullable columns: `reason TEXT NULLABLE`, `stopped_by_user_id TEXT NULLABLE` (per SCHEMA-MAP §Q6 — schema-ready for v2 UI even though MVP-1 UI ignores them).'
    - '`menu_stop_list` UNIQUE constraint on `(tenant_id, item_id)` — one stop entry per item per tenant.'
    - '`menu_item_slug_aliases` table exists with composite FK `(item_id, tenant_id) REFERENCES menu_items(id, tenant_id) ON DELETE CASCADE`, RLS ENABLE + FORCE, policy `menu_item_slug_aliases_iso`, UNIQUE `(tenant_id, alias)`.'
    - '`menu_item_slug_aliases.alias` has CHECK constraint matching the URL-safe slug regex `^[a-z0-9][a-z0-9-]*$`.'
    - 'Composite-FK audit script (`pnpm db:audit-fks`) recognizes the new tables and exits 0.'
    - '`packages/db/src/schema/index.ts` re-exports `menuStopList` and `menuItemSlugAliases`.'
  artifacts:
    - path: 'packages/db/src/schema/menu.ts'
      provides: 'menuStopList + menuItemSlugAliases pgTable definitions'
      contains: 'menuStopList'
    - path: 'packages/db/migrations/0034_catalog_phase4a_menu_stop_list.sql'
      provides: 'CREATE TABLE menu_stop_list with composite FK'
      contains: 'menu_stop_list'
    - path: 'packages/db/migrations/0035_catalog_phase4a_item_slug_aliases.sql'
      provides: 'CREATE TABLE menu_item_slug_aliases'
      contains: 'menu_item_slug_aliases'
    - path: 'packages/db/migrations/0036_catalog_phase4a_new_tables_rls.sql'
      provides: 'RLS ENABLE + FORCE + policies for new tables'
      contains: 'ENABLE ROW LEVEL SECURITY'
  key_links:
    - from: 'packages/db/migrations/0034_*.sql'
      to: 'menu_items(id, tenant_id)'
      via: 'composite FK menu_stop_list_item_fk'
      pattern: "REFERENCES menu_items\\(id, tenant_id\\)"
    - from: 'packages/db/migrations/0036_*.sql'
      to: 'menu_stop_list + menu_item_slug_aliases'
      via: 'RLS policy iso'
      pattern: "current_tenant_id\\(\\)"
---

<objective>
Create the two NEW tables identified by `04A-SCHEMA-MAP.md`: `menu_stop_list` (D-4a-10 — separate-table stop-list shape per researcher recommendation) and `menu_item_slug_aliases` (D-4a-04 — alias rows for slug history / SEO redirects). Both tables MUST follow ADR-0020 I-2 (composite tenant FK) AND ADR-0020 RLS pattern (ENABLE + FORCE + iso policy) per Pitfall 4 in RESEARCH.md.

The composite-FK audit script (`pnpm db:audit-fks`) must continue to pass — both new tables already have composite FK, so the audit walks them without violations. If the audit script has an explicit allowlist of tenant-scoped tables, extend it; if it's pure-introspection-based (verified: `packages/db/src/cli/audit-fks.ts` scans `information_schema.columns` and `pg_constraint` for any `tenant_id NOT NULL` table), no allowlist update is needed — the audit will pick up new tables automatically.

Purpose: Land the stop-list overlay table (plan 06 wires read-time filtering in `loadPublishedMenu`) and slug-alias table (plan 06 wires alias creation in `upsert-item.service.ts`). The composite-FK audit must remain green to satisfy the planning-context `[BLOCKING]` requirement.
Output: 3 migration files + 2 schema tables + audit-fks pass.
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
@packages/db/src/cli/audit-fks.ts
@packages/db/migrations/0013_brands_rls.sql

<interfaces>
RLS policy pattern (verified from `packages/db/migrations/0013_brands_rls.sql` — referenced by PATTERNS.md):
```sql
ALTER TABLE <name> ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE <name> FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY <name>_iso ON <name>
  USING (is_system_session() OR tenant_id = current_tenant_id())
  WITH CHECK (is_system_session() OR tenant_id = current_tenant_id());
--> statement-breakpoint
```

`menuStopList` target shape (from SCHEMA-MAP):

```ts
export const menuStopList = pgTable('menu_stop_list', {
  id: pkUuid(),
  tenantId: tenantIdColumn(),
  brandId: uuid('brand_id'),
  itemId: uuid('item_id').notNull(),
  stoppedAt: timestamp('stopped_at', { withTimezone: true, mode: 'date' }).notNull().default(sql`now()`),
  reason: text('reason'),                 // nullable; v2 UI exposes
  stoppedByUserId: text('stopped_by_user_id'),  // nullable; actor for audit
}, ...);
```

With composite FK `menu_stop_list_item_fk` → `menu_items(id, tenant_id) ON DELETE CASCADE`, unique index on `(tenant_id, item_id)`, `tenantParentUniqueIndex('menu_stop_list', ...)`.

`menuItemSlugAliases` target shape (from SCHEMA-MAP):

```ts
export const menuItemSlugAliases = pgTable('menu_item_slug_aliases', {
  id: pkUuid(),
  tenantId: tenantIdColumn(),
  itemId: uuid('item_id').notNull(),
  alias: text('alias').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().default(sql`now()`),
}, ...);
```

With composite FK to `menu_items(id, tenant_id) ON DELETE CASCADE`, unique index on `(tenant_id, alias)`, CHECK `alias ~ '^[a-z0-9][a-z0-9-]*$'`.

Audit script `packages/db/src/cli/audit-fks.ts` (verified — uses `information_schema.columns` scan + `pg_constraint`) is introspection-based; new tables automatically participate when they have `tenant_id NOT NULL`. NO allowlist edit required. Run it and confirm — if it does turn out to have a hardcoded allowlist, extend it here.

`packages/db/src/schema/index.ts` re-exports every table so consumers can import as `schema.menuStopList`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Add `menuStopList` + `menuItemSlugAliases` to Drizzle schema</name>
  <files>packages/db/src/schema/menu.ts, packages/db/src/schema/index.ts</files>
  <read_first>
    packages/db/src/schema/menu.ts (current state after plan 02 — menuItems extended, menuCategories has parent_id)
    packages/db/src/schema/_columns.ts (compositeTenantFk, tenantIdColumn, pkUuid, tenantParentUniqueIndex signatures)
    .planning/phases/04a-catalog-schema-api/04A-SCHEMA-MAP.md (§NEW Drizzle table: menu_stop_list; §NEW Drizzle table: menu_item_slug_aliases — exact target)
    .planning/phases/04a-catalog-schema-api/04A-PATTERNS.md (§packages/db/src/schema/menu.ts — composite FK pattern, JSONB default pattern)
  </read_first>
  <action>
    Append both new tables to `packages/db/src/schema/menu.ts` after the existing `menuItemModifiers` junction table (preserve current file ordering):

    1. **`menuStopList`** — match SCHEMA-MAP §NEW Drizzle table: menu_stop_list exactly:
       - Columns: `id: pkUuid()`, `tenantId: tenantIdColumn()`, `brandId: uuid('brand_id')`, `itemId: uuid('item_id').notNull()`, `stoppedAt: timestamp('stopped_at', { withTimezone: true, mode: 'date' }).notNull().default(sql\`now()\`)`, `reason: text('reason')` (nullable), `stoppedByUserId: text('stopped_by_user_id')` (nullable).
       - Constraints block:
         - `foreignKey({ name: 'menu_stop_list_tenant_fk', columns: [table.tenantId], foreignColumns: [tenants.id] }).onDelete('cascade')`
         - `compositeTenantFk({ name: 'menu_stop_list_item_fk', child: { id: table.itemId, tenantId: table.tenantId }, parent: { id: menuItems.id, tenantId: menuItems.tenantId } }).onDelete('cascade')`
         - `uniqueIndex('menu_stop_list_item_tenant_uq').on(table.tenantId, table.itemId)` — one stop per item per tenant
         - `tenantParentUniqueIndex('menu_stop_list', { id: table.id, tenantId: table.tenantId })`

    2. **`menuItemSlugAliases`** — match SCHEMA-MAP §NEW Drizzle table: menu_item_slug_aliases exactly:
       - Columns: `id: pkUuid()`, `tenantId: tenantIdColumn()`, `itemId: uuid('item_id').notNull()`, `alias: text('alias').notNull()`, `createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().default(sql\`now()\`)`.
       - Constraints block:
         - `foreignKey({ name: 'menu_item_slug_aliases_tenant_fk', columns: [table.tenantId], foreignColumns: [tenants.id] }).onDelete('cascade')`
         - `compositeTenantFk({ name: 'menu_item_slug_aliases_item_fk', child: { id: table.itemId, tenantId: table.tenantId }, parent: { id: menuItems.id, tenantId: menuItems.tenantId } }).onDelete('cascade')`
         - `uniqueIndex('menu_item_slug_aliases_tenant_alias_uq').on(table.tenantId, table.alias)`
         - `check('menu_item_slug_aliases_format_chk', sql\`${table.alias} ~ '^[a-z0-9][a-z0-9-]*$'\`)`

    3. Update `packages/db/src/schema/index.ts` to re-export both new tables alongside existing menu re-exports.

    Per ADR-0020 I-2 the composite FK to `menu_items(id, tenant_id)` requires `menu_items` to have `UNIQUE (id, tenant_id)` — `menu_items_id_tenant_uq` already exists from migration 0025 (verified line 9 of `0025_composite_tenant_fk_phase_3b.sql`).

  </action>
  <verify>
    <automated>grep -c "export const menuStopList" packages/db/src/schema/menu.ts &amp;&amp; grep -c "export const menuItemSlugAliases" packages/db/src/schema/menu.ts &amp;&amp; pnpm --filter @resto/db typecheck</automated>
  </verify>
  <done>
    - `menuStopList` and `menuItemSlugAliases` are exported from menu.ts with correct columns + composite FK + uniqueIndex + check constraint.
    - Both tables are re-exported from `packages/db/src/schema/index.ts`.
    - `pnpm --filter @resto/db typecheck` exits 0.
  </done>
  <acceptance_criteria>
    - `grep -c "export const menuStopList" packages/db/src/schema/menu.ts` returns 1.
    - `grep -c "export const menuItemSlugAliases" packages/db/src/schema/menu.ts` returns 1.
    - `grep -c "menu_stop_list_item_fk" packages/db/src/schema/menu.ts` returns 1.
    - `grep -c "menu_item_slug_aliases_format_chk" packages/db/src/schema/menu.ts` returns 1.
    - `grep -c "menuStopList\\|menuItemSlugAliases" packages/db/src/schema/index.ts` returns ≥ 2 (or single re-export line containing both).
    - `pnpm --filter @resto/db typecheck` exits 0.
  </acceptance_criteria>
</task>

<task type="auto" tdd="false">
  <name>Task 2: [BLOCKING] Generate + hand-finalize migrations 0034/0035/0036</name>
  <files>packages/db/migrations/0034_catalog_phase4a_menu_stop_list.sql, packages/db/migrations/0035_catalog_phase4a_item_slug_aliases.sql, packages/db/migrations/0036_catalog_phase4a_new_tables_rls.sql, packages/db/migrations/meta/_journal.json</files>
  <read_first>
    packages/db/migrations/0013_brands_rls.sql (RLS ENABLE/FORCE + iso policy template — PATTERNS.md analog)
    packages/db/migrations/0025_composite_tenant_fk_phase_3b.sql (composite FK ALTER TABLE pattern + statement-breakpoint cadence)
    .planning/phases/04a-catalog-schema-api/04A-RESEARCH.md (§Pitfall 4 — RLS DDL must be added manually after pgTable creation)
    .planning/phases/04a-catalog-schema-api/04A-PATTERNS.md (§Migration files — RLS migration pattern)
  </read_first>
  <action>
    Run `pnpm --filter @resto/db db:generate` AFTER Task 1 schema edits. Drizzle-kit emits the CREATE TABLE DDL but does NOT emit RLS ENABLE/FORCE or policies (Pitfall 4). Split the generated SQL into three named files:

    **`0034_catalog_phase4a_menu_stop_list.sql`** (Migration E):
    - Header: `-- Phase 4a-03 step E: create menu_stop_list (separate-table stop-list per D-4a-10).`
    - `-- Researcher's recommendation in SCHEMA-MAP §Q5: separate table over column or Redis.`
    - `-- ADR-0020 I-2: composite tenant FK.`
    - `CREATE TABLE menu_stop_list (...);` — full column list per SCHEMA-MAP §NEW Drizzle table: menu_stop_list (Drizzle generates).
    - `ALTER TABLE menu_stop_list ADD CONSTRAINT menu_stop_list_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;` --> statement-breakpoint
    - `ALTER TABLE menu_stop_list ADD CONSTRAINT menu_stop_list_item_fk FOREIGN KEY (item_id, tenant_id) REFERENCES menu_items(id, tenant_id) ON DELETE CASCADE;` --> statement-breakpoint
    - `CREATE UNIQUE INDEX menu_stop_list_item_tenant_uq ON menu_stop_list (tenant_id, item_id);` --> statement-breakpoint
    - `CREATE UNIQUE INDEX menu_stop_list_id_tenant_uq ON menu_stop_list (id, tenant_id);` --> statement-breakpoint

    **`0035_catalog_phase4a_item_slug_aliases.sql`** (Migration I):
    - Header: `-- Phase 4a-03 step I: create menu_item_slug_aliases (D-4a-04 slug history + SEO redirect).`
    - `-- ADR-0020 I-2: composite tenant FK. Plan 06 wires alias insertion in upsert-item.service.ts.`
    - `CREATE TABLE menu_item_slug_aliases (...);` per SCHEMA-MAP exact.
    - `ALTER TABLE menu_item_slug_aliases ADD CONSTRAINT menu_item_slug_aliases_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;` --> statement-breakpoint
    - `ALTER TABLE menu_item_slug_aliases ADD CONSTRAINT menu_item_slug_aliases_item_fk FOREIGN KEY (item_id, tenant_id) REFERENCES menu_items(id, tenant_id) ON DELETE CASCADE;` --> statement-breakpoint
    - `CREATE UNIQUE INDEX menu_item_slug_aliases_tenant_alias_uq ON menu_item_slug_aliases (tenant_id, alias);` --> statement-breakpoint
    - `CREATE UNIQUE INDEX menu_item_slug_aliases_id_tenant_uq ON menu_item_slug_aliases (id, tenant_id);` --> statement-breakpoint
    - `ALTER TABLE menu_item_slug_aliases ADD CONSTRAINT menu_item_slug_aliases_format_chk CHECK (alias ~ '^[a-z0-9][a-z0-9-]*$');` --> statement-breakpoint

    **`0036_catalog_phase4a_new_tables_rls.sql`** (Migration L — RLS ENABLE/FORCE per Pitfall 4):
    - Header: `-- Phase 4a-03 step L: RLS ENABLE + FORCE + iso policies for new tables.`
    - `-- ADR-0020: every tenant-scoped table has RLS enabled + FORCED. Pitfall 4 in RESEARCH.md.`
    - For `menu_stop_list`:
      - `ALTER TABLE menu_stop_list ENABLE ROW LEVEL SECURITY;` --> statement-breakpoint
      - `ALTER TABLE menu_stop_list FORCE ROW LEVEL SECURITY;` --> statement-breakpoint
      - `CREATE POLICY menu_stop_list_iso ON menu_stop_list USING (is_system_session() OR tenant_id = current_tenant_id()) WITH CHECK (is_system_session() OR tenant_id = current_tenant_id());` --> statement-breakpoint
    - For `menu_item_slug_aliases`:
      - `ALTER TABLE menu_item_slug_aliases ENABLE ROW LEVEL SECURITY;` --> statement-breakpoint
      - `ALTER TABLE menu_item_slug_aliases FORCE ROW LEVEL SECURITY;` --> statement-breakpoint
      - `CREATE POLICY menu_item_slug_aliases_iso ON menu_item_slug_aliases USING (is_system_session() OR tenant_id = current_tenant_id()) WITH CHECK (is_system_session() OR tenant_id = current_tenant_id());` --> statement-breakpoint

    Update `packages/db/migrations/meta/_journal.json` to register all three migrations in sequential idx order after plan 02's 0033 entry.

    DO NOT include rename DDL here (`menu_variants` → `menu_item_sizes` etc.) — that lands in plan 04.

  </action>
  <verify>
    <automated>test -f packages/db/migrations/0034_catalog_phase4a_menu_stop_list.sql &amp;&amp; test -f packages/db/migrations/0035_catalog_phase4a_item_slug_aliases.sql &amp;&amp; test -f packages/db/migrations/0036_catalog_phase4a_new_tables_rls.sql &amp;&amp; grep -v '^--' packages/db/migrations/0036_catalog_phase4a_new_tables_rls.sql | grep -c "ENABLE ROW LEVEL SECURITY"</automated>
  </verify>
  <done>
    - 3 migration files exist with the exact names above.
    - RLS ENABLE + FORCE + policy emitted for BOTH new tables.
    - Composite FK syntax matches `0025_composite_tenant_fk_phase_3b.sql` (i.e. `FOREIGN KEY (item_id, tenant_id) REFERENCES menu_items(id, tenant_id)`).
    - `_journal.json` registers all 3.
  </done>
  <acceptance_criteria>
    - `ls packages/db/migrations/0034_catalog_phase4a*.sql 0035_catalog_phase4a*.sql 0036_catalog_phase4a*.sql 2>/dev/null | wc -l` returns 3.
    - `grep -v '^--' packages/db/migrations/0036_catalog_phase4a_new_tables_rls.sql | grep -c "ENABLE ROW LEVEL SECURITY"` returns 2.
    - `grep -v '^--' packages/db/migrations/0036_catalog_phase4a_new_tables_rls.sql | grep -c "FORCE ROW LEVEL SECURITY"` returns 2.
    - `grep -v '^--' packages/db/migrations/0036_catalog_phase4a_new_tables_rls.sql | grep -c "CREATE POLICY"` returns 2.
    - `grep -v '^--' packages/db/migrations/0034_catalog_phase4a_menu_stop_list.sql | grep -c "REFERENCES menu_items(id, tenant_id)"` returns 1.
    - `grep -v '^--' packages/db/migrations/0035_catalog_phase4a_item_slug_aliases.sql | grep -c "menu_item_slug_aliases_format_chk"` returns 1.
    - `_journal.json` lists 0034, 0035, 0036 in sequential idx order.
  </acceptance_criteria>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Apply migrations + run audit-fks + (if needed) update audit allowlist</name>
  <files>packages/db/src/cli/audit-fks.ts (only if hardcoded allowlist exists)</files>
  <read_first>
    packages/db/src/cli/audit-fks.ts (verify whether the audit is introspection-only or has an explicit allowlist)
    packages/db/CLAUDE.md (§Rules — composite FK on every tenant-scoped child table)
  </read_first>
  <action>
    Apply migrations + run audit:

    1. `pnpm --filter @resto/db db:migrate` — applies 0034, 0035, 0036.
    2. Confirm idempotency by re-running.
    3. Smoke-check:
       - `psql $DATABASE_URL -c "\d menu_stop_list"` shows the table with composite FK + RLS policy.
       - `psql $DATABASE_URL -c "SELECT polname FROM pg_policy WHERE polrelid = 'menu_stop_list'::regclass;"` returns `menu_stop_list_iso`.
       - `psql $DATABASE_URL -c "SELECT polname FROM pg_policy WHERE polrelid = 'menu_item_slug_aliases'::regclass;"` returns `menu_item_slug_aliases_iso`.
    4. Run `pnpm --filter @resto/db db:audit-fks` — must exit 0.

    If `audit-fks.ts` is introspection-only (verified: it queries `information_schema.columns WHERE column_name = 'tenant_id' AND is_nullable = 'NO'` and matches `pg_constraint` rows), the new tables are auto-discovered and the script passes WITHOUT a code change. In that case, this task makes no edit to `audit-fks.ts` — just verifies the audit passes.

    If the audit has a hardcoded allowlist (it does NOT per current code, but planning context flagged this as a possibility), append `menu_stop_list` and `menu_item_slug_aliases` to the allowlist set and re-run.

    Per planning-context schema_push_requirement: this audit pass is the BLOCKING gate that verifies new entities are covered.

  </action>
  <verify>
    <automated>pnpm --filter @resto/db db:migrate &amp;&amp; pnpm --filter @resto/db db:audit-fks</automated>
  </verify>
  <done>
    - All 3 migrations applied; re-run reports zero pending.
    - RLS policies live on both new tables.
    - `db:audit-fks` exits 0.
  </done>
  <acceptance_criteria>
    - `pnpm --filter @resto/db db:migrate` exits 0.
    - `pnpm --filter @resto/db db:audit-fks` exits 0.
    - `psql $DATABASE_URL -tAc "SELECT count(*) FROM pg_policy WHERE polrelid IN ('menu_stop_list'::regclass, 'menu_item_slug_aliases'::regclass);"` returns ≥ 2.
    - `psql $DATABASE_URL -tAc "SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE relname IN ('menu_stop_list','menu_item_slug_aliases');"` returns `t` for both.
  </acceptance_criteria>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                             | Description                                                                                                    |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| application → menu_stop_list         | Tenant A must not stop/unstop tenant B's items                                                                 |
| application → menu_item_slug_aliases | Tenant A must not insert alias rows for tenant B's items, nor leak tenant B's aliases via resolver lookup      |
| resolver → slug aliases              | Alias values themselves cross the URL boundary; malformed aliases could enable open redirect or path injection |

## STRIDE Threat Register

| Threat ID   | Category       | Component                           | Disposition | Mitigation Plan                                                                                                                                               |
| ----------- | -------------- | ----------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-04a-03-01 | Tampering      | Cross-tenant stop-list manipulation | mitigate    | Composite FK `(item_id, tenant_id) REFERENCES menu_items(id, tenant_id)` + RLS ENABLE + FORCE + iso policy structurally rejects cross-tenant operations       |
| T-04a-03-02 | Tampering      | Slug alias spoofing across tenants  | mitigate    | Composite FK to `menu_items(id, tenant_id)` + RLS iso + `UNIQUE (tenant_id, alias)` prevents tenant A from claiming an alias on tenant B's item               |
| T-04a-03-03 | Spoofing       | Path injection via slug alias       | mitigate    | CHECK constraint `menu_item_slug_aliases_format_chk` rejects any alias not matching `^[a-z0-9][a-z0-9-]*$`; reinforced at DTO layer in plan 05 via Zod refine |
| T-04a-03-04 | Tampering      | RLS bypass on new tables            | mitigate    | Migration 0036 sets ENABLE + FORCE ROW LEVEL SECURITY; preflight `assertNoRlsBypass` runs at boot for `resto_app`; audit script confirms via Task 3           |
| T-04a-03-05 | InfoDisclosure | Stop-list audit leak                | mitigate    | `stopped_by_user_id` is text + nullable; no PII enforced at column level; downstream audit pipeline (plan 05 task) keeps user-id reference scoped to tenant   |
| T-04a-03-SC | Tampering      | Composite-FK audit allowlist drift  | mitigate    | Task 3 verifies `pnpm db:audit-fks` exits 0; introspection-based audit picks up new tables automatically; this is the gating check                            |

</threat_model>

<verification>
- `pnpm --filter @resto/db typecheck` exits 0.
- `pnpm --filter @resto/db db:migrate` applies 3 new migrations cleanly; re-run reports zero pending.
- `pnpm --filter @resto/db db:audit-fks` exits 0.
- Both new tables have RLS ENABLE + FORCE + iso policy (verified via pg_policy + pg_class queries in Task 3 acceptance_criteria).
- `grep -c "0034_catalog_phase4a\|0035_catalog_phase4a\|0036_catalog_phase4a" packages/db/migrations/meta/_journal.json` returns ≥ 3 (journal entries sequential).
</verification>

<success_criteria>

- D-4a-10 stop-list shape implemented as separate `menu_stop_list` table (per researcher recommendation in SCHEMA-MAP §Q5).
- D-4a-04 slug-alias table created with CHECK constraint matching URL-safe regex.
- Composite-FK invariant (ADR-0020 I-2) preserved across the two new tables.
- RLS ENABLE + FORCE applied per `packages/db/CLAUDE.md` §Schema rule.
- `db:audit-fks` BLOCKING gate passes.
  </success_criteria>

<output>
Create `.planning/phases/04a-catalog-schema-api/04A-03-SUMMARY.md` when done summarizing:
- The two new table names + their composite FK constraint names.
- The RLS policy names installed.
- The `db:audit-fks` exit status + table count.
- Whether the audit script required an allowlist update (expected: no).
</output>
