import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runInTenantContext, schema } from '@resto/db';
import { LocationId, TenantId } from '@resto/domain';
import {
  isDockerAvailable,
  startDbStack,
  stopDbStack,
  type DbStack,
} from './helpers/with-db-stack';
import { LocationDrizzleRepository } from '../../src/contexts/tenancy/infrastructure/location-drizzle.repository';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[location-delete] Docker not available — skipping.');
}

suite('Deleting a location', () => {
  let stack: DbStack;
  let repo: LocationDrizzleRepository;
  const tenantId = randomUUID();
  const emptyLocation = randomUUID();
  const usedLocation = randomUUID();

  beforeAll(async () => {
    stack = await startDbStack();
    repo = new LocationDrizzleRepository(stack.db);

    await stack.db.withoutTenant('seed location-delete fixtures', async (tx) => {
      await tx.insert(schema.tenants).values({
        id: tenantId,
        slug: `del-${tenantId.slice(0, 8)}`,
        displayName: 'Delete Tenant',
        locale: 'en',
        country: 'GB',
        defaultCurrency: 'EUR',
      });
      await tx.insert(schema.locations).values([
        { id: emptyLocation, tenantId, name: 'Empty', slug: 'empty' },
        { id: usedLocation, tenantId, name: 'Used', slug: 'used' },
      ]);
      await tx.insert(schema.orders).values({
        id: randomUUID(),
        tenantId,
        locationId: usedLocation,
        idempotencyKey: randomUUID(),
        orderNumber: 'D-1',
        status: 'completed',
        orderType: 'dine_in',
        subtotal: '10.00',
        total: '10.00',
        currency: 'EUR',
        shortNumber: 1,
      });
    });
  }, 180_000);

  afterAll(async () => {
    if (stack) await stopDbStack(stack);
  });

  it('removes a location that never took an order', async () => {
    await runInTenantContext({ tenantId }, () =>
      repo.deleteEmpty(LocationId.parse(emptyLocation), TenantId.parse(tenantId)),
    );

    const remaining = await runInTenantContext({ tenantId }, () =>
      repo.findById(LocationId.parse(emptyLocation)),
    );
    expect(remaining).toBeNull();
  });

  it('refuses to delete a location that has orders', async () => {
    await expect(
      runInTenantContext({ tenantId }, () =>
        repo.deleteEmpty(LocationId.parse(usedLocation), TenantId.parse(tenantId)),
      ),
    ).rejects.toThrow(/location_has_orders/);
  });

  it('leaves the location with orders in place after the refusal', async () => {
    const survivor = await runInTenantContext({ tenantId }, () =>
      repo.findById(LocationId.parse(usedLocation)),
    );

    expect(survivor?.id).toBe(usedLocation);
  });
});
