import { Inject, Injectable, Logger } from '@nestjs/common';
import { requireLocationContext } from '@resto/db';
import { LocationId } from '@resto/domain';
import { TABLE_ZONE_REPOSITORY } from '../domain/ports';
import type { TableZoneRepository } from '../domain/ports';
import { RestaurantTable } from '../domain/restaurant-table.aggregate';
import type { RestaurantTableSnapshot } from '../domain/restaurant-table.aggregate';
import { RestaurantTableNotFoundError } from '../domain/errors';

export interface RenameTableCommand {
  readonly tableId: string;
  readonly number: string;
}

@Injectable()
export class RenameTableService {
  private readonly logger = new Logger(RenameTableService.name);

  constructor(@Inject(TABLE_ZONE_REPOSITORY) private readonly repo: TableZoneRepository) {}

  async execute(input: RenameTableCommand): Promise<RestaurantTableSnapshot> {
    const locationId = LocationId.parse(requireLocationContext());

    const snapshot = await this.repo.findTableById(input.tableId, locationId);
    if (!snapshot) throw new RestaurantTableNotFoundError(input.tableId);

    const table = RestaurantTable.fromSnapshot(snapshot);
    // The sticker's id never changes; only the display number does. Spread the loaded row so
    // its sort key rides through untouched here, rather than being named and re-typed.
    table.renumber({ ...snapshot, number: input.number });

    const updated = table.toSnapshot();
    await this.repo.saveTable(updated);

    this.logger.log({ locationId, tableId: input.tableId }, 'Table renamed.');
    return updated;
  }
}
