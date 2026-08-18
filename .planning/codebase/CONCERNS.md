# Codebase Concerns

**Analysis Date:** 2026-08-18

This is a refresh of a 2026-06-13 audit. Most of that audit's findings have
shipped fixes since (Phase 1 tenancy hardening, the deep-audit remediation,
the Redis-removal/edge-caching rework, and the admin Next.js→Vite migration
each closed a cluster of them) — those are not repeated here. What follows
is current as of the Phase 10 pause point: 12/13 plans of Admin Order Intake
merged, phase 13 parked on a human money-path checkpoint, Phase 10.1 in
context-gathering.

## Verification Debt

This is the largest open gap in the project right now and the reason
execution is paused to test rather than continuing to plan. Five completed,
merged phases have **no verification artifact at all** — nobody has checked
their shipped work against the phase's own success criteria:

- **`04b-catalog-admin-ui`** (9 plans, all merged) — the entire catalog
  admin CRUD surface: categories, items, modifiers, modifier groups, sizes,
  stop-list, photo upload, draft/publish flow with countdown UI. No
  `04b-VERIFICATION.md` exists. No one has confirmed the publish flow works
  end to end against the finalized schema.
- **`07.6-admin-vite-spa`** (plans 01-06 merged; 07-09 explicitly deferred
  per the CR-04 split decision) — the full Next.js→Vite rewrite of the
  admin panel: routing, auth, brand switching, dashboard, sidebar. No
  `07.6-VERIFICATION.md` for what shipped.
- **`08.1-payments-provider-layer-and-onboarding-ux`** (5 plans, all
  merged) — embedded Stripe Connect onboarding UX and the
  `PaymentProviderPort` abstraction. No verification artifact.
- **`08.4-location-scoped-access`** (11 plans, all merged) — the locations
  entity, `member_location_scope`, per-location roles, and
  `LocationScopeGuard`; explicitly security-sensitive (BOLA-shaped: does a
  staff member see only their own location's data). No
  `08.4-VERIFICATION.md`. Two real production bugs were found later during
  ad-hoc use (owner brand-global dashboard white-screen; `activeLocationId`
  silently reset to null on every brand switch) — both fixed, but found by
  chance, not by a verification pass, which is exactly the failure mode a
  verification step exists to catch.
- **`01-tenancy-hardening`** (6 plans, all merged) — the foundational RLS +
  composite-FK + GDPR-erasure phase. No `01-VERIFICATION.md`. Lower risk
  than the other four: the subsequent 28-finding deep audit (`.planning/AUDIT.md`,
  all closed) effectively re-covered this ground, and `tenant-isolation.spec.ts`
  is a live regression net — but it was never checked against Phase 1's own
  stated success criteria as a discrete gate.

Three phases have a verification artifact that resolved to something other
than a clean pass, and none have been revisited since:

- **Phase 03 (`03-auth-completion`) — `human_needed`.** 11/11 must-haves
  verified by inspection, but 5 items (role-changed audit semantics, the
  AUTH-10 DLQ e2e, the invitation flow e2e, others) were never actually run
  against a live Docker stack at verification time. Running the two
  identity e2e specs today confirms real red (see Known-red tests below) —
  the `human_needed` status was warranted, and the gap it flagged is real.
- **Phase 08 (`08-payments-stripe-connect`) — `gaps_found`, score 4/5.**
  The D-06 orphan-payment auto-refund path writes a `payments.status =
'orphan'` row, but `'orphan'` was not in the `payments_status_chk` DB
  constraint at verification time — the INSERT/UPDATE would fail the
  constraint, silently breaking the double-charge guard. Not re-verified
  since; confirm the constraint was widened before trusting this path.
- **Phase 08.3 (`08.3-owner-managed-roles-and-permissions`) — `human_needed`.**
  9/9 truths verified by static analysis, but all three e2e specs
  (privilege-escalation, brand-scope-orthogonality, cross-tenant-isolation)
  were never run against a live Docker stack at verification time — same
  gap shape as Phase 03.

Additionally, **Phase 08.2** verified `passed` but left one open
`human_verification` item unresolved: whether `/` should redirect to the
session-pinned active brand or deterministic-`brands[0]` is accepted
behavior. `apps/admin` still redirects to `brands[0]` unconditionally
(`resolveIndexRedirectSlug`) — nobody has confirmed this is intentional.

## Known-red Tests

Verified live against the current Docker dev stack (not carried from
memory) on 2026-08-18. Four distinct standing failures, plus two separately
documented pre-existing gaps from Phase 10's own deferred-items log:

**`identity-bootstrap.e2e.spec.ts` — 2 failures, fixture drift, NOT a
product defect.** Re-verified 2026-08-18 against the running stack. A
freshly bootstrapped owner does get `403` on `GET /v1/tenants/me`, but the
cause is that the session has no active organization: a bare
`POST /api/auth/sign-in/email` leaves `session.active_organization_id`
null, so `PermissionsGuard` resolves no membership and therefore no
permissions. Setting the active organization is a separate step the admin
performs after login. Confirmed both ways on live data — a fresh
curl sign-in reproduces the 403 with a null `active_organization_id`, while
the sessions created by the admin's real login flow carry it and the same
owner reads the route fine. The `owner` system role does hold
`tenant: ['read', 'delete', 'transfer']`.

What is genuinely wrong here is the error, not the authorization: the
response is `auth.forbidden` / "Insufficient permissions" when the real
condition is "no active organization selected". The location guard already
models this correctly with `location.context_required`. The misleading code
cost real diagnosis time twice — once during the Phase 08.4 triage and again
during this mapping pass. Worth a small, deliberate change on the auth path;
until then, treat a 403 on a brand-neutral route as "check the active org
first".

The spec's own active-org step has drifted since Phase 08.2's default-deny
flip and needs reseeding. Tracked in STATE.md's Blockers as pre-existing.

**`identity-invitation.e2e.spec.ts` — 2 failures, real pre-existing bug,
already tracked.** `POST /api/auth/organization/invite-member` returns
`403` instead of `200`/`201` for a freshly bootstrapped owner. This is the
bug already named in `.planning/notes/dependency-cve-deferral.md`:
`runBootstrap` produces unverified user rows, and Better Auth's
`invite-member` path enforces `emailVerified` independently of the
`REQUIRE_EMAIL_VERIFICATION` env var the test sets to `false` for sign-in.
No bootstrapped owner can invite a team member without first verifying
their own email — a real product gap, not just a test artifact. Flagged
for re-check during the deferred `better-auth` 1.4→1.6 migration.

**`signup-enumeration.e2e.spec.ts` — 1 failure (`timing parity`), fixture
problem, not a product defect.** The test pre-seeds 10 signups sequentially
via `POST /v1/signup` with no rate-limit override in its `beforeAll`
(unlike its sibling `identity-invitation.e2e.spec.ts`, which does raise
`RATE_LIMIT_*` env vars). `RATE_LIMIT_AUTH_SIGNUP_PER_MIN` defaults to `5`,
and `/v1/signup` is now IP-keyed for rate-limiting (the Phase 10 CR-02
fix), so the 6th+ seed call in the same test process deterministically
gets `429` instead of `201`. The app is behaving correctly; the test
fixture was never updated for the credential-route IP-keying that Phase 10
added.

**`security.e2e.spec.ts` — 1 failure, fixture problem (test-double
gap), matches `deferred-items.md` exactly.** `GET /internal/v1/*` rate-limit
test gets `500` instead of `429` — the underlying handler throws first.
`createApp()`'s hand-rolled `TenantAwareDb` stub's `withoutTenant` mock only
implements `select().from().where().limit()`; some provider in the
tenant-provisioning path this test exercises calls `.innerJoin()`, which the
stub doesn't support. Pre-existing before Phase 10 touched the rate limiter;
confirmed still present today.

**Two more pre-existing gaps, already logged in
`.planning/phases/10-admin-order-intake/deferred-items.md`, both confirmed
still present:**

- `payments-isolation.e2e.spec.ts` — raw SQL fixture INSERTs into `orders`
  with no `location_id` column; `orders.location_id` has been `NOT NULL`
  since migration `0070` (Phase 08.4). Fixture bug, not a product defect.
- `apps/admin/e2e/adm-00-smoke-walk.spec.ts` scenarios 2-8 — written in
  Phase 2 against the retired Next.js admin, asserting selectors and an
  inline `/dashboard` `EmptyState` that no longer exists after the
  Phase 7.5/7.6 Vite rewrite (zero-brand owners now redirect to
  `/onboarding/brand`). Test-file obsolescence, not a runtime defect; a
  full spec rewrite, not a patch.

**A cluster of location/brand-scope e2e fixture debt, already named in
`.planning/STATE.md`, re-confirmed still red today (5 failures across 4
files: `set-active-brand.e2e.spec.ts` x2, `catalog-reads.e2e.spec.ts` x2,
plus related brand-isolation assertions).** All seed the pre-D-04
`member_brand_scope` model; brand reachability has derived from
`member_location_scope` since Phase 08.4, so these fixtures now get `403
location.context_required` or a null `activeBrandId` where they expect a
value. Confirmed NOT a derivation bug — `me-brands`, `catalog`, and
`cross-tenant-isolation` e2e specs exercise the same code path and are
green. Pure fixture staleness; scoped to whoever picks up the phase-10
follow-up test-debt item.

**Not a standing failure despite being grouped with the others in
`STATE.md`:** `tenancy-offboarding.e2e.spec.ts` (the "offboard-cancel"
scenario) passes clean (11/11) when run in isolation today. Its earlier
appearance in a full-suite run is almost certainly the documented
full-suite 429/timeout contention gotcha (project memory), not a real
regression — worth removing from the STATE.md note the next time it's
touched, so it stops being re-litigated as red.

## Dev-environment Traps

**`seed-demo` cannot exercise the money path — this is what's parking
Phase 10 right now.** `pnpm resto:seed seed-demo` provisions a tenant,
brand, and catalog, but never runs Stripe Connect onboarding: it sets
neither `brands.stripe_account_id` nor `stripe_charges_enabled`, and leaves
`brands.default_currency` null (populated during onboarding by design).
`Brand.canAcceptPayments()` requires both, so `POST
/v1/checkout/payment-intent` returns `payments.not_enabled` (409) for every
demo-seeded brand. Manual testing of guest checkout, the two-screen order
walkthrough, and the refund path all require standing up real Stripe
test-mode Connect onboarding by hand first. Recorded in
`10-13-CHECKPOINT.md`; the recommended fix (teach `seed-demo` to do
onboarding, or provide a scripted equivalent) is on the resume list for
Phase 10.

**`StubProviderAdapter` exists but cannot substitute for the above.**
`apps/api/src/contexts/payments/infrastructure/stub/stub-provider.adapter.ts`
implements `PaymentProviderPort` but is not wired into
`payments.module.ts` (confirmed: no reference to it there). Even if wired,
it returns a synthetic `clientSecret` that Stripe Elements rejects
client-side — it cannot unblock a real browser checkout walkthrough. Only
real Stripe test-mode credentials make local money-path testing possible.

## Deferred Infrastructure

**Production deploy is parked until the first paying customer (founder
decision, 2026-06-26).** Phase 7.5 Wave 0 (RDS decision, boot fixes, direct
DB connection for the outbox, leader `/readyz`, Sentry, fail-loud env
guards) is complete and merged; plans 06-10 (the actual live stand-up on a
VPS + Docker Compose + Cloudflare) are deliberately not scheduled. Current
exposure: zero — nothing is deployed. This is accepted debt, not a defect;
re-plan when a paying customer is imminent.

**Framework-major CVE migration deferred to a pre-launch milestone**
(decision recorded `.planning/notes/dependency-cve-deferral.md`,
2026-06-13, still current). `pnpm audit` reports high/critical advisories
in `fastify` 4.28.1, `@nestjs/platform-fastify` ^10.4.15, and (transitively
via `better-auth`) `vitest`, none of which have an in-major patch — fixing
requires Fastify 4→5 + NestJS platform-fastify 10→11 + `better-auth`
1.4→1.6 together, a multi-day breaking migration across the whole API.
`better-auth` is now pinned exact at `=1.4.22` (tightened from a `~` range
since the last audit). Current exposure remains zero (no production
deploy). `Dependency audit` CI stays non-blocking by design. Re-check the
already-discovered `identity-invitation.e2e.spec.ts` invite-member bug
above during this migration — the note that flags it explicitly calls this
out.

## Carried Architectural Gaps

**`LocationPermissionChecker` built, unit-tested, exported — deliberately
not wired as the live `PERMISSION_CHECKER`. Third explicit re-defer**
(08.4 → 08.5-03 → Phase 10's own `deferred-items.md` D-07), each time
re-confirmed rather than left dangling. `identity-core.module.ts` still
binds `PERMISSION_CHECKER` to `BetterAuthPermissionChecker` (confirmed).
Wiring it needs two things: (1) `PermissionsGuard.canActivate()` doesn't
thread `req.activeLocationId` into `hasPermission()` yet (small, one-line
fix — the field is already populated by `AuthGuard`); (2)
`LocationPermissionChecker.hasPermission()` returns `false` for any
non-owner when `activeLocationId` is falsy, which would 403 every
non-owner on every `@LocationNeutral()` route (menu, brand, team, settings
— most of the admin surface) if swapped in wholesale. What it would add —
a different permission set per location for the same person — has no
product surface yet (no assignment UI beyond the Team location→role
matrix, no other code path reads that per-location role column). Becomes
urgent the day a location-differentiated-permissions feature ships;
`LocationScopeGuard`'s independent location-membership check already
prevents the security-relevant case (a staff member acting on an order at
a location they're not scoped to) regardless of this gap.

**An owner in brand-global (`?location=all`) mode cannot read the
location-grain stop list.** `LocationScopeGuard` throws
`location.context_required` before the owner-bypass branch is reached, so
the front end gates the request off rather than surfacing a 500. Documented
as an 08.4 known gap (c), still true after 08.5's owner-filter UX rework
(08.5-03 D-11 re-confirms no guard change). A brand-global aggregate view
for the stop-list specifically is unbuilt; the dashboard and menu/stop-list
pages do have an aggregate branch (08.5-05), so this is scoped narrowly to
the stop-list's own read path, not the whole owner-all-mode experience.

**The Team location→role matrix shows a raw location UUID, not a name,
when a member is scoped to a location belonging to a brand other than the
one currently open.** Documented 08.4 known gap (d), unresolved since.
Cosmetic, not a security issue, but a real UX rough edge an owner will hit
the first time they manage a multi-brand team.

## Tech Debt

**`feature-flags` package is still an empty placeholder.**
`packages/feature-flags/` contains only a `.gitkeep`; the workspace still
lists it. `packages/CLAUDE.md` documents it as "OpenFeature client with the
configured provider (Unleash self-hosted)" — nothing is implemented. Any
import from `@resto/feature-flags` fails at build time. Explicitly deferred
in `STATE.md`'s blockers list; `ONB-05`'s dev-mode toggle was deliberately
built as a plain `SKIP_PAYMENT_FLOW` env var instead of depending on this
package. No action needed until a real feature-flag use case appears.

**`dependency-cruiser` domain-boundary enforcement is still only a
documented intent, not a rule.** `packages/domain/CLAUDE.md` and
`packages/CLAUDE.md` both say a `dependency-cruiser` rule (planned) will
reject `@nestjs/*`/`drizzle-orm`/`pg` imports inside `@resto/domain`. Only
the Nx ESLint tag-based module-boundaries rule exists
(`packages/config-eslint/base.mjs`), which does not catch transitive infra
imports within the package itself. No `.dependency-cruiser.cjs` exists
anywhere in the repo. Low current risk (`packages/domain/src` has stayed
clean by convention) but nothing technical prevents drift.

**`BrandTheme.logoUrl` still accepts `javascript:`/`data:` URLs.**
`packages/domain/src/brand-theme.ts:12` — `z.string().url().nullable()`
with no scheme restriction, unchanged since the last audit. `font`
(`brand-theme.ts:18`) still has no character allowlist beyond
`.min(1).max(64)`. Neither field is rendered anywhere in `apps/website` or
`apps/qr-menu` yet (confirmed no usages), so risk stays latent — but the
schema itself still permits storing an XSS/CSS-injection payload the day
either field is interpolated into `<img src>`/`<a href>`/`font-family`
without a client-side re-check.

**`packages/domain/src/schema/tenant.ts`'s `stripeAccountId` is still
unbounded (`z.string().nullable()`, no `.max()`), but this file appears to
be dead code.** No non-test import of `schema/tenant.ts` was found anywhere
in `apps/api`. The live Stripe-account schema is
`apps/api/src/contexts/tenancy/domain/tenant.aggregate.ts`'s
`StripeAccountId = z.string().min(1).max(255)`, which is enforced at the
webhook trust boundary and unit-tested (`PAY-11`). Worth deleting the dead
`schema/tenant.ts` copy in a cleanup pass rather than fixing it in place —
carrying an unbounded duplicate of a since-fixed schema is itself a drift
trap.

**`apps/admin/Dockerfile` is a stale artifact from before the Vite SPA
migration.** Last touched 2026-06-21, before Phase 7.6 rewrote `apps/admin`
to a static Vite build (`vite build`, deployed to Cloudflare Pages/R2 per
the roadmap). Nothing in the current build or deploy path references it.
Low risk (nobody currently runs it) but it will actively mislead whoever
next touches admin deployment — either delete it or add a comment pointing
at the static-deploy path.

**`identityBuckets` in-memory rate-limit store still does not survive
restarts or share state across replicas.**
`apps/api/src/shared/security.ts` — the per-email sign-in/reset bucket is a
`Map` in process memory, now with a periodic sweep + LRU cap (`CR-03`,
fixed since the last audit) bounding unbounded growth, but still
per-instance. Matches the "single VPS + Docker Compose" target deploy
topology for MVP-1 (no horizontal scale-out planned before a paying
customer), so this is accepted-as-is for now, not a live gap — revisit if
the deploy topology ever adds a second API replica.

## Security Considerations

**Rate-limiter's session-cookie fallback is still forgeable for
non-credential public routes, but the highest-value target is now
fixed.** The Phase 10 fix (`c65af02a`) made credential routes (sign-in,
sign-up, password reset) key strictly on `req.ip`, closing the brute-force
bypass CR-02 flagged. Every other `@Public()` route without a validated
principal (guest checkout, order-status polling, etc.) still falls through
to hashing the raw, client-supplied `better-auth.session_token` cookie
value (`readSessionCookieValue`, unauthenticated) before falling back to
IP. An attacker can still defeat the general `RATE_LIMIT_PUBLIC_PER_MIN`
bucket on these routes by rotating an arbitrary cookie value per request —
this only weakens the outer anonymous-surface fence, not the per-email or
per-tenant fences, which are cookie-independent (re-rated during Phase 10's
own code review). Residual, lower-severity version of the original
finding.

**`CancelOrderService` can report a cancel as failed (409) after it has
already committed — CR-04 from the Phase 10 backend review, confirmed
still unfixed.** `cancel-order.service.ts` persists `order.cancel()` +
`orderRepo.update(order)` unconditionally, then attempts a refund in a
`try/catch` that only handles `PaymentNotRefundableError` and
`RefundProviderFailedError`. If the order was already fully refunded by an
earlier, separate discretionary refund (possible since D-10 decoupled
refund from fulfillment status), `order.refund()` throws
`RefundExceedsCapturedError` — a third error type the catch block doesn't
handle — which propagates as a `409` after the cancel already landed in
the DB. The operator sees "cancel failed" for an order that is, in fact,
canceled. Not covered by `order-cancel-refund.e2e.spec.ts`'s 9 cases. Fix
is small: also catch `RefundExceedsCapturedError` and treat it like "no
refund needed."

**`tenancy_erase_tenant()` GDPR erasure gap — CR-03 from the Phase 10
backend review, fixed (`31bc97e9`).** Migration `0077` now deletes
`payment_refunds` before `payments`. Carried forward here only as a
verification note: `erase-includes-ordering.spec.ts` was extended with a
seeded `payment_refunds` row per the same commit — confirm this still
passes if migration ordering changes again.

**Concurrent Accept/Advance requests have no optimistic-concurrency
guard — WR-01 from the Phase 10 backend review, confirmed still
open.** `#runUpdate` in `order-drizzle.repository.ts` only conditions its
`UPDATE` on `(id, tenantId)`, not on an expected prior status. Two
concurrent `POST /:id/accept` calls (a double-tap, or two staff on two
tablets — flagged as an open product question, MED-17) can both pass the
idempotency short-circuit before either commits, both write, and both fire
an outbox event — a guest can get two "order accepted" notifications with
two different ETAs. No fix landed; not blocking Phase 10's close since it
requires a genuine race window, but worth closing before order volume
makes it observable in practice.

**`order_daily_sequences` has no entry in the canonical RLS regression
test — WR-02 from the Phase 10 backend review, confirmed still open.**
`packages/db/CLAUDE.md`'s own hard rule ("every new tenant-scoped table
needs an entry in `tenant-isolation.spec.ts`") was not followed for this
migration-`0073` table. The RLS policies look correct by inspection; there
is simply no automated net if a future migration weakens them.

## Fragile Areas

**Discretionary refund form and Cancel trigger are now gated by order
status — CR-01/CR-02 from the Phase 10 frontend review, fixed
(`6a4fc9cd`).** No longer open; carried forward only as a note that the
"remaining balance" hint in the refund form still shows the order's full
original total rather than `total − already-refunded` (acknowledged interim
gap in `10-12-SUMMARY.md`, not re-opened as a defect since a full refund is
no longer double-submittable).

**Discretionary refund amount still has no client-side bound
validation — WR-02 from the Phase 10 frontend review, confirmed still
open.** `order-detail-sheet.tsx`'s `refundDisabled` only checks for an
empty string or a pending mutation, not that the typed amount is `> 0` and
`<= remaining`. A stray leading `-` or a fat-fingered extra digit reaches
the mutation and depends entirely on the server-side check to reject it.

**Guest status tracker's manual retry reads a stale closed-over
status — WR-03 from the Phase 10 frontend review, confirmed still
open.** `order-status-poller.tsx`'s polling `useEffect` has a
`[orderId, initialStatus.status]` dependency array, so it runs once per
mount; `retryRef.current`'s closure over `status` is permanently bound to
whatever `status` equaled at that single render. Only reachable on a
double-failure (a poll fails, the guest taps retry, that retry also
fails) — narrow blast radius, but still live.

**"Has this brand ever had an order" activation check is bounded to 7
days, not all-time — WR-04 from the Phase 10 frontend review, confirmed
still open.** `orders.tsx`'s activation-empty-state check uses
`datePreset: 'week'` (the widest `OrderDatePreset` value available) as a
proxy for "never had an order." A brand with a multi-week gap between
visits (slow season, temporary closure) sees the "your first orders will
appear here" onboarding empty-state instead of a plain filtered-empty
state.

**`NATS_DISABLED=true` still silently drops all event publication with no
startup warning.** `apps/api/src/infrastructure/nats.module.ts` returns a
null publisher/subscriber and logs nothing beyond an inline comment
calling it a "test/CI escape hatch." If this env var is ever set by
accident in a real environment, outbox rows accumulate with nothing
publishing them and no operator-visible signal. Low likelihood (it's not
in any committed environment config) but zero cost to add a boot-time
`logger.warn` if this file is touched again.

---

_Concerns audit: 2026-08-18_
