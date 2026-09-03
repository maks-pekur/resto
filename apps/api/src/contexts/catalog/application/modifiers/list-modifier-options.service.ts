import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../../domain/ports';
import type { ModifierOptionListResponse } from '../dto';

@Injectable()
export class ListModifierOptionsService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(): Promise<ModifierOptionListResponse> {
    requireTenantContext();
    const rows = await this.repo.listModifierOptions();
    return {
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        priceDelta: r.priceDelta,
        imageUrl: r.imageUrl,
        imageS3Key: r.imageS3Key,
        groupCount: r.groupCount,
        dishCount: r.dishCount,
      })),
    };
  }
}
