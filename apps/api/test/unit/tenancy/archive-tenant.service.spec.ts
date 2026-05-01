import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Currency, TenantId, TenantSlug } from '@resto/domain';
import { ArchiveTenantService } from '../../../src/contexts/tenancy/application/archive-tenant.service';
import { TenantNotFoundError } from '../../../src/contexts/tenancy/domain/errors';
import type { TenantRepository } from '../../../src/contexts/tenancy/domain/ports';
import { Tenant } from '../../../src/contexts/tenancy/domain/tenant.aggregate';

const TENANT_UUID = TenantId.parse('11111111-1111-4111-8111-111111111111');

const buildRepo = (): TenantRepository => ({
  findById: vi.fn(),
  findBySlug: vi.fn(),
  findByDomainHost: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined),
  listDomains: vi.fn(),
});

const buildTenant = (): Tenant =>
  Tenant.provision({
    slug: TenantSlug.parse('cafe-roma'),
    displayName: 'Cafe Roma',
    defaultCurrency: Currency.parse('USD'),
    primaryDomainHostname: 'cafe-roma.menu.resto.app',
  });

describe('ArchiveTenantService', () => {
  let repo: TenantRepository;
  let service: ArchiveTenantService;

  beforeEach(() => {
    repo = buildRepo();
    service = new ArchiveTenantService(repo);
  });

  it('archives an existing tenant and persists the aggregate', async () => {
    const tenant = buildTenant();
    repo.findById = vi.fn().mockResolvedValue(tenant);

    await service.execute(TENANT_UUID);

    expect(tenant.toSnapshot().status).toBe('archived');
    expect(repo.save).toHaveBeenCalledWith(tenant);
  });

  it('throws TenantNotFoundError when the tenant does not exist', async () => {
    repo.findById = vi.fn().mockResolvedValue(null);
    await expect(service.execute(TENANT_UUID)).rejects.toBeInstanceOf(TenantNotFoundError);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
