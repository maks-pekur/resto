import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import { runInTenantContext, type TenantContext } from '@resto/db';
import { TenantId } from '@resto/domain';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ENV_TOKEN } from '../config/config.module';
import type { Env } from '../config/env.schema';
import { effectiveHost } from './effective-host';
import { TenantAndBrandResolverService } from '../contexts/tenancy/application/tenant-and-brand-resolver.service';
import { TenantResolverService } from '../contexts/tenancy/application/tenant-resolver.service';

const HEADER_TENANT = 'x-tenant-slug';
const HEADER_TENANT_ID = 'x-tenant-id';
const HEADER_BRAND = 'x-brand-slug';

/**
 * Resolve the tenant (and brand, when available) for an inbound request
 * and bind to AsyncLocalStorage so the tenant-aware DB client picks it
 * up without any per-call wiring.
 *
 * Resolution is delegated to `TenantResolverService` (tenant-only path)
 * and `TenantAndBrandResolverService` (customer-facing brand path,
 * operator-side X-Brand-Slug header). Override / dev fallback handling
 * stays here because it is a transport concern.
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
    @Inject(TenantAndBrandResolverService)
    private readonly brands: TenantAndBrandResolverService,
  ) {}

  async use(
    req: FastifyRequest['raw'],
    _res: FastifyReply['raw'],
    next: () => void,
  ): Promise<void> {
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

    const customer = await this.brands.resolveByCustomerHost(host);
    if (customer) {
      return { tenantId: customer.tenantId, brandId: customer.brandId };
    }

    const tenantId = await this.resolveTenantOnly(req);
    if (!tenantId) return null;

    const brandHeader = req.headers[HEADER_BRAND];
    if (typeof brandHeader === 'string' && brandHeader.length > 0) {
      const brand = await this.brands.resolveBrandBySlug(TenantId.parse(tenantId), brandHeader);
      if (brand) return { tenantId, brandId: brand.id };
    }

    return { tenantId };
  }

  private async resolveTenantOnly(req: FastifyRequest['raw']): Promise<string | undefined> {
    // The `x-tenant-slug` header is an escape hatch:
    //   - dev/test: always honored for tooling ergonomics.
    //   - prod/staging on `/internal/v1/*`: honored ONLY when the
    //     `x-internal-token` matches `INTERNAL_API_TOKEN` (RES-176).
    //     The seed CLI hits the bare api host with the token, so it
    //     needs this path to bind a tenant context. The check duplicates
    //     `InternalTokenGuard` (which runs after this middleware), and
    //     that's intentional — middleware must not bind a tenant based
    //     on an unauthenticated client's header.
    //   - prod/staging everywhere else: ignored. Host-based routing only.
    if (this.shouldAcceptTenantSlugHeader(req)) {
      // Admin (RES-181) sends `x-tenant-id` from BA's
      // `activeOrganizationId` (UUID); the seed CLI uses the
      // human-readable `x-tenant-slug`. Both honored under the same
      // gate; both pass through `AuthGuard.tenant_mismatch` cross-check
      // (RES-172) so a forged header still cannot read another tenant's
      // data.
      const idHeader = req.headers[HEADER_TENANT_ID];
      if (typeof idHeader === 'string' && idHeader.length > 0) {
        const fromId = await this.tenants.resolveById(idHeader);
        if (fromId) return fromId.id;
      }
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
    return timingSafeEqualString(presented, expected);
  }
}

const timingSafeEqualString = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
};
