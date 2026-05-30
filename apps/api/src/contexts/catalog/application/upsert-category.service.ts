import { Inject, Injectable } from '@nestjs/common';
import { getBrandId, requireTenantContext } from '@resto/db';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../domain/ports';
import type { UpsertCategoryInput } from './dto';

@Injectable()
export class UpsertCategoryService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(input: UpsertCategoryInput): Promise<{ id: string }> {
    const ctx = requireTenantContext();
    const brandId = getBrandId() ?? null;
    // 04A-05: slug optional in DTO (auto-derived from name in plan 06 service).
    // Until plan 06 lands the transliteration helper, fall back to a placeholder
    // so the repository row's `slug: string` invariant holds.
    return this.repo.upsertCategory({
      ...(input.id ? { id: input.id } : {}),
      tenantId: ctx.tenantId,
      brandId,
      slug: input.slug ?? '',
      name: input.name,
      description: input.description,
      sortOrder: input.sortOrder,
    });
  }
}
