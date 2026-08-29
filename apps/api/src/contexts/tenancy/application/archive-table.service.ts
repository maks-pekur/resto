import { Inject, Injectable, Logger } from '@nestjs/common';
import { requireLocationContext } from '@resto/db';
import { LocationId } from '@resto/domain';
import { TABLE_ZONE_REPOSITORY } from '../domain/ports';
import type { TableZoneRepository } from '../domain/ports';
import { RestaurantTable } from '../domain/restaurant-table.aggregate';
import type { RestaurantTableSnapshot } from '../domain/restaurant-table.aggregate';
import {
  RestaurantTableAlreadyArchivedError,
  RestaurantTableNotFoundError,
} from '../domain/errors';

export interface ArchiveTableCommand {
  readonly tableId: string;
}

@Injectable()
export class ArchiveTableService {
  private readonly logger = new Logger(ArchiveTableService.name);

  constructor(@Inject(TABLE_ZONE_REPOSITORY) private readonly repo: TableZoneRepository) {}

  async execute(input: ArchiveTableCommand): Promise<RestaurantTableSnapshot> {
    const locationId = LocationId.parse(requireLocationContext());

    const snapshot = await this.repo.findTableById(input.tableId, locationId);
    if (!snapshot) throw new RestaurantTableNotFoundError(input.tableId);
    if (snapshot.status === 'archived') {
      throw new RestaurantTableAlreadyArchivedError(input.tableId);
    }

    const table = RestaurantTable.fromSnapshot(snapshot);
    // The unique index is partial on status='active', so archiving frees the number for reuse.
    table.archive();

    const updated = table.toSnapshot();
    await this.repo.saveTable(updated);

    this.logger.log({ locationId, tableId: input.tableId }, 'Table archived.');
    return updated;
  }
}
