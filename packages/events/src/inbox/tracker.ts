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
  /** Record successful processing. Idempotent. */
  markSeen(consumer: string, eventId: string): Promise<void>;
}

/**
 * In-memory implementation. Sufficient for tests and for single-process
 * apps where the broker's at-least-once guarantee only kicks in across
 * intra-process redeliveries. Production deployments will swap in a
 * persistent (Postgres- or Redis-backed) tracker before scaling out
 * consumers — that lands separately when the first real consumer
 * arrives.
 */
export class InMemoryInboxTracker implements InboxTracker {
  readonly #seen = new Map<string, Set<string>>();

  hasSeen(consumer: string, eventId: string): Promise<boolean> {
    return Promise.resolve(this.#seen.get(consumer)?.has(eventId) ?? false);
  }

  markSeen(consumer: string, eventId: string): Promise<void> {
    let set = this.#seen.get(consumer);
    if (!set) {
      set = new Set();
      this.#seen.set(consumer, set);
    }
    set.add(eventId);
    return Promise.resolve();
  }
}

/**
 * Wrap a handler with dedup semantics: if the tracker has seen this
 * `(consumer, eventId)` pair, the inner handler is skipped and the
 * envelope is dropped silently. Subscribers should chain this onto every
 * registered handler.
 */
export const withInboxDedup = (
  tracker: InboxTracker,
  consumer: string,
  handler: (envelope: EventEnvelope) => Promise<void>,
): ((envelope: EventEnvelope) => Promise<void>) => {
  return async (envelope) => {
    if (await tracker.hasSeen(consumer, envelope.id)) return;
    await handler(envelope);
    await tracker.markSeen(consumer, envelope.id);
  };
};
