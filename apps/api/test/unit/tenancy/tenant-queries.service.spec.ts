import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Currency, TenantSlug } from '@resto/domain';
import { TenantQueriesService } from '../../../src/contexts/tenancy/application/tenant-queries.service';
import { TenantNotFoundError } from '../../../src/contexts/tenancy/domain/errors';
import type { TenantRepository } from '../../../src/contexts/tenancy/domain/ports';
import { Tenant } from '../../../src/contexts/tenancy/domain/tenant.aggregate';

const buildRepo = (): TenantRepository => ({
  findById: vi.fn(),
  findBySlug: vi.fn(),
  findByDomainHost: vi.fn(),
  save: vi.fn(),
  listDomains: vi.fn().mockResolvedValue([]),
  eraseTenant: vi.fn(),
  listScheduledForErasure: vi.fn().mockResolvedValue([]),
  findByStripeAccountId: vi.fn(),
  findCurrentTenant: vi.fn(),
  listCurrentTenantDomains: vi.fn().mockResolvedValue([]),
});

const tenantFor = (slug: string): Tenant =>
  Tenant.provision({
    slug: TenantSlug.parse(slug),
    displayName: 'Cafe',
    defaultCurrency: Currency.parse('USD'),
    primaryDomainHostname: `${slug}.menu.resto.app`,
  });

describe('TenantQueriesService.getBySlug', () => {
  let repo: TenantRepository;
  let service: TenantQueriesService;

  beforeEach(() => {
    repo = buildRepo();
    service = new TenantQueriesService(repo);
  });

  it('returns the snapshot when the slug exists', async () => {
    repo.findBySlug = vi.fn().mockResolvedValue(tenantFor('cafe-roma'));
    const snapshot = await service.getBySlug('cafe-roma');
    expect(snapshot.slug).toBe('cafe-roma');
  });

  it('throws TenantNotFoundError when the slug is unknown', async () => {
    repo.findBySlug = vi.fn().mockResolvedValue(null);
    await expect(service.getBySlug('cafe-roma')).rejects.toBeInstanceOf(TenantNotFoundError);
  });
});

describe('TenantQueriesService.findBySlug', () => {
  let repo: TenantRepository;
  let service: TenantQueriesService;

  beforeEach(() => {
    repo = buildRepo();
    service = new TenantQueriesService(repo);
  });

  it('returns the snapshot when the slug exists', async () => {
    repo.findBySlug = vi.fn().mockResolvedValue(tenantFor('cafe-roma'));
    const snapshot = await service.findBySlug('cafe-roma');
    expect(snapshot?.slug).toBe('cafe-roma');
  });

  it('returns null when the slug is unknown (does not throw)', async () => {
    repo.findBySlug = vi.fn().mockResolvedValue(null);
    await expect(service.findBySlug('cafe-roma')).resolves.toBeNull();
  });
});

describe('TenantQueriesService.getCurrentTenant', () => {
  let repo: TenantRepository;
  let service: TenantQueriesService;

  beforeEach(() => {
    repo = buildRepo();
    service = new TenantQueriesService(repo);
  });

  it('returns the snapshot read via repo.findCurrentTenant', async () => {
    const tenant = tenantFor('cafe-current');
    repo.findCurrentTenant = vi.fn().mockResolvedValue(tenant);
    const snap = await service.getCurrentTenant();
    expect(snap.slug).toBe('cafe-current');
    expect(repo.findCurrentTenant).toHaveBeenCalledTimes(1);
    expect(repo.findById).not.toHaveBeenCalled();
  });

  it('throws TenantNotFoundError when repo.findCurrentTenant returns null', async () => {
    repo.findCurrentTenant = vi.fn().mockResolvedValue(null);
    await expect(service.getCurrentTenant()).rejects.toBeInstanceOf(TenantNotFoundError);
  });
});

describe('TenantQueriesService.listCurrentTenantDomains', () => {
  let repo: TenantRepository;
  let service: TenantQueriesService;

  beforeEach(() => {
    repo = buildRepo();
    service = new TenantQueriesService(repo);
  });

  it('returns the domains read via repo.listCurrentTenantDomains', async () => {
    const tenant = tenantFor('cafe-current-doms');
    repo.listCurrentTenantDomains = vi.fn().mockResolvedValue([tenant.toSnapshot().primaryDomain]);
    const domains = await service.listCurrentTenantDomains();
    expect(domains).toHaveLength(1);
    expect(repo.listCurrentTenantDomains).toHaveBeenCalledTimes(1);
    expect(repo.findById).not.toHaveBeenCalled();
    expect(repo.listDomains).not.toHaveBeenCalled();
  });

  it('returns an empty array when the active tenant has no domain rows', async () => {
    repo.listCurrentTenantDomains = vi.fn().mockResolvedValue([]);
    await expect(service.listCurrentTenantDomains()).resolves.toEqual([]);
  });
});
