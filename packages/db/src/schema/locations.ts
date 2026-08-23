import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
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
import { member } from './auth';

/**
 * D-04/D-19 (phase 10.2): relocated out of the deleted `brands.ts`. The
 * only change from the pre-merge shape is dropping the second-dimension
 * foreign key and its column — locations are tenant-scoped only now,
 * since there is no brand layer between a tenant and its locations any
 * more.
 */
export const locations = pgTable(
  'locations',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    address: text('address'),
    // Exact point, not a geocoded guess: delivery zones and "how far is this order" both need a
    // coordinate, and a free-text address cannot answer either.
    latitude: numeric('latitude', { precision: 9, scale: 6 }),
    longitude: numeric('longitude', { precision: 9, scale: 6 }),
    // Defaults from tenants.timezone at creation, overridable — a chain can cross zones.
    timezone: text('timezone'),
    contacts: jsonb('contacts').$type<Record<string, unknown> | null>(),
    status: text('status').notNull().default('active'),
    ...timestampsColumns(),
  },
  (table) => [
    foreignKey({
      name: 'locations_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    check('locations_status_chk', sql`${table.status} IN ('active','archived')`),
    check('locations_slug_format_chk', sql`${table.slug} ~ '^[a-z0-9][a-z0-9-]*$'`),
    check(
      'locations_coords_range_chk',
      sql`(${table.latitude} IS NULL OR ${table.latitude} BETWEEN -90 AND 90)
          AND (${table.longitude} IS NULL OR ${table.longitude} BETWEEN -180 AND 180)`,
    ),
    uniqueIndex('locations_tenant_slug_uq').on(table.tenantId, table.slug),
    tenantParentUniqueIndex('locations', { id: table.id, tenantId: table.tenantId }),
  ],
);

export const memberLocationScope = pgTable(
  'member_location_scope',
  {
    memberId: text('member_id').notNull(),
    locationId: uuid('location_id').notNull(),
    tenantId: tenantIdColumn(),
    role: text('role'),
    ...timestampsColumns(),
  },
  (table) => [
    primaryKey({
      name: 'member_location_scope_pk',
      columns: [table.memberId, table.locationId],
    }),
    compositeTenantFk({
      name: 'member_location_scope_member_fk',
      child: { id: table.memberId, tenantId: table.tenantId },
      parent: { id: member.id, tenantId: member.tenantId },
    }).onDelete('cascade'),
    compositeTenantFk({
      name: 'member_location_scope_location_fk',
      child: { id: table.locationId, tenantId: table.tenantId },
      parent: { id: locations.id, tenantId: locations.tenantId },
    }).onDelete('restrict'),
    foreignKey({
      name: 'member_location_scope_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    index('member_location_scope_location_idx').on(table.locationId),
    index('member_location_scope_tenant_idx').on(table.tenantId),
  ],
);
