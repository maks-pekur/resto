import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
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
    address: text('address'),
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
    foreignKey({
      name: 'member_location_scope_member_fk',
      columns: [table.memberId],
      foreignColumns: [member.id],
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
