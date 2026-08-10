import { Inject, Injectable } from '@nestjs/common';
import { requireBrandContext, requireTenantContext } from '@resto/db';
import { BrandId, TenantId } from '@resto/domain';
import { LOCATION_REPOSITORY, type LocationRepository } from '../../tenancy/domain/ports';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../domain/ports';
import type { AggregateStopListResponse } from './dto';

@Injectable()
export class GetStopListAggregateService {
  constructor(
    @Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository,
    @Inject(LOCATION_REPOSITORY) private readonly locations: LocationRepository,
  ) {}

  async execute(): Promise<AggregateStopListResponse> {
    const ctx = requireTenantContext();
    const tenantId = TenantId.parse(ctx.tenantId);
    const brandId = BrandId.parse(requireBrandContext());

    // D-10: the active-location set is always server-resolved from the
    // brand-RLS-protected `locations` table, never accepted from the caller.
    const all = await this.locations.listForBrand(brandId, tenantId);
    const active = all.filter((l) => l.status === 'active');

    const { rows, totalStoppedItems } = await this.repo.listStopListAggregateAcrossLocations(
      tenantId,
      active.map((l) => l.id),
    );

    return {
      items: rows.map((r) => ({
        itemId: r.itemId,
        itemName: r.itemName,
        categoryName: r.categoryName,
        stoppedLocationCount: r.stoppedLocationCount,
        lastStoppedAt: r.lastStoppedAt,
      })),
      // D-06: M is active locations at read time, computed fresh per request.
      totalActiveLocations: active.length,
      totalStoppedItems,
    };
  }
}
