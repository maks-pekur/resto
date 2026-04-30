import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request execution context propagated through async call stacks.
 *
 * The tenant-aware client (`packages/db/src/client.ts`) reads from this
 * before opening a transaction; if no context is bound, the client throws
 * unless the caller went through `withoutTenant(reason, op)` explicitly.
 */
export interface TenantContext {
  readonly tenantId: string;
  /**
   * Optional correlation id propagated end-to-end (HTTP middleware → DB
   * → outbox → events). Mirrors OpenTelemetry baggage; populated on
   * inbound requests.
   */
  readonly correlationId?: string;
}

const storage = new AsyncLocalStorage<TenantContext>();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuid = (value: string): boolean => UUID_RE.test(value);

/**
 * Run `op` with the given tenant context bound. Nested calls replace
 * the parent context for the duration of `op`.
 */
export const runInTenantContext = <T>(context: TenantContext, op: () => Promise<T>): Promise<T> => {
  if (!isUuid(context.tenantId)) {
    return Promise.reject(
      new Error(`Invalid tenant id: expected a uuid, got ${JSON.stringify(context.tenantId)}.`),
    );
  }
  return storage.run(context, op);
};

/**
 * Returns the current tenant context, or undefined if none is bound.
 *
 * Most callers should prefer `requireTenantContext()` — only
 * infrastructure code (logging middleware, telemetry exporters) reads
 * this optionally.
 */
export const getTenantContext = (): TenantContext | undefined => storage.getStore();

/**
 * Returns the current tenant context. Throws when no context is bound —
 * this is by design: every tenant-scoped query must run inside a
 * `runInTenantContext()` block. Bypass requires the explicit
 * `withoutTenant()` escape hatch.
 */
export const requireTenantContext = (): TenantContext => {
  const ctx = storage.getStore();
  if (ctx === undefined) {
    throw new Error(
      'No tenant context bound. Wrap the call in runInTenantContext() ' +
        'or use withoutTenant(reason, op) for system code.',
    );
  }
  return ctx;
};
