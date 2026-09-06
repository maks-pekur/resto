import { Inject, Injectable, Logger } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { LocationId, TenantId } from '@resto/domain';
import { LOCATION_REPOSITORY, type LocationRepository } from '../domain/ports';
import { LocationHasOrdersError, LocationNotFoundError } from '../domain/errors';

// Drizzle wraps a Postgres error in DrizzleQueryError, whose own message is the failed SQL —
// the RAISE'd name survives only on the cause chain.
const namesRefusal = (err: unknown, refusal: string): boolean => {
  for (let e: unknown = err; e instanceof Error; e = (e as { cause?: unknown }).cause) {
    if (e.message.includes(refusal)) return true;
  }
  return false;
};

@Injectable()
export class DeleteLocationService {
  private readonly logger = new Logger(DeleteLocationService.name);

  constructor(@Inject(LOCATION_REPOSITORY) private readonly locations: LocationRepository) {}

  async execute(rawId: string): Promise<void> {
    const ctx = requireTenantContext();
    const tenantId = TenantId.parse(ctx.tenantId);
    const id = LocationId.parse(rawId);

    const snapshot = await this.locations.findById(id);
    if (!snapshot) throw new LocationNotFoundError(rawId);

    try {
      await this.locations.deleteEmpty(id, tenantId);
    } catch (err) {
      // The database is the authority on whether this location is history; it refuses by name.
      if (namesRefusal(err, 'location_has_orders')) {
        throw new LocationHasOrdersError(rawId);
      }
      throw err;
    }

    this.logger.log({ locationId: id }, 'Location deleted.');
  }
}
