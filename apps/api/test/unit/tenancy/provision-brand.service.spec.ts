import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { BrandId, BrandSlug, TenantId } from '@resto/domain';
import { ProvisionBrandService } from '../../../src/contexts/tenancy/application/provision-brand.service';
import type { BrandRepository } from '../../../src/contexts/tenancy/domain/ports';
import type { BrandSnapshot } from '../../../src/contexts/tenancy/domain/brand.aggregate';

const TENANT_ID = TenantId.parse('11111111-1111-4111-8111-111111111111');
const BRAND_ID = BrandId.parse('22222222-2222-4222-8222-222222222222');

const buildSnapshot = (over: Partial<BrandSnapshot> = {}): BrandSnapshot => ({
  id: BRAND_ID,
  tenantId: TENANT_ID,
  slug: 'cafe-roma',
  displayName: 'Cafe Roma',
  status: 'active',
  theme: null,
  paymentProvider: 'stripe',
  accountType: null,
  defaultCurrency: null,
  stripeAccountId: null,
  stripeChargesEnabled: false,
  stripePayoutsEnabled: false,
  stripeOnboardingStatus: 'not_started',
  stripeRequirementsDue: null,
  ...over,
});

const buildRepo = (): BrandRepository => ({
  findByDomainHost: vi.fn().mockResolvedValue(null),
  findBySlug: vi.fn().mockResolvedValue(null),
  findByTenantAndSlug: vi.fn().mockResolvedValue(null),
  findById: vi.fn().mockResolvedValue(null),
  listForTenant: vi.fn().mockResolvedValue([]),
  save: vi.fn().mockResolvedValue(undefined),
  findActiveSlugsByPrefix: vi.fn().mockResolvedValue([]),
});

describe('ProvisionBrandService', () => {
  it('creates a brand + primary brand_domain on first call', async () => {
    const repo = buildRepo();
    const service = new ProvisionBrandService(repo);

    const result = await service.execute({
      tenantId: TENANT_ID,
      slug: BrandSlug.parse('cafe-roma'),
      displayName: 'Cafe Roma',
    });

    expect(result.slug).toBe('cafe-roma');
    expect(result.tenantId).toBe(TENANT_ID);
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        slug: 'cafe-roma',
        displayName: 'Cafe Roma',
        status: 'active',
      }),
      'cafe-roma.menu.resto.app',
    );
  });

  it('returns existing brand without re-saving when (tenantId, slug) already match', async () => {
    const existing = buildSnapshot();
    const repo = buildRepo();
    vi.mocked(repo.findByTenantAndSlug).mockResolvedValueOnce(existing);
    const service = new ProvisionBrandService(repo);

    const result = await service.execute({
      tenantId: TENANT_ID,
      slug: BrandSlug.parse('cafe-roma'),
      displayName: 'Cafe Roma',
    });

    expect(result).toEqual(existing);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('emits a fresh BrandId for new brands (UUID)', async () => {
    const repo = buildRepo();
    const service = new ProvisionBrandService(repo);

    const result = await service.execute({
      tenantId: TENANT_ID,
      slug: BrandSlug.parse('cafe-roma'),
      displayName: 'Cafe Roma',
    });

    expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('passes <slug>.menu.resto.app as the primary domain hostname', async () => {
    const repo = buildRepo();
    const service = new ProvisionBrandService(repo);

    await service.execute({
      tenantId: TENANT_ID,
      slug: BrandSlug.parse('z-burger'),
      displayName: 'Z Burger',
    });

    expect(repo.save).toHaveBeenCalledWith(expect.anything(), 'z-burger.menu.resto.app');
  });
});
