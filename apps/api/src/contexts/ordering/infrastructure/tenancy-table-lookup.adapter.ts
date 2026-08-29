import { Inject, Injectable } from '@nestjs/common';
import { TABLE_ZONE_REPOSITORY, type TableZoneRepository } from '../../tenancy/domain/ports';
import type { OrderTableLookupPort, ResolvedOrderTable } from '../domain/ports';

@Injectable()
export class TenancyTableLookupAdapter implements OrderTableLookupPort {
  constructor(@Inject(TABLE_ZONE_REPOSITORY) private readonly tables: TableZoneRepository) {}

  async findActiveTable(tableId: string): Promise<ResolvedOrderTable | null> {
    const resolution = await this.tables.findActiveTableForResolution(tableId);
    if (!resolution) return null;
    return {
      tableId: resolution.tableId,
      zoneName: resolution.zoneName,
      number: resolution.number,
      locationId: resolution.locationId,
    };
  }
}
