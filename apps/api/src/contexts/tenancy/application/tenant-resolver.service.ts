import { Inject, Injectable } from '@nestjs/common';
import { TenantId, TenantSlug } from '@resto/domain';
import { TENANT_REPOSITORY, type TenantRepository } from '../domain/ports';
import { isPubliclyServable, type TenantSnapshot } from '../domain/tenant.aggregate';

const RESERVED_HOSTS = new Set(['api', 'www']);
const GUEST_HOST_LABEL = 'menu';

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
    if (byDomain) return byDomain;

    const labels = hostname.split('.');
    if (labels.length <= 2) return null;
    const candidate = labels[0];
    if (!candidate || RESERVED_HOSTS.has(candidate)) return null;

    const slug = TenantSlug.safeParse(candidate);
    if (!slug.success) return null;
    return this.repo.findBySlug(slug.data);
  }

  async resolveBySlug(slug: string): Promise<TenantSnapshot | null> {
    const parsed = TenantSlug.safeParse(slug.toLowerCase());
    if (!parsed.success) return null;
    return this.repo.findBySlug(parsed.data);
  }

  /**
   * Look up a tenant by its UUID id (RES-181). Used by the
   * `TenantContextMiddleware` `x-tenant-id` path so the admin can bind
   * ALS from the operator's BA `activeOrganizationId` (a UUID, not a
   * slug).
   */
  async resolveById(rawId: string): Promise<TenantSnapshot | null> {
    const parsed = TenantId.safeParse(rawId);
    if (!parsed.success) return null;
    return this.repo.findById(parsed.data);
  }

  /**
   * Guest-menu host resolution (D-22): only the `.menu.` label reaches a
   * tenant here. The bare `<slug>.resto.app` is reserved for the future
   * public website — `resolveByHost`'s generic subdomain match would
   * accept it too, which is exactly the host this method must NOT serve.
   */
  async resolveByCustomerHost(host: string | undefined): Promise<TenantSnapshot | null> {
    if (!host) return null;
    const hostname = host.split(':')[0]?.toLowerCase().replace(/\.$/, '');
    if (!hostname) return null;

    const byDomain = await this.repo.findByDomainHost(hostname);
    if (byDomain && isPubliclyServable(byDomain.status)) return byDomain;

    const labels = hostname.split('.');
    if (labels.length < 3 || labels[1] !== GUEST_HOST_LABEL) return null;
    const candidate = labels[0];
    if (!candidate) return null;

    const slug = TenantSlug.safeParse(candidate);
    if (!slug.success) return null;

    const bySlug = await this.repo.findBySlug(slug.data);
    if (!bySlug || !isPubliclyServable(bySlug.status)) return null;
    return bySlug;
  }
}
