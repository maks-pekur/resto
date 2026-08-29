import { Inject, Injectable, Logger } from '@nestjs/common';
import { requireLocationContext } from '@resto/db';
import { LocationId } from '@resto/domain';
import { TABLE_ZONE_REPOSITORY } from '../domain/ports';
import type { TableZoneRepository } from '../domain/ports';
import { TableZoneAlreadyArchivedError, TableZoneNotFoundError } from '../domain/errors';

export interface ArchiveTableZoneCommand {
  readonly zoneId: string;
}

export interface ArchiveTableZoneResult {
  readonly zoneId: string;
  readonly archivedTableCount: number;
}

@Injectable()
export class ArchiveTableZoneService {
  private readonly logger = new Logger(ArchiveTableZoneService.name);

  constructor(@Inject(TABLE_ZONE_REPOSITORY) private readonly repo: TableZoneRepository) {}

  async execute(input: ArchiveTableZoneCommand): Promise<ArchiveTableZoneResult> {
    const locationId = LocationId.parse(requireLocationContext());

    const snapshot = await this.repo.findZoneById(input.zoneId, locationId);
    if (!snapshot) throw new TableZoneNotFoundError(input.zoneId);
    if (snapshot.status === 'archived') {
      throw new TableZoneAlreadyArchivedError(input.zoneId);
    }

    // One transaction: a zone and its tables flip together, never leaving active tables
    // hanging under an archived zone if a failure interrupts two separate calls.
    const result = await this.repo.archiveZoneCascade(input.zoneId, locationId);

    this.logger.log(
      { locationId, zoneId: input.zoneId, archivedTableCount: result.archivedTableCount },
      'Table zone archived.',
    );
    return result;
  }
}
