# Phase 10: Admin Order Intake — Persona Reviews (aggregate)

**Run:** 2026-08-11, at `/gsd:discuss-phase 10`, before planning.
**Reviewers:** `persona-cto`, `persona-skeptic`, `persona-product-strategist`, `persona-growth-marketer` (the four named in ROADMAP.md for this phase).

**Full reports (planner MUST read all four before writing plans):**

- `.planning/phases/10-admin-order-intake/10-PERSONA-CTO.md` — 3 BLOCK / 10 HIGH / 7 MED / 4 LOW
- `.planning/phases/10-admin-order-intake/10-PERSONA-SKEPTIC.md` — 4 BLOCK / 8 HIGH / 7 MED / 5 LOW
- `.planning/phases/10-admin-order-intake/10-PERSONA-PRODUCT.md` — 3 BLOCK / 7 HIGH / 9 MED / 3 LOW
- `.planning/phases/10-admin-order-intake/10-PERSONA-GROWTH.md` — 4 BLOCK / 7 HIGH / 7 MED / 2 LOW

This file is the convergence index + disposition. It does not replace the four reports.

---

## Verified independently by the orchestrator (not taken on the personas' word)

All four claims below were re-checked against the working tree during discuss. They are facts, not findings.

| Claim                                                          | Verified at                                                                                                          | Result                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cancel`/`refund` never persist a status change or emit events | `order-drizzle.repository.ts:47-78`, `cancel-order.service.ts:55`, `refund-order.service.ts:114`                     | **CONFIRMED.** `save()` is `INSERT … ON CONFLICT (tenant_id, idempotency_key) DO NOTHING RETURNING id` with `if (result.length === 0) return;`. `order.pullEvents()` drains at line 48, _before_ that return, so the outbox append at the bottom is unreachable for an existing order. `update()` exists and is the correct method. |
| Refund is owner-only                                           | `refunds.controller.ts:21` (`@Permissions({ billing: ['update'] })`) + `packages/domain/src/rbac/system-roles.ts:10` | **CONFIRMED.** `billing` appears only under `owner`. `admin` has `order: ['read','update-status']` but no `billing`. `staff` has **no `order` permission at all**.                                                                                                                                                                  |
| Guest status page stops updating at `paid`                     | `apps/website/components/checkout/order-status-poller.tsx:10`                                                        | **CONFIRMED.** `TERMINAL_STATUSES = new Set(['paid','failed','canceled','refunded'])`.                                                                                                                                                                                                                                              |
| Cancel-after-accept is impossible                              | `order.aggregate.ts:307` (cancel requires `created`\|`paid`), `:321` (refund requires exactly `paid`)                | **CONFIRMED.**                                                                                                                                                                                                                                                                                                                      |

Additional facts confirmed while scouting: `orders` has no `channel` column, no per-state timestamps, no cancel-reason column (`packages/db/src/schema/ordering.ts:18-46`); `GET /v1/orders/:id/status` already exists and is `@Public()` (`orders.controller.ts:52-67`).

---

## Convergence — findings raised independently by 3+ personas

These carry the most weight; they are not one reviewer's opinion.

| #    | Finding                                                                                | Raised by                                                 | Disposition                                                                                        |
| ---- | -------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| C-1  | `orders.status` never updates on cancel/refund — live prod bug                         | CTO BLOCK-1, Skeptic BLOCK-1                              | **Fixed pre-phase as a separate quick task** (founder decision). Phase 10 assumes it is green.     |
| C-2  | Aggregate forbids cancel/refund after `accepted`                                       | Skeptic BLOCK-2, Product BLOCK-1, CTO HIGH-7              | **In scope.** D-08/D-09.                                                                           |
| C-3  | Reject/cancel auto-refund is owner-only; `staff` has no order permission               | CTO HIGH-8, Skeptic BLOCK-4, Product BLOCK-2              | **In scope.** D-06.                                                                                |
| C-4  | Browser SSE cannot carry the tenancy headers the API resolves from                     | CTO BLOCK-2 + BLOCK-3, Skeptic BLOCK-3                    | **Avoided.** Polling this phase; SSE deferred to its own phase (D-13).                             |
| C-5  | Guest status page stops at `paid` — the whole phase is invisible to the guest          | Growth BLOCK-1, Product HIGH-9, Skeptic MED-1             | **In scope.** D-16.                                                                                |
| C-6  | No `channel` column; ORDINT-08's channel filter has no data behind it                  | CTO MED-3, Skeptic HIGH-4, Product MED-11, Growth BLOCK-3 | **In scope** (column now, single value until qr-menu can order). D-04.                             |
| C-7  | No per-state timestamps — accept latency / prep duration destroyed on every transition | CTO MED-5, Product HIGH-8, Growth HIGH-5                  | **In scope.** D-04.                                                                                |
| C-8  | No audible/persistent new-order alert; a silent feed is missed in a real restaurant    | Skeptic HIGH-8, Product HIGH-6, Growth HIGH-8             | **In scope.** D-14.                                                                                |
| C-9  | Cancel reason not persisted and free-text-only                                         | CTO MED-5, Product MED-12, Growth HIGH-6                  | **In scope** — reason chips + persisted reason + actor. D-04/D-10.                                 |
| C-10 | Order number `20260810-A7K2M` is unusable at a counter                                 | Skeptic HIGH-5, Product HIGH-7, Growth MED-14             | **In scope** — short per-day, per-location number. D-04.                                           |
| C-11 | ORDINT-06 "partial refund of specific items" has no item-level model                   | CTO MED-4, Skeptic MED-2, Product MED-13                  | **Scoped down** to arbitrary amount + reason (the API that exists). D-10.                          |
| C-12 | No ETA anywhere; two surfaces already pretend one exists                               | Growth BLOCK-2, Product HIGH-10                           | **In scope** — operator sets it on accept. D-15.                                                   |
| C-13 | Feed should own the landing screen once orders exist                                   | Product HIGH-5, Growth HIGH-9                             | **Rejected for this phase** — dedicated page (founder decision D-01). Revisit post-first-customer. |
| C-14 | No ticket/kitchen print path                                                           | Skeptic MED-6, Product MED-19                             | **Deferred.**                                                                                      |

---

## BLOCKs the founder resolved during discuss

| Persona BLOCK                                                              | Founder decision                                                                                                             |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| CTO BLOCK-1 / Skeptic BLOCK-1 (status never persists)                      | Fix now, separate quick task, before Phase 10 planning.                                                                      |
| CTO BLOCK-2 + BLOCK-3 / Skeptic BLOCK-3 (SSE tenancy + connect-time authz) | Sidestepped — 5s polling this phase; SSE + graceful-shutdown moved to their own phase. ORDINT-02 and ORDINT-09 move with it. |
| Skeptic BLOCK-2 / Product BLOCK-1 (cancel after accept)                    | Cancel allowed at every stage up to `completed`.                                                                             |
| Skeptic BLOCK-4 / Product BLOCK-2 (owner-only reject)                      | Reject/cancel becomes an order-status permission; discretionary refund stays `billing:update` / owner.                       |
| Product BLOCK-3 (no pause / closed control)                                | **Deferred to its own phase** ("location schedule + pause ordering"). Founder accepted the stated risk.                      |
| Growth BLOCK-1 (guest sees nothing)                                        | In scope this phase.                                                                                                         |
| Growth BLOCK-2 (no ETA)                                                    | In scope — operator sets prep time on accept.                                                                                |
| Growth BLOCK-3 (no `channel`)                                              | Column added now.                                                                                                            |
| Growth BLOCK-4 (no consent capture)                                        | Consent checkbox + column added now.                                                                                         |

---

## Findings NOT resolved in discussion — planner MUST dispose of each explicitly

These are technical calls that belong to research/planning, not to the founder. Every one must appear in PLAN.md as either implemented or an explicitly recorded deferral.

**Money / correctness**

- CTO HIGH-7 — widening `cancel()` without fixing `wasPaid = snap.status === 'paid'` (`cancel-order.service.ts:33`) is a money bug: after the widening, an `accepted`/`preparing`/`ready` order is paid but that predicate reads false, so cancel would skip the refund. Must be `capturedMinor > 0` / payment-derived, not status-derived.
- Skeptic MED-5 — the Stripe refund call currently sits **inside** the DB transaction. With D-10 (order cancels even when the refund fails) this must be restructured: persist the cancel, then attempt the refund outside the tx, then record the refund outcome.
- CTO MED-1 / Skeptic MED-3 — `RefundsController` has neither `@BrandNeutral` nor `@LocationNeutral`; an owner in `?location=all` mode 403s before reaching it. Every new operator order route needs its guard decorators audited against the 08.4/08.5 model.
- CTO HIGH-9 — `LocationPermissionChecker` is still unwired (08.4 gap (b)) and Phase 10 is the first phase where per-location roles are load-bearing for a write path. Wire it or record a third explicit re-defer.

**Data / events**

- CTO HIGH-10 — `ordering.*` payloads lack `locationId`; `OrderPaidV1` is emitted with hardcoded `total: 0, currency: 'USD'`. Fix while adding fields.
- Growth HIGH-7 — `OrderStatusChangedV1` carries no actor. Add `actorUserId` (WeakMap-stash pattern from 08.3 exists).
- Growth MED-12 — order events / feed payloads must not carry guest PII (matches the existing `OrderCreatedV1Payload` GDPR minimisation, T-07-PII).
- Growth MED-18 — orders are inserted at `status='created'` **before** payment, which makes `count(orders)` the correct ANL-04 conversion denominator. Record as an invariant so a future stale-order sweep does not silently break Phase 13.
- Skeptic HIGH-4 / CTO MED-3 — no index supports the feed query.

**Infrastructure**

- Skeptic HIGH-3 / CTO HIGH-5 — rate limiting is one shared per-IP bucket of 60/min. A restaurant is a single NAT; 5s polling from 3-4 devices exhausts it before any other traffic. Must be fixed for polling to work at all.
- Product MED-17 — two devices pressing Accept on the same order (concurrent transition) needs a defined outcome.
- Product MED-18 — on reconnect/refocus the feed must backfill missed orders, not merely resume.

**Guest surface**

- Skeptic MED-7 — `GET /v1/orders/:id/status` is `@Public()` and returns `total` + `orderNumber` to anyone holding the UUID. It is a capability URL; decide whether that is acceptable and pin the contract (Product LOW-20) before the guest tracker starts consuming more of it.
- Growth HIGH-10 — guest emails have no link back to the live status page.
- Growth HIGH-11 / Product LOW-22 — `send-guest-notification.service.ts:59` hardcodes `const locale = 'ru'` and `:60` falls back to `brandName ?? 'RestOS'` — a white-label leak into guest email. Fix the fallback at minimum.
- Growth MED-15 — pickup instructions and location contact never reach the guest.
- Growth MED-13 — normalize phone to E.164 at write time (CRM natural key for this market).

**Scope honesty**

- Skeptic HIGH-6 — delivery orders currently have zero delivery fee, no zone, no address validation, and no dispatch state. Phase 9 is in MVP-2, so "on its way" is a phantom state. The feed must not render a delivery lifecycle the backend cannot back.
- Product MED-14 / Growth LOW-19 — no manual/phone order entry; do not shape the schema so it is hard to add.
- Product LOW-21 — the empty feed is the tenant's activation moment; design the empty state deliberately.

**Test fidelity (non-negotiable)**

- Skeptic "Test-fidelity requirement" section — the C-1 bug survived because specs asserted a mocked repo and an in-memory aggregate. Every status transition in this phase needs an assertion that reads the row back from the database. This matches the project memory `verify-feature-not-call-shape` and the Phase 8 live-smoke lesson.

---

## Notable disagreement

**Product HIGH-4 wants a full-screen operational mode; the founder chose a dedicated page inside the admin shell (D-01).** Product's argument is that a counter/kitchen surface inside a sidebar-and-breadcrumbs shell is a demo, not an operational tool. The founder's counter-argument is delivery speed for MVP-1 close. Recorded, not overruled — revisit after the first paying customer actually runs a service on it.

**Skeptic recommends cutting SSE outright; CTO recommends polling now with SSE as an env-flagged abandonable slice.** The founder took the middle path: polling now, SSE as its own later phase. This keeps ORDINT-02/09 alive on the roadmap rather than deleting them.
