import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { LocationId, TenantId } from '@resto/domain';
import { LOCATION_REPOSITORY, type LocationRepository } from '../domain/ports';
import type { LocationContacts, LocationSnapshot } from '../domain/location.aggregate';

export interface ProvisionLocationInput {
  readonly name: string;
  readonly address: string | null;
  readonly timezone: string | null;
  readonly contacts: LocationContacts | null;
}

@Injectable()
export class ProvisionLocationService {
  private readonly logger = new Logger(ProvisionLocationService.name);

  constructor(@Inject(LOCATION_REPOSITORY) private readonly locations: LocationRepository) {}

  async execute(input: ProvisionLocationInput): Promise<LocationSnapshot> {
    const ctx = requireTenantContext();
    const now = new Date();

    const snapshot: LocationSnapshot = {
      id: LocationId.parse(randomUUID()),
      tenantId: TenantId.parse(ctx.tenantId),
      name: input.name,
      address: input.address,
      timezone: input.timezone,
      contacts: input.contacts,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };

    await this.locations.save(snapshot);
    this.logger.log({ tenantId: ctx.tenantId, locationId: snapshot.id }, 'Location provisioned.');
    return snapshot;
  }
}
