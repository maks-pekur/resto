import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../../domain/ports';
import { MenuModifierGroupNotFoundError } from '../../domain/errors';
import type { ModifierGroupDetailResponse } from '../dto';

@Injectable()
export class GetModifierGroupService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(input: { id: string }): Promise<ModifierGroupDetailResponse> {
    requireTenantContext();
    const row = await this.repo.getModifierGroupById(input.id);
    if (!row) throw new MenuModifierGroupNotFoundError(input.id);
    return {
      id: row.id,
      name: row.name,
      minSelectable: row.minSelectable,
      maxSelectable: row.maxSelectable,
      isRequired: row.isRequired,
      options: row.options.map((o) => ({
        id: o.id,
        name: o.name,
        priceDelta: o.priceDelta,
        defaultAmount: o.defaultAmount,
        freeAmount: o.freeAmount,
        sortOrder: o.sortOrder,
      })),
    };
  }
}
