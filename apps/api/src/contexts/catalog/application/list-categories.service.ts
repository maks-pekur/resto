import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../domain/ports';
import type { CategoryListResponse } from './dto';

@Injectable()
export class ListCategoriesService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(input: { parentId: string | null }): Promise<CategoryListResponse> {
    requireTenantContext();
    const rows = await this.repo.listCategoriesByParent(input.parentId);
    return {
      items: rows.map((r) => ({
        id: r.id,
        parentId: r.parentId,
        slug: r.slug,
        name: r.name,
        description: r.description,
        sortOrder: r.sortOrder,
        status: r.status,
      })),
    };
  }
}
