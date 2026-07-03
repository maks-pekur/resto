// PR 06 / TEN-08 inventory (Task 0, 2026-05-26):
// - Fixture 1 (ALS leak): NOT COVERED — all `it()` blocks issue a single
//   sequential request under one tenant cookie. There is no `Promise.all`
//   pair of A/B requests and no iteration loop, so an ALS frame leak
//   between concurrently-scheduled requests cannot be observed here.
//   → `cross-tenant-als-leak.e2e.spec.ts` adds the 100-iteration Promise.all
//   design from D-07 §1 / Pitfall 4.
// - Fixture 2 (NATS mix): NOT COVERED — this suite starts with
//   `natsEnabledInApp: false` and never publishes/subscribes. The NATS
//   subscriber tenant-context-mix bug class is entirely absent.
//   → `cross-tenant-nats-mix.e2e.spec.ts` adds the publish-loop fixture.
// - Fixture 3 (concurrent write): NOT COVERED — every seed uses a single
//   `withoutTenant(...)` block; no Promise.all writes from concurrent
//   `withTenant` callbacks, no `pg_sleep(0.5)` widening.
//   → `concurrent-write-race.spec.ts` (in `packages/db/test/integration/`)
//   adds the concurrent-write race fixture.
// - Fixture 4 (raw-tx RLS fence): PARTIAL — the `audit` `it()` block
//   asserts that `withTenantId(A)` reading `audit_log` filtered only by
//   `actor_subject` returns only A's rows, which is a one-tenant RLS-only
//   read. It does NOT (a) assert the symmetric tenant-B read, (b) provision
//   a test-only table with the standard RLS pattern from scratch, or
//   (c) probe a tenant-scoped table other than `audit_log`. The new
//   `raw-tx-rls-fence.spec.ts` extends with a dedicated test-only
//   `test_rls_fence` table created in the spec, four rows seeded across
//   two tenants, and symmetric assertions under both tenants.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { schema, TenantAwareDb } from '@resto/db';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';
import { provisionTenant, runBootstrap, signInAsOperator } from './helpers/operator-fixture';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[cross-tenant-isolation] Docker not available — skipping integration tests.');
}

const INTERNAL_TOKEN = 'integration-test-token-1234567890';

interface I1Fixture {
  tenantA: { id: string; slug: string };
  tenantB: { id: string; slug: string };
  operatorACookie: string;
  brandA: string;
  brandB: string;
  categoryA: string;
  categoryB: string;
  itemA: string;
  itemB: string;
}

const seedI1Fixture = async (stack: RealStack): Promise<I1Fixture> => {
  const slugA = 'i1-isolation-a';
  const slugB = 'i1-isolation-b';

  const tenantA = await provisionTenant(stack.app, slugA, INTERNAL_TOKEN);
  const tenantB = await provisionTenant(stack.app, slugB, INTERNAL_TOKEN);

  const operatorEmail = `operator-${slugA}@example.test`;
  const operatorPassword = 'correct-horse-battery-staple-i1';
  await runBootstrap({
    tenantSlug: slugA,
    email: operatorEmail,
    password: operatorPassword,
    name: 'Operator A',
  });
  const operatorACookie = await signInAsOperator(
    stack.app,
    operatorEmail,
    operatorPassword,
    tenantA.id,
  );

  const db = stack.app.get(TenantAwareDb);

  const seeded = await db.withoutTenant('seed I-1 fixture rows', async (tx) => {
    const [brandA] = await tx
      .insert(schema.brands)
      .values({ tenantId: tenantA.id, slug: 'flagship-i1a', displayName: 'Flagship A' })
      .returning({ id: schema.brands.id });
    const [brandB] = await tx
      .insert(schema.brands)
      .values({ tenantId: tenantB.id, slug: 'flagship-i1b', displayName: 'Flagship B' })
      .returning({ id: schema.brands.id });

    if (!brandA || !brandB) throw new Error('seed I1 fixture: brand insert failed');

    const [categoryA] = await tx
      .insert(schema.menuCategories)
      .values({ tenantId: tenantA.id, brandId: brandA.id, slug: 'pizza', name: { en: 'Pizza A' } })
      .returning({ id: schema.menuCategories.id });
    const [categoryB] = await tx
      .insert(schema.menuCategories)
      .values({ tenantId: tenantB.id, brandId: brandB.id, slug: 'pizza', name: { en: 'Pizza B' } })
      .returning({ id: schema.menuCategories.id });

    if (!categoryA || !categoryB) throw new Error('seed I1 fixture: category insert failed');

    const [itemA] = await tx
      .insert(schema.menuItems)
      .values({
        tenantId: tenantA.id,
        brandId: brandA.id,
        categoryId: categoryA.id,
        slug: 'margherita',
        name: { en: 'Margherita A' },
        basePrice: '10.00',
        currency: 'USD',
        status: 'published',
      })
      .returning({ id: schema.menuItems.id });
    const [itemB] = await tx
      .insert(schema.menuItems)
      .values({
        tenantId: tenantB.id,
        brandId: brandB.id,
        categoryId: categoryB.id,
        slug: 'margherita',
        name: { en: 'Margherita B' },
        basePrice: '10.00',
        currency: 'USD',
        status: 'published',
      })
      .returning({ id: schema.menuItems.id });

    await tx.insert(schema.auditLog).values([
      {
        tenantId: tenantA.id,
        actorKind: 'system',
        actorSubject: 'i1-probe',
        action: 'i1-seed-a',
      },
      {
        tenantId: tenantB.id,
        actorKind: 'system',
        actorSubject: 'i1-probe',
        action: 'i1-seed-b',
      },
      {
        tenantId: null,
        actorKind: 'system',
        actorSubject: 'i1-probe',
        action: 'i1-seed-platform',
      },
    ]);

    if (!itemA || !itemB) {
      throw new Error('seed I1 fixture failed');
    }

    return {
      brandA: brandA.id,
      brandB: brandB.id,
      categoryA: categoryA.id,
      categoryB: categoryB.id,
      itemA: itemA.id,
      itemB: itemB.id,
    };
  });

  return {
    tenantA,
    tenantB,
    operatorACookie,
    ...seeded,
  };
};

suite('RES-237: ADR-0020 I-1 cross-tenant isolation regression net', () => {
  let stack: RealStack;
  let fixture: I1Fixture;

  beforeAll(async () => {
    stack = await startRealStack({ natsEnabledInApp: false });
    fixture = await seedI1Fixture(stack);
  }, 120_000);

  afterAll(async () => {
    if (stack) await stopRealStack(stack);
  });

  describe('tenancy', () => {
    it('GET /v1/tenants/me under operator-A cookie returns tenant A only', async () => {
      const res = await stack.app.inject({
        method: 'GET',
        url: '/v1/tenants/me',
        headers: { cookie: fixture.operatorACookie, 'x-tenant-slug': fixture.tenantA.slug },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ id: string }>();
      expect(body.id).toBe(fixture.tenantA.id);
      expect(body.id).not.toBe(fixture.tenantB.id);
    });
  });

  describe('catalog', () => {
    it('GET /v1/menu under host A returns A items only, not B items with the same slug', async () => {
      const res = await stack.app.inject({
        method: 'GET',
        url: '/v1/menu',
        headers: { 'x-tenant-slug': fixture.tenantA.slug, 'x-brand-slug': 'flagship-i1a' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ items: { id: string; slug: string }[] }>();
      const ids = body.items.map((i) => i.id).sort();
      expect(ids).toContain(fixture.itemA);
      expect(ids).not.toContain(fixture.itemB);
    });
  });

  describe('identity', () => {
    it('GET /v1/me/brands under operator-A cookie returns only A brands, not B brand with same slug', async () => {
      const res = await stack.app.inject({
        method: 'GET',
        url: '/v1/me/brands',
        headers: { cookie: fixture.operatorACookie, 'x-tenant-slug': fixture.tenantA.slug },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ brands: { id: string }[] }>();
      const ids = body.brands.map((b) => b.id);
      expect(ids).toContain(fixture.brandA);
      expect(ids).not.toContain(fixture.brandB);
    });
  });

  describe('audit', () => {
    it('withTenant(A) reads only tenant A audit rows; NULL-tenant rows invisible', async () => {
      const db = stack.app.get(TenantAwareDb);

      const rowsUnderA = await db.withTenantId(fixture.tenantA.id, async (tx) =>
        tx
          .select()
          .from(schema.auditLog)
          .where(sql`${schema.auditLog.actorSubject} = 'i1-probe'`),
      );

      const allRows = await db.withoutTenant('audit cross-tenant visibility probe', async (tx) =>
        tx
          .select()
          .from(schema.auditLog)
          .where(sql`${schema.auditLog.actorSubject} = 'i1-probe'`),
      );

      expect(rowsUnderA.every((r) => r.tenantId === fixture.tenantA.id)).toBe(true);
      expect(rowsUnderA.length).toBeGreaterThanOrEqual(1);
      expect(allRows.length).toBeGreaterThanOrEqual(3);
      expect(allRows.length).toBeGreaterThan(rowsUnderA.length);
    });
  });
});

suite('RES-08.2-06: cross-BRAND RLS isolation matrix (Plan 08.2-06 Task 2)', () => {
  let stack: RealStack;
  let tenantId: string;
  let brandAId: string;
  let brandBId: string;
  let categoryAId: string;
  let categoryBId: string;
  let itemAId: string;
  let itemBId: string;
  let modGroupAId: string;
  let modGroupBId: string;

  beforeAll(async () => {
    stack = await startRealStack({ natsEnabledInApp: false });
    const db = stack.app.get(TenantAwareDb);

    const seeded = await db.withoutTenant('seed cross-brand RLS matrix', async (tx) => {
      const [tenantA] = await tx
        .insert(schema.tenants)
        .values({
          slug: 'brand-rls-tenant',
          displayName: 'Brand RLS Tenant',
          defaultCurrency: 'USD',
          locale: 'en',
        })
        .returning({ id: schema.tenants.id });
      if (!tenantA) throw new Error('tenant insert failed');

      const [bA] = await tx
        .insert(schema.brands)
        .values({ tenantId: tenantA.id, slug: 'rls-brand-a', displayName: 'RLS A' })
        .returning({ id: schema.brands.id });
      const [bB] = await tx
        .insert(schema.brands)
        .values({ tenantId: tenantA.id, slug: 'rls-brand-b', displayName: 'RLS B' })
        .returning({ id: schema.brands.id });
      if (!bA || !bB) throw new Error('brand insert failed');

      const [catA] = await tx
        .insert(schema.menuCategories)
        .values({
          tenantId: tenantA.id,
          brandId: bA.id,
          slug: 'cat-rls-a',
          name: { en: 'A' },
          sortOrder: 0,
        })
        .returning({ id: schema.menuCategories.id });
      const [catB] = await tx
        .insert(schema.menuCategories)
        .values({
          tenantId: tenantA.id,
          brandId: bB.id,
          slug: 'cat-rls-b',
          name: { en: 'B' },
          sortOrder: 0,
        })
        .returning({ id: schema.menuCategories.id });
      if (!catA || !catB) throw new Error('category insert failed');

      const [itemA] = await tx
        .insert(schema.menuItems)
        .values({
          tenantId: tenantA.id,
          brandId: bA.id,
          categoryId: catA.id,
          slug: 'item-rls-a',
          name: { en: 'Item A' },
          basePrice: '5.00',
          currency: 'USD',
          status: 'published',
        })
        .returning({ id: schema.menuItems.id });
      const [itemB] = await tx
        .insert(schema.menuItems)
        .values({
          tenantId: tenantA.id,
          brandId: bB.id,
          categoryId: catB.id,
          slug: 'item-rls-b',
          name: { en: 'Item B' },
          basePrice: '5.00',
          currency: 'USD',
          status: 'published',
        })
        .returning({ id: schema.menuItems.id });
      if (!itemA || !itemB) throw new Error('item insert failed');

      const [mgA, mgB] = await tx
        .insert(schema.menuModifierGroups)
        .values([
          {
            tenantId: tenantA.id,
            brandId: bA.id,
            name: { en: 'MG A' },
            minSelectable: 0,
            maxSelectable: 1,
            isRequired: false,
          },
          {
            tenantId: tenantA.id,
            brandId: bB.id,
            name: { en: 'MG B' },
            minSelectable: 0,
            maxSelectable: 1,
            isRequired: false,
          },
        ])
        .returning({ id: schema.menuModifierGroups.id });

      await tx.insert(schema.catalogBrandStopVersion).values([
        { tenantId: tenantA.id, brandId: bA.id },
        { tenantId: tenantA.id, brandId: bB.id },
      ]);

      if (!mgA || !mgB) throw new Error('modifier group insert failed');
      return {
        tenantId: tenantA.id,
        brandAId: bA.id,
        brandBId: bB.id,
        categoryAId: catA.id,
        categoryBId: catB.id,
        itemAId: itemA.id,
        itemBId: itemB.id,
        modGroupAId: mgA.id,
        modGroupBId: mgB.id,
      };
    });

    tenantId = seeded.tenantId;
    brandAId = seeded.brandAId;
    brandBId = seeded.brandBId;
    categoryAId = seeded.categoryAId;
    categoryBId = seeded.categoryBId;
    itemAId = seeded.itemAId;
    itemBId = seeded.itemBId;
    modGroupAId = seeded.modGroupAId;
    modGroupBId = seeded.modGroupBId;
  }, 120_000);

  afterAll(async () => {
    if (stack) await stopRealStack(stack);
  });

  describe('brand-bound reads return only the bound brand rows (RLS live)', () => {
    it('menu_categories: brand-A binding returns A rows only, zero B rows', async () => {
      const db = stack.app.get(TenantAwareDb);
      const rows = await db.withTenantId(tenantId, async (tx) => {
        await tx.execute(sql`SELECT app_bind_brand(${brandAId}, false)`);
        return tx
          .select({ id: schema.menuCategories.id })
          .from(schema.menuCategories)
          .where(eq(schema.menuCategories.tenantId, tenantId));
      });
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(categoryAId);
      expect(ids).not.toContain(categoryBId);
    });

    it('menu_items: brand-A binding returns A rows only, zero B rows', async () => {
      const db = stack.app.get(TenantAwareDb);
      const rows = await db.withTenantId(tenantId, async (tx) => {
        await tx.execute(sql`SELECT app_bind_brand(${brandAId}, false)`);
        return tx
          .select({ id: schema.menuItems.id })
          .from(schema.menuItems)
          .where(eq(schema.menuItems.tenantId, tenantId));
      });
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(itemAId);
      expect(ids).not.toContain(itemBId);
    });

    it('menu_modifier_groups: brand-A binding returns A rows only, zero B rows', async () => {
      const db = stack.app.get(TenantAwareDb);
      const rows = await db.withTenantId(tenantId, async (tx) => {
        await tx.execute(sql`SELECT app_bind_brand(${brandAId}, false)`);
        return tx
          .select({ id: schema.menuModifierGroups.id })
          .from(schema.menuModifierGroups)
          .where(eq(schema.menuModifierGroups.tenantId, tenantId));
      });
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(modGroupAId);
      expect(ids).not.toContain(modGroupBId);
    });

    it('catalog_brand_stop_version: brand-A binding returns A row only, zero B rows', async () => {
      const db = stack.app.get(TenantAwareDb);
      const rows = await db.withTenantId(tenantId, async (tx) => {
        await tx.execute(sql`SELECT app_bind_brand(${brandAId}, false)`);
        return tx
          .select({ brandId: schema.catalogBrandStopVersion.brandId })
          .from(schema.catalogBrandStopVersion)
          .where(eq(schema.catalogBrandStopVersion.tenantId, tenantId));
      });
      const brandIds = rows.map((r) => r.brandId);
      expect(brandIds).toContain(brandAId);
      expect(brandIds).not.toContain(brandBId);
    });
  });

  describe('IS NULL pass-through — tenant-level (no brand bound) reads see both brands rows', () => {
    it('menu_categories: no brand binding (IS NULL) returns rows for BOTH brands', async () => {
      const db = stack.app.get(TenantAwareDb);
      const rows = await db.withTenantId(tenantId, async (tx) =>
        tx
          .select({ id: schema.menuCategories.id })
          .from(schema.menuCategories)
          .where(eq(schema.menuCategories.tenantId, tenantId)),
      );
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(categoryAId);
      expect(ids).toContain(categoryBId);
    });

    it('menu_items: no brand binding returns rows for BOTH brands', async () => {
      const db = stack.app.get(TenantAwareDb);
      const rows = await db.withTenantId(tenantId, async (tx) =>
        tx
          .select({ id: schema.menuItems.id })
          .from(schema.menuItems)
          .where(eq(schema.menuItems.tenantId, tenantId)),
      );
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(itemAId);
      expect(ids).toContain(itemBId);
    });

    it('catalog_brand_stop_version: no brand binding returns both brands rows', async () => {
      const db = stack.app.get(TenantAwareDb);
      const rows = await db.withTenantId(tenantId, async (tx) =>
        tx
          .select({ brandId: schema.catalogBrandStopVersion.brandId })
          .from(schema.catalogBrandStopVersion)
          .where(eq(schema.catalogBrandStopVersion.tenantId, tenantId)),
      );
      const brandIds = rows.map((r) => r.brandId);
      expect(brandIds).toContain(brandAId);
      expect(brandIds).toContain(brandBId);
    });
  });

  describe('symmetric brand-B binding — B rows visible, A rows invisible', () => {
    it('menu_categories: brand-B binding returns B rows only, zero A rows', async () => {
      const db = stack.app.get(TenantAwareDb);
      const rows = await db.withTenantId(tenantId, async (tx) => {
        await tx.execute(sql`SELECT app_bind_brand(${brandBId}, false)`);
        return tx
          .select({ id: schema.menuCategories.id })
          .from(schema.menuCategories)
          .where(eq(schema.menuCategories.tenantId, tenantId));
      });
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(categoryBId);
      expect(ids).not.toContain(categoryAId);
    });

    it('menu_items: brand-B binding returns B rows only, zero A rows', async () => {
      const db = stack.app.get(TenantAwareDb);
      const rows = await db.withTenantId(tenantId, async (tx) => {
        await tx.execute(sql`SELECT app_bind_brand(${brandBId}, false)`);
        return tx
          .select({ id: schema.menuItems.id })
          .from(schema.menuItems)
          .where(eq(schema.menuItems.tenantId, tenantId));
      });
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(itemBId);
      expect(ids).not.toContain(itemAId);
    });
  });
});
