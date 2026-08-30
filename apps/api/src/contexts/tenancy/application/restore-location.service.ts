import { Inject, Injectable, Logger } from '@nestjs/common';
import { LocationId } from '@resto/domain';
import { LOCATION_REPOSITORY, type LocationRepository } from '../domain/ports';
import { LocationNotFoundError } from '../domain/errors';
import { Location, type LocationSnapshot } from '../domain/location.aggregate';

@Injectable()
export class RestoreLocationService {
  private readonly logger = new Logger(RestoreLocationService.name);

  constructor(@Inject(LOCATION_REPOSITORY) private readonly locations: LocationRepository) {}

  async execute(rawId: string): Promise<LocationSnapshot> {
    const id = LocationId.parse(rawId);
    const snapshot = await this.locations.findById(id);
    if (!snapshot) throw new LocationNotFoundError(rawId);

    const location = Location.fromSnapshot(snapshot);
    location.restore();
    const restored = location.toSnapshot();
    await this.locations.save(restored);

    // Member scope rows were never deleted on archive, so access returns with the location.
    this.logger.log({ locationId: id }, 'Location restored.');
    return restored;
  }
}
