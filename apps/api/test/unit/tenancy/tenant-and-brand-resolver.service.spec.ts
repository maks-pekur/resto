import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrandId, TenantId } from '@resto/domain';
import { TenantAndBrandResolverService } from '../../../src/contexts/tenancy/application/tenant-and-brand-resolver.service';
import type { BrandRepository } from '../../../src/contexts/tenancy/domain/ports';
import type { BrandSnapshot } from '../../../src/contexts/tenancy/domain/brand.aggregate';

const tenantId = TenantId.parse('11111111-1111-1111-1111-111111111111');
const brandId = BrandId.parse('22222222-2222-2222-2222-222222222222');

const buildBrand = (over: Partial<BrandSnapshot> = {}): BrandSnapshot => ({
  id: brandId,
  tenantId,
  slug: 'z-burger',
  displayName: 'Z Burger',
  status: 'active',
  theme: null,
  ...over,
});

describe('TenantAndBrandResolverService', () => {
  let repo: BrandRepository;
  let service: TenantAndBrandResolverService;

  beforeEach(() => {
    repo = {
      findByDomainHost: vi.fn(),
      findBySlug: vi.fn(),
      findByTenantAndSlug: vi.fn(),
      findById: vi.fn(),
      save: vi.fn(),
    };
    service = new TenantAndBrandResolverService(repo);
  });

  describe('resolveByCustomerHost', () => {
    it('returns null for empty host', async () => {
      expect(await service.resolveByCustomerHost(undefined)).toBeNull();
      expect(await service.resolveByCustomerHost('')).toBeNull();
    });

    it('matches a verified custom domain', async () => {
      const brand = buildBrand({ slug: 'custom' });
      vi.mocked(repo.findByDomainHost).mockResolvedValueOnce(brand);
      const result = await service.resolveByCustomerHost('order.zburger.com');
      expect(result).toEqual({ tenantId, brandId, brandSlug: 'custom' });
    });

    it('parses brand slug from <slug>.menu.<base>', async () => {
      vi.mocked(repo.findByDomainHost).mockResolvedValueOnce(null);
      vi.mocked(repo.findBySlug).mockResolvedValueOnce(buildBrand());
      const result = await service.resolveByCustomerHost('z-burger.menu.resto.app');
      expect(result).toEqual({ tenantId, brandId, brandSlug: 'z-burger' });
    });

    it('returns null when brand is erased', async () => {
      vi.mocked(repo.findByDomainHost).mockResolvedValueOnce(buildBrand({ status: 'erased' }));
      expect(await service.resolveByCustomerHost('order.zburger.com')).toBeNull();
    });

    it('returns null when slug is malformed', async () => {
      vi.mocked(repo.findByDomainHost).mockResolvedValueOnce(null);
      expect(await service.resolveByCustomerHost('BAD!.menu.resto.app')).toBeNull();
      expect(repo.findBySlug).not.toHaveBeenCalled();
    });

    it('returns null when host has no subdomain', async () => {
      vi.mocked(repo.findByDomainHost).mockResolvedValueOnce(null);
      expect(await service.resolveByCustomerHost('resto.app')).toBeNull();
      expect(repo.findBySlug).not.toHaveBeenCalled();
    });
  });

  describe('resolveBrandBySlug', () => {
    it('returns null when slug is malformed', async () => {
      expect(await service.resolveBrandBySlug(tenantId, 'BAD!')).toBeNull();
      expect(repo.findByTenantAndSlug).not.toHaveBeenCalled();
    });

    it('returns the brand when tenant + slug match', async () => {
      vi.mocked(repo.findByTenantAndSlug).mockResolvedValueOnce(buildBrand());
      const result = await service.resolveBrandBySlug(tenantId, 'z-burger');
      expect(result).toEqual({ id: brandId, slug: 'z-burger' });
    });

    it('returns null when brand is erased', async () => {
      vi.mocked(repo.findByTenantAndSlug).mockResolvedValueOnce(buildBrand({ status: 'erased' }));
      expect(await service.resolveBrandBySlug(tenantId, 'z-burger')).toBeNull();
    });
  });
});
