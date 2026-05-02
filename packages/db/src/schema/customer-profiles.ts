import { foreignKey, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { pkUuid, tenantIdColumn, timestampsColumns } from './_columns';
import { tenants } from './tenants';
import { user } from './auth';

/**
 * Per-tenant customer profile. Customer identity (phone) is global on BA
 * `user`; their tenant-scoped state (display name, loyalty points,
 * order-history FKs) lives here. Eager-created via BA `callbackOnVerification`
 * hook on phone verify (Phase E).
 */
export const customerProfiles = pgTable(
  'customer_profiles',
  {
    id: pkUuid(),
    userId: text('user_id').notNull(), // BA user.id is text — verified in Task 2
    tenantId: tenantIdColumn(),
    displayName: text('display_name'),
    loyaltyPoints: integer('loyalty_points').notNull().default(0),
    ...timestampsColumns(),
  },
  (table) => [
    foreignKey({
      name: 'customer_profiles_user_fk',
      columns: [table.userId],
      foreignColumns: [user.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'customer_profiles_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    uniqueIndex('customer_profiles_user_tenant_uq').on(table.userId, table.tenantId),
  ],
);
