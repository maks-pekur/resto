import type { EventEnvelope } from './envelope';

/**
 * Transport-agnostic publisher port. Implemented by NATS adapter today
 * (`infrastructure/nats-publisher.ts`); a future Kafka adapter would
 * implement the same interface — the dispatcher and bounded contexts
 * see no difference (ADR-0004).
 */
export interface EventPublisher {
  publish(envelope: EventEnvelope): Promise<void>;
  close(): Promise<void>;
}

/** Active subscription handle returned by `EventSubscriber.subscribe`. */
export interface EventSubscription {
  stop(): Promise<void>;
}

export interface SubscribeOptions {
  /** Subject pattern to match (e.g. `tenancy.tenant_provisioned.v1`, or `tenancy.>`). */
  readonly subject: string;
  /**
   * Durable consumer name. Persists offset state on the broker so the
   * consumer can restart without losing or replaying events. Must be
   * unique per consuming context.
   */
  readonly durableName: string;
  /**
   * Maximum unacked messages in flight. Default 10 — bumped above 1 per
   * packages/events/CLAUDE.md rule (a NAK on one message must not block
   * the whole subject behind the NAK timeout).
   */
  readonly maxInFlight?: number;
  /**
   * AUTH-10: maximum delivery attempts per message before routing to
   * `dlq.<subject>`. Default 5 (D-19). Without this bound a poison
   * message NAK-loops forever and stalls the consumer.
   */
  readonly maxDeliver?: number;
  /**
   * AUTH-10: how long the broker waits for ack before redelivering, in
   * milliseconds. Default 30_000 ms (30 s). Must exceed slowest expected
   * handler so duplicate invocations do not race; revisit per consumer.
   */
  readonly ackWaitMs?: number;
  /**
   * AUTH-10: optional DLQ publisher. When the message hits
   * `deliveryCount >= maxDeliver` AND the handler still throws, the
   * subscriber republishes the raw bytes via this publisher to
   * `dlq.<originalSubject>`. If omitted, the subscriber ACKs the poison
   * message (preventing redelivery loops) but does NOT republish —
   * strictly degraded operation, logged at error level.
   */
  readonly dlqPublisher?: DlqPublisher;
  /** Consumer callback. Resolves on success → ack; throws → nak (redeliver). */
  readonly handler: (envelope: EventEnvelope) => Promise<void>;
}

/**
 * Subset of `EventPublisher` required by the DLQ branch — just `publishRaw`.
 * Lets the subscriber accept a publisher without coupling to the full
 * envelope-publish path.
 */
export interface DlqPublisher {
  publishRaw(subject: string, data: Uint8Array): Promise<void>;
}

/**
 * Transport-agnostic subscriber port. Consumers register a `durableName`
 * and a handler; the adapter delivers parsed envelopes and handles
 * ack/nak based on whether the handler resolves or throws.
 */
export interface EventSubscriber {
  subscribe(options: SubscribeOptions): Promise<EventSubscription>;
  close(): Promise<void>;
}
