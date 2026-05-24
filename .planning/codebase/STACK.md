# Technology Stack

**Analysis Date:** 2026-05-24

## Languages

**Primary:**

- TypeScript 6.0.3 — all packages and apps
- SQL — Drizzle-generated migrations + hand-written RLS/DDL in `packages/db/migrations/` and `packages/db/sql/`

**Secondary:**

- CSS (Tailwind 4) — `apps/admin/` and `apps/qr-menu/`

## Runtime

**Environment:**

- Node.js >= 22.22.1 (enforced in `package.json` `engines` field)

**Package Manager:**

- pnpm 9.15.0 (exact, enforced via `packageManager` field)
- Lockfile: `pnpm-lock.yaml` present, committed

## Monorepo Orchestration

- Nx 22.7.2 — task runner, affected-graph computation, caching (`nx.json`)
- Workspace defined by `pnpm-workspace.yaml` covering `apps/*`, `packages/*`, `tools/*`
- Parallel task limit: 3 (`nx.json` `"parallel": 3`)

## Frameworks

**Backend (`apps/api`):**

- NestJS 10.4.15 — modular DDD monolith (`@nestjs/common`, `@nestjs/core`)
- Fastify 4.28.1 via `@nestjs/platform-fastify` — HTTP transport
- `nestjs-zod` 5.3.0 — Zod-native DTO validation inside NestJS
- `@nestjs/swagger` 8.1.0 — OpenAPI spec generation

**Admin UI (`apps/admin`):**

- Next.js 16.2.6 (App Router, RSC, typed routes)
- React 19.0.0
- Tailwind CSS 4 via `@tailwindcss/postcss`
- shadcn/ui (`new-york` variant, `neutral` palette) on top of `radix-ui` 1.4.3
- `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`

**QR Menu (`apps/qr-menu`):**

- Vite 5.4.11 — no SSR, mobile-optimised SPA
- React 18.3.1

**Testing (all packages/apps):**

- Vitest 2.1.8 — unit and integration tests

## Key Dependencies

**Auth:**

- `better-auth` ~1.4.22 — email+password, org/RBAC, 2FA (TOTP), bearer tokens; runs in-process inside `apps/api` (no separate IdP container)

**ORM / Database:**

- `drizzle-orm` ^0.45.2 — used in `apps/api`, `packages/db`, `packages/events`
- `drizzle-kit` ^0.31.10 — migration generation (`pnpm db:generate`)
- `postgres` (postgres.js) ^3.4.5 — low-level Postgres driver

**Event Bus:**

- `nats` ^2.29.1 (JetStream) — in `packages/events`; publisher and subscriber adapters in `packages/events/src/infrastructure/`

**Caching:**

- `ioredis` ^5.4.2 — catalog menu cache in `apps/api`; optional (`REDIS_URL` absent = cache disabled)

**Object Storage:**

- `@aws-sdk/client-s3` ^3.1053.0 and `@aws-sdk/s3-request-presigner` ^3.1053.0 — S3-compatible presigned URLs; MinIO locally, AWS S3 / Cloudflare R2 in production

**Observability:**

- `@opentelemetry/sdk-node` ^0.57.0 + `@opentelemetry/auto-instrumentations-node` ^0.55.0 — bootstrapped before NestJS in `apps/api/src/bootstrap-telemetry.ts`
- `@opentelemetry/exporter-trace-otlp-http` ^0.57.0 — exports to OTLP endpoint (Jaeger in dev)
- `pino` ^9.5.0 — structured JSON logger in `apps/api` and `packages/db`

**Validation:**

- `zod` ^3.24.1 — env schemas, event contracts, domain schemas, DTO shapes (universal across all packages)
- `rxjs` ^7.8.1 — NestJS observable internals

**API surface generation:**

- `openapi-typescript` — codegen for `packages/api-client/src/generated/api.ts` from committed `docs/api/openapi.yaml`
- `yaml` ^2.6.1 — YAML emit for the OpenAPI artifact

**Tooling:**

- `tsx` ^4.19.2 — TypeScript script runner (seed CLI, erase-tenant CLI, migration CLI)
- `esbuild` ^0.28.0 — production bundler for `apps/api`
- `husky` ^9.1.7 + `lint-staged` ^17.0.2 — pre-commit hooks
- `@commitlint/cli` ^21.0.1 — conventional commit enforcement

## Configuration

**Environment:**

- All env vars for `apps/api` declared and validated by Zod in `apps/api/src/config/env.schema.ts`
- `loadEnv()` called at boot; missing required vars throw `EnvValidationError` before any controller mounts
- Non-dev required vars: `BETTER_AUTH_SECRET`, `BETTER_AUTH_BASE_URL`, `BETTER_AUTH_DATABASE_URL`, `ADMIN_WEB_URL`, `AUTH_COOKIE_DOMAIN`, `AUDIT_ERASURE_SALT`, `TRUST_PROXY`, `INTERNAL_API_TOKEN`
- S3 dev defaults guarded by `assertProdGuardrails` at boot (ADR-0020 I-3) — rejects dev-fallback values outside `development`/`test`
- `.env` file not committed; `.env.example` documents shape

**Build:**

- `tsconfig.base.json` — monorepo root TypeScript config; strict mode with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` (NestJS: relaxed on `exactOptionalPropertyTypes`)
- Per-package `tsconfig.json` extending shared presets from `packages/config-typescript/`
- ESLint flat-config via `packages/config-eslint/`; root `eslint.config.mjs`
- Prettier ^3.4.2 for formatting

## Platform Requirements

**Development:**

- Docker (Docker Desktop or colima) for the dev stack: Postgres 16, Redis 7, NATS 2.10, MinIO, MailHog, Jaeger
- `pnpm dev:up` starts all containers via `infra/docker/docker-compose.dev.yml`

**Production:**

- Target: AWS EKS (ADR-0011); Terraform in `infra/terraform/` (stub), Helm charts in `infra/k8s/` (stub)
- Migrations run as a Kubernetes Job before app rollout (`pnpm db:migrate`)
- Secrets injected at runtime via Vault / AWS Secrets Manager — never in image or env files

---

_Stack analysis: 2026-05-24_
