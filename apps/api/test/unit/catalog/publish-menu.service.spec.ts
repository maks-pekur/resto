import { describe, expect, it, vi } from 'vitest';
import { runInTenantContext } from '@resto/db';
import { PublishMenuService } from '../../../src/contexts/catalog/application/publish-menu.service';
import type {
  CatalogRepository,
  MenuVersionPort,
} from '../../../src/contexts/catalog/domain/ports';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

const buildVersions = (next = 7): MenuVersionPort => ({
  current: vi.fn(),
  bump: vi.fn().mockResolvedValue(next),
});

const buildRepo = (isFirstPublish: boolean): CatalogRepository =>
  ({
    loadPublishedMenu: vi.fn(),
    findPublishedItem: vi.fn(),
    upsertCategory: vi.fn(),
    upsertItem: vi.fn(),
    upsertModifierGroup: vi.fn(),
    upsertModifierOption: vi.fn(),
    upsertItemSize: vi.fn(),
    addToStopList: vi.fn(),
    removeFromStopList: vi.fn(),
    getMenuFirstPublishedAt: vi.fn(),
    finalizeMenuPublish: vi.fn().mockResolvedValue({ isFirstPublish }),
    insertSlugAlias: vi.fn(),
    listCategoriesByParent: vi.fn(),
    listItems: vi.fn(),
    getItemById: vi.fn(),
    listModifierGroups: vi.fn(),
    getModifierGroupById: vi.fn(),
    listStopListWithStoppedAt: vi.fn(),
    computeDraftDiff: vi.fn(),
    archiveCategory: vi.fn(),
    archiveItem: vi.fn(),
    applyCategoryMoves: vi.fn(),
  }) satisfies CatalogRepository;

describe('PublishMenuService', () => {
  it('bumps the per-tenant version and returns the new value', async () => {
    const versions = buildVersions(42);
    const repo = buildRepo(false);
    const service = new PublishMenuService(versions, repo);

    const result = await runInTenantContext({ tenantId: TENANT_ID }, () => service.execute());

    expect(result).toEqual({ tenantId: TENANT_ID, version: 42 });
    expect(versions.bump).toHaveBeenCalledTimes(1);
    expect(versions.bump).toHaveBeenCalledWith(TENANT_ID);
    expect(repo.finalizeMenuPublish).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      version: 42,
    });
  });

  it('emits via the first-publish branch when finalize reports isFirstPublish=true', async () => {
    const versions = buildVersions(1);
    const repo = buildRepo(true);
    const service = new PublishMenuService(versions, repo);

    await runInTenantContext({ tenantId: TENANT_ID }, () => service.execute());

    expect(repo.finalizeMenuPublish).toHaveBeenCalledWith({ tenantId: TENANT_ID, version: 1 });
  });

  it('doPublish accepts an explicit tenantId (setTimeout callback path, no ALS frame)', async () => {
    const versions = buildVersions(11);
    const repo = buildRepo(false);
    const service = new PublishMenuService(versions, repo);

    const result = await service.doPublish(TENANT_ID);

    expect(result).toEqual({ version: 11 });
    expect(repo.finalizeMenuPublish).toHaveBeenCalledWith({ tenantId: TENANT_ID, version: 11 });
  });

  it('throws when execute() is called without a tenant context', async () => {
    const versions = buildVersions();
    const repo = buildRepo(false);
    const service = new PublishMenuService(versions, repo);
    await expect(service.execute()).rejects.toThrow(/tenant context/i);
    expect(versions.bump).not.toHaveBeenCalled();
  });
});
