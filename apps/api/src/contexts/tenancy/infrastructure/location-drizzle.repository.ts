import { Inject, Injectable } from '@nestjs/common';
import { schema, TenantAwareDb, TenantScopedRepository } from '@resto/db';
import { BrandId, LocationId, TenantId } from '@resto/domain';
import { and, asc, eq } from 'drizzle-orm';
import { LocationContactsSchema, type LocationSnapshot } from '../domain/location.aggregate';
import type { LocationRepository } from '../domain/ports';

const ROW_TO_SNAPSHOT = (row: {
  id: string;
  tenantId: string;
  brandId: string;
  name: string;
  address: string | null;
  timezone: string | null;
  contacts: Record<string, unknown> | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}): LocationSnapshot => ({
  id: LocationId.parse(row.id),
  tenantId: TenantId.parse(row.tenantId),
  brandId: BrandId.parse(row.brandId),
  name: row.name,
  address: row.address,
  timezone: row.timezone,
  contacts: row.contacts === null ? null : LocationContactsSchema.parse(row.contacts),
  status: row.status as LocationSnapshot['status'],
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  archivedAt: row.archivedAt,
});

@Injectable()
export class LocationDrizzleRepository
  extends TenantScopedRepository
  implements LocationRepository
{
  constructor(@Inject(TenantAwareDb) db: TenantAwareDb) {
    super(db);
  }

  async findById(id: LocationId): Promise<LocationSnapshot | null> {
    const row = await this.selectOne(schema.locations, eq(schema.locations.id, id));
    return row ? ROW_TO_SNAPSHOT(row) : null;
  }

  async listForBrand(brandId: BrandId, tenantId: TenantId): Promise<readonly LocationSnapshot[]> {
    return this.withTenant(async (scoped) => {
      const rows = await scoped
        .selectFrom(
          schema.locations,
          and(eq(schema.locations.tenantId, tenantId), eq(schema.locations.brandId, brandId)),
        )
        .orderBy(asc(schema.locations.createdAt));
      return rows.map(ROW_TO_SNAPSHOT);
    });
  }

  async save(snapshot: LocationSnapshot): Promise<void> {
    await this.withTenant(async (scoped) => {
      await scoped
        .insertInto(schema.locations, {
          id: snapshot.id,
          brandId: snapshot.brandId,
          name: snapshot.name,
          address: snapshot.address,
          timezone: snapshot.timezone,
          contacts: snapshot.contacts,
          status: snapshot.status,
          createdAt: snapshot.createdAt,
          updatedAt: snapshot.updatedAt,
          archivedAt: snapshot.archivedAt,
        })
        .onConflictDoUpdate({
          target: schema.locations.id,
          set: {
            name: snapshot.name,
            address: snapshot.address,
            timezone: snapshot.timezone,
            contacts: snapshot.contacts,
            status: snapshot.status,
            updatedAt: snapshot.updatedAt,
            archivedAt: snapshot.archivedAt,
          },
        });
    });
  }

  async countScopedMembers(locationId: LocationId): Promise<number> {
    return this.withTenant(async (scoped) => {
      const rows = await scoped.selectFrom(
        schema.memberLocationScope,
        eq(schema.memberLocationScope.locationId, locationId),
      );
      return rows.length;
    });
  }
}
