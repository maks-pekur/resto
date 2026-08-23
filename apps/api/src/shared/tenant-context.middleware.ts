import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import { runInTenantContext, type TenantContext } from '@resto/db';
import { LocationId } from '@resto/domain';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ENV_TOKEN } from '../config/config.module';
import type { Env } from '../config/env.schema';
import { constantTimeStringEqual } from './api/constant-time-equal';
import { effectiveHost } from './effective-host';
import { TenantResolverService } from '../contexts/tenancy/application/tenant-resolver.service';

const HEADER_TENANT = 'x-tenant-slug';
const HEADER_TENANT_ID = 'x-tenant-id';
const HEADER_LOCATION = 'x-location-id';
const BETTER_AUTH_PATH_PREFIX = '/api/auth';

// `req.url` is rewritten to `/` by the Fastify middleware-compat layer
// `@fastify/middie` rewrites `req.url` to `/` before user middleware runs.
const isBetterAuthRoute = (req: FastifyRequest['raw']): boolean => {
  const path = (req as unknown as { originalUrl?: string }).originalUrl ?? req.url ?? '';
  return path.startsWith(BETTER_AUTH_PATH_PREFIX);
};

/**
 * Resolve the tenant for an inbound request and bind to AsyncLocalStorage
 * so the tenant-aware DB client picks it up without any per-call wiring.
 *
 * Resolution is delegated to `TenantResolverService` — its
 * `resolveByCustomerHost` covers the guest-menu host (D-22's `.menu.`
 * branch) and its other methods cover the operator-side header/host
 * paths. Override / dev fallback handling stays here because it is a
 * transport concern.
 *
 * Health endpoints are intentionally tenant-less and run before this
 * middleware (route exclusion in `app.module.ts`). When no tenant
 * resolves, the request continues without a context — bounded contexts
 * that need a tenant call `requireTenantContext()` and 4xx accordingly.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(
    @Inject(ENV_TOKEN) private readonly env: Env,
    @Inject(TenantResolverService) private readonly tenants: TenantResolverService,
  ) {}

  async use(
    req: FastifyRequest['raw'],
    _res: FastifyReply['raw'],
    next: () => void,
  ): Promise<void> {
    if (isBetterAuthRoute(req)) {
      next();
      return;
    }
    const context = await this.resolveContext(req);
    if (!context) {
      next();
      return;
    }
    await runInTenantContext(context, () => {
      next();
      return Promise.resolve();
    });
  }

  private async resolveContext(req: FastifyRequest['raw']): Promise<TenantContext | null> {
    const trustProxy = this.env.TRUST_PROXY !== undefined && this.env.TRUST_PROXY.length > 0;
    const host = effectiveHost(req.headers, trustProxy);
    const locationId = this.resolveLocationHeader(req);

    const customer = await this.tenants.resolveByCustomerHost(host);
    if (customer) {
      return { tenantId: customer.id, ...(locationId ? { locationId } : {}) };
    }

    const tenantId = await this.resolveTenantOnly(req);
    if (!tenantId) return null;

    return { tenantId, ...(locationId ? { locationId } : {}) };
  }

  // T-084-09: header is a client-echoed hint, not a trust boundary — the
  // per-request LocationScopeGuard cross-check (plan 05) is the real gate.
  private resolveLocationHeader(req: FastifyRequest['raw']): string | undefined {
    const header = req.headers[HEADER_LOCATION];
    if (typeof header !== 'string' || header.length === 0) return undefined;
    return LocationId.safeParse(header).success ? header : undefined;
  }

  private async resolveTenantOnly(req: FastifyRequest['raw']): Promise<string | undefined> {
    // RES-181: admin sends BA `activeOrganizationId` (UUID) as `x-tenant-id` on every /v1/* request.
    // Safe in prod: AuthGuard `auth.tenant_mismatch` (RES-172) rejects any value that diverges from the session.
    const idHeader = req.headers[HEADER_TENANT_ID];
    if (typeof idHeader === 'string' && idHeader.length > 0) {
      const fromId = await this.tenants.resolveById(idHeader);
      if (fromId) return fromId.id;
    }

    // RES-176: `x-tenant-slug` stays gated — seed CLI escape hatch for dev/test and /internal/v1/* + token.
    if (this.shouldAcceptTenantSlugHeader(req)) {
      const headerOverride = req.headers[HEADER_TENANT];
      if (typeof headerOverride === 'string' && headerOverride.length > 0) {
        const fromHeader = await this.tenants.resolveBySlug(headerOverride);
        if (fromHeader) return fromHeader.id;
      }
    }

    const fromHost = await this.tenants.resolveByHost(
      effectiveHost(
        req.headers,
        this.env.TRUST_PROXY !== undefined && this.env.TRUST_PROXY.length > 0,
      ),
    );
    if (fromHost) return fromHost.id;

    if (this.env.NODE_ENV === 'development' && this.env.TENANT_DEV_FALLBACK_SLUG) {
      const fallback = await this.tenants.resolveBySlug(this.env.TENANT_DEV_FALLBACK_SLUG);
      if (fallback) return fallback.id;
    }
    return undefined;
  }

  private shouldAcceptTenantSlugHeader(req: FastifyRequest['raw']): boolean {
    if (this.env.NODE_ENV === 'development' || this.env.NODE_ENV === 'test') return true;
    const url = req.url ?? '';
    if (!url.startsWith('/internal/v1/')) return false;
    const expected = this.env.INTERNAL_API_TOKEN;
    if (!expected) return false;
    const presented = req.headers['x-internal-token'];
    if (typeof presented !== 'string') return false;
    return constantTimeStringEqual(presented, expected);
  }
}
