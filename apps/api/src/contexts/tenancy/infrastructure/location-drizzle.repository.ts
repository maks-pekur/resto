import { Inject, Injectable } from '@nestjs/common';
import { schema, TenantAwareDb, TenantScopedRepository } from '@resto/db';
import { LocationId, TenantId } from '@resto/domain';
import { asc, eq } from 'drizzle-orm';
import { LocationContactsSchema, type LocationSnapshot } from '../domain/location.aggregate';
import type { LocationRepository } from '../domain/ports';

const ROW_TO_SNAPSHOT = (row: {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  address: string | null;
  // numeric(9,6) comes back as a string from postgres.js — parsing at the boundary keeps the
  // domain in numbers and the precision decision in one place.
  latitude: string | null;
  longitude: string | null;
  timezone: string | null;
  contacts: Record<string, unknown> | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}): LocationSnapshot => ({
  id: LocationId.parse(row.id),
  tenantId: TenantId.parse(row.tenantId),
  name: row.name,
  slug: row.slug,
  address: row.address,
  latitude: row.latitude === null ? null : Number(row.latitude),
  longitude: row.longitude === null ? null : Number(row.longitude),
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

  async listForTenant(_tenantId: TenantId): Promise<readonly LocationSnapshot[]> {
    // ADR-0020 I-1: `scoped.selectFrom` auto-applies `eq(table.tenantId, ...)`
    // from the ALS-bound context — this is now the ONLY filter on this query,
    // not a redundant one alongside a dropped brand predicate.
    return this.withTenant(async (scoped) => {
      const rows = await scoped
        .selectFrom(schema.locations)
        .orderBy(asc(schema.locations.createdAt));
      return rows.map(ROW_TO_SNAPSHOT);
    });
  }

  async save(snapshot: LocationSnapshot): Promise<void> {
    await this.withTenant(async (scoped) => {
      await scoped
        .insertInto(schema.locations, {
          id: snapshot.id,
          name: snapshot.name,
          slug: snapshot.slug,
          address: snapshot.address,
          latitude: snapshot.latitude === null ? null : String(snapshot.latitude),
          longitude: snapshot.longitude === null ? null : String(snapshot.longitude),
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
            latitude: snapshot.latitude === null ? null : String(snapshot.latitude),
            longitude: snapshot.longitude === null ? null : String(snapshot.longitude),
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
