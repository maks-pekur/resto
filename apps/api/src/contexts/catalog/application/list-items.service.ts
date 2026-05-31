import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { CATALOG_REPOSITORY, type CatalogRepository, type ItemStatusFilter } from '../domain/ports';
import type { ItemListResponse } from './dto';

@Injectable()
export class ListItemsService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(input: {
    status?: ItemStatusFilter;
    categoryId?: string | null;
    q?: string | null;
    limit?: number;
    offset?: number;
  }): Promise<ItemListResponse> {
    requireTenantContext();
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    const offset = Math.max(input.offset ?? 0, 0);
    const status: ItemStatusFilter = input.status ?? 'active';
    const result = await this.repo.listItems({
      status,
      categoryId: input.categoryId ?? null,
      q: input.q ?? null,
      limit,
      offset,
    });
    return {
      items: result.rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        categoryId: r.categoryId,
        categoryName: r.categoryName,
        parentCategoryName: r.parentCategoryName,
        photo: r.photo,
        basePrice: r.basePrice,
        currency: r.currency,
        status: r.status,
        hasSizes: r.hasSizes,
        stoppedAt: r.stoppedAt,
        sortOrder: r.sortOrder,
      })),
      total: result.total,
      limit,
      offset,
    };
  }
}
