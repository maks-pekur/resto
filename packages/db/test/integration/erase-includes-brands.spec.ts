import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { isDockerAvailable, startPostgres, stopPostgres, type TestPg } from '../setup';
import { schema } from '../../src/index';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[erase-includes-brands] Docker not available — skipping.');
}

const SALT = 'test-salt-must-be-at-least-32-chars';

suite('tenancy_erase_tenant — wipes brand rows', () => {
  let pg: TestPg;
  let tenantId: string;
  let brandId: string;
  let memberId: string;

  beforeAll(async () => {
    pg = await startPostgres();
    await pg.db.withoutTenant('seed for erase test', async (tx) => {
      const [t] = await tx
        .insert(schema.tenants)
        .values({ slug: 'erase-target', displayName: 'EraseTarget' })
        .returning({ id: schema.tenants.id });
      if (!t) throw new Error('seed tenant failed');
      tenantId = t.id;

      const [b] = await tx
        .insert(schema.brands)
        .values({ tenantId, slug: 'erase-brand', displayName: 'EraseBrand' })
        .returning({ id: schema.brands.id });
      if (!b) throw new Error('seed brand failed');
      brandId = b.id;

      await tx.insert(schema.brandDomains).values({
        brandId,
        tenantId,
        domain: 'erase-brand.menu.resto.app',
        kind: 'subdomain',
        isPrimary: true,
      });

      const userId = 'user-erase';
      memberId = 'member-erase';
      await tx.insert(schema.user).values({
        id: userId,
        email: 'erase@test',
        emailVerified: true,
        name: 'Erase user',
      });
      await tx.insert(schema.member).values({
        id: memberId,
        userId,
        organizationId: tenantId,
        role: 'owner',
        createdAt: new Date(),
      });
      await tx.insert(schema.memberBrandScope).values({
        memberId,
        brandId,
        tenantId,
      });
    });
  }, 90_000);

  afterAll(async () => {
    await stopPostgres(pg);
  });

  it('removes brand_domains, member_brand_scope, and brands rows for the erased tenant', async () => {
    await pg.db.withoutTenant('run erase', async (tx) =>
      tx.execute(sql`SELECT tenancy_erase_tenant(${tenantId}::uuid, ${SALT})`),
    );

    const remainingBrands = await pg.db.withoutTenant('count brands', async (tx) =>
      tx
        .select()
        .from(schema.brands)
        .where(sql`tenant_id = ${tenantId}`),
    );
    expect(remainingBrands).toEqual([]);

    const remainingDomains = await pg.db.withoutTenant('count domains', async (tx) =>
      tx
        .select()
        .from(schema.brandDomains)
        .where(sql`tenant_id = ${tenantId}`),
    );
    expect(remainingDomains).toEqual([]);

    const remainingScopes = await pg.db.withoutTenant('count scopes', async (tx) =>
      tx
        .select()
        .from(schema.memberBrandScope)
        .where(sql`tenant_id = ${tenantId}`),
    );
    expect(remainingScopes).toEqual([]);
  });
});
