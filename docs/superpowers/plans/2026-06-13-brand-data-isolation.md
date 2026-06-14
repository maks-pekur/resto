# Brand Data Isolation (Phase 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every menu entity belong to exactly one brand (`brand_id NOT NULL`), scope every catalog mutation to the operator's active brand, and make slug uniqueness brand-aware — so one brand can no longer overwrite or archive another brand's menu within the same tenant (AUDIT #2 + #3).

**Architecture:** Brand ownership is enforced at the application/repository layer (the `ScopedTx` fence), mirroring tenant isolation. A migration backfills + `SET NOT NULL` on `brand_id` and swaps slug uniqueness to `(tenant_id, brand_id, slug)`. Write services require an active brand (`requireBrandId()`); the repository adds `eq(brand_id, activeBrand)` to every by-id update/archive/delete and changes `ON CONFLICT` targets to include `brand_id`. Cross-brand by-id access returns the existing not-found error.

**Tech Stack:** Drizzle ORM + hand-edited SQL migration (Postgres), NestJS catalog context, Vitest e2e + testcontainer migration test.

**Spec:** `docs/superpowers/specs/2026-06-13-brand-data-isolation-design.md`

**Project rules:** NO code comments. Conventional-commit subjects only (no body, no Claude attribution). Commit per task. Pre-commit hook runs prettier/eslint/typecheck.

---

## File Structure

| File                                                                                                                                                                | Change                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `packages/db/src/schema/menu.ts`                                                                                                                                    | `brand_id` `.notNull()` on 6 tables; slug `uniqueIndex` → `(tenantId, brandId, slug)` on categories + items            |
| `packages/db/migrations/00NN_*.sql` (new)                                                                                                                           | Backfill null brand_id → tenant brand; `SET NOT NULL`; drop+recreate slug unique indexes                               |
| `apps/api/src/contexts/catalog/application/upsert-item.service.ts`, `upsert-modifier-group.service.ts`, `upsert-modifier-option.service.ts`, `stop-list.service.ts` | `getBrandId() ?? null` → `requireBrandId()`                                                                            |
| `apps/api/src/contexts/catalog/application/upsert-category.service.ts`, `upsert-item-size.service.ts`                                                               | add `brandId = requireBrandId()` + thread to repo                                                                      |
| `apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts`                                                                                        | brand-ownership predicate on all by-id mutations; `ON CONFLICT` targets include `brandId`; child inserts set `brandId` |
| `apps/api/src/contexts/catalog/domain/ports.ts` (Row types)                                                                                                         | add required `brandId: string` to the upsert Row types that lack it                                                    |
| `apps/api/test/e2e/catalog-brand-isolation.e2e.spec.ts` (new)                                                                                                       | cross-brand write isolation + slug independence proof                                                                  |
| `packages/db/test/integration/brand-id-not-null.spec.ts` (new)                                                                                                      | migration: backfill + NOT NULL + new index behavior                                                                    |

---

## Task 1: Migration + schema — `brand_id NOT NULL` + brand-scoped slug uniqueness

**Files:**

- Modify: `packages/db/src/schema/menu.ts`
- Create: `packages/db/migrations/00NN_catalog_brand_id_not_null.sql` (NN = next number after the highest in `packages/db/migrations/`, currently 0043 → use `0044`)

- [ ] **Step 1: Make `brand_id` NOT NULL in the schema and brand-scope the slug indexes**

In `packages/db/src/schema/menu.ts`, for each table's `brandId` column change `uuid('brand_id')` → `uuid('brand_id').notNull()`. The 6 tables: `menuCategories`, `menuItems`, `menuItemSizes`, `menuModifierGroups`, `menuModifierOptions`, `menuItemModifierGroups`.

Change the two slug unique indexes:

```typescript
uniqueIndex('menu_categories_tenant_slug_uq').on(table.tenantId, table.slug),
```

→

```typescript
uniqueIndex('menu_categories_brand_slug_uq').on(table.tenantId, table.brandId, table.slug),
```

and likewise for items:

```typescript
uniqueIndex('menu_items_brand_slug_uq').on(table.tenantId, table.brandId, table.slug),
```

- [ ] **Step 2: Generate the DDL migration, then hand-prepend the backfill**

Run: `pnpm db:generate`
This emits a new migration with the `ALTER COLUMN … SET NOT NULL`, `DROP INDEX menu_*_tenant_slug_uq`, and `CREATE UNIQUE INDEX menu_*_brand_slug_uq`. Rename/inspect the generated file as `0044_catalog_brand_id_not_null.sql`.

**Critical:** `SET NOT NULL` will fail on existing `brand_id IS NULL` rows. Hand-edit the generated SQL so the backfill runs FIRST, before any `SET NOT NULL`. Prepend:

```sql
UPDATE "menu_categories" mc SET "brand_id" = (
  SELECT b."id" FROM "brands" b WHERE b."tenant_id" = mc."tenant_id" ORDER BY b."created_at" LIMIT 1
) WHERE mc."brand_id" IS NULL;
UPDATE "menu_items" mi SET "brand_id" = (
  SELECT b."id" FROM "brands" b WHERE b."tenant_id" = mi."tenant_id" ORDER BY b."created_at" LIMIT 1
) WHERE mi."brand_id" IS NULL;
UPDATE "menu_item_sizes" ms SET "brand_id" = (
  SELECT b."id" FROM "brands" b WHERE b."tenant_id" = ms."tenant_id" ORDER BY b."created_at" LIMIT 1
) WHERE ms."brand_id" IS NULL;
UPDATE "menu_modifier_groups" mg SET "brand_id" = (
  SELECT b."id" FROM "brands" b WHERE b."tenant_id" = mg."tenant_id" ORDER BY b."created_at" LIMIT 1
) WHERE mg."brand_id" IS NULL;
UPDATE "menu_modifier_options" mo SET "brand_id" = (
  SELECT b."id" FROM "brands" b WHERE b."tenant_id" = mo."tenant_id" ORDER BY b."created_at" LIMIT 1
) WHERE mo."brand_id" IS NULL;
UPDATE "menu_item_modifier_groups" mig SET "brand_id" = (
  SELECT b."id" FROM "brands" b WHERE b."tenant_id" = mig."tenant_id" ORDER BY b."created_at" LIMIT 1
) WHERE mig."brand_id" IS NULL;
```

(If `brands` columns differ — verify the brand table/column names in `packages/db/src/schema/brands.ts` — use the real `created_at`/`tenant_id`/`id` column names.)

A tenant with menu rows but no brand leaves rows NULL → the subsequent `SET NOT NULL` aborts the migration with a clear error. That is the intended fail-loud (pre-revenue; indicates bad seed data).

- [ ] **Step 3: Apply migration against a scratch DB to confirm it runs**

Run: `pnpm db:migrate` (with a local dev DB that has seed data) OR rely on the Task 5 testcontainer test. Expected: migration applies cleanly; `\d menu_items` shows `brand_id … not null` and index `menu_items_brand_slug_uq`.

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm exec nx typecheck db`
Expected: PASS (schema types now have non-nullable brandId).

```bash
git add packages/db/src/schema/menu.ts packages/db/migrations/0044_catalog_brand_id_not_null.sql
git commit -m "feat(db): brand_id NOT NULL + brand-scoped menu slug uniqueness"
```

---

## Task 2: Write services require an active brand

**Files:**

- Modify: `apps/api/src/contexts/catalog/application/upsert-item.service.ts`, `upsert-modifier-group.service.ts`, `upsert-modifier-option.service.ts`, `stop-list.service.ts` (already read brand)
- Modify: `apps/api/src/contexts/catalog/application/upsert-category.service.ts`, `upsert-item-size.service.ts` (do NOT set brand yet)
- Modify: `apps/api/src/contexts/catalog/domain/ports.ts` — the upsert Row types

- [ ] **Step 1: Switch existing brand reads to `requireBrandId`**

In each of `upsert-item.service.ts`, `upsert-modifier-group.service.ts`, `upsert-modifier-option.service.ts`, `stop-list.service.ts`: change the import to include `requireBrandId` and replace

```typescript
const brandId = getBrandId() ?? null;
```

with

```typescript
const brandId = requireBrandId();
```

Remove `getBrandId` from the import if it's no longer used in that file. (`stop-list.service.ts` uses `brandId` for both the write and the cache `invalidate(tenantId, version, brandId)` call — keep passing the now-non-null `brandId` to both.)

- [ ] **Step 2: Add brand to the two services that lack it**

In `upsert-category.service.ts` and `upsert-item-size.service.ts`: import `requireBrandId` from `@resto/db`, add `const brandId = requireBrandId();`, and pass `brandId` in the object handed to the repo method (mirror how `upsert-item.service.ts` passes `brandId`).

- [ ] **Step 3: Make `brandId` required on the Row types**

In `apps/api/src/contexts/catalog/domain/ports.ts`, find the upsert Row types (`UpsertCategoryRow`, `UpsertItemRow`, `UpsertModifierGroupRow`, `UpsertModifierOptionRow`, `UpsertItemSizeRow`, and the stop-list input type). Change `brandId?: string | null` (or `brandId: string | null`) to **`brandId: string`** on each. This makes the compiler enforce that every write supplies a brand.

- [ ] **Step 4: Typecheck (will fail in the repository — expected, fixed in Task 3)**

Run: `pnpm exec nx typecheck api`
Expected: errors ONLY in `catalog-drizzle.repository.ts` (it still does `input.brandId ?? null`). That's the Task 3 surface. If errors appear elsewhere (e.g. a caller passing null), fix those callers to supply a brand. Do not commit yet if other contexts break — resolve them.

- [ ] **Step 5: Commit (after Task 3 makes typecheck green — these two tasks land together)**

Defer the commit; Task 2 + Task 3 are one compile unit. Proceed to Task 3, then commit both.

---

## Task 3: Repository — brand-ownership predicates + ON CONFLICT targets

**Files:**

- Modify: `apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts`

The repo uses a `scoped` wrapper that already auto-appends `eq(tenant_id)`. You ADD a brand predicate on top. `input.brandId` is now a required `string` (Task 2).

- [ ] **Step 1: `upsertCategory` (around line 284)** — replace every `input.brandId ?? null` with `input.brandId`, and change the `onConflictDoUpdate` target:

```typescript
.onConflictDoUpdate({
  target: [schema.menuCategories.tenantId, schema.menuCategories.brandId, schema.menuCategories.slug],
  set: {
    brandId: input.brandId,
    parentId: input.parentId ?? null,
    name: input.name,
    description: input.description,
    sortOrder: input.sortOrder,
    updatedAt: new Date(),
  },
})
```

and the insert's `brandId: input.brandId ?? null` → `brandId: input.brandId`.

- [ ] **Step 2: `upsertItem` (around line 313)** — three edits:

(a) **id-path cross-brand guard.** The existing-row select returns full rows, so check the brand and treat a cross-brand id as not-found (prevents the insert-branch PK conflict):

```typescript
if (input.id) {
  const existing = await scoped
    .selectFrom(schema.menuItems, eq(schema.menuItems.id, input.id))
    .limit(1);
  if (existing.length > 0 && existing[0]?.brandId !== input.brandId) {
    throw new MenuItemNotFoundError(input.id);
  }
  oldSlug = existing[0]?.slug ?? null;
  ...
```

(Confirm `MenuItemNotFoundError` is exported from the catalog domain errors and takes the id; it's already imported/used elsewhere in this file — `MenuCategoryNotFoundError` is used at line ~745. If `MenuItemNotFoundError` isn't imported, add it.)

(b) **update branch WHERE** — scope by brand too:

```typescript
eq(schema.menuItems.id, input.id),
```

→

```typescript
and(eq(schema.menuItems.id, input.id), eq(schema.menuItems.brandId, input.brandId)),
```

(`and` is already imported in this file; verify.)

(c) **no-id onConflict target + all `brandId: input.brandId ?? null` → `brandId: input.brandId`:**

```typescript
target: [schema.menuItems.tenantId, schema.menuItems.brandId, schema.menuItems.slug],
```

- [ ] **Step 3: by-id update/archive methods — add the brand predicate.** For each of these methods, the existing by-id `updateTable(table, {...}, eq(table.id, id))` / archive WHERE gains an `and(…, eq(table.brandId, brandId))`, and the method signature must receive the active `brandId`. Methods + the brand source:

| Method                                                     | Change                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `upsertModifierGroup` (line ~467)                          | update branch `eq(id)` → `and(eq(id), eq(brandId, input.brandId))`; insert `brandId: input.brandId`                                                                                                                                                       |
| `upsertModifierOption` (line ~500)                         | same pattern, `input.brandId`                                                                                                                                                                                                                             |
| `upsertItemSize` (line ~537)                               | same pattern, `input.brandId`                                                                                                                                                                                                                             |
| `removeFromStopList` (line ~609)                           | its by-id delete/update gains `eq(brandId, …)`. Pass the active brand into this method (add a `brandId: string` param; `stop-list.service.ts` already has `brandId = requireBrandId()` — thread it through)                                               |
| `archiveCategory` (line ~1068)                             | takes `id`; add a `brandId` param; the by-id update gains `and(eq(id), eq(brandId))`; the `{ found }` result already maps to not-found at the service, so a cross-brand id naturally returns `found: false` → not-found                                   |
| `archiveItem` (line ~1081)                                 | same as archiveCategory                                                                                                                                                                                                                                   |
| `reorderCategories` / `applyCategoryMoves` (line ~700-760) | each per-move by-id update gains `eq(brandId)`; a move targeting another brand's category → its update matches 0 rows → throw `MenuCategoryNotFoundError(move.id)` (the not-found throw already exists at ~745; ensure the brand-scoped update drives it) |

For `archiveCategory`/`archiveItem`/`removeFromStopList`/`reorderCategories`, update the **port interface** in `domain/ports.ts` (`CatalogRepository`) to add the `brandId: string` parameter, and update the **callers** (the application services `archive-category.service.ts`, `archive-item.service.ts`, `reorder-categories.service.ts`, `stop-list.service.ts`) to pass `requireBrandId()`.

- [ ] **Step 4: Typecheck the whole API**

Run: `pnpm exec nx typecheck api`
Expected: PASS. Fix any remaining `brandId` nullability or missing-arg errors until clean.

- [ ] **Step 5: Lint + commit Tasks 2+3 together**

Run: `pnpm exec nx lint api`

```bash
git add apps/api/src/contexts/catalog
git commit -m "feat(api): scope catalog mutations to the active brand"
```

---

## Task 4: e2e — cross-brand write isolation + slug independence (the proof)

**Files:**

- Create: `apps/api/test/e2e/catalog-brand-isolation.e2e.spec.ts`

Model the setup on `apps/api/test/e2e/catalog.e2e.spec.ts` (owner session via `operator-fixture`; `REQUIRE_EMAIL_VERIFICATION='false'` + rate-limit envs in `beforeAll`). Create TWO brands in one tenant via `POST /v1/me/brands` (owner has `brand:create`), then drive catalog writes with `x-brand-slug` set per brand.

- [ ] **Step 1: Write the test**

```typescript
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';
import {
  provisionTenant,
  runBootstrap,
  signInAsOperator,
} from './helpers/operator-fixture';

const INTERNAL_TOKEN = 'integration-test-token-1234567890';
const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;
if (!dockerOk)
  console.warn(
    '[catalog-brand-isolation.e2e] Docker not available — skipping.',
  );

suite('Catalog — brand data isolation (AUDIT #2/#3)', () => {
  let stack: RealStack;
  let ownerCookie: string;
  let tenantId: string;
  let brandASlug: string;
  let brandBSlug: string;

  const createBrand = async (
    slug: string,
    displayName: string,
  ): Promise<void> => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/me/brands',
      headers: { cookie: ownerCookie, 'x-tenant-id': tenantId },
      payload: { slug, displayName },
    });
    expect(res.statusCode).toBe(201);
  };

  const createItem = async (
    brandSlug: string,
    body: Record<string, unknown>,
  ): Promise<{ status: number; id?: string }> => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/items',
      headers: {
        cookie: ownerCookie,
        'x-tenant-id': tenantId,
        'x-brand-slug': brandSlug,
      },
      payload: body,
    });
    return {
      status: res.statusCode,
      id: res.statusCode === 200 ? res.json<{ id: string }>().id : undefined,
    };
  };

  const makeItem = (categoryId: string, slug: string) => ({
    categoryId,
    slug,
    name: { en: 'X' },
    basePrice: '1.00',
    currency: 'USD',
    status: 'draft',
  });

  const createCategory = async (
    brandSlug: string,
    slug: string,
  ): Promise<string> => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers: {
        cookie: ownerCookie,
        'x-tenant-id': tenantId,
        'x-brand-slug': brandSlug,
      },
      payload: { slug, name: { en: slug }, sortOrder: 0 },
    });
    expect(res.statusCode).toBe(200);
    return res.json<{ id: string }>().id;
  };

  beforeAll(async () => {
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN = '1000';
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN = '1000';
    process.env.RATE_LIMIT_INTERNAL_PER_MIN = '10000';
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    stack = await startRealStack();
    const slug = `cafe-${randomUUID().slice(0, 8)}`;
    const email = `owner-${randomUUID().slice(0, 8)}@example.com`;
    const password = 'Sup3r-Secret-Pw!';
    const tenant = await provisionTenant(stack.app, slug, INTERNAL_TOKEN);
    tenantId = tenant.id;
    await runBootstrap({ tenantSlug: slug, email, password, name: 'Owner' });
    ownerCookie = await signInAsOperator(stack.app, email, password, tenant.id);
    brandASlug = `brand-a-${randomUUID().slice(0, 6)}`;
    brandBSlug = `brand-b-${randomUUID().slice(0, 6)}`;
    await createBrand(brandASlug, 'Brand A');
    await createBrand(brandBSlug, 'Brand B');
  }, 180_000);

  afterAll(async () => {
    if (stack) await stopRealStack(stack);
  });

  it('an operator on brand B cannot archive a brand-A item (404)', async () => {
    const catA = await createCategory(
      brandASlug,
      `cat-${randomUUID().slice(0, 6)}`,
    );
    const a = await createItem(
      brandASlug,
      makeItem(catA, `cola-${randomUUID().slice(0, 6)}`),
    );
    expect(a.status).toBe(200);

    const res = await stack.app.inject({
      method: 'PATCH',
      url: `/v1/catalog/items/${a.id}/archive`,
      headers: {
        cookie: ownerCookie,
        'x-tenant-id': tenantId,
        'x-brand-slug': brandBSlug,
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it('an operator on brand B cannot overwrite a brand-A item by id', async () => {
    const catA = await createCategory(
      brandASlug,
      `cat-${randomUUID().slice(0, 6)}`,
    );
    const slug = `burger-${randomUUID().slice(0, 6)}`;
    const a = await createItem(brandASlug, makeItem(catA, slug));
    expect(a.status).toBe(200);

    const catB = await createCategory(
      brandBSlug,
      `cat-${randomUUID().slice(0, 6)}`,
    );
    const hijack = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/items',
      headers: {
        cookie: ownerCookie,
        'x-tenant-id': tenantId,
        'x-brand-slug': brandBSlug,
      },
      payload: {
        ...makeItem(catB, `renamed-${randomUUID().slice(0, 6)}`),
        id: a.id,
      },
    });
    expect(hijack.statusCode).toBe(404);
  });

  it('both brands can hold the same slug without overwriting each other', async () => {
    const catA = await createCategory(
      brandASlug,
      `cat-${randomUUID().slice(0, 6)}`,
    );
    const catB = await createCategory(
      brandBSlug,
      `cat-${randomUUID().slice(0, 6)}`,
    );
    const shared = `pizza-${randomUUID().slice(0, 6)}`;
    const a = await createItem(brandASlug, makeItem(catA, shared));
    const b = await createItem(brandBSlug, makeItem(catB, shared));
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.id).not.toBe(b.id);
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd apps/api && RESTO_REQUIRE_DOCKER=1 pnpm exec vitest run test/e2e/catalog-brand-isolation.e2e.spec.ts`
Expected: PASS (404 cross-brand archive, 404 cross-brand id-overwrite, both-slugs distinct ids).

> If the cross-brand archive returns 200 instead of 404, the brand predicate is missing on `archiveItem`. If the id-overwrite returns 200/500 instead of 404, the `upsertItem` id-path brand guard is wrong. Fix the repository, not the test. Confirm `x-brand-slug` resolves to a brand — the tenant-context middleware needs the brand to belong to the tenant (it does; both created under this tenant).

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/e2e/catalog-brand-isolation.e2e.spec.ts
git commit -m "test(api): e2e cross-brand write isolation + slug independence"
```

---

## Task 5: Migration integration test

**Files:**

- Create: `packages/db/test/integration/brand-id-not-null.spec.ts`

Model on an existing `packages/db/test/integration/*.spec.ts` (they gate on `isDockerAvailable()` and spin a testcontainer Postgres + run migrations). This test asserts the migration backfills, enforces NOT NULL, and the new index allows cross-brand same-slug while rejecting intra-brand dupes.

- [ ] **Step 1: Write the test** (adapt imports/helpers to the sibling integration specs — `startPostgres`/`stopPostgres` from `../setup`, `isDockerAvailable`):

```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  isDockerAvailable,
  startPostgres,
  stopPostgres,
  type TestPg,
} from '../setup';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

suite('migration: brand_id NOT NULL + brand-scoped slug uniqueness', () => {
  let pg: TestPg;
  beforeAll(async () => {
    pg = await startPostgres();
  }, 120_000);
  afterAll(async () => {
    if (pg) await stopPostgres(pg);
  });

  it('enforces brand_id NOT NULL on menu_items after migration', async () => {
    const cols = await pg.db.execute(
      sql`SELECT is_nullable FROM information_schema.columns
          WHERE table_name = 'menu_items' AND column_name = 'brand_id'`,
    );
    expect(
      (cols as unknown as Array<{ is_nullable: string }>)[0]?.is_nullable,
    ).toBe('NO');
  });

  it('has the brand-scoped slug unique index, not the tenant-wide one', async () => {
    const idx = await pg.db.execute(
      sql`SELECT indexname FROM pg_indexes WHERE tablename = 'menu_items'`,
    );
    const names = (idx as unknown as Array<{ indexname: string }>).map(
      (r) => r.indexname,
    );
    expect(names).toContain('menu_items_brand_slug_uq');
    expect(names).not.toContain('menu_items_tenant_slug_uq');
  });
});
```

(If `startPostgres` runs migrations automatically, the assertions above hold post-construction. If the sibling specs run migrations via a helper, call the same helper. Match the exact testcontainer + migrate pattern of a neighboring integration spec — e.g. `composite-tenant-fk.spec.ts`.)

- [ ] **Step 2: Run it**

Run: `cd packages/db && RESTO_REQUIRE_DOCKER=1 pnpm exec vitest run test/integration/brand-id-not-null.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/db/test/integration/brand-id-not-null.spec.ts
git commit -m "test(db): migration enforces brand_id NOT NULL + brand-scoped slug index"
```

---

## Task 6: Fix fallout + OpenAPI + full verification

- [ ] **Step 1: Repair existing catalog tests broken by `requireBrandId`**

Run: `cd apps/api && RESTO_REQUIRE_DOCKER=1 pnpm exec vitest run test/e2e/catalog.e2e.spec.ts test/e2e/catalog-rbac.e2e.spec.ts test/e2e/catalog-reads.e2e.spec.ts test/e2e/catalog-photo-upload.e2e.spec.ts test/e2e/menu-brand-response.e2e.spec.ts`
Any spec whose catalog writes now lack an `x-brand-slug` (so `requireBrandId()` throws) must add `'x-brand-slug': <slug>` to those write requests. These specs already provision a tenant — provision/resolve a brand for it (`POST /v1/me/brands` with the owner cookie, or the tenant's existing brand) and pass its slug. Fix the tests to supply a brand; do NOT weaken assertions. Also run admin/unit catalog specs: `pnpm exec nx test api` and `pnpm exec nx test admin`.

- [ ] **Step 2: Regenerate OpenAPI if any DTO/response shape changed**

The Row/DTO changes are internal; response DTOs are unchanged. Still confirm no drift:
Run: `pnpm openapi:check`
If it reports drift, run the generate counterpart (`pnpm exec nx run api:openapi:emit && pnpm exec nx run api-client:gen` with the ci.yml placeholder env) and commit the artefacts.

- [ ] **Step 3: Full gate**

Run: `pnpm exec nx run-many -t typecheck lint -p api admin db domain events`
Run: `cd apps/api && RESTO_REQUIRE_DOCKER=1 pnpm exec vitest run test/e2e/catalog-brand-isolation.e2e.spec.ts test/e2e/catalog.e2e.spec.ts test/e2e/catalog-rbac.e2e.spec.ts`
Expected: all green.

- [ ] **Step 4: Commit any test/OpenAPI fixes**

```bash
git add -A
git commit -m "test(api): supply active brand to catalog write specs after requireBrandId"
```

---

## Definition of done

- All 6 menu tables: `brand_id NOT NULL`; slug uniqueness `(tenant_id, brand_id, slug)`.
- Every catalog write requires an active brand; update/archive/delete scoped by `brand_id`; cross-brand by-id → 404; cross-brand slug collision creates independent rows (no overwrite).
- `catalog-brand-isolation.e2e.spec.ts` + migration test green; all catalog suites green; typecheck/lint/openapi green.
- No code comments.

## Out of scope

- Per-operator brand authz (#15 = Phase 2), read-path brand filtering (#7/#8/#9), composite FK on brand_id (#13), DB-level brand RLS.
