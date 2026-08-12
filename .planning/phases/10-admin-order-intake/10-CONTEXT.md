# Phase 10: Admin Order Intake - Context

**Gathered:** 2026-08-11
**Status:** Ready for planning
**Persona review:** DONE at discuss — `persona-cto`, `persona-skeptic`, `persona-product-strategist`, `persona-growth-marketer`. See `10-PERSONA-REVIEWS.md` (aggregate + disposition) and the four full reports. **14 BLOCK findings across the four reports; every one is either resolved by a decision below, deferred with the founder's explicit acceptance, or listed as a planner-must-dispose item in the aggregate. Planner MUST read the aggregate.**

> **HARD PRE-REQUISITE — Phase 10 planning assumes this is already merged.**
> A live production bug (verified, not persona speculation): `CancelOrderService` and `RefundOrderService` call `orderRepo.save()`, which is INSERT-only (`ON CONFLICT DO NOTHING` + early return at `order-drizzle.repository.ts:78`). For an order that already exists this is a total no-op — `orders.status` never flips to `canceled`/`refunded`, and `order.pullEvents()` has already drained the domain events at line 48, so `ordering.order_canceled.v1` / `ordering.order_refunded.v1` are silently discarded. Money moves in Stripe; RestOS still reads `paid`.
> **Founder decision (2026-08-11): fix as a separate quick task BEFORE Phase 10 is planned.** Scope: swap `save()` → `update()` at `cancel-order.service.ts:55` and `refund-order.service.ts:114`, plus a regression test that reads the row back from the database (not a mocked repo — that is exactly how this survived). If Phase 10 planning starts and this is not merged, treat it as plan 10-01 instead.

<domain>
## Phase Boundary

Give operators a working **order-intake surface in the admin SPA** so a restaurant can run a service on RestOS end-to-end: see paid orders arrive, accept or reject them, move them through the kitchen, cancel and refund when reality intervenes — and let the guest watch it happen on their phone. This is the phase that closes MVP-1: after it, "guest pays → restaurant fulfills" is true inside RestOS alone, with no Staff app and no POS.

**This phase delivers:**

1. **Orders page in admin** — a dedicated `/{brandSlug}/orders` route with a live-ish list, order detail, and the full status workflow (`paid → accepted → preparing → ready → completed`), plus reject and cancel.
2. **5-second polling feed** with an audible + tab-title alert on new orders. **Not SSE** — see D-13.
3. **Order state machine extension** — a reject path, cancel allowed at every stage up to `completed`, and refund no longer restricted to a just-paid order.
4. **Order data model extension (one migration)** — short daily order number, channel, per-state timestamps, cancel reason + actor, operator-set ETA, guest marketing consent.
5. **Permission split** — reject/cancel (with automatic full refund) becomes an order-status permission available to everyone who works with orders; discretionary arbitrary-amount refund stays owner-only `billing:update`.
6. **Guest live status** — the existing `GET /v1/orders/:id/status` endpoint plus the existing website poller are wired so the guest actually sees `accepted → preparing → ready` and the promised time.

**Explicitly OUT of scope (deferred, each with a home):**

- **Server-Sent Events + graceful SSE shutdown** (ORDINT-02, ORDINT-09) → their own later phase. Founder decision D-13.
- **"We're closed" / pause ordering / location opening hours** → its own phase. Founder accepted the stated risk (a tenant can take paid orders at 04:00 until that phase ships).
- **Kitchen ticket / receipt printing** → deferred with the future kitchen-display work.
- **Item-level partial refund** (ORDINT-06 as literally worded) → shipped as arbitrary-amount refund instead (D-10).
- **Full-screen kiosk/kitchen mode** → founder chose a page inside the admin shell (D-01); revisit post-first-customer.
- **Guest note / allergy field** → needs a website checkout-form change; deferred.
- **Manual / phone order entry** → not this phase, but do not shape the schema so it is hard to add.
- **Delivery lifecycle beyond "delivery" as a fulfillment mode** — Phase 9 (Delivery Zones) is in MVP-2, so there is no zone, no delivery fee, no address validation, no dispatch state. The feed MUST NOT render an "on its way" stage the backend cannot back (Skeptic HIGH-6).

</domain>

<decisions>
## Implementation Decisions

### Feed placement & scope

- **D-01 — Dedicated Orders page, not the landing screen, not a kiosk mode.** New route `/{brandSlug}/orders` with a sidebar entry carrying an unaccepted-order counter. It sits inside the existing admin shell (sidebar, brand/location switchers, theme). _Recorded disagreement:_ `persona-product-strategist` HIGH-4 and `persona-growth-marketer` HIGH-9 both argue the feed should own the landing screen and/or be a full-screen operational mode. Founder chose the page for MVP-1 delivery speed. Do not silently "improve" this; revisit after a real restaurant runs a service on it.
- **D-02 — The feed inherits the existing location filter; it does not invent its own.** Owner: `?location=all|<id>` per 08.5 D-01/D-12. In `all` mode the feed is **one merged list across the brand's active locations, each row labelled with its location** — and it is fully actionable (unlike the 08.5 stop-list, which is read-only in `all`). Staff: their server-pinned location only, per 08.4/08.5 D-15. Planner MUST audit `@BrandNeutral` / `@LocationNeutral` on every new and touched order route against the 08.4/08.5 model — `RefundsController` today has neither and 403s an owner in `all` mode (CTO MED-1, Skeptic MED-3).
- **D-03 — One list with filters on top; default filter = today.** Not a two-tab active/history split. Filters: status, date, channel. Completed / canceled / refunded orders live in the same list behind the filter. _Planner note:_ Product HIGH-8 / MED-16 warn that an active order gets lost among completed ones by end of service — mitigate with sort order and the time-in-state chip (D-14), not with a second tab.

### Order data model — ONE migration, before any real orders exist

- **D-04 — All of the following land in a single migration.** Every one of these is permanently unrecoverable if added after the first real orders (all four personas converged on this).
  - **Short daily order number** — human-callable, resets daily, per location. Today's `generateOrderNumber()` emits `20260810-A7K2M`, which cannot be shouted across a counter or read over the phone. Keep the existing key as the internal/idempotency identifier; the short number is what humans see. (Skeptic HIGH-5, Product HIGH-7, Growth MED-14)
  - **`channel`** — `site` \| `qr-menu`. ORDINT-08's channel filter has no data behind it today. _Be honest in the UI:_ `apps/qr-menu` has no order-submission path at all, so the column has exactly one value in production until QR ordering ships. The column is cheap now and impossible to backfill. (Growth BLOCK-3, CTO MED-3, Skeptic HIGH-4, Product MED-11)
  - **Per-state timestamps** — `accepted_at`, `preparing_at`, `ready_at`, `completed_at`. Today every transition overwrites `updated_at`, destroying accept latency, prep duration, and time-in-state. Without these there is no urgency chip (D-14) and Phase 13 analytics cannot be built retroactively. (Growth HIGH-5, Product HIGH-8, CTO MED-5)
  - **Cancel reason (from a fixed set) + `canceled_from_status` + actor.** Reason is not free text — "top cancel reason" must be buildable. `canceled_from_status` is what distinguishes reject-intent from cancel-intent without adding a second terminal status (D-09). (Growth HIGH-6, Product MED-12, CTO MED-5)
  - **Operator-set ETA** — see D-15.
  - **Guest marketing consent** — see D-17.
- **D-05 — Also fix the event payloads while adding fields.** `ordering.*` payloads lack `locationId` (the feed cannot route without a DB hit — Skeptic MED-4, CTO HIGH-10); `OrderPaidV1` is emitted with hardcoded `total: 0, currency: 'USD'` (CTO HIGH-10); `OrderStatusChangedV1` carries no actor (Growth HIGH-7 — reuse the 08.3 WeakMap actor-stash pattern). Guest PII stays out of event payloads, matching the existing `OrderCreatedV1Payload` minimisation (T-07-PII, Growth MED-12).

### Permissions

- **D-06 — Reject and cancel are order-status actions, not financial ones.** Everyone who works with orders (owner, admin, and the `manager` / `cashier-foh` / `kitchen` presets) can reject or cancel, and the automatic **full** refund is a system consequence of that transition — not a discretionary financial decision. Gate on an order permission (`order:update-status`, or a new `order:cancel`), not on `billing:update`.
  - Today `staff` has **no `order` permission at all** and `billing` is `owner`-only (`packages/domain/src/rbac/system-roles.ts:10`), so the only person who can refuse an order at 20:40 on a Friday is the owner. That is the bug being fixed.
  - **Discretionary refund of an arbitrary amount stays `billing:update` / owner-only.** Do not widen `billing`.
  - Planner MUST check this against the 08.3 `NON_DELEGATABLE` escalation model — `billing` is non-delegatable by design, and the fix must not defeat that (Skeptic BLOCK-4).
- **D-07 — `LocationPermissionChecker` decision cannot be dodged a third time.** 08.4 built and unit-tested it but never wired it (`PermissionsGuard` does not thread `activeLocationId`); 08.5 explicitly re-deferred it. Phase 10 is the first phase where a per-location role gates a **write** path on money. Planner: wire it, or record an explicit third re-defer with the reason. Do not leave it dangling silently. (CTO HIGH-9)

### Order lifecycle & money

- **D-08 — Cancel is allowed at every stage up to `completed`.** `accepted`, `preparing`, `ready` — all cancellable with a reason. Today `order.aggregate.ts:307` forbids it, which leaves the operator's only exit as faking `ready → completed` on food that will never exist. (Skeptic BLOCK-2, Product BLOCK-1, CTO HIGH-7)
- **D-09 — One terminal status `canceled`, two operator intents distinguished by `canceled_from_status`.** Do NOT add a `rejected` status. **Reject** = a card-face button on a not-yet-accepted order, one tap → reason chips → always full auto-refund. **Cancel** = deliberately harder to reach (inside the order detail, confirm dialog naming the amount) so it is not mis-tapped next to "Ready". The word "rejected" never reaches the guest.
- **D-10 — Cancel always issues a full refund. Partial/none is a separate owner action.** The cashier makes no financial judgement calls. If the restaurant wants to withhold part, the owner performs a separate refund operation. Partial refund itself ships as **arbitrary amount + reason** (the API that already exists at `refunds.controller.ts`), not as item checkboxes — ORDINT-06's literal "specific items" wording is scoped down (CTO MED-4, Skeptic MED-2, Product MED-13). `refund()` must stop requiring status to be exactly `paid` (`order.aggregate.ts:321`) and must stop collapsing fulfillment state into `refunded` on a partial.
  - **CTO HIGH-7 money bug — MUST fix with D-08:** `cancel-order.service.ts:33` derives `wasPaid = snap.status === 'paid'`. Once cancel is allowed from `accepted`/`preparing`/`ready`, that predicate reads false on a paid order and the refund is silently skipped. Derive from the captured payment amount, not from the order status.
- **D-11 — Refund failure never blocks the kitchen.** If Stripe cannot refund (outage, funds already paid out), the **order still cancels**; the refund is recorded as failed and surfaced as a red "refund did not go through" flag with a one-click retry, until someone resolves it. _Planner:_ the Stripe call currently sits **inside** the DB transaction (Skeptic MED-5) — restructure to persist the cancel, attempt the refund outside the tx, then record the outcome.
- **D-12 — An unaccepted order escalates loudly but the system never touches the guest's money on its own.** After a fixed threshold (hardcoded, no settings screen) the card turns red, shows "waiting 20 min", and the sound repeats. No auto-reject, no auto-refund. (Skeptic HIGH-7)

### Refresh & alerting

- **D-13 — 5-second polling now; SSE is its own later phase.** This is the phase's biggest scope lever and it is a founder decision, not a technical shortcut.
  - **Why not SSE now:** browser `EventSource` can only send cookies, while `TenantContextMiddleware` resolves tenant/brand/location from `x-tenant-id` / `x-brand-slug` / `x-location-id` headers that `apiFetch` adds per request (`apps/admin/src/lib/api-client.ts`). Making SSE work means either moving tenancy into forgeable query params or hand-rolling a fetch-based SSE client — both rework the access-control core that four consecutive phases (08.2–08.5) were spent building. On top of that: a long-lived stream converts every per-request authorization into an unbounded connect-time check (revoked location scope, brand re-pin, session revocation, tenant archival all stop being enforced), Cloudflare buffers/524s long connections, and `fastify.close()` waits forever on an open SSE socket unless shutdown runs in `beforeApplicationShutdown`. (CTO BLOCK-2/BLOCK-3/HIGH-4/HIGH-6, Skeptic BLOCK-3/HIGH-1/HIGH-2)
  - **Roadmap consequence:** ORDINT-02 and ORDINT-09 move out of Phase 10 into a new phase. They are not deleted. Success criteria 1 and 5 of Phase 10 need the corresponding ROADMAP edit.
  - **MUST FIX for polling to work at all:** rate limiting is one shared per-IP bucket of 60/min. A restaurant is a single NAT — 3-4 devices polling every 5s exhausts it before any other request. (Skeptic HIGH-3, CTO HIGH-5)
  - **Also required:** on reconnect/refocus the feed backfills missed orders rather than merely resuming (Product MED-18); the polling endpoint must not be counted as normal request traffic in metrics.
- **D-14 — Sound + tab-title counter on a new order.** Chime on arrival; the browser tab reads `(2) Заказы` so a backgrounded tab still signals. Mute toggle next to it (a chime during a quiet hour is worse than no chime). No browser push notifications — permission prompts and inconsistent tablet support. A silent, purely visual flag is how this feature fails in a real restaurant (Skeptic HIGH-8, Product HIGH-6, Growth HIGH-8). Pair with a time-in-state chip on each card so urgency is visible without reading timestamps.

### Guest-facing loop

- **D-15 — The operator sets the prep time when accepting.** "Accept" opens a quick choice (e.g. 15 / 25 / 40 min, or a custom value); that becomes the order's ETA, shown on the guest status page and passed into the guest email. Chosen over a per-location default because it reflects actual kitchen load. _Planner:_ `orders.controller.ts:64` currently maps `eta` from `scheduledFor` (the guest's requested schedule — `null` for every ASAP order), and `guest-email-templates.ts` accepts an `eta` variable that `send-guest-notification.service.ts:83-89` never passes. Both dead slots get wired to the new field. (Growth BLOCK-2, Product HIGH-10)
- **D-16 — The guest live-status page is IN SCOPE this phase.** Without it the entire phase is invisible to the guest and there is nothing to demo to a prospective restaurant. The endpoint (`orders.controller.ts:52`) and the poller (`apps/website/components/checkout/order-status-poller.tsx`) already exist; the core fix is that `TERMINAL_STATUSES` at line 10 includes `'paid'`, so polling stops the instant payment confirms and `accepted → preparing → ready` never render. Also: the page prints raw status enums — give the guest human wording, not `status.replace('_',' ')`. (Growth BLOCK-1, Product HIGH-9, Skeptic MED-1)
- **D-17 — Marketing consent checkbox at checkout, plus a consent column on the order.** One unchecked checkbox at checkout and a consent-timestamp column. Today there is zero consent capture repo-wide, so Phase 12 CRM would build a mailing list from `orders.customer_email` with no lawful basis under GDPR — and consent cannot be granted retroactively. (Growth BLOCK-4; PROJECT.md GDPR constraint)

### Claude's Discretion (research / planner)

- Exact shape of the short daily order number (per-location counter vs sequence) and how it coexists with the existing idempotency-keyed `orderNumber`.
- Whether the reject/cancel permission is a new `order:cancel` verb or a reuse of `order:update-status`, and how that reconciles with 08.3 `NON_DELEGATABLE` (D-06).
- Wire `LocationPermissionChecker` vs record a third explicit re-defer (D-07).
- Feed query shape, pagination, and the missing index (Skeptic HIGH-4 / CTO MED-3).
- How the polling endpoint avoids the per-IP rate limiter — per-principal bucket, route-specific limit, or a cheap delta endpoint (D-13).
- Concurrent-transition outcome when two devices press Accept on the same order (Product MED-17).
- Whether `GET /v1/orders/:id/status` stays `@Public()` as a capability URL given it returns `total` + `orderNumber` to anyone holding the UUID, and pinning its response contract before the tracker consumes more of it (Skeptic MED-7, Product LOW-20).
- The white-label leak in guest email: `send-guest-notification.service.ts:59` hardcodes `locale = 'ru'` and `:60` falls back to `brandName ?? 'RestOS'`. Fix the fallback at minimum (Growth HIGH-11, Product LOW-22).
- Adding a link back to the live status page from guest emails (Growth HIGH-10); pickup instructions / location contact in the guest surface (Growth MED-15); E.164 phone normalization at write time (Growth MED-13).
- Empty-state design for a brand with no orders yet — this is the tenant's activation moment (Product LOW-21).
- Recording "orders are inserted at `status='created'` before payment" as an explicit invariant so a future stale-order sweep does not silently break ANL-04's conversion denominator (Growth MED-18).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase source, persona reviews & prior context

- `.planning/phases/10-admin-order-intake/10-PERSONA-REVIEWS.md` — **aggregate + disposition of 14 BLOCK findings and the planner-must-dispose list. Read this first.**
- `.planning/phases/10-admin-order-intake/10-PERSONA-CTO.md` — transport architecture, shutdown, long-lived-stream authz, state machine, event payloads.
- `.planning/phases/10-admin-order-intake/10-PERSONA-SKEPTIC.md` — the live status bug, what is already shipped, the cut list, hidden assumptions, and the non-negotiable test-fidelity requirement.
- `.planning/phases/10-admin-order-intake/10-PERSONA-PRODUCT.md` — operator workflow, reject-vs-cancel UX, pause control, prioritization of ORDINT-01..10.
- `.planning/phases/10-admin-order-intake/10-PERSONA-GROWTH.md` — guest loop, analytics instrumentation to add now, consent, demo value.
- `.planning/ROADMAP.md` → `### Phase 10: Admin Order Intake` — goal, 5 success criteria, ORDINT-01..10, persona-reviewer requirement. **Criteria 1 and 5 need editing for the SSE deferral (D-13).**
- `.planning/REQUIREMENTS.md` lines 168-181 — ORDINT-01..10 verbatim; lines 497-506 — the phase mapping table.
- `.planning/phases/08.5-.../08.5-CONTEXT.md` — D-01/D-02/D-12 (owner `?location` URL filter), D-15 (staff login-pin), D-16 (aggregate off the edge cache), D-11 (`LocationPermissionChecker` re-defer).
- `.planning/phases/08.4-location-scoped-access/08.4-CONTEXT.md` — the location model orders are grained to; D-04 brand reachability, D-05 owner bypass.
- `.planning/STATE.md` → "Phase 08.4 COMPLETE" + "Blockers/Concerns" — open test debt (`set-active-brand.e2e`, `brand-isolation.e2e`, `catalog-reads.e2e`) that Phase 10's e2e work will sit next to.

### Project invariants

- `CLAUDE.md` → "Tenancy Enforcement Pattern", "Architectural Constraints", "Event Publishing Pattern" — ScopedTx + RLS double-enforcement, composite FK, no hard deletes, `buildEnvelope` for `correlationId`, existence-hiding 404.
- `apps/CLAUDE.md` → "Network calls", "Auth + tenancy at the web layer", "Comments (HARD)" — `AbortSignal.timeout` on every fetch, one retry only on idempotent GET 5xx, a "Try again" affordance in every error UI.
- `packages/domain/src/rbac/system-roles.ts` + the 08.3 `NON_DELEGATABLE` model — the permission surface D-06 modifies.

### Code being changed

- `apps/api/src/contexts/ordering/domain/order.aggregate.ts` — the state machine (`cancel()` at `:307`, `refund()` at `:321`, no reject path).
- `apps/api/src/contexts/ordering/infrastructure/order-drizzle.repository.ts` — `save()` (INSERT-only, `:47-78`) vs `update()`; the pre-requisite bug.
- `apps/api/src/contexts/payments/application/cancel-order.service.ts` (`:33` `wasPaid`, `:55` `save`) + `refund-order.service.ts` (`:114` `save`).
- `apps/api/src/contexts/payments/interfaces/http/refunds.controller.ts` — `billing:['update']` gate; missing `@BrandNeutral`/`@LocationNeutral`.
- `apps/api/src/contexts/ordering/interfaces/http/orders.controller.ts` — `GET /v1/orders/:id/status` (`:52-67`), `eta` mis-mapping (`:64`).
- `packages/db/src/schema/ordering.ts` (`:18-46`) — the orders table the migration extends.
- `packages/events/src/contracts/ordering.ts` — event payloads to extend (D-05).
- `apps/api/src/contexts/notifications/` — `send-guest-notification.service.ts` (hardcoded locale, unpassed `eta`), `guest-email-templates.ts`, `nats-guest-notification.subscriber.ts` (the existing NATS subscriber pattern).
- `apps/website/components/checkout/order-status-poller.tsx` (`:10`) — the guest tracker.
- `apps/admin/src/routes/(protected)/$brandSlug/` + `apps/admin/src/lib/api-client.ts` + `use-effective-location.ts` — where the Orders page and its location filter plug in.

### iiko alignment (entity shapes — for MVP-3 partner integration)

- `https://ru.iiko.help/articles/#!api-documentations/elementy-nomenklatury` — when naming order statuses, cancel reasons, and channel values, borrow iiko's shapes where sensible; it eases the MVP-3 adapter.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets (extend, don't rebuild)

- **The status transitions already exist** — `accept()`, `startPreparing()`, `markReady()`, `complete()` on `Order` (`order.aggregate.ts:243-305`), each already emitting `OrderStatusChanged`. Extend, don't rewrite.
- **Refund service + endpoint already exist and already accept an arbitrary `amountMinor`** (`refund-order.service.ts`, `refunds.controller.ts`) — D-10 needs a UI and a status-guard fix, not a new service.
- **The public order-status endpoint already exists** (`orders.controller.ts:52`) — ORDINT-10 is ~90% shipped.
- **The guest poller already exists** with backoff and terminal handling (`order-status-poller.tsx`) — the fix is one Set plus human wording.
- **Guest email templates + NATS subscriber already fire on order events** (`nats-guest-notification.subscriber.ts:136-140`) — the ETA slot is already in the templates, just never passed.
- **`ordering.*` event contracts + outbox + inbox dedup** (`packages/events/`) — the feed's future SSE phase rides these; polling does not need them, but the added payload fields (D-05) do.
- **Admin SPA shell** — TanStack Router + Query, shadcn/ui, dark mode, brand + location switchers, `apiFetch` with header echo. The Orders page is a new route in an existing, working shell.
- **`useEffectiveLocation`** (08.5) — the single per-role location authority every query call site uses. The feed uses it, it does not invent a parallel one.

### Established Patterns

- ScopedTx + RLS double-enforcement on every tenant-scoped query; `orders` already carries `location_id NOT NULL` with a RESTRICTIVE `orders_location_iso` policy and composite FKs (08.4-08).
- Existence-hiding 404 for out-of-scope reads (08.2 D-10).
- `@BrandNeutral()` / `@LocationNeutral()` decorators + `@OwnerOnly()` (08.5 D-09) — the guard vocabulary every new order route must declare against.
- Domain error class → `error-mapping.ts` → `wrapWith(mapper)` in the controller; RFC 7807 problem details.
- One migration per schema change, hand-authored SQL + manual `meta/_journal.json` entry (drizzle-kit generate has been unusable since ~0018 — 08.4-01).

### Integration Points

- **New:** operator orders list + detail + transition endpoints; the polling/delta read; the reject path; the short-number generator; the pause point where ETA is captured on accept.
- **Changed:** `Order` aggregate transitions; `cancel`/`refund` services; `refunds.controller.ts` guards + permission; `orders` schema; `ordering.*` payloads; guest notification service; website poller; admin sidebar + router.
- **Untouched (do not regress):** the guest edge-cached menu/availability reads (`apps/CLAUDE.md` invariant); the staff location pin and `resetActiveLocation` (08.4-11 repair); `LocationScopeGuard`'s non-owner branch (08.5 D-08); the `billing` permission's `NON_DELEGATABLE` status.

### Test fidelity — non-negotiable for this phase

The pre-requisite bug survived to production because the specs asserted a **mocked repository** and an **in-memory aggregate**, and the one e2e touching the refund endpoint asserted cross-tenant _denial_ rather than the happy path. Every status transition in this phase needs an assertion that reads the row back from the database, and the phase needs a real-browser smoke of the operator workflow. This matches project memory `verify-feature-not-call-shape` and the Phase 8 live-smoke lesson. (Skeptic, "Test-fidelity requirement", non-negotiable.)

</code_context>

<specifics>
## Specific Ideas

- **Founder framing:** admin is the kitchen. This phase is not "a CRUD page over orders" — it is the screen a restaurant stares at during service. Where a decision trades operator speed against developer convenience, operator speed wins.
- **Deliberate asymmetry between reject and cancel:** reject is one tap on the card face (it happens before any food exists); cancel is buried in the detail behind a confirm dialog naming the refund amount, precisely so nobody hits it next to "Ready".
- **The cashier makes no financial decisions.** Every path a non-owner can reach either refunds in full or does not touch money at all.
- **Nothing automatic ever touches the guest's money.** A forgotten order screams louder; it never auto-refunds itself.
- **Ship the guest half.** The two-screen demo — guest's phone tracking live while the operator taps buttons — is the strongest thing this phase produces for selling to a restaurant, and it costs very little on top of the admin work.

</specifics>

<deferred>
## Deferred Ideas

- **Server-Sent Events feed + graceful SSE shutdown (`retry:` on drain)** — ORDINT-02 and ORDINT-09, moved to their own phase. Blocked on a real answer to "how does a long-lived connection carry tenant/brand/location and stay re-authorized". Revisit when a paying customer says the 5-second delay bothers them, or when a kitchen-display surface arrives. `10-PERSONA-CTO.md` HIGH-1..HIGH-6 is the design brief for that phase.
- **"We're closed" / pause ordering / location opening hours** — one-tap pause (20 min / 40 min / rest of day) plus a weekly schedule per location, with checkout rejecting out-of-hours orders. Its own phase. Founder explicitly accepted that until it ships, a tenant can take paid orders 24/7. (`10-PERSONA-PRODUCT.md` BLOCK-3 is the spec.)
- **Kitchen ticket / receipt printing** — browser print view first, thermal-printer integration later. Deferred with kitchen-display work.
- **Item-level partial refund** (checkbox the dishes, amount computes itself, per-item refunded tracking) — better for operators and for "which dishes get refunded most", but needs per-item refund accounting. Ships as arbitrary-amount in this phase.
- **Full-screen kiosk / kitchen-display mode** — column-per-status, large cards, no sidebar. Both product and growth personas want it; founder chose the in-shell page for MVP-1.
- **Orders as the admin landing screen once a brand has orders.**
- **Guest note / allergy field at checkout** — requires a website checkout-form change, not just a column.
- **Manual / phone order entry by the operator.**
- **Delivery lifecycle** — zones, fee, address validation, dispatch/"on its way". Phase 9, MVP-2.

### Reviewed Todos (not folded)

- **"Restructure ROADMAP under AI-driven positioning (MVP-1 / MVP-2 / MVP-3)"** (`.planning/todos/restructure-roadmap-ai-driven.md`, keyword score 0.6) — matched on generic words (`mvp`, `phase`, `2026`), not on subject. It is a planning-document restructure, unrelated to order intake. Not folded. _Note:_ the D-13 SSE deferral does require a ROADMAP edit to Phase 10's criteria 1 and 5 and a new phase entry — that is a separate, smaller change.

</deferred>

---

_Phase: 10-admin-order-intake_
_Context gathered: 2026-08-11_
