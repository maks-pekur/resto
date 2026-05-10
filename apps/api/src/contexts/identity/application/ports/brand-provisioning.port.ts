import type { BrandSlug, TenantId } from '@resto/domain';

export const BRAND_PROVISIONING_PORT = Symbol('BRAND_PROVISIONING_PORT');

/**
 * Identity-side view of a brand — only the fields the operator-facing
 * `/v1/me/brands` controller renders. Identity never imports tenancy's
 * `BrandSnapshot` (which carries domain-only fields like `theme` and
 * `status` that identity has no reason to know about).
 */
export interface IdentityBrandView {
  readonly id: string;
  readonly slug: string;
  readonly displayName: string;
}

export interface ProvisionIdentityBrandInput {
  readonly tenantId: TenantId;
  readonly slug: BrandSlug;
  readonly displayName: string;
}

/**
 * Brand read + write port consumed by the identity context. The adapter
 * fans out to tenancy's `BrandQueriesService` and `ProvisionBrandService`
 * and projects results into the `IdentityBrandView`. Postgres unique-
 * violation translation lives in the adapter so the service code never
 * touches DB error shapes.
 */
export interface BrandProvisioningPort {
  listForTenant(
    tenantId: TenantId,
    brandIds?: readonly string[],
  ): Promise<readonly IdentityBrandView[]>;
  provision(input: ProvisionIdentityBrandInput): Promise<IdentityBrandView>;
  /**
   * Cross-tenant slug lookup used by the live availability check
   * (RES-180). Returns the slugs of every active brand whose slug is
   * exactly `prefix` or starts with `prefix-`. Identity passes the
   * result to its suggestion service; the adapter never decides what
   * "available" means.
   */
  findActiveSlugsByPrefix(prefix: string): Promise<readonly string[]>;
}
