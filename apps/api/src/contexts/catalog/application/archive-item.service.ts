import { Inject, Injectable } from '@nestjs/common';
import { requireBrandContext, requireTenantContext } from '@resto/db';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../domain/ports';
import { MenuItemNotFoundError } from '../domain/errors';

@Injectable()
export class ArchiveItemService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(id: string): Promise<void> {
    requireTenantContext();
    const brandId = requireBrandContext();
    const { found } = await this.repo.archiveItem(id, brandId);
    if (!found) throw new MenuItemNotFoundError(id);
  }
}
