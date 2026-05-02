# Resto — Project map

A flat sitemap of what exists in the repo today and how the pieces
connect. Read this first before going wide; nothing here is a new
decision — that's what `docs/adr/` is for.

## Top level

```
apps/         deployable applications (one binary / bundle each)
packages/     shared TypeScript libraries consumed by apps
infra/        Docker (dev), Kubernetes (later), Terraform (later)
docs/         ADRs, diagrams, runbooks, generated API docs
tools/        workspace tooling — currently the seed CLI
```

Everything is a pnpm workspace; Nx 20 manages builds/cache/affected.

## What's wired in MVP-1

Two paths are alive end-to-end:

1. **Public read** — qr-menu hits `GET /v1/menu` and `GET /v1/menu/items/:id`
   on `apps/api`. Tenant resolved from request host.
2. **Internal write** — seed CLI hits `POST /internal/v1/*` with the
   shared `INTERNAL_API_TOKEN` to provision a tenant and seed its menu.

Everything else (admin, website, mobile, landing, ordering, payments,
identity) is a placeholder folder or deferred to MVP-2 / later.

## apps/

```
apps/
├── api/         NestJS modular monolith (Fastify). The only deployed
│                backend in MVP-1. Bounded contexts under src/contexts/.
├── qr-menu/     Vite + React. Customer-facing menu at the table; the
│                only frontend with code in MVP-1.
├── admin/       (empty — MVP-2 admin UI lands here)
├── website/     (empty — tenant marketing sites)
├── mobile/      (empty — Expo customer app)
└── landing/     (empty — marketing site for the SaaS itself)
```

### apps/api — current bounded contexts

```
apps/api/src/
├── main.ts                       composition root, Fastify bootstrap
├── app.module.ts                 wires modules: Config, Database, Nats,
│                                 Health, Tenancy, Catalog
├── bootstrap-telemetry.ts        OTel SDK init (must run before main)
├── config/                       env schema + ConfigModule
├── health/                       /healthz, /readyz, /livez
├── infrastructure/
│   └── nats.module.ts            JetStream publisher (soft-fail at boot)
├── shared/                       cross-context HTTP filters / pipes
└── contexts/
    ├── tenancy/                  provision tenants, resolve tenant by
    │                             host, the InternalTokenGuard,
    │                             TenantContextMiddleware
    └── catalog/                  upsert categories/items/modifiers,
                                  publish menu, public read endpoints,
                                  Redis-backed published-menu cache,
                                  signed S3 URLs for item images
```

Each context follows DDD layout: `domain/`, `application/`, `infrastructure/`,
`interfaces/http/`. The domain layer never imports infrastructure
directly — everything goes through ports.

**Identity is intentionally absent** — see ADR-0012. The
`InternalTokenGuard` (in tenancy) is the only auth surface in MVP-1.

### apps/qr-menu

```
apps/qr-menu/src/
├── main.tsx, App.tsx, styles.css
├── api/                fetch helpers against /v1/menu*
├── components/         menu rendering
└── i18n/               minimal localized-text helpers
```

Calls the api at `/v1/*`. No auth, no tenant id sent — the api derives
the tenant from the request host.

## packages/

```
packages/
├── db/             Drizzle schema, migrations, two-role client, RLS
│                   helpers, AsyncLocalStorage tenant context, outbox
│                   tables/queries, preflight checks at boot
├── domain/         framework-agnostic Zod schemas + value objects
│                   (Money, Slug, LocalizedText, ids). Single source
│                   of truth for business types
├── events/         EventEnvelope, correlation context, NATS publisher,
│                   outbox dispatcher, inbox tracker, per-context
│                   contract files (tenancy.ts, ...)
├── api-client/     (empty — generated from OpenAPI later)
├── ui/             (empty — design system later)
├── feature-flags/  (empty — OpenFeature wiring later)
├── config-eslint/  shared ESLint configs (base/node/react/nextjs)
├── config-typescript/  shared tsconfig presets
└── config-tailwind/    (empty — when admin/website land)
```

## infra/

```
infra/
├── docker/
│   ├── docker-compose.dev.yml    Postgres, Redis, NATS, MinIO,
│   │                             MailHog, Jaeger (no Keycloak — see
│   │                             ADR-0012)
│   └── postgres/init/            extensions + create resto_app role
├── k8s/            (empty — Helm charts after MVP-1)
└── terraform/      (empty — AWS IaC; ADR-0011 picked the target)
```

## docs/

```
docs/
├── adr/           accepted decisions, immutable; supersede with new ADR
├── diagrams/      C4 / sequences / ERDs (Mermaid)
├── runbooks/      operational procedures
└── api/           generated OpenAPI (from apps/api/src/openapi.ts)
```

ADRs 0001–0012 cover the load-bearing choices. 0005 (Keycloak) is
superseded by 0012 (defer identity).

## tools/

```
tools/scripts/
├── seed/                   operator CLI (tsx) — `pnpm resto:seed`
│   ├── cli.ts              entry, dispatches to commands
│   ├── commands/
│   │   ├── provision-tenant.ts
│   │   └── seed-menu.ts
│   └── lib/                api client, options resolver, logger,
│                           menu-yaml loader
└── test/                   vitest specs for the CLI lib
```

Authenticates with `INTERNAL_API_TOKEN`. The earlier rotate-tenant-
credentials command was removed when Keycloak was cut.

## Data flow

```
qr-menu  ──GET /v1/menu──▶  apps/api ──Drizzle──▶  Postgres (RLS-on,
                              │                      tenant_id-scoped)
                              ├─ Redis (PublishedMenu cache, version-keyed)
                              └─ S3 presigned URLs for item images

seed-CLI ──POST /internal/v1/*──▶ apps/api ──tx──┬─ tenant/catalog tables
            (X-Internal-Token)                    └─ outbox row
                                                     │
                                              dispatcher ──▶ NATS JetStream
                                                             (RESTO_EVENTS)
```

Outbox is the only path between Postgres state and the event bus — no
dual writes.

## What's not here yet

- Identity / per-user IAM (ADR-0012 — returns with admin UI in MVP-2).
- Ordering, payments (Stripe Connect), reservations, loyalty,
  inventory, analytics, notifications, audit — all are reserved
  context names but not scaffolded.
- Generated API client in `packages/api-client`.
- Helm charts and Terraform — only the target (AWS, eu-central-1,
  ADR-0011) is decided.
- CI smoke test that exercises the seed CLI against an ephemeral
  Postgres (deferred from RES-81).
