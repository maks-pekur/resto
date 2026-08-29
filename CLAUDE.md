<!-- GSD:project-start source:PROJECT.md -->

## Project

**RestOS**

RestOS is an **AI-driven multi-tenant SaaS for restaurants**. One subscription gives a restaurant a turnkey digital presence (public site, in-restaurant QR-menu, and — later — Telegram channel) backed by an AI layer that is present in every operator and guest interaction. One SaaS customer = one restaurant company (Tenant) with internal `Location → Menu / Zones / Staff` hierarchy — phase 10.2 removed the Brand level entirely; one restaurant is one tenant is one Better Auth organization. RestOS owns the customer-facing layer (orders, menu, customers, loyalty, marketing) + the AI layer. Third-party POS systems (iiko, r_keeper, Poster) are **partner integrations** that open a B2B GTM channel, never a technical prerequisite — a restaurant arriving without any POS gets full value standalone.

The pivot to AI-driven positioning was decided on 2026-05-27 via `/gsd-explore`. The authoritative pivot context lives in `.planning/notes/ai-driven-pivot.md`; the rollout is staged across three milestones (see "Milestone Structure" below). The canonical product specification is `SPEC.md` (Russian, kept as source-of-truth for product surface area).

**Core Value:**
A restaurant can publish its digital presence (menu, brand, locations) and start accepting paid orders from guests via web — without integrating any external POS or hiring a developer. This is the **MVP-1** bar: standalone, ship-able, billable.

The AI layer — admin assistant + guest chat + onboarding constructor — is **MVP-2**, layered on top once the standalone platform is paying. Telegram channel + iiko/POS adapters are **MVP-3**.

If everything else fails (no loyalty, no marketing automation, no advanced analytics, no AI, no Telegram, no Staff app), the MVP-1 capability still delivers value on its own: a restaurant goes from "no digital presence" to "guests place paid orders that I can fulfill" inside RestOS alone.

### Constraints

- **Tech stack**: TypeScript end-to-end, NestJS modular monolith on the backend, Vite+React SPA for admin and qr-menu, Next.js App Router for the public website, Postgres+RLS, NATS JetStream, S3 — locked. Redis was dropped: the menu cache it backed is now HTTP/CDN (`s-maxage` + `stale-while-revalidate` + ETag), and no `ioredis` dependency or Redis container remains. Stack decisions inherited from the existing codebase; revisit only if a phase has a documented blocker.
- **Multi-tenancy**: Every tenant-scoped query MUST go through `ScopedTx` AND Postgres RLS — RLS alone is not sufficient. Composite FK on every child table. Hard deletes forbidden. Origin: CTO + skeptic lens, "what breaks tenancy if a dev forgets `tenant_id`?"
- **Compliance**: GDPR (EU) — full erasure pipeline with 30-day cool-off, anonymization via `AUDIT_ERASURE_SALT`, audit log of all PII touches. PCI never directly touched (Stripe Connect tokenizes everything). Fiscal compliance per market is a deferred problem (skeptic lens: do not build EU-wide fiscalization adapter in MVP).
- **Performance**: Public menu reads MUST stay fast on a cold cache — a CDN miss goes straight to Postgres and must serve correctly, never crash. Cache headers are set in `apps/api/src/contexts/catalog/domain/menu-cache.ts`. Peak load assumption: Friday-evening simultaneous order spikes across many tenants — no per-tenant noisy-neighbor patterns allowed.
- **Team**: Solo founder on the 12-month roadmap horizon. Phase sizing accommodates solo throughput (no parallel multi-developer assumptions). Persona reviews substitute for the missing co-founder/tech-lead second opinion.
- **Timeline / monetization milestone**: First paying customer target Q1 2027 (~7–9 months from 2026-05-27). MVP-1 (all phases under the MVP-1 milestone in ROADMAP.md) is the bar for "can take a customer's money." MVP-2 (AI tier) targets Q2–Q3 2027; MVP-3 (Telegram + iiko) Q4 2027+. AI-driven marketing without AI in MVP-1 is a known positioning risk — re-tested at MVP-1 close.
- **Budget**: Bootstrap; infra cost-sensitivity matters. Prefer managed services that scale to zero (R2 over S3 if neutral, NATS over Kafka, self-hosted Better Auth over Auth0).
- **`.planning/` is committed**: planning artifacts are durable, version-controlled, and reviewed. Decision log lives in `## Key Decisions` below + phase artifacts, NOT in a separate ADR directory.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

**Analysis Date:** 2026-08-18

## Languages

**Primary:**

- TypeScript 6.0.3 — all packages and apps (`package.json` root `devDependencies.typescript`)
- SQL — Drizzle-generated migrations + hand-written RLS/DDL in `packages/db/migrations/` (78 files, current head `0077_tenancy_erase_payment_refunds.sql`) and `packages/db/sql/`

**Secondary:**

- CSS (Tailwind 4) — `apps/admin/`, `apps/qr-menu/`, `apps/website/`, shared preset in `packages/config-tailwind/`

## Runtime

**Environment:**

- Node.js >= 22.22.1 (enforced in root `package.json` `engines` field)

**Package Manager:**

- pnpm 9.15.0 (exact, enforced via `packageManager` field; `engines.pnpm: "~9.15.0"`)
- Lockfile: `pnpm-lock.yaml` present, committed

## Monorepo Orchestration

- Nx 22.7.2 — task runner, affected-graph computation, caching (`nx.json`)
- Workspace defined by `pnpm-workspace.yaml` covering `apps/*`, `packages/*`, `tools/*`
- Parallel task limit: 3 (`nx.json` `"parallel": 3`)
- Every app/package has its own `project.json` declaring `build`/`lint`/`typecheck`/`test`/`serve` targets as `nx:run-commands` wrappers (no custom Nx executors)

## Frameworks

**Backend (`apps/api`):**

- NestJS ^10.4.15 — modular DDD monolith (`@nestjs/common`, `@nestjs/core`)
- Fastify 4.28.1 via `@nestjs/platform-fastify` — HTTP transport
- `nestjs-zod` ^5.3.0 — Zod-native DTO validation inside NestJS
- `@nestjs/swagger` ^8.1.0 — OpenAPI spec generation
- `@nestjs/schedule` `=4.1.2` (pinned exact) — cron-style schedulers for retention/erasure jobs (`apps/api/src/infrastructure/jobs/`, `tenant-erasure-scheduler.service.ts`, `inbox-retention.service.ts`)

**Admin UI (`apps/admin`) — MIGRATED from Next.js to a Vite SPA (phase 07.6):**

- Vite ^5.4.21 + React ^19.0.0 + TanStack Router ^1.170.16 (file-based routes under `apps/admin/src/routes/`) + TanStack Query ^5.101.0
- `@resto/admin` description in `package.json` explicitly states: "Operator admin UI — Vite + React + TanStack Router + shadcn/ui (ADR-0016)"
- Tailwind CSS 4 via `@tailwindcss/vite` (not `@tailwindcss/postcss` — that's the Next-era plugin, no longer used here)
- shadcn/ui on top of `radix-ui` ^1.4.3; `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`
- `i18next` + `react-i18next` + `i18next-browser-languagedetector` — ru/en locale catalogs
- `@dnd-kit/*` — drag-and-drop menu category reorder
- `react-hook-form` + `@hookform/resolvers` — forms
- `@stripe/connect-js` + `@stripe/react-connect-js` — embedded Stripe Connect onboarding UI
- `@sentry/react` + `@sentry/vite-plugin` — error tracking + source-map upload
- `@playwright/test` ^1.60.0 — e2e (`apps/admin/e2e` presumed; `pnpm e2e`)
- **Leftover dead code:** an untracked `apps/admin/app/` directory survives from the pre-migration Next.js App Router tree. It is not part of the build (Vite entry is `apps/admin/index.html` → `src/`) and should be ignored/deleted, not treated as live source.
- **Dev server port drift:** `apps/admin/vite.config.ts` sets `server.port: 4000` (proxies `/api` and `/v1` to `http://localhost:5001`) — this is the port referenced everywhere else (`CORS_ALLOWED_ORIGINS` default, `apps/admin/src/env.ts` dev default). However `apps/admin/package.json`'s `dev` script still reads `"vite --port 3001"`, a stale flag left over from before commit `890f7f84` ("chore(admin): default dev ports to api 5001 / admin 4000") retargeted the config file but not the script. A CLI `--port` flag overrides `vite.config.ts`, so running `pnpm --filter admin dev` directly still launches on `:3001`; Nx's `serve` target (`apps/admin/project.json`, bare `vite` command with no `--port`) correctly launches on `:4000`. Treat `:4000` as canonical.

**Website (`apps/website`) — Next.js, unchanged framework, still App Router/RSC:**

- Next.js ^16.2.9 (App Router, RSC), React ^19.0.0
- `next-intl` — locale routing; `next-themes`; `zustand` — client cart/UI state
- `@stripe/stripe-js` + `@stripe/react-stripe-js` — guest checkout Payment Element (`apps/website/components/checkout/checkout-form.tsx`, `payment-element.tsx`)
- `@sentry/nextjs` — error tracking
- Dev port: `next dev --port 3002` (`apps/website/package.json`, `project.json`)

**QR Menu (`apps/qr-menu`):**

- Vite ^5.4.11 — no SSR, mobile-optimised SPA
- React ^19.0.0 (bumped from the 18.x this doc previously recorded — root `pnpm.overrides` pins `@types/react`/`@types/react-dom` to `^19.0.0` and `apps/qr-menu/package.json` depends on `react@^19.0.0`)
- Consumes `@resto/api-client`, `@resto/cart` (shared Zustand cart store), `@resto/config-tailwind`
- Dev port: `3003` (`apps/qr-menu/vite.config.ts`); dev proxy for `/v1` and `/internal` still points at `http://localhost:3000` in a stale comment/config — the live api dev port is `5001` (`API_PORT` default in `env.schema.ts`), so this proxy target is itself drifted and needs updating, not a fact to copy forward as current truth

**Testing (all packages/apps):**

- Vitest ^2.1.8 — unit and integration tests, uniform across every package/app
- `@testcontainers/postgresql` + `testcontainers` — real Postgres for `apps/api` and `packages/db`/`packages/events` integration suites
- `@testing-library/react` + `@testing-library/jest-dom` + `@testing-library/user-event` + `jsdom` — component tests in `apps/admin`, `apps/qr-menu`, `apps/website`
- `@playwright/test` ^1.60.0 — `apps/admin` e2e only

## Key Dependencies

**Auth:**

- `better-auth` `=1.4.22` (pinned exact in `apps/api`; `1.4.22` — not pinned — in `apps/admin`, used only for the client SDK types/`authClient`) — email+password, org/RBAC, 2FA (TOTP), bearer tokens; runs in-process inside `apps/api` (no separate IdP container)
- `@better-auth/cli` `=1.4.22`, `@better-auth/utils` `=0.3.0` — devDependencies for schema generation

**ORM / Database:**

- `drizzle-orm` ^0.45.2 — used in `apps/api`, `packages/db`, `packages/events`
- `drizzle-kit` ^0.31.10 — migration generation (`pnpm db:generate`)
- `postgres` (postgres.js) ^3.4.5 — low-level Postgres driver

**Payments:**

- `stripe` `17.7.0` (pinned exact) — server SDK in `apps/api`, wired behind `PaymentProviderPort` (see INTEGRATIONS.md)
- `@stripe/connect-js` `3.4.6` + `@stripe/react-connect-js` `3.4.4` (admin, exact-pinned) — embedded onboarding components
- `@stripe/stripe-js` ^9.8.0 + `@stripe/react-stripe-js` ^6.6.0 (website) — guest checkout Payment Element

**Email:**

- `resend` `6.12.4` (pinned exact) — production/staging transactional email SDK
- `nodemailer` `8.0.10` (pinned exact) — SMTP client used by the dev MailHog adapter (`apps/api/src/contexts/identity/infrastructure/email/mailhog-smtp.adapter.ts`)

**Event Bus:**

- `nats` ^2.29.1 (JetStream) — in `packages/events`; publisher and subscriber adapters in `packages/events/src/infrastructure/`

**Caching:**

- **None.** `ioredis` and Redis have been removed entirely from the stack — no package depends on `ioredis`, no `redis` service exists in `infra/docker/docker-compose.dev.yml`, and `infra/docker/docker-compose.test.yml` explicitly comments "Do NOT add Redis / MinIO / MailHog / Jaeger — they are not test-path dependencies." The public menu read path now uses HTTP/CDN caching with `ETag`/`Cache-Control` headers keyed off version counters stored in Postgres (`catalog_menu_version`, `catalog_location_stop_version` tables via `apps/api/src/contexts/catalog/infrastructure/postgres-menu-version.adapter.ts`) — see ARCHITECTURE.md / INTEGRATIONS.md for the mechanism.

**Object Storage:**

- `@aws-sdk/client-s3` ^3.1053.0 and `@aws-sdk/s3-request-presigner` ^3.1053.0 — S3-compatible presigned URLs; MinIO locally, AWS S3 / Cloudflare R2 in production

**Observability:**

- `@opentelemetry/sdk-node` ^0.57.0 + `@opentelemetry/auto-instrumentations-node` ^0.55.0 — bootstrapped before NestJS in `apps/api/src/bootstrap-telemetry.ts`
- `@opentelemetry/exporter-trace-otlp-http` ^0.57.0 — exports to OTLP endpoint (Jaeger in dev)
- `@sentry/node` ^10.62.0 (api), `@sentry/react` ^10.62.0 + `@sentry/vite-plugin` ^5.3.0 (admin), `@sentry/nextjs` ^10.62.0 (website) — error tracking, gated by `SENTRY_DSN`; a no-op when absent (see INTEGRATIONS.md)
- `pino` ^9.5.0 — structured JSON logger in `apps/api` and `packages/db`

**Validation:**

- `zod` ^3.24.1 (api/db/events/domain), `^3.25.76` (admin/website) — env schemas, event contracts, domain schemas, DTO shapes (universal across all packages)
- `rxjs` ^7.8.1 — NestJS observable internals

**Misc:**

- `transliteration` `2.6.1` (pinned exact, `apps/api`) — slug generation from non-Latin brand/tenant names

**API surface generation:**

- `openapi-typescript` ^7.13.0 (`packages/api-client`) — codegen for `packages/api-client/src/generated/api.ts` from committed `docs/api/openapi.yaml`
- `yaml` ^2.6.1 (`apps/api`) — YAML emit for the OpenAPI artifact

**Tooling:**

- `tsx` ^4.19.2 — TypeScript script runner (seed CLI, erase-tenant CLI, migration CLI)
- `esbuild` ^0.28.0 — production bundler for `apps/api` (`apps/api/build.mjs`)
- `husky` ^9.1.7 + `lint-staged` ^17.0.2 — pre-commit hooks
- `@commitlint/cli` ^21.0.1 + `@commitlint/config-conventional` ^21.0.1 — conventional commit enforcement

## Unused / Placeholder Packages

- `packages/feature-flags/` contains only a `.gitkeep` file — no `package.json`, no source, not in the pnpm workspace resolution in practice, not imported by any app. Treat as a reserved name/slot for a future OpenFeature/Unleash integration, not as a real dependency. Do not describe it as wired in any downstream document.

## Configuration

**Environment:**

- All env vars for `apps/api` declared and validated by Zod in `apps/api/src/config/env.schema.ts` (single file, ~300 lines, every var the app reads at boot)
- `loadEnv()` called at boot; missing required vars throw `EnvValidationError` before any controller mounts
- `API_PORT` defaults to `5001` (`env.schema.ts`); `CORS_ALLOWED_ORIGINS` defaults to `http://localhost:4000,http://localhost:3001,http://localhost:3002` (admin, a legacy admin port kept in the allowlist, website)
- Non-dev/test required vars (enforced by `.superRefine`): `BETTER_AUTH_SECRET`, `BETTER_AUTH_BASE_URL`, `BETTER_AUTH_DATABASE_URL`, `ADMIN_WEB_URL`, `WEBSITE_PUBLIC_URL`, `AUTH_COOKIE_DOMAIN`, `AUDIT_ERASURE_SALT`, `TRUST_PROXY`, `INTERNAL_API_TOKEN`, `DATABASE_DIRECT_URL`
- `DATABASE_DIRECT_URL` is new since the last stack analysis: a dedicated, unpooled, session-pinned Postgres connection reserved for the outbox dispatcher's `pg_try_advisory_lock` (works around Neon/PgBouncer transaction-mode pooling breaking session-level advisory locks — D-05). Falls back to `DATABASE_URL` in dev/test.
- S3 dev defaults (`S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`) guarded by `assertProdGuardrails` at boot (ADR-0020 I-3) — rejects dev-fallback values outside `development`/`test`; the same guardrail pattern now also covers `RESEND_API_KEY`'s documented dummy literal (D-01)
- `.env` file not committed; `.env.example` documents shape — **note:** `.env.example` itself is partially stale (still shows `BETTER_AUTH_BASE_URL=http://localhost:3000` and `ADMIN_WEB_URL=http://localhost:3001`, both pre-port-migration values); do not treat it as authoritative for current dev ports — `env.schema.ts` defaults and `vite.config.ts` files are the source of truth

**Build:**

- `tsconfig.base.json` — monorepo root TypeScript config; strict mode with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` (NestJS and Next.js apps relax `exactOptionalPropertyTypes` — incompatible with Radix prop spreads / decorator metadata patterns)
- Per-package `tsconfig.json` extending shared presets from `packages/config-typescript/`
- ESLint flat-config via `packages/config-eslint/` (exports `./base`, `./node`, `./react`); root `eslint.config.mjs`; `eslint` devDependency at `^10.4.0` across packages
- Prettier ^3.4.2 for formatting (`.prettierrc.json`: single quotes, trailing commas, 100-char width, LF, `arrowParens: always`)

## Platform Requirements

**Development:**

- Docker (Docker Desktop or colima) for the dev stack: Postgres 16-alpine, NATS 2.10-alpine, MinIO, MailHog, Jaeger 1.62.0 — **no Redis container** (`infra/docker/docker-compose.dev.yml`)
- `pnpm dev:up` / `dev:down` / `dev:logs` / `dev:reset` start/stop/tail/wipe the containers via `infra/docker/docker-compose.dev.yml`
- A separate ephemeral `infra/docker/docker-compose.test.yml` stack (Postgres + NATS only, tmpfs-backed, no Redis/MinIO/MailHog/Jaeger) backs `pnpm test:stack:up`/`down`/`status`/`smoke` for CI-shaped integration test runs
- Dev ports: api `5001` (`API_PORT` default), admin `4000` (Vite `server.port`, canonical — see the package.json/vite.config.ts drift note above), website `3002` (`next dev --port 3002`), qr-menu `3003` (Vite `server.port`)

**Production:**

- Target: AWS EKS (ADR-0011); Terraform in `infra/terraform/` (stub), Helm charts in `infra/k8s/` (stub)
- Migrations run as a Kubernetes Job before app rollout (`pnpm db:migrate`)
- Secrets injected at runtime via Vault / AWS Secrets Manager — never in image or env files
- `apps/admin` and `apps/qr-menu` are static-build SPAs (Vite `build` → `dist/`) deployable to any static host/CDN — no Node runtime required in production for either, a change from the Next.js-era admin which needed an app server

---

_Stack analysis: 2026-08-18_

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Coding Conventions

**Analysis Date:** 2026-08-18

## Naming Patterns

**Files:**

- Kebab-case for all source files: `provision-tenant.service.ts`, `tenant-drizzle.repository.ts`, `error-mapping.ts`
- Suffix conventions are strict: `.service.ts`, `.repository.ts`, `.controller.ts`, `.module.ts`, `.middleware.ts`, `.guard.ts`, `.pipe.ts`, `.adapter.ts`, `.decorator.ts`, `.spec.ts`
- Event contract files follow bounded-context name: `tenancy.ts`, `identity.ts`, `ordering.ts`
- Schema files in `packages/domain` are kebab-case entity names: `menu-item.ts`, `tenant.ts`

**Classes:**

- PascalCase throughout
- NestJS providers: `ProvisionTenantService`, `TenantDrizzleRepository`, `TenantsController`
- Aggregates: `Tenant`, `Location`, `Order`, `TableZone`, `RestaurantTable` (no suffix). There is no `Brand` aggregate — phase 10.2 removed the brand level entirely.
- Errors: `TenantNotFoundError`, `RefundReasonRequiredError` (always `Error` suffix)
- Ports/interfaces: `TenantRepository`, `PaymentProviderPort` (no `I` prefix)
- DTOs: `ProvisionTenantInputDto` (schema → `ProvisionTenantInputSchema`, type → `ProvisionTenantInput`, class → `ProvisionTenantInputDto`)
- Adapters: `TenantDrizzleRepository`, `NoopStripeConnectAdapter`, `NatsJetStreamPublisher`

**Constants (Symbol injection tokens):**

- `SCREAMING_SNAKE_CASE` for DI tokens: `TENANT_REPOSITORY`, `ORDER_REPOSITORY`, `MENU_PRICING_PORT`, `ORDER_FEED_REPOSITORY`
- Declared in `domain/ports.ts` (or `application/ports/*.ts`) alongside the interface

**Functions:**

- camelCase for standalone functions and methods
- Repository methods: `findById`, `findBySlug`, `findByDomainHost`, `save`, `listDomains`
- Service entry point: always `.execute(input)` — single public method, verified across contexts (e.g. `RefundOrderService.execute`, `CreateOrderService.execute`)

**Variables:**

- camelCase; private class fields use `#` (native private): `readonly #events: TenantDomainEvent[]`
- `_` prefix for intentionally unused function parameters and caught errors: `_res`, `_tx` — ESLint `caughtErrorsIgnorePattern: '^_'` also applies

**Zod schema naming convention (packages/domain):**

- Schema: `MoneyAmountValue`, `MoneyAmount`, `Currency`, `CurrencyValue`
- Branded vs. unbranded pairs: `FooValue` (unbranded, use at HTTP boundary) / `Foo` (branded, use inside domain)
- Type always derived: `export type Foo = z.infer<typeof Foo>`

**Domain error discriminant:**

- Domain errors additionally expose `readonly kind = 'FooError' as const` (e.g. `PaymentsNotEnabledError`, `CurrencyMismatchError` in `apps/api/src/contexts/payments/domain/errors.ts`) for union narrowing in application code — this is now a settled pattern across payments, ordering, and catalog, not catalog-only.

## Code Style

**Formatting (Prettier):**

- Single quotes for strings
- Trailing commas everywhere (arrays, objects, parameters)
- Semicolons required
- Print width: 100 chars
- Tab width: 2 spaces, no tabs
- `arrowParens: always`
- LF line endings

**TypeScript (`packages/config-typescript/base.json` + per-app overrides):**

- Strict mode + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes: true` at the base preset.
- `exactOptionalPropertyTypes` is explicitly disabled (`false`) in exactly two apps' own `tsconfig.json`, both Radix/shadcn-ui consumers: `apps/admin/tsconfig.json` and `apps/website/tsconfig.json`. Radix component prop spreads assign `undefined` to optional props in a way `exactOptionalPropertyTypes: true` rejects. `apps/qr-menu` (Vite + plain React, no Radix) keeps the strict default.
- `verbatimModuleSyntax: false` (allows type-only imports without `import type` enforcement from tsc, but ESLint enforces it separately)
- Target: ES2022, module: ESNext, moduleResolution: Bundler (NestJS overrides to `CommonJS`/`Node` via `packages/config-typescript/nest.json` for decorator metadata emission)

**Linting (`packages/config-eslint/base.mjs` — typescript-eslint strict + stylistic type-checked):**

- `@typescript-eslint/consistent-type-imports: prefer type-imports, fixStyle: inline-type-imports` — enforced via ESLint
- `@typescript-eslint/no-floating-promises: error`, `await-thenable: error`, `no-misused-promises: error`
- `@typescript-eslint/no-non-null-assertion: error` — no `!` assertions
- `@typescript-eslint/restrict-template-expressions: error` (numbers/booleans allowed in templates, nothing else)
- `no-console: warn` (allow `warn`/`error`) — use `Logger` from NestJS instead
- `eqeqeq: error` — always `===`, except `null` comparisons
- `no-restricted-syntax` carries a growing list of project-specific forbidden patterns beyond the general rules above — see "Enforced Invariants" below. Each entry cites its ADR/ticket in the ESLint config itself, not just in docs.
- The comment-ban policy (below) is **not** ESLint-enforced — there is no `no-warning-comments`/custom rule blocking descriptive comments. It is enforced by code review discipline and periodic cleanup commits (see Comments section).

## Import Organization

**Order (enforced by Prettier, not by import/order plugin):**

1. Node built-ins (`node:crypto`, `node:path`, `node:http`)
2. External packages (`@nestjs/*`, `drizzle-orm`, `zod`, `vitest`)
3. Monorepo packages (`@resto/db`, `@resto/domain`, `@resto/events`)
4. Local imports (relative paths, `../../../src/...`)

**Type imports:**

- `import { type Foo }` inline syntax preferred (enforced by `consistent-type-imports` rule, `fixStyle: inline-type-imports`)
- `import type { Foo }` also acceptable (same rule allows both forms)

**Path aliases per app — verified against each app's own `tsconfig.json` / `vite.config.ts`:**

- `apps/api` — no `@/` alias; relative paths only.
- `apps/admin` — Vite + React SPA (TanStack Router, not Next.js/RSC — the app was migrated off Next.js). `@/*` → `./src/*`, configured in both `apps/admin/tsconfig.json` (`paths`) and `apps/admin/vite.config.ts` (`resolve.alias`).
- `apps/website` — still Next.js App Router/RSC. `@/*` → `./*` (root-relative, not `./src/*` — website has no `src/` dir).
- `apps/qr-menu` — no `@/` alias observed; relative paths.
- Monorepo packages accessed via `@resto/<name>` (e.g. `@resto/db`, `@resto/domain`, `@resto/events`) — resolved through `tsconfig.base.json` path mappings and workspace `package.json` exports, never a relative `../../packages/...` reach-across.

## DTO / Schema Pattern

The project uses a three-export pattern per DTO:

```typescript
// Schema (Zod) — authoritative
export const CreateOrderInputSchema = z.object({ ... });

// Inferred type
export type CreateOrderInput = z.infer<typeof CreateOrderInputSchema>;

// NestJS DTO class (for Swagger + validation pipe)
export class CreateOrderInputDto extends createZodDto(CreateOrderInputSchema) {}
```

- Zod schemas are the single source of truth; TypeScript types are ALWAYS derived via `z.infer`
- Never write `type Foo = { ... }` separately from a Zod schema
- HTTP-boundary schemas use unbranded value types (`CurrencyValue`, `MoneyAmountValue`) so `nestjs-zod` emits `type: string` for OpenAPI
- Domain internals use branded types (`Currency`, `MoneyAmount`) to prevent cross-type misuse
- `packages/domain` rule (not previously in this doc): free-text fields require an explicit max length (`z.string().max(...)`, default cap 4 KiB) and URL fields must restrict scheme via `.refine(u => /^https?:/i.test(u), ...)` — unbounded `z.string()` / `.url()` are DoS and XSS/CSS-injection vectors respectively at the HTTP boundary. Enforced by convention + review, not a lint rule.

## DI and Module Pattern (NestJS)

```typescript
// ports.ts — interface + Symbol token
export interface OrderRepository { ... }
export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');

// Module wiring
{ provide: ORDER_REPOSITORY, useClass: OrderDrizzleRepository }

// Service constructor
constructor(@Inject(ORDER_REPOSITORY) private readonly repo: OrderRepository) {}
```

- Repositories and ports are always injected by Symbol token, not by class
- Application services depend on port interfaces, never on concrete infrastructure classes
- Each bounded context owns a `*.module.ts` at its root that wires all internal providers
- All services are `@Injectable()` with a single `execute(input)` public method
- NestJS module classes are intentionally empty marker classes for the DI container — `apps/api/eslint.config.mjs` explicitly turns off `@typescript-eslint/no-extraneous-class` for `**/*.module.ts` rather than treating the pattern as a smell.

## Error Handling

**Domain errors:**

- Plain `Error` subclasses defined in `domain/errors.ts` per bounded context
- Constructor sets `this.name` explicitly (for stack trace readability)
- No error codes or HTTP status in domain errors
- Payments/ordering/catalog error classes additionally carry `readonly kind = 'FooError' as const` (see Naming Patterns)

```typescript
export class PaymentsNotEnabledError extends Error {
  readonly kind = 'PaymentsNotEnabledError' as const;
  constructor(public readonly tenantId: string) {
    super(`Tenant "${tenantId}" cannot accept payments — KYC not complete.`);
    this.name = 'PaymentsNotEnabledError';
  }
}
```

**HTTP interface translation:**

- Each controller has a corresponding `error-mapping.ts` with a `mapDomainError(err)` function
- Function maps domain errors to NestJS `HttpException` subclasses (never maps `unknown` — returns it unchanged)
- Controllers wrap every handler body in `try/catch` and call `mapDomainError`, or use the `wrapWith(mapper)` helper (`apps/api/src/shared/api/wrap.ts`) in internal controllers:

```typescript
try {
  return toResponse(await this.queries.getCurrentTenant());
} catch (err) {
  throw mapDomainError(err);
}
```

**Global exception filter:**

- `ProblemDetailsFilter` (`apps/api/src/shared/exception.filter.ts`) catches all unhandled exceptions
- Outputs RFC 7807 `application/problem+json`
- 5xx responses redact `detail` to prevent DB/schema leak (RES-175)
- Error `code` string maps to a stable `type` URI: `https://resto.app/problems/<code>`
- Structured log: `error` level for 5xx, `warn` for 4xx

## Logging

**Framework:** NestJS `Logger` from `@nestjs/common`

**Patterns:**

- Class-level logger declared as `private readonly logger = new Logger(ClassName.name)`
- Structured logging — pass an object as first arg: `this.logger.log({ slug, tenantId }, 'Message.')`
- Use `logger.log` for normal operations, `logger.warn` for degraded-but-ok, `logger.error` for failures
- Never log secrets; `packages/db/src/logger.ts` has a `redact` config covering `password`, `token`, `email`, `phone`, `params`
- `no-console: warn` ESLint rule — use Logger, not `console.log`

## Comments — HARD default: ZERO

This is enforced in practice, not just documented. Canonical statement lives in `apps/CLAUDE.md`; restated here because it governs every file this document's readers will write.

**Default: no comments.** Well-named identifiers are expected to document the code by themselves.

**The only exception is a critical WHY, capped at ~2 lines:**

- A hidden constraint (e.g. a library quirk, a database/RLS behavior that isn't visible from the call site)
- A counterintuitive workaround (e.g. why a seemingly-wrong branch is actually correct)
- A subtle invariant that a future reader would otherwise silently violate

Even the WHY exception is a link/pointer, not an essay — cite an ADR number where one exists (`// ADR-0020 I-1`); a bare ticket ID (`// RES-175`) is used when there is no ADR.

**Forbidden, explicitly:**

- `// what this does` comments that restate the following line
- File-header doc blocks restating the file's role
- `// added for X / fix for #Y` — that belongs in the commit message, not the code
- Section-divider banners (`// ======`)
- JSDoc on internal helpers — JSDoc is reserved for `packages/*` public API where the contract is genuinely non-obvious
- Comments inside test bodies — `describe`/`it` names carry the intent instead

**This is retroactive.** Touching a file is licence to strip any comment that fails the WHY bar, whether or not it's related to the current change. Not lint-enforced (no ESLint rule blocks comments) — enforced by review and by dedicated cleanup commits. A representative one: `363fc0e9` ("style(10): strip narrative comments from phase 10 code") touched 47 files across `apps/api`, `apps/website`, `packages/db`, `packages/domain`, `packages/events`, and `tools/scripts` for a net **411 comment-line deletions, 0 insertions**. Smaller single-purpose versions of the same cleanup recur regularly (`01efd2ec`, `503e2c4a`, `2bb0407b`, `92e90c73`, `8d39c531`, and others) — expect to be asked to do this on almost every phase, not just once.

**JSDoc (narrow exception):**

- Used on public interfaces and key abstractions in `packages/` only, and only where the contract is non-obvious
- Not required on every method

## Enforced Invariants (ESLint, beyond generic style)

`packages/config-eslint/base.mjs` and each app's own `eslint.config.mjs` encode several project-specific invariants as `no-restricted-syntax` / `no-restricted-imports` rules — these are load-bearing, not stylistic, and each one traces to an ADR or ticket cited directly in the rule's `message`:

- **`correlationId` must come from `buildEnvelope()`**, never `randomUUID()`/`crypto.randomUUID()` literally assigned to a `correlationId` property (`FORBIDDEN_CORRELATION_ID_LITERALS`, ADR-0020 I-4 / TEN-15). Defined once in `base.mjs`, spread into every consumer config that redefines `no-restricted-syntax` — flat-config rule arrays don't merge across configs, so this spread is required at every site, not optional boilerplate.
- **`runInTenantContext` is HTTP-middleware-only** (ADR-0020 I-6) — `apps/api/eslint.config.mjs` bans importing it from `@resto/db` anywhere except `src/shared/tenant-context.middleware.ts`. Everywhere else uses `db.withTenant` / `db.withTenantId` / `db.withoutTenant`.
- **Direct `tx.select/insert/update/delete` bypasses `ScopedTx`** (ADR-0020 I-1) — banned outside `*-drizzle.repository.ts` / `*-drizzle.reader.ts` adapters (which take on responsibility for the tenant filter themselves) and the audit consumer.
- **`withoutTenant` calls are allowlisted by file path** (RES-252 I-1) — mirrored between `apps/api/eslint.config.mjs` and `packages/db/src/withoutTenant.allowlist.ts`; adding a new caller means updating both.
- **`stripe` SDK import is banned from `payments/application` and `payments/domain`** (PAY-16) — only `payments/infrastructure/stripe/` may import it; application/domain code depends on `PaymentProviderPort`.
- Test files (`test/**/*.ts`, `src/**/*.spec.ts`) get `no-restricted-imports`/`no-restricted-syntax` turned back **off** — tests legitimately simulate the middleware layer and seed via raw `tx.*` under `withoutTenant`.

## Tenancy Enforcement Pattern

Tenancy is enforced at two layers — both are mandatory:

1. **Postgres RLS** (second layer, safety net): every tenant-scoped table has `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`
2. **Application-layer filter** (first layer): every Drizzle query on a tenant-scoped table MUST include `eq(table.tenantId, ctx.tenantId)`

The `requireTenantContext()` helper reads the current tenant from `AsyncLocalStorage`:

```typescript
const ctx = requireTenantContext(); // throws if no context bound
const locationId = getLocationId() ?? null;
return this.repo.upsertCategory({ tenantId: ctx.tenantId, locationId, ... });
```

`db.withoutTenant(reason, fn)` bypasses RLS for system-level operations; callers must provide a non-empty `reason` string, and the caller's file path must be on the explicit allowlist (see Enforced Invariants above).

`runInTenantContext` is HTTP-middleware-only (ADR-0020 I-6) and is restricted via `no-restricted-imports`.

## Event Publishing Pattern

Events flow through the transactional outbox:

```typescript
// In aggregate: accumulate domain events
this.#events.push({ kind: 'TenantProvisioned', ... });

// In repository.save(): drain events and write outbox rows in the same tx
const events = tenant.pullEvents();
for (const event of events) {
  await appendToOutbox(tx, { envelope: domainEventToEnvelope(event), aggregateId });
}
```

Event contracts are defined in `packages/events/src/contracts/` using `defineEventContract`:

```typescript
export const TenantProvisionedV1 = defineEventContract({
  type: 'tenancy.tenant_provisioned.v1',
  payload: TenantProvisionedV1Payload,
});
```

Event type format: `<context>.<event>.v<n>` (e.g. `tenancy.tenant_provisioned.v1`).

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

---

_Convention analysis: 2026-08-18_

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

```text

```

## Component Responsibilities

| Component                 | Responsibility                                                                                                                                                   | Key Files                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `identity` context        | Auth (Better Auth), session management, user/operator lifecycle, RBAC                                                                                            | `apps/api/src/contexts/identity/`                  |
| `tenancy` context         | Tenant provisioning/lifecycle, brand management, domain resolution                                                                                               | `apps/api/src/contexts/tenancy/`                   |
| `catalog` context         | Menu items, categories, modifiers, publish/cache cycle                                                                                                           | `apps/api/src/contexts/catalog/`                   |
| `audit` context           | Cross-cutting event audit trail, subscribes to all NATS subjects                                                                                                 | `apps/api/src/contexts/audit/`                     |
| `TenantContextMiddleware` | Resolves tenant+brand from request host or headers; binds AsyncLocalStorage                                                                                      | `apps/api/src/shared/tenant-context.middleware.ts` |
| `TenantAwareDb`           | Drizzle wrapper enforcing per-tenant Postgres RLS via `app_bind_tenant` GUC                                                                                      | `packages/db/src/client.ts`                        |
| `OutboxDispatcher`        | Polls outbox table, publishes events to NATS JetStream; leader-elected                                                                                           | `packages/events/src/outbox/dispatcher.ts`         |
| `apps/admin`              | Vite + React SPA operator dashboard (TanStack Router + Query); calls api via `apps/admin/src/lib/api-client.ts:apiFetch` with the operator's Better Auth session | `apps/admin/src/`                                  |
| `apps/qr-menu`            | Vite+React customer-facing menu app; reads public `/v1/menu`                                                                                                     | `apps/qr-menu/`                                    |

## Pattern Overview

- Each bounded context (`tenancy`, `identity`, `catalog`, `audit`) follows a strict 4-layer layout: `domain/` → `application/` → `infrastructure/` → `interfaces/`
- Domain layer is pure TypeScript (no NestJS, no Drizzle, no framework imports)
- Application services depend only on port interfaces (`Symbol`-keyed), never on concrete adapters
- Infrastructure adapters implement domain ports; NestJS DI wires them at module composition time
- Multi-tenant isolation is double-enforced: `ScopedTx` (application layer) + Postgres RLS (database layer)

## Layers

- Purpose: Business rules, aggregate roots, domain events, port interfaces
- Location: `apps/api/src/contexts/<ctx>/domain/`
- Contains: Aggregate classes (e.g. `Tenant`, `Location`, `Order`, `TableZone`), domain error classes, port interface definitions, Zod schemas for value objects. There is no `Brand` aggregate — phase 10.2 removed the brand level.
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
- Location: `apps/admin/index.html` → `apps/admin/src/main.tsx`
- Triggers: Browser load (static SPA, no SSR)
- Responsibilities: Auth-gated dashboard UI; calls api exclusively via `apps/admin/src/lib/api-client.ts:apiFetch`
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
- **Delete the branch as soon as it is merged**, local and remote both. A merged branch that lingers
  is one more thing to mistake for live work; if `git branch -d` refuses, confirm the branch really
  is an ancestor of `main` and then use `-D`.
- **Retarget a stacked PR to `main` before merging the one under it.** Merging deletes the head
  branch and GitHub auto-closes every PR based on it; a closed PR whose base is gone can be neither
  retargeted nor reopened, so the only way back is a brand-new PR. Either open the upper PR against
  `main` from the start, or `gh pr edit <n> --base main` while the lower one is still open.
- **Prove where a red check comes from before judging it.** Check the base commit out in a throwaway
  worktree and run the same test there. `main` in this repo has failing checks of its own, so
  "CI is red" says nothing on its own — say which checks were already red on the base, which the
  branch fixes, and which it leaves.
- A task is not finished while a check that was green before your change is red after it.
- **Confirm a merge landed** with `gh pr view <n> --json state,mergedAt` and `git ls-remote --heads
origin`. `gh pr merge` can exit silently on success and can be refused by tooling policy without
  touching the repository — neither looks different from the outside.

Full rule: `~/work/llm-wiki/shared/merging-pull-requests.md`.

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.

<!-- GSD:profile-end -->
