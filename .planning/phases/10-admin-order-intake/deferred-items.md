# Phase 10 — Deferred Items

Items acknowledged during Phase 10 execution and carried forward, not fixed
in this phase.

## D-07 — LocationPermissionChecker: third explicit re-defer (Phase 10)

**Status:** Deferred (explicitly re-confirmed, not left dangling per D-07's
escape hatch — this is the third re-defer, after 08.4 and 08.5-03).

### 1. What is deferred

Binding `PERMISSION_CHECKER` (`apps/api/src/contexts/identity/identity-core.module.ts`)
to `LocationPermissionChecker` instead of the currently-bound
`BetterAuthPermissionChecker`. `LocationPermissionChecker`
(`apps/api/src/contexts/identity/application/location-permission-checker.ts`)
exists, is unit-tested, and is exported from `IdentityCoreModule` — it is
built but deliberately not wired as the live implementation.

### 2. Why, concretely

Two concrete gaps, not one:

1. `PermissionsGuard.canActivate()`
   (`apps/api/src/contexts/identity/interfaces/http/guards/permissions.guard.ts`)
   calls `this.checker.hasPermission(principal, required, headers)` — three
   arguments. `LocationPermissionChecker.hasPermission()` takes a fourth
   parameter, `activeLocationId?: string | null`, that nothing currently
   supplies. `AuthGuard` already populates `req.activeLocationId` on every
   request (the same field `LocationScopeGuard` reads), so threading it
   through is a one-line fix on its own — but it is not sufficient by
   itself; see (2).
2. **The real cost.** `LocationPermissionChecker.hasPermission()` returns
   `false` for any non-owner whenever `activeLocationId` is falsy
   (`if (!activeLocationId || !principal.tenantId) return false;`). Every
   route decorated `@LocationNeutral()` legitimately runs without a
   location context (tenant/brand-wide permission checks — menu, brand,
   team, settings, and more). A wholesale swap of `PERMISSION_CHECKER`
   would therefore 403 every non-owner on every `@LocationNeutral()` route
   — a full regression across the admin surface, not a Phase 10 concern.

### 3. Why the Phase 10 write path is nonetheless safe without it

Order-mutation routes (status transitions, reject/cancel, refund) keep the
standard `LocationScopeGuard` non-owner branch
(`apps/api/src/contexts/identity/interfaces/http/guards/location-scope.guard.ts`),
which independently verifies:

- `activeLocationId === req.activeLocationId` (session-pinned,
  server-controlled — cannot be forged by the caller), AND
- `scope.includes(locationId)` via
  `MemberLocationScopeReader.findLocationScopeForMember`, reading the
  tenant's `member_location_scope` table.

This check runs regardless of which `PermissionChecker` is bound — it is a
separate guard in the chain, not dependent on `PERMISSION_CHECKER`'s
implementation. It already prevents a staff member from acting on an
order at a location they are not scoped to.

What `LocationPermissionChecker` additionally offers is a **different
role per location** for the same person — a capability the product does
not currently expose anywhere: there is no assignment UI for it beyond the
Team location→role matrix (which sets `member_location_scope.role`
per-location already, so this partially exists in data), and no
permission-check code path reads that column today except through
`LocationPermissionChecker` itself. The practical gap left by not wiring
it is "a staff member's permission set is resolved tenant-wide (via BA),
not location-by-location," which is the app's behavior everywhere else
today (08.4/08.5's re-defers), not a regression introduced by Phase 10.

### 4. What would make this urgent

The first product surface that lets an owner give one person a
**different permission set at different locations** (e.g., a person who
is `manager` at one location and `cashier-foh` at another, where the
distinction actually changes what they're allowed to do beyond order
status transitions). Until that surface ships, `LocationScopeGuard`'s
location-membership check plus a single tenant-wide role is sufficient.

### 5. Cost estimate when it is picked up

1. Thread `req.activeLocationId` into `PermissionsGuard.canActivate()`'s
   `hasPermission()` call (one line — the field is already populated by
   `AuthGuard`).
2. Resolve the `@LocationNeutral()` regression: either make
   `LocationPermissionChecker` fall back to a tenant-wide check when the
   handler is `@LocationNeutral()` (needs `Reflector` access inside the
   checker, which it does not currently have), or bind
   `PERMISSION_CHECKER` per-route rather than globally (larger DI change).
3. Re-run the full `@LocationNeutral()` controller audit (the one from
   08.4-05/08.4-06) against the new checker before flipping the binding in
   any environment with real tenants.

Cross-referenced from `10-02-SUMMARY.md`.

## docs/api/openapi.yaml — pre-existing wholesale drift (found in Phase 10 Plan 06)

**Status:** Out of scope, not fixed. Discovered, not caused, by this plan.

**What was found:** Running `pnpm exec nx run api:openapi:emit` against the
worktree's committed `docs/api/openapi.yaml` produces a ~430-line diff
covering endpoints unrelated to this plan's task list — `/v1/tenancy/locations`
(create/list/archive), `/v1/me/set-active-brand`, and others from Phase
08.4/08.5's controller work. None of that work's landing plans regenerated
and committed the OpenAPI artifact, so `pnpm openapi:check` (the CI drift
gate) was already red before this plan touched anything.

**What this plan did instead:** Task 1 changes `OrderStatusResponseSchema`
(`orders.controller.ts`), which does change the emitted spec for
`OrderStatusResponseDto`. Rather than committing a full regenerated
`docs/api/openapi.yaml` (which would silently absorb the unrelated ~430-line
pre-existing drift into this plan's commit — a Scope Boundary violation),
the `OrderStatusResponseDto` schema block was hand-edited to match exactly
what the generator produces for the new nine-field shape, verified by a
throwaway full regeneration + targeted diff extraction, then reverted and
reapplied as a minimal, scoped patch. Same approach for
`packages/api-client/src/generated/api.ts`'s `OrderStatusResponseDto` type.

**Net effect:** `pnpm openapi:check` still fails after this plan, for the
same pre-existing reasons it failed before (Phase 08.4/08.5 endpoints never
regenerated). This plan's own endpoint (`/v1/orders/{id}/status`) is
correctly in sync. Fixing the wholesale drift is a separate maintenance
task — running `pnpm exec nx run api:openapi:emit && pnpm exec nx run
api-client:gen` and committing the full result — not attributable to any
single phase's file list.

## test/e2e/payments-isolation.e2e.spec.ts — pre-existing broken fixture (found in Phase 10 Plan 05)

**Status:** Out of scope, not fixed. Discovered, not caused, by this plan.

**What was found:** Running this spec in isolation fails with
`PostgresError: null value in column "location_id" of relation "orders"
violates not-null constraint`. `seedFixture()` inserts into `orders` via a
raw SQL `INSERT INTO orders (id, tenant_id, brand_id, idempotency_key,
order_number, status, fulfillment_mode, subtotal, delivery_fee,
service_fee, discount, total, currency) VALUES (...)` with no `location_id`
column at all. `orders.location_id` has been `NOT NULL` since migration
`0070_orders_location_id.sql` (Phase 08.4 Plan 08), which predates this
plan by two full phases. The fixture was never updated for that schema
change. This file is not in Plan 10-05's `files_modified` list and was not
touched by any of this plan's edits (`git status --short` confirms zero
diff on it) — it was already red before this plan started.

**Also observed:** a first run failed even earlier with `Error: Failed to
connect to Reaper` (a testcontainers infra hiccup starting the `startNats`
sidecar this spec's `with-real-stack.setup.ts` harness requires) — an
unrelated, likely transient, environment issue with the heavier
NATS+Postgres real-stack pattern this file uses (`payment-lifecycle.e2e.spec.ts`
and the new `order-cancel-refund.e2e.spec.ts` both use the lighter
db-only `with-db-stack.ts` harness and are unaffected).

**What this plan did instead:** Nothing — per the scope boundary rule,
pre-existing failures in files outside the current task's changes are
logged here, not fixed. `payments-isolation.e2e.spec.ts` was read (not
edited) only to confirm it has no `payment_refunds` INSERT site that
migration 0076's schema change could have broken (it only `SELECT`s
`schema.paymentRefunds.id`).

**Cost estimate when picked up:** add `locationId` (a seeded
`schema.locations` row's id) to both `orders` INSERT value tuples in
`seedFixture()`, matching the pattern already used by
`payment-lifecycle.e2e.spec.ts`'s `beforeAll`. Small, mechanical fix —
not attributable to Plan 10-05.

**Compounding note for whoever picks this up:** once the `location_id` gap
above is fixed, this fixture's raw `INSERT INTO payment_refunds (id,
tenant_id, payment_id, stripe_refund_id, amount, reason, status) VALUES
(...)` (no `refund_request_id`) will newly fail against migration 0076
(this plan), which made `refund_request_id` `NOT NULL`. Add a
`refund_request_id` value (e.g. `'legacy:test'` or any unique string) to
that INSERT at the same time.

## test/e2e/security.e2e.spec.ts — pre-existing `innerJoin is not a function` on `/internal/v1/tenants` (found in Phase 10 Plan 08)

**Status:** Out of scope, not fixed. Discovered, not caused, by this plan.

**What was found:** `Security middleware (RES-99) > rate limit > honours the
stricter limit on /internal/v1/* routes` fails with `expected 500 to be
429`. Both requests in the test (the one expected to succeed and the one
expected to be rate-limited) return 500 with
`"originalDetail": "tx.select(...).from(...).innerJoin is not a function"`
— i.e. the underlying `/internal/v1/tenants` handler itself throws before
the rate limiter's pass/fail distinction is even reachable; this is not a
rate-limiting bug. `security.e2e.spec.ts`'s `createApp()` builds a hand-rolled
`TenantAwareDb` stub (`buildDbStub()`) whose `withoutTenant` mock only
implements `select().from().where().limit()` — it has never supported
`.innerJoin()`. `innerJoin` calls already exist in
`apps/api/src/contexts/identity/infrastructure/initial-brand-drizzle.repository.ts`
at the plan's own base commit (`5449fd0`, confirmed via `git show
5449fd0:...initial-brand-drizzle.repository.ts`), i.e. before this plan's
session started — some provider in the tenant-provisioning path this test
exercises calls `.innerJoin()` on the stub, and always would have.

**Verified not caused by this plan's Task 2 change:** `apps/api/src/shared/security.ts`'s
new `keyGenerator` (per-principal rate-limit bucketing, see 10-08-SUMMARY.md)
was temporarily reverted to its pre-Task-2 state (`git checkout --
apps/api/src/shared/security.ts`) and the test re-run — identical failure,
identical `innerJoin is not a function` error, on both requests. The
`keyGenerator` change was then reapplied. This test was already broken by
this stub's limited surface before Task 2 touched the rate limiter at all.

**What this plan did instead:** Nothing to this test file or the stub — per
the scope boundary rule, a pre-existing gap in an unrelated identity
repository call path (surfaced through a test-harness stub, not through any
file this plan's `files_modified` list touches) is logged here, not fixed.

**Cost estimate when picked up:** extend `buildDbStub()`'s `withoutTenant`
mock tx to also stub `.innerJoin()` (return `this` or a compatible chain),
matching whichever repository call in the tenant-provisioning path needs
it — or replace the hand-rolled stub with the real `with-db-stack.ts`
testcontainer harness for this one describe block, at the cost of losing
the lightweight/no-Docker property the rest of `security.e2e.spec.ts`
relies on for its other (non-DB) assertions.

## apps/admin/e2e/adm-00-smoke-walk.spec.ts — scenarios 2-8 assert against the retired Next.js admin UI (found in Phase 10 Plan 13)

**Status:** Out of scope, not fixed. Discovered, not caused, by this plan.

**What was found:** Plan 13's `apiOrigin()` fix to `seed-tenants.ts` (stale
`:3000` default) plus a companion fix to the same file's
`signInAndGetCookie`/`setActiveOrg` (missing `Origin` header, tripping
Better Auth's own `MISSING_OR_NULL_ORIGIN` origin-check) together let
`adm-00-smoke-walk.spec.ts` scenario 1 actually reach a live server and
pass for the first time in this session. Scenario 2 ("0-brand tenant
renders EmptyState empty-variant") then fails on
`page.locator('text=/your tenant has no brands yet/i')` — the running
admin app redirects a zero-brand owner from `/dashboard` straight to
`/onboarding/brand` (`apps/admin/src/routes/(protected)/dashboard-redirect.$.tsx`
plus the `brands.length === 0` check in
`apps/admin/src/routes/(protected)/$brandSlug/_layout.tsx`), not an inline
`EmptyState` on `/dashboard` itself. The admin app was fully rewritten
Next.js → Vite SPA in Phase 7.5/7.6 (project memory
`project_admin_vite_migration_2026_06_21`), well before Phase 10 started;
`adm-00-smoke-walk.spec.ts` (written in Phase 2 for the retired Next.js
admin) was never updated for the new route tree and component structure.
Scenarios 3-8 were not independently verified against the new UI (the
Playwright run stopped early on cascading sign-in rate-limit exhaustion
from running many real sign-ins back-to-back in one worker — see the note
below), but scenario 2's finding — the fundamental `/dashboard` route
behavior changed — makes it near-certain the rest reference retired
selectors/routes too.

**What this plan did instead:** Fixed the two `seed-tenants.ts` bugs
(`apiOrigin()` default, missing `Origin` header) since both are directly
in this plan's `files_modified` list and are what let scenario 1 pass.
Did not touch `adm-00-smoke-walk.spec.ts` itself or attempt to rewrite its
assertions against the current SPA — that is a full re-write of a Phase 2
test file for a Phase 7.5/7.6 rewrite, disproportionate to and outside
this plan's scope (D-01..D-17 concern order intake, not the admin shell).

**Also observed — e2e suite rate-limit exhaustion is a real artifact, not
a regression:** running the full `pnpm --filter admin e2e` sweep (all four
spec files, 11 tests, one Playwright worker) in one process exhausts
`RATE_LIMIT_AUTH_SIGNIN_PER_MIN` partway through, since every scenario's
fixture does a real `POST /api/auth/sign-in/email`. This is the browser-e2e
analog of the already-documented `api full-suite 429 gotcha` (project
memory) for vitest. Every spec in this plan (`adm-01`, `adm-02`, `adm-03`)
was independently verified green against a freshly-restarted api process
with a clean rate-limit bucket; the cascading 429s only appear when many
specs run back-to-back with no restart between them. `10-13-VERIFICATION-EVIDENCE.md`
records both the batched-clean-run results and this full-sweep caveat.

**Cost estimate when picked up:** rewrite `adm-00-smoke-walk.spec.ts`
scenario-by-scenario against the current TanStack Router route tree
(`/onboarding/brand`, `/{brandSlug}/...`) and component structure — a
full spec rewrite, not a patch. Separately, consider a `reuseExistingServer`-safe
rate-limit-aware retry/stagger in the e2e harness itself (or a documented
"run `pnpm --filter admin e2e` in batches, not as one sweep" convention
mirroring the vitest gotcha) so the full suite can run unattended in CI.

## Expired-session signal on the login page (found 2026-08-19)

When a session expires mid-work the admin bounces to `/login?next=…` and shows a
bare "Sign in" — the operator is not told why they were thrown out. The login
page now renders a notice when `?expired=true` arrives
(`data-testid="session-expired-notice"`), but nothing emits that flag.

It cannot be emitted from the client: the session cookie is `httpOnly`, so the
browser cannot distinguish "token present but invalid" from "no token". The
server has to make that distinction and surface it.

A login-page notice keyed on `?expired=true` was briefly added and then removed:
with no emitter it could only be triggered by hand-editing the URL, and
`z.coerce.boolean()` made **any** value — including `expired=false` — render it.
Build the server signal first, then the UI. `adm-00` scenario 5 is `test.fixme`
waiting on it.
