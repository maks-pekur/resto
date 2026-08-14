import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { runInTenantContext, schema } from '@resto/db';
import { TenantId } from '@resto/domain';
import { OrderSequenceDrizzleRepository } from '../../src/contexts/ordering/infrastructure/order-sequence-drizzle.repository';
import { isDockerAvailable, startDbStack, stopDbStack } from './helpers/with-db-stack';
import type { DbStack } from './helpers/with-db-stack';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[order-short-number] Docker not available — skipping.');
}

// T-10-04-01/03: proves the atomic per-(tenant, location, business_date)
// counter is duplicate-free and gap-free under concurrency, and that the
// composite FK rejects a locationId from another tenant. Follows the
// payment-lifecycle.e2e.spec.ts harness exactly -- real Postgres
// testcontainer, real OrderSequenceDrizzleRepository, nothing mocked.
suite(
  'OrderSequenceDrizzleRepository.nextShortNumber — atomic per-location daily counter (D-04)',
  () => {
    let stack: DbStack;
    let repo: OrderSequenceDrizzleRepository;
    let tenantId: string;
    let locationIdA: string;
    let locationIdB: string;
    let otherTenantLocationId: string;

    beforeAll(async () => {
      stack = await startDbStack();
      repo = new OrderSequenceDrizzleRepository(stack.db);

      tenantId = randomUUID();
      const brandId = randomUUID();
      const otherTenantId = randomUUID();
      const otherBrandId = randomUUID();

      await stack.db.withoutTenant('seed order-short-number e2e', async (tx) => {
        await tx.insert(schema.tenants).values([
          {
            id: tenantId,
            slug: `short-num-${tenantId.slice(0, 8)}`,
            displayName: 'Short Number Test Tenant',
            locale: 'en',
            defaultCurrency: 'EUR',
          },
          {
            id: otherTenantId,
            slug: `short-num-other-${otherTenantId.slice(0, 8)}`,
            displayName: 'Short Number Other Tenant',
            locale: 'en',
            defaultCurrency: 'EUR',
          },
        ]);

        await tx.insert(schema.brands).values([
          {
            id: brandId,
            tenantId,
            slug: `short-num-brand-${brandId.slice(0, 8)}`,
            displayName: 'Test Brand',
          },
          {
            id: otherBrandId,
            tenantId: otherTenantId,
            slug: `short-num-other-brand-${otherBrandId.slice(0, 8)}`,
            displayName: 'Other Tenant Brand',
          },
        ]);

        const [locA] = await tx
          .insert(schema.locations)
          .values({ tenantId, brandId, name: 'Short Number Location A' })
          .returning({ id: schema.locations.id });
        const [locB] = await tx
          .insert(schema.locations)
          .values({ tenantId, brandId, name: 'Short Number Location B' })
          .returning({ id: schema.locations.id });
        const [locOther] = await tx
          .insert(schema.locations)
          .values({ tenantId: otherTenantId, brandId: otherBrandId, name: 'Other Tenant Location' })
          .returning({ id: schema.locations.id });
        if (!locA || !locB || !locOther) {
          throw new Error('seed order-short-number e2e: location insert failed.');
        }
        locationIdA = locA.id;
        locationIdB = locB.id;
        otherTenantLocationId = locOther.id;
      });
    }, 120_000);

    afterAll(async () => {
      if (stack) await stopDbStack(stack);
    });

    const next = (locationId: string, businessDate: string): Promise<number> =>
      runInTenantContext({ tenantId }, () =>
        repo.nextShortNumber({ tenantId: TenantId.parse(tenantId), locationId, businessDate }),
      );

    const readCounterRow = async (
      locationId: string,
      businessDate: string,
    ): Promise<number | undefined> => {
      const [row] = await stack.db.withoutTenant('read order_daily_sequences counter', async (tx) =>
        tx
          .select({ counter: schema.orderDailySequences.counter })
          .from(schema.orderDailySequences)
          .where(
            and(
              eq(schema.orderDailySequences.tenantId, tenantId),
              eq(schema.orderDailySequences.locationId, locationId),
              eq(schema.orderDailySequences.businessDate, businessDate),
            ),
          ),
      );
      return row?.counter;
    };

    it('two locations under the same tenant each start at 1 on the same business date', async () => {
      const businessDate = '2030-01-01';
      const a = await next(locationIdA, businessDate);
      const b = await next(locationIdB, businessDate);
      expect(a).toBe(1);
      expect(b).toBe(1);
      expect(await readCounterRow(locationIdA, businessDate)).toBe(1);
      expect(await readCounterRow(locationIdB, businessDate)).toBe(1);
    });

    it('the same location on two different business dates each start at 1', async () => {
      const first = await next(locationIdA, '2030-02-01');
      const second = await next(locationIdA, '2030-02-02');
      expect(first).toBe(1);
      expect(second).toBe(1);
      expect(await readCounterRow(locationIdA, '2030-02-01')).toBe(1);
      expect(await readCounterRow(locationIdA, '2030-02-02')).toBe(1);
    });

    it('N concurrent generations for the same (tenant, location, date) are duplicate-free and gap-free', async () => {
      const businessDate = '2030-03-01';
      const N = 25;

      const results = await Promise.all(
        Array.from({ length: N }, () => next(locationIdB, businessDate)),
      );

      const sorted = [...results].sort((x, y) => x - y);
      expect(sorted).toEqual(Array.from({ length: N }, (_, i) => i + 1));
      expect(new Set(results).size).toBe(N);

      // Assert on the database row, not just the in-memory return values.
      const dbCounter = await readCounterRow(locationIdB, businessDate);
      expect(dbCounter).toBe(N);
    });

    it('a locationId belonging to a different tenant is rejected by the composite FK', async () => {
      await expect(next(otherTenantLocationId, '2030-04-01')).rejects.toThrow();
    });
  },
);
