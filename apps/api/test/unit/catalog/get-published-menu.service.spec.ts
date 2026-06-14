import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runInTenantContext } from '@resto/db';
import { BrandId, BrandTheme, Currency, TenantId } from '@resto/domain';
import { GetPublishedMenuService } from '../../../src/contexts/catalog/application/get-published-menu.service';
import type {
  CatalogRepository,
  MenuVersionPort,
} from '../../../src/contexts/catalog/domain/ports';
import type { PublishedMenu } from '../../../src/contexts/catalog/domain/published-menu';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const TENANT = TenantId.parse(TENANT_ID);
const BRAND_ID = '44444444-4444-4444-8444-444444444444';

const buildMenu = (version: number, brand: PublishedMenu['brand'] = null): PublishedMenu => ({
  tenantId: TENANT,
  version,
  currency: Currency.parse('USD'),
  brand,
  categories: [],
  items: [],
  modifierGroups: [],
});

const buildRepo = (): CatalogRepository =>
  ({
    loadPublishedMenu: vi.fn().mockResolvedValue(buildMenu(7)),
    findPublishedItem: vi.fn(),
    upsertCategory: vi.fn(),
    upsertItem: vi.fn(),
    upsertModifierGroup: vi.fn(),
    upsertModifierOption: vi.fn(),
    upsertItemSize: vi.fn(),
    addToStopList: vi.fn(),
    removeFromStopList: vi.fn(),
    getMenuFirstPublishedAt: vi.fn(),
    insertSlugAlias: vi.fn(),
  }) as unknown as CatalogRepository;

const buildVersionPort = (): MenuVersionPort => ({
  current: vi.fn().mockResolvedValue(7),
});

describe('GetPublishedMenuService', () => {
  let repo: CatalogRepository;
  let versions: MenuVersionPort;
  let service: GetPublishedMenuService;

  beforeEach(() => {
    repo = buildRepo();
    versions = buildVersionPort();
    service = new GetPublishedMenuService(repo, versions);
  });

  it('returns the menu loaded from the repository', async () => {
    const fresh = buildMenu(7);
    repo.loadPublishedMenu = vi.fn().mockResolvedValue(fresh);

    const result = await runInTenantContext({ tenantId: TENANT_ID, brandId: BRAND_ID }, () =>
      service.execute(TENANT),
    );

    expect(result).toBe(fresh);
    expect(repo.loadPublishedMenu).toHaveBeenCalledWith(TENANT, 7, BRAND_ID);
  });

  it('loads the menu at the current version from the version port', async () => {
    versions.current = vi.fn().mockResolvedValue(42);
    repo.loadPublishedMenu = vi.fn().mockResolvedValue(buildMenu(42));

    await runInTenantContext({ tenantId: TENANT_ID, brandId: BRAND_ID }, () =>
      service.execute(TENANT),
    );

    expect(versions.current).toHaveBeenCalledWith(TENANT);
    expect(repo.loadPublishedMenu).toHaveBeenCalledWith(TENANT, 42, BRAND_ID);
  });

  it('threads brandId from ALS into the repo loadPublishedMenu call', async () => {
    await runInTenantContext(
      { tenantId: TENANT_ID, brandId: '33333333-3333-4333-8333-333333333333' },
      () => service.execute(TENANT),
    );

    expect(repo.loadPublishedMenu).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Number),
      '33333333-3333-4333-8333-333333333333',
    );
  });

  it('passes the brand object through from the repo to the caller', async () => {
    const brand = {
      id: BrandId.parse('44444444-4444-4444-8444-444444444444'),
      slug: 'z-burger',
      displayName: 'Z Burger',
      theme: BrandTheme.parse({ primaryColor: '#FF5733' }),
    };
    const fresh = buildMenu(11, brand);
    repo.loadPublishedMenu = vi.fn().mockResolvedValue(fresh);

    const result = await runInTenantContext({ tenantId: TENANT_ID, brandId: BRAND_ID }, () =>
      service.execute(TENANT),
    );

    expect(result.brand).toEqual(brand);
  });
});
