import type { CountryCodeValue, TenantId, TenantSlug } from '@resto/domain';

export const TENANT_PROVISIONING_PORT = Symbol('TENANT_PROVISIONING_PORT');

/**
 * Identity-side view of a tenant — the fields the signup flow surfaces
 * to its controller. Flat shape (no nested aggregates) so the identity
 * context never imports tenancy domain types.
 */
export interface IdentityTenantView {
  readonly id: TenantId;
  readonly slug: TenantSlug;
  readonly displayName: string;
  readonly status: string;
  readonly primaryDomainHostname: string;
}

export interface ProvisionIdentityTenantInput {
  readonly slug: TenantSlug;
  readonly displayName: string;
  readonly country: CountryCodeValue;
  readonly locale?: string;
  /** D-25/D-30 (10.2 plan 13): signup's only caller-supplied status. */
  readonly status?: 'pending_setup';
}

/**
 * Tenant write port consumed by the identity context. The adapter calls
 * tenancy's `ProvisionTenantService` and translates the returned
 * `TenantSnapshot` into the `IdentityTenantView`.
 *
 * Reads (`findBySlug`) are handled by the pre-existing `TenantLookupPort`
 * which already exposes a slug-lookup with the fields identity needs.
 */
export interface TenantProvisioningPort {
  provision(input: ProvisionIdentityTenantInput): Promise<IdentityTenantView>;
}
