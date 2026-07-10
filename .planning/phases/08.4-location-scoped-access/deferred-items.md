# Deferred Items — Phase 08.4

## CRITICAL pre-existing gap: `@LocationNeutral()` missing on ~12 controllers (out of scope for Plan 06)

**Discovered during:** Plan 06 e2e verification (`apps/api/test/e2e/*.spec.ts`).

**Root cause:** Plan 05 (`08.4-05`) shipped `LocationScopeGuard` as a default-on global `APP_GUARD`
(mirroring `BrandScopeGuard`'s rollout) but did not audit every existing `@BrandNeutral()`-decorated
controller for the equivalent `@LocationNeutral()` opt-out. `LocationScopeGuard.canActivate` throws
`403 location.context_required` whenever `getLocationId()` is unbound and the route lacks
`@LocationNeutral()` — **before** it ever reaches the owner-bypass check, so even the owner is
blocked. Since no e2e suite was run as part of Plan 05's own verification (only `test/unit/identity`,
per `08.4-05-SUMMARY.md`), this went undetected.

**Blast radius (confirmed via `grep -rl '@BrandNeutral()' apps/api/src --include='*.controller.ts'`
cross-referenced against `@LocationNeutral()`):** 16 controllers were missing the decorator. Plan 06
fixed the 4 that were required to unblock its own e2e verification (`public-menu.controller.ts` —
directly in Plan 06's file list and the actual availability bug this phase ships;
`internal-tenants.controller.ts`, `me-brands.controller.ts`, `locations.controller.ts` — required by
every e2e fixture that provisions a tenant/brand/location). **The following remain broken and need a
dedicated remediation task:**

- `apps/api/src/contexts/payments/interfaces/http/stripe-webhook.controller.ts`
- `apps/api/src/contexts/payments/interfaces/http/checkout.controller.ts`
- `apps/api/src/contexts/identity/interfaces/http/me.controller.ts`
- `apps/api/src/contexts/identity/interfaces/http/roles.controller.ts`
- `apps/api/src/contexts/identity/interfaces/http/set-active-brand.controller.ts`
- `apps/api/src/contexts/identity/interfaces/http/member-roles.controller.ts`
- `apps/api/src/contexts/identity/interfaces/http/set-active-location.controller.ts`
- `apps/api/src/contexts/identity/interfaces/http/signup.controller.ts`
- `apps/api/src/contexts/tenancy/interfaces/http/tenants.controller.ts` (confirmed failing live —
  `GET /v1/tenants/me` now 403s; see `cross-tenant-isolation.e2e.spec.ts` `RES-237` suite)
- `apps/api/src/contexts/tenancy/interfaces/http/brand-onboarding.controller.ts`
- `apps/api/src/contexts/ordering/interfaces/http/orders.controller.ts` — **guest checkout is
  currently broken** (403 on every `POST /v1/orders`); this is the highest-severity item since it
  blocks the MVP-1 revenue path
- `apps/api/src/health/health.controller.ts` — health checks may be affected depending on load-balancer
  probe headers

**Recommendation:** A dedicated quick-task or follow-up plan should audit each controller individually
(not a blind decorator copy) — `orders.controller.ts` in particular may warrant genuine location
resolution (per this phase's D-03) rather than a blanket `@LocationNeutral()` opt-out, once ordering's
`location_id` work (deferred to a later plan of this phase) lands.

## Pre-existing gap: BA Drizzle `session` schema missing `activeLocationId` (out of scope for Plan 06, fixed as a blocking prerequisite)

**Root cause:** Plan 03 (`08.4-03`) added `session.active_location_id` via migration
`0066_session_active_location.sql` and wired the Better Auth `additionalFields` config
(`auth.config.ts`) to read/write it, but never added the corresponding Drizzle column to
`packages/db/src/schema/auth.ts`'s `session` table definition (the table BA's own `drizzleAdapter`
uses). Every sign-up (`BootstrapOwnerService.signUpUser` → BA's `signUpEmail`) failed with
`BetterAuthBootstrapFailureError: The field "activeLocationId" does not exist in the "session" Drizzle
schema` — i.e. **the entire owner bootstrap flow was broken**, blocking every e2e test in the
repository that calls `runBootstrap`.

**Fix:** Plan 06 added the missing `activeLocationId: text('active_location_id')` column to
`packages/db/src/schema/auth.ts`'s `session` table (mirrors the pre-existing `activeBrandId` column
1:1). This was necessary to run ANY e2e verification for Plan 06's own changes, not just optional
cleanup — treated as a Rule 3 blocking-issue auto-fix.

## Pre-existing test failure (out of scope for Plan 06)

**File:** `packages/db/test/unit/withoutTenant-callsite-enforcement.spec.ts`
**Test:** `AUDIT #16: withoutTenant call-site enforcement > the set of real .withoutTenant( callers EQUALS the allowlist (strict bidirectional)`
**Status:** Failing — `apps/api/src/contexts/identity/infrastructure/initial-location-drizzle.repository.ts`
calls `.withoutTenant(` but is not present in `packages/db/src/withoutTenant.allowlist.ts`.

**When introduced:** `cc7b8c4 feat(08.4-03): active-status-filtered member_location_scope reader +
initial-location pin` — predates Plan 06 work.

**Fix needed:** Add the file to `WITHOUT_TENANT_ALLOWLIST` with a justification comment (mirrors the
existing `InitialBrandDrizzleRepository` entry), or refactor the call site.

## Pre-existing test failure (out of scope for Plan 06, previously documented)

**File:** `apps/api/test/unit/identity/identity-boot-integration.spec.ts`
**Test:** `Plan 03-02 D-14: boot-time email-adapter misconfiguration regression > happy path: staging
with real key + adapterName=resend → assertProdGuardrails passes`
**Status:** Failing — `STRIPE_CONNECT_RETURN_URL`/`STRIPE_CONNECT_REFRESH_URL` prod-guardrail rejects
the test's synthetic staging env.

**When introduced:** Predates `08.4-03` (confirmed identical failure on the commit before that plan's
work began, per `08.4-03-SUMMARY.md` "Issues Encountered"). Confirmed still present and unrelated to
Plan 06's changes.
