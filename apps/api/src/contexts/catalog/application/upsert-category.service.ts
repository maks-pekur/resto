import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../domain/ports';
import type { UpsertCategoryInput } from './dto';

@Injectable()
export class UpsertCategoryService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(input: UpsertCategoryInput): Promise<{ id: string }> {
    const ctx = requireTenantContext();
    return this.repo.upsertCategory({
      ...(input.id ? { id: input.id } : {}),
      tenantId: ctx.tenantId,
      slug: input.slug,
      name: input.name,
      description: input.description,
      sortOrder: input.sortOrder,
    });
  }
}
