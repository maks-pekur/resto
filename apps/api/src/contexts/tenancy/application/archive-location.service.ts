import { Inject, Injectable, Logger } from '@nestjs/common';
import { LocationId } from '@resto/domain';
import { LOCATION_REPOSITORY, type LocationRepository } from '../domain/ports';
import { LocationNotFoundError } from '../domain/errors';
import { Location } from '../domain/location.aggregate';

export interface ArchiveLocationResult {
  readonly scopedMemberCount: number;
}

@Injectable()
export class ArchiveLocationService {
  private readonly logger = new Logger(ArchiveLocationService.name);

  constructor(@Inject(LOCATION_REPOSITORY) private readonly locations: LocationRepository) {}

  async execute(rawId: string): Promise<ArchiveLocationResult> {
    const id = LocationId.parse(rawId);
    const snapshot = await this.locations.findById(id);
    if (!snapshot) throw new LocationNotFoundError(rawId);

    // D-17: count BEFORE the archive state transition so the "N staff will
    // lose access" figure reflects who was scoped at request time; archive
    // never deletes member_location_scope rows (default-deny handles access loss).
    const scopedMemberCount = await this.locations.countScopedMembers(id);

    const location = Location.fromSnapshot(snapshot);
    location.archive();
    await this.locations.save(location.toSnapshot());

    this.logger.log({ locationId: id, scopedMemberCount }, 'Location archived.');
    return { scopedMemberCount };
  }
}
