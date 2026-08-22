import { describe, expect, it, vi } from 'vitest';
import { runInTenantContext } from '@resto/db';
import { Currency, LocalizedText, MoneyAmount, Slug } from '@resto/domain';
import { UpsertItemService } from '../../../src/contexts/catalog/application/upsert-item.service';
import type { CatalogRepository } from '../../../src/contexts/catalog/domain/ports';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const CATEGORY_ID = '22222222-2222-4222-8222-222222222222';

const buildRepo = (): CatalogRepository =>
  ({
    loadPublishedMenu: vi.fn(),
    findPublishedItem: vi.fn(),
    upsertCategory: vi.fn(),
    upsertItem: vi.fn().mockResolvedValue({ id: 'item-uuid' }),
    upsertModifierGroup: vi.fn(),
    upsertModifierOption: vi.fn(),
    upsertItemSize: vi.fn(),
    addToStopList: vi.fn(),
    removeFromStopList: vi.fn(),
    getMenuFirstPublishedAt: vi.fn(),
    insertSlugAlias: vi.fn(),
  }) as unknown as CatalogRepository;

const baseInput = {
  categoryId: CATEGORY_ID,
  slug: Slug.parse('caesar-salad'),
  name: LocalizedText.parse({ en: 'Caesar Salad' }),
  description: null,
  basePrice: MoneyAmount.parse('12.50'),
  currency: Currency.parse('USD'),
  photos: [],
  allergens: null,
  ingredients: ['romaine', 'parmesan'],
  metaTitle: 'Caesar Salad — Bistro Lyon',
  metaDescription: 'Crisp romaine, parmesan, anchovy dressing.',
  proteins: null,
  fats: null,
  carbs: null,
  kcal: null,
  nutritionEstimated: false,
  source: 'manual' as const,
  needsReview: false,
  sourceExternalId: null,
  status: 'draft' as const,
  sortOrder: 0,
  code: null,
  weight: null,
  measureUnit: null,
};

describe('UpsertItemService', () => {
  it('forwards a tenant-scoped row including category, price, and photos', async () => {
    const repo = buildRepo();
    const service = new UpsertItemService(repo);

    const result = await runInTenantContext({ tenantId: TENANT_ID }, () =>
      service.execute(baseInput),
    );

    expect(result).toEqual({ id: 'item-uuid' });
    expect(repo.upsertItem).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      categoryId: CATEGORY_ID,
      slug: 'caesar-salad',
      name: { en: 'Caesar Salad' },
      description: null,
      basePrice: '12.50',
      currency: 'USD',
      photos: [],
      allergens: null,
      ingredients: ['romaine', 'parmesan'],
      metaTitle: 'Caesar Salad — Bistro Lyon',
      metaDescription: 'Crisp romaine, parmesan, anchovy dressing.',
      proteins: null,
      fats: null,
      carbs: null,
      kcal: null,
      nutritionEstimated: false,
      source: 'manual',
      needsReview: false,
      sourceExternalId: null,
      status: 'draft',
      sortOrder: 0,
      code: null,
      weight: null,
      measureUnit: null,
    });
  });

  it('omits id from the row when not provided', async () => {
    const repo = buildRepo();
    const service = new UpsertItemService(repo);
    await runInTenantContext({ tenantId: TENANT_ID }, () => service.execute(baseInput));
    const call = vi.mocked(repo.upsertItem).mock.calls[0]?.[0];
    expect(call && 'id' in call).toBe(false);
  });

  it('forwards the full photos array to the repo (no first-photo shim)', async () => {
    const repo = buildRepo();
    const service = new UpsertItemService(repo);
    await runInTenantContext({ tenantId: TENANT_ID }, () =>
      service.execute({
        ...baseInput,
        status: 'published',
        allergens: ['gluten', 'dairy'],
        photos: [
          { s3Key: 'tenants/11/items/item.jpg', sortOrder: 0 },
          { s3Key: 'tenants/11/items/item-2.jpg', sortOrder: 1 },
        ],
      }),
    );
    const call = vi.mocked(repo.upsertItem).mock.calls[0]?.[0];
    expect(call?.status).toBe('published');
    expect(call?.allergens).toEqual(['gluten', 'dairy']);
    expect(call?.photos).toHaveLength(2);
    expect(call?.photos[0]?.s3Key).toBe('tenants/11/items/item.jpg');
  });

  it('auto-derives a slug from the localized name when none is supplied (D-4a-04)', async () => {
    const repo = buildRepo();
    const service = new UpsertItemService(repo);
    await runInTenantContext({ tenantId: TENANT_ID }, () =>
      service.execute({
        ...baseInput,
        slug: undefined,
        name: LocalizedText.parse({ ru: 'Цезарь с курицей' }),
      }),
    );
    const call = vi.mocked(repo.upsertItem).mock.calls[0]?.[0];
    expect(call?.slug).toBe('cezar-s-kuricey');
  });

  it('throws when no tenant context is bound', async () => {
    const service = new UpsertItemService(buildRepo());
    await expect(service.execute(baseInput)).rejects.toThrow(/tenant context/i);
  });
});
