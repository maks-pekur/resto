import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema } from '@resto/db';
import { eq } from 'drizzle-orm';
import {
  appendToOutbox,
  InMemoryInboxTracker,
  OutboxDispatcher,
  TenantProvisionedV1,
  withInboxDedup,
  type TypedEnvelope,
  type TenantProvisionedV1Payload,
} from '../../src/index';
import { isDockerAvailable, startTestEnv, stopTestEnv, type TestEnv } from '../setup';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[outbox-roundtrip] Docker not available — skipping integration tests.');
}

const TENANT_UUID = '11111111-1111-4111-8111-111111111111';
const CORRELATION_UUID = '22222222-2222-4222-8222-222222222222';

const buildEnvelope = (
  id: string,
  payload: TenantProvisionedV1Payload,
): TypedEnvelope<TenantProvisionedV1Payload> => ({
  id,
  type: TenantProvisionedV1.type,
  version: TenantProvisionedV1.version,
  tenantId: TENANT_UUID as TypedEnvelope<TenantProvisionedV1Payload>['tenantId'],
  correlationId: CORRELATION_UUID,
  causationId: null,
  occurredAt: new Date('2026-05-01T00:00:00.000Z'),
  payload,
});

suite('Outbox → NATS roundtrip', () => {
  let env: TestEnv;

  beforeAll(async () => {
    env = await startTestEnv();
    // Pre-seed the tenant referenced in event envelopes so the FK on
    // outbox_events.tenant_id passes. RLS allows tenant context to insert
    // its own outbox rows; the seed runs in withoutTenant.
    await env.db.withoutTenant('seed test tenant', async (tx) => {
      await tx.insert(schema.tenants).values({
        id: TENANT_UUID,
        slug: 'cafe-roundtrip',
        displayName: 'Cafe Roundtrip',
      });
    });
  }, 120_000);

  afterAll(async () => {
    await stopTestEnv(env);
  });

  it('publishes a claimed event and marks it delivered; consumer dedups redeliveries', async () => {
    const eventId = randomUUID();
    const envelope = buildEnvelope(eventId, {
      tenantId: TENANT_UUID as TenantProvisionedV1Payload['tenantId'],
      slug: 'cafe-roundtrip',
      displayName: 'Cafe Roundtrip',
      defaultCurrency: 'USD' as TenantProvisionedV1Payload['defaultCurrency'],
    });

    // Producer side: append inside a tenant transaction.
    await env.db.withoutTenant('append outbox for test', (tx) => appendToOutbox(tx, { envelope }));

    // Consumer side: subscribe with inbox dedup before the dispatcher runs.
    const tracker = new InMemoryInboxTracker();
    const received: string[] = [];
    const sub = await env.subscriber.subscribe({
      subject: TenantProvisionedV1.type,
      durableName: 'test-consumer',
      handler: withInboxDedup(tracker, 'test-consumer', (msg) => {
        received.push(msg.id);
        return Promise.resolve();
      }),
    });

    const dispatcher = new OutboxDispatcher({ db: env.db, publisher: env.publisher });

    // First tick should claim, publish, and mark delivered.
    const first = await dispatcher.tick();
    expect(first).toEqual({ claimed: 1, delivered: 1, failed: 0 });

    // Wait briefly for NATS to deliver to the consumer.
    await waitFor(() => received.length >= 1, 5_000);
    expect(received).toEqual([eventId]);

    // Row is marked delivered; second tick is a no-op.
    const second = await dispatcher.tick();
    expect(second).toEqual({ claimed: 0, delivered: 0, failed: 0 });

    // Simulate broker redelivery: re-publish the same envelope id directly.
    await env.publisher.publish(envelope);
    await waitFor(() => received.length === 1, 2_000, { allowIdle: true });
    // Inbox dedup drops the second copy → the handler sees one delivery.
    expect(received).toEqual([eventId]);

    // The DB row remains delivered; no further work for the dispatcher.
    const row = await env.db.withoutTenant('inspect row', (tx) =>
      tx.select().from(schema.outboxEvents).where(eq(schema.outboxEvents.id, eventId)),
    );
    expect(row[0]?.deliveredAt).toBeInstanceOf(Date);

    await sub.stop();
  }, 60_000);
});

const waitFor = async (
  predicate: () => boolean,
  timeoutMs: number,
  opts?: { allowIdle?: boolean },
): Promise<void> => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!opts?.allowIdle) {
    throw new Error('waitFor: predicate not satisfied within timeout');
  }
};
