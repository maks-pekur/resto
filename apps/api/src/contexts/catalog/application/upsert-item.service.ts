import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../domain/ports';
import type { UpsertItemInput } from './dto';

@Injectable()
export class UpsertItemService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(input: UpsertItemInput): Promise<{ id: string }> {
    const ctx = requireTenantContext();
    return this.repo.upsertItem({
      ...(input.id ? { id: input.id } : {}),
      tenantId: ctx.tenantId,
      categoryId: input.categoryId,
      slug: input.slug,
      name: input.name,
      description: input.description,
      basePrice: input.basePrice,
      currency: input.currency,
      imageS3Key: input.imageS3Key,
      allergens: input.allergens,
      status: input.status,
      sortOrder: input.sortOrder,
    });
  }
}
