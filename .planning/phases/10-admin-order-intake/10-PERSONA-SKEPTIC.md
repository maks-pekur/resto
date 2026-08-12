# Phase 10 — Admin Order Intake · Skeptic Review

**Reviewer:** persona-skeptic
**Date:** 2026-08-10
**Status:** pre-plan (ROADMAP §Phase 10, REQUIREMENTS ORDINT-01..10)
**Verdict:** **Do not plan this phase as written.** Two production bugs and one domain-model
constraint make ORDINT-03/05/06 unimplementable today. ORDINT-02's SSE design has a hard
technical blocker in the current auth/tenancy transport. ORDINT-10 is already ~90% shipped.
Fix the blockers, cut ~40% of the requirements, and this is a 5–6 plan phase instead of 15.

---

## TL;DR — the three things the founder is not seeing

1. **`orders.status` physically cannot leave the payment states in production today.** Both
   operator write paths call an INSERT-only `save()` that no-ops on an existing row and
   silently discards the pulled domain events. `accepted`, `preparing`, `ready`, `completed`,
   `canceled`, `refunded` are unreachable states. Phase 10 is a UI on top of a write path
   that does nothing. (BLOCK-1)
2. **The order aggregate forbids cancel and refund after `accepted`** — i.e. after the first
   button the operator will ever press. The exact scenario ORDINT-05 exists for
   (cook-side cancellation) is structurally impossible. (BLOCK-2)
3. **SSE cannot carry `x-tenant-id` / `x-brand-slug` / `x-location-id`.** Browser
   `EventSource` supports no custom headers, and the entire API's tenant resolution depends
   on them. ORDINT-02 as written does not compile against the current architecture.
   Polling is not the "cheap fallback" here — it is the only design that fits. (BLOCK-3)

---

## Claim vs Evidence Audit

| Claim (ROADMAP / REQUIREMENTS)                                            | Reality in code                                                                                                                                                                                                                                                                                                                                                                                                      | Verdict                                                                           |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| SC-2 "rejection auto-triggers a refund via Stripe"                        | Refund is gated on `billing:['update']` (`apps/api/src/contexts/payments/interfaces/http/refunds.controller.ts:21`), which is `NON_DELEGATABLE` (`packages/domain/src/rbac/non-delegatable.ts:6`) and owner-only (`packages/domain/src/rbac/system-roles.ts:10`). `cashier-foh` / `kitchen` presets have `order:['read','update-status']` only (`apps/api/src/contexts/identity/application/preset-roles.ts:26,36`). | **Broken by design.** The person at the counter cannot reject an order.           |
| SC-3 "transitions accepted → preparing → ready → completed"               | Aggregate supports it (`order.aggregate.ts:243-305`), but no persisted order can ever reach `accepted` — see BLOCK-1.                                                                                                                                                                                                                                                                                                | **Untestable until BLOCK-1 is fixed.**                                            |
| SC-4 "cancels with reason; auto-refund if paid"                           | `CancelOrderService` calls `orderRepo.save()` (`cancel-order.service.ts:55`) → INSERT-only no-op (`order-drizzle.repository.ts:52-78`). Row unchanged, event dropped. And `cancel()` rejects any status past `paid` (`order.aggregate.ts:308`).                                                                                                                                                                      | **Silently broken today.**                                                        |
| SC-5 "public GET /v1/orders/:id/status returns current order state"       | Already exists (`ordering/interfaces/http/orders.controller.ts:52-67`) and is already consumed by a working backoff poller (`apps/website/components/checkout/order-status-poller.tsx`).                                                                                                                                                                                                                             | **Already done.** Delta ≈ 20 lines.                                               |
| ORDINT-10 states "`accepted / preparing / ready / on its way`"            | `on its way` is not a member of `OrderStatus` (`order.aggregate.ts:8-18`). No courier concept anywhere. Same phantom state in GNOTIF-02.                                                                                                                                                                                                                                                                             | **Naming drift / phantom requirement.**                                           |
| ORDINT-06 "partial refund (specific items)"                               | Service takes an opaque `amountMinor` (`refund-order.service.ts:16`). No item↔refund link, no per-item math, no UI (`grep refund apps/admin/src/lib` → nothing).                                                                                                                                                                                                                                                     | **"Already done" is a false read.**                                               |
| ORDINT-08 "filter by channel (qr-menu vs site)"                           | No `channel` column in `packages/db/src/schema/ordering.ts`. `apps/qr-menu` never calls `/v1/orders` (grep: zero hits in `apps/qr-menu/src`).                                                                                                                                                                                                                                                                        | **Filter on a dimension with one value and no column.**                           |
| SC-1 "delivery orders accepted without polygon enforcement until Phase 9" | `deliveryFee: '0.00'` is hard-coded at creation and never set (`order.aggregate.ts:182`). Website shows "Calculated at delivery" (`apps/website/components/checkout/order-summary.tsx:58-61`). No courier state, no address validation.                                                                                                                                                                              | **Not "degraded" — actively loses the restaurant money on every delivery order.** |
| ROADMAP "Real-time updates (SSE stream from api on `ordering.>` events)"  | `EVENT_SUBSCRIBER` soft-fails to `null` at boot (`apps/api/src/infrastructure/nats.module.ts:111-131`); `RunningSubscription.#run()` stops permanently on iterator failure with no re-subscribe (`packages/events/src/infrastructure/nats-subscriber.ts:250-267`).                                                                                                                                                   | **Feed dies silently on a NATS restart, forever, until API restart.**             |

---

# BLOCK

## BLOCK-1 — `orders.status` never changes in production. Both operator write paths are no-ops.

**Evidence.**

- `apps/api/src/contexts/ordering/infrastructure/order-drizzle.repository.ts:47-78`
  `save()` is `INSERT … ON CONFLICT (tenant_id, idempotency_key) DO NOTHING RETURNING id`,
  followed by `if (result.length === 0) return;` (line 78).
  Critically, `const events = order.pullEvents();` runs at **line 48 — before** the early
  return, so the domain events are drained and thrown away too.
- `apps/api/src/contexts/payments/application/cancel-order.service.ts:55` — `await this.orderRepo.save(order)`
- `apps/api/src/contexts/payments/application/refund-order.service.ts:114` — `await this.orderRepo.save(order)`
- Correct call sites for comparison: `create-checkout-payment.service.ts:117` and
  `handle-stripe-event.service.ts:217` both use `orderRepo.update(order, tx)`.
- The `charge.refunded` webhook branch (`handle-stripe-event.service.ts:353-400`) updates
  **only** `payments` — it never touches `orders`.

**Consequence.** In production today, `orders.status` ∈ `{created, requires_action, paid, failed}`.
A fully refunded order still reads `paid`. A canceled order still reads `paid`. The
`OrderCanceled` / `OrderRefunded` outbox events are never emitted from these paths.
Phase 10's feed — whose entire job is showing correct order state — would show wrong state
on day one, and the operator's cancel button would do nothing visible.

**Why the tests missed it.** Textbook mock theater:
`cancel-order.service.spec.ts:78` mocks `save: vi.fn()`; line 136-137 asserts the
**in-memory aggregate's** status. `refund-order.service.spec.ts:77,190,205,256` same pattern.
The only e2e touching the operator refund endpoint asserts cross-tenant _denial_
(`payments-isolation.e2e.spec.ts:122,179`) — there is no happy-path e2e at all.
This is exactly the failure class the founder already logged after the Phase 8 live smoke.

**Recommendation.**

1. Fix as a **quick task before Phase 10 planning**, not inside it. Swap both call sites to
   `update()`.
2. Remove `save()` from `OrderRepository` and replace with `create()` + `update()` so the
   footgun cannot be re-picked-up.
3. Add an integration test per transition that asserts **the row in `orders`**, not the
   aggregate. Make "assert DB row, not mock arg" an explicit acceptance criterion for every
   Phase 10 plan.

---

## BLOCK-2 — The aggregate forbids cancel and refund after `accepted`. ORDINT-03/05/06 cannot be built on it.

**Evidence.**

- `apps/api/src/contexts/ordering/domain/order.aggregate.ts:307-310` — `cancel()` throws unless
  status is `created` or `paid`.
- `apps/api/src/contexts/ordering/domain/order.aggregate.ts:321-324` — `refund()` throws unless
  status is exactly `paid`.
- `refund()` also **collapses fulfillment state into payment state** (line 335-336): a full
  refund sets `status = 'refunded'`, erasing the fact that the food is in the oven.

**Consequence.** The moment the operator presses Accept (ORDINT-04's very first action):

- ORDINT-05 (cancel with reason + auto-refund) → `InvalidOrderTransitionError`.
- ORDINT-06 (partial refund) → `InvalidOrderTransitionError`.
- The single most common real-world refund — "the guest complained about the dish after we
  served it", i.e. a `completed` order — is impossible.

This is the founder's own skeptic brief verbatim: _"MVP omissions: returns, cook-side
cancellations, post-order mutations."_ The state machine currently encodes the assumption
that nothing goes wrong after acceptance. Kitchens are the opposite of that.

**Recommendation.** Split fulfillment state from payment state as **Plan 01 of this phase**:

- `orders.status` becomes fulfillment-only: `created → paid → accepted → ready → completed`,
  plus `canceled`. Drop `refunded` from it.
- Payment/refund state already lives correctly in `payments.status`
  (`pending|requires_action|succeeded|failed|refunded|partially_refunded` —
  `packages/db/src/schema/ordering.ts:167-170`). Read it there.
- `cancel()` legal from `paid | accepted | preparing | ready`, with a mandatory reason.
- `refund()` legal from any post-`paid` state.
  Do NOT discover this mid-phase. It is a migration + aggregate + repository + event change.

---

## BLOCK-3 — SSE cannot carry the tenant/brand/location headers the whole API depends on.

**Evidence.**

- `apps/admin/src/lib/api-client.ts:44-52` — every admin call carries `x-tenant-id`,
  `x-brand-slug`, and conditionally `x-location-id`.
- `apps/api/src/shared/tenant-context.middleware.ts:57-122` — tenant resolves from
  `x-tenant-id` / `x-tenant-slug` (gated) / customer host / dev fallback. The admin's API
  origin is **not** a tenant customer host, so the header is mandatory.
- `apps/api/src/contexts/identity/interfaces/http/guards/brand-scope.guard.ts:32-38` and
  `guards/location-scope.guard.ts:39-45` — both throw `*.context_required` when the
  corresponding ALS value is absent.
- Browser `EventSource` supports exactly one option: `withCredentials`. **No custom headers.**

**Consequence — pick your poison:**

- **(a) Move tenant/brand/location into query params.** You have just created a new forgeable
  input surface on a long-lived connection, and both scope guards must be reworked to read
  from query instead of ALS. That is precisely the class of work 08.2–08.5 spent five phases
  hardening. It also puts tenant IDs in access logs and any CDN cache key.
- **(b) Ship a fetch-based SSE client** (`@microsoft/fetch-event-source` or a hand-rolled
  `ReadableStream` reader). You then lose `EventSource`'s built-in reconnect and must
  implement `Last-Event-ID`, backoff, and heartbeat detection yourself — which is exactly
  what ORDINT-09 pretends `retry:` gives you for free.

**Recommendation.** **Cut ORDINT-02 and ORDINT-09. Poll `GET /v1/orders?status=open` every 5s.**
Polling reuses `apiFetch` verbatim — headers, session, 401 handling, timeout, retry — with
zero new transport, zero new auth surface, zero new guard work. The guest-facing confirmation
page already polls and nobody has complained (`apps/website/components/checkout/order-status-poller.tsx`).
A 5-second worst-case delay on an order that takes 15 minutes to cook is not a product
difference; it is an engineering vanity.

Revisit SSE when a real tenant complains about latency, or when you actually run >1 API
instance. Write that trigger down.

---

## BLOCK-4 — Auto-refund on reject/cancel collides with the non-delegatable permission model.

**Evidence.**

- `apps/api/src/contexts/payments/interfaces/http/refunds.controller.ts:21` — `@Permissions({ billing: ['update'] })`
- `packages/domain/src/rbac/non-delegatable.ts:6` — `billing: ['update']` is NON_DELEGATABLE;
  `containsNonDelegatable` blocks it from every custom role, enforced on create/update/assign.
- `packages/domain/src/rbac/system-roles.ts:10,20` — only `owner` has it. `admin` does not.
- `apps/api/src/contexts/identity/application/preset-roles.ts` — `manager`, `cashier-foh`,
  `kitchen` all have `order:['read','update-status']` and no billing.

**Consequence.** ORDINT-03 and ORDINT-05 promise auto-refund on reject/cancel. Two outcomes,
both bad:

- Reject/cancel becomes **owner-only** → the cashier at 22:00 on Friday cannot reject an
  out-of-stock order. Product-broken.
- Reject/cancel is wired behind `order:update-status` and internally invokes
  `CancelOrderService` → a money-moving side effect just became reachable by every custom
  role, silently defeating the escalation control that Phase 08.3 built across three plans.

**Recommendation.** Decide this explicitly in CONTEXT, with the founder, before planning.
Suggested shape: introduce `order:['reject']` — a **bounded** power (refunds exactly this
order, exactly its captured amount, never an operator-chosen amount) that IS delegatable,
kept distinct from `billing:update` (arbitrary-amount refunds, stays owner-only and
non-delegatable). Add a regression test pinning that a custom role can hold `order:reject`
and cannot hold `billing:update`. Do not let this be decided by whoever writes the controller.

---

# HIGH

## HIGH-1 — An SSE feed on the current NATS subscriber dies silently and never recovers.

`apps/api/src/infrastructure/nats.module.ts:111-131` — connect failure at boot resolves the
provider to `null` with a WARN; the app comes up "healthy" with no subscriber.
`packages/events/src/infrastructure/nats-subscriber.ts:250-267` — an iterator failure (broker
disconnect, stream deletion) is caught, logged, and the subscription **stops permanently**.
There is no re-subscribe anywhere.

A NATS restart on the single VPS therefore kills the order feed until someone restarts the
API — and the operator's screen looks exactly like "a quiet night". Meanwhile the orders are
committed in Postgres the whole time. Chain length: Postgres → outbox → dispatcher leader →
NATS → subscriber → SSE connection → tab. Polling's chain: Postgres → tab.
**Recommendation:** read the feed from Postgres. If SSE ever ships, the subscriber needs
reconnect-with-backoff and a health signal surfaced in the UI ("live / reconnecting / stale").

## HIGH-2 — Durable consumer name = queue group. With 2 API instances, half the operators see nothing.

`packages/events/src/infrastructure/nats-subscriber.ts:157` + `buildConsumerConfig` line 83
use `durable_name`. Two API replicas subscribing with the same durable name split the stream:
an event delivered to replica A is never seen by operators holding SSE connections on
replica B. Today prod is a single container so this is invisible — it detonates on the first
`--scale 2` or on any rolling deploy where old and new overlap, which is _precisely_ the
ORDINT-09 scenario. Fixing it means per-instance ephemeral consumers with `inactive_threshold`
and leak cleanup: entirely absent from the five success criteria.

## HIGH-3 — The rate limit is one shared per-IP bucket of 60/min. A restaurant is one NAT.

`apps/api/src/shared/security.ts:144-166` — `global:false`, a **single store**, `max` defaults
to `RATE_LIMIT_PUBLIC_PER_MIN` = 60 (`apps/api/src/config/env.schema.ts:182`), shared across
all routes for one IP.

Every device in a restaurant shares one public IP. Three tabs polling at 5s = 36 req/min
_before_ any other admin traffic; four devices = 48; add menu edits and stop-list toggles and
the operator eats a 429 in the middle of service. SSE doesn't save you either — a reconnect
storm after a deploy has the same shape. (The founder's own memory note about false 429s in
the API test suite is the same root cause.)
**Recommendation:** Phase 10 must change the rate-limit `keyGenerator` to per-session (or
per-tenant) for authenticated `/v1/*` routes, or exempt the feed route explicitly. Add it as
a requirement — it is currently in none of ORDINT-01..10.

## HIGH-4 — No index for the feed query; no column for ORDINT-08's channel filter.

`packages/db/src/schema/ordering.ts:48-74` — the only indexes on `orders` are
`UNIQUE (tenant_id, idempotency_key)` and `UNIQUE (id, tenant_id)`. Nothing on
`(tenant_id, location_id, status, created_at)`, which is exactly the feed query.
At MVP volume a seq scan is survivable; at 12 months of order history on one VPS with a
5-second poll from four devices, it is not. Add the composite index in the same plan as the
list endpoint.

Separately: there is **no `channel` column anywhere**, and `apps/qr-menu` never posts an order
(zero hits for `v1/orders` under `apps/qr-menu/src`). ORDINT-08's channel filter would filter
a dimension that has one value produced by one app. **Cut it**, or reduce it to
`fulfillmentMode`, which already exists and is what the kitchen actually cares about.

## HIGH-5 — The order number is unusable at a counter.

`apps/api/src/contexts/ordering/application/dto.ts:79-89` — `generateOrderNumber()` returns
`20260810-A7K2M`. Nobody calls out "order 20260810-A7K2M is ready". Restaurants use a short
daily sequence. This string is already printed to the guest
(`apps/website/components/checkout/order-status-poller.tsx:79`).
**Recommendation:** add a per-location daily short number (`#42`) surfaced in the feed, on the
kitchen view, and on the guest page; keep the long one as the internal reference. One column
plus a counter. Decide it in Phase 10 or the feed is operationally dead on arrival.

## HIGH-6 — Delivery: zero fee, no zone, no address validation, no dispatch state, phantom "on its way".

`apps/api/src/contexts/ordering/domain/order.aggregate.ts:182` hard-codes `deliveryFee: '0.00'`
and nothing ever sets it. The website checkout offers delivery and tells the guest
"Calculated at delivery" (`apps/website/components/checkout/order-summary.tsx:58-61`) — i.e.
the restaurant is expected to collect cash at the door for a fee RestOS never computed.
There is no courier, no `on_its_way` state in `OrderStatus` (`order.aggregate.ts:8-18`), and
Phase 9 is in MVP-2. Yet ORDINT-10 _and_ GNOTIF-02 both promise the guest an "on its way"
status the state machine cannot produce.

SC-1's "delivery orders are accepted without polygon enforcement" is not a graceful
degradation — it is shipping a mode where the restaurant loses the delivery fee on every
order and has no workflow to fulfil it.
**Recommendation:** for MVP-1, **disable `delivery` at checkout** (pickup + dine-in only).
If the founder insists on keeping it, the minimum is: a flat per-location delivery fee
persisted on the order, plus one manual "handed to courier" transition. That is a second
phase, not a footnote in a success criterion.

## HIGH-7 — Nothing happens to an order nobody accepts.

ORDINT-01..10 defines no behaviour for an order sitting in `paid` for 20 minutes. The guest
has paid and — worse — the confirmation page tells them "Payment confirmed" and **stops
polling** the moment status hits `paid` (`order-status-poller.tsx:10,75`). So the guest
believes the order is accepted while nobody has seen it. That is a chargeback and a one-star
review.
**Recommendation (cheap, 1 plan):** an age badge in the feed that goes amber/red past a
threshold, plus a background job (reuse the existing `BackgroundJobsModule` + Resend adapter)
that emails/SMSs the brand's operator address if an order stays `paid` past N minutes.
Decide the auto-cancel-and-refund policy explicitly, even if the answer is "never, alert only".

## HIGH-8 — Nothing alerts a backgrounded tab. This is the #1 reason the feature fails in a real restaurant.

The whole design assumes a human is staring at the admin tab. Real counters have that tab
behind a POS window, or the tablet asleep. Not one of ORDINT-01..10 mentions an audible alert,
a `document.title` badge, the Notification API, or repeat-until-acknowledged.
**Recommendation:** put sound + title-badge in the phase explicitly (~1 plan). Note the
browser autoplay policy — audio must be unlocked by a user gesture, so the "Start shift"
button that unlocks the audio context is also the natural place to arm the feed and to record
who is on duty.

---

# MED

## MED-1 — ORDINT-10 is already shipped. Shrink it to a 20-line change.

`GET /v1/orders/:id/status` exists and is `@Public()`
(`apps/api/src/contexts/ordering/interfaces/http/orders.controller.ts:52-67`), and a working
exponential-backoff poller already consumes it
(`apps/website/components/checkout/order-status-poller.tsx`).
Two real deltas:

1. `TERMINAL_STATUSES` includes `'paid'` (line 10) — the poller quits the instant payment
   confirms and never shows `accepted / preparing / ready`. Fix = change one Set + copy.
2. `eta` maps to `snapshot.scheduledFor` (`orders.controller.ts:64`) — the **pre-order
   scheduled time**, `null` for every immediate order. The guest never sees a prep-time
   estimate. A real ETA is a **new** field (per-location prep minutes, stamped at accept),
   not an existing one.
   **Recommendation:** rewrite ORDINT-10 as "extend the existing poller through fulfillment
   states + add a real prep-time ETA". Budget zero plans for building the endpoint.

## MED-2 — ORDINT-06's backend "exists" but has never been exercised by a client or a happy-path test.

Route is in `docs/api/openapi.yaml:1090`; service is `refund-order.service.ts`. But:
no admin UI calls it (zero `refund` hits in `apps/admin/src/lib/*`), no happy-path e2e (only
cross-tenant denial at `payments-isolation.e2e.spec.ts:122,179`), and it is broken three ways
(BLOCK-1, BLOCK-2, MED-3). Also "partial refund of **specific items**" is not what it does —
it takes an opaque `amountMinor` (`refund-order.service.ts:16`). Item selection, per-item
amount math, and an item↔refund link table do not exist. Calling ORDINT-06 "already done"
would be the most expensive planning error available in this phase.

## MED-3 — The refund endpoint is unreachable for an owner in "all locations" mode.

`refunds.controller.ts:14-22` carries neither `@BrandNeutral` nor `@LocationNeutral`, so
`LocationScopeGuard` throws `location.context_required`
(`guards/location-scope.guard.ts:39-45`) **before** the owner bypass at line 65 whenever
`x-location-id` is absent — and `apiFetch` deliberately omits that header when the owner
selects `?location=all` (`apps/admin/src/lib/api-client.ts:48-50`).
This is the same bug class as the 08.4 owner white-screen (STATE.md:298). Phase 10 will hit
it on day one, because the orders feed is exactly the page an owner opens in all-mode.
Audit every new and touched ordering/payments controller for the `@BrandNeutral` /
`@LocationNeutral` / `@RequireBrand` triple as an explicit plan task.

## MED-4 — Event contracts can't route by location, so SSE fan-out needs a DB hit per event anyway.

`packages/events/src/contracts/ordering.ts:5-73` — `OrderCreatedV1Payload` has no
`locationId`; `OrderPaidV1Payload` and `OrderStatusChangedV1Payload` have neither `brandId`
nor `locationId`. A kitchen at location B must not see location A's orders, so every fan-out
requires a per-event DB lookup or a v2 contract + migration. Another unbudgeted cost that
polling simply does not have — the list query is already location-confined by
`orders_location_iso` RESTRICTIVE RLS (`packages/db/migrations/0071_orders_location_rls.sql:19-22`)
plus `ScopedTx`.

## MED-5 — Stripe refund failure is invisible, and the Stripe call sits inside a DB transaction.

`refund-order.service.ts:60-81` — `this.db.withTenant(async (tx) => { … await this.provider.createRefund(…) … })`.
Two problems:

1. A slow or hanging Stripe call holds a Postgres transaction open. On a Friday spike during
   a Stripe incident, that is connection-pool exhaustion on a single VPS.
2. If `createRefund` throws, the whole transaction rolls back — so the reject/cancel is undone
   too, and the operator gets a 5xx whose `detail` is **redacted** by `ProblemDetailsFilter`.
   They will not know whether the order was rejected, whether the guest was charged, or
   whether to retry. They will click again.

Failure modes not handled anywhere: insufficient balance in the connected account (very common
for a new restaurant — Stripe has already paid out, so Stripe debits their bank or fails),
`charge_already_refunded`, account restricted/disabled, and the async case where
`refund.status = 'pending'` and later fails. `handle-stripe-event.service.ts` handles
`payment_intent.succeeded`, `charge.refunded`, `charge.dispute.created` — there is **no
`refund.failed` / `refund.updated` branch**.

**Recommendation:** (a) move the provider call outside the transaction; (b) specify the
operator-visible outcome when refund fails — the order must still be rejectable, with a
"refund pending / refund failed — action required" badge and a retry affordance, never a
silent rollback; (c) add the `refund.updated`/`refund.failed` webhook branch. Two success
criteria promise auto-refund; neither says what happens when Stripe says no.

## MED-6 — No ticket, no print path.

Kitchens run on paper or a locked-open KDS. There is no print view, no `@media print`
stylesheet, no "print on accept". Skipping thermal/ESC-POS in MVP-1 is defensible; shipping
**no printable order view at all** is not — a print stylesheet is a few hours and it is the
difference between "usable in a kitchen" and "demo".

## MED-7 — `GET /v1/orders/:id/status` is `@Public()` and returns `total` + `orderNumber` to anyone with the UUID.

`orders.controller.ts:32,52`. v4 UUIDs make enumeration impractical, so this is acceptable
today — but the URL travels in emails and browser history. If Phase 10 enriches this response
to power a nicer guest page (items, customer name, delivery address, ETA), it becomes a real
leak. Pin the response shape in the plan and add a regression test asserting no PII field is
ever added to it.

---

# LOW

- **LOW-1 — Phantom state.** "on its way" appears in ORDINT-10 and GNOTIF-02 but is not in
  `OrderStatus` (`order.aggregate.ts:8-18`). Either add it (needs a courier concept — see
  HIGH-6) or strike the phrase from both requirements. Leaving it invites a plan to invent it.
- **LOW-2 — ORDINT-09's `retry:` is `EventSource`-specific.** With a fetch-based SSE client
  (forced by BLOCK-3) `retry:` is meaningless — the client owns its backoff. The criterion as
  written could be "satisfied" by emitting a field nothing reads. Test theater.
- **LOW-3 — `completed` is a dead end; no "not collected".** For pickup, the common terminal
  is "the guest never came". The operator's only options are to lie (`completed`, which
  pollutes Phase 13/14 revenue reporting) or leave it `ready` forever.
- **LOW-4 — No actor on any transition.** `OrderStatusChangedV1Payload` carries no userId
  (`contracts/ordering.ts:61-68`), `orders` has no `accepted_by`. "Who refunded this?" and
  "who rejected the order?" have no answer, even though the audit context subscribes to
  `ordering.>`. Add the actor to the envelope while you are already touching these events.
- **LOW-5 — No concurrency handling on the feed.** Two devices show the same `paid` order,
  both press Accept; the loser gets a raw `InvalidOrderTransitionError` toast for a benign
  race. Either make accept idempotent or map it to a friendly "already handled by <name>".

---

## The "what if we cut it" test

| Req                                 | Cut?                            | Reasoning                                                                                                                                                                                                                               |
| ----------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ORDINT-01 feed                      | **NO**                          | This _is_ the phase. Without it paid orders go nowhere.                                                                                                                                                                                 |
| ORDINT-02 SSE                       | **CUT → 5s polling**            | BLOCK-3 makes it architecturally expensive; HIGH-1/HIGH-2 make it fragile. A 5s delay on a 15-minute cook time is not a product difference. Trigger to revisit: a tenant complains, or >1 API instance.                                 |
| ORDINT-03 accept / reject           | **KEEP accept, RESHAPE reject** | Accept is essential. "Reject auto-refunds" → "reject; refund attempted; outcome shown; retryable" (MED-5) + a delegatable `order:reject` permission (BLOCK-4).                                                                          |
| ORDINT-04 transitions               | **CUT `preparing`**             | `paid → accepted → ready → completed` is enough. `preparing` is a button nobody presses mid-service; it exists to look like a KDS. Removing it deletes a column, a status email, and a test matrix row. Add it back when a tenant asks. |
| ORDINT-05 cancel + refund           | **KEEP**                        | But requires BLOCK-2 first — cancel-after-accept is _the_ real case, not an edge case.                                                                                                                                                  |
| ORDINT-06 item-level partial refund | **CUT → MVP-2**                 | Needs a schema change, per-item math, and UI, to serve an edge case. Full refund + a note covers MVP-1; the existing amount-based owner endpoint is the escape hatch.                                                                   |
| ORDINT-07 order details             | **NO**                          | Table number, items, modifiers — the kitchen cannot cook without it. This is the highest-value item after the feed itself.                                                                                                              |
| ORDINT-08 filters                   | **CUT date + channel**          | "Today's open" + "history" is enough. Channel has one value and no column (HIGH-4). Date filtering is Phase 13/14 work.                                                                                                                 |
| ORDINT-09 SSE shutdown              | **CUT**                         | Dies with ORDINT-02.                                                                                                                                                                                                                    |
| ORDINT-10 public status             | **ALREADY DONE**                | Shrink to "extend poller past `paid` + add a real ETA" (MED-1).                                                                                                                                                                         |

**Net:** as written, this is realistically 12–15 plans. With the cuts above plus the two BLOCK
fixes, it is **5–6 plans** and a materially better product.

---

## Scope creep risk — what turns 5 plans into 15

1. **SSE.** Transport rework + auth-over-query-param + reconnect + graceful shutdown +
   per-instance NATS consumers + Cloudflare buffering config + tests. Cutting it removes 3–4
   plans and four failure modes.
2. **Item-level partial refund.** Schema + math + UI + Stripe reconciliation + GDPR review of
   the new rows.
3. **"While we're here" delivery.** Delivery fee, address validation, courier state. Zones are
   MVP-2; do not let a `deliveryFee` computation creep in via HIGH-6.
4. **A "real" KDS board.** Drag-drop columns, per-station routing, timers. Ship a list with
   buttons and an age badge.
5. **Analytics creep.** "Just add today's revenue to the header." That is Phase 13.
6. **Discovering BLOCK-1/BLOCK-2 mid-phase** and re-planning the payments context from inside
   an order-intake phase. Fix them first, in isolation, with real DB assertions.

---

## Hidden assumptions — test these with a real restaurant before planning

1. **That someone keeps the admin tab open.** Ask a target restaurant what device sits at the
   counter and who watches it. If the answer is "the owner's phone", the entire design
   changes — mobile-first + push, not SSE to a desktop tab.
2. **That one operator handles orders.** The permission model already contradicts this
   (`cashier-foh` / `kitchen` presets exist), yet nothing in Phase 10 handles two people
   acting on one order (LOW-5), and the refund gate makes the counter person powerless
   (BLOCK-4).
3. **That restaurant Wi-Fi holds a long-lived connection.** It is shared with guests, captive
   portals, and a POS. A dropped SSE stream that silently doesn't reconnect is
   indistinguishable from "no orders tonight". Polling self-heals; a hung stream does not,
   and detecting it requires heartbeats — more work.
4. **That "accepted" means something to the kitchen.** In most small restaurants the ticket
   _is_ the acceptance. A two-step accept-then-prepare may be pure friction. Watch one
   service before locking ORDINT-04.
5. **That the guest wants live status.** For pickup, "ready" matters. For dine-in it is noise.
   For delivery it is meaningless without a courier.

---

## Third-party dependency exposure

- **Stripe refunds** (MED-5) — auto-refund is promised in two success criteria with zero
  failure handling. Insufficient connected-account balance is the _expected_ case for a new
  restaurant, not the exotic one.
- **Cloudflare** — admin on Pages, API elsewhere. Proxied responses are buffered by default;
  SSE needs `text/event-stream` + `Cache-Control: no-cache` + `X-Accel-Buffering: no` and a
  Cloudflare rule, and the ~100s idle timeout makes heartbeats mandatory. Not mentioned
  anywhere in the phase.
- **NATS** — single node on the VPS, soft-failing at boot, non-reconnecting (HIGH-1).
- **Better Auth** — `AuthGuard` calls `auth.api.getSession()` on every request
  (`guards/auth.guard.ts:82`). Under 5s polling from four devices that is 48 session lookups
  a minute per restaurant, each hitting the auth DB. Measure it before shipping; a short
  in-process session cache may be needed.

---

## Test-fidelity requirement for this phase (non-negotiable)

BLOCK-1 is a bug that mocks actively hid for two months. Given that history, every Phase 10
plan must carry these acceptance criteria:

1. **Every state transition has an integration test that asserts the row in `orders`**, not
   the aggregate and not a mock call argument.
2. **At least one happy-path e2e for `POST /v1/orders/:id/refund`** asserting `orders`,
   `payments`, and `payment_refunds` rows together.
3. **A real-browser smoke with two tabs** — one owner in `?location=all`, one staff pinned to
   a location — proving the location confinement of the feed and that the owner path does not
   403 (MED-3).
4. **A test that a custom role can hold the reject permission and cannot hold `billing:update`**
   (BLOCK-4).

---

## What I did NOT review

- `apps/admin` UI component structure beyond routing and `apiFetch` — no design review of the
  feed layout.
- The Stripe adapter internals (`stripe-provider.adapter.ts`) beyond the port contract.
- Migration files other than `0071_orders_location_rls.sql` and the `ordering` schema.
- The audit context's `ordering.>` subscription behaviour.
- Load/perf measurement — all throughput claims here are arithmetic from configured limits
  (`RATE_LIMIT_PUBLIC_PER_MIN` = 60/min/IP), not benchmarks.
- i18n / copy for the operator surface.
