---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Phase 01 Wave 1 merged to main (PR #183 plan 01-01, PR #184 plan 01-02); ready for Wave 2
last_updated: '2026-05-26T19:35:00.000Z'
last_activity: 2026-05-26 -- Phase 01 Wave 1 merged to main via rebase (5 code commits + 1 docs commit)
progress:
  total_phases: 16
  completed_phases: 0
  total_plans: 6
  completed_plans: 2
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-24)

**Core value:** A restaurant can publish its digital presence and accept paid orders from guests via web — without integrating any external POS or hiring a developer.
**Current focus:** Phase 1 — Tenancy Hardening

## Current Position

Phase: 1 of 16 (Tenancy Hardening)
Plan: 2 of 6 in current phase (Wave 1 merged to main; Waves 2–3 pending)
Status: Wave 1 shipped — ready to launch Wave 2 (plans 01-03 + 01-04) from updated main
Last activity: 2026-05-26 -- Phase 01 Wave 1 merged to main via rebase (PRs #183 + #184)

Progress: [██░░░░░░░░░░░░░░░░░░] 33% within Phase 01

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
| ----- | ----- | ----- | -------- |
| —     | —     | —     | —        |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

_Updated after each plan completion_

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Init: Horizontal-layer ordering locked (TEN → ADM → AUTH → CAT → QRM → SITE → ORD → PAY → DELV → ORDINT → PROMO → CRM → ANL → FIN → CONT → ONB)
- Init: Phase 2 (Admin Shell) before Phase 3 (Auth Completion) — admin shell rides existing dev wire; auth completion closes prod-readiness gaps once UX exists
- Init: MVP-1 customer surface = Admin + QR-menu + Site (no Staff app, no mobile, no Telegram MA)
- Init: Stripe Connect Express for restaurant↔guest payments; SaaS billing stays manual until volume justifies
- 2026-05-24 (persona review): Phase 9 ↔ Phase 10 swapped — Delivery Zones now Phase 9, Admin Order Intake now Phase 10; zone validation must exist before live delivery orders are accepted
- 2026-05-24 (persona review): Phase 6 re-scoped as rendering/routing stub — checkout button disabled, SITE-08 (order confirmation) moved to Phase 8
- 2026-05-24 (persona review): PROMO-06 (pure discount engine) moved from Phase 11 to Phase 7 — discount calculation must exist before Phase 8 processes real payments
- 2026-05-24 (persona review): GNOTIF-01..04 folded into Phase 8 — all fire off Stripe webhook events, no phase renumbering needed
- 2026-05-24 (persona review): ANL-04 redefined — order conversion rate = paid_orders / checkout_initiations from `orders` table; full client-side funnel deferred to v2 (MKT-06)
- 2026-05-24 (user): Phase 16 (Self-serve Onboarding) kept as MVP-1; Phase 8 uses full Stripe Connect Express (not Checkout); CONT-03, CONT-02, CAT-08, QRM-10, PROMO-02, TEN-10, TEN-15, FIN-06 all kept in scope per broad-MVP-scope rule

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 7 (Ordering) is a hard prerequisite for Phases 8, 9, 10, 11, 12, 13, 14 — plan Phase 7 with care; it is the largest single context build in the roadmap; includes PROMO-06 and ORD-11 (outbox claim-token) as prerequisites for Phase 8
- Phase 6 (Customer Site) is a stub — checkout wires in at Phase 8; zone validation wires in at Phase 9; promo code field is non-functional until Phase 11
- Phase 9 (Delivery Zones) must complete before Phase 10 (Admin Order Intake) so zone validation is enforced for live delivery orders
- `feature-flags` package is an empty placeholder (CONCERNS.md) — defer until needed; do not import from `@resto/feature-flags` in any Phase 1–16 work; ONB-05 dev-mode toggle should be implemented as `SKIP_PAYMENT_FLOW=true` env var, not a feature-flag dependency

## Deferred Items

Items acknowledged and carried forward:

| Category | Item                                            | Status   | Deferred At               |
| -------- | ----------------------------------------------- | -------- | ------------------------- |
| v2       | Loyalty (LOY-01..05)                            | Deferred | Init                      |
| v2       | Marketing automation (MKT-01..05)               | Deferred | Init                      |
| v2       | Full conversion funnel instrumentation (MKT-06) | Deferred | 2026-05-24 persona review |
| v2       | Advanced delivery (DELVADV-01..04)              | Deferred | Init                      |
| v2       | Tips & service (TIPS-01..04)                    | Deferred | Init                      |
| v2       | Reviews (REV-01..04)                            | Deferred | Init                      |
| v2       | Staff app (STAFF-01..05)                        | Deferred | Init                      |
| v2       | Mobile customer app (MOB-01..04)                | Deferred | Init                      |
| v2       | Telegram Mini App (TG-01..02)                   | Deferred | Init                      |
| v2       | POS integrations (POS-01..03)                   | Deferred | Init                      |
| v2       | External delivery aggregators (AGGR-01..04)     | Deferred | Init                      |
| v2       | Multi-payment-provider (PAYMP-01..03)           | Deferred | Init                      |
| v2       | Advanced auth (AUTHEXT-01..04)                  | Deferred | Init                      |
| v2       | Headless CMS (CMS-01..02)                       | Deferred | Init                      |
| v2       | Partner panel (PART-01..02)                     | Deferred | Init                      |
| v2       | AI assistant (AI-01..03)                        | Deferred | Init                      |

## Session Continuity

Last session: 2026-05-26T19:35:00.000Z
Stopped at: Phase 01 Wave 1 merged to main via PRs #183 + #184; ready for Wave 2
Resume file: .planning/phases/01-tenancy-hardening/01-01-SUMMARY.md, 01-02-SUMMARY.md
Branch: main (Wave 1 fully landed; create fresh branch for Wave 2)
