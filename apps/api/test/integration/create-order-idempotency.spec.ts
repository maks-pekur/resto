import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { runInTenantContext, schema } from '@resto/db';
import { TenantId } from '@resto/domain';
import { and, count, eq } from 'drizzle-orm';
import {
  isDockerAvailable,
  startDbStack,
  stopDbStack,
  type DbStack,
} from '../e2e/helpers/with-db-stack';
import { OrderDrizzleRepository } from '../../src/contexts/ordering/infrastructure/order-drizzle.repository';
import { CreateOrderService } from '../../src/contexts/ordering/application/create-order.service';
import type { CreateOrderInput } from '../../src/contexts/ordering/application/dto';
import type { MenuPricingPort } from '../../src/contexts/ordering/domain/ports';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[create-order-idempotency] Docker not available — skipping.');
}

const pizzaItemId = randomUUID();
const pizzaCategoryId = randomUUID();
const cheeseGroupId = randomUUID();
const cheeseOptionId = randomUUID();

// Prices are server-authoritative now: the cart only references ids and the
// service resolves prices from this snapshot (mirrors the catalog read path).
const pricing: MenuPricingPort = {
  loadSnapshot: () =>
    Promise.resolve({
      currency: 'USD',
      items: [
        {
          itemId: pizzaItemId,
          categoryId: pizzaCategoryId,
          basePrice: '12.00',
          sizes: [],
          modifierGroupIds: [cheeseGroupId],
        },
      ],
      modifierOptions: [
        {
          optionId: cheeseOptionId,
          groupId: cheeseGroupId,
          priceDelta: '1.50',
          freeAmount: 0,
          minAmount: null,
          maxAmount: null,
        },
      ],
      stoppedItemIds: [],
    }),
};

const makeCartInput = (
  overrides: Partial<CreateOrderInput> = {},
): CreateOrderInput & { idempotencyKey: string } => ({
  items: [
    {
      itemId: pizzaItemId,
      sizeId: null,
      name: 'Margherita Pizza',
      modifiers: [],
      quantity: 2,
    },
  ],
  fulfillmentMode: 'pickup',
  customerName: 'Alice',
  customerPhone: '+1234567890',
  idempotencyKey: randomUUID(),
  ...overrides,
});

suite('CreateOrderService — idempotency', () => {
  let stack: DbStack;
  let repo: OrderDrizzleRepository;
  let service: CreateOrderService;

  const tenantIdA = randomUUID();
  const tenantIdB = randomUUID();
  const brandA = randomUUID();
  const brandB = randomUUID();

  const inTenantA = <T>(op: () => Promise<T>): Promise<T> =>
    runInTenantContext({ tenantId: tenantIdA, brandId: brandA }, op);

  const inTenantB = <T>(op: () => Promise<T>): Promise<T> =>
    runInTenantContext({ tenantId: tenantIdB, brandId: brandB }, op);

  beforeAll(async () => {
    stack = await startDbStack();
    repo = new OrderDrizzleRepository(stack.db);
    service = new CreateOrderService(repo, pricing);

    await stack.db.withoutTenant('seed idempotency spec fixtures', async (tx) => {
      await tx.insert(schema.tenants).values([
        {
          id: tenantIdA,
          slug: 'idem-tenant-a',
          displayName: 'Idem Tenant A',
          locale: 'en',
          defaultCurrency: 'USD',
        },
        {
          id: tenantIdB,
          slug: 'idem-tenant-b',
          displayName: 'Idem Tenant B',
          locale: 'en',
          defaultCurrency: 'USD',
        },
      ]);
      await tx.insert(schema.brands).values([
        { id: brandA, tenantId: tenantIdA, slug: 'brand-a', displayName: 'Brand A' },
        { id: brandB, tenantId: tenantIdB, slug: 'brand-b', displayName: 'Brand B' },
      ]);
    });
  }, 180_000);

  afterAll(async () => {
    if (stack) await stopDbStack(stack);
  });

  it('ORD-10: duplicate idempotency key returns the same orderId and produces only one orders row', async () => {
    const input = makeCartInput();
    const key = input.idempotencyKey;

    const first = await inTenantA(() => service.execute(input));
    const second = await inTenantA(() => service.execute({ ...input, idempotencyKey: key }));

    expect(second.orderId).toBe(first.orderId);
    expect(second.orderNumber).toBe(first.orderNumber);

    const rowCount = await stack.db.withoutTenant('count orders', async (tx) => {
      const rows = await tx
        .select({ n: count() })
        .from(schema.orders)
        .where(and(eq(schema.orders.tenantId, tenantIdA), eq(schema.orders.idempotencyKey, key)));
      return rows[0]?.n ?? 0;
    });

    expect(rowCount).toBe(1);
  });

  it('ORD-10: same idempotency key for two different tenants produces two independent orders', async () => {
    const sharedKey = randomUUID();
    const inputA = makeCartInput({ idempotencyKey: sharedKey });
    const inputB = makeCartInput({ idempotencyKey: sharedKey });

    const orderA = await inTenantA(() => service.execute(inputA));
    const orderB = await inTenantB(() => service.execute(inputB));

    expect(orderA.orderId).not.toBe(orderB.orderId);

    const countA = await stack.db.withoutTenant('count orders A', async (tx) => {
      const rows = await tx
        .select({ n: count() })
        .from(schema.orders)
        .where(
          and(eq(schema.orders.tenantId, tenantIdA), eq(schema.orders.idempotencyKey, sharedKey)),
        );
      return rows[0]?.n ?? 0;
    });

    const countB = await stack.db.withoutTenant('count orders B', async (tx) => {
      const rows = await tx
        .select({ n: count() })
        .from(schema.orders)
        .where(
          and(eq(schema.orders.tenantId, tenantIdB), eq(schema.orders.idempotencyKey, sharedKey)),
        );
      return rows[0]?.n ?? 0;
    });

    expect(countA).toBe(1);
    expect(countB).toBe(1);
  });

  it('creates exactly one outbox row (ordering.order_created.v1) per order', async () => {
    const input = makeCartInput();
    const result = await inTenantA(() => service.execute(input));

    const retry = await inTenantA(() => service.execute(input));
    expect(retry.orderId).toBe(result.orderId);

    const outboxCount = await stack.db.withoutTenant('count outbox rows', async (tx) => {
      const rows = await tx
        .select({ n: count() })
        .from(schema.outboxEvents)
        .where(
          and(
            eq(schema.outboxEvents.tenantId, TenantId.parse(tenantIdA)),
            eq(schema.outboxEvents.aggregateId, result.orderId),
            eq(schema.outboxEvents.type, 'ordering.order_created.v1'),
          ),
        );
      return rows[0]?.n ?? 0;
    });

    expect(outboxCount).toBe(1);
  });

  it('persists the expected order_items and order_modifiers rows', async () => {
    const input = makeCartInput({
      items: [
        {
          itemId: pizzaItemId,
          sizeId: null,
          name: 'Pizza',
          modifiers: [
            {
              optionId: cheeseOptionId,
              name: 'Extra cheese',
              amount: 1,
            },
          ],
          quantity: 1,
        },
      ],
    });

    const result = await inTenantA(() => service.execute(input));

    const itemCount = await stack.db.withoutTenant('count order items', async (tx) => {
      const rows = await tx
        .select({ n: count() })
        .from(schema.orderItems)
        .where(
          and(
            eq(schema.orderItems.orderId, result.orderId),
            eq(schema.orderItems.tenantId, tenantIdA),
          ),
        );
      return rows[0]?.n ?? 0;
    });

    expect(itemCount).toBe(1);

    const itemRows = await stack.db.withoutTenant('get order items', async (tx) =>
      tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, result.orderId)),
    );

    const itemRow = itemRows[0];
    expect(itemRow).toBeDefined();
    if (!itemRow) return;

    const modCount = await stack.db.withoutTenant('count modifiers', async (tx) => {
      const rows = await tx
        .select({ n: count() })
        .from(schema.orderModifiers)
        .where(
          and(
            eq(schema.orderModifiers.orderItemId, itemRow.id),
            eq(schema.orderModifiers.tenantId, tenantIdA),
          ),
        );
      return rows[0]?.n ?? 0;
    });

    expect(modCount).toBe(1);
  });
});
