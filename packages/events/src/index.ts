/**
 * Public surface of `@resto/events`.
 *
 * Bounded contexts and adapters depend on this package only via the
 * explicit re-exports here. The `nats` import is confined to
 * `src/infrastructure/` — production code that imports `nats` directly
 * from anywhere else is a layering bug.
 */

export {
  EventEnvelope,
  defineEventContract,
  type EventContract,
  type TypedEnvelope,
} from './envelope';

export { withCorrelationId, getCorrelationId, requireCorrelationId } from './correlation';

export type { EventPublisher, EventSubscriber, EventSubscription, SubscribeOptions } from './ports';

export {
  appendToOutbox,
  claimOutboxBatch,
  markOutboxDelivered,
  releaseOutboxClaim,
  type AppendOutboxOptions,
  type ClaimOptions,
  type ClaimedEvent,
} from './outbox/repository';
export {
  envelopeToHeaders,
  HEADER_CAUSATION,
  HEADER_CORRELATION,
  HEADER_VERSION,
} from './outbox/headers';
export { OutboxDispatcher, type DispatcherOptions, type TickResult } from './outbox/dispatcher';

export { InMemoryInboxTracker, withInboxDedup, type InboxTracker } from './inbox/tracker';

export { NatsJetStreamPublisher, type NatsPublisherOptions } from './infrastructure/nats-publisher';
export {
  NatsJetStreamSubscriber,
  type NatsSubscriberOptions,
} from './infrastructure/nats-subscriber';

export { TenantProvisionedV1, TenantProvisionedV1Payload } from './contracts/tenancy';
