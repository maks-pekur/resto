import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { BrandId, TenantId } from '@resto/domain';
import { ListMyBrandsService } from '../../../src/contexts/identity/application/list-my-brands.service';
import type { BrandRepository } from '../../../src/contexts/tenancy/domain/ports';
import type { BrandSnapshot } from '../../../src/contexts/tenancy/domain/brand.aggregate';
import type { MemberBrandScopeReader } from '../../../src/contexts/identity/application/ports/member-brand-scope-reader.port';

const TENANT_ID = TenantId.parse('11111111-1111-4111-8111-111111111111');
const BRAND_A = BrandId.parse('22222222-2222-4222-8222-22222222222a');
const BRAND_B = BrandId.parse('22222222-2222-4222-8222-22222222222b');

const buildBrand = (over: Partial<BrandSnapshot>): BrandSnapshot => ({
  id: BRAND_A,
  tenantId: TENANT_ID,
  slug: 'brand-a',
  displayName: 'Brand A',
  status: 'active',
  theme: null,
  ...over,
});

const buildScopeReader = (rows: readonly string[] | null): MemberBrandScopeReader => ({
  findBrandScopeForMember: vi.fn().mockResolvedValue(rows),
});

const buildBrandsRepo = (rows: readonly BrandSnapshot[]): BrandRepository => ({
  findByDomainHost: vi.fn(),
  findBySlug: vi.fn(),
  findByTenantAndSlug: vi.fn(),
  findById: vi.fn(),
  listForTenant: vi.fn().mockResolvedValue(rows),
  save: vi.fn(),
});

describe('ListMyBrandsService', () => {
  it('returns all tenant brands and canViewAllBrands=true when scope is empty (null)', async () => {
    const reader = buildScopeReader(null);
    const repo = buildBrandsRepo([
      buildBrand({ id: BRAND_A }),
      buildBrand({ id: BRAND_B, slug: 'brand-b', displayName: 'Brand B' }),
    ]);
    const service = new ListMyBrandsService(reader, repo);

    const result = await service.execute({ userId: 'user-1', tenantId: TENANT_ID });

    expect(result.canViewAllBrands).toBe(true);
    expect(result.brands).toHaveLength(2);
    expect(repo.listForTenant).toHaveBeenCalledWith(TENANT_ID, undefined);
  });

  it('returns the scoped subset when the member has explicit scope rows', async () => {
    const reader = buildScopeReader([BRAND_A]);
    const repo = buildBrandsRepo([buildBrand({ id: BRAND_A })]);
    const service = new ListMyBrandsService(reader, repo);

    const result = await service.execute({ userId: 'user-1', tenantId: TENANT_ID });

    expect(result.brands).toHaveLength(1);
    expect(result.brands[0]?.id).toBe(BRAND_A);
    expect(repo.listForTenant).toHaveBeenCalledWith(TENANT_ID, [BRAND_A]);
  });

  it('canViewAllBrands is false when scope is explicit, even if the result has multiple brands', async () => {
    const reader = buildScopeReader([BRAND_A, BRAND_B]);
    const repo = buildBrandsRepo([buildBrand({ id: BRAND_A }), buildBrand({ id: BRAND_B })]);
    const service = new ListMyBrandsService(reader, repo);

    const result = await service.execute({ userId: 'user-1', tenantId: TENANT_ID });

    expect(result.canViewAllBrands).toBe(false);
  });
});
