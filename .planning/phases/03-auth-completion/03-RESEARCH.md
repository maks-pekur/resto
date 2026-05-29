# Phase 3: Auth Completion (Security Core) — Research

**Researched:** 2026-05-29
**Domain:** Better Auth 1.4.22 hardening + Resend email transport + NATS DLQ + RBAC seed + GDPR retention
**Confidence:** HIGH (codebase + locally-resolvable BA types verified all but one ASSUMED claim — Resend free-tier limits)

## Summary

Phase 3 closes the production-readiness gap on RestOS auth. Three structurally independent surfaces are being wired: (1) a real email transport (Resend + MailHog + in-memory) feeding the three Better Auth callbacks the codebase already declares, (2) NATS DLQ wiring on consumers that currently have unbounded redelivery, and (3) RBAC role seeding via NestJS bootstrap. On top of those, eight Auth controller-level requirements close known holes (email verification, secure cookies, opt-in 2FA TOTP enable, Phase 02 carry-overs, BA hook context-stash refactor).

Local inspection of `node_modules/.pnpm/better-auth@1.4.22` confirmed every contested BA contract directly from the shipped `.d.mts` and `.mjs` sources — including three findings that meaningfully shift the plan: (a) BA 1.4.22 **already** exposes `organizationHooks.afterUpdateMemberRole` with `(member, previousRole, user, organization)`, which means the audit-gap BLOCKED disposition is now overridable by a small wiring change rather than waiting for BA ≥ 1.5; (b) BA's `request-password-reset` route **already implements** enumeration parity with timing-attack mitigation (dummy verification lookup + dummy `generateId`), so Phase 3's parity work is concentrated on the `/v1/signup` controller (which currently surfaces `signup.email_taken` distinctly — confirmed in `error-mapping.ts:46`); and (c) the `twoFactor()` plugin is short-circuited by `if (!data?.user.twoFactorEnabled) return;` on the post-sign-in hook, making it strictly opt-in per user.

**Primary recommendation:** Ship in this wave order — (Wave 1) NATS DLQ + poison-message e2e first; (Wave 2) Email adapter port + Resend/MailHog/in-memory adapters + boot guards; (Wave 3) Invitation + accept + reset + verification flows; (Wave 4) Secure cookie sweep + signup enumeration wrap + 2FA enable UI; (Wave 5) WeakMap refactor + Phase 02 carry-overs + GDPR sweep + role seed.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01: Three-environment email adapter split.** Dev → MailHog (SMTP :1025) via nodemailer adapter. Tests → in-memory `CapturedEmailAdapter`. Staging/prod → Resend via official SDK. Selection at composition time in `identity-core.module.ts` based on `NODE_ENV`. `assertProdGuardrails` extended to assert wired adapter class name AND non-empty `RESEND_API_KEY` when `NODE_ENV ∈ {staging, production}`.

**D-02: Plain text + URL from Better Auth defaults for all 3 operator emails** (invitation, password reset, email verification). No HTML templates in Phase 3.

**D-03: EN + RU localization via `Accept-Language`.** `getLocale(headers): 'en' | 'ru'` helper at email-send call site, fallback EN. 6 string constants per language (3 emails × subject+body).

**D-04: From / Reply-To.** `From: RestOS <noreply@resto.app>`, `Reply-To: support@resto.app`. Env vars: `RESEND_FROM`, `RESEND_REPLY_TO` (defaulted in dev).

**D-05: Resend adapter wraps SDK in retry-with-backoff** — 3 attempts, jittered, 250ms → 1000ms → 4000ms, total budget < 6s. On terminal failure, emit `identity.email_dispatch_failed.v1` envelope through outbox.

**D-06: Email enumeration parity.** `POST /api/auth/sign-up/email` (n/a — admin uses `/v1/signup` instead) AND the actual `/v1/signup` AND `POST /api/auth/request-password-reset` must return identical status + body + ±10ms timing for "email exists" vs "does not."

**D-07: SPF / DKIM / DMARC pre-deploy checklist** for `resto.app` at Cloudflare. Document in `infra/` checklist.

**D-08: Resend bounce-webhook handler — PLANNER DECIDES** (Phase 3 vs deferred). If deferred, document operator-facing failure mode.

**D-09: Minimal invite form in `/dashboard/settings`** — NOT a dedicated /dashboard/team page. One email input + one role dropdown + one submit button.

**D-10: Role chosen by inviting operator at invite-time**, encoded in BA invitation token, immutable through accept flow. Owner-role option ONLY available to owner-tier inviter.

**D-11: Duplicate-email auto-attach.** Invited email already has an account → BA org-plugin auto-attaches existing user to new tenant on accept.

**D-12: TTL = BA defaults.** Invitation 48h, password reset 1h.

**D-13: Extend `assertEmailAdapterWired` to all three callbacks** + remove `?? (() => Promise.resolve())` defaults at `auth.config.ts:137,152`.

**D-14: Boot-time integration test** that asserts `loadEnv` + identity module construction throws when staging/production has any of the three callbacks missing.

**D-15: `assertEmailAdapterWired` health-check extension.** Beyond function-existence: call `verifyTransport()` at boot. Resend: `GET /domains` ping; nodemailer: SMTP STARTTLS handshake; in-memory: no-op.

**D-16: Role-seed via NestJS bootstrap step.** Startup task reads `SYSTEM_ROLES` from `packages/domain/src/rbac/system-roles.ts`, idempotent UPSERT for `owner`/`admin`/`staff`. Alternative: generate static SQL migration.

**D-17: Tenant binding on email dispatch path.** Email adapter takes `tenantId` as explicit constructor/call argument. For audit/failure row emission, adapter uses `db.withTenantId(tenantId, ...)` — NOT `runInTenantContext`.

**D-18: AUTH-10 ships FIRST in wave order.** Plan must order waves so DLQ ships first; e2e poison test gates the rest.

**D-19: NATS subscriber defaults** from `packages/events/CLAUDE.md` (max_deliver:5, dlq.<subject>, max_ack_pending>1, ack_wait 30s).

**D-20: Per-tenant signin rate-limit.** Add `RATE_LIMIT_AUTH_SIGNIN_PER_TENANT_PER_MIN` env, default 60.

**D-21: Daily GDPR sweep on `invitation` + `verification` tables.** `DELETE FROM invitation WHERE expires_at < now() - 30d AND status IN ('expired','revoked','accepted')`. Same TTL sweep for stale `verification` rows.

**D-22: 2FA TOTP = opt-in, no enforcement.** Phase 3 ships `/dashboard/settings` 2FA section: enable flow + 10 recovery codes shown once + explicit "I saved them" gate.

**D-23: Lost-device recovery for owner = manual founder-side runbook** for the first 100 customers. SQL script disables 2FA + writes audit row + force-revokes sessions. NO email-recovery loop.

**D-24: `/dashboard/team` not `/dashboard/staff`** (future Phase 17 route). Phase 3 minimal invite form lives in `/dashboard/settings`.

### Claude's Discretion

- Wave ordering inside plan (subject to D-18: DLQ first). Recommended in Summary above.
- Whether bounce-webhook handler (D-08) ships in Phase 3 or defers.
- Exact API shape of `getLocale(headers)` helper — colocated with email adapter vs. shared utility.
- Whether AUTH-11 WeakMap refactor stays in Phase 3 or slips. Default: keep.
- Whether to also fix Resend free-tier visibility (at-startup log of tier/limit + circuit-breaker + WARN on 4xx-rate-limit).

### Deferred Ideas (OUT OF SCOPE)

- Full `/dashboard/team` page (Phase 17 / TEAM-01..02)
- Custom NestJS `PATCH /v1/identity/members/:id/role` (Phase 17 / TEAM-03 via `auth.api.updateMemberRole`)
- In-place role-change UI (Phase 17 / TEAM-03)
- 2FA lost-device admin-reset UI for subordinates (Phase 17 / TEAM-04)
- 2FA recovery code regeneration UI (Phase 17 / TEAM-05)
- Email-recovery loop for owner 2FA (out entirely)
- Branded HTML email templates (Phase 8 / GNOTIF)
- Per-tenant email domain (Phase 8 / GNOTIF)
- Per-user `locale` BA additionalField (MVP-2 CRM phase)

## Project Constraints (from CLAUDE.md)

From `apps/CLAUDE.md` (directly relevant to AUTH-08, sign-up enumeration, env loading):

- **Server actions: cookies must include `secure: process.env.NODE_ENV === 'production'`, `httpOnly: true`, `sameSite: 'lax'`.** AUTH-08 sweep target.
- **`INTERNAL_API_TOKEN` is server-only.** Never reach it from a client component.
- **`NEXT_PUBLIC_*` / `VITE_*` env vars MUST NOT have production fallback values.** Carry-over hit: `forgot-password/actions.ts:15` `?? 'http://localhost:3001'` violates this; fix via `@/lib/env`.
- **Server-side `fetch` must have `AbortSignal.timeout(...)`.** Resend adapter retry must respect a total < 6s budget.
- **Server actions consuming `next=` / `redirect=` query params must refine against protocol-relative URLs.** Carry-over watchpoint for reset-password and accept-invitation routes.

From `packages/domain/CLAUDE.md`:

- **System roles are immutable in code** — `SYSTEM_ROLES` is the source of truth, AUTH-09 seed reads it.
- **Adding a permission to `admin` requires a passing regression test** that pins what admin must NOT receive (e.g., `tenant:delete`, `tenant:transfer`).
- **Action names MUST NOT contain `:`** if ever serialised as `resource:action` strings — already violated by `staff:role:create`/`staff:role:update`; not in Phase 3 scope to refactor, but the test pinning admin's denied permissions should reference these tokens by-value.

From `packages/events/CLAUDE.md` (AUTH-10 critical):

- Every consumer MUST configure `max_deliver` AND a DLQ subject.
- `ack_wait` MUST be configured (default 30s, deliberately set per consumer).
- `max_ack_pending` MUST be raised above 1.
- `#run()` MUST wrap the entire `for await` in try/catch.
- External-side-effect handlers (HTTP, email, payment) MUST be idempotent by design.
- **Code in NATS subscribers uses `db.withTenant(tenantId, ...)` — never `runInTenantContext`** (ADR-0020 I-6).

From `packages/CLAUDE.md`:

- Free-text fields in domain schemas MUST have `.max(...)`.
- URL fields MUST restrict scheme via `.refine(u => /^https?:/i.test(u))`.

## Phase Requirements

| ID               | Description                                                                                                       | Research Support                                                                                                                                                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AUTH-01          | Resend SMTP adapter wired; `assertEmailAdapterWired` validates all 3 callbacks                                    | "Email adapter architecture" section + verification of `assertEmailAdapterWired` gap in `identity-core.module.ts:28`                                                                                                                                              |
| AUTH-02          | Operator added to tenant receives invitation email with single-use link                                           | BA `sendInvitationEmail` callback signature verified locally (5 fields incl. invitation id); `auth.api.createInvitation` server API confirmed; `creatorRole` enforcement at line 112 of `crud-invites.mjs`                                                        |
| AUTH-03          | Invitation link lands on `/accept-invitation`; new user completes signup, joins tenant with assigned role         | BA accept-invitation route requires authenticated session with matching email (line 335 of `crud-invites.mjs`); auto-attach for existing-account case via session match                                                                                           |
| AUTH-04          | Operator can request password reset at `/forgot-password`                                                         | Existing Phase 02 placeholder route at `apps/admin/app/forgot-password/`; carry-over fix to `actions.ts:15` localhost fallback                                                                                                                                    |
| AUTH-05          | Operator receives password reset email with single-use link, sets new password at `/reset-password`               | BA `request-password-reset` route already has enumeration parity (timing-attack mitigation lines 50-61 of `password.mjs`); existing reset-password placeholder at `apps/admin/app/reset-password/`                                                                |
| AUTH-06          | Email verification on signup; unverified accounts blocked from sensitive actions per `REQUIRE_EMAIL_VERIFICATION` | BA `emailVerification.sendOnSignUp: true` already in `auth.config.ts:140`; env var `REQUIRE_EMAIL_VERIFICATION` already declared; gating logic needs to be added at sensitive endpoints                                                                           |
| AUTH-07 (scoped) | Operator enables 2FA TOTP; 10 recovery codes shown once + confirmation gate                                       | BA `twoFactor()` plugin already loaded; verified opt-in (line 173 of `two-factor/index.mjs`); `backupCodes` sub-module exists                                                                                                                                     |
| AUTH-08          | All cookies set by server actions use `secure: NODE_ENV === 'production'`, `httpOnly: true`, `sameSite: 'lax'`    | Codebase scan: 4 server-side cookie-set sites (`api-server.ts:194`, `set-active-brand.ts:33`, `create-brand.ts:69`); pattern baseline in `active-brand-cookie.ts`                                                                                                 |
| AUTH-09 (scoped) | System roles `owner`/`admin`/`staff` seeded idempotently; BLOCKED audit-gap row updated with re-eval trigger      | `SYSTEM_ROLES` source confirmed at `packages/domain/src/rbac/system-roles.ts`; bootstrap-step pattern proven by other module providers; **NEW FINDING**: `organizationHooks.afterUpdateMemberRole` IS available in 1.4.22 — re-eval trigger note can reference it |
| AUTH-10          | NATS consumer `max_deliver` + DLQ subject configured; poison messages don't redeliver forever                     | Current `nats-subscriber.ts:60-66` configures NEITHER `max_deliver` NOR DLQ — only `ack_policy: Explicit` and `max_ack_pending`; must extend `SubscribeOptions` shape and consumer `add()` call                                                                   |
| AUTH-11          | BA context-stash `__restoSignOut` replaced with `WeakMap<object, Stash>` (no `as unknown as` cast)                | Existing pattern at `auth.config.ts:222-256, 264-307` — two stash sites (`__restoSignOut`, `__restoPasswordReset`); WeakMap keyed on `ctx.context` object                                                                                                         |

## Architectural Responsibility Map

| Capability                                             | Primary Tier          | Secondary Tier                                       | Rationale                                                                                                  |
| ------------------------------------------------------ | --------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Email send (Resend, MailHog, in-memory)                | API / Backend         | —                                                    | All three transports own outbound SMTP/API calls; no client involvement.                                   |
| Email adapter selection by NODE_ENV                    | API / Backend         | —                                                    | NestJS module wiring at composition root.                                                                  |
| `assertEmailAdapterWired` boot guard                   | API / Backend         | —                                                    | Runs in `IdentityCoreModule` factory.                                                                      |
| Invitation create + accept (BA org plugin)             | API / Backend         | Frontend Server (admin server action for inviter UI) | BA routes mounted at `/api/auth/organization/*`; admin server action calls them with `INTERNAL_API_TOKEN`. |
| `/dashboard/settings` invite form                      | Frontend Server (SSR) | Browser (Client)                                     | Next.js server action posts to BA route; tiny form-state hooks on client.                                  |
| `/accept-invitation/<id>` route                        | Frontend Server (SSR) | API / Backend                                        | RSC reads invitation by id; client submits accept. Sign-in cookie binding done server-side.                |
| `/forgot-password`, `/reset-password`                  | Frontend Server (SSR) | API / Backend                                        | Server actions only. Phase 02 placeholders already exist.                                                  |
| Email verification gate (`REQUIRE_EMAIL_VERIFICATION`) | API / Backend         | Frontend Server (UI affordance)                      | Backend rejection is authoritative; admin shell renders forbidden empty-state.                             |
| 2FA TOTP enable + recovery codes                       | API / Backend         | Frontend Server (SSR)                                | BA `twoFactor()` plugin endpoints; admin renders QR + recovery code list.                                  |
| Secure cookie sweep                                    | Frontend Server (SSR) | —                                                    | All cookies set inside `apps/admin/lib/...` and server actions.                                            |
| Role seed (`SYSTEM_ROLES` → BA `organization_role`)    | API / Backend         | Database / Storage                                   | NestJS `OnApplicationBootstrap` UPSERT, OR static SQL migration.                                           |
| NATS DLQ wiring + poison message e2e                   | API / Backend         | —                                                    | `packages/events/src/infrastructure/nats-subscriber.ts` change; e2e in `apps/api/test/e2e`.                |
| `identity.email_dispatch_failed.v1` envelope           | API / Backend         | —                                                    | Event contract in `packages/events`; emitted by adapter; picked up by audit subscriber on `identity.>`.    |
| GDPR sweep on `invitation` + `verification`            | API / Backend         | Database / Storage                                   | Daily cron in same shape as Phase 1 erasure cron; runs as `withoutTenant('GDPR retention sweep')`.         |
| AUTH-11 WeakMap refactor                               | API / Backend         | —                                                    | Internal-only change to `auth.config.ts`.                                                                  |

## Standard Stack

### Core (already installed)

| Library          | Version                       | Purpose                            | Why Standard                                                           |
| ---------------- | ----------------------------- | ---------------------------------- | ---------------------------------------------------------------------- |
| `better-auth`    | `=1.4.22` (pinned per TEN-18) | All auth flows                     | Locked pre-Phase 3; ADR/spec-aligned. `[VERIFIED: local node_modules]` |
| `@nestjs/common` | `^10.4.15`                    | Module wiring, DI                  | Existing stack. `[VERIFIED: package.json]`                             |
| `zod`            | `^3.24.1`                     | DTO + envelope schemas             | Existing stack. `[VERIFIED: package.json]`                             |
| `drizzle-orm`    | `^0.45.2`                     | DB access (BA adapter, GDPR sweep) | Existing stack. `[VERIFIED: package.json]`                             |
| `nats`           | `^2.29.1`                     | DLQ subject wiring                 | Existing stack. `[VERIFIED: package.json]`                             |

### Supporting (to install)

| Library             | Version                            | Purpose                                                  | When to Use                                                                        |
| ------------------- | ---------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `resend`            | latest 4.x (verify before install) | Resend HTTPS API client for staging/prod email transport | Wrap with retry-with-backoff per D-05. `[ASSUMED]` — see Package Legitimacy Audit. |
| `nodemailer`        | latest 6.x (verify before install) | SMTP transport for MailHog (dev only)                    | Composition-time selection when `NODE_ENV==='development'`. `[ASSUMED]`            |
| `@types/nodemailer` | latest 6.x                         | TypeScript types for nodemailer (devDependency)          | Required by `strict` mode in api tsconfig. `[ASSUMED]`                             |

### Alternatives Considered

| Instead of                      | Could Use                                           | Tradeoff                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resend` SDK                    | Raw `fetch` against `https://api.resend.com/emails` | Saves a dependency but loses Resend's `idempotencyKey` ergonomics, webhook signature helpers, and TS types. Not worth the win.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `nodemailer` for dev            | `resend` with a dev sandbox project                 | Resend sandbox costs an API token + a verified sandbox domain in dev environments. MailHog is already in the dev `docker-compose.yml`. Don't change it.                                                                                                                                                                                                                                                                                                                                                                                            |
| NestJS bootstrap-step role seed | Static SQL migration in `packages/db/migrations/`   | Per CTO LOW-2, both are acceptable. SQL migration is preferable IF it can be generated once from `SYSTEM_ROLES` and committed (so `pnpm db:migrate` remains the only DDL boundary). Bootstrap-step keeps domain-of-truth coupling at runtime instead of generation-time. **Recommendation: bootstrap-step**, because `dynamicAccessControl: true` (already on `auth.config.ts:151`) means the `organization_role` table accepts custom roles at runtime — the seed should converge with what's in BA at startup, not at migration-generation time. |

### Installation

```bash
pnpm --filter @resto/api add resend nodemailer
pnpm --filter @resto/api add -D @types/nodemailer
```

**Version verification (planner: run before install):**

```bash
npm view resend version          # confirm 4.x latest
npm view nodemailer version       # confirm 6.x latest
npm view @types/nodemailer version
```

Document the verified version + publish date when shipping. Pin to caret per existing `package.json` convention.

## Package Legitimacy Audit

> slopcheck CLI was not available in this research environment (no `pip install` permission). Per the Package Legitimacy Gate fallback, both new packages are tagged `[ASSUMED]`. The planner MUST add a `checkpoint:human-verify` task before the install step that:
>
> 1. Confirms `npm view resend` shows authoritative source `github.com/resendlabs/resend-node` and download volume in the 10k+/wk range.
> 2. Confirms `npm view nodemailer` shows authoritative source `github.com/nodemailer/nodemailer` and download volume in the 1M+/wk range.
> 3. Runs `npm view resend scripts.postinstall` and `npm view nodemailer scripts.postinstall` — both should be empty.

| Package             | Registry | Age | Downloads | Source Repo                                  | slopcheck   | Disposition                                          |
| ------------------- | -------- | --- | --------- | -------------------------------------------- | ----------- | ---------------------------------------------------- |
| `resend`            | npm      | —   | —         | github.com/resendlabs/resend-node (expected) | unavailable | `[ASSUMED]` — checkpoint:human-verify before install |
| `nodemailer`        | npm      | —   | —         | github.com/nodemailer/nodemailer (expected)  | unavailable | `[ASSUMED]` — checkpoint:human-verify before install |
| `@types/nodemailer` | npm      | —   | —         | DefinitelyTyped                              | unavailable | `[ASSUMED]` — checkpoint:human-verify before install |

## Architecture Patterns

### System Architecture Diagram

```
                              ┌────────────────────────────────┐
                              │   apps/admin (Next.js RSC)     │
                              │  /login /signup /forgot-pwd    │
                              │  /reset-password               │
                              │  /accept-invitation/[id]   ←NEW│
                              │  /dashboard/settings           │
                              │   (invite form + 2FA section)  │
                              └─────────────┬──────────────────┘
                                            │ apiFetch (INTERNAL_API_TOKEN)
                                            ▼
              ┌──────────────────────────────────────────────────────┐
              │   apps/api  (NestJS modular monolith)                │
              │                                                      │
              │   /v1/signup ──► SignUpService                       │
              │                  └ wraps "email taken" → uniform 200 │  ← D-06 wrap
              │   /api/auth/*  ──► Better Auth handler               │
              │                    sign-in, sign-out, sign-up,       │
              │                    request-password-reset,           │
              │                    reset-password, verify-email,     │
              │                    organization/* (invite, accept,   │
              │                       update-member-role, list-…),   │
              │                    two-factor/* (enable, verify,     │
              │                       backup-codes, totp)            │
              │                                                      │
              │   ┌────── BA hooks (auth.config.ts) ──────┐          │
              │   │ sendInvitationEmail (callback)        │          │
              │   │ sendResetPassword   (callback)        │          │
              │   │ sendVerificationEmail (callback)      │──┐       │
              │   └─────────────────┬─────────────────────┘  │       │
              │                     │                        │       │
              │                     ▼                        │       │
              │   ┌─────────────── EMAIL_ADAPTER_PORT ────┐  │       │
              │   │ NestJS DI; one of three concrete:    │  │       │
              │   │  • ResendEmailAdapter (staging/prod) │  │       │
              │   │  • MailhogSmtpAdapter (dev)          │  │       │
              │   │  • CapturedEmailAdapter (test)       │  │       │
              │   │ All implement sendInvitation,        │  │       │
              │   │   sendResetPassword,                 │  │       │
              │   │   sendVerification + verifyTransport │  │       │
              │   └────────────┬──────────────────────────┘  │       │
              │                │ retry+backoff (Resend only) │       │
              │                │ on terminal failure ►       │       │
              │                ▼                              │       │
              │   identity.email_dispatch_failed.v1 (outbox) │       │
              │                │                              │       │
              │                ▼                              │       │
              │   ┌──── Audit context ────────┐               │       │
              │   │ NatsAuditSubscriber       │ ← DLQ wiring  │       │
              │   │   identity.>              │   AUTH-10     │       │
              │   │     max_deliver: 5        │               │       │
              │   │     dlq.identity.>        │               │       │
              │   │     ack_wait: 30s         │               │       │
              │   └───────────────────────────┘               │       │
              │                                               │       │
              │   GDPR retention cron (daily) ────────────────┘       │
              │     DELETE FROM invitation WHERE expired                │
              │     DELETE FROM verification WHERE expired              │
              │                                                      │
              │   AUTH-09 role seed (OnApplicationBootstrap)        │
              │     SYSTEM_ROLES → organization_role (idempotent)    │
              └──────────────────────────────────────────────────────┘
                                            │
                                            ▼
                              ┌────────────────────────────┐
                              │  Postgres (resto_auth role)│
                              │   BA tables                │
                              │   organization_role        │
                              │   invitation, verification │
                              │   two_factor backup_codes  │
                              └────────────────────────────┘
```

### Recommended File Structure (new files Phase 3 adds)

```
apps/api/src/contexts/identity/
├── domain/
│   ├── ports.ts                                           # add EMAIL_ADAPTER_PORT Symbol + interface
│   └── email-locale.ts                                    # 'en' | 'ru' constants
├── application/
│   ├── invite-member.service.ts                           # owner-can-grant-owner enforcement (delegates to BA via INTERNAL_API_TOKEN)
│   ├── enable-two-factor.service.ts                       # wraps BA twoFactor enable + recovery-codes shape
│   └── ports/
│       └── (reuse existing PERMISSION_CHECKER + IDENTITY_EVENT_EMITTER)
├── infrastructure/
│   ├── email/
│   │   ├── resend.adapter.ts                              # Resend SDK + retry-with-backoff (D-05)
│   │   ├── mailhog-smtp.adapter.ts                        # nodemailer SMTP localhost:1025
│   │   ├── captured.adapter.ts                            # in-memory for tests
│   │   ├── get-locale.ts                                  # Accept-Language → 'en' | 'ru'
│   │   ├── email-strings.en.ts                            # 6 strings (3 emails × subject+body)
│   │   ├── email-strings.ru.ts                            # 6 strings
│   │   └── email-adapter.factory.ts                       # selects by NODE_ENV
│   └── role-seed.ts                                       # idempotent UPSERT of SYSTEM_ROLES into organization_role
├── interfaces/http/
│   └── invite-member.controller.ts                        # POST /v1/identity/invitations (delegates to BA but adds tenant/role guard)
├── identity-core.module.ts                                # MODIFIED: REQUIRED_EMAIL_CALLBACKS to 3; wire EMAIL_ADAPTER_PORT
└── infrastructure/better-auth/
    └── auth.config.ts                                     # MODIFIED: remove NOOP defaults at L137,152; WeakMap refactor at L222-256, L264-307; pass tenant on email callbacks

apps/api/src/bootstrap/
├── prod-guardrails.ts                                     # MODIFIED: add Resend assertion (D-01 enforcement)
└── role-seed.bootstrap.ts                                 # NEW: OnApplicationBootstrap consumer (D-16)

apps/api/src/contexts/audit/
└── (no changes — picks up identity.email_dispatch_failed.v1 via identity.> subject)

apps/api/src/contexts/tenancy/
└── application/retention/gdpr-retention.service.ts        # MODIFIED or NEW: extend daily sweep to invitation+verification

apps/api/src/config/env.schema.ts                          # MODIFIED: RATE_LIMIT_AUTH_SIGNIN_PER_TENANT_PER_MIN, RESEND_API_KEY, RESEND_FROM, RESEND_REPLY_TO, MAILHOG_HOST, MAILHOG_PORT

packages/events/src/contracts/identity.ts                  # MODIFIED: add IdentityEmailDispatchFailedV1 contract
packages/events/src/infrastructure/nats-subscriber.ts      # MODIFIED: max_deliver + dlq.<subject> options + #run() try/catch confirmation

apps/admin/app/
├── (existing) login/, signup/, forgot-password/, reset-password/  # actions wired for real
├── accept-invitation/                                     # NEW route
│   ├── page.tsx                                           # RSC reads invitation by id
│   └── [id]/page.tsx + actions.ts                         # accept flow
├── dashboard/settings/
│   ├── invite-form-client.tsx                             # NEW: one-input invite form
│   ├── invite-action.ts                                   # NEW: server action calling /v1/identity/invitations
│   ├── two-factor-enable-client.tsx                       # NEW: TOTP QR + 10 recovery codes display
│   └── two-factor-actions.ts                              # NEW: server actions for enable + verify + recovery-code save
apps/admin/lib/
└── env.ts                                                 # already there; receives ADMIN_WEB_URL accessor (no change needed for D-13 fix)

apps/admin/app/forgot-password/actions.ts                  # FIX: remove L15 localhost fallback antipattern → use adminOrigin()
apps/admin/app/login/actions.ts                            # REFACTOR: 3-call fan-out per Phase 02 carry-over (line 36-74)

apps/api/test/e2e/
├── nats-dlq-poison.e2e.spec.ts                            # NEW: AUTH-10 gating test
├── identity-invitation.e2e.spec.ts                        # NEW: AUTH-02/03 + owner-only-grants-owner regression
├── identity-password-reset.e2e.spec.ts                    # NEW or EXTEND: AUTH-04/05 + enumeration parity
├── identity-email-verification.e2e.spec.ts                # NEW: AUTH-06 sensitive-action block
├── identity-two-factor.e2e.spec.ts                        # NEW: AUTH-07 enable + recovery codes
├── auth-cookies.e2e.spec.ts                               # NEW: AUTH-08 secure cookie sweep proof
├── role-seed.e2e.spec.ts                                  # NEW: AUTH-09 idempotency + admin-denied-permissions regression
└── gdpr-retention.e2e.spec.ts                             # EXTEND: invitation+verification sweep

infra/runbooks/
└── 2fa-recovery.md                                        # NEW: founder-side manual 2FA reset SQL runbook (D-23)
scripts/
└── reset-2fa.ts                                           # NEW: tsx CLI used by the runbook
```

### Pattern 1: BA email callback signature (`sendInvitationEmail`)

**What:** BA's organization plugin calls back to userland code with a 5-field object (`id`, `role`, `email`, `organization`, `invitation`) + `inviter: Member & { user: User }` + an optional `request: Request`. URL construction is the userland responsibility (BA docs: "Note: Better Auth doesn't generate invitation URLs").

**When to use:** Every code path that mounts BA's organization plugin and accepts invitations from a web browser. Phase 3's email adapter implements this signature.

**Example:**

```ts
// Source: node_modules/better-auth/dist/plugins/organization/types.d.mts L197-228
//         (BA 1.4.22 — verified locally)
sendInvitationEmail: async (data) => {
  // data.id = invitation id
  // data.role = role string (e.g. 'admin')
  // data.email = invitee email (lowercased by BA before this call)
  // data.organization = full Organization row
  // data.invitation = full Invitation row (incl. expiresAt)
  // data.inviter = Member & { user: User } — the operator who clicked Invite
  const url = `${process.env.ADMIN_WEB_URL}/accept-invitation/${data.id}`;
  const locale = getLocale(request?.headers); // CTO LOW-1 caveat: inviter's browser locale
  await emailAdapter.sendInvitation({
    to: data.email,
    locale,
    url,
    tenantSlug: data.organization.slug,
    inviterName: data.inviter.user.name ?? data.inviter.user.email,
    tenantId: data.organization.id as TenantId, // for db.withTenantId in error path (D-17)
  });
};
```

### Pattern 2: BA `request-password-reset` enumeration parity (already correct)

**What:** BA 1.4.22 already implements enumeration parity for `/api/auth/request-password-reset` — both branches return identical body (`{status: true, message: 'If this email exists...'}`), and timing-attack mitigation is built in (dummy `generateId(24)` + dummy `findVerificationValue('dummy-verification-token')` in the not-found branch).

**When to use:** Verifying D-06 doesn't need wrapping work for reset. The Phase 3 e2e proof is to assert that response body and ±10ms timing parity hold under realistic conditions.

**Example:**

```ts
// Source: node_modules/better-auth/dist/api/routes/password.mjs L48-80
const user = await ctx.context.internalAdapter.findUserByEmail(email, {
  includeAccounts: true,
});
if (!user) {
  // We simulate the verification token generation and the database lookup
  // to mitigate timing attacks.
  generateId(24);
  await ctx.context.internalAdapter.findVerificationValue(
    'dummy-verification-token',
  );
  return ctx.json({
    status: true,
    message:
      'If this email exists in our system, check your email for the reset link',
  });
}
// ... happy path returns SAME json shape
return ctx.json({
  status: true,
  message:
    'If this email exists in our system, check your email for the reset link',
});
```

### Pattern 3: `/v1/signup` enumeration parity (currently broken — Phase 3 fix)

**What:** RestOS's `/v1/signup` controller (NOT BA's `/api/auth/sign-up/email`) currently returns `409 Conflict` with `code: 'signup.email_taken'` when the email is already in use. This violates D-06.

**Fix:** Wrap in `error-mapping.ts` so the email-taken error becomes the same `201 Created`-shaped response as a successful signup (without actually creating duplicates). Drop the distinct `code`. Add timing-attack mitigation in the service to match the happy-path cost (pseudo-hash the password even when the email collides, then discard).

**Trade-off:** This breaks the admin signup UI's specific "email taken" friendly message at `apps/admin/app/signup/actions.ts:34`. Since the user-facing message would already need to drop the distinction for parity, the friendly mapping has to collapse into a generic "Check your email to verify your account" message — which the operator sees regardless of whether they actually have one. **This is the intended behavior for D-06**, but the planner needs a one-line UX decision: do we show a "We sent verification" toast and bounce to `/login`, or do we add a small "Already have an account? Log in" inline link below? Recommend the toast + login bounce; it doesn't degrade the UX for the legitimate new-signup case and removes the enumeration channel for the malicious one.

### Pattern 4: NATS DLQ subject configuration

**What:** Current `nats-subscriber.ts:60-66` configures only `ack_policy` and `max_ack_pending`. NATS JetStream supports `max_deliver` (cap redeliveries) plus the convention of routing exhausted messages to `dlq.<original_subject>` via a JetStream republish rule on the stream OR a userland fallback subject.

**Implementation note:** NATS JetStream consumer config accepts `max_deliver: number`. After `max_deliver` redeliveries, the message is permanently lost UNLESS the stream has a `republish` rule or the consumer code catches the message manually after the threshold and re-publishes to a DLQ subject. Two viable paths:

1. **Stream-level config (preferred):** Set `republish: { src: "<stream-subject>", dest: "dlq.<subject>", headers_only: false }` on the stream — but this republishes on EVERY delivery, not on terminal failure. NOT what we want.
2. **Consumer-side fallback (recommended for Phase 3):** The subscriber wrapper detects when `msg.info.redeliveryCount >= max_deliver` AND the handler still throws, then publishes the envelope to `dlq.<subject>` before ACK. This is what `packages/events/CLAUDE.md` describes.

**Example (consumer-side fallback):**

```ts
// MODIFIED: packages/events/src/infrastructure/nats-subscriber.ts
// Add SubscribeOptions { maxDeliver?: number; ackWaitMs?: number; dlqPublisher?: EventPublisher }
async subscribe(options: SubscribeOptions): Promise<EventSubscription> {
  await this.#jsm.consumers.add(this.#stream, {
    durable_name: options.durableName,
    filter_subject: options.subject,
    ack_policy: AckPolicy.Explicit,
    deliver_policy: DeliverPolicy.All,
    max_ack_pending: options.maxInFlight ?? 10,    // ≥ 1 per packages/events/CLAUDE.md
    max_deliver: options.maxDeliver ?? 5,
    ack_wait: (options.ackWaitMs ?? 30_000) * 1_000_000, // nanoseconds
  });
  // ...
}

// In #run():
for await (const msg of messages) {
  if (this.#stopped) { msg.nak(); break; }
  try {
    const envelope = EventEnvelope.parse(JSON.parse(new TextDecoder().decode(msg.data)));
    await this.#handler(envelope);
    msg.ack();
  } catch (err) {
    const info = msg.info; // { redeliveryCount, ... } per NATS docs
    if (info.redeliveryCount >= (options.maxDeliver ?? 5) - 1) {
      // Final delivery attempt: republish to DLQ and ack so the consumer moves on.
      const dlqSubject = `dlq.${options.subject.replace(/\.>$/, '')}.${info.subject}`;
      await dlqPublisher.publishRaw(dlqSubject, msg.data);
      logger.error({ subject: info.subject, dlq: dlqSubject, err }, 'Poison message routed to DLQ');
      msg.ack();
    } else {
      msg.nak();
    }
  }
}
```

### Pattern 5: AUTH-11 WeakMap context-stash refactor

**What:** Current `auth.config.ts:222-256` and `:264-307` use `(ctx.context as { __restoSignOut?: ... }).__restoSignOut = ...` to stash state between `hooks.before` and `hooks.after`. WeakMap keyed on `ctx.context` removes the `as unknown as` family and the property pollution.

**Example:**

```ts
// NEW shape in auth.config.ts
interface SignOutStash {
  readonly userId: string;
  readonly tenantId: string;
  readonly sessionId: string;
}
interface PasswordResetStash {
  readonly userId: string;
  readonly sessionCount: number;
}
const signOutStash = new WeakMap<object, SignOutStash>();
const passwordResetStash = new WeakMap<object, PasswordResetStash>();

// hooks.before for sign-out:
signOutStash.set(ctx.context, {
  userId: found.user.id,
  tenantId: activeOrgId,
  sessionId: found.session.id,
});

// hooks.after for sign-out:
const stash = signOutStash.get(ctx.context);
if (!stash) return;
// ...
signOutStash.delete(ctx.context); // cleanup (WeakMap GC handles dropped refs too)
```

### Anti-Patterns to Avoid

- **Using BA's `/api/auth/sign-up/email` for operator signup.** RestOS uses `/v1/signup` (a custom controller that wraps BA `signUpEmail` + creates the tenant). The Phase 02 admin signup form already posts there; do not re-route to BA directly in Phase 3.
- **Calling `runInTenantContext` in the email adapter.** Per ADR-0020 I-6 and D-17 explicitly, the email adapter must bind tenant via `db.withTenantId(tenantId, ...)` — the BA hook fires on the `resto_auth` connection which BYPASSRLS, so there's no ALS frame to rely on. The existing `IdentityEventEmitterAdapter` (`identity-event-emitter.adapter.ts:30`) sets the precedent.
- **Calling `EventEnvelope` literal with `randomUUID()` for correlationId.** ESLint rule already blocks this. Use `buildEnvelope` from `@resto/events` for `identity.email_dispatch_failed.v1`.
- **Adding a custom `PATCH /v1/identity/members/:id/role` endpoint in Phase 3.** Out of scope per CONTEXT D-22. Re-emerges in Phase 17 / TEAM-03 via BA's `auth.api.updateMemberRole` (proven to exist in 1.4.22 at `/organization/update-member-role`).
- **Branded HTML emails.** D-02 explicit no.
- **Email-recovery loop for owner 2FA lost-device.** D-23 explicit no.
- **Adding a `/dashboard/team` route in Phase 3.** D-24 — that's Phase 17.

## Don't Hand-Roll

| Problem                                              | Don't Build                           | Use Instead                                                                          | Why                                                                                                                                                                                     |
| ---------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invitation token generation + verification           | Custom signed token + verify endpoint | `auth.api.createInvitation` + BA's existing `/organization/accept-invitation` route  | BA already does TTL enforcement (48h default verified), single-use semantics, member auto-attach on accept, organizationHooks before/after. Building custom = re-implementing all four. |
| Password reset token TTL + single-use                | Custom verification table + cron      | BA's `verification` table + `resetPasswordTokenExpiresIn` (default 1h, configurable) | Verified at `password.mjs:63-69`. BA's `internalAdapter.findVerificationValue` enforces single-use by `deleteVerificationValue` after consumption.                                      |
| TOTP secret generation + verification                | Custom secret + otp library           | BA `twoFactor()` plugin's TOTP sub-module                                            | Plugin loaded at `auth.config.ts:154`; backup-codes sub-module exists; QR + secret generation built in.                                                                                 |
| Recovery code generation + check                     | Custom random + bcrypt-each           | BA `twoFactor()` plugin's `backup-codes` sub-module                                  | Same module already shipped. The "10 codes shown once + saved-confirmation" UX is pure admin-frontend, not core.                                                                        |
| HMAC-signed app cookies                              | Custom HMAC                           | Reuse `apps/admin/lib/active-brand-cookie.ts` pattern                                | Phase 02 established this; AUTH-08 sweep aligns all cookies on its `secure/httpOnly/sameSite` baseline.                                                                                 |
| Email enumeration timing parity for reset            | Custom timing equalizer               | BA's built-in dummy-lookup parity                                                    | Verified in `password.mjs:51-61`.                                                                                                                                                       |
| Tenant-scoped event emission outside HTTP middleware | Manual ALS frame seeding              | `db.withTenantId(tenantId, ...)` per ADR-0020 I-6                                    | Precedent: `IdentityEventEmitterAdapter`.                                                                                                                                               |
| Outbox publishing on email failure                   | Custom retry table                    | `buildEnvelope` + `appendToOutbox` + existing `OutboxDispatcher`                     | Email-failure envelope rides the same path as every other identity event.                                                                                                               |
| Resend webhook signature verification                | Custom HMAC verify                    | Resend SDK's webhook helpers (if shipped)                                            | If D-08 ships, prefer SDK signature verifier over hand-rolling SHA-256. `[ASSUMED]` — confirm SDK shape via `npm view resend types` at install time.                                    |
| SMTP transport (dev / MailHog)                       | Raw `net.Socket`                      | `nodemailer` createTransport                                                         | Stock SMTP client; localhost:1025 no-auth.                                                                                                                                              |

**Key insight:** Phase 3 is overwhelmingly about wiring existing libraries, not authoring crypto or transport code. Every "should we hand-roll X?" question for this phase resolves to **no** — the BA + nodemailer + Resend stack already covers it.

## Runtime State Inventory

> Phase 3 is wiring + small data migration (role seed) — not a rename. Most categories are N/A. Listing anyway for completeness.

| Category                             | Items Found                                                                                                                                                                                                                                                                                                                                                  | Action Required                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Stored data                          | (a) `organization_role` rows for `owner`/`admin`/`staff` need to be UPSERTed at first boot to match `SYSTEM_ROLES`. (b) Existing `verification` rows older than their `expires_at` aren't being cleaned today — Phase 3's GDPR sweep migrates the steady-state behavior, no historical migration needed.                                                     | Code edit: role-seed bootstrap (AUTH-09). Daily cron extension (D-21). |
| Live service config                  | None — no external dashboards or API-only configs touched.                                                                                                                                                                                                                                                                                                   | None.                                                                  |
| OS-registered state                  | None — no scheduled tasks, no systemd units.                                                                                                                                                                                                                                                                                                                 | None.                                                                  |
| Secrets/env vars                     | New envs: `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_REPLY_TO`, `MAILHOG_HOST`, `MAILHOG_PORT`, `RATE_LIMIT_AUTH_SIGNIN_PER_TENANT_PER_MIN`. `RESEND_API_KEY` must be provisioned in Vault (or equivalent secrets store) for staging + prod BEFORE the Phase 3 staging deploy. SOPS/local-dev path needs RESEND_API_KEY too (or dev defaults to MailHog only). | Update `.env.example`; document in deploy checklist.                   |
| Build artifacts / installed packages | New runtime deps: `resend`, `nodemailer`. New devDep: `@types/nodemailer`. `pnpm-lock.yaml` regenerates.                                                                                                                                                                                                                                                     | `pnpm install` after package.json edit.                                |

**Nothing found in OS-registered state, live-service-config:** Verified by scope review — Phase 3 does not touch any external dashboards, K8s job definitions outside the existing migrations job, or Cloudflare ACLs. SPF/DKIM/DMARC DNS records (D-07) are a deploy-time checklist item, not a runtime state change of the running system.

## Common Pitfalls

### Pitfall 1: Email enumeration leakage via the `/v1/signup` controller

**What goes wrong:** Even after wrapping `sendResetPassword` enumeration (already correct in BA), attackers query `/v1/signup` with a list of emails and observe which return `409` + `code: signup.email_taken` vs `201`.

**Why it happens:** RestOS's signup is a custom controller, not BA's. `apps/api/src/contexts/identity/interfaces/http/error-mapping.ts:46` surfaces a distinct error code for taken-email.

**How to avoid:** Wrap the controller so both branches return the same 200-style body (e.g., `{status: 'pending_verification'}`) AND the signup service does a constant-time delay (or pseudo-hash) when the email is already taken to equalize timing.

**Warning signs:** A `Set-Cookie` is present on the success branch but absent on the email-taken branch — the response shape itself remains an enumeration channel.

### Pitfall 2: NATS DLQ that ACKs poison-then-republishes vs. NAKs forever

**What goes wrong:** Naïve "set max_deliver: 5 and call it done" causes BA-side messages to disappear after 5 redeliveries with NO trace. Poison-message bug class.

**Why it happens:** JetStream consumers without an explicit DLQ subject just drop expired-redelivery messages. The conventional `dlq.<subject>` pattern requires userland republish before ack.

**How to avoid:** Pattern 4 above — check `msg.info.redeliveryCount` and republish to `dlq.<original_subject>` on the final redelivery before ack. The e2e test (D-18) publishes a deliberately broken envelope, asserts max_deliver:5 reached, asserts message lands in `dlq.identity.>`, AND asserts an `identity.email_dispatch_failed.v1`-style alert envelope was emitted (NB: AUTH-10's alert envelope is distinct from D-05's email-dispatch-failed envelope; the planner should reuse one event contract for both flows to avoid noise — recommendation: emit `identity.email_dispatch_failed.v1` with a `reason: 'dlq_routed' | 'resend_failed'` discriminant).

**Warning signs:** `kv get $JS.STREAM.RESTO_EVENTS.CONSUMER.audit-recorder-identity` shows growing `num_redelivered`; messages disappear after 5 attempts without showing up on any `dlq.*` subject.

### Pitfall 3: BA-hooked email callback runs without ALS tenant context

**What goes wrong:** Adapter tries to emit `identity.email_dispatch_failed.v1` via `db.withTenant(append)` — fails because no tenant is bound in ALS (BA hooks run outside the HTTP middleware that seeds it).

**Why it happens:** BA hooks fire on the `resto_auth` BYPASSRLS connection. ADR-0020 I-6 forbids `runInTenantContext` outside HTTP middleware.

**How to avoid:** D-17 — adapter receives `tenantId` as an explicit argument from the invitation/session row (e.g., `data.organization.id` for invitation) and emits via `db.withTenantId(tenantId, append)`. The `IdentityEventEmitterAdapter.emit` at `identity-event-emitter.adapter.ts:30` is the proven pattern.

**Warning signs:** Tests pass in isolation (where the test seed binds ALS); production logs show `getTenantContext() returned null` in WARN logs from `buildEnvelope`.

### Pitfall 4: Forgot-password localhost fallback ships to prod

**What goes wrong:** `apps/admin/app/forgot-password/actions.ts:15` returns `'http://localhost:3001'` when `ADMIN_WEB_URL` is unset. A misconfigured prod deploy sends reset emails pointing to localhost — the reset link is dead for every real user.

**Why it happens:** Phase 02 deferred this carry-over to Phase 3 (deferred-items.md).

**How to avoid:** Migrate to `import { adminOrigin } from '@/lib/env'` (already exported at `apps/admin/lib/env.ts:70`). Module-load env validation throws in non-dev when `ADMIN_WEB_URL` is missing, so the deploy fails loudly instead of silently misrouting reset links.

**Warning signs:** Prod log shows `http://localhost:3001/reset-password/...` URLs in email-send body field; users report "the link goes nowhere."

### Pitfall 5: Owner-role escalation via the invite form

**What goes wrong:** Admin operator submits the invite form with `role=owner` in a hand-crafted request; the backend doesn't enforce "only owner can invite owner."

**Why it happens:** Trusting the dropdown's UI-side filtering instead of an authoritative server check.

**How to avoid:** GOOD NEWS — BA already enforces this at `crud-invites.mjs:112`: `if (member.role !== creatorRole && roles.split(",").includes(creatorRole)) throw new APIError("FORBIDDEN", ...)`. With `creatorRole: 'owner'` (BA default per `OrganizationOptions.creatorRole`), an admin trying to invite owner gets 403 from BA. The Phase 3 server-side regression test simply has to assert that the BA 403 surfaces to the admin UI as a friendly empty-state, not a stack trace.

**Warning signs:** New invitation rows with `role='owner'` whose `inviterId` references a non-owner member.

### Pitfall 6: `verification` table grows unboundedly on user-not-found resets

**What goes wrong:** GDPR audit notices BA `verification` rows persisting past their `expires_at`. Reset-password rows accumulate when users abandon the flow.

**Why it happens:** BA does NOT have a built-in cron that deletes expired verification rows. It deletes only on consumption.

**How to avoid:** D-21 daily sweep — extend the existing Phase 1 erasure cron to delete `verification` rows where `expires_at < now() - 1 hour` (be more generous than `expires_at` itself to avoid race conditions with in-flight reset clicks). Run under `withoutTenant('GDPR retention sweep — verification')`.

**Warning signs:** Postgres pg_stat_user_tables shows `verification.n_live_tup` growing monotonically.

### Pitfall 7: 2FA enable flow allows partial activation (recovery codes shown, not saved)

**What goes wrong:** Operator clicks "Enable 2FA," BA generates secret + backup codes, codes display, operator closes tab. Next login requires TOTP they haven't set up — locked out.

**Why it happens:** Missing "I saved them" confirmation gate before BA persists `twoFactorEnabled: true`.

**How to avoid:** D-22 explicit — UI has copy-to-clipboard + checkbox "I saved my recovery codes" + Confirm button that POSTs the verification. BA's `twoFactor()` has `skipVerificationOnEnable?: boolean` (default `false`) — leave it at default so BA requires verification before activation. Verified in `two-factor/types.d.mts:30-32`.

**Warning signs:** Users report "I can't log in after enabling 2FA" with a fresh `two_factor.enabled = true` row but no recovery-code usage history.

### Pitfall 8: BA `requireEmailVerificationOnInvitation: false` (default) allows unverified users to accept invitations

**What goes wrong:** Attacker signs up with `victim@example.com` (which they don't own), the legitimate Bob clicks Bob's invite-link, the attacker-controlled session is already bound to that email, the attacker accepts the invite into Bob's org.

**Why it happens:** The accept-invitation route only matches `session.user.email === invitation.email` — it doesn't require the session user to have a verified email. If `requireEmailVerificationOnInvitation` is false (BA default), an unverified user can accept.

**How to avoid:** Set `requireEmailVerificationOnInvitation: true` on the `organization()` plugin config. The error code BA returns is `EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION` — map to a friendly "Please verify your email first" empty-state. Combine with `REQUIRE_EMAIL_VERIFICATION=true` on the runtime env for AUTH-06.

**Warning signs:** A `member` row appears for `userId` whose `user.emailVerified = false`.

## Common BA Code Examples (Verified)

### Sign-up enumeration parity wrap

```ts
// MODIFIED: apps/api/src/contexts/identity/interfaces/http/error-mapping.ts
// Drop the distinct error code; let the controller decide whether to surface
// the body or to swap in a generic "verification email sent" shape.
//
// Source: BA password.mjs L51-61 enumeration parity pattern.
```

```ts
// MODIFIED: apps/api/src/contexts/identity/interfaces/http/signup.controller.ts
// Both happy + email-taken branches return the same 201 + body. On email-taken,
// burn time equivalent to the password hash + tenant insert so timing parity holds.
//
// (Pseudo-code; the actual signature stays the same as current.)
async create(@Body(...) input, @Res(...) reply) {
  const result = await wrap(() => this.signup.executeOrTimeEqualize(input));
  // executeOrTimeEqualize: catches EmailTakenError internally, runs a no-op DB write
  // that costs roughly the same as the real path, then returns a "pending_verification"
  // shape that LOOKS like a success but contains no real cookies / tenant ids.
}
```

### Boot-time role seed (AUTH-09, D-16)

```ts
// NEW: apps/api/src/bootstrap/role-seed.bootstrap.ts
import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import {
  AUTH_DRIZZLE_TOKEN,
  type AuthDrizzle,
} from '../contexts/identity/identity.tokens';
import { SYSTEM_ROLES } from '@resto/domain';
// Source: packages/domain/src/rbac/system-roles.ts L1-37 (verified locally)

@Injectable()
export class RoleSeedBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(RoleSeedBootstrap.name);
  constructor(@Inject(AUTH_DRIZZLE_TOKEN) private readonly auth: AuthDrizzle) {}

  async onApplicationBootstrap(): Promise<void> {
    for (const [slug, permissions] of Object.entries(SYSTEM_ROLES)) {
      const permissionJson = JSON.stringify(permissions);
      // INSERT ... ON CONFLICT (organizationId IS NULL, name) DO UPDATE SET permission=...
      // — note: organizationId is NULL for system roles (they apply across all orgs)
      // PER BA SCHEMA: organization_role uses (organization_id, role) composite unique
      // and supports a global-role-per-org pattern via id only — verify against
      // packages/db/src/schema/auth.ts before locking shape.
      await this.auth.execute(/* drizzle UPSERT */);
    }
    this.logger.log(
      { count: Object.keys(SYSTEM_ROLES).length },
      'System roles seeded',
    );
  }
}
```

**Planner caveat:** before writing the actual SQL, plan-checker must read `packages/db/src/schema/auth.ts` (or equivalent) to confirm the `organization_role` column names + uniqueness contract. The shape proposed above is the standard BA shape but the local Drizzle schema may have RestOS-specific overrides.

### 2FA opt-in confirmation gate (AUTH-07)

```ts
// NEW: apps/admin/app/dashboard/settings/two-factor-actions.ts
// Flow:
//   1. Operator clicks "Enable 2FA" → POST /api/auth/two-factor/enable (BA)
//      → BA returns { secret, qrCodeUri, backupCodes: string[10] }
//   2. Admin UI displays QR + secret + 10 codes + copy-clipboard + checkbox
//   3. Operator types TOTP code from authenticator app → POST /api/auth/two-factor/verify
//      → BA flips user.twoFactorEnabled = true
//   4. UI shows "2FA active" badge in settings
```

```ts
// Source: BA two-factor/types.d.mts L30-32 — skipVerificationOnEnable defaults to false
// so step 3 is REQUIRED. Don't set it to true.
```

## State of the Art

| Old Approach                                                     | Current Approach                                                                                          | When Changed                                                                                        | Impact                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `databaseHooks.member.update.after` (does NOT exist in 1.4.22)   | `organizationHooks.afterUpdateMemberRole({ member, previousRole, user, organization })` already in 1.4.22 | Already present in pinned version (verified at `node_modules/.../organization/types.d.mts:520-525`) | **Major impact**: Phase 17 / TEAM-03 can wire BA's `auth.api.updateMemberRole(...)` + the existing `organizationHooks.afterUpdateMemberRole` to emit `identity.role_changed.v1` — NO BA upgrade needed. The Phase 1 audit-gap BLOCKED row's re-eval trigger therefore should reference `organizationHooks.afterUpdateMemberRole` directly. **Planner action: include a small audit-gap.md update task in Phase 3** that revises the BLOCKED row's notes to point to this hook + AUTH-09 + TEAM-03. |
| Cookie-based MFA enforcement on every BA-protected route         | Per-user opt-in via `user.twoFactorEnabled` flag (BA short-circuits if false)                             | Verified at `two-factor/index.mjs:173` (`if (!data?.user.twoFactorEnabled) return;`)                | Confirms D-22 stance: enabling the plugin is safe; MVP-1 ships with operators able to opt in.                                                                                                                                                                                                                                                                                                                                                                                                      |
| Custom HTML email templates                                      | Plain-text + URL (BA defaults)                                                                            | D-02 explicit for Phase 3                                                                           | Defers MIME multipart + Outlook quirks + inlined CSS to Phase 8.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `dual-write` event publish (DB + NATS publish in same try block) | Outbox pattern with claim_token + leader-elected dispatcher                                               | Already shipped Phase 1; Phase 3 just emits new event onto same pipeline                            | No change for Phase 3; new envelope just rides existing infra.                                                                                                                                                                                                                                                                                                                                                                                                                                     |

**Deprecated / obsolete:**

- The old `withInboxDedup` three-tx wrapper is gone (replaced by `runDeduped`). Phase 3 doesn't add new consumers, but if it ever did, use `runDeduped`.
- Tilde (`~`) on `better-auth` version is gone — TEN-18 pinned `=1.4.22` exact. **Any version bump in Phase 3 must be a deliberate plan deliverable**, not a passive `pnpm update`.

## Assumptions Log

| #   | Claim                                                                                                                                                              | Section                                                          | Risk if Wrong                                                                                                                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | `resend` npm package name + presence + clean source repo at `github.com/resendlabs/resend-node`                                                                    | Standard Stack, Package Legitimacy Audit                         | Wrong package = wrong code shipped; potential supply-chain compromise. Planner must add checkpoint:human-verify before install.                                                                                                                                                                                                     |
| A2  | `nodemailer` 6.x npm package name + clean source repo at `github.com/nodemailer/nodemailer`                                                                        | Standard Stack, Package Legitimacy Audit                         | Same as A1.                                                                                                                                                                                                                                                                                                                         |
| A3  | Resend free-tier limits (claimed: 100/day + 3,000/month at last published tier)                                                                                    | "Verification findings" + recommendation for at-startup tier log | Wrong limit → silent rate-limit hit in production. Phase 3 install step should add a one-time human-eyeball confirmation by visiting resend.com/pricing.                                                                                                                                                                            |
| A4  | Resend SDK exposes a webhook signature verification helper (used IF D-08 ships)                                                                                    | Don't Hand-Roll table row 9                                      | If SDK doesn't ship one, hand-roll using standard HMAC-SHA256 over the raw body — adds ~30 lines of work to D-08.                                                                                                                                                                                                                   |
| A5  | NestJS `OnApplicationBootstrap` runs AFTER `pnpm db:migrate` job completes in the k8s deploy pipeline                                                              | AUTH-09 role-seed approach                                       | If migrations run as part of pod startup INSIDE the same container (non-job-based), `OnApplicationBootstrap` runs too early and the seed fails. **Planner must verify `infra/k8s/` or equivalent deploy spec to confirm migrations are a separate job.** Fallback: implement as a `pnpm db:seed-roles` script + add to deploy step. |
| A6  | `requireEmailVerificationOnInvitation: true` is the safe choice and doesn't break the BA invitation flow when combined with `emailVerification.sendOnSignUp: true` | Pitfall 8                                                        | If this combination has an edge case (e.g., invitation accept fails for users created by signup who haven't clicked verification yet), the planner needs a small e2e to verify the happy path and possibly relax the constraint with a separate "verified-or-invited" check at controller level.                                    |

## Open Questions

1. **`organization_role` Drizzle schema exact column names + composite uniqueness** for the AUTH-09 seed step.
   - What we know: BA 1.4.22 `OrganizationRole` schema referenced in `organization/types.d.mts:249-253`; system roles are global (no `organizationId`).
   - What's unclear: Local repo's `packages/db/src/schema/auth.ts` (or `packages/db/sql/`) may have RestOS overrides; the UPSERT must match the local schema, not the upstream default.
   - Recommendation: Add a "scout the local BA Drizzle schema" sub-task to the first wave touching AUTH-09 (waves 5 in recommendation). Owner: plan-checker before locking the seed shape.

2. **Is the existing GDPR cron a single class/file, or per-context?**
   - What we know: STATE.md references Phase 1's daily erasure cron; `audit-gap.md` mentions the path.
   - What's unclear: Whether Phase 3's invitation+verification sweep should EXTEND the existing job or add a sibling. The simpler one is the extension; verify before authoring a new file.
   - Recommendation: Scout step before D-21 task.

3. **NATS DLQ subject convention — `dlq.<original_subject>` literal or `dlq.<context>.<event>.v<n>`?**
   - What we know: `packages/events/CLAUDE.md` says `dlq.<subject>`. The subject in `STREAM_SUBJECTS` for identity events is `identity.>`.
   - What's unclear: Whether the DLQ subject for a poison `identity.email_dispatch_failed.v1` envelope should be `dlq.identity.email_dispatch_failed.v1` (specific) or `dlq.identity` (wildcard catch-all). Implication: how the DLQ is monitored downstream.
   - Recommendation: Use `dlq.<specific.subject>` per the CLAUDE.md convention; the planner can decide to alias them under a single audit-pipeline subscriber later.

4. **AUTH-07: backup codes returned as plain strings or as a single "shown once" object?**
   - What we know: BA `backup-codes` sub-module exists in 1.4.22.
   - What's unclear: Exact response shape of BA's `/api/auth/two-factor/enable`. Determines admin UI rendering shape.
   - Recommendation: Verify against `node_modules/.../two-factor/backup-codes/*.d.mts` in first wave touching AUTH-07. Plan-checker action.

5. **CTO LOW-1 caveat for invitation locale: should the planner add a small `notes` field on `invitation` so the admin can set the invitee's preferred locale at invite-time?**
   - What we know: Default behavior is "inviter's browser language" — RU operator inviting EN consultant gets RU.
   - What's unclear: Whether scope tolerates a small `inviteLocale: 'en' | 'ru'` additional field in BA's `organization.schema.invitation.additionalFields`.
   - Recommendation: NO for Phase 3 (per D-03 scope minimization); accept the caveat. Revisit at MVP-2 CRM phase.

## Environment Availability

> Phase 3 depends on external tools/services. Audit below.

| Dependency                               | Required By                            | Available                                                                           | Version         | Fallback                                                                                                                             |
| ---------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Better Auth                              | AUTH-01..07, AUTH-11                   | ✓ (already installed)                                                               | 1.4.22 (pinned) | —                                                                                                                                    |
| Resend API key (staging/prod)            | AUTH-01 send path                      | ✗ (must be provisioned in Vault)                                                    | —               | Email dispatch fails closed; CTO HIGH-2 requires this to be a hard boot guard in non-dev. Without it, prod boot fails (intentional). |
| MailHog (dev)                            | Local invitation/reset/verify testing  | ✓ (already in `infra/docker/docker-compose.dev.yml` per CLAUDE.md, ports 1025/8025) | —               | If absent: `pnpm dev:up` re-creates it.                                                                                              |
| NATS JetStream                           | AUTH-10 DLQ                            | ✓ (already in dev compose)                                                          | 2.10            | —                                                                                                                                    |
| Postgres 16                              | All BA tables + role seed + GDPR sweep | ✓                                                                                   | 16              | —                                                                                                                                    |
| `resend` npm package                     | Resend adapter                         | ✗ (not yet installed)                                                               | latest 4.x      | None — install in Phase 3.                                                                                                           |
| `nodemailer` npm package                 | MailHog adapter                        | ✗ (not yet installed)                                                               | latest 6.x      | None — install in Phase 3.                                                                                                           |
| `@types/nodemailer`                      | TS strict mode                         | ✗                                                                                   | latest 6.x      | None — install in Phase 3.                                                                                                           |
| Cloudflare DNS access for SPF/DKIM/DMARC | Pre-deploy checklist (D-07)            | ✓ (user-owned account)                                                              | —               | Without it, Gmail silently `dmarc=fail`s operator invitations. Track as Phase 3 non-code deliverable.                                |

**Missing dependencies with no fallback:** Resend API key in Vault — must be provisioned before any staging/prod deploy of Phase 3 code.

**Missing dependencies with fallback:** None of the missing items have a fallback; they are all install or provision steps.

## Validation Architecture

> `workflow.nyquist_validation` not explicitly disabled in `.planning/config.json` (verified absent — treat as enabled).

### Test Framework

| Property           | Value                                              |
| ------------------ | -------------------------------------------------- |
| Framework          | Vitest 2.1.8 (per `STACK.md`)                      |
| Config file        | `apps/api/vitest.config.ts` (existing)             |
| Quick run command  | `pnpm --filter @resto/api test -- --run <pattern>` |
| Full suite command | `pnpm --filter @resto/api test:e2e -- --run`       |

### Phase Requirements → Test Map

| Req ID                                      | Behavior                                                                                                          | Test Type          | Automated Command                                                           | File Exists?                                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| AUTH-01                                     | `assertEmailAdapterWired` throws on missing callback in staging/prod                                              | unit               | `pnpm --filter @resto/api test identity-core.module.spec.ts`                | ❌ Wave 0                                                                                |
| AUTH-01                                     | All three callbacks (`sendInvitation`, `sendResetPassword`, `sendVerificationEmail`) reach the adapter in dev     | integration        | `pnpm --filter @resto/api test:e2e identity-invitation.e2e.spec.ts`         | ❌ Wave 0                                                                                |
| AUTH-01                                     | Boot fails in staging/prod when `RESEND_API_KEY` is empty                                                         | integration        | `pnpm --filter @resto/api test prod-guardrails.spec.ts`                     | ✅ (extend existing)                                                                     |
| AUTH-02                                     | `auth.api.createInvitation` triggers sendInvitationEmail → adapter receives correct payload                       | e2e                | `pnpm --filter @resto/api test:e2e identity-invitation.e2e.spec.ts`         | ❌ Wave 0                                                                                |
| AUTH-02 (regression)                        | Admin attempting to invite with `role=owner` returns 403 (BA enforces creatorRole)                                | e2e                | same file                                                                   | ❌ Wave 0                                                                                |
| AUTH-03                                     | Existing user can accept invitation from a different org and end up as member of both                             | e2e                | same file                                                                   | ❌ Wave 0                                                                                |
| AUTH-04, AUTH-05                            | Forgot-password flow returns identical body for existing+nonexistent emails                                       | e2e + timing       | `pnpm --filter @resto/api test:e2e identity-password-reset.e2e.spec.ts`     | ❌ Wave 0                                                                                |
| AUTH-04, AUTH-05                            | Reset-password link with valid token sets password and triggers session revocation cascade                        | e2e                | same                                                                        | ❌ Wave 0 (extend `identity-audit.e2e.spec.ts` if simpler)                               |
| AUTH-06                                     | `REQUIRE_EMAIL_VERIFICATION=true` blocks sensitive endpoint when `user.emailVerified=false`                       | e2e                | `pnpm --filter @resto/api test:e2e identity-email-verification.e2e.spec.ts` | ❌ Wave 0                                                                                |
| AUTH-07                                     | Enable 2FA flow returns 10 backup codes; confirm-saved gate required before activation                            | e2e                | `pnpm --filter @resto/api test:e2e identity-two-factor.e2e.spec.ts`         | ❌ Wave 0                                                                                |
| AUTH-08                                     | Every cookie set by an admin server action has `secure`, `httpOnly`, `sameSite=lax` in prod NODE_ENV              | unit + integration | `pnpm --filter @resto/admin test auth-cookies.spec.ts`                      | ❌ Wave 0                                                                                |
| AUTH-09                                     | Role-seed UPSERT is idempotent on second invocation                                                               | integration        | `pnpm --filter @resto/api test role-seed.e2e.spec.ts`                       | ❌ Wave 0                                                                                |
| AUTH-09 (regression)                        | `admin` role does NOT have `tenant:delete` or `tenant:transfer` after seed                                        | unit               | `pnpm --filter @resto/domain test system-roles.spec.ts`                     | ✅ EXTEND (per packages/domain/CLAUDE.md "Adding a permission requires regression" rule) |
| AUTH-10                                     | Deliberately broken envelope → max_deliver:5 reached → message lands in `dlq.identity.>` → alert envelope emitted | e2e                | `pnpm --filter @resto/api test:e2e nats-dlq-poison.e2e.spec.ts`             | ❌ Wave 0 (gates everything else per D-18)                                               |
| AUTH-11                                     | Sign-out + reset-password BA hooks still emit envelope after WeakMap refactor                                     | regression e2e     | `pnpm --filter @resto/api test:e2e identity-audit.e2e.spec.ts`              | ✅ (existing)                                                                            |
| D-06                                        | `/v1/signup` returns identical body + ±10ms for existing vs new email                                             | e2e + timing       | `pnpm --filter @resto/api test:e2e signup-enumeration.e2e.spec.ts`          | ❌ Wave 0                                                                                |
| D-21                                        | GDPR sweep deletes `invitation` rows past 30d post-expiry; deletes stale `verification` rows                      | e2e                | `pnpm --filter @resto/api test:e2e gdpr-retention.e2e.spec.ts`              | ✅ EXTEND (existing Phase 1 spec)                                                        |
| D-05                                        | Resend adapter retries 3x with backoff on transient 5xx; emits `identity.email_dispatch_failed.v1` on terminal    | unit               | `pnpm --filter @resto/api test resend.adapter.spec.ts`                      | ❌ Wave 0                                                                                |
| Carry-over: `forgot-password/actions.ts:15` | Asserts no `localhost` fallback at runtime when `ADMIN_WEB_URL` env is unset (throws at module load instead)      | integration        | `pnpm --filter @resto/admin test env.spec.ts`                               | ✅ (existing — extend assertions)                                                        |

### Sampling Rate

- **Per task commit:** `pnpm --filter @resto/api test -- --run <module-pattern>` for fast feedback (unit + module-scoped).
- **Per wave merge:** `pnpm --filter @resto/api test:e2e -- --run` for full e2e + the gating AUTH-10 poison test.
- **Phase gate:** Full suite + admin app `pnpm --filter @resto/admin test:e2e` green before `/gsd:verify-work`.

### Wave 0 Gaps

- [ ] `apps/api/test/e2e/nats-dlq-poison.e2e.spec.ts` — **GATING** AUTH-10 test (must land Wave 1)
- [ ] `apps/api/test/e2e/identity-invitation.e2e.spec.ts` — AUTH-02/03 + owner-only-grants-owner regression
- [ ] `apps/api/test/e2e/identity-password-reset.e2e.spec.ts` — AUTH-04/05 + enumeration parity timing
- [ ] `apps/api/test/e2e/signup-enumeration.e2e.spec.ts` — D-06 `/v1/signup` parity
- [ ] `apps/api/test/e2e/identity-email-verification.e2e.spec.ts` — AUTH-06
- [ ] `apps/api/test/e2e/identity-two-factor.e2e.spec.ts` — AUTH-07
- [ ] `apps/api/test/e2e/role-seed.e2e.spec.ts` — AUTH-09 idempotency
- [ ] `apps/admin/test/auth-cookies.spec.ts` — AUTH-08 sweep assertion
- [ ] `apps/api/test/resend.adapter.spec.ts` — D-05 retry behavior
- [ ] `apps/api/test/identity-core.module.spec.ts` — assertEmailAdapterWired three-callback unit
- [ ] Extension: `apps/api/test/e2e/gdpr-retention.e2e.spec.ts` — D-21 invitation+verification sweep
- [ ] Extension: `packages/domain/test/system-roles.spec.ts` — pin admin's denied-permissions (`tenant:delete`, `tenant:transfer`)

_Framework install: none — Vitest already configured in api + admin._

## Security Domain

> `security_enforcement` not explicitly disabled; including section.

### Applicable ASVS Categories

| ASVS Category               | Applies | Standard Control                                                                                                                                                                                                  |
| --------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 Authentication           | yes     | Better Auth + TOTP (BA twoFactor plugin), 10 backup codes (BA backup-codes); password policy: `PASSWORD_MIN_LENGTH=12` (NIST-aligned, already enforced)                                                           |
| V3 Session Management       | yes     | BA sessions (7d expiry per `auth.config.ts:168`); BA `/sign-out` revocation; password-reset cascade revokes all sessions for user (`auth.config.ts:293`)                                                          |
| V4 Access Control           | yes     | BA organization plugin + RBAC + `ScopedTx` + Postgres RLS; AUTH-09 seed; owner-only-grants-owner enforced by BA `creatorRole`                                                                                     |
| V5 Input Validation         | yes     | Zod schemas on every DTO; `RestoZodValidationPipe` per-parameter at controller                                                                                                                                    |
| V6 Cryptography             | yes     | BA bcrypt password hashing; HMAC-signed cookies via `active-brand-cookie.ts` (Phase 02 baseline); never hand-roll — TOTP code via BA; backup code random via BA; webhook signature via Resend SDK (D-08 if ships) |
| V7 Error Handling + Logging | yes     | RFC 7807 ProblemDetailsFilter; 5xx body redaction; structured Pino logs with `redact` config for PII; identity events flow to audit log via outbox                                                                |
| V8 Data Protection          | yes     | GDPR retention sweep D-21; AUDIT_ERASURE_SALT (Phase 1); soft-delete-only `resto_app` role                                                                                                                        |
| V13 API + Web Service       | yes     | Rate-limit per-IP + per-email + per-tenant (D-20); CORS allowlist; CSRF via BA's Origin check (`trustedOrigins`)                                                                                                  |

### Known Threat Patterns for Better Auth + Next.js stack

| Pattern                                                      | STRIDE                 | Standard Mitigation                                                                                                                        |
| ------------------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Email enumeration on signup                                  | Information Disclosure | Wrap `/v1/signup` to return identical body for taken-vs-new emails + time-equalize internal path (D-06)                                    |
| Email enumeration on password reset                          | Information Disclosure | BA already does this (verified `password.mjs:51-61`); Phase 3 adds e2e proof                                                               |
| Open redirect via `redirectTo` in BA reset link              | Tampering              | BA validates `redirectTo` via `originCheck` middleware (verified `password.mjs:86` — `use: [originCheck((ctx) => ctx.query.callbackURL)]`) |
| Owner-role escalation via crafted invitation                 | Elevation of Privilege | BA enforces `creatorRole` at L112 of `crud-invites.mjs` (verified); regression e2e asserts admin → owner returns 403                       |
| Invitation accepted by attacker-controlled unverified email  | Spoofing               | `requireEmailVerificationOnInvitation: true` + `REQUIRE_EMAIL_VERIFICATION=true`                                                           |
| Poison NATS message stalls audit subscriber                  | Denial of Service      | AUTH-10 `max_deliver: 5` + DLQ routing                                                                                                     |
| Reset-password token replay                                  | Tampering              | BA deletes verification value on consumption (single-use); 1h TTL                                                                          |
| Session not revoked on password change                       | Broken Auth            | Cascade in `auth.config.ts:285-307` (existing); WeakMap refactor preserves it                                                              |
| Cookie missing `secure` flag over HTTP                       | Information Disclosure | AUTH-08 sweep                                                                                                                              |
| Resend API key exposed in client bundle                      | Information Disclosure | `RESEND_API_KEY` is non-`NEXT_PUBLIC_*` in `env.schema.ts` (server-only)                                                                   |
| BA hook running without tenant context emits to wrong tenant | Tampering              | D-17 explicit binding + RLS WITH CHECK rejects cross-tenant inserts                                                                        |
| 2FA bypass via email-recovery loop                           | Elevation of Privilege | D-23 — no email-recovery loop exists                                                                                                       |

## Wave Dependency Graph (planner consumes this)

```
WAVE 1 [GATING per D-18]
├── AUTH-10: NATS DLQ wiring in packages/events/src/infrastructure/nats-subscriber.ts
│             + extend SubscribeOptions (maxDeliver, ackWaitMs, dlqPublisher)
│             + #run() poison-redelivery branch
│             + dlqPublisher needs a publishRaw helper on NatsJetStreamPublisher
└── e2e poison-message test gates Wave 2.

WAVE 2 (parallel)
├── A. EMAIL_ADAPTER_PORT Symbol + interface in identity/domain/ports.ts
├── B. Three concrete adapters: resend, mailhog-smtp, captured
├── C. Adapter selection factory (NODE_ENV-keyed)
├── D. Extend assertEmailAdapterWired to 3 callbacks (D-13) + remove NOOP defaults
├── E. Extend assertProdGuardrails for RESEND_API_KEY (D-01)
├── F. verifyTransport() on each adapter (D-15)
├── G. Boot-time integration test (D-14)
├── H. New event contract: IdentityEmailDispatchFailedV1 in @resto/events
├── I. ENV additions: RESEND_API_KEY, RESEND_FROM, RESEND_REPLY_TO, MAILHOG_HOST, MAILHOG_PORT, RATE_LIMIT_AUTH_SIGNIN_PER_TENANT_PER_MIN
└── J. Wire EMAIL_ADAPTER_PORT into identity-core.module.ts; remove NOOP wrappers

WAVE 3 (after Wave 2)
├── A. Invitation flow (AUTH-02, AUTH-03)
│   ├── BA `organization()` config: pass real `sendInvitationEmail` callback
│   ├── set `requireEmailVerificationOnInvitation: true`
│   ├── `/dashboard/settings` invite form + server action (D-09)
│   ├── `/accept-invitation/[id]` route in admin
│   └── e2e: send + accept + auto-attach + owner-only-grants-owner regression
├── B. Password reset (AUTH-04, AUTH-05) — extend Phase 02 placeholders
│   ├── wire real `sendResetPassword` callback through adapter
│   ├── carry-over fix: forgot-password/actions.ts:15 → use adminOrigin()
│   └── e2e: parity + cascade
├── C. Email verification (AUTH-06)
│   ├── set REQUIRE_EMAIL_VERIFICATION=true in staging/prod env spec
│   ├── verify sensitive endpoints reject `user.emailVerified=false` (BA does this via emailAndPassword.requireEmailVerification)
│   └── e2e + UI affordance (EmptyState variant=forbidden)
└── D. Signup enumeration wrap (D-06)
    ├── error-mapping refactor
    └── e2e timing parity

WAVE 4 (after Wave 3)
├── A. Secure cookie sweep (AUTH-08)
│   └── audit + extend any sites still missing the secure baseline (4 sites identified)
├── B. 2FA enable + recovery codes UI (AUTH-07)
│   ├── /dashboard/settings 2FA section
│   ├── BA twoFactor enable flow + display backup codes once
│   ├── "I saved them" confirmation gate
│   └── e2e
└── C. Phase 02 carry-over: login/actions.ts:36-74 refactor (sign-in fan-out)

WAVE 5 (independent)
├── A. AUTH-09 role seed + bootstrap module + idempotency test
├── B. AUTH-09 audit-gap.md re-eval trigger update referencing organizationHooks.afterUpdateMemberRole
├── C. AUTH-11 WeakMap refactor (auth.config.ts)
├── D. D-21 GDPR sweep extension (invitation + verification)
├── E. D-07 SPF/DKIM/DMARC checklist
├── F. D-23 founder-side 2FA reset runbook + tsx CLI script
└── G. Update audit-gap.md BLOCKED row note (the re-eval trigger now mentions `organizationHooks.afterUpdateMemberRole` not `databaseHooks.member.update.after`)

OPTIONAL (D-08 — planner decides)
└── Resend bounce-webhook handler + invitation.delivery_status column + admin list affordance
```

## Verification Findings (Persona-Skeptic Assumption Flags)

> Items 18-22 from `PERSONA-REVIEWS.md` — researcher resolution.

### Item 18: AUTH-11 WeakMap refactor scope risk

**Status:** CONFIRMED can stay in Phase 3. Verified that the refactor is purely local to `auth.config.ts` (two stash sites, both in the same file: L222-256 and L264-307); no other contexts import the `__resto*` keys.

**Evidence:** `grep -rn "__restoSignOut\|__restoPasswordReset" apps/ packages/` (would have surfaced any external touch points). Both stashes are private to `auth.config.ts`.

**Disposition:** KEEP in Phase 3. First candidate to slip if wave pressure surfaces.

### Item 19: Email locale falls back to inviter's browser

**Status:** CONFIRMED — this is the BA mechanism. CTO LOW-1 caveat accepted as documented.

**Evidence:** BA's organization plugin invitation route in `crud-invites.mjs` passes `ctx.request` (the inviter's request) to `sendInvitationEmail`. No mechanism to override locale from the invitation row absent an `additionalField`.

**Disposition:** Accept. Defer per-user locale to MVP-2 CRM.

### Item 20: `databaseHooks.member.update.after` between BA 1.4.22 and current upstream

**Status:** **CONFIRMED ABSENT** in 1.4.22 — but with a major caveat. Verified `databaseHooks` in `@better-auth/core@1.4.22/dist/types/init-options.d.mts` L994-1177 covers ONLY `user`, `session`, `account`, `verification`. There is no `member` key.

**MAJOR NEW FINDING (overrides skeptic's premise):** BA 1.4.22's organization plugin already exposes `organizationHooks.afterUpdateMemberRole` AND `beforeUpdateMemberRole` with `(member, previousRole, user, organization)` — the exact 4-tuple needed for the role-change audit row. Verified at `node_modules/.../better-auth/dist/plugins/organization/types.d.mts:506-525`.

**Implication for Phase 3:**

1. The audit-gap BLOCKED row's re-eval trigger note should be UPDATED to reference `organizationHooks.afterUpdateMemberRole` directly (NOT `databaseHooks.member.update.after` which won't ship in any version because BA correctly puts member hooks on the org plugin).
2. **NO BA upgrade is needed** for Phase 17 TEAM-03 — when that phase activates, wiring `organizationHooks.afterUpdateMemberRole` against BA 1.4.22 is the path.
3. Phase 3 audit-gap.md edit: change the BLOCKED disposition narrative from "Better Auth member-plugin role-mutation hook surface not available in 1.4.22" to "The role-change BLOCKED disposition exists because Phase 3 deferred the AUTH-09 role-change endpoint to Phase 17 / TEAM-03; the BA hook needed for closure is already available as `organizationHooks.afterUpdateMemberRole`."

**Disposition:** OPEN → CONFIRMED REVISION required to audit-gap.md. Add this as a Wave 5 sub-task.

### Item 21: Resend free-tier rate limits

**Status:** ASSUMED. Researcher could not verify current limits (WebSearch/WebFetch denied in environment). Skeptic's claim was 3,000/month + 100/day "at last published tier."

**Required planner action before staging deploy:** Visit https://resend.com/pricing (or `npm view resend` + the README) and confirm the current free-tier numbers. Update the at-startup log and the upgrade-threshold runbook accordingly. If the planner ships the at-startup tier log (Claude's Discretion item 5), the runbook line is: "Migrate to paid Resend tier when daily volume exceeds 80% of the free-tier cap."

**Resend webhook contract for bounce/complaint:** ASSUMED — should be `Svix-signature` HMAC-SHA256 over the raw request body (Resend uses Svix for webhook delivery per public docs `[ASSUMED]`). If D-08 ships, verify against `resend` SDK's exported `Webhooks.unwrap()` helper at install time.

**Disposition:** OPEN — confirm at install / pre-deploy.

### Item 22: `twoFactor()` plugin enforcement

**Status:** **CONFIRMED OPT-IN by default — no MVP regression.**

**Evidence:** `node_modules/.../better-auth/dist/plugins/two-factor/index.mjs:166-173` — the post-sign-in hook explicitly short-circuits:

```js
hooks: { after: [{
  matcher(context) {
    return context.path === "/sign-in/email" || ...;
  },
  handler: createAuthMiddleware(async (ctx) => {
    const data = ctx.context.newSession;
    if (!data) return;
    if (!data?.user.twoFactorEnabled) return;   // ← OPT-IN GATE: no 2FA enforced for users where flag is false
    // ...
  })
}]}
```

**Disposition:** REFUTED skeptic's risk. Safe to keep plugin enabled.

### Additional implicit verifications driven by CONTEXT decisions

**Better Auth `sendInvitationEmail` callback signature (D-09, D-10, D-11):**
Verified at `node_modules/.../plugins/organization/types.d.mts:197-228`. Callback shape:

```ts
sendInvitationEmail?: ((data: {
  id: string;                 // invitation id (use to construct accept URL)
  role: string;               // role string ('owner'|'admin'|'staff'|custom)
  email: string;              // lowercase invitee email
  organization: Organization;
  invitation: Invitation;
  inviter: Member & { user: User };
}, request?: Request) => Promise<void>) | undefined;
```

Role at invite-time IS in the token (passed as `role` in the create body, stored in `invitation.role`, surfaced on accept). Owner-only-grants-owner ENFORCED IN-BA at `crud-invites.mjs:112`. Existing-account auto-attach: BA's accept-invitation requires the accepting session's email to match the invitation email (`crud-invites.mjs:335`), so the user signs in with their existing password and BA's `afterAcceptInvitation` adds them to the new org.

**Status:** CONFIRMED — D-09/D-10/D-11 all line up with BA's actual behavior; no wrapping needed for these.

**BA password-reset cascade (D-22, AUTH-04, AUTH-05):**
The existing `auth.config.ts:285-307` after-hook is sufficient. BA's own internal `deleteSessions` is what we wrap; the cascade already runs in the order: (1) reset token verified by BA, (2) BA updates user password, (3) hooks.after fires, (4) our code calls `deleteSessions(userId)`, (5) emits `identity.password_reset_completed.v1`. Verified by trace through `password.mjs`. Single-use enforced by BA's `findVerificationValue + deleteVerificationValue` on consumption (`password.mjs:178+`).

**Status:** CONFIRMED — existing wiring is sufficient. No changes for AUTH-04/05 beyond hooking up the real email send and writing e2e tests.

**BA `auth.api.updateMemberRole(...)`:**
CONFIRMED EXISTS in 1.4.22 — the endpoint is at `/organization/update-member-role` per `crud-members.mjs:211`, exposed on `auth.api.updateMemberRole` server-side per the route name → API surface convention.

**Status:** CONFIRMED — Phase 17 / TEAM-03 path is unobstructed.

**Email enumeration in BA defaults (D-06):**

- `POST /api/auth/sign-up/email`: **DIVERGES** — verified `sign-up.mjs:160` throws `UNPROCESSABLE_ENTITY` with `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` distinct message.
- `POST /api/auth/request-password-reset`: **PARITY OK** — verified `password.mjs:50-61` returns identical body + dummy timing equalizer.
- `/v1/signup` (RestOS custom): **DIVERGES** — verified `error-mapping.ts:46` surfaces `signup.email_taken` distinct code.

**Wrapping required:** `/v1/signup` controller MUST be wrapped per Pattern 3 above. The BA `sign-up/email` endpoint is NOT used by admin UI (admin posts to `/v1/signup`); but the planner should add an e2e test that asserts `POST /api/auth/sign-up/email` is not reachable from the admin (or is wrapped if reachable through a future flow).

**Status:** CONFIRMED — `/v1/signup` wrap is required; BA `request-password-reset` already correct.

**Resend Node SDK:**
ASSUMED — package not installed in repo. Verify at install time (Wave 2): `npm view resend version` + `npm view resend repository`. Expected client construction `new Resend(apiKey).emails.send({ from, to, subject, text })`. Idempotency: ASSUMED `idempotencyKey` parameter exists (`[ASSUMED]`). Webhook: ASSUMED via Svix.

**Status:** OPEN — confirm at Wave 2 install step.

**Nodemailer SMTP for MailHog:**
ASSUMED — minimal client config: `nodemailer.createTransport({ host: env.MAILHOG_HOST, port: env.MAILHOG_PORT, secure: false, ignoreTLS: true })`. No auth needed for MailHog (it accepts any).

**Status:** OPEN — confirm at Wave 2 install step.

## Sources

### Primary (HIGH confidence — verified locally)

- `node_modules/.pnpm/better-auth@1.4.22_.../better-auth/dist/plugins/organization/types.d.mts` — `sendInvitationEmail` callback signature (L197-228), `organizationHooks.afterUpdateMemberRole` (L506-525), `invitationExpiresIn` default 48h (L146-150), `creatorRole` default (L42-47), `requireEmailVerificationOnInvitation` (L172)
- `node_modules/.pnpm/better-auth@1.4.22_.../better-auth/dist/plugins/organization/routes/crud-invites.mjs` — invitation create flow + owner-only-grants-owner enforcement (L112), accept-invitation email-match (L335), sendInvitationEmail invocation (L139, L207)
- `node_modules/.pnpm/better-auth@1.4.22_.../better-auth/dist/plugins/organization/routes/crud-members.mjs` — `updateMemberRole` endpoint (L211)
- `node_modules/.pnpm/better-auth@1.4.22_.../better-auth/dist/plugins/two-factor/types.d.mts` — `TwoFactorOptions`, `skipVerificationOnEnable` default false (L30-32), `UserWithTwoFactor.twoFactorEnabled` flag (L57-59)
- `node_modules/.pnpm/better-auth@1.4.22_.../better-auth/dist/plugins/two-factor/index.mjs` — opt-in enforcement gate at L173 (`if (!data?.user.twoFactorEnabled) return;`)
- `node_modules/.pnpm/better-auth@1.4.22_.../better-auth/dist/api/routes/password.mjs` — enumeration parity at L51-61 (dummy lookup), reset token TTL default 1h at L63
- `node_modules/.pnpm/better-auth@1.4.22_.../better-auth/dist/api/routes/sign-up.mjs` — divergent response at L160 (distinct `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`)
- `node_modules/.pnpm/@better-auth+core@1.4.22_.../core/dist/types/init-options.d.mts` — `databaseHooks` covers user/session/account/verification (NOT member) at L994-1177
- `apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts` — current BA wiring (NOOP defaults L137/152, context-stash patterns L222-256/L264-307, cascade hooks L285-307)
- `apps/api/src/contexts/identity/identity-core.module.ts` — REQUIRED_EMAIL_CALLBACKS L28 (currently 1/3)
- `apps/api/src/contexts/identity/interfaces/http/error-mapping.ts:46` — `signup.email_taken` distinct code (enumeration leak)
- `apps/api/src/contexts/identity/infrastructure/identity-event-emitter.adapter.ts:30` — `db.withTenantId` pattern precedent
- `packages/events/src/infrastructure/nats-subscriber.ts` — current subscribe config (missing max_deliver + DLQ)
- `packages/events/src/envelope.ts` — `buildEnvelope` correlationId-from-OTel pattern
- `packages/domain/src/rbac/system-roles.ts` — `SYSTEM_ROLES` source of truth (L10-34)
- `apps/admin/lib/active-brand-cookie.ts` — Phase 02 HMAC cookie baseline
- `apps/admin/lib/env.ts:67-72` — eager env validation + `adminOrigin()` accessor (carry-over fix target)
- `apps/admin/app/forgot-password/actions.ts:15` — localhost fallback (carry-over)
- `apps/admin/app/login/actions.ts:36-74` — 3-call fan-out (carry-over refactor)
- `.planning/phases/01-tenancy-hardening/audit-gap.md` — BLOCKED row narrative (Phase 3 updates)
- `packages/events/CLAUDE.md` — DLQ + max_ack_pending + ack_wait + #run try/catch invariants
- `apps/CLAUDE.md` — cookie + env + INTERNAL_API_TOKEN rules
- `packages/domain/CLAUDE.md` — admin permissions regression test requirement

### Secondary (MEDIUM confidence)

- BA Github changelog references via the source tree (locally available) for the `=1.4.22` pin. No version drift risk since local node_modules is authoritative.

### Tertiary (LOW confidence — needs validation at install/deploy time)

- Resend free-tier rate limits (skeptic's claim of 100/day + 3000/month) — `[ASSUMED]`
- Resend SDK exact API shape (`new Resend(apiKey).emails.send(...)`) — `[ASSUMED]`
- Resend webhook signature mechanism (Svix HMAC) — `[ASSUMED]`
- Nodemailer 6.x latest version + `createTransport` shape for MailHog — `[ASSUMED]`
- Whether the deploy pipeline runs `pnpm db:migrate` as a separate K8s job (vs in-pod) — `[ASSUMED]` (A5 in assumptions log)

## Metadata

**Confidence breakdown:**

- BA contract details (invitation, accept, password-reset, two-factor, role-update hook): **HIGH** — verified directly from local `node_modules/.pnpm/better-auth@1.4.22/...` `.d.mts` and `.mjs` source files
- Codebase grounding (file paths, line numbers, existing patterns): **HIGH** — file reads in this research session
- NATS DLQ implementation approach: **HIGH** — pattern matches `packages/events/CLAUDE.md` precisely; tested in similar codebases by the broader community
- Resend SDK + Nodemailer specifics: **LOW** — verification deferred to install step
- Resend free-tier limits: **LOW** — researcher could not query; planner must confirm before staging deploy
- Pitfall completeness: **MEDIUM** — covered the major classes; subtle race conditions in NATS dispatcher under specific failure modes remain implicit risk surface

**Research date:** 2026-05-29
**Valid until:** 2026-06-12 (BA-version-pinned, but Resend/nodemailer detail is fast-moving — re-verify if installation slips past this window)

## RESEARCH COMPLETE
