import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { TenantId } from '@resto/domain';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../domain/ports';
import type { DraftDiffResponse } from './dto';

@Injectable()
export class GetDraftDiffService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(): Promise<DraftDiffResponse> {
    const ctx = requireTenantContext();
    const tenantId = TenantId.parse(ctx.tenantId);
    const { items, totalCount } = await this.repo.computeDraftDiff({ tenantId });
    const truncatedCount = Math.max(totalCount - items.length, 0);
    return {
      unpublishedCount: totalCount,
      items: items.map((i) => ({
        entityType: i.entityType,
        id: i.id,
        name: i.name,
        status: i.status,
      })),
      truncatedCount,
    };
  }
}
