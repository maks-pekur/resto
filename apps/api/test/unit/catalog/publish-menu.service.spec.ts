import { describe, expect, it, vi } from 'vitest';
import { runInTenantContext } from '@resto/db';
import { PublishMenuService } from '../../../src/contexts/catalog/application/publish-menu.service';
import type { CatalogRepository } from '../../../src/contexts/catalog/domain/ports';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

const buildRepo = (isFirstPublish: boolean, version: number): CatalogRepository =>
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
    finalizeMenuPublish: vi.fn().mockResolvedValue({ isFirstPublish, version }),
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
  it('returns the version produced by the repository finalize bump', async () => {
    const repo = buildRepo(false, 42);
    const service = new PublishMenuService(repo);

    const result = await runInTenantContext({ tenantId: TENANT_ID }, () => service.execute());

    expect(result).toEqual({ tenantId: TENANT_ID, version: 42 });
    expect(repo.finalizeMenuPublish).toHaveBeenCalledWith({ tenantId: TENANT_ID });
  });

  it('emits via the first-publish branch when finalize reports isFirstPublish=true', async () => {
    const repo = buildRepo(true, 1);
    const service = new PublishMenuService(repo);

    const result = await runInTenantContext({ tenantId: TENANT_ID }, () => service.execute());

    expect(result).toEqual({ tenantId: TENANT_ID, version: 1 });
    expect(repo.finalizeMenuPublish).toHaveBeenCalledWith({ tenantId: TENANT_ID });
  });

  it('doPublish accepts an explicit tenantId (setTimeout callback path, no ALS frame)', async () => {
    const repo = buildRepo(false, 11);
    const service = new PublishMenuService(repo);

    const result = await service.doPublish(TENANT_ID);

    expect(result).toEqual({ version: 11 });
    expect(repo.finalizeMenuPublish).toHaveBeenCalledWith({ tenantId: TENANT_ID });
  });

  it('throws when execute() is called without a tenant context', async () => {
    const repo = buildRepo(false, 1);
    const service = new PublishMenuService(repo);
    await expect(service.execute()).rejects.toThrow(/tenant context/i);
    expect(repo.finalizeMenuPublish).not.toHaveBeenCalled();
  });
});
