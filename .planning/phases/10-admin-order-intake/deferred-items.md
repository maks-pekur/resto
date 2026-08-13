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
