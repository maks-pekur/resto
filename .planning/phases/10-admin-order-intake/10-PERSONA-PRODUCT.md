# Phase 10 — Product Strategist Review (pre-plan)

**Reviewer lens:** Head of Product, restaurant-tech B2B SaaS. Judged against how a counter/kitchen person actually behaves during a Friday dinner rush, and against what makes an operator say "we can run service on this" instead of "this is a demo."
**Reviewed:** 2026-08-10, before `10-PLAN` exists.
**Verdict:** ORDINT-01..10 as written builds a correct _admin CRUD page over orders_. It does not yet build an _operational surface_. Four of the gaps below are hard blockers for "MVP-1 closes and a restaurant runs real service on it" — none of them are large, but none of them are in the current requirement list.

---

## TL;DR

1. **Three BLOCKs are missing capabilities, not missing polish.** The state machine physically cannot cancel an accepted order (`order.aggregate.ts:307`); reject/cancel is permission-locked to the tenant owner because it auto-refunds (`refunds.controller.ts:21` + `system-roles.ts`); and there is no way anywhere in the product to say "we are closed / we are slammed, pause ordering." Any one of those, alone, produces a churn event in week one.
2. **The half of the loop that makes the product feel alive is ~30 lines and is currently off.** `apps/website/components/checkout/order-status-poller.tsx:10` treats `paid` as terminal, so the guest never sees Accepted → Preparing → Ready — even though the endpoint (`orders.controller.ts:52`) and the emails (`nats-guest-notification.subscriber.ts:136-140`) already exist. This belongs **in Phase 10**, not in a later website phase.
3. **The feed is not a dashboard page.** It is the operator's home screen, on a tablet, at arm's length, in a loud room. That implies: landing-page redirect, full-screen/kiosk mode, sound, age timers on every ticket, and a callable order number. None of those are in ORDINT-01..10.

---

## Findings

### BLOCK-1 — The order state machine cannot cancel an accepted order

**Evidence.** `apps/api/src/contexts/ordering/domain/order.aggregate.ts:307` — `cancel()` throws `InvalidOrderTransitionError` unless status is `created` or `paid`. Line 321 — `refund()` throws unless status is exactly `paid`. `CancelOrderService` (`apps/api/src/contexts/payments/application/cancel-order.service.ts:52`) inherits both constraints.

**Consequence.** ORDINT-05 ("operator cancels order with reason; auto-refund if paid") is only implementable for orders the operator has _not yet accepted_. But the cancel that actually happens in a restaurant happens **after** accept: the last portion of the duck went to another table, the courier no-showed, the guest phoned to cancel while it was on the pass. Today the operator's only exit is to press Ready → Completed on food that will never exist, then chase a refund out-of-band. That is the exact scenario that generates a chargeback, and chargebacks on a brand-new Stripe Connect account are a real account-health risk for the tenant.

**Recommendation (plannable).**

- Widen `cancel(reason)` to accept `created | paid | accepted | preparing | ready`.
- Widen `refund()` to accept `paid | accepted | preparing | ready | completed`. Post-completion refund is a real, frequent case (guest complains the next morning) and is currently impossible.
- Persist on the `orders` row (one migration, together with MED-12 and HIGH-8): `cancel_reason text`, `canceled_from_status text`, `canceled_by_user_id text`.
- Partial refund currently leaves `status = 'paid'` (`order.aggregate.ts:335`) with no trace on the row — add `refunded_total_minor integer not null default 0` so the feed can badge "€6.50 refunded of €31.00".
- e2e: cancel-after-accept with auto-refund; refund-after-completed; partial-refund badge.

---

### BLOCK-2 — Only the owner can reject or cancel an order

**Evidence.** `apps/api/src/contexts/payments/interfaces/http/refunds.controller.ts:21` gates refunds on `@Permissions({ billing: ['update'] })`. `packages/domain/src/rbac/system-roles.ts` grants `billing` to **`owner` only** — not `admin`. None of the three preset roles (`apps/api/src/contexts/identity/application/preset-roles.ts` — `manager`, `cashier-foh`, `kitchen`) carry `billing`. And reject/cancel auto-refunds (`cancel-order.service.ts:37-50`).

**Consequence.** Phases 08.3/08.4 built exactly the right roles for this phase — `cashier-foh` and `kitchen` already hold `order: ['read','update-status']`. But the moment the cashier presses Reject on an incoming order, the auto-refund path demands `billing:update` and 403s. The only human on the premises who can refuse an order is the owner, who is not at the counter at 20:40 on a Friday. The operator's workaround is to accept everything and sort it out later — which silently converts a product problem into a guest-experience problem.

**Recommendation (plannable).**

- Treat the reject/cancel auto-refund as a **system-initiated consequence of a status transition**, gated on `order: ['update-status']` — not as an operator-initiated refund. The reject/cancel endpoint lives in the ordering controller with that gate; it calls `CancelOrderService` internally.
- Keep `billing: ['update']` on the **discretionary** refund surface only: arbitrary amount, partial refund, post-completion goodwill refund. That is genuinely an owner/manager decision.
- If a finer split is wanted, add `order: ['cancel']` to `PERMISSIONS_STATEMENT` and grant it to `owner`, `admin`, `manager`, `cashier-foh` — **not** `kitchen` (kitchen advances tickets; it does not touch money).
- Per `packages/domain/CLAUDE.md`, any permission added to `admin` needs a pinning regression test asserting what `admin` must still NOT receive.

---

### BLOCK-3 — There is no "we're closed / pause ordering" control anywhere in the product

**Evidence.** `packages/db/src/schema/brands.ts:125-152` — `locations` carries `name / address / timezone / contacts / status` only. No opening hours, no accepting-orders flag. `brands` has no equivalent. `CreateOrderService.execute` (`apps/api/src/contexts/ordering/application/create-order.service.ts`) validates items, modifiers, stop-list and price — never whether the venue is open or able to cope.

**Consequence.** This is the finding I'd escalate hardest. MVP-1 closes with a restaurant publishing an ordering link that accepts paid orders **24/7, unboundedly**. Week one produces: orders paid at 02:00 for a kitchen that closed at 23:00; a 40-minute backlog during which twelve more guests pay; and a fire-alarm evacuation with no way to stop the funnel. The operator's only tool is refund-one-by-one, which is exactly the "this product created work for me" experience that kills a first reference customer. Snooze/pause is table stakes on every incumbent — Toast ships snooze at 20 min / 40 min / rest-of-day plus a prep-time delay that doesn't stop orders.

**Recommendation (plannable, minimal shape for this phase).**

- `locations.orders_paused_until timestamptz null` + `locations.pause_reason text null`.
- `POST /v1/locations/:id/pause { minutes: 20 | 40 | untilNextDay, reason? }` and `POST .../resume`, gated `order: ['update-status']` (the person who can see the flood can stop it).
- `CreateOrderService` rejects with a distinct, guest-readable error; the website checkout renders "The kitchen is paused — ordering reopens at 21:20" and offers scheduled-for-later if `scheduledFor` is available.
- In the feed header: a persistent state chip (Accepting / Paused until 21:20) and a one-tap **Pause 20 min** button. One tap, no dialog. That is the whole feature.
- **Scheduled opening hours can defer to MVP-2.** The manual pause cannot — it is the operator's emergency brake and it costs a column, an endpoint and a button.

---

### HIGH-4 — The feed must be a full-screen operational mode, not a page inside the dashboard shell

**Evidence.** `apps/admin/src/routes/(protected)/$brandSlug/_layout.tsx:53-63` wraps every brand route in `SidebarProvider` + `AppSidebar` (brand switcher, location switcher, 7 nav groups) + `SiteHeader`. Correct for a menu editor. Wrong for a device bolted to a counter.

**Answer to "page or kiosk":** both, one route. Do **not** build a separate app — the SPA route keeps auth, brand/location plumbing and the `?location` filter for free.

**Recommendation (plannable).**

- Route `/{brand}/orders` renders in a layout that collapses the sidebar to icon rail by default and drops the breadcrumb chrome.
- A **Focus mode** toggle (persisted per device in `localStorage`): full viewport, no sidebar, no header, `navigator.wakeLock` held so the tablet doesn't sleep mid-service, exit via a small corner affordance + `Esc`.
- Board layout, not a table: three columns — **New** (paid, unacknowledged) / **In progress** (accepted, preparing) / **Ready**. Cards, not rows. Minimum 56px tap targets; primary action is one tap with no confirmation on the happy path (Accept, Preparing, Ready, Completed). Destructive actions get confirmation; happy-path actions must not.
- Dark-mode-first (the theme system already shipped out-of-band per `STATE.md` Phase 08.4 notes) — a bright white board behind a hot line is genuinely disliked.

---

### HIGH-5 — Once orders exist, the feed is the landing page

**Evidence.** `apps/admin/src/routes/(protected)/$brandSlug/index.tsx` renders a setup checklist + today's stop-list widget. That is correct for day 0 and wrong from day 1 onward.

**Recommendation.** `/{brand}` redirects to `/{brand}/orders` when the brand has ≥1 order in the trailing 7 days; otherwise keeps the setup dashboard. Derive the condition from the same list-orders query's total — no new endpoint. Keep the checklist reachable via a "Setup" nav item so it doesn't vanish. Operators who open the admin during service should never have to navigate.

---

### HIGH-6 — No audible or persistent alert on a new order

**Evidence.** ORDINT-01 specifies "new orders visually flagged." Nothing in ORDINT-01..10 makes noise.

**Consequence.** The single highest-ROI item in this phase. A tablet on a shelf behind the pass is not being watched; a visual flag on an unwatched screen is a missed order, and a missed order is a refund plus a bad review. Every KDS and every aggregator tablet in existence beeps until acknowledged, for this reason.

**Recommendation (plannable).**

- Looping alert sound on a new unacknowledged order, stops on Accept (or explicit Acknowledge). Web Audio context must be unlocked on a user gesture — add a one-time "Enable sound" prompt on first entry to the feed, because browser autoplay policy will otherwise silently no-op and the operator will believe it works.
- Per-device mute + volume persisted in `localStorage`; a visible speaker icon showing current state (a silently-muted device is its own failure mode).
- Tab title badge `(3) Orders — RestOS` so a backgrounded tab still signals.
- Escalation: an order unacknowledged for >3 min re-sounds and the card turns red.

---

### HIGH-7 — Order numbers are not human-callable

**Evidence.** `apps/api/src/contexts/ordering/application/dto.ts:79-89` — `generateOrderNumber()` returns `20260810-K3M9Q`.

**Consequence.** Nobody calls "order two-zero-two-six-zero-eight-one-zero dash kay-three-em-nine-queue" across a dining room, writes it on a bag, or reads it back on the phone. The guest-facing artefacts (confirmation page, emails, ready notification) inherit the same string.

**Recommendation (plannable).** Add `orders.daily_number smallint` — per **location**, per service day, resetting at the location's business-day boundary using `locations.timezone`. Display it as the large primary number on the ticket, on the guest tracker, in the emails, and on the ready notification ("Order 12 is ready"). Keep the existing string as the internal/global reference shown small in the order detail. Allocation via a per-location counter row or `nextval` per (location, service_date); collision handling is trivial because it is display-only.

---

### HIGH-8 — No time-in-state, so the feed cannot show urgency

**Evidence.** `packages/db/src/schema/ordering.ts:18-46` — the `orders` row carries only `created_at` / `updated_at`. Every transition overwrites `updated_at`.

**Consequence.** A kitchen feed lives on one question: _how long has this ticket been sitting?_ Without per-state timestamps, no card can show an age, no card can escalate, and the operator has no way to spot the ticket that fell through. It also means Phase 13 (Analytics) has no prep-time data for any order taken before the column is added — the data loss is permanent and starts at order #1.

**Recommendation (plannable).** Same migration as BLOCK-1/MED-12: `accepted_at`, `preparing_at`, `ready_at`, `completed_at`, `canceled_at` (all nullable `timestamptz`), written by the aggregate transitions. Feed renders an always-ticking age chip per card with color escalation (green <5 min, amber 5–10, red >10; thresholds hardcoded for MVP, per-location config later). Free side-effect: median prep time and accept latency become available to Phase 13 with zero extra work.

---

### HIGH-9 — The guest loop stops at "paid"; closing it is in scope for THIS phase

**Evidence.** `apps/website/components/checkout/order-status-poller.tsx:10` — `TERMINAL_STATUSES = new Set(['paid','failed','canceled','refunded'])`. Polling halts the instant payment confirms. Meanwhile `GET /v1/orders/:id/status` already exists and already returns live status (`apps/api/src/contexts/ordering/interfaces/http/orders.controller.ts:52-67`), and the accepted/ready emails already fire (`apps/api/src/contexts/notifications/infrastructure/nats-guest-notification.subscriber.ts:136-140`).

**Answer to "is this Phase 10 or the website phase":** **Phase 10.** ORDINT-10's endpoint exists; what is missing is a one-line terminal-set change and a small tracker component. Shipping the operator half without the guest half means the operator presses Accept and nothing observable happens anywhere in the world — which is precisely the "this is a demo" feeling. It is also the cheapest delight in the whole milestone.

**What the guest must actually see for the loop to feel finished:**

1. A 4-step tracker: **Paid → Accepted → Preparing → Ready** (label the last step per fulfilment mode: _Ready for pickup_ / _On its way_ / _Bring to table_).
2. The **daily number** (HIGH-7) large, because that is what staff will call out.
3. A **time** — see HIGH-10. "Accepted" with no time is worse than useless; it prompts the guest to phone the restaurant.
4. A **declined/canceled** state carrying the restaurant's reason in guest-safe language plus the refund line: "Full refund of €31.00 issued — it will appear on your card in 5–10 business days." Silence after a failed order is the #1 driver of chargebacks and one-star reviews.
5. Dine-in / QR: on `ready`, say what to physically do ("Collect at the counter — order 12").

**Recommendation (plannable).** `TERMINAL_STATUSES` becomes `completed | canceled | refunded | failed`; poll interval backs off to 10 s and keeps running; extend the status DTO with `dailyNumber`, `promisedReadyAt`, `fulfillmentMode`, `cancelReason` (guest-safe enum label only — see LOW-20 for what must NOT be added).

---

### HIGH-10 — There is no ETA the guest can trust

**Evidence.** `orders.controller.ts:63` maps `eta` to `scheduledFor`, which is `null` for every ASAP order — i.e. the majority. `OrderStatusPoller` renders the ETA row only when `eta` is present, so the common case shows no time at all.

**Consequence.** "Did they even see my order?" is the single most common inbound call to a restaurant doing online orders, and every one of those calls interrupts service.

**Recommendation (plannable).** On **Accept**, the operator picks a prep time — default from a new `locations.default_prep_minutes` (seeded 20), with one-tap chips 10 / 15 / 20 / 30 / 45. Server computes and stores `orders.promised_ready_at`. That value flows to: the guest tracker, the `order_accepted` email, and the feed card (so the kitchen sees its own commitment). Accepting with a default and no interaction must remain possible in one tap — the chips are a _modifier_, not a required dialog.

---

### MED-11 — `channel` doesn't exist on the order, and the second channel doesn't exist either

**Evidence.** `packages/db/src/schema/ordering.ts:18-46` has no channel/source column. And `apps/qr-menu/src` contains no `/v1/orders` call and no checkout at all — QR ordering is not wired (the app is menu + cart drawer only).

**Recommendation.** Add `channel text not null default 'site'` with a check constraint `IN ('site','qr','admin','api')` **now**, so the data is correct from order #1 and Phase 13 isn't backfilling. But **drop the channel filter from the phase's success criteria** — filtering by a dimension with one possible value is dead UI. Ship status + date filters only. (`'admin'` in the constraint anticipates MED-14; `'api'` anticipates partner integrations.)

---

### MED-12 — Cancel reason is not persisted, and free-text-only reasons are the wrong UX

**Evidence.** `order.aggregate.ts:307-319` puts `reason` in the domain event only; no column exists.

**Recommendation.** Persist per BLOCK-1. In the UI, use a **fixed reason enum as tap chips** plus optional free text: _out of stock · kitchen overloaded · guest called to cancel · address not serviceable · suspected fraud · other_. Free-text-only is slow at a counter (nobody types on a greasy tablet) and produces nothing analysable for Phase 13/14. Map each enum to a guest-safe phrase for the tracker/email — the guest must never see "suspected fraud".

---

### MED-13 — ORDINT-06 "partial refund of specific items" doesn't match the API that exists

**Evidence.** `RefundInputDto` / `RefundOrderService` take `amountMinor`, not item ids (`apps/api/src/contexts/payments/interfaces/http/refunds.controller.ts:24-38`). A partial refund leaves `status = 'paid'` (`order.aggregate.ts:335`) with no row-level trace.

**Recommendation.** Keep the money API amount-based — that is the correct design. Build the UI as an **item picker that computes the amount**: checkbox per line + quantity stepper, live running total, editable override field. Add `refunded_total_minor` (BLOCK-1) so the feed and detail can badge partial refunds. **This is the first thing to cut** if the phase must shrink (see Prioritization).

---

### MED-14 — No manual / phone order entry

Independent restaurants at a mid-to-high average check take a meaningful share of orders by phone, and today those orders are invisible to RestOS — which quietly breaks Phase 13 analytics and Phase 12 CRM for that tenant. **Not** a Phase 10 build. But reserve `channel = 'admin'` (MED-11) and keep a `payment_method`-shaped seam in mind so "cash on pickup" doesn't require a schema fight later. Name it explicitly as a known post-MVP-1 gap so it doesn't surprise the first sales conversation.

---

### MED-15 — No guest note / allergy field on the order

**Evidence.** No `notes` column on `orders` or `order_items` (`packages/db/src/schema/ordering.ts`).

**Recommendation.** Add `orders.note text` (≤500 chars) and `order_items.note text` (≤200) in the same migration. Render the order note **prominently and never truncated** on the feed card — an unread "severe nut allergy" is a safety incident, not a UX defect. Checkout wiring is one textarea and can land in the same phase or the website's next pass; the columns must land now.

---

### MED-16 — Default feed scope for multi-location

**Evidence.** `apps/admin/src/lib/hooks/use-effective-location.ts` already provides exactly the right primitive: owner reads `?location=all|<uuid>` from the URL; non-owners are server-pinned to their active location.

**Recommendation.**

- The feed defaults to the **effective single location** for everyone — including the owner. Do **not** default an owner to `all`: a 3-location owner's counter tablet showing other kitchens' tickets is an operational hazard, and the owner is usually standing in one specific restaurant.
- `?location=all` gets an aggregate feed with a location chip on every card, sorted by age. Per-card actions still resolve against that card's own location.
- Add a **per-device sticky preference** (`localStorage`): a tablet bolted to one counter reopens on that location regardless of who last signed in on it. This is the difference between "owner watching 3 locations from the office" and "the tablet at Location B" — same account, different device intent.

---

### MED-17 — Two devices will press Accept on the same order

Counter + kitchen both watching the same feed is the normal case, not an edge case. `OrderRepository.update` has no optimistic-concurrency guard.

**Recommendation.** Make transitions **idempotent by target state**: accepting an already-accepted order returns 200 with current state, not 409. Only genuinely illegal transitions (`ready → accepted`) return 409, and the UI resolves that by re-rendering from the pushed state rather than showing an error toast. Show "Accepted by Maria · 12:04" on the card so humans self-coordinate. A 409 during a rush reads as "the app is broken."

---

### MED-18 — SSE reconnect must backfill, not merely reconnect

ORDINT-09 covers graceful shutdown with `retry:`. The product risk is the **gap window**: an order that arrives while the tablet's connection is dead must not be silently absent from the board.

**Recommendation.** Client keeps a cursor (`lastEventId` / `since` timestamp); on every (re)connect it first issues `GET /v1/orders?status=paid,accepted,preparing,ready&since=<cursor>` to reconcile, then resumes the stream. Render a **Live / Reconnecting…** pill in the header — an operator must be able to distinguish "no new orders" from "this screen is lying to me." A silently dead feed is worse than a visibly broken one.

---

### MED-19 — No kitchen ticket print path

There is no Staff app in MVP-1, so the pass has nothing physical. A meaningful share of kitchens will not put a tablet in the hot line.

**Recommendation.** A print-optimised order card: `window.print()` + `@media print` CSS sized for 80 mm receipt stock, behind a Print button on the card and an optional per-device **auto-print on accept** toggle. Browser + a cheap USB/network receipt printer covers most of the need. Real ESC/POS or KDS integration stays post-MVP-1. This is cheap and it moves the phase from "demo" to "we can run service on this" for exactly the segment (mid-to-high check, real kitchen) the product targets.

---

### LOW-20 — Pin the public status endpoint's contract before it grows

`orders.controller.ts:52` is `@Public()`, keyed only by the order UUID. The current payload (status/total/currency/orderNumber/eta) is safe. The predictable future PR is "let's show the items and the delivery address so the tracker looks nicer," at which point an unguessable-but-shareable URL leaks guest PII.

**Recommendation.** Add a contract test pinning the exact response keys. If the tracker later needs line items, return names + quantities only — never phone, email, or delivery address. HIGH-9's additions (`dailyNumber`, `promisedReadyAt`, `fulfillmentMode`, guest-safe `cancelReason`) are all safe; nothing else should be added without a review.

---

### LOW-21 — The empty feed is the tenant's activation moment

After signup the feed is empty until a real guest orders — which may be days. That screen is the highest-leverage real estate in the product for time-to-first-order.

**Recommendation.** Empty state that doubles as a launch checklist: _Payments live ✓ · Menu published ✓ · Location open ✓_ → **your ordering link** with a copy button and a downloadable QR PNG, plus a "Send a test order" affordance in non-production. Time-to-first-order is the number that predicts whether this tenant activates or quietly churns.

---

### LOW-22 — Guest-facing locale is hardcoded to Russian

`apps/api/src/contexts/notifications/application/send-guest-notification.service.ts:59` — `const locale = 'ru';`. For an EU-first target customer that is wrong on the guest side of the loop, and Phase 10 is where guest-facing status comms get exercised for the first time.

**Recommendation.** Not Phase 10's job to fix the full i18n story, but: all new order-feed strings go through the existing `apps/admin/src/lib/i18n` (en + ru already present), and the accepted/ready email at minimum inherits the brand's default locale rather than a constant. Track the hardcode as an explicit follow-up so it doesn't ship to a German pilot.

---

## Reject vs Cancel — exact recommended shape

Two operator intents, **one** terminal domain status. Do not add a `rejected` status — it doubles the state machine to carry a label.

|                | **Reject**                                                | **Cancel**                                                                                                   |
| -------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Applies to     | A **new** order (`paid`, not yet accepted)                | An **accepted** order (`accepted / preparing / ready`)                                                       |
| Where it lives | Secondary button on the incoming card face, beside Accept | Overflow menu inside the order **detail** — deliberately harder to reach than Ready                          |
| Friction       | One tap → reason chips sheet → done                       | Confirm dialog naming the refund amount + mandatory reason                                                   |
| Money          | Full auto-refund, always                                  | Refund choice: **Full** (default) · **Partial** (item picker, MED-13) · **None**                             |
| Permission     | `order: ['update-status']` (BLOCK-2)                      | `order: ['update-status']`; **`None` and Partial require `billing: ['update']`** — that is the abuse surface |
| Row state      | `status='canceled'`, `canceled_from='paid'`               | `status='canceled'`, `canceled_from='<accepted\|preparing\|ready>'`                                          |

**What the guest is told — Reject:** tracker flips to _"Your order was declined by the restaurant."_ + the guest-safe reason (out of stock / kitchen at capacity / outside delivery area) + _"Full refund of €X issued — it will appear on your card in 5–10 business days."_ + a CTA back to the menu. Email reuses the existing `order_refunded` template with a decline line. **The word "rejected" never reaches the guest.**

**What the guest is told — Cancel:** _"Your order was canceled by the restaurant."_ + reason + the refund state actually chosen. If `None`, the copy must say _no refund was issued_ and give a contact route — never silently imply money is coming back.

---

## Prioritization of ORDINT-01..10 (by product value)

**Tier 1 — without these it is a demo, not a service tool**

| Rank | Item                                 | Note                                                                                         |
| ---- | ------------------------------------ | -------------------------------------------------------------------------------------------- |
| 1    | ORDINT-01 feed + ORDINT-07 detail    | Only meaningful **with** BLOCK-3 pause, HIGH-6 sound, HIGH-8 age timers, HIGH-7 daily number |
| 2    | ORDINT-03 accept / reject            | Blocked by BLOCK-2 (permissions) — otherwise owner-only                                      |
| 3    | ORDINT-04 status transitions         | Plus MED-17 idempotency                                                                      |
| 4    | ORDINT-10 **+ guest tracker wiring** | HIGH-9 + HIGH-10; the loop closes here or nowhere                                            |
| 5    | ORDINT-05 cancel with reason         | Blocked by BLOCK-1 (domain) — cancel-after-accept is the real case                           |

**Tier 2 — needed, survivable if late**

| 6 | ORDINT-02 real-time push | See cut-list: 5 s polling is indistinguishable to the operator |
| 7 | ORDINT-09 graceful SSE shutdown | Only exists if ORDINT-02 does; add MED-18 backfill regardless |
| 8 | ORDINT-08 filters | Status + date only |

**Tier 3 — cut first**

| 9 | ORDINT-06 item-level partial refund | Ship **full refund only**; owner keeps the existing amount-based API from order detail |
| 10 | ORDINT-08 **channel** dimension | No second channel exists (MED-11) — dead UI |

**If the phase must shrink, cut in this order:** (a) ORDINT-06 item picker → full-refund only; (b) the channel filter; (c) — only if truly necessary — SSE itself, degrading ORDINT-02 to a 5-second poll of the list endpoint. A counter operator cannot perceive the difference between SSE and 5 s polling, and dropping SSE removes ORDINT-09 entirely. **Do not cut:** the pause control, the alert sound, cancel-after-accept, the guest tracker, or the permission fix. Those four are what separate "MVP-1 closed" from "MVP-1 demoed."

---

## Time-to-value: where the last mile actually breaks

Signup → bootstrap owner → brand → location → Stripe Connect → menu → publish → share link → **guest pays** → _(Phase 10)_ **operator sees it and fulfils it**.

Friction points introduced or left open at that last hop, in order of severity:

1. The operator must _know to navigate_ to the orders page and keep a tab open → **HIGH-5** (redirect) + **HIGH-6** (sound + wake lock).
2. The operator has no way to stop the funnel when closed or slammed → **BLOCK-3**.
3. The operator cannot refuse an order without the owner → **BLOCK-2**.
4. The operator cannot undo an accepted order → **BLOCK-1**.
5. The guest gets no signal after payment → **HIGH-9** + **HIGH-10**.
6. Staff cannot call out the order → **HIGH-7**.

Fix those six and the loop is genuinely closed. Everything else in this review is quality, not viability.

---

## Readiness scorecard (phase-scoped, as currently specified in ORDINT-01..10)

| Dimension                                       | Score  | Note                                                                                                        |
| ----------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| Restaurant primitives (real workflow fit)       | 3 / 10 | No pause, no prep time, no daily number, no ticket age, no note field                                       |
| Operator ergonomics (rush usability)            | 3 / 10 | Dashboard-shell page, no sound, no kiosk mode, no print                                                     |
| Order lifecycle correctness                     | 4 / 10 | Aggregate cannot cancel or refund after accept (BLOCK-1)                                                    |
| Permissions fit for the role that does the work | 3 / 10 | Reject/cancel is owner-only in practice (BLOCK-2)                                                           |
| Guest-side loop closure                         | 4 / 10 | Endpoint + emails exist; the poller stops at `paid`                                                         |
| Multi-location / multi-device                   | 7 / 10 | 08.4/08.5 primitives are right; needs per-device stickiness + concurrency semantics                         |
| Real-time delivery                              | 6 / 10 | SSE + graceful shutdown specified; reconnect backfill missing                                               |
| Data foundation for Phases 12–14                | 4 / 10 | Missing channel, per-state timestamps, cancel reason, refunded total — all permanently lossy if added later |

**Overall: 34 / 80** as specified. With the three BLOCKs and HIGH-6/7/8/9/10 folded into the plan, this lands comfortably in the 60s — which is the bar for "a restaurant runs Friday service on it."

---

## Top 3 recommendations for the plan

1. **One migration, five columns — do it in Wave 1.** `channel`, per-state timestamps (`accepted_at`…`canceled_at`), `cancel_reason` + `canceled_from_status` + `canceled_by_user_id`, `refunded_total_minor`, `daily_number`, `note` (order + item), and on `locations`: `orders_paused_until`, `pause_reason`, `default_prep_minutes`. Every one of these is permanently lossy if it lands after the first real orders. Small effort, irreversible if skipped.
2. **Widen the state machine and re-gate the money actions before any UI is built.** BLOCK-1 + BLOCK-2 together are perhaps a day of domain + guard work, and every screen in the phase depends on their answers. Getting them wrong means the UI is built against a contract that cannot express what the operator needs.
3. **Ship the guest tracker in this phase, not the next one.** `TERMINAL_STATUSES`, a 4-step tracker component, and `promisedReadyAt` on Accept. It is the smallest change in this review with the largest perceived effect — it is what turns "the operator pressed a button" into "the restaurant is talking to me."

---

## What I did NOT review

- SSE transport implementation, Fastify/NestJS streaming mechanics, connection limits, or the graceful-shutdown protocol — CTO/skeptic lens.
- Multi-tenancy, RLS, `ScopedTx` correctness for the new list/stream endpoints, and whether `LocationScopeGuard` needs new `@LocationNeutral` exemptions.
- Stripe refund mechanics, idempotency, webhook reconciliation, and dispute handling (Phase 8 territory).
- Test strategy, plan/wave decomposition, and effort estimation.
- Pricing, packaging, or which tier the order feed belongs to.
