import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../domain/ports';
import type { CategoryListResponse } from './dto';

/**
 * Phase 4b D-4b-07: list categories for the admin UI. Filters by parentId
 * (null = top-level); ordering is sortOrder ASC then slug ASC. RLS
 * double-enforcement happens inside `CatalogRepository.listCategoriesByParent`
 * via `ScopedTx` (ADR-0020 I-1).
 */
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
