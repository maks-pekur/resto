import type { RestoTx, TenantAwareDb } from '@resto/db';
import { schema } from '@resto/db';
import type { EventEnvelope } from '../envelope';

/**
 * Result of `runDeduped`. `'executed'` means this caller won the race
 * and the handler ran. `'skipped'` means another caller (or a previous
 * delivery) already processed this `(consumer, eventId)`.
 */
export type RunDedupedResult = 'executed' | 'skipped';

/**
 * Run `handler` exactly once per `(consumer, envelope.id)` — guaranteed
 * across replicas and across redelivery — for handlers whose side
 * effects are confined to the project database.
 *
 * Mechanism: opens a system-context transaction; INSERTs inbox marker
 * with `ON CONFLICT DO NOTHING RETURNING`; if zero rows returned, the
 * marker already existed → short-circuit; otherwise calls `handler(tx)`
 * with the same transaction. Handler's DB writes commit together with
 * the inbox marker, or roll back together if anything throws.
 *
 * Tenant scoping: the transaction runs under BYPASSRLS (system role).
 * Handler MUST filter writes by `envelope.tenantId` explicitly per
 * ADR-0020 I-1; RLS is not the safety net inside this tx.
 *
 * External side effects (HTTP/email/payment): if the handler must do
 * any I/O outside this transaction, see ADR-0020 I-5b — use
 * `envelope.id` as the external system's idempotency key. This helper
 * does NOT guard external side effects.
 */
export const runDeduped = async (
  db: TenantAwareDb,
  envelope: EventEnvelope,
  consumer: string,
  handler: (tx: RestoTx) => Promise<void>,
): Promise<RunDedupedResult> => {
  return db.withoutTenant(`inbox dedup: ${consumer}`, async (tx) => {
    const inserted = await tx
      .insert(schema.inboxProcessed)
      .values({
        eventId: envelope.id,
        consumer,
        tenantId: envelope.tenantId,
      })
      .onConflictDoNothing()
      .returning({ eventId: schema.inboxProcessed.eventId });

    if (inserted.length === 0) return 'skipped';

    await handler(tx);
    return 'executed';
  });
};
