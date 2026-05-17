# I-5 / I-5b inbox-dedup strengthen — design

- **Status:** draft
- **Date:** 2026-05-17
- **Authoritative reference:** [ADR-0020 § Invariant I-5 + I-5b](../../adr/0020-multi-tenancy-and-event-bus-invariants.md)
- **Follow-on:** [writing-plans] this design feeds a single execute-phase
  plan. No multi-phase decomposition.

## Context

ADR-0020 § Invariant I-5 mandates that handler dedup MUST share a
database transaction with the handler's DB side effects. The current
implementation, `withInboxDedup(tracker, consumer, handler)`, performs
its three operations — `hasSeen`, `handler()`, `markProcessed` — in
**three separate database transactions**. Two replicas (or one replica
plus a crash-recovery redelivery) can both observe `hasSeen === false`,
both run the handler with full side effects (audit rows, emails,
payments, downstream publishes), and only one of the `markProcessed`
writes wins. The persisted dedup record is unique; the side effects are
not. This is the failure mode I-5 closes.

I-5b adds the constraint that handlers whose side effects fall outside
the project database — HTTP calls, email sends, payment intent creation
— MUST derive their idempotency key from `envelope.id` and pass it to
the external system as that system's idempotency token. The handler is
expected to be safely re-runnable; `runDeduped` does NOT guard external
side effects.

There is exactly one current consumer of `withInboxDedup`:
`apps/api/src/contexts/audit/infrastructure/nats-audit-subscriber.ts`
(two subscriptions: `tenancy.>` and `identity.>` → `RecordAuditService`).
The handler's DB side effect (insert into `audit_log`) happens under
`db.withoutTenant(...)` today and is safe to migrate to the new shape
without RLS changes. No external-side-effect handlers exist yet; the
first one is planned for Phase D (customer phone + OTP).

Prod is not deployed (confirmed 2026-05-16). Replicas don't exist yet
either, so the duplicate-side-effect failure mode has not bitten. But
landing the fix before Phase D's OTP handler is authored is the
cheapest moment — Phase D would be the first place this bug bites in
production.

## Goals

- Replace `withInboxDedup(tracker, consumer, handler)` with
  `runDeduped(db, envelope, consumer, async (tx) => …)`. The new helper
  performs `INSERT INTO inbox_processed (event_id, consumer, tenant_id)
VALUES (…) ON CONFLICT DO NOTHING RETURNING event_id` and the handler
  call inside the same Drizzle transaction.
- Migrate `NatsAuditSubscriber` (the one current consumer) to the new
  helper.
- Delete `withInboxDedup`, `InboxTracker`, `InMemoryInboxTracker`,
  `DrizzleInboxTracker`, the `INBOX_TRACKER` DI token, and the two old
  inbox-tracker test files. Replace with one new integration test for
  `runDeduped` covering happy-path, rollback, concurrent dedup, and
  consumer/event-id isolation.
- Update `packages/events/CLAUDE.md` § Inbox block from the
  forward-looking deprecation language to the actual contract +
  document the I-5b rule (envelope.id as external idempotency key).

## Non-goals

- Implementing the I-5b "outgoing side-effect ledger". The ADR-0020 I-5b
  contract is doc-only in this phase; the ledger and its helpers land
  when the first external-side-effect handler is built (Phase D).
- Adding tenant-context support to `runDeduped`. The helper opens a
  `withoutTenant` transaction; the handler is responsible for filtering
  by `envelope.tenantId` per ADR-0020 I-1. If a future handler needs
  tenant-context tx, that work changes `inbox_processed`'s RLS policy
  and is a separate phase.
- Changing the `inbox_processed` schema, PK, indexes, or retention
  behaviour. The table is unchanged.
- Migration of any code other than `NatsAuditSubscriber` — no other
  consumer exists.

## Architecture — single transaction shape

```
Before (withInboxDedup — broken under concurrency)
─────────────────────────────────────────────────────────
tx1: SELECT 1 FROM inbox_processed WHERE …    (hasSeen)
tx2: <handler runs its own writes, may also span txs>
tx3: INSERT INTO inbox_processed … ON CONFLICT DO NOTHING (markProcessed)

Failure mode: two replicas observe hasSeen=false (race window between
tx1 and tx3), both call handler, both write side effects.

After (runDeduped — atomic claim + handler)
─────────────────────────────────────────────────────────
single tx (system-context, BYPASSRLS):
  1. INSERT INTO inbox_processed (event_id, consumer, tenant_id)
     VALUES (…) ON CONFLICT DO NOTHING RETURNING event_id;
  2. if returned 0 rows → COMMIT (no-op) and return 'skipped';
  3. await handler(tx)   ← handler's DB writes via SAME tx;
  4. COMMIT — inbox marker and handler writes commit atomically.

If handler throws → tx rolls back → inbox row not persisted → next
delivery re-claims and re-runs handler.

Concurrent delivery → Postgres serializes the row INSERT; one tx gets
the row, the other gets zero RETURNING rows and short-circuits before
the handler. Handler is invoked exactly once across replicas.
```

## Components

### Component 1 — `runDeduped` helper (new)

**File:** `packages/events/src/inbox/run-deduped.ts` (new)

```ts
import type { RestoTx, TenantAwareDb } from '@resto/db';
import { schema } from '@resto/db';
import type { EventEnvelope } from '../envelope';

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
```

**Note:** `RestoTx` is already exported from
`packages/db/src/client.ts` (verified during the spec phase). No
additional surface change is needed.

### Component 2 — `NatsAuditSubscriber` migration

**File:** `apps/api/src/contexts/audit/infrastructure/nats-audit-subscriber.ts`

**Diff shape (lines 28-51 of the current file):**

```ts
// Constructor changes: @Inject(INBOX_TRACKER) tracker → @Inject(TenantAwareDb) db
constructor(
  @Inject(EVENT_SUBSCRIBER) private readonly subscriber: EventSubscriber | null,
  @Inject(TenantAwareDb) private readonly db: TenantAwareDb,
  @Inject(RecordAuditService) private readonly recorder: RecordAuditService,
) {}

// In onApplicationBootstrap, per subscription:
const handler = async (envelope: EventEnvelope): Promise<void> => {
  await runDeduped(this.db, envelope, cfg.durableName, async (tx) => {
    await this.recorder.fromEnvelopeWithTx(envelope, tx);
  });
};
```

### Component 3 — `RecordAuditService.fromEnvelopeWithTx`

**File:** `apps/api/src/contexts/audit/application/record-audit.service.ts`

Add a new method that accepts an explicit `tx`; refactor `fromEnvelope`
to be a thin wrapper that opens its own `withoutTenant` tx and calls
the new method. The `fromEnvelope` wrapper is kept for any
external/test callers; `NatsAuditSubscriber` calls
`fromEnvelopeWithTx` directly.

```ts
async fromEnvelope(envelope: EventEnvelope): Promise<void> {
  await this.db.withoutTenant(`audit consumer: ${envelope.type}`, (tx) =>
    this.fromEnvelopeWithTx(envelope, tx),
  );
}

async fromEnvelopeWithTx(envelope: EventEnvelope, tx: RestoTx): Promise<void> {
  const record = this.project(envelope);
  await tx.insert(schema.auditLog).values({ … });
  this.logger.debug({ type: envelope.type, tenantId: envelope.tenantId }, 'Audit row recorded');
}
```

The `project(envelope)` projection logic and the `ACTION_TARGET_KIND`
map are unchanged.

### Component 4 — DI cleanup

**File:** `apps/api/src/infrastructure/nats.module.ts`

Remove the `INBOX_TRACKER` provider (currently bound to
`DrizzleInboxTracker`). `NatsAuditSubscriber` no longer depends on it.
No replacement provider is needed — `TenantAwareDb` is already wired by
the `@resto/db` integration.

### Component 5 — package surface cleanup

**Files deleted:**

- `packages/events/src/inbox/tracker.ts` (entire file)
- `packages/events/src/inbox/drizzle-tracker.ts` (entire file)
- `packages/events/test/unit/inbox-tracker.spec.ts` (entire file)
- `packages/events/test/integration/inbox-tracker.spec.ts` (entire file)

**File modified — `packages/events/src/index.ts`:**

Remove:

```ts
export {
  InMemoryInboxTracker,
  withInboxDedup,
  type InboxTracker,
} from './inbox/tracker';
export { DrizzleInboxTracker } from './inbox/drizzle-tracker';
```

Add:

```ts
export { runDeduped, type RunDedupedResult } from './inbox/run-deduped';
```

### Component 6 — `packages/events/CLAUDE.md` § Inbox refresh

The existing block (~lines 85-99 of the current CLAUDE.md) describes
`withInboxDedup` as deprecated and `runDeduped` as planned. After this
phase lands, rewrite to the actual contract:

```markdown
### Inbox (handler dedup)

- **DB-only handlers use `runDeduped(db, envelope, consumer, async (tx) => …)`.**
  The helper opens a system-context transaction, inserts the inbox marker
  with `ON CONFLICT DO NOTHING RETURNING`, short-circuits if the marker
  already existed, and otherwise hands the same `tx` to the handler so
  its DB writes commit together with the inbox marker (or roll back
  together). At-least-once delivery → at-most-once handler invocation
  for handlers whose side effects are confined to the project database.

- **External-side-effect handlers (HTTP, email, payment) MUST be
  idempotent by design** (ADR-0020 I-5b). When the handler's side effect
  can't share the tx, derive an idempotency key from `envelope.id` and
  pass it to the external system as that system's idempotency token.
  Re-runnability is the handler's contract, not `runDeduped`'s.

- **`InboxTracker` / `withInboxDedup` are removed.** The old wrapper
  shape — three independent transactions for hasSeen / handler /
  markProcessed — could not prevent duplicate handler invocation under
  concurrent delivery. See git history for the deprecation and removal
  PRs.
```

### Component 7 — Integration test

**File:** `packages/events/test/integration/run-deduped.spec.ts` (new)

Testcontainer Postgres (same pattern as the existing
`outbox-roundtrip.spec.ts`). Five cases:

| Case                   | Asserts                                                                                                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Happy path**         | First call: handler invoked, returns `'executed'`, inbox row created. Second call same `(consumer, eventId)`: returns `'skipped'`, handler NOT invoked.                                             |
| **Rollback on throw**  | Handler throws inside `runDeduped` → tx rolls back → inbox row absent → next call invokes handler again. (Failure mode that proves the at-most-once guarantee under failure.)                       |
| **Concurrent dedup**   | Two parallel `runDeduped(...)` promises with the same `(consumer, eventId)`, awaited with `Promise.all` → exactly one `'executed'`, exactly one `'skipped'`, handler invocation count is exactly 1. |
| **Consumer isolation** | Same `eventId`, different `consumer` → both handlers invoked; two inbox rows.                                                                                                                       |
| **Event isolation**    | Same `consumer`, different `eventId` → both handlers invoked; two inbox rows.                                                                                                                       |

Setup/teardown: `TRUNCATE inbox_processed` between cases via
`db.withoutTenant(...)`.

## Risks and open questions for the plan phase

- **`audit-pipeline.e2e.spec.ts` impact.** The existing e2e test
  publishes an event via NATS and asserts an audit row appears. The
  migration changes the internal tx-shape but not the external
  behaviour; the test should still pass without modification. If it
  imports any removed symbol, the plan fixes the imports.
- **`record-audit.service.spec.ts` impact** (the file exists, verified
  during the spec phase at
  `apps/api/test/unit/audit/record-audit.service.spec.ts`). The unit
  test may exercise the existing `fromEnvelope(envelope)` path; since
  that wrapper is preserved, no test reshape is strictly required. If
  the plan-phase researcher decides the test should additionally cover
  `fromEnvelopeWithTx(envelope, tx)` directly via a mock `tx`, that's
  acceptable enrichment but not a blocker.
- **README in `packages/events/`.** Brief package README may reference
  `withInboxDedup`. Refresh during the doc update step.

## Out of scope (re-stated for the plan)

- I-5b ledger implementation (waits for first external-side-effect
  handler).
- Tenant-context variant of `runDeduped` (waits for first
  tenant-context handler + an `inbox_processed` RLS change).
- Schema changes to `inbox_processed`.
- Migration of any code other than `NatsAuditSubscriber`.
- Adding new event contracts or modifying existing payloads.
