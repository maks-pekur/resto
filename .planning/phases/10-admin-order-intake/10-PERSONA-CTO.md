# Phase 10 — CTO Persona Review (pre-plan)

Reviewer lens: multitenancy correctness, peak-Friday scale, build-vs-buy, observability + blast radius, dev velocity bounded by solo throughput.
Reviewed at: `admin-vite-spa` @ `a2ae4ca`, 2026-08-10. Pre-implementation-plan.

---

## TL;DR (decision-grade)

1. **Two money-path bugs already exist in the code Phase 10 is built on top of.** `RefundOrderService` and `CancelOrderService` persist via `OrderRepository.save()`, which is an INSERT with `onConflictDoNothing` that early-returns on an existing order — so `orders.status` never flips to `refunded`/`canceled`, and `ordering.order_refunded.v1` / `ordering.order_canceled.v1` are **never published**. The phase mandates an SSE feed fed from `ordering.>`. Fix this first or the feed is wrong on day one.
2. **SSE as specified cannot work with this codebase's tenancy contract.** Tenant/brand/location are resolved exclusively from `x-tenant-id` / `x-brand-slug` / `x-location-id` request headers; native `EventSource` cannot send headers. This is a real design fork, not an implementation detail, and it must be decided in CONTEXT, not discovered in a plan.
3. **Recommendation: ship the feed on polling; make SSE a separately-abandonable slice.** ORDINT-01/03/04/05/07/08 are the revenue-critical part and are boring, testable HTTP. ORDINT-02/09 carry four unresolved architectural questions (transport, long-lived authz, Cloudflare buffering, shutdown semantics) on a solo budget. Do not put "the operator sees the paid order" on the risky path.

---

## BLOCK

### BLOCK-1 — `ordering.order_refunded.v1` and `ordering.order_canceled.v1` are never emitted; order status never flips on refund/cancel

**Evidence.**

- `apps/api/src/contexts/payments/application/refund-order.service.ts:114` — `await this.orderRepo.save(order)` after `order.refund(...)` at line 71.
- `apps/api/src/contexts/payments/application/cancel-order.service.ts:55` — `await this.orderRepo.save(order)` after `order.cancel(...)` at line 54.
- `apps/api/src/contexts/ordering/infrastructure/order-drizzle.repository.ts:77-80` — `save()` is `INSERT ... onConflictDoNothing({target:[tenantId, idempotencyKey]}).returning()`, then `if (result.length === 0) return;`. For an order that already exists (always, in the refund/cancel path) this returns **before** the item inserts and **before** the `appendToOutbox` loop at line 110.
- The only other emit path for these domain events is `#runUpdate` (line 147), reached via `update()`, which neither service calls.

**Consequence.** After an operator refunds in full: `payments.status='refunded'` (set by `RefundOrderService` / `handleRefund`), but `orders.status` stays `'paid'`. The admin feed, the guest status endpoint (`orders.controller.ts:52`), and any future analytics all read the wrong state. `ordering.order_refunded.v1` and `ordering.order_canceled.v1` do not exist on the wire — the audit context's `ordering.>` subscriber records nothing, and the Phase 10 SSE feed would never learn about a refund or a cancel.

**Why it survived.** `apps/api/src/contexts/payments/application/refund-order.service.spec.ts:190-206` asserts `orderRepo.save.mock.calls[0][0].toSnapshot().status` — the _in-memory aggregate_, through a mocked repo. `apps/api/test/e2e/payment-lifecycle.e2e.spec.ts:386-398` asserts `payments.status` / `payments.refundedAmount` and never reads `orders.status`. This is the exact mock-only/over-bound test pattern already logged from the Phase 8 live smoke.

**Recommendation (planner-actionable).**

- Change `refund-order.service.ts:114` to `await this.orderRepo.update(order, tx)` — it is already inside `this.db.withTenant(async (tx) => …)` at line 60, so pass that `tx` and get the outbox append in the same transaction as the payment row update.
- Change `cancel-order.service.ts:55` to `update()`; wrap the whole `execute` in one `db.withTenant` so cancel + refund + outbox commit atomically.
- Add a DB-level e2e assertion: after `POST /v1/orders/:id/refund`, `SELECT status FROM orders` = `refunded` (full) / `paid` (partial), and an `outbox_events` row with `type='ordering.order_refunded.v1'` exists. Make this a Wave-1 gate — everything else in the phase reads from it.

---

### BLOCK-2 — `EventSource` cannot carry the headers this API uses to resolve tenant, brand, and location

**Evidence.**

- `apps/api/src/shared/tenant-context.middleware.ts:12-15` — tenant/brand/location come from `x-tenant-id`, `x-brand-slug`, `x-location-id`. For the admin SPA there is **no host-based path**: `resolveByCustomerHost` (line 62) matches brand hosts, not `api.<domain>`.
- `apps/admin/src/lib/api-client.ts:44-52` is the only place those headers are set — via `fetch`.
- The WHATWG `EventSource` constructor accepts only `{ withCredentials }`. No headers.

**Consequence of a naive implementation.** `new EventSource(`${API}/v1/orders/stream`, {withCredentials:true})` → middleware resolves no tenant → `AuthGuard` (`auth.guard.ts:63`) sees `alsTenantId === undefined`, builds an operator principal from the session, and then `LocationScopeGuard` (`location-scope.guard.ts:39-45`) throws `location.context_required`, or `BrandScopeGuard` 404s. The feature does not fail subtly; it fails 100% and the fix touches security-critical middleware under time pressure.

**The three real options — pick one in CONTEXT:**

| Option                                                                                                             | Cost                                                                                                          | Risk                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) `fetch`-based SSE reader (`@microsoft/fetch-event-source` or ~80 LOC)                                          | keeps headers; **loses browser-native auto-reconnect**, so ORDINT-09's `retry:` semantics must be hand-rolled | new dep or new hand-rolled reconnect/backoff/`Last-Event-ID` code                                                                                                   |
| (b) Move the tuple into the URL: `GET /v1/brands/:brandSlug/orders/stream?location=<id>` + a route-scoped resolver | native `EventSource` works, `retry:` free                                                                     | requires touching `TenantContextMiddleware` or adding a parallel resolution path — **requires a security pass**; brand slug in access logs (acceptable, not secret) |
| (c) No SSE — poll                                                                                                  | zero new transport surface                                                                                    | 3-5s latency instead of ~500ms                                                                                                                                      |

**Recommendation.** (c) as the shipped mechanism, (b) as the later enhancement if the founder still wants it. If SSE is non-negotiable, take (b) and budget a `/gsd-secure-phase` pass on the resolution change — do **not** take (a) casually, because hand-rolled reconnect is precisely what ORDINT-09 is asking the browser to do for you.

---

### BLOCK-3 — a long-lived stream turns every per-request authorization into a connect-time check with unbounded validity

Every authz decision in this codebase is per-request:

- `auth.guard.ts:82` resolves the BA session on each call; `:66-75` re-checks `tenant.archived`.
- `location-scope.guard.ts:67-82` compares `req.activeLocationId` (session pin) against the ALS location, then checks `member_location_scope`.
- `BrandScopeGuard` reconciles the session brand pin (08.2 D-10).

**Named breakages if implemented naively:**

1. Owner revokes a member's `member_location_scope` row, or archives the location → the member's open stream keeps receiving that location's orders indefinitely.
2. `SetActiveBrandService` re-pins a non-owner to brand B → their stream opened against brand A keeps flowing.
3. Session revoked (`revoke-user-sessions`), password reset, member removed → stream survives.
4. Tenant suspended/archived → `AuthGuard`'s archived-tenant 403 never re-runs for that connection.
5. `runInTenantContext` binds ALS around `next()` only (`tenant-context.middleware.ts:51-54`). Any `requireTenantContext()` / `getTenantContext()` called later from the fan-out callback either throws or — if the callback is shared across connections — reads _another request's_ frame. This is the cross-tenant-leak footgun.

**RLS gives you zero protection here.** `orders_location_iso` (`packages/db/migrations/0071_orders_location_rls.sql:19-22`) and `orders_brand_iso` (`0060_brand_rls_restrictive.sql`) are both pass-through when the GUC is NULL, and `TenantAwareDb.withTenantId` (`packages/db/src/client.ts:298-316`) — the mandatory API for non-HTTP paths per ADR-0020 I-6 — **never binds brand or location at all**. A NATS-driven fan-out running under `withTenantId` sees every brand and every location of the tenant.

**Required enforcement mechanism (must be in the plan, not left to the implementer):**

- Capture `(tenantId, brandId, locationId|null, userId, sessionToken)` into a **plain frozen object** at connect time. Never call `getTenantContext()` inside the fan-out callback.
- Match predicate at fan-out is exact `===` on all three scope fields. **`brandId === undefined` must never mean "all brands."** Owner "all locations" mode must be an explicit `locationIds: string[]` allowlist resolved at connect time, not a null-means-everything sentinel.
- Hard max connection lifetime (suggest 10 min) → server closes with `retry:` → client reconnects through the full guard chain. This bounds every revocation scenario above to a 10-minute window; document that as the SLA.
- Phase gate: a **cross-tenant + cross-location SSE isolation e2e** in the style of `apps/api/test/e2e/location-isolation.e2e.spec.ts`. Phase 08.4 made its isolation spec the gate; do the same here. Order-feed cross-tenant leakage is the single worst bug this product can ship.

---

## HIGH

### HIGH-1 — In-process fan-out from ONE durable consumer is the only viable NATS shape; NATS-per-connection is structurally wrong here

`NatsJetStreamSubscriber.subscribe()` calls `jsm.consumers.add(stream, {durable_name, deliver_policy: All})` (`packages/events/src/infrastructure/nats-subscriber.ts:157`, `:84-86`). A consumer per SSE connection would create a **durable** per connection (server-side state leak) and replay the entire stream from the beginning on every connect. There is no ephemeral-consumer code path.

Precedent exists and should be copied: `apps/api/src/contexts/audit/infrastructure/nats-audit-subscriber.ts:25-26` already runs durable `audit-recorder-ordering` on `ordering.>`, and `nats-guest-notification.subscriber.ts` shows the bootstrap/shutdown shape.

**Two traps specific to this codebase:**

- **Do NOT use `runDeduped` on the SSE consumer.** `runDeduped` is at-most-once keyed by `(envelope.id, consumer)`; the feed is a projection where duplicates are harmless and the client dedups via `Last-Event-ID`. Using it adds a DB write per event and a failure mode where a crashed fan-out permanently swallows an event.
- **Use a distinct `durableName`** (e.g. `sse-order-feed`). Sharing `audit-recorder-ordering` would split delivery between the two consumers.

**Recommendation.** One `EVENT_SUBSCRIBER.subscribe({subject:'ordering.>', durableName:'sse-order-feed', maxInFlight: 50})` at `onApplicationBootstrap`, feeding a process-local registry. Exactly one DB read **per event** (not per subscriber) for enrichment. Never hold a transaction open across a stream's lifetime — the pool is `max: 10` (`packages/db/src/client.ts:179`).

### HIGH-2 — Postgres `LISTEN/NOTIFY` deserves an explicit rejection, not silence

Given single VPS + Docker Compose + solo founder, LISTEN/NOTIFY removes: (a) NATS from the critical latency path (outbox tick is 250 ms — `packages/events/src/outbox/dispatcher.ts:6` — plus JetStream publish + consume), and (b) the `NATS_DISABLED` blind spot below. It costs one dedicated connection and gives no replay.

**But** the deciding factor is HIGH-4: if you want the feed to survive a container restart without losing orders, the right primitive is neither NATS nor NOTIFY — it's a **Postgres watermark replay** (`Last-Event-ID` = `orders.updated_at`/id, on reconnect `SELECT … WHERE updated_at > watermark`). That is ~30 LOC, works with polling _and_ SSE, and makes the broker an optimization rather than a correctness dependency.

**Recommendation.** Record in CONTEXT: NATS in-process fan-out chosen for MVP because the subscriber infrastructure already exists; correctness is guaranteed by the Postgres watermark replay on (re)connect, not by broker delivery. LISTEN/NOTIFY rejected as a third mechanism for one feature.

### HIGH-3 — `NATS_DISABLED` / broker-down silently kills the feed and readiness does not notice

`apps/api/src/infrastructure/nats.module.ts:113` returns a `null` subscriber when `NATS_DISABLED=true` **or** when the boot connection fails (`:124-130`, soft-fail by design). Existing subscribers then log a WARN and disable themselves (`nats-guest-notification.subscriber.ts:48-51`). `/readyz` checks `EVENT_PUBLISHER` only (`apps/api/src/health/health.controller.ts:84-93`) — the subscriber is never probed.

**Consequence.** A NATS hiccup at boot yields a running, "ready", green API where **paid orders never appear in the restaurant's feed**. That is a silent revenue-destroying failure, and the operator's only signal is "quiet Friday."

**Recommendation.** Either (a) make a null `EVENT_SUBSCRIBER` a `/readyz` failure once the SSE consumer exists, or (b) adopt the watermark-replay design (HIGH-2) so the feed degrades to polling instead of dying. (b) is strictly better and cheaper.

### HIGH-4 — ORDINT-09's `retry:` does not deliver what the criterion implies, and the shutdown hook choice is wrong by default

**What actually happens on SIGTERM.** `app.enableShutdownHooks()` (`apps/api/src/main.ts:116`) → Nest `close()` runs in this order: `onModuleDestroy` → `beforeApplicationShutdown` → **`httpAdapter.close()`** → `onApplicationShutdown`. `fastify.close()` stops accepting connections and **waits for open ones**. An SSE response never ends. So a naive implementation hangs `app.close()` until Docker's stop grace period expires and the container is SIGKILLed.

**Cascade:** `NatsShutdownHook.onApplicationShutdown` (`nats.module.ts:54`) runs _after_ `dispose()` and therefore never runs — NATS is never drained. `OutboxDispatcherService.onModuleDestroy` (`outbox-dispatcher.service.ts:80`) does run first (good: `dispatcher.stop()` + `pg_advisory_unlock`), but any in-flight order mutation gets SIGKILLed mid-transaction.

**Also note:** `apps/api/src/bootstrap-telemetry.ts:66` installs a second, independent `process.on('SIGTERM')` that calls `sdk.shutdown()` without coordinating with Nest's handler. Survivable, but it means the OTel exporter can go down while the drain is still emitting spans — you will lose the traces of the exact shutdown you are debugging.

**"Rolling deploy" is not available in the target topology.** Single VPS + `docker compose up -d` = container recreate = a hard downtime window. So ORDINT-09's honest guarantee is _"clients reconnect cleanly after a restart and lose no orders,"_ not _"zero-downtime rollout."_

**Recommendation (concrete):**

1. Maintain a `Set<{res, scope}>` registry of open streams.
2. Terminate them in **`beforeApplicationShutdown`** (NOT `onApplicationShutdown`): write `retry: <2000-5000>ms` + a terminal `event: shutdown` frame with the current watermark, `res.end()`, then `socket.destroy()` after ~1 s grace, then return.
3. Client reconnect **must be jittered** (`retry` + `random(0, 3000)`); otherwise N tablets reconnect inside the same 100 ms window and hit the rate limiter (see HIGH-5).
4. Set an explicit `stop_grace_period` in the prod compose file and assert the drain completes inside it.
5. Reconnect carries `Last-Event-ID` = watermark; the server replays changed orders from Postgres. This is what actually satisfies "no order missed during a deploy" — `retry:` alone does not.

### HIGH-5 — The global rate limiter will fight the reconnect storm

`registerSecurity` installs a **single per-IP counter shared across all routes** with `RATE_LIMIT_PUBLIC_PER_MIN` default 60 (`apps/api/src/shared/security.ts:151-166`; `apps/api/src/config/env.schema.ts:182`), applied via a global `RateLimitGuard` (`security.ts:243`). Behind Cloudflare with `TRUST_PROXY`, every operator on one restaurant's NAT shares one bucket, and the SPA's normal TanStack Query traffic shares it with the stream connects.

**Consequence.** After a restart, N reconnects + the SPA's refetch burst can exceed 60/min and 429 the feed shut — precisely when the operator most needs it. Note the existing known gotcha in this repo: the api test suite already produces false 429s under bursty load.

**Recommendation.** Give the stream route its own key/bucket via `keyGenerator`, or exempt it in `allowList` (the Stripe webhook already sets this precedent at `security.ts:169-170`) and rely on a server-side max-connections-per-session cap instead. Decide it in the plan; do not leave the stream on the shared bucket.

### HIGH-6 — Cloudflare will buffer and/or 524 an SSE stream unless explicitly configured

If `api.<domain>` is orange-clouded (the 07.5 target: "Cloudflare in front (DNS / TLS / CDN)"), SSE crosses the CF proxy. Two documented failure modes: a 100-second origin-idle timeout producing 524, and buffering of `text/event-stream` responses in some configurations until a size threshold accumulates.

**Recommendation (all four, non-optional):**

- Heartbeat comment frame (`:ping\n\n`) every ≤ 20 s — this alone defeats the 524.
- `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no` on the stream response.
- Verify no `Content-Encoding` is applied. `@fastify/compress` is **not** registered today (`shared/security.ts` registers helmet, cors, rate-limit only) — record that as a load-bearing invariant so a future "let's gzip the API" PR doesn't silently break the feed.
- A staging smoke through the real CF proxy before calling ORDINT-02 done. A localhost-only SSE test proves nothing about this class of failure.

### HIGH-7 — `Order` has no `reject`, and widening `cancel()` without fixing the refund predicate is a money bug

**Current state.** `apps/api/src/contexts/ordering/domain/order.aggregate.ts:307-319` — `cancel()` accepts only `created|paid`. There is no `reject`. `accept()` (`:243`) requires `paid`.

**ORDINT-03 needs a reject.** Do not overload `cancel()`: reject vs. cancel differ in initiator, in reporting, and in guest messaging — `nats-guest-notification.subscriber.ts:136-140` branches on `OrderStatusChangedV1.newStatus`.

**ORDINT-05 needs cancel from `accepted|preparing|ready`.** Operationally mandatory (item ran out mid-prep, kitchen dropped it).

**The invariant this risks — name it explicitly.** `CancelOrderService` decides whether to refund with `const wasPaid = snap.status === 'paid'` (`cancel-order.service.ts:33`). Widen `cancel()` to accept `accepted|preparing|ready` **without** changing that line and cancelling an accepted order silently does **not** refund the guest. The predicate must become _"a succeeded payment row exists with `refundedAmount < amount`"_ — read from `PaymentRepository`, not from the order's status.

**Recommendation.**

- Add a `rejected` status. That requires moving three things together or you get an unmapped 500: the `orders_status_chk` CHECK constraint (`packages/db/src/schema/ordering.ts:66-69`) via migration, the `ALLOWED_STATUSES` set (`order-drizzle.repository.ts:25-36`), and `OrderStatus` (`order.aggregate.ts:8-18`). `parseStatus` (`:38-41`) throws a bare `Error` that `mapOrderError` does not map → 500 on read.
- Widen `cancel()` to `created|paid|accepted|preparing|ready`; keep it closed for `completed|refunded|canceled|failed|rejected`.
- Rewrite the refund predicate in `CancelOrderService` as above, with a unit test for "cancel an `accepted` paid order → refund issued."

### HIGH-8 — RBAC has no `order:cancel` / `order:refund`, and `staff` has no order permission at all

- `packages/domain/src/rbac/permissions.ts:3` — `order: ['read', 'update-status']`. There is no `cancel` and no `refund` action.
- `packages/domain/src/rbac/system-roles.ts:29-34` — `staff` has **no** `order` key at all. A base-role `staff` operator gets 403 on the whole feed.
- `apps/api/src/contexts/identity/application/preset-roles.ts` — the three seeded custom roles (`manager`, `cashier-foh`, `kitchen`) each carry `order: ['read','update-status']`. Good.
- `apps/api/src/contexts/payments/interfaces/http/refunds.controller.ts:21` gates refund on `@Permissions({ billing: ['update'] })` — held only by `owner` (`system-roles.ts:10`).

**Consequence.** As things stand, ORDINT-03 (reject → auto-refund) and ORDINT-05 (cancel → auto-refund) are **owner-only**. A cashier cannot reject an order. That is probably not the product intent and it is definitely not stated anywhere.

**Recommendation.** Extend `PERMISSIONS_STATEMENT` to `order: ['read','update-status','cancel','refund']`; grant `cancel` to `manager` + `cashier-foh`, keep `refund` owner-only (money out the door stays with the owner). Per `packages/domain/CLAUDE.md`, any addition to `admin` requires a regression test pinning what `admin` must NOT receive — write it.

### HIGH-9 — `LocationPermissionChecker` is still not wired, and Phase 10 is the first phase where that is load-bearing

`apps/api/src/contexts/identity/identity-core.module.ts:344` binds `PERMISSION_CHECKER` to `BetterAuthPermissionChecker`. `apps/api/src/contexts/identity/application/location-permission-checker.ts` exists, is unit-tested, and is unused — known gap (b) in `STATE.md:299`.

**Why it bites now.** Per-location roles assigned via `AssignLocationRoleService` are stored in `member_location_scope.role` (08.4-07 decision), which `PermissionsGuard` never reads. So a member set to `kitchen` at location A actually gets whatever their **tenant-wide BA member role** grants. Two bad outcomes, both live in Phase 10: BA role `admin` → over-privileged (full `order:update-status` everywhere, plus menu CRUD); BA role `staff` → **no `order` permissions at all** → the feed 403s for exactly the people who need it.

**Recommendation.** Phase 10 must either (a) wire `LocationPermissionChecker` — which needs `PermissionsGuard` to thread `req.activeLocationId` into `hasPermission`'s 4th param (`location-permission-checker.ts:28`), a small change with a large blast radius that deserves its own plan + isolation e2e — or (b) explicitly re-defer with the consequence written down: _"per-location roles do not govern order permissions in MVP-1; the tenant-wide base role does."_ Silence is the one unacceptable outcome.

### HIGH-10 — `ordering.*` event payloads lack the fields the feed needs to route and render

- `packages/events/src/contracts/ordering.ts:5-14` — `OrderCreatedV1Payload` has `brandId` but **no `locationId`**. Location has been the access-control grain since 08.4.
- `:61-67` — `OrderStatusChangedV1Payload` has **neither `brandId` nor `locationId`**.
- `apps/api/src/contexts/ordering/infrastructure/order-drizzle.repository.ts:275-277` — `OrderPaidV1` is emitted with hardcoded `total: 0, currency: 'USD'`.
- `:293` — `OrderRefundedV1` is emitted with hardcoded `currency: 'USD'`.

**Consequence.** The fan-out cannot decide who may see an event without a DB lookup per event (acceptable, but then say so), and any UI rendered from the payload shows €0.00 for every paid order.

**Recommendation.** Add `brandId` and `locationId` as `.optional()` fields on the existing v1 payloads (additive, no v2 bump needed, no consumer breaks) and populate them in `domainEventToEnvelope` (`order-drizzle.repository.ts:252-310`). Fix the hardcoded `total`/`currency` in the same commit — they are currently lying to the audit log too.

---

## MED

### MED-1 — Owner "all locations" mode will 403 the operator order routes unless every one is `@LocationNeutral`

`apps/admin/src/lib/api-client.ts:48-50` omits `x-location-id` when the effective location is `'all'`. `LocationScopeGuard` (`location-scope.guard.ts:39-45`) then throws `location.context_required` on any route not marked `@LocationNeutral()` or `@BrandNeutral()`. This is the exact bug class Phase 08.5 spent a plan fixing for the stop-list.

Notably: **`RefundsController` carries neither decorator today** (`apps/api/src/contexts/payments/interfaces/http/refunds.controller.ts` — only `@Permissions` + `@RequireActiveTenant`), unlike `CheckoutController` and `OrdersController`, which are both `@BrandNeutral()`. Verify whether refund is reachable at all for an owner in `?location=all` mode before Phase 10 builds a refund button on top of it.

**Recommendation.** For every new operator route in Phase 10, decide up front and write it in the plan: `@LocationNeutral()` + explicit location filter in the query (supports all-mode), or location-enforced (staff path). Default to `@LocationNeutral()` + explicit filter for reads, location-enforced for mutations, and resolve the mutation's location **from the order row**, not from the header.

### MED-2 — `HttpMetricsInterceptor` will count every SSE message as an HTTP request

`apps/api/src/shared/http-metrics.interceptor.ts:58-71` increments `http.server.requests` on the observable's `next`. If Phase 10 uses Nest's `@Sse()` (which returns an `Observable<MessageEvent>`), the counter fires **once per emitted event**, per connection — poisoning request-rate dashboards and inflating the per-tenant series (the interceptor already carries a documented cardinality caveat at ~50 tenants). Same issue for `ProblemDetailsFilter`: an error thrown after headers are flushed will attempt `res.status().send()` on a streaming reply → "headers already sent."

**Recommendation.** Exclude the stream route from `HttpMetricsInterceptor` (a route check, ~3 LOC) and add a `headersSent` short-circuit in `ProblemDetailsFilter`. Or avoid Nest's `@Sse()` and write the raw Fastify reply directly, which also gives you the `res.raw.socket` handle that HIGH-4 needs.

### MED-3 — No index supports the feed query; no `channel` column exists for ORDINT-08

`packages/db/src/schema/ordering.ts:64-65` — the only indexes on `orders` are `unique(tenant_id, idempotency_key)` and the composite-FK helper `(id, tenant_id)`. The feed's access pattern is `WHERE tenant_id=? AND location_id=? AND status IN (…) ORDER BY created_at DESC`.

Separately: **ORDINT-08's "channel (qr-menu vs site)" has no data source.** `orders` stores `fulfillment_mode` (`dine_in|pickup|delivery`) — that is not channel, and `CreateOrderInputDto` carries no channel field.

**Recommendation.** Add `CREATE INDEX orders_feed_idx ON orders (tenant_id, location_id, status, created_at DESC)` in the same migration as the status-CHECK change from HIGH-7. And decide in CONTEXT: either add `channel text NOT NULL DEFAULT 'web'` + thread it from qr-menu and website, or rewrite ORDINT-08 to filter by `fulfillment_mode` and drop the word "channel."

### MED-4 — ORDINT-06 "partial refund (specific items)" has no item-level model; scope it down

- `RefundInputDto` takes `amountMinor` + `reason` only (`refunds.controller.ts:26`).
- `order.aggregate.ts:334-335` — partial refund correctly leaves status `paid`, but the aggregate holds no refunded-to-date; `alreadyRefundedMinor` is passed in from the payments row each time. The order-detail view cannot render "€12 of €40 refunded" without joining `payments`/`refunds`.
- `order-drizzle.repository.ts:220` sets `categoryId: ''` on reload — item provenance is partially lost the moment the order is re-read.

**Recommendation.** Scope ORDINT-06 to: _operator selects items in the UI, the UI computes `amountMinor`, the API contract stays `{amountMinor, reason}`_. Optionally persist the selected `order_item_id[]` on the refund row for later reporting. Building a genuine item-level refund aggregate is a week you don't have and no customer has asked for.

### MED-5 — No status-transition timestamps, no persisted cancel reason

`OrderStatusChangedV1` goes to the outbox and `record-audit.service.ts:32-36` records it, but there is no queryable per-order timeline and no `accepted_at` / `ready_at` columns. ORDINT-01's "new orders visually flagged" needs _something_ to define "new," and any time-to-accept metric needs `accepted_at`. Likewise the cancel reason exists only inside the `OrderCanceledV1` payload (`order.aggregate.ts:312-318`) — ORDINT-05 mandates a reason, and the operator will expect to see it on the order tomorrow.

**Recommendation.** One migration, four nullable columns: `accepted_at`, `ready_at`, `cancel_reason text`, `canceled_by uuid`. Trivial now, a backfill archaeology project in a year.

### MED-6 — SSE observability: you cannot currently distinguish "feed is broken" from "quiet Friday"

No metric exists for the failure mode that will actually happen. Add, alongside the existing OTel meters:

- `sse.connections` — up-down counter, labeled `tenant.id` (matches the existing `tenant.id` labeling convention in `outbox-dispatcher.service.ts` and `http-metrics.interceptor.ts`).
- `sse.lag_ms` — histogram, `envelope.occurredAt` → socket write. **This is the load-bearing one.** Without it a silently-dead subscriber looks identical to a slow night.
- `sse.events_dropped` — counter for slow-consumer backpressure.
- A structured WARN on every connection close with `{reason, durationMs, eventsSent}`.

### MED-7 — OpenAPI drift check is a CI gate; an SSE route has no clean OpenAPI shape

`pnpm openapi:check` (`package.json:21`, `tools/openapi-check.ts`) gates CI against the committed `docs/api/openapi.yaml`. A `text/event-stream` route cannot be meaningfully expressed. Decide in the plan: `@ApiExcludeEndpoint()` (recommended, with a comment pointing at this review), or regenerate the spec with a documented `text/event-stream` response. Either way, do it in the same commit that adds the route so CI doesn't go red on an unrelated PR.

---

## LOW

- **LOW-1 — Two independent SIGTERM handlers.** `bootstrap-telemetry.ts:66` calls `sdk.shutdown()` on SIGTERM independently of Nest's `enableShutdownHooks()`. Not a defect today; note it if HIGH-4's drain work touches shutdown, because the exporter can die mid-drain and you lose the traces for the shutdown you're debugging.
- **LOW-2 — `GET /v1/orders/:id/status` is an unauthenticated capability URL.** `orders.controller.ts:52-67` is `@Public()` and returns `status/total/currency/orderNumber` for any order UUID within the resolved tenant. UUIDv4 makes this acceptable, and the website confirmation page already depends on it (`apps/website/lib/checkout-api.ts:133`). Record the decision explicitly and add a hard rule: **never add customer PII (name/phone/email/address) to this response**, no matter how convenient it looks for ORDINT-07.
- **LOW-3 — ORDINT-10 is ~80% shipped.** The endpoint and the website call site both exist. What is missing is client-side polling with a sane interval. **Do not add a guest-facing SSE stream** — guest connection counts are two orders of magnitude above operator counts, and the guest surface is CDN-fronted. Poll every 10-15 s with `Cache-Control: no-store`; stop polling on a terminal status.
- **LOW-4 — Buy nothing.** Pusher/Ably would remove the Cloudflare-buffering and shutdown problems for $0-49/mo, but they add a third party to the operational-visibility path and a per-connection cost curve, for a feature whose total connection count is (tenants × ~2 tablets). Not worth it below ~50 tenants. Revisit if SSE consumes more than one plan's worth of effort — at that point the buy is cheaper than the build.

---

## Scope recommendation for the planner

**Wave 1 (correctness — do not build UI on a broken base):** BLOCK-1 (`save()`→`update()` + DB-level e2e), HIGH-7 (reject status + widened cancel + refund predicate fix), HIGH-10 (event payload fields + hardcoded total/currency), MED-3 (feed index + channel decision), MED-5 (timestamp/reason columns). One migration covers HIGH-7 + MED-3 + MED-5.

**Wave 2 (the actual product):** ORDINT-01/03/04/05/07/08 over plain HTTP + TanStack Query polling at 3-5 s. Plus HIGH-8 (RBAC actions), HIGH-9 (wire-or-defer decision, written down), MED-1 (`@LocationNeutral` audit of every new route), MED-4 (narrowed partial refund).

**Wave 3 (isolatable, abandonable):** ORDINT-02 + ORDINT-09. Gated on BLOCK-2's transport decision and BLOCK-3's enforcement design. Ship behind an env flag so polling remains the fallback with a one-line rollback. Phase gate = the cross-tenant/cross-location SSE isolation e2e + a staging smoke through the real Cloudflare proxy.

If Wave 3 slips, Phase 10 still closes and the operator still sees paid orders. That is the whole point of sequencing it this way.

---

## What I did NOT review

- `apps/admin` UI/UX design for the feed (component structure, sound alerts, visual "new order" affordance) — product-strategist / UI-phase territory.
- The `apps/website` and `apps/qr-menu` guest surfaces beyond confirming `/v1/orders/:id/status` is already wired (`apps/website/lib/checkout-api.ts:133`).
- Stripe refund semantics beyond the RestOS call sites — I did not verify Stripe's partial-refund idempotency behaviour against `refundRequestId` (`refund-order.service.ts:73`).
- Whether `api.<domain>` is actually orange-clouded in the intended production DNS setup. HIGH-6 assumes it is, per the 07.5 CONTEXT note ("Cloudflare in front"). If the api hostname is grey-clouded, HIGH-6 drops to LOW.
- Nest `@Sse()` runtime behaviour under `FastifyAdapter` at the pinned versions (Nest 10.4.15 / platform-fastify) — I reasoned from the interceptor/filter code paths, not from an executed test.
- Load testing of any kind. No numbers here are measured; the connection-ceiling reasoning is from the `max: 10` pool config and Node socket behaviour, not from a benchmark.
- The open test debt listed in `STATE.md:289/292/293` (set-active-brand, brand-isolation, catalog-reads e2e fixtures) — pre-existing, but it will make Phase 10's e2e suite noisier than it should be.

Sources for the Cloudflare claims in HIGH-6: [Cloudflare Community — SSE and 524 timeouts](https://community.cloudflare.com/t/are-server-sent-events-sse-supported-or-will-they-trigger-http-524-timeouts/499621), [Cloudflare Community — SSE buffering](https://community.cloudflare.com/t/server-sent-events-buffering/179526), [cloudflared issue #199 — SSE are buffered](https://github.com/cloudflare/cloudflared/issues/199).
