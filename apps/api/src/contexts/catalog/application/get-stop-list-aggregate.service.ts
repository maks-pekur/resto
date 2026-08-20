import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { TenantId } from '@resto/domain';
import { LOCATION_REPOSITORY, type LocationRepository } from '../../tenancy/domain/ports';
import type { LocationSnapshot } from '../../tenancy/domain/location.aggregate';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../domain/ports';
import type { AggregateStopListResponse } from './dto';

// 10.2-06 (concurrent) adds LocationRepository.listForTenant as part of the tenancy
// port sweep; this augmentation lets catalog compile against that shape ahead of the
// merge landing. Drop once ports.ts exports listForTenant directly.
interface TenantScopedLocationRepository extends LocationRepository {
  listForTenant(tenantId: TenantId): Promise<readonly LocationSnapshot[]>;
}

@Injectable()
export class GetStopListAggregateService {
  constructor(
    @Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository,
    @Inject(LOCATION_REPOSITORY) private readonly locations: TenantScopedLocationRepository,
  ) {}

  async execute(): Promise<AggregateStopListResponse> {
    const ctx = requireTenantContext();
    const tenantId = TenantId.parse(ctx.tenantId);

    // D-10: the active-location set is always server-resolved from the
    // tenant-RLS-protected `locations` table, never accepted from the caller.
    const all = await this.locations.listForTenant(tenantId);
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
