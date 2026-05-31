import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../domain/ports';
import type { ModifierGroupListResponse } from './dto';

/**
 * Phase 4b D-4b-07: list modifier groups with option-count + usage-count.
 * UI shows the counts in the library table.
 */
@Injectable()
export class ListModifierGroupsService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(): Promise<ModifierGroupListResponse> {
    requireTenantContext();
    const rows = await this.repo.listModifierGroups();
    return {
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        minSelectable: r.minSelectable,
        maxSelectable: r.maxSelectable,
        isRequired: r.isRequired,
        optionCount: r.optionCount,
        usageCount: r.usageCount,
      })),
    };
  }
}
