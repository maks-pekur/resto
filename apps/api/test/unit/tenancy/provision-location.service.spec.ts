import { describe, expect, it, vi } from 'vitest';
import { runInTenantContext } from '@resto/db';
import { ProvisionLocationService } from '../../../src/contexts/tenancy/application/provision-location.service';
import type { LocationRepository } from '../../../src/contexts/tenancy/domain/ports';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const BRAND_ID = '22222222-2222-4222-8222-222222222222';

const buildRepo = (): LocationRepository => ({
  findById: vi.fn(),
  listForBrand: vi.fn().mockResolvedValue([]),
  save: vi.fn().mockResolvedValue(undefined),
  countScopedMembers: vi.fn().mockResolvedValue(0),
});

const baseInput = {
  name: 'Kitchen One',
  address: null,
  timezone: null,
  contacts: null,
};

describe('ProvisionLocationService', () => {
  it('creates a new active location scoped to the ALS-bound tenant + brand', async () => {
    const repo = buildRepo();
    const service = new ProvisionLocationService(repo);

    const result = await runInTenantContext({ tenantId: TENANT_ID, brandId: BRAND_ID }, () =>
      service.execute(baseInput),
    );

    expect(result.status).toBe('active');
    expect(result.tenantId).toBe(TENANT_ID);
    expect(result.brandId).toBe(BRAND_ID);
    expect(result.name).toBe('Kitchen One');
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID, brandId: BRAND_ID, status: 'active' }),
    );
  });

  it('emits a fresh LocationId (UUID) on every call', async () => {
    const repo = buildRepo();
    const service = new ProvisionLocationService(repo);

    const result = await runInTenantContext({ tenantId: TENANT_ID, brandId: BRAND_ID }, () =>
      service.execute(baseInput),
    );

    expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('always creates a new location — no lookup against existing rows (D-12 no auto-synthesis)', async () => {
    const repo = buildRepo();
    const service = new ProvisionLocationService(repo);

    await runInTenantContext({ tenantId: TENANT_ID, brandId: BRAND_ID }, () =>
      service.execute(baseInput),
    );
    await runInTenantContext({ tenantId: TENANT_ID, brandId: BRAND_ID }, () =>
      service.execute(baseInput),
    );

    expect(repo.save).toHaveBeenCalledTimes(2);
    expect(repo.findById).not.toHaveBeenCalled();
  });

  it('throws when no brand context is bound', async () => {
    const repo = buildRepo();
    const service = new ProvisionLocationService(repo);

    await expect(
      runInTenantContext({ tenantId: TENANT_ID }, () => service.execute(baseInput)),
    ).rejects.toThrow(/brand context/i);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
