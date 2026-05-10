import { Inject, Injectable } from '@nestjs/common';
import type { TenantId } from '@resto/domain';
import {
  MEMBER_BRAND_SCOPE_READER,
  type MemberBrandScopeReader,
} from './ports/member-brand-scope-reader.port';
import {
  BRAND_PROVISIONING_PORT,
  type BrandProvisioningPort,
  type IdentityBrandView,
} from './ports/brand-provisioning.port';

export interface ListMyBrandsInput {
  readonly userId: string;
  readonly tenantId: TenantId;
}

export interface ListMyBrandsResult {
  readonly brands: readonly IdentityBrandView[];
  readonly canViewAllBrands: boolean;
}

@Injectable()
export class ListMyBrandsService {
  constructor(
    @Inject(MEMBER_BRAND_SCOPE_READER) private readonly scope: MemberBrandScopeReader,
    @Inject(BRAND_PROVISIONING_PORT) private readonly brands: BrandProvisioningPort,
  ) {}

  async execute(input: ListMyBrandsInput): Promise<ListMyBrandsResult> {
    const scopeRows = await this.scope.findBrandScopeForMember({
      userId: input.userId,
      tenantId: input.tenantId,
    });
    const canViewAllBrands = scopeRows === null;
    const brands = await this.brands.listForTenant(input.tenantId, scopeRows ?? undefined);
    return { brands, canViewAllBrands };
  }
}
