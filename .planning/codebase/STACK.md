# Technology Stack

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
