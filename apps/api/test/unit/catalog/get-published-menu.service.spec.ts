import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runInTenantContext } from '@resto/db';
import { Currency, TenantId } from '@resto/domain';
import { GetPublishedMenuService } from '../../../src/contexts/catalog/application/publishing/get-published-menu.service';
import type {
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

    const result = await runInTenantContext({ tenantId: TENANT_ID }, () => service.execute(TENANT));

    expect(result).toBe(fresh);
    expect(repo.loadPublishedMenu).toHaveBeenCalledWith(TENANT, 7);
  });

  it('loads the menu at the current version from the version port', async () => {
    versions.current = vi.fn().mockResolvedValue(42);
    repo.loadPublishedMenu = vi.fn().mockResolvedValue(buildMenu(42));

    await runInTenantContext({ tenantId: TENANT_ID }, () => service.execute(TENANT));

    expect(versions.current).toHaveBeenCalledWith(TENANT);
    expect(repo.loadPublishedMenu).toHaveBeenCalledWith(TENANT, 42);
  });
});
