import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Currency, TenantSlug } from '@resto/domain';
import { TenantResolverService } from '../../../src/contexts/tenancy/application/tenant-resolver.service';
import type { TenantRepository } from '../../../src/contexts/tenancy/domain/ports';
import { Tenant } from '../../../src/contexts/tenancy/domain/tenant.aggregate';

const buildRepo = (): TenantRepository => ({
  findById: vi.fn(),
  findBySlug: vi.fn().mockResolvedValue(null),
  findByDomainHost: vi.fn().mockResolvedValue(null),
  save: vi.fn(),
  listDomains: vi.fn(),
});

const tenantFor = (slug: string): Tenant =>
  Tenant.provision({
    slug: TenantSlug.parse(slug),
    displayName: 'Cafe',
    defaultCurrency: Currency.parse('USD'),
    primaryDomainHostname: `${slug}.menu.resto.app`,
  });

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
