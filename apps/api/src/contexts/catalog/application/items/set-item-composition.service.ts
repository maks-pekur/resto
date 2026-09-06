import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../../domain/ports';
import type { SetItemCompositionInput } from '../dto';

@Injectable()
export class SetItemCompositionService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  // D-14/D-15/D-16: the repository always writes both payloads together, so a mode
  // switch can never leave the other stale — the inactive mode's payload is sent empty.
  async execute(input: SetItemCompositionInput & { itemId: string }): Promise<{ id: string }> {
    requireTenantContext();
    return this.repo.setItemComposition({
      itemId: input.itemId,
      mode: input.mode,
      text: input.mode === 'text' ? input.text : [],
      lines: input.mode === 'assembled' ? input.lines : [],
    });
  }
}
