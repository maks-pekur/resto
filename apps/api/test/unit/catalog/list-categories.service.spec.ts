import { describe, expect, it, vi } from 'vitest';
import { runInTenantContext } from '@resto/db';
import { ListCategoriesService } from '../../../src/contexts/catalog/application/list-categories.service';
import type { CatalogRepository } from '../../../src/contexts/catalog/domain/ports';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

const buildRepo = (): CatalogRepository =>
  ({
    listCategoriesByParent: vi.fn().mockResolvedValue([]),
  }) as unknown as CatalogRepository;

describe('ListCategoriesService', () => {
  it('forwards parentId=undefined to repo (admin tree view default → all categories)', async () => {
    const repo = buildRepo();
    const service = new ListCategoriesService(repo);

    await runInTenantContext({ tenantId: TENANT_ID }, () =>
      service.execute({ parentId: undefined }),
    );

    expect(repo.listCategoriesByParent).toHaveBeenCalledWith(undefined);
  });

  it('forwards parentId=null to repo (top-level only)', async () => {
    const repo = buildRepo();
    const service = new ListCategoriesService(repo);

    await runInTenantContext({ tenantId: TENANT_ID }, () => service.execute({ parentId: null }));

    expect(repo.listCategoriesByParent).toHaveBeenCalledWith(null);
  });

  it('forwards a uuid parentId to repo (children of that parent)', async () => {
    const repo = buildRepo();
    const service = new ListCategoriesService(repo);
    const parentUuid = '22222222-2222-4222-8222-222222222222';

    await runInTenantContext({ tenantId: TENANT_ID }, () =>
      service.execute({ parentId: parentUuid }),
    );

    expect(repo.listCategoriesByParent).toHaveBeenCalledWith(parentUuid);
  });

  it('throws when no tenant context is bound', async () => {
    const repo = buildRepo();
    const service = new ListCategoriesService(repo);
    await expect(service.execute({ parentId: undefined })).rejects.toThrow(/tenant context/i);
    expect(repo.listCategoriesByParent).not.toHaveBeenCalled();
  });
});
