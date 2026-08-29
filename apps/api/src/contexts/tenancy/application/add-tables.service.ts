import { Inject, Injectable, Logger } from '@nestjs/common';
import { requireLocationContext } from '@resto/db';
import { LocationId } from '@resto/domain';
import { TABLE_ZONE_REPOSITORY } from '../domain/ports';
import type { TableZoneRepository } from '../domain/ports';
import type { RestaurantTableSnapshot } from '../domain/restaurant-table.aggregate';
import {
  LocationTableLimitReachedError,
  TableBulkLimitExceededError,
  TableZoneNotFoundError,
} from '../domain/errors';
import { MAX_ACTIVE_TABLES_PER_LOCATION, MAX_TABLES_PER_BULK_CALL } from './table-dto';

export interface AddTablesCommand {
  readonly zoneId: string;
  readonly count: number;
}

@Injectable()
export class AddTablesService {
  private readonly logger = new Logger(AddTablesService.name);

  constructor(@Inject(TABLE_ZONE_REPOSITORY) private readonly repo: TableZoneRepository) {}

  async execute(input: AddTablesCommand): Promise<readonly RestaurantTableSnapshot[]> {
    const locationId = LocationId.parse(requireLocationContext());

    const zone = await this.repo.findZoneById(input.zoneId, locationId);
    if (!zone || zone.status === 'archived') {
      throw new TableZoneNotFoundError(input.zoneId);
    }

    if (input.count > MAX_TABLES_PER_BULK_CALL) {
      throw new TableBulkLimitExceededError(input.count, MAX_TABLES_PER_BULK_CALL);
    }

    const activeCount = await this.repo.countActiveTables(locationId);
    if (activeCount + input.count > MAX_ACTIVE_TABLES_PER_LOCATION) {
      throw new LocationTableLimitReachedError(locationId, MAX_ACTIVE_TABLES_PER_LOCATION);
    }

    const startOrdinal = await this.repo.maxOrdinalInZone(input.zoneId, locationId);
    const tables = Array.from({ length: input.count }, (_, index) => ({
      number: String(startOrdinal + index + 1),
      ordinal: startOrdinal + index + 1,
    }));

    const created = await this.repo.addTables({ zoneId: input.zoneId, locationId, tables });

    this.logger.log(
      { locationId, zoneId: input.zoneId, count: input.count },
      'Tables added to zone.',
    );
    return created;
  }
}
