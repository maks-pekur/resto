import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../../domain/ports';
import type { ModifierGroupListResponse } from '../dto';

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
        display: r.display,
        behaviour: r.behaviour,
        isRequired: r.isRequired,
        maxSelectable: r.maxSelectable,
        optionCount: r.optionCount,
        usageCount: r.usageCount,
      })),
    };
  }
}
