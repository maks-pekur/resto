import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runInTenantContext } from '@resto/db';
import { Currency, MenuCategoryId, MenuItemId } from '@resto/domain';
import { GetMenuItemService } from '../../../src/contexts/catalog/application/items/get-menu-item.service';
import { MenuItemNotFoundError } from '../../../src/contexts/catalog/domain/errors';
import type { CatalogRepository } from '../../../src/contexts/catalog/domain/ports';
import type { PublishedMenuItem } from '../../../src/contexts/catalog/domain/published-menu';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_ID = MenuItemId.parse('22222222-2222-4222-8222-222222222222');
const CATEGORY_ID = MenuCategoryId.parse('33333333-3333-4333-8333-333333333333');

const buildItem = (): PublishedMenuItem => ({
  id: ITEM_ID,
  slug: 'margherita',
  categoryId: CATEGORY_ID,
  name: { en: 'Margherita' },
  description: null,
  basePrice: '12.50' as PublishedMenuItem['basePrice'],
  currency: Currency.parse('USD'),
  code: null,
  weight: null,
  measureUnit: null,
  imageUrl: null,
  photos: [],
  allergens: [],
  sortOrder: 0,
  proteins: null,
  fats: null,
  carbs: null,
  kcal: null,
  sizes: [],
  modifierGroupIds: [],
});

const buildRepo = (): CatalogRepository =>
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
    insertSlugAlias: vi.fn(),
  }) as unknown as CatalogRepository;

describe('GetMenuItemService', () => {
  let repo: CatalogRepository;
  let service: GetMenuItemService;

  beforeEach(() => {
    repo = buildRepo();
    service = new GetMenuItemService(repo);
  });

  it('returns the item when the repository finds it', async () => {
    const item = buildItem();
    repo.findPublishedItem = vi.fn().mockResolvedValue(item);
    const result = await runInTenantContext({ tenantId: TENANT_ID }, () =>
      service.execute(ITEM_ID),
    );
    expect(result).toBe(item);
    expect(repo.findPublishedItem).toHaveBeenCalledWith(ITEM_ID);
  });

  it('throws MenuItemNotFoundError when the item is missing or unpublished', async () => {
    repo.findPublishedItem = vi.fn().mockResolvedValue(null);
    await expect(
      runInTenantContext({ tenantId: TENANT_ID }, () => service.execute(ITEM_ID)),
    ).rejects.toBeInstanceOf(MenuItemNotFoundError);
  });

  it('throws when called without a tenant context', async () => {
    repo.findPublishedItem = vi.fn().mockResolvedValue(buildItem());
    await expect(service.execute(ITEM_ID)).rejects.toThrow(/No tenant context bound/);
  });
});
