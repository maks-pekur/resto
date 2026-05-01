import { Inject, Injectable } from '@nestjs/common';
import { TenantSlug } from '@resto/domain';
import type { TenantSnapshot } from '../domain/tenant.aggregate';
import { TENANT_REPOSITORY, type TenantRepository } from '../domain/ports';

const RESERVED_HOSTS = new Set(['api', 'www']);

/**
 * Maps an inbound HTTP request to a tenant id.
 *
 * Resolution order:
 * 1. Full host match against `tenant_domains.domain` — covers verified
 *    custom domains and the auto subdomain.
 * 2. Subdomain extraction from `<slug>.<rest>` and lookup by slug.
 *
 * Returns `null` when no tenant resolves; callers decide whether the
 * route requires a tenant context or not.
 */
@Injectable()
export class TenantResolverService {
  constructor(@Inject(TENANT_REPOSITORY) private readonly repo: TenantRepository) {}

  async resolveByHost(host: string | undefined): Promise<TenantSnapshot | null> {
    if (!host) return null;
    const hostname = host.split(':')[0]?.toLowerCase();
    if (!hostname) return null;

    const byDomain = await this.repo.findByDomainHost(hostname);
    if (byDomain) return byDomain.toSnapshot();

    const labels = hostname.split('.');
    if (labels.length <= 2) return null;
    const candidate = labels[0];
    if (!candidate || RESERVED_HOSTS.has(candidate)) return null;

    const slug = TenantSlug.safeParse(candidate);
    if (!slug.success) return null;
    const bySlug = await this.repo.findBySlug(slug.data);
    return bySlug?.toSnapshot() ?? null;
  }

  async resolveBySlug(slug: string): Promise<TenantSnapshot | null> {
    const parsed = TenantSlug.safeParse(slug.toLowerCase());
    if (!parsed.success) return null;
    const tenant = await this.repo.findBySlug(parsed.data);
    return tenant?.toSnapshot() ?? null;
  }
}
