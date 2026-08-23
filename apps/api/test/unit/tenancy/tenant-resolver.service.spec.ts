import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CountryCodeValue, TenantSlug } from '@resto/domain';
import { TenantResolverService } from '../../../src/contexts/tenancy/application/tenant-resolver.service';
import type { TenantRepository } from '../../../src/contexts/tenancy/domain/ports';
import { Tenant, type TenantStatus } from '../../../src/contexts/tenancy/domain/tenant.aggregate';

const buildRepo = (): TenantRepository => ({
  findById: vi.fn(),
  findBySlug: vi.fn().mockResolvedValue(null),
  findByDomainHost: vi.fn().mockResolvedValue(null),
  findByStripeAccountId: vi.fn().mockResolvedValue(null),
  save: vi.fn(),
  listDomains: vi.fn(),
  eraseTenant: vi.fn(),
  listScheduledForErasure: vi.fn().mockResolvedValue([]),
  findCurrentTenant: vi.fn(),
  listCurrentTenantDomains: vi.fn().mockResolvedValue([]),
});

const tenantFor = (slug: string, status: TenantStatus = 'active') => {
  const tenant = Tenant.provision({
    slug: TenantSlug.parse(slug),
    displayName: 'Cafe',
    country: CountryCodeValue.parse('GB'),
    primaryDomainHostname: `${slug}.menu.resto.app`,
  });
  const snapshot = tenant.toSnapshot();
  return status === 'active' ? snapshot : { ...snapshot, status };
};

describe('TenantResolverService.resolveByHost', () => {
  let repo: TenantRepository;
  let service: TenantResolverService;

  beforeEach(() => {
    repo = buildRepo();
    service = new TenantResolverService(repo);
  });

  it('returns the tenant when a verified custom domain matches', async () => {
    const tenant = tenantFor('cafe-roma');
    repo.findByDomainHost = vi.fn().mockResolvedValue(tenant);

    const result = await service.resolveByHost('shop.example.com');
    expect(result?.slug).toBe('cafe-roma');
    expect(repo.findBySlug).not.toHaveBeenCalled();
  });

  it('falls back to subdomain → slug when no domain row matches', async () => {
    const tenant = tenantFor('cafe-roma');
    repo.findByDomainHost = vi.fn().mockResolvedValue(null);
    repo.findBySlug = vi.fn().mockResolvedValue(tenant);

    const result = await service.resolveByHost('cafe-roma.menu.resto.app');
    expect(result?.slug).toBe('cafe-roma');
    expect(repo.findBySlug).toHaveBeenCalledWith('cafe-roma');
  });

  it('returns null on the api root domain (no tenant subdomain)', async () => {
    const result = await service.resolveByHost('api.resto.app');
    expect(result).toBeNull();
    expect(repo.findBySlug).not.toHaveBeenCalled();
  });

  it('returns null when the leftmost label is reserved (api / www)', async () => {
    const result = await service.resolveByHost('www.menu.resto.app');
    expect(result).toBeNull();
  });

  it('returns null when host is undefined', async () => {
    const result = await service.resolveByHost(undefined);
    expect(result).toBeNull();
  });

  it('returns null on a malformed slug rather than throwing', async () => {
    const result = await service.resolveByHost('NotAValidSlug.menu.resto.app');
    expect(result).toBeNull();
  });
});

describe('TenantResolverService.resolveBySlug', () => {
  let repo: TenantRepository;
  let service: TenantResolverService;

  beforeEach(() => {
    repo = buildRepo();
    service = new TenantResolverService(repo);
  });

  it('lowercases the slug before lookup', async () => {
    const tenant = tenantFor('cafe-roma');
    repo.findBySlug = vi.fn().mockResolvedValue(tenant);
    const result = await service.resolveBySlug('Cafe-Roma');
    expect(result?.slug).toBe('cafe-roma');
  });

  it('returns null on a malformed slug', async () => {
    const result = await service.resolveBySlug('Reserved $lug');
    expect(result).toBeNull();
  });
});

describe('TenantResolverService.resolveByCustomerHost', () => {
  let repo: TenantRepository;
  let service: TenantResolverService;

  beforeEach(() => {
    repo = buildRepo();
    service = new TenantResolverService(repo);
  });

  it('returns null for empty host', async () => {
    expect(await service.resolveByCustomerHost(undefined)).toBeNull();
    expect(await service.resolveByCustomerHost('')).toBeNull();
  });

  it('matches a verified custom domain', async () => {
    repo.findByDomainHost = vi.fn().mockResolvedValue(tenantFor('cafe-roma'));
    const result = await service.resolveByCustomerHost('order.zburger.com');
    expect(result?.slug).toBe('cafe-roma');
  });

  it('parses tenant slug from <slug>.menu.<base>', async () => {
    repo.findByDomainHost = vi.fn().mockResolvedValue(null);
    repo.findBySlug = vi.fn().mockResolvedValue(tenantFor('cafe-roma'));
    const result = await service.resolveByCustomerHost('cafe-roma.menu.resto.app');
    expect(result?.slug).toBe('cafe-roma');
  });

  it('returns null when tenant is not publicly servable (custom domain path)', async () => {
    repo.findByDomainHost = vi.fn().mockResolvedValue(tenantFor('cafe-roma', 'suspended'));
    expect(await service.resolveByCustomerHost('order.zburger.com')).toBeNull();
  });

  it('returns null when tenant is not publicly servable (slug path)', async () => {
    repo.findByDomainHost = vi.fn().mockResolvedValue(null);
    repo.findBySlug = vi.fn().mockResolvedValue(tenantFor('cafe-roma', 'archived'));
    expect(await service.resolveByCustomerHost('cafe-roma.menu.resto.app')).toBeNull();
  });

  it('resolves from host with a trailing FQDN dot', async () => {
    repo.findByDomainHost = vi.fn().mockResolvedValue(null);
    repo.findBySlug = vi.fn().mockResolvedValue(tenantFor('cafe-roma'));
    const result = await service.resolveByCustomerHost('cafe-roma.menu.resto.app.');
    expect(result?.slug).toBe('cafe-roma');
  });

  it('returns null when slug is malformed', async () => {
    repo.findByDomainHost = vi.fn().mockResolvedValue(null);
    expect(await service.resolveByCustomerHost('BAD!.menu.resto.app')).toBeNull();
    expect(repo.findBySlug).not.toHaveBeenCalled();
  });

  it('D-22: rejects the bare <slug>.resto.app host reserved for the public website', async () => {
    repo.findByDomainHost = vi.fn().mockResolvedValue(null);
    const result = await service.resolveByCustomerHost('cafe-roma.resto.app');
    expect(result).toBeNull();
    expect(repo.findBySlug).not.toHaveBeenCalled();
  });

  it('returns null when host has no subdomain', async () => {
    repo.findByDomainHost = vi.fn().mockResolvedValue(null);
    expect(await service.resolveByCustomerHost('resto.app')).toBeNull();
    expect(repo.findBySlug).not.toHaveBeenCalled();
  });
});
