# @resto/events

Cross-context event contracts and the broker-agnostic plumbing that
delivers them. Single source of truth for what events Resto publishes,
what they look like on the wire, and how producers and consumers stay
correct under at-least-once delivery.

## Layout

```
src/
  envelope.ts            EventEnvelope schema, defineEventContract
  correlation.ts         AsyncLocalStorage propagation of correlationId
  ports.ts               EventPublisher / EventSubscriber interfaces
  outbox/
    headers.ts           project envelope metadata onto headers map
    repository.ts        appendToOutbox / claimOutboxBatch / mark delivered
    dispatcher.ts        OutboxDispatcher polling loop
  inbox/
    tracker.ts           per-consumer dedup ledger (in-memory for now)
  infrastructure/
    nats-publisher.ts    JetStream publisher (ONLY place that imports `nats`)
    nats-subscriber.ts   JetStream subscriber (ONLY place that imports `nats`)
  contracts/
    tenancy.ts           TenantProvisionedV1 — first canonical contract
  index.ts               public surface

test/
  unit/                  fast tests, no Docker
  integration/           testcontainers (Postgres + NATS) — full roundtrip
```

## Versioning rule

Event types follow `<context>.<event>.v<n>`:

- `tenancy.tenant_provisioned.v1`
- `catalog.menu_published.v1`
- `ordering.order_placed.v2` (a v1 already exists, payload changed)

Rules:

- **Every breaking payload change ships as a new type with the next `v`.**
  Old consumers continue subscribing to the old version until they are
  migrated. Producers may emit both versions during the transition.
- **`version` in the envelope must equal the trailing `<n>` in `type`.**
  `EventEnvelope.parse` enforces this at runtime.
- **Backwards-compatible additions** (a new optional payload field, a
  new header) do NOT bump the version. The schema is open enough that
  consumers see new fields they do not understand and ignore them.

## Idempotency

Delivery is **at-least-once.** Consumers MUST be idempotent. The package
provides two layers of defence:

1. **Producer side:** every JetStream publish carries `msgID =
envelope.id`. Within JetStream's dedup window, repeated publishes of
   the same id are dropped at the broker.
2. **Consumer side:** wrap your handler with `withInboxDedup(tracker,
consumer, handler)`. The tracker records every successfully processed
   `(consumer, eventId)`; redeliveries skip the handler entirely.

Both layers are necessary: the broker dedup is bounded in time; consumer
dedup persists across that window. The `InMemoryInboxTracker` is fine
for tests and single-process apps; the first real production deployment
will swap in a Postgres- or Redis-backed tracker.

## Outbox flow

1. Bounded context, inside a `withTenant` (or `withoutTenant` for
   platform events) transaction:
   ```ts
   await db.withTenant(async (tx) => {
     await tx.insert(schema.tenants).values({ ... });
     await appendToOutbox(tx, { envelope });
   });
   ```
2. `OutboxDispatcher` polls undelivered rows, claims a batch with
   `FOR UPDATE SKIP LOCKED`, publishes each via the configured
   `EventPublisher`, and marks delivered.
3. Failed publishes leave the row claimed; the visibility timeout
   (default 30s) makes it reclaimable on the next tick.

The dispatcher does not retry on its own. End-to-end retry is the
combination of broker dedup + consumer inbox tracker.

## Adding a new event

1. Add a contract under `src/contracts/<context>.ts`:
   ```ts
   export const SomethingHappenedV1Payload = z.object({ ... });
   export const SomethingHappenedV1 = defineEventContract({
     type: 'mycontext.something_happened.v1',
     payload: SomethingHappenedV1Payload,
   });
   ```
2. Re-export from `src/index.ts`.
3. Producer code:
   ```ts
   const envelope = SomethingHappenedV1.parse({
     id: randomUUID(), type: SomethingHappenedV1.type,
     version: SomethingHappenedV1.version,
     tenantId, correlationId, causationId: null,
     occurredAt: new Date(), payload: { ... },
   });
   await appendToOutbox(tx, { envelope });
   ```
4. Consumer code:
   ```ts
   await subscriber.subscribe({
     subject: SomethingHappenedV1.type,
     durableName: 'my-consumer',
     handler: withInboxDedup(tracker, 'my-consumer', async (env) => {
       const typed = SomethingHappenedV1.parse(env);
       // typed.payload is narrowed to SomethingHappenedV1Payload
     }),
   });
   ```

## Testing

```bash
pnpm exec nx run events:typecheck
pnpm exec nx run events:lint
pnpm exec nx run events:test
```

Integration tests start Postgres + NATS containers and run the full
publish-consume-dedup roundtrip. They skip with a clear warning if
Docker is not available.

## References

- ADR-0004 — NATS JetStream as the event bus
- ADR-0010 — MVP-1 scope, sequencing step 3
- `@resto/db` outbox table — `packages/db/src/schema/outbox.ts`
