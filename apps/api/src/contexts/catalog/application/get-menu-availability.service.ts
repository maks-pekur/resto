import { Inject, Injectable } from '@nestjs/common';
import { requireBrandContext, requireTenantContext } from '@resto/db';
import {
  CATALOG_REPOSITORY,
  STOP_VERSION_PORT,
  type CatalogRepository,
  type StopVersionPort,
} from '../domain/ports';

export interface MenuAvailabilityResult {
  readonly stoppedItemIds: string[];
  readonly stopVersion: number;
}

@Injectable()
export class GetMenuAvailabilityService {
  constructor(
    @Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository,
    @Inject(STOP_VERSION_PORT) private readonly stopVersions: StopVersionPort,
  ) {}

  async execute(): Promise<MenuAvailabilityResult> {
    requireTenantContext();
    const brandId = requireBrandContext();

    const [stoppedItemIds, stopVersion] = await Promise.all([
      this.repo.listStoppedItemIds(brandId),
      this.stopVersions.currentStop(brandId),
    ]);

    return { stoppedItemIds, stopVersion };
  }
}
