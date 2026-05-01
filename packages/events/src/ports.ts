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
   * Maximum unacked messages in flight. Default 1 — sequential consumption
   * is the safe baseline; raise per-consumer when the handler is cheap.
   */
  readonly maxInFlight?: number;
  /** Consumer callback. Resolves on success → ack; throws → nak (redeliver). */
  readonly handler: (envelope: EventEnvelope) => Promise<void>;
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
