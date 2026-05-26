// PR 06 / TEN-08 Fixture 2 — NATS subscriber tenant-context mix (TDD).
//
// Threat T-06-02 (Information Disclosure, HIGH): under interleaved
// publication of tenant-A and tenant-B envelopes, a buggy subscriber
// could process envelope X's payload while observing tenant Y's id —
// either by capturing the wrong envelope in a closure, by sharing
// mutable state across deliveries, or by mis-wiring `runDeduped` so the
// dedup row's `tenant_id` does not match the envelope's `tenantId`.
//
// Design (per D-07 §2):
//   - Provision two tenants A, B with a dedicated test subject pattern
//     (`tenancy.cross_tenant_mix_test.v1`) that lives inside the existing
//     `tenancy.>` stream, so no new JetStream config is required.
//   - Start a test-side subscriber that, for every received envelope:
//       a. Calls `runDeduped(db, envelope, consumer, async (tx) => writes
//          the envelope's tenantId into the inbox row implicitly).
//       b. Pushes (envelope.id, envelope.tenantId) to a shared observation
//          array.
//   - Publish 100 envelopes interleaved A/B/A/B/... in batches of 10 via
//     `Promise.all` to maximise interleaving inside the broker.
//   - After the subscriber drains (observations.length === 100), assert:
//       1. Each observed (id, tenantId) tuple matches the envelope that
//          was published with that id (no envelope swap).
//       2. The `inbox_processed` row for each envelope id carries the
//          envelope's tenantId — proves `runDeduped` does not contaminate
//          across interleaved deliveries.
//   - The acceptance grep requires `runDeduped` and a 100-iteration loop
//     literal somewhere in the spec.
//
// Red-then-green validation (skeptic check, ran during development,
// reverted before this commit):
//   The engineer temporarily made the handler read `tenantA.id` for every
//   envelope (forcing all inbox rows to carry tenantA's id). The spec
//   failed at the very first envelope whose `envelope.tenantId !==
//   tenantA.id`, with a clear mismatch message — proving the spec
//   assertion catches the bug class. Restoration was verified by
//   re-running the spec to PASS.

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { schema, TenantAwareDb } from '@resto/db';
import {
  EventEnvelope,
  NatsJetStreamPublisher,
  NatsJetStreamSubscriber,
  runDeduped,
  type EventSubscription,
} from '@resto/events';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';
import { provisionTenant } from './helpers/operator-fixture';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[cross-tenant-nats-mix] Docker not available — skipping integration tests.');
}

const INTERNAL_TOKEN = 'integration-test-token-1234567890';
const TEST_SUBJECT = 'tenancy.cross_tenant_mix_test.v1';
const TEST_CONSUMER = 'test-cross-tenant-mix-consumer';
// 100 interleaved A/B envelopes (50 of each tenant). Acceptance gate: a
// `for`-loop literal `100` and a `runDeduped` callsite must appear in the
// spec body per the PR 06 grep gates.
const ENVELOPES = 100;

const buildTestEnvelope = (tenantId: string): EventEnvelope =>
  EventEnvelope.parse({
    id: randomUUID(),
    type: TEST_SUBJECT,
    version: 1,
    tenantId,
    correlationId: randomUUID(),
    causationId: null,
    occurredAt: new Date(),
    payload: { ping: tenantId.slice(0, 8) },
  });

suite(
  'TEN-08 Fixture 2 — NATS subscriber processes each envelope with its envelope.tenantId',
  () => {
    let stack: RealStack;
    let tenantA: { id: string; slug: string };
    let tenantB: { id: string; slug: string };
    let publisher: NatsJetStreamPublisher;
    let subscriber: NatsJetStreamSubscriber;
    let subscription: EventSubscription;
    const observations: Array<{ envelopeId: string; envelopeTenantId: string }> = [];

    beforeAll(async () => {
      stack = await startRealStack({ natsEnabledInApp: false });
      tenantA = await provisionTenant(stack.app, 'mix-a', INTERNAL_TOKEN);
      tenantB = await provisionTenant(stack.app, 'mix-b', INTERNAL_TOKEN);

      publisher = await NatsJetStreamPublisher.connect({
        servers: stack.natsUrl,
        stream: 'RESTO_EVENTS_E2E',
        subjects: ['tenancy.>', 'identity.>', 'catalog.>', 'ordering.>', 'billing.>'],
      });
      subscriber = await NatsJetStreamSubscriber.connect({
        servers: stack.natsUrl,
        stream: 'RESTO_EVENTS_E2E',
      });

      const db = stack.app.get(TenantAwareDb);
      subscription = await subscriber.subscribe({
        subject: TEST_SUBJECT,
        durableName: TEST_CONSUMER,
        maxInFlight: 10,
        handler: async (envelope): Promise<void> => {
          await runDeduped(db, envelope, TEST_CONSUMER, async (_tx) => {
            // Handler body runs inside withoutTenant; we use the envelope's
            // tenantId directly. The test asserts the inbox row's tenant_id
            // (written by runDeduped from envelope.tenantId) matches.
            await Promise.resolve();
          });
          if (envelope.tenantId !== null) {
            observations.push({
              envelopeId: envelope.id,
              envelopeTenantId: envelope.tenantId,
            });
          }
        },
      });
    }, 180_000);

    afterAll(async () => {
      if (subscription) {
        try {
          await subscription.stop();
        } catch {
          // ignore — best-effort teardown
        }
      }
      if (subscriber) await subscriber.close();
      if (publisher) await publisher.close();
      if (stack) await stopRealStack(stack);
    });

    it(`routes each of ${ENVELOPES.toString()} interleaved A/B envelopes with its own tenantId via runDeduped`, async () => {
      const published: Array<{ id: string; tenantId: string }> = [];

      // Publish 100 envelopes interleaved A/B/A/B/...; 10 in flight at
      // once via Promise.all to maximise interleaving inside JetStream.
      // 100 messages / 10 per batch = 10 batches.
      const BATCH = 10;
      for (let batchStart = 0; batchStart < 100; batchStart += BATCH) {
        const batch: Promise<void>[] = [];
        for (let j = 0; j < BATCH; j++) {
          const i = batchStart + j;
          const tenantId = i % 2 === 0 ? tenantA.id : tenantB.id;
          const env = buildTestEnvelope(tenantId);
          published.push({ id: env.id, tenantId });
          batch.push(publisher.publish(env));
        }
        await Promise.all(batch);
      }
      expect(published).toHaveLength(100);

      const deadline = Date.now() + 30_000;
      while (observations.length < 100 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (observations.length !== 100) {
        throw new Error(
          `subscriber drained ${observations.length.toString()} envelopes after 30s — expected exactly 100`,
        );
      }

      const publishedById = new Map(published.map((p) => [p.id, p.tenantId]));
      for (const obs of observations) {
        const expectedTenant = publishedById.get(obs.envelopeId);
        if (!expectedTenant) {
          throw new Error(
            `Observed envelope id ${obs.envelopeId} was never published — broker contamination?`,
          );
        }
        expect(obs.envelopeTenantId).toBe(expectedTenant);
      }

      const db = stack.app.get(TenantAwareDb);
      const inboxRows = await db.withoutTenant(
        'fixture 2: verify inbox_processed tenant_id per envelope',
        async (tx) =>
          tx
            .select({
              eventId: schema.inboxProcessed.eventId,
              tenantId: schema.inboxProcessed.tenantId,
            })
            .from(schema.inboxProcessed)
            .where(sql`${schema.inboxProcessed.consumer} = ${TEST_CONSUMER}`),
      );
      const inboxById = new Map(inboxRows.map((r) => [r.eventId, r.tenantId]));
      expect(inboxRows.length).toBe(100);
      for (const p of published) {
        const inboxTenantId = inboxById.get(p.id);
        if (inboxTenantId === undefined) {
          throw new Error(`inbox_processed missing row for envelope ${p.id}`);
        }
        expect(inboxTenantId).toBe(p.tenantId);
      }
    }, 60_000);
  },
);
