import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import { runInTenantContext, type TenantContext } from '@resto/db';
import { TenantId } from '@resto/domain';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ENV_TOKEN } from '../config/config.module';
import type { Env } from '../config/env.schema';
import { TenantAndBrandResolverService } from '../contexts/tenancy/application/tenant-and-brand-resolver.service';
import { TenantResolverService } from '../contexts/tenancy/application/tenant-resolver.service';

const HEADER_TENANT = 'x-tenant-slug';
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
    const host = req.headers.host;

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
    if (this.env.NODE_ENV === 'development' || this.env.NODE_ENV === 'test') {
      // The `x-tenant-slug` header is a dev/test escape hatch — production
      // and staging use host-based routing only. Honouring the header in
      // prod would let any client on a `@Public` route (e.g. the customer
      // QR-menu) read another tenant by sending a different slug.
      const headerOverride = req.headers[HEADER_TENANT];
      if (typeof headerOverride === 'string' && headerOverride.length > 0) {
        const fromHeader = await this.tenants.resolveBySlug(headerOverride);
        if (fromHeader) return fromHeader.id;
      }
    }

    const fromHost = await this.tenants.resolveByHost(req.headers.host);
    if (fromHost) return fromHost.id;

    if (this.env.NODE_ENV === 'development' && this.env.TENANT_DEV_FALLBACK_SLUG) {
      const fallback = await this.tenants.resolveBySlug(this.env.TENANT_DEV_FALLBACK_SLUG);
      if (fallback) return fallback.id;
    }
    return undefined;
  }
}
