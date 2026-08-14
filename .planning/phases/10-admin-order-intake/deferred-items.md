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
