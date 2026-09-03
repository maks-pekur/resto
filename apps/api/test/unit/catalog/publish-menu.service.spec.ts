import { describe, expect, it, vi } from 'vitest';
import { runInTenantContext } from '@resto/db';
import { PublishMenuService } from '../../../src/contexts/catalog/application/publishing/publish-menu.service';
import type { CatalogRepository, ImageUrlPort } from '../../../src/contexts/catalog/domain/ports';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

const buildRepo = (isFirstPublish: boolean, version: number): CatalogRepository =>
  ({
    loadPublishedMenu: vi.fn(),
    listPublishedPhotoKeys: vi.fn().mockResolvedValue([]),
    findPublishedItem: vi.fn(),
    upsertCategory: vi.fn(),
    upsertItem: vi.fn(),
    upsertModifierGroup: vi.fn(),
    upsertModifierOption: vi.fn(),
    upsertItemSize: vi.fn(),
    replaceItemModifierGroups: vi.fn(),
    replaceGroupModifierOptions: vi.fn(),
    replaceItemModifierOptions: vi.fn(),
    setItemComposition: vi.fn(),
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
    listModifierOptions: vi.fn(),
    getModifierOptionUsage: vi.fn(),
    listStopListWithStoppedAt: vi.fn(),
    listStoppedItemIds: vi.fn(),
    listStoppedIngredientIds: vi.fn(),
    listStopListAggregateAcrossLocations: vi.fn(),
    computeDraftDiff: vi.fn(),
    archiveCategory: vi.fn(),
    archiveItem: vi.fn(),
    archiveModifierOption: vi.fn(),
    applyCategoryMoves: vi.fn(),
  }) satisfies CatalogRepository;

const buildMedia = (): ImageUrlPort =>
  ({
    publishPublicCopy: vi.fn().mockResolvedValue(undefined),
    publicUrl: vi.fn().mockReturnValue('https://cdn.example.test/public/photo.webp'),
    presignGet: vi.fn(),
    presignPut: vi.fn(),
  }) satisfies ImageUrlPort;

describe('PublishMenuService', () => {
  it('publishes every photo to the public prefix before bumping the version', async () => {
    const repo = buildRepo(false, 7);
    vi.mocked(repo.listPublishedPhotoKeys).mockResolvedValue(['tenant/t/menu-items/a.webp']);
    const media = buildMedia();
    const order: string[] = [];
    vi.mocked(media.publishPublicCopy).mockImplementation(() => {
      order.push('copy');
      return Promise.resolve();
    });
    vi.mocked(repo.finalizeMenuPublish).mockImplementation(() => {
      order.push('finalize');
      return Promise.resolve({ isFirstPublish: false, version: 7 });
    });

    await runInTenantContext({ tenantId: TENANT_ID }, () =>
      new PublishMenuService(repo, media).execute(),
    );

    expect(media.publishPublicCopy).toHaveBeenCalledWith('tenant/t/menu-items/a.webp');
    expect(order).toEqual(['copy', 'finalize']);
  });

  it('does not publish a version whose photos could not be made readable', async () => {
    const repo = buildRepo(false, 7);
    vi.mocked(repo.listPublishedPhotoKeys).mockResolvedValue(['tenant/t/menu-items/a.webp']);
    const media = buildMedia();
    vi.mocked(media.publishPublicCopy).mockRejectedValue(new Error('S3 down'));

    await expect(
      runInTenantContext({ tenantId: TENANT_ID }, () =>
        new PublishMenuService(repo, media).execute(),
      ),
    ).rejects.toThrow('S3 down');
    expect(repo.finalizeMenuPublish).not.toHaveBeenCalled();
  });

  it('returns the version produced by the repository finalize bump', async () => {
    const repo = buildRepo(false, 42);
    const service = new PublishMenuService(repo, buildMedia());

    const result = await runInTenantContext({ tenantId: TENANT_ID }, () => service.execute());

    expect(result).toEqual({ tenantId: TENANT_ID, version: 42 });
    expect(repo.finalizeMenuPublish).toHaveBeenCalledWith({ tenantId: TENANT_ID });
  });

  it('emits via the first-publish branch when finalize reports isFirstPublish=true', async () => {
    const repo = buildRepo(true, 1);
    const service = new PublishMenuService(repo, buildMedia());

    const result = await runInTenantContext({ tenantId: TENANT_ID }, () => service.execute());

    expect(result).toEqual({ tenantId: TENANT_ID, version: 1 });
    expect(repo.finalizeMenuPublish).toHaveBeenCalledWith({ tenantId: TENANT_ID });
  });

  it('doPublish accepts an explicit tenantId (setTimeout callback path, no ALS frame)', async () => {
    const repo = buildRepo(false, 11);
    const service = new PublishMenuService(repo, buildMedia());

    const result = await service.doPublish(TENANT_ID);

    expect(result).toEqual({ version: 11 });
    expect(repo.finalizeMenuPublish).toHaveBeenCalledWith({ tenantId: TENANT_ID });
  });

  it('throws when execute() is called without a tenant context', async () => {
    const repo = buildRepo(false, 1);
    const service = new PublishMenuService(repo, buildMedia());
    await expect(service.execute()).rejects.toThrow(/tenant context/i);
    expect(repo.finalizeMenuPublish).not.toHaveBeenCalled();
  });
});
