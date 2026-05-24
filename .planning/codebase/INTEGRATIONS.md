# External Integrations

**Analysis Date:** 2026-05-24

## APIs & External Services

**Authentication / Identity:**

- Better Auth ~1.4.22 — email+password auth, org membership (maps onto `tenants`), roles (owner/admin/staff), 2FA TOTP, bearer tokens, session management
  - SDK/Client: `better-auth` package; wired in `apps/api/src/contexts/identity/infrastructure/better-auth/`
  - Config: `apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts`
  - Auth: `BETTER_AUTH_SECRET`, `BETTER_AUTH_BASE_URL`, `BETTER_AUTH_DATABASE_URL`
  - Plugins in use: `organization`, `twoFactor`, `bearer`
  - Runs fully in-process inside `apps/api` — no separate IdP container

**Payments (placeholder):**

- Stripe Connect — deferred to MVP-2 (ADR-0009/ADR-0010)
  - Current state: `NoopStripeConnectAdapter` at `apps/api/src/contexts/tenancy/infrastructure/stripe-connect.adapter.ts` returns `null` for all calls
  - Port defined: `StripeConnectPort` in `apps/api/src/contexts/tenancy/domain/ports.ts`
  - No `stripe` npm package installed yet

**Email (placeholder):**

- Resend SMTP — referenced in `RES-12` error message in `apps/api/src/contexts/identity/identity-core.module.ts` as the intended provider
  - Current state: `sendVerificationEmail`, `sendResetPassword`, `sendInvitationEmail` are no-op callbacks in dev; `assertEmailAdapterWired` throws in staging/production if not wired
  - No email SDK installed yet; dev uses MailHog SMTP container on port 1025

## Data Storage

**Database:**

- PostgreSQL 16 (Alpine in dev container)
  - Runtime connection: `DATABASE_URL` env var — connects as `resto_app` (NOSUPERUSER NOBYPASSRLS)
  - Admin/migration connection: `DATABASE_ADMIN_URL` env var — connects as `resto_admin` (schema owner)
  - Auth connection: `BETTER_AUTH_DATABASE_URL` — connects as `resto_auth` (BYPASSRLS; owns BA credential tables)
  - Client: `postgres` (postgres.js) wrapped by Drizzle ORM in `packages/db/src/client.ts`
  - Schema managed by `packages/db/src/schema/`; migrations in `packages/db/migrations/`
  - RLS enforced on all tenant-scoped tables; `FORCE ROW LEVEL SECURITY` prevents owner bypass

**Caching:**

- Redis 7 (Alpine)
  - Connection: `REDIS_URL` env var (optional; cache degrades gracefully to DB reads if absent)
  - Client: `ioredis` ^5.4.2
  - Usage: catalog published-menu cache in `apps/api/src/contexts/catalog/infrastructure/redis-catalog-cache.adapter.ts`
  - Key patterns: `catalog:menu:version:{tenantId}`, `catalog:menu:{tenantId}:{brandId}:{version}`

**File Storage:**

- S3-compatible object storage
  - Production target: AWS S3 or Cloudflare R2 (per ADR-0011)
  - Dev substitute: MinIO (container on port 9000, console on 9001)
  - Connection: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`
  - Client: `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`
  - Usage: presigned GET URLs for menu item images in `apps/api/src/contexts/catalog/infrastructure/s3-signed-image-url.adapter.ts`
  - Uses path-style addressing (required for MinIO and most S3 emulators)

## Message Broker

**NATS JetStream:**

- Version: NATS 2.10 (Alpine dev container)
- Connection: `NATS_URL`, `NATS_STREAM` (default `RESTO_EVENTS`), optional `NATS_USERNAME`/`NATS_PASSWORD`
- Client: `nats` ^2.29.1 SDK
- Publisher: `NatsJetStreamPublisher` in `packages/events/src/infrastructure/nats-publisher.ts`
- Subscriber: `NatsJetStreamSubscriber` in `packages/events/src/infrastructure/nats-subscriber.ts`
- Stream subjects: `tenancy.>`, `identity.>`, `catalog.>`, `ordering.>`, `billing.>`
- Wired via `NatsModule` in `apps/api/src/infrastructure/nats.module.ts`; soft-fails at boot if NATS unreachable (readiness endpoint reports DOWN)
- `NATS_DISABLED=true` skips connection entirely (CI / test environments)
- Transactional outbox: `packages/events/src/outbox/` — `appendToOutbox` + `OutboxDispatcher`
- Inbox dedup: `packages/events/src/inbox/run-deduped.ts` — atomic dedup + handler in one DB transaction

## Authentication & Identity

**Auth Provider:** Better Auth (in-process, see above)

- Session duration: 7 days, rolling 1-day update (`apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts:170`)
- Cookie scope: `AUTH_COOKIE_DOMAIN` (must start with `.` for cross-subdomain; e.g. `.resto.app`)
- BA tables (`account`, `session`, `user`, `two_factor`, `verification`, `organization_role`, `member`, `invitation`) in `packages/db/src/schema/auth.ts`
- BA's "organization" concept maps directly to the `tenants` table (no separate org table)
- `resto_app` runtime role is explicitly revoked from BA credential tables (migration 0027, RES-206); only `resto_auth` (BYPASSRLS) has access

**Internal API Auth:**

- `INTERNAL_API_TOKEN` — shared secret for `/internal/v1/*` routes; required outside dev
- `InternalTokenGuard` allows unauthenticated requests in `development` for tooling ergonomics

**RBAC:**

- System roles defined in `packages/domain/src/rbac/` — `owner`, `admin`, `staff`
- Dynamic roles stored in BA's `organization_role` table
- Permission checker port: `apps/api/src/contexts/identity/application/ports/permission-checker.port.ts`
- Adapter: `BetterAuthPermissionChecker` in `apps/api/src/contexts/identity/infrastructure/better-auth/permission-checker.adapter.ts`

## Monitoring & Observability

**Distributed Tracing:**

- OpenTelemetry SDK (OTLP HTTP exporter)
- Bootstrap: `apps/api/src/bootstrap-telemetry.ts` — first import in `main.ts`; patches Node built-ins before NestJS loads
- Exporter endpoint: `OTEL_EXPORTER_OTLP_ENDPOINT` (default `http://localhost:4318`)
- Service name: `OTEL_SERVICE_NAME` (default `resto-api`)
- Auto-instrumentation enabled except `@opentelemetry/instrumentation-fs` (disabled as noise)
- Dev collector: Jaeger all-in-one 1.62.0 (container; UI on port 16686)
- `OTEL_DISABLED=true` skips SDK entirely (CI, test)
- `correlationId` in event envelopes derives from the active OTel span (ADR-0020 I-4)

**Error Tracking:**

- Not yet integrated (no Sentry SDK or equivalent installed)

**Logs:**

- `pino` ^9.5.0 — structured JSON; redacts `password`, `token`, `email`, `phone`, `params` fields
- Log level controlled by `LOG_LEVEL` env var (default `info`)

## CI/CD & Deployment

**CI Pipeline:**

- GitHub Actions — `.github/workflows/ci.yml`
- Jobs: `install`, `affected` (lint/typecheck/test/build via Nx affected), `format`, `commitlint`, `secret-scan` (gitleaks), `audit` (pnpm audit), `openapi-drift`
- Affected graph computed via `nrwl/nx-set-shas@v5`
- Dependency audit runs `continue-on-error: true` (advisory-level findings don't block merges)

**Hosting:**

- Production target: AWS EKS (ADR-0011)
- IaC: Terraform in `infra/terraform/` (stub), Helm charts in `infra/k8s/` (stub)
- Image tags are immutable SHA-based; migrations run as a Kubernetes Job before rollout

## Webhooks & Callbacks

**Incoming:**

- None currently wired (Stripe webhooks will be needed for payments in MVP-2; no `/webhook/` routes exist yet)

**Outgoing:**

- Email callbacks — `sendInvitationEmail`, `sendResetPassword`, `sendVerificationEmail` — are function ports injected into Better Auth; currently no-op; will be backed by Resend SMTP in MVP-2 (RES-12)

## Environment Configuration

**Required env vars (non-dev/test):**

- `DATABASE_URL` — runtime Postgres (`resto_app` role, NOBYPASSRLS)
- `DATABASE_ADMIN_URL` — migration Postgres (`resto_admin` role)
- `BETTER_AUTH_DATABASE_URL` — auth Postgres (`resto_auth` role, BYPASSRLS)
- `BETTER_AUTH_SECRET` — 32+ char BA signing secret
- `BETTER_AUTH_BASE_URL` — public api base URL (e.g. `https://api.resto.app`)
- `ADMIN_WEB_URL` — admin UI URL (BA trusted origin + email links)
- `AUTH_COOKIE_DOMAIN` — cross-subdomain cookie domain (e.g. `.resto.app`)
- `INTERNAL_API_TOKEN` — 16+ char shared secret for internal routes
- `AUDIT_ERASURE_SALT` — 32+ char immutable salt for PII anonymisation on tenant erasure
- `TRUST_PROXY` — CIDR list or hop count; `true` rejected outside dev
- `NATS_URL` — NATS broker URL
- `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` — object storage

**Optional env vars:**

- `REDIS_URL` — cache degrades gracefully if absent
- `NATS_USERNAME`, `NATS_PASSWORD` — NATS auth (none in dev)
- `DATABASE_ADMIN_URL` — optional in dev (falls back to `DATABASE_URL` with warning)
- `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`, `OTEL_DISABLED`
- `CORS_ALLOWED_ORIGINS` — comma-separated list (default `http://localhost:3001,http://localhost:3003`)
- `TENANT_DEV_FALLBACK_SLUG` — dev only; pins rootdomain requests to a slug
- `REQUIRE_EMAIL_VERIFICATION` (default `false`)
- `RATE_LIMIT_*` vars — per-route rate limit tuning

**Secrets location:**

- Dev: injected via Docker Compose environment or `.env` file (not committed)
- Production: Vault / AWS Secrets Manager; injected at pod startup

---

_Integration audit: 2026-05-24_
