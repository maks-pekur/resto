import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext, withLocation } from '@resto/db';
import { TenantId } from '@resto/domain';
import { DefaultLocationResolverService } from '../default-location-resolver.service';
import {
  CATALOG_REPOSITORY,
  STOP_VERSION_PORT,
  type CatalogRepository,
  type StopVersionPort,
} from '../../domain/ports';

export interface MenuAvailabilityResult {
  readonly stoppedItemIds: string[];
  readonly stoppedIngredientIds: string[];
  readonly stopVersion: number;
  readonly locationId: string;
}

@Injectable()
export class GetMenuAvailabilityService {
  constructor(
    @Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository,
    @Inject(STOP_VERSION_PORT) private readonly stopVersions: StopVersionPort,
    @Inject(DefaultLocationResolverService)
    private readonly defaultLocation: DefaultLocationResolverService,
  ) {}

  async execute(locationId?: string): Promise<MenuAvailabilityResult> {
    const ctx = requireTenantContext();
    const tenantId = TenantId.parse(ctx.tenantId);
    const answeringLocationId =
      locationId ?? (await this.defaultLocation.resolveForTenant(tenantId));

    return withLocation(answeringLocationId, async () => {
      const [stoppedItemIds, stoppedIngredientIds, stopVersion] = await Promise.all([
        this.repo.listStoppedItemIds(answeringLocationId),
        this.repo.listStoppedIngredientIds(answeringLocationId),
        this.stopVersions.currentStop(answeringLocationId),
      ]);

      return { stoppedItemIds, stoppedIngredientIds, stopVersion, locationId: answeringLocationId };
    });
  }
}
