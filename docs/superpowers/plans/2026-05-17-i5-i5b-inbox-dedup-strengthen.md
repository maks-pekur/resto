# I-5 / I-5b inbox-dedup strengthen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `withInboxDedup` with `runDeduped` so handler dedup
and handler DB side effects commit atomically in a single Drizzle
transaction, eliminating duplicate handler invocation under concurrent
delivery (ADR-0020 § Invariant I-5). Document the I-5b external-side-
effect idempotency rule.

**Architecture:** New `runDeduped(db, envelope, consumer, async (tx) =>
…)` helper opens a system-context (`withoutTenant`) transaction,
performs `INSERT INTO inbox_processed … ON CONFLICT DO NOTHING
RETURNING`, short-circuits with `'skipped'` on zero rows, otherwise
hands the same `tx` to the handler and returns `'executed'`. The single
existing consumer (`NatsAuditSubscriber` → `RecordAuditService`)
migrates to the new helper; `RecordAuditService` gains a
`fromEnvelopeWithTx(envelope, tx)` method that writes via the passed
`tx`. The old `InboxTracker` interface and its two implementations
(`InMemoryInboxTracker`, `DrizzleInboxTracker`), the `withInboxDedup`
function, the `INBOX_TRACKER` DI token, and the two old inbox-tracker
test files are all deleted. One new integration test for `runDeduped`
covers the five behavioural cases the spec calls out.

**Tech Stack:** TypeScript 6.0 · NestJS · Drizzle ORM · Postgres 16 ·
NATS JetStream · Vitest 2 · testcontainers (Postgres for integration)

**Spec:** [`docs/superpowers/specs/2026-05-17-i5-i5b-inbox-dedup-strengthen-design.md`](../specs/2026-05-17-i5-i5b-inbox-dedup-strengthen-design.md)

**Branch:** `i5-inbox-dedup-strengthen` (spec already committed there
as `f242879`).

---

## Pre-flight

- Confirm branch: `git branch --show-current` → `i5-inbox-dedup-strengthen`.
- Docker is required for the integration test step in Task 1. If Docker
  isn't available, the integration test will SKIP (per the existing
  `isDockerAvailable()` gate); the rest of the plan still completes.
  Flag to the user if Docker is unavailable.
- No `pnpm install` needed — the lockfile is current.

---

## Task 1 — Add `runDeduped` helper + integration test (TDD)

Write the failing integration test first; then implement the helper.
Both files commit together.

**Files:**

- Create: `packages/events/src/inbox/run-deduped.ts`
- Create: `packages/events/test/integration/run-deduped.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/events/test/integration/run-deduped.spec.ts`. Reuse
the `startTestEnv` / `isDockerAvailable` infrastructure that the
existing inbox-tracker integration test uses (pattern visible at
`packages/events/test/integration/inbox-tracker.spec.ts:6-13`).

```ts
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@resto/db';
import { type EventEnvelope } from '../../src/envelope';
import { runDeduped } from '../../src/inbox/run-deduped';
import {
  isDockerAvailable,
  startTestEnv,
  stopTestEnv,
  type TestEnv,
} from '../setup';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;
if (!dockerOk) {
  console.warn('[run-deduped.integration] Docker not available — skipping.');
}

const TENANT = '11111111-1111-4111-8111-111111111111';

const buildEnvelope = (
  overrides: Partial<EventEnvelope> = {},
): EventEnvelope => ({
  id: randomUUID(),
  type: 'tenancy.tenant_provisioned.v1',
  version: 1,
  tenantId: TENANT,
  correlationId: randomUUID(),
  causationId: null,
  occurredAt: new Date(),
  payload: { tenantId: TENANT },
  ...overrides,
});

suite('runDeduped — atomic dedup + handler', () => {
  let env: TestEnv;

  beforeAll(async () => {
    env = await startTestEnv();
    // Seed the tenant so the inbox row's tenant_id value is consistent
    // with the rest of the schema (no FK on inbox_processed.tenant_id
    // today, but matches the pattern used by the prior inbox tests).
    await env.db.withoutTenant(
      'seed tenant for runDeduped integration',
      async (tx) => {
        await tx.insert(schema.tenants).values({
          id: TENANT,
          slug: 'rundeduped',
          displayName: 'Run Deduped Test',
          locale: 'en',
          defaultCurrency: 'USD',
        });
      },
    );
  }, 180_000);

  afterAll(async () => {
    await stopTestEnv(env);
  });

  beforeEach(async () => {
    // Clean the inbox between cases so eventId reuse across `it()`
    // blocks does not bleed dedup state.
    await env.db.withoutTenant('truncate inbox between cases', async (tx) => {
      await tx.execute('TRUNCATE TABLE inbox_processed' as unknown as never);
    });
  });

  it('happy path: first call executes handler, second call skips', async () => {
    const envelope = buildEnvelope();
    let calls = 0;
    const handler = async (): Promise<void> => {
      calls += 1;
    };
    const first = await runDeduped(env.db, envelope, 'consumer-happy', handler);
    const second = await runDeduped(
      env.db,
      envelope,
      'consumer-happy',
      handler,
    );
    expect(first).toBe('executed');
    expect(second).toBe('skipped');
    expect(calls).toBe(1);
  });

  it('rollback on throw: tx rolls back, next call re-invokes handler', async () => {
    const envelope = buildEnvelope();
    let calls = 0;
    await expect(
      runDeduped(env.db, envelope, 'consumer-throw', async () => {
        calls += 1;
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    // Second call should re-execute because the inbox row never persisted.
    const second = await runDeduped(
      env.db,
      envelope,
      'consumer-throw',
      async () => {
        calls += 1;
      },
    );
    expect(second).toBe('executed');
    expect(calls).toBe(2);
  });

  it('concurrent dedup: only one of two parallel calls executes the handler', async () => {
    const envelope = buildEnvelope();
    let calls = 0;
    const handler = async (): Promise<void> => {
      calls += 1;
    };
    const results = await Promise.all([
      runDeduped(env.db, envelope, 'consumer-race', handler),
      runDeduped(env.db, envelope, 'consumer-race', handler),
    ]);
    const executed = results.filter((r) => r === 'executed');
    const skipped = results.filter((r) => r === 'skipped');
    expect(executed).toHaveLength(1);
    expect(skipped).toHaveLength(1);
    expect(calls).toBe(1);
  });

  it('consumer isolation: same eventId, different consumers both execute', async () => {
    const envelope = buildEnvelope();
    let calls = 0;
    const handler = async (): Promise<void> => {
      calls += 1;
    };
    const a = await runDeduped(env.db, envelope, 'consumer-a', handler);
    const b = await runDeduped(env.db, envelope, 'consumer-b', handler);
    expect(a).toBe('executed');
    expect(b).toBe('executed');
    expect(calls).toBe(2);
  });

  it('event isolation: same consumer, different eventIds both execute', async () => {
    const e1 = buildEnvelope();
    const e2 = buildEnvelope();
    let calls = 0;
    const handler = async (): Promise<void> => {
      calls += 1;
    };
    const a = await runDeduped(env.db, e1, 'consumer-iso', handler);
    const b = await runDeduped(env.db, e2, 'consumer-iso', handler);
    expect(a).toBe('executed');
    expect(b).toBe('executed');
    expect(calls).toBe(2);
  });
});
```

- [ ] **Step 2: Run the spec to verify it fails for the right reason**

Run: `pnpm exec nx run events:integration -- run-deduped`

(If `events:integration` is not the correct target name, fall back to
`pnpm --filter @resto/events test:integration -- run-deduped` or
inspect `packages/events/package.json` / `project.json` for the actual
target.)

Expected: FAIL at the import line —
`Cannot find module '../../src/inbox/run-deduped'` — because the file
doesn't exist yet. If the tests run and fail with a different error,
STOP and report; do not proceed.

If Docker isn't available, the suite is SKIPPED — that is acceptable
for this step (we cannot verify locally), but flag it to the user so
they can run the tests on a machine with Docker before merging.

- [ ] **Step 3: Create the helper**

Create `packages/events/src/inbox/run-deduped.ts`:

```ts
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
```

- [ ] **Step 4: Run the spec to verify it passes**

Run: `pnpm exec nx run events:integration -- run-deduped` (or the
fallback variant from Step 2).

Expected: all 5 tests PASS, or the suite SKIPS (if Docker unavailable).
If SKIPPED, that does not prove the implementation — flag clearly and
ask the user to verify on a Docker-capable machine before merging.

Also run typecheck to confirm the new file compiles:
`pnpm exec nx run events:typecheck`. Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/events/src/inbox/run-deduped.ts packages/events/test/integration/run-deduped.spec.ts
git commit -m "feat(events): add runDeduped for atomic inbox-dedup + handler (ADR-0020 I-5)"
```

---

## Task 2 — Add `RecordAuditService.fromEnvelopeWithTx`

The existing `fromEnvelope(envelope)` method opens its own
`withoutTenant` transaction. Refactor it into a thin wrapper around the
new `fromEnvelopeWithTx(envelope, tx)` method, which writes via the
passed `tx`. The wrapper preserves the existing unit-test contract
(which mocks `db.withoutTenant`); the subscriber in Task 3 will call
`fromEnvelopeWithTx` directly.

**Files:**

- Modify: `apps/api/src/contexts/audit/application/record-audit.service.ts`
- Modify: `apps/api/test/unit/audit/record-audit.service.spec.ts` (one
  new test case for `fromEnvelopeWithTx` directly)

- [ ] **Step 1: Write the failing test**

Append a new `it()` case to the existing `describe('RecordAuditService',
…)` block in
`apps/api/test/unit/audit/record-audit.service.spec.ts`. The new case
exercises `fromEnvelopeWithTx` directly via a minimal `tx` mock,
without going through `withoutTenant`.

```ts
it('fromEnvelopeWithTx writes via the passed tx (skips withoutTenant)', async () => {
  const insert = vi.fn();
  const db = {
    // If fromEnvelopeWithTx accidentally calls withoutTenant, the test fails
    // because this mock returns void instead of running the callback.
    withoutTenant: vi.fn(),
  } as unknown as TenantAwareDb;
  const tx = { insert: () => ({ values: insert }) } as unknown as Parameters<
    Parameters<TenantAwareDb['withoutTenant']>[1]
  >[0];

  const service = new RecordAuditService(db);
  const envelope = buildEnvelope();
  await service.fromEnvelopeWithTx(envelope, tx);

  expect(db.withoutTenant).not.toHaveBeenCalled();
  expect(insert).toHaveBeenCalledTimes(1);
  const inserted = insert.mock.calls[0]?.[0] as Record<string, unknown>;
  expect(inserted.action).toBe('tenancy.tenant_provisioned.v1');
});
```

The existing four tests stay as-is — they cover `fromEnvelope` and
the wrapper preservation guarantees they keep passing.

- [ ] **Step 2: Run the spec to verify it fails**

Run: `pnpm --filter @resto/api test -- record-audit.service`

Expected: the new test FAILS with a TypeError or
`"service.fromEnvelopeWithTx is not a function"` because the method
doesn't exist yet. The four existing tests should still PASS.

- [ ] **Step 3: Refactor the service**

Replace `RecordAuditService.fromEnvelope` (currently lines 26-44 of
`apps/api/src/contexts/audit/application/record-audit.service.ts`)
with two methods. Add the `RestoTx` import.

```ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { schema, TenantAwareDb, type RestoTx } from '@resto/db';
import { type EventEnvelope } from '@resto/events';
import { AuditRecord } from '../domain/audit-record';

// ... existing ACTION_TARGET_KIND map and targetKindFor function unchanged ...

@Injectable()
export class RecordAuditService {
  private readonly logger = new Logger(RecordAuditService.name);

  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  async fromEnvelope(envelope: EventEnvelope): Promise<void> {
    await this.db.withoutTenant(`audit consumer: ${envelope.type}`, (tx) =>
      this.fromEnvelopeWithTx(envelope, tx),
    );
  }

  async fromEnvelopeWithTx(
    envelope: EventEnvelope,
    tx: RestoTx,
  ): Promise<void> {
    const record = this.project(envelope);
    await tx.insert(schema.auditLog).values({
      tenantId: record.tenantId,
      actorKind: record.actorKind,
      actorSubject: record.actorSubject,
      action: record.action,
      targetType: record.targetType,
      targetId: record.targetId,
      payload: record.payload,
      ipAddress: record.ipAddress,
      userAgent: record.userAgent,
      correlationId: record.correlationId,
      occurredAt: record.occurredAt,
    });
    this.logger.debug(
      { type: envelope.type, tenantId: envelope.tenantId },
      'Audit row recorded',
    );
  }

  private project(envelope: EventEnvelope): AuditRecord {
    // unchanged — keep the existing implementation
  }
}
```

The `project(envelope)` body is unchanged — keep it verbatim from the
current file.

- [ ] **Step 4: Run the spec to verify all tests pass**

Run: `pnpm --filter @resto/api test -- record-audit.service`

Expected: all 5 tests PASS (the existing 4 + the new one).

Also run the full api unit suite to confirm nothing else broke:
`pnpm --filter @resto/api test`. Expected: green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contexts/audit/application/record-audit.service.ts apps/api/test/unit/audit/record-audit.service.spec.ts
git commit -m "refactor(audit): split RecordAuditService into fromEnvelope + fromEnvelopeWithTx"
```

---

## Task 3 — Migrate `NatsAuditSubscriber` to `runDeduped`

Switch the subscriber from `withInboxDedup(tracker, …)` to
`runDeduped(db, …)`. After this task, no production code references the
old `InboxTracker` API.

**Files:**

- Modify: `apps/api/src/contexts/audit/infrastructure/nats-audit-subscriber.ts`

- [ ] **Step 1: Update the subscriber**

Replace the file's imports and the `onApplicationBootstrap` handler-
wiring block. The constructor's `INBOX_TRACKER` injection is replaced
with `TenantAwareDb`.

Updated imports block (replaces lines 1-14 of the current file):

```ts
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { TenantAwareDb } from '@resto/db';
import {
  runDeduped,
  type EventEnvelope,
  type EventSubscriber,
  type EventSubscription,
} from '@resto/events';
import { EVENT_SUBSCRIBER } from '../../../infrastructure/nats.module';
import { RecordAuditService } from '../application/record-audit.service';
```

Updated constructor (replaces current lines 28-32):

```ts
constructor(
  @Inject(EVENT_SUBSCRIBER) private readonly subscriber: EventSubscriber | null,
  @Inject(TenantAwareDb) private readonly db: TenantAwareDb,
  @Inject(RecordAuditService) private readonly recorder: RecordAuditService,
) {}
```

Updated handler-wiring inside `onApplicationBootstrap` (replaces
current lines 43-45):

```ts
const handler = async (envelope: EventEnvelope): Promise<void> => {
  await runDeduped(this.db, envelope, cfg.durableName, async (tx) => {
    await this.recorder.fromEnvelopeWithTx(envelope, tx);
  });
};
```

The rest of `onApplicationBootstrap` (subscribe call, push to
`subscriptions`, log) and `onApplicationShutdown` are unchanged.

- [ ] **Step 2: Run typecheck to verify the new signatures wire**

Run: `pnpm --filter @resto/api typecheck`

Expected: clean. If the DI token `INBOX_TRACKER` is still imported
anywhere (unlikely after this edit), the typecheck will fail with a
clear error — fix imports.

- [ ] **Step 3: Run the api unit and e2e suites**

```bash
pnpm --filter @resto/api test
```

Expected: all unit tests PASS. (The `NatsAuditSubscriber` itself has
no dedicated unit test; its behaviour is covered end-to-end by
`apps/api/test/e2e/audit-pipeline.e2e.spec.ts`.)

If the e2e suite is run as part of `pnpm test` and Docker is
available, expect that to PASS too. The audit pipeline's external
behaviour (publish event → audit row appears) is unchanged.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/contexts/audit/infrastructure/nats-audit-subscriber.ts
git commit -m "refactor(audit): migrate NatsAuditSubscriber to runDeduped (ADR-0020 I-5)"
```

---

## Task 4 — Delete old `InboxTracker` ecosystem + DI cleanup

After Task 3, nothing imports `InboxTracker`, `InMemoryInboxTracker`,
`DrizzleInboxTracker`, `withInboxDedup`, or `INBOX_TRACKER`. Remove
them all.

**Files:**

- Delete: `packages/events/src/inbox/tracker.ts`
- Delete: `packages/events/src/inbox/drizzle-tracker.ts`
- Delete: `packages/events/test/unit/inbox-tracker.spec.ts`
- Delete: `packages/events/test/integration/inbox-tracker.spec.ts`
- Modify: `packages/events/src/index.ts`
- Modify: `apps/api/src/infrastructure/nats.module.ts`

- [ ] **Step 1: Delete the four files**

```bash
git rm packages/events/src/inbox/tracker.ts packages/events/src/inbox/drizzle-tracker.ts packages/events/test/unit/inbox-tracker.spec.ts packages/events/test/integration/inbox-tracker.spec.ts
```

The `packages/events/src/inbox/` directory now contains only
`run-deduped.ts` from Task 1.

- [ ] **Step 2: Update `packages/events/src/index.ts`**

Two edits in the barrel:

1. Delete the two old export lines (currently lines 38-39 of the
   file):

   ```ts
   // DELETE these two lines:
   export {
     InMemoryInboxTracker,
     withInboxDedup,
     type InboxTracker,
   } from './inbox/tracker';
   export { DrizzleInboxTracker } from './inbox/drizzle-tracker';
   ```

2. Add the new export. Place it in the same neighbourhood the deleted
   exports occupied (right after the outbox exports), so the inbox
   surface stays grouped:

   ```ts
   export { runDeduped, type RunDedupedResult } from './inbox/run-deduped';
   ```

(Task 1 created the source and test files for `runDeduped` but
intentionally did NOT touch the barrel — that surface change is part
of this task's cleanup commit.)

- [ ] **Step 3: Update `apps/api/src/infrastructure/nats.module.ts`**

Three edits in this file:

1. Remove `DrizzleInboxTracker` and `InboxTracker` from the
   `@resto/events` import block (currently lines 9-16). Keep
   `NatsJetStreamPublisher`, `NatsJetStreamSubscriber`, `EventPublisher`,
   `EventSubscriber`.

2. Remove `TenantAwareDb` from the `@resto/db` import (currently line 17) **only if no other code in this file still uses it.** Searching
   the file: `TenantAwareDb` is used only by the `INBOX_TRACKER`
   provider's factory. Once that provider is gone, the import is dead.

3. Remove the `INBOX_TRACKER` export const (currently line 24):

   ```ts
   // DELETE:
   export const INBOX_TRACKER = Symbol('INBOX_TRACKER');
   ```

4. Remove the `INBOX_TRACKER` provider (currently lines 108-112):

   ```ts
   // DELETE this provider object:
   {
     provide: INBOX_TRACKER,
     useFactory: (db: TenantAwareDb): InboxTracker => new DrizzleInboxTracker(db),
     inject: [TenantAwareDb],
   },
   ```

5. Remove `INBOX_TRACKER` from the module's `exports` array (currently
   line 115):

   ```ts
   // before
   exports: [EVENT_PUBLISHER, EVENT_SUBSCRIBER, INBOX_TRACKER],
   // after
   exports: [EVENT_PUBLISHER, EVENT_SUBSCRIBER],
   ```

- [ ] **Step 4: Typecheck, then run all tests**

```bash
pnpm exec nx run-many --target=typecheck --projects=api,events
pnpm exec nx run-many --target=test --projects=api,events
```

Expected: typecheck clean (any leftover import of removed symbols
fails here with a clear error). Tests pass: api unit suite + events
unit + integration (the `run-deduped` integration test runs; the
removed `inbox-tracker.spec.ts` files are gone, so the suite shrinks).

- [ ] **Step 5: Commit**

```bash
git add packages/events/src/index.ts apps/api/src/infrastructure/nats.module.ts
git commit -m "refactor(events): remove deprecated InboxTracker ecosystem (ADR-0020 I-5)"
```

Note: the four `git rm` deletions from Step 1 are already staged by
the `rm` command. `git status` should show them alongside the two
modifications. The commit captures all six file changes.

---

## Task 5 — Refresh package documentation

Two docs need updates so they describe the actual contract instead of
the now-deleted forward-looking deprecation language.

**Files:**

- Modify: `packages/events/CLAUDE.md` (§ Inbox block, ~lines 85-99)
- Modify: `packages/events/README.md` (§ Idempotency block, ~lines
  61-77)

- [ ] **Step 1: Update `packages/events/CLAUDE.md`**

Replace the existing `### Inbox (handler dedup)` section. The new
section (replacing the current bullets that mention `withInboxDedup`
deprecation and `runDeduped` planning):

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
  shape — three independent transactions for `hasSeen` / handler /
  `markProcessed` — could not prevent duplicate handler invocation
  under concurrent delivery. See git history for the removal PR.
```

- [ ] **Step 2: Update `packages/events/README.md`**

Two edits in this file:

1. In the file-map (around line 17), replace
   `tracker.ts            per-consumer dedup ledger (in-memory for now)`
   with
   `run-deduped.ts        atomic inbox-dedup + handler tx wrapper (ADR-0020 I-5)`.

2. Replace the `## Idempotency` section (currently approximately lines
   61-77) with:

```markdown
## Idempotency

Delivery is **at-least-once.** Consumers MUST be idempotent. The
package provides two layers of defence:

1. **Producer side:** every JetStream publish carries `msgID =
envelope.id`. Within JetStream's dedup window, repeated publishes
   of the same id are dropped at the broker.
2. **Consumer side:** wrap your handler with
   `runDeduped(db, envelope, consumer, async (tx) => …)`. The helper
   inserts the inbox marker and runs the handler in a single Drizzle
   transaction; the handler's DB side effects commit together with
   the marker, or roll back together. At-least-once delivery becomes
   at-most-once handler invocation for handlers whose side effects
   are confined to the project database.

Handlers whose side effects fall outside the project database (HTTP,
email, payment intent creation) MUST be idempotent by design — derive
the idempotency key from `envelope.id` and pass it to the external
system as that system's idempotency token (ADR-0020 § Invariant
I-5b). `runDeduped` does NOT guard external side effects.

Both layers are necessary: the broker dedup is bounded in time;
consumer dedup persists across that window.
```

- [ ] **Step 3: Commit**

```bash
git add packages/events/CLAUDE.md packages/events/README.md
git commit -m "docs(events): refresh inbox-dedup contract for runDeduped (ADR-0020 I-5)"
```

---

## Task 6 — Final verification

After Tasks 1-5, run the full pipeline one more time to confirm
nothing else regressed.

- [ ] **Step 1: Run typecheck for all projects**

```bash
pnpm exec nx run-many --target=typecheck --all
```

Expected: 8/8 projects green. If anything fails, investigate — likely
a leftover import of a removed symbol in a file we didn't touch.

- [ ] **Step 2: Run all unit/integration tests**

```bash
pnpm exec nx run-many --target=test --all
```

Expected: green across api, events, qr-menu, and any other test
targets. The `run-deduped` integration test runs; the deleted
inbox-tracker tests are gone.

- [ ] **Step 3: Run lint where it was already clean**

`api:lint` has pre-existing `withInboxDedup` deprecation failures on
the main branch (per the I-3 PR analysis). After this work, those
specific failures should now be gone — the symbol no longer exists.
But there may be other unrelated lint failures we're not addressing.

```bash
pnpm exec nx run qr-menu:lint
pnpm exec nx run admin:lint
```

Expected: both green. Skip `api:lint` and `events:lint` if they have
known pre-existing issues; if they're clean, even better.

- [ ] **Step 4: Inspect commit log**

```bash
git log main..HEAD --oneline
```

Expected: spec commit `f242879` plus 5 implementation commits from
Tasks 1-5 (Task 6 has no commit — verification only). Each commit
follows Conventional Commits, single-line subject, no body, no Claude
attribution.

- [ ] **Step 5: Hand off**

Stop. Ask the user before `git push` and before opening a PR. The
final PR description is the user's choice; the
finishing-a-development-branch skill drives it.

---

## Out of scope (re-stated for the executor)

If any of these surface, flag to the user — do NOT silently expand
scope:

- I-5b ledger implementation (waits for first external-side-effect
  handler, planned for Phase D OTP).
- Tenant-context variant of `runDeduped` (waits for first
  tenant-context handler + an `inbox_processed` RLS change).
- Schema changes to `inbox_processed`.
- Migration of any consumer other than `NatsAuditSubscriber` (no
  other consumer exists today).
- Adding new event contracts or modifying existing payloads.
- Fixing pre-existing `api:lint` deprecation failures on `main` —
  this branch happens to fix the `withInboxDedup` ones as a side
  effect, but doesn't address other lint debt.
