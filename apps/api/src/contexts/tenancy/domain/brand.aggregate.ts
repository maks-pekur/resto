import type { BrandId, TenantId } from '@resto/domain';

export interface BrandSnapshot {
  readonly id: BrandId;
  readonly tenantId: TenantId;
  readonly slug: string;
  readonly displayName: string;
  readonly status: 'active' | 'suspended' | 'archived' | 'erased';
}
