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

export interface FinalizeIdentityTenantSetupInput {
  readonly tenantId: TenantId;
  readonly displayName: string;
  readonly slug: TenantSlug;
}

/**
 * Tenant write port consumed by the identity context. The adapter calls
 * tenancy's `ProvisionTenantService` / `FinalizeTenantOnboardingService`
 * and translates their returned `TenantSnapshot` into `IdentityTenantView`.
 *
 * Reads (`findBySlug`) are handled by the pre-existing `TenantLookupPort`
 * which already exposes a slug-lookup with the fields identity needs;
 * `findById` lives here because it needs `status`, which `TenantLookupPort`
 * deliberately omits (`TenantSummary` predates D-25's pending_setup status).
 */
export interface TenantProvisioningPort {
  provision(input: ProvisionIdentityTenantInput): Promise<IdentityTenantView>;
  findById(id: string): Promise<IdentityTenantView | null>;
  finalizeSetup(input: FinalizeIdentityTenantSetupInput): Promise<IdentityTenantView>;
}
