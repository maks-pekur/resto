import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  compositeTenantFk,
  pkUuid,
  tenantIdColumn,
  tenantParentUniqueIndex,
  timestampsColumns,
} from './_columns';
import { tenants } from './tenants';
import { locations } from './locations';

/**
 * A named area inside a location — "Зал 1", "Терраса" — that groups tables.
 * Archive-only lifecycle (CLAUDE.md: hard deletes forbidden); a zone with
 * live tables is archived, never dropped.
 */
export const tableZones = pgTable(
  'table_zones',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    locationId: uuid('location_id').notNull(),
    name: text('name').notNull(),
    status: text('status').notNull().default('active'),
    ...timestampsColumns(),
  },
  (table) => [
    foreignKey({
      name: 'table_zones_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    compositeTenantFk({
      name: 'table_zones_location_fk',
      child: { id: table.locationId, tenantId: table.tenantId },
      parent: { id: locations.id, tenantId: locations.tenantId },
    }).onDelete('restrict'),
    check('table_zones_status_chk', sql`${table.status} IN ('active','archived')`),
    uniqueIndex('table_zones_location_name_active_uq')
      .on(table.tenantId, table.locationId, table.name)
      .where(sql`status = 'active'`),
    index('table_zones_location_idx').on(table.tenantId, table.locationId, table.status),
    tenantParentUniqueIndex('table_zones', { id: table.id, tenantId: table.tenantId }),
  ],
);

/**
 * A single physical table, always inside one zone. `locationId` is
 * deliberately denormalised onto this child (not just derivable through
 * `zoneId`) — it is what makes the RESTRICTIVE location-isolation RLS
 * policy possible (CONTEXT D-20 / CTO BLOCK-2), mirroring `menu_stop_list`.
 */
export const restaurantTables = pgTable(
  'restaurant_tables',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    zoneId: uuid('zone_id').notNull(),
    locationId: uuid('location_id').notNull(),
    // Free display text — an operator may type `A1` or `терраса-3` (CONTEXT D-23).
    number: text('number').notNull(),
    /** The secret printed in the QR code, exchanged for a table session (migration 0011). */
    qrToken: text('qr_token')
      .notNull()
      .$defaultFn(() => randomToken()),
    // Integer sort key TBL-10's unlabelled sheet depends on; `number` alone
    // sorts lexicographically (1, 10, 11, 2, 20) — see CONTEXT D-23.
    ordinal: integer('ordinal').notNull(),
    status: text('status').notNull().default('active'),
    ...timestampsColumns(),
  },
  (table) => [
    foreignKey({
      name: 'restaurant_tables_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    compositeTenantFk({
      name: 'restaurant_tables_zone_fk',
      child: { id: table.zoneId, tenantId: table.tenantId },
      parent: { id: tableZones.id, tenantId: tableZones.tenantId },
    }).onDelete('restrict'),
    compositeTenantFk({
      name: 'restaurant_tables_location_fk',
      child: { id: table.locationId, tenantId: table.tenantId },
      parent: { id: locations.id, tenantId: locations.tenantId },
    }).onDelete('restrict'),
    check('restaurant_tables_status_chk', sql`${table.status} IN ('active','archived')`),
    // prettier-ignore
    uniqueIndex('restaurant_tables_zone_number_active_uq').on(table.tenantId, table.zoneId, table.number)
      .where(sql`status = 'active'`),
    index('restaurant_tables_zone_ordinal_idx').on(
      table.tenantId,
      table.zoneId,
      table.status,
      table.ordinal,
    ),
    tenantParentUniqueIndex('restaurant_tables', { id: table.id, tenantId: table.tenantId }),
  ],
);

/** 16 random bytes: long enough that a code cannot be guessed from a neighbouring table's. */
const randomToken = (): string => randomBytes(16).toString('hex');

/**
 * A guest's claim to a table, opened by scanning its code. Orders read the table from here rather
 * than from whatever the browser sends, so a copied link cannot order to someone else's table.
 */
export const tableSessions = pgTable(
  'table_sessions',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    tableId: uuid('table_id').notNull(),
    locationId: uuid('location_id').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'table_sessions_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    compositeTenantFk({
      name: 'table_sessions_table_fk',
      child: { id: table.tableId, tenantId: table.tenantId },
      parent: { id: restaurantTables.id, tenantId: restaurantTables.tenantId },
    }).onDelete('cascade'),
    index('table_sessions_tenant_table_idx').on(table.tenantId, table.tableId, table.expiresAt),
  ],
);
