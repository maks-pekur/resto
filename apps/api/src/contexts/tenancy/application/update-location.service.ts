import { Inject, Injectable, Logger } from '@nestjs/common';
import { LocationId } from '@resto/domain';
import { LOCATION_REPOSITORY, type LocationRepository } from '../domain/ports';
import { Location } from '../domain/location.aggregate';
import type { LocationContacts, LocationSnapshot } from '../domain/location.aggregate';
import { LocationNotFoundError } from '../domain/errors';

export interface UpdateLocationInput {
  readonly name?: string | undefined;
  readonly address?: string | undefined;
  readonly latitude?: number | undefined;
  readonly longitude?: number | undefined;
  readonly timezone?: string | null | undefined;
  readonly contacts?: LocationContacts | null | undefined;
}

@Injectable()
export class UpdateLocationService {
  private readonly logger = new Logger(UpdateLocationService.name);

  constructor(@Inject(LOCATION_REPOSITORY) private readonly locations: LocationRepository) {}

  async execute(rawId: string, input: UpdateLocationInput): Promise<LocationSnapshot> {
    const id = LocationId.parse(rawId);
    const existing = await this.locations.findById(id);
    if (!existing) throw new LocationNotFoundError(rawId);

    const location = Location.fromSnapshot(existing);
    // The slug is not editable. It lives in URLs and in operators' habits; renaming a location
    // should not silently move where it answers.
    location.update(input);

    const snapshot = location.toSnapshot();
    await this.locations.save(snapshot);
    this.logger.log({ locationId: id }, 'Location updated.');
    return snapshot;
  }
}
