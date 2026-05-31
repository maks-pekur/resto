import { Inject, Injectable, Logger } from '@nestjs/common';
import { getBrandId, requireTenantContext, TenantAwareDb } from '@resto/db';
import { TenantId } from '@resto/domain';
import { appendToOutbox, buildEnvelope, ItemStoppedV1, ItemUnstoppedV1 } from '@resto/events';
import {
  CATALOG_CACHE_PORT,
  CATALOG_REPOSITORY,
  MENU_VERSION_PORT,
  type CatalogCachePort,
  type CatalogRepository,
  type MenuVersionPort,
} from '../domain/ports';
import { StopListItemNotFoundError } from '../domain/errors';
import type { StopItemInput } from './dto';

/**
 * D-4a-10: stop-list write surface.
 *
 * - `stop` inserts a row in `menu_stop_list` (or no-ops on conflict) and
 *   emits `ItemStoppedV1` in the same transaction.
 * - `unstop` deletes the matching row (migration 0040 grants DELETE on
 *   `menu_stop_list` to `resto_app`) and emits `ItemUnstoppedV1`.
 *
 * After the transaction commits, the cache key for the current menu
 * version is invalidated (Pattern 2 Option B per RESEARCH.md) so the
 * next read picks up the stop overlay. The version itself is NOT
 * bumped — stop-list is an operational overlay, not an editorial
 * publish.
 */
@Injectable()
export class StopListService {
  private readonly logger = new Logger(StopListService.name);

  constructor(
    @Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository,
    @Inject(CATALOG_CACHE_PORT) private readonly cachePort: CatalogCachePort,
    @Inject(MENU_VERSION_PORT) private readonly versions: MenuVersionPort,
    @Inject(TenantAwareDb) private readonly db: TenantAwareDb,
  ) {}

  async stop(input: StopItemInput): Promise<{ id: string }> {
    const ctx = requireTenantContext();
    const tenantId = TenantId.parse(ctx.tenantId);
    const brandId = getBrandId() ?? null;

    const { id, itemSlug } = await this.db.withTenant(async (tx) => {
      const result = await this.repo.addToStopList({
        itemId: input.itemId,
        tenantId,
        brandId,
        reason: input.reason,
        stoppedByUserId: null,
      });
      await appendToOutbox(tx, {
        envelope: buildEnvelope(
          ItemStoppedV1,
          {
            tenantId,
            itemId: input.itemId,
            itemSlug: result.itemSlug,
            stoppedByUserId: null,
            stoppedAt: new Date(),
          },
          { tenantId },
        ),
      });
      return result;
    });

    // RESEARCH.md Pattern 2 Option B: invalidate the current cache key so
    // the next /v1/menu read repopulates with the new stop overlay.
    const currentVersion = await this.versions.current(tenantId);
    await this.cachePort.invalidate(tenantId, currentVersion, brandId);
    this.logger.log({ tenantId, itemId: input.itemId, itemSlug }, 'Item stopped.');
    return { id };
  }

  async unstop(itemId: string): Promise<void> {
    const ctx = requireTenantContext();
    const tenantId = TenantId.parse(ctx.tenantId);
    const brandId = getBrandId() ?? null;

    const itemSlug = await this.db.withTenant(async (tx) => {
      const result = await this.repo.removeFromStopList({ itemId });
      if (!result.removed) {
        throw new StopListItemNotFoundError(itemId);
      }
      const slug = result.itemSlug ?? '';
      await appendToOutbox(tx, {
        envelope: buildEnvelope(
          ItemUnstoppedV1,
          {
            tenantId,
            itemId,
            itemSlug: slug,
            unstoppedByUserId: null,
          },
          { tenantId },
        ),
      });
      return slug;
    });

    const currentVersion = await this.versions.current(tenantId);
    await this.cachePort.invalidate(tenantId, currentVersion, brandId);
    this.logger.log({ tenantId, itemId, itemSlug }, 'Item unstopped.');
  }
}
