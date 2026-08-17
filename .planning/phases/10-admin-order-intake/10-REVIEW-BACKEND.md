---
phase: 10-admin-order-intake
reviewed: 2026-08-17T23:45:50Z
depth: standard
files_reviewed: 84
files_reviewed_list:
  - apps/api/project.json
  - apps/api/src/config/env.schema.ts
  - apps/api/src/contexts/identity/application/preset-roles.ts
  - apps/api/src/contexts/identity/application/sync-preset-roles.service.ts
  - apps/api/src/contexts/identity/domain/ports.ts
  - apps/api/src/contexts/identity/identity-core.module.ts
  - apps/api/src/contexts/identity/infrastructure/initial-brand-drizzle.repository.ts
  - apps/api/src/contexts/identity/interfaces/http/me.controller.spec.ts
  - apps/api/src/contexts/identity/interfaces/http/me.controller.ts
  - apps/api/src/contexts/notifications/application/send-guest-notification.service.spec.ts
  - apps/api/src/contexts/notifications/application/send-guest-notification.service.ts
  - apps/api/src/contexts/notifications/infrastructure/guest-email-templates.spec.ts
  - apps/api/src/contexts/notifications/infrastructure/guest-email-templates.ts
  - apps/api/src/contexts/notifications/infrastructure/nats-guest-notification.subscriber.spec.ts
  - apps/api/src/contexts/notifications/infrastructure/notification-order-drizzle.repository.ts
  - apps/api/src/contexts/ordering/application/accept-order.service.ts
  - apps/api/src/contexts/ordering/application/advance-order-status.service.ts
  - apps/api/src/contexts/ordering/application/create-order.service.ts
  - apps/api/src/contexts/ordering/application/dto.ts
  - apps/api/src/contexts/ordering/application/get-order-detail.service.ts
  - apps/api/src/contexts/ordering/application/list-orders.service.ts
  - apps/api/src/contexts/ordering/application/order-feed-dto.ts
  - apps/api/src/contexts/ordering/domain/errors.ts
  - apps/api/src/contexts/ordering/domain/events.ts
  - apps/api/src/contexts/ordering/domain/order.aggregate.spec.ts
  - apps/api/src/contexts/ordering/domain/order.aggregate.ts
  - apps/api/src/contexts/ordering/domain/ports.ts
  - apps/api/src/contexts/ordering/infrastructure/order-drizzle.repository.ts
  - apps/api/src/contexts/ordering/infrastructure/order-feed-drizzle.repository.ts
  - apps/api/src/contexts/ordering/infrastructure/order-sequence-drizzle.repository.ts
  - apps/api/src/contexts/ordering/interfaces/http/error-mapping.ts
  - apps/api/src/contexts/ordering/interfaces/http/operator-orders.controller.ts
  - apps/api/src/contexts/ordering/interfaces/http/operator-orders.dto.ts
  - apps/api/src/contexts/ordering/interfaces/http/orders.controller.spec.ts
  - apps/api/src/contexts/ordering/interfaces/http/orders.controller.ts
  - apps/api/src/contexts/ordering/ordering.module.ts
  - apps/api/src/contexts/payments/application/cancel-order.service.spec.ts
  - apps/api/src/contexts/payments/application/cancel-order.service.ts
  - apps/api/src/contexts/payments/application/create-checkout-payment.service.spec.ts
  - apps/api/src/contexts/payments/application/dto.ts
  - apps/api/src/contexts/payments/application/handle-stripe-event.service.spec.ts
  - apps/api/src/contexts/payments/application/refund-order.service.spec.ts
  - apps/api/src/contexts/payments/application/refund-order.service.ts
  - apps/api/src/contexts/payments/application/retry-refund.service.ts
  - apps/api/src/contexts/payments/domain/errors.ts
  - apps/api/src/contexts/payments/domain/ports.ts
  - apps/api/src/contexts/payments/infrastructure/payment-drizzle.repository.ts
  - apps/api/src/contexts/payments/interfaces/http/error-mapping.ts
  - apps/api/src/contexts/payments/interfaces/http/order-cancel.controller.ts
  - apps/api/src/contexts/payments/interfaces/http/refunds.controller.ts
  - apps/api/src/contexts/payments/payments.module.ts
  - apps/api/src/shared/security.ts
  - apps/api/src/shared/tenant-context.middleware.ts
  - apps/api/test/e2e/order-cancel-refund.e2e.spec.ts
  - apps/api/test/e2e/order-feed-query.e2e.spec.ts
  - apps/api/test/e2e/order-lifecycle.e2e.spec.ts
  - apps/api/test/e2e/order-routes-authz.e2e.spec.ts
  - apps/api/test/e2e/order-short-number.e2e.spec.ts
  - apps/api/test/e2e/outbox-nats-decoupling.e2e.spec.ts
  - apps/api/test/e2e/payment-lifecycle.e2e.spec.ts
  - apps/api/test/e2e/payments-upsert-partial-index.e2e.spec.ts
  - apps/api/test/integration/create-order-idempotency.spec.ts
  - apps/api/test/unit/create-order.service.spec.ts
  - apps/api/test/unit/env.spec.ts
  - apps/api/test/unit/identity/identity-boot-integration.spec.ts
  - apps/api/test/unit/identity/preset-roles.spec.ts
  - apps/api/test/unit/identity/sync-preset-roles.spec.ts
  - apps/api/test/unit/prod-guardrails.spec.ts
  - packages/db/migrations/0073_orders_intake.sql
  - packages/db/migrations/0074_tenancy_erase_order_sequences.sql
  - packages/db/migrations/0075_orders_short_number_not_null.sql
  - packages/db/migrations/0076_payment_refunds_pending.sql
  - packages/db/migrations/meta/_journal.json
  - packages/db/src/schema/ordering.ts
  - packages/db/test/integration/erase-includes-ordering.spec.ts
  - packages/db/test/integration/tenant-isolation.spec.ts
  - packages/domain/src/rbac/index.ts
  - packages/domain/src/rbac/non-delegatable.spec.ts
  - packages/domain/src/rbac/permissions.ts
  - packages/domain/src/rbac/preset-roles.ts
  - packages/domain/src/rbac/system-roles.ts
  - packages/events/src/contracts/ordering.ts
  - tools/scripts/seed/cli.ts
  - tools/scripts/seed/commands/sync-preset-roles.ts
findings:
  critical: 4
  warning: 4
  info: 2
  total: 10
status: issues_found
---

# Phase 10: Code Review Report — Backend

**Reviewed:** 2026-08-17T23:45:50Z
**Depth:** standard
**Files Reviewed:** 84
**Status:** issues_found

## Summary

Reviewed the backend half of Phase 10 (admin order intake) against the phase's own D-01..D-17 decisions and the project's tenancy/security invariants. The 09/08.4 lessons (missing `@LocationNeutral()`, wrong bypass) were clearly internalized for the _mutation_ routes — `accept`/`advance`/`cancel` correctly keep `LocationScopeGuard`'s non-owner branch alive, and cross-tenant existence-hiding is proven end-to-end for both order detail and status advance. The D-11 refund restructure (TX2 / provider-call / TX3) is a sound pattern and its own e2e suite is genuinely DB-read-back, not mock-heavy.

However, four real defects surfaced that the phase's own test suite does not catch, three of which are new failure modes this phase's design changes make reachable for the first time:

1. **The order feed (`GET /v1/orders/feed`) is documented as "the one legitimately owner-only aggregate read" but is not actually gated to owners** — `@LocationNeutral()` disables the location-scope check for every caller, and `order:read` is granted broadly to `manager`/`cashier-foh`/`kitchen`. A location-pinned staff member can read another location's live order feed.
2. **The new global rate-limiter's session-cookie fallback trusts an unverified client-supplied cookie value**, letting any HTTP client defeat rate limiting on every public/unauthenticated route (including sign-in, sign-up, password reset, and guest checkout) by rotating an arbitrary `Cookie` header per request.
3. **`tenancy_erase_tenant()` (rewritten in migration 0074, specifically to close this class of gap) still omits `payment_refunds`**, and the FK from `payment_refunds` to `payments` is `ON DELETE RESTRICT` — GDPR erasure will hard-fail with a foreign-key violation for any tenant that has ever had a refund attempted, which after this phase is now the common case.
4. **`CancelOrderService` can report a cancel as _failed_ (HTTP 409) after the cancel has already committed to the database**, when the order being canceled was already fully refunded by a prior discretionary (billing:update) refund — a scenario that D-10's own fix (refund no longer collapses fulfillment status) makes newly reachable.

## Structural Findings (fallow)

None provided for this review — no `<structural_findings>` block was supplied to this agent.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Order feed leaks cross-location order data to location-pinned staff

**File:** `apps/api/src/contexts/ordering/interfaces/http/operator-orders.controller.ts:61-92`, `apps/api/src/contexts/ordering/application/list-orders.service.ts:57-78`

**Issue:** `GET /v1/orders/feed` is decorated `@Permissions({ order: ['read'] }) @RequireActiveTenant() @RequireBrand() @LocationNeutral()`. The 10-08 plan summary calls this route "the one legitimately owner-only aggregate read," but there is no `@OwnerOnly()` (or any role check) anywhere on the route. `@LocationNeutral()` makes `LocationScopeGuard.canActivate()` return `true` immediately (`location-scope.guard.ts:31`) for _every_ principal, not just owners — it skips both the "does this operator even have a pinned location matching the header" check and the `member_location_scope` membership check.

`order:read` is granted to `manager`, `cashier-foh`, and `kitchen` (`packages/domain/src/rbac/preset-roles.ts:13-43`) — i.e., every non-owner role that D-06 intentionally widened to work with orders. `ListOrdersService.execute()` resolves the location set purely from the `x-location-id` header value (or all active brand locations if the header is omitted/invalid) with no check that the _caller_ is scoped to that location:

```ts
// list-orders.service.ts:66-78
if (requestedLocationId === undefined) {
  locationIds = activeLocations.map((l) => l.id);   // ALL brand locations
  ...
} else {
  const match = activeLocations.find((l) => l.id === requestedLocationId);
  if (!match) throw new NotFoundException();
  locationIds = [match.id];                          // ANY brand location, no scope check
  ...
}
```

Concretely: a `cashier-foh` staff member who is `member_location_scope`-pinned to Location A can call `GET /v1/orders/feed` with `x-location-id: <Location B's uuid>` (or omit the header entirely) and receive Location B's (or every location's) live order totals, item counts, table identifiers, and cancel/refund state — data D-02 explicitly says staff should never see outside their own pinned location ("Staff: their server-pinned location only, per 08.4/08.5 D-15"). This is the mirror-image of the exact defect class Phase 08.4 was burned by (missing `@LocationNeutral()` causing false-403), except here the decorator IS present and causes a false-open instead.

Confirmed untested: `order-routes-authz.e2e.spec.ts` and `order-feed-query.e2e.spec.ts` both exercise the feed only as `owner` (case 1: "owner in all mode... reads the merged feed"); every non-owner test case in the suite targets mutation routes (`accept`/`cancel`/`refund`), never `GET /feed`.

**Fix:** Either add `@OwnerOnly()` to `feed()` (matching the summary's stated intent), or — if staff should be able to poll the feed for their own location — keep `@LocationNeutral()` off, or add an explicit non-owner branch inside `ListOrdersService` that intersects the requested location set with `MemberLocationScopeReader.findLocationScopeForMember(...)` for non-owner principals before resolving `locationIds`.

---

### CR-02: Rate-limiter's session-cookie fallback is forgeable, defeating brute-force protection on every public route

**File:** `apps/api/src/shared/security.ts:54-61`

**Issue:**

```ts
const rateLimitKeyGenerator = (req: FastifyRequest): string => {
  if (req.principal && 'userId' in req.principal) return req.principal.userId;
  const sessionToken = readSessionCookieValue(req.headers.cookie);
  if (sessionToken) {
    return `session:${createHash('sha256').update(sessionToken).digest('hex')}`;
  }
  return `ip:${req.ip}`;
};
```

`req.principal` is only populated by `AuthGuard` for routes that are _not_ `@Public()` and only after a real BA session is validated (`auth.guard.ts:77-88`). For every `@Public()` NestJS route (guest checkout `POST /v1/orders`, order status, etc.) `AuthGuard.canActivate()` returns `true` before ever calling `getSession()`, so `req.principal` stays `undefined`. The same is true for BA's own `/api/auth/*` routes (sign-in, sign-up, password reset), which are mounted directly on Fastify and never touch `AuthGuard`/`req.principal` at all (comment at `security.ts:205-213` confirms this).

For all of these routes, the key generator falls through to `readSessionCookieValue(req.headers.cookie)` — which reads the raw `better-auth.session_token` cookie value **without validating it against BA** — and hashes whatever string is present. Since `Cookie` is a plain request header under full attacker control for any non-browser HTTP client (curl, a script, Postman — CORS is a browser-only restriction and does not apply here), an attacker can send a unique, arbitrary cookie value on every single request:

```
Cookie: better-auth.session_token=attempt-1
Cookie: better-auth.session_token=attempt-2
...
```

Each distinct value hashes to a distinct bucket key, so every request gets its own fresh rate-limit bucket — completely bypassing the intended per-IP fallback bucket. This defeats:

- the general `RATE_LIMIT_PUBLIC_PER_MIN` bucket protecting the whole anonymous surface (checkout spam, enumeration, scraping),
- the outer IP-layer defense on `/api/auth/sign-in/email`, `/api/auth/sign-up`, and `/api/auth/request-password-reset` (the per-email bucket in `consumeIdentityBucket` still limits repeats of one _known_ email, but does nothing to stop a distributed credential-stuffing scan across many different emails from one source, which is exactly what the IP-fallback bucket exists to catch).

This is a regression introduced by this phase's rate-limiter redesign (10-08): the pre-Phase-10 limiter keyed on `req.ip` alone (per the phase's own D-13 problem statement), which is not trivially rotatable per-request the way a header value is.

**Fix:** Do not trust an unvalidated cookie value as a rate-limit identity. Either drop the `session:` fallback tier entirely (principal-or-IP only), or validate the token cheaply before trusting it as a bucket key (e.g., verify it matches the shape/signature BA issues, or simply hash `ip + cookie` together so a forged cookie cannot manufacture a fresh bucket independent of source IP).

---

### CR-03: GDPR erasure hard-fails for any tenant with a `payment_refunds` row

**File:** `packages/db/migrations/0074_tenancy_erase_order_sequences.sql:45-52`, `packages/db/src/schema/ordering.ts:260-269`

**Issue:** Migration 0074 drops and recreates `tenancy_erase_tenant()` specifically to add `order_daily_sequences` to the erasure sweep (its own stated purpose: "a new tenant-scoped table silently breaks GDPR erasure unless `tenancy_erase_tenant` is extended to cover it"). The rewritten function deletes in this order:

```sql
DELETE FROM order_daily_sequences WHERE tenant_id = p_tenant_id;
DELETE FROM order_modifiers WHERE tenant_id = p_tenant_id;
DELETE FROM order_items WHERE tenant_id = p_tenant_id;
DELETE FROM payments WHERE tenant_id = p_tenant_id;
DELETE FROM orders WHERE tenant_id = p_tenant_id;
```

`payment_refunds` is never deleted. `payment_refunds.payment_id → payments.id` is declared `ON DELETE RESTRICT` (`ordering.ts:265-269`, `payment_refunds_payment_fk`). Any tenant that has ever had a `payment_refunds` row (created by a discretionary refund, or — as of this very phase's D-11 restructure — by _every_ cancel that has a captured payment, since `CancelOrderService` now always attempts a full refund) will cause `DELETE FROM payments` to raise a foreign-key violation, aborting the entire `tenancy_erase_tenant()` transaction. GDPR erasure (a CLAUDE.md project invariant: "full erasure pipeline with 30-day cool-off") is completely broken for these tenants, not degraded.

This gap pre-dates Phase 10 (migration 0055 created `payment_refunds` without ever adding it to the erase function), but this phase (a) rewrites the exact function whose stated job is to catch this class of omission, and (b) is what makes `payment_refunds` rows common in practice — before this phase's D-11 fix, `CancelOrderService`/`RefundOrderService` used the INSERT-only `save()` and silently no-op'd, so refund rows were rarely persisted for canceled orders; now every cancel-with-a-captured-payment creates one. `erase-includes-ordering.spec.ts` does not seed a `payment_refunds` row, so this is untested.

**Fix:** Add `DELETE FROM payment_refunds WHERE tenant_id = p_tenant_id;` before `DELETE FROM payments` in `tenancy_erase_tenant()`, and add a seeded `payment_refunds` row (with a real `payment_id` FK target) to `erase-includes-ordering.spec.ts` as the regression net.

---

### CR-04: Cancel can report failure (409) after already committing, when the order was previously fully refunded

**File:** `apps/api/src/contexts/payments/application/cancel-order.service.ts:37-84`, `apps/api/src/contexts/ordering/domain/order.aggregate.ts:426-446`

**Issue:** `CancelOrderService.execute()` persists the cancel unconditionally before attempting any refund:

```ts
order.cancel(input.reasonCode, input.cancelNote ?? null, input.actorUserId);
await this.orderRepo.update(order);   // commits — order is now 'canceled' in the DB

try {
  const result = await this.refundService.executeWithOrder({ ... }, order);
  ...
} catch (err) {
  if (err instanceof PaymentNotRefundableError) { ... }   // handled
  if (err instanceof RefundProviderFailedError) { ... }   // handled
  throw err;   // anything else propagates
}
```

`RefundOrderService.executeWithOrder` computes `amountMinor = input.amountMinor ?? remainingMinor` where `remainingMinor = capturedMinor - alreadyRefundedMinor` (both derived from the `payments` row). `CancelOrderService` never passes `amountMinor`, so it always requests the full remaining amount. `order.refund(amountMinor, alreadyRefundedMinor)` (`order.aggregate.ts:426-435`) throws `RefundExceedsCapturedError` whenever `amountMinor <= 0`.

D-10's own fix means a full **discretionary** refund (`RefundsController`, `billing:update`) no longer forces the order out of its current fulfillment status — an order can be fully refunded while still `accepted`/`preparing`/`ready` (all cancelable statuses). If that same order is later canceled (by anyone with `order:cancel` — the cashier/kitchen/manager roles D-06 widened this to), `alreadyRefundedMinor` already equals `capturedMinor`, so `remainingMinor = 0`, `amountMinor = 0`, and `order.refund(0, capturedMinor)` throws `RefundExceedsCapturedError`. This error is **not** one of the two types `CancelOrderService`'s catch block handles, so it is rethrown, mapped by `mapPaymentError` to a `409 payments.refund_exceeds_captured` (`error-mapping.ts:40-45`) — **after** `order.cancel()` + `orderRepo.update(order)` already committed in the line above the `try`.

Net effect: the operator's cancel request receives a 409 error (looks like the cancel failed), but the order is actually canceled in the database. A confused operator may retry, hitting `InvalidOrderTransitionError` on the second attempt (order is already `canceled`), or may believe the kitchen is still preparing food that has, in fact, already been canceled.

Not covered by `order-cancel-refund.e2e.spec.ts`'s 9 cases — none of them cancel an order that was already fully refunded by a prior, separate refund call.

**Fix:** In `CancelOrderService.execute()`'s catch block, also catch `RefundExceedsCapturedError` (or more precisely, short-circuit before calling the refund service when `alreadyRefundedMinor >= capturedMinor`) and treat it the same as `PaymentNotRefundableError` — `{ attempted: false, outcome: 'none', amountMinor: null }` — since there is genuinely nothing left to refund.

## Warnings

### WR-01: Concurrent Accept/Advance requests can double-fire domain events and race the final ETA

**File:** `apps/api/src/contexts/ordering/application/accept-order.service.ts:21-45`, `apps/api/src/contexts/ordering/application/advance-order-status.service.ts:20-47`, `apps/api/src/contexts/ordering/infrastructure/order-drizzle.repository.ts:143-184`

**Issue:** Both services follow a read-check-write pattern with no optimistic-concurrency guard: `findById` → check `snap.status !== target` (idempotency short-circuit) → mutate aggregate → `orderRepo.update(order)`. `#runUpdate`'s `WHERE` clause only filters on `(id, tenantId)` (`order-drizzle.repository.ts:169`) — it does not condition on the expected prior status. Two concurrent `POST /:id/accept` calls (e.g., a double-tap, or two staff on two tablets, explicitly flagged as an open question in the phase context — "Concurrent-transition outcome when two devices press Accept on the same order (Product MED-17)") can both pass the `snap.status === 'accepted'` short-circuit check before either commits, both call `order.accept(...)`, and both successfully `UPDATE`. Each write appends its own `OrderStatusChanged` outbox event, and the guest notification subscriber has no per-transition dedup beyond the inbox marker (which dedups per _envelope_, not per logical transition) — the guest can receive two "your order was accepted" emails, potentially with two different ETAs (the loser's write may land last, since there is no locking to serialize the two).

**Fix:** Add an optimistic-concurrency predicate to `#runUpdate`'s `WHERE` (e.g., `AND status = <expected-previous-status>`), have `update()` report zero-rows-affected as a typed "conflicting concurrent transition" error, and have `AcceptOrderService`/`AdvanceOrderStatusService` treat that as an idempotent no-op (re-read and return current snapshot) rather than a hard error.

---

### WR-02: `order_daily_sequences` (new tenant-scoped table) has no entry in the canonical RLS regression test

**File:** `packages/db/test/integration/tenant-isolation.spec.ts`, `packages/db/migrations/0073_orders_intake.sql:77-113`

**Issue:** `packages/db/CLAUDE.md` states as a hard rule: "`test/integration/tenant-isolation.spec.ts` is the canonical regression net for RLS. **Every new tenant-scoped table needs an entry here.**" `order_daily_sequences` is a brand-new tenant-scoped table introduced by this phase's migration 0073, with its own RLS policies (`order_daily_sequences_iso`, `order_daily_sequences_location_iso`). The only change this phase made to `tenant-isolation.spec.ts` was adding `shortNumber: 1` to pre-existing `orders` seed fixtures (to satisfy the new NOT NULL constraint) — no new describe/it block seeds cross-tenant `order_daily_sequences` rows and asserts zero cross-tenant visibility/write. The RLS policies as written look correct by inspection, but the table now has no automated regression net if a future migration accidentally weakens them.

**Fix:** Add an `order_daily_sequences` case to `tenant-isolation.spec.ts` mirroring the existing pattern (seed rows for two tenants, assert cross-tenant SELECT returns zero rows, assert cross-tenant INSERT/UPDATE under a mismatched `app.current_tenant` errors).

---

### WR-03: `findFailedRefundsForOrders` has no deterministic ordering — retry and the failed-refund flag can pick an arbitrary row when more than one exists

**File:** `apps/api/src/contexts/payments/infrastructure/payment-drizzle.repository.ts:223-249`, `apps/api/src/contexts/payments/interfaces/http/order-cancel.controller.ts:86-107`

**Issue:** `findFailedRefundsForOrders` has no `.orderBy(...)`, so row order for a given order is undefined. `OrderCancelController.retry()` takes `const failedRefund = failedRefunds[0];` (`order-cancel.controller.ts:93`) — if an order has accumulated more than one `failed` `payment_refunds` row (e.g., a discretionary partial refund failed at Stripe, and a later full cancel-refund also failed), the retry endpoint retries whichever row Postgres happens to return first, non-deterministically, with no way for the caller to target the other one (the retry route intentionally takes no body/refund-id parameter). The other failed row stays stuck with no path to retry it through this endpoint. `GetOrderDetailService`/`ListOrdersService`'s `hasFailedRefund`/`failedRefundAmount`/`failedRefundReason` surface has the same single-row-picking behavior for display purposes.

**Fix:** Add `.orderBy(desc(schema.paymentRefunds.createdAt))` (oldest-first or newest-first, pick one deliberately) so behavior is at least deterministic; consider whether the retry endpoint should retry all failed rows for the order rather than just one.

---

### WR-04: `order.refund()`'s over-refund validation is derived from `order.total`, independently of the `payments.amount` the caller already validated against

**File:** `apps/api/src/contexts/ordering/domain/order.aggregate.ts:426-435`, `apps/api/src/contexts/payments/application/refund-order.service.ts:90-113`

**Issue:** `RefundOrderService` computes `capturedMinor` from the `payments` row (`toMinorUnits(payment.amount)`) to derive `remainingMinor` for the default full-refund amount. It then calls `order.refund(amountMinor, alreadyRefundedMinor)`, which independently re-derives its own `capturedMinor` from `toMinorUnits(this.snapshot.total)` (the order aggregate's `total` field) for its exceeds-check. In the current system these two values should always be equal (one payment per order, no split/partial capture), so this is not exploitable today, but the two call sites trusting two different sources of truth for the same invariant is a latent inconsistency — if they ever diverge (a future partial-capture flow, a manually-corrected `orders.total`, etc.), the app-layer's computed "remaining" amount and the domain's validation would disagree, producing either a spurious `RefundExceedsCapturedError` or (worse) a validation that's looser than intended.

**Fix:** Have the domain method accept the already-known `capturedMinor` from the caller rather than re-deriving it from `snapshot.total`, or document explicitly (WHY-comment) that `payments.amount` and `orders.total` are a maintained invariant equality and point to where that's enforced.

## Info

### IN-01: `channel` is fully client-supplied with no relation to actual request origin

**File:** `apps/api/src/contexts/ordering/application/dto.ts:41`

**Issue:** `channel: OrderChannelSchema.optional().default('site')` is accepted verbatim from the `POST /v1/orders` request body, which is a `@Public()` endpoint. Nothing derives or cross-checks it against the actual calling client (there is no qr-menu order-submission path yet per the phase context, but the API already accepts `channel: 'qr-menu'` from any caller). Impact is limited to skewed channel-filter/analytics data (no money, auth, or tenancy implication), so this is informational rather than a defect to block on.

**Fix:** When QR ordering ships, consider deriving `channel` server-side (e.g., from which public endpoint/route was hit) rather than trusting a client-supplied enum value, or explicitly document that this field is guest-declared and thus unverified.

### IN-02: Historical order detail becomes inaccessible (404) once its location is archived

**File:** `apps/api/src/contexts/ordering/application/get-order-detail.service.ts:41-51`

**Issue:** `GetOrderDetailService` filters the in-scope check to `activeLocations` only (`status === 'active'`). If a location is later archived, every historical order that belonged to it becomes permanently un-viewable via `GET /:id/detail` (existence-hiding 404), even for the tenant owner. This is plausibly out of this phase's scope (location lifecycle isn't a Phase 10 concern), but is a new service introduced by this phase, so flagging for awareness rather than as a blocking defect.

**Fix:** Consider whether order detail should remain viewable for orders belonging to now-archived locations (e.g., check location existence/tenant membership rather than `active` status specifically for the detail read).

---

_Reviewed: 2026-08-17T23:45:50Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
