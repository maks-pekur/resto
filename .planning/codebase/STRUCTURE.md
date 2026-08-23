# Codebase Structure

**Analysis Date:** 2026-08-18

## Directory Layout

```
RestOS/                              # Monorepo root (pnpm workspace + Nx)
├── apps/                            # Deployable applications (never import each other)
│   ├── api/                         # NestJS modular monolith (main backend), tag scope:api
│   │   └── src/
│   │       ├── main.ts              # Bootstrap: OTel first, preflight assertions, Fastify, listen
│   │       ├── app.module.ts        # Root NestJS module — context import order + middleware wiring
│   │       ├── bootstrap-telemetry.ts  # Must be the first import in main.ts
│   │       ├── openapi.ts           # Swagger/OpenAPI generation → docs/api/openapi.yaml
│   │       ├── config/              # Env schema (Zod), prod guardrails, trust-proxy parsing
│   │       ├── infrastructure/      # Cross-context: DatabaseModule, NatsModule, OutboxDispatcherService,
│   │       │   └── jobs/            #   BackgroundJobsModule, retention schedulers (invitation/verification/tenant-erasure)
│   │       ├── middleware/          # Non-NestJS Fastify middleware (per-tenant signin rate limit)
│   │       ├── shared/              # Cross-cutting: CorrelationMiddleware, TenantContextMiddleware,
│   │       │   ├── auth/            #   decorator vocabulary (@Public, @Permissions, @BrandNeutral, ...)
│   │       │   ├── api/             #   wrap.ts, zod-validation.pipe.ts, internal-token.guard.ts
│   │       │   └── preflight/       #   assert-brand-rls.ts
│   │       ├── health/              # /healthz and /readyz
│   │       └── contexts/            # Bounded contexts (DDD) — see "Bounded Context Layout" below
│   │           ├── identity/        # Auth, sessions, RBAC, roles, brand/location session pin
│   │           ├── tenancy/         # Tenant + Brand + Location provisioning, domain resolution
│   │           ├── catalog/         # Menu items/categories/modifiers, publish, stop-list
│   │           ├── ordering/        # Guest order creation, operator order feed/accept/advance
│   │           ├── payments/        # Stripe Connect checkout, webhooks, cancel/refund
│   │           ├── notifications/   # Guest order-status emails (NATS-subscriber-driven)
│   │           └── audit/           # Cross-cutting event audit trail (NATS subscriber only)
│   ├── admin/                       # Vite SPA operator dashboard, tag scope:admin
│   │   └── src/
│   │       ├── main.tsx             # createRouter (TanStack Router) + RouterProvider mount
│   │       ├── env.ts                # VITE_* env access, no production fallbacks
│   │       ├── routes/               # File-based-in-spirit route tree (manually wired in main.tsx)
│   │       │   ├── (auth)/           #   /login, /signup, /pick-location, /accept-invitation/:id
│   │       │   └── (protected)/      #   authenticated shell
│   │       │       └── $brandSlug/   #     brand comes from THIS URL param — never a cookie
│   │       │           └── menu/     #     categories, items, stop-list, modifier-groups
│   │       ├── components/          # Feature components (menu/, orders/, roles/, settings/, team/) + components/ui (shadcn)
│   │       ├── lib/                 # api-client.ts, auth-client.ts, queries/, auth/, i18n/, menu/
│   │       └── hooks/
│   ├── qr-menu/                     # Vite+React customer-facing QR menu SPA, tag scope:qr-menu
│   │   └── src/{api,components,i18n}/
│   └── website/                     # Next.js multi-tenant marketing/ordering site, tag scope:website
│       └── app/                     # App Router segments (about/, faq/, contact/, checkout/, delivery/, ...)
│
├── packages/                        # Shared libraries, tag scope:shared unless noted (never import apps)
│   ├── domain/                      # Pure TS domain types + Zod schemas — zero infra imports
│   │   └── src/{ids,money,slug,brand-slug,tenant-slug,brand-theme,localized-text}.ts, rbac/, schema/
│   ├── db/                          # Drizzle schema, migrations, RLS SQL, TenantAwareDb — see below
│   ├── events/                      # Event contracts, outbox, inbox, NATS adapters — see below
│   ├── api-client/                  # TS types generated from docs/api/openapi.yaml (do not hand-edit)
│   ├── cart/                        # Shared client-side cart store — consumed by website + qr-menu
│   ├── ui/                          # Scaffolded design-system stub (`export {}` only) — NOT yet consumed by any app
│   ├── feature-flags/               # Scaffolded (`.gitkeep` only) — no OpenFeature wiring exists yet
│   ├── config-typescript/           # tsconfig presets: base, node, nest, react, nextjs, vite
│   ├── config-eslint/               # ESLint flat-config presets: base (+ module-boundary rule), node, react
│   └── config-tailwind/             # Shared Tailwind preset (tokens, plugins)
│
├── tools/
│   └── scripts/                     # Nx project "seed-cli", tag scope:tools, type:cli
│       └── seed/                    # Seed CLI commands/ + lib/
│
├── scripts/                         # Ad-hoc dev scripts NOT wired into Nx (check-brand-slug-collisions.ts, reset-2fa.ts, ...)
│
├── infra/
│   ├── docker/                      # Dockerfiles per app + docker-compose.dev.yml (Postgres, NATS, MinIO, MailHog, Jaeger — no Redis)
│   ├── k8s/                         # Helm charts / manifests (stub)
│   ├── terraform/                   # AWS IaC (stub)
│   └── runbooks/                    # Operational runbooks
│
├── docs/
│   ├── api/openapi.yaml             # Committed OpenAPI spec — source for @resto/api-client codegen
│   ├── security/                    # Point-in-time audit docs (e.g. brand-neutral controller audit)
│   ├── runbooks/                    # e.g. menu-edge-caching.md
│   └── superpowers/                 # Design-doc workflow artifacts (plans/, specs/, sketches/) — a separate,
│                                     #   pre-GSD planning workflow; NOT the same as .planning/
│
├── .planning/                       # GSD planning artifacts — committed, durable, the actual decision log
│   ├── codebase/                    # This directory — codebase maps consumed by /gsd:plan-phase, /gsd:execute-phase
│   ├── phases/<NN-slug>/            # Per-phase CONTEXT, PLAN, SUMMARY, RESEARCH, PATTERNS, DISCUSSION-LOG
│   └── ROADMAP.md                   # Canonical phase sequencing + status
│
├── .github/workflows/ci.yml         # CI pipeline
├── SPEC.md                          # Product specification (Russian, source of truth for product surface)
├── CLAUDE.md                        # Root project instructions (this hierarchy has child CLAUDE.md per apps/*, packages/*, packages/db, infra/)
├── pnpm-workspace.yaml              # Workspace definition (apps/*, packages/*, tools/*)
├── nx.json                          # Nx task runner config (parallel: 3)
├── tsconfig.base.json               # Root TS config
└── eslint.config.mjs                # Root ESLint flat config (minimal — real rules live in packages/config-eslint)
```

**Note on `docs/adr/`:** code comments and package `CLAUDE.md` files across the repo cite ADR numbers (`ADR-0011`, `ADR-0013`, `ADR-0016`, `ADR-0020`, ...) as the origin of a decision. **No `docs/adr/` directory exists in this repo** — those ADRs were written and then wiped as part of the 2026-05-24 GSD reset (see project memory `project_restos_init_2026_05_24`). Treat `ADR-NNNN` references in code as historical citations only, not resolvable links. The current decision log lives in `.planning/ROADMAP.md` (`## Key Decisions`) and per-phase `.planning/phases/<phase>/` artifacts.

## `packages/db` internal layout

- `src/schema/` — Drizzle table definitions grouped by **historical/domain grouping, not 1:1 with bounded-context folders**. Notably: `locations` and `memberLocationScope` tables live in `schema/brands.ts` (not a separate `locations.ts`); `payments` and `paymentRefunds` tables live in `schema/ordering.ts` (not a `payments.ts`). Check `schema/index.ts` re-exports before assuming a table's file location from its name.
- `src/schema/_columns.ts` — the only place that constructs `tenantId` columns (`tenantIdColumn()`, `compositeTenantFk()`, `tenantParentUniqueIndex()`)
- `src/client.ts` — `TenantAwareDb`, `ScopedTx`
- `src/context.ts` — `AsyncLocalStorage<TenantContext>` (tenant + brand + location + correlationId)
- `src/preflight.ts` — boot-time assertions (`assertNoRlsBypass`, `assertTenantLockInstalled`, etc.)
- `src/roles.ts` / `src/auth-role.ts` — Postgres role provisioning (`resto_app`, `resto_admin`, `resto_auth`)
- `migrations/*.sql` — Drizzle-generated + hand-written RLS/policy migrations, sequential (currently 78 files, `0000`–`0077`). RLS policy migrations are hand-written, not Drizzle-generated — recognizable by names like `0058_brand_rls.sql`, `0060_brand_rls_restrictive.sql`, `0065_location_guc.sql`, `0069_stop_list_location_rls.sql`, `0071_orders_location_rls.sql`.
- `sql/` — static SQL templates (`roles.sql`, `auth-role.sql`) applied by role provisioning, not by `db:migrate`
- `test/integration/tenant-isolation.spec.ts` — canonical RLS regression net; every new tenant-scoped table needs an entry here

## `packages/events` internal layout

- `src/envelope.ts` — `EventEnvelope` + `defineEventContract`; `src/correlation.ts` — ALS for correlation id
- `src/contracts/{tenancy,identity,catalog,ordering,payments}.ts` — one file per bounded context that emits events (`notifications` and `audit` are consumers only, no contracts file)
- `src/outbox/` — dispatcher + repository helpers (`appendToOutbox`)
- `src/inbox/run-deduped.ts` — at-most-once consumer wrapper
- `src/infrastructure/` — `NatsJetStreamPublisher` / `NatsJetStreamSubscriber`

## Bounded Context Internal Layout

Every context under `apps/api/src/contexts/<ctx>/` follows this structure (identity is the only context with its own `guards/` subdirectory — the five global guards live there because they're identity's responsibility even though they gate every context):

```
<ctx>/
├── <ctx>.module.ts              # NestJS module — wires providers, imports other context modules if coupled
├── domain/
│   ├── <entity>.aggregate.ts    # Aggregate root (pure TS, no framework)
│   ├── ports.ts                 # Repository + port interfaces + Symbol tokens
│   ├── errors.ts                # Domain error classes
│   └── events.ts                # Domain event types (where the context emits any)
├── application/
│   ├── <use-case>.service.ts    # One service per use-case, single public .execute(input)
│   ├── dto.ts                   # Zod-validated DTOs
│   └── ports/                   # Sub-ports needed only by the application layer
├── infrastructure/
│   ├── <name>-drizzle.repository.ts
│   └── <name>.adapter.ts        # External service adapter (Stripe, S3, Resend, Better Auth)
└── interfaces/
    └── http/
        ├── <name>.controller.ts
        └── error-mapping.ts     # mapDomainError / mapXError
```

Two contexts deviate from clean isolation and cross-import each other's modules directly: `ordering.module.ts` imports `PaymentDrizzleRepository` from `../payments/infrastructure/...`, and `payments.module.ts` imports `OrderingModule` for `ORDER_REPOSITORY`. This is documented, intentional coupling (refund/cancel need to mutate the `Order` aggregate) — see `ARCHITECTURE.md` Pattern Overview.

## Key File Locations

**Entry Points:**

- `apps/api/src/main.ts` — API server bootstrap
- `apps/admin/src/main.tsx` — Admin SPA mount (TanStack Router)
- `apps/qr-menu/src/main.tsx` — QR menu SPA entry
- `apps/website/app/layout.tsx` — Website App Router root

**Tenant/Brand/Location Context Wiring:**

- `packages/db/src/context.ts` — ALS, `runInTenantContext`, `withBrand`, `withLocation`, `requireTenantContext`
- `apps/api/src/shared/tenant-context.middleware.ts` — resolves tenant/brand from request, binds ALS
- `packages/db/src/client.ts` — `TenantAwareDb.withTenant()` — binds `app_bind_tenant`/`app_bind_brand`/`app_bind_location` GUCs

**Auth + Access Control:**

- `apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts` — Better Auth config
- `apps/api/src/contexts/identity/interfaces/http/guards/` — `auth.guard.ts`, `permissions.guard.ts`, `brand-scope.guard.ts`, `location-scope.guard.ts`, `owner-only.guard.ts`
- `apps/api/src/contexts/identity/identity-http.module.ts` — the `APP_GUARD` registration order (source of truth for guard chain order)
- `apps/api/src/shared/auth/` — decorator vocabulary
- `apps/api/src/shared/security.ts` — Fastify-layer security plugins + `RateLimitGuard` global registration

**Event Bus:**

- `packages/events/src/envelope.ts`, `packages/events/src/inbox/run-deduped.ts`
- `apps/api/src/infrastructure/outbox-dispatcher.service.ts` — NestJS wrapper (advisory lock, metrics)
- `apps/api/src/infrastructure/nats.module.ts` — publisher/subscriber providers + `STREAM_SUBJECTS`

**Admin Client HTTP:**

- `apps/admin/src/lib/api-client.ts` — `apiFetch`, brand slug + location id passed explicitly by the caller (no implicit cookie/session read for these two)
- `apps/admin/src/lib/auth-client.ts` — Better Auth browser client, session cache

**Environment:**

- `apps/api/src/config/env.schema.ts` — Zod schema, source of truth for API env vars
- `apps/admin/src/env.ts` — `VITE_*` access with no production fallback

## Naming Conventions

**Files:**

- Services: `<use-case>.service.ts` (one per use-case, always `.execute(input)`)
- Repositories: `<name>-drizzle.repository.ts`
- Adapters: `<name>.adapter.ts`
- Controllers: `<name>.controller.ts`
- Modules: `<name>.module.ts`
- Domain errors: `errors.ts`; domain ports: `ports.ts` (both within the context's `domain/`)
- App-layer-only ports: `<name>.port.ts` inside `application/ports/`

**Directories:**

- Bounded contexts: kebab-case, single word (`tenancy`, `catalog`, `identity`, `ordering`, `payments`, `notifications`, `audit`)
- Packages: `@resto/<name>` (kebab-case)

**Symbols (DI tokens):** `SCREAMING_SNAKE_CASE` (e.g. `TENANT_REPOSITORY`, `LOCATION_REPOSITORY`, `PAYMENT_PROVIDER_PORT`), declared alongside the interface, exported from the same file.

**Event types:** `<context>.<noun>_<verb>.v<n>` (e.g. `tenancy.tenant_provisioned.v1`, `payments.order_refunded.v1`).

**Database tables:** snake*case plural noun (`menu_categories`, `member_location_scope`, `payment_refunds`). Constraint names: `<table>*<purpose>\_<kind>`(e.g.`payments_status_chk`, `payment_refunds_request_id_uq`).

## Nx / ESLint Module Boundary Rules

Enforced by `@nx/enforce-module-boundaries` in `packages/config-eslint/base.mjs`, keyed off `tags` in each project's `project.json`:

| Tag axis | Values in use                                             |
| -------- | --------------------------------------------------------- |
| `type:`  | `app` (apps/_), `lib` (packages/_), `cli` (tools/scripts) |
| `scope:` | `api`, `admin`, `qr-menu`, `website`, `shared`, `tools`   |

Dependency constraints (from `moduleBoundariesRule`):

- `type:app` and `type:cli` may only depend on `type:lib` — apps/CLIs never import each other
- `type:lib` may only depend on other `type:lib` — a package can never import an app
- `scope:api` / `scope:qr-menu` / `scope:admin` may only depend on `scope:shared`
- `scope:tools` (the seed CLI) may only depend on `scope:shared`
- `scope:shared` may only depend on `scope:shared`

**Practical effect:** every `packages/*` project is `scope:shared`, so packages can freely depend on each other, but `apps/admin` can never import from `apps/api`'s source (only from `@resto/*` packages, e.g. `@resto/api-client` for generated types) — and `apps/website` currently carries `scope:website`, which has **no `depConstraints` entry at all** in `moduleBoundariesRule`. In practice this means `apps/website` is not yet fenced by the boundary rule (an unconstrained `sourceTag` is not checked) — worth tightening if `website` starts accumulating imports that should be forbidden.

**Package public API is exclusively `src/index.ts`** — never import from a package's sub-paths (e.g. `@resto/db` not `@resto/db/src/client`); `packages/db/src/schema/index.ts` is the one exception path Drizzle's own tooling (`drizzle.config.ts`) targets directly.

## Where to Add New Code

**New bounded context** (e.g. a hypothetical `reservations`):

- Create `apps/api/src/contexts/reservations/` with the 4-layer structure above
- Add the module to `apps/api/src/app.module.ts` imports (position matters only for middleware ordering, not for guard chain — guards are wired in `identity-http.module.ts`, not per-context)
- Add DB tables to a `packages/db/src/schema/<group>.ts` (pick the file whose existing tables this joins via FK, not necessarily a file named after the new context — see the `locations`-in-`brands.ts` / `payments`-in-`ordering.ts` precedent above), re-export from `schema/index.ts`
- Add event contracts to `packages/events/src/contracts/reservations.ts` if the context emits events; add the subject prefix to `STREAM_SUBJECTS` in `apps/api/src/infrastructure/nats.module.ts`

**New use-case within an existing context:**

- `apps/api/src/contexts/<ctx>/application/<use-case>.service.ts`
- New port: interface + `Symbol` in `domain/ports.ts`, adapter in `infrastructure/`, wire in `<ctx>.module.ts`
- Controller method in `interfaces/http/<name>.controller.ts` (or new controller file); remember the guard-chain decorator question — see `ARCHITECTURE.md` "Guard Chain" before deciding `@BrandNeutral()` / `@LocationNeutral()` / neither

**New DB table:**

- Add Drizzle table definition to the appropriate `packages/db/src/schema/<group>.ts`
- If tenant-scoped: `tenantIdColumn()` + `compositeTenantFk()` for child tables
- Re-export from `schema/index.ts`
- `pnpm db:generate` then `pnpm db:migrate`
- If the table needs brand- or location-grain isolation (not just tenant), hand-write the RLS policy migration — follow the pattern in `0058_brand_rls.sql` / `0065_location_guc.sql`, not the Drizzle-generated output
- Add a cross-tenant isolation case to `packages/db/test/integration/tenant-isolation.spec.ts`

**New admin page:**

- Add a route file under `apps/admin/src/routes/(protected)/$brandSlug/...` and wire it into the route tree in `apps/admin/src/main.tsx` (routes are not filesystem-auto-discovered — every route must be imported and registered explicitly)
- Data fetching via TanStack Query hooks in `apps/admin/src/lib/queries/`, calling `apiFetch` from `apps/admin/src/lib/api-client.ts`
- Do not add a Next.js-style `app/` directory or server actions — there is no server runtime in `apps/admin`; it is a static SPA

**New shared domain type:**

- Zod schema in `packages/domain/src/schema/<entity>.ts` (or a top-level file for simple value types), export from `packages/domain/src/index.ts`
- Derive the TS type via `z.infer<typeof Schema>` — never a hand-written parallel `type`

**New shared client-side UI:**

- `packages/ui/` exists but is an empty stub not yet consumed by any app — do not assume components placed there will be picked up; `apps/admin` has its own `components/ui` (shadcn-managed) and `website`/`qr-menu` currently keep their own local `components/ui` too. Confirm with the team before centralizing.

## Special Directories

**`.planning/codebase/`:** GSD codebase maps consumed by `/gsd:plan-phase` and `/gsd:execute-phase`. Generated by `gsd:map-codebase` subagents. Committed.

**`packages/api-client/src/generated/`:** TypeScript types auto-generated from `docs/api/openapi.yaml`. Do not hand-edit. Committed (consumers import without running codegen).

**`packages/db/migrations/`:** Drizzle-generated SQL plus hand-written RLS/policy migrations, sequential and never renumbered. Committed.

**`docs/superpowers/`:** artifacts from a separate design-doc workflow (plans/specs/sketches) that predates and runs alongside the GSD `.planning/` workflow. Not the canonical decision log — `.planning/` is.

**Build output** (`apps/*/dist/`, `apps/website/.next/`): generated, gitignored, not committed.
