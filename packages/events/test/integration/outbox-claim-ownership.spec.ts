import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema } from '@resto/db';
import { eq, sql } from 'drizzle-orm';
import {
  appendToOutbox,
  claimOutboxBatch,
  markOutboxDelivered,
  releaseOutboxClaim,
  TenantProvisionedV1,
  type TypedEnvelope,
  type TenantProvisionedV1Payload,
} from '../../src/index';
import { isDockerAvailable, startTestEnv, stopTestEnv, type TestEnv } from '../setup';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[outbox-claim-ownership] Docker not available — skipping integration tests.');
}

const TENANT_UUID = '33333333-3333-4333-8333-333333333333';
const CORRELATION_UUID = '44444444-4444-4444-8444-444444444444';

const buildEnvelope = (id: string): TypedEnvelope<TenantProvisionedV1Payload> => ({
  id,
  type: TenantProvisionedV1.type,
  version: TenantProvisionedV1.version,
  tenantId: TENANT_UUID as TypedEnvelope<TenantProvisionedV1Payload>['tenantId'],
  correlationId: CORRELATION_UUID,
  causationId: null,
  occurredAt: new Date('2026-05-03T00:00:00.000Z'),
  payload: {
    tenantId: TENANT_UUID as TenantProvisionedV1Payload['tenantId'],
    slug: `cafe-${id.slice(0, 8)}`,
    displayName: 'Claim Owner',
    defaultCurrency: 'USD' as TenantProvisionedV1Payload['defaultCurrency'],
  },
});

const readRow = (env: TestEnv, id: string) =>
  env.db.withoutTenant('inspect outbox row', (tx) =>
    tx
      .select({
        claimedAt: schema.outboxEvents.claimedAt,
        claimId: schema.outboxEvents.claimId,
        deliveredAt: schema.outboxEvents.deliveredAt,
      })
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.id, id)),
  );

suite('Outbox claim ownership (AUDIT #11)', () => {
  let env: TestEnv;

  beforeAll(async () => {
    env = await startTestEnv();
    await env.db.withoutTenant('seed test tenant', async (tx) => {
      await tx.insert(schema.tenants).values({
        id: TENANT_UUID,
        slug: 'cafe-claim-owner',
        displayName: 'Cafe Claim Owner',
        country: 'GB',
      });
    });
  }, 120_000);

  afterAll(async () => {
    await stopTestEnv(env);
  });

  it('a stale dispatcher cannot release or mark a row reclaimed by another dispatcher', async () => {
    const eventId = randomUUID();
    const envelope = buildEnvelope(eventId);
    await env.db.withoutTenant('append outbox', (tx) => appendToOutbox(tx, { envelope }));

    const claimA = await env.db.withoutTenant('A claims', (tx) =>
      claimOutboxBatch(tx, { batchSize: 10 }),
    );
    const claimIdA = claimA.find((c) => c.envelope.id === eventId)?.claimId;
    if (claimIdA === undefined) throw new Error('Dispatcher A did not claim the row');

    await env.db.withoutTenant('age A claim', (tx) =>
      tx
        .update(schema.outboxEvents)
        .set({ claimedAt: sql`NOW() - make_interval(secs => 3600)` })
        .where(eq(schema.outboxEvents.id, eventId)),
    );

    const claimB = await env.db.withoutTenant('B reclaims', (tx) =>
      claimOutboxBatch(tx, { batchSize: 10, visibilityTimeoutSeconds: 30 }),
    );
    const claimIdB = claimB.find((c) => c.envelope.id === eventId)?.claimId;
    if (claimIdB === undefined) throw new Error('Dispatcher B did not reclaim the row');
    expect(claimIdB).not.toBe(claimIdA);

    await env.db.withoutTenant('A stale release', (tx) =>
      releaseOutboxClaim(tx, eventId, claimIdA),
    );

    const afterRelease = await readRow(env, eventId);
    expect(afterRelease[0]?.claimId).toBe(claimIdB);
    expect(afterRelease[0]?.claimedAt).not.toBeNull();
    expect(afterRelease[0]?.deliveredAt).toBeNull();

    await env.db.withoutTenant('A stale mark', (tx) =>
      markOutboxDelivered(tx, [eventId], claimIdA),
    );
    const afterStaleMark = await readRow(env, eventId);
    expect(afterStaleMark[0]?.deliveredAt).toBeNull();

    await env.db.withoutTenant('B marks delivered', (tx) =>
      markOutboxDelivered(tx, [eventId], claimIdB),
    );
    const afterOwnerMark = await readRow(env, eventId);
    expect(afterOwnerMark[0]?.deliveredAt).not.toBeNull();
  }, 60_000);
});
