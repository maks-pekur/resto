import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Counter } from '@opentelemetry/api';
import { schema, runInTenantContext, TenantAwareDb } from '@resto/db';
import {
  appendToOutbox,
  EventEnvelope,
  NatsJetStreamSubscriber,
  type EventSubscription,
} from '@resto/events';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';
import { OutboxDispatcherService } from '../../src/infrastructure/outbox-dispatcher.service';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;
if (!dockerOk) {
  console.warn('[outbox-dispatcher.e2e] Docker unavailable — skipping integration tests.');
}

const TENANT_A_ID = randomUUID();
const TENANT_B_ID = randomUUID();

const seedTenants = (db: TenantAwareDb): Promise<void> =>
  db.withoutTenant('seed tenants for outbox dispatcher e2e', async (tx) => {
    await tx.insert(schema.tenants).values([
      {
        id: TENANT_A_ID,
        slug: 'odp-a',
        displayName: 'Outbox Dispatcher Tenant A',
        locale: 'en',
        country: 'GB',
        defaultCurrency: 'USD',
      },
      {
        id: TENANT_B_ID,
        slug: 'odp-b',
        displayName: 'Outbox Dispatcher Tenant B',
        locale: 'en',
        country: 'GB',
        defaultCurrency: 'USD',
      },
    ]);
  });

const buildEnvelope = (tenantId: string, type: string): EventEnvelope =>
  EventEnvelope.parse({
    id: randomUUID(),
    type,
    version: 1,
    tenantId,
    correlationId: randomUUID(),
    causationId: null,
    occurredAt: new Date(),
    payload: { greeting: `hello from ${tenantId.slice(0, 8)}` },
  });

suite('OutboxDispatcherService — domain → NATS delivery', () => {
  let stack: RealStack;
  let subscriber: NatsJetStreamSubscriber;

  beforeAll(async () => {
    stack = await startRealStack();
    await seedTenants(stack.app.get(TenantAwareDb));
    subscriber = await NatsJetStreamSubscriber.connect({
      servers: stack.natsUrl,
      stream: 'RESTO_EVENTS_E2E',
    });
  }, 180_000);

  afterAll(async () => {
    if (subscriber) await subscriber.close();
    if (stack) await stopRealStack(stack);
  });

  const collectFirst = async (
    subject: string,
    durableName: string,
  ): Promise<{ envelope: EventEnvelope; subscription: EventSubscription }> => {
    let resolveEnvelope!: (env: EventEnvelope) => void;
    const received = new Promise<EventEnvelope>((resolve) => {
      resolveEnvelope = resolve;
    });
    const subscription = await subscriber.subscribe({
      subject,
      durableName,
      handler: async (envelope) => {
        resolveEnvelope(envelope);
        return Promise.resolve();
      },
    });
    return { envelope: await received, subscription };
  };

  it('publishes an outbox event to NATS within the deadline', async () => {
    const subject = 'tenancy.dispatcher_smoke.v1';
    const collector = collectFirst(subject, 'odp-smoke');
    const envelope = buildEnvelope(TENANT_A_ID, subject);
    await runInTenantContext({ tenantId: TENANT_A_ID }, () =>
      stack.app.get(TenantAwareDb).withTenant((tx) => appendToOutbox(tx, { envelope })),
    );

    const deadline = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timed out waiting for NATS message')), 5000),
    );
    const { envelope: received, subscription } = await Promise.race([collector, deadline]);
    await subscription.stop();

    expect(received.id).toBe(envelope.id);
    expect(received.type).toBe(subject);
    expect(received.tenantId).toBe(TENANT_A_ID);
    expect(received.payload).toEqual(envelope.payload);
  }, 30_000);

  it('preserves tenant identity across two events from different tenants', async () => {
    const subject = 'tenancy.dispatcher_isolation.v1';
    const seenByTenant = new Map<string, EventEnvelope>();
    let resolveBoth!: () => void;
    const both = new Promise<void>((resolve) => {
      resolveBoth = resolve;
    });

    const subscription = await subscriber.subscribe({
      subject,
      durableName: 'odp-isolation',
      handler: async (envelope) => {
        if (envelope.tenantId !== null) {
          seenByTenant.set(envelope.tenantId, envelope);
        }
        if (seenByTenant.size === 2) resolveBoth();
        return Promise.resolve();
      },
    });

    const aEnv = buildEnvelope(TENANT_A_ID, subject);
    const bEnv = buildEnvelope(TENANT_B_ID, subject);
    await runInTenantContext({ tenantId: TENANT_A_ID }, () =>
      stack.app.get(TenantAwareDb).withTenant((tx) => appendToOutbox(tx, { envelope: aEnv })),
    );
    await runInTenantContext({ tenantId: TENANT_B_ID }, () =>
      stack.app.get(TenantAwareDb).withTenant((tx) => appendToOutbox(tx, { envelope: bEnv })),
    );

    const deadline = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timed out waiting for both tenants')), 5000),
    );
    await Promise.race([both, deadline]);
    await subscription.stop();

    const sawA = seenByTenant.get(TENANT_A_ID);
    const sawB = seenByTenant.get(TENANT_B_ID);
    expect(sawA?.id).toBe(aEnv.id);
    expect(sawB?.id).toBe(bEnv.id);
    // Each envelope carries its OWN tenantId — no cross-pollination
    // between the two flows even though they share a subject.
    expect(sawA?.tenantId).toBe(TENANT_A_ID);
    expect(sawB?.tenantId).toBe(TENANT_B_ID);
  }, 30_000);

  it('emits tenant.id attribute on delivered counter for tenant-scoped events', async () => {
    const subject = 'tenancy.dispatcher_metrics_tenant.v1';
    const dispatcherSvc = stack.app.get(OutboxDispatcherService);
    const deliveredCounter = (dispatcherSvc as unknown as { deliveredCounter: Counter })
      .deliveredCounter;
    const spy = vi.spyOn(deliveredCounter, 'add');

    const collector = collectFirst(subject, 'odp-metrics-tenant');
    const envelope = buildEnvelope(TENANT_A_ID, subject);
    await runInTenantContext({ tenantId: TENANT_A_ID }, () =>
      stack.app.get(TenantAwareDb).withTenant((tx) => appendToOutbox(tx, { envelope })),
    );

    const deadline = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timed out waiting for NATS message')), 5000),
    );
    const { subscription } = await Promise.race([collector, deadline]);
    await subscription.stop();

    // The dispatcher publishes asynchronously after collectFirst resolves; wait briefly
    // for the publisher wrapper to flush its counter add.
    const attrDeadline = Date.now() + 2000;
    let matched = false;
    while (Date.now() < attrDeadline) {
      matched = spy.mock.calls.some(([, attrs]) => {
        const tenantAttr = (attrs as { 'tenant.id'?: string } | undefined)?.['tenant.id'];
        const typeAttr = (attrs as { 'event.type'?: string } | undefined)?.['event.type'];
        return tenantAttr === TENANT_A_ID && typeAttr === subject;
      });
      if (matched) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(matched).toBe(true);
    spy.mockRestore();
  }, 30_000);

  it('emits tenant.id=platform attribute for platform-level events', async () => {
    const subject = 'tenancy.dispatcher_metrics_platform.v1';
    const dispatcherSvc = stack.app.get(OutboxDispatcherService);
    const deliveredCounter = (dispatcherSvc as unknown as { deliveredCounter: Counter })
      .deliveredCounter;
    const spy = vi.spyOn(deliveredCounter, 'add');

    const collector = collectFirst(subject, 'odp-metrics-platform');
    // Platform-level envelope: tenantId = null. Build directly via parse so we skip the
    // helper's ALS tenantId resolution.
    const platformEnvelope = EventEnvelope.parse({
      id: randomUUID(),
      type: subject,
      version: 1,
      tenantId: null,
      correlationId: randomUUID(),
      causationId: null,
      occurredAt: new Date(),
      payload: { source: 'platform' },
    });
    // append without a tenant binding — appendToOutbox tolerates a null tenantId envelope.
    await stack.app
      .get(TenantAwareDb)
      .withoutTenant('outbox-dispatcher metrics platform test', (tx) =>
        appendToOutbox(tx, { envelope: platformEnvelope }),
      );

    const deadline = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timed out waiting for NATS message')), 5000),
    );
    const { subscription } = await Promise.race([collector, deadline]);
    await subscription.stop();

    const attrDeadline = Date.now() + 2000;
    let matched = false;
    while (Date.now() < attrDeadline) {
      matched = spy.mock.calls.some(([, attrs]) => {
        const tenantAttr = (attrs as { 'tenant.id'?: string } | undefined)?.['tenant.id'];
        const typeAttr = (attrs as { 'event.type'?: string } | undefined)?.['event.type'];
        return tenantAttr === 'platform' && typeAttr === subject;
      });
      if (matched) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(matched).toBe(true);
    spy.mockRestore();
  }, 30_000);
});
