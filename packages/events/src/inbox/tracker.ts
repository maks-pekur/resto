import type { EventEnvelope } from '../envelope';

/**
 * Per-consumer dedup ledger. NATS JetStream is at-least-once: a
 * dispatcher restart between publish and ack, or a consumer restart
 * between handler success and ack, can both produce redelivery.
 * Consumers MUST be idempotent, and the easiest way is to record what
 * they have already processed.
 */
export interface InboxTracker {
  /** True if the (consumer, eventId) pair has already been processed. */
  hasSeen(consumer: string, eventId: string): Promise<boolean>;
  /**
   * Atomically record successful processing. Implementations are expected
   * to be safe under concurrent calls — the production binding uses
   * Postgres `INSERT ... ON CONFLICT DO NOTHING` so two replicas racing
   * on the same `(consumer, eventId)` produce exactly one row.
   *
   * Returns `true` if the row was newly inserted, `false` if it was
   * already there (concurrent / repeat call).
   */
  markProcessed(consumer: string, eventId: string, tenantId: string | null): Promise<boolean>;
}

/**
 * In-memory implementation. Sufficient for tests and for single-process
 * apps. Production deployments use `DrizzleInboxTracker` so the dedup
 * window survives restarts and is shared across replicas.
 */
export class InMemoryInboxTracker implements InboxTracker {
  readonly #seen = new Map<string, Set<string>>();

  hasSeen(consumer: string, eventId: string): Promise<boolean> {
    return Promise.resolve(this.#seen.get(consumer)?.has(eventId) ?? false);
  }

  markProcessed(consumer: string, eventId: string, _tenantId: string | null): Promise<boolean> {
    let set = this.#seen.get(consumer);
    if (!set) {
      set = new Set();
      this.#seen.set(consumer, set);
    }
    if (set.has(eventId)) return Promise.resolve(false);
    set.add(eventId);
    return Promise.resolve(true);
  }
}

/**
 * @deprecated Persistence-only dedup; does NOT prevent duplicate handler
 * invocation. See ADR-0020 I-5 and packages/events/CLAUDE.md.
 *
 * Wraps a handler so that on a "seen" `(consumer, eventId)` the inner
 * handler is skipped. The dedup check, the handler, and the
 * `markProcessed` write happen in **three separate database
 * transactions**. Two replicas (or one replica + one crash-recovery
 * redelivery) can both observe `hasSeen === false`, both run the handler
 * with full side effects (emails, payments, audit rows, downstream
 * publishes), and only one of the `markProcessed` calls wins — the
 * persisted record is unique, but the side effects are NOT.
 *
 * Use this only when the handler is genuinely idempotent by construction
 * (idempotency key passed to the external system, or the handler's only
 * side effect is an `ON CONFLICT DO NOTHING` insert it manages itself).
 *
 * The preferred wrapper is `runDeduped(envelope, async (tx) => …)`
 * (planned, ADR-0020 I-5), which performs
 * `INSERT INTO inbox_processed VALUES (…) ON CONFLICT DO NOTHING
 * RETURNING 1` inside the SAME transaction as the handler's DB side
 * effects and short-circuits when zero rows. That converts at-least-once
 * delivery into at-most-once handler invocation for handlers whose side
 * effects are confined to the database.
 *
 * Failure semantics today: when the inner handler throws, the dedup
 * record is NOT persisted — the next delivery retries. The atomic
 * `markProcessed` guarantees exactly one persisted record per
 * (consumer, eventId), but says nothing about handler runs.
 */
export const withInboxDedup = (
  tracker: InboxTracker,
  consumer: string,
  handler: (envelope: EventEnvelope) => Promise<void>,
): ((envelope: EventEnvelope) => Promise<void>) => {
  return async (envelope) => {
    if (await tracker.hasSeen(consumer, envelope.id)) return;
    await handler(envelope);
    await tracker.markProcessed(consumer, envelope.id, envelope.tenantId);
  };
};
