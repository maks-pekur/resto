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
import { sql } from 'drizzle-orm';
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

    const [categoryA] = await tx
      .insert(schema.menuCategories)
      .values({ tenantId: tenantA.id, slug: 'pizza', name: { en: 'Pizza A' } })
      .returning({ id: schema.menuCategories.id });
    const [categoryB] = await tx
      .insert(schema.menuCategories)
      .values({ tenantId: tenantB.id, slug: 'pizza', name: { en: 'Pizza B' } })
      .returning({ id: schema.menuCategories.id });

    if (!categoryA || !categoryB) throw new Error('seed I1 fixture: category insert failed');

    const [itemA] = await tx
      .insert(schema.menuItems)
      .values({
        tenantId: tenantA.id,
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

    if (!brandA || !brandB || !itemA || !itemB) {
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
        headers: { 'x-tenant-slug': fixture.tenantA.slug },
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
