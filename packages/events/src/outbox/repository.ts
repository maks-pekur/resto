import { schema, type RestoTx } from '@resto/db';
import { and, asc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { EventEnvelope } from '../envelope';
import { envelopeToHeaders, HEADER_CAUSATION, HEADER_CORRELATION, HEADER_VERSION } from './headers';

const DEFAULT_VISIBILITY_TIMEOUT_SECONDS = 30;

export interface AppendOutboxOptions {
  readonly envelope: EventEnvelope;
  /** Optional source-aggregate id for ops/observability. Unused at runtime. */
  readonly aggregateId?: string;
}

/**
 * Insert an envelope into the outbox in the *current* transaction.
 *
 * MUST be called from inside the same `withTenant` (or `withoutTenant`
 * for platform-level events) transaction as the state change that
 * produced the event. That coupling is what makes the outbox
 * transactional — no broker publish without a successful DB commit, and
 * no DB commit without a corresponding outbox row.
 */
export const appendToOutbox = async (tx: RestoTx, options: AppendOutboxOptions): Promise<void> => {
  await tx.insert(schema.outboxEvents).values({
    id: options.envelope.id,
    tenantId: options.envelope.tenantId,
    aggregateId: options.aggregateId ?? null,
    type: options.envelope.type,
    payload: options.envelope.payload as Record<string, unknown>,
    headers: envelopeToHeaders(options.envelope),
    occurredAt: options.envelope.occurredAt,
  });
};

export interface ClaimOptions {
  readonly batchSize: number;
  readonly visibilityTimeoutSeconds?: number;
}

export interface ClaimedEvent {
  readonly envelope: EventEnvelope;
}

const reconstructEnvelope = (row: typeof schema.outboxEvents.$inferSelect): EventEnvelope => {
  const versionRaw = row.headers[HEADER_VERSION];
  if (!versionRaw) {
    throw new Error(`Outbox row ${row.id} is missing the ${HEADER_VERSION} header.`);
  }
  const correlationId = row.headers[HEADER_CORRELATION];
  if (!correlationId) {
    throw new Error(`Outbox row ${row.id} is missing the ${HEADER_CORRELATION} header.`);
  }
  return EventEnvelope.parse({
    id: row.id,
    type: row.type,
    version: Number(versionRaw),
    tenantId: row.tenantId,
    correlationId,
    causationId: row.headers[HEADER_CAUSATION] ?? null,
    occurredAt: row.occurredAt,
    payload: row.payload,
  });
};

/**
 * Atomically claim up to `batchSize` undelivered events. A row is
 * claimed when its `claimed_at` is set; the visibility timeout governs
 * when an abandoned claim becomes available again.
 *
 * Uses `FOR UPDATE SKIP LOCKED` so multiple dispatchers can run side by
 * side without contending for the same rows.
 */
export const claimOutboxBatch = async (
  tx: RestoTx,
  options: ClaimOptions,
): Promise<ClaimedEvent[]> => {
  const timeout = options.visibilityTimeoutSeconds ?? DEFAULT_VISIBILITY_TIMEOUT_SECONDS;

  const candidates = tx
    .select({ id: schema.outboxEvents.id })
    .from(schema.outboxEvents)
    .where(
      and(
        isNull(schema.outboxEvents.deliveredAt),
        or(
          isNull(schema.outboxEvents.claimedAt),
          lt(schema.outboxEvents.claimedAt, sql`NOW() - make_interval(secs => ${timeout})`),
        ),
      ),
    )
    .orderBy(asc(schema.outboxEvents.occurredAt))
    .limit(options.batchSize)
    .for('update', { skipLocked: true });

  const claimed = await tx
    .update(schema.outboxEvents)
    .set({ claimedAt: sql`NOW()` })
    .where(inArray(schema.outboxEvents.id, candidates))
    .returning();

  return claimed.map((row) => ({ envelope: reconstructEnvelope(row) }));
};

/**
 * Mark the given event ids as delivered. Called once the broker has
 * acknowledged the publish; redelivery on a crash between publish and
 * mark is harmless because `EventEnvelope.id` is the broker idempotency
 * key (`msgID` on NATS) and consumers dedup via the inbox tracker.
 */
export const markOutboxDelivered = async (tx: RestoTx, ids: readonly string[]): Promise<void> => {
  if (ids.length === 0) return;
  await tx
    .update(schema.outboxEvents)
    .set({ deliveredAt: sql`NOW()` })
    .where(inArray(schema.outboxEvents.id, [...ids]));
};

/**
 * Release a claim without marking the row delivered — used when publish
 * fails and we want the row immediately reclaimable rather than waiting
 * for the visibility timeout. Optional optimization; safe to skip.
 */
export const releaseOutboxClaim = async (tx: RestoTx, id: string): Promise<void> => {
  await tx
    .update(schema.outboxEvents)
    .set({ claimedAt: null })
    .where(and(eq(schema.outboxEvents.id, id), isNull(schema.outboxEvents.deliveredAt)));
};
