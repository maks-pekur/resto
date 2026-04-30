# ADR 0004: NATS JetStream as the event bus

- **Status:** accepted
- **Date:** 2026-04-30
- **Deciders:** Resto core team

## Context

Bounded contexts need to communicate asynchronously (e.g. `ordering`
publishes `OrderConfirmed`; `notifications` and `inventory` consume it).
Even within the modular monolith we want a real broker so that:

- Cross-context coupling stays at the contract level (event schemas).
- Extracting a context into its own service later becomes a config
  change, not a refactor.
- We can replay, retry, and observe events.

We do not yet need event sourcing or full audit replay across years of
data — that is a separate decision if/when it arises.

## Decision

Use **NATS JetStream** as the event bus, with **transactional outbox**
in the application database. Application code writes to the outbox in
the same DB transaction as the state change; a dispatcher publishes
outbox rows to JetStream and marks them delivered.

## Alternatives considered

- **Apache Kafka.** Strongest argument: industry standard for streaming,
  best replay/event-sourcing story, mature ecosystem. Rejected for
  _now_: operationally heavy (Zookeeper-free KRaft mode helps but it is
  still Kafka), overkill for our throughput, and the upgrade path from
  NATS to Kafka later is bounded since our event contracts are broker-
  agnostic. Reconsider if/when we adopt event sourcing or hit JetStream
  limits.
- **RabbitMQ.** Strongest argument: classic message broker with rich
  routing semantics. Rejected: weaker streaming/replay story, less
  aligned with our future direction.
- **Postgres LISTEN/NOTIFY (no broker).** Strongest argument: zero
  infra. Rejected: no durability, no replay, doesn't scale across
  partitions, locks us deeper into the monolith.
- **Redis Streams.** Strongest argument: we already have Redis.
  Rejected: weaker durability and replay than JetStream, awkward
  consumer-group ergonomics for our use cases.

## Consequences

### Positive

- Lightweight broker (single binary, simple ops) gives us durability,
  replay-from-offset, consumer groups, and at-least-once delivery.
- Outbox pattern eliminates dual-write inconsistency.
- Event contracts in `packages/events` are broker-agnostic; switching
  to Kafka later is a transport-layer change.

### Negative

- At-least-once delivery means consumers must be idempotent (we will
  enforce idempotency-key headers on every event).
- Operating any broker is non-zero overhead; we accept that.

### Neutral

- We do not use JetStream as the system of record. State of record is
  Postgres; JetStream is a propagation mechanism.

## Implementation notes

- Outbox table in `packages/db` with a poll-based dispatcher. Polling
  interval and batch size are configurable; defaults tuned for sub-
  second propagation.
- Event envelope schema in `packages/events`: `id`, `type`, `version`,
  `tenantId`, `correlationId`, `causationId`, `occurredAt`, `payload`.
- Consumers must record `lastProcessedEventId` per stream + consumer
  to avoid double-processing on redelivery.
