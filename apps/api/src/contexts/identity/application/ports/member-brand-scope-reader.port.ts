import type { TenantId } from '@resto/domain';

export interface MemberBrandScopeReader {
  findBrandScopeForMember(input: {
    userId: string;
    tenantId: TenantId;
  }): Promise<readonly string[] | null>;
}

export const MEMBER_BRAND_SCOPE_READER = Symbol('MEMBER_BRAND_SCOPE_READER');
