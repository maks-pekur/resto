import { sql } from 'drizzle-orm';
import { index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Inbox dedup ledger. Per (event_id, consumer) record indicating an
 * event has been successfully processed. NATS at-least-once means
 * duplicate deliveries are normal; this table makes handlers idempotent
 * across redeliveries and across replicas.
 *
 * Writes go through `DrizzleInboxTracker` (`@resto/events`) under
 * `withoutTenant(...)` system context — consumers run outside any tenant
 * scope. Reads are restricted to system context (RLS), so cross-tenant
 * inspection is impossible from regular code.
 *
 * `tenant_id` is a convenience copy of the envelope's `tenantId` (null
 * for platform events) — useful for ops dashboards and per-tenant
 * retention sweeps. RLS does not enforce on it directly because reads
 * are already system-only.
 */
export const inboxProcessed = pgTable(
  'inbox_processed',
  {
    eventId: uuid('event_id').notNull(),
    consumer: text('consumer').notNull(),
    tenantId: uuid('tenant_id'),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.consumer] }),
    /** Retention sweeps and per-consumer audits. */
    index('inbox_processed_consumer_processed_at_idx').on(table.consumer, table.processedAt),
  ],
);
