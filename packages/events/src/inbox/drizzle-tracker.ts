import { schema, type TenantAwareDb } from '@resto/db';
import { and, eq } from 'drizzle-orm';
import type { InboxTracker } from './tracker';

/**
 * Postgres-backed `InboxTracker` for production consumers. Records live
 * in `inbox_processed`; reads/writes happen under `withoutTenant(...)`
 * because the table's RLS policies are system-only.
 *
 * Concurrency: `markProcessed` issues `INSERT ... ON CONFLICT DO NOTHING
 * RETURNING event_id`. The boolean return reflects whether THIS call
 * inserted the row — the canonical signal for "I won the race, I'm the
 * one who ran the handler". Two replicas calling concurrently with the
 * same key see exactly one of them get `true`.
 */
export class DrizzleInboxTracker implements InboxTracker {
  constructor(private readonly db: TenantAwareDb) {}

  hasSeen(consumer: string, eventId: string): Promise<boolean> {
    return this.db.withoutTenant('inbox tracker hasSeen', async (tx) => {
      const rows = await tx
        .select({ eventId: schema.inboxProcessed.eventId })
        .from(schema.inboxProcessed)
        .where(
          and(
            eq(schema.inboxProcessed.eventId, eventId),
            eq(schema.inboxProcessed.consumer, consumer),
          ),
        )
        .limit(1);
      return rows.length > 0;
    });
  }

  markProcessed(consumer: string, eventId: string, tenantId: string | null): Promise<boolean> {
    return this.db.withoutTenant('inbox tracker markProcessed', async (tx) => {
      const inserted = await tx
        .insert(schema.inboxProcessed)
        .values({ eventId, consumer, tenantId })
        .onConflictDoNothing()
        .returning({ eventId: schema.inboxProcessed.eventId });
      return inserted.length > 0;
    });
  }
}
