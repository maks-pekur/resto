---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: MVP-1 — Standalone Platform
status: executing
stopped_at: 'Phase 3 Wave 3 complete: 03-03 flows (AUTH-02..06 + D-06 enumeration parity + 2 Phase 02 carry-overs); e2e specs written, not yet run (deferred to verify wave); 5 commits merged'
last_updated: '2026-05-30T12:34:37.382Z'
last_activity: 2026-05-27 -- Phase 02 execution started
progress:
  total_phases: 17
  completed_phases: 2
  total_plans: 16
  completed_plans: 14
  percent: 12
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-24)

**Core value:** A restaurant can publish its digital presence and accept paid orders from guests via web — without integrating any external POS or hiring a developer. AI tier (admin assistant, guest chat, onboarding constructor) layers on top in MVP-2.
**Current focus:** Phase 02 — Admin Shell
**Milestone structure (2026-05-27):** MVP-1 standalone platform (Q1 2027) → MVP-2 AI tier (Q2-Q3 2027) → MVP-3 Telegram + iiko (Q4 2027+). See `.planning/notes/ai-driven-pivot.md` and seeds.

## Current Position

Phase: 02 (Admin Shell) — EXECUTING
Plan: 1 of 5
Status: Executing Phase 02
Last activity: 2026-05-27 -- Phase 02 execution started

Progress: [█▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒] 6% of MVP-1 (1/16 phases)

## ✓ Phase 01 follow-up — pre-existing e2e regressions RESOLVED (2026-05-26)

3 root causes fixed via 3 PRs:

- **PR #191** — RC-1: `fix(db): grant DELETE on inbox_processed in roles.sql + preflight guard` (production-affecting; daily retention cron was a silent no-op)
- **PR #192** — RC-2: `fix(api): emit error code in ProblemDetails response body` (wire contract gap; `body.code` was always undefined)
- **PR #193** — RC-3: `test(identity): add x-tenant-id header to /v1/tenants/me sanity probes` (predates Wave 2, broken since RES-191 / 2026-05-13)

All three failing specs now green: `background-jobs.e2e.spec.ts` 4/4, `tenancy-suspend.e2e.spec.ts` 6/6, `identity-audit.e2e.spec.ts` 4/4. Debug session resolved in `.planning/debug/wave-2-e2e-regressions.md`.

Still deferred to Phase 03:

- `BLOCKED` row in `audit-gap.md` — role-change audit ⏸ Better Auth 1.4.22 has no `databaseHooks.member.update.after` hook → AUTH-09 in Phase 03

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
- 2026-05-27 (user, AI-driven pivot via /gsd-explore): RestOS pivots to AI-driven positioning. Three-milestone structure MVP-1/2/3 replaces flat 16-phase MVP. iiko = partner not competitor. Standalone-first preserved. Site reordered before QR-menu. Phase 16 Self-serve Onboarding (non-AI) will be superseded by MVP-2 AI onboarding constructor. Open question for Phase 12 CRM discuss: include MVP-2-ready per-customer profile fields to avoid retrofit? Authoritative context: `.planning/notes/ai-driven-pivot.md`, seeds `mvp2-ai-platform.md` + `mvp3-channels-iiko.md`.

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

Last session: 2026-05-30T12:34:37.374Z
Stopped at: Phase 3 Wave 3 complete: 03-03 flows (AUTH-02..06 + D-06 enumeration parity + 2 Phase 02 carry-overs); e2e specs written, not yet run (deferred to verify wave); 5 commits merged
Resume file: .planning/phases/03-auth-completion/03-04-cookies-2fa-PLAN.md
Branch: main (Phase 01 + follow-ups fully landed; next phase 02 — Admin Shell)
