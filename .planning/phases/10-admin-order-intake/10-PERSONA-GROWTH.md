# Growth Marketer Review — Phase 10: Admin Order Intake

> Pre-planning persona review. Reviewed against the current `main`-line codebase (branch `admin-vite-spa`), `.planning/ROADMAP.md` §Phase 10, `.planning/REQUIREMENTS.md` ORDINT-01..10, `.planning/PROJECT.md`.
> Severity per dispatch: **BLOCK** (phase should not be planned without this) / **HIGH** / **MED** / **LOW**.

## TL;DR

- **The guest never sees the thing this phase builds.** `apps/website/components/checkout/order-status-poller.tsx:10` treats `paid` as a terminal status and stops polling. Phase 10 adds `accepted → preparing → ready → completed`, and the guest-facing page will render none of it. Fixing this is ~15 lines and is the entire "wow".
- **Three data fields are cheap now and unrecoverable later**: `orders.channel`, per-stage transition timestamps, and a cancel/reject **reason enum**. None exist today (`packages/db/src/schema/ordering.ts:18-75`). ORDINT-08 literally requires channel filtering and the column does not exist. Phase 13 (Analytics) and Phase 12 (CRM) are a retrofit-with-data-loss without these.
- **There is zero consent capture anywhere in the repo** (`grep -rn "consent|marketing_opt|optIn" apps packages` → 0 hits). Orders collect name/phone/email under contract-performance basis, which is a fulfilment base, not a marketing base. Phase 12 CRM-01 ("customer record on first order") builds a list RestOS cannot legally mail. 4 columns + one unticked checkbox now vs. a re-permission campaign against a cold list later.

---

## Growth Surface Map (Phase 10 scope)

| Lever                                                | Status                         | Evidence                                                                                                                                                                                    |
| ---------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Guest live order-status page                         | **partial — dies at `paid`**   | `apps/website/components/checkout/order-status-poller.tsx:10`, `:53-56`                                                                                                                     |
| Operator-promised ETA                                | **missing**                    | `orders.controller.ts:64` maps `eta` ← `scheduledFor` (guest-requested, `null` for all ASAP orders); `locations` has no prep-time column (`packages/db/src/schema/brands.ts:126-152`)       |
| Guest email → back to status page                    | **missing**                    | no URL in any template body, `apps/api/src/contexts/notifications/infrastructure/guest-email-templates.ts:45-87`                                                                            |
| Order channel (qr vs site)                           | **missing entirely**           | no column (`schema/ordering.ts`), no DTO field (`ordering/application/dto.ts:22-63`), no event field (`packages/events/src/contracts/ordering.ts:5-14`) — yet ORDINT-08 requires the filter |
| Per-stage timestamps (accept latency, prep duration) | **missing**                    | `orders` has only `created_at`/`updated_at`; `updated_at` is overwritten on every transition (`order.aggregate.ts:243-320`)                                                                 |
| Cancel / reject reason taxonomy                      | **free text**                  | `Order.cancel(reason: string)` `order.aggregate.ts:307`; `OrderCanceledV1Payload.reason: z.string()` `contracts/ordering.ts:37-41`                                                          |
| Actor on status transitions                          | **missing**                    | aggregate transition methods take no actor; `OrderStatusChangedV1Payload` has no `actorUserId`                                                                                              |
| Marketing consent + proof-of-consent                 | **missing (0 hits repo-wide)** | `schema/ordering.ts:31-33` stores PII with no consent columns                                                                                                                               |
| Phone normalization (CRM natural key)                | **missing**                    | `customerPhone: z.string().max(30)` `dto.ts:28` — raw string                                                                                                                                |
| Operator new-order alert (sound/badge/desktop)       | **missing**                    | no such component in `apps/admin/src/components/`                                                                                                                                           |
| Operator DAU / feed-engagement signal                | **missing**                    | no SSE infra exists yet anywhere (`grep -rln "text/event-stream                                                                                                                             | EventSource"` → 0) |
| Order feed on the landing screen                     | **not planned**                | `apps/admin/src/routes/(protected)/$brandSlug/index.tsx:28-29` explicitly defers ("order feed is Phase 10")                                                                                 |
| qr-menu order submission                             | **does not exist**             | `apps/qr-menu/src/` has cart + menu only; no `POST /v1/orders` call anywhere                                                                                                                |

---

## Top Growth Strengths

1. **The revenue spine is genuinely complete and event-sourced.** Order aggregate emits `OrderCreated / OrderPaid / OrderStatusChanged / OrderCanceled / OrderRefunded` through a transactional outbox (`ordering/infrastructure/order-drizzle.repository.ts:111,148`). Phase 10's operator actions ride existing rails — every instrumentation ask in this review is an _additive field on an existing event_, not a new pipeline. That is unusually cheap; take advantage of it while the code is being touched.
2. **Guest notification pipeline is already live and idempotent.** `nats-guest-notification.subscriber.ts` already subscribes to `ordering.order_status_changed.v1` and fires on `accepted` and `ready` (`:136-140`). Phase 10's transitions will send guest emails **on day one with no extra work** — the operator gets "my restaurant emails guests automatically" for free in the demo.
3. **Brand theming reaches the guest already.** `send-guest-notification.service.ts:61-63` passes brand logo + accent into templates. The white-label story is real, not aspirational — worth showing in every sales call.
4. **`order: ['read','update-status']` RBAC already exists** (`packages/domain/src/rbac/permissions.ts:3`) and location scoping shipped in 08.4/08.5. A multi-location chain can give each kitchen its own feed without new access-control work — that is the upsell path from single-location to chain.

---

## Top Growth Gaps (severity-classified)

### BLOCK-1 — The guest status page stops at `paid`; Phase 10's whole output is invisible to the guest

**Funnel stage:** post-purchase / activation / word-of-mouth.
`apps/website/components/checkout/order-status-poller.tsx:10`:

```ts
const TERMINAL_STATUSES = new Set(['paid', 'failed', 'canceled', 'refunded']);
```

Polling halts the instant payment confirms. The page then renders "Payment confirmed" forever. Everything Phase 10 builds — accept, preparing, ready — is invisible on the surface the guest actually looks at. Additionally the page prints the raw enum (`{status.status.replace('_',' ')}` with `capitalize`, `:88`) so a guest sees **"Requires action"** / **"Preparing"** as internal-looking strings.

**Recommendation (plannable):**

- `TERMINAL_STATUSES = { 'completed', 'canceled', 'refunded', 'failed' }`.
- Poll cadence by status: `created/requires_action` 1→3s (payment confirm), `paid` 5s (waiting on accept — this is the highest-anxiety window), `accepted/preparing` 15s, `ready` 30s.
- Replace the raw-enum `<dd>` with a 6-step visual tracker (Paid → Accepted → Preparing → Ready → Picked up), localized copy per status, current step highlighted.
- Add a `retry`/stale indicator so a guest on flaky mobile sees "reconnecting", not a frozen page.

### BLOCK-2 — There is no ETA, and both the page and the email have a dead `eta` slot pretending there is

**Funnel stage:** post-purchase anxiety → support-call volume → repeat rate.
`orders.controller.ts:64` maps `eta` from `snapshot.scheduledFor` — the **guest-requested** schedule time, which is `null` for every ASAP order (the overwhelming majority). So the ETA row on the status page never renders. Worse: the email templates _already accept_ an `eta` var (`guest-email-templates.ts:45,57,70,82`) and `send-guest-notification.service.ts:83-89` never passes it. Two surfaces, both wired for ETA, both permanently empty.

"When will my food be ready" is the single most-asked question in restaurant ordering, and a clock time is the most visible modern-vs-generic signal a restaurant can show. Without it Phase 10 ships a status page that says "Preparing" with no horizon.

**Recommendation (plannable):**

- Add `orders.promised_ready_at timestamptz` (nullable).
- Accept action takes a prep estimate: `POST /v1/admin/orders/:id/accept { prepMinutes }` with one-tap presets (15 / 25 / 40 min) and a per-location default.
- Add `locations.default_prep_minutes smallint not null default 20` — `locations` currently has no time-related column at all beyond `timezone` (`schema/brands.ts:126-152`), so the default has nowhere to live today.
- `GET /v1/orders/:id/status` returns `eta = promised_ready_at ?? scheduledFor` and a `etaSource: 'operator' | 'scheduled' | null`.
- Pass `eta` into the notification vars in `send-guest-notification.service.ts` — the template already renders it, this is a 3-line change that instantly upgrades every confirmation and accepted email.
- Analytics byproduct: `ready_at - promised_ready_at` = **promise accuracy**, which is the metric that later sells "RestOS makes you look reliable".

### BLOCK-3 — `channel` does not exist; ORDINT-08 cannot be built, and the value is unrecoverable retroactively

**Funnel stage:** attribution for every channel decision RestOS and its tenants make.
ORDINT-08 requires "filters orders by status / date / **channel (qr-menu vs site)**". There is no `channel` column on `orders`, no `channel` in `CreateOrderInputSchema` (`ordering/application/dto.ts:22-63`), and no `channel` in `OrderCreatedV1Payload` (`packages/events/src/contracts/ordering.ts:5-14`). You cannot infer channel from a historical row — `fulfillmentMode` is not a proxy (a `dine_in` order could come from site, a `pickup` from qr).

Separately, an honesty flag for the plan: **`apps/qr-menu` has no order-submission path at all** (only menu + cart + availability API — `apps/qr-menu/src/api/`). So in production the channel filter will have exactly one value until qr ordering ships. Either explicitly scope this as forward-compatible plumbing, or ORDINT-08's channel criterion is untestable end-to-end.

**Recommendation (plannable):**

- Migration: `orders.channel text not null default 'site'` + `CHECK (channel IN ('site','qr','admin','telegram','api'))`. Include `'admin'` and `'telegram'` in the enum **now** — adding a value to a CHECK constraint later is a migration; getting it right on the first write is free.
- `CreateOrderInputSchema` gains `channel: z.enum([...]).default('site')`, server-validated (never trusted for pricing/authz, only for attribution).
- `OrderCreatedV1Payload` gains `channel` — so Phase 13's warehouse pipe reads it off the event stream, not a join.
- Also add `orders.source_ref text` (nullable, max 200) to hold a UTM/campaign/table-QR identifier. A QR sticker per table, per city, per flyer is the tenant's own growth loop; if the QR carries `?src=table-7` and nothing persists it, that loop is unmeasurable forever. Costs one nullable column now.

### BLOCK-4 — Zero consent capture; Phase 12 CRM will build a list that cannot legally be mailed

**Funnel stage:** retention / lifecycle marketing / the entire CRM thesis.
`grep -rn "consent\|marketingOptIn\|marketing_opt\|optIn" apps packages` returns **nothing**. `orders` stores `customer_name`, `customer_phone`, `customer_email` (`schema/ordering.ts:31-33`). Under GDPR Art. 6(1)(b) that is fine for **fulfilling the order** — transactional emails need no opt-in. It is _not_ a lawful basis for "we have a new menu" campaigns. CRM-01 says "Customer record created on first order (phone + email as natural keys)". Whoever builds Phase 12 will look at that table and treat it as a mailing list.

The expensive part is not the boolean — it is **proving what the guest agreed to**. Regulators and Resend/ESP compliance both ask "show me the wording and the timestamp". Reconstructing that after 5,000 orders is impossible.

**Recommendation (plannable) — 4 columns, one checkbox:**

- `orders.marketing_opt_in boolean not null default false`
- `orders.marketing_opt_in_at timestamptz`
- `orders.consent_version text` (e.g. `'checkout-v1'`)
- `orders.consent_text_hash text` — sha256 of the exact wording rendered to the guest, so the wording is provable per-order even after copy changes.
- Checkout UI (`apps/website/app/checkout/page.tsx`): **unticked** checkbox, wording separating **order updates** (transactional, no consent) from **offers and news** (consent). Never pre-ticked — a pre-ticked box is invalid consent under GDPR and it poisons deliverability.
- `OrderCreatedV1Payload.marketingOptIn: boolean` so the Phase 12 list is derivable from the event stream without a backfill.
- Per-brand, not per-tenant, consent scope — a guest of Brand A did not consent to Brand B's mail. `orders.brand_id` already exists; make the Phase 12 contract explicit in this phase's notes.

### HIGH-5 — Per-stage timestamps: the four operator metrics Phase 13 needs are being destroyed on every transition

**Funnel stage:** operator SLA, guest anxiety, churn early-warning, and the "which restaurants are actually using this" question.
`orders` has `created_at` and `updated_at` only. Every transition in `order.aggregate.ts:243-320` does `{...snapshot, status, updatedAt: now}` — the previous stage's timestamp is overwritten and gone. The `ordering.order_status_changed.v1` events survive in the outbox/NATS, but reconstructing durations from an event stream in a SQL dashboard is a Phase-13 tax nobody will pay.

**Recommendation (plannable):** widen `orders` with nullable timestamps set inside the existing aggregate transitions:
`paid_at, accepted_at, rejected_at, preparing_at, ready_at, completed_at, canceled_at`.
That yields, permanently and with a single-table query:
| Metric | Formula | Why it matters |
|---|---|---|
| **Accept latency** | `accepted_at - paid_at` | #1 operator SLA + #1 guest-anxiety driver; the number that tells you a tenant is about to churn |
| **Reject rate** | `count(rejected_at) / count(paid_at)` | a spiking reject rate = stop-list neglect = refund volume = chargeback risk |
| **Prep duration** | `ready_at - preparing_at` | powers the ETA default in BLOCK-2 after 2 weeks of data (self-improving promise) |
| **Handover lag** | `completed_at - ready_at` | pickup friction; drives "food sat under the lamp" complaints |
| **Promise accuracy** | `ready_at - promised_ready_at` | the sales-deck metric |

An append-only `order_status_transitions` table is the DDD-purer option; the 7-column widening is one migration, needs no join, and is what a solo founder can actually query at 1am. Recommend the columns; keep transitions as the event stream that already exists.

### HIGH-6 — Cancel and reject reasons are free text; "top cancel reason" will never be buildable

**Funnel stage:** operator diagnostics, refund reduction, churn prediction.
`Order.cancel(reason: string)` (`order.aggregate.ts:307`) and `OrderCanceledV1Payload.reason: z.string()` (`contracts/ordering.ts:37-41`) accept anything. Success criterion 4 says "cancels an order with a reason" — if that reason is a text box, then in 6 months the data is `["нет продукта", "no stock", "sorry", "-", "кухня"]`. Unanalysable. Free-text reasons cannot answer "should we build stop-list automation?" or "is this tenant about to leave?".

**Recommendation (plannable):**

- Enum, chosen now: `out_of_stock | kitchen_overloaded | closing_soon | guest_requested | payment_issue | address_unserviceable | duplicate | other`.
- Structured payload: `{ reasonCode: <enum>, reasonNote?: string (max 500) }`. Note only required when `other`.
- Same enum on **reject** (ORDINT-03) — reject and cancel share the taxonomy so the funnel report is one query.
- `OrderCanceledV1Payload` becomes `{ reasonCode, reasonNote? }` (additive; keep `reason` as a deprecated alias for one release if the outbox has live rows).
- Growth payoff: "38% of your rejections are out-of-stock — turn on stop-list sync" is an in-product upsell that only exists if the enum exists.

### HIGH-7 — Status-change events carry no actor; "who accepted / who is slow" is unanswerable

`OrderStatusChangedV1Payload` (`contracts/ordering.ts:60-66`) = `{orderId, tenantId, previousStatus, newStatus, reason?}`. Aggregate transitions take no actor. With 08.3 roles and 08.4 location scoping now shipped, a multi-location tenant will immediately ask "which location/person is holding orders". Adding actor later means every historical transition is anonymous.

**Recommendation:** additive optional fields on the v1 payload (Zod-compatible, no version bump): `actorUserId`, `actorRole`, `brandId`, `locationId`, `channel`, `sinceStatusMs`. Emit at the controller/service boundary where `req.principal` already exists (`identity/domain/principal.ts`).

### HIGH-8 — No audible/visual new-order alert; a silent feed loses to the kitchen printer on day one

**Funnel stage:** operator activation → daily-active → retention.
There is no notification infrastructure in `apps/admin/src/components/`. An operator will not stare at a browser tab during service. If the first missed order happens because the tab was silent or the SSE connection dropped unnoticed, that restaurant reverts to phone orders and never comes back — and they will blame RestOS for the lost sale, correctly.

**Recommendation (plannable, all client-side, all cheap):**

- Looping audio alert on `order_paid` until the operator acknowledges; per-user mute/volume toggle persisted in localStorage.
- `document.title` badge (`(2) RestOS`) so it works when the tab is backgrounded.
- Web `Notification` API permission ask, with a soft in-app prompt first (never a cold browser prompt — it gets permanently denied).
- **A connection-state pill: `Live` / `Reconnecting…` / `Offline`.** ORDINT-09 handles graceful shutdown with `retry:`; the operator still needs to _see_ the state. Silent SSE loss is the single most likely cause of a "RestOS lost my order" support ticket.
- Unacknowledged-order counter that persists across reload (derived from `paid` orders with `accepted_at IS NULL`), so a page refresh never loses a pending order.

### HIGH-9 — The order feed must own the landing screen for post-first-order brands

`apps/admin/src/routes/(protected)/$brandSlug/index.tsx:28-29` currently renders the Setup Checklist + Today's-86 widget and explicitly notes "order feed is Phase 10". If the feed lands at `/{brand}/orders` and the landing stays a setup checklist, the operator bookmarks the orders URL, the landing rots, and RestOS loses the one screen it gets to own during service.

**Recommendation:** conditional landing — brand has ≥1 paid order → the live feed renders above the fold and the setup checklist collapses into a dismissible one-line strip; zero paid orders → today's onboarding behaviour unchanged. This costs one conditional and is the highest-leverage retention change available in this phase.

### HIGH-10 — Guest emails have no link back to the live status page

`guest-email-templates.ts:45-87` — no URL in any body. The email is the durable artifact the guest keeps; the status page is ephemeral in a closed tab. Without a link, the confirmation email is a dead end and the live tracker (the expensive thing this phase builds) gets one view.

**Recommendation:** add a `statusUrl` template var → `https://<brand primary domain>/checkout/confirmation/<orderId>`. The primary domain is already resolvable (`brand_domains.isPrimary`, `schema/brands.ts:90-122`). Ship it in `order_confirmation` and `order_accepted`. This is a 1-hour change that roughly doubles status-page sessions per order and directly cuts "where is my food" phone calls.

### HIGH-11 — Guest emails are hardcoded `ru`, and the whole guest checkout/confirmation surface is hardcoded English

`send-guest-notification.service.ts:59`: `const locale = 'ru';` — an English-locale brand's guests get Russian email. Meanwhile `apps/website/components/checkout/*` and `app/checkout/confirmation/[orderId]/page.tsx` contain inline English strings with no dictionary usage, despite `apps/website/lib/i18n/` existing. So for the actual target market (RU/CIS restaurants) the demo shows a **Russian-branded restaurant with an English order page and a Russian email**. That is a credibility hit in the exact moment the prospect is deciding.

**Recommendation:** resolve locale from `brands.locale` (column exists, `schema/brands.ts:32`) with request-locale fallback; route the confirmation/status page through `lib/i18n`. Localize the status labels introduced in BLOCK-1 at the same time — they are new strings either way, so this is nearly free _if done now_ and a re-touch of every guest-facing string later.

### MED-12 — SSE payloads must not carry guest PII (GDPR + future replay)

Phase 10 will push order data over SSE. If the SSE frame contains `customerName / customerPhone / customerEmail`, that PII lands in proxy logs, CDN buffers, browser memory across tabs, and — if anyone ever bridges the feed off NATS — into event retention where the CRM-04 per-guest erasure path cannot reach it. Note `tenancy_erase_tenant` (migration 0051) is a _tenant offboarding_ tool that hard-deletes all orders; there is no per-guest erasure path yet (CRM-04, Phase 12).

**Recommendation:** SSE frame = `{ orderId, orderNumber, status, updatedAt, version }` only. The client re-fetches full detail over the authenticated REST endpoint. Keeps PII in exactly one place (`orders.customer_*`) so Phase 12's anonymization has a single target. State this as an explicit phase invariant so it survives the implementation.

### MED-13 — Normalize phone to E.164 at write time; it is the CRM natural key for this market

`customerPhone: z.string().max(30)` (`dto.ts:28`) stores whatever the guest typed. CRM-01 names phone as a natural key. `+7 999 123-45-67`, `8 (999) 1234567`, and `79991234567` are the same guest and three CRM records. Deduping live data across a tenant's order history later is a data-cleanup project; normalizing at write is a library call.

**Recommendation:** add `orders.customer_phone_e164 text` (nullable — normalization can fail), populate at create, keep the raw string for display. Index `(tenant_id, customer_phone_e164)`. Also note: the notification pipeline is **email-only** (`send-guest-notification.service.ts:48-54` bails when `customerEmail` is null) while `customerEmail` is _optional_ at checkout (`dto.ts:29`) and phone is required — so a meaningful share of paying guests get zero post-purchase communication today. Worth a MED note even though SMS/WhatsApp is out of MVP-1 scope: at minimum the status page should be the fallback channel and the checkout should nudge email with a benefit ("get your receipt and ready-notification").

### MED-14 — Order number is 14 characters; the guest has to read it aloud and the operator has to find it

`generateOrderNumber()` (`dto.ts:79-89`) produces `20260810-A7K2Q`. Industry norm at the counter is a short daily number (`#42`). This string appears in the email subject, on the status page, and in the demo. It reads as machine-generated, which is the exact opposite of the "modern, made-for-restaurants" signal the phase is trying to send.

**Recommendation:** add `orders.daily_number int` — per location, per calendar day (location `timezone` already exists), assigned at order creation. Display `#42` everywhere guest- and operator-facing; keep the current string as the internal `order_number`. Do it now: after real orders exist, every receipt and email in the wild carries the old form and the change becomes a support-communication problem.

### MED-15 — Pickup instructions and location contact never reach the guest

`locations.address` and `locations.contacts` exist (`schema/brands.ts:126-152`) and nothing surfaces them. For a pickup order the two live questions are "where exactly" and "who do I call". The status page shows neither.

**Recommendation:** `GET /v1/orders/:id/status` returns `location: { name, address, phone }` and, when status is `ready`, the page shows a "Get directions" map link + tap-to-call. Both are ~free from existing data and they are what a guest screenshots and sends to a friend.

### MED-16 — Operator feed engagement has no signal; you will not know if RestOS is the primary screen

Retention for a solo founder pre-PMF is measured by "is the feed open during service". The SSE handler is being written in this phase — attaching telemetry to it is nearly free; retrofitting means a new endpoint and a client change.

**Recommendation:** on SSE subscribe/close emit an internal analytics/audit row `{tenantId, brandId, locationId, userId, connectedAt, durationMs, ordersSeen, ordersActioned}`. Two derived numbers you get immediately: **operator DAU** and **minutes-with-feed-open per service**. These are the leading indicators of churn, ~6 weeks before revenue shows it.

### MED-17 — "Today at a glance" counters belong on the feed now, not in Phase 13

Orders today / revenue today / average accept time — three aggregates over `orders` scoped to location + today. This is not the ANL dashboard; it is the number the owner screenshots at the end of service. It also converts Phase 13 from "first reveal" into "refinement", de-risking that phase.

**Recommendation:** a 3-tile strip above the feed. Requires the timestamps from HIGH-5 for the accept-time tile — another reason to land those columns in this phase.

### MED-18 — ANL-04's conversion denominator depends on `created` orders never being swept

ANL-04 defines conversion as `paid_orders / checkout_initiations`. Today an order row is inserted at `POST /v1/orders` with `status='created'` **before** payment — so `count(orders)` _is_ the correct denominator. That is a genuine, accidental strength. It breaks the moment someone adds a "clean up stale unpaid orders" job.

**Recommendation:** write this down as an invariant in the phase artifacts, and if a stale-order sweep is added, transition to `status='failed'` with `failed_at` set rather than deleting (hard deletes are already forbidden by the `resto_app` grant, so this mostly needs to be _documented_ so nobody adds an archive-and-forget path).

### LOW-19 — Don't design the schema so a manual/phone order is hard to add later

If an operator has to enter phone orders into their POS _and_ watch RestOS, RestOS is the second screen and loses. A manual "create order in admin" is correctly out of MVP-1 scope — but `channel` must already accept `'admin'` (covered in BLOCK-3) and the accept flow must not assume a payment record exists. One enum value and one nullable assumption.

### LOW-20 — Status page `robots: noindex` is correct; keep it

`app/checkout/confirmation/[orderId]/page.tsx:9` sets `robots: { index: false }`. Correct — order pages must never be indexed. Noting it explicitly so a later "add SEO everywhere" pass does not remove it. The order-id-as-bearer-token model (`@Public()` + UUID, `orders.controller.ts:32,52`) is acceptable for MVP-1 given UUIDv4 entropy, but do not add a guessable short id to that route when adding `daily_number` (MED-14) — display it, never route on it.

---

## Guest Order → "Wow" Funnel Trace

| Step                              | API call                                            | Emitted today                                                                  | Tracked today                | Gap                                                                                                 |
| --------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------- |
| Guest builds cart                 | `GET /v1/menu` (edge-cached)                        | —                                                                              | —                            | no cart/checkout-start client event; ANL-04 uses order rows instead (MED-18)                        |
| Guest submits order               | `POST /v1/orders` → `ordering.order_created.v1`     | `{orderId, brandId, orderNumber, fulfillmentMode, total, currency, itemCount}` | order row `status='created'` | **no `channel`, no `marketingOptIn`, no `source_ref`** (BLOCK-3, BLOCK-4)                           |
| Guest pays                        | Stripe PI → `payments.*` → `ordering.order_paid.v1` | `{orderId, paymentId, total, currency}`                                        | order `status='paid'`        | **no `paid_at`** (HIGH-5)                                                                           |
| Confirmation email                | `guest-notifications-payments` consumer → Resend    | `order_confirmation`                                                           | Resend delivery only         | no `statusUrl` (HIGH-10), no `eta` (BLOCK-2), locale hardcoded `ru` (HIGH-11)                       |
| Guest lands on status page        | `GET /v1/orders/:id/status`                         | `{status,total,currency,orderNumber,eta}`                                      | none                         | `eta` always null (BLOCK-2); **polling stops here forever** (BLOCK-1)                               |
| Operator sees order               | _(Phase 10 SSE)_                                    | —                                                                              | —                            | no sound/badge/connection state (HIGH-8); not on landing screen (HIGH-9)                            |
| Operator accepts                  | _(Phase 10)_ → `order_status_changed.v1`            | `{previousStatus,newStatus}`                                                   | —                            | no actor (HIGH-7), no `accepted_at` (HIGH-5), no prep estimate (BLOCK-2)                            |
| Accepted email                    | existing consumer, already wired `:136-140`         | `order_accepted`                                                               | —                            | works today — **free win**, just needs `eta` + `statusUrl`                                          |
| Guest sees "Accepted / Preparing" | polling                                             | —                                                                              | —                            | **never renders** (BLOCK-1)                                                                         |
| Operator marks ready              | _(Phase 10)_                                        | `order_status_changed.v1`                                                      | —                            | no `ready_at`, no prep duration (HIGH-5)                                                            |
| Ready email                       | existing consumer                                   | `order_ready`                                                                  | —                            | body is `"Order #X is ready for pickup!"` with no location/address (MED-15)                         |
| Guest picks up                    | _(Phase 10 complete)_                               | `order_status_changed.v1`                                                      | —                            | no `completed_at`; no reorder CTA anywhere                                                          |
| Reject / cancel                   | _(Phase 10)_ + auto-refund                          | `order_canceled.v1 {reason: string}`                                           | —                            | free-text reason (HIGH-6)                                                                           |
| Repeat order                      | —                                                   | —                                                                              | —                            | no reorder link on the status page or in any email; no consent to ever contact them again (BLOCK-4) |

**The single highest-value addition to this trace:** a **"Order again"** button on the status page once `status = completed`, deep-linking back to the brand's menu with the previous cart pre-filled (cart is already a shared package, `@resto/cart`). One button, at the moment of maximum satisfaction, is the cheapest repeat-purchase loop available and it exists in every competitor's product.

---

## Sales / Demo Value — the one visible thing

**The two-screen live demo.** Phone in the prospect's hand showing the guest status page; laptop showing the admin feed. The founder places an order on the phone → the laptop _dings_ → founder taps "Accept, 20 min" → the phone updates to "Accepted · ready by 19:25" → "Preparing" → "Ready" → phone buzzes with the email. Forty seconds, no explanation needed, and it is a thing a restaurant owner has personally waited for as a customer.

That demo requires exactly three things from this review to be on the critical path: **BLOCK-1** (status beyond `paid`), **BLOCK-2** (operator ETA), **HIGH-8** (audible alert). Without any one of them, the demo is a static "Payment confirmed" screen and an admin table — which is indistinguishable from a spreadsheet.

**Recommend adding as a Phase 10 success criterion:**

> 6. A full order lifecycle (paid → accepted → preparing → ready → completed) is observable on two devices simultaneously in under 60 seconds, with no manual refresh on either surface, and a guest-visible clock ETA from the accept action.

**Also recommend:** a `pnpm demo:order` script that injects a paid order into a seeded demo brand (`.planning/seeds/` and the existing seed CLI make this cheap). The founder should never need a real card or a second phone to run a sales call, and a demo that fails on a flaky café wifi loses the deal.

---

## Cheap Now / Expensive Later — the checklist

| Item                                     | Cost now                                                         | Cost later                                                      | Severity |
| ---------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------- | -------- |
| `orders.channel` + event field           | 1 migration + 1 enum                                             | **unrecoverable** for historical rows                           | BLOCK-3  |
| `paid_at … completed_at` timestamps      | 1 migration + 7 assignments in an aggregate already being edited | unrecoverable; forces an event-stream replay project            | HIGH-5   |
| Cancel/reject reason enum                | one enum decision                                                | data migration + operator retraining + a period of garbage data | HIGH-6   |
| `marketing_opt_in` + `consent_text_hash` | 4 columns + 1 checkbox                                           | re-permission campaign against a cold list; ~70-90% attrition   | BLOCK-4  |
| Phone E.164 normalization                | 1 column + 1 library call                                        | dedup project across live CRM data                              | MED-13   |
| Actor on status events                   | additive optional fields                                         | historical transitions permanently anonymous                    | HIGH-7   |
| `daily_number`                           | 1 column + assignment                                            | every receipt/email in the wild carries the old form            | MED-14   |
| PII-free SSE payload                     | a design decision                                                | PII in event retention, outside the erasure path                | MED-12   |
| SSE connection telemetry                 | ~20 lines in a handler being written anyway                      | new endpoint + client release                                   | MED-16   |
| Localized guest surface                  | new strings are being written anyway                             | re-touch every guest-facing string                              | HIGH-11  |

---

## Phase 10 Growth Scorecard (as currently specified, 0-10)

| Dimension                              | Score | Notes                                                                                                                                                                                                  |
| -------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Guest post-purchase experience ("wow") | **3** | Live tracker specified, but the existing client stops at `paid` and ETA is structurally impossible (BLOCK-1, BLOCK-2). Emails already fire — the raw material is better than the surface.              |
| Funnel / analytics instrumentation     | **2** | No channel, no per-stage timestamps, no actor, free-text reasons. Phase 13 becomes archaeology.                                                                                                        |
| Operator retention / stickiness        | **4** | SSE feed + status transitions are the right spine; no alerting, no connection state, not on the landing screen, no at-a-glance numbers.                                                                |
| Guest data capture & GDPR posture      | **3** | PII collected correctly under contract basis with RLS + tenant erasure; **zero** marketing consent, no per-guest erasure path, no phone normalization.                                                 |
| Demo / sales value                     | **5** | The two-screen demo is _nearly_ there and is genuinely strong — gated on three fixes.                                                                                                                  |
| Viral / repeat loops                   | **1** | No reorder CTA, no share, no status-page link in email, no source attribution on QR codes.                                                                                                             |
| Guest-facing copy & brand hygiene      | **3** | Raw enum statuses, 14-char order numbers, English-only checkout for a RU market, `locale='ru'` hardcoded in email, `brandName ?? 'RestOS'` white-label leak (`send-guest-notification.service.ts:60`). |

**Overall: 21 / 70** — and that is a _specification_ score, not a code score. Every gap above is additive to work already in the phase; none require a new subsystem. A revised Phase 10 that absorbs the four BLOCKs and HIGH-5/6/8/9/10 scores in the high 40s for maybe 20-25% additional effort, almost all of it schema decisions made once.

---

## Top 3 Recommendations (in plan order)

1. **Land the four data decisions in the first migration wave, before any UI plan is written** — `channel`, per-stage timestamps, reason enum, consent columns (+ `phone_e164`, `daily_number`, `source_ref`). One migration, one aggregate pass, three event-contract field additions. This is the only part of this review that is genuinely unrecoverable later, and it is the cheapest part. **~1 day.**
2. **Make the guest status page finish the story** — terminal-status fix, operator-set ETA end-to-end (accept action → `promised_ready_at` → status response → email vars), localized human-readable status steps, location/pickup block, `statusUrl` in emails, "Order again" on completion. This is the wow moment, the demo, and the repeat loop in one workstream. **~2-3 days.**
3. **Make the feed the screen they can't work without** — audible + tab-badge + desktop alert with a mute toggle, a `Live/Reconnecting` connection pill, persistent unacknowledged count, feed-on-landing for brands with ≥1 paid order, and a 3-tile today strip. Attach SSE connect/disconnect telemetry while writing the handler. **~2 days**, and it is the difference between a tool they open during service and a tab they close.

---

## What I Did NOT Review

- SSE transport mechanics, backpressure, Fastify/NestJS `Sse()` semantics, graceful-shutdown correctness (ORDINT-09) — CTO/skeptic lens.
- Refund correctness, Stripe reconciliation, double-refund protection (ORDINT-03/05/06) — covered by Phase 8's live smoke and the payments persona reviews.
- RLS/brand-scope/location-scope enforcement on the new order endpoints — 08.2/08.4 lens.
- Whether the state machine in `order.aggregate.ts` allows the transitions ORDINT-04 requires (e.g. `cancel()` currently rejects from `accepted`/`preparing` at `:307-310` — that is a functional-correctness question for the CTO reviewer, not a growth one, but flagging it since success criterion 4 implies cancelling accepted orders).
- Admin UI component structure, shadcn choices, table/virtualization performance for high order volume.
- Delivery-zone interactions (Phase 9, MVP-2) and delivery-driver surfaces.
- Pricing/packaging of RestOS itself (FIN-07), and whether order volume should gate plan tiers.
