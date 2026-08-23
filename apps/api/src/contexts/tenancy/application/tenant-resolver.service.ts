import { Inject, Injectable } from '@nestjs/common';
import { RESERVED_SLUG_SET, TenantId, TenantSlug } from '@resto/domain';
import { ENV_TOKEN } from '../../../config/config.module';
import type { Env } from '../../../config/env.schema';
import { TENANT_REPOSITORY, type TenantRepository } from '../domain/ports';
import { isPubliclyServable, type TenantSnapshot } from '../domain/tenant.aggregate';

const RESERVED_HOSTS = new Set(['api', 'www']);
const GUEST_HOST_LABEL = 'menu';

// Labels that mark an operator or infrastructure host. `<slug>.admin.<domain>` is the operator
// dashboard and must never resolve on the guest path, whatever the first label says.
const NON_GUEST_SECOND_LABELS = new Set(['admin', 'api', 'www']);

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
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly repo: TenantRepository,
    @Inject(ENV_TOKEN) private readonly env: Env,
  ) {}

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
   * Guest host resolution. Two shapes reach a tenant: `<slug>.menu.<domain>` (the QR menu, D-22)
   * and `<slug>.<apex>` (the restaurant's own public site). The website host was reserved-but-
   * unreachable until PUBLIC_APEX_DOMAIN existed to gate it; `resolveByHost`'s generic subdomain
   * match still accepts more than this does, which is why the guest controllers call this one.
   */
  async resolveByCustomerHost(host: string | undefined): Promise<TenantSnapshot | null> {
    if (!host) return null;
    const hostname = host.split(':')[0]?.toLowerCase().replace(/\.$/, '');
    if (!hostname) return null;

    const byDomain = await this.repo.findByDomainHost(hostname);
    if (byDomain && isPubliclyServable(byDomain.status)) return byDomain;

    const candidate = this.guestSlugLabel(hostname.split('.'));
    if (!candidate) return null;

    const slug = TenantSlug.safeParse(candidate);
    if (!slug.success) return null;

    const bySlug = await this.repo.findBySlug(slug.data);
    if (!bySlug || !isPubliclyServable(bySlug.status)) return null;
    return bySlug;
  }

  /**
   * The slug label of a guest host, or null when the host is not one. Two shapes qualify:
   * `<slug>.menu.<rest>` (QR menu) and `<slug>.<apex>` (the restaurant's own site). The second is
   * gated on PUBLIC_APEX_DOMAIN so an unregistered custom domain whose first label happens to match
   * a tenant slug cannot resolve — `findByDomainHost` above is the only way a custom domain serves.
   */
  private guestSlugLabel(labels: readonly string[]): string | null {
    const first = labels[0];
    if (!first || RESERVED_SLUG_SET.has(first)) return null;

    const second = labels[1];
    if (second === GUEST_HOST_LABEL) return labels.length >= 3 ? first : null;
    if (!second || NON_GUEST_SECOND_LABELS.has(second)) return null;

    const apex = this.env.PUBLIC_APEX_DOMAIN;
    if (!apex) return null;
    return labels.slice(1).join('.') === apex ? first : null;
  }
}
