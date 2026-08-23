import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext, type MenuItemPhoto } from '@resto/db';
import { Currency, MoneyAmount } from '@resto/domain';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../../domain/ports';
import { deriveSlugFromName } from '../slug-util';
import type { UpsertItemInput } from '../dto';

@Injectable()
export class UpsertItemService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(input: UpsertItemInput): Promise<{ id: string }> {
    // RestoZodValidationPipe already validated constraints via MoneyAmountValue /
    // CurrencyValue (packages/domain/src/money.ts). Cast at the HTTP→service
    // boundary per ADR-0020 I-7.
    const basePrice = input.basePrice as MoneyAmount;
    const currency = input.currency as Currency;
    const ctx = requireTenantContext();
    // D-4a-04 / RESEARCH.md Pattern 4: auto-derive slug from name when
    // operator did not supply one. Slug-change alias insertion happens at the
    // repository layer (single transaction with the upsert so the alias and
    // the new slug commit atomically).
    const slug = input.slug ?? deriveSlugFromName(input.name);
    // DTO `photos` is `MenuItemPhotoSchema[]` (Zod) — structurally equivalent
    // to the DB `MenuItemPhoto` interface but with `optional()` fields typed
    // as `T | undefined` rather than `T?`. Strip undefineds for
    // exactOptionalPropertyTypes compatibility.
    const photos: MenuItemPhoto[] = input.photos.map((p) => {
      const photo: MenuItemPhoto = { s3Key: p.s3Key, sortOrder: p.sortOrder };
      if (p.alt !== undefined) photo.alt = p.alt;
      if (p.width !== undefined) photo.width = p.width;
      if (p.height !== undefined) photo.height = p.height;
      if (p.isPrimary !== undefined) photo.isPrimary = p.isPrimary;
      return photo;
    });
    const result = await this.repo.upsertItem({
      ...(input.id ? { id: input.id } : {}),
      tenantId: ctx.tenantId,
      categoryId: input.categoryId,
      slug,
      name: input.name,
      description: input.description,
      basePrice,
      currency,
      photos,
      allergens: input.allergens,
      ingredients: input.ingredients,
      metaTitle: input.metaTitle,
      metaDescription: input.metaDescription,
      proteins: input.proteins,
      fats: input.fats,
      carbs: input.carbs,
      kcal: input.kcal,
      nutritionEstimated: input.nutritionEstimated,
      source: input.source,
      needsReview: input.needsReview,
      sourceExternalId: input.sourceExternalId,
      status: input.status,
      sortOrder: input.sortOrder,
      code: input.code,
      weight: input.weight,
      measureUnit: input.measureUnit,
    });
    return { id: result.id };
  }
}
