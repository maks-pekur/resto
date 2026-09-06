---
quick_id: 260830-k1p
slug: dashboard-kpi-row
date: 2026-08-30
branch: phase-10.3-qr-print
---

# The dashboard's first row of numbers

The founder pointed at the shadcnblocks admin demo and asked for its widgets. After
seeing what each one would cost, the scope settled on the **first row only**: four KPI
cards — revenue, orders fulfilled, new guests, refunds — each against the previous
window. No charts, no channel split, no category breakdown, so no chart library.

The cards were never the work. There was no analytics endpoint at all, and the
dashboard deliberately carried no order counters (D-07: never a silently-empty one).
Everything the cards need was already in Postgres — order totals and statuses, guest
phone/email, refunds, per-location timezones — with nothing aggregating it.

This pulls a slice of **Phase 13 (Analytics, MVP-2)** forward. Nothing else from that
phase moves with it.

## Decisions

- **Revenue is what guests paid** — `paid`, `accepted`, `preparing`, `ready`,
  `completed`. Refunds are their own card and are not netted off, which is how the
  demo reads and what the founder chose.
- **Orders means completed orders.** A new guest is one whose *first* paid order falls
  in the window, matched on phone and then email.
- **Rolling 28 days against the previous 28**, not calendar months: on the 2nd of a
  month a calendar comparison is two days against thirty.
- **`reports:read`** already existed and is held by owner and admin, so no new
  permission. Staff simply do not get the row.
- **The route is location-neutral**, because the dashboard has an every-location mode.
  That stands `LocationScopeGuard` down, so the service does the scope check itself,
  deny-by-default, exactly as the guard reads it.

## Tasks

1. `apps/api` — new `analytics` context: port, service, `analytics-drizzle.reader.ts`,
   controller at `GET /v1/analytics/dashboard?days=7|28|90`, module, app wiring.
2. Extract the timezone day helpers out of `list-orders.service.ts` into
   `shared/zoned-day.ts` — the new service needs the same midnight arithmetic.
3. Regenerate `docs/api/openapi.yaml` + the api-client types.
4. `apps/admin` — `dashboardKpisQuery`, a `DashboardKpis` section of four cards with
   delta badges, gated on `reports:read`, above the existing checklist and 86 widget.
   ru/en/es strings.

## Verification

Unit tests for the window arithmetic and scope rules, an integration test for the SQL
against real Postgres, an e2e over the HTTP surface (permissions, scoping, bad window),
and a component test for the cards.
