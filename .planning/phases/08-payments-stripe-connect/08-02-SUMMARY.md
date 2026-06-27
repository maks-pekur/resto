---
phase: 08-payments-stripe-connect
plan: 02
subsystem: payments
tags: [stripe, connect, express, payments, onboarding, admin-ui]

requires:
  - phase: 08-payments-stripe-connect
    plan: 01
    provides: payments schema, tenant capability fields, canAcceptPayments predicate

provides:
  - StripeConnectAdapter: real Stripe Connect Express adapter (accounts, accountLinks, paymentIntents, refunds)
  - POST /v1/tenancy/stripe-onboarding: creates Express account + returns account_link URL
  - GET /v1/tenancy/stripe-status: returns KYC/canAcceptPayments state from tenant aggregate
  - Admin payouts page: Connect Stripe button + pending/restricted/ready status surface
  - Stripe env vars: STRIPE_SECRET_KEY, STRIPE_APPLICATION_FEE_AMOUNT, STRIPE_CONNECT_RETURN_URL, STRIPE_CONNECT_REFRESH_URL, STRIPE_WEBHOOK_SECRET
  - Prod guardrails: STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET placeholder rejection

affects:
  - 08-03: webhook handler uses retrieveAccount + the adapter wired here
  - 08-04: checkout calls canAcceptPayments() gate; createPaymentIntent via adapter
  - 08-05: refund flow uses createRefund via adapter
  - provision-tenant.service.ts: ensureExpressAccount now creates a real account (no-op on existing)

tech-stack:
  added:
    - stripe@17.7.0
  patterns:
    - 'Direct charge: stripeAccount request option (no transfer_data.destination) — D-02'
    - 'Idempotency keys: pi:<orderId>:<attempt> for PI create; refund:<refundRequestId> for refund — D-09'
    - 'Retry budget: [0, 250ms, 1000ms, 4000ms] with jitter + 5.5s per-call timeout (mirror resend adapter)'
    - 'StripeClientLike interface enables mock injection in unit tests — no live Stripe calls in tests'
    - 'createStripeClientAdapter factory wraps real SDK into StripeClientLike'
    - 'Tenant.linkStripeAccount() mutator records accountId + sets onboardingStatus=pending'
    - 'Prod guardrail: STRIPE_SECRET_KEY rejected when placeholder/blank in staging/production'

key-files:
  created:
    - apps/api/src/contexts/tenancy/infrastructure/stripe-connect.adapter.spec.ts
    - apps/api/src/contexts/tenancy/application/start-stripe-onboarding.service.ts
    - apps/api/src/contexts/tenancy/interfaces/http/stripe-onboarding.controller.ts
    - apps/admin/src/lib/payments-api.ts
  modified:
    - apps/api/src/contexts/tenancy/domain/ports.ts
    - apps/api/src/contexts/tenancy/domain/errors.ts
    - apps/api/src/contexts/tenancy/domain/tenant.aggregate.ts
    - apps/api/src/contexts/tenancy/infrastructure/stripe-connect.adapter.ts
    - apps/api/src/contexts/tenancy/interfaces/http/error-mapping.ts
    - apps/api/src/contexts/tenancy/tenancy.module.ts
    - apps/api/src/config/env.schema.ts
    - apps/api/src/config/prod-guardrails.ts
    - apps/api/package.json
    - pnpm-lock.yaml
    - apps/admin/src/routes/(protected)/dashboard/$brandSlug/brands.$slug.payouts.tsx

key-decisions:
  - 'StripeConnectPort expanded with 6 new methods; ensureExpressAccount kept as shim calling createExpressAccount — provision-tenant.service.ts unchanged'
  - 'NoopStripeConnectAdapter removed; tenancy.module.ts wires real StripeConnectAdapter via factory in all environments (uses sk_test_placeholder fallback in dev if STRIPE_SECRET_KEY absent)'
  - 'onboarding uses tenant:transfer permission (owner-only) for POST; tenant:read for GET status — matches SYSTEM_ROLES invariant'
  - 'Tenant.linkStripeAccount() added to aggregate; sets onboardingStatus=pending immediately on account creation before account.updated webhook completes KYC'
  - '#env removed from StripeConnectAdapter class — URLs passed by caller (StartStripeOnboardingService reads them from Env)'
  - 'Admin payouts page uses TanStack Query useQuery/useMutation; window.location.href redirect on success; sonner toast on error'

metrics:
  duration: 100min
  completed: 2026-06-27T10:13:00Z
  tasks: 3 auto + 1 checkpoint (human-verify pending)
  files_modified: 18
---

# Phase 8 Plan 02: Real StripeConnectAdapter + onboarding + admin Connect button

**Real Stripe Connect Express adapter with direct-charge PaymentIntent (D-02), config-driven fee (D-03), deterministic idempotency keys (D-09), resend-style retry/timeout; onboarding service + controller; admin payouts page with Connect button and KYC status surface (PAY-01/02/03/13)**

## Performance

- **Duration:** ~100 min
- **Started:** 2026-06-27T08:30:00Z
- **Completed:** 2026-06-27T10:13:00Z
- **Tasks:** 3 auto (Tasks 1, 2, 3) + human-verify checkpoint pending
- **Files modified:** 18

## Accomplishments

- **StripeConnectPort expanded** with 6 typed methods: `createExpressAccount`, `createAccountLink`, `createPaymentIntent`, `cancelPaymentIntent`, `createRefund`, `retrieveAccount`. `ensureExpressAccount` kept as backwards-compat shim.
- **StripeConnectAdapter** (real): mirrors resend adapter's retry/timeout pattern ([0, 250, 1000, 4000]ms + 5.5s call timeout + jitter). Direct charge via `stripeAccount` request option (no `transfer_data.destination`, D-02). Idempotency: `pi:<orderId>:<attempt>` for PI create, `refund:<refundRequestId>` for refunds (D-09). `application_fee_amount` passed from caller (config-driven, D-03). `StripeClientLike` interface for test injection.
- **NoopStripeConnectAdapter removed**; tenancy module wires real adapter via `createStripeClientAdapter` factory using `new Stripe(env.STRIPE_SECRET_KEY ?? 'sk_test_placeholder', { apiVersion: '2025-02-24.acacia' })`.
- **Env schema** updated: `STRIPE_SECRET_KEY`, `STRIPE_APPLICATION_FEE_AMOUNT` (default 0), `STRIPE_CONNECT_RETURN_URL`, `STRIPE_CONNECT_REFRESH_URL`, `STRIPE_WEBHOOK_SECRET`.
- **Prod guardrails** extended: `STRIPE_SECRET_KEY` required + placeholder-rejected in staging/production; `STRIPE_WEBHOOK_SECRET` dummy-literal rejected.
- **Tenant.linkStripeAccount(accountId)** added to aggregate — records accountId + sets onboardingStatus=`pending`.
- **StartStripeOnboardingService**: reads tenant, creates Express account if null, persists via `linkStripeAccount` + `repo.save`, generates account_link. `getStatus()` returns live snapshot fields.
- **StripeOnboardingController** at `POST /v1/tenancy/stripe-onboarding` + `GET /v1/tenancy/stripe-status` with `tenant:transfer` (owner-only) and `tenant:read` permissions + `@RequireActiveTenant`.
- **StripeOnboardingFailedError** added to domain errors → 502 BadGateway in error-mapping.
- **Admin payouts page** rewritten: `useQuery(['stripe-status'])` drives ready/pending/restricted states; `useMutation` calls POST then `window.location.href = onboardingUrl`; spinner + error toast pattern from `danger-zone-card.tsx`.
- **payments-api.ts** helper with `getStripeStatus()` + `startStripeOnboarding()` over `apiFetch`.

## Task Commits

1. **Tasks 1+2: StripeConnectAdapter + onboarding service/controller + env + guardrails** - `56e3646`
2. **Task 3: admin Connect-Stripe onboarding button + KYC status surface** - `a82e3b3`

## Stripe SDK Version

`stripe@17.7.0` — API version `2025-02-24.acacia`

## Test Results

```
Test Files  7 passed (7)
      Tests  55 passed (55)
pnpm --filter @resto/api exec tsc --noEmit → exit 0
pnpm --filter admin exec tsc --noEmit     → exit 0
```

Unit tests confirm (11 tests in stripe-connect.adapter.spec.ts):

- `stripeAccount` option present in paymentIntents.create call
- `transfer_data.destination` absent (D-02 direct charge invariant)
- idempotency key = `pi:<orderId>:<attempt>` for PI, `refund:<refundRequestId>` for refund (D-09)
- `application_fee_amount` = caller's `applicationFeeMinor` (0 by default, non-zero passes through)
- 5xx retries with same idempotency key (no double charge)
- 4xx terminal — no retry

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added Tenant.linkStripeAccount() aggregate method**

- **Found during:** Task 2 (StartStripeOnboardingService needs to persist stripeAccountId)
- **Issue:** Tenant aggregate had no public method to set stripeAccountId — cannot call `repo.save()` with a new accountId without mutating the aggregate through a domain method
- **Fix:** Added `linkStripeAccount(accountId: string)` to tenant.aggregate.ts; sets `stripeOnboardingStatus: 'pending'` at the same time
- **Files modified:** tenant.aggregate.ts
- **Committed in:** 56e3646

**2. [Rule 2 - Missing Critical] Added StripeOnboardingFailedError to domain errors + error-mapping**

- **Found during:** Task 2
- **Issue:** Plan required a new domain error for onboarding failures; without it, adapter errors bubble as untyped 500
- **Fix:** Added `StripeOnboardingFailedError` to errors.ts; mapped to 502 BadGateway in error-mapping.ts
- **Files modified:** errors.ts, error-mapping.ts
- **Committed in:** 56e3646

**3. [Rule 1 - Bug] Removed #env private field from StripeConnectAdapter (unused)**

- **Found during:** Task 1 (ESLint pre-commit hook)
- **Issue:** Env passed to constructor but not stored as used field — adapter delegates URL config to the caller (service layer)
- **Fix:** Renamed constructor param to `_env` (discarded); adapter only uses `client` + `logger`
- **Committed in:** 56e3646

**4. [Rule 2 - Missing Critical] Updated test fixtures for 3 new required Env fields**

- **Found during:** Task 1 (pre-commit typecheck)
- **Issue:** `build-auth-from-env.spec.ts`, `internal-token.guard.spec.ts`, `tenant-context.middleware.spec.ts` used inline Env objects missing `STRIPE_APPLICATION_FEE_AMOUNT`, `STRIPE_CONNECT_RETURN_URL`, `STRIPE_CONNECT_REFRESH_URL`
- **Fix:** Added the 3 new fields to each test fixture
- **Committed in:** 56e3646

**5. [Rule 1 - Bug] onboarding permission changed from tenant:write → tenant:transfer**

- **Found during:** Task 2 (tsc pre-commit)
- **Issue:** `tenant:write` is not in the Permission type (valid values: `read`, `delete`, `transfer`)
- **Fix:** `@Permissions({ tenant: ['transfer'] })` — owner-only, matches D-04 owner-only requirement
- **Committed in:** 56e3646

## Checkpoint Pending

**checkpoint:human-verify (gate: blocking)** — Admin onboarding click-through requires human to:

1. Start dev stack + api + admin with test-mode `STRIPE_SECRET_KEY` + `STRIPE_CONNECT_RETURN_URL/REFRESH_URL`
2. Log into admin, open a brand → Payouts, verify "Connect Stripe" button and not-connected state
3. Click button → confirm redirect to Stripe-hosted account_link URL
4. Confirm GET `/v1/tenancy/stripe-status` returns persisted status

## Known Stubs

None — all API endpoints return live data from the tenant aggregate and Stripe SDK.

## Threat Surface Scan

New network endpoints introduced (as planned in threat model):

| Flag                       | File                            | Description                                                                                 |
| -------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------- |
| threat_flag: new-endpoint  | stripe-onboarding.controller.ts | POST /v1/tenancy/stripe-onboarding — operator-auth + tenant:transfer + @RequireActiveTenant |
| threat_flag: new-endpoint  | stripe-onboarding.controller.ts | GET /v1/tenancy/stripe-status — operator-auth + tenant:read + @RequireActiveTenant          |
| threat_flag: outbound-call | stripe-connect.adapter.ts       | Stripe API (accounts, accountLinks, paymentIntents, refunds)                                |

All threat model mitigations from the plan implemented:

- T-08-09: Both routes operator-auth gated + @RequireActiveTenant
- T-08-10: Deterministic idempotency keys on every PI/Refund create
- T-08-11: STRIPE_SECRET_KEY never logged; prod-guardrails reject placeholder; `_env` discarded in adapter
- T-08-12: Direct charge via `stripeAccount` option; unit test asserts no `transfer_data.destination`
- T-08-SC: stripe@17.7.0 from official npm registry (legitimacy gate pre-cleared by orchestrator)

## Self-Check: PASSED

All key files exist and commits verified:

- `apps/api/src/contexts/tenancy/infrastructure/stripe-connect.adapter.ts` — FOUND
- `apps/api/src/contexts/tenancy/infrastructure/stripe-connect.adapter.spec.ts` — FOUND
- `apps/api/src/contexts/tenancy/application/start-stripe-onboarding.service.ts` — FOUND
- `apps/api/src/contexts/tenancy/interfaces/http/stripe-onboarding.controller.ts` — FOUND
- `apps/admin/src/lib/payments-api.ts` — FOUND
- Commit `56e3646` — FOUND
- Commit `a82e3b3` — FOUND
