# RES-236 Phase 3b — Composite tenant FK for remaining tenant-scoped children

**Status:** design approved 2026-05-24 — ready for plan.
**Ticket:** [RES-236](https://linear.app/restico/issue/RES-236/build-i-2-enforcement-composite-fk-schema-helper-for-tenant-scoped) — Tier 1 freeze gate-blocker.
**Builds on:** Phase 3a (commit `b834444`) — `compositeTenantFk` / `tenantParentUniqueIndex` helpers + `brand_domains` PoC migration `0024_brand_domains_composite_fk.sql`.
**Authority:** ADR-0020 I-2 (canonical).

## 1. Purpose

Close ADR-0020 I-2 enforcement for all currently-existing tenant-scoped child tables. Every child table that carries `tenant_id NOT NULL` AND a parent `*_id` column must reference its parent via a composite `(parent_id, tenant_id) → parent(id, tenant_id)` foreign key. Without this, the child's `tenant_id` is value-only on join paths — a cross-tenant phantom-row primitive.

Phase 3a delivered the schema helpers and a single PoC migration. Phase 3b applies the same pattern to the remaining child tables.

## 2. Scope

### 2.1 In scope (6 FK across 4 child tables)

| Child table             | Parent column  | Parent table      | Current `onDelete` |
| ----------------------- | -------------- | ----------------- | ------------------ |
| `member_brand_scope`    | `brand_id`     | `brands`          | `cascade`          |
| `menu_items`            | `category_id`  | `menu_categories` | `restrict`         |
| `menu_variants`         | `menu_item_id` | `menu_items`      | `cascade`          |
| `menu_modifier_options` | `modifier_id`  | `menu_modifiers`  | `cascade`          |
| `menu_item_modifiers`   | `menu_item_id` | `menu_items`      | `cascade`          |
| `menu_item_modifiers`   | `modifier_id`  | `menu_modifiers`  | `cascade`          |

Existing `onDelete` semantics are preserved.

Parent tables that need a `(id, tenant_id)` unique index (3, since `brands` got it in Phase 3a):

- `menu_categories`
- `menu_items`
- `menu_modifiers`

### 2.2 Explicitly out of scope

- **Missing `brand_id → brands` FK on `menu_*` / `customer_profiles`.** All `menu_*` tables and `customer_profiles` carry a nullable `brand_id` column with **no FK declared at all today**. This is a separate I-2 gap that will be filed as a follow-up Linear ticket (likely landing in T5b Brand Scoping). Including it here would roughly double the migration surface and exceeds the RES-236 acceptance criteria.
- **`customer_profiles.user_id → user`** — `user` is the Better Auth global table, not tenant-scoped, so no composite FK is needed.
- **`audit_log`** — `tenant_id` is intentionally nullable for platform-level events, so it is not a tenant-scoped child in the I-2 sense.
- **`outbox_events` / `inbox_processed`** — no parent `*_id` columns to migrate.
- **`db:audit-fks` script (RES-255)** — separate ticket. Its priority rises after Phase 3b ships (will become the safety net for new tables).

### 2.3 Phase 3a regressions repaired in this PR

**Critical:** Phase 3a (commit `b834444`) added `0024_brand_domains_composite_fk.sql` but did NOT update `packages/db/migrations/meta/_journal.json`. The `migrate()` runner from `drizzle-orm/postgres-js/migrator` reads only the journal — unregistered SQL files are silently ignored. Consequence: the `brand_domains` composite FK does not exist anywhere — dev, test, or future production. Phase 3b MUST add journal entries for BOTH `0024` and `0025` so both migrations actually apply. Without registering `0024` first, `0025`'s `member_brand_scope_brand_fk` step fails on the missing `brands_id_tenant_uq` index.

**Cosmetic:** `0024_brand_domains_composite_fk.sql` used `ALTER TABLE brands ADD CONSTRAINT brands_id_tenant_uq UNIQUE (id, tenant_id)`, but the schema helper `tenantParentUniqueIndex` emits `CREATE UNIQUE INDEX`. Both are valid FK targets in Postgres, but they differ in how `drizzle-kit` introspects them (`pg_constraint` vs `pg_indexes`). Phase 3b **uses `CREATE UNIQUE INDEX` to match the helper output**, so the 3 new parent unique indexes are consistent with their schema source. The Phase 3a discrepancy on `brands_id_tenant_uq` remains cosmetic — not addressed here.

## 3. Architecture

No architectural change. Phase 3b is a mechanical application of the pattern that Phase 3a established. Every change is local to:

- `packages/db/src/schema/brands.ts` — `memberBrandScope` constraint block.
- `packages/db/src/schema/menu.ts` — both parent and child constraint blocks across `menuCategories`, `menuItems`, `menuVariants`, `menuModifiers`, `menuModifierOptions`, `menuItemModifiers`.
- `packages/db/migrations/0025_composite_tenant_fk_phase_3b.sql` — new hand-authored migration.
- `packages/db/migrations/meta/_journal.json` — add entries for `0024` (Phase 3a repair) and `0025`.
- `packages/db/test/integration/composite-tenant-fk.spec.ts` — new parametrized regression spec.

No application code (repositories, services, controllers) is touched.

## 4. Schema changes

### 4.1 Parents — add `tenantParentUniqueIndex`

For each of `menuCategories`, `menuItems`, `menuModifiers`:

```ts
(table) => [
  // ...existing constraints...
  tenantParentUniqueIndex('<table_name>', { id: table.id, tenantId: table.tenantId }),
],
```

### 4.2 Children — replace `foreignKey` with `compositeTenantFk`

Pattern (illustrated for `menu_variants.menu_item_id → menu_items`):

```ts
// before
foreignKey({
  name: 'menu_variants_item_fk',
  columns: [table.menuItemId],
  foreignColumns: [menuItems.id],
}).onDelete('cascade'),

// after
compositeTenantFk({
  name: 'menu_variants_item_fk',
  child: { id: table.menuItemId, tenantId: table.tenantId },
  parent: { id: menuItems.id, tenantId: menuItems.tenantId },
}).onDelete('cascade'),
```

The FK constraint **name is preserved** across the change so the migration's `DROP CONSTRAINT … / ADD CONSTRAINT …` lines line up cleanly.

`onDelete` is preserved per the table-by-table mapping in §2.1.

## 5. Migration: `0025_composite_tenant_fk_phase_3b.sql`

Hand-authored to follow the Phase 3a precedent (`0024_brand_domains_composite_fk.sql`). 15 statements separated by `--> statement-breakpoint` markers per drizzle's migration runner convention (3 parent unique indexes + 6 child FK DROPs + 6 child FK ADDs).

Shape:

```sql
-- RES-236 Phase 3b: composite tenant FK for remaining tenant-scoped children.
-- ADR-0020 I-2: every tenant-scoped child with parent_id must reference
-- parent(id, tenant_id) so cross-tenant phantom rows are structurally
-- impossible. Phase 3a delivered the helpers + brand_domains PoC; this
-- migration applies the same pattern to the remaining children.

-- §1 Parent unique indexes (id, tenant_id) — FK target requirement.
CREATE UNIQUE INDEX menu_categories_id_tenant_uq ON menu_categories (id, tenant_id);
--> statement-breakpoint
CREATE UNIQUE INDEX menu_items_id_tenant_uq      ON menu_items      (id, tenant_id);
--> statement-breakpoint
CREATE UNIQUE INDEX menu_modifiers_id_tenant_uq  ON menu_modifiers  (id, tenant_id);
--> statement-breakpoint

-- §2 Child FK replacements (DROP value-only → ADD composite).
-- 2.1 member_brand_scope.brand_id → brands(id, tenant_id)
ALTER TABLE member_brand_scope DROP CONSTRAINT member_brand_scope_brand_fk;
--> statement-breakpoint
ALTER TABLE member_brand_scope
  ADD CONSTRAINT member_brand_scope_brand_fk
  FOREIGN KEY (brand_id, tenant_id) REFERENCES brands (id, tenant_id) ON DELETE CASCADE;
--> statement-breakpoint

-- 2.2 menu_items.category_id → menu_categories(id, tenant_id)
ALTER TABLE menu_items DROP CONSTRAINT menu_items_category_fk;
--> statement-breakpoint
ALTER TABLE menu_items
  ADD CONSTRAINT menu_items_category_fk
  FOREIGN KEY (category_id, tenant_id) REFERENCES menu_categories (id, tenant_id) ON DELETE RESTRICT;
--> statement-breakpoint

-- 2.3 menu_variants.menu_item_id → menu_items(id, tenant_id)
ALTER TABLE menu_variants DROP CONSTRAINT menu_variants_item_fk;
--> statement-breakpoint
ALTER TABLE menu_variants
  ADD CONSTRAINT menu_variants_item_fk
  FOREIGN KEY (menu_item_id, tenant_id) REFERENCES menu_items (id, tenant_id) ON DELETE CASCADE;
--> statement-breakpoint

-- 2.4 menu_modifier_options.modifier_id → menu_modifiers(id, tenant_id)
ALTER TABLE menu_modifier_options DROP CONSTRAINT menu_modifier_options_modifier_fk;
--> statement-breakpoint
ALTER TABLE menu_modifier_options
  ADD CONSTRAINT menu_modifier_options_modifier_fk
  FOREIGN KEY (modifier_id, tenant_id) REFERENCES menu_modifiers (id, tenant_id) ON DELETE CASCADE;
--> statement-breakpoint

-- 2.5 menu_item_modifiers.menu_item_id → menu_items(id, tenant_id)
ALTER TABLE menu_item_modifiers DROP CONSTRAINT menu_item_modifiers_item_fk;
--> statement-breakpoint
ALTER TABLE menu_item_modifiers
  ADD CONSTRAINT menu_item_modifiers_item_fk
  FOREIGN KEY (menu_item_id, tenant_id) REFERENCES menu_items (id, tenant_id) ON DELETE CASCADE;
--> statement-breakpoint

-- 2.6 menu_item_modifiers.modifier_id → menu_modifiers(id, tenant_id)
ALTER TABLE menu_item_modifiers DROP CONSTRAINT menu_item_modifiers_modifier_fk;
--> statement-breakpoint
ALTER TABLE menu_item_modifiers
  ADD CONSTRAINT menu_item_modifiers_modifier_fk
  FOREIGN KEY (modifier_id, tenant_id) REFERENCES menu_modifiers (id, tenant_id) ON DELETE CASCADE;
```

### 5.1 Reversibility

The migration is reversible by symmetric `DROP CONSTRAINT … / ADD CONSTRAINT …` back to the value-only shape plus `DROP INDEX` on the three new uniques. A separate `down` SQL is not maintained per `packages/db/CLAUDE.md` convention (forward-only migrations); rollback in production is via a new compensating migration. Locally, `pnpm db:reset` wipes and re-applies — no rollback path is exercised by tests.

### 5.2 Existing-data risk

If existing rows in `menu_items`, `menu_variants`, `menu_modifier_options`, `menu_item_modifiers`, or `member_brand_scope` had `tenant_id` values that did NOT match the parent's `tenant_id`, the `ADD CONSTRAINT … FOREIGN KEY …` statement would fail with `23503` and the migration would abort. In dev and test we expect clean data (seeds use the same tenant per parent/child). For production we have no live tenants yet, so this is a non-risk; the future production-cutover ADR will revisit the safety check.

## 6. Regression test: `composite-tenant-fk.spec.ts`

New file under `packages/db/test/integration/`. Parametrized `describe.each` over the 6 child→parent pairs.

### 6.1 Test invariant

For every tenant-scoped child→parent FK declared as composite, attempting to insert a child row with `tenant_id = A` while pointing `parent_id` at a parent row that lives in `tenant_id = B` must fail with Postgres SQLSTATE `23503` (foreign-key violation). RLS is intentionally bypassed via `withoutTenant` so the test exercises the structural FK guard, not the RLS WITH CHECK clause that already exists for tenant-level inserts.

### 6.2 Shape

```ts
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  isDockerAvailable,
  startPostgres,
  stopPostgres,
  type TestPg,
} from '../setup';
import { schema } from '../../src/index';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

interface FkCase {
  name: string;
  // 1. seed a parent row in the named tenant; return its id.
  seedParent: (pg: TestPg, tenantId: string) => Promise<string>;
  // 2. attempt the cross-tenant child insert; return the rejected promise.
  attemptCrossTenantInsert: (
    pg: TestPg,
    args: { childTenantId: string; parentId: string },
  ) => Promise<unknown>;
}

const CASES: FkCase[] = [
  // member_brand_scope.brand_id → brands
  // menu_items.category_id      → menu_categories
  // menu_variants.menu_item_id  → menu_items
  // menu_modifier_options.modifier_id → menu_modifiers
  // menu_item_modifiers.menu_item_id  → menu_items
  // menu_item_modifiers.modifier_id   → menu_modifiers
];

suite(
  'ADR-0020 I-2: composite tenant FK rejects cross-tenant child insert',
  () => {
    let pg: TestPg;
    let tenantA: string;
    let tenantB: string;

    beforeAll(async () => {
      pg = await startPostgres();
      await pg.db.withoutTenant(
        'seed two tenants for FK regression',
        async (tx) => {
          const [a] = await tx
            .insert(schema.tenants)
            .values({ slug: 'fkcase-a', displayName: 'FK A' })
            .returning({ id: schema.tenants.id });
          const [b] = await tx
            .insert(schema.tenants)
            .values({ slug: 'fkcase-b', displayName: 'FK B' })
            .returning({ id: schema.tenants.id });
          if (!a || !b) throw new Error('Failed to seed tenants.');
          tenantA = a.id;
          tenantB = b.id;
        },
      );
    }, 90_000);

    afterAll(async () => {
      await stopPostgres(pg);
    });

    describe.each(CASES)(
      '$name',
      ({ seedParent, attemptCrossTenantInsert }) => {
        it('rejects with SQLSTATE 23503', async () => {
          const parentId = await seedParent(pg, tenantB);

          const error = await attemptCrossTenantInsert(pg, {
            childTenantId: tenantA,
            parentId,
          }).then(
            () => null,
            (e: unknown) => e,
          );

          expect(error).toBeInstanceOf(Error);
          const cause = (error as Error).cause as { code?: string } | undefined;
          expect(cause?.code).toBe('23503');
        });
      },
    );
  },
);
```

### 6.3 Why `withoutTenant`?

The existing `tenant-isolation.spec.ts` shows that an `INSERT` with `tenantId = B` inside `runInTenantContext({ tenantId: A })` is blocked by the RLS `WITH CHECK` policy with a `row-level security` / `policy` message — that is the **first** line of defense. The Phase 3b test must reach **past** RLS to assert the **second** structural line (FK 23503). `withoutTenant` bypasses RLS (per its documented contract) so the FK is the only guard left.

### 6.4 Cross-link

The existing `tenant-isolation.spec.ts` stays unchanged. Its scope is RLS guard behavior; this new spec's scope is FK structural enforcement. They are complementary — both must be green for I-1 + I-2 coverage.

## 7. Verification (local)

1. `pnpm db:reset` — wipe local db.
2. `pnpm db:migrate` — apply through `0025`.
3. `psql $DATABASE_URL -c "\d member_brand_scope" | grep brand_fk` — confirm composite FK shape; repeat for the other 5.
4. `pnpm --filter @resto/db test integration -- composite-tenant-fk` — new spec passes.
5. `pnpm --filter @resto/db test integration` — full integration suite (incl. `tenant-isolation.spec.ts`) passes without regression.
6. `pnpm typecheck && pnpm lint` for `packages/db`.

## 8. PR shape

- **Branch:** `res-236` (already created off main at `b834444`).
- **Commits (3):**
  1. `fix(db): register 0024 brand_domains composite FK migration (RES-236)` — journal entry for `0024` only. Repairs the Phase 3a oversight. Stands alone so the repair is atomically revertible.
  2. `feat(db): composite tenant FK for remaining tenant-scoped children (RES-236)` — schema edits, migration `0025`, journal entry for `0025`.
  3. `test(db): regression for composite tenant FK on tenant-scoped children (RES-236)` — new spec.
- **PR title:** `feat(db): composite tenant FK for remaining tenant-scoped children (RES-236)`.
- **PR body:** none (per `~/.claude/CLAUDE.md` rule — the why lives in Linear + ADR-0020).

## 9. Follow-ups (file as Linear after `gsd-extract-learnings`)

- **I-2 gap, brand_id**: `menu_*` and `customer_profiles` carry `brand_id` with no FK at all. Composite-FK migration to `brands(id, tenant_id)`. Likely T5b Brand Scoping.
- **Phase 3a cosmetic**: align `brands_id_tenant_uq` to `CREATE UNIQUE INDEX` (or change the helper to `.unique()` constraint form) so schema and migration match.
- **RES-255 priority bump**: `pnpm db:audit-fks` is now the only forward-looking guard against this class of regression and should ship next.

## 10. Risks and mitigations

| Risk                                                                | Mitigation                                                                                                                                                                                       |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Existing rows with `tenant_id` mismatched against parent            | Verified: dev seeds + test setUp all keep child/parent tenants aligned; no production data exists; migration aborts cleanly on `23503` if otherwise.                                             |
| Drizzle-kit detects helper-vs-migration drift on next `db:generate` | Helper output (`CREATE UNIQUE INDEX`) and migration `0025` (`CREATE UNIQUE INDEX`) match; only Phase 3a's `brands_id_tenant_uq` differs (UNIQUE constraint vs index). Flagged in §9, not gating. |
| FK rename mistake breaking other refs                               | All 6 FK constraint names are preserved verbatim across DROP/ADD — no downstream code references constraint names.                                                                               |
| Test flake on testcontainer cold start                              | Re-uses existing `startPostgres` from `test/setup.ts`; same singleFork constraint that the rest of `packages/db` integration tests already rely on.                                              |

## 11. Acceptance criteria

- All 6 FK in `\d` output point at `(parent_id, tenant_id)` → `parent(id, tenant_id)`.
- All 3 new `<parent>_id_tenant_uq` indexes exist on the parents.
- The `brand_domains_brand_fk` from Phase 3a is verifiably composite after a fresh `pnpm db:reset && pnpm db:migrate` (proves the journal repair).
- New spec `composite-tenant-fk.spec.ts` has 6 passing test cases.
- Existing `tenant-isolation.spec.ts` and the rest of `packages/db` integration suite pass without modification.
- Lint + typecheck pass on `packages/db`.
- One PR titled `feat(db): composite tenant FK for remaining tenant-scoped children (RES-236)`.
