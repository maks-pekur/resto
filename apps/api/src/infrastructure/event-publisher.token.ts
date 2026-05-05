/**
 * DI token for the cross-context `EventPublisher`. Lives in its own file
 * so that consumers (e.g. `OutboxDispatcherService`) can import it
 * without pulling `nats.module.ts`, which avoids a top-level circular
 * import chain (NatsModule → OutboxDispatcherService → NatsModule).
 */
export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');
