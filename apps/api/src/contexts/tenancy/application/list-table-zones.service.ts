import { Inject, Injectable } from '@nestjs/common';
import { requireLocationContext, requireTenantContext } from '@resto/db';
import { LocationId, TenantId } from '@resto/domain';
import { TABLE_ZONE_REPOSITORY, TENANT_REPOSITORY } from '../domain/ports';
import type { TableZoneRepository, TenantRepository } from '../domain/ports';
import { TenantNotFoundError } from '../domain/errors';
import { GuestMenuUrlService } from './guest-menu-url.service';
import type { TableResponse, TableZoneResponse } from './table-dto';

@Injectable()
export class ListTableZonesService {
  constructor(
    @Inject(TABLE_ZONE_REPOSITORY) private readonly repo: TableZoneRepository,
    @Inject(TENANT_REPOSITORY) private readonly tenants: TenantRepository,
    @Inject(GuestMenuUrlService) private readonly guestMenuUrl: GuestMenuUrlService,
  ) {}

  async execute(): Promise<readonly TableZoneResponse[]> {
    const ctx = requireTenantContext();
    const tenantId = TenantId.parse(ctx.tenantId);
    const locationId = LocationId.parse(requireLocationContext());

    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new TenantNotFoundError(tenantId);

    const zones = await this.repo.listZonesWithTables(locationId);

    const results: TableZoneResponse[] = [];
    for (const zone of zones) {
      const tables: TableResponse[] = [];
      for (const table of zone.tables) {
        const qrUrl = await this.guestMenuUrl.execute({ tenant, tableId: table.id });
        tables.push({
          id: table.id,
          number: table.number,
          ordinal: table.ordinal,
          status: table.status,
          qrUrl,
        });
      }
      results.push({ id: zone.id, name: zone.name, status: zone.status, tables });
    }
    return results;
  }
}
