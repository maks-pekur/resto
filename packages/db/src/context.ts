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
  readonly locationId?: string;
  /**
   * Optional correlation id propagated end-to-end (HTTP middleware → DB
   * → outbox → events). Mirrors OpenTelemetry baggage; populated on
   * inbound requests.
   */
  readonly correlationId?: string;
}

const storage = new AsyncLocalStorage<TenantContext>();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string): boolean => UUID_RE.test(value);

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
  if (context.locationId !== undefined && !isUuid(context.locationId)) {
    return Promise.reject(
      new Error(`Invalid location id: expected a uuid, got ${JSON.stringify(context.locationId)}.`),
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

export const getLocationId = (): string | undefined => storage.getStore()?.locationId;

export const withLocation = <T>(locationId: string, op: () => Promise<T>): Promise<T> => {
  if (!isUuid(locationId)) {
    return Promise.reject(
      new Error(`Invalid location id: expected a uuid, got ${JSON.stringify(locationId)}.`),
    );
  }
  const parent = storage.getStore();
  if (parent === undefined) {
    return Promise.reject(
      new Error(
        'withLocation requires a parent tenant context. Wrap in runInTenantContext() first.',
      ),
    );
  }
  return storage.run({ ...parent, locationId }, op);
};

/**
 * Run `op` in a location-free child frame — the parent context minus `locationId`. For a lookup
 * whose row is keyed only by its own id and whose answer must not depend on a client-echoed
 * `x-location-id` header (`TenantContextMiddleware` binds it for every caller, including
 * anonymous ones). Requires a parent tenant context; a location-free frame is not a tenant-free
 * one — dropping the tenant here would be a real hole.
 */
export const withoutLocation = <T>(op: () => Promise<T>): Promise<T> => {
  const parent = storage.getStore();
  if (parent === undefined) {
    return Promise.reject(
      new Error(
        'withoutLocation requires a parent tenant context. Wrap in runInTenantContext() first.',
      ),
    );
  }
  const { locationId: _locationId, ...rest } = parent;
  return storage.run(rest, op);
};

export const requireLocationContext = (): string => {
  const locationId = storage.getStore()?.locationId;
  if (locationId === undefined) {
    throw new Error(
      'No location context bound. Wrap the call in a request that resolves a location ' +
        '(via TenantContextMiddleware) or use withLocation(locationId, op) explicitly.',
    );
  }
  return locationId;
};
