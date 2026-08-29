import { Inject, Injectable, Logger } from '@nestjs/common';
import { requireLocationContext } from '@resto/db';
import { LocationId } from '@resto/domain';
import { TABLE_ZONE_REPOSITORY } from '../domain/ports';
import type { TableZoneRepository } from '../domain/ports';
import { TableZone } from '../domain/table-zone.aggregate';
import type { TableZoneSnapshot } from '../domain/table-zone.aggregate';
import { TableZoneNotFoundError } from '../domain/errors';

export interface RenameTableZoneCommand {
  readonly zoneId: string;
  readonly name: string;
}

@Injectable()
export class RenameTableZoneService {
  private readonly logger = new Logger(RenameTableZoneService.name);

  constructor(@Inject(TABLE_ZONE_REPOSITORY) private readonly repo: TableZoneRepository) {}

  async execute(input: RenameTableZoneCommand): Promise<TableZoneSnapshot> {
    const locationId = LocationId.parse(requireLocationContext());

    // Loading by (zoneId, locationId) rather than by zoneId alone is the point: the id in the
    // path is exactly as forgeable as a location id would have been.
    const snapshot = await this.repo.findZoneById(input.zoneId, locationId);
    if (!snapshot) throw new TableZoneNotFoundError(input.zoneId);

    const zone = TableZone.fromSnapshot(snapshot);
    zone.rename(input.name);

    const updated = zone.toSnapshot();
    await this.repo.saveZone(updated);

    this.logger.log({ locationId, zoneId: input.zoneId }, 'Table zone renamed.');
    return updated;
  }
}
