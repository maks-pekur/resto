import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../../domain/ports';
import type { SetItemModifierGroupsInput } from '../dto';

@Injectable()
export class SetItemModifierGroupsService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(input: SetItemModifierGroupsInput & { itemId: string }): Promise<{ id: string }> {
    requireTenantContext();
    return this.repo.replaceItemModifierGroups({
      itemId: input.itemId,
      modifierGroupIds: input.modifierGroupIds,
    });
  }
}
