import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../domain/ports';
import { MenuCategoryNotFoundError } from '../domain/errors';

/**
 * Phase 4b D-4b-07: soft-archive a category. Sets status='archived' via the
 * repository's tenant-scoped UPDATE. Idempotent on already-archived rows.
 * Throws `MenuCategoryNotFoundError` if the id is not visible to this
 * tenant (RLS-backed 404 — sibling tenants get the same response).
 */
@Injectable()
export class ArchiveCategoryService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(id: string): Promise<void> {
    requireTenantContext();
    const { found } = await this.repo.archiveCategory(id);
    if (!found) throw new MenuCategoryNotFoundError(id);
  }
}
