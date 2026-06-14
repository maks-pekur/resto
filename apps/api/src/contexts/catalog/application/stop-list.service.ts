import { Inject, Injectable, Logger } from '@nestjs/common';
import { requireBrandContext, requireTenantContext, TenantAwareDb } from '@resto/db';
import { TenantId } from '@resto/domain';
import { appendToOutbox, buildEnvelope, ItemStoppedV1, ItemUnstoppedV1 } from '@resto/events';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../domain/ports';
import { StopListItemNotFoundError } from '../domain/errors';
import type { StopItemInput } from './dto';

@Injectable()
export class StopListService {
  private readonly logger = new Logger(StopListService.name);

  constructor(
    @Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository,
    @Inject(TenantAwareDb) private readonly db: TenantAwareDb,
  ) {}

  async stop(input: StopItemInput): Promise<{ id: string }> {
    const ctx = requireTenantContext();
    const tenantId = TenantId.parse(ctx.tenantId);
    const brandId = requireBrandContext();

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

    this.logger.log({ tenantId, itemId: input.itemId, itemSlug }, 'Item stopped.');
    return { id };
  }

  async unstop(itemId: string): Promise<void> {
    const ctx = requireTenantContext();
    const tenantId = TenantId.parse(ctx.tenantId);
    const brandId = requireBrandContext();

    const itemSlug = await this.db.withTenant(async (tx) => {
      const result = await this.repo.removeFromStopList({ itemId, brandId });
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

    this.logger.log({ tenantId, itemId, itemSlug }, 'Item unstopped.');
  }
}
