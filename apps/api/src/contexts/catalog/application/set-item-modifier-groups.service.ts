import { Inject, Injectable } from '@nestjs/common';
import { requireBrandContext, requireTenantContext } from '@resto/db';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../domain/ports';
import type { SetItemModifierGroupsInput } from './dto';

@Injectable()
export class SetItemModifierGroupsService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(input: SetItemModifierGroupsInput & { itemId: string }): Promise<{ id: string }> {
    requireTenantContext();
    const brandId = requireBrandContext();
    return this.repo.replaceItemModifierGroups({
      itemId: input.itemId,
      brandId,
      modifierGroupIds: input.modifierGroupIds,
    });
  }
}
