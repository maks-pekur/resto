import { Inject, Injectable } from '@nestjs/common';
import { requireBrandContext, requireTenantContext } from '@resto/db';
import { BrandId, TenantId } from '@resto/domain';
import { LOCATION_REPOSITORY, type LocationRepository } from '../domain/ports';
import type { LocationSnapshot } from '../domain/location.aggregate';

@Injectable()
export class ListLocationsService {
  constructor(@Inject(LOCATION_REPOSITORY) private readonly locations: LocationRepository) {}

  execute(): Promise<readonly LocationSnapshot[]> {
    const ctx = requireTenantContext();
    const brandId = requireBrandContext();
    return this.locations.listForBrand(BrandId.parse(brandId), TenantId.parse(ctx.tenantId));
  }
}
