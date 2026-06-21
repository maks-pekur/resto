---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Phase 7.6 context gathered
last_updated: '2026-06-21T18:10:43.752Z'
last_activity: 2026-06-21
progress:
  total_phases: 20
  completed_phases: 8
  total_plans: 66
  completed_plans: 52
  percent: 40
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-24)

**Core value:** A restaurant can publish its digital presence and accept paid orders from guests via web — without integrating any external POS or hiring a developer. AI tier (admin assistant, guest chat, onboarding constructor) layers on top in MVP-2.
**Current focus:** Phase 7.6 — admin-vite-spa
**Milestone structure (2026-05-27, rescoped 2026-06-12):** MVP-1 = revenue spine only (5→6→7→7.5 deploy→8→10), Q1 2027 → MVP-2 = operational completeness (9,11-16) + AI tier (Q2-Q3 2027) → MVP-3 Telegram + iiko (Q4 2027+). See ROADMAP.md scope-rebalance note, `.planning/notes/ai-driven-pivot.md`, seeds.

## Current Position

Phase: 7.6 (admin-vite-spa) — EXECUTING
Plan: 3 of 7
Next: Phase 07 — Ordering (the largest single context build; hard prerequisite for Phases 8/9/10/11+; includes PROMO-06 discount engine + ORD-11 outbox claim-token). Ready to plan via /gsd:plan-phase.
Status: Ready to execute
Last activity: 2026-06-21

### Out-of-band work shipped between Phase 6 and Phase 7 (NOT GSD phases — direct hardening + a brainstorm→plan→execute feature)

- **Deep audit remediation — ALL 28 findings closed** (.planning/AUDIT.md; PRs #197-225 + follow-ups #232-234). Tenancy/multibrand/identity hardened: catalog RBAC, multibrand data+read isolation + composite FKs + per-operator BrandScopeGuard activation, outbox ordering/claim-ownership, audit-DLQ wiring, session-revoke org-scoping, slug-race, presign→null, withoutTenant call-site enforcement test, BA-store ports, dynamic-AC disabled, suspend/archive public reads → existence-hiding 404.
- **Public menu caching feature (HTTP/CDN ETag) — Phases 1-5 complete** (spec+plan docs/superpowers/{specs,plans}/2026-06-14-public-menu-caching\*; PRs #226-231). menu/stop versions → Postgres (atomic bump); new GET /v1/menu/availability; /v1/menu drops isStopListed (publish-versioned ETag + Cache-Control/304); qr-menu & website fetch availability + merge; Redis fully removed. CDN ops (Cloudflare cache rule + staging verify) pending on the founder's side — docs/runbooks/menu-edge-caching.md.
- **SUPERSEDES Phase 6's isStopListed-in-/v1/menu mechanism:** Phase 6 shipped stopped items flagged inline in the menu doc; the caching feature moved availability to its own endpoint. The qr-menu still shows sold-out (now derived from /v1/menu/availability), so the Phase 6 customer-facing goal holds — only the wire mechanism changed.

Progress: [████████░░] 79%

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

- Total plans completed: 12
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
| ----- | ----- | ----- | -------- |
| —     | —     | —     | —        |
| 03    | 5     | -     | -        |
| 04a   | 7     | -     | -        |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

_Updated after each plan completion_
| Phase 04b-catalog-admin-ui P01 | 15min | 3 tasks | 13 files |
| Phase 04b P02 | ~40min | 3 tasks | 26 files |
| Phase 04b-catalog-admin-ui P03 | ~55min | 4 tasks | 14 files |
| Phase 04b P04 | 11min | - tasks | - files |
| Phase 04b-catalog-admin-ui P05 | 78min | 3 tasks | 10 files |
| Phase 05-customer-site P05-01 | 20min | 3 tasks | 20 files |
| Phase 05-customer-site P05-02 | 25min | 3 tasks | 14 files |
| Phase 07 P01 | 12 | 2 tasks | 6 files |
| Phase 07-ordering P02 | 9 | 3 tasks | 6 files |
| Phase 07-ordering P03 | 25 | 2 tasks | 5 files |
| Phase 07-ordering P04 | 525s | 3 tasks | 5 files |
| Phase 07-ordering P05 | 90 | 3 tasks | 9 files |
| Phase 07.5-production-deploy P02 | 90 | 2 tasks | 10 files |
| Phase 07.5-production-deploy P11 | 45 | 2 tasks | 5 files |
| Phase 07.6-admin-vite-spa P01 | 20min | 3 tasks | 4 files |
| Phase 07.6 P02 | 20min | 3 tasks | 3 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Init: Horizontal-layer ordering locked (TEN → ADM → AUTH → CAT → QRM → SITE → ORD → PAY → DELV → ORDINT → PROMO → CRM → ANL → FIN → CONT → ONB)
- Init: Phase 2 (Admin Shell) before Phase 3 (Auth Completion) — admin shell rides existing dev wire; auth completion closes prod-readiness gaps once UX exists
- Init: MVP-1 customer surface = Admin + QR-menu + Site (no Staff app, no Telegram MA)
- Init: Stripe Connect Express for restaurant↔guest payments; SaaS billing stays manual until volume justifies
- 2026-05-24 (persona review): Phase 9 ↔ Phase 10 swapped — Delivery Zones now Phase 9, Admin Order Intake now Phase 10; zone validation must exist before live delivery orders are accepted
- 2026-05-24 (persona review): Phase 6 re-scoped as rendering/routing stub — checkout button disabled, SITE-08 (order confirmation) moved to Phase 8
- 2026-05-24 (persona review): PROMO-06 (pure discount engine) moved from Phase 11 to Phase 7 — discount calculation must exist before Phase 8 processes real payments
- 2026-05-24 (persona review): GNOTIF-01..04 folded into Phase 8 — all fire off Stripe webhook events, no phase renumbering needed
- 2026-05-24 (persona review): ANL-04 redefined — order conversion rate = paid_orders / checkout_initiations from `orders` table; full client-side funnel deferred to v2 (MKT-06)
- 2026-05-24 (user): Phase 16 (Self-serve Onboarding) kept as MVP-1; Phase 8 uses full Stripe Connect Express (not Checkout); CONT-03, CONT-02, CAT-08, QRM-10, PROMO-02, TEN-10, TEN-15, FIN-06 all kept in scope per broad-MVP-scope rule
- 2026-05-27 (user, AI-driven pivot via /gsd-explore): RestOS pivots to AI-driven positioning. Three-milestone structure MVP-1/2/3 replaces flat 16-phase MVP. iiko = partner not competitor. Standalone-first preserved. Site reordered before QR-menu. Phase 16 Self-serve Onboarding (non-AI) will be superseded by MVP-2 AI onboarding constructor. Open question for Phase 12 CRM discuss: include MVP-2-ready per-customer profile fields to avoid retrofit? Authoritative context: `.planning/notes/ai-driven-pivot.md`, seeds `mvp2-ai-platform.md` + `mvp3-channels-iiko.md`.
- [Phase ?]: 04b-01: shadcn ESLint override extended to keep pnpm dlx shadcn add a clean upgrade path (apps/admin/eslint.config.mjs)
- [Phase ?]: 04b-01: apiFetchInternal hardened with executeWithRetry mirroring apps/admin/lib/api-server.ts (AbortSignal.timeout, retry-once on idempotent GET 5xx, PATCH added)
- [Phase ?]: 04b-01: TDD RED+GREEN co-committed when pre-commit typecheck refuses RED-only (e.g. spec references types not yet widened)
- [Phase ?]: 04b-02: item list status filter accepts 'all'|'active'|'draft'|'published'|'archived'; 'active' is the documented default (excludes archived only) per D-03
- [Phase ?]: 04b-02: archive endpoints idempotent on already-archived rows (204, not 409); MenuCategoryAlreadyArchivedError + MenuItemAlreadyArchivedError ship anyway as defensive 409 mapping for future strict-mode callers
- [Phase ?]: 04b-02: draft-diff scope is items-only for MVP-1 (Open Question #5 resolved); cap 100 rows with truncatedCount sentinel
- [Phase ?]: 04b-02: migration 0042 idempotent — ADD COLUMN IF NOT EXISTS + DO-block-guarded CHECK constraint + backfill UPDATE that only flips status='draft' rows
- [Phase ?]: Plan 04b-03 Task 4 (manual browser smoke probe) deferred to Plan 04b-07 (photo-upload-client.tsx) — e2e (7/7) + curl OPTIONS preflight already cover the contract; first real-browser PUT happens naturally in 04b-07.
- [Phase ?]: 04b-04 Sidebar Меню group: 4 sub-routes, scope brand, collapsed-by-default per D-01
- [Phase ?]: 04b-04 StatusBadge variants per UI-SPEC: draft outline / modified outline+amber / published default / paused secondary (GM MED-1) / archived ghost+muted
- [Phase ?]: 04b-04 Sonner constant id 'publish-countdown' threads through every publish-flow toast (count-up → success/info/error replace-in-place)
- [Phase ?]: 04b-04 PublishCountdownToast uses Date.now() baseline (not tick counting) + ref-guarded onElapse to fire exactly once at 5s boundary
- [Phase ?]: 04b-04 StickyPublishBar mounted only at /dashboard/menu/\* route-group layout — not the global dashboard layout
- [Phase ?]: Plan 04b-05: CategorySelect ships with parent-picker + item-picker modes; parent-picker disables already-child options to enforce depth ≤ 2 (D-4b-01 belt-and-suspenders with refineCategoryDepth Zod refine)
- [Phase ?]: Plan 04b-05: DEFAULT_LOCALE='ru' pinned in apps/admin/lib/menu/localized.ts (Open Question #1 RESOLVED; v2 multilingual editor replaces with tenant-default lookup)
- [Phase ?]: Plan 04b-05: Reorder via two sequential upsert POSTs (Plan 02 didn't add a batch endpoint; T-04b-05-04 accepted)
- [Phase ?]: Plan 04b-05 deviation: added ResizeObserver polyfill in apps/admin/test/setup.ts (JSDOM lacks it; Radix popper crashes leaked across spec files)
- [Phase ?]: 07-01 discount engine decisions
- [Phase ?]: 07-02: DDL ordered so orders/tenantParentUniqueIndex precede order_items — composite FK resolution
- [Phase ?]: 07-02: No timestampsColumns() on orders/payments — status is the soft-delete pattern
- [Phase ?]: 07-02: OrderCreatedV1Payload excludes customer PII — GDPR minimisation (T-07-PII)
- [Phase ?]: No disjunctive fallback; feeds envelope directly to fromEnvelopeWithTx
- [Phase ?]: Next.js 16 Turbopack monorepo Docker: WORKDIR to app dir + turbopack.root via import.meta.url; server-only env vars need ARG placeholders for build-time page collection
- [Phase ?]: owner-only permission gate
- [Phase ?]: admin SPA trusted origin

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 7 (Ordering) is a hard prerequisite for Phases 8, 9, 10, 11, 12, 13, 14 — plan Phase 7 with care; it is the largest single context build in the roadmap; includes PROMO-06 and ORD-11 (outbox claim-token) as prerequisites for Phase 8
- Phase 6 (Customer Site) is a stub — checkout wires in at Phase 8; zone validation wires in at Phase 9; promo code field is non-functional until Phase 11
- Phase 9 (Delivery Zones) must complete before Phase 10 (Admin Order Intake) so zone validation is enforced for live delivery orders
- `feature-flags` package is an empty placeholder (CONCERNS.md) — defer until needed; do not import from `@resto/feature-flags` in any Phase 1–16 work; ONB-05 dev-mode toggle should be implemented as `SKIP_PAYMENT_FLOW=true` env var, not a feature-flag dependency
- **Dependency CVEs (high/critical) require a framework-major migration** — Fastify 4→5 + NestJS platform-fastify 10→11 + better-auth 1.4→1.6; no in-major patch exists. Zero current exposure (no prod deploy). **Deferred to a pre-launch milestone**; full analysis + Dependabot PR dispositions in `.planning/notes/dependency-cve-deferral.md`. `Dependency audit` CI is non-blocking by design.

### Quick Tasks Completed

| #          | Description                                                                                                             | Date       | Commit  | Directory                                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- | ---------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| 260613-qff | Isolation test suite fail-closed in CI (AUDIT #5)                                                                       | 2026-06-13 | 961b104 | [260613-qff-isolation-test-fail-closed](./quick/260613-qff-isolation-test-fail-closed/)                             |
| 260613-qmn | Audit hygiene: 5xx title redaction + db logger redact (AUDIT #22/#23/#24)                                               | 2026-06-13 | 81a32c7 | [260613-qmn-audit-hygiene](./quick/260613-qmn-audit-hygiene/)                                                       |
| 260615-gl7 | Align catalog schema with Syrve `/api/1/nomenclature` (code/weight/measureUnit/min-max)                                 | 2026-06-15 | 9d26475 | [260615-gl7-catalog-syrve-fields](./quick/260615-gl7-catalog-syrve-fields/)                                         |
| 260620-vss | BLOCK-1: server-authoritative order pricing (ignore client prices/discount) + pre-existing OrdersController @Inject fix | 2026-06-20 | 18ab957 | [260620-vss-fix-block-1-ordering-create-order-trusts](./quick/260620-vss-fix-block-1-ordering-create-order-trusts/) |
| 260620-wyq | BLOCK-4: close prod-guardrail fail-open on BETTER_AUTH_SECRET / AUDIT_ERASURE_SALT placeholders                         | 2026-06-20 | a3e935c | [260620-wyq-fix-block-4-prod-guardrail-fail-open-on-](./quick/260620-wyq-fix-block-4-prod-guardrail-fail-open-on-/) |
| 260621-cyf | Fix red CI on main — prettier format + build-time env for admin/website next builds                                     | 2026-06-21 | f8e18ce | [260621-cyf-fix-red-ci-on-main-prettier-format-missi](./quick/260621-cyf-fix-red-ci-on-main-prettier-format-missi/) |
| 260621-dai | BLOCK-2: erase ordering tables (orders/items/modifiers/payments) in tenancy_erase_tenant — GDPR PII + orders→brands FK  | 2026-06-21 | 4718d01 | [260621-dai-fix-block-2-tenancy-erase-tenant-must-de](./quick/260621-dai-fix-block-2-tenancy-erase-tenant-must-de/) |
| 260621-e0m | HIGH-12 order response contract (status/total/currency) + HIGH-9 payments.provider_payment_id unique index              | 2026-06-21 | b3371c5 | [260621-e0m-ordering-highs-order-response-contract-h](./quick/260621-e0m-ordering-highs-order-response-contract-h/) |
| 260621-ef1 | HIGH-4 modifier per-unit pricing + HIGH-13 catalog UUID path validation (400 not 500); HIGH-1 resolved by design        | 2026-06-21 | d95d303 | [260621-ef1-high-4-modifier-per-unit-pricing-high-13](./quick/260621-ef1-high-4-modifier-per-unit-pricing-high-13/) |
| 260621-est | HIGH-5 modifier group min/max/required + option minAmount validation; HIGH-10 RLS-forced table audit                    | 2026-06-21 | c15014e | [260621-est-high-5-modifier-group-validation-high-10](./quick/260621-est-high-5-modifier-group-validation-high-10/) |

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
| v2       | Telegram Mini App (TG-01..02)                   | Deferred | Init                      |
| v2       | POS integrations (POS-01..03)                   | Deferred | Init                      |
| v2       | External delivery aggregators (AGGR-01..04)     | Deferred | Init                      |
| v2       | Multi-payment-provider (PAYMP-01..03)           | Deferred | Init                      |
| v2       | Advanced auth (AUTHEXT-01..04)                  | Deferred | Init                      |
| v2       | Headless CMS (CMS-01..02)                       | Deferred | Init                      |
| v2       | Partner panel (PART-01..02)                     | Deferred | Init                      |
| v2       | AI assistant (AI-01..03)                        | Deferred | Init                      |

## Session Continuity

Last session: 2026-06-21T18:10:40.553Z
Stopped at: Phase 7.6 context gathered
Resume file: None
