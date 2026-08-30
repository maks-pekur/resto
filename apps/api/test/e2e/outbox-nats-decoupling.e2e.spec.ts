import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isNull, eq, and, count } from 'drizzle-orm';
import { schema } from '@resto/db';
import { runInTenantContext } from '@resto/db';
import { OutboxDispatcher, type EventEnvelope } from '@resto/events';
import { OrderDrizzleRepository } from '../../src/contexts/ordering/infrastructure/order-drizzle.repository';
import { OrderSequenceDrizzleRepository } from '../../src/contexts/ordering/infrastructure/order-sequence-drizzle.repository';
import { CreateOrderService } from '../../src/contexts/ordering/application/create-order.service';
import { DefaultLocationResolverService } from '../../src/contexts/catalog/application/default-location-resolver.service';
import type { CreateOrderInput } from '../../src/contexts/ordering/application/dto';
import type {
  MenuPricingPort,
  OrderTableLookupPort,
} from '../../src/contexts/ordering/domain/ports';
import {
  isDockerAvailable,
  startDbStack,
  stopDbStack,
  type DbStack,
} from './helpers/with-db-stack';

/**
 * D-06 correctness gate (D-06 / Investor HIGH #3).
 *
 * Proves the transactional outbox decouples order acceptance from NATS
 * availability: an order write commits to Postgres (and its outbox row is
 * durable) even when the broker is entirely absent. Events drain once a
 * publisher is wired and the dispatcher runs.
 *
 * This is the live verification that justifies the single-node NATS SPOF
 * decision in D-06: the restaurant never loses an order during a NATS outage;
 * events queue in Postgres and publish on recovery.
 */

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[outbox-nats-decoupling.e2e] Docker unavailable — skipping D-06 gating test.');
}

const itemId = randomUUID();
const categoryId = randomUUID();

const pricing: MenuPricingPort = {
  loadSnapshot: () =>
    Promise.resolve({
      currency: 'USD',
      items: [
        {
          itemId,
          categoryId,
          basePrice: '10.00',
          sizes: [],
          modifierGroupIds: [],
        },
      ],
      modifierGroups: [],
      modifierOptions: [],
      stoppedItemIds: [],
    }),
};

const tableLookup: OrderTableLookupPort = {
  findActiveTable: () => Promise.resolve(null),
};

const makeOrderInput = (): CreateOrderInput => ({
  items: [{ itemId, sizeId: null, name: 'Test Item', modifiers: [], quantity: 1 }],
  orderType: 'pickup',
  customerName: 'Alice',
  customerPhone: '+1234567890',
  idempotencyKey: randomUUID(),
  channel: 'site',
  marketingConsent: false,
});

suite('D-06 — Outbox decouples order acceptance from NATS availability', () => {
  let stack: DbStack;
  let repo: OrderDrizzleRepository;
  let service: CreateOrderService;

  const tenantId = randomUUID();

  const inContext = <T>(op: () => Promise<T>): Promise<T> => runInTenantContext({ tenantId }, op);

  beforeAll(async () => {
    stack = await startDbStack();
    repo = new OrderDrizzleRepository(stack.db);
    const defaultLocation = new DefaultLocationResolverService(stack.db);
    const orderSequence = new OrderSequenceDrizzleRepository(stack.db);
    service = new CreateOrderService(
      repo,
      pricing,
      orderSequence,
      tableLookup,
      defaultLocation,
      stack.db,
    );

    await stack.db.withoutTenant('seed tenant for outbox-nats-decoupling e2e', async (tx) => {
      await tx.insert(schema.tenants).values({
        id: tenantId,
        slug: `decoupling-${tenantId.slice(0, 8)}`,
        displayName: 'Decoupling Test Tenant',
        locale: 'en',
        country: 'GB',
        defaultCurrency: 'USD',
      });
      await tx.insert(schema.locations).values({
        tenantId,
        name: 'Decoupling Test Location',
        slug: 'decoupling-test-location',
      });
    });
  }, 120_000);

  afterAll(async () => {
    if (stack) await stopDbStack(stack);
  });

  it('order create succeeds while broker is absent and outbox row is durably queued (un-dispatched)', async () => {
    const input = makeOrderInput();

    const response = await inContext(() => service.execute(input));

    expect(response.orderId).toBeTruthy();
    expect(response.status).toBe('created');
    expect(response.total).toBeTruthy();

    // Assert the outbox row exists and is NOT yet delivered.
    const outboxRows = await stack.db.withoutTenant(
      'outbox-nats-decoupling: assert row un-dispatched',
      (tx) =>
        tx
          .select({
            id: schema.outboxEvents.id,
            type: schema.outboxEvents.type,
            deliveredAt: schema.outboxEvents.deliveredAt,
            claimedAt: schema.outboxEvents.claimedAt,
          })
          .from(schema.outboxEvents)
          .where(
            and(
              eq(schema.outboxEvents.tenantId, tenantId),
              isNull(schema.outboxEvents.deliveredAt),
            ),
          ),
    );

    expect(outboxRows.length).toBeGreaterThanOrEqual(1);
    const orderCreatedRow = outboxRows.find((r) => r.type === 'ordering.order_created.v1');
    expect(orderCreatedRow).toBeDefined();
    expect(orderCreatedRow?.deliveredAt).toBeNull();
  });

  it('outbox rows drain once a publisher is wired and the dispatcher runs (broker recovery)', async () => {
    const input = makeOrderInput();
    await inContext(() => service.execute(input));

    const beforeDrain = await stack.db.withoutTenant(
      'outbox-nats-decoupling: count un-dispatched before drain',
      (tx) =>
        tx
          .select({ c: count() })
          .from(schema.outboxEvents)
          .where(
            and(
              eq(schema.outboxEvents.tenantId, tenantId),
              isNull(schema.outboxEvents.deliveredAt),
            ),
          ),
    );
    const undispatchedCount = beforeDrain[0]?.c ?? 0;
    expect(undispatchedCount).toBeGreaterThanOrEqual(1);

    // Simulate broker recovery: wire an in-memory publisher and run one
    // dispatcher tick. This is exactly what happens in production when NATS
    // comes back online and the OutboxDispatcherService acquires leadership.
    const published: EventEnvelope[] = [];
    const publisher = {
      publish: (envelope: EventEnvelope): Promise<void> => {
        published.push(envelope);
        return Promise.resolve();
      },
      close: (): Promise<void> => Promise.resolve(),
    };

    const dispatcher = new OutboxDispatcher({ db: stack.db, publisher });
    const result = await dispatcher.tick();

    // Dispatcher must have claimed and delivered the queued rows.
    expect(result.delivered).toBeGreaterThanOrEqual(1);
    expect(result.failed).toBe(0);

    // At least one OrderCreated envelope must have been published.
    const orderCreatedEnvelopes = published.filter((e) => e.type === 'ordering.order_created.v1');
    expect(orderCreatedEnvelopes.length).toBeGreaterThanOrEqual(1);

    // All previously un-dispatched rows for this tenant are now marked delivered.
    const afterDrain = await stack.db.withoutTenant(
      'outbox-nats-decoupling: count un-dispatched after drain',
      (tx) =>
        tx
          .select({ c: count() })
          .from(schema.outboxEvents)
          .where(
            and(
              eq(schema.outboxEvents.tenantId, tenantId),
              isNull(schema.outboxEvents.deliveredAt),
            ),
          ),
    );
    const remainingUndispatched = afterDrain[0]?.c ?? 0;
    expect(remainingUndispatched).toBe(0);
  });

  it('outbox event survives a simulated mid-dispatch crash (visibility timeout makes it reclaimable)', async () => {
    const input = makeOrderInput();
    await inContext(() => service.execute(input));

    // Simulated crash: publisher throws before marking delivered.
    let throwCount = 0;
    const crashingPublisher = {
      publish: (_envelope: EventEnvelope): Promise<void> => {
        throwCount += 1;
        return Promise.reject(new Error('simulated broker crash'));
      },
      close: (): Promise<void> => Promise.resolve(),
    };

    const crashDispatcher = new OutboxDispatcher({
      db: stack.db,
      publisher: crashingPublisher,
      // Short visibility timeout so the row is reclaimable immediately.
      visibilityTimeoutSeconds: 0,
    });
    const crashResult = await crashDispatcher.tick();

    // Publisher was invoked but all deliveries failed — rows released back.
    expect(throwCount).toBeGreaterThanOrEqual(1);
    expect(crashResult.failed).toBeGreaterThanOrEqual(1);
    expect(crashResult.delivered).toBe(0);

    // After the visibility timeout elapses the row is reclaimable again.
    // Wait briefly (visibility=0 but DB round-trips take some time).
    await new Promise((r) => setTimeout(r, 100));

    // Recovery: a healthy publisher now drains the row.
    const recovered: EventEnvelope[] = [];
    const recoveryPublisher = {
      publish: (envelope: EventEnvelope): Promise<void> => {
        recovered.push(envelope);
        return Promise.resolve();
      },
      close: (): Promise<void> => Promise.resolve(),
    };
    const recoveryDispatcher = new OutboxDispatcher({ db: stack.db, publisher: recoveryPublisher });
    const recoveryResult = await recoveryDispatcher.tick();

    expect(recoveryResult.delivered).toBeGreaterThanOrEqual(1);
    expect(recovered.some((e) => e.type === 'ordering.order_created.v1')).toBe(true);
  });
});
