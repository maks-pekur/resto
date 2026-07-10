import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { isDockerAvailable, startPostgres, stopPostgres, type TestPg } from '../setup';
import { schema } from '../../src/index';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[erase-includes-ordering] Docker not available — skipping.');
}

const SALT = 'test-salt-must-be-at-least-32-chars';

suite('tenancy_erase_tenant — wipes ordering rows (BLOCK-2)', () => {
  let pg: TestPg;
  let tenantId: string;
  let brandId: string;
  let locationId: string;
  let orderId: string;

  beforeAll(async () => {
    pg = await startPostgres();
    await pg.db.withoutTenant('seed ordering erase fixtures', async (tx) => {
      const [t] = await tx
        .insert(schema.tenants)
        .values({ slug: 'erase-ord', displayName: 'EraseOrd' })
        .returning({ id: schema.tenants.id });
      if (!t) throw new Error('seed tenant failed');
      tenantId = t.id;

      const [b] = await tx
        .insert(schema.brands)
        .values({ tenantId, slug: 'erase-ord-brand', displayName: 'EraseOrdBrand' })
        .returning({ id: schema.brands.id });
      if (!b) throw new Error('seed brand failed');
      brandId = b.id;

      const [loc] = await tx
        .insert(schema.locations)
        .values({ tenantId, brandId, name: 'EraseOrd Location' })
        .returning({ id: schema.locations.id });
      if (!loc) throw new Error('seed location failed');
      locationId = loc.id;

      const [o] = await tx
        .insert(schema.orders)
        .values({
          tenantId,
          brandId,
          locationId,
          idempotencyKey: 'erase-ord-idem',
          orderNumber: '20260621-ERS',
          status: 'created',
          fulfillmentMode: 'pickup',
          tableIdentifier: 'T7',
          customerName: 'Guest PII',
          customerPhone: '+15555550199',
          subtotal: '10.00',
          total: '11.50',
          currency: 'USD',
        })
        .returning({ id: schema.orders.id });
      if (!o) throw new Error('seed order failed');
      orderId = o.id;

      const [oi] = await tx
        .insert(schema.orderItems)
        .values({
          tenantId,
          orderId,
          menuItemId: '99999999-9999-9999-9999-999999999999',
          nameSnapshot: 'Pizza',
          unitPrice: '10.00',
          lineTotal: '10.00',
          currency: 'USD',
        })
        .returning({ id: schema.orderItems.id });
      if (!oi) throw new Error('seed order item failed');

      await tx.insert(schema.orderModifiers).values({
        tenantId,
        orderItemId: oi.id,
        optionId: '88888888-8888-8888-8888-888888888888',
        nameSnapshot: 'Cheese',
        priceDelta: '1.50',
      });

      await tx.insert(schema.payments).values({
        tenantId,
        orderId,
        status: 'succeeded',
        amount: '11.50',
        currency: 'USD',
        providerPaymentId: 'pi_stripe_secret_xyz',
      });
    });
  }, 90_000);

  afterAll(async () => {
    await stopPostgres(pg);
  });

  it('erases orders/items/modifiers/payments and still removes the brand (orders→brands RESTRICT no longer blocks)', async () => {
    await pg.db.withoutTenant('run erase', async (tx) => {
      await tx.execute(sql`SELECT app_allow_erasure(${tenantId}::uuid)`);
      await tx.execute(
        sql`SELECT tenancy_erase_tenant(${tenantId}::uuid, ${SALT}, 'test:erase-includes-ordering')`,
      );
    });

    await pg.db.withoutTenant('assert ordering wiped', async (tx) => {
      const orders = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.orders)
        .where(eq(schema.orders.tenantId, tenantId));
      expect(orders[0]?.n).toBe(0);

      const items = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.orderItems)
        .where(eq(schema.orderItems.tenantId, tenantId));
      expect(items[0]?.n).toBe(0);

      const mods = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.orderModifiers)
        .where(eq(schema.orderModifiers.tenantId, tenantId));
      expect(mods[0]?.n).toBe(0);

      const pays = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.payments)
        .where(eq(schema.payments.tenantId, tenantId));
      expect(pays[0]?.n).toBe(0);

      const brands = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.brands)
        .where(eq(schema.brands.tenantId, tenantId));
      expect(brands[0]?.n).toBe(0);
    });
  });
});
