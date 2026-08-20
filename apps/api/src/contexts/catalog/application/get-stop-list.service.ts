import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { requireLocationContext, requireTenantContext } from '@resto/db';
import { TenantId } from '@resto/domain';
import { LOCATION_REPOSITORY, type LocationRepository } from '../../tenancy/domain/ports';
import type { LocationSnapshot } from '../../tenancy/domain/location.aggregate';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../domain/ports';
import type { StopListResponse } from './dto';

// 10.2-06 (concurrent) adds LocationRepository.listForTenant as part of the tenancy
// port sweep; this augmentation lets catalog compile against that shape ahead of the
// merge landing. Drop once ports.ts exports listForTenant directly.
interface TenantScopedLocationRepository extends LocationRepository {
  listForTenant(tenantId: TenantId): Promise<readonly LocationSnapshot[]>;
}

@Injectable()
export class GetStopListService {
  constructor(
    @Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository,
    @Inject(LOCATION_REPOSITORY) private readonly locations: TenantScopedLocationRepository,
  ) {}

  async execute(): Promise<StopListResponse> {
    const ctx = requireTenantContext();
    const tenantId = TenantId.parse(ctx.tenantId);
    const locationId = requireLocationContext();

    // D-10: owners bypass LocationScopeGuard, so nothing else validates that
    // a resolved x-location-id belongs to the tenant. Existence-hiding
    // 404 (not 403) matches the codebase's precedent for out-of-scope reads.
    // Redundant-but-harmless for staff, whose pinned location is already
    // scope-checked by the guard.
    const active = (await this.locations.listForTenant(tenantId)).filter(
      (l) => l.status === 'active',
    );
    if (!active.some((l) => l.id === locationId)) {
      throw new NotFoundException();
    }

    const rows = await this.repo.listStopListWithStoppedAt(locationId);
    return {
      items: rows.map((r) => ({
        id: r.id,
        itemId: r.itemId,
        itemName: r.itemName,
        categoryName: r.categoryName,
        stoppedAt: r.stoppedAt,
        reason: r.reason,
      })),
    };
  }
}
