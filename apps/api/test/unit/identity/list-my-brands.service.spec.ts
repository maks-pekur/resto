import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { BrandId, TenantId } from '@resto/domain';
import { ListMyBrandsService } from '../../../src/contexts/identity/application/list-my-brands.service';
import type {
  BrandProvisioningPort,
  IdentityBrandView,
} from '../../../src/contexts/identity/application/ports/brand-provisioning.port';
import type { MemberBrandScopeReader } from '../../../src/contexts/identity/application/ports/member-brand-scope-reader.port';

const TENANT_ID = TenantId.parse('11111111-1111-4111-8111-111111111111');
const BRAND_A = BrandId.parse('22222222-2222-4222-8222-22222222222a');
const BRAND_B = BrandId.parse('22222222-2222-4222-8222-22222222222b');

const buildBrand = (over: Partial<IdentityBrandView>): IdentityBrandView => ({
  id: BRAND_A,
  slug: 'brand-a',
  displayName: 'Brand A',
  ...over,
});

const buildScopeReader = (rows: readonly string[] | null): MemberBrandScopeReader => ({
  findBrandScopeForMember: vi.fn().mockResolvedValue(rows),
});

const buildBrands = (rows: readonly IdentityBrandView[]): BrandProvisioningPort => ({
  listForTenant: vi.fn().mockResolvedValue(rows),
  provision: vi.fn(),
  findActiveSlugsByPrefix: vi.fn().mockResolvedValue([]),
});

describe('ListMyBrandsService', () => {
  it('returns all tenant brands and canViewAllBrands=true when scope is empty (null)', async () => {
    const reader = buildScopeReader(null);
    const brands = buildBrands([
      buildBrand({ id: BRAND_A }),
      buildBrand({ id: BRAND_B, slug: 'brand-b', displayName: 'Brand B' }),
    ]);
    const service = new ListMyBrandsService(reader, brands);

    const result = await service.execute({ userId: 'user-1', tenantId: TENANT_ID });

    expect(result.canViewAllBrands).toBe(true);
    expect(result.brands).toHaveLength(2);
    expect(brands.listForTenant).toHaveBeenCalledWith(TENANT_ID, undefined);
  });

  it('returns the scoped subset when the member has explicit scope rows', async () => {
    const reader = buildScopeReader([BRAND_A]);
    const brands = buildBrands([buildBrand({ id: BRAND_A })]);
    const service = new ListMyBrandsService(reader, brands);

    const result = await service.execute({ userId: 'user-1', tenantId: TENANT_ID });

    expect(result.brands).toHaveLength(1);
    expect(result.brands[0]?.id).toBe(BRAND_A);
    expect(brands.listForTenant).toHaveBeenCalledWith(TENANT_ID, [BRAND_A]);
  });

  it('canViewAllBrands is false when scope is explicit, even if the result has multiple brands', async () => {
    const reader = buildScopeReader([BRAND_A, BRAND_B]);
    const brands = buildBrands([buildBrand({ id: BRAND_A }), buildBrand({ id: BRAND_B })]);
    const service = new ListMyBrandsService(reader, brands);

    const result = await service.execute({ userId: 'user-1', tenantId: TENANT_ID });

    expect(result.canViewAllBrands).toBe(false);
  });
});
