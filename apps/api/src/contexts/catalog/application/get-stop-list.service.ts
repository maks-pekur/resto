import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../domain/ports';
import type { StopListResponse } from './dto';

@Injectable()
export class GetStopListService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(): Promise<StopListResponse> {
    requireTenantContext();
    const rows = await this.repo.listStopListWithStoppedAt();
    return {
      items: rows.map((r) => ({
        id: r.id,
        itemId: r.itemId,
        itemName: r.itemName,
        categoryName: r.categoryName,
        stoppedAt: r.stoppedAt,
        reason: r.reason,
      })),
    };
  }
}
