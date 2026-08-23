import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantId, TenantSlug } from '@resto/domain';
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
  findByStripeAccountId: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined),
  listDomains: vi.fn(),
  eraseTenant: vi.fn(),
  listScheduledForErasure: vi.fn().mockResolvedValue([]),
  findCurrentTenant: vi.fn(),
  listCurrentTenantDomains: vi.fn().mockResolvedValue([]),
});

const buildTenant = (): Tenant =>
  Tenant.provision({
    slug: TenantSlug.parse('cafe-roma'),
    displayName: 'Cafe Roma',
    country: 'GB',
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
    repo.findById = vi.fn().mockResolvedValue(tenant.toSnapshot());

    await service.execute(TENANT_UUID);

    const saved = vi.mocked(repo.save).mock.calls[0]?.[0];
    expect(saved?.toSnapshot().status).toBe('archived');
    expect(repo.save).toHaveBeenCalledWith(saved);
  });

  it('persists the archive before revoking sessions', async () => {
    const tenant = buildTenant();
    repo.findById = vi.fn().mockResolvedValue(tenant.toSnapshot());
    revoker.revokeAllSessionsForTenant = vi.fn().mockResolvedValue({ revokedSessionsCount: 3 });

    await service.execute(TENANT_UUID);

    expect(revoker.revokeAllSessionsForTenant).toHaveBeenCalledWith(TENANT_UUID);
    expect(vi.mocked(repo.save).mock.invocationCallOrder[0] ?? Infinity).toBeLessThan(
      vi.mocked(revoker.revokeAllSessionsForTenant).mock.invocationCallOrder[0] ?? Infinity,
    );
  });

  it('skips revocation and keeps the tenant active when save fails', async () => {
    const tenant = buildTenant();
    repo.findById = vi.fn().mockResolvedValue(tenant.toSnapshot());
    repo.save = vi.fn().mockRejectedValue(new Error('save failed'));

    await expect(service.execute(TENANT_UUID)).rejects.toThrow(/save failed/);
    expect(revoker.revokeAllSessionsForTenant).not.toHaveBeenCalled();
  });

  it('completes archive even when revocation fails — sessions are best-effort cleanup', async () => {
    const tenant = buildTenant();
    repo.findById = vi.fn().mockResolvedValue(tenant.toSnapshot());
    revoker.revokeAllSessionsForTenant = vi.fn().mockRejectedValue(new Error('BA down'));

    await expect(service.execute(TENANT_UUID)).resolves.toBeUndefined();
    const saved = vi.mocked(repo.save).mock.calls[0]?.[0];
    expect(repo.save).toHaveBeenCalledWith(saved);
    expect(saved?.toSnapshot().status).toBe('archived');
  });

  it('throws TenantNotFoundError when the tenant does not exist', async () => {
    repo.findById = vi.fn().mockResolvedValue(null);
    await expect(service.execute(TENANT_UUID)).rejects.toBeInstanceOf(TenantNotFoundError);
    expect(repo.save).not.toHaveBeenCalled();
    expect(revoker.revokeAllSessionsForTenant).not.toHaveBeenCalled();
  });
});
