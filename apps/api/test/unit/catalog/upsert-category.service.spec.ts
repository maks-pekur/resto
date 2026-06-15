import { describe, expect, it, vi } from 'vitest';
import { runInTenantContext } from '@resto/db';
import { LocalizedText, Slug } from '@resto/domain';
import { UpsertCategoryService } from '../../../src/contexts/catalog/application/upsert-category.service';
import type { CatalogRepository } from '../../../src/contexts/catalog/domain/ports';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const BRAND_ID = '33333333-3333-4333-8333-333333333333';

const buildRepo = (): CatalogRepository =>
  ({
    loadPublishedMenu: vi.fn(),
    findPublishedItem: vi.fn(),
    upsertCategory: vi.fn().mockResolvedValue({ id: 'category-uuid' }),
    upsertItem: vi.fn(),
    upsertModifierGroup: vi.fn(),
    upsertModifierOption: vi.fn(),
    upsertItemSize: vi.fn(),
    addToStopList: vi.fn(),
    removeFromStopList: vi.fn(),
    getMenuFirstPublishedAt: vi.fn(),
    insertSlugAlias: vi.fn(),
  }) as unknown as CatalogRepository;

const baseInput = {
  slug: Slug.parse('starters'),
  parentId: null,
  name: LocalizedText.parse({ en: 'Starters' }),
  description: null,
  sortOrder: 0,
  code: null,
};

describe('UpsertCategoryService', () => {
  it('forwards a tenant-scoped row to the repository', async () => {
    const repo = buildRepo();
    const service = new UpsertCategoryService(repo);

    const result = await runInTenantContext({ tenantId: TENANT_ID, brandId: BRAND_ID }, () =>
      service.execute(baseInput),
    );

    expect(result).toEqual({ id: 'category-uuid' });
    expect(repo.upsertCategory).toHaveBeenCalledTimes(1);
    expect(repo.upsertCategory).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      brandId: BRAND_ID,
      parentId: null,
      slug: 'starters',
      name: { en: 'Starters' },
      description: null,
      sortOrder: 0,
      code: null,
    });
  });

  it('auto-derives a slug from the localized name when none is supplied (D-4a-04)', async () => {
    const repo = buildRepo();
    const service = new UpsertCategoryService(repo);

    await runInTenantContext({ tenantId: TENANT_ID, brandId: BRAND_ID }, () =>
      service.execute({
        ...baseInput,
        slug: undefined,
        name: LocalizedText.parse({ ru: 'Закуски' }),
      }),
    );

    const call = vi.mocked(repo.upsertCategory).mock.calls[0]?.[0];
    expect(call?.slug).toBe('zakuski');
  });

  it('passes through `id` when provided (update path) and omits it otherwise (insert path)', async () => {
    const repo = buildRepo();
    const service = new UpsertCategoryService(repo);

    await runInTenantContext({ tenantId: TENANT_ID, brandId: BRAND_ID }, () =>
      service.execute({ ...baseInput, id: '22222222-2222-4222-8222-222222222222' }),
    );
    const updateCall = vi.mocked(repo.upsertCategory).mock.calls[0]?.[0];
    expect(updateCall?.id).toBe('22222222-2222-4222-8222-222222222222');

    await runInTenantContext({ tenantId: TENANT_ID, brandId: BRAND_ID }, () =>
      service.execute(baseInput),
    );
    const insertCall = vi.mocked(repo.upsertCategory).mock.calls[1]?.[0];
    expect(insertCall && 'id' in insertCall).toBe(false);
  });

  it('throws when no tenant context is bound', async () => {
    const repo = buildRepo();
    const service = new UpsertCategoryService(repo);
    await expect(service.execute(baseInput)).rejects.toThrow(/tenant context/i);
    expect(repo.upsertCategory).not.toHaveBeenCalled();
  });

  it('passes brandId from ALS to the repo when bound', async () => {
    const repo = buildRepo();
    const service = new UpsertCategoryService(repo);

    await runInTenantContext({ tenantId: TENANT_ID, brandId: BRAND_ID }, () =>
      service.execute(baseInput),
    );

    expect(repo.upsertCategory).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: BRAND_ID }),
    );
  });

  it('throws when no brand context is bound', async () => {
    const repo = buildRepo();
    const service = new UpsertCategoryService(repo);

    await expect(
      runInTenantContext({ tenantId: TENANT_ID }, () => service.execute(baseInput)),
    ).rejects.toThrow(/brand context/i);
    expect(repo.upsertCategory).not.toHaveBeenCalled();
  });
});
