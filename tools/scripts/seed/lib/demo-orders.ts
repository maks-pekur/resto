import { randomUUID } from 'node:crypto';
import postgres, { type Sql } from 'postgres';

export const createAppDb = (databaseUrl: string): Sql =>
  postgres(databaseUrl, { max: 1, prepare: false });

export type DemoOrderStatus = 'paid' | 'accepted' | 'preparing' | 'ready' | 'completed';

export interface DemoOrderSpec {
  readonly status: DemoOrderStatus;
  readonly ageMinutes?: number;
  readonly prepMinutes?: number;
  readonly customerName: string;
  readonly quantity?: number;
}

export interface SeedDemoOrderInput {
  readonly apiUrl: string;
  readonly tenantId: string;
  readonly locationId: string;
  readonly itemId: string;
  readonly itemName: string;
  readonly spec: DemoOrderSpec;
}

export interface SeededDemoOrder {
  readonly orderId: string;
  readonly shortNumber: number;
  readonly status: DemoOrderStatus;
}

interface CreateOrderResponse {
  readonly orderId: string;
  readonly shortNumber: number;
  readonly total: string;
  readonly currency: string;
}

const createOrder = async (input: SeedDemoOrderInput): Promise<CreateOrderResponse> => {
  const res = await fetch(new URL('/v1/orders', input.apiUrl).toString(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-tenant-id': input.tenantId,
      'x-location-id': input.locationId,
    },
    body: JSON.stringify({
      items: [
        {
          itemId: input.itemId,
          sizeId: null,
          name: input.itemName,
          modifiers: [],
          quantity: input.spec.quantity ?? 1,
        },
      ],
      orderType: 'pickup',
      idempotencyKey: randomUUID(),
      channel: 'site',
      marketingConsent: false,
      customerName: input.spec.customerName,
      customerPhone: '+15555550100',
    }),
  });
  if (res.status !== 201) {
    throw new Error(`demo order create -> ${String(res.status)} ${await res.text()}`);
  }
  return (await res.json()) as CreateOrderResponse;
};

const STATUS_TIMESTAMP_COLUMN: Partial<Record<DemoOrderStatus, string>> = {
  accepted: 'accepted_at',
  preparing: 'preparing_at',
  ready: 'ready_at',
  completed: 'completed_at',
};

const advanceOrder = async (
  sql: Sql,
  orderId: string,
  spec: DemoOrderSpec,
  total: string,
  currency: string,
  tenantId: string,
): Promise<void> => {
  const ageMinutes = spec.ageMinutes ?? 0;
  const paymentId = randomUUID();
  const intentId = `pi_demo${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const chargeId = `ch_demo${randomUUID().replace(/-/g, '').slice(0, 20)}`;

  await sql.begin(async (tx) => {
    await tx`SELECT app_bind_tenant(${tenantId}::text, false)`;

    await tx`
      INSERT INTO payments (
        id, tenant_id, order_id, status, amount, currency, provider,
        payment_intent_id, latest_charge_id, refunded_amount,
        stripe_account_id, application_fee_amount
      ) VALUES (
        ${paymentId}, ${tenantId}, ${orderId}, 'succeeded', ${total}, ${currency}, 'stripe',
        ${intentId}, ${chargeId}, '0.00', 'acct_demoSeedFixture', '0.00'
      )
    `;

    await tx`
      UPDATE orders
         SET status = ${spec.status},
             created_at = now() - (${ageMinutes} * interval '1 minute'),
             updated_at = now()
       WHERE id = ${orderId}
    `;

    if (spec.status !== 'paid') {
      const acceptedAgo = Math.max(ageMinutes - 1, 0);
      await tx`
        UPDATE orders
           SET accepted_at = now() - (${acceptedAgo} * interval '1 minute'),
               eta_at = now() + (${spec.prepMinutes ?? 20} * interval '1 minute')
         WHERE id = ${orderId}
      `;
      const column = STATUS_TIMESTAMP_COLUMN[spec.status];
      if (column !== undefined && column !== 'accepted_at') {
        await tx.unsafe(`UPDATE orders SET ${column} = now() WHERE id = $1`, [orderId]);
      }
    }
  });
};

export const seedDemoOrder = async (
  sql: Sql,
  input: SeedDemoOrderInput,
): Promise<SeededDemoOrder> => {
  const created = await createOrder(input);
  await advanceOrder(
    sql,
    created.orderId,
    input.spec,
    created.total,
    created.currency,
    input.tenantId,
  );
  return { orderId: created.orderId, shortNumber: created.shortNumber, status: input.spec.status };
};

export const DEMO_ORDER_SPECS: readonly DemoOrderSpec[] = [
  { status: 'paid', ageMinutes: 0, customerName: 'Анна Петрова' },
  { status: 'paid', ageMinutes: 2, customerName: 'Ivan Smirnov', quantity: 2 },
  { status: 'paid', ageMinutes: 7, customerName: 'Late Order' },
  { status: 'accepted', ageMinutes: 9, prepMinutes: 20, customerName: 'Olga K' },
  { status: 'preparing', ageMinutes: 14, prepMinutes: 15, customerName: 'Pavel R' },
  { status: 'ready', ageMinutes: 21, prepMinutes: 10, customerName: 'Maria L' },
  { status: 'completed', ageMinutes: 40, prepMinutes: 15, customerName: 'Sergey D' },
];
