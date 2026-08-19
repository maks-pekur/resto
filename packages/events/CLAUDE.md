# @resto/events

## Purpose

Event contracts (Zod schemas), envelope construction helpers, outbox
dispatcher, inbox dedup, NATS JetStream publisher + subscriber. The
broker-agnostic surface that bounded contexts use to talk asynchronously
(ADR-0004).

## Layout

- `src/contracts/` — Zod schemas for event payloads, one file per
  bounded-context surface (`identity`, `tenancy`, …).
- `src/envelope.ts` — the wire envelope schema (id, type, version,
  tenantId, correlationId, causationId, occurredAt, payload).
- `src/correlation.ts` — `withCorrelationId(id, fn)` ALS frame for the
  HTTP middleware.
- `src/outbox/` — `appendToOutbox`, `claimOutboxBatch`,
  `releaseOutboxClaim`, `markOutboxDelivered`, `OutboxDispatcher`.
- `src/inbox/` — `runDeduped` — atomic inbox-dedup + handler tx wrapper
  (ADR-0020 I-5).
- `src/infrastructure/` — `NatsJetStreamPublisher`,
  `NatsJetStreamSubscriber`. The only files that know about NATS.

## Rules

This package owns the implementation of several event-bus invariants from
[ADR-0020](../../docs/adr/0020-multi-tenancy-and-event-bus-invariants.md).
The rules below are the concrete shape of those invariants here.

### Envelope construction

- **`correlationId` derives from the active OTel span** (ADR-0020 I-4). Use
  the shared `buildEnvelope({ type, payload, … })` helper which reads from
  the OTel context internally. Direct `EventEnvelope` literal construction
  in application code is forbidden — it always loses the trace link.
- **`randomUUID()` for `correlationId` is a bug.** An ESLint
  `no-restricted-syntax` rule disallows `correlationId: randomUUID()` and
  `correlationId: crypto.randomUUID()` literals; until it lands, reviewers
  enforce manually.
- **All other envelope fields are derived in `buildEnvelope`** too:
  `id = randomUUID()` (per-event, NOT correlation), `occurredAt = new
Date()`, `version` from the contract module, `tenantId` from the active
  ALS tenant context (or explicit `null` for platform events).

### Outbox

- **No dual writes.** Application code writes the state change AND the
  outbox row in the same database transaction. The dispatcher reads
  outbox and publishes — broker-side delivery is independent of the
  state-change commit.
- **`claimOutboxBatch` uses `FOR UPDATE SKIP LOCKED` on the candidate
  subquery.** PostgreSQL preserves the lock when the outer UPDATE matches
  `id IN (subquery)`. Multiple dispatcher replicas can run safely.
- **Claimed rows MUST be re-sorted by `occurred_at` before publishing.**
  The `UPDATE … RETURNING` order is arbitrary; some flows (`signed_in`
  then `signed_out` for one user) depend on order.
- **`releaseOutboxClaim` and `markOutboxDelivered` MUST scope by claim
  ownership.** The current `WHERE id = ? AND delivered_at IS NULL` is a
  lost-update vector — A's release can clear B's claim if B reclaimed
  after the visibility timeout. Add a `claim_id` (or `claimed_at = ?`)
  predicate to both.
- **`OutboxDispatcher.stop()` MUST be idempotent.** Two concurrent stop
  calls must not overwrite the resolver — cache the first call's promise
  and return it for subsequent callers. Otherwise the first caller waits
  forever (graceful-shutdown hazard).
- **`appendToOutbox` MUST validate the envelope shape via
  `EventEnvelope.parse`.** The DB check constraint on `type` is partial;
  parse before insert so malformed envelopes never hit the wire.

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

### NATS subscriber

- **Every consumer MUST configure `max_deliver` AND a DLQ subject.**
  Default `max_deliver: unlimited` + `max_ack_pending: 1` + a malformed
  message = consumer stalls indefinitely behind the poison message.
  Recommended starting values: `max_deliver: 5`, route exhausted
  messages to `dlq.<subject>`.
- **`ack_wait` MUST be configured.** Default 30s; if the handler takes
  longer the message redelivers while the original is still processing
  → duplicate invocation. Set deliberately based on the slowest
  expected handler.
- **`max_ack_pending` MUST be raised above 1.** A NAK on one message
  blocks all subsequent messages on the subject until the NAK timeout
  elapses. Pick a per-consumer cap that matches its concurrency.
- **`#run()` MUST wrap the entire `for await` in try/catch.** If the
  iterator itself throws (broker disconnect, stream deletion), the
  rejection escapes the fire-and-forget `void this.#run()` and becomes
  an unhandled rejection — process crash under
  `--unhandled-rejections=strict`.

### Tenant context

- **`runInTenantContext` is HTTP-middleware-only** (ADR-0020 I-6). Code
  in `infrastructure/nats-subscriber.ts`, in BA hooks consuming events,
  in outbox dispatcher tick, in NATS message handlers — all use
  `db.withTenant(tenantId, async (tx) => …)` (when the tenant is known)
  or `db.withoutTenant('reason', async (tx) => …)` (when it isn't or
  the operation is genuinely system-scope).

## Tests

- **Integration tests MUST cover the poison-message / max_deliver / DLQ
  path.** This is the bug class most likely to take down production; the
  test is the regression net.
- **The `run-deduped` integration test MUST cover rollback semantics**
  — handler throws → inbox row absent → next delivery re-executes —
  proving the transactional dedup actually prevents duplicate side
  effects. (The old "crash between handler commit and markProcessed"
  failure mode is structurally impossible once both share a tx.)
- **`outbox-roundtrip.spec.ts`** exercises the full append → claim →
  publish → ack → mark delivered → re-publish-after-crash loop against
  a real NATS testcontainer.
