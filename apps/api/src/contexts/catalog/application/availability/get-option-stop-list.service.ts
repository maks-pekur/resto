import { Inject, Injectable } from '@nestjs/common';
import { requireLocationContext, requireTenantContext } from '@resto/db';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../../domain/ports';
import type { OptionStopListResponse } from '../dto';

@Injectable()
export class GetOptionStopListService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(): Promise<OptionStopListResponse> {
    requireTenantContext();
    const locationId = requireLocationContext();
    const rows = await this.repo.listOptionStopListWithStoppedAt(locationId);
    return {
      items: rows.map((r) => ({
        id: r.id,
        optionId: r.optionId,
        optionName: r.optionName,
        imageUrl: r.imageUrl,
        stoppedAt: r.stoppedAt,
        reason: r.reason,
      })),
    };
  }
}
