import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { schema } from '@resto/db';
import { OrderId, TenantId } from '@resto/domain';
import { runInTenantContext } from '@resto/db';
import { OrderDrizzleRepository } from '../../src/contexts/ordering/infrastructure/order-drizzle.repository';
import { AcceptOrderService } from '../../src/contexts/ordering/application/accept-order.service';
import { AdvanceOrderStatusService } from '../../src/contexts/ordering/application/advance-order-status.service';
import {
  InvalidOrderTransitionError,
  InvalidPrepMinutesError,
  OrderNotFoundError,
} from '../../src/contexts/ordering/domain/errors';
import { isDockerAvailable, startDbStack, stopDbStack } from './helpers/with-db-stack';
import type { DbStack } from './helpers/with-db-stack';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[order-lifecycle] Docker not available — skipping.');
}

suite('Order lifecycle e2e — forward transitions, ETA capture, idempotency, outbox', () => {
  let stack: DbStack;
  let tenantId: string;
  let brandId: string;
  let locationId: string;
  let shortNumberCounter = 1;

  beforeAll(async () => {
    stack = await startDbStack();
    tenantId = randomUUID();
    brandId = randomUUID();

    await stack.db.withoutTenant('seed order-lifecycle e2e', async (tx) => {
      await tx.insert(schema.tenants).values({
        id: tenantId,
        slug: `lifecycle-${tenantId.slice(0, 8)}`,
        displayName: 'Lifecycle Test Tenant',
        locale: 'en',
        defaultCurrency: 'EUR',
      });
      await tx.insert(schema.brands).values({
        id: brandId,
        tenantId,
        slug: `lifecycle-brand-${brandId.slice(0, 8)}`,
        displayName: 'Lifecycle Test Brand',
      });
      const [location] = await tx
        .insert(schema.locations)
        .values({ tenantId, brandId, name: 'Lifecycle Test Location' })
        .returning({ id: schema.locations.id });
      if (!location) throw new Error('seed order-lifecycle e2e: location insert failed.');
      locationId = location.id;
    });
  }, 120_000);

  afterAll(async () => {
    if (stack) await stopDbStack(stack);
  });

  const seedOrder = async (status: string): Promise<string> => {
    const orderId = randomUUID();
    await stack.db.withoutTenant('seed order for lifecycle e2e', async (tx) => {
      await tx.insert(schema.orders).values({
        id: orderId,
        tenantId,
        brandId,
        locationId,
        idempotencyKey: randomUUID(),
        orderNumber: `ORD-LIFECYCLE-${orderId.slice(0, 8)}`,
        status,
        fulfillmentMode: 'dine_in',
        subtotal: '15.00',
        total: '15.00',
        currency: 'EUR',
        shortNumber: shortNumberCounter++,
      });
    });
    return orderId;
  };

  const readOrderRow = async (orderId: string) => {
    const [row] = await stack.db.withoutTenant('read order row', async (tx) =>
      tx
        .select({
          status: schema.orders.status,
          acceptedAt: schema.orders.acceptedAt,
          preparingAt: schema.orders.preparingAt,
          readyAt: schema.orders.readyAt,
          completedAt: schema.orders.completedAt,
          canceledAt: schema.orders.canceledAt,
          acceptedByUserId: schema.orders.acceptedByUserId,
          etaAt: schema.orders.etaAt,
          updatedAt: schema.orders.updatedAt,
        })
        .from(schema.orders)
        .where(sql`${schema.orders.id} = ${orderId}`),
    );
    return row;
  };

  const readOutboxPayloads = async (
    orderId: string,
    type: string,
  ): Promise<Record<string, unknown>[]> => {
    const rows = await stack.db.withoutTenant('read outbox payloads', async (tx) =>
      tx
        .select({ payload: schema.outboxEvents.payload })
        .from(schema.outboxEvents)
        .where(
          sql`${schema.outboxEvents.aggregateId} = ${orderId} AND ${schema.outboxEvents.type} = ${type}`,
        )
        .orderBy(schema.outboxEvents.occurredAt),
    );
    return rows.map((r) => r.payload);
  };

  it('drives paid -> accepted -> preparing -> ready -> completed, each transition stamping only its own column', async () => {
    const orderId = await seedOrder('paid');
    const orderRepo = new OrderDrizzleRepository(stack.db);
    const acceptService = new AcceptOrderService(orderRepo);
    const advanceService = new AdvanceOrderStatusService(orderRepo);

    await runInTenantContext({ tenantId }, () =>
      acceptService.execute({
        orderId: OrderId.parse(orderId),
        tenantId: TenantId.parse(tenantId),
        prepMinutes: 20,
        actorUserId: 'operator-accept',
      }),
    );
    let row = await readOrderRow(orderId);
    expect(row?.status).toBe('accepted');
    expect(row?.acceptedAt).not.toBeNull();
    expect(row?.acceptedByUserId).toBe('operator-accept');
    expect(row?.preparingAt).toBeNull();
    expect(row?.readyAt).toBeNull();
    expect(row?.completedAt).toBeNull();
    const acceptedAt = row?.acceptedAt;

    await runInTenantContext({ tenantId }, () =>
      advanceService.execute({
        orderId: OrderId.parse(orderId),
        tenantId: TenantId.parse(tenantId),
        targetStatus: 'preparing',
        actorUserId: 'operator-prep',
      }),
    );
    row = await readOrderRow(orderId);
    expect(row?.status).toBe('preparing');
    expect(row?.preparingAt).not.toBeNull();
    expect(row?.readyAt).toBeNull();
    expect(row?.completedAt).toBeNull();
    expect(row?.acceptedAt?.getTime()).toBe(acceptedAt?.getTime());
    const preparingAt = row?.preparingAt;

    await runInTenantContext({ tenantId }, () =>
      advanceService.execute({
        orderId: OrderId.parse(orderId),
        tenantId: TenantId.parse(tenantId),
        targetStatus: 'ready',
        actorUserId: 'operator-ready',
      }),
    );
    row = await readOrderRow(orderId);
    expect(row?.status).toBe('ready');
    expect(row?.readyAt).not.toBeNull();
    expect(row?.completedAt).toBeNull();
    expect(row?.acceptedAt?.getTime()).toBe(acceptedAt?.getTime());
    expect(row?.preparingAt?.getTime()).toBe(preparingAt?.getTime());
    const readyAt = row?.readyAt;

    await runInTenantContext({ tenantId }, () =>
      advanceService.execute({
        orderId: OrderId.parse(orderId),
        tenantId: TenantId.parse(tenantId),
        targetStatus: 'completed',
        actorUserId: 'operator-complete',
      }),
    );
    row = await readOrderRow(orderId);
    expect(row?.status).toBe('completed');
    expect(row?.completedAt).not.toBeNull();
    expect(row?.acceptedAt?.getTime()).toBe(acceptedAt?.getTime());
    expect(row?.preparingAt?.getTime()).toBe(preparingAt?.getTime());
    expect(row?.readyAt?.getTime()).toBe(readyAt?.getTime());
  });

  it('eta_at is server-computed from now + prepMinutes, never from a caller-supplied timestamp', async () => {
    const orderId = await seedOrder('paid');
    const orderRepo = new OrderDrizzleRepository(stack.db);
    const acceptService = new AcceptOrderService(orderRepo);

    await runInTenantContext({ tenantId }, () =>
      acceptService.execute({
        orderId: OrderId.parse(orderId),
        tenantId: TenantId.parse(tenantId),
        prepMinutes: 20,
        actorUserId: null,
      }),
    );

    const row = await readOrderRow(orderId);
    const etaAt = row?.etaAt;
    const acceptedAt = row?.acceptedAt;
    if (!etaAt || !acceptedAt) throw new Error('expected etaAt and acceptedAt to be set');
    const deltaMinutes = (etaAt.getTime() - acceptedAt.getTime()) / 60_000;
    expect(deltaMinutes).toBeGreaterThan(19.9);
    expect(deltaMinutes).toBeLessThan(20.1);
  });

  it('prepMinutes bounds: 4 and 181 throw InvalidPrepMinutesError; 5 and 180 succeed', async () => {
    const orderRepo = new OrderDrizzleRepository(stack.db);
    const acceptService = new AcceptOrderService(orderRepo);

    const order4 = await seedOrder('paid');
    await expect(
      runInTenantContext({ tenantId }, () =>
        acceptService.execute({
          orderId: OrderId.parse(order4),
          tenantId: TenantId.parse(tenantId),
          prepMinutes: 4,
          actorUserId: null,
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidPrepMinutesError);

    const order181 = await seedOrder('paid');
    await expect(
      runInTenantContext({ tenantId }, () =>
        acceptService.execute({
          orderId: OrderId.parse(order181),
          tenantId: TenantId.parse(tenantId),
          prepMinutes: 181,
          actorUserId: null,
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidPrepMinutesError);

    const order5 = await seedOrder('paid');
    await runInTenantContext({ tenantId }, () =>
      acceptService.execute({
        orderId: OrderId.parse(order5),
        tenantId: TenantId.parse(tenantId),
        prepMinutes: 5,
        actorUserId: null,
      }),
    );
    expect((await readOrderRow(order5))?.status).toBe('accepted');

    const order180 = await seedOrder('paid');
    await runInTenantContext({ tenantId }, () =>
      acceptService.execute({
        orderId: OrderId.parse(order180),
        tenantId: TenantId.parse(tenantId),
        prepMinutes: 180,
        actorUserId: null,
      }),
    );
    expect((await readOrderRow(order180))?.status).toBe('accepted');
  });

  it('a second accept on an already-accepted order is a no-op preserving eta_at/accepted_at/accepted_by_user_id', async () => {
    const orderId = await seedOrder('paid');
    const orderRepo = new OrderDrizzleRepository(stack.db);
    const acceptService = new AcceptOrderService(orderRepo);

    await runInTenantContext({ tenantId }, () =>
      acceptService.execute({
        orderId: OrderId.parse(orderId),
        tenantId: TenantId.parse(tenantId),
        prepMinutes: 20,
        actorUserId: 'operator-first',
      }),
    );
    const firstRow = await readOrderRow(orderId);

    await runInTenantContext({ tenantId }, () =>
      acceptService.execute({
        orderId: OrderId.parse(orderId),
        tenantId: TenantId.parse(tenantId),
        prepMinutes: 45,
        actorUserId: 'operator-second',
      }),
    );
    const secondRow = await readOrderRow(orderId);

    expect(secondRow?.status).toBe('accepted');
    expect(secondRow?.etaAt?.getTime()).toBe(firstRow?.etaAt?.getTime());
    expect(secondRow?.acceptedAt?.getTime()).toBe(firstRow?.acceptedAt?.getTime());
    expect(secondRow?.acceptedByUserId).toBe(firstRow?.acceptedByUserId);
  });

  it('a second markReady on an already-ready order is a no-op (Product MED-17)', async () => {
    const orderId = await seedOrder('paid');
    const orderRepo = new OrderDrizzleRepository(stack.db);
    const acceptService = new AcceptOrderService(orderRepo);
    const advanceService = new AdvanceOrderStatusService(orderRepo);

    await runInTenantContext({ tenantId }, () =>
      acceptService.execute({
        orderId: OrderId.parse(orderId),
        tenantId: TenantId.parse(tenantId),
        prepMinutes: 20,
        actorUserId: null,
      }),
    );
    await runInTenantContext({ tenantId }, () =>
      advanceService.execute({
        orderId: OrderId.parse(orderId),
        tenantId: TenantId.parse(tenantId),
        targetStatus: 'preparing',
        actorUserId: null,
      }),
    );
    await runInTenantContext({ tenantId }, () =>
      advanceService.execute({
        orderId: OrderId.parse(orderId),
        tenantId: TenantId.parse(tenantId),
        targetStatus: 'ready',
        actorUserId: 'operator-a',
      }),
    );
    const firstRow = await readOrderRow(orderId);

    await runInTenantContext({ tenantId }, () =>
      advanceService.execute({
        orderId: OrderId.parse(orderId),
        tenantId: TenantId.parse(tenantId),
        targetStatus: 'ready',
        actorUserId: 'operator-b',
      }),
    );
    const secondRow = await readOrderRow(orderId);

    expect(secondRow?.status).toBe('ready');
    expect(secondRow?.readyAt?.getTime()).toBe(firstRow?.readyAt?.getTime());
  });

  it('complete on an accepted order throws InvalidOrderTransitionError and the row is unchanged', async () => {
    const orderId = await seedOrder('paid');
    const orderRepo = new OrderDrizzleRepository(stack.db);
    const acceptService = new AcceptOrderService(orderRepo);
    const advanceService = new AdvanceOrderStatusService(orderRepo);

    await runInTenantContext({ tenantId }, () =>
      acceptService.execute({
        orderId: OrderId.parse(orderId),
        tenantId: TenantId.parse(tenantId),
        prepMinutes: 20,
        actorUserId: null,
      }),
    );
    const beforeRow = await readOrderRow(orderId);

    await expect(
      runInTenantContext({ tenantId }, () =>
        advanceService.execute({
          orderId: OrderId.parse(orderId),
          tenantId: TenantId.parse(tenantId),
          targetStatus: 'completed',
          actorUserId: null,
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidOrderTransitionError);

    const afterRow = await readOrderRow(orderId);
    expect(afterRow?.status).toBe('accepted');
    expect(afterRow?.completedAt).toBeNull();
    expect(afterRow?.acceptedAt?.getTime()).toBe(beforeRow?.acceptedAt?.getTime());
  });

  it('every transition appends ordering.order_status_changed.v1 with the real locationId and actorUserId', async () => {
    const orderId = await seedOrder('paid');
    const orderRepo = new OrderDrizzleRepository(stack.db);
    const acceptService = new AcceptOrderService(orderRepo);
    const advanceService = new AdvanceOrderStatusService(orderRepo);

    await runInTenantContext({ tenantId }, () =>
      acceptService.execute({
        orderId: OrderId.parse(orderId),
        tenantId: TenantId.parse(tenantId),
        prepMinutes: 20,
        actorUserId: 'operator-accept',
      }),
    );
    await runInTenantContext({ tenantId }, () =>
      advanceService.execute({
        orderId: OrderId.parse(orderId),
        tenantId: TenantId.parse(tenantId),
        targetStatus: 'preparing',
        actorUserId: 'operator-prep',
      }),
    );
    await runInTenantContext({ tenantId }, () =>
      advanceService.execute({
        orderId: OrderId.parse(orderId),
        tenantId: TenantId.parse(tenantId),
        targetStatus: 'ready',
        actorUserId: 'operator-ready',
      }),
    );
    await runInTenantContext({ tenantId }, () =>
      advanceService.execute({
        orderId: OrderId.parse(orderId),
        tenantId: TenantId.parse(tenantId),
        targetStatus: 'completed',
        actorUserId: 'operator-complete',
      }),
    );

    const payloads = await readOutboxPayloads(orderId, 'ordering.order_status_changed.v1');
    expect(payloads).toHaveLength(4);
    const byNewStatus = new Map(payloads.map((p) => [p.newStatus as string, p]));

    expect(byNewStatus.get('accepted')?.locationId).toBe(locationId);
    expect(byNewStatus.get('accepted')?.actorUserId).toBe('operator-accept');
    expect(byNewStatus.get('preparing')?.locationId).toBe(locationId);
    expect(byNewStatus.get('preparing')?.actorUserId).toBe('operator-prep');
    expect(byNewStatus.get('ready')?.locationId).toBe(locationId);
    expect(byNewStatus.get('ready')?.actorUserId).toBe('operator-ready');
    expect(byNewStatus.get('completed')?.locationId).toBe(locationId);
    expect(byNewStatus.get('completed')?.actorUserId).toBe('operator-complete');
  });

  it('a transition invoked under tenant B for tenant A order raises OrderNotFoundError and leaves the row unchanged', async () => {
    const orderId = await seedOrder('paid');
    const otherTenantId = randomUUID();
    await stack.db.withoutTenant(
      'seed second tenant for cross-tenant lifecycle e2e',
      async (tx) => {
        await tx.insert(schema.tenants).values({
          id: otherTenantId,
          slug: `lifecycle-other-${otherTenantId.slice(0, 8)}`,
          displayName: 'Other Tenant',
          locale: 'en',
          defaultCurrency: 'EUR',
        });
      },
    );

    const orderRepo = new OrderDrizzleRepository(stack.db);
    const acceptService = new AcceptOrderService(orderRepo);

    await expect(
      runInTenantContext({ tenantId: otherTenantId }, () =>
        acceptService.execute({
          orderId: OrderId.parse(orderId),
          tenantId: TenantId.parse(otherTenantId),
          prepMinutes: 20,
          actorUserId: null,
        }),
      ),
    ).rejects.toBeInstanceOf(OrderNotFoundError);

    const row = await readOrderRow(orderId);
    expect(row?.status).toBe('paid');
  });
});
