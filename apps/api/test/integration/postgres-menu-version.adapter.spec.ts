import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { runInTenantContext, schema } from '@resto/db';
import { TenantId } from '@resto/domain';
import { and, eq } from 'drizzle-orm';
import {
  isDockerAvailable,
  startDbStack,
  stopDbStack,
  type DbStack,
} from '../e2e/helpers/with-db-stack';
import { PostgresMenuVersionAdapter } from '../../src/contexts/catalog/infrastructure/postgres-menu-version.adapter';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[postgres-menu-version.adapter] Docker not available — skipping.');
}

suite('PostgresMenuVersionAdapter', () => {
  let stack: DbStack;
  let adapter: PostgresMenuVersionAdapter;
  const tenantId = randomUUID();
  const brandA = randomUUID();
  const brandB = randomUUID();

  const inTenant = <T>(op: () => Promise<T>): Promise<T> => runInTenantContext({ tenantId }, op);

  beforeAll(async () => {
    stack = await startDbStack();
    adapter = new PostgresMenuVersionAdapter(stack.db);

    await stack.db.withoutTenant('seed menu-version adapter fixtures', async (tx) => {
      await tx.insert(schema.tenants).values({
        id: tenantId,
        slug: 'mv-tenant',
        displayName: 'MV Tenant',
        locale: 'en',
        defaultCurrency: 'USD',
      });
      await tx.insert(schema.brands).values([
        { id: brandA, tenantId, slug: 'brand-a', displayName: 'Brand A' },
        { id: brandB, tenantId, slug: 'brand-b', displayName: 'Brand B' },
      ]);
      await tx.insert(schema.catalogMenuVersion).values({ tenantId });
      await tx.insert(schema.catalogBrandStopVersion).values([
        { brandId: brandA, tenantId },
        { brandId: brandB, tenantId },
      ]);
    });
  }, 180_000);

  afterAll(async () => {
    if (stack) await stopDbStack(stack);
  });

  it('current returns the seeded menu version of 1', async () => {
    const v = await inTenant(() => adapter.current(TenantId.parse(tenantId)));
    expect(v).toBe(1);
  });

  it('currentStop returns the seeded stop version of 1 per brand', async () => {
    const a = await inTenant(() => adapter.currentStop(brandA));
    const b = await inTenant(() => adapter.currentStop(brandB));
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  it('current reflects a manual menu-version bump', async () => {
    await stack.db.withoutTenant('bump menu version', async (tx) => {
      await tx
        .update(schema.catalogMenuVersion)
        .set({ menuVersion: 5 })
        .where(eq(schema.catalogMenuVersion.tenantId, tenantId));
    });
    const v = await inTenant(() => adapter.current(TenantId.parse(tenantId)));
    expect(v).toBe(5);
  });

  it('currentStop is per-brand: bumping brand A leaves brand B unchanged', async () => {
    await stack.db.withoutTenant('bump brand A stop version', async (tx) => {
      await tx
        .update(schema.catalogBrandStopVersion)
        .set({ stopVersion: 9 })
        .where(
          and(
            eq(schema.catalogBrandStopVersion.brandId, brandA),
            eq(schema.catalogBrandStopVersion.tenantId, tenantId),
          ),
        );
    });
    const a = await inTenant(() => adapter.currentStop(brandA));
    const b = await inTenant(() => adapter.currentStop(brandB));
    expect(a).toBe(9);
    expect(b).toBe(1);
  });
});
