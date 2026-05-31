import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../domain/ports';
import { MenuItemNotFoundError } from '../domain/errors';

/**
 * Phase 4b D-4b-07: soft-archive an item. Sets status='archived' via the
 * repository's tenant-scoped UPDATE. Idempotent on already-archived rows.
 * Throws `MenuItemNotFoundError` when the id is not visible to this tenant.
 */
@Injectable()
export class ArchiveItemService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(id: string): Promise<void> {
    requireTenantContext();
    const { found } = await this.repo.archiveItem(id);
    if (!found) throw new MenuItemNotFoundError(id);
  }
}
