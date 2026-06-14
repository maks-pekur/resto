# Brand Read-Path Isolation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the public/customer menu read brand-scoped on every table, and reject a brandless public read with 404 — so brand B's modifiers/pricing never appear in brand A's menu, and a multibrand tenant never serves a merged-all-brands document (AUDIT #7/#8/#9).

**Architecture:** `brandId` becomes a required `string` across the read path. The public controller 404s when no brand is resolved from the host. The repository applies `eq(brand_id, brandId)` unconditionally to every read in `loadPublishedMenu`/`findPublishedItem`. The cache drops its `'no-brand'` key. #9 (stop-list staleness) dissolves once the `no-brand` merged cache is gone and reads are brand-scoped.

**Tech Stack:** NestJS catalog context, Drizzle read queries, ioredis cache adapter, Vitest e2e (testcontainer).

**Spec:** `docs/superpowers/specs/2026-06-14-brand-read-isolation-design.md`

**Project rules:** NO code comments. Conventional-commit subjects only (no body, no Claude attribution). Pre-commit hook runs prettier/eslint/typecheck.

---

## File Structure

| File                                                                          | Change                                                                                                         |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/contexts/catalog/interfaces/http/public-menu.controller.ts`     | `requireBrandOr404()` helper; both endpoints 404 when no brand                                                 |
| `apps/api/src/contexts/catalog/application/get-published-menu.service.ts`     | `getBrandId() ?? null` → `requireBrandContext()`                                                               |
| `apps/api/src/contexts/catalog/application/get-menu-item.service.ts`          | same                                                                                                           |
| `apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts`  | `loadPublishedMenu`/`findPublishedItem`: `brandId: string` required; unconditional `eq(brandId)` on every read |
| `apps/api/src/contexts/catalog/infrastructure/redis-catalog-cache.adapter.ts` | `brandId: string` required on get/set/invalidate + `MENU_KEY` (drop `?? null` / `'no-brand'`)                  |
| `apps/api/src/contexts/catalog/domain/ports.ts`                               | `CatalogCachePort` + repo read signatures: `brandId: string`                                                   |
| `apps/api/test/e2e/catalog-brand-read-isolation.e2e.spec.ts` (new)            | cross-brand modifier isolation + 404-no-brand + stop-list per-brand                                            |

---

## Task 1: Brand-scope the public read path (one compile unit)

Tightening `brandId` to a required `string` ripples through cache port → repo → services → controller, so these land in one commit. Order the edits so typecheck only goes green at the end.

**Files:** all six source files above.

- [ ] **Step 1: Cache adapter + port — `brandId` required**

`redis-catalog-cache.adapter.ts`:

- `MENU_KEY(tenantId, version, brandId: string)` — drop the `| null` and `?? 'no-brand'`; key is `catalog:menu:${tenantId}:${brandId}:${version}`.
- `get(tenantId, version, brandId: string)`, `set(menu, ttlSeconds, brandId: string)`, `invalidate(tenantId, version, brandId: string)` — drop `?? string | null` and `?? null`; pass `brandId` straight through.

`domain/ports.ts` — `CatalogCachePort`: change `brandId?: string | null` → `brandId: string` on `get`/`set`/`invalidate`. And the `CatalogRepository` read methods `loadPublishedMenu(tenantId, version, brandId: string)` + `findPublishedItem(itemId, brandId: string)`.

- [ ] **Step 2: Repository — unconditional brand filter on every read**

`catalog-drizzle.repository.ts` `loadPublishedMenu` (signature `brandId: string`):

- items base conditions (`~:90`): already `and(eq(status,'published'), eq(brandId, brandId))` — make unconditional (drop the `brandId ?` ternary; always include the brand eq).
- brand-row lookup (`~:94,107`): already brand-keyed — keep, drop any `brandId ?` guard.
- categories (`~:115-118`): `brandId ? eq(brandId) : undefined` → `eq(schema.menuCategories.brandId, brandId)`.
- stop-list overlay (`~:120`): `scoped.selectFrom(schema.menuStopList)` → `scoped.selectFrom(schema.menuStopList, eq(schema.menuStopList.brandId, brandId))`.
- sizes (`~:127`): `scoped.selectFrom(schema.menuItemSizes)` → add `eq(schema.menuItemSizes.brandId, brandId)`.
- item-modifier-group join (`~:128`): `scoped.selectFrom(schema.menuItemModifierGroups)` → add `eq(schema.menuItemModifierGroups.brandId, brandId)`.
- **modifier groups (`~:129`)** → `scoped.selectFrom(schema.menuModifierGroups, eq(schema.menuModifierGroups.brandId, brandId))` — this is the #7 leak.
- **modifier options (`~:135`)** → add `eq(schema.menuModifierOptions.brandId, brandId)` to the existing `inArray(...)` predicate via `and(inArray(...), eq(brandId))` — the other half of #7.

`findPublishedItem` (signature `brandId: string`):

- items where (`~:239-241`): `brandId ? and(base, eq(brandId)) : base` → `and(base, eq(schema.menuItems.brandId, brandId))` (unconditional).
- stop-list (`~:244`): add `and(eq(itemId), eq(menuStopList.brandId, brandId))`.
- sizes + links (`~:252-255`): add `eq(brandId)` to each for consistency (they're already constrained by `menuItemId`, but brand-scope for symmetry).

- [ ] **Step 3: Read services — require an active brand**

`get-published-menu.service.ts`: import `requireBrandContext` from `@resto/db`; replace `const brandId = getBrandId() ?? null;` with `const brandId = requireBrandContext();`. Pass `brandId` (now `string`) to `cache.get`, `repo.loadPublishedMenu`, `cache.set`. Drop the `getBrandId` import.

`get-menu-item.service.ts`: same — `this.repo.findPublishedItem(itemId, getBrandId() ?? null)` → `this.repo.findPublishedItem(itemId, requireBrandContext())`. Drop the `getBrandId` import.

- [ ] **Step 4: Controller — 404 when no brand (#8)**

`public-menu.controller.ts`: add a helper mirroring `requireTenantOr404`:

```typescript
const requireBrandOr404 = (): void => {
  if (getBrandId() === undefined) {
    throw new NotFoundException('No brand resolved for this host.');
  }
};
```

(Import `getBrandId` from `@resto/db`.) Call `requireBrandOr404();` in both `menu()` and `item()` right after `requireTenantOr404()` / `requireTenantOr404()`. This makes a brandless public read a clean 404 before the service's `requireBrandContext()` (which would otherwise surface as the 400 `BrandContextRequiredError` from Phase 1 — wrong status for a public not-found).

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm exec nx run-many -t typecheck lint -p api`
Expected: PASS. Fix any remaining caller that passed a nullable brand (there should be none outside the read path — `get-published-menu` and `stop-list` are the only cache callers; stop-list already passes a `requireBrandContext()` brand).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/contexts/catalog
git commit -m "feat(catalog): brand-scope public menu reads; brandless read 404s"
```

---

## Task 2: e2e — cross-brand read isolation + 404 + stop-list (the proof)

**Files:** Create `apps/api/test/e2e/catalog-brand-read-isolation.e2e.spec.ts`

Model setup on `apps/api/test/e2e/catalog-brand-isolation.e2e.spec.ts` (the just-merged write-isolation e2e): owner session via `operator-fixture`; two brands via `POST /v1/me/brands`; writes carry `x-brand-slug`. For READS, the public `/v1/menu` resolves brand from `x-brand-slug` too (the tenant-context middleware binds it). To make an item appear in the published menu it must be `status: 'published'` AND the tenant's menu published — verify how the write-isolation e2e / `catalog.e2e.spec.ts` publishes (likely create with `status: 'published'` or call `POST /v1/catalog/publish`). Read the passing `catalog.e2e.spec.ts` menu-read assertions for the exact publish + read pattern and mirror it.

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
    '[catalog-brand-read-isolation.e2e] Docker not available — skipping.',
  );

suite('Catalog — brand read-path isolation (AUDIT #7/#8/#9)', () => {
  let stack: RealStack;
  let ownerCookie: string;
  let tenantId: string;
  let brandASlug: string;
  let brandBSlug: string;

  const w = (brand: string) => ({
    cookie: ownerCookie,
    'x-tenant-id': tenantId,
    'x-brand-slug': brand,
  });

  const createBrand = async (slug: string): Promise<void> => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/me/brands',
      headers: { cookie: ownerCookie, 'x-tenant-id': tenantId },
      payload: { slug, displayName: slug },
    });
    expect(res.statusCode).toBe(201);
  };
  const createCategory = async (brand: string): Promise<string> => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers: w(brand),
      payload: {
        slug: `cat-${randomUUID().slice(0, 6)}`,
        name: { en: 'C' },
        sortOrder: 0,
      },
    });
    expect(res.statusCode).toBe(200);
    return res.json<{ id: string }>().id;
  };
  const createGroup = async (brand: string): Promise<string> => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/modifier-groups',
      headers: w(brand),
      payload: {
        name: { en: `grp-${randomUUID().slice(0, 6)}` },
        minSelectable: 0,
        maxSelectable: 1,
        isRequired: false,
      },
    });
    expect(res.statusCode).toBe(200);
    return res.json<{ id: string }>().id;
  };
  const createItem = async (
    brand: string,
    categoryId: string,
  ): Promise<string> => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/items',
      headers: w(brand),
      payload: {
        categoryId,
        slug: `it-${randomUUID().slice(0, 6)}`,
        name: { en: 'I' },
        basePrice: '1.00',
        currency: 'USD',
        status: 'published',
      },
    });
    expect(res.statusCode).toBe(200);
    return res.json<{ id: string }>().id;
  };
  const publish = async (brand: string): Promise<void> => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/publish',
      headers: w(brand),
    });
    expect(res.statusCode).toBe(200);
  };
  const readMenu = (brand: string | null) =>
    stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: brand
        ? { 'x-tenant-slug': tenantSlugVar, 'x-brand-slug': brand }
        : { 'x-tenant-slug': tenantSlugVar },
    });

  let tenantSlugVar: string;

  beforeAll(async () => {
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN = '1000';
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN = '1000';
    process.env.RATE_LIMIT_INTERNAL_PER_MIN = '10000';
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    stack = await startRealStack();
    tenantSlugVar = `cafe-${randomUUID().slice(0, 8)}`;
    const email = `owner-${randomUUID().slice(0, 8)}@example.com`;
    const password = 'Sup3r-Secret-Pw!';
    const tenant = await provisionTenant(
      stack.app,
      tenantSlugVar,
      INTERNAL_TOKEN,
    );
    tenantId = tenant.id;
    await runBootstrap({
      tenantSlug: tenantSlugVar,
      email,
      password,
      name: 'Owner',
    });
    ownerCookie = await signInAsOperator(stack.app, email, password, tenant.id);
    brandASlug = `brand-a-${randomUUID().slice(0, 6)}`;
    brandBSlug = `brand-b-${randomUUID().slice(0, 6)}`;
    await createBrand(brandASlug);
    await createBrand(brandBSlug);
  }, 180_000);

  afterAll(async () => {
    if (stack) await stopRealStack(stack);
  });

  it("brand A's published menu contains only brand A's modifier groups", async () => {
    const gA = await createGroup(brandASlug);
    const gB = await createGroup(brandBSlug);
    const catA = await createCategory(brandASlug);
    await createItem(brandASlug, catA);
    await publish(brandASlug);

    const res = await readMenu(brandASlug);
    expect(res.statusCode).toBe(200);
    const ids = res
      .json<{ modifierGroups: { id: string }[] }>()
      .modifierGroups.map((g) => g.id);
    expect(ids).toContain(gA);
    expect(ids).not.toContain(gB);
  });

  it('a public menu read with no resolved brand returns 404', async () => {
    const res = await readMenu(null);
    expect(res.statusCode).toBe(404);
  });

  it("stopping a brand-A item does not affect brand B's menu", async () => {
    const catA = await createCategory(brandASlug);
    const itemA = await createItem(brandASlug, catA);
    await publish(brandASlug);
    const catB = await createCategory(brandBSlug);
    const itemB = await createItem(brandBSlug, catB);
    await publish(brandBSlug);

    const stop = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/stop-list',
      headers: w(brandASlug),
      payload: { itemId: itemA },
    });
    expect(stop.statusCode).toBe(200);

    const menuB = await readMenu(brandBSlug);
    expect(menuB.statusCode).toBe(200);
    const bItemIds = menuB
      .json<{ items: { id: string }[] }>()
      .items.map((i) => i.id);
    expect(bItemIds).toContain(itemB);
    expect(bItemIds).not.toContain(itemA);
  });
});
```

- [ ] **Step 2: Run + iterate**

Run: `cd apps/api && RESTO_REQUIRE_DOCKER=1 pnpm exec vitest run test/e2e/catalog-brand-read-isolation.e2e.spec.ts`
Expected: all pass. Likely adjustments: the exact publish/read flow (how an item becomes visible in `/v1/menu`) and the modifier-group create payload shape — align with the passing `catalog.e2e.spec.ts` / `catalog-brand-isolation.e2e.spec.ts`. If `readMenu` needs the brand resolved via host rather than `x-brand-slug`, check how `catalog.e2e.spec.ts` reads `/v1/menu` (it uses `x-tenant-slug` for the public read) and how brand binds for the public path — mirror it exactly. Do NOT weaken assertions; fix the test mechanics or, if a real isolation assertion fails, report it (production bug).

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/e2e/catalog-brand-read-isolation.e2e.spec.ts
git commit -m "test(api): e2e brand read-path isolation (modifiers, 404, stop-list)"
```

---

## Task 3: Fallout + website check + OpenAPI + full gate

- [ ] **Step 1: Fix existing public-menu specs that read without a brand**

Run: `cd apps/api && RESTO_REQUIRE_DOCKER=1 pnpm exec vitest run test/e2e/catalog.e2e.spec.ts test/e2e/menu-brand-response.e2e.spec.ts test/e2e/catalog-reads.e2e.spec.ts`
Any `/v1/menu` read that resolves no brand now returns 404. For specs that read the published menu, ensure the read request resolves a brand (add `x-brand-slug` for the tenant's brand, or read on the brand host). The `menu-brand-response.e2e.spec.ts` is specifically about the brand in the menu response — confirm its reads now pass a brand and its assertions hold (brand is now always present in the response). Fix the tests to supply a brand; do NOT weaken assertions. Also run unit: `pnpm exec nx test api`.

- [ ] **Step 2: Verify the website consumer**

The `apps/website` (multi-tenant SSR) reads the published menu. Confirm it resolves a brand before calling `/v1/menu` (grep the website for the menu fetch: `grep -rn "/v1/menu\|x-brand-slug\|brand" apps/website --include='*.ts' --include='*.tsx' | head`). If any path reads the menu at tenant level with no brand, it now 404s — add the brand (host-derived or the tenant's brand). If the website doesn't read `/v1/menu` at all yet (it may be a stub per CLAUDE.md — "Phase 6 customer site is a stub"), note that and skip. Do NOT build new website features; only fix a broken existing read.

- [ ] **Step 3: OpenAPI**

Run: `pnpm openapi:check`
The published-menu response shape is unchanged (brand stays nullable in the schema even though always populated now), so likely in sync. If drift, regenerate (`pnpm exec nx run api:openapi:emit && pnpm exec nx run api-client:gen` with ci.yml placeholder env) and stage artefacts.

- [ ] **Step 4: Full gate**

Run: `pnpm exec nx run-many -t typecheck lint -p api admin db domain events` → PASS
Run: `cd apps/api && RESTO_REQUIRE_DOCKER=1 pnpm exec vitest run test/e2e/catalog-brand-read-isolation.e2e.spec.ts test/e2e/catalog.e2e.spec.ts test/e2e/catalog-brand-isolation.e2e.spec.ts test/e2e/menu-brand-response.e2e.spec.ts test/e2e/catalog-reads.e2e.spec.ts` → ALL PASS
Run: `pnpm openapi:check` → in sync

- [ ] **Step 5: Commit fixes**

```bash
git add -A
git commit -m "test(api): supply brand to public-menu read specs after read isolation"
```

---

## Definition of done

- Public menu read brand-scoped on every table; brand B's modifiers/pricing absent from brand A's menu JSON.
- Brandless public menu read → 404; no merged document; no `no-brand` cache key.
- Stopping a brand-A item leaves brand B's menu intact.
- New e2e + existing menu specs green; typecheck/lint/openapi green. No code comments.

## Out of scope

- Writes (#2/#3, done). Per-operator brand authz (#15). Composite FK on brand_id (#13). DB-level brand RLS.
