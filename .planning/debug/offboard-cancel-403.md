---
status: fixed
trigger: 'Owner gets 403 on DELETE /v1/tenants/me/offboard right after their own POST returned 202'
created: 2026-08-28
updated: 2026-08-28
---

## Current Focus

ROOT CAUSE FOUND (evidence, not inference). The fix is a product decision — see below.

## Root cause

Captured the real response body instead of inferring it. The 403 is **`tenant.archived`**,
NOT the `auth.forbidden` the audit had guessed by elimination:

    {"type":"https://resto.app/problems/tenant.archived",
     "title":"Tenant has been archived.","status":403,
     "instance":"/v1/tenants/me/offboard","code":"tenant.archived"}

Two pieces of correct-looking code combine into a dead end:

1. `Tenant.scheduleOffboarding` (tenant.aggregate.ts:262-271) stamps **`archivedAt`**
   alongside `status: 'pending_offboarding'`:
   archivedAt: this.snapshot.archivedAt ?? now,
   Confirmed in the 202 body: `"archivedAt":"...","offboardingScheduledAt":"..."` — the
   same timestamp.

2. `AuthGuard.canActivate` (auth.guard.ts:62-74) refuses EVERY non-public request whose
   tenant has `archivedAt` set:
   if (tenant?.archivedAt) { ... throw ForbiddenException({ code: 'tenant.archived' }) }

So the instant an owner schedules offboarding, every authenticated operator route for
that tenant is locked — including `DELETE /v1/tenants/me/offboard`, the only self-serve
way to cancel. `cancelOffboarding` exists in the domain, is wired to a route, is in the
OpenAPI surface, and is unreachable.

The 30-day cool-off is not enforceable by the person it exists for.

## Blast radius

- The owner-facing cancel is dead. So is every other authenticated tenant route during
  cool-off (dashboard, menu edits, orders) — the tenant goes fully dark on schedule.
- Public reads already 404 by design (existence-hiding) once `archivedAt` is set, so
  guests stop seeing the menu the moment deletion is requested.
- **Not a total loss:** `DELETE /internal/v1/tenants/:id/offboard` is `@Public` +
  `InternalTokenGuard`, so it never reaches the archived check. Support/ops CAN cancel
  on the tenant's behalf. Covered by tenancy-offboarding.e2e, which passes 11/11.
  So this is "self-serve is broken", not "deletion is irreversible".

## The decision the fix needs

During the 30 days after a restaurant asks to be deleted, should it keep operating?

A. Cool-off is fully reversible — stop stamping `archivedAt` on schedule; let
`status='pending_offboarding'` alone mean "in cool-off", stamp `archivedAt` only at
erasure. Restaurant keeps serving guests and the owner keeps full access. Largest
behaviour change; closest to what a cool-off usually means.
B. Go dark immediately, but keep the exit — keep `archivedAt`, exempt the cancel route
from the archived check. Smallest change. Owner can cancel but can do nothing else.
C. Guests stop, owner keeps access — treat `pending_offboarding` as not-archived for
authenticated operator routes, keep public reads hidden. Middle ground.

Not choosing this unilaterally: it decides what a paying customer sees for 30 days.

## Symptoms

expected: 200, offboardingScheduledAt cleared.
actual: 403.
reproduction: `pnpm exec vitest run test/e2e/tenants-controller.e2e.spec.ts -t "clears offboardingScheduledAt for owner"` in apps/api. Fails in isolation.
why it matters: if real, a tenant that requests deletion cannot reverse it through the API — the point of the 30-day GDPR cool-off.

## Ruled out (2026-08-28 audit — do not re-tread)

- not test pollution / ordering — fails in isolation with a fresh tenant, owner and session
- both routes carry identical `@Permissions({ tenant: ['delete'] })` (tenants.controller.ts:75, :98)
- the gate works — neighbouring "403 for non-owner (admin)" tests pass on BOTH routes
- the domain expects it to work — `cancelOffboarding` (tenant.aggregate.ts:283) requires
  `status === 'pending_offboarding'`, exactly what `scheduleOffboarding` just set
- not a domain error surfacing — `TenantOffboardingNotAllowedError` and
  `TenantOffboardingCoolOffExpiredError` both map to 409 (error-mapping.ts:41-46)
- not `TenantSuspendedError` (the only tenancy error mapping to 403) — never thrown in src
- `PermissionsGuard` has no tenant-status logic; delegates to `auth.api.hasPermission`
- no tenant-status filter found in the better-auth store adapters

## Decision (founder, 2026-08-28)

Go dark immediately, but the owner keeps the way back. Variant B of the three offered.
The restaurant stops serving guests and the owner loses the panel the moment deletion is
requested — but the cancel route stays reachable so the 30-day window is usable.

Restore-from-plain-`archived` (a tenant archived outside the offboarding flow) was
considered and deliberately deferred: `archive()` still has no inverse, and `resume()`
only covers `suspended`. Not built here.

## Fix

1. `shared/auth/allow-archived-tenant.decorator.ts` — new `@AllowArchivedTenant()`,
   same shape as the neighbouring `@Public` / `@LocationNeutral` decorators.
2. `AuthGuard.canActivate` — reads the flag and skips ONLY the `archivedAt` refusal.
   Public routes can never opt out (`!isPublic` in the condition): existence-hiding for
   guests stays non-negotiable. Session and permission checks are untouched.
3. `tenants.controller.ts` — `@AllowArchivedTenant()` on `DELETE /v1/tenants/me/offboard`
   and nowhere else.

Auth and `tenant:delete` still gate the route, so only an authenticated owner of that
tenant can reach it. A tenant in plain `archived` status that calls it gets 409 from
`cancelOffboarding`, not a restore — the domain guard already covers that.

## Verification

- `tenants-controller.e2e` 22 passed (was 20 passed / 1 failed).
- **New test — "leaves every other tenant route dark while offboarding is pending"**:
  after scheduling, `GET /v1/tenants/me` and `/v1/tenants/me/domains` must still return
  403 `tenant.archived`. This is the load-bearing one: it proves the exemption is scoped
  to a single route and did not open the archived gate generally.
- api:typecheck, api:lint, `pnpm openapi:check` (artefacts in sync) all pass.
- Full 65-spec e2e sweep run afterwards because AuthGuard is global.

## Note for the record

The audit's "by elimination it is the guard's own auth.forbidden" was WRONG. The real
code was `tenant.archived`. Capturing the response body took about a minute and pointed
straight at the cause; the elimination chain had been confidently walking away from it.
Worth remembering: with an HTTP symptom, read the body before reasoning about the cause.

## Full-sweep result (post-fix, pinned env)

65 specs, one process each, on `debug-offboard-cancel-403`: **58 green, 7 red.**
Zero regressions — the 7 are exactly the known set:

    audit-pipeline, identity-email-verification, payment-lifecycle,
    tenancy, tenancy-offboarding, tenancy-erasure   -> fixed in PR #270, not on this branch
    identity-role-changed                           -> blocked on the admin-role decision

`tenants-controller` 22/22 (the fix plus the new scope-regression test).
`security` is GREEN in this sweep because the rate limits were pinned rather than
inherited from `.env` — independent confirmation that the audit's apparent security
regression was an environment artefact.

Raw: `.planning/notes/e2e-sweep-2026-08-28-post-guard-fix.txt`
