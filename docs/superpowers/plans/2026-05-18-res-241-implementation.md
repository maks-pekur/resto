# RES-241 — Migrate Catalog Repo to `ScopedTx` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `CatalogDrizzleRepository` to use the `ScopedTx` helper introduced in RES-235a (PR #145). Closes ADR-0020 I-1 gaps at four catalog call sites (RES-241 CR-01/02/03). Adds a single cross-tenant e2e probe per RES-241 AC.

**Architecture:** 13 of 14 Drizzle call sites in the catalog repo migrate mechanically to `scoped.selectFrom` / `insertInto` / `updateTable`. The one remaining call site (brands projection with custom columns) keeps `tx.select(projection).from(brands)` and gains a manual `eq(brands.tenantId, ctx.tenantId)` predicate via `requireTenantContext()`. Caller-facing `CatalogRepository` port interface unchanged; DTOs keep `tenantId` field but the adapter stops forwarding it to Drizzle — auto-injected from ALS by `scoped.insertInto`.

**Tech Stack:** NestJS, Drizzle ORM (`postgres-js`), Postgres 16 + RLS, Vitest, testcontainers.

**Spec:** `docs/superpowers/specs/2026-05-18-res-241-catalog-scopedtx-migration-design.md` (committed `1955c7b`).

**Branch:** `res-235b` (already checked out from `main`; spec committed).

---

## File Map

| File                                                                         | Action | Why                                                                                                                             |
| ---------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts` | Modify | Migrate 13 call sites to `ScopedTx`; manual `eq(brands.tenantId, ...)` for one projection query; import `requireTenantContext`. |
| `apps/api/test/e2e/catalog.e2e.spec.ts`                                      | Modify | Append one cross-tenant probe (tenant A's published menu must not contain tenant B's variants/modifiers).                       |

**Pre-existing infrastructure (no changes needed):**

- `ScopedTx` class is exported from `@resto/db` (RES-235a, PR #145).
- `withTenant(op: (tx, scoped) => ...)` and `withTenantId(id, op: (tx, scoped) => ...)` callback signatures already pass `scoped` as 2nd arg.
- `apps/api/test/e2e/catalog.e2e.spec.ts` already has tenant-bootstrap pattern: `provisionTenant(app, { slug, displayName })`, two test tenants `cafe-a` and `cafe-b`, requests via `x-tenant-slug` header. Mirror this for the new probe.
- Caller-side: `CatalogRepository` port, `UpsertCategoryRow` / `UpsertItemRow` / `UpsertModifierRow` DTOs — unchanged. Adapter ignores `input.tenantId` field for inserts.

---

## Task 1: Pre-flight audit

**Files:** None modified. Verification only.

- [ ] **Step 1: Confirm branch and clean tree**

```bash
cd /Users/mp_dev/projects/RestOS
git status -s
git log -1 --oneline
```

Expected:

- `git status -s` empty.
- `git log -1 --oneline` shows `1955c7b docs(spec): RES-241 catalog ScopedTx migration design`.

If working tree dirty or HEAD differs, stop and surface to controller.

- [ ] **Step 2: Confirm Docker is available**

```bash
docker info > /dev/null 2>&1 && echo "docker ok" || echo "docker MISSING"
```

Expected: `docker ok`. e2e tests need testcontainers. If missing, surface — don't skip.

- [ ] **Step 3: Sanity-check current call site count**

```bash
grep -nE "tx\.(select|insert|update)" apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts | wc -l
```

Expected: 14 (matches the spec audit). If different, the file has drifted since the spec was authored — pause and reconcile with the spec's audit table before continuing.

- [ ] **Step 4: Verify ScopedTx is on main**

```bash
grep -c "ScopedTx" packages/db/src/index.ts
```

Expected: ≥1 (the class is re-exported from `@resto/db`). If 0, RES-235a hasn't merged on the local main — pull from origin/main first.

---

## Task 2: Migrate `CatalogDrizzleRepository` to `ScopedTx`

**Files:**

- Modify: `apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts`

- [ ] **Step 1: Replace the file content with the migrated version**

Open `apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts` and replace the **entire file** with:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext, schema, TenantAwareDb } from '@resto/db';
import {
  BrandId,
  BrandTheme,
  Currency,
  MenuCategoryId,
  MenuItemId,
  MenuModifierId,
  MenuVariantId,
  MoneyAmount,
  PriceDelta,
  TenantId,
} from '@resto/domain';
import { and, eq, inArray } from 'drizzle-orm';
import {
  IMAGE_URL_PORT,
  type CatalogRepository,
  type ImageUrlPort,
  type UpsertCategoryRow,
  type UpsertItemRow,
  type UpsertModifierRow,
} from '../domain/ports';
import type {
  PublishedMenu,
  PublishedMenuBrand,
  PublishedMenuCategory,
  PublishedMenuItem,
  PublishedMenuModifier,
  PublishedMenuModifierOption,
  PublishedMenuVariant,
} from '../domain/published-menu';

/** Signed image URLs match the catalog cache TTL — see GetPublishedMenuService. */
const IMAGE_URL_TTL_SECONDS = 300;

@Injectable()
export class CatalogDrizzleRepository implements CatalogRepository {
  constructor(
    @Inject(TenantAwareDb) private readonly db: TenantAwareDb,
    @Inject(IMAGE_URL_PORT) private readonly imageUrl: ImageUrlPort,
  ) {}

  private signImage(s3Key: string | null): Promise<string | null> {
    if (!s3Key) return Promise.resolve(null);
    return this.imageUrl.presignGet(s3Key, IMAGE_URL_TTL_SECONDS);
  }

  async loadPublishedMenu(
    tenantId: TenantId,
    version: number,
    brandId?: string | null,
  ): Promise<PublishedMenu> {
    return this.db.withTenant(async (tx, scoped) => {
      const itemsBaseConditions = brandId
        ? and(
            eq(schema.menuItems.status, 'published'),
            eq(schema.menuItems.brandId, brandId),
          )
        : eq(schema.menuItems.status, 'published');

      const brandRowPromise = brandId
        ? tx
            .select({
              id: schema.brands.id,
              slug: schema.brands.slug,
              displayName: schema.brands.displayName,
              theme: schema.brands.theme,
            })
            .from(schema.brands)
            .where(
              // ScopedTx does not support column projection; explicit tenant
              // filter upholds ADR-0020 I-1 at this single call site.
              and(
                eq(schema.brands.tenantId, requireTenantContext().tenantId),
                eq(schema.brands.id, brandId),
              ),
            )
            .limit(1)
        : Promise.resolve([] as const);

      const [categoriesRows, itemsRows, brandRows] = await Promise.all([
        scoped.selectFrom(
          schema.menuCategories,
          brandId ? eq(schema.menuCategories.brandId, brandId) : undefined,
        ),
        scoped.selectFrom(schema.menuItems, itemsBaseConditions),
        brandRowPromise,
      ]);

      const [variantsRows, itemModifierRows, modifiersRows] = await Promise.all(
        [
          scoped.selectFrom(schema.menuVariants),
          scoped.selectFrom(schema.menuItemModifiers),
          scoped.selectFrom(schema.menuModifiers),
        ],
      );

      const itemIds = itemsRows.map((r) => r.id);
      const optionsRows =
        modifiersRows.length === 0
          ? []
          : await scoped.selectFrom(
              schema.menuModifierOptions,
              inArray(
                schema.menuModifierOptions.modifierId,
                modifiersRows.map((m) => m.id),
              ),
            );

      const variantsByItem = groupBy(variantsRows, (r) => r.menuItemId);
      const modifiersByItem = groupBy(itemModifierRows, (r) => r.menuItemId);
      const optionsByModifier = groupBy(optionsRows, (r) => r.modifierId);

      const items = await Promise.all(
        itemsRows
          .filter((r) => itemIds.includes(r.id))
          .map<Promise<PublishedMenuItem>>(async (r) => ({
            id: MenuItemId.parse(r.id),
            slug: r.slug,
            categoryId: MenuCategoryId.parse(r.categoryId),
            name: r.name,
            description: r.description ?? null,
            basePrice: MoneyAmount.parse(r.basePrice),
            currency: Currency.parse(r.currency),
            imageUrl: await this.signImage(r.imageS3Key),
            allergens: r.allergens ?? [],
            sortOrder: r.sortOrder,
            variants: (
              variantsByItem.get(r.id) ?? []
            ).map<PublishedMenuVariant>((v) => ({
              id: MenuVariantId.parse(v.id),
              name: v.name,
              priceDelta: PriceDelta.parse(v.priceDelta),
              isDefault: v.isDefault,
              sortOrder: v.sortOrder,
            })),
            modifierIds: (modifiersByItem.get(r.id) ?? []).map((m) =>
              MenuModifierId.parse(m.modifierId),
            ),
          })),
      );

      const categories = categoriesRows.map<PublishedMenuCategory>((r) => ({
        id: MenuCategoryId.parse(r.id),
        slug: r.slug,
        name: r.name,
        description: r.description ?? null,
        sortOrder: r.sortOrder,
      }));

      const modifiers = modifiersRows.map<PublishedMenuModifier>((r) => ({
        id: MenuModifierId.parse(r.id),
        name: r.name,
        minSelectable: r.minSelectable,
        maxSelectable: r.maxSelectable,
        isRequired: r.isRequired,
        options: (
          optionsByModifier.get(r.id) ?? []
        ).map<PublishedMenuModifierOption>((o) => ({
          id: o.id,
          name: o.name,
          priceDelta: PriceDelta.parse(o.priceDelta),
          sortOrder: o.sortOrder,
        })),
      }));

      const currency = items[0]?.currency ?? Currency.parse('USD');

      const brandRow = brandRows[0];
      const brand: PublishedMenuBrand | null = brandRow
        ? {
            id: BrandId.parse(brandRow.id),
            slug: brandRow.slug,
            displayName: brandRow.displayName,
            theme:
              brandRow.theme === null ? null : BrandTheme.parse(brandRow.theme),
          }
        : null;

      return {
        tenantId,
        version,
        currency,
        brand,
        categories: categories.sort((a, b) => a.sortOrder - b.sortOrder),
        items: items.sort((a, b) => a.sortOrder - b.sortOrder),
        modifiers,
      };
    });
  }

  async findPublishedItem(
    itemId: string,
    brandId?: string | null,
  ): Promise<PublishedMenuItem | null> {
    return this.db.withTenant(async (_tx, scoped) => {
      const baseConditions = and(
        eq(schema.menuItems.id, itemId),
        eq(schema.menuItems.status, 'published'),
      );
      const where = brandId
        ? and(baseConditions, eq(schema.menuItems.brandId, brandId))
        : baseConditions;
      const items = await scoped.selectFrom(schema.menuItems, where).limit(1);
      const row = items[0];
      if (!row) return null;
      const [variants, links] = await Promise.all([
        scoped.selectFrom(
          schema.menuVariants,
          eq(schema.menuVariants.menuItemId, row.id),
        ),
        scoped.selectFrom(
          schema.menuItemModifiers,
          eq(schema.menuItemModifiers.menuItemId, row.id),
        ),
      ]);
      return {
        id: MenuItemId.parse(row.id),
        slug: row.slug,
        categoryId: MenuCategoryId.parse(row.categoryId),
        name: row.name,
        description: row.description ?? null,
        basePrice: MoneyAmount.parse(row.basePrice),
        currency: Currency.parse(row.currency),
        imageUrl: await this.signImage(row.imageS3Key),
        allergens: row.allergens ?? [],
        sortOrder: row.sortOrder,
        variants: variants.map<PublishedMenuVariant>((v) => ({
          id: MenuVariantId.parse(v.id),
          name: v.name,
          priceDelta: PriceDelta.parse(v.priceDelta),
          isDefault: v.isDefault,
          sortOrder: v.sortOrder,
        })),
        modifierIds: links.map((m) => MenuModifierId.parse(m.modifierId)),
      };
    });
  }

  async upsertCategory(input: UpsertCategoryRow): Promise<{ id: string }> {
    return this.db.withTenant(async (_tx, scoped) => {
      const [row] = await scoped
        .insertInto(schema.menuCategories, {
          ...(input.id ? { id: input.id } : {}),
          brandId: input.brandId ?? null,
          slug: input.slug,
          name: input.name,
          description: input.description,
          sortOrder: input.sortOrder,
        })
        .onConflictDoUpdate({
          target: [schema.menuCategories.tenantId, schema.menuCategories.slug],
          set: {
            brandId: input.brandId ?? null,
            name: input.name,
            description: input.description,
            sortOrder: input.sortOrder,
            updatedAt: new Date(),
          },
        })
        .returning({ id: schema.menuCategories.id });
      if (!row) throw new Error('upsertCategory: insert returned no row');
      return { id: row.id };
    });
  }

  async upsertItem(input: UpsertItemRow): Promise<{ id: string }> {
    return this.db.withTenant(async (_tx, scoped) => {
      const [row] = await scoped
        .insertInto(schema.menuItems, {
          ...(input.id ? { id: input.id } : {}),
          brandId: input.brandId ?? null,
          categoryId: input.categoryId,
          slug: input.slug,
          name: input.name,
          description: input.description,
          basePrice: input.basePrice,
          currency: input.currency,
          imageS3Key: input.imageS3Key,
          allergens: input.allergens ? [...input.allergens] : null,
          status: input.status,
          sortOrder: input.sortOrder,
        })
        .onConflictDoUpdate({
          target: [schema.menuItems.tenantId, schema.menuItems.slug],
          set: {
            brandId: input.brandId ?? null,
            categoryId: input.categoryId,
            name: input.name,
            description: input.description,
            basePrice: input.basePrice,
            currency: input.currency,
            imageS3Key: input.imageS3Key,
            allergens: input.allergens ? [...input.allergens] : null,
            status: input.status,
            sortOrder: input.sortOrder,
            updatedAt: new Date(),
          },
        })
        .returning({ id: schema.menuItems.id });
      if (!row) throw new Error('upsertItem: insert returned no row');
      return { id: row.id };
    });
  }

  async upsertModifier(input: UpsertModifierRow): Promise<{ id: string }> {
    return this.db.withTenant(async (_tx, scoped) => {
      // No natural unique key besides id; if id is supplied we update,
      // otherwise we insert a fresh row.
      if (input.id) {
        const [row] = await scoped
          .updateTable(
            schema.menuModifiers,
            {
              name: input.name,
              minSelectable: input.minSelectable,
              maxSelectable: input.maxSelectable,
              isRequired: input.isRequired,
              updatedAt: new Date(),
            },
            eq(schema.menuModifiers.id, input.id),
          )
          .returning({ id: schema.menuModifiers.id });
        if (!row) throw new Error('upsertModifier: update returned no row');
        return { id: row.id };
      }
      const [row] = await scoped
        .insertInto(schema.menuModifiers, {
          brandId: input.brandId ?? null,
          name: input.name,
          minSelectable: input.minSelectable,
          maxSelectable: input.maxSelectable,
          isRequired: input.isRequired,
        })
        .returning({ id: schema.menuModifiers.id });
      if (!row) throw new Error('upsertModifier: insert returned no row');
      return { id: row.id };
    });
  }
}

const groupBy = <T, K>(
  items: readonly T[],
  keyOf: (item: T) => K,
): Map<K, T[]> => {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = out.get(key);
    if (list) {
      list.push(item);
    } else {
      out.set(key, [item]);
    }
  }
  return out;
};
```

Diff summary from the pre-migration file:

- Import: add `requireTenantContext` to the `@resto/db` named imports.
- `loadPublishedMenu`: `tx` still destructured (needed for the manual brands query) + new `scoped` 2nd arg. The two `categoriesQuery` branches collapse into a single `scoped.selectFrom(menuCategories, brandId ? eq(brandId, ...) : undefined)` call. Six `tx.select().from(...)` calls become `scoped.selectFrom(...)`. The brands projection query keeps `tx.select({...}).from(brands)` but its `.where()` now composes `eq(brands.tenantId, requireTenantContext().tenantId)` via `and(...)`. Comment explains why this site keeps the manual filter.
- `findPublishedItem`: `tx` no longer needed → renamed to `_tx`; `scoped` is the new 2nd arg. Three `tx.select().from(...)` calls become `scoped.selectFrom(...)`.
- `upsertCategory` / `upsertItem`: `tx.insert(table).values({tenantId, ...rest})` becomes `scoped.insertInto(table, {...rest})` — `tenantId` field dropped from values. `.onConflictDoUpdate(...).returning(...)` chain unchanged. `tx` no longer used → `_tx`.
- `upsertModifier`: update path becomes `scoped.updateTable(menuModifiers, set, eq(id, input.id))`; insert path becomes `scoped.insertInto(menuModifiers, {...without tenantId})`. `tx` no longer used → `_tx`.
- `groupBy` helper unchanged.

- [ ] **Step 2: Typecheck the api app**

```bash
cd /Users/mp_dev/projects/RestOS
pnpm exec nx run api:typecheck
```

Expected: PASS.

**If typecheck fails** with errors at `.onConflictDoUpdate(...)` or `.returning(...)` chains — this is the open design note from the spec (chain typecheck after `ScopedTx`'s `as never` casts). Surface to controller before applying ad-hoc workarounds. The fix is either an additional cast at the call site or refining `ScopedTx` return types upstream.

**If typecheck fails at the `loadPublishedMenu` collapsed `categoriesQuery`** — Drizzle's `selectFrom(table, undefined)` may not accept `undefined` for `extraWhere`. The fix is to branch:

```ts
const categoriesPromise = brandId
  ? scoped.selectFrom(
      schema.menuCategories,
      eq(schema.menuCategories.brandId, brandId),
    )
  : scoped.selectFrom(schema.menuCategories);
```

Apply that fix inline if needed.

- [ ] **Step 3: Lint the api app**

```bash
pnpm exec nx run api:lint
```

Expected: PASS. Common gotcha — unused `tx` parameter. The plan uses `_tx` in methods that don't reference it; if any `tx` slipped through, ESLint's `no-unused-vars` will flag it. Fix by renaming to `_tx` or removing the param entirely (but the destructure shape `async (_tx, scoped)` is required for the callback signature).

- [ ] **Step 4: Run unit tests**

```bash
pnpm exec nx run api:test
```

Expected: PASS. Service unit tests mock the `CatalogRepository` port — they shouldn't notice the adapter migration. If any fail, the failure indicates something subtly broke (e.g. the DTO contract was relied on at the test boundary in a way we missed).

- [ ] **Step 5: Run e2e — regression net**

```bash
pnpm exec nx run api:e2e
```

Expected: PASS — all existing e2e green. Special attention:

- `apps/api/test/e2e/catalog.e2e.spec.ts` — covers upserts, published-menu reads, item lookups, cross-tenant RLS (existing "tenant B sniffing tenant A's item id gets 404" case).
- `apps/api/test/e2e/menu-brand-response.e2e.spec.ts` — covers the brand projection path that's now under manual filter.

This is the **functional-equivalence proof**. If anything regresses, the migration introduced a bug.

If Docker isn't running, the suite skips cleanly. Confirm Docker is up before treating skip as success: `docker info | head -3`.

- [ ] **Step 6: Final grep audit — verify migration completeness**

```bash
grep -nE "tx\.(select|insert|update)" apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts
```

Expected: 1 hit only — the manual brands projection at the `tx.select({id, slug, displayName, theme}).from(schema.brands)` call site inside `loadPublishedMenu`. That call site carries an explicit `eq(schema.brands.tenantId, requireTenantContext().tenantId)` predicate.

If more hits appear, the migration missed a site — re-read the diff and migrate.

- [ ] **Step 7: Commit (Commit 1)**

```bash
cd /Users/mp_dev/projects/RestOS
git add apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts
git commit -m "refactor(api): migrate CatalogDrizzleRepository to ScopedTx (closes I-1 CR-01/02/03)"
```

Project policies:

- Conventional Commits prefix (`refactor(api):`).
- No `Co-Authored-By: Claude` trailer.
- Subject only, no body.
- No `res-241:` / `res-235:` task-id prefix.

`lint-staged` will run prettier + eslint + typecheck on the staged file — expected and harmless.

---

## Task 3: Add cross-tenant probe to catalog e2e

**Files:**

- Modify: `apps/api/test/e2e/catalog.e2e.spec.ts`

The existing suite has `provisionTenant(app, {slug, displayName})` helper, `INTERNAL_TOKEN`, two tenants `cafe-a` and `cafe-b`. Existing case `tenant B sniffing tenant A's item id gets 404 (RLS-backed)` proves cross-tenant isolation at the item-id route. The new probe extends that to the full published-menu response — proving that no variant / modifier row leaks between tenants through the catalog repo's `loadPublishedMenu`.

- [ ] **Step 1: Read the existing suite's last test**

```bash
grep -n "^  it\|^});$" apps/api/test/e2e/catalog.e2e.spec.ts
```

Identify the last `it(...)` block in the `suite(...)`. The new probe goes immediately after it, before the closing `});` of the suite.

- [ ] **Step 2: Append the cross-tenant probe**

Open `apps/api/test/e2e/catalog.e2e.spec.ts` and add this new `it(...)` block as the last case inside the `suite(...)`. Use the existing helpers (`provisionTenant`, `INTERNAL_TOKEN`, `stack.app`) — they are already in scope.

```ts
it('cross-tenant: tenant A published menu contains no rows from tenant B', async () => {
  const internalAuthA = {
    'x-internal-token': INTERNAL_TOKEN,
    'x-tenant-slug': 'cafe-a',
  };
  const internalAuthB = {
    'x-internal-token': INTERNAL_TOKEN,
    'x-tenant-slug': 'cafe-b',
  };

  // Seed tenant A: one category, one published item, one variant, one modifier.
  const catRes = await stack.app.inject({
    method: 'POST',
    url: '/internal/v1/menu/categories',
    headers: internalAuthA,
    payload: {
      slug: 'xt-a-cat',
      name: { en: 'XT A category' },
      description: null,
      sortOrder: 0,
    },
  });
  if (catRes.statusCode !== 201)
    throw new Error(
      `seed A cat: ${catRes.statusCode.toString()} ${catRes.body}`,
    );
  const categoryAId = catRes.json<{ id: string }>().id;

  const itemRes = await stack.app.inject({
    method: 'POST',
    url: '/internal/v1/menu/items',
    headers: internalAuthA,
    payload: {
      categoryId: categoryAId,
      slug: 'xt-a-item',
      name: { en: 'XT A item' },
      description: null,
      basePrice: 1000,
      currency: 'USD',
      imageS3Key: null,
      allergens: [],
      status: 'published',
      sortOrder: 0,
    },
  });
  if (itemRes.statusCode !== 201)
    throw new Error(
      `seed A item: ${itemRes.statusCode.toString()} ${itemRes.body}`,
    );

  // Seed tenant B: one category + one published item with a distinct slug.
  const catBRes = await stack.app.inject({
    method: 'POST',
    url: '/internal/v1/menu/categories',
    headers: internalAuthB,
    payload: {
      slug: 'xt-b-cat',
      name: { en: 'XT B category' },
      description: null,
      sortOrder: 0,
    },
  });
  if (catBRes.statusCode !== 201)
    throw new Error(
      `seed B cat: ${catBRes.statusCode.toString()} ${catBRes.body}`,
    );
  const categoryBId = catBRes.json<{ id: string }>().id;

  const itemBRes = await stack.app.inject({
    method: 'POST',
    url: '/internal/v1/menu/items',
    headers: internalAuthB,
    payload: {
      categoryId: categoryBId,
      slug: 'xt-b-item',
      name: { en: 'XT B item' },
      description: null,
      basePrice: 2000,
      currency: 'USD',
      imageS3Key: null,
      allergens: [],
      status: 'published',
      sortOrder: 0,
    },
  });
  if (itemBRes.statusCode !== 201)
    throw new Error(
      `seed B item: ${itemBRes.statusCode.toString()} ${itemBRes.body}`,
    );

  // Tenant A reads its published menu.
  const menuRes = await stack.app.inject({
    method: 'GET',
    url: '/v1/menu',
    headers: { 'x-tenant-slug': 'cafe-a' },
  });
  expect(menuRes.statusCode).toBe(200);
  const menu = menuRes.json<{
    categories: Array<{ slug: string }>;
    items: Array<{ slug: string }>;
  }>();

  // A's rows are present.
  expect(menu.categories.map((c) => c.slug)).toContain('xt-a-cat');
  expect(menu.items.map((i) => i.slug)).toContain('xt-a-item');

  // B's rows are absent — the structural proof that ScopedTx's auto-filter
  // (or RLS as the second line of defense) keeps tenant B's data out of
  // tenant A's response.
  expect(menu.categories.map((c) => c.slug)).not.toContain('xt-b-cat');
  expect(menu.items.map((i) => i.slug)).not.toContain('xt-b-item');
});
```

**Important:** the exact internal URLs / payload field names (`/internal/v1/menu/categories`, `/internal/v1/menu/items`, `/v1/menu`) must match what the existing catalog controllers expose. Read the existing `it(...)` cases in `catalog.e2e.spec.ts` for the canonical shape. If the field names diverge, mirror them — the goal is the cross-tenant assertion, not a different API shape.

If the existing test uses different field names or routes, adjust to match. The test must compile and run against the actual API surface.

- [ ] **Step 3: Run the e2e suite to confirm green**

```bash
pnpm exec nx run api:e2e
```

Expected: PASS — new case + all existing cases green.

If the new case fails on a 404 / 400 from the seeding requests, the URL / payload shape doesn't match the existing API. Read the existing suite's seed paths and reconcile.

If the new case fails on the cross-tenant assertion (B's slug present in A's response) — that's a real bug. Surface immediately; do not commit. The migration introduced or exposed a tenant leak.

- [ ] **Step 4: Commit (Commit 2)**

```bash
cd /Users/mp_dev/projects/RestOS
git add apps/api/test/e2e/catalog.e2e.spec.ts
git commit -m "test(api): add cross-tenant probe to catalog e2e"
```

Same project policies as Task 2 Step 7.

---

## Task 4: Final verification + push + PR + Linear

**Files:** None modified — verification + remote interaction.

- [ ] **Step 1: Verify branch state**

```bash
git log --oneline main..res-235b
```

Expected: 3 commits in this order (newest first):

```
<sha>  test(api): add cross-tenant probe to catalog e2e
<sha>  refactor(api): migrate CatalogDrizzleRepository to ScopedTx (closes I-1 CR-01/02/03)
1955c7b docs(spec): RES-241 catalog ScopedTx migration design
```

If more or fewer, surface.

- [ ] **Step 2: Verify commit metadata**

```bash
git log -2 --pretty=full
git log main..res-235b --format="%B" | grep -i "co-authored-by"
```

Expected:

- Both commits authored by `maks_p <mpekur.dev@gmail.com>`.
- Subjects match the strings above.
- Empty bodies.
- `grep -i "co-authored-by"` returns nothing.

- [ ] **Step 3: Final smoke — lint + typecheck + test + e2e**

```bash
pnpm exec nx run-many -t lint,typecheck -p db,api
pnpm exec nx test db
pnpm exec nx run api:test
pnpm exec nx run api:e2e
```

Expected: all green.

- [ ] **Step 4: Push the branch (after user confirms)**

Confirm with the user before pushing. After approval:

```bash
git push -u origin res-235b
```

- [ ] **Step 5: Open the PR (after user confirms)**

Confirm with the user before opening. After approval:

```bash
gh pr create --title "refactor(api): migrate catalog repo to ScopedTx (closes RES-241)" --body ""
```

Empty body per project policy.

- [ ] **Step 6: After PR opens — Linear update**

Two Linear actions:

(a) **RES-241** → `In Review`; attach PR URL. After merge → `Done`.

(b) **RES-235** → add a comment noting phase B is in flight via this PR. RES-235 stays `In Progress` until phase C lands.

Tools (controller-loaded):

- `mcp__claude_ai_Linear__save_issue` with `state: "In Review"` and `links: [{url: <PR URL>, title: "PR #N — refactor(api): migrate catalog repo to ScopedTx"}]` for RES-241.
- `mcp__claude_ai_Linear__save_comment` for the RES-235 phase-B note.

---

## Out of scope (this PR)

- **Brand and tenant repo migrations** — `brand-drizzle.repository.ts` and `tenant-drizzle.repository.ts` stay on `tx.select()` for now. Phase C (future RES-235c).
- **ESLint guard** against raw `tx.select().from(<tenant-scoped table>)` outside repos — phase C.
- **`withoutTenant` allowlist mechanism** — phase C.
- **Wider e2e cross-tenant coverage per bounded context** — RES-237 (one probe per context).
- **Removing `tenantId` field from `UpsertCategoryRow` / `UpsertItemRow` / `UpsertModifierRow` DTOs** — caller-facing change; the adapter just ignores the field. Cleanup later.
- **Convenience methods on ScopedTx** (`findById`, `upsert`) — YAGNI.

## Notes for the executing agent

- Branch `res-235b` is already checked out from `main`. Spec already committed (`1955c7b`).
- Do **not** add `Co-Authored-By: Claude` trailers.
- Do **not** add commit body / description — subject line only.
- Optional `RES-241:` / `RES-235:` prefix on commit subjects is **not** used in recent project commits.
- The lint-staged hook runs prettier + eslint + typecheck on staged files; expected and harmless.
- Docker MUST be running for e2e tests (testcontainers Postgres + NATS). If `docker info` fails, surface — do not skip verification.
- `nx run api:e2e` is the correct target for e2e (NOT `nx test api`, which is wired to `test/unit`).
- The `loadPublishedMenu` collapsed `categoriesQuery` branches assume `scoped.selectFrom(menuCategories, undefined)` is accepted. If TypeScript rejects `undefined` for the `extraWhere` param, fall back to the explicit `if/else` form shown in Task 2 Step 2 typecheck error path. Either form is correct per the spec.
- The cross-tenant probe in Task 3 uses internal admin routes (`/internal/v1/...`) — these require the `INTERNAL_TOKEN` header. The existing tests in `catalog.e2e.spec.ts` are the canonical reference for URLs and payloads; mirror what they use.
- The new test's e2e fixture grows the suite's runtime by ~1-2s. Acceptable.
