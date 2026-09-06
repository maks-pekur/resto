import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
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
  console.warn('[payments-isolation] Docker not available — skipping integration tests.');
}

const INTERNAL_TOKEN = 'integration-test-token-1234567890';

interface PaymentsIsolationFixture {
  tenantA: { id: string; slug: string };
  tenantB: { id: string; slug: string };
  operatorACookie: string;
  operatorBCookie: string;
  orderIdA: string;
  orderIdB: string;
  paymentIdA: string;
  paymentIdB: string;
}

const seedFixture = async (stack: RealStack): Promise<PaymentsIsolationFixture> => {
  const slugA = `pi-iso-a-${randomUUID().slice(0, 8)}`;
  const slugB = `pi-iso-b-${randomUUID().slice(0, 8)}`;

  const tenantA = await provisionTenant(stack.app, slugA, INTERNAL_TOKEN);
  const tenantB = await provisionTenant(stack.app, slugB, INTERNAL_TOKEN);

  const emailA = `owner-${slugA}@example.test`;
  const emailB = `owner-${slugB}@example.test`;
  const password = 'correct-horse-battery-staple-pi';

  await runBootstrap({ tenantSlug: slugA, email: emailA, password, name: 'Owner A' });
  await runBootstrap({ tenantSlug: slugB, email: emailB, password, name: 'Owner B' });

  const operatorACookie = await signInAsOperator(stack.app, emailA, password, tenantA.id);
  const operatorBCookie = await signInAsOperator(stack.app, emailB, password, tenantB.id);

  const db = stack.app.get(TenantAwareDb);

  const seeded = await db.withoutTenant('seed payments-isolation fixture', async (tx) => {
    const [locationA] = await tx
      .insert(schema.locations)
      .values({ tenantId: tenantA.id, name: 'Isolation Location A', slug: 'isolation-location-a' })
      .returning({ id: schema.locations.id });
    const [locationB] = await tx
      .insert(schema.locations)
      .values({ tenantId: tenantB.id, name: 'Isolation Location B', slug: 'isolation-location-b' })
      .returning({ id: schema.locations.id });
    if (!locationA || !locationB) throw new Error('location insert failed');

    const orderIdA = randomUUID();
    const orderIdB = randomUUID();

    await tx.execute(sql`
      INSERT INTO orders (id, tenant_id, location_id, idempotency_key, order_number, short_number,
        status, payment_status, paid_at, order_type, subtotal, delivery_fee, service_fee, discount,
        total, currency)
      VALUES
        (${orderIdA}, ${tenantA.id}, ${locationA.id}, ${randomUUID()}, 'ORD-ISOA', 1,
         'placed', 'paid', now(), 'dine_in', '20.00', '0.00', '0.00', '0.00', '20.00', 'EUR'),
        (${orderIdB}, ${tenantB.id}, ${locationB.id}, ${randomUUID()}, 'ORD-ISOB', 1,
         'placed', 'paid', now(), 'dine_in', '20.00', '0.00', '0.00', '0.00', '20.00', 'EUR')
    `);

    const paymentIdA = randomUUID();
    const paymentIdB = randomUUID();

    await tx.execute(sql`
      INSERT INTO payments (id, tenant_id, order_id, status, amount, currency,
        payment_intent_id, stripe_account_id, refunded_amount, application_fee_amount)
      VALUES
        (${paymentIdA}, ${tenantA.id}, ${orderIdA}, 'succeeded', '20.00', 'EUR',
         ${'pi_test_isoa_' + paymentIdA.slice(0, 8)}, 'acct_test_a', '0.00', '0.00'),
        (${paymentIdB}, ${tenantB.id}, ${orderIdB}, 'succeeded', '20.00', 'EUR',
         ${'pi_test_isob_' + paymentIdB.slice(0, 8)}, 'acct_test_b', '0.00', '0.00')
    `);

    const refundIdA = randomUUID();
    await tx.execute(sql`
      INSERT INTO payment_refunds (id, tenant_id, payment_id, stripe_refund_id, refund_request_id, amount, reason, status)
      VALUES
        (${refundIdA}, ${tenantA.id}, ${paymentIdA}, 're_iso_test_a', 'req_iso_test_a', '5.00', 'test refund A', 'succeeded')
    `);

    return { orderIdA, orderIdB, paymentIdA, paymentIdB };
  });

  return {
    tenantA,
    tenantB,
    operatorACookie,
    operatorBCookie,
    ...seeded,
  };
};

suite('cross-tenant payment/refund isolation (PAY-09 / ADR-0020)', () => {
  let stack: RealStack;
  let fixture: PaymentsIsolationFixture;

  beforeAll(async () => {
    stack = await startRealStack({ natsEnabledInApp: false });
    fixture = await seedFixture(stack);
  }, 120_000);

  afterAll(async () => {
    if (stack) await stopRealStack(stack);
  });

  it('operator A cannot refund tenant B order — 404 or 409 (cross-tenant refund blocked)', async () => {
    const res = await stack.app.inject({
      method: 'POST',
      url: `/v1/orders/${fixture.orderIdB}/refund`,
      headers: {
        cookie: fixture.operatorACookie,
        'x-tenant-slug': fixture.tenantA.slug,
        'content-type': 'application/json',
      },
      payload: { reason: 'cross-tenant attack' },
    });
    expect([403, 404, 409]).toContain(res.statusCode);
  });

  it('operator A reads own order — RLS allows it', async () => {
    const db = stack.app.get(TenantAwareDb);
    const rows = await db.withTenantId(fixture.tenantA.id, async (tx) => {
      return tx
        .select({ id: schema.orders.id, tenantId: schema.orders.tenantId })
        .from(schema.orders)
        .where(sql`${schema.orders.id} = ${fixture.orderIdA}`);
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tenantId).toBe(fixture.tenantA.id);
  });

  it('RLS: reading tenant A payments inside tenant B context returns 0 rows', async () => {
    const db = stack.app.get(TenantAwareDb);
    const rows = await db.withTenantId(fixture.tenantB.id, async (tx) => {
      return tx
        .select({ id: schema.payments.id })
        .from(schema.payments)
        .where(sql`${schema.payments.id} = ${fixture.paymentIdA}`);
    });
    expect(rows).toHaveLength(0);
  });

  it('RLS: reading tenant B payment_refunds inside tenant A context returns 0 rows', async () => {
    const db = stack.app.get(TenantAwareDb);

    const refundIdB = randomUUID();
    await db.withoutTenant('seed refund B for isolation check', async (tx) => {
      await tx.execute(sql`
        INSERT INTO payment_refunds (id, tenant_id, payment_id, stripe_refund_id, refund_request_id, amount, reason, status)
        VALUES (${refundIdB}, ${fixture.tenantB.id}, ${fixture.paymentIdB}, 're_iso_test_b2', 'req_iso_test_b2', '5.00', 'test B', 'succeeded')
      `);
    });

    const rows = await db.withTenantId(fixture.tenantA.id, async (tx) => {
      return tx
        .select({ id: schema.paymentRefunds.id })
        .from(schema.paymentRefunds)
        .where(sql`${schema.paymentRefunds.id} = ${refundIdB}`);
    });
    expect(rows).toHaveLength(0);
  });

  it('operator B cannot see tenant A refund endpoint result', async () => {
    const res = await stack.app.inject({
      method: 'POST',
      url: `/v1/orders/${fixture.orderIdA}/refund`,
      headers: {
        cookie: fixture.operatorBCookie,
        'x-tenant-slug': fixture.tenantB.slug,
        'content-type': 'application/json',
      },
      payload: { reason: 'cross-tenant attack from B' },
    });
    expect([403, 404, 409]).toContain(res.statusCode);
  });
});
