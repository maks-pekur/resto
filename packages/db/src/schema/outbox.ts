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
 * Transactional outbox.
 *
 * Bounded contexts INSERT into this table inside the same transaction as
 * the state change that produced the event. A separate dispatcher polls
 * unclaimed rows, publishes them to the broker, and marks them delivered.
 * This eliminates the dual-write problem: there is no broker publish
 * outside a successful DB commit (ADR-0004).
 *
 * `tenant_id` is nullable: platform-level events (e.g. `tenant.provisioned.v1`)
 * are not scoped to a tenant. RLS policies match the `audit_log` shape —
 * tenant context can append events for its own tenant; reads and updates
 * (claim / mark delivered) are limited to system context.
 *
 * The `payload` and `headers` jsonb columns hold the broker-agnostic
 * envelope shape from `@resto/events` (see `EventEnvelope`). The
 * dispatcher does not parse them — it only forwards them to the broker.
 */
export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: pkUuid(),
    /** Tenant the event belongs to; null for platform-level events. */
    tenantId: uuid('tenant_id'),
    /** Aggregate id that produced the event (optional convenience for ops). */
    aggregateId: uuid('aggregate_id'),
    /** Event type, `<context>.<event>.v<n>`. Doubles as the broker subject. */
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    headers: jsonb('headers')
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
    /**
     * Dispatcher claim timestamp. NULL → unclaimed. A row whose
     * `claimed_at` is older than the visibility timeout is reclaimable
     * (the prior dispatcher likely crashed mid-publish).
     */
    claimedAt: timestamp('claimed_at', { withTimezone: true, mode: 'date' }),
    /** Set after successful publish. NULL → not yet delivered. */
    deliveredAt: timestamp('delivered_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    foreignKey({
      name: 'outbox_events_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('set null'),
    /** Working index for the dispatcher: undelivered rows in arrival order. */
    index('outbox_events_undelivered_idx')
      .on(table.occurredAt)
      .where(sql`delivered_at IS NULL`),
    /** Per-tenant inspection (ops dashboards, debugging a specific tenant). */
    index('outbox_events_tenant_occurred_idx').on(table.tenantId, table.occurredAt),
    /** Look up by type for replay or filtering. */
    index('outbox_events_type_occurred_idx').on(table.type, table.occurredAt),
    check(
      'outbox_events_type_format_chk',
      sql`${table.type} ~ '^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+\\.v[0-9]+$'`,
    ),
  ],
);
