import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { TenantId } from '@resto/domain';
import {
  BrandOutOfScopeError,
  NonOwnerBrandSwitchForbiddenError,
} from '../../../src/contexts/identity/domain/errors';
import { SetActiveBrandService } from '../../../src/contexts/identity/application/set-active-brand.service';
import type { BrandProvisioningPort } from '../../../src/contexts/identity/application/ports/brand-provisioning.port';
import type { SessionActiveBrandWriter } from '../../../src/contexts/identity/application/ports/session-active-brand-writer.port';
import type { SessionActiveLocationWriter } from '../../../src/contexts/identity/application/ports/session-active-location-writer.port';
import type { InitialLocationDrizzleRepository } from '../../../src/contexts/identity/infrastructure/initial-location-drizzle.repository';

const TENANT_ID = TenantId.parse('00000000-0000-0000-0000-000000000001');
const USER_ID = '00000000-0000-0000-0000-000000000002';
const BRAND_A = '00000000-0000-0000-0000-000000000003';
const BRAND_B = '00000000-0000-0000-0000-000000000004';
const SESSION_TOKEN = 'session-token';

const makeBrands = (overrides: Partial<BrandProvisioningPort> = {}): BrandProvisioningPort => ({
  listForTenant: vi.fn().mockResolvedValue([]),
  provision: vi.fn(),
  findActiveSlugsByPrefix: vi.fn().mockResolvedValue([]),
  ...overrides,
});

const makeBrandWriter = (
  overrides: Partial<SessionActiveBrandWriter> = {},
): SessionActiveBrandWriter => ({
  writeActiveBrand: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const makeLocationWriter = (
  overrides: Partial<SessionActiveLocationWriter> = {},
): SessionActiveLocationWriter => ({
  writeActiveLocation: vi.fn().mockResolvedValue(undefined),
  readActiveLocationId: vi.fn().mockResolvedValue(null),
  ...overrides,
});

const makeInitialLocation = (resolved: string | null = null): InitialLocationDrizzleRepository =>
  ({
    resolveForUserInBrand: vi.fn().mockResolvedValue(resolved),
  }) as unknown as InitialLocationDrizzleRepository;

describe('SetActiveBrandService', () => {
  it('non-owner: throws NonOwnerBrandSwitchForbiddenError immediately, before any brand lookup (D-14)', async () => {
    const brands = makeBrands();
    const brandWriter = makeBrandWriter();
    const locationWriter = makeLocationWriter();
    const initialLocation = makeInitialLocation(null);
    const svc = new SetActiveBrandService(brands, brandWriter, locationWriter, initialLocation);

    await expect(
      svc.execute({
        userId: USER_ID,
        tenantId: TENANT_ID,
        baseRole: 'staff',
        brandId: BRAND_B,
        sessionToken: SESSION_TOKEN,
      }),
    ).rejects.toBeInstanceOf(NonOwnerBrandSwitchForbiddenError);
    expect(brands.listForTenant).not.toHaveBeenCalled();
    expect(brandWriter.writeActiveBrand).not.toHaveBeenCalled();
  });

  it('owner: switching brands re-resolves activeLocationId for the new brand (multi-location -> null)', async () => {
    const brands = makeBrands({
      listForTenant: vi
        .fn()
        .mockResolvedValue([{ id: BRAND_B, slug: 'brand-b', displayName: 'Brand B' }]),
    });
    const brandWriter = makeBrandWriter();
    const locationWriter = makeLocationWriter();
    const initialLocation = makeInitialLocation(null);
    const svc = new SetActiveBrandService(brands, brandWriter, locationWriter, initialLocation);

    await svc.execute({
      userId: USER_ID,
      tenantId: TENANT_ID,
      baseRole: 'owner',
      brandId: BRAND_B,
      sessionToken: SESSION_TOKEN,
    });

    expect(initialLocation.resolveForUserInBrand).toHaveBeenCalledWith(USER_ID, BRAND_B);
    expect(locationWriter.writeActiveLocation).toHaveBeenCalledWith({
      sessionToken: SESSION_TOKEN,
      activeLocationId: null,
    });
  });

  it('owner: throws BrandOutOfScopeError when the brand is not in the tenant', async () => {
    const brands = makeBrands({ listForTenant: vi.fn().mockResolvedValue([]) });
    const brandWriter = makeBrandWriter();
    const locationWriter = makeLocationWriter();
    const initialLocation = makeInitialLocation(null);
    const svc = new SetActiveBrandService(brands, brandWriter, locationWriter, initialLocation);

    await expect(
      svc.execute({
        userId: USER_ID,
        tenantId: TENANT_ID,
        baseRole: 'owner',
        brandId: BRAND_B,
        sessionToken: SESSION_TOKEN,
      }),
    ).rejects.toBeInstanceOf(BrandOutOfScopeError);
    expect(brandWriter.writeActiveBrand).not.toHaveBeenCalled();
  });

  it('owner: single-brand behavior unchanged', async () => {
    const brands = makeBrands({
      listForTenant: vi
        .fn()
        .mockResolvedValue([{ id: BRAND_A, slug: 'brand-a', displayName: 'Brand A' }]),
    });
    const brandWriter = makeBrandWriter();
    const locationWriter = makeLocationWriter();
    const initialLocation = makeInitialLocation(null);
    const svc = new SetActiveBrandService(brands, brandWriter, locationWriter, initialLocation);

    const result = await svc.execute({
      userId: USER_ID,
      tenantId: TENANT_ID,
      baseRole: 'owner',
      brandId: BRAND_A,
      sessionToken: SESSION_TOKEN,
    });

    expect(result).toEqual({ slug: 'brand-a' });
  });
});
