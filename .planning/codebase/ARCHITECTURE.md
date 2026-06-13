<!-- refreshed: 2026-05-24 -->

# Architecture

**Analysis Date:** 2026-05-24

## System Overview

```text
┌────────────────────────────────────────────────────────────────────────┐
│                          Client Applications                            │
│                                                                         │
│  apps/admin (Next.js 15 RSC)  apps/qr-menu (Vite+React)  apps/website    │
└──────────────┬──────────────────────────┬──────────────────────────────┘
               │ HTTP (server actions,    │ HTTP (fetch, AbortSignal)
               │ apiFetch wrapper)        │
               ▼                          ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     apps/api  (NestJS Modular Monolith)                 │
│                                                                         │
│  ┌────────────┐ ┌────────────┐ ┌──────────────┐ ┌──────────────────┐  │
│  │  identity  │ │  tenancy   │ │   catalog    │ │     audit        │  │
│  │  context   │ │  context   │ │   context    │ │     context      │  │
│  │            │ │            │ │              │ │                  │  │
│  │interfaces/ │ │interfaces/ │ │interfaces/   │ │infrastructure/   │  │
│  │application/│ │application/│ │application/  │ │application/      │  │
│  │domain/     │ │domain/     │ │domain/       │ │domain/           │  │
│  │infra/      │ │infra/      │ │infra/        │ │                  │  │
│  └──────┬─────┘ └──────┬─────┘ └──────┬───────┘ └──────────┬───────┘  │
│         └──────────────┴──────────────┴──────────────────── │          │
│  Shared: CorrelationMiddleware, TenantContextMiddleware,     │          │
│  ProblemDetailsFilter, AuthGuard, InternalTokenGuard         │          │
└──────────────────────────────────────┬──────────────────────┬──────────┘
                                       │                      │
              ┌────────────────────────▼──────┐   ┌──────────▼──────────┐
              │      packages/db               │   │   packages/events    │
              │  TenantAwareDb (Drizzle)       │   │  OutboxDispatcher    │
              │  ScopedTx (tenant isolation)   │   │  NatsJetStream       │
              │  RLS via AsyncLocalStorage     │   │  Publisher/Subscriber│
              └────────────────┬──────────────┘   └──────────┬──────────┘
                               │                             │
              ┌────────────────▼─────────┐    ┌─────────────▼─────────┐
              │   PostgreSQL (RLS on)     │    │  NATS JetStream        │
              │   resto_app role          │    │  Stream: RESTO_EVENTS  │
              │   (NOBYPASSRLS)           │    │  Subjects: tenancy.>   │
              │   resto_auth role         │    │  identity.>  catalog.> │
              │   (BYPASSRLS for BA)      │    │  ordering.>  billing.> │
              └──────────────────────────┘    └───────────────────────┘
```

## Component Responsibilities

| Component                 | Responsibility                                                                   | Key Files                                          |
| ------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------- |
| `identity` context        | Auth (Better Auth), session management, user/operator lifecycle, RBAC            | `apps/api/src/contexts/identity/`                  |
| `tenancy` context         | Tenant provisioning/lifecycle, brand management, domain resolution               | `apps/api/src/contexts/tenancy/`                   |
| `catalog` context         | Menu items, categories, modifiers, publish/cache cycle                           | `apps/api/src/contexts/catalog/`                   |
| `audit` context           | Cross-cutting event audit trail, subscribes to all NATS subjects                 | `apps/api/src/contexts/audit/`                     |
| `TenantContextMiddleware` | Resolves tenant+brand from request host or headers; binds AsyncLocalStorage      | `apps/api/src/shared/tenant-context.middleware.ts` |
| `TenantAwareDb`           | Drizzle wrapper enforcing per-tenant Postgres RLS via `app_bind_tenant` GUC      | `packages/db/src/client.ts`                        |
| `OutboxDispatcher`        | Polls outbox table, publishes events to NATS JetStream; leader-elected           | `packages/events/src/outbox/dispatcher.ts`         |
| `apps/admin`              | Next.js 15 App Router operator dashboard; server actions call api via `apiFetch` | `apps/admin/`                                      |
| `apps/qr-menu`            | Vite+React customer-facing menu app; reads public `/v1/menu`                     | `apps/qr-menu/`                                    |

## Pattern Overview

**Overall:** DDD Modular Monolith with Hexagonal (Ports & Adapters) within each bounded context.

**Key Characteristics:**

- Each bounded context (`tenancy`, `identity`, `catalog`, `audit`) follows a strict 4-layer layout: `domain/` → `application/` → `infrastructure/` → `interfaces/`
- Domain layer is pure TypeScript (no NestJS, no Drizzle, no framework imports)
- Application services depend only on port interfaces (`Symbol`-keyed), never on concrete adapters
- Infrastructure adapters implement domain ports; NestJS DI wires them at module composition time
- Multi-tenant isolation is double-enforced: `ScopedTx` (application layer) + Postgres RLS (database layer)

## Layers

**`domain/`:**

- Purpose: Business rules, aggregate roots, domain events, port interfaces
- Location: `apps/api/src/contexts/<ctx>/domain/`
- Contains: Aggregate classes (e.g. `Tenant`, `Brand`), domain error classes, port interface definitions, Zod schemas for value objects
- Depends on: Only `@resto/domain` (shared business types), `zod`
- Used by: Application layer only

**`application/`:**

- Purpose: Use-case orchestration; coordinates aggregates and ports
- Location: `apps/api/src/contexts/<ctx>/application/`
- Contains: `*.service.ts` files (one per use-case), `dto.ts` (Zod-validated DTOs), `ports/` (sub-interfaces needed by app layer)
- Depends on: `domain/` ports (injected via Symbol tokens), `@resto/db`, `@resto/domain`
- Used by: `interfaces/` layer

**`infrastructure/`:**

- Purpose: Concrete implementations of domain ports
- Location: `apps/api/src/contexts/<ctx>/infrastructure/`
- Contains: Drizzle repositories (`*-drizzle.repository.ts`), external adapters (`stripe-connect.adapter.ts`, `redis-catalog-cache.adapter.ts`, `s3-signed-image-url.adapter.ts`, `better-auth/`)
- Depends on: `@resto/db`, `@resto/events`, external SDKs
- Used by: NestJS module wiring only

**`interfaces/http/`:**

- Purpose: HTTP delivery — controllers, guards, decorators, error mapping
- Location: `apps/api/src/contexts/<ctx>/interfaces/http/`
- Contains: `*.controller.ts`, guards (`auth.guard.ts`, `permissions.guard.ts`), decorators, `error-mapping.ts` (domain error → HTTP exception)
- Depends on: Application services (injected), shared decorators
- Used by: NestJS router

**`shared/`:**

- Purpose: Cross-cutting infrastructure shared by all bounded contexts
- Location: `apps/api/src/shared/`
- Contains: `TenantContextMiddleware`, `CorrelationMiddleware`, `ProblemDetailsFilter`, `AuthGuard`, `InternalTokenGuard`, `RateLimitGuard`, decorator definitions

## Data Flow

### Public Menu Read (qr-menu customer)

1. Browser hits `<slug>.menu.resto.app/v1/menu` (`apps/qr-menu/src/api/client.ts`)
2. `CorrelationMiddleware` attaches correlation id (`apps/api/src/shared/correlation.middleware.ts`)
3. `TenantContextMiddleware` resolves tenant from host via `TenantAndBrandResolverService`, binds `AsyncLocalStorage` (`apps/api/src/shared/tenant-context.middleware.ts`)
4. `AuthGuard` skips — `@Public()` on `PublicMenuController` (`apps/api/src/contexts/catalog/interfaces/http/public-menu.controller.ts`)
5. `GetPublishedMenuService` checks Redis cache, falls back to `CatalogDrizzleRepository.loadPublishedMenu`, presigns S3 image URLs (`apps/api/src/contexts/catalog/application/get-published-menu.service.ts`)
6. `TenantAwareDb.withTenant()` calls `SELECT app_bind_tenant(tenantId)` → Postgres RLS enforces isolation (`packages/db/src/client.ts`)

### Operator Authenticated Request (admin panel)

1. Next.js server action calls `apiFetch('/v1/...', ...)` which attaches BA session cookie + `x-tenant-id` header (`apps/admin/lib/api-server.ts`)
2. `TenantContextMiddleware` resolves tenant from `x-tenant-id` header (allowed because `INTERNAL_API_TOKEN` gate passes for operator internal routes, or `NODE_ENV=development`)
3. `AuthGuard` calls `auth.api.getSession()` → builds typed `Principal` (operator/customer/anonymous), runs tenant cross-check (`apps/api/src/contexts/identity/interfaces/http/guards/auth.guard.ts`)
4. `PermissionsGuard` checks `@Permissions({ tenant: ['read'] })` via `BetterAuthPermissionChecker` (`apps/api/src/contexts/identity/interfaces/http/guards/permissions.guard.ts`)
5. Controller delegates to application service

### Domain Event Publication (transactional outbox)

1. Application service creates/mutates aggregate → aggregate emits domain events via `pullEvents()`
2. Repository saves aggregate state AND appends outbox rows in **single DB transaction** (e.g. `apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts`)
3. `OutboxDispatcherService` holds Postgres advisory lock (`pg_try_advisory_lock(4815115)`), polls outbox every 250ms (`apps/api/src/infrastructure/outbox-dispatcher.service.ts`)
4. `NatsJetStreamPublisher.publish(envelope)` → NATS JetStream stream `RESTO_EVENTS` (`packages/events/src/infrastructure/nats-publisher.ts`)
5. `NatsAuditSubscriber` receives events on `tenancy.>` and `identity.>`, calls `runDeduped(db, envelope, ...)` → writes audit row (`apps/api/src/contexts/audit/infrastructure/nats-audit-subscriber.ts`)

**State Management:**

- Tenant context propagated per-request via `AsyncLocalStorage<TenantContext>` (`packages/db/src/context.ts`)
- `correlationId` propagated via separate ALS frame (`packages/events/src/correlation.ts`)
- No global mutable state in application code

## Key Abstractions

**Aggregate Root (`Tenant`, domain events via `pullEvents()`):**

- Purpose: Encapsulate state transitions and emit strongly-typed domain events
- Examples: `apps/api/src/contexts/tenancy/domain/tenant.aggregate.ts`, `apps/api/src/contexts/tenancy/domain/brand.aggregate.ts`
- Pattern: Snapshot-based reconstruction (`fromSnapshot`), private constructor, `pullEvents()` drains events after save

**Port (Symbol-keyed interface):**

- Purpose: Dependency inversion between application and infrastructure layers
- Examples: `TENANT_REPOSITORY`, `CATALOG_REPOSITORY`, `CATALOG_CACHE_PORT`, `IMAGE_URL_PORT`, `STRIPE_CONNECT_PORT`, `EVENT_PUBLISHER`
- Pattern: `export const FOO_PORT = Symbol('FOO_PORT')` paired with `export interface FooPort { ... }` in `domain/ports.ts` or `application/ports/*.ts`

**`TenantAwareDb` + `ScopedTx`:**

- Purpose: Enforce tenant isolation at every DB call; `ScopedTx` auto-injects `tenantId` on INSERT, auto-appends `eq(table.tenantId, ...)` on SELECT/UPDATE; blocks DELETE
- File: `packages/db/src/client.ts`
- Pattern: `db.withTenant((tx, scoped) => scoped.selectFrom(menuCategories))` — caller never writes `WHERE tenant_id = ?` manually

**`EventEnvelope` + `defineEventContract`:**

- Purpose: Typed event wire format; versioned by `<context>.<event>.v<n>` subject pattern
- Files: `packages/events/src/envelope.ts`, `packages/events/src/contracts/tenancy.ts`, `packages/events/src/contracts/identity.ts`
- Pattern: `defineEventContract({ type: 'tenancy.tenant_provisioned.v1', payload: PayloadZodSchema })`

**`Principal` discriminated union:**

- Purpose: Typed auth context attached to `req.principal` by `AuthGuard`
- File: `apps/api/src/contexts/identity/domain/principal.ts`
- Pattern: `{ kind: 'operator', userId, email, tenantId?, baseRole? }` | `{ kind: 'customer', ... }` | `{ kind: 'anonymous' }`

**`runDeduped` (inbox dedup):**

- Purpose: At-most-once handler invocation for event consumers; inserts inbox marker and runs handler in same DB transaction
- File: `packages/events/src/inbox/run-duped.ts`
- Pattern: `await runDeduped(db, envelope, 'consumer-name', async (tx) => { /* side effects */ })`

## Entry Points

**`apps/api` (NestJS HTTP + event loop):**

- Location: `apps/api/src/main.ts`
- Triggers: Process start (Docker / k8s Pod)
- Responsibilities: Load + validate env (`loadEnv`), preflight RLS assertions (`assertNoRlsBypass`, `assertTenantLockInstalled`, `assertSetConfigRevoked`), create Fastify adapter, apply OpenAPI, start `OutboxDispatcherService`

**`apps/admin` (Next.js RSC):**

- Location: `apps/admin/app/layout.tsx`, `apps/admin/app/page.tsx`
- Triggers: Next.js App Router render
- Responsibilities: Auth-gated dashboard UI; calls api exclusively via `apps/admin/lib/api-server.ts:apiFetch`

**`apps/qr-menu` (Vite SPA):**

- Location: `apps/qr-menu/src/main.tsx`
- Triggers: Browser load from `<slug>.menu.resto.app`
- Responsibilities: Fetch and render published menu; client-side routing between menu list and item detail

## Architectural Constraints

- **RLS double-enforcement:** Every query on a tenant-scoped table MUST go through `ScopedTx` (application layer) AND Postgres RLS (db layer). RLS alone is not sufficient per ADR-0020 I-1.
- **`runInTenantContext` is HTTP-middleware-only:** NATS subscribers, outbox dispatcher, and background jobs MUST use `db.withTenant(tenantId, ...)` or `db.withoutTenant(reason, ...)`, never `runInTenantContext` (ADR-0020 I-6).
- **Composite FK on every tenant-scoped child table:** Child tables carrying `tenant_id` + a parent `*_id` MUST declare `FOREIGN KEY (parent_id, tenant_id) REFERENCES parent(id, tenant_id)` (ADR-0020 I-2).
- **`correlationId` derives from OTel span:** Direct `randomUUID()` for `correlationId` in outbox envelopes is forbidden; use `buildEnvelope` helper (ADR-0020 I-4). Note: identity context currently violates this — see CONCERNS.md.
- **Hard deletes are forbidden:** `resto_app` Postgres role has no DELETE privilege. Soft-delete via `archived_at` / `status = 'archived'` is the rule.
- **`INTERNAL_API_TOKEN` is server-only:** Never imported into a client component or exposed in a `NEXT_PUBLIC_*` var.
- **`withoutTenant` requires non-empty reason string:** Every bypass is logged at WARN with the reason for auditability.
- **No raw SQL outside `packages/db`:** Hand-written SQL in application code bypasses the type-safety guarantees of Drizzle + `ScopedTx`.

## Anti-Patterns

### Calling `runInTenantContext` outside HTTP middleware

**What happens:** A NATS subscriber or background job calls `runInTenantContext(ctx, ...)` to set tenant context.
**Why it's wrong:** `runInTenantContext` is designed for the single synchronous middleware chain; in async event-driven code it can bind the wrong tenant across concurrent message handlers.
**Do this instead:** Use `db.withTenantId(tenantId, async (tx, scoped) => { ... })` inside event handlers. See `apps/api/src/contexts/audit/infrastructure/nats-audit-subscriber.ts` for the `runDeduped` pattern.

### Direct `EventEnvelope` literal construction with `randomUUID()` as `correlationId`

**What happens:** Application code builds an `EventEnvelope` manually with `correlationId: randomUUID()`.
**Why it's wrong:** Breaks the trace link between the originating HTTP request (OTel span) and the async event. Audit and observability lose the correlation chain.
**Do this instead:** Use the `buildEnvelope` helper from `packages/events` which reads the active OTel span context. The identity context emitters (`apps/api/src/contexts/identity/identity-core.module.ts`) currently violate this and are documented in CONCERNS.md.

### Skipping `ScopedTx` and querying tenant-scoped tables via raw `tx`

**What happens:** A repository calls `tx.select().from(menuCategories)` without a `WHERE tenant_id = ?` clause, relying solely on RLS.
**Why it's wrong:** RLS is the safety net, not the fence. A misconfigured role or a future `BYPASSRLS` scenario leaks data. Application-layer filter is mandatory per ADR-0020 I-1.
**Do this instead:** Use `scoped.selectFrom(menuCategories, extraWhere)` — the `ScopedTx` auto-injects the `eq(table.tenantId, this.tenantId)` predicate.

## Error Handling

**Strategy:** All exceptions converge at `ProblemDetailsFilter` (`apps/api/src/shared/exception.filter.ts`), which emits RFC 7807 `application/problem+json` responses. 5xx details are redacted from the response body (detail appears only in logs, correlated by `correlationId` + `traceId`).

**Patterns:**

- Domain errors are typed classes extending `Error` (e.g. `TenantAlreadyArchivedError`, `MenuItemNotFoundError`), thrown in the domain layer
- Each context's `interfaces/http/error-mapping.ts` translates domain errors → NestJS HTTP exceptions (e.g. `NotFoundException`, `ConflictException`)
- `wrapWith(mapError)` factory in `apps/api/src/shared/api/wrap.ts` is the idiomatic try/catch wrapper used by controllers

## Cross-Cutting Concerns

**Logging:** Pino-based structured logger (via NestJS `Logger`). Redacts `password`, `token`, `email`, `phone`, `params` (`packages/db/src/logger.ts`). All log lines include `correlationId` when the middleware has bound it.

**Validation:** Zod at every boundary — env schema (`apps/api/src/config/env.schema.ts`), HTTP DTOs via `nestjs-zod` (`RestoZodValidationPipe`), event envelopes (`packages/events/src/envelope.ts`), domain value objects (`packages/domain/src/`).

**Authentication:** Better Auth (email+password, organization plugin, 2FA TOTP, bearer). BA uses `resto_auth` Postgres role (BYPASSRLS) on a separate connection (`BETTER_AUTH_DATABASE_URL`). Session cookies are cross-subdomain when `AUTH_COOKIE_DOMAIN=.resto.app`.

**Observability:** OpenTelemetry bootstrapped before any module load (`apps/api/src/bootstrap-telemetry.ts`). OTel metrics exposed from `OutboxDispatcherService` (delivered counter, lag histogram, claim failures counter). `ProblemDetailsFilter` attaches `traceId` to every error response.

**Rate limiting:** Per-IP rate limits enforced by `RateLimitGuard` (`apps/api/src/shared/rate-limit.guard.ts`) and `BrandSlugRateLimitGuard`. Configured via env vars (`RATE_LIMIT_PUBLIC_PER_MIN`, `RATE_LIMIT_AUTH_SIGNIN_PER_MIN`, etc.).

---

_Architecture analysis: 2026-05-24_
