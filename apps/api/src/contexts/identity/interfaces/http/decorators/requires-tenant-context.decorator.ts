import { SetMetadata } from '@nestjs/common';

export const REQUIRES_TENANT_CONTEXT_KEY = 'identity:requires_tenant_context';

/**
 * Marks a route as requiring an ALS-bound tenant context (RES-172).
 * The default-deny `AuthGuard` rejects with `auth.tenant_context_missing`
 * (403) when the middleware did not resolve a tenant for the request —
 * preventing routes from silently trusting `principal.tenantId` while
 * RLS is bypassed.
 *
 * Use on every operator route that reads or writes tenant-scoped data
 * via the principal. Self-info endpoints (e.g. `/v1/me`) deliberately
 * stay un-decorated because they do not touch tenant data.
 */
export const RequiresTenantContext = (): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRES_TENANT_CONTEXT_KEY, true);
