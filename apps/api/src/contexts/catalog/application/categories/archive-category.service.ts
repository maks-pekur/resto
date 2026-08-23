import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../../domain/ports';
import { MenuCategoryNotFoundError } from '../../domain/errors';

@Injectable()
export class ArchiveCategoryService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(id: string): Promise<void> {
    requireTenantContext();
    const { found } = await this.repo.archiveCategory(id);
    if (!found) throw new MenuCategoryNotFoundError(id);
  }
}
