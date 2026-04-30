# ADR 0001: Modular monolith with Domain-Driven Design

- **Status:** accepted
- **Date:** 2026-04-30
- **Deciders:** Resto core team
- **Supersedes:** —
- **Superseded by:** —

## Context

We are building a multi-tenant SaaS platform spanning admin, marketing
website, QR-menu, mobile app, plus the backend platform powering all of
them. The domain is broad (tenancy, identity, catalog, ordering, payments,
reservations, loyalty, inventory, analytics, notifications, audit) and the
team is small.

Two competing pulls:

1. We want clean bounded contexts so the code stays comprehensible at scale
   and so any context can later be extracted into its own service if its
   load profile or release cadence demands it.
2. Premature microservices are well-documented as one of the most expensive
   architectural mistakes for early-stage products: they multiply
   operational complexity, slow delivery, and force distributed-systems
   problems on a team that has not yet validated its domain model.

## Decision

Build the backend as a **modular monolith** organized by **DDD bounded
contexts**, deployed as a single artifact. Each bounded context lives in
its own NestJS module under `apps/api/src/contexts/<name>/` with a strict
internal layering (`domain/`, `application/`, `infrastructure/`,
`interfaces/`), and contexts communicate through application-layer
interfaces or via the in-process event bus — never by reaching into each
other's `domain/` or `infrastructure/`.

This positions us to extract any context into its own service when (not if)
real load or organizational pressure demands it, with the cost of that
extraction proportional to how cleanly the boundary was kept.

## Alternatives considered

- **Microservices from day 1.** Each bounded context as a separate
  deployable. Strongest argument: forces hard boundaries from the start.
  Rejected: distributed-system overhead (network, retries, eventual
  consistency, multi-service deploys, multi-service observability) is
  prohibitive at our stage and tends to harden the _wrong_ boundaries
  before the domain stabilizes.
- **Layered monolith without DDD.** Conventional `controllers / services /
repositories` flat layering. Strongest argument: lower entry barrier.
  Rejected: degenerates into a big ball of mud as the domain grows;
  produces no extraction-ready boundaries when load eventually demands
  them.
- **Serverless functions per use case.** Strongest argument: pay-per-use.
  Rejected: incompatible with our self-hosted stance, vendor lock-in, cold
  starts hurt admin and ordering UX, observability is harder.

## Consequences

### Positive

- Single deployable simplifies CI/CD, observability, schema migrations,
  local development.
- Strong context boundaries discipline our domain model from the start.
- Future extraction of a context into its own service is a known, scoped
  engineering task rather than an architectural overhaul.
- Cross-context refactoring stays atomic in a single PR.

### Negative

- We must maintain the discipline of not crossing context boundaries.
  Without enforcement (Nx module-boundary rules, code review, ADRs)
  shortcuts will accumulate.
- Single-process means the heaviest context (likely `ordering`) sets the
  scaling profile until extracted.
- Larger codebase to onboard onto compared to a single small service.

### Neutral

- The monolith still runs as multiple instances behind a load balancer;
  this is not a single-instance system, just a single-codebase one.

## Implementation notes

- Implementation lives in `apps/api/`.
- Bounded contexts: `identity`, `tenancy`, `catalog`, `ordering`,
  `payments`, `reservations`, `loyalty`, `inventory`, `analytics`,
  `notifications`, `audit`.
- Internal layering and module-boundary rules to be enforced via
  `@nx/eslint-plugin` once the api app is scaffolded.
- Outbox pattern + NATS JetStream for cross-context events; see
  ADR 0004.
