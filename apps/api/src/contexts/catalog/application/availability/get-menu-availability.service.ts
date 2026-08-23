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
  readonly stopVersion: number;
}

@Injectable()
export class GetMenuAvailabilityService {
  constructor(
    @Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository,
    @Inject(STOP_VERSION_PORT) private readonly stopVersions: StopVersionPort,
    @Inject(DefaultLocationResolverService)
    private readonly defaultLocation: DefaultLocationResolverService,
  ) {}

  async execute(): Promise<MenuAvailabilityResult> {
    const ctx = requireTenantContext();
    const tenantId = TenantId.parse(ctx.tenantId);
    const locationId = await this.defaultLocation.resolveForTenant(tenantId);

    return withLocation(locationId, async () => {
      const [stoppedItemIds, stopVersion] = await Promise.all([
        this.repo.listStoppedItemIds(locationId),
        this.stopVersions.currentStop(locationId),
      ]);

      return { stoppedItemIds, stopVersion };
    });
  }
}
