import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { pkUuid } from './_columns';
import { tenants } from './tenants';

/**
 * Immutable audit log of all consequential actions.
 *
 * `tenant_id` is *nullable* by design: platform-level events (a tenant
 * being provisioned, system maintenance jobs) are not scoped to any
 * tenant. Tenant-level events (a manager publishing the menu, a user
 * being created) carry the tenant id and are visible only to that tenant.
 *
 * Rows are append-only — the application has no UPDATE or DELETE path
 * against this table.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: pkUuid(),
    tenantId: uuid('tenant_id'),
    actorKind: text('actor_kind').notNull(),
    /** Keycloak `sub` claim, the literal `system`, or a service id. */
    actorSubject: text('actor_subject').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    correlationId: uuid('correlation_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    foreignKey({
      name: 'audit_log_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('set null'),
    index('audit_log_tenant_occurred_idx').on(table.tenantId, table.occurredAt),
    index('audit_log_actor_occurred_idx').on(table.actorSubject, table.occurredAt),
    index('audit_log_action_occurred_idx').on(table.action, table.occurredAt),
    check(
      'audit_log_actor_kind_chk',
      sql`${table.actorKind} IN ('platform_user', 'tenant_user', 'system', 'service')`,
    ),
  ],
);
