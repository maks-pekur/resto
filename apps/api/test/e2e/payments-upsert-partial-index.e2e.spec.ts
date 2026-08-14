import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { schema } from '@resto/db';
import { TenantId } from '@resto/domain';
import { PaymentDrizzleRepository } from '../../src/contexts/payments/infrastructure/payment-drizzle.repository';
import { isDockerAvailable, startDbStack, stopDbStack } from './helpers/with-db-stack';
import type { DbStack } from './helpers/with-db-stack';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[payments-upsert-partial-index] Docker not available — skipping.');
}

suite(
  'PaymentDrizzleRepository.upsertByPaymentIntentId — partial-index ON CONFLICT (PAY-14)',
  () => {
    let stack: DbStack;
    let tenantId: string;
    let orderId: string;

    beforeAll(async () => {
      stack = await startDbStack();
      tenantId = randomUUID();
      const brandId = randomUUID();
      orderId = randomUUID();

      await stack.db.withoutTenant('seed for payments partial-index e2e', async (tx) => {
        await tx.insert(schema.tenants).values({
          id: tenantId,
          slug: `pay-upsert-${tenantId.slice(0, 8)}`,
          displayName: 'Payments Upsert Test Tenant',
          locale: 'en',
          defaultCurrency: 'EUR',
        });

        await tx.insert(schema.brands).values({
          id: brandId,
          tenantId,
          slug: `pay-upsert-brand-${brandId.slice(0, 8)}`,
          displayName: 'Test Brand',
        });

        const [location] = await tx
          .insert(schema.locations)
          .values({ tenantId, brandId, name: 'Payments Upsert Test Location' })
          .returning({ id: schema.locations.id });
        if (!location) throw new Error('seed for payments partial-index e2e: location failed.');

        await tx.insert(schema.orders).values({
          id: orderId,
          tenantId,
          brandId,
          locationId: location.id,
          idempotencyKey: randomUUID(),
          orderNumber: 'ORD-001',
          status: 'requires_action',
          fulfillmentMode: 'dine_in',
          subtotal: '10.00',
          total: '10.00',
          currency: 'EUR',
          shortNumber: 1,
        });
      });
    }, 120_000);

    afterAll(async () => {
      if (stack) await stopDbStack(stack);
    });

    it('first upsert inserts the payment row without 42P10 (partial-index arbiter resolves)', async () => {
      const repo = new PaymentDrizzleRepository(stack.db);
      const paymentIntentId = `pi_${randomUUID().replace(/-/g, '').slice(0, 24)}`;

      const result = await stack.db.withTenantId(tenantId, async (tx) => {
        return repo.upsertByPaymentIntentId(
          {
            tenantId: TenantId.parse(tenantId),
            orderId,
            status: 'requires_action',
            amount: '10.00',
            currency: 'EUR',
            paymentIntentId,
          },
          tx,
        );
      });

      expect(result.status).toBe('requires_action');
      expect(result.paymentIntentId).toBe(paymentIntentId);
    });

    it('second upsert with same paymentIntentId updates the row (ON CONFLICT DO UPDATE path)', async () => {
      const repo = new PaymentDrizzleRepository(stack.db);
      const paymentIntentId = `pi_${randomUUID().replace(/-/g, '').slice(0, 24)}`;

      await stack.db.withTenantId(tenantId, async (tx) => {
        await repo.upsertByPaymentIntentId(
          {
            tenantId: TenantId.parse(tenantId),
            orderId,
            status: 'requires_action',
            amount: '10.00',
            currency: 'EUR',
            paymentIntentId,
          },
          tx,
        );
      });

      const updated = await stack.db.withTenantId(tenantId, async (tx) => {
        return repo.upsertByPaymentIntentId(
          {
            tenantId: TenantId.parse(tenantId),
            orderId,
            status: 'succeeded',
            amount: '10.00',
            currency: 'EUR',
            paymentIntentId,
          },
          tx,
        );
      });

      expect(updated.status).toBe('succeeded');
      expect(updated.paymentIntentId).toBe(paymentIntentId);
    });
  },
);
