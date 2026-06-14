import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { schema } from '@resto/db';
import { eq } from 'drizzle-orm';
import {
  appendToOutbox,
  claimOutboxBatch,
  OutboxDispatcher,
  TenantProvisionedV1,
  runDeduped,
  type EventEnvelope,
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
    const received: string[] = [];
    const sub = await env.subscriber.subscribe({
      subject: TenantProvisionedV1.type,
      durableName: 'test-consumer',
      handler: async (msg) => {
        // eslint-disable-next-line @typescript-eslint/require-await
        await runDeduped(env.db, msg, 'test-consumer', async () => {
          received.push(msg.id);
        });
      },
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

  it('rejects malformed envelope before insert', async () => {
    const beforeRows = await env.db.withoutTenant(
      'count outbox rows before malformed insert',
      (tx) => tx.select().from(schema.outboxEvents),
    );
    const beforeCount = beforeRows.length;

    const malformed = {
      ...buildEnvelope(randomUUID(), {
        tenantId: TENANT_UUID as TenantProvisionedV1Payload['tenantId'],
        slug: 'cafe-malformed',
        displayName: 'Cafe Malformed',
        defaultCurrency: 'USD' as TenantProvisionedV1Payload['defaultCurrency'],
      }),
      correlationId: 123 as unknown as string,
    } as unknown as EventEnvelope;

    await expect(
      env.db.withoutTenant('attempt malformed append', (tx) =>
        appendToOutbox(tx, { envelope: malformed }),
      ),
    ).rejects.toBeInstanceOf(z.ZodError);

    const afterRows = await env.db.withoutTenant('count outbox rows after malformed insert', (tx) =>
      tx.select().from(schema.outboxEvents),
    );
    expect(afterRows.length).toBe(beforeCount);
  }, 60_000);

  it('claims a batch in occurred_at order regardless of insertion/RETURNING order', async () => {
    const idEarly = randomUUID();
    const idMid = randomUUID();
    const idLate = randomUUID();
    const mk = (id: string, iso: string): TypedEnvelope<TenantProvisionedV1Payload> => ({
      ...buildEnvelope(id, {
        tenantId: TENANT_UUID as TenantProvisionedV1Payload['tenantId'],
        slug: `cafe-${id.slice(0, 8)}`,
        displayName: 'Ordered',
        defaultCurrency: 'USD' as TenantProvisionedV1Payload['defaultCurrency'],
      }),
      occurredAt: new Date(iso),
    });

    await env.db.withoutTenant('append in descending occurred_at order', async (tx) => {
      await appendToOutbox(tx, { envelope: mk(idLate, '2026-05-02T00:00:03.000Z') });
      await appendToOutbox(tx, { envelope: mk(idMid, '2026-05-02T00:00:02.000Z') });
      await appendToOutbox(tx, { envelope: mk(idEarly, '2026-05-02T00:00:01.000Z') });
    });

    const claimed = await env.db.withoutTenant('claim ordered batch', (tx) =>
      claimOutboxBatch(tx, { batchSize: 50 }),
    );

    const ours = new Set<string>([idEarly, idMid, idLate]);
    const orderedIds = claimed.map((c) => c.envelope.id).filter((id) => ours.has(id));
    expect(orderedIds).toEqual([idEarly, idMid, idLate]);
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
