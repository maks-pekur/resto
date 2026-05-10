import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Currency, TenantId, TenantSlug } from '@resto/domain';
import { ArchiveTenantService } from '../../../src/contexts/tenancy/application/archive-tenant.service';
import type { IdentityRevocationPort } from '../../../src/contexts/tenancy/application/ports/identity-revocation.port';
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
  eraseTenant: vi.fn(),
  listScheduledForErasure: vi.fn().mockResolvedValue([]),
});

const buildTenant = (): Tenant =>
  Tenant.provision({
    slug: TenantSlug.parse('cafe-roma'),
    displayName: 'Cafe Roma',
    defaultCurrency: Currency.parse('USD'),
    primaryDomainHostname: 'cafe-roma.menu.resto.app',
  });

const buildRevoker = (): IdentityRevocationPort => ({
  revokeAllSessionsForTenant: vi.fn().mockResolvedValue({ revokedSessionsCount: 0 }),
});

describe('ArchiveTenantService', () => {
  let repo: TenantRepository;
  let revoker: IdentityRevocationPort;
  let service: ArchiveTenantService;

  beforeEach(() => {
    repo = buildRepo();
    revoker = buildRevoker();
    service = new ArchiveTenantService(repo, revoker);
  });

  it('archives an existing tenant and persists the aggregate', async () => {
    const tenant = buildTenant();
    repo.findById = vi.fn().mockResolvedValue(tenant);

    await service.execute(TENANT_UUID);

    expect(tenant.toSnapshot().status).toBe('archived');
    expect(repo.save).toHaveBeenCalledWith(tenant);
  });

  it('revokes all member sessions before persisting the archive (RES-128)', async () => {
    const tenant = buildTenant();
    repo.findById = vi.fn().mockResolvedValue(tenant);
    revoker.revokeAllSessionsForTenant = vi.fn().mockResolvedValue({ revokedSessionsCount: 3 });

    await service.execute(TENANT_UUID);

    expect(revoker.revokeAllSessionsForTenant).toHaveBeenCalledWith(TENANT_UUID);
    expect(vi.mocked(revoker.revokeAllSessionsForTenant).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(repo.save).mock.invocationCallOrder[0] ?? Infinity,
    );
  });

  it('aborts the archive when revocation fails — tenant stays active', async () => {
    const tenant = buildTenant();
    repo.findById = vi.fn().mockResolvedValue(tenant);
    revoker.revokeAllSessionsForTenant = vi.fn().mockRejectedValue(new Error('BA down'));

    await expect(service.execute(TENANT_UUID)).rejects.toThrow(/BA down/);
    expect(tenant.toSnapshot().status).toBe('active');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('throws TenantNotFoundError when the tenant does not exist', async () => {
    repo.findById = vi.fn().mockResolvedValue(null);
    await expect(service.execute(TENANT_UUID)).rejects.toBeInstanceOf(TenantNotFoundError);
    expect(repo.save).not.toHaveBeenCalled();
    expect(revoker.revokeAllSessionsForTenant).not.toHaveBeenCalled();
  });
});
