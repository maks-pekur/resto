import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Correlation-id propagation.
 *
 * Per ADR-0004, events carry a `correlationId` that ties them back to
 * the inbound request that triggered the chain. The transport layer
 * (NATS adapter) reads/writes it from message headers; in-process code
 * propagates it via this AsyncLocalStorage so producers do not need to
 * pass it explicitly through every function call.
 *
 * Semantically this maps onto OpenTelemetry baggage: the `apps/api`
 * instrumentation will read the OTel active context and forward into
 * this store at the framework boundary. Keeping the public API broker-
 * and OTel-agnostic means contexts and tests have no SDK dependency.
 */
const store = new AsyncLocalStorage<{ readonly correlationId: string }>();

/**
 * Run `fn` with `correlationId` bound to the current async context.
 * Nested calls override the outer correlation id — typical use is at
 * the request boundary, once per inbound request.
 */
export const withCorrelationId = <T>(correlationId: string, fn: () => T): T =>
  store.run({ correlationId }, fn);

/** Return the active correlation id, or `undefined` if none is bound. */
export const getCorrelationId = (): string | undefined => store.getStore()?.correlationId;

/** Return the active correlation id, throwing if none is bound. */
export const requireCorrelationId = (): string => {
  const id = getCorrelationId();
  if (!id) {
    throw new Error(
      'No correlation id in context. Wrap your code in withCorrelationId(...) or set one ' +
        'at the request boundary in apps/api.',
    );
  }
  return id;
};
