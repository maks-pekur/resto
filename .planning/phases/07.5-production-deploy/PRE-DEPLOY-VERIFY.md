# Phase 7.5 Pre-Deploy Verification Record

**Date:** 2026-06-26
**Plan:** 07.5-04
**Branch:** admin-vite-spa

This document records the live verification of the two NATS-related correctness
preconditions that the persona reviews made load-bearing for the single-node NATS
decision (D-06), and the qr-menu same-origin requirement that shapes plan 08's CDN
routing. Downstream plans (07 — NATS prod config; 08 — Cloudflare routing) MUST
treat this document as an input constraint.

---

## 1. Outbox Decouples Order Acceptance from NATS (D-06 / Investor HIGH #3)

**Status:** VERIFIED (2026-06-26)
**Test file:** `apps/api/test/e2e/outbox-nats-decoupling.e2e.spec.ts`
**Commit:** 186e5ba

### Claim

A NATS outage does not block order acceptance. The order write commits atomically
to Postgres (outbox row durably queued) and events drain once the broker is available.

### Three assertions covered

1. **Order create succeeds while broker is absent and outbox row is durably queued (un-dispatched)**
   — `CreateOrderService.execute()` returns success and the `ordering.order_created.v1`
   row exists in `outbox_events` with `delivered_at IS NULL`. No NATS publisher is wired.

2. **Outbox rows drain once a publisher is wired and the dispatcher runs (broker recovery)**
   — After an `OutboxDispatcher.tick()` with an in-memory publisher, `result.delivered >= 1`,
   the `ordering.order_created.v1` envelope is in the published set, and
   `delivered_at IS NULL` count drops to 0.

3. **Outbox event survives a simulated mid-dispatch crash (visibility timeout makes it reclaimable)**
   — A crashing publisher causes `result.failed >= 1` and `result.delivered = 0`. After the
   visibility timeout the row is reclaimable; a recovery publisher drains it successfully.

### How the decoupling works (for plan 07 operators)

`apps/api/src/infrastructure/outbox-dispatcher.service.ts` no-ops at
`onApplicationBootstrap` when `publisher === null` (i.e. `NATS_DISABLED=true`).
Orders commit their `outbox_events` row in the same DB transaction as the order rows.
When NATS recovers and the service acquires the advisory lock, `OutboxDispatcher.tick()`
drains the backlog. No orders are lost; no manual intervention required.

---

## 2. DLQ / `max_deliver` Poison-Message Handling (D-06 CTO precondition / D-19)

**Status:** VERIFIED (2026-06-26, Phase 3 AUTH-10 test re-run)
**Test file:** `apps/api/test/e2e/nats-dlq-poison.e2e.spec.ts`
**Test name:** `AUTH-10 — NATS DLQ poison-message gating test (D-18) > routes a poison envelope to dlq.<subject> after max_deliver and emits alert envelope`

### Three assertions covered

1. **max_deliver reached** — handler is invoked exactly 5 times (`handlerInvocations === 5`)
   and the broker stops redelivering after the limit.

2. **Message lands in `dlq.<subject>`** — after the 5th attempt, `dlqBytes` is non-null;
   the DLQ subscriber on `dlq.<originalSubject>` receives the raw bytes.

3. **Alert envelope emitted** — an `identity.email_dispatch_failed.v1` row appears in
   `outbox_events` with `payload.reason = 'dlq_routed'`, `payload.originalSubject` matching
   the poisoned subject, and `payload.redeliveryCount >= 5`.

### Production NATS config required (for plan 07)

Every consumer MUST configure these values (see `packages/events/src/ports.ts`
`SubscribeOptions`):

| Setting           | Recommended value       | Why                                                                              |
| ----------------- | ----------------------- | -------------------------------------------------------------------------------- |
| `max_deliver`     | `5`                     | Bounds poison-message redelivery; routes to DLQ after 5 failed attempts          |
| `ack_wait`        | `30_000` ms (30 s)      | Must exceed slowest expected handler; prevents duplicate invocation from timeout |
| `max_ack_pending` | `> 1` (e.g. `10`)       | A NAK on one message must not block the whole subject behind the NAK timeout     |
| DLQ subject       | `dlq.<originalSubject>` | Receives the raw bytes; must be in the stream's subject list                     |

Plan 07 MUST provision the NATS stream with `dlq.>` in `subjects` (see `startRealStack`
→ `NatsJetStreamPublisher.connect({ subjects: [..., 'dlq.>'] })` for the pattern).

---

## 3. qr-menu Same-Origin Requirement (input to plan 08 CDN routing)

**Status:** DOCUMENTED
**Source file:** `apps/qr-menu/src/api/client.ts`
**Runbook reference:** `docs/runbooks/menu-edge-caching.md`

### The constraint

`apps/qr-menu/src/api/client.ts` fetches the menu API using **relative paths**:

```ts
const res = await fetch('/v1/menu', init); // fetchMenu
const res = await fetch('/v1/menu/availability', init); // fetchAvailability
```

There is no `VITE_API_ORIGIN` or any base URL in the qr-menu API client. The
browser resolves these relative to the page origin. This means:

**qr-menu MUST be served from the same origin as the API.**

If qr-menu is served from `https://menu.resto.app` and the API lives at
`https://api.resto.app`, every menu fetch will 404 (the CDN/static host has no
`/v1/menu` route). This is not a bug to fix in app code — it is a deploy
constraint.

### Required plan 08 CDN wiring

Plan 08 MUST configure a Cloudflare **proxy/rewrite rule** that rewrites
`/v1/menu*` requests on the qr-menu origin to the API:

```
Host: <brand>.menu.resto.app  →  /v1/menu*  →  proxy to api.resto.app/v1/menu*
```

This is the "same-origin path" recommended in `docs/runbooks/menu-edge-caching.md`:

> prefer the same-origin path: serve `/v1/menu*` from the qr-menu/website host
> via a proxy/rewrite to the API so the browser sends no `Origin` header and no
> CORS headers are added.

**Benefits of same-origin serving:**

- No CORS headers on menu reads; `Vary: Origin` is absent; CDN caches a single
  entry per brand host (not per-origin).
- Menu responses remain `Set-Cookie`-free and CDN-cacheable (enforced by the
  `menu-brand-response.e2e` test).

### Cross-origin apps (for contrast)

`apps/admin` and `apps/website` DO use an explicit API origin:

- `apps/admin`: `VITE_API_ORIGIN` env var (baked at build time)
- `apps/website`: `NEXT_PUBLIC_API_ORIGIN` env var

These apps are cross-origin with the API and use CORS (the API's `ADMIN_WEB_URL`
and `AUTH_COOKIE_DOMAIN` configuration). Only qr-menu uses relative paths and
requires same-origin serving.

### Deployment anti-pattern (do NOT do this)

Do NOT set `VITE_API_ORIGIN` on the qr-menu build to point at `api.resto.app`.
That variable does not exist in the qr-menu codebase and the fetch calls are
hardcoded as relative — adding such a var would silently have no effect.

---

## Summary Table

| Precondition                                | Test                                               | Status     |
| ------------------------------------------- | -------------------------------------------------- | ---------- |
| Outbox decouples order acceptance from NATS | `outbox-nats-decoupling.e2e.spec.ts` (3 tests)     | VERIFIED   |
| DLQ / `max_deliver` poison-message handling | `nats-dlq-poison.e2e.spec.ts` (1 test)             | VERIFIED   |
| qr-menu same-origin requirement for plan 08 | Code inspection (`apps/qr-menu/src/api/client.ts`) | DOCUMENTED |
