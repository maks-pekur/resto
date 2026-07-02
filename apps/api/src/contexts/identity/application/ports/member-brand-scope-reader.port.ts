import type { TenantId } from '@resto/domain';

export interface MemberBrandScopeReader {
  /**
   * Returns the brand_id set the operator is explicitly scoped to.
   * `null` means the member has no scope rows (fact). The allow/deny decision
   * is the caller's, role-aware: owners treat null as all-brands; non-owners
   * treat null as no-access (D-08 default-deny). A non-null array (always
   * non-empty) is the explicit allow-list.
   *
   * Implementations MUST run inside the request's tenant context so RLS
   * scopes the read to the active tenant.
   */
  findBrandScopeForMember(input: {
    userId: string;
    tenantId: TenantId;
  }): Promise<readonly string[] | null>;
}

export const MEMBER_BRAND_SCOPE_READER = Symbol('MEMBER_BRAND_SCOPE_READER');
