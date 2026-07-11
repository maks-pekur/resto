---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 08.4-10-PLAN.md
last_updated: "2026-07-11T20:04:46.830Z"
last_activity: 2026-07-11
progress:
  total_phases: 24
  completed_phases: 12
  total_plans: 103
  completed_plans: 94
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-24)

**Core value:** A restaurant can publish its digital presence and accept paid orders from guests via web — without integrating any external POS or hiring a developer. AI tier (admin assistant, guest chat, onboarding constructor) layers on top in MVP-2.
**Current focus:** Phase 08.4 — location-scoped-access
**Milestone structure (2026-05-27, rescoped 2026-06-12):** MVP-1 = revenue spine only (5→6→7→7.5 deploy→8→10), Q1 2027 → MVP-2 = operational completeness (9,11-16) + AI tier (Q2-Q3 2027) → MVP-3 Telegram + iiko (Q4 2027+). See ROADMAP.md scope-rebalance note, `.planning/notes/ai-driven-pivot.md`, seeds.

## Current Position

**ACTIVE → Phase 08.2 (brand-first-routing + access-control core) — CONTEXT gathered 2026-06-29, ready for /gsd-plan-phase 08.2.** Scope split from SEED-001: 08.2 = routing + brand-level access core (default-deny flip, server-session active-brand pin, brand RLS, `/{brand}` URLs); owner-managed custom roles (better-auth dynamicAccessControl) and location-level scoping are split into their own follow-on phases — now on the roadmap as **08.3 (Owner-managed Roles & Permissions)** + **08.4 (Location-scoped Access)**, sequenced after 08.2, before Phase 10. Decisions in `08.2-CONTEXT.md`; persona findings in `08.2-PERSONA-REVIEWS.md`. (08.1 below is complete; its verification is deferred.)

Phase: 08.4 (location-scoped-access) — EXECUTING
Plan: 11 of 11

CR-04 SPLIT DECISION (founder, 2026-06-26):

- DONE — quick task 260626-mzp (2026-06-26): all 3 cross-brand read leaks closed — draft-diff (added @RequireBrand + computeDraftDiff brandId filter), listModifierGroups, listStopListWithStoppedAt now brand-scoped; cross-brand isolation e2e added (catalog.e2e 26/26 green, zero regressions). Commits b810944 (fix) + a098c64 (test) on admin-vite-spa. 7.6's security part is closed.
- DEFERRED to its own phase before Phase 8 (suggest 07.7-per-brand-publish): the heavy per-brand publish rework (migration 0054 + version-per-brand + v2 events + per-brand ETag + brand-keyed delayed-publish). Not needed for a single-brand first customer; bloats a closing phase. Plans 07.6-08/09 marked `deferred: true`, retained as reference; re-plan the future phase against 07.6-08-RESEARCH.md + 07.6-REVIEWS.md (REVIEWS also lists the 2 blockers to fix first: missing migration-journal entry + breaking db/e2e tests).

Phase 7.5 (Production Deploy) is ACTIVE — re-planned 2026-06-26 as a four-surface stand-up (api+website ECS, admin+qr-menu static on Cloudflare Pages; admin folded in, supersedes 07.6-07). 9 stale admin-as-ECS plans archived under \_superseded-2026-06-21/. 8 fresh plans + 2 done anchors. Hosting = single VPS + Docker Compose + Cloudflare (VPS pivot 2026-06-26; AWS/RDS/Neon all dropped — self-managed Postgres on the VPS = superuser, so BYPASSRLS works natively). **Wave 0 COMPLETE**: 01 (RDS decision) + 02 (boot fix) + 03 (D-05 direct-conn outbox + G-03 leader /readyz + G-04 Sentry + G-05 fail-loud env; 449/449 api tests) + 04 (NATS-decouple e2e + PRE-DEPLOY-VERIFY) + 11 (website Dockerfile).
DEFERRED (founder, 2026-06-26): the live prod stand-up (plans 06–10) waits until the FIRST PAYING CUSTOMER — no boxed infra months before revenue (first-customer target Q1 2027). Target stack at go-live = single VPS + Docker Compose (api+postgres+nats) + Cloudflare (DNS/TLS/CDN) + R2 + Pages (admin/qr-menu) + pg_dump/WAL-G→R2 backups + restore drill (G-02); re-plan 06–10 for VPS then. Interim during MVP build: everything runs LOCALLY (pnpm dev:up); the only public-URL need (Stripe webhooks, Phase 8) uses Stripe CLI / Cloudflare Tunnel (free). AWS fully torn down + leaked deploy key deleted.
Next build target: Phase 8 (Payments) — fully buildable locally with Stripe CLI; 07.6-07 admin static deploy also folds into the deferred go-live (or onto free Cloudflare Pages anytime).
Status: Ready to execute
Last activity: 2026-07-11

### Out-of-band work shipped between Phase 6 and Phase 7 (NOT GSD phases — direct hardening + a brainstorm→plan→execute feature)

- **Deep audit remediation — ALL 28 findings closed** (.planning/AUDIT.md; PRs #197-225 + follow-ups #232-234). Tenancy/multibrand/identity hardened: catalog RBAC, multibrand data+read isolation + composite FKs + per-operator BrandScopeGuard activation, outbox ordering/claim-ownership, audit-DLQ wiring, session-revoke org-scoping, slug-race, presign→null, withoutTenant call-site enforcement test, BA-store ports, dynamic-AC disabled, suspend/archive public reads → existence-hiding 404.
- **Public menu caching feature (HTTP/CDN ETag) — Phases 1-5 complete** (spec+plan docs/superpowers/{specs,plans}/2026-06-14-public-menu-caching\*; PRs #226-231). menu/stop versions → Postgres (atomic bump); new GET /v1/menu/availability; /v1/menu drops isStopListed (publish-versioned ETag + Cache-Control/304); qr-menu & website fetch availability + merge; Redis fully removed. CDN ops (Cloudflare cache rule + staging verify) pending on the founder's side — docs/runbooks/menu-edge-caching.md.
- **SUPERSEDES Phase 6's isStopListed-in-/v1/menu mechanism:** Phase 6 shipped stopped items flagged inline in the menu doc; the caching feature moved availability to its own endpoint. The qr-menu still shows sold-out (now derived from /v1/menu/availability), so the Phase 6 customer-facing goal holds — only the wire mechanism changed.

Progress: [█████████░] 91%

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

- Total plans completed: 18
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
| ----- | ----- | ----- | -------- |
| —     | —     | —     | —        |
| 03    | 5     | -     | -        |
| 04a   | 7     | -     | -        |
| 08.2  | 6     | -     | -        |

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
| Phase 07.6-admin-vite-spa P03 | 51 | 3 tasks | 27 files |
| Phase 07.6 P04 | 15m | 3 tasks | 58 files |
| Phase 07.6-admin-vite-spa P05 | 300 | 4 tasks | 41 files |
| Phase 07.6-admin-vite-spa P06 | 11min | 3 tasks | 13 files |
| Phase 07.5-production-deploy P04 | 331 | 2 tasks | 2 files |
| Phase 07.5-production-deploy P03 | 30 | 3 tasks | 18 files |
| Phase 07.5-production-deploy P05 | 10 | 4 tasks | 8 files |
| Phase 08-payments-stripe-connect P01 | 65 | 2 tasks | 9 files |
| Phase 08-payments-stripe-connect P02 | 100 | 3 tasks | 18 files |
| Phase 08-payments-stripe-connect P03 | 29 | 2 tasks | 20 files |
| Phase 08-payments-stripe-connect P07 | 130 | 2 tasks | 10 files |
| Phase 08-payments-stripe-connect P04a | 55 | 2 tasks | 11 files |
| Phase 08 P06 | 90 | 2 tasks | 15 files |
| Phase 08-payments-stripe-connect P04b | 90 | 2 tasks | 13 files |
| Phase 08 P05 | 90min | 2 tasks | 10 files |
| Phase 08.1 P01 | 90min | 3 tasks | 25 files |
| Phase 08.1 P02 | 9m | 3 tasks | 6 files |
| Phase 08.1 P03 | 820 | 3 tasks | 14 files |
| Phase 08.1 P04 | 45 | 3 tasks | 7 files |
| Phase 08.1 P05 | 10 | 3 tasks | 7 files |
| Phase 08.2 P01 | 17 | 4 tasks | 5 files |
| Phase 08.2 P02 | 35 | 3 tasks | 5 files |
| Phase 08.2 P03 | 90 | 3 tasks | 12 files |
| Phase 08.2 P05 | 15 | 3 tasks | 20 files |
| Phase 08.2 P06 | 25m | 4 tasks | 7 files |
| Phase 08.3 P01 | 7min | 3 tasks | 11 files |
| Phase 08.3 P02 | 48min | 3 tasks | 15 files |
| Phase 08.3 P03 | 19min | 3 tasks | 17 files |
| Phase 08.4 P01 | 13min | 3 tasks | 11 files |
| Phase 08.4 P02 | 8min | 2 tasks | 6 files |
| Phase 08.4-location-scoped-access P03 | 14min | 4 tasks | 18 files |
| Phase 08.4-location-scoped-access P04 | 9min | 3 tasks | 12 files |
| Phase 08.4-location-scoped-access P05 | 8min | 2 tasks | 7 files |
| Phase 08.4 P06 | 100min | 3 tasks | 27 files |
| Phase 08.4 P07 | 20min | 2 tasks | 7 files |
| Phase 08.4-location-scoped-access P08 | 55min | 2 tasks | 22 files |
| Phase 08.4 P09 | 9min | 3 tasks | 9 files |
| Phase 08.4 P10 | 38min | 2 tasks | 14 files |

## Accumulated Context

### Roadmap Evolution

- Phase 08.1 inserted after Phase 8: Payments provider layer + onboarding UX (embedded Connect, Standard OAuth, provider-agnostic PaymentProviderPort); pulled into MVP-1, extends Phase 8, does not block Phase 10 (URGENT)
- Phase 08.2 inserted after Phase 08.1: Brand-first routing + brand-scoped access model (promoted from SEED-001); pulled forward ahead of Phase 10, security-sensitive (member single-active-brand enforcement) (URGENT)
- Phase 08.2 edited: Narrowed 08.2 to brand-first routing + brand-level access-control core (default-deny flip, server-session active-brand pin, brand RLS). Owner-managed custom roles (better-auth dynamicAccessControl) and location-level scoping split into their own follow-on phases — full SEED-001 vision preserved as a sequence
- Phase 08.3 inserted after Phase 08.2: Owner-managed custom roles (enable better-auth dynamicAccessControl + creator-subset guard + owner role-builder UI) — split from SEED-001 (URGENT)
- Phase 08.4 inserted after Phase 08.3: Location-scoped access (new locations entity + member_location_scope) — split from SEED-001 (URGENT)

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
- [Phase ?]: better-auth v1.4.22 forgetPassword missing on client — use direct fetch to /api/auth/request-password-reset
- [Phase ?]: Brand-in-URL ($brandSlug param) replaces HMAC active-brand cookie — D-03 compliant
- [Phase ?]: dashboard/index.tsx self-contained with TodaysStopListPlaceholder stub; plan 07.6-05 overwrites with live catalog data
- [Phase ?]: 07.6-05
- [Phase ?]: 07.6-05
- [Phase ?]: 07.6-05
- [Phase ?]: useParams strict:false for parent brandSlug in nested brand routes
- [Phase 07.5-production-deploy]: D-05: DIRECT_DB_CONNECTION @Optional token; dev falls back to pooled — Prevents Neon PgBouncer zombie-lock in prod
- [Phase 07.5-production-deploy]: G-03: OutboxDispatcherService.getOutboxLeaderHealth() exposes isLeader+staleMs; /readyz 503 on stall — LB drains wedged leader instead of silently queuing paid-order events
- [Phase 07.5-production-deploy]: G-04: Sentry init in bootstrap-telemetry.ts/instrumentation.ts/main.tsx, all SENTRY_DSN-guarded — Dev/CI boot unchanged when DSN absent; captures prod exceptions before first customer
- [Phase 07.5-production-deploy]: G-05: isLocalhostUrl() regex rejects localhost API origin in production for website and admin — A forgotten NEXT_PUBLIC_API_ORIGIN/VITE_API_ORIGIN crashes build, never silently routes users to localhost
- [Phase ?]: resto_auth NOBYPASSRLS: permissive policies on 4 BA-owned tables via migration 0054 (RDS-compatible, D-04)
- [Phase ?]: PAY-12: seed lastDispatchAt at lock acquisition to close never-dispatched false-negative; backlog-aware probe distinguishes idle leader from wedged leader
- [Phase ?]: PAY-11: StripeAccountId z.string().max(255) exported from tenant.aggregate.ts, parsed on account.updated event.account at the trust boundary
- [Phase ?]: NotificationOrderDrizzleRepository isolates DB queries per ADR-0020 I-1
- [Phase ?]: Stripe connect linkage moved from Tenant to Brand aggregate (D-04/D-05/D-06)
- [Phase ?]: Tenant stub methods retained until Plan 03 removes last callers
- [Phase ?]: PAY-16: PaymentProviderPort + PAYMENT_PROVIDER_PORT in payments domain; StripeProviderAdapter in infrastructure; ESLint no-restricted-imports arch-test blocks stripe import in payments app/domain
- [Phase ?]: onExit triggers status refetch only; account.updated webhook is completion authority for per-brand KYC
- [Phase ?]: 08.1-05
- [Phase ?]: D-14 brand RLS: 9 tables covered (menu\_\* + orders); payments accepted debt (SC-6); pass-through IS NULL preserves tenant-level reads
- [Phase 08.3-P02]: D-12: archived_at soft-delete on organization_role; BA deleteOrgRole never called; RoleOccupiedError blocks archive of assigned roles
- [Phase 08.3-P02]: D-14: RolesController is the sole role mutation surface; organizationId always from requireTenantContext() ALS (never from request body)
- [Phase 08.3-P02]: D-15: lookupBaseRole CSV-split for BA member.role format (custom-role member holds 'staff,custom-slug' CSV); priority owner>admin>staff; custom-only → undefined
- [Phase 08.3-P02]: ArchiveRoleService injects only AUTH_DRIZZLE_TOKEN (no AUTH_TOKEN) — soft-delete is a direct SQL UPDATE, no BA API call needed
- [Phase 08.3-P03]: D-06: isSubsetOf(targetPerms, actorEffective) + self-assignment guard — both fire before BA updateMemberRole; unit-proven via assign-role.spec.ts
- [Phase 08.3-P03]: D-04 (assign path): containsNonDelegatable on target role in AssignRoleService + beforeUpdateMemberRole backstop (T-083-17)
- [Phase 08.3-P03]: D-07: 3 preset roles (manager/cashier-foh/kitchen) seeded at provisioning; non-blocking; idempotent via slug pre-check; none contain NON_DELEGATABLE
- [Phase 08.3-P03]: actorUserId on assignment events captured via WeakMap stash in hooks.before on /update-member-role path (D-16)
- [Phase 08.4-01]: locations FK to brands onDelete restrict (never hard-deleted); member_location_scope location FK restrict, member/tenant FKs cascade (mirrors member_brand_scope except this one value)
- [Phase 08.4-01]: member_location_scope is tenant-grain-only RLS (Tier 3), no brand/location scoped policy -- mirrors member_brand_scope's absence from the 0058 brand-policy table list
- [Phase 08.4-01]: drizzle-kit generate unusable past migration ~0018 (snapshot drift since hand-written migrations bypassed it) -- hand-author SQL + manual meta/\_journal.json entries for 0063-0067
- [Phase 08.4-02]: admin.location = ['read'] (owner-only location writes); staff.location = ['read'] — Location create/update/delete stays owner-exclusive, matching D-15's owner-only assignment-matrix gate
- [Phase 08.4-02]: NON_DELEGATABLE regression check scoped to tenant/billing/ac — excludes staff:remove, a pre-existing legitimate 08.3 admin grant unrelated to this phase's escalation surface (per packages/domain/CLAUDE.md's own canonical example)
- [Phase 08.4-03]: InitialLocationDrizzleRepository.resolveForUserInBrand has no tenantId param (locked interface); bootstraps tenantId via db.withoutTenant filtered by globally-unique brandId, then re-binds via db.withTenantId
- [Phase 08.4-03]: onInitialLocationPin reuses the existing brandPinDone WeakMap gate (no separate locationPinDone stash) -- fires only when a brand was freshly pinned in the same hook invocation
- [Phase 08.4-03]: SetActiveBrandService reset of activeLocationId happens on EVERY successful brand switch (owner AND non-owner), not just initial login, closing the D-08 dangling-location gap
- [Phase 08.4-04]: LocationsController placed at v1/tenancy/locations (no :slug in URL) — brand resolved from ALS context via x-brand-slug header, mirroring catalog.controller.ts's brand-scoped-without-URL-param pattern
- [Phase 08.4-04]: countScopedMembers(locationId) counts every member_location_scope row for that location (blast-radius warning); archive never touches scope rows (D-17)
- [Phase 08.4-05]: brand-scope-guard.spec.ts (not in file-list) updated to mock MemberLocationScopeReader/findReachableBrandsForMember — required by Task 2's own acceptance criterion after guard constructor signature changed
- [Phase 08.4-05]: BrandScopeGuard fully drops MEMBER_BRAND_SCOPE_READER injection (not alongside) — non-owner branch does exactly one scope check via findReachableBrandsForMember; member_brand_scope token/table stay wired for ListMyBrandsService
- [Phase 08.4-06]: menu_stop_list/catalog_location_stop_version re-keyed brandId->locationId with location-grain RESTRICTIVE RLS (0068/0069); no location synthesized (D-12/D-13)
- [Phase 08.4-06]: operator stop/unstop targets requireLocationContext() (active-location pin); guest availability resolves DefaultLocationResolverService.resolveForBrand (earliest active location)
- [Phase 08.4-06]: CRITICAL: LocationScopeGuard rollout (08.4-05) left ~16 controllers without @LocationNeutral(), throwing 403 before owner-bypass; fixed 4 needed for this plan (public-menu, internal-tenants, me-brands, locations), ~12 remain incl. guest checkout -- see deferred-items.md
- [Phase ?]: 08.4-09 Tasks 1-2 committed (dce3010, 150b07b): x-location-id echo + Locations CRUD page; owner locationSwitcher + staff pick-location interstitial + login flow. Paused at Task 3 human-verify checkpoint awaiting founder browser verification.
- [Phase 08.4-07]: D-06 AssignLocationRoleService accepts system OR custom role slugs (inverts AssignRoleService's SYSTEM_ROLE_SLUGS rejection); upserts member_location_scope.role directly via Drizzle, never BA updateMemberRole
- [Phase 08.4-07]: MemberLocationRolesController is @BrandNeutral() (mirrors member-roles.controller.ts) — manages (member, location) role pairs across a brand's locations from a Team-matrix UI, not scoped to one pinned active location
- [Phase 08.4-07]: LocationPermissionChecker built + unit-proven (owner-bypass, non-owner via findRoleForMemberAtLocation) but deliberately NOT wired as the live PERMISSION_CHECKER token — PermissionsGuard doesn't thread activeLocationId yet; live route integration is a flagged follow-up
- [Phase 08.4-08]: orders.location_id NOT NULL + composite FK + orders_location_iso RESTRICTIVE RLS; CreateOrderService resolves+persists location via DefaultLocationResolverService — D-03/D-12/D-13; row-count check found 5 non-zero dev-only orders with zero legitimate locations -- cleared not backfilled
- [Phase 08.4-08]: tenancy_erase_tenant extended to erase catalog_location_stop_version/member_location_scope/locations before brands — plan 06's brand-cascade -> location-restrict FK change on catalog_location_stop_version left GDPR erasure silently incomplete; surfaced by this plan's own fixture needing a location
- [Phase ?]: 08.4-09: x-location-id echoed from session.activeLocationId on every apiFetch call; locationSwitcher owner-only + brand-global(null) option; staff post-login pick-location interstitial gated on baseRole!=owner && activeLocationId==null; Locations CRUD archive shows post-archive blast-radius toast (no pre-archive preview endpoint exists) (D-09/D-10/D-14/D-16/D-17)
- [Phase 08.4]: 08.4-10: added GET /v1/members/:memberId/location-roles (plan 07 shipped write-only; the Team matrix needs a read path for current pairs), gated identically (ac:['update']) to the write endpoints
- [Phase 08.4]: 08.4-10: MemberRoleRow (old tenant-wide role Select) fully replaced by MemberLocationRoleMatrix and deleted, not layered alongside it, per D-15's consolidation goal; the Base role Badge is kept read-only for context

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 7 (Ordering) is a hard prerequisite for Phases 8, 9, 10, 11, 12, 13, 14 — plan Phase 7 with care; it is the largest single context build in the roadmap; includes PROMO-06 and ORD-11 (outbox claim-token) as prerequisites for Phase 8
- Phase 6 (Customer Site) is a stub — checkout wires in at Phase 8; zone validation wires in at Phase 9; promo code field is non-functional until Phase 11
- Phase 9 (Delivery Zones) must complete before Phase 10 (Admin Order Intake) so zone validation is enforced for live delivery orders
- `feature-flags` package is an empty placeholder (CONCERNS.md) — defer until needed; do not import from `@resto/feature-flags` in any Phase 1–16 work; ONB-05 dev-mode toggle should be implemented as `SKIP_PAYMENT_FLOW=true` env var, not a feature-flag dependency
- **Dependency CVEs (high/critical) require a framework-major migration** — Fastify 4→5 + NestJS platform-fastify 10→11 + better-auth 1.4→1.6; no in-major patch exists. Zero current exposure (no prod deploy). **Deferred to a pre-launch milestone**; full analysis + Dependabot PR dispositions in `.planning/notes/dependency-cve-deferral.md`. `Dependency audit` CI is non-blocking by design.
- RESOLVED (08.4 remediation, commits e4c8ef7/723f5ae/9b6cf29): the ~12-controller LocationScopeGuard 403 breakage is fixed. Root fix: LocationScopeGuard now honors @BrandNeutral (brand-neutral ⟹ location-neutral, since location ⊂ brand) — unblocks all 13 @BrandNeutral controllers incl. guest checkout. catalog.controller.ts got method-level @LocationNeutral on 18 brand-grain routes; stop-list add/remove/list stay location-enforced. withoutTenant allowlist reconciled (initial-location). signup/payment-lifecycle/catalog/catalog-rbac/cross-tenant-isolation e2e green.
- TEST DEBT (08.4, needs fixture update): set-active-brand.e2e (2) + related brand-scope e2e assert the pre-08.4 member_brand_scope model; after D-04 brand reachability derives from member_location_scope, so these fixtures must seed member_location_scope. NOT a derivation bug (proven by me-brands/catalog/cross-tenant-isolation green). Fold into plan 11 / phase verification. Also note: identity-bootstrap/identity-invitation/offboard-cancel/signup-enumeration residual e2e failures are confirmed pre-existing, unrelated to location scope.
- 08.4-09: founder manual click-through of /{brand}/locations CRUD page (create/list) + archive blast-radius toast is PENDING — deferred to end-of-phase verification (08.4-11) per founder decision; automated Playwright coverage only exercised owner-dashboard-no-crash + manager pick-location + cashier auto-pin, not the Locations page UI itself.
- apps/admin/test/env.spec.ts fails 1/44 (admin:test) since commit 890f7f8 changed the VITE_API_ORIGIN dev default from :3000 to :5001 without updating the test's hardcoded assertion — out of scope for 08.4-09 (port ownership belongs to a separate concern), needs a follow-up quick-task.

### Quick Tasks Completed

| #          | Description                                                                                                                                  | Date       | Commit  | Directory                                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| 260613-qff | Isolation test suite fail-closed in CI (AUDIT #5)                                                                                            | 2026-06-13 | 961b104 | [260613-qff-isolation-test-fail-closed](./quick/260613-qff-isolation-test-fail-closed/)                             |
| 260613-qmn | Audit hygiene: 5xx title redaction + db logger redact (AUDIT #22/#23/#24)                                                                    | 2026-06-13 | 81a32c7 | [260613-qmn-audit-hygiene](./quick/260613-qmn-audit-hygiene/)                                                       |
| 260615-gl7 | Align catalog schema with Syrve `/api/1/nomenclature` (code/weight/measureUnit/min-max)                                                      | 2026-06-15 | 9d26475 | [260615-gl7-catalog-syrve-fields](./quick/260615-gl7-catalog-syrve-fields/)                                         |
| 260620-vss | BLOCK-1: server-authoritative order pricing (ignore client prices/discount) + pre-existing OrdersController @Inject fix                      | 2026-06-20 | 18ab957 | [260620-vss-fix-block-1-ordering-create-order-trusts](./quick/260620-vss-fix-block-1-ordering-create-order-trusts/) |
| 260620-wyq | BLOCK-4: close prod-guardrail fail-open on BETTER_AUTH_SECRET / AUDIT_ERASURE_SALT placeholders                                              | 2026-06-20 | a3e935c | [260620-wyq-fix-block-4-prod-guardrail-fail-open-on-](./quick/260620-wyq-fix-block-4-prod-guardrail-fail-open-on-/) |
| 260621-cyf | Fix red CI on main — prettier format + build-time env for admin/website next builds                                                          | 2026-06-21 | f8e18ce | [260621-cyf-fix-red-ci-on-main-prettier-format-missi](./quick/260621-cyf-fix-red-ci-on-main-prettier-format-missi/) |
| 260621-dai | BLOCK-2: erase ordering tables (orders/items/modifiers/payments) in tenancy_erase_tenant — GDPR PII + orders→brands FK                       | 2026-06-21 | 4718d01 | [260621-dai-fix-block-2-tenancy-erase-tenant-must-de](./quick/260621-dai-fix-block-2-tenancy-erase-tenant-must-de/) |
| 260621-e0m | HIGH-12 order response contract (status/total/currency) + HIGH-9 payments.provider_payment_id unique index                                   | 2026-06-21 | b3371c5 | [260621-e0m-ordering-highs-order-response-contract-h](./quick/260621-e0m-ordering-highs-order-response-contract-h/) |
| 260621-ef1 | HIGH-4 modifier per-unit pricing + HIGH-13 catalog UUID path validation (400 not 500); HIGH-1 resolved by design                             | 2026-06-21 | d95d303 | [260621-ef1-high-4-modifier-per-unit-pricing-high-13](./quick/260621-ef1-high-4-modifier-per-unit-pricing-high-13/) |
| 260621-est | HIGH-5 modifier group min/max/required + option minAmount validation; HIGH-10 RLS-forced table audit                                         | 2026-06-21 | c15014e | [260621-est-high-5-modifier-group-validation-high-10](./quick/260621-est-high-5-modifier-group-validation-high-10/) |
| 260623-vwy | 07.6 CR-01: honor x-tenant-id on operator routes in prod (slug stays gated) + prod-mode unit tests                                           | 2026-06-23 | 527969c | [260623-vwy-cr-01-honor-x-tenant-id-on-operator-rout](./quick/260623-vwy-cr-01-honor-x-tenant-id-on-operator-rout/) |
| 260623-waj | 07.6 CR-03a: PUT /v1/catalog/items/:id/modifier-groups replace-links endpoint (migration 0053 DELETE grant) + e2e                            | 2026-06-23 | be64970 | [260623-waj-cr-03a-item-modifier-group-links-endpoin](./quick/260623-waj-cr-03a-item-modifier-group-links-endpoin/) |
| 260623-xb6 | 07.6 WR-02 autosave retry ref-stable + WR-04 shared constant-time token compare (closes token-length leak)                                   | 2026-06-24 | c03f6d1 | [260623-xb6-wr-02-autosave-retry-ref-wr-04-constant-](./quick/260623-xb6-wr-02-autosave-retry-ref-wr-04-constant-/) |
| 260626-mzp | 07.6 CR-04 split: brand-scope 3 catalog reads (draft-diff + modifier-groups + stop-list) — close cross-brand leaks + cross-brand e2e (26/26) | 2026-06-26 | a098c64 | [260626-mzp-fix-3-cross-brand-catalog-read-leaks-dra](./quick/260626-mzp-fix-3-cross-brand-catalog-read-leaks-dra/) |

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

Last session: 2026-07-11T20:04:46.821Z
Stopped at: Completed 08.4-10-PLAN.md
Resume file: None
