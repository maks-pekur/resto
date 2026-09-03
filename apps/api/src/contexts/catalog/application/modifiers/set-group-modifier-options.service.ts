import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../../domain/ports';
import type { SetGroupModifierOptionsInput } from '../dto';

@Injectable()
export class SetGroupModifierOptionsService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(
    input: SetGroupModifierOptionsInput & { modifierGroupId: string },
  ): Promise<{ id: string }> {
    requireTenantContext();
    return this.repo.replaceGroupModifierOptions({
      modifierGroupId: input.modifierGroupId,
      optionIds: input.optionIds,
      defaultOptionIds: input.defaultOptionIds,
    });
  }
}
