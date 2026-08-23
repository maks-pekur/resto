<!-- GSD:project-start source:PROJECT.md -->

## Project

**RestOS**

RestOS is a multi-tenant SaaS for restaurants. One subscription gives a restaurant a "turnkey digital presence": guests order via QR-menu, public site, and (post-MVP) mobile / Telegram; staff work in dedicated surfaces; everything is administered from one operator panel. One SaaS customer = one restaurant company (Tenant) with internal `Brand → Location → Menu / Zones / Staff` hierarchy. RestOS owns the core (orders, menu, customers, loyalty, marketing); third-party POS systems are optional adapter integrations, never a prerequisite.

The canonical product specification is `SPEC.md` (Russian, kept as source-of-truth for product surface area). This document captures planning context, decisions, and scope boundaries — not duplicated product detail.

**Core Value:** A restaurant can publish its digital presence (menu, brand, locations) and start accepting paid orders from guests via web — without integrating any external POS or hiring a developer.

If everything else fails (no mobile, no loyalty, no marketing automation, no advanced analytics, no Telegram, no Staff app), this one capability still delivers value: a restaurant goes from "no digital presence" to "guests place paid orders that I can fulfill" inside RestOS alone.

### Constraints

- **Tech stack**: TypeScript end-to-end, NestJS modular monolith on the backend, Next.js 15 RSC for admin and (planned) website, Vite+React for qr-menu, Postgres+RLS, NATS JetStream, Redis, S3 — locked. Stack decisions inherited from the existing codebase; revisit only if a phase has a documented blocker.
- **Multi-tenancy**: Every tenant-scoped query MUST go through `ScopedTx` AND Postgres RLS — RLS alone is not sufficient. Composite FK on every child table. Hard deletes forbidden. Origin: CTO + skeptic lens, "what breaks tenancy if a dev forgets `tenant_id`?"
- **Compliance**: GDPR (EU) — full erasure pipeline with 30-day cool-off, anonymization via `AUDIT_ERASURE_SALT`, audit log of all PII touches. PCI never directly touched (Stripe Connect tokenizes everything). Fiscal compliance per market is a deferred problem (skeptic lens: do not build EU-wide fiscalization adapter in MVP).
- **Performance**: Public menu reads MUST stay fast on cold Redis (degraded mode is acceptable but must not crash). Peak load assumption: Friday-evening simultaneous order spikes across many tenants — no per-tenant noisy-neighbor patterns allowed.
- **Team**: Solo founder on the 12-month roadmap horizon. Phase sizing accommodates solo throughput (no parallel multi-developer assumptions). Persona reviews substitute for the missing co-founder/tech-lead second opinion.
- **Timeline / monetization milestone**: First paying customer target Q1 2027 (~7–9 months from 2026-05-24). MVP-1 (Phases 1–7) is the bar for "can take a customer's money."
- **Budget**: Bootstrap; infra cost-sensitivity matters. Prefer managed services that scale to zero (R2 over S3 if neutral, NATS over Kafka, self-hosted Better Auth over Auth0).
- **`.planning/` is committed**: planning artifacts are durable, version-controlled, and reviewed. Decision log lives in `## Key Decisions` below + phase artifacts, NOT in a separate ADR directory.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- TypeScript 6.0.3 — all packages and apps
- SQL — Drizzle-generated migrations + hand-written RLS/DDL in `packages/db/migrations/` and `packages/db/sql/`
- CSS (Tailwind 4) — `apps/admin/` and `apps/qr-menu/`

## Runtime

- Node.js >= 22.22.1 (enforced in `package.json` `engines` field)
- pnpm 9.15.0 (exact, enforced via `packageManager` field)
- Lockfile: `pnpm-lock.yaml` present, committed

## Monorepo Orchestration

- Nx 22.7.2 — task runner, affected-graph computation, caching (`nx.json`)
- Workspace defined by `pnpm-workspace.yaml` covering `apps/*`, `packages/*`, `tools/*`
- Parallel task limit: 3 (`nx.json` `"parallel": 3`)

## Frameworks

- NestJS 10.4.15 — modular DDD monolith (`@nestjs/common`, `@nestjs/core`)
- Fastify 4.28.1 via `@nestjs/platform-fastify` — HTTP transport
- `nestjs-zod` 5.3.0 — Zod-native DTO validation inside NestJS
- `@nestjs/swagger` 8.1.0 — OpenAPI spec generation
- Next.js 16.2.6 (App Router, RSC, typed routes)
- React 19.0.0
- Tailwind CSS 4 via `@tailwindcss/postcss`
- shadcn/ui (`new-york` variant, `neutral` palette) on top of `radix-ui` 1.4.3
- `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`
- Vite 5.4.11 — no SSR, mobile-optimised SPA
- React 18.3.1
- Vitest 2.1.8 — unit and integration tests

## Key Dependencies

- `better-auth` ~1.4.22 — email+password, org/RBAC, 2FA (TOTP), bearer tokens; runs in-process inside `apps/api` (no separate IdP container)
- `drizzle-orm` ^0.45.2 — used in `apps/api`, `packages/db`, `packages/events`
- `drizzle-kit` ^0.31.10 — migration generation (`pnpm db:generate`)
- `postgres` (postgres.js) ^3.4.5 — low-level Postgres driver
- `nats` ^2.29.1 (JetStream) — in `packages/events`; publisher and subscriber adapters in `packages/events/src/infrastructure/`
- `ioredis` ^5.4.2 — catalog menu cache in `apps/api`; optional (`REDIS_URL` absent = cache disabled)
- `@aws-sdk/client-s3` ^3.1053.0 and `@aws-sdk/s3-request-presigner` ^3.1053.0 — S3-compatible presigned URLs; MinIO locally, AWS S3 / Cloudflare R2 in production
- `@opentelemetry/sdk-node` ^0.57.0 + `@opentelemetry/auto-instrumentations-node` ^0.55.0 — bootstrapped before NestJS in `apps/api/src/bootstrap-telemetry.ts`
- `@opentelemetry/exporter-trace-otlp-http` ^0.57.0 — exports to OTLP endpoint (Jaeger in dev)
- `pino` ^9.5.0 — structured JSON logger in `apps/api` and `packages/db`
- `zod` ^3.24.1 — env schemas, event contracts, domain schemas, DTO shapes (universal across all packages)
- `rxjs` ^7.8.1 — NestJS observable internals
- `openapi-typescript` — codegen for `packages/api-client/src/generated/api.ts` from committed `docs/api/openapi.yaml`
- `yaml` ^2.6.1 — YAML emit for the OpenAPI artifact
- `tsx` ^4.19.2 — TypeScript script runner (seed CLI, erase-tenant CLI, migration CLI)
- `esbuild` ^0.28.0 — production bundler for `apps/api`
- `husky` ^9.1.7 + `lint-staged` ^17.0.2 — pre-commit hooks
- `@commitlint/cli` ^21.0.1 — conventional commit enforcement

## Configuration

- All env vars for `apps/api` declared and validated by Zod in `apps/api/src/config/env.schema.ts`
- `loadEnv()` called at boot; missing required vars throw `EnvValidationError` before any controller mounts
- Non-dev required vars: `BETTER_AUTH_SECRET`, `BETTER_AUTH_BASE_URL`, `BETTER_AUTH_DATABASE_URL`, `ADMIN_WEB_URL`, `AUTH_COOKIE_DOMAIN`, `AUDIT_ERASURE_SALT`, `TRUST_PROXY`, `INTERNAL_API_TOKEN`
- S3 dev defaults guarded by `assertProdGuardrails` at boot (ADR-0020 I-3) — rejects dev-fallback values outside `development`/`test`
- `.env` file not committed; `.env.example` documents shape
- `tsconfig.base.json` — monorepo root TypeScript config; strict mode with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` (NestJS: relaxed on `exactOptionalPropertyTypes`)
- Per-package `tsconfig.json` extending shared presets from `packages/config-typescript/`
- ESLint flat-config via `packages/config-eslint/`; root `eslint.config.mjs`
- Prettier ^3.4.2 for formatting

## Platform Requirements

- Docker (Docker Desktop or colima) for the dev stack: Postgres 16, Redis 7, NATS 2.10, MinIO, MailHog, Jaeger
- `pnpm dev:up` starts all containers via `infra/docker/docker-compose.dev.yml`
- Target: AWS EKS (ADR-0011); Terraform in `infra/terraform/` (stub), Helm charts in `infra/k8s/` (stub)
- Migrations run as a Kubernetes Job before app rollout (`pnpm db:migrate`)
- Secrets injected at runtime via Vault / AWS Secrets Manager — never in image or env files
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- Kebab-case for all source files: `provision-tenant.service.ts`, `tenant-drizzle.repository.ts`, `error-mapping.ts`
- Suffix conventions are strict: `.service.ts`, `.repository.ts`, `.controller.ts`, `.module.ts`, `.middleware.ts`, `.guard.ts`, `.pipe.ts`, `.adapter.ts`, `.decorator.ts`, `.spec.ts`
- Event contract files follow bounded-context name: `tenancy.ts`, `identity.ts`
- Schema files in `packages/domain` are kebab-case entity names: `menu-item.ts`, `tenant.ts`
- PascalCase throughout
- NestJS providers: `ProvisionTenantService`, `TenantDrizzleRepository`, `TenantsController`
- Aggregates: `Tenant`, `Brand` (no suffix)
- Errors: `TenantNotFoundError`, `TenantSlugTakenError` (always `Error` suffix)
- Ports/interfaces: `TenantRepository`, `StripeConnectPort` (no `I` prefix)
- DTOs: `ProvisionTenantInputDto` (schema → `ProvisionTenantInputSchema`, type → `ProvisionTenantInput`, class → `ProvisionTenantInputDto`)
- Adapters: `TenantDrizzleRepository`, `NoopStripeConnectAdapter`, `NatsJetStreamPublisher`
- `SCREAMING_SNAKE_CASE` for DI tokens: `TENANT_REPOSITORY`, `STRIPE_CONNECT_PORT`, `BRAND_REPOSITORY`, `CATALOG_REPOSITORY`
- Declared in `domain/ports.ts` alongside the interface
- camelCase for standalone functions and methods
- Repository methods: `findById`, `findBySlug`, `findByDomainHost`, `save`, `listDomains`
- Service entry point: always `.execute(input)` — single public method
- camelCase; private class fields use `#` (native private): `readonly #events: TenantDomainEvent[]`
- `_` prefix for intentionally unused function parameters: `_res`, `_tx`
- Schema: `MoneyAmountValue`, `MoneyAmount`, `Currency`, `CurrencyValue`
- Branded vs. unbranded pairs: `FooValue` (unbranded, use at HTTP boundary) / `Foo` (branded, use inside domain)
- Type always derived: `export type Foo = z.infer<typeof Foo>`

## Code Style

- Single quotes for strings
- Trailing commas everywhere (arrays, objects, parameters)
- Semicolons required
- Print width: 100 chars
- Tab width: 2 spaces, no tabs
- `arrowParens: always`
- LF line endings
- Strict mode + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` (except Next.js app — incompatible with Radix prop spreads)
- `verbatimModuleSyntax: false` (allows type-only imports without `import type` enforcement from tsc, but ESLint enforces it separately)
- Target: ES2022, module: ESNext, moduleResolution: Bundler
- `@typescript-eslint/consistent-type-imports: prefer type-imports` — enforced via ESLint
- `@typescript-eslint/no-floating-promises: error` — all Promises must be awaited or explicitly voided
- `@typescript-eslint/no-non-null-assertion: error` — no `!` assertions
- `no-console: warn` (allow `warn`/`error`) — use `Logger` from NestJS instead
- `eqeqeq: error` — always `===`, except `null` comparisons

## Import Organization

- `import { type Foo }` inline syntax preferred (enforced by `consistent-type-imports` rule)
- `import type { Foo }` also acceptable (same rule allows both forms)
- No `@/` aliases in API (`apps/api`) — uses relative paths
- `@/` alias used in Next.js admin app (`apps/admin`)
- Monorepo packages accessed via `@resto/<name>` (e.g. `@resto/db`, `@resto/domain`, `@resto/events`)

## DTO / Schema Pattern

- Zod schemas are the single source of truth; TypeScript types are ALWAYS derived via `z.infer`
- Never write `type Foo = { ... }` separately from a Zod schema
- HTTP-boundary schemas use unbranded value types (`CurrencyValue`, `MoneyAmountValue`) so `nestjs-zod` emits `type: string` for OpenAPI
- Domain internals use branded types (`Currency`, `MoneyAmount`) to prevent cross-type misuse

## DI and Module Pattern (NestJS)

- Repositories and ports are always injected by Symbol token, not by class
- Application services depend on port interfaces, never on concrete infrastructure classes
- Each bounded context owns a `*.module.ts` at its root that wires all internal providers
- All services are `@Injectable()` with a single `execute(input)` public method

## Error Handling

- Plain `Error` subclasses defined in `domain/errors.ts` per bounded context
- Constructor sets `this.name` explicitly (for stack trace readability)
- No error codes or HTTP status in domain errors
- Each controller has a corresponding `error-mapping.ts` with a `mapDomainError(err)` function
- Function maps domain errors to NestJS `HttpException` subclasses (never maps `unknown` — returns it unchanged)
- Controllers wrap every handler body in `try/catch` and call `mapDomainError`:
- Alternatively, the `wrapWith(mapper)` helper is used in internal controllers:
- `ProblemDetailsFilter` (`apps/api/src/shared/exception.filter.ts`) catches all unhandled exceptions
- Outputs RFC 7807 `application/problem+json`
- 5xx responses redact `detail` to prevent DB/schema leak (RES-175)
- Error `code` string maps to a stable `type` URI: `https://resto.app/problems/<code>`
- Structured log: `error` level for 5xx, `warn` for 4xx

## Logging

- Class-level logger declared as `private readonly logger = new Logger(ClassName.name)`
- Structured logging — pass an object as first arg: `this.logger.log({ slug, tenantId }, 'Message.')`
- Use `logger.log` for normal operations, `logger.warn` for degraded-but-ok, `logger.error` for failures
- Never log secrets; `packages/db/src/logger.ts` has a `redact` config covering `password`, `token`, `email`, `phone`, `params`
- `no-console: warn` ESLint rule — use Logger, not `console.log`

## Comments

- WHY-comments only when there is a hidden constraint, invariant reference, or counterintuitive workaround
- Link to ADR number or ticket ID for non-obvious decisions: `// ADR-0020 I-1`, `// RES-175`
- No descriptive comments that merely restate what the code does
- Used on public interfaces and key abstractions in `packages/`
- Not required on every method — only when the contract is non-obvious

## Tenancy Enforcement Pattern

## Event Publishing Pattern

## Validation

- `RestoZodValidationPipe` is applied **per-parameter** at the controller, not globally
- Reason: `esbuild`/`tsx`/`vitest` transpiler doesn't emit `design:paramtypes` metadata required for global pipe
- Usage: `@Body(new RestoZodValidationPipe(SomeDto)) input: SomeDto`
- Validation errors produce `BadRequestException({ code: 'validation.failed', message: '...' })`

## Module Boundary Rules (ESLint / Nx)

- Apps never import from other apps
- Apps import only from `@resto/*` packages (scope:shared)
- `packages/domain` has zero infrastructure imports — no `@nestjs/*`, `drizzle-orm`, `pg`
- `packages/db` is the only place raw SQL and Drizzle schema live
- Package public API is exclusively `src/index.ts` — never import from sub-paths
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

```text

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

- Each bounded context (`tenancy`, `identity`, `catalog`, `audit`) follows a strict 4-layer layout: `domain/` → `application/` → `infrastructure/` → `interfaces/`
- Domain layer is pure TypeScript (no NestJS, no Drizzle, no framework imports)
- Application services depend only on port interfaces (`Symbol`-keyed), never on concrete adapters
- Infrastructure adapters implement domain ports; NestJS DI wires them at module composition time
- Multi-tenant isolation is double-enforced: `ScopedTx` (application layer) + Postgres RLS (database layer)

## Layers

- Purpose: Business rules, aggregate roots, domain events, port interfaces
- Location: `apps/api/src/contexts/<ctx>/domain/`
- Contains: Aggregate classes (e.g. `Tenant`, `Brand`), domain error classes, port interface definitions, Zod schemas for value objects
- Depends on: Only `@resto/domain` (shared business types), `zod`
- Used by: Application layer only
- Purpose: Use-case orchestration; coordinates aggregates and ports
- Location: `apps/api/src/contexts/<ctx>/application/`
- Contains: `*.service.ts` files (one per use-case), `dto.ts` (Zod-validated DTOs), `ports/` (sub-interfaces needed by app layer)
- Depends on: `domain/` ports (injected via Symbol tokens), `@resto/db`, `@resto/domain`
- Used by: `interfaces/` layer
- Purpose: Concrete implementations of domain ports
- Location: `apps/api/src/contexts/<ctx>/infrastructure/`
- Contains: Drizzle repositories (`*-drizzle.repository.ts`), external adapters (`stripe-connect.adapter.ts`, `redis-catalog-cache.adapter.ts`, `s3-signed-image-url.adapter.ts`, `better-auth/`)
- Depends on: `@resto/db`, `@resto/events`, external SDKs
- Used by: NestJS module wiring only
- Purpose: HTTP delivery — controllers, guards, decorators, error mapping
- Location: `apps/api/src/contexts/<ctx>/interfaces/http/`
- Contains: `*.controller.ts`, guards (`auth.guard.ts`, `permissions.guard.ts`), decorators, `error-mapping.ts` (domain error → HTTP exception)
- Depends on: Application services (injected), shared decorators
- Used by: NestJS router
- Purpose: Cross-cutting infrastructure shared by all bounded contexts
- Location: `apps/api/src/shared/`
- Contains: `TenantContextMiddleware`, `CorrelationMiddleware`, `ProblemDetailsFilter`, `AuthGuard`, `InternalTokenGuard`, `RateLimitGuard`, decorator definitions

## Data Flow

### Public Menu Read (qr-menu customer)

### Operator Authenticated Request (admin panel)

### Domain Event Publication (transactional outbox)

- Tenant context propagated per-request via `AsyncLocalStorage<TenantContext>` (`packages/db/src/context.ts`)
- `correlationId` propagated via separate ALS frame (`packages/events/src/correlation.ts`)
- No global mutable state in application code

## Key Abstractions

- Purpose: Encapsulate state transitions and emit strongly-typed domain events
- Examples: `apps/api/src/contexts/tenancy/domain/tenant.aggregate.ts`, `apps/api/src/contexts/tenancy/domain/brand.aggregate.ts`
- Pattern: Snapshot-based reconstruction (`fromSnapshot`), private constructor, `pullEvents()` drains events after save
- Purpose: Dependency inversion between application and infrastructure layers
- Examples: `TENANT_REPOSITORY`, `CATALOG_REPOSITORY`, `CATALOG_CACHE_PORT`, `IMAGE_URL_PORT`, `STRIPE_CONNECT_PORT`, `EVENT_PUBLISHER`
- Pattern: `export const FOO_PORT = Symbol('FOO_PORT')` paired with `export interface FooPort { ... }` in `domain/ports.ts` or `application/ports/*.ts`
- Purpose: Enforce tenant isolation at every DB call; `ScopedTx` auto-injects `tenantId` on INSERT, auto-appends `eq(table.tenantId, ...)` on SELECT/UPDATE; blocks DELETE
- File: `packages/db/src/client.ts`
- Pattern: `db.withTenant((tx, scoped) => scoped.selectFrom(menuCategories))` — caller never writes `WHERE tenant_id = ?` manually
- Purpose: Typed event wire format; versioned by `<context>.<event>.v<n>` subject pattern
- Files: `packages/events/src/envelope.ts`, `packages/events/src/contracts/tenancy.ts`, `packages/events/src/contracts/identity.ts`
- Pattern: `defineEventContract({ type: 'tenancy.tenant_provisioned.v1', payload: PayloadZodSchema })`
- Purpose: Typed auth context attached to `req.principal` by `AuthGuard`
- File: `apps/api/src/contexts/identity/domain/principal.ts`
- Pattern: `{ kind: 'operator', userId, email, tenantId?, baseRole? }` | `{ kind: 'customer', ... }` | `{ kind: 'anonymous' }`
- Purpose: At-most-once handler invocation for event consumers; inserts inbox marker and runs handler in same DB transaction
- File: `packages/events/src/inbox/run-duped.ts`
- Pattern: `await runDeduped(db, envelope, 'consumer-name', async (tx) => { /* side effects */ })`

## Entry Points

- Location: `apps/api/src/main.ts`
- Triggers: Process start (Docker / k8s Pod)
- Responsibilities: Load + validate env (`loadEnv`), preflight RLS assertions (`assertNoRlsBypass`, `assertTenantLockInstalled`, `assertSetConfigRevoked`), create Fastify adapter, apply OpenAPI, start `OutboxDispatcherService`
- Location: `apps/admin/app/layout.tsx`, `apps/admin/app/page.tsx`
- Triggers: Next.js App Router render
- Responsibilities: Auth-gated dashboard UI; calls api exclusively via `apps/admin/lib/api-server.ts:apiFetch`
- Location: `apps/qr-menu/src/main.tsx`
- Triggers: Browser load from `<slug>.menu.resto.app`
- Responsibilities: Fetch and render published menu; client-side routing between menu list and item detail

## Architectural Constraints

- **RLS double-enforcement:** Every query on a tenant-scoped table MUST go through `ScopedTx` (application layer) AND Postgres RLS (db layer). RLS alone is not sufficient per ADR-0020 I-1.
- **`runInTenantContext` is HTTP-middleware-only:** NATS subscribers, outbox dispatcher, and background jobs MUST use `db.withTenant(tenantId, ...)` or `db.withoutTenant(reason, ...)`, never `runInTenantContext` (ADR-0020 I-6).
- **Composite FK on every tenant-scoped child table:** Child tables carrying `tenant_id` + a parent `*_id` MUST declare `FOREIGN KEY (parent_id, tenant_id) REFERENCES parent(id, tenant_id)` (ADR-0020 I-2).
- **`correlationId` derives from OTel span:** Direct `randomUUID()` for `correlationId` in outbox envelopes is forbidden; use `buildEnvelope` helper (ADR-0020 I-4).
- **Hard deletes are forbidden:** `resto_app` Postgres role has no DELETE privilege. Soft-delete via `archived_at` / `status = 'archived'` is the rule.
- **`INTERNAL_API_TOKEN` is server-only:** Never imported into a client component or exposed in a `NEXT_PUBLIC_*` var.
- **`withoutTenant` requires non-empty reason string:** Every bypass is logged at WARN with the reason for auditability.
- **No raw SQL outside `packages/db`:** Hand-written SQL in application code bypasses the type-safety guarantees of Drizzle + `ScopedTx`.

## Anti-Patterns

### Calling `runInTenantContext` outside HTTP middleware

### Direct `EventEnvelope` literal construction with `randomUUID()` as `correlationId`

### Skipping `ScopedTx` and querying tenant-scoped tables via raw `tx`

## Error Handling

- Domain errors are typed classes extending `Error` (e.g. `TenantAlreadyArchivedError`, `MenuItemNotFoundError`), thrown in the domain layer
- Each context's `interfaces/http/error-mapping.ts` translates domain errors → NestJS HTTP exceptions (e.g. `NotFoundException`, `ConflictException`)
- `wrapWith(mapError)` factory in `apps/api/src/shared/api/wrap.ts` is the idiomatic try/catch wrapper used by controllers

## Cross-Cutting Concerns

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.

<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.

<!-- GSD:workflow-end -->

## Finishing a task

- **Commit and push are part of finishing, not a separate request.** When a task is done, commit it
  and push the branch without being asked. This overrides the "ask before `git push`" rule in
  `~/projects/CLAUDE.md` for this repo only — pushing a feature branch is cheap and reversible, and
  leaving work unpushed loses it.
- **Never merge without asking.** Opening a PR is fine; merging it into the default branch is the
  founder's call every time, no matter how green CI is. Say what is red and why, then wait.
- A task is not finished while a check that was green before your change is red after it.

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.

<!-- GSD:profile-end -->
