import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { schema, TenantAwareDb } from '@resto/db';
import {
  NatsJetStreamPublisher,
  NatsJetStreamSubscriber,
  type EventSubscription,
} from '@resto/events';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';

/**
 * AUTH-10 gating e2e (D-18 / Skeptic MED-7).
 *
 * This test is the regression net for the NATS DLQ wiring shipped in
 * Plan 03-01. Per D-18 every other Phase 3 wave depends on this test
 * being green: without max_deliver + dlq.<subject> + alert envelope
 * proven end-to-end, downstream auth flows ship into infrastructure
 * that silently swallows poison messages.
 *
 * The test name MUST mention AUTH-10 so downstream waves can grep
 * `pnpm --filter @resto/api test:e2e nats-dlq-poison` from CI and
 * `grep AUTH-10` from execute-phase to confirm the gate is wired.
 */

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[nats-dlq-poison.e2e] Docker unavailable — skipping AUTH-10 gating test.');
}

const TEST_STREAM = 'RESTO_EVENTS_E2E';

suite('AUTH-10 — NATS DLQ poison-message gating test (D-18)', () => {
  let stack: RealStack;
  let publisher: NatsJetStreamPublisher;
  let subscriber: NatsJetStreamSubscriber;
  let dlqSubscriber: NatsJetStreamSubscriber;

  beforeAll(async () => {
    stack = await startRealStack();
    const db = stack.app.get(TenantAwareDb);
    publisher = await NatsJetStreamPublisher.connect({
      servers: stack.natsUrl,
      stream: TEST_STREAM,
      // Stream must accept both the test subject (under identity.>) and
      // its DLQ counterpart (under dlq.>). identity.> is in the default
      // STREAM_SUBJECTS already; dlq.> must be added explicitly so the
      // republish call from the DLQ branch is accepted by the broker.
      subjects: ['tenancy.>', 'identity.>', 'catalog.>', 'ordering.>', 'billing.>', 'dlq.>'],
    });
    subscriber = await NatsJetStreamSubscriber.connect({
      servers: stack.natsUrl,
      stream: TEST_STREAM,
      db,
    });
    dlqSubscriber = await NatsJetStreamSubscriber.connect({
      servers: stack.natsUrl,
      stream: TEST_STREAM,
    });
  }, 180_000);

  afterAll(async () => {
    if (subscriber) await subscriber.close();
    if (dlqSubscriber) await dlqSubscriber.close();
    if (publisher) await publisher.close();
    if (stack) await stopRealStack(stack);
  });

  it('routes a poison envelope to dlq.<subject> after max_deliver and emits alert envelope', async () => {
    const testRunId = randomUUID().slice(0, 8);
    const originalSubject = `identity.test_poison_${testRunId}.v1`;
    const dlqSubject = `dlq.${originalSubject}`;

    // Track every handler invocation; the handler ALWAYS throws to force
    // the poison-redelivery path. The broker should stop redelivering at
    // deliveryCount === maxDeliver (5).
    let handlerInvocations = 0;
    const handlerSubscription: EventSubscription = await subscriber.subscribe({
      subject: originalSubject,
      durableName: `dlq-poison-handler-${testRunId}`,
      maxDeliver: 5,
      // Short ack_wait so the broker redelivers quickly — the test must
      // wait through 5 attempts; default 30s would blow the e2e timeout.
      ackWaitMs: 1_000,
      maxInFlight: 1,
      dlqPublisher: publisher,
      handler: () => {
        handlerInvocations += 1;
        throw new Error(`poison handler forced-throw #${handlerInvocations.toString()}`);
      },
    });

    // DLQ-side subscriber: capture the first message that lands on
    // dlq.<originalSubject>. The DLQ branch republishes RAW BYTES so we
    // can't parse them as an envelope — capture them as Uint8Array.
    let dlqBytes: Uint8Array | null = null;
    const dlqSubscription = await dlqSubscriber.subscribe({
      subject: dlqSubject,
      durableName: `dlq-poison-watcher-${testRunId}`,
      maxDeliver: 1,
      ackWaitMs: 5_000,
      maxInFlight: 1,
      handler: (envelope) => {
        // Defensive: the subscriber's default handler path EventEnvelope.parses
        // the bytes; the DLQ entry happens to be a VALID envelope here only
        // because the message-format below is a real envelope with a payload
        // the handler rejects post-parse. Different test stories may publish
        // truly malformed JSON — that branch nak's before this handler runs.
        dlqBytes = new TextEncoder().encode(JSON.stringify(envelope));
        return Promise.resolve();
      },
    });

    // Publish a "poison" envelope: structurally valid (EventEnvelope.parse
    // succeeds) so the broker delivers it 5 times, but the handler always
    // throws on it. This exercises the DLQ branch via the handler-throw
    // path, which is the production-realistic failure mode (handler
    // discovers a domain invariant violation post-parse — e.g. references
    // a tenant that no longer exists).
    const poisonEnvelopeId = randomUUID();
    const poisonEnvelope = {
      id: poisonEnvelopeId,
      type: originalSubject,
      version: 1,
      tenantId: null,
      correlationId: randomUUID(),
      causationId: null,
      occurredAt: new Date().toISOString(),
      payload: { kind: 'poison', testRunId },
    };
    await publisher.publishRaw(
      originalSubject,
      new TextEncoder().encode(JSON.stringify(poisonEnvelope)),
    );

    // Wait until the handler has been invoked 5 times (max_deliver bound).
    // Each redelivery is gated by ackWaitMs (1s), so this needs ~5s.
    const deliveryDeadline = Date.now() + 15_000;
    while (handlerInvocations < 5 && Date.now() < deliveryDeadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(handlerInvocations).toBe(5);

    // After max_deliver is reached the DLQ branch should have routed the
    // bytes. Wait briefly for the DLQ subscriber to receive them.
    const dlqDeadline = Date.now() + 5_000;
    while (dlqBytes === null && Date.now() < dlqDeadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(dlqBytes).not.toBeNull();

    // Hold for an additional second; assert the handler is NOT invoked
    // again (poison NAK loop is bounded — the DLQ branch ACKed).
    const handlerCountAtDlqRoute = handlerInvocations;
    await new Promise((r) => setTimeout(r, 1_000));
    expect(handlerInvocations).toBe(handlerCountAtDlqRoute);

    // The DLQ branch ALSO emits a platform-level
    // identity.email_dispatch_failed.v1 alert envelope onto the outbox
    // (via db.withoutTenant). Poll for it.
    const db = stack.app.get(TenantAwareDb);
    const outboxDeadline = Date.now() + 10_000;
    let alertRows: { id: string; type: string; payload: unknown }[] = [];
    while (Date.now() < outboxDeadline) {
      alertRows = await db.withoutTenant('nats-dlq-poison e2e: poll outbox alert', (tx) =>
        tx
          .select({
            id: schema.outboxEvents.id,
            type: schema.outboxEvents.type,
            payload: schema.outboxEvents.payload,
          })
          .from(schema.outboxEvents)
          .where(
            and(
              eq(schema.outboxEvents.type, 'identity.email_dispatch_failed.v1'),
              sql`(${schema.outboxEvents.payload} ->> 'originalSubject') = ${originalSubject}`,
            ),
          ),
      );
      if (alertRows.length > 0) break;
      await new Promise((r) => setTimeout(r, 200));
    }

    expect(alertRows.length).toBeGreaterThanOrEqual(1);
    const alertPayload = alertRows[0]?.payload as Record<string, unknown> | undefined;
    expect(alertPayload?.reason).toBe('dlq_routed');
    expect(alertPayload?.originalSubject).toBe(originalSubject);
    expect(alertPayload?.errorMessage).toContain('poison handler forced-throw');
    // redeliveryCount should reflect the final attempt that triggered
    // routing (NATS' `deliveryCount` increments before delivery).
    expect(alertPayload?.redeliveryCount).toBeGreaterThanOrEqual(5);

    await handlerSubscription.stop();
    await dlqSubscription.stop();
  }, 60_000);
});
