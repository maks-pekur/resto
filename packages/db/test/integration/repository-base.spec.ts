import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { runInTenantContext, schema, TenantScopedRepository } from '../../src/index';
import { isDockerAvailable, startPostgres, stopPostgres, type TestPg } from '../setup';

// NOTE (phase 10.2, D-04/D-07): this test previously exercised
// `TenantScopedRepository` against the now-deleted `brands` table.
// `locations` is the closest surviving analog — a simple tenant-scoped
// table with no required parent beyond `tenants`.
class TestLocationRepo extends TenantScopedRepository {
  findById(id: string) {
    return this.selectOne(schema.locations, eq(schema.locations.id, id));
  }
  listAll() {
    return this.selectMany(schema.locations);
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
  let locationIdA: string;
  let locationIdB: string;
  let repo: TestLocationRepo;

  beforeAll(async () => {
    pg = await startPostgres();
    repo = new TestLocationRepo(pg.db);

    await pg.db.withoutTenant('seed for repo-base test', async (tx) => {
      const [a] = await tx
        .insert(schema.tenants)
        .values({ slug: 'repobase-a', displayName: 'A', country: 'GB' })
        .returning({ id: schema.tenants.id });
      const [b] = await tx
        .insert(schema.tenants)
        .values({ slug: 'repobase-b', displayName: 'B', country: 'GB' })
        .returning({ id: schema.tenants.id });
      if (!a || !b) throw new Error('seed tenants');
      tenantA = a.id;
      tenantB = b.id;

      const [la] = await tx
        .insert(schema.locations)
        .values({ tenantId: tenantA, name: 'LocationA', slug: 'locationa' })
        .returning({ id: schema.locations.id });
      const [lb] = await tx
        .insert(schema.locations)
        .values({ tenantId: tenantB, name: 'LocationB', slug: 'locationb' })
        .returning({ id: schema.locations.id });
      if (!la || !lb) throw new Error('seed locations');
      locationIdA = la.id;
      locationIdB = lb.id;
    });
  }, 90_000);

  afterAll(async () => {
    await stopPostgres(pg);
  });

  it('selectOne(tenant-B-location-id) returns null when ALS is bound to tenant A', async () => {
    const got = await runInTenantContext({ tenantId: tenantA }, () => repo.findById(locationIdB));
    expect(got).toBeNull();
  });

  it('selectOne returns own-tenant location when ALS bound to it', async () => {
    const got = await runInTenantContext({ tenantId: tenantA }, () => repo.findById(locationIdA));
    expect(got?.id).toBe(locationIdA);
  });

  it('selectMany returns only own-tenant rows under ALS', async () => {
    const fromA = await runInTenantContext({ tenantId: tenantA }, () => repo.listAll());
    const fromB = await runInTenantContext({ tenantId: tenantB }, () => repo.listAll());
    expect(fromA.map((r) => r.id)).toEqual([locationIdA]);
    expect(fromB.map((r) => r.id)).toEqual([locationIdB]);
  });

  it('throws when called outside ALS context', async () => {
    const err = await repo.findById(locationIdA).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/No tenant context bound/i);
  });
});
