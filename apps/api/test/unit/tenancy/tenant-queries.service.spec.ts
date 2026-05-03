import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Currency, TenantId, TenantSlug } from '@resto/domain';
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

describe('TenantQueriesService.getById', () => {
  let repo: TenantRepository;
  let service: TenantQueriesService;

  beforeEach(() => {
    repo = buildRepo();
    service = new TenantQueriesService(repo);
  });

  it('returns the snapshot for an existing id', async () => {
    const tenant = tenantFor('demo');
    repo.findById = vi.fn().mockResolvedValue(tenant);
    const snap = await service.getById(tenant.toSnapshot().id);
    expect(snap.slug).toBe('demo');
  });

  it('throws TenantNotFoundError for unknown id', async () => {
    repo.findById = vi.fn().mockResolvedValue(null);
    await expect(service.getById('00000000-0000-0000-0000-000000000000')).rejects.toBeInstanceOf(
      TenantNotFoundError,
    );
  });
});

describe('TenantQueriesService.listDomains', () => {
  let repo: TenantRepository;
  let service: TenantQueriesService;

  beforeEach(() => {
    repo = buildRepo();
    service = new TenantQueriesService(repo);
  });

  it('returns the listed domains for an existing tenant', async () => {
    const tenant = tenantFor('cafe-roma');
    repo.findById = vi.fn().mockResolvedValue(tenant);
    repo.listDomains = vi.fn().mockResolvedValue([tenant.toSnapshot().primaryDomain]);
    const domains = await service.listDomains(tenant.toSnapshot().id);
    expect(domains).toHaveLength(1);
  });

  it('throws TenantNotFoundError when the tenant id is unknown', async () => {
    repo.findById = vi.fn().mockResolvedValue(null);
    const id = TenantId.parse('22222222-2222-4222-8222-222222222222');
    await expect(service.listDomains(id)).rejects.toBeInstanceOf(TenantNotFoundError);
  });
});
