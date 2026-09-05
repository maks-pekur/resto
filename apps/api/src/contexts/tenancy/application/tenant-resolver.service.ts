import { Inject, Injectable } from '@nestjs/common';
import { RESERVED_SLUG_SET, TenantId, TenantSlug } from '@resto/domain';
import { ENV_TOKEN } from '../../../config/config.module';
import type { Env } from '../../../config/env.schema';
import { TENANT_REPOSITORY, type TenantRepository } from '../domain/ports';
import { isPubliclyServable, type TenantSnapshot } from '../domain/tenant.aggregate';

const RESERVED_HOSTS = new Set(['api', 'www']);

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
   * Guest host resolution. Two shapes reach a tenant: `<slug>.<GUEST_APEX_DOMAIN>` (the QR menu,
   * D-22) and `<slug>.<PUBLIC_APEX_DOMAIN>` (the restaurant's own public site) — each its own
   * apex/zone (07.5-07: free Universal SSL covers an apex and its first-level subdomains only).
   * `resolveByHost`'s generic subdomain match still accepts more than this does, which is why the
   * guest controllers call this one.
   */
  // A tunnel host (VS Code port forwarding, cloudflared) carries no tenant label, so a phone
  // reaching dev through one has no way to name a tenant. The env schema rejects the fallback
  // outside development.
  private devFallbackSlug(): string | null {
    if (this.env.NODE_ENV !== 'development') return null;
    return this.env.TENANT_DEV_FALLBACK_SLUG ?? null;
  }

  async resolveByCustomerHost(host: string | undefined): Promise<TenantSnapshot | null> {
    if (!host) return null;
    const hostname = host.split(':')[0]?.toLowerCase().replace(/\.$/, '');
    if (!hostname) return null;

    const byDomain = await this.repo.findByDomainHost(hostname);
    if (byDomain && isPubliclyServable(byDomain.status)) return byDomain;

    const candidate = this.guestSlugLabel(hostname.split('.')) ?? this.devFallbackSlug();
    if (!candidate) return null;

    const slug = TenantSlug.safeParse(candidate);
    if (!slug.success) return null;

    const bySlug = await this.repo.findBySlug(slug.data);
    if (!bySlug || !isPubliclyServable(bySlug.status)) return null;
    return bySlug;
  }

  /**
   * The slug label of a guest host, or null when the host is not one. Both qualifying shapes are
   * `<slug>.<rest>`, distinguished only by which configured apex `<rest>` equals: GUEST_APEX_DOMAIN
   * (QR menu) or PUBLIC_APEX_DOMAIN (the restaurant's own site). Neither an unregistered custom
   * domain nor a host on some other apex can resolve this way — `findByDomainHost` above is the
   * only way a custom domain serves.
   */
  private guestSlugLabel(labels: readonly string[]): string | null {
    const first = labels[0];
    if (!first || RESERVED_SLUG_SET.has(first)) return null;

    const second = labels[1];
    if (!second || NON_GUEST_SECOND_LABELS.has(second)) return null;

    const remainder = labels.slice(1).join('.');
    const guestApex = this.env.GUEST_APEX_DOMAIN;
    if (guestApex && remainder === guestApex) return first;

    const publicApex = this.env.PUBLIC_APEX_DOMAIN;
    if (publicApex && remainder === publicApex) return first;

    return null;
  }
}
