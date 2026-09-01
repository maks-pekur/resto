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

const envWith = (apex?: string) =>
  ({ ...(apex !== undefined ? { PUBLIC_APEX_DOMAIN: apex } : {}) }) as ConstructorParameters<
    typeof TenantResolverService
  >[1];

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
    service = new TenantResolverService(repo, envWith('resto.app'));
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
    service = new TenantResolverService(repo, envWith('resto.app'));
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
    service = new TenantResolverService(repo, envWith('resto.app'));
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
    repo.findBySlug = vi.fn().mockResolvedValue(tenantFor('cafe-roma'));
    const result = await service.resolveByCustomerHost('cafe-roma.menu.resto.app');
    expect(result?.slug).toBe('cafe-roma');
  });

  it('parses tenant slug from <slug>.<apex> — the restaurant website', async () => {
    repo.findBySlug = vi.fn().mockResolvedValue(tenantFor('cafe-roma'));
    const result = await service.resolveByCustomerHost('cafe-roma.resto.app');
    expect(result?.slug).toBe('cafe-roma');
  });

  it('serves the website host on a single-label dev apex too', async () => {
    service = new TenantResolverService(repo, envWith('localhost'));
    repo.findBySlug = vi.fn().mockResolvedValue(tenantFor('cafe-roma'));
    expect((await service.resolveByCustomerHost('cafe-roma.localhost:3002'))?.slug).toBe(
      'cafe-roma',
    );
  });

  it('returns null when tenant is not publicly servable (custom domain path)', async () => {
    repo.findByDomainHost = vi.fn().mockResolvedValue(tenantFor('cafe-roma', 'suspended'));
    expect(await service.resolveByCustomerHost('order.zburger.com')).toBeNull();
  });

  it('returns null when tenant is not publicly servable (slug path)', async () => {
    repo.findBySlug = vi.fn().mockResolvedValue(tenantFor('cafe-roma', 'archived'));
    expect(await service.resolveByCustomerHost('cafe-roma.menu.resto.app')).toBeNull();
  });

  it('resolves from host with a trailing FQDN dot', async () => {
    repo.findBySlug = vi.fn().mockResolvedValue(tenantFor('cafe-roma'));
    const result = await service.resolveByCustomerHost('cafe-roma.menu.resto.app.');
    expect(result?.slug).toBe('cafe-roma');
  });

  it('returns null when slug is malformed', async () => {
    expect(await service.resolveByCustomerHost('BAD!.menu.resto.app')).toBeNull();
    expect(repo.findBySlug).not.toHaveBeenCalled();
  });

  // The website host is gated on the apex precisely so a stranger's domain cannot resolve just
  // because its first label collides with a tenant slug. findByDomainHost is the only way in.
  it('refuses a foreign domain whose first label happens to match a slug', async () => {
    expect(await service.resolveByCustomerHost('cafe-roma.example.com')).toBeNull();
    expect(await service.resolveByCustomerHost('cafe-roma.com')).toBeNull();
    expect(repo.findBySlug).not.toHaveBeenCalled();
  });

  it('resolves nothing on the guest path without PUBLIC_APEX_DOMAIN, except the menu host', async () => {
    service = new TenantResolverService(repo, envWith(undefined));
    repo.findBySlug = vi.fn().mockResolvedValue(tenantFor('cafe-roma'));
    expect(await service.resolveByCustomerHost('cafe-roma.resto.app')).toBeNull();
    expect((await service.resolveByCustomerHost('cafe-roma.menu.resto.app'))?.slug).toBe(
      'cafe-roma',
    );
  });

  it.each([
    'resto.app',
    'localhost',
    'admin.resto.app',
    'cafe-roma.admin.resto.app',
    'api.resto.app',
    'www.resto.app',
    'menu.resto.app',
    'cafe-roma.api.resto.app',
    'cafe-roma.www.resto.app',
  ])('never resolves a tenant on the operator or infrastructure host %s', async (host) => {
    expect(await service.resolveByCustomerHost(host)).toBeNull();
    expect(repo.findBySlug).not.toHaveBeenCalled();
  });
});

describe('TenantResolverService.resolveByCustomerHost — the dev tunnel fallback', () => {
  const envFor = (nodeEnv: string, slug?: string) =>
    ({
      PUBLIC_APEX_DOMAIN: 'resto.app',
      NODE_ENV: nodeEnv,
      ...(slug === undefined ? {} : { TENANT_DEV_FALLBACK_SLUG: slug }),
    }) as ConstructorParameters<typeof TenantResolverService>[1];

  it('stands in for the missing tenant label on a tunnel host in development', async () => {
    const repo = buildRepo();
    repo.findBySlug = vi.fn().mockResolvedValue(tenantFor('pizza'));
    const service = new TenantResolverService(repo, envFor('development', 'pizza'));

    const result = await service.resolveByCustomerHost('abc123-3003.euw.devtunnels.ms');

    expect(result?.slug).toBe('pizza');
  });

  it('does not stand in outside development', async () => {
    const repo = buildRepo();
    repo.findBySlug = vi.fn().mockResolvedValue(tenantFor('pizza'));
    const service = new TenantResolverService(repo, envFor('production', 'pizza'));

    expect(await service.resolveByCustomerHost('abc123-3003.euw.devtunnels.ms')).toBeNull();
  });

  it('does not stand in when no fallback slug is configured', async () => {
    const repo = buildRepo();
    repo.findBySlug = vi.fn().mockResolvedValue(tenantFor('pizza'));
    const service = new TenantResolverService(repo, envFor('development'));

    expect(await service.resolveByCustomerHost('abc123-3003.euw.devtunnels.ms')).toBeNull();
  });

  it('still prefers a real tenant label when the host carries one', async () => {
    const repo = buildRepo();
    repo.findBySlug = vi.fn((slug: string) =>
      Promise.resolve(slug === 'cafe-roma' ? tenantFor(slug) : null),
    );
    const service = new TenantResolverService(repo, envFor('development', 'pizza'));

    const result = await service.resolveByCustomerHost('cafe-roma.menu.resto.app');

    expect(result?.slug).toBe('cafe-roma');
  });
});
