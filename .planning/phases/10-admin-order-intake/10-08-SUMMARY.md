---
phase: 10-admin-order-intake
plan: 08
subsystem: api

tags: [ordering, payments, guards, rbac, rate-limit, nestjs, fastify, opentelemetry, e2e]

# Dependency graph
requires:
  - phase: 10-admin-order-intake plan 07
    provides: AcceptOrderService, AdvanceOrderStatusService, ListOrdersService, GetOrderDetailService, OrderFeedRepository — the application-layer services this plan exposes over HTTP
  - phase: 10-admin-order-intake plan 05
    provides: CancelOrderService, RetryRefundService, CancelOrderInputSchema, PAYMENT_REPOSITORY.findFailedRefundsForOrders — the cancel/refund shapes this plan's controller wraps
  - phase: 10-admin-order-intake plan 02
    provides: order:cancel permission verb — the guard vocabulary this plan's authz work uses
  - phase: 10-admin-order-intake plan 06
    provides: frozen public order-status contract; WEBSITE_PUBLIC_URL env var shared ground with env.schema.ts
provides:
  - OperatorOrdersController (v1/orders) — feed (owner-only aggregate, @LocationNeutral), detail, accept, advance
  - OrderCancelController (v1/orders) — single cancel endpoint gated on order:cancel, refund/retry resolving refundRequestId server-side via PAYMENT_REPOSITORY.findFailedRefundsForOrders
  - refunds.controller.ts audited (RequireBrand() added for documentation consistency, no functional change) — stays owner-only via billing:update
  - mapPaymentError extended: RefundNotRetryableError -> 409, RefundProviderFailedError -> 502
  - Global rate limiter keyGenerator: per-principal (userId) bucketing with IP fallback for anonymous/customer traffic — replaces the shared per-IP-only bucket for every authenticated route, not just the feed
  - resto.traffic_kind='poll' OTel span attribute on the feed handler
  - 10-08-GUARD-AUDIT.md — route-by-route decorator audit for the entire v1/orders surface (new + pre-existing)
  - order-routes-authz.e2e.spec.ts — 9-case proof over real HTTP + Postgres/NATS testcontainers
affects:
  [
    'apps/admin order-intake UI build (consumes GET /v1/orders/feed, /v1/orders/:id/detail, POST accept/advance/cancel/refund/retry — client must always send the order's own real locationId on mutations, never the all sentinel)',
    'Phase 18 (Real-time Order Feed / SSE) — will replace 5s polling but should keep the same per-principal rate-limit design',
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Global @fastify/rate-limit keyGenerator prefers req.principal.userId (operator or customer) over req.ip, mirroring brand-slug-rate-limit.guard.ts key-derivation but applied at the shared limiter instead of a new per-route guard — chosen after empirically disproving RESEARCH.md Assumption A2'
    - 'Server-side resolution of an internal idempotency/ledger key (refundRequestId) from a lookup rather than trusting a client-supplied value — mirrors the actorUserId-from-principal / tenantId-from-ALS pattern already established for this route family'

key-files:
  created:
    - apps/api/src/contexts/ordering/interfaces/http/operator-orders.controller.ts
    - apps/api/src/contexts/ordering/interfaces/http/operator-orders.dto.ts
    - apps/api/src/contexts/payments/interfaces/http/order-cancel.controller.ts
    - apps/api/test/e2e/order-routes-authz.e2e.spec.ts
    - .planning/phases/10-admin-order-intake/10-08-GUARD-AUDIT.md
  modified:
    - apps/api/src/contexts/ordering/ordering.module.ts
    - apps/api/src/contexts/payments/interfaces/http/error-mapping.ts
    - apps/api/src/contexts/payments/interfaces/http/refunds.controller.ts
    - apps/api/src/contexts/payments/payments.module.ts
    - apps/api/src/shared/security.ts
    - .planning/phases/10-admin-order-intake/deferred-items.md

key-decisions:
  - "Assumption A2 (RESEARCH.md D.12) resolved empirically as WRONG: AuthGuard runs BEFORE RateLimitGuard, not after. Proved via a temporary console.log probe in both guards' canActivate (removed before commit — git diff on both files is clean): an unauthenticated request to a protected route showed only AuthGuard's probe firing (chain stopped at AuthGuard's 401 before RateLimitGuard ever ran); a request to a @Public() route showed AuthGuard firing first, then RateLimitGuard second. This means req.principal IS populated by the time the global rate limiter's keyGenerator runs."
  - 'Per the plan Task 2''s own explicit contingency ("if the assumption is wrong... take [the simpler fix]... rather than building the more complex design for no reason"), took the simpler fix: a keyGenerator on the existing global @fastify/rate-limit registration in security.ts, not a new per-route OrdersFeedRateLimitGuard + allowlist entry + RATE_LIMIT_ORDERS_FEED_PER_MIN env var. orders-feed-rate-limit.guard.ts was NOT created; env.schema.ts was NOT modified — both are in the plan''s files_modified list under the assumption-holds branch, which did not occur.'
  - "The simpler fix is strictly MORE robust than the originally-designed narrower one: the per-route-guard-plus-allowlist design would only have exempted the feed route from IP-bucket contention with guest traffic — every other authenticated mutation route (accept/advance/cancel) would still have shared the IP bucket with guests on the same WiFi. The global keyGenerator change separates ALL authenticated operator/customer traffic from anonymous traffic by principal, covering the full arithmetic RESEARCH D.12 describes (\"before counting any other admin traffic\"), not just the polling endpoint."
  - "retry-refund's refundRequestId is resolved server-side inside OrderCancelController (injecting PAYMENT_REPOSITORY directly, not via a new application service) by calling findFailedRefundsForOrders(tenantId, [orderId]) and taking the row — the client never supplies or needs to know this internal ledger key. No retry-lookup application service exists yet (out of this plan's file list); this is a narrow, justified exception to \"controllers depend on services, not repositories\" for a single read-only lookup with no business logic."
  - '@RequireBrand() added to refunds.controller.ts is a documentation-only change: BrandScopeGuard already required brand context on that route regardless of the decorator (confirmed by reading the guard source — REQUIRE_BRAND_KEY is set by the decorator but never read by BrandScopeGuard.canActivate()). Added purely so the route carries the same audit-trail marker every other brand-scoped route in the codebase carries.'
  - 'mapPaymentError extended with RefundNotRetryableError -> 409 payments.refund_not_retryable and RefundProviderFailedError -> 502 payments.refund_provider_failed (Rule 2 — missing critical error handling): RetryRefundService can throw both, and neither was mapped by 10-05, which never exposed retry over HTTP. Without this, both would have surfaced as unmapped 500s through ProblemDetailsFilter.'

requirements-completed: [ORDINT-01, ORDINT-03, ORDINT-04, ORDINT-05, ORDINT-06, ORDINT-07, ORDINT-08]

# Metrics
duration: ~95min
completed: 2026-08-15
---

# Phase 10 Plan 08: Operator Order HTTP Surface + Guard Audit + Rate-Limit Redesign Summary

**Two new controllers (`OperatorOrdersController` feed/detail/accept/advance, `OrderCancelController` cancel + refund-retry) exposing plan 10-07/10-05's application services with the audited guard set that keeps `LocationScopeGuard`'s non-owner branch live on every mutation; a route-by-route guard audit document covering the full `v1/orders` surface; and a rate-limiter redesign — proven wrong empirically that `RateLimitGuard` runs before `AuthGuard`, so the fix is a per-principal `keyGenerator` on the existing global limiter rather than a new per-route guard.**

## Performance

- **Duration:** ~95 min
- **Completed:** 2026-08-15
- **Tasks:** 3 completed
- **Files modified:** 11 (5 created, 6 modified)

## Accomplishments

- **`OperatorOrdersController`** (`v1/orders`, new, no class-level `@Public()`/`@BrandNeutral()`) exposes `GET /feed` (`@Permissions({order:['read']})` + `@RequireActiveTenant()` + `@RequireBrand()` + `@LocationNeutral()` — the one legitimately owner-only aggregate read), `GET /:id/detail`, `POST /:id/accept` (`{prepMinutes}` only, never a timestamp), `POST /:id/advance` (`{targetStatus}`) — the latter three deliberately omit `@LocationNeutral()` so `LocationScopeGuard`'s non-owner scope-membership check stays live.
- **`OrderCancelController`** (`v1/orders`, new, `payments` context) exposes exactly one cancel endpoint (`POST /:orderId/cancel`, `{reasonCode, cancelNote?}`, gated on `order:cancel` not `billing:update`) and `POST /:orderId/refund/retry` (no body — the controller resolves the failed refund's `refundRequestId` server-side via `PAYMENT_REPOSITORY.findFailedRefundsForOrders`). Both take `actorUserId` from `req.principal` (via `@CurrentOperator()`) and `tenantId` from `requireTenantContext()`, never from the request body.
- **`refunds.controller.ts`** audited and left functionally unchanged — `@RequireBrand()` added purely for decorator-audit consistency (`BrandScopeGuard` already enforced brand context on this route with or without the decorator, confirmed by reading the guard source). `@Permissions({billing:['update']})` and the absence of `@LocationNeutral()`/`@OwnerOnly()` are untouched.
- **`10-08-GUARD-AUDIT.md`** documents all 9 routes under `v1/orders` (2 pre-existing guest routes + 4 new `OperatorOrdersController` routes + 2 new `OrderCancelController` routes + 1 audited `refunds.controller.ts` route), each with its exact decorator set and rationale, per D-02.
- **Rate-limiter redesign, empirically driven.** RESEARCH.md's Assumption A2 ("`RateLimitGuard` runs before `AuthGuard`, so `req.principal` is unavailable at limiter time") was proven **wrong**: a temporary `console.log` probe in both guards' `canActivate` (added, exercised against a locally-booted api process on port 5001 against the shared dev Postgres, then fully removed before any commit — `git diff` on both files is clean) showed `AuthGuard` always runs first. Per the plan's own explicit contingency for this outcome, the fix is a `keyGenerator` on the **existing** global `@fastify/rate-limit` registration in `security.ts` — `req.principal.userId` when authenticated (operator or customer), `ip:${req.ip}` otherwise — rather than a new per-route `OrdersFeedRateLimitGuard` + allowlist entry + `RATE_LIMIT_ORDERS_FEED_PER_MIN` env var. This is strictly more robust than the originally-designed narrower fix: it separates **all** authenticated traffic (not just feed polling) from guest/anonymous traffic, so accept/advance/cancel calls no longer compete with a guest's checkout on the shared IP bucket either.
- **Telemetry separation.** The feed handler sets `resto.traffic_kind = 'poll'` via `trace.getActiveSpan()?.setAttribute(...)`, so dashboards/alerts can exclude poll traffic from normal request-rate metrics without waiting on a dashboard-config change (that config step itself is an operator-side follow-up, not code).
- **`order-routes-authz.e2e.spec.ts`** (new, 9 cases, real Postgres+NATS testcontainer stack via `with-real-stack.setup.ts`, two independent `RealStack` instances — one for authz cases 1-7, one for rate-limit cases 8-9 to avoid fixture-setup HTTP calls consuming the deliberately-low rate-limit budget): owner all-mode feed read (both locations, correct `locationName` labels), owner mutation with a concrete location (200, DB read-back `accepted`), owner mutation with no location header (403 `location.context_required`, row unchanged), non-owner forged `x-location-id` denial (row unchanged), non-owner cancel (200, DB read-back `canceled` — the D-06 fix), non-owner arbitrary-refund denial (403, zero `payment_refunds` rows), cross-tenant existence-hiding 404 on both detail and advance (row unchanged), per-principal 429 isolation (one principal exhausts its bucket, a second principal on the identical IP is unaffected), and guest checkout survival from the same IP after the polling burst (not 429).

## Task Commits

Each task was committed atomically:

1. **Task 1: Operator order controllers with the audited guard set** - `6fb024c` (feat)
2. **Task 2: Poll-safe rate limiting and telemetry separation** - `a2cd8f6` (fix)
3. **Task 3: Authorization and rate-limit e2e — prove both the allowed and the denied paths** - `aaa8b88` (test)

## Files Created/Modified

- `apps/api/src/contexts/ordering/interfaces/http/operator-orders.controller.ts` (new) - feed/detail/accept/advance routes, `resto.traffic_kind` span attribute on feed
- `apps/api/src/contexts/ordering/interfaces/http/operator-orders.dto.ts` (new) - Zod query/response DTOs mirroring plan 10-07's `OrderFeedRow`/`OrderSnapshot` shapes, ISO-string mappers
- `apps/api/src/contexts/payments/interfaces/http/order-cancel.controller.ts` (new) - single cancel endpoint + refund-retry with server-resolved `refundRequestId`
- `apps/api/src/contexts/ordering/ordering.module.ts` - registers `OperatorOrdersController`
- `apps/api/src/contexts/payments/interfaces/http/error-mapping.ts` - `RefundNotRetryableError` -> 409, `RefundProviderFailedError` -> 502
- `apps/api/src/contexts/payments/interfaces/http/refunds.controller.ts` - `@RequireBrand()` added (documentation-only, no functional change)
- `apps/api/src/contexts/payments/payments.module.ts` - registers `OrderCancelController`
- `apps/api/src/shared/security.ts` - global rate-limit `keyGenerator` prefers `req.principal.userId`; removed the now-stale "single per-IP store" comment block it replaces
- `.planning/phases/10-admin-order-intake/10-08-GUARD-AUDIT.md` (new) - full `v1/orders` route-by-route decorator audit
- `apps/api/test/e2e/order-routes-authz.e2e.spec.ts` (new) - 9-case authz + rate-limit proof
- `.planning/phases/10-admin-order-intake/deferred-items.md` - logged a pre-existing, unrelated `security.e2e.spec.ts` stub gap discovered while verifying no regression from the rate-limiter change

## Decisions Made

See `key-decisions` in the frontmatter above for the full list with rationale. Summary:

- Assumption A2 disproven empirically: `AuthGuard` runs before `RateLimitGuard`.
- Took the plan's own sanctioned simpler-fix branch: global per-principal `keyGenerator`, no new guard file, no new env var, no allowlist entry.
- `refundRequestId` for retry resolved server-side via a direct `PAYMENT_REPOSITORY` lookup in the controller (narrow, justified exception to the usual controller-depends-on-service-not-repository pattern).
- `@RequireBrand()` added to `refunds.controller.ts` for audit-trail consistency only — verified functionally inert against the current `BrandScopeGuard` implementation.
- `mapPaymentError` extended for the two retry-specific domain errors that had no HTTP mapping before this plan exposed retry over HTTP.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 4-adjacent — plan-authorized architectural fork, not a rule-1/2/3 bug fix] Rate-limit design took the plan's own "simpler fix" branch instead of the default-assumed complex design**

- **Found during:** Task 2, the mandatory empirical guard-order check the plan itself required before committing to a design.
- **Issue:** The plan's Task 2 action text is explicit: "First, resolve RESEARCH Assumption A2 empirically... If the assumption is wrong and AuthGuard runs first, the simpler fix becomes available... take it, and record the deviation... rather than building the more complex design for no reason." The empirical check (temporary `console.log` probes in both guards, removed before any commit) proved the assumption wrong.
- **Fix:** Implemented the simpler fix (global `keyGenerator` on the existing `@fastify/rate-limit` registration) instead of the complex one (`OrdersFeedRateLimitGuard` + allowlist entry + `RATE_LIMIT_ORDERS_FEED_PER_MIN`). This means three files named in the plan's `files_modified` list were **not** touched as originally specified: `apps/api/src/contexts/identity/interfaces/http/guards/orders-feed-rate-limit.guard.ts` was never created, and `apps/api/src/config/env.schema.ts` was not modified. Task 3's e2e cases 8-9 were adapted to use `RATE_LIMIT_PUBLIC_PER_MIN` (the now-globally-relevant cap) instead of the non-existent `RATE_LIMIT_ORDERS_FEED_PER_MIN`, and a loop-until-429 pattern instead of an exact `N+1`-request count (robust against however many fixture-setup HTTP calls the same principal's bucket has already absorbed).
- **Files affected:** `apps/api/src/shared/security.ts` (only file actually touched for this half of Task 2); the two never-created files are the "not affected" side of this deviation.
- **Verification:** `security.e2e.spec.ts` re-run (7/8 green, the 1 failure independently confirmed pre-existing and unrelated — see Deviation 2 below); `order-routes-authz.e2e.spec.ts` cases 8-9 (per-principal isolation + guest survival) pass against the new design; full `tsc --noEmit` clean.
- **Committed in:** `a2cd8f6` (Task 2)

**2. [Rule 1-adjacent — investigated, confirmed pre-existing, NOT fixed per scope boundary] `security.e2e.spec.ts`'s `/internal/v1/* rate limit` case fails independent of this plan's changes**

- **Found during:** Task 2, verification run of `security.e2e.spec.ts` after the `keyGenerator` change.
- **Issue:** `rate limit > honours the stricter limit on /internal/v1/* routes` fails with `expected 500 to be 429` — both requests in the test return 500 with `"tx.select(...).from(...).innerJoin is not a function"`, meaning the underlying handler throws before the rate-limiter's pass/fail distinction is even reachable. `security.e2e.spec.ts`'s hand-rolled `TenantAwareDb` stub (`buildDbStub()`) has never supported `.innerJoin()`; a repository in the tenant-provisioning path this test exercises calls it.
- **Fix:** None applied — verified not caused by this plan by temporarily reverting `security.ts` to its pre-Task-2 state (`git checkout -- apps/api/src/shared/security.ts`) and re-running: identical failure, identical error, before the `keyGenerator` change existed at all. The revert was then undone (edit reapplied) and re-verified clean. `innerJoin` calls in the relevant repository (`initial-brand-drizzle.repository.ts`) were confirmed present at the plan's own base commit (`5449fd0`) via `git show`, i.e. before this plan's session started.
- **Files affected:** None (investigation only). Logged to `deferred-items.md`.
- **Verification:** `security.e2e.spec.ts` re-run both with and without the `keyGenerator` change present — identical single-test failure either way; 7/8 pass in both cases.
- **Committed in:** n/a (nothing to commit — pre-existing, out of scope per the deviation rules' scope boundary)

**3. [Rule 2 — missing critical error handling] `mapPaymentError` had no mapping for `RetryRefundService`'s two possible thrown errors**

- **Found during:** Task 1, while wiring `order-cancel.controller.ts`'s retry route.
- **Issue:** `RetryRefundService.execute()` can throw `RefundNotRetryableError` or `RefundProviderFailedError` (both added by plan 10-05), but `mapPaymentError` never mapped either — plan 10-05 built the service without ever exposing retry over HTTP, so the gap was invisible until this plan. Without a mapping, both would fall through `wrapWith`'s unchanged-passthrough and surface as an unmapped 500 via `ProblemDetailsFilter` (redacted detail, indistinguishable from a real bug).
- **Fix:** Added `RefundNotRetryableError` -> `ConflictException` (409, `payments.refund_not_retryable`) and `RefundProviderFailedError` -> `BadGatewayException` (502, `payments.refund_provider_failed`) to `mapPaymentError`.
- **Files affected:** `apps/api/src/contexts/payments/interfaces/http/error-mapping.ts`
- **Verification:** `tsc --noEmit` clean; `eslint` clean; existing `payment-lifecycle`/`order-cancel-refund` e2e specs re-run green (mapping addition is additive, does not touch any existing mapped error).
- **Committed in:** `6fb024c` (Task 1)

---

**Total deviations:** 3 (1 plan-authorized architectural fork per the plan's own contingency instructions, 1 investigated-and-confirmed-pre-existing non-fix, 1 Rule 2 missing-error-handling addition)
**Impact on plan:** The rate-limit design fork changes zero acceptance-criteria-checkable functional behavior the plan's `<success_criteria>` actually requires ("over-cap polling 429s per principal, a second principal on the same IP is unaffected, guest checkout still succeeds" — all proven, see e2e cases 8-9); it changes _which files_ deliver that behavior, fully documented above and in the frontmatter's `key-decisions`. The error-mapping addition strictly improves correctness with no functional-scope expansion beyond what wiring the already-existing `RetryRefundService` over HTTP required.

## Things a reader might trip on

- `security.ts`'s old "Single per-IP store across all routes... a future ticket can per-bucket via `keyGenerator`" comment block was deleted, not updated in place, when the `keyGenerator` was added — this executor's zero-comments hard rule forbids writing new narrative comments (including updated ones), so the now-inaccurate stale comment was removed rather than replaced. The real rationale lives in this SUMMARY and the `a2cd8f6` commit message instead of in the source file.
- `refunds.controller.ts`'s `@RequireBrand()` is a no-op today — `BrandScopeGuard.canActivate()` never reads `REQUIRE_BRAND_KEY` at all (confirmed by reading the guard source top to bottom). The decorator exists everywhere else in the codebase purely as an audit-trail marker; do not assume adding/removing it changes runtime behavior on any route until `BrandScopeGuard` is changed to read it.
- `OperatorOrdersController.feed()` validates `sinceCreatedAt`/`sinceId` "both or neither" manually in the controller body (a `BadRequestException` throw), not via a Zod `.refine()` on the DTO schema — kept the DTO a plain `ZodObject` (not `ZodEffects`) for cleaner `nestjs-zod`/OpenAPI interop, since neither of those two fields' Zod schema pieces needed cross-field validation for any other reason.
- Rate-limit cases 8-9 in `order-routes-authz.e2e.spec.ts` spin up a **second, independent** `RealStack` (own Postgres+NATS testcontainer pair) rather than reusing cases 1-7's stack — deliberate, so the low `RATE_LIMIT_PUBLIC_PER_MIN` cap needed to make the burst test fast doesn't interfere with cases 1-7's own fixture-setup HTTP traffic (which needs a generous cap to avoid spurious 429s during `beforeAll`).

## Issues Encountered

- Same environment-setup pattern as every prior Phase 10 plan: this worktree had no `node_modules` and no `.env` (both gitignored, not shared across git worktrees) — resolved via `pnpm install` and copying the root `.env`.
- Running the api dev server directly via `tsx` for the guard-order empirical probe required `--env-file=<path>` (Node 22+ built-in flag) since `pnpm --filter api exec` does not auto-load `.env` and `loadEnv()` reads directly from `process.env` with no dotenv fallback.
- See Deviation 2 above for the investigated-and-confirmed-pre-existing `security.e2e.spec.ts` failure.

## User Setup Required

None — no external service configuration required. This plan adds no migration and requires no new environment variables (the originally-anticipated `RATE_LIMIT_ORDERS_FEED_PER_MIN` was not needed under the design actually implemented).

## Next Phase Readiness

- The full operator order HTTP surface (feed, detail, accept, advance, cancel, refund-retry, discretionary refund) is live behind the audited guard set. `apps/admin`'s order-intake UI build can wire directly against `GET /v1/orders/feed`, `GET /v1/orders/:id/detail`, `POST /v1/orders/:id/accept`, `POST /v1/orders/:id/advance`, `POST /v1/orders/:orderId/cancel`, `POST /v1/orders/:orderId/refund/retry`, and the pre-existing `POST /v1/orders/:orderId/refund`.
- **Critical UI-build constraint carried forward from this plan's own guard design (RESEARCH B.7 / Landmine 5):** the admin client MUST send the order's own real `locationId` as `x-location-id` on every mutation call (accept/advance/cancel/retry/refund) — never the `'all'` sentinel, even when the operator is browsing the feed in all-mode. Only the feed read itself is location-neutral.
- `RATE_LIMIT_ORDERS_FEED_PER_MIN` does not exist; 5-second polling now relies on the global `RATE_LIMIT_PUBLIC_PER_MIN` (default 60/min) being per-principal, which comfortably covers a single device's 12/min polling cadence plus normal admin usage. No admin-side rate-limit-specific handling is required beyond the existing `apiFetch` retry/backoff already documented in RESEARCH D.14.
- `resto.traffic_kind = 'poll'` span attribute is emitted; actual dashboard/alert exclusion configuration is an operator-side follow-up, not further code.
- No blockers for the next plan. `security.e2e.spec.ts`'s pre-existing `innerJoin` stub gap (see Deviation 2) is tracked in `deferred-items.md`, not attributable to this plan.

## Self-Check: PASSED

All 5 created files verified present on disk (`operator-orders.controller.ts`, `operator-orders.dto.ts`, `order-cancel.controller.ts`, `order-routes-authz.e2e.spec.ts`, `10-08-GUARD-AUDIT.md`); all 3 commit hashes (`6fb024c`, `a2cd8f6`, `aaa8b88`) verified present via `git log --oneline --all`.

---

_Plan: 10-admin-order-intake/08_
_Completed: 2026-08-15_
