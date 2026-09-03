import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../../domain/ports';
import type { SetItemModifierOptionsInput } from '../dto';

@Injectable()
export class SetItemModifierOptionsService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(input: SetItemModifierOptionsInput & { itemId: string }): Promise<{ id: string }> {
    requireTenantContext();
    return this.repo.replaceItemModifierOptions({
      itemId: input.itemId,
      optionIds: input.optionIds,
    });
  }
}
