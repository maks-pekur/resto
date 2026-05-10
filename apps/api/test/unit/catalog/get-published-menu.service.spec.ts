import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runInTenantContext } from '@resto/db';
import { Currency, TenantId } from '@resto/domain';
import { GetPublishedMenuService } from '../../../src/contexts/catalog/application/get-published-menu.service';
import type {
  CatalogCachePort,
  CatalogRepository,
  MenuVersionPort,
} from '../../../src/contexts/catalog/domain/ports';
import type { PublishedMenu } from '../../../src/contexts/catalog/domain/published-menu';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const TENANT = TenantId.parse(TENANT_ID);

const buildMenu = (version: number): PublishedMenu => ({
  tenantId: TENANT,
  version,
  currency: Currency.parse('USD'),
  categories: [],
  items: [],
  modifiers: [],
});

const buildRepo = (): CatalogRepository => ({
  loadPublishedMenu: vi.fn().mockResolvedValue(buildMenu(7)),
  findPublishedItem: vi.fn(),
  upsertCategory: vi.fn(),
  upsertItem: vi.fn(),
  upsertModifier: vi.fn(),
});

const buildCache = (): CatalogCachePort => ({
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
});

const buildVersionPort = (): MenuVersionPort => ({
  current: vi.fn().mockResolvedValue(7),
  bump: vi.fn(),
});

describe('GetPublishedMenuService', () => {
  let repo: CatalogRepository;
  let cache: CatalogCachePort;
  let versions: MenuVersionPort;
  let service: GetPublishedMenuService;

  beforeEach(() => {
    repo = buildRepo();
    cache = buildCache();
    versions = buildVersionPort();
    service = new GetPublishedMenuService(repo, cache, versions);
  });

  it('returns the cached menu without hitting the repository', async () => {
    const cached = buildMenu(7);
    cache.get = vi.fn().mockResolvedValue(cached);
    const result = await service.execute(TENANT);
    expect(result).toBe(cached);
    expect(repo.loadPublishedMenu).not.toHaveBeenCalled();
  });

  it('falls through to the repository on cache miss and writes back', async () => {
    cache.get = vi.fn().mockResolvedValue(null);
    const fresh = buildMenu(7);
    repo.loadPublishedMenu = vi.fn().mockResolvedValue(fresh);

    const result = await service.execute(TENANT);
    expect(result).toBe(fresh);
    expect(repo.loadPublishedMenu).toHaveBeenCalledWith(TENANT, 7, null);
    // Cache write is fire-and-forget; await a tick before assertion.
    await new Promise((r) => setImmediate(r));
    expect(cache.set).toHaveBeenCalledWith(fresh, expect.any(Number));
  });

  it('uses the current menu version from the version port', async () => {
    versions.current = vi.fn().mockResolvedValue(42);
    cache.get = vi.fn().mockResolvedValue(null);
    repo.loadPublishedMenu = vi.fn().mockResolvedValue(buildMenu(42));
    await service.execute(TENANT);
    expect(versions.current).toHaveBeenCalledWith(TENANT);
    expect(repo.loadPublishedMenu).toHaveBeenCalledWith(TENANT, 42, null);
  });

  it('passes brandId from ALS to the repo loadPublishedMenu call', async () => {
    const repo = buildRepo();
    const cache = buildCache();
    const versionPort = buildVersionPort();
    const service = new GetPublishedMenuService(repo, cache, versionPort);

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
});
