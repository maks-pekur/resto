import { describe, expect, it, vi } from 'vitest';
import { runInTenantContext } from '@resto/db';
import { LocalizedText, Slug } from '@resto/domain';
import { UpsertCategoryService } from '../../../src/contexts/catalog/application/upsert-category.service';
import type { CatalogRepository } from '../../../src/contexts/catalog/domain/ports';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

const buildRepo = (): CatalogRepository => ({
  loadPublishedMenu: vi.fn(),
  findPublishedItem: vi.fn(),
  upsertCategory: vi.fn().mockResolvedValue({ id: 'category-uuid' }),
  upsertItem: vi.fn(),
  upsertModifier: vi.fn(),
});

const baseInput = {
  slug: Slug.parse('starters'),
  name: LocalizedText.parse({ en: 'Starters' }),
  description: null,
  sortOrder: 0,
};

describe('UpsertCategoryService', () => {
  it('forwards a tenant-scoped row to the repository', async () => {
    const repo = buildRepo();
    const service = new UpsertCategoryService(repo);

    const result = await runInTenantContext({ tenantId: TENANT_ID }, () =>
      service.execute(baseInput),
    );

    expect(result).toEqual({ id: 'category-uuid' });
    expect(repo.upsertCategory).toHaveBeenCalledTimes(1);
    expect(repo.upsertCategory).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      slug: 'starters',
      name: { en: 'Starters' },
      description: null,
      sortOrder: 0,
    });
  });

  it('passes through `id` when provided (update path) and omits it otherwise (insert path)', async () => {
    const repo = buildRepo();
    const service = new UpsertCategoryService(repo);

    await runInTenantContext({ tenantId: TENANT_ID }, () =>
      service.execute({ ...baseInput, id: '22222222-2222-4222-8222-222222222222' }),
    );
    const updateCall = vi.mocked(repo.upsertCategory).mock.calls[0]?.[0];
    expect(updateCall?.id).toBe('22222222-2222-4222-8222-222222222222');

    await runInTenantContext({ tenantId: TENANT_ID }, () => service.execute(baseInput));
    const insertCall = vi.mocked(repo.upsertCategory).mock.calls[1]?.[0];
    expect(insertCall && 'id' in insertCall).toBe(false);
  });

  it('throws when no tenant context is bound', async () => {
    const repo = buildRepo();
    const service = new UpsertCategoryService(repo);
    await expect(service.execute(baseInput)).rejects.toThrow(/tenant context/i);
    expect(repo.upsertCategory).not.toHaveBeenCalled();
  });
});
