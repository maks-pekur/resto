import { Inject, Injectable } from '@nestjs/common';
import { runInTenantContext } from '@resto/db';
import type { TenantId } from '@resto/domain';
import {
  MEMBER_BRAND_SCOPE_READER,
  type MemberBrandScopeReader,
} from './ports/member-brand-scope-reader.port';
import { BRAND_REPOSITORY, type BrandRepository } from '../../tenancy/domain/ports';
import type { BrandSnapshot } from '../../tenancy/domain/brand.aggregate';

export interface ListMyBrandsInput {
  readonly userId: string;
  readonly tenantId: TenantId;
}

export interface ListMyBrandsResult {
  readonly brands: readonly BrandSnapshot[];
  readonly canViewAllBrands: boolean;
}

@Injectable()
export class ListMyBrandsService {
  constructor(
    @Inject(MEMBER_BRAND_SCOPE_READER) private readonly scope: MemberBrandScopeReader,
    @Inject(BRAND_REPOSITORY) private readonly brands: BrandRepository,
  ) {}

  async execute(input: ListMyBrandsInput): Promise<ListMyBrandsResult> {
    return runInTenantContext({ tenantId: input.tenantId }, async () => {
      const scopeRows = await this.scope.findBrandScopeForMember({
        userId: input.userId,
        tenantId: input.tenantId,
      });
      const canViewAllBrands = scopeRows === null;
      const brands = await this.brands.listForTenant(
        input.tenantId,
        scopeRows === null ? undefined : scopeRows,
      );
      return { brands, canViewAllBrands };
    });
  }
}
