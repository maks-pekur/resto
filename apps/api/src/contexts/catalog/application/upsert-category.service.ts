import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../domain/ports';
import { deriveSlugFromName } from './slug-util';
import type { UpsertCategoryInput } from './dto';

@Injectable()
export class UpsertCategoryService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(input: UpsertCategoryInput): Promise<{ id: string }> {
    const ctx = requireTenantContext();
    // D-4a-04 / RESEARCH.md Pattern 4: when no slug is supplied, derive one
    // by transliterating the localized name. The HTTP DB CHECK constraint
    // (^[a-z0-9][a-z0-9-]*$) is the ultimate guard; this helper produces a
    // value that matches.
    const slug = input.slug ?? deriveSlugFromName(input.name);
    return this.repo.upsertCategory({
      ...(input.id ? { id: input.id } : {}),
      tenantId: ctx.tenantId,
      parentId: input.parentId,
      slug,
      name: input.name,
      description: input.description,
      sortOrder: input.sortOrder,
      code: input.code,
    });
  }
}
