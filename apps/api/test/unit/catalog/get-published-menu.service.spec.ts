import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Currency, TenantId } from '@resto/domain';
import { GetPublishedMenuService } from '../../../src/contexts/catalog/application/get-published-menu.service';
import type {
  CatalogCachePort,
  CatalogRepository,
  MenuVersionPort,
} from '../../../src/contexts/catalog/domain/ports';
import type { PublishedMenu } from '../../../src/contexts/catalog/domain/published-menu';

const TENANT = TenantId.parse('11111111-1111-4111-8111-111111111111');

const buildMenu = (version: number): PublishedMenu => ({
  tenantId: TENANT,
  version,
  currency: Currency.parse('USD'),
  categories: [],
  items: [],
  modifiers: [],
});

describe('GetPublishedMenuService', () => {
  let repo: CatalogRepository;
  let cache: CatalogCachePort;
  let versions: MenuVersionPort;
  let service: GetPublishedMenuService;

  beforeEach(() => {
    repo = {
      loadPublishedMenu: vi.fn(),
      findPublishedItem: vi.fn(),
      upsertCategory: vi.fn(),
      upsertItem: vi.fn(),
      upsertModifier: vi.fn(),
    };
    cache = { get: vi.fn(), set: vi.fn().mockResolvedValue(undefined) };
    versions = { current: vi.fn().mockResolvedValue(7), bump: vi.fn() };
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
    expect(repo.loadPublishedMenu).toHaveBeenCalledWith(TENANT, 7);
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
    expect(repo.loadPublishedMenu).toHaveBeenCalledWith(TENANT, 42);
  });
});
