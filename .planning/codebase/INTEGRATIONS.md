# External Integrations

> **STALE — analysed 2026-08-18, before phase 10.2.** Phase 10.2 (merged 2026-08-22)
> deleted the Brand level from the product: `BrandScopeGuard`, `@BrandNeutral()`,
> `@RequireBrand()`, `req.activeBrandId`, the `x-brand-slug` header, the `/$brandSlug`
> admin route segment and the brand RLS policies all have **zero occurrences in the
> codebase today**. Phase 10.3 (table zones, tables and QR codes) is also absent.
> Treat every mention of a brand in this file as describing a system that no longer
> exists, and verify against the code before acting on anything here.
> Regenerate this directory with `/gsd-map-codebase` to clear this notice.


**Analysis Date:** 2026-08-18

## APIs & External Services

**Authentication / Identity:**

- Better Auth `=1.4.22` — email+password auth, org membership (maps onto `tenants`), roles (owner/admin/staff), 2FA TOTP, bearer tokens, session management
  - SDK/Client: `better-auth` package; wired in `apps/api/src/contexts/identity/infrastructure/better-auth/`
  - Config: `apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts`
  - Plugins in use: `organization` (`access-control.ts` supplies the RBAC statements), `twoFactor()`, `bearer()`
  - Session: `expiresIn = 7d`, `updateAge = 1d` rolling (`auth.config.ts:346-348`)
  - Auth env: `BETTER_AUTH_SECRET`, `BETTER_AUTH_BASE_URL`, `BETTER_AUTH_DATABASE_URL`
  - Runs fully in-process inside `apps/api` — no separate IdP container

**Payments — LIVE, not a placeholder:**

- Stripe Connect — real, wired end-to-end (phases 08 / 08.1). Do not describe this as deferred/stubbed; that was only true as of the 2026-05-24 pass.
  - Provider-agnostic port: `PaymentProviderPort` in `apps/api/src/contexts/payments/domain/ports.ts` (`PAYMENT_PROVIDER_PORT` token) — covers onboarding-account creation, onboarding link/session creation, OAuth code exchange, account retrieval, payment-intent create/cancel, refund create, webhook-signature verification
  - **Wired adapter:** `createStripeProviderAdapter` (`apps/api/src/contexts/payments/infrastructure/stripe/stripe-provider.adapter.ts`), bound to `PAYMENT_PROVIDER_PORT` in `apps/api/src/contexts/tenancy/tenancy.module.ts:50-59` via a `useFactory` that constructs a `Stripe` client (`stripe` npm package `17.7.0`, `apiVersion: '2025-02-24.acacia'`)
  - **Unwired adapter:** `StubProviderAdapter` (`apps/api/src/contexts/payments/infrastructure/stub/stub-provider.adapter.ts`) implements the same port with hardcoded fake responses (`stub_acct_12345`, `pi_stub_123`, …) but is not referenced by any module — grep for `StubProviderAdapter` returns only its own definition file. It exists but has no live effect; do not present it as the active dev/test provider.
  - Two onboarding flows are both real: Express account + onboarding link/session (`StartStripeOnboardingService`, `StartBrandOnboardingService`, `apps/api/src/contexts/tenancy/interfaces/http/stripe-onboarding.controller.ts`) and Standard-account OAuth (`BrandOAuthCallbackController` in `apps/api/src/contexts/tenancy/interfaces/http/brand-onboarding.controller.ts`, `exchangeOAuthCode`/`oauth.token` in the Stripe adapter)
  - Webhook: `POST /webhook/stripe` (`apps/api/src/contexts/payments/interfaces/http/stripe-webhook.controller.ts`) — `@Public()` + `@BrandNeutral()`, verifies `stripe-signature` against raw body via `provider.verifyWebhookSignature`, then dispatches to `HandleStripeEventService`
  - Application services: `CreateCheckoutPaymentService`, `RefundOrderService`, `RetryRefundService`, `CancelOrderService`, `HandleStripeEventService` (`apps/api/src/contexts/payments/application/`)
  - Client packages: admin ships `@stripe/connect-js`/`@stripe/react-connect-js` (embedded onboarding UI, `apps/admin/src/routes/(protected)/$brandSlug/brands.$slug.payouts.tsx`); website ships `@stripe/stripe-js`/`@stripe/react-stripe-js` (guest checkout Payment Element, `apps/website/components/checkout/`)
  - Env: `STRIPE_SECRET_KEY` (optional at schema level; falls back to `sk_test_placeholder` if unset — meaning misconfiguration silently produces a Stripe client that will fail all real API calls rather than fail fast at boot), `STRIPE_APPLICATION_FEE_AMOUNT` (default `0`), `STRIPE_CONNECT_CLIENT_ID`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_RETURN_URL`/`STRIPE_CONNECT_REFRESH_URL` (both default to `http://localhost:3001/...` — **stale**, predates the admin port move to `4000`; not fixed as of this analysis), `STRIPE_CONNECT_OAUTH_REDIRECT_URL`
  - Absent/misconfigured behavior: none of the Stripe env vars are enforced by `envSchema.superRefine`, so a deploy can boot successfully with no `STRIPE_SECRET_KEY` set — failures surface only when a payment/onboarding call actually reaches Stripe and gets rejected by the placeholder key. This is a gap worth flagging to whoever tracks CONCERNS.md.

**Email — LIVE, NODE_ENV-keyed adapter selection:**

- Factory: `createEmailAdapter` (`apps/api/src/contexts/identity/infrastructure/email/email-adapter.factory.ts`) picks the adapter by `env.NODE_ENV`:
  - `test` → `CapturedEmailAdapter` (in-memory, queryable by tests)
  - `development` → `MailhogSmtpAdapter` (`nodemailer` `8.0.10` SMTP client → MailHog container on `localhost:1025`)
  - `staging`/`production` → `ResendEmailAdapter` (`resend` `6.12.4` SDK, `createResendClientAdapter`)
  - Throws `EmailAdapterFactoryError` at DI-container-build time if `staging`/`production` is missing `RESEND_API_KEY` or it equals the documented CI dummy literal (`re_test_dummy_for_ci_do_not_use_in_prod`) — this is defense-in-depth behind `assertProdGuardrails`
  - Port: `EmailAdapterPort` (`apps/api/src/contexts/identity/domain/ports.ts`)
  - Env: `RESEND_API_KEY` (optional in dev/test), `RESEND_FROM` (default `RestOS <noreply@resto.app>`), `RESEND_REPLY_TO` (default `support@resto.app`), `MAILHOG_HOST`/`MAILHOG_PORT` (defaults `localhost`/`1025`)
  - String catalogs: `apps/api/src/contexts/identity/infrastructure/email/email-strings.en.ts` / `email-strings.ru.ts`

**Error Tracking — LIVE (new since last analysis; previously "not yet integrated"):**

- Sentry, gated entirely by `SENTRY_DSN` presence — a documented no-op when absent, on every surface
  - `apps/api`: `@sentry/node` ^10.62.0, initialized in `apps/api/src/bootstrap-telemetry.ts` (must run before NestJS/OTel bootstrap so boot-time unhandled rejections are captured); `tracesSampleRate: 0.1`, `sendDefaultPii: false` (no request bodies — PII policy)
  - `apps/admin`: `@sentry/react` ^10.62.0 + `@sentry/vite-plugin` ^5.3.0 (source-map upload at build)
  - `apps/website`: `@sentry/nextjs` ^10.62.0
  - Env: `SENTRY_DSN` (`z.string().url().optional()` in `env.schema.ts`) — optional at all times; observability, not a correctness gate

## Data Storage

**Database:**

- PostgreSQL 16 (Alpine in dev container)
  - Runtime connection: `DATABASE_URL` — connects as `resto_app` (NOSUPERUSER NOBYPASSRLS)
  - Admin/migration connection: `DATABASE_ADMIN_URL` — connects as `resto_admin` (schema owner)
  - Auth connection: `BETTER_AUTH_DATABASE_URL` — connects as `resto_auth`. **Correction:** `resto_auth` is now **NOBYPASSRLS**, not `BYPASSRLS` as previously documented. Per `packages/db/CLAUDE.md`, RDS cannot confer `BYPASSRLS` on a non-superuser, so migration 0054 replaced the original ADR-0013 `BYPASSRLS` mechanism with explicit permissive RLS policies (`CREATE POLICY ... FOR ALL TO resto_auth USING(true)`) scoped to `resto_auth` only on `member`, `invitation`, `organization_role`, `tenants`. `assertAuthRoleNoBypass(adminUrl)` in `packages/db/src/preflight.ts` verifies this at boot/runbook time.
  - New: `DATABASE_DIRECT_URL` (optional; required outside dev/test) — a dedicated, unpooled, session-pinned connection reserved for the outbox dispatcher's `pg_try_advisory_lock` (works around Neon/PgBouncer transaction-mode pooling breaking session-level advisory locks, D-05). Falls back to `DATABASE_URL` in dev/test.
  - Client: `postgres` (postgres.js) wrapped by Drizzle ORM in `packages/db/src/client.ts`
  - Schema managed by `packages/db/src/schema/`; migrations in `packages/db/migrations/` (78 files, current head `0077_tenancy_erase_payment_refunds.sql`)
  - RLS enforced on all tenant-scoped tables; `FORCE ROW LEVEL SECURITY` prevents owner bypass

**Caching — REMOVED:**

- There is no Redis anywhere in the stack. No `ioredis` dependency in any `package.json`, no `redis`/`REDIS_URL` reference in `env.schema.ts`, no Redis service in `infra/docker/docker-compose.dev.yml`. `infra/docker/docker-compose.test.yml` carries an explicit comment forbidding it from being re-added to the test stack.
- The public menu read path (`GET /v1/menu`, `/v1/menu/items/:id`, `/v1/menu/availability`) is cached at the HTTP/CDN layer instead: version counters live in Postgres (`catalog_menu_version`, `catalog_location_stop_version` tables), read via `PostgresMenuVersionAdapter` (`apps/api/src/contexts/catalog/infrastructure/postgres-menu-version.adapter.ts`, implements `MenuVersionPort`/`StopVersionPort`), and the controller (`apps/api/src/contexts/catalog/interfaces/http/public-menu.controller.ts`) emits `ETag: "<version>"` + `Cache-Control: public, s-maxage=300, stale-while-revalidate=60` for the menu, and `s-maxage=5` for the availability/stop-list endpoint. A stop only bumps the availability ETag, never the menu ETag. Responses stay `Set-Cookie`-free by design (regression test: `menu-brand-response.e2e`) so a shared CDN cache is safe. Runbook: `docs/runbooks/menu-edge-caching.md` (per `apps/CLAUDE.md`).
- If anything in the repo (older docs, comments) still says "Redis-backed cache, optional via `REDIS_URL`" — that is stale; there is no code path that reads that variable.

**File Storage:**

- S3-compatible object storage
  - Production target: AWS S3 or Cloudflare R2 (per ADR-0011)
  - Dev substitute: MinIO (container on port 9000, console on 9001)
  - Connection: `S3_ENDPOINT` (default `http://localhost:9000`), `S3_REGION` (default `us-east-1`), `S3_BUCKET` (default `resto-dev`), `S3_ACCESS_KEY`/`S3_SECRET_KEY` (default `minio`/`minio_dev_password`) — all four have Zod `.default(...)` values matching the dev/test MinIO credentials; `assertProdGuardrails` (boot-time, non-dev/test) rejects these exact dev-default values in staging/production (ADR-0020 I-3)
  - Client: `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, `forcePathStyle: true` (required for MinIO / most S3 emulators)
  - Adapter: `S3SignedImageUrlAdapter` (`apps/api/src/contexts/catalog/infrastructure/s3-signed-image-url.adapter.ts`), implements `ImageUrlPort`; usage: presigned GET/PUT URLs for menu item images
  - Absent-config behavior: the adapter constructor throws immediately if any of the three values is empty — but since all three have Zod defaults, this branch is "structurally unreachable" per an inline comment; the real failure mode in a misconfigured prod deploy is `assertProdGuardrails` refusing boot, not a runtime exception from this adapter

## Message Broker

**NATS JetStream:**

- Version: NATS 2.10 (Alpine dev container)
- Connection: `NATS_URL`, `NATS_STREAM` (default `RESTO_EVENTS`), optional `NATS_USERNAME`/`NATS_PASSWORD`
- Client: `nats` ^2.29.1 SDK
- Publisher: `NatsJetStreamPublisher`, Subscriber: `NatsJetStreamSubscriber` (`packages/events/src/infrastructure/`)
- Stream subjects (`apps/api/src/infrastructure/nats.module.ts`): `tenancy.>`, `identity.>`, `catalog.>`, `ordering.>`, `payments.>`, `billing.>`, `dlq.>` — **`payments.>` and `dlq.>` are new** since the last analysis (which listed only `tenancy.>, identity.>, catalog.>, ordering.>, billing.>`)
- Wired via `NatsModule` (`@Global()`) in `apps/api/src/infrastructure/nats.module.ts`; both the publisher and subscriber factories soft-fail at boot (`try/catch` around `.connect()`, logs a `warn`, resolves to `null`) if NATS is unreachable — the api still comes up for health checks, readiness reports DOWN until connection succeeds
- `NATS_DISABLED=true` (read directly from `process.env`, not part of the Zod schema) skips connection entirely — CI/test escape hatch
- Transactional outbox: `packages/events/src/outbox/` (`appendToOutbox`, `claimOutboxBatch`, `OutboxDispatcher`); dispatcher now optionally uses the dedicated `DATABASE_DIRECT_URL` connection for its advisory lock (see Database section above) instead of always sharing the pooled connection
- Inbox dedup: `packages/events/src/inbox/run-deduped.ts` — atomic dedup + handler in one DB transaction

## Authentication & Identity

**Auth Provider:** Better Auth (in-process, see above)

- BA tables (`account`, `session`, `user`, `two_factor`, `verification`, `organization_role`, `member`, `invitation`) in `packages/db/src/schema/auth.ts`
- BA's "organization" concept maps directly to the `tenants` table (no separate org table)
- `resto_app` runtime role has no access to BA credential tables; only `resto_auth` (via the explicit RLS policies described above) does

**Internal API Auth:**

- `INTERNAL_API_TOKEN` — shared secret for `/internal/v1/*` routes; required outside dev
- `InternalTokenGuard` allows unauthenticated requests in `development` for tooling ergonomics

**RBAC:**

- System roles: `owner`, `admin`, `staff` (`packages/domain/src/rbac/`)
- Dynamic roles stored in BA's `organization_role` table
- Permission checker port: `apps/api/src/contexts/identity/application/ports/permission-checker.port.ts`
- Adapter: `apps/api/src/contexts/identity/infrastructure/better-auth/permission-checker.adapter.ts`
- Location-scoped access adds `member-location-scope-reader.port.ts` / `member-brand-scope-reader.port.ts` (phase 08.4) — new ports since the last analysis, layered on top of the original brand/tenant scoping

## Monitoring & Observability

**Distributed Tracing:**

- OpenTelemetry SDK (OTLP HTTP exporter)
- Bootstrap: `apps/api/src/bootstrap-telemetry.ts` — first import in `main.ts`; initializes Sentry first, then OTel, both before NestJS/its container exists
- Exporter endpoint: `OTEL_EXPORTER_OTLP_ENDPOINT` (default `http://localhost:4318`)
- Service name: `OTEL_SERVICE_NAME` (default `resto-api`)
- Auto-instrumentation enabled except `@opentelemetry/instrumentation-fs` (disabled as noise)
- Dev collector: Jaeger all-in-one 1.62.0 (container; UI on port 16686)
- `OTEL_DISABLED=true` skips SDK entirely (CI, test) — read directly from `process.env`, same pattern as `NATS_DISABLED`
- `correlationId` in event envelopes derives from the active OTel span (ADR-0020 I-4)

**Error Tracking:**

- Sentry — see APIs & External Services above. This corrects the previous "not yet integrated" claim.

**Logs:**

- `pino` ^9.5.0 — structured JSON; redacts `password`, `token`, `email`, `phone`, `params` fields (`packages/db/src/logger.ts`)
- Log level controlled by `LOG_LEVEL` env var (default `info`)

## CI/CD & Deployment

**CI Pipeline:**

- GitHub Actions — `.github/workflows/ci.yml`
- Jobs: `install`, `affected` (lint/typecheck/test/build via Nx affected), `format`, `commitlint`, `secret-scan` (gitleaks), `audit` (pnpm audit, `continue-on-error: true`), `openapi-drift`, and **`docker-api`** (Docker API boot smoke test — applies migrations, provisions roles, builds the image, boots it) — the `docker-api` job is new since the last analysis
- Affected graph computed via `nrwl/nx-set-shas@v5`

**Hosting:**

- Production target: AWS EKS (ADR-0011)
- IaC: Terraform in `infra/terraform/` (stub), Helm charts in `infra/k8s/` (stub)
- Image tags are immutable SHA-based; migrations run as a Kubernetes Job before rollout
- `apps/admin` and `apps/qr-menu` deploy as static build output (no app server needed); `apps/website` and `apps/api` need a running Node process

## Webhooks & Callbacks

**Incoming:**

- `POST /webhook/stripe` (`apps/api/src/contexts/payments/interfaces/http/stripe-webhook.controller.ts`) — Stripe payment/refund/account event delivery, signature-verified against raw body via `STRIPE_WEBHOOK_SECRET`. **This corrects the previous "None currently wired" claim** — the route is live.

**Outgoing:**

- Stripe OAuth token exchange (`exchangeOAuthCode`, Standard-account onboarding) and all other Stripe API calls in `stripe-provider.adapter.ts`
- Email sends — `sendInvitationEmail`, `sendResetPassword`, `sendVerificationEmail` (and order/refund notification emails) — routed through `EmailAdapterPort`, backed by Resend in staging/production, MailHog in dev, in-memory capture in test

## Environment Configuration

**Required env vars (non-dev/test, enforced by `envSchema.superRefine`):**

- `DATABASE_URL`, `DATABASE_DIRECT_URL` — runtime + advisory-lock Postgres connections
- `BETTER_AUTH_DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_BASE_URL`
- `ADMIN_WEB_URL`, `WEBSITE_PUBLIC_URL`
- `AUTH_COOKIE_DOMAIN` — must start with `.`
- `INTERNAL_API_TOKEN` — 16+ chars
- `AUDIT_ERASURE_SALT` — 32+ chars, immutable post-deploy
- `TRUST_PROXY` — CIDR list or hop count; literal `true` rejected outside dev/test
- `NATS_URL` — not defaulted, always required regardless of environment (`z.string().url()` with no `.optional()`)

**Notably NOT enforced outside dev/test** (present in schema but no `superRefine` gate — booting without them succeeds, failures surface later at call time):

- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_CLIENT_ID` — a production deploy with no Stripe secrets configured will boot cleanly and only fail when a payment/webhook actually needs Stripe
- `RESEND_API_KEY` — enforced instead by the email-adapter factory throwing at DI-container-build time (see Email section), a different mechanism than the schema-level `superRefine` gate used for the other vars

**Optional env vars with defaults:**

- `S3_ENDPOINT`/`S3_BUCKET`/`S3_ACCESS_KEY`/`S3_SECRET_KEY` — MinIO dev defaults, rejected in prod by `assertProdGuardrails`
- `NATS_USERNAME`/`NATS_PASSWORD` — no auth in dev
- `NATS_DISABLED`, `OTEL_DISABLED` — read directly from `process.env`, not through the Zod schema
- `SENTRY_DSN` — optional at all times, no environment gates it
- `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`
- `CORS_ALLOWED_ORIGINS` — default `http://localhost:4000,http://localhost:3001,http://localhost:3002`
- `TENANT_DEV_FALLBACK_SLUG` — dev only; refused outside `NODE_ENV=development`
- `REQUIRE_EMAIL_VERIFICATION` (default `false`)
- `RATE_LIMIT_*` vars — per-route/per-tenant/per-email rate-limit tuning (expanded significantly since the last analysis: signup, signin, reset, brand-slug-check, per-tenant signin)
- `MAILHOG_HOST`/`MAILHOG_PORT`, `RESEND_FROM`/`RESEND_REPLY_TO`

**Secrets location:**

- Dev: injected via Docker Compose environment or `.env` file (not committed); `.env.example` documents shape but has some stale default values (see STACK.md) — verify against `env.schema.ts` before trusting a default in that file
- Production: Vault / AWS Secrets Manager; injected at pod startup

---

_Integration audit: 2026-08-18_
