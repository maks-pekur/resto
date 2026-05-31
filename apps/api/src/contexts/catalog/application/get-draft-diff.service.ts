import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { TenantId } from '@resto/domain';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../domain/ports';
import type { DraftDiffResponse } from './dto';

/**
 * Phase 4b D-4b-07 / Open Question #2 + #5: draft-diff feeds the sticky
 * publish bar. MVP-1 scope is items-only — categories and modifier-groups
 * are wired in once their status surfaces converge with items.
 *
 * Items qualify as "unpublished changes" when:
 *   - status = 'draft' (never published yet), or
 *   - status = 'archived' (operator archived since the last publish), or
 *   - status = 'published' AND updated_at > tenants.menu_first_published_at
 *     (an existing item was edited; "modified" badge).
 *
 * Cap at 100 rows; surplus is reported via `truncatedCount`.
 */
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
