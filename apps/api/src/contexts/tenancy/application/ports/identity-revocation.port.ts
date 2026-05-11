import type { TenantId } from '@resto/domain';

export const IDENTITY_REVOCATION_PORT = Symbol('IDENTITY_REVOCATION_PORT');

export interface IdentityRevocationPort {
  revokeAllSessionsForTenant(tenantId: TenantId): Promise<{ revokedSessionsCount: number }>;
}
