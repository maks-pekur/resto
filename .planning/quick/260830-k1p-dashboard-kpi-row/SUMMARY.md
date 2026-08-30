---
quick_id: 260830-k1p
slug: dashboard-kpi-row
date: 2026-08-30
status: complete
branch: phase-10.3-qr-print
commits: [be520e72]
---

# Summary — four numbers on the dashboard, and the read model under them

`GET /v1/analytics/dashboard?days=7|28|90` is a new `analytics` context: a port, a
service that resolves the window and the visible locations, and
`analytics-drizzle.reader.ts` holding the three aggregates (orders, refunds, first-time
guests). Money crosses the wire as strings, the currency is the tenant's default, and
days are bucketed in the location's timezone — falling back to the tenant's — using the
midnight arithmetic lifted out of `list-orders.service.ts` into `shared/zoned-day.ts`.

The admin renders four cards above the setup checklist: revenue, completed orders, new
guests, refunds. Each shows the current window, the previous one, and the change; a rise
in refunds reads red where a rise in revenue reads green. Staff have no `reports:read`,
so for them the row is absent rather than a line of refusals.

## The one thing that needed care

The dashboard has an every-location mode, so the route is `@LocationNeutral()` — and
that stands `LocationScopeGuard` down for it. The service therefore does the scope check
itself: an owner sees every active location, anyone else sees only the locations their
membership holds, and asking for one they do not hold is `location.access_denied`, the
same code the guard uses. A member with no scope rows sees nothing, which is
deny-by-default, matching the guard rather than softening it.

## Verification

- `test/unit/analytics` (8) — window is 28 days against the previous 28, default window,
  every-location vs bound-location resolution, unknown location 404, scoped member sees
  only their locations, refused their non-held location, no scope rows sees nothing.
- `test/integration/analytics-dashboard-reader.spec.ts` (6, real Postgres) — canceled
  orders are not revenue, completed orders counted, a guest whose first paid order
  predates the window is not new, failed refunds excluded, location narrowing, and
  another tenant's rows unreachable even when its location id is handed in.
- `test/e2e/analytics-dashboard.e2e.spec.ts` (8, real stack) — owner reads 100.00 / 1
  order / 1 new guest, the same for the bound location, `days=7` accepted, `days=5`
  rejected 400, unknown location 404, a member without `reports:read` 403, a scoped
  admin sees only their empty location and is refused the other one.
- `apps/admin` — component test for the cards (request shape, deltas, red-vs-green
  direction, empty baseline, failed request), full admin suite green.
- `test/e2e/order-feed-query.e2e.spec.ts` (10) re-run after the `zoned-day` extraction.

## Not done

Everything below the first row of the demo — the revenue chart, the channel split, the
category breakdown, average order value. No chart library was added.
