# Architecture Decision Records

Authoritative log of architectural choices for Resto. ADRs follow the
[MADR](https://adr.github.io/madr/) format. Use `0000-template.md` as
the starting point for a new ADR.

## Index

| #    | Title                                                                         | Status   |
| ---- | ----------------------------------------------------------------------------- | -------- |
| 0001 | Modular monolith with Domain-Driven Design                                    | accepted |
| 0002 | NestJS as the backend framework                                               | accepted |
| 0003 | Drizzle ORM on PostgreSQL                                                     | accepted |
| 0004 | NATS JetStream as the event bus                                               | accepted |
| 0005 | Self-hosted Keycloak as the identity provider                                 | accepted |
| 0006 | Multi-tenancy via row-level + Postgres RLS, with dedicated-DB graduation path | accepted |
| 0007 | Nx + pnpm monorepo                                                            | accepted |
| 0008 | OpenTelemetry + Grafana stack + Sentry for observability                      | accepted |

## Pending

- **Hosting target** (Hetzner managed K8s / DigitalOcean / AWS / GCP).
  Drives Terraform/Pulumi provider choice, Helm values, networking
  primitives.
- **Payments provider** (Stripe Connect for marketplace model vs.
  alternatives). Drives the `payments` bounded-context contract and
  marketplace fee model.
- **MVP-1 scope** (which bounded contexts ship in the first release).

## Conventions

- ADRs are immutable once accepted. To change a decision, write a new
  ADR with `Supersedes:` pointing at the old one, and set the old one
  to `superseded` with a forward link.
- One decision per ADR. If you find yourself writing multiple
  decisions, split them.
- Always include real alternatives — "we considered nothing else" is a
  red flag.
