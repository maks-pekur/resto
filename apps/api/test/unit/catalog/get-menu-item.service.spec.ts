import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runInTenantContext } from '@resto/db';
import { Currency, MenuCategoryId, MenuItemId } from '@resto/domain';
import { GetMenuItemService } from '../../../src/contexts/catalog/application/get-menu-item.service';
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
  imageUrl: null,
  allergens: [],
  sortOrder: 0,
  variants: [],
  modifierIds: [],
});

const buildRepo = (): CatalogRepository => ({
  loadPublishedMenu: vi.fn(),
  findPublishedItem: vi.fn(),
  upsertCategory: vi.fn(),
  upsertItem: vi.fn(),
  upsertModifier: vi.fn(),
});

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
    const result = await service.execute(ITEM_ID);
    expect(result).toBe(item);
    expect(repo.findPublishedItem).toHaveBeenCalledWith(ITEM_ID, null);
  });

  it('throws MenuItemNotFoundError when the item is missing or unpublished', async () => {
    repo.findPublishedItem = vi.fn().mockResolvedValue(null);
    await expect(service.execute(ITEM_ID)).rejects.toBeInstanceOf(MenuItemNotFoundError);
  });

  it('passes brandId from ALS to the repo findPublishedItem call', async () => {
    const repo = buildRepo();
    repo.findPublishedItem = vi.fn().mockResolvedValue(buildItem());
    const service = new GetMenuItemService(repo);

    await runInTenantContext(
      { tenantId: TENANT_ID, brandId: '33333333-3333-4333-8333-333333333333' },
      () => service.execute(ITEM_ID),
    );

    expect(repo.findPublishedItem).toHaveBeenCalledWith(
      ITEM_ID,
      '33333333-3333-4333-8333-333333333333',
    );
  });
});
