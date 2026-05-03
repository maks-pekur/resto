import { describe, expect, it, vi } from 'vitest';
import { runInTenantContext } from '@resto/db';
import { Currency, LocalizedText, MoneyAmount, Slug } from '@resto/domain';
import { UpsertItemService } from '../../../src/contexts/catalog/application/upsert-item.service';
import type { CatalogRepository } from '../../../src/contexts/catalog/domain/ports';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const CATEGORY_ID = '22222222-2222-4222-8222-222222222222';

const buildRepo = (): CatalogRepository => ({
  loadPublishedMenu: vi.fn(),
  findPublishedItem: vi.fn(),
  upsertCategory: vi.fn(),
  upsertItem: vi.fn().mockResolvedValue({ id: 'item-uuid' }),
  upsertModifier: vi.fn(),
});

const baseInput = {
  categoryId: CATEGORY_ID,
  slug: Slug.parse('caesar-salad'),
  name: LocalizedText.parse({ en: 'Caesar Salad' }),
  description: null,
  basePrice: MoneyAmount.parse('12.50'),
  currency: Currency.parse('USD'),
  imageS3Key: null,
  allergens: null,
  status: 'draft' as const,
  sortOrder: 0,
};

describe('UpsertItemService', () => {
  it('forwards a tenant-scoped row including category and price details', async () => {
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
      imageS3Key: null,
      allergens: null,
      status: 'draft',
      sortOrder: 0,
    });
  });

  it('omits id from the row when not provided', async () => {
    const repo = buildRepo();
    const service = new UpsertItemService(repo);
    await runInTenantContext({ tenantId: TENANT_ID }, () => service.execute(baseInput));
    const call = vi.mocked(repo.upsertItem).mock.calls[0]?.[0];
    expect(call && 'id' in call).toBe(false);
  });

  it('preserves status="published" and allergens list when provided', async () => {
    const repo = buildRepo();
    const service = new UpsertItemService(repo);
    await runInTenantContext({ tenantId: TENANT_ID }, () =>
      service.execute({
        ...baseInput,
        status: 'published',
        allergens: ['gluten', 'dairy'],
        imageS3Key: 'tenants/11/items/item.jpg',
      }),
    );
    const call = vi.mocked(repo.upsertItem).mock.calls[0]?.[0];
    expect(call?.status).toBe('published');
    expect(call?.allergens).toEqual(['gluten', 'dairy']);
    expect(call?.imageS3Key).toBe('tenants/11/items/item.jpg');
  });

  it('throws when no tenant context is bound', async () => {
    const service = new UpsertItemService(buildRepo());
    await expect(service.execute(baseInput)).rejects.toThrow(/tenant context/i);
  });
});
