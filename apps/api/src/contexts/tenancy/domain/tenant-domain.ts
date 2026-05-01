/**
 * A domain mapped to a tenant — either the auto-assigned subdomain
 * (`<slug>.menu.resto.app`) created on provisioning, or a verified
 * custom domain attached later.
 *
 * Pure value/entity — persistence concerns live in the repository.
 */
export type TenantDomainKind = 'subdomain' | 'custom';

export interface TenantDomain {
  readonly id: string;
  readonly tenantId: string;
  readonly domain: string;
  readonly kind: TenantDomainKind;
  readonly isPrimary: boolean;
  readonly verifiedAt: Date | null;
  readonly createdAt: Date;
}
