import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../../domain/ports';
import type { ModifierOptionUsageResponse } from '../dto';

@Injectable()
export class GetModifierOptionUsageService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(id: string): Promise<ModifierOptionUsageResponse> {
    requireTenantContext();
    const usage = await this.repo.getModifierOptionUsage(id);
    return {
      groups: usage.groups.map((g) => ({ id: g.id, name: g.name })),
      dishesAttached: usage.dishesAttached.map((d) => ({ id: d.id, name: d.name })),
      dishesInComposition: usage.dishesInComposition.map((d) => ({ id: d.id, name: d.name })),
    };
  }
}
