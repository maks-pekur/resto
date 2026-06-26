import { Inject, Injectable } from '@nestjs/common';
import { requireBrandContext, requireTenantContext } from '@resto/db';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../domain/ports';
import type { ModifierGroupListResponse } from './dto';

@Injectable()
export class ListModifierGroupsService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(): Promise<ModifierGroupListResponse> {
    requireTenantContext();
    const brandId = requireBrandContext();
    const rows = await this.repo.listModifierGroups(brandId);
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
