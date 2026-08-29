import { Inject, Injectable, Logger } from '@nestjs/common';
import { requireLocationContext, requireTenantContext } from '@resto/db';
import { LocationId, TenantId } from '@resto/domain';
import { TABLE_ZONE_REPOSITORY } from '../domain/ports';
import type { TableZoneRepository, TableZoneWithTables } from '../domain/ports';
import { LocationTableLimitReachedError, TableBulkLimitExceededError } from '../domain/errors';
import { MAX_ACTIVE_TABLES_PER_LOCATION, MAX_TABLES_PER_BULK_CALL } from './table-dto';
import type { CreateTableZoneInput } from './table-dto';

@Injectable()
export class CreateTableZoneService {
  private readonly logger = new Logger(CreateTableZoneService.name);

  constructor(@Inject(TABLE_ZONE_REPOSITORY) private readonly repo: TableZoneRepository) {}

  async execute(input: CreateTableZoneInput): Promise<TableZoneWithTables> {
    const ctx = requireTenantContext();
    const tenantId = TenantId.parse(ctx.tenantId);
    const locationId = LocationId.parse(requireLocationContext());

    // The Zod schema at the HTTP boundary already refuses this; re-checked here so a future
    // non-HTTP caller (CLI, internal job) cannot bypass the cap.
    if (input.tableCount > MAX_TABLES_PER_BULK_CALL) {
      throw new TableBulkLimitExceededError(input.tableCount, MAX_TABLES_PER_BULK_CALL);
    }

    const activeCount = await this.repo.countActiveTables(locationId);
    if (activeCount + input.tableCount > MAX_ACTIVE_TABLES_PER_LOCATION) {
      throw new LocationTableLimitReachedError(locationId, MAX_ACTIVE_TABLES_PER_LOCATION);
    }

    const tables = Array.from({ length: input.tableCount }, (_, index) => ({
      number: String(index + 1),
      ordinal: index + 1,
    }));

    const zone = await this.repo.createZoneWithTables({
      locationId,
      name: input.name,
      tables,
    });

    this.logger.log(
      { tenantId, locationId, zoneId: zone.id, tableCount: input.tableCount },
      'Table zone created.',
    );
    return zone;
  }
}
