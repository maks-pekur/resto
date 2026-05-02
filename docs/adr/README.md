# Architecture Decision Records

Authoritative log of architectural choices for Resto. ADRs follow the
[MADR](https://adr.github.io/madr/) format. Use `0000-template.md` as
the starting point for a new ADR.

## Index

| #    | Title                                                                         | Status             |
| ---- | ----------------------------------------------------------------------------- | ------------------ |
| 0001 | Modular monolith with Domain-Driven Design                                    | accepted           |
| 0002 | NestJS as the backend framework                                               | accepted           |
| 0003 | Drizzle ORM on PostgreSQL                                                     | accepted           |
| 0004 | NATS JetStream as the event bus                                               | accepted           |
| 0005 | Self-hosted Keycloak as the identity provider                                 | superseded by 0012 |
| 0006 | Multi-tenancy via row-level + Postgres RLS, with dedicated-DB graduation path | accepted           |
| 0007 | Nx + pnpm monorepo                                                            | accepted           |
| 0008 | OpenTelemetry + Grafana stack + Sentry for observability                      | accepted           |
| 0009 | Stripe Connect (Express) as the payments provider                             | accepted           |
| 0010 | MVP-1 scope — tenancy, identity, catalog, qr-menu (read-only)                 | accepted           |
| 0011 | Hosting on AWS (EKS + RDS + S3 + ElastiCache, eu-central-1)                   | accepted           |
| 0012 | Defer the identity provider to MVP-2                                          | accepted           |

## Pending

_None right now — log new pending decisions here as they arise._

## Conventions

- ADRs are immutable once accepted. To change a decision, write a new
  ADR with `Supersedes:` pointing at the old one, and set the old one
  to `superseded` with a forward link.
- One decision per ADR. If you find yourself writing multiple
  decisions, split them.
- Always include real alternatives — "we considered nothing else" is a
  red flag.
