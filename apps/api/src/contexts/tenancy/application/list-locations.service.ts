import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { TenantId } from '@resto/domain';
import { LOCATION_REPOSITORY, type LocationRepository } from '../domain/ports';
import type { LocationSnapshot } from '../domain/location.aggregate';

@Injectable()
export class ListLocationsService {
  constructor(@Inject(LOCATION_REPOSITORY) private readonly locations: LocationRepository) {}

  execute(): Promise<readonly LocationSnapshot[]> {
    const ctx = requireTenantContext();
    return this.locations.listForTenant(TenantId.parse(ctx.tenantId));
  }
}
