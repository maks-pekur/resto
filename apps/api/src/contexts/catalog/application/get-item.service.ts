import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../domain/ports';
import { MenuItemNotFoundError } from '../domain/errors';
import type { ItemDetailResponse } from './dto';

/**
 * Phase 4b D-4b-07: load a single item with embedded sizes + modifierGroupIds
 * for the editor page. RLS-scoped via `CatalogRepository.getItemById`
 * (ADR-0020 I-1).
 */
@Injectable()
export class GetItemService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(input: { id: string }): Promise<ItemDetailResponse> {
    requireTenantContext();
    const row = await this.repo.getItemById(input.id);
    if (!row) throw new MenuItemNotFoundError(input.id);
    return {
      id: row.id,
      categoryId: row.categoryId,
      slug: row.slug,
      name: row.name,
      description: row.description,
      basePrice: row.basePrice,
      currency: row.currency,
      photos: row.photos.map((p) => ({
        s3Key: p.s3Key,
        sortOrder: p.sortOrder,
        ...(p.alt !== undefined ? { alt: p.alt } : {}),
        ...(p.width !== undefined ? { width: p.width } : {}),
        ...(p.height !== undefined ? { height: p.height } : {}),
        ...(p.isPrimary !== undefined ? { isPrimary: p.isPrimary } : {}),
      })),
      allergens: row.allergens ? [...row.allergens] : null,
      proteins: row.proteins,
      fats: row.fats,
      carbs: row.carbs,
      kcal: row.kcal,
      nutritionEstimated: row.nutritionEstimated,
      source: row.source,
      needsReview: row.needsReview,
      sourceExternalId: row.sourceExternalId,
      status: row.status,
      sortOrder: row.sortOrder,
      sizes: row.sizes.map((s) => ({
        id: s.id,
        name: s.name,
        price: s.price,
        isDefault: s.isDefault,
        sortOrder: s.sortOrder,
      })),
      modifierGroupIds: [...row.modifierGroupIds],
    };
  }
}
