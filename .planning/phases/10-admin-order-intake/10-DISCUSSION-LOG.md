# Phase 10: Admin Order Intake - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-11
**Phase:** 10-admin-order-intake
**Areas discussed:** Pre-phase blocker, Order feed placement & scope, Refresh speed & operator alerting, Accept / reject / cancel / money, Guest-facing status, Follow-ups (forgotten orders, printing, archive)

**Persona reviews ran in parallel with the discussion** (`persona-cto`, `persona-skeptic`, `persona-product-strategist`, `persona-growth-marketer`) and returned before the second question. Their findings reshaped several options presented below — notably the SSE decision and the permission split. Four of their claims were independently re-verified against the working tree before being presented to the founder as fact; see `10-PERSONA-REVIEWS.md`.

---

## Pre-phase blocker — the live status bug

Surfaced by CTO BLOCK-1 and Skeptic BLOCK-1 independently, then verified by the orchestrator at `order-drizzle.repository.ts:47-78`, `cancel-order.service.ts:55`, `refund-order.service.ts:114`.

| Option                      | Description                                                                                                                            | Selected |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Now, separate quick task    | Swap `save()` → `update()` in two services + a test that reads the row back from the DB. Phase 10 then builds on a working foundation. | ✓        |
| Inside Phase 10, first plan | Keep the work together; phase starts by repairing pre-existing code.                                                                   |          |

**User's choice:** Fix now as a separate quick task, before Phase 10 is planned.

---

## Order feed placement & scope

### Where the feed lives

| Option                                     | Description                                                                                                                | Selected |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | -------- |
| Dedicated "Orders" page                    | New sidebar entry with a new-order counter; fits the existing admin shell; fastest path.                                   | ✓        |
| Orders become the dashboard landing screen | Impossible to miss, but displaces the existing dashboard (stop-list, counters).                                            |          |
| Full-screen kitchen/kiosk mode             | Column-per-status, large cards, tablet-on-the-counter. Closest to real service, but a separate screen with its own layout. |          |

**User's choice:** Dedicated page.
**Notes:** Both `persona-product-strategist` (HIGH-4, HIGH-5) and `persona-growth-marketer` (HIGH-9) argued for landing-screen and/or full-screen mode. Recorded as an explicit disagreement in CONTEXT.md D-01 rather than silently overridden; revisit after a real restaurant runs a service on it.

### Who can reject / cancel

| Option                         | Description                                                                                                                              | Selected |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Everyone who works with orders | Reject/cancel is a status action; the refund is a system consequence. Cashier and manager can. Arbitrary-amount refund stays owner-only. | ✓        |
| Owner + admin only             | Shift can move statuses, but any refusal goes through a senior. Safer on money, creates a bottleneck at peak.                            |          |
| Owner only (status quo)        | No permission change. The only person who can refuse an order is the owner, wherever they are.                                           |          |

**User's choice:** Everyone who works with orders.
**Notes:** Verified before asking — `billing: ['read','update']` exists only under `owner` in `packages/domain/src/rbac/system-roles.ts:10`, and `staff` has no `order` permission at all. Raised as BLOCK by three personas (CTO HIGH-8, Skeptic BLOCK-4, Product BLOCK-2).

### Location behaviour

| Option                                                                                       | Description                                                                                          | Selected |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------- |
| Inherits the existing location filter; merged feed with per-row location label in "all" mode | Consistent with every other admin page (08.5 model). Staff see only their pinned location.           | ✓        |
| Always single-location; "all" mode asks to pick one                                          | Simpler; matches the fact that food is cooked at one kitchen. Network owner loses the whole picture. |          |
| Merged feed but read-only in "all" mode                                                      | Mirrors how the 08.5 stop-list aggregate works.                                                      |          |

**User's choice:** Inherits the filter, merged and actionable in "all" mode.

### New columns in the orders migration (multi-select)

| Option                       | Description                                                                                                       | Selected |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------- |
| Short daily order number     | Replaces `20260810-A7K2M` for human use; resets daily, per location.                                              | ✓        |
| Channel (site / qr-menu)     | Doesn't exist today; ORDINT-08's filter has no data behind it. qr-menu can't order yet, so one value in practice. | ✓        |
| Per-state timestamps         | Each transition currently overwrites `updated_at`; no time-in-state chip, no Phase 13 analytics, unrecoverable.   | ✓        |
| Cancel reason + who canceled | Nothing is persisted today; needed for dispute review and "top cancel reason".                                    | ✓        |

**User's choice:** All four.
**Notes:** All four personas independently pushed for a single migration carrying every new column before real orders exist. ETA (D-15) and marketing consent (D-17) were added to the same migration later in the discussion.

---

## Refresh speed & operator alerting

### How the feed learns about a new order

| Option                                           | Description                                                                                                                                                                                                                                           | Selected |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 5-second polling now; SSE as its own later phase | Phase closes fast and safely; SSE added once a real customer proves the delay matters. Moves ORDINT-02 and ORDINT-09 out — a ROADMAP edit.                                                                                                            | ✓        |
| Polling only; drop SSE entirely                  | Cheapest. Closes the door on future kitchen-display screens where a live stream genuinely earns its cost.                                                                                                                                             |          |
| SSE now, per the requirement                     | Instant arrival, but requires reworking how the server resolves tenant/brand/location for a long-lived connection (the access-control core built across 08.2–08.5), Cloudflare verification, and drain-on-deploy handling. Roughly doubles the phase. |          |

**User's choice:** Polling now, SSE as its own later phase.
**Notes:** Presented after CTO BLOCK-2/BLOCK-3 and Skeptic BLOCK-3 established that browser `EventSource` cannot send the `x-tenant-id` / `x-brand-slug` / `x-location-id` headers the API resolves tenancy from. Orchestrator flagged during the exchange that the shared 60-req/min per-IP rate limit must be fixed for polling to work from several devices behind one restaurant NAT (Skeptic HIGH-3, CTO HIGH-5) — treated as an infrastructure decision, not a founder one.

### How the operator notices

| Option                                        | Description                                                                                                    | Selected |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------- |
| Sound + tab-title counter                     | Chime plus `(2) Заказы` in the browser tab. Works everywhere with no permission prompt. Mute toggle alongside. | ✓        |
| Sound + tab title + browser push notification | Pops over other windows even when minimised; needs a permission grant and is unreliable on tablet browsers.    |          |
| Visual only, as literally required            | Matches ORDINT-01's wording. Fails the moment nobody is looking at the tablet.                                 |          |

**User's choice:** Sound + tab-title counter.

### "We're closed" / pause ordering

| Option                                                          | Description                                                                                                 | Selected |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------- |
| Pause button in the feed header (20 min / 40 min / rest of day) | Guest sees "not accepting orders right now" and cannot pay. Small addition, closes a real hole.             |          |
| Pause + weekly opening hours per location                       | More correct, but a noticeably bigger piece (settings, time zones, holidays).                               |          |
| Not this phase                                                  | Phase 10 stays exactly about intake; risk is a tenant accepting paid orders 24/7 until a later phase ships. | ✓        |

**User's choice:** Not this phase.
**Notes:** Raised as BLOCK-3 by `persona-product-strategist`. Founder was told the risk plainly and accepted it; deferred to its own phase.

---

## Accept / reject / cancel / money

### Cancel after accept

| Option                              | Description                                                                                                       | Selected |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------- |
| Yes, at any stage up to "completed" | Matches reality: ingredient ran out, courier no-show, guest changed their mind. Requires extending the aggregate. | ✓        |
| Yes, but only up to "ready"         | Cooked food is a refund conversation, not a cancellation. Stricter accounting, operator can get stuck.            |          |
| No (status quo)                     | Only the operator's workaround remains: mark food "ready" and "completed" when it will never exist.               |          |

**User's choice:** Any stage up to completed.

### Money on cancel-after-accept

| Option                                                    | Description                                                                                                         | Selected |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------- |
| Always full refund                                        | Cashier makes no financial judgement. Withholding part is a separate owner-only refund operation.                   | ✓        |
| Operator picks full / partial / none in the cancel dialog | More flexible; partial and none restricted to owner. More screens, more room for error at peak.                     |          |
| Cancel without auto-refund                                | Status only; owner refunds manually. Contradicts the phase requirement and risks a guest with no food and no money. |          |

**User's choice:** Always full refund.

### Stripe refund failure

| Option                                                       | Description                                                                                                | Selected |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | -------- |
| Order cancels anyway; refund flagged red with a retry button | Kitchen never blocked by the payment provider. A visible "refund did not go through" state until resolved. | ✓        |
| Cancel doesn't go through until the money is back            | RestOS and Stripe never diverge, but a Stripe outage blocks the kitchen.                                   |          |
| Cancels; refund retries automatically in the background      | Nicest for the operator, but needs a queue and retry machinery — noticeably more work.                     |          |

**User's choice:** Cancel proceeds, refund flagged red.
**Notes:** Skeptic MED-5 additionally noted the Stripe call currently sits inside the DB transaction — restructuring that is a planner task recorded in CONTEXT.md D-11.

### Partial refund (ORDINT-06)

| Option                                  | Description                                                                                        | Selected |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- | -------- |
| Arbitrary amount + reason               | The backend already accepts `amountMinor`; needs a screen and a status-guard fix. Cheapest path.   | ✓        |
| Item checkboxes, amount computes itself | Clearer for the operator and better for future analytics, but requires per-item refund accounting. |          |
| Not this phase — full refunds only      | Shortest route to MVP-1 close; one requirement moves to backlog.                                   |          |

**User's choice:** Arbitrary amount + reason.
**Notes:** ORDINT-06's literal "specific items" wording is scoped down. Three personas independently recommended this (CTO MED-4, Skeptic MED-2, Product MED-13).

---

## Guest-facing status

### In scope this phase?

| Option                     | Description                                                                                                                                                    | Selected |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Yes                        | Guest watches "accepted → preparing → ready" on their phone. Small change; without it the entire phase is invisible to the guest and there is nothing to demo. | ✓        |
| No — a later website phase | Keeps Phase 10 purely about admin.                                                                                                                             |          |

**User's choice:** Yes, in scope.
**Notes:** Verified before asking — `order-status-poller.tsx:10` treats `paid` as terminal, so polling stops the instant payment confirms.

### The "when will it be ready" question

| Option                                 | Description                                                                                                      | Selected |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------- |
| Average prep time in location settings | One field ("usually 25 minutes"); guest sees "around 14:55". Also revives the dead `eta` slot in guest emails.   |          |
| Operator sets the time when accepting  | 15 / 25 / 40 min at the moment of accepting. Most accurate, reflects real kitchen load; one extra tap per order. | ✓        |
| Stage only, no time                    | Nothing promised, nothing broken. Guest phones to ask instead.                                                   |          |

**User's choice:** Operator sets it on accept.

### Marketing consent

| Option                                | Description                                                                                                                                     | Selected |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Checkbox at checkout + consent column | Zero consent capture exists repo-wide today; Phase 12 CRM would build a list with no lawful basis, and consent cannot be granted retroactively. | ✓        |
| Later, with the CRM phase             | Phase 10 stays in bounds; every pre-Phase-12 order becomes unusable for marketing.                                                              |          |

**User's choice:** Checkbox + column now.
**Notes:** `persona-growth-marketer` BLOCK-4; also a direct consequence of the GDPR constraint in PROJECT.md.

---

## Follow-ups

### An order nobody accepted for 20 minutes

| Option                                     | Description                                                                                                            | Selected |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | -------- |
| Escalates loudly, decides nothing          | Card reddens, shows "waiting 20 min", sound repeats. Guest's money never touched without a human. Threshold hardcoded. | ✓        |
| Auto-rejects with a refund after a timeout | Guest doesn't wait in vain, but the restaurant can lose an order that was quietly being cooked.                        |          |
| Nothing special                            | Least work; in a rush it can go unnoticed for an hour.                                                                 |          |

**User's choice:** Escalate loudly, never act on money automatically.

### Kitchen ticket printing

| Option                       | Description                                                                                                                 | Selected |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------- |
| Simple browser print         | "Print" button opens a clean ticket, goes to any attached printer. Half a day, no integrations.                             |          |
| Not this phase               | The counter tablet replaces the ticket for the first customer; printing belongs with thermal printers and kitchen displays. | ✓        |
| Full thermal-printer support | Auto-print on accept, 80mm format, printer settings. A large separate topic.                                                |          |

**User's choice:** Not this phase.

### Default view and history

| Option                                             | Description                                                                                                                          | Selected |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Active on the main screen, history as a second tab | Only actionable orders visible; completed/canceled/refunded behind a tab with date, status and channel filters.                      |          |
| One list with filters on top                       | Everything in one place, "today" filter on by default. Simpler; an active order can get lost among completed ones by end of service. | ✓        |
| Active only; history in the Finance phase          | Feed is purely about "now". One requirement moves out.                                                                               |          |

**User's choice:** One list with filters on top.
**Notes:** Product HIGH-8 / MED-16 warn about the lost-active-order failure mode — mitigated via sort order and the time-in-state chip rather than a second tab (CONTEXT.md D-03).

---

## Claude's Discretion

Technical calls the founder was deliberately not dragged into (per the standing "surface product questions, hide infrastructure" preference). Full list in CONTEXT.md § Claude's Discretion; the load-bearing ones:

- Fixing the shared 60-req/min per-IP rate limit so several devices in one restaurant can poll.
- The `wasPaid` money bug that appears as soon as cancel-after-accept ships (`cancel-order.service.ts:33`).
- Moving the Stripe refund call outside the DB transaction.
- Guard decorators (`@BrandNeutral` / `@LocationNeutral`) on every new and touched order route.
- Whether to wire `LocationPermissionChecker` or record a third explicit re-defer.
- Short-order-number generation shape; the missing feed index; concurrent-Accept resolution; reconnect backfill.
- Event payload fixes (`locationId`, `OrderPaidV1`'s hardcoded total/currency, actor on status-changed, PII exclusion).
- The `locale = 'ru'` hardcode and the `brandName ?? 'RestOS'` white-label leak in guest email.

## Deferred Ideas

- SSE feed + graceful SSE shutdown (ORDINT-02, ORDINT-09) — own phase.
- "We're closed" / pause ordering / location opening hours — own phase.
- Kitchen ticket / receipt printing.
- Item-level partial refund with per-item accounting.
- Full-screen kiosk / kitchen-display mode; orders as the admin landing screen.
- Guest note / allergy field at checkout.
- Manual / phone order entry.
- Delivery lifecycle (zones, fee, address validation, dispatch) — Phase 9, MVP-2.
