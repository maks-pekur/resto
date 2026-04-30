# ADR 0002: NestJS as the backend framework

- **Status:** accepted
- **Date:** 2026-04-30
- **Deciders:** Resto core team

## Context

We need a TypeScript-first backend framework that supports modular
monolith with strong DI, has a mature ecosystem (Swagger/OpenAPI, queues,
GraphQL, gRPC, microservices), and works well with DDD layering.

## Decision

Use **NestJS** as the framework for `apps/api`. Each DDD bounded context
becomes a NestJS module composed of inner sub-modules per layer.

## Alternatives considered

- **Fastify + custom DDD scaffolding.** Strongest argument: lighter,
  fewer abstractions, full control over composition. Rejected: building
  our own DI/module system, request lifecycle, and cross-cutting
  concerns is months of yak-shaving and re-inventing what NestJS already
  ships, with no payoff at our scale.
- **Hono / Elysia / tRPC-only backend.** Strongest argument: extremely
  fast, modern. Rejected: too thin for a domain this large; we would end
  up wrapping them in our own structure that resembles NestJS.
- **AdonisJS.** Strongest argument: full-stack opinionated. Rejected:
  smaller ecosystem, less alignment with DDD/hexagonal, weaker
  decorator-based DI.

## Consequences

### Positive

- Mature DI fits hexagonal architecture cleanly (ports as interfaces,
  adapters as injectable providers).
- First-class support for Swagger/OpenAPI generation, microservices
  transport (we will use the in-process variant first), guards,
  interceptors, pipes — all the cross-cutting concerns we need.
- Large hiring pool of engineers familiar with the framework.

### Negative

- Decorator-heavy style and strong conventions; engineers not used to it
  need a ramp-up.
- Fastify-under-Express adapter switch is a known wart; we will use the
  Fastify adapter from day 1 to avoid the migration later.

### Neutral

- NestJS does not prescribe DDD; we layer it on top deliberately.

## Implementation notes

- Use `@nestjs/platform-fastify` adapter, not Express.
- Use `@nestjs/swagger` for OpenAPI generation; spec is committed under
  `docs/api/openapi.yaml` and clients are generated from it (see
  ADR 0007).
- One module per bounded context; module boundaries enforced by Nx
  module-boundary rules.
