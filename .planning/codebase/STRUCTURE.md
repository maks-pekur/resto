# Codebase Structure

**Analysis Date:** 2026-05-24

## Directory Layout

```
RestOS/                            # Monorepo root
├── apps/                          # Deployable applications
│   ├── api/                       # NestJS modular monolith (main backend)
│   │   └── src/
│   │       ├── main.ts            # Bootstrap (preflight + Fastify)
│   │       ├── app.module.ts      # Root NestJS module
│   │       ├── bootstrap-telemetry.ts  # OTel init (must be first import)
│   │       ├── openapi.ts         # Swagger setup
│   │       ├── config/            # Env schema (Zod), prod guardrails, trust-proxy
│   │       ├── infrastructure/    # Global: DatabaseModule, NatsModule, OutboxDispatcherService
│   │       ├── shared/            # Cross-cutting: middleware, guards, filters, decorators
│   │       ├── health/            # /healthz and /readyz endpoints
│   │       └── contexts/          # Bounded contexts (DDD)
│   │           ├── identity/      # Auth, sessions, RBAC, user lifecycle
│   │           ├── tenancy/       # Tenant + brand provisioning, domain resolution
│   │           ├── catalog/       # Menu items, categories, modifiers, publish
│   │           └── audit/         # Event-driven audit trail (NATS subscriber)
│   ├── admin/                     # Next.js 15 App Router (operator dashboard)
│   │   ├── app/                   # Route segments (App Router)
│   │   ├── components/            # Shared React components (shadcn/ui in ui/)
│   │   ├── hooks/                 # React hooks
│   │   └── lib/                   # Server utilities (api-server.ts, actions/)
│   ├── qr-menu/                   # Vite+React (customer-facing QR menu SPA)
│   │   └── src/
│   │       ├── api/               # API client + types
│   │       ├── components/        # UI components (MenuView, ItemDetail, etc.)
│   │       └── i18n/              # Locale strings
│   ├── website/                   # Next.js multi-tenant restaurant sites (scaffolded)
│   ├── mobile/                    # Expo React Native (scaffolded)
│   └── landing/                   # SaaS marketing landing (scaffolded)
│
├── packages/                      # Shared libraries
│   ├── domain/                    # Pure TS domain types + Zod schemas (no infra imports)
│   │   └── src/
│   │       ├── ids.ts             # Branded ID types (TenantId, BrandId, etc.)
│   │       ├── money.ts           # Currency type
│   │       ├── rbac/              # Permissions + system roles
│   │       └── schema/            # Zod schemas for menu domain objects
│   ├── db/                        # Drizzle schema, migrations, TenantAwareDb, RLS
│   │   ├── src/
│   │   │   ├── client.ts          # TenantAwareDb, ScopedTx
│   │   │   ├── context.ts         # AsyncLocalStorage (TenantContext)
│   │   │   ├── preflight.ts       # assertNoRlsBypass, assertTenantLockInstalled
│   │   │   ├── roles.ts           # Postgres role provisioning
│   │   │   └── schema/            # Drizzle table definitions (one file per group)
│   │   ├── migrations/            # Generated SQL migrations
│   │   └── sql/                   # Static SQL templates (roles.sql, auth-role.sql)
│   ├── events/                    # Event contracts, outbox, inbox, NATS adapters
│   │   └── src/
│   │       ├── envelope.ts        # EventEnvelope + defineEventContract
│   │       ├── ports.ts           # EventPublisher, EventSubscriber interfaces
│   │       ├── contracts/         # Zod payload schemas per context
│   │       ├── outbox/            # OutboxDispatcher, repository helpers
│   │       ├── inbox/             # runDeduped (atomic dedup + handler)
│   │       └── infrastructure/    # NatsJetStreamPublisher, NatsJetStreamSubscriber
│   ├── api-client/                # Generated TypeScript types from OpenAPI spec
│   │   └── src/generated/         # Auto-generated; do not hand-edit
│   ├── ui/                        # Design system (Radix + Tailwind + tokens)
│   ├── feature-flags/             # OpenFeature client (Unleash)
│   ├── config-typescript/         # Shared tsconfig presets
│   ├── config-eslint/             # Shared ESLint flat-config presets
│   └── config-tailwind/           # Shared Tailwind preset
│
├── infra/
│   ├── docker/postgres/init/      # DB init scripts for local dev
│   ├── k8s/                       # Kubernetes manifests
│   └── terraform/                 # IaC
│
├── tools/
│   └── scripts/
│       ├── seed/                  # Seed CLI (commands/, lib/)
│       ├── erase-tenant/          # Tenant erasure script
│       └── test/                  # Test helper scripts
│
├── .planning/codebase/            # GSD codebase maps (this directory)
├── .github/workflows/             # CI pipelines
├── SPEC.md                        # Product specification (Russian)
├── pnpm-workspace.yaml            # Workspace definition
├── nx.json                        # Nx task runner config
├── tsconfig.base.json             # Root TS config + path aliases
└── eslint.config.mjs              # Root ESLint flat config
```

## Bounded Context Internal Layout

Every bounded context under `apps/api/src/contexts/<ctx>/` follows this structure:

```
<ctx>/
├── <ctx>.module.ts         # NestJS module — wires providers, exports
├── domain/
│   ├── <entity>.aggregate.ts   # Aggregate root (pure TS, no framework)
│   ├── ports.ts                # Repository + port interfaces + Symbol tokens
│   ├── errors.ts               # Domain error classes
│   └── events.ts               # Domain event types (tenancy only)
├── application/
│   ├── <use-case>.service.ts   # One service per use-case
│   ├── dto.ts                  # Zod-validated input DTOs
│   └── ports/                  # Sub-ports only needed by app layer
├── infrastructure/
│   ├── <name>-drizzle.repository.ts  # Drizzle repo implementing domain port
│   └── <name>.adapter.ts             # External service adapter
└── interfaces/
    └── http/
        ├── <name>.controller.ts    # HTTP controller (NestJS @Controller)
        ├── error-mapping.ts        # Domain error → HttpException
        ├── guards/                 # Context-specific guards
        └── decorators/             # Context-specific decorators
```

## Key File Locations

**Entry Points:**

- `apps/api/src/main.ts`: API server bootstrap (preflight checks, Fastify, OTel)
- `apps/admin/app/layout.tsx`: Admin root layout
- `apps/qr-menu/src/main.tsx`: QR menu SPA entry

**Tenant Context Wiring:**

- `packages/db/src/context.ts`: `AsyncLocalStorage<TenantContext>`, `runInTenantContext`, `requireTenantContext`
- `apps/api/src/shared/tenant-context.middleware.ts`: Resolves tenant from request, binds ALS
- `packages/db/src/client.ts`: `TenantAwareDb.withTenant()` — calls `app_bind_tenant` GUC, enforces RLS

**Auth:**

- `apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts`: Better Auth config
- `apps/api/src/contexts/identity/interfaces/http/guards/auth.guard.ts`: Global default-deny guard
- `apps/api/src/contexts/identity/identity-core.module.ts`: BA + identity event wiring

**Event Bus:**

- `packages/events/src/envelope.ts`: Wire envelope schema + `defineEventContract`
- `packages/events/src/outbox/dispatcher.ts`: `OutboxDispatcher` (poll/publish loop)
- `apps/api/src/infrastructure/outbox-dispatcher.service.ts`: NestJS wrapper (advisory lock, metrics)
- `apps/api/src/infrastructure/nats.module.ts`: `NatsJetStreamPublisher` + `NatsJetStreamSubscriber` providers

**Database Schema:**

- `packages/db/src/schema/tenants.ts`: `tenants`, `tenantDomains` tables
- `packages/db/src/schema/brands.ts`: `brands` table
- `packages/db/src/schema/menu.ts`: `menuCategories`, `menuItems`, `menuVariants`, `menuModifiers` tables
- `packages/db/src/schema/audit.ts`: `auditLog` table
- `packages/db/src/schema/outbox.ts`: `outboxEvents` table
- `packages/db/src/schema/inbox.ts`: `inboxProcessed` table
- `packages/db/src/schema/_columns.ts`: `tenantIdColumn()`, `pkUuid()`, `compositeTenantFk()` helpers

**Shared API Utilities:**

- `apps/api/src/shared/api/wrap.ts`: `wrapWith(mapError)` factory for controller try/catch
- `apps/api/src/shared/api/zod-validation.pipe.ts`: `RestoZodValidationPipe`
- `apps/api/src/shared/exception.filter.ts`: `ProblemDetailsFilter` (RFC 7807)
- `apps/api/src/shared/api/internal-token.guard.ts`: `InternalTokenGuard` for `/internal/v1/*`

**Admin Client HTTP:**

- `apps/admin/lib/api-server.ts`: `apiFetch` — server-side fetch with BA cookie forwarding + `x-tenant-id`
- `apps/admin/lib/api-server-internal.ts`: Internal API calls (with `INTERNAL_API_TOKEN`)

**Environment:**

- `apps/api/src/config/env.schema.ts`: Zod schema — source of truth for all API env vars
- `apps/api/src/config/prod-guardrails.ts`: Boot-time rejection of dev-default values in production

## Naming Conventions

**Files:**

- Services: `<use-case>.service.ts` (e.g. `provision-tenant.service.ts`)
- Repositories: `<name>-drizzle.repository.ts`
- Adapters: `<name>.adapter.ts`
- Controllers: `<name>.controller.ts`
- Modules: `<name>.module.ts`
- Domain errors: `errors.ts` (within the context)
- Domain ports: `ports.ts` (within the context)
- Port interfaces outside domain: `<name>.port.ts` inside `application/ports/`

**Directories:**

- Bounded contexts: kebab-case, single-word preferred (`tenancy`, `catalog`, `identity`, `audit`)
- Packages: `@resto/<name>` (kebab-case)

**Symbols (DI tokens):**

- Pattern: `SCREAMING_SNAKE_CASE` (e.g. `TENANT_REPOSITORY`, `CATALOG_CACHE_PORT`, `EVENT_PUBLISHER`)
- Declared alongside the interface in the port file, exported from the same module

**Event types:**

- Pattern: `<context>.<noun>_<verb>.v<n>` (e.g. `tenancy.tenant_provisioned.v1`, `identity.signed_in.v1`)

**Database tables:**

- Pattern: snake_case plural noun (`menu_categories`, `tenant_domains`, `outbox_events`)
- Constraint names: `<table>_<purpose>_<kind>` (e.g. `tenants_slug_uq`, `tenants_status_chk`)

## Where to Add New Code

**New bounded context (e.g. `ordering`):**

- Create `apps/api/src/contexts/ordering/` with the 4-layer structure above
- Add `OrderingModule` to `apps/api/src/app.module.ts` imports
- Add DB tables to `packages/db/src/schema/ordering.ts`, re-export from `packages/db/src/schema/index.ts`
- Add event contracts to `packages/events/src/contracts/ordering.ts`
- Add NATS subject `ordering.>` to `STREAM_SUBJECTS` in `apps/api/src/infrastructure/nats.module.ts`

**New use-case within an existing context:**

- Add `apps/api/src/contexts/<ctx>/application/<use-case>.service.ts`
- If new port needed: add interface + Symbol to `domain/ports.ts`, add adapter in `infrastructure/`, wire in `<ctx>.module.ts`
- Add controller method in `interfaces/http/<name>.controller.ts` (or new controller file)

**New DB table:**

- Add Drizzle table definition to `packages/db/src/schema/<group>.ts`
- If tenant-scoped: use `tenantIdColumn()` and `compositeTenantFk()` for child tables (ADR-0020 I-2)
- Re-export from `packages/db/src/schema/index.ts`
- Run `pnpm db:generate` then `pnpm db:migrate`
- Add RLS policy in the migration SQL if tenant-scoped
- Add cross-tenant isolation test to `packages/db/test/integration/tenant-isolation.spec.ts`

**New admin page:**

- Add route segment under `apps/admin/app/dashboard/(workspace)/`
- Server actions go in a co-located `actions.ts` file with `'use server'` directive
- API calls via `apiFetch` from `@/lib/api-server` (server-only)

**New shared domain type:**

- Add Zod schema to `packages/domain/src/schema/<entity>.ts` or a top-level file
- Export from `packages/domain/src/index.ts`
- Derive TypeScript type via `z.infer<typeof Schema>` (never define types independently)

**New shared utility (db helpers):**

- Column helpers: `packages/db/src/schema/_columns.ts`
- Repository base patterns: `packages/db/src/repository-base.ts`

## Special Directories

**`.planning/codebase/`:**

- Purpose: GSD codebase maps consumed by `/gsd:plan-phase` and `/gsd:execute-phase`
- Generated: By `gsd:map-codebase` subagents
- Committed: Yes

**`packages/api-client/src/generated/`:**

- Purpose: TypeScript types auto-generated from `docs/api/openapi.yaml`
- Generated: Yes (do not hand-edit)
- Committed: Yes (allows consumers to import without running codegen)

**`packages/db/migrations/`:**

- Purpose: Drizzle-generated SQL migrations (including hand-written RLS policies)
- Generated: Partially (Drizzle generates; RLS policies hand-added)
- Committed: Yes

**`apps/api/dist/` and `apps/qr-menu/dist/`:**

- Purpose: Build output
- Generated: Yes
- Committed: No (gitignored)

---

_Structure analysis: 2026-05-24_
