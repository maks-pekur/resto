# ADR 0010: MVP-1 scope — tenancy, identity, catalog, qr-menu (read-only)

- **Status:** accepted
- **Date:** 2026-04-30
- **Deciders:** Resto core team

## Context

We are building a multi-tenant SaaS for restaurants spanning 11+ bounded
contexts and 6+ frontends. Trying to ship all of it before any user
sees it is the most reliable way to never ship anything.

We need an MVP-1 narrow enough to build in a sane timeline, broad enough
to validate the data model and onboarding flow with real design-partner
restaurants.

## Decision

**MVP-1 scope:**

| Layer             | In scope                                            | Out of scope (MVP-2+)                                                                         |
| ----------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Bounded contexts  | tenancy, identity, catalog                          | ordering, payments runtime, reservations, loyalty, inventory, analytics, notifications, audit |
| Apps              | qr-menu (read-only), landing                        | admin, website, mobile                                                                        |
| Tenant onboarding | CLI / seed scripts in `tools/scripts/`              | Self-service signup                                                                           |
| Menu management   | Direct DB seeding by Resto team for design partners | Admin UI                                                                                      |

**Success criteria for MVP-1:**

- A real restaurant tenant can be provisioned end to end (tenant row,
  Keycloak organization, subdomain).
- A menu (categories, items, modifiers, variants, prices) can be seeded
  for a tenant via CLI script.
- A customer scanning a QR code at the table sees the menu rendered
  for that tenant in under 1 second on a 4G connection.
- Tenant isolation is verified: cross-tenant access is impossible at
  both the application layer and the Postgres RLS layer.
- Observability is live: traces in Jaeger (dev) / Tempo (prod) for
  every qr-menu request, errors in Sentry.

## Alternatives considered

- **Include admin UI in MVP-1.** Strongest argument: tenants manage
  their own menu, no manual ops. Rejected: doubles the scope (Next.js
  app + auth flows + per-context CRUD UIs). Design-partner phase can
  tolerate menu seeding by us; gives us time to learn the catalog model
  before designing UI.
- **Include ordering + payments in MVP-1.** Strongest argument: the
  product is most valuable end-to-end. Rejected: ordering is the
  highest-stakes context (real money, real kitchen workflows) and
  Stripe Connect platform approval can take weeks. Read-only menu first
  validates data and infra without that gate.
- **Skip qr-menu, ship admin first.** Strongest argument: tenants want
  to see their data. Rejected: nothing for tenants to put in admin
  until catalog is modeled, and the qr-menu forces us to think about
  the customer-facing read path from the start.
- **Ship a single bounded context (tenancy only) as MVP-1.** Rejected:
  too thin to validate anything beyond tenant provisioning.

## Consequences

### Positive

- Buildable by a small team in a finite window.
- Forces tenancy + identity + catalog to be well-modeled before
  ordering/payments compound the complexity.
- Read-only data path lets us pin down RLS, caching, observability,
  multi-tenant routing on a low-stakes surface before anything writes
  in production.
- Real restaurants on real menus is the data we need to harden the
  catalog schema; UI iteration in MVP-2 is faster with that grounding.

### Negative

- Resto operators (us) carry the menu-seeding burden during the design
  partner phase. We will write the CLI carefully so it is not painful.
- Tenants cannot self-serve onboarding yet; this is acceptable while
  we work with curated design partners.
- We delay revenue: until ordering+payments ship, there is no
  transaction stream to take a commission on. MVP-1 is investment
  spend.

### Neutral

- The qr-menu being read-only does not mean the API is read-only.
  Internal write endpoints exist for the seeding CLI; they are not
  exposed to the public API.

## Implementation notes

- Seeding CLI lives in `tools/scripts/` (Node.js + Drizzle). One
  command per logical operation: `provision-tenant`, `seed-menu`,
  `rotate-tenant-credentials`. All idempotent.
- qr-menu app: `apps/qr-menu/` (Vite + React, no SSR). Subdomain
  routing — `<tenant-slug>.menu.resto.app` resolves to a tenant via
  the API.
- Catalog read endpoints are aggressively cached (Redis, with cache
  busting on menu publish). Read tier is the only path the qr-menu
  hits in MVP-1.
- No payment, no ordering means no Stripe traffic in MVP-1, but the
  `payments` context skeleton (ports/adapters, Stripe Express account
  field on the tenant) lands during MVP-1 implementation so MVP-2 is
  not a refactor.

## Sequencing

The order in which the MVP-1 surface is built:

1. `packages/db` — Drizzle schema for tenant, user, menu (categories,
   items, modifiers, variants), audit; RLS policies; migrations runner.
2. `packages/domain` — Zod schemas mirroring the DB tables; type
   exports.
3. `packages/events` — event envelope, outbox helpers (skeleton).
4. `apps/api` — bare NestJS app: bootstrap-telemetry, env config,
   tenant context middleware, health endpoints. No business endpoints
   yet.
5. `apps/api` — `tenancy` module: tenant entity, tenant resolver from
   subdomain, tenant context propagation.
6. `apps/api` — `identity` module: Keycloak integration, JWT
   validation guards, RBAC.
7. `apps/api` — `catalog` module: read-only catalog endpoints, cache
   layer.
8. `tools/scripts/` — seed CLI for tenant + menu.
9. `apps/qr-menu` — Vite + React app consuming `/v1/menu`.

Each step is its own PR(s) with feature-flagged rollout.
