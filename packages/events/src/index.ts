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
  buildEnvelope,
  defineEventContract,
  type BuildEnvelopeOptions,
  type EventContract,
  type TypedEnvelope,
} from './envelope';

export { withCorrelationId, getCorrelationId, requireCorrelationId } from './correlation';

export type {
  DlqPublisher,
  EventPublisher,
  EventSubscriber,
  EventSubscription,
  SubscribeOptions,
} from './ports';

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

export { runDeduped, type RunDedupedResult } from './inbox/run-deduped';

export { NatsJetStreamPublisher, type NatsPublisherOptions } from './infrastructure/nats-publisher';
export {
  NatsJetStreamSubscriber,
  type NatsSubscriberOptions,
} from './infrastructure/nats-subscriber';

export {
  BrandPaymentAccountLinkedV1,
  BrandPaymentAccountLinkedV1Payload,
  BrandPaymentCapabilitiesAppliedV1,
  BrandPaymentCapabilitiesAppliedV1Payload,
  TenantArchivedV1,
  TenantArchivedV1Payload,
  TenantErasureCompletedV1,
  TenantErasureCompletedV1Payload,
  TenantOffboardingCancelledV1,
  TenantOffboardingCancelledV1Payload,
  TenantOffboardingScheduledV1,
  TenantOffboardingScheduledV1Payload,
  TenantProvisionedV1,
  TenantProvisionedV1Payload,
  TenantResumedV1,
  TenantResumedV1Payload,
  TenantSuspendedV1,
  TenantSuspendedV1Payload,
} from './contracts/tenancy';

export {
  IdentityEmailDispatchFailedV1,
  IdentityEmailDispatchFailedV1Payload,
  IdentityPasswordResetCompletedV1,
  IdentityPasswordResetCompletedV1Payload,
  IdentityRoleChangedV1,
  IdentityRoleChangedV1Payload,
  IdentitySignedInV1,
  IdentitySignedInV1Payload,
  IdentitySignedOutV1,
  IdentitySignedOutV1Payload,
} from './contracts/identity';

export {
  ItemStoppedV1,
  ItemStoppedV1Payload,
  ItemUnstoppedV1,
  ItemUnstoppedV1Payload,
  MenuFirstPublishedV1,
  MenuFirstPublishedV1Payload,
  MenuRepublishedV1,
  MenuRepublishedV1Payload,
} from './contracts/catalog';

export {
  OrderCanceledV1,
  OrderCanceledV1Payload,
  OrderCreatedV1,
  OrderCreatedV1Payload,
  OrderPaidV1,
  OrderPaidV1Payload,
  OrderRefundedV1,
  OrderRefundedV1Payload,
  OrderStatusChangedV1,
  OrderStatusChangedV1Payload,
} from './contracts/ordering';

export {
  PaymentDisputeOpenedV1,
  PaymentDisputeOpenedV1Payload,
  PaymentOrderFailedV1,
  PaymentOrderFailedV1Payload,
  PaymentOrderRefundedV1,
  PaymentOrderRefundedV1Payload,
  PaymentOrderSucceededV1,
  PaymentOrderSucceededV1Payload,
} from './contracts/payments';
