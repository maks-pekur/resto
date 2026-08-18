<!-- refreshed: 2026-08-18 -->

# Architecture

**Analysis Date:** 2026-08-18

## System Overview

```text
┌───────────────────────────────────────────────────────────────────────────┐
│                          Client Applications                              │
│                                                                            │
│  apps/admin (Vite+React, TanStack   apps/qr-menu    apps/website          │
│  Router/Query — brand from URL      (Vite+React)    (Next.js, multi-      │
│  param /$brandSlug, no cookie)                       tenant SSR)          │
└──────────────┬───────────────────────────┬──────────────────┬─────────────┘
               │ fetch + BA session cookie  │ fetch (public)   │
               │ x-tenant-id / x-brand-slug │                  │
               │ / x-location-id headers    │                  │
               ▼                           ▼                  ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                    apps/api  (NestJS Modular Monolith)                    │
│                                                                            │
│ ┌──────────┐┌──────────┐┌─────────┐┌─────────┐┌─────────┐┌────────────┐  │
│ │ identity ││ tenancy  ││ catalog ││ordering ││payments ││notifications│  │
│ └──────────┘└──────────┘└─────────┘└─────────┘└─────────┘└────────────┘  │
│                          ┌─────────┐                                     │
│                          │  audit  │ (NATS subscriber only)              │
│                          └─────────┘                                     │
│  Shared: CorrelationMiddleware → TenantContextMiddleware → 6 global      │
│  guards (see Guard Chain below) → ProblemDetailsFilter                   │
└──────────────────────────────────────┬───────────────────────┬───────────┘
                                       │                       │
              ┌────────────────────────▼──────┐   ┌───────────▼──────────┐
              │      packages/db               │   │   packages/events     │
              │  TenantAwareDb (Drizzle)       │   │  OutboxDispatcher     │
              │  ScopedTx (tenant isolation)   │   │  NatsJetStream        │
              │  ALS: tenant+brand+location    │   │  Publisher/Subscriber │
              └────────────────┬───────────────┘   └──────────┬────────────┘
                               │                               │
              ┌────────────────▼─────────┐    ┌───────────────▼────────┐
              │   PostgreSQL (RLS on)     │    │  NATS JetStream         │
              │   resto_app role          │    │  Stream: RESTO_EVENTS   │
              │   (NOBYPASSRLS)           │    │  Subjects: tenancy.>    │
              │   resto_auth role         │    │  identity.> catalog.>   │
              │   (NOBYPASSRLS + explicit │    │  ordering.> payments.>  │
              │    permissive policies,   │    │  billing.> dlq.>        │
              │    migration 0054)        │    │                         │
              └───────────────────────────┘    └─────────────────────────┘
```

**Correction from prior analysis (2026-05-24):** `resto_auth` is **not**
`BYPASSRLS`. RDS-managed Postgres cannot grant `BYPASSRLS` to a non-superuser,
so migration `0054_resto_auth_permissive_policies.sql` instead grants
`resto_auth` explicit `CREATE POLICY ... FOR ALL TO resto_auth USING(true)`
rows on the Better-Auth-owned tables (`member`, `invitation`,
`organization_role`, `tenants`). See `packages/db/CLAUDE.md`.

## Component Responsibilities

| Component                    | Responsibility                                                                       | Key Files                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `identity` context           | Better Auth wiring, session/RBAC, owner/role management, brand+location session pin  | `apps/api/src/contexts/identity/`                          |
| `tenancy` context            | Tenant/Brand/Location provisioning, domain resolution, tenant erasure                | `apps/api/src/contexts/tenancy/`                           |
| `catalog` context            | Menu items/categories/modifiers, publish cycle, stop-list, version-keyed public read | `apps/api/src/contexts/catalog/`                           |
| `ordering` context           | Guest order creation, operator order feed/accept/advance, order aggregate            | `apps/api/src/contexts/ordering/`                          |
| `payments` context           | Stripe Connect checkout, webhook handling, cancel/refund/retry-refund                | `apps/api/src/contexts/payments/`                          |
| `notifications` context      | Guest order-status email notifications, NATS-subscriber-driven                       | `apps/api/src/contexts/notifications/`                     |
| `audit` context              | Cross-cutting event audit trail, subscribes to all NATS subjects                     | `apps/api/src/contexts/audit/`                             |
| `TenantContextMiddleware`    | Resolves tenant/brand/location from URL, headers, or BA session; binds ALS           | `apps/api/src/shared/tenant-context.middleware.ts`         |
| `TenantAwareDb` / `ScopedTx` | Enforces tenant+brand+location RLS binding per transaction                           | `packages/db/src/client.ts`                                |
| `OutboxDispatcherService`    | Polls outbox table, publishes to NATS JetStream; advisory-lock leader election       | `apps/api/src/infrastructure/outbox-dispatcher.service.ts` |
| `apps/admin`                 | Vite SPA operator dashboard; TanStack Router routes under `(protected)/$brandSlug/`  | `apps/admin/src/`                                          |
| `apps/qr-menu`               | Vite+React customer-facing menu app; reads public `/v1/menu`                         | `apps/qr-menu/src/`                                        |
| `apps/website`               | Next.js multi-tenant marketing/ordering site (host-based tenant resolution)          | `apps/website/app/`                                        |

## Pattern Overview

**Overall:** DDD modular monolith with hexagonal (ports & adapters) layering inside each bounded context.

**Key Characteristics:**

- Seven bounded contexts under `apps/api/src/contexts/`: `identity`, `tenancy`, `catalog`, `ordering`, `payments`, `notifications`, `audit`. Each follows the strict 4-layer layout: `domain/` → `application/` → `infrastructure/` → `interfaces/`.
- Domain layer is pure TypeScript — no NestJS, no Drizzle, no framework imports.
- Application services depend only on port interfaces (`Symbol`-keyed), never on concrete adapters.
- Infrastructure adapters implement domain ports; NestJS DI wires them at module composition time.
- Multi-tenant isolation is triple-graded: `ScopedTx` (application layer) + Postgres RLS (tenant/brand/location policies, database layer) + the global guard chain (HTTP layer).
- **Deviation from strict context isolation:** `OrderingModule` and `PaymentsModule` cross-import each other directly. `OrderingModule` re-registers `PAYMENT_REPOSITORY: PaymentDrizzleRepository` from `../payments/infrastructure/...` as its own provider (rather than importing `PaymentsModule`), and `PaymentsModule` imports `OrderingModule` to reach `ORDER_REPOSITORY` (`RefundOrderService`, `CancelOrderService` mutate the `Order` aggregate directly). This is a real, intentional coupling — the money path and the order lifecycle are transactionally linked — not a hygiene bug, but it means the two contexts cannot be split or deployed independently without a larger refactor. See `apps/api/src/contexts/ordering/ordering.module.ts`, `apps/api/src/contexts/payments/payments.module.ts`.

## Layers

**`domain/`:**

- Purpose: Business rules, aggregate roots, domain events, port interfaces
- Location: `apps/api/src/contexts/<ctx>/domain/`
- Contains: Aggregate classes (`Tenant`, `Brand`, `Location`, `Order`), domain error classes, port interfaces + `Symbol` tokens, Zod schemas for value objects
- Depends on: Only `@resto/domain`, `zod`
- Used by: Application layer only

**`application/`:**

- Purpose: Use-case orchestration; coordinates aggregates and ports
- Location: `apps/api/src/contexts/<ctx>/application/`
- Contains: `*.service.ts` (one per use-case, single public `.execute(input)`), `dto.ts`, `ports/` (sub-interfaces needed only by this layer)
- Depends on: `domain/` ports (injected via `Symbol` tokens), `@resto/db`, `@resto/domain`, `@resto/events`
- Used by: `interfaces/` layer (and, for `ordering`/`payments`, each other's application services directly — see cross-context coupling note above)

**`infrastructure/`:**

- Purpose: Concrete implementations of domain ports
- Location: `apps/api/src/contexts/<ctx>/infrastructure/`
- Contains: Drizzle repositories (`*-drizzle.repository.ts`), external adapters (`stripe-connect.adapter.ts`, `s3-signed-image-url.adapter.ts`, `resend.adapter.ts`, `better-auth/`)
- Depends on: `@resto/db`, `@resto/events`, external SDKs
- Used by: NestJS module wiring only

**`interfaces/http/`:**

- Purpose: HTTP delivery — controllers, context-specific guards, error mapping
- Location: `apps/api/src/contexts/<ctx>/interfaces/http/`
- Contains: `*.controller.ts`, `error-mapping.ts` (`mapDomainError`/`mapXError`), and (identity only) the five global guards
- Depends on: Application services (injected), shared decorators from `apps/api/src/shared/auth/`
- Used by: NestJS router

**`shared/`:**

- Purpose: Cross-cutting infrastructure shared by all bounded contexts
- Location: `apps/api/src/shared/`
- Contains: `TenantContextMiddleware`, `CorrelationMiddleware`, `ProblemDetailsFilter`, `RateLimitGuard`, `InternalTokenGuard`, `RequireActiveTenantGuard`, the decorator vocabulary (`shared/auth/`)

## Guard Chain (load-bearing — read before adding a controller)

Six global guards run, in this exact order, on every request that reaches the NestJS router (public HTTP endpoints handled directly by Fastify — `/api/auth/*`, `/healthz` — bypass the NestJS pipeline entirely and are rate-limited by a separate Fastify `preHandler` hook in `apps/api/src/shared/security.ts`, not by this chain):

| #   | Guard                | Registered                                                                                                                                                              | Default behavior                                                                                                                                                                                                        | Opt-out / opt-in                                                                                              |
| --- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | `AuthGuard`          | `APP_GUARD` in `identity-http.module.ts`                                                                                                                                | Default-deny: resolves BA session, builds typed `Principal`, cross-checks principal tenant vs. ALS tenant, attaches `req.principal` / `req.activeBrandId` / `req.activeLocationId`                                      | `@Public()` skips session resolution entirely; `@RequiresTenantContext()` additionally _demands_ ALS be bound |
| 2   | `PermissionsGuard`   | `APP_GUARD`                                                                                                                                                             | No-op unless `@Permissions({...})` present; then requires an operator principal and delegates to `BetterAuthPermissionChecker`                                                                                          | No decorator = pass-through                                                                                   |
| 3   | `BrandScopeGuard`    | `APP_GUARD`                                                                                                                                                             | Default-on: 403 `brand.context_required` if no brand resolved; owner `baseRole` bypasses; otherwise checks session-pinned `activeBrandId` matches the request brand AND the operator's `member_brand_scope` includes it | `@BrandNeutral()` opt-out                                                                                     |
| 4   | `LocationScopeGuard` | `APP_GUARD`                                                                                                                                                             | Default-on: 403 `location.context_required` if no location resolved; owner bypasses; otherwise checks session-pinned `activeLocationId` matches AND `member_location_scope` includes it                                 | `@LocationNeutral()` **or** `@BrandNeutral()` opt out (guard reads both keys — see below)                     |
| 5   | `OwnerOnlyGuard`     | `APP_GUARD`                                                                                                                                                             | No-op unless `@OwnerOnly()` present; then requires `principal.baseRole === 'owner'`, else 404 (not 403 — hides existence)                                                                                               | No decorator = pass-through                                                                                   |
| 6   | `RateLimitGuard`     | `app.useGlobalGuards()` in `apps/api/src/shared/security.ts`, called from `main.ts` _after_ `NestFactory.create()` has already resolved the `APP_GUARD` providers above | Invokes the Fastify `@fastify/rate-limit` handler from inside the Nest pipeline so 429s get `ProblemDetailsFilter` formatting                                                                                           | `allowList` in `security.ts` (health check, Stripe webhook)                                                   |

All six live in one `ApplicationConfig.globalGuards` array and run in registration order via `GuardsContextCreator`/`GuardsConsumer` (`@nestjs/core`), short-circuiting on the first guard that returns `false`/throws. Because `APP_GUARD` providers are resolved during `NestFactory.create()` (before `registerSecurity()` runs), **`AuthGuard` always executes before `RateLimitGuard`** — a rate-limited unauthenticated request still pays the BA session lookup cost. Registration source: `apps/api/src/contexts/identity/identity-http.module.ts` (providers array, guards listed 1→5 above in that literal order) and `apps/api/src/shared/security.ts:277`.

### Decorator vocabulary (`apps/api/src/shared/auth/`)

| Decorator                  | Metadata key                       | Guard(s) that read it                                             | Effect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------- | ---------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@Public()`                | `identity:public`                  | `AuthGuard`                                                       | Skips session resolution; still enforces tenant-archived 404                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `@RequiresTenantContext()` | `identity:requires_tenant_context` | `AuthGuard`                                                       | Forbids the route if ALS has no tenant bound (closes an asymmetry where a forgetful service would trust `principal.tenantId` on a route with no tenant resolution)                                                                                                                                                                                                                                                                                                                                                     |
| `@Permissions(spec)`       | `identity:permissions`             | `PermissionsGuard`                                                | Requires the named permission via `BetterAuthPermissionChecker`                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `@BrandNeutral()`          | `identity:brand-neutral`           | `BrandScopeGuard` **and** `LocationScopeGuard`                    | Opts a route out of brand scoping _and_, as a side effect, out of location scoping too (fix landed in commit `e4c8ef70`, phase 08.4-07 — see Anti-Patterns below)                                                                                                                                                                                                                                                                                                                                                      |
| `@LocationNeutral()`       | `identity:location-neutral`        | `LocationScopeGuard`                                              | Opts a route out of location scoping only                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `@OwnerOnly()`             | `identity:owner-only`              | `OwnerOnlyGuard`                                                  | Restricts to tenant owner; 404 for everyone else                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `@RequireBrand()`          | `identity:require-brand`           | **Nobody**                                                        | **Dead code.** `BrandScopeGuard.canActivate` never reads `REQUIRE_BRAND_KEY` — it is opt-out-by-default (every route is brand-scoped unless `@BrandNeutral()`), so this decorator is a no-op left on ~30 controller methods as stale documentation. Confirmed dead in `.planning/phases/08.4-location-scoped-access/08.4-PATTERNS.md:735`. Do not treat its presence as an enforcement signal, and do not add a symmetric `@RequireLocation()` — the location guard is opt-out-only by design (same file, `T-084-16`). |
| `@RequireActiveTenant()`   | `tenancy:require_active_tenant`    | `RequireActiveTenantGuard` (route-level `@UseGuards`, not global) | 404s if the resolved tenant is suspended/archived; applied per-route, not globally, so `/internal/*` stays reachable on a suspended tenant                                                                                                                                                                                                                                                                                                                                                                             |

**The incident this table exists to prevent:** `LocationScopeGuard` shipped default-on (phase 08.4-05) without auditing the ~16 controllers already carrying `@BrandNeutral()`. Every one of them 403'd on `location.context_required` _before_ the owner-bypass check — including guest menu reads, guest checkout (`POST /v1/orders`), signup, and tenant/brand provisioning. The fix was not a decorator sweep across 16 files; it was making `LocationScopeGuard` itself also honor `BRAND_NEUTRAL_KEY` (commit `e4c8ef70`), so every existing `@BrandNeutral()` route was fixed in one guard change. Full incident record: `.planning/phases/08.4-location-scoped-access/deferred-items.md` and `08.4-06-SUMMARY.md`. **When adding a new controller:** if it needs `@BrandNeutral()`, you almost never also need `@LocationNeutral()` — the brand-neutral opt-out already covers location. Add `@LocationNeutral()` alone only for a route that IS brand-scoped but should skip location scoping (e.g. brand-level settings pages that apply across all locations).

## Data Flow

### Public Menu Read (qr-menu / website customer)

1. Browser hits `<slug>.menu.resto.app/v1/menu` (or the equivalent website route) — no cookies sent, no location header
2. `CorrelationMiddleware` attaches correlation id (`apps/api/src/shared/correlation.middleware.ts`)
3. `TenantContextMiddleware` resolves tenant (+ brand, if `x-brand-slug` present) from host via `TenantAndBrandResolverService`, binds ALS (`apps/api/src/shared/tenant-context.middleware.ts`)
4. `AuthGuard` returns true immediately — `@Public()` on `PublicMenuController`; `BrandScopeGuard`/`LocationScopeGuard` pass via `@BrandNeutral()` on the same controller
5. `GetPublishedMenuService` reads Postgres directly (no cache tier) and presigns S3 image URLs (`apps/api/src/contexts/catalog/application/get-published-menu.service.ts`)
6. Controller sets `ETag` from the Postgres-tracked `menuVersion` (menu) or `stopVersion` (availability) via `MENU_VERSION_PORT`, and `Cache-Control: public, s-maxage=300, stale-while-revalidate=60` (menu) / `s-maxage=5` (availability) — this is the entire caching layer; there is no Redis tier (`apps/api/src/contexts/catalog/interfaces/http/public-menu.controller.ts`)
7. `TenantAwareDb.withTenant()` calls `app_bind_tenant(tenantId)` (and `app_bind_brand` if a brand resolved) → Postgres RLS enforces isolation (`packages/db/src/client.ts`)

### Operator Authenticated Request (admin panel)

1. Admin SPA route resolves `brandSlug` from the URL path (`(protected)/$brandSlug/...`), calls `apiFetch('/v1/...', { brandSlug, locationId })`, which attaches the BA session cookie + `x-tenant-id` (from the cached BA session's `activeOrganizationId`) + `x-brand-slug` + `x-location-id` headers (`apps/admin/src/lib/api-client.ts`)
2. `TenantContextMiddleware` resolves tenant from `x-tenant-id`, brand from `x-brand-slug`, and binds the `x-location-id` header as a _hint_ into ALS (not yet trusted)
3. `AuthGuard` calls `auth.api.getSession()`, builds the typed `Principal`, cross-checks principal tenant vs. ALS tenant, and — critically — sets `req.activeBrandId`/`req.activeLocationId` from the **session**, not from the client-echoed header (`apps/api/src/contexts/identity/interfaces/http/guards/auth.guard.ts`)
4. `PermissionsGuard` checks `@Permissions({...})` via `BetterAuthPermissionChecker`
5. `BrandScopeGuard` / `LocationScopeGuard` reconcile the ALS-bound (client-echoed) id against the session-pinned id and the operator's `member_brand_scope` / `member_location_scope` rows; mismatch → 404 (hides existence), out-of-scope → 403
6. `OwnerOnlyGuard` gate if present
7. Controller delegates to application service; `TenantAwareDb.withTenant()` binds tenant + brand + location GUCs for the transaction

**Why the header is a hint, not a trust boundary:** the client can send any `x-location-id`; only the server-managed session pin (`session.activeLocationId`, written exclusively by `SetActiveLocationService` via `SESSION_ACTIVE_LOCATION_WRITER`) is authoritative. This is exactly the asymmetry `BrandScopeGuard`/`LocationScopeGuard` exist to close — see `apps/api/src/shared/tenant-context.middleware.ts` comment `T-084-09`.

### Domain Event Publication (transactional outbox)

1. Application service mutates an aggregate → aggregate emits domain events via `pullEvents()`
2. Repository saves aggregate state AND appends an outbox row in the **same DB transaction** (e.g. `apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts`), using `appendToOutbox` + `buildEnvelope` (never a hand-built envelope literal — `buildEnvelope` derives `correlationId` from the active OTel span)
3. `OutboxDispatcherService` holds a Postgres advisory lock, polls the outbox table, publishes to NATS JetStream stream `RESTO_EVENTS` (`apps/api/src/infrastructure/outbox-dispatcher.service.ts`)
4. Subscribers (`NatsAuditSubscriber`, `NatsGuestNotificationSubscriber`, etc.) call `runDeduped(db, envelope, consumerName, async (tx) => {...})` — inserts the inbox marker and runs handler side effects in one transaction (`packages/events/src/inbox/run-deduped.ts`)

### Payment Refund (three-transaction split with durable ledger)

`RefundOrderService.executeWithOrder` (`apps/api/src/contexts/payments/application/refund-order.service.ts`) does not wrap the Stripe call in a DB transaction — a provider call can hang or fail independently of the DB:

1. **Tx 1** (`withTenant`): idempotency check via a deterministic `refundRequestId` (`refund:<orderId>:<alreadyRefunded>:<amount>`); if an identical request already succeeded, short-circuit and return the prior result. Otherwise call `order.refund(...)` (domain invariant check) and insert a `payment_refunds` row with `status: 'pending'`
2. **Stripe call** (no transaction): `provider.createRefund(...)`. On failure, **Tx 2a** (`withTenant`) marks the ledger row `status: 'failed'` with a truncated failure reason — the order/cancel state is left untouched, and the caller sees `RefundProviderFailedError`
3. **Tx 2b** (`withTenant`, success path): marks the ledger row `succeeded`, recomputes `payments.refundedAmount` / `status` (`refunded` vs `partially_refunded`), persists the updated `Order` aggregate, and appends a `PaymentOrderRefundedV1` outbox event — all in one transaction

The durable `payment_refunds` table (`packages/db/src/schema/ordering.ts`, despite belonging to the payments _bounded context_ conceptually) is what makes a crashed refund resumable and auditable: a `pending` row with no matching Stripe refund is a stuck refund, a `failed` row is a known-failed attempt, and `refundRequestId` prevents a retry from double-refunding.

**State Management:**

- Tenant + brand + location context propagated per-request via a single `AsyncLocalStorage<TenantContext>` (`packages/db/src/context.ts`) — `TenantContext` now carries `tenantId`, optional `brandId`, optional `locationId`, optional `correlationId`
- `correlationId` also propagates via a separate ALS frame in `packages/events/src/correlation.ts`
- No global mutable state in application code; the one exception is the in-process rate-limit identity buckets in `apps/api/src/shared/security.ts` (bounded `Map`, swept every 5 minutes) — acceptable because the api runs as a single Fastify process per pod and the bucket is a best-effort abuse guard, not a security boundary

## Key Abstractions

**Aggregate Root (`Tenant`, `Brand`, `Location`, `Order`):**

- Purpose: Encapsulate state transitions and emit strongly-typed domain events
- Examples: `apps/api/src/contexts/tenancy/domain/tenant.aggregate.ts`, `.../brand.aggregate.ts`, `.../location.aggregate.ts`, `apps/api/src/contexts/ordering/domain/order.aggregate.ts`
- Pattern: Snapshot-based reconstruction (`fromSnapshot`), private constructor, `pullEvents()` drains events after save

**Port (Symbol-keyed interface):**

- Purpose: Dependency inversion between application and infrastructure layers
- Examples: `TENANT_REPOSITORY`, `BRAND_REPOSITORY`, `LOCATION_REPOSITORY`, `CATALOG_REPOSITORY`, `MENU_VERSION_PORT`, `ORDER_REPOSITORY`, `ORDER_FEED_REPOSITORY`, `PAYMENT_REPOSITORY`, `PAYMENT_PROVIDER_PORT`, `EVENT_PUBLISHER`
- Pattern: `export const FOO_PORT = Symbol('FOO_PORT')` + `export interface FooPort {...}` in `domain/ports.ts` (or `application/ports/*.ts` for app-layer-only sub-ports)

**`TenantAwareDb` + `ScopedTx` (three-grain RLS binding):**

- Purpose: Enforce tenant (+ brand, + location when present) isolation at every DB call
- File: `packages/db/src/client.ts`
- Pattern: `db.withTenant((tx, scoped) => scoped.selectFrom(menuCategories))`. Internally: `app_bind_tenant` always; `app_bind_brand` if `ctx.brandId` set; `app_bind_location` if `ctx.locationId` set — each is a SECURITY DEFINER wrapper, and `#assertGucUnchanged` re-checks all three GUCs at the end of the transaction, rolling back on any drift
- `ScopedTx` has no `deleteFrom` — hard deletes are forbidden at the role level

**`EventEnvelope` + `defineEventContract` + `buildEnvelope`:**

- Purpose: Typed event wire format; versioned by `<context>.<event>.v<n>` subject pattern; `correlationId` always derived from the active OTel span
- Files: `packages/events/src/envelope.ts`, `packages/events/src/contracts/{tenancy,identity,catalog,ordering,payments}.ts`
- Pattern: `defineEventContract({ type: 'tenancy.tenant_provisioned.v1', payload: PayloadZodSchema })`; construct with `buildEnvelope(contract, payload, { tenantId })`, never a hand-built literal

**`Principal` discriminated union:**

- Purpose: Typed auth context attached to `req.principal` by `AuthGuard`
- File: `apps/api/src/contexts/identity/domain/principal.ts`
- Pattern: `{ kind: 'operator', userId, email, tenantId?, baseRole? }` | `{ kind: 'customer', userId, phone, tenantId }` | `{ kind: 'anonymous' }`

**`runDeduped` (inbox dedup):**

- Purpose: At-most-once handler invocation for event consumers; inserts inbox marker and runs handler in the same DB transaction
- File: `packages/events/src/inbox/run-deduped.ts` (note: file is `run-deduped.ts`, not `run-duped.ts`)
- Pattern: `await runDeduped(db, envelope, 'consumer-name', async (tx) => { /* side effects */ })`

## Entry Points

**`apps/api` (NestJS HTTP + event loop):**

- Location: `apps/api/src/main.ts`
- Triggers: Process start (Docker / k8s Pod)
- Responsibilities: `bootstrap-telemetry` import first (OTel patches Node built-ins before anything else loads); `loadEnv()`; six boot-time preflight assertions (`assertNoRlsBypass`, `assertTenantLockInstalled`, `assertSetConfigRevoked`, `assertBrandRlsInstalled`, `assertNoBaCredentialAccess`, `assertInboxProcessedDeletable`) plus two pure code-vs-code checks (`assertWithoutTenantCallsiteRegistered`, `assertSystemRolesPresent`); two-pass `assertProdGuardrails` (env-only, then wired-adapter); `registerSecurity()` (helmet → CORS → rate-limit plugin → `RateLimitGuard`); `applyOpenApi`; `app.listen`

**`apps/admin` (Vite SPA):**

- Location: `apps/admin/src/main.tsx`
- Triggers: Browser load; `createRouter` from `@tanstack/react-router` mounts the route tree built from `src/routes/`
- Responsibilities: Auth-gated dashboard; brand resolved from the `$brandSlug` URL segment (never a cookie); all API calls through `apiFetch` in `src/lib/api-client.ts`

**`apps/qr-menu` (Vite SPA):**

- Location: `apps/qr-menu/src/main.tsx`
- Triggers: Browser load from `<slug>.menu.resto.app`
- Responsibilities: Fetch and render published menu; client-side routing between menu list and item detail

**`apps/website` (Next.js):**

- Location: `apps/website/app/`
- Triggers: Next.js App Router render, host-based tenant resolution
- Responsibilities: Multi-tenant marketing site + guest checkout entry; shares the `@resto/cart` client-side cart store with `qr-menu`

## Architectural Constraints

- **RLS triple-enforcement:** Every query on a tenant-scoped table MUST go through `ScopedTx` (application layer) AND Postgres RLS (tenant policy, and brand/location policy where applicable). RLS alone is not sufficient.
- **`runInTenantContext` is HTTP-middleware-only:** NATS subscribers, the outbox dispatcher, and background jobs MUST use `db.withTenant(...)` / `db.withTenantId(...)` / `db.withoutTenant(reason, ...)`, never `runInTenantContext` directly.
- **`withTenantId` refuses to run inside an ALS-bound context** — enforced at runtime in `client.ts`, not just by convention; it throws if `getTenantContext()` is already set, catching a mis-routed caller immediately.
- **Composite FK on every tenant-scoped child table:** `FOREIGN KEY (parent_id, tenant_id) REFERENCES parent(id, tenant_id)`.
- **`correlationId` derives from the active OTel span:** direct `randomUUID()` is forbidden and is an ESLint `no-restricted-syntax` error (`packages/config-eslint/base.mjs`, `FORBIDDEN_CORRELATION_ID_LITERALS`), not just a convention.
- **Hard deletes are forbidden:** `resto_app` has no DELETE privilege; soft-delete via `archived_at` / `status = 'archived'` is the rule (`ScopedTx` has no `deleteFrom` method as a compile-time reinforcement).
- **`INTERNAL_API_TOKEN` is server-only.**
- **`withoutTenant` requires a non-empty reason string**, logged at WARN.
- **No raw SQL outside `packages/db`.**
- **Session-pinned brand/location are authoritative; client-echoed headers are hints.** `x-brand-slug` / `x-location-id` only seed the ALS binding for the query itself; `BrandScopeGuard` / `LocationScopeGuard` always reconcile against `req.activeBrandId` / `req.activeLocationId`, which come from the BA session, not the header.
- **Ordering and payments are transactionally coupled** — see Pattern Overview. Do not attempt to "clean up" this coupling without a dedicated design pass; refund/cancel correctness depends on it.

## Anti-Patterns

### Adding a controller with `@BrandNeutral()` alone when it also needs `@LocationNeutral()` — or vice versa, assuming they're independent

**What happens:** A new route is marked `@BrandNeutral()` (correctly, because it's a cross-brand route) but the author also adds `@LocationNeutral()` "to be safe," or worse, adds neither because they assume brand-neutral doesn't imply location-neutral.
**Why it's wrong:** `LocationScopeGuard` already honors `BRAND_NEUTRAL_KEY` as an opt-out (in addition to its own `LOCATION_NEUTRAL_KEY`) — this was a deliberate fix for the 16-controller gap described in the Guard Chain section above. Adding a redundant `@LocationNeutral()` is harmless but signals the author doesn't know the guard already covers it; omitting `@BrandNeutral()` on a genuinely cross-brand route causes the same class of 403-before-owner-bypass bug that broke guest checkout in phase 08.4.
**Do this instead:** Reach for `@BrandNeutral()` first for any route that legitimately spans brands (signup, internal bootstrap, health, `/me`, guest-facing routes resolved by host rather than brand slug). Add `@LocationNeutral()` alone only when the route IS brand-scoped but should NOT be location-scoped (e.g., a brand-wide settings page).

### Calling `runInTenantContext` outside HTTP middleware

**What happens:** A NATS subscriber or background job calls `runInTenantContext(ctx, ...)` directly.
**Why it's wrong:** Designed for the single synchronous middleware chain per request; in async event-driven code it can bind the wrong tenant across concurrent handlers.
**Do this instead:** `db.withTenantId(tenantId, async (tx, scoped) => {...})` inside event handlers — see `apps/api/src/contexts/audit/infrastructure/nats-audit-subscriber.ts` for the `runDeduped` pattern.

### Skipping `ScopedTx` and querying tenant-scoped tables via the raw `tx`

**What happens:** A repository calls `tx.select().from(menuCategories)` without an explicit `eq(table.tenantId, ...)`, relying solely on RLS.
**Why it's wrong:** RLS is the safety net, not the fence. Application-layer filter is mandatory.
**Do this instead:** `scoped.selectFrom(menuCategories, extraWhere)` — `ScopedTx` auto-injects the tenant predicate.

## Error Handling

**Strategy:** All exceptions converge at `ProblemDetailsFilter` (`apps/api/src/shared/exception.filter.ts`), emitting RFC 7807 `application/problem+json`. 5xx `detail` is redacted from the response body; full detail is available only in logs, correlated by `correlationId` + `traceId`.

**Patterns:**

- Domain errors are typed classes extending `Error` (e.g. `TenantAlreadyArchivedError`, `RefundProviderFailedError`), thrown in the domain layer
- Each context's `interfaces/http/error-mapping.ts` translates domain errors → NestJS HTTP exceptions
- `wrapWith(mapError)` (`apps/api/src/shared/api/wrap.ts`) is the standard try/catch wrapper: `const wrap = wrapWith(mapOrderError); ... await wrap(() => service.execute(input))`

## Cross-Cutting Concerns

**Logging:** Pino via NestJS `Logger`. Class-level `private readonly logger = new Logger(ClassName.name)`, structured object-first calls. Redacts `password`, `token`, `email`, `phone`, `params` (`packages/db/src/logger.ts`).

**Validation:** Zod at every boundary — env schema (`apps/api/src/config/env.schema.ts`), HTTP DTOs via `nestjs-zod` + `RestoZodValidationPipe` (applied per-parameter, not globally — the esbuild/tsx/vitest transpiler doesn't emit `design:paramtypes`), event envelopes, domain value objects.

**Authentication:** Better Auth (email+password, organization plugin, 2FA TOTP, bearer). BA uses the `resto_auth` role on `BETTER_AUTH_DATABASE_URL` — **NOBYPASSRLS with explicit permissive policies** (migration 0054), not `BYPASSRLS`. Session cookies are cross-subdomain when `AUTH_COOKIE_DOMAIN=.resto.app`.

**Observability:** OpenTelemetry bootstrapped before any module load (`apps/api/src/bootstrap-telemetry.ts`). `OutboxDispatcherService` exposes delivered-counter/lag-histogram/claim-failure metrics. `ProblemDetailsFilter` attaches `traceId` to every error response.

**Rate limiting:** `RateLimitGuard` (in the global guard chain, position 6) plus a separate Fastify `preHandler` hook for `/api/auth/*` routes (which bypass NestJS entirely) with per-endpoint caps (`RATE_LIMIT_AUTH_SIGNUP_PER_MIN`, `RATE_LIMIT_AUTH_SIGNIN_PER_MIN`, etc.) and a per-tenant + per-email nested bucket for sign-in/reset (`apps/api/src/shared/security.ts`, `apps/api/src/middleware/per-tenant-signin-rate-limit.ts`).

---

_Architecture analysis: 2026-08-18_
