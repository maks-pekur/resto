import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { runInTenantContext, schema, TenantScopedRepository } from '../../src/index';
import { isDockerAvailable, startPostgres, stopPostgres, type TestPg } from '../setup';

class TestBrandRepo extends TenantScopedRepository {
  findById(id: string) {
    return this.selectOne(schema.brands, eq(schema.brands.id, id));
  }
  listAll() {
    return this.selectMany(schema.brands);
  }
}

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[repository-base] Docker not available — skipping integration tests.');
}

suite('RES-252: TenantScopedRepository auto-filters by ALS-bound tenant', () => {
  let pg: TestPg;
  let tenantA: string;
  let tenantB: string;
  let brandIdA: string;
  let brandIdB: string;
  let repo: TestBrandRepo;

  beforeAll(async () => {
    pg = await startPostgres();
    repo = new TestBrandRepo(pg.db);

    await pg.db.withoutTenant('seed for repo-base test', async (tx) => {
      const [a] = await tx
        .insert(schema.tenants)
        .values({ slug: 'repobase-a', displayName: 'A' })
        .returning({ id: schema.tenants.id });
      const [b] = await tx
        .insert(schema.tenants)
        .values({ slug: 'repobase-b', displayName: 'B' })
        .returning({ id: schema.tenants.id });
      if (!a || !b) throw new Error('seed tenants');
      tenantA = a.id;
      tenantB = b.id;

      const [ba] = await tx
        .insert(schema.brands)
        .values({ tenantId: tenantA, slug: 'brand-a', displayName: 'BrandA' })
        .returning({ id: schema.brands.id });
      const [bb] = await tx
        .insert(schema.brands)
        .values({ tenantId: tenantB, slug: 'brand-b', displayName: 'BrandB' })
        .returning({ id: schema.brands.id });
      if (!ba || !bb) throw new Error('seed brands');
      brandIdA = ba.id;
      brandIdB = bb.id;
    });
  }, 90_000);

  afterAll(async () => {
    await stopPostgres(pg);
  });

  it('selectOne(tenant-B-brand-id) returns null when ALS is bound to tenant A', async () => {
    const got = await runInTenantContext({ tenantId: tenantA }, () => repo.findById(brandIdB));
    expect(got).toBeNull();
  });

  it('selectOne returns own-tenant brand when ALS bound to it', async () => {
    const got = await runInTenantContext({ tenantId: tenantA }, () => repo.findById(brandIdA));
    expect(got?.id).toBe(brandIdA);
  });

  it('selectMany returns only own-tenant rows under ALS', async () => {
    const fromA = await runInTenantContext({ tenantId: tenantA }, () => repo.listAll());
    const fromB = await runInTenantContext({ tenantId: tenantB }, () => repo.listAll());
    expect(fromA.map((r) => r.id)).toEqual([brandIdA]);
    expect(fromB.map((r) => r.id)).toEqual([brandIdB]);
  });

  it('throws when called outside ALS context', async () => {
    const err = await repo.findById(brandIdA).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/No tenant context bound/i);
  });
});
