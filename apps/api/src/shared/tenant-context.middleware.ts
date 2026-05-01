import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import { runInTenantContext } from '@resto/db';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ENV_TOKEN } from '../config/config.module';
import type { Env } from '../config/env.schema';
import { TenantResolverService } from '../contexts/tenancy/application/tenant-resolver.service';

const HEADER_OVERRIDE = 'x-tenant-slug';

/**
 * Resolve the tenant for an inbound request and bind it to
 * `AsyncLocalStorage` so the tenant-aware DB client picks it up without
 * any per-call wiring.
 *
 * Resolution is delegated to `TenantResolverService` (tenancy bounded
 * context). Override / dev fallback handling stays here because it is a
 * transport concern, not a domain concern.
 *
 * Health endpoints are intentionally tenant-less and run before this
 * middleware (route exclusion in `app.module.ts`). When no tenant is
 * resolved, the request continues without a context — bounded contexts
 * that need a tenant call `requireTenantContext()` and 4xx accordingly.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(
    @Inject(ENV_TOKEN) private readonly env: Env,
    @Inject(TenantResolverService) private readonly resolver: TenantResolverService,
  ) {}

  async use(
    req: FastifyRequest['raw'],
    _res: FastifyReply['raw'],
    next: () => void,
  ): Promise<void> {
    const tenantId = await this.resolveTenantId(req);
    if (!tenantId) {
      next();
      return;
    }
    await runInTenantContext({ tenantId }, () => {
      next();
      return Promise.resolve();
    });
  }

  private async resolveTenantId(req: FastifyRequest['raw']): Promise<string | undefined> {
    const headerOverride = req.headers[HEADER_OVERRIDE];
    if (typeof headerOverride === 'string' && headerOverride.length > 0) {
      const fromHeader = await this.resolver.resolveBySlug(headerOverride);
      if (fromHeader) return fromHeader.id;
    }

    const fromHost = await this.resolver.resolveByHost(req.headers.host);
    if (fromHost) return fromHost.id;

    if (this.env.NODE_ENV === 'development' && this.env.TENANT_DEV_FALLBACK_SLUG) {
      const fallback = await this.resolver.resolveBySlug(this.env.TENANT_DEV_FALLBACK_SLUG);
      if (fallback) return fallback.id;
    }
    return undefined;
  }
}
