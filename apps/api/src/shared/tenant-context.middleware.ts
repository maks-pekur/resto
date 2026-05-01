import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import { runInTenantContext, schema, TenantAwareDb } from '@resto/db';
import { eq } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ENV_TOKEN } from '../config/config.module';
import type { Env } from '../config/env.schema';

const HEADER_OVERRIDE = 'x-tenant-slug';

/**
 * Resolve the tenant for an inbound request and bind it to
 * `AsyncLocalStorage` so the tenant-aware DB client picks it up without
 * any per-call wiring.
 *
 * Resolution order (first match wins):
 * 1. `X-Tenant-Slug` header — operator/dev override.
 * 2. Subdomain of the request host (`<slug>.api.resto.app` → `slug`).
 * 3. `TENANT_DEV_FALLBACK_SLUG` if `NODE_ENV=development`.
 *
 * Health endpoints are intentionally tenant-less and run before this
 * middleware (route exclusion in `app.module.ts`). When no tenant is
 * resolved, the request continues without a context — bounded contexts
 * that need a tenant call `requireTenantContext()` and 4xx accordingly.
 *
 * The lookup uses a `withoutTenant` read because the request has no
 * tenant context yet (chicken-and-egg). A future iteration will wrap
 * this in an LRU cache; for the skeleton, every request hits the DB.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(
    @Inject(ENV_TOKEN) private readonly env: Env,
    private readonly db: TenantAwareDb,
  ) {}

  async use(
    req: FastifyRequest['raw'],
    _res: FastifyReply['raw'],
    next: () => void,
  ): Promise<void> {
    const slug = this.resolveSlug(req);
    if (!slug) {
      next();
      return;
    }

    const tenantId = await this.lookupTenantId(slug);
    if (!tenantId) {
      next();
      return;
    }

    await runInTenantContext({ tenantId }, () => {
      next();
      return Promise.resolve();
    });
  }

  private resolveSlug(req: FastifyRequest['raw']): string | undefined {
    const headerOverride = req.headers[HEADER_OVERRIDE];
    if (typeof headerOverride === 'string' && headerOverride.length > 0) {
      return headerOverride.toLowerCase();
    }

    const host = req.headers.host;
    if (typeof host === 'string') {
      const [hostname] = host.split(':');
      if (hostname) {
        const parts = hostname.split('.');
        // <slug>.<rest...> — only consume the leftmost label as a tenant
        // slug if there is at least one further label (so `api.resto.app`
        // root requests do not get treated as the tenant `api`).
        if (parts.length > 2) {
          const candidate = parts[0];
          if (candidate && candidate !== 'api' && candidate !== 'www') {
            return candidate.toLowerCase();
          }
        }
      }
    }

    if (this.env.NODE_ENV === 'development' && this.env.TENANT_DEV_FALLBACK_SLUG) {
      return this.env.TENANT_DEV_FALLBACK_SLUG;
    }
    return undefined;
  }

  private async lookupTenantId(slug: string): Promise<string | undefined> {
    return this.db.withoutTenant('tenant resolver lookup', async (tx) => {
      const rows = await tx
        .select({ id: schema.tenants.id })
        .from(schema.tenants)
        .where(eq(schema.tenants.slug, slug))
        .limit(1);
      return rows[0]?.id;
    });
  }
}
