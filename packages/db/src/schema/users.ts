import { sql } from 'drizzle-orm';
import { check, foreignKey, index, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { citext } from './_types';
import { pkUuid, tenantIdColumn, timestampsColumns } from './_columns';
import { tenants } from './tenants';

/**
 * A user of a tenant — the operator-side principal (owner, manager,
 * kitchen, waiter). Authentication is delegated to Keycloak; this table
 * carries the per-tenant projection of "who can do what" plus profile
 * fields that belong to Resto, not Keycloak.
 *
 * Membership is per-tenant: the same Keycloak subject can be a user in
 * more than one tenant, with potentially different roles.
 */
export const users = pgTable(
  'users',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    /**
     * Keycloak subject (`sub`) claim — stable id of the human across all
     * tenants they belong to.
     */
    keycloakSubject: text('keycloak_subject').notNull(),
    email: citext('email').notNull(),
    displayName: text('display_name'),
    role: text('role').notNull(),
    ...timestampsColumns(),
  },
  (table) => [
    foreignKey({
      name: 'users_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    uniqueIndex('users_tenant_keycloak_uq').on(table.tenantId, table.keycloakSubject),
    uniqueIndex('users_tenant_email_uq').on(table.tenantId, table.email),
    index('users_tenant_role_idx').on(table.tenantId, table.role),
    check('users_role_chk', sql`${table.role} IN ('owner', 'manager', 'kitchen', 'waiter')`),
    check(
      'users_email_format_chk',
      sql`${table.email} ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$'`,
    ),
  ],
);
