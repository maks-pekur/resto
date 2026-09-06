import { Inject, Injectable } from '@nestjs/common';
import {
  requireTenantContext,
  schema,
  TenantAwareDb,
  TenantScopedRepository,
  withoutLocation,
} from '@resto/db';
import { LocationId, TenantId } from '@resto/domain';
import { and, asc, eq, gt } from 'drizzle-orm';
import type { RestaurantTableSnapshot } from '../domain/restaurant-table.aggregate';
import type { TableZoneSnapshot } from '../domain/table-zone.aggregate';
import type {
  AddTablesInput,
  CreateZoneWithTablesInput,
  RestaurantTableResolution,
  TableZoneRepository,
  TableZoneWithTables,
} from '../domain/ports';

const ROW_TO_ZONE_SNAPSHOT = (row: {
  id: string;
  tenantId: string;
  locationId: string;
  name: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}): TableZoneSnapshot => ({
  id: row.id,
  tenantId: TenantId.parse(row.tenantId),
  locationId: LocationId.parse(row.locationId),
  name: row.name,
  status: row.status as TableZoneSnapshot['status'],
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  archivedAt: row.archivedAt,
});

const ROW_TO_TABLE_SNAPSHOT = (row: {
  id: string;
  tenantId: string;
  zoneId: string;
  locationId: string;
  number: string;
  ordinal: number;
  qrToken: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}): RestaurantTableSnapshot => ({
  id: row.id,
  tenantId: TenantId.parse(row.tenantId),
  zoneId: row.zoneId,
  locationId: LocationId.parse(row.locationId),
  number: row.number,
  ordinal: row.ordinal,
  qrToken: row.qrToken,
  status: row.status as RestaurantTableSnapshot['status'],
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  archivedAt: row.archivedAt,
});

/**
 * `ScopedTx` filters tenant only — it has no location dimension. Every method below except
 * `findActiveTableForResolution` composes an explicit `eq(locationId, ...)` predicate on top of
 * it; that is the application-layer half of ADR-0020 I-1, and the RESTRICTIVE location RLS policy
 * from plan 10.3-01 is the database half. `findActiveTableForResolution` is the one path the
 * public guest route reaches with no bound location, so it runs inside `withoutLocation` instead.
 */
@Injectable()
export class TableZoneDrizzleRepository
  extends TenantScopedRepository
  implements TableZoneRepository
{
  constructor(@Inject(TenantAwareDb) db: TenantAwareDb) {
    super(db);
  }

  async listZonesWithTables(locationId: LocationId): Promise<readonly TableZoneWithTables[]> {
    return this.withTenant(async (scoped) => {
      const zoneRows = await scoped
        .selectFrom(
          schema.tableZones,
          and(eq(schema.tableZones.locationId, locationId), eq(schema.tableZones.status, 'active')),
        )
        .orderBy(asc(schema.tableZones.name));

      const tableRows = await scoped
        .selectFrom(
          schema.restaurantTables,
          and(
            eq(schema.restaurantTables.locationId, locationId),
            eq(schema.restaurantTables.status, 'active'),
          ),
        )
        .orderBy(asc(schema.restaurantTables.ordinal), asc(schema.restaurantTables.number));

      const tablesByZone = new Map<string, RestaurantTableSnapshot[]>();
      for (const row of tableRows) {
        const table = ROW_TO_TABLE_SNAPSHOT(row);
        const bucket = tablesByZone.get(table.zoneId) ?? [];
        bucket.push(table);
        tablesByZone.set(table.zoneId, bucket);
      }

      return zoneRows.map((row) => {
        const zone = ROW_TO_ZONE_SNAPSHOT(row);
        return { ...zone, tables: tablesByZone.get(zone.id) ?? [] };
      });
    });
  }

  async findZoneById(zoneId: string, locationId: LocationId): Promise<TableZoneSnapshot | null> {
    return this.withTenant(async (scoped) => {
      const rows = await scoped
        .selectFrom(
          schema.tableZones,
          and(eq(schema.tableZones.id, zoneId), eq(schema.tableZones.locationId, locationId)),
        )
        .limit(1);
      return rows[0] ? ROW_TO_ZONE_SNAPSHOT(rows[0]) : null;
    });
  }

  async findTableById(
    tableId: string,
    locationId: LocationId,
  ): Promise<RestaurantTableSnapshot | null> {
    return this.withTenant(async (scoped) => {
      const rows = await scoped
        .selectFrom(
          schema.restaurantTables,
          and(
            eq(schema.restaurantTables.id, tableId),
            eq(schema.restaurantTables.locationId, locationId),
          ),
        )
        .limit(1);
      return rows[0] ? ROW_TO_TABLE_SNAPSHOT(rows[0]) : null;
    });
  }

  /**
   * T-10.3-63: the only method with no `locationId` argument. Wrapped in `withoutLocation` so a
   * stray or forged `x-location-id` header (`TenantContextMiddleware` binds it for every caller,
   * including anonymous guests) cannot make an existing table look missing — `withTenant` reads
   * the ALS context to decide whether to call `app_bind_location`, and this frame has none, so the
   * RESTRICTIVE policy's `current_location_id() IS NULL` escape applies. Tenant scoping still
   * applies through `ScopedTx` + RLS; only the location dimension is dropped.
   */
  async findActiveTableForResolution(tableId: string): Promise<RestaurantTableResolution | null> {
    return withoutLocation(async () => {
      const tenantId = requireTenantContext().tenantId;
      return this.withTenant(async (_scoped, tx) => {
        const rows = await tx
          .select({
            tableId: schema.restaurantTables.id,
            number: schema.restaurantTables.number,
            locationId: schema.restaurantTables.locationId,
            zoneName: schema.tableZones.name,
            updatedAt: schema.restaurantTables.updatedAt,
          })
          .from(schema.restaurantTables)
          .innerJoin(
            schema.tableZones,
            and(
              eq(schema.restaurantTables.zoneId, schema.tableZones.id),
              eq(schema.restaurantTables.tenantId, schema.tableZones.tenantId),
            ),
          )
          .where(
            and(
              eq(schema.restaurantTables.id, tableId),
              eq(schema.restaurantTables.tenantId, tenantId),
              eq(schema.restaurantTables.status, 'active'),
              eq(schema.tableZones.status, 'active'),
            ),
          )
          .limit(1);
        const row = rows[0];
        if (!row) return null;
        return {
          tableId: row.tableId,
          zoneName: row.zoneName,
          number: row.number,
          locationId: LocationId.parse(row.locationId),
          updatedAt: row.updatedAt,
        };
      });
    });
  }

  /** The QR code's own secret, which is all a scanning guest has. */
  async findActiveTableByQrToken(token: string): Promise<RestaurantTableResolution | null> {
    return withoutLocation(async () => {
      const tenantId = requireTenantContext().tenantId;
      return this.withTenant(async (_scoped, tx) => {
        const rows = await tx
          .select({
            tableId: schema.restaurantTables.id,
            number: schema.restaurantTables.number,
            locationId: schema.restaurantTables.locationId,
            zoneName: schema.tableZones.name,
            updatedAt: schema.restaurantTables.updatedAt,
          })
          .from(schema.restaurantTables)
          .innerJoin(
            schema.tableZones,
            and(
              eq(schema.restaurantTables.zoneId, schema.tableZones.id),
              eq(schema.restaurantTables.tenantId, schema.tableZones.tenantId),
            ),
          )
          .where(
            and(
              eq(schema.restaurantTables.qrToken, token),
              eq(schema.restaurantTables.tenantId, tenantId),
              eq(schema.restaurantTables.status, 'active'),
              eq(schema.tableZones.status, 'active'),
            ),
          )
          .limit(1);
        const row = rows[0];
        if (!row) return null;
        return {
          tableId: row.tableId,
          zoneName: row.zoneName,
          number: row.number,
          locationId: LocationId.parse(row.locationId),
          updatedAt: row.updatedAt,
        };
      });
    });
  }

  async openTableSession(input: {
    readonly tableId: string;
    readonly locationId: string;
    readonly expiresAt: Date;
  }): Promise<string> {
    return withoutLocation(async () => {
      const tenantId = requireTenantContext().tenantId;
      return this.withTenant(async (_scoped, tx) => {
        const [row] = await tx
          .insert(schema.tableSessions)
          .values({
            tenantId,
            tableId: input.tableId,
            locationId: input.locationId,
            expiresAt: input.expiresAt,
          })
          .returning({ id: schema.tableSessions.id });
        if (!row) throw new Error('table session insert returned no row');
        return row.id;
      });
    });
  }

  async findLiveTableSession(sessionId: string): Promise<RestaurantTableResolution | null> {
    return withoutLocation(async () => {
      const tenantId = requireTenantContext().tenantId;
      return this.withTenant(async (_scoped, tx) => {
        const rows = await tx
          .select({
            tableId: schema.restaurantTables.id,
            number: schema.restaurantTables.number,
            locationId: schema.restaurantTables.locationId,
            zoneName: schema.tableZones.name,
            updatedAt: schema.restaurantTables.updatedAt,
          })
          .from(schema.tableSessions)
          .innerJoin(
            schema.restaurantTables,
            and(
              eq(schema.tableSessions.tableId, schema.restaurantTables.id),
              eq(schema.tableSessions.tenantId, schema.restaurantTables.tenantId),
            ),
          )
          .innerJoin(
            schema.tableZones,
            and(
              eq(schema.restaurantTables.zoneId, schema.tableZones.id),
              eq(schema.restaurantTables.tenantId, schema.tableZones.tenantId),
            ),
          )
          .where(
            and(
              eq(schema.tableSessions.id, sessionId),
              eq(schema.tableSessions.tenantId, tenantId),
              gt(schema.tableSessions.expiresAt, new Date()),
              eq(schema.restaurantTables.status, 'active'),
            ),
          )
          .limit(1);
        const row = rows[0];
        if (!row) return null;
        return {
          tableId: row.tableId,
          zoneName: row.zoneName,
          number: row.number,
          locationId: LocationId.parse(row.locationId),
          updatedAt: row.updatedAt,
        };
      });
    });
  }

  async createZoneWithTables(input: CreateZoneWithTablesInput): Promise<TableZoneWithTables> {
    return this.withTenant(async (scoped, tx) => {
      const [zoneRow] = await scoped
        .insertInto(schema.tableZones, {
          locationId: input.locationId,
          name: input.name,
        })
        .returning({
          id: schema.tableZones.id,
          tenantId: schema.tableZones.tenantId,
          locationId: schema.tableZones.locationId,
          name: schema.tableZones.name,
          status: schema.tableZones.status,
          createdAt: schema.tableZones.createdAt,
          updatedAt: schema.tableZones.updatedAt,
          archivedAt: schema.tableZones.archivedAt,
        });
      if (!zoneRow) throw new Error('createZoneWithTables: zone insert returned no row');

      const tenantId = requireTenantContext().tenantId;
      // ScopedTx.insertInto has no multi-row form — the escape hatch client.ts documents. The
      // composite FKs plus RLS WITH CHECK still enforce every row; one transaction means a
      // constraint violation anywhere in the batch rolls the whole thing back.
      const tableRows =
        input.tables.length > 0
          ? await tx
              .insert(schema.restaurantTables)
              .values(
                input.tables.map((table) => ({
                  tenantId,
                  zoneId: zoneRow.id,
                  locationId: input.locationId,
                  number: table.number,
                  ordinal: table.ordinal,
                })),
              )
              .returning({
                id: schema.restaurantTables.id,
                tenantId: schema.restaurantTables.tenantId,
                zoneId: schema.restaurantTables.zoneId,
                locationId: schema.restaurantTables.locationId,
                number: schema.restaurantTables.number,
                ordinal: schema.restaurantTables.ordinal,
                qrToken: schema.restaurantTables.qrToken,
                status: schema.restaurantTables.status,
                createdAt: schema.restaurantTables.createdAt,
                updatedAt: schema.restaurantTables.updatedAt,
                archivedAt: schema.restaurantTables.archivedAt,
              })
          : [];

      return { ...ROW_TO_ZONE_SNAPSHOT(zoneRow), tables: tableRows.map(ROW_TO_TABLE_SNAPSHOT) };
    });
  }

  async addTables(input: AddTablesInput): Promise<readonly RestaurantTableSnapshot[]> {
    if (input.tables.length === 0) return [];
    return this.withTenant(async (_scoped, tx) => {
      const tenantId = requireTenantContext().tenantId;
      const rows = await tx
        .insert(schema.restaurantTables)
        .values(
          input.tables.map((table) => ({
            tenantId,
            zoneId: input.zoneId,
            locationId: input.locationId,
            number: table.number,
            ordinal: table.ordinal,
          })),
        )
        .returning({
          id: schema.restaurantTables.id,
          tenantId: schema.restaurantTables.tenantId,
          zoneId: schema.restaurantTables.zoneId,
          locationId: schema.restaurantTables.locationId,
          number: schema.restaurantTables.number,
          ordinal: schema.restaurantTables.ordinal,
          qrToken: schema.restaurantTables.qrToken,
          status: schema.restaurantTables.status,
          createdAt: schema.restaurantTables.createdAt,
          updatedAt: schema.restaurantTables.updatedAt,
          archivedAt: schema.restaurantTables.archivedAt,
        });
      return rows.map(ROW_TO_TABLE_SNAPSHOT);
    });
  }

  async saveZone(snapshot: TableZoneSnapshot): Promise<void> {
    await this.withTenant(async (scoped) => {
      await scoped.updateTable(
        schema.tableZones,
        {
          name: snapshot.name,
          status: snapshot.status,
          updatedAt: snapshot.updatedAt,
          archivedAt: snapshot.archivedAt,
        },
        and(
          eq(schema.tableZones.id, snapshot.id),
          eq(schema.tableZones.locationId, snapshot.locationId),
        ),
      );
    });
  }

  async saveTable(snapshot: RestaurantTableSnapshot): Promise<void> {
    await this.withTenant(async (scoped) => {
      await scoped.updateTable(
        schema.restaurantTables,
        {
          number: snapshot.number,
          ordinal: snapshot.ordinal,
          status: snapshot.status,
          updatedAt: snapshot.updatedAt,
          archivedAt: snapshot.archivedAt,
        },
        and(
          eq(schema.restaurantTables.id, snapshot.id),
          eq(schema.restaurantTables.locationId, snapshot.locationId),
        ),
      );
    });
  }

  async archiveZoneCascade(
    zoneId: string,
    locationId: LocationId,
  ): Promise<{ zoneId: string; archivedTableCount: number }> {
    return this.withTenant(async (scoped) => {
      const now = new Date();
      const archivedTables = await scoped
        .updateTable(
          schema.restaurantTables,
          { status: 'archived', archivedAt: now, updatedAt: now },
          and(
            eq(schema.restaurantTables.zoneId, zoneId),
            eq(schema.restaurantTables.locationId, locationId),
            eq(schema.restaurantTables.status, 'active'),
          ),
        )
        .returning({ id: schema.restaurantTables.id });

      await scoped.updateTable(
        schema.tableZones,
        { status: 'archived', archivedAt: now, updatedAt: now },
        and(eq(schema.tableZones.id, zoneId), eq(schema.tableZones.locationId, locationId)),
      );

      return { zoneId, archivedTableCount: archivedTables.length };
    });
  }

  async countActiveTables(locationId: LocationId): Promise<number> {
    return this.withTenant(async (scoped) => {
      const rows = await scoped.selectFrom(
        schema.restaurantTables,
        and(
          eq(schema.restaurantTables.locationId, locationId),
          eq(schema.restaurantTables.status, 'active'),
        ),
      );
      return rows.length;
    });
  }

  async maxOrdinalInZone(zoneId: string, locationId: LocationId): Promise<number> {
    return this.withTenant(async (scoped) => {
      const rows = await scoped.selectFrom(
        schema.restaurantTables,
        and(
          eq(schema.restaurantTables.zoneId, zoneId),
          eq(schema.restaurantTables.locationId, locationId),
        ),
      );
      return rows.reduce((max, row) => Math.max(max, row.ordinal), 0);
    });
  }
}
