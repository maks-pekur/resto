import { describe, expect, it, vi } from 'vitest';
import { runInTenantContext } from '@resto/db';
import { ProvisionLocationService } from '../../../src/contexts/tenancy/application/provision-location.service';
import type {
  LocationRepository,
  TenantRepository,
} from '../../../src/contexts/tenancy/domain/ports';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

const buildRepo = (existingSlugs: readonly string[] = []): LocationRepository => ({
  findById: vi.fn(),
  listForTenant: vi.fn().mockResolvedValue(existingSlugs.map((slug) => ({ slug }))),
  save: vi.fn().mockResolvedValue(undefined),
  countScopedMembers: vi.fn().mockResolvedValue(0),
});

const buildTenants = (timezone = 'Europe/Kyiv'): TenantRepository =>
  ({ findById: vi.fn().mockResolvedValue({ timezone }) }) as unknown as TenantRepository;

const baseInput = {
  name: 'Kitchen One',
  address: null,
  latitude: null,
  longitude: null,
  contacts: null,
};

describe('ProvisionLocationService', () => {
  it('creates a new active location scoped to the ALS-bound tenant', async () => {
    const repo = buildRepo();
    const service = new ProvisionLocationService(repo, buildTenants());

    const result = await runInTenantContext({ tenantId: TENANT_ID }, () =>
      service.execute(baseInput),
    );

    expect(result.status).toBe('active');
    expect(result.tenantId).toBe(TENANT_ID);
    expect(result.name).toBe('Kitchen One');
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID, status: 'active' }),
    );
  });

  it('emits a fresh LocationId (UUID) on every call', async () => {
    const repo = buildRepo();
    const service = new ProvisionLocationService(repo, buildTenants());

    const result = await runInTenantContext({ tenantId: TENANT_ID }, () =>
      service.execute(baseInput),
    );

    expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('always creates a new location — no lookup against existing rows (D-12 no auto-synthesis)', async () => {
    const repo = buildRepo();
    const service = new ProvisionLocationService(repo, buildTenants());

    await runInTenantContext({ tenantId: TENANT_ID }, () => service.execute(baseInput));
    await runInTenantContext({ tenantId: TENANT_ID }, () => service.execute(baseInput));

    expect(repo.save).toHaveBeenCalledTimes(2);
    expect(repo.findById).not.toHaveBeenCalled();
  });

  it('derives the slug from the name, transliterating Cyrillic', async () => {
    const repo = buildRepo();
    const service = new ProvisionLocationService(repo, buildTenants());

    const result = await runInTenantContext({ tenantId: TENANT_ID }, () =>
      service.execute({ ...baseInput, name: 'Воскресенка' }),
    );

    expect(result.slug).toBe('voskresenka');
  });

  it('suffixes the slug rather than colliding with an existing location', async () => {
    const repo = buildRepo(['kitchen-one', 'kitchen-one-2']);
    const service = new ProvisionLocationService(repo, buildTenants());

    const result = await runInTenantContext({ tenantId: TENANT_ID }, () =>
      service.execute(baseInput),
    );

    expect(result.slug).toBe('kitchen-one-3');
  });

  // `new` is the create-form sentinel and `all` the aggregate mode; a location taking either
  // would shadow a route it does not own.
  it.each(['New', 'all'])('never hands out the reserved slug from name %s', async (name) => {
    const repo = buildRepo();
    const service = new ProvisionLocationService(repo, buildTenants());

    const result = await runInTenantContext({ tenantId: TENANT_ID }, () =>
      service.execute({ ...baseInput, name }),
    );

    expect(['new', 'all']).not.toContain(result.slug);
  });

  it("inherits the tenant's timezone when none is given, and honours one that is", async () => {
    const repo = buildRepo();
    const service = new ProvisionLocationService(repo, buildTenants('Europe/Madrid'));

    const inherited = await runInTenantContext({ tenantId: TENANT_ID }, () =>
      service.execute(baseInput),
    );
    expect(inherited.timezone).toBe('Europe/Madrid');

    const overridden = await runInTenantContext({ tenantId: TENANT_ID }, () =>
      service.execute({ ...baseInput, name: 'Second', timezone: 'Europe/London' }),
    );
    expect(overridden.timezone).toBe('Europe/London');
  });
});
