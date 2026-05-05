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
 * Wrap a handler with dedup semantics: if the tracker has seen this
 * `(consumer, eventId)` pair, the inner handler is skipped and the
 * envelope is dropped silently. Subscribers should chain this onto every
 * registered handler.
 *
 * Failure semantics: when the inner handler throws, the dedup record is
 * NOT persisted — the next delivery retries. Two replicas can race past
 * the `hasSeen` check, but the atomic `markProcessed` guarantees exactly
 * one persisted record per (consumer, eventId).
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
