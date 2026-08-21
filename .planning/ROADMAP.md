# Roadmap: RestOS

## Overview

RestOS is a brownfield multi-tenant restaurant SaaS pivoting to **AI-driven positioning** (decided 2026-05-27 — see `.planning/notes/ai-driven-pivot.md`). The roadmap is staged across three milestones:

| Milestone | Scope                                                                                                                                                                                                       | Gate                                                           | Target     |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------- |
| **MVP-1** | Revenue spine only: admin + auth + catalog + customer site + qr-menu + ordering + production deploy + payments + admin order intake                                                                         | First paying restaurant takes paid orders end-to-end via web   | Q1 2027    |
| **MVP-2** | Operational completeness (delivery zones, promo, CRM, analytics, finance, content/SEO, self-serve onboarding) **+** AI agent platform + 3 surfaces (admin assistant, guest chat, AI onboarding constructor) | Restaurant runs daily ops + uses AI; onboarding <30 min via AI | Q2–Q3 2027 |
| **MVP-3** | Telegram channel as 4th delivery surface; iiko adapter as B2B GTM channel; other POS adapters as the partnership motion validates them                                                                      | Active iiko partnership pipeline; measurable Telegram volume   | Q4 2027+   |

MVP-2 and MVP-3 are seeded in `.planning/seeds/mvp2-ai-platform.md` and `.planning/seeds/mvp3-channels-iiko.md`. Detailed planning happens when their trigger conditions activate (`/gsd-new-milestone`).

**Scope rebalance (2026-06-12):** MVP-1 cut to the revenue spine after a CTO review flagged scope-vs-velocity as the top risk. Phases **9 (Delivery Zones), 11 (Promo), 12 (CRM), 13 (Analytics), 14 (Finance), 15 (Content & SEO), 16 (Self-serve Onboarding)** moved to MVP-2 under a new "Operational Completeness" track — nothing deleted, all phase detail preserved verbatim. A new **Phase 7.5 (Production Deploy)** was added before Payments (Stripe webhooks need a public URL; the CTO review flagged the non-existent prod deploy as HIGH). **Phase 10 (Admin Order Intake)** stays in MVP-1 — the operator must see paid orders — with its delivery-zone validation deferred until Phase 9 ships in MVP-2.

## MVP-1: Standalone Platform — Phases

**Phase Numbering:**

- Integer phases (1–16): MVP-1 planned work
- Decimal phases (e.g. 3.1): Urgent insertions added post-planning via `/gsd:phase insert`
- MVP-2 / MVP-3 phases will be numbered 17+ at their respective `/gsd-new-milestone` activation

- [x] **Phase 1: Tenancy Hardening** - Close all enterprise/GDPR/security gaps in the existing tenancy and identity contexts before any net-new product surface is built _(shipped 2026-05-26)_
- [x] **Phase 2: Admin Shell** - Wire the existing Better Auth dev setup into a real operator sign-in + brand management UX (completed 2026-05-27)
- [x] **Phase 3: Auth Completion (Security Core)** - Close production-readiness gaps in auth so real operators can be onboarded: email adapter (Resend + MailHog + in-memory), invitations, password reset, email verification, secure cookies, NATS DLQ, RBAC role seeding; minimal invite UX in settings. Full operator self-service UX (team management page + 2FA lost-device flow) deferred to Phase 17 _(scope split via persona review 2026-05-29 — CTO HIGH-1)_ (completed 2026-05-30)
- [x] **Phase 4a: Catalog Schema + API** - Foundational menu domain redesign aligned with iiko nomenclature model; Drizzle schema migration, DTO updates, `/v1/menu` DTO extension, draft/publish snapshot + revert capability — backend only, no admin UI _(split from Phase 4 on 2026-05-30 — CTO HIGH-2 + Skeptic HIGH-4)_ (completed 2026-05-31)
- [x] **Phase 4b: Catalog Admin UI** - Full CRUD admin UX on top of finalized catalog schema; categories, items, modifiers, modifier groups, sizes, stop-list, photos, draft/publish flow — designed via `/gsd:ui-phase` then `/gsd:discuss-phase` before planning _(split from Phase 4 on 2026-05-30 — labor-intensive UI work isolated per user request)_ (completed 2026-06-01)
- [x] **Phase 5: Customer Site** - Scaffold `apps/website` with menu display, delivery/pickup mode selection, address validation, cart entry — checkout button disabled until Phase 8 completes _(reordered to precede QR-menu on 2026-05-27 — web shopfront is the primary customer surface)_ (completed 2026-06-12)
- [x] **Phase 6: QR-Menu Customer** - Real customer-facing ordering UI over the working `/v1/menu` endpoint (cart, modifiers, table binding) (completed 2026-06-13)
- [x] **Phase 7: Ordering** - New `ordering` bounded context: cart, order aggregate, state machine, event contracts, DB tables; includes pure discount engine (PROMO-06) and outbox claim-token fix (ORD-11) (completed 2026-06-14)
- [ ] **Phase 7.5: Production Deploy** - Stand up the first real production environment so the spine is shippable and Stripe webhooks have a public URL: AWS ECS hosting, Neon (→RDS fallback) Postgres, self-hosted NATS, Cloudflare R2 + DNS/TLS/CDN, CD on the existing CI, runtime secrets _(added 2026-06-12; stack locked 2026-06-21 — see Phase 7.5 detail)_ — **admin deploy moved to Phase 7.6** after the Vite migration; 7.5 now ships api + website (ECS) + qr-menu (static)
- [ ] **Phase 7.6: Admin → Vite SPA** - Migrate `apps/admin` from Next.js to React + Vite + shadcn (internal auth-gated dashboard — no SSR/SEO need); deploy as static (Cloudflare Pages/R2 + CDN, like qr-menu); retire `INTERNAL_API_TOKEN`/server-actions → operator-authenticated API (better-auth session + RBAC, closes review HIGH-7) _(decided 2026-06-21 — Next standalone-Docker friction + RSC complexity unjustified for an internal admin; do while admin is small)_
- [x] **Phase 8: Payments (Stripe Connect)** - Replace `NoopStripeConnectAdapter` with real Stripe Connect Express; includes pending-KYC UX state, outbox leader health probe, order confirmation page (SITE-08), and guest notification emails (GNOTIF) (completed 2026-06-27)
- [x] **Phase 8.1: Payments — Provider Layer & Onboarding UX** - Embedded Connect onboarding (no off-domain redirect), Connect Standard OAuth ("connect existing Stripe" one-click), and a provider-agnostic `PaymentProviderPort` so Mollie/Adyen/local acquirers slot in via adapter + config only _(inserted 2026-06-28; pulled into MVP-1 — extends Phase 8, does not block Phase 10)_ (completed 2026-06-28)
- [ ] **Phase 10: Admin Order Intake** - Incoming-orders feed and operational controls in admin (no Staff app in MVP-1); delivery-zone validation deferred until Phase 9 ships in MVP-2 _(kept in MVP-1: the operator must see paid orders)_; **real-time SSE + graceful SSE shutdown split out to Phase 18 (MVP-2) on 2026-08-11 — the feed ships on 5s polling**
- [ ] **Phase 10.2: Organization-per-restaurant and account onboarding** - Registration creates the owner and their company; multi-step onboarding sets up the restaurant and first brand; one brand is fixed for the whole session, chosen at sign-in; switching brands means signing in again; the brand switcher goes away and the location switcher becomes the only in-app context control _(inserted 2026-08-19 — founder; completes the direction 08.5 D-14 and Phase 10 already took)_
- [ ] **Phase 10.1: Location schedule and pause ordering** - One-tap pause of order intake plus a weekly opening schedule per location, enforced server-side at order creation _(inserted 2026-08-12 — persona-product BLOCK-3 at Phase 10 discuss; kept in MVP-1 because a launched restaurant hits it in week one)_

> **Moved to MVP-2 "Operational Completeness" (2026-06-12 rebalance)** — nothing deleted, full detail under the MVP-2 section: Phase 9 Delivery Zones · Phase 11 Promo & Discounts · Phase 12 CRM · Phase 13 Analytics · Phase 14 Finance · Phase 15 Content & SEO · Phase 16 Self-serve Onboarding.

- [ ] **Phase 17: Operator Self-service Polish (post-MVP-1)** - Full `/dashboard/team` page (member list, pending invitations, revoke, role-change), AUTH-07 full 2FA UX (lost-device admin reset for subordinates, recovery-code regeneration), closes BLOCKED row in `audit-gap.md` via `auth.api.updateMemberRole` + `identity.role_changed.v1` envelope. Activation trigger: first paying tenant adds a 2nd member with role ≠ owner, OR Better Auth ≥ 1.5 ships `databaseHooks.member.update.after` _(scope split via Phase 3 persona review 2026-05-29 — CTO HIGH-1 + Skeptic HIGH-4)_

## MVP-1 Phase Details

### Phase 1: Tenancy Hardening

**Goal**: Close every enterprise, GDPR, and security gap in the existing tenancy and identity platform before any net-new product surface is built on top of it
**Depends on**: Nothing (brownfield — hardening existing contexts)
**Requirements**: TEN-01, TEN-02, TEN-03, TEN-04, TEN-05, TEN-06, TEN-07, TEN-08, TEN-09, TEN-10, TEN-11, TEN-12, TEN-13, TEN-14, TEN-15, TEN-16, TEN-17, TEN-18
**Success Criteria** (what must be TRUE):

1. Operator can suspend a tenant and all customer-facing endpoints (menu, site, qr-menu) for that tenant return 403/410 immediately
2. Daily cron runs automatically, picks up tenants past the 30-day erasure cool-off, and executes erasure; failures emit OTel error spans without destructive retry; both tenant-scoped and platform-level `inbox_processed` rows older than 30 days are swept
3. `resto_app` role cannot read or write any Better Auth credential table; SQL preflight asserts this at every boot
4. Any call to `withoutTenant()` from an unregistered call site throws at runtime, and the ESLint rule catches new violations in CI before they ship
5. All `EventEnvelope` construction goes through `buildEnvelope`; the ESLint rule rejects direct `correlationId: randomUUID()` construction; `appendToOutbox` validates via `EventEnvelope.parse()` before insert; `OutboxDispatcher.stop()` is idempotent under concurrent callers; cross-tenant isolation tests pass under concurrent load with no ALS leak detected; Better Auth is pinned to `=1.4.22` exact
   **Plans**: 6 plans

Plans:
**Wave 1**

- [ ] 01-01-PLAN.md — TEN-16 OutboxDispatcher.stop() idempotency + TEN-17 EventEnvelope.parse() at appendToOutbox + TEN-18 verification
- [ ] 01-02-PLAN.md — Docker test stack (docker-compose.test.yml + wrapper scripts + smoke spec) for PR 4 and PR 6 dependencies

**Wave 2** _(blocked on Wave 1 completion)_

- [ ] 01-03-PLAN.md — Suspend/resume lifecycle (TEN-01..04) + BackgroundJobsModule (TEN-05/06/13) + buildEnvelope helper (TEN-14) + migration 0028 narrow GRANT
- [ ] 01-04-PLAN.md — Boot preflight assertions (TEN-07 + TEN-11) + ESLint enforcement (TEN-12 + TEN-15)

**Wave 3** _(blocked on Wave 2 completion)_

- [ ] 01-05-PLAN.md — Audit gap close (TEN-09) + per-tenant OTel labels (TEN-10) + migrate 8 existing buildEnvelope sites (TEN-14)
- [ ] 01-06-PLAN.md — Cross-tenant isolation test net (TEN-08) — PHASE GATE: 4 fixture categories
      **UI hint**: no
      **Persona reviewers**: persona-cto, persona-skeptic, persona-investor

### Phase 2: Admin Shell

**Goal**: Wire the existing Better Auth setup into a real operator sign-in flow and brand management UX so operators can authenticate and navigate before auth completion work begins
**Depends on**: Phase 1
**Requirements**: ADM-00, ADM-01, ADM-02, ADM-03, ADM-04, ADM-05, ADM-06, ADM-07, ADM-08
**Success Criteria** (what must be TRUE):

1. Operator signs in at `/login` with email + password and lands on the dashboard; unauthenticated requests redirect to `/login`
2. Sidebar shows the operator's real tenants/brands from the `organization` plugin; `NavUser` shows the operator's real email and role, not a placeholder
3. Operator creates a new brand and switches active brand; active-brand state persists across page navigations via signed cookie
4. All admin API calls return 403 to unauthorized roles and the UI surfaces a user-friendly empty state rather than a stack trace
5. `apps/admin` boot throws loudly if `NEXT_PUBLIC_API_ORIGIN`, `ADMIN_WEB_URL`, or `INTERNAL_API_TOKEN` are missing outside development
   **Plans**: 5 plans

Plans:
**Wave 1**

- [x] 02-01-PLAN.md — Foundation hardening: `lib/env.ts` (ADM-08) + apiFetch timeouts + one-retry on idempotent GET 5xx + 401 → `/login?expired=1` + cookie `secure:` flag fix (ADM-02, ADM-08)

**Wave 2** _(parallel — depends on Plan 01)_

- [x] 02-02-PLAN.md — ADM-00 scaffold smoke-walk: Playwright infrastructure + 6 scenarios; only scenario 2 `test.fixme`-deferred until Plan 04 (ADM-00, ADM-01 verification)
- [x] 02-03-PLAN.md — Signed `resto.active_brand` cookie: HMAC-SHA256 via dedicated `ACTIVE_BRAND_COOKIE_SECRET`; thread through 4 cookie I/O sites (ADM-05)

**Wave 3** _(depends on Plans 01, 02, 03)_

- [x] 02-04-PLAN.md — Sidebar + identity wiring: `<EmptyState>` component (both variants), sidebar shadcn-debris cleanup, brand-switcher single-brand collapse, NavUser real-data wiring from `/v1/me` (ADM-03, ADM-06, ADM-07)

**Wave 4** _(depends on Plans 01, 03, 04)_

- [x] 02-05-PLAN.md — Dashboard content + Phase 03 placeholders: Setup Checklist card, AI preview card with email capture, `/signup` `/forgot-password` `/reset-password` rendered as `<EmptyState variant="forbidden">`; flips scenario 2 `.fixme` + adds ADM-04 scenario 7 (ADM-04 verification)
      **UI hint**: yes
      **Persona reviewers**: persona-cto, persona-skeptic, persona-product-strategist

### Phase 3: Auth Completion (Security Core)

**Goal**: Close production-readiness gaps in authentication so real operators can be onboarded via invitation, recover lost passwords, have email verification enforced, and run on hardened cookies + NATS DLQ. Operator self-service UX (full team-management page + 2FA lost-device flow) deferred to Phase 17. Activation rule: this is the MVP-1 security-critical subset; first paying customer must ship on top of Phase 3, not Phase 17.
**Depends on**: Phase 2
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07, AUTH-08, AUTH-09, AUTH-10, AUTH-11
**Scope notes**:

- **AUTH-07** scoped to: enable 2FA TOTP from account settings + recovery codes shown once on enable. Lost-device admin-reset UI moves to Phase 17 (TEAM-04). For the first 100 customers, lost-device recovery for sole owner is manual founder-side reset via SQL script with audit row.
- **AUTH-09** scoped to: (a) idempotent role-seeding of `owner` / `admin` / `staff` permission presets, AND (b) wiring `organizationHooks.afterUpdateMemberRole` in `auth.config.ts` (the hook EXISTS in BA 1.4.22 per Phase 3 research — `node_modules/.pnpm/better-auth@1.4.22/.../organization/types.d.mts:520`; the earlier "BA ≥ 1.5 trigger" narrative was based on a wrong hook path). Hook emits `identity.role_changed.v1` through `buildEnvelope` + outbox; `ACTION_TARGET_KIND['identity.role_changed']='user'` added to audit projection. Closes the BLOCKED row in `.planning/phases/01-tenancy-hardening/audit-gap.md` invisibly — fires whenever BA's role-mutation endpoints are invoked, no UI surface added in Phase 3.
- **Invite UX**: minimal form in `/dashboard/settings` (1 email input + 1 role dropdown + 1 submit), not a dedicated `/dashboard/team` page. Pending-invitations table, revoke, in-place role-change all deferred to Phase 17 (TEAM-01..03).

**Success Criteria** (what must be TRUE):

1. Operator added to a tenant receives an invitation email and can complete signup via the single-use link at `/accept-invitation`; existing-account email auto-attaches to the new tenant (multi-tenant membership); role is encoded in the invitation token and immutable through accept flow; owner role is selectable only by owner-tier inviter (with regression test)
2. Operator who forgot their password can request a reset email and set a new password via the single-use link at `/reset-password`; new signups receive email verification and unverified accounts are blocked from sensitive actions per `REQUIRE_EMAIL_VERIFICATION`
3. Operator can enable 2FA TOTP from account settings; 10 recovery codes are generated on enable, shown once with copy-to-clipboard, and require explicit "I saved them" confirmation before activation; owner email-recovery loop is NOT shipped (eliminates the 2FA-equals-email regression)
4. All cookies set by server actions carry `secure: NODE_ENV==='production'`, `httpOnly: true`, `sameSite: 'lax'` (full sweep across server actions, not just the two flagged in Phase 02 D-04); NATS consumers have `max_deliver: 5` + `dlq.<subject>` configured and the configuration is exercised by an e2e poison-message test that asserts (i) `max_deliver` reached, (ii) message lands in DLQ subject, (iii) alert envelope emitted
5. System roles `owner`, `admin`, `staff` are seeded with permission presets from `packages/domain/src/rbac/system-roles.ts` via an idempotent NestJS bootstrap step (or a generated static SQL migration — keep convention with `pnpm db:migrate`); seed is re-runnable; `organizationHooks.afterUpdateMemberRole` is wired in `auth.config.ts` to emit `identity.role_changed.v1` envelope through outbox on every BA-driven role mutation; audit projection map covers the new event type; the BLOCKED row in `audit-gap.md` is updated to WIRED with reference to the live hook
6. Email adapter wired three-way: Resend (staging/prod) + MailHog (dev) + `CapturedEmailAdapter` (tests); `assertEmailAdapterWired` extended to all three callbacks AND the `?? (() => Promise.resolve())` NOOP defaults removed from `auth.config.ts` so a misconfigured prod boot fails loud; `assertProdGuardrails` extended to assert non-empty `RESEND_API_KEY` + adapter class name when `NODE_ENV ∈ {staging, production}`; signup and password-reset endpoints return identical status + body + ±10ms timing for "email exists" vs "does not" (enumeration parity); Resend adapter retries 3× (250→1000→4000ms, total <6s) on 5xx and emits `identity.email_dispatch_failed.v1` envelope through outbox on terminal failure

   **Plans**: 5 plans

Plans:
**Wave 1** _(GATING per D-18 — NATS DLQ ships first; gates everything below)_

- [x] 03-01-nats-dlq-PLAN.md — AUTH-10 NATS DLQ wiring + IdentityEmailDispatchFailedV1 contract + ACTION_TARGET_KIND extension + e2e poison-message gating test

**Wave 2** _(after Wave 1)_

- [x] 03-02-email-adapter-PLAN.md — AUTH-01 email adapter port + Resend/MailHog/Captured adapters + assertProdGuardrails + assertEmailAdapterWired 3-callback + NOOP-defaults removal + verifyTransport boot ping + boot-time integration test (D-13/D-14/D-15/D-17, D-01, D-03, D-05) + envs

**Wave 3** _(after Wave 2)_

- [x] 03-03-flows-PLAN.md — AUTH-02/03 invitation send+accept + AUTH-04/05 password reset + AUTH-06 email verification + D-06 /v1/signup enumeration parity wrap + Phase 02 carry-overs (forgot-password localhost fallback + login 3-call fan-out refactor) + open-redirect refinement on next= params

**Wave 4** _(after Wave 3)_

- [x] 03-04-cookies-2fa-PLAN.md — AUTH-08 full cookie sweep (every cookies().set site, not just the two from Phase 02 D-04) + AUTH-07 2FA TOTP enable + 10 recovery codes + saved-confirmation gate per D-22 (no admin-reset UI, no email-recovery loop, no regeneration UI per D-23)

**Wave 5** _(after Wave 4 — closure)_

- [x] 03-05-role-seed-hook-closure-PLAN.md — AUTH-09 role seed (NestJS bootstrap step from SYSTEM_ROLES) + organizationHooks.afterUpdateMemberRole wiring (D-16a, closes audit-gap.md BLOCKED row → WIRED) + IdentityRoleChangedV1 contract + AUTH-11 WeakMap refactor + D-21 GDPR sweep on invitation+verification + D-20 per-tenant signin rate-limit + D-23 founder-side 2FA recovery runbook + scripts/reset-2fa.ts + D-07 SPF/DKIM/DMARC pre-deploy checklist
      **UI hint**: no
      **Persona reviewers**: persona-cto, persona-skeptic

### Phase 4a: Catalog Schema + API

**Goal**: Redesign the catalog domain aligned with iiko nomenclature model (Группа / Блюдо / Размер / Модификатор / Группа модификаторов / Стоп-лист / ТТК-fields) so MVP-3 iiko-integration becomes a thin adapter rather than a structural reshape. Ship the full Drizzle migration, DTO updates, new entity types (modifier groups, sizes, stop-list, photos as forward-compatible array), and extend the public `/v1/menu` DTO with all new fields. Backend only — no admin UI in this phase.
**Depends on**: Phase 3
**Requirements**: CAT-02 (item schema fields incl. БЖУ), CAT-04 (modifier groups schema), CAT-05 (variants/sizes schema), CAT-06 (publish snapshot logic incl. delayed-publish revert capability), CAT-09 (Zod max-length constraints), CAT-10 (Redis menu-version + nextval fallback)
**Success Criteria** (what must be TRUE):

1. `04a-SCHEMA-MAP.md` exists and maps every iiko nomenclature entity to a proposed RestOS entity, with migration impact + downstream-consumer note (qr-menu mock, `packages/api-client` generated DTO, `tenant-isolation.spec.ts`, ESLint composite-FK audit)
2. Drizzle migration lands and is idempotent + reversible; existing dev-seed continues to work or is replaced; composite FK on every tenant-scoped child table; RLS double-enforcement preserved
3. `UpsertItemInputSchema` extended with structured БЖУ (proteins/fats/carbs/kcal nullable + estimated flag), `source` provenance enum (`manual / ai_generated / imported_iiko / imported_csv`), forward-compatible `photos` array (single-entry in MVP-1), URL-safe ASCII-transliterated `slug` + `slug_aliases` table
4. Modifier vs Modifier Group entities cleanly separated; size as own entity (or embedded — researcher recommends); stop-list shape decided (table vs column) and wired to existing audit pipeline
5. Publish flow supports a delayed-publish revert capability (publish event fires only at end of 5s window, no compensating outbox events); `catalog.menu_first_published.v1` vs `catalog.menu_republished.v1` distinct event types; Redis menu-version counter uses Postgres `nextval` sequence as authoritative fallback
6. Public `/v1/menu` DTO contains all new fields; `docs/api/openapi.yaml` regenerated and CI drift-check added
   **Plans**: 7 plans

Plans:
**Wave 1**

- [x] 04A-01-PLAN.md — Install transliteration npm pkg (blocking human-verify legitimacy gate per D-4a-04 [ASSUMED]) + start dev Docker stack for downstream migrations

**Wave 2** _(after Wave 1)_

- [x] 04A-02-PLAN.md — Drizzle schema: menu_items photos/BJU/source/needs_review/source_external_id, menu_categories.parent_id self-FK, tenants.menu_first_published_at, menu_versions_seq Postgres sequence (CAT-02, CAT-10; D-4a-01/02/03/06/07)

**Wave 3** _(after Wave 2)_

- [x] 04A-03-PLAN.md — New tables menu_stop_list + menu_item_slug_aliases with composite FK + RLS ENABLE/FORCE + iso policies; composite-FK audit pass (CAT-06, CAT-09; D-4a-04/10)

**Wave 4** _(after Waves 2+3)_

- [x] 04A-04-PLAN.md — Renames: menu_variants → menu_item_sizes (price_delta → absolute price), menu_modifiers → menu_modifier_groups, junction + FK column renames, add default_amount + free_amount on options (CAT-04, CAT-05; Pitfall 3 hand-written + Pitfall 6 price semantic backfill)

**Wave 5** _(after Wave 4)_

- [x] 04A-05-PLAN.md — 4 catalog event contracts (menu_first_published, menu_republished, item_stopped, item_unstopped); refactor catalog/application/dto.ts (CAT-09 max-length sweep, photos JSONB, BJU, source enum, slug auto-derive, modifier groups, item sizes, stop-list); audit ACTION_TARGET_KIND map; 3 new domain errors (CAT-02, CAT-04, CAT-05, CAT-09; D-4a-01/02/03/04/06/10)

**Wave 6** _(after Wave 5)_

- [x] 04A-06-PLAN.md — Application + infrastructure refactor: DelayedPublishService (5s timer per tenant); PublishMenuService.doPublish with first-publish detection + outbox emit; StopListService with cache invalidate; UpsertModifierGroup/Option/ItemSize services; slug auto-derive + alias insert on change; repository refactor against renamed tables + photos + BJU read; MenuVersionPort.bump nextval fallback; CatalogCachePort.invalidate; GRANT DELETE on menu_stop_list (CAT-06, CAT-10; D-4a-04/05/06/07/10; ADR-0020 I-4/I-6)

**Wave 7** _(after Wave 6)_

- [x] 04A-07-PLAN.md — Controllers (modifier-groups/options/item-sizes/stop-list POST + DELETE, publish + DELETE publish for undo); error mapping for 3 new errors; downstream consumer refactors (qr-menu types, e2e specs imageS3Key → photos, tenant-isolation cross-tenant matrix for 5 new entities); regen docs/api/openapi.yaml + packages/api-client; pnpm openapi:check script + CI workflow gate (CAT-02/04/05/06; D-4a-08/09)
      **UI hint**: no
      **Persona reviewers**: persona-cto, persona-skeptic (already reviewed parent Phase 4 → see `.planning/phases/04-catalog-admin/PERSONA-REVIEWS.md`)

### Phase 4b: Catalog Admin UI

**Goal**: Build the full `apps/admin` CRUD UX over the Phase-4a-finalized catalog schema — categories, items (with photo upload + БЖУ + allergens + ingredients), modifier groups, sizes, stop-list (inline + dashboard widget), draft/publish flow with status badges + sticky publish bar, "Preview as customer" link to existing `apps/qr-menu` for activation feedback loop.
**Depends on**: Phase 4ba
**Requirements**: CAT-01 (categories CRUD UX), CAT-02 (items editor UX — form layout), CAT-03 (photo upload UX + presigned PUT), CAT-04 (modifier groups UX), CAT-05 (variants UX), CAT-07 (stop-list UX), CAT-08 (diff UX — badges + sticky bar)
**Success Criteria** (what must be TRUE):

1. Sidebar `Menu` expandable group with sub-routes for Categories / Items / Modifiers / Stop-list; Items default = compact table (thumb + name + category + price + status); default filter = all except archived
2. Full-page item editor at `/dashboard/menu/items/[id]` with tabs for variants + modifier groups; single-locale MVP-1; structured БЖУ inputs (per 100g, nullable, estimated flag); single-photo upload with drag-drop
3. Auto-save-draft + explicit Publish (revised D-08 per Product Strategist HIGH-2); delayed-publish + 5s undo toast (revised D-10 per CTO HIGH-1 + Skeptic HIGH-2 convergence — see `04b-CONTEXT.md` after discuss); status badges + sticky publish bar with first-publish vs republish distinction
4. Stop-list as inline switch in Items row + "Today's 86" widget on Dashboard with "Reset all" button; stale-stop-list warning surface at >24h (per Skeptic MED); manual reset only
5. "Preview as customer" link from admin to `apps/qr-menu` route for the active tenant — closes the Phase-04 activation gap (per Growth Marketer HIGH-1)
6. Badge copy uses `Paused` / `Стоп` (not `86'd` — per Growth Marketer MED-1); `destructive` variant reserved for archive, not paused
   **Plans**: 9 plans

Plans:
**Wave 0**

- [x] 04b-01-PLAN.md — Foundation: install react-hook-form + @hookform/resolvers + 9 shadcn primitives; harden apiFetchInternal with AbortSignal.timeout + retry-on-idempotent-5xx + PATCH (D-4b-07 prerequisites)

**Wave 1** _(after Wave 0)_

- [x] 04b-02-PLAN.md — Backend addendum: migration 0042 (menu_categories.status) + 9 application services + 7 GET + 2 PATCH archive endpoints + OpenAPI regen + drift gate + [BLOCKING] db:migrate (CAT-01, CAT-02, CAT-04, CAT-05, CAT-07, CAT-08)

**Wave 2** _(after Wave 1)_

- [x] 04b-03-PLAN.md — Backend addendum: S3 presignPut + ImageUrlPort extension + POST /photo-upload-url + MinIO dev CORS + Terraform stub for prod + manual MinIO smoke probe (CAT-03)

**Wave 3** _(after Waves 1+2 — frontend foundation; sidebar/sticky-bar runs parallel with categories)_

- [x] 04b-04-PLAN.md — Sidebar Menu group + /dashboard/menu layout + StickyPublishBar (RSC + client island) + Sonner countdown toast (id 'publish-countdown') + schedule/cancel publish actions + StatusBadge + AutoSaveIndicator shared primitives (CAT-08)
- [x] 04b-05-PLAN.md — Categories CRUD: page + form (Sheet) + indented CategorySelect + 3 server actions (upsert / archive AlertDialog / reorder ↑↓) + shared CategoryFormSchema + refineCategoryDepth + LocalizedText boundary helpers (CAT-01)

**Wave 4** _(after Wave 3 — items list extends zod-schemas from Plan 05)_

- [x] 04b-06-PLAN.md — Items list: page + filter bar + table with stop-list switch + archive AlertDialog + 2 server actions (toggle-stop-list / archive-item) (CAT-02, CAT-07)

**Wave 5** _(after Wave 4 — item editor + stop-list page reuse items table primitives; both extend zod-schemas)_

- [x] 04b-07-PLAN.md — Item editor: RSC + tabs shell + Detail tab (RHF + zodResolver + useDebouncedAutosave hook with request-id guard) + Sizes tab (per-row blur save) + PhotoUploadClient (presigned PUT direct-to-S3) + BJU row + 3 server actions (CAT-02, CAT-03, CAT-05)
- [x] 04b-09-PLAN.md — Stop-list page + "Today's 86" dashboard widget + reset-all server action (looped DELETEs with partial-success report) + >24h stale warning + dashboard integration (CAT-07 dedicated surface)

**Wave 6** _(after Wave 5 — Modifiers tab integrates into the item editor shell from Plan 07)_

- [x] 04b-08-PLAN.md — Modifier groups two-surface model: list + group editor (RHF auto-save) + inline options list (per-row blur save) + Item editor Модификаторы tab (chip picker + Sheet + quick-create Dialog) + 3 server actions (CAT-04)
      **UI hint**: yes (mandatory ui-phase pass before discuss-phase)
      **Persona reviewers**: persona-product-strategist, persona-growth-marketer (already reviewed parent Phase 4 → see `.planning/phases/04-catalog-admin/PERSONA-REVIEWS.md`)

### Phase 5: Customer Site

**Goal**: Scaffold `apps/website` with menu display, delivery/pickup mode selection, address validation, cart entry — checkout button is disabled until Phase 8 completes
**Depends on**: Phase 4b
**Requirements**: SITE-01, SITE-02, SITE-03, SITE-04, SITE-05, SITE-06, SITE-07, SITE-09, SITE-10
**Success Criteria** (what must be TRUE):

1. `apps/website` builds and serves the published menu for the resolved tenant via subdomain routing (`<slug>.resto.app`); custom domain resolution via `tenant_domains` table works
2. Guest selects delivery or pickup, enters a delivery address and sees inline zone validity feedback (stub — real zone check wires in at Phase 9), and can choose ASAP or scheduled order time
3. Guest sees cart with promo code field (non-functional placeholder until Phase 11) and a total breakdown showing subtotal; delivery fee, modifiers, and discounts wire in via Phase 7/8/11
4. Guest provides contact info and the checkout button is visible but disabled with a "coming soon" state until Phase 8 completes; no real payment flow is initiated in this phase
5. Operator-editable content pages (About, Delivery, Contact, FAQ) are accessible from the site
   **Plans**: 6 plans

Plans:
**Wave 1**

- [x] 05-01-PLAN.md — Scaffold apps/website (Next.js App Router + RSC, admin stack) + init @resto/ui + canonical MenuDto types in @resto/api-client (SITE-01) [package legitimacy gate]

**Wave 2** _(after Wave 1)_

- [x] 05-02-PLAN.md — Tenant + locale middleware (subdomain/custom-domain + prod-safe dev ?tenant=), server-only /v1/menu client, env schema, i18n (en default), RSC layout with per-tenant theme injection (SITE-02, SITE-09)

**Wave 3** _(after Wave 2)_

- [x] 05-03-PLAN.md — Menu render: RSC page + tenant gating (not-found/suspended/error) + TenantHeader + MenuItemCard grid + ItemModal (modifiers + live price) + CategoryNav (SITE-02)

**Wave 4** _(after Wave 3 — parallel: cart and content pages have no file overlap)_

- [x] 05-04-PLAN.md — Cart: Zustand store (ORD-03-compatible, sessionStorage) + DeliveryPickupBanner + CartDrawer + promo stub + wire add-to-cart + header badge (SITE-03, SITE-05)
- [x] 05-06-PLAN.md — Seeded content pages About/Delivery/Contact/FAQ (plain-text, split-on-newline) + per-page SEO (SITE-10)

**Wave 5** _(after Wave 4)_

- [x] 05-05-PLAN.md — Single-page checkout: address+zone stub + contact form (RHF) + ASAP/scheduled time + order summary + disabled "coming soon" pay button (SITE-04, SITE-06, SITE-07)
      **UI hint**: yes
      **Persona reviewers**: persona-cto, persona-skeptic, persona-product-strategist, persona-growth-marketer

### Phase 6: QR-Menu Customer

**Goal**: Deliver a real customer-facing ordering UX in `apps/qr-menu` — branded menu display, item detail with modifiers, cart, table binding — over the already-working `/v1/menu` API
**Depends on**: Phase 4b
**Requirements**: QRM-01, QRM-02, QRM-03, QRM-04, QRM-05, QRM-06, QRM-07, QRM-08, QRM-09, QRM-10, QRM-11, QRM-12
**Success Criteria** (what must be TRUE):

1. Guest sees the restaurant's branded header, categories, items with photos and prices; stop-listed items appear visibly disabled
2. Guest opens an item detail, selects modifiers with live price updates, adds the item to cart, adjusts quantity, and sees running subtotal
3. Guest's table number is auto-bound from the `?table=` QR param or can be entered manually
4. Multi-language switcher works (locale from URL > cookie > Accept-Language)
5. Production build emits source maps as `'hidden'` and the bundle test asserts source maps are not publicly served
   **Plans**: 5 plans
   - [x] 06-01-PLAN.md — Extract @resto/cart shared package (+ table/setTable) and re-point apps/website
   - [x] 06-02-PLAN.md — Expose isStopListed through /v1/menu (domain → controller → OpenAPI → api-client) + wire website flag
   - [x] 06-03-PLAN.md — qr-menu: switch to @resto/api-client/public, branded header, item detail modifiers + live price + add-to-cart
   - [x] 06-04-PLAN.md — qr-menu: cart drawer + quantity/remove, table binding, stop-list disabled, en/ru locale switcher
   - [x] 06-05-PLAN.md — qr-menu: hidden source maps + bundle test (QRM-11/12) + noindex shell
         **UI hint**: yes
         **Persona reviewers**: persona-cto, persona-skeptic, persona-product-strategist, persona-growth-marketer

### Phase 7: Ordering

**Goal**: Build the new `ordering` bounded context — Order aggregate with full state machine, idempotent creation, immutable item snapshot, totals calculation, event contracts, DB tables, NATS subject, audit wiring, outbox claim-token race fix, and the pure domain discount engine
**Depends on**: Phase 5
**Requirements**: ORD-01, ORD-02, ORD-03, ORD-04, ORD-05, ORD-06, ORD-07, ORD-08, ORD-09, ORD-10, ORD-11, ORD-12, PROMO-06
**Success Criteria** (what must be TRUE):

1. The `ordering` context exists at `apps/api/src/contexts/ordering/` with the full 4-layer DDD structure matching the project's hexagonal pattern
2. An Order aggregate transitions through the full state machine (`created → paid → accepted → preparing → ready → completed`, plus `canceled`, `refunded`, `failed`) with domain events emitted at each transition; `orders` table includes `scheduled_for TIMESTAMPTZ NULL` with operating-hours validation
3. Cart-to-order conversion is anonymous (no auth required); order records an immutable snapshot of items, modifiers, and prices at creation time
4. Order total calculation (`subtotal + modifiers + delivery + service_fee − discount = total`) lives entirely in the domain layer with correct rounding; idempotent order creation rejects duplicate client keys; pure discount engine (no DB calls at calculation time) is available for Phase 8 checkout
5. `ordering.>` events (`order_created`, `order_paid`, `order_canceled`, `order_refunded`, `order_status_changed`) are consumed by the `audit` context and produce audit rows; `outbox_events` table has `claim_token UUID` column and `releaseOutboxClaim`/`markOutboxDelivered` are scoped to the claiming replica's token
   **Plans**: 5 plans

Plans:
**Wave 1** _(parallel — no file overlap)_

- [x] 07-01-PLAN.md — Pure domain foundation: OrderId/OrderItemId branded IDs + ordering money-utils + discount engine (PROMO-06, TDD)
- [x] 07-02-PLAN.md — Persistence + contracts: 4 Drizzle tables + migration 0049 + RLS + 5 ordering.\* event contracts (ORD-06/07; ORD-08/11 verify-only)

**Wave 2** _(after 07-01)_

- [x] 07-03-PLAN.md — Order aggregate: full state machine + immutable snapshot + totals + errors/ports (ORD-01/02/04/05, TDD)

**Wave 3** _(after 07-02 + 07-03)_

- [x] 07-04-PLAN.md — Application + infra: CreateOrderInput DTO + repository (idempotent outbox) + create/get-order services (ORD-03/04/10/12, PROMO-06 wiring)

**Wave 4** _(after 07-04)_

- [x] 07-05-PLAN.md — HTTP surface + audit loop: anonymous POST /v1/orders + OrderingModule + app.module + ordering.> audit wiring + isolation net (ORD-01/03/07/09)
      **UI hint**: no
      **Persona reviewers**: persona-cto, persona-skeptic, persona-investor

### Phase 7.5: Production Deploy

**Goal**: Stand up the first real production environment so the MVP-1 spine is actually shippable and Stripe webhooks (Phase 8) have a public HTTPS URL to call. Pragmatic over ideal — managed services, not a full k8s build-out _(added 2026-06-12 scope rebalance — closes the CTO review HIGH finding that no production deploy existed; `infra/k8s` and `infra/terraform` were stubs)_

> **Scope change (2026-06-21):** `apps/admin` is being migrated to a Vite SPA (Phase 7.6) and will deploy as **static**, not an ECS service. The admin ECS service / admin Dockerfile / admin CD path are dropped. Plan 07.5-11's admin Dockerfile (already written) is superseded; its website Dockerfile stays. The api Docker-boot fix (07.5-02) is done and unaffected. Stack locked via 07.5-CONTEXT.md.
>
> **Re-plan (2026-06-26):** Admin static deploy **folds back into 7.5** (it had been deferred to 7.6). 7.5 now stands up **all four surfaces** — **api + website (ECS/Fargate) + qr-menu + admin (both static on Cloudflare Pages/CDN)** — making SC#1/SC#5's four-surface smoke self-consistent and **superseding Phase 7.6 plan 07.6-07**. The 9 stale 2026-06-21 plans (admin-as-ECS, `01`/`03`–`10`) are archived under `_superseded-2026-06-21/` and re-planned fresh; `07.5-02` + the website Dockerfile (`07.5-11`) stay as done anchors. The plan list below is regenerated by this re-plan.
>
> **DEFERRED to first customer + VPS target (2026-06-26):** Two founder decisions superseded the AWS direction: (1) the hosting target is a **single VPS + Cloudflare** (Docker Compose: api+postgres+nats; Cloudflare Pages for admin/qr-menu; R2 for media) — **NOT AWS** (RDS/ECS dropped; the half-built AWS resources were torn down); (2) the live prod stand-up is **DEFERRED until the first paying customer** (no boxed infra months before revenue). **Done now:** Wave 0 code prod-readiness (`01`–`05`, `11`). **Deferred (`06`–`10`):** the live server stand-up — re-plan for the VPS stack at go-live. **Interim:** MVP is built locally; the only public-URL need (Stripe webhooks, Phase 8) is covered free by **Stripe CLI / Cloudflare Tunnel**; static (Pages) + media (R2) are free anytime.

**Depends on**: Phase 7 (a deployable surface — admin + catalog + ordering — exists)
**Requirements**: infra phase, no product requirement IDs
**Success Criteria** (what must be TRUE):

1. All four apps — `apps/api` + `apps/admin` + `apps/website` (ECS/Fargate) + `apps/qr-menu` (static hosting) — run in a managed production environment reachable over HTTPS on a real domain (website checkout stays disabled until Phase 8, but the public storefront surface is live); the 3-role Postgres schema (`resto_app` / `resto_auth` / admin-migration role) is provisioned on managed Postgres
2. Object storage (R2/S3) is wired for menu media; secrets are injected at runtime (platform secret store / Vault), never baked into images or committed
3. CD deploys on merge to `main` on top of the existing nx-affected CI; database migrations run as a pre-rollout step (`pnpm db:migrate`)
4. Boot-time preflight assertions (`assertProdGuardrails`, RLS-bypass checks) pass in the real prod environment — the process refuses to start on misconfiguration
5. A public HTTPS endpoint exists for Stripe webhooks before Phase 8 begins; an external smoke confirms all four surfaces are reachable over HTTPS (api `/healthz`, admin login page, website tenant menu, qr-menu SPA) and a tenant menu renders end-to-end
   **Plans**: 9 plans (7 re-planned 2026-06-26 + 2 done anchors `02`/`11`; numbers `05` unused, `01`/`03`/`04`/`06`–`10` reused from the archived set)

Plans:
**Wave 0** _(gating — code-side readiness + the DB BLOCK spike; run in parallel, no file overlap)_

- [x] 07.5-01-PLAN.md — D-04 HARD GATE: managed-Postgres BYPASSRLS spike → DB-PROVIDER-DECISION (Neon vs RDS) before any provisioning
- [x] 07.5-02-PLAN.md — G-01 BLOCK: esbuild .sql text-loader Docker boot fix + restored docker-api CI gate (api image boots, preflights green on real Postgres) — DONE ANCHOR
- [x] 07.5-03-PLAN.md — D-05 direct-connection outbox lock + G-03 leader-aware /readyz + G-04 Sentry init + G-05 web-env fail-loud (DATABASE_DIRECT_URL, SENTRY_DSN; Sentry legitimacy gate folds in)
- [x] 07.5-04-PLAN.md — D-06 NATS DLQ/max_deliver live verify + outbox-decouples-NATS proof + qr-menu same-origin requirement → PRE-DEPLOY-VERIFY
- [x] 07.5-11-PLAN.md — website production Dockerfile (Next output:standalone, NEXT_PUBLIC_API_ORIGIN build arg) — DONE ANCHOR (admin Dockerfile half superseded; admin is static)

**Wave 1** _(provider provisioning — depends on the Wave 0 DB decision + NATS verify)_

- [ ] 07.5-06-PLAN.md — Provision managed Postgres (provider per 07.5-01): 3 roles + extensions + migrations + backups + tested restore (G-02) + preflight dry-check (SC#1/#4)
- [ ] 07.5-07-PLAN.md — NATS JetStream on EC2+EBS (D-06) + Cloudflare R2 wiring (D-07); degraded-mode + presigned-PUT verified (SC#2)

**Wave 2** _(hosting surface — depends on bootable api image + website Dockerfile + DB + NATS/R2)_

- [ ] 07.5-08-PLAN.md — ECS api+website + static admin+qr-menu (Cloudflare Pages) + ALB/ACM + Secrets Manager + Cloudflare DNS/TLS/CDN/routing + qr-menu same-origin rewrite (SC#1/#2/#5; D-01/02/03/05/08/09; G-05)

**Wave 3** _(CD — depends on the live hosting surface)_

- [ ] 07.5-09-PLAN.md — GitHub Actions CD on merge to main (nx-affected): build api/website → ECR + admin/qr-menu static → gated db:migrate → deploy all four + live /healthz (SC#3; D-10; G-06 strategy)

**Wave 4** _(go-live gate)_

- [ ] 07.5-10-PLAN.md — SC#5 external four-surface E2E smoke (api/website/qr-menu/admin + ported ADM-00 Playwright) + G-02 restore proof + G-06 app-only rollback proof + G-07 infra-stub supersession (no Redis)
      **UI hint**: no
      **Persona reviewers**: persona-cto, persona-investor

### Phase 7.6: Admin → Vite SPA

**Goal**: Migrate `apps/admin` from Next.js 16 (App Router / RSC / server-actions) to a **React + Vite + shadcn SPA**, and deploy it as **static** (Cloudflare Pages or R2 + CDN, like qr-menu). The admin is an internal auth-gated operator dashboard — no SEO / SSR-first-paint benefit — so the Next standalone-Docker friction + RSC complexity buy nothing. Recommended approach: **fresh Vite scaffold + port the existing shadcn primitives and feature components** (they are framework-agnostic React); rewrite only routing + the data/auth layer. _(decided 2026-06-21 during Phase 7.5 deploy work — see `.claude/.../memory/project_admin_vite_migration_2026_06_21.md`)_
**Depends on**: Phase 7.5 api deploy (operator-auth API endpoints reachable). Should complete BEFORE the admin static deploy is finalized.
**Requirements**: no new product requirement IDs — re-platform of an existing surface.
**Success Criteria** (what must be TRUE):

1. `apps/admin` is a Vite + React + shadcn SPA (no Next.js, no RSC, no server actions) with client-side routing; the existing catalog-admin UI surface (item list, item/category/modifier editors, stop-list, publish flow, photo upload, sidebar nav) is preserved by porting components.
2. **No `INTERNAL_API_TOKEN` in the browser.** All admin→API calls go through **operator-authenticated** endpoints (better-auth session + RBAC), not `/internal/*` — closing review HIGH-7 (per-operator RBAC/attribution). The API exposes the operator-facing endpoints the admin needs (catalog admin endpoints already use operator-auth + Permissions; any remaining `/internal/*` reliance is retired or replaced).
3. Auth: operator login → better-auth session works from the SPA; open-redirect / cookie-security concerns (formerly handled in Next server actions) are re-established client-side.
4. The admin builds to static assets and deploys via Cloudflare Pages/R2 + CDN with the wildcard/admin host + TLS (folds the deferred admin slice of Phase 7.5); CD publishes on merge to main.
5. The four-surface smoke (Phase 7.5 SC#5) passes with the new static admin reachable over HTTPS.

**Plans**: 9 plans in 4 waves _(08/09 added 2026-06-26: CR-04 per-brand publish rework — review before execution)_

Plans:
**Wave 1** _(parallel — API enablers + SPA foundation, no file overlap)_

- [x] 07.6-01-PLAN.md — D-08: relocate 7 catalog GET reads to operator v1/catalog + delete internal-catalog controller (SC-1/SC-2)
- [x] 07.6-02-PLAN.md — operator POST/DELETE /v1/tenants/me/offboard (closes settings internal-token gap) + admin-host CORS/trusted-origins env (SC-2/SC-3)
- [x] 07.6-03-PLAN.md — Vite + React + Tailwind4 + shadcn scaffold; env/api-client/auth-client/query-client/i18n/theme/router root; retire Next (legitimacy gate) (SC-1/SC-2/SC-3)

**Wave 2** _(surface port — depends on 07.6-03; partitioned by route-group, no file overlap)_

- [x] 07.6-04-PLAN.md — auth routes + client route guard + dashboard shell + sidebar/nav-user/brand-switcher (brand-in-URL) + onboarding/brand (SC-1/SC-3)
- [x] 07.6-05-PLAN.md — menu surface: items/categories/modifier-groups/item-sizes/stop-list + publish flow + photo upload + draft-diff via operator v1/catalog (SC-1/SC-2)
- [x] 07.6-06-PLAN.md — brands/domains/payouts/theme + settings (offboard danger-zone on operator endpoint) + team; eliminates last internal-token path (SC-1/SC-2)

**Wave 3** _(deploy + verify — depends on full surface)_

- [~] 07.6-07-PLAN.md — ~~Cloudflare Pages static deploy + admin host/TLS + CD on merge + ported ADM-00 Playwright smoke + four-surface HTTPS smoke (SC-4/SC-5)~~ **SUPERSEDED by Phase 7.5 (re-plan 2026-06-26)** — admin static deploy now folds into the 7.5 prod stand-up (it was blocked here because 7.5 prod did not exist). The ported ADM-00 Playwright smoke + four-surface HTTPS smoke move into 7.5's go-live gate.
  **UI hint**: yes (re-platform of a UI app — consider `/gsd:ui-phase` if the visual surface changes)
  **Persona reviewers**: persona-cto, persona-skeptic

**Wave 4** _(CR-04 per-brand publish rework — independent of 07.6-07 deploy; founder-decided 2026-06-23; plan reviewed before execution)_

- [ ] 07.6-08-PLAN.md — CR-04 data path: catalog_menu_version → per-brand PK (migration 0054) + brand-aware menu-version port/adapter + brand-keyed delayed-publish + @RequireBrand on publish/cancel/draft-diff + computeDraftDiff brand filter (CR-04)
- [ ] 07.6-09-PLAN.md — CR-04 wire + verify: v2 publish events (brandId) + per-brand finalizeMenuPublish UPSERT + per-brand public /v1/menu ETag + cross-brand isolation e2e (version/ETag/403/draft-diff) (CR-04)
      **Persona reviewers**: persona-cto, persona-skeptic

### Phase 8: Payments (Stripe Connect)

**Goal**: Replace `NoopStripeConnectAdapter` with a real Stripe Connect Express implementation — account onboarding, payment intent routing, webhook handling, refund flow, pending-KYC UX state, outbox leader health probe, order confirmation page, and guest notification emails
**Depends on**: Phase 7
**Requirements**: PAY-01, PAY-02, PAY-03, PAY-04, PAY-05, PAY-06, PAY-07, PAY-08, PAY-09, PAY-10, PAY-11, PAY-12, PAY-13, SITE-08, GNOTIF-01, GNOTIF-02, GNOTIF-03, GNOTIF-04
**Success Criteria** (what must be TRUE):

1. Operator initiates Stripe Connect onboarding from admin and is redirected to Stripe's hosted onboarding flow; `account.updated` webhook updates the tenant's `stripe_account_id` and onboarding status; tenant can use catalog, CRM, and admin fully while KYC is in progress — only the "Accept payments" live switch is gated
2. At checkout, a `PaymentIntent` is created routed to the tenant's Stripe account with a RestOS application fee; `payment_intent.succeeded` transitions the order to `paid`; guest is redirected to the order confirmation page (SITE-08) with the order number
3. `payment_intent.payment_failed` surfaces a failure message to the guest with a retry CTA; operator-initiated refund creates a Stripe refund and transitions the order to `refunded` (full or partial)
4. Guest receives an order confirmation email immediately after payment succeeds; guest receives status emails on `accepted` and `ready/on-its-way` transitions; guest receives a refund confirmation email when a refund is initiated; email templates respect tenant brand theme (logo, accent color)
5. Stripe webhook handler is idempotent using the inbox dedup pattern with Stripe event ID; webhook endpoint rejects invalid signatures with 400; `stripeAccountId` Zod schema has `.max(255)`; `OutboxDispatcher` exposes `outbox.is_leader` OTel gauge (1/0) and `/health/readiness` marks pod NOT ready when leader hasn't dispatched in >30s
   **Plans**: 8 plans in 5 waves _(charge model resolved to DIRECT charges per D-02; schema redesign sequenced first per D-07; 08-04 split into API/website per checker W4; admin onboarding surface added per checker B3)_

Plans:
**Wave 1**

- [x] 08-01-PLAN.md — Payments/order/tenant schema + aggregate redesign (migration 0055): partial-refund accounting (payment_refunds), N PaymentIntents/order, SCA requires_action state, Stripe-account linkage, tenant capability fields + canAcceptPayments; orders.customer_email guest-email column (erasure-covered via 0051) (D-07/D-08/D-04/D-12/B2; PAY-09/13, SITE-08 substrate)

**Wave 2** _(after 08-01)_

- [x] 08-02-PLAN.md — Real StripeConnectAdapter replacing the Noop: Express onboarding + account_link, createPaymentIntent (DIRECT charge, config-driven application fee), cancel/refund, idempotency keys; onboarding + stripe-status endpoints + admin Connect-Stripe button & KYC status surface (D-01/02/03/06/09/B3; PAY-01/02/03/06/13) [stripe legitimacy gate + admin click-through verify]

**Wave 3** _(after 08-02; 08-07 also after 08-01)_

- [x] 08-03-PLAN.md — Stripe webhooks: raw-body + signature verify (400) + runDeduped on event id; payment_intent.succeeded/failed, account.updated (unregistered-account no-op, W3), charge.refunded/dispute; single-writer-of-paid + double-charge orphan auto-refund (D-06/10/11/W3; PAY-04/05/07/08/10)
- [x] 08-07-PLAN.md — PAY-12 deltas only (D-14): outbox.is_leader OTel gauge + never-dispatched false-negative fix + 30s SLA reconcile; PAY-11 effective StripeAccountId .max(255) on the webhook parse path + rejecting unit test (W5) (PAY-11/12)

**Wave 4** _(after 08-03 — parallel, no file overlap)_

- [x] 08-04a-PLAN.md — Checkout API: server-authoritative PaymentIntent gated on canAcceptPayments, currency-integrity, cancel-prior-PI (double-charge guard), SCA requires_action; read-only GET /v1/orders/:id/status (D-06/08/12; PAY-06/08/13, SITE-08 substrate)
- [x] 08-06-PLAN.md — Guest emails (GNOTIF): EmailAdapterPort.sendGuestNotification + brand-themed per-locale templates; recipient = orders.customer_email; GNOTIF-01/03 fire now, GNOTIF-02 machinery wired to a Phase-10 trigger; send-once idempotency + explicit max_deliver + DLQ on the subscriber (D-13/B2/B4; GNOTIF-01/02/03/04)

**Wave 5** _(08-04b after 08-04a+08-03; 08-05 after 08-03)_

- [x] 08-04b-PLAN.md — Website checkout + SITE-08: guest-email capture, Stripe Payment Element, 3DS, same-order retry (no new order), read-only polling confirmation page (D-06/08/B2; SITE-08, PAY-06/08) [end-to-end test-mode smoke verify]
- [x] 08-05-PLAN.md — Refunds + disputes: owner-only server-enforced refund (full+partial, reason mandatory), canonical CancelOrderService auto-refund (Phase 10 reuses, W1), manual↔webhook reconcile (no double-refund), dispute record+notify, cross-tenant isolation e2e (D-04/09/10/11/W1; PAY-09, GNOTIF-03)
      **UI hint**: no
      **Persona reviewers**: persona-cto, persona-skeptic, persona-investor

### Phase 08.1: Payments — Provider Layer & Onboarding UX (INSERTED)

**Goal**: Make the payments layer provider-agnostic and upgrade tenant onboarding UX — embedded Connect onboarding without leaving the admin domain, a "connect existing Stripe" one-click path (Connect Standard OAuth), and a generalized payment-provider abstraction so Mollie/Adyen/local acquirers can be added later via a new adapter + config only, without touching checkout/refund/webhook application code
**Depends on**: Phase 8
**Requirements**: PAY-14, PAY-15, PAY-16, PAY-17
**Success Criteria** (what must be TRUE):

1. Operator completes Stripe KYC without leaving the admin domain (embedded Connect components); pending-KYC state still lets them use catalog, CRM, and admin fully — only the live "Accept payments" switch is gated (PAY-13 preserved)
2. A tenant who already has Stripe connects it in one click via OAuth (Connect Standard) and can accept payments with the RestOS `application_fee` applied — no secret-key handling, dashboard stays with the tenant
3. The payments application code (checkout, refund, webhook services) depends only on a provider-agnostic `PaymentProviderPort`; adding a second provider requires a new adapter + config only — proven by a stub second-provider adapter or an architecture test — and the tenant carries a `paymentProvider` discriminator
4. The onboarding method ("Create new (Express)" vs "Connect existing (Standard)") is selectable in admin and resumable
   **Plans**: 5 plans
   - [x] 08.1-01-PLAN.md — Per-brand Stripe schema reshape (migration 0057, brand aggregate payment fields, brand repo findByStripeAccountId, tenant Stripe columns dropped — no backfill)
   - [x] 08.1-02-PLAN.md — Provider-agnostic PaymentProviderPort + StripeProviderAdapter rename/extend + stub adapter + ESLint architecture test (PAY-16)
   - [x] 08.1-03-PLAN.md — Repoint checkout/refund/webhook to per-brand account+currency; verifyWebhookSignature via port; DI rewired to PAYMENT_PROVIDER_PORT (D-07)
   - [x] 08.1-04-PLAN.md — Embedded Express onboarding: per-brand account-session API + admin ConnectAccountOnboarding + method choice + gated @stripe browser packages (PAY-14/17)
   - [x] 08.1-05-PLAN.md — Connect Standard OAuth start/callback (signed CSRF state) + admin "Connect existing" path; completes resumable method choice (PAY-15/17)
         **UI hint**: yes
         **Persona reviewers**: persona-cto, persona-skeptic, persona-product-strategist

### Phase 08.2: Brand-first Routing & Access-Control Core (INSERTED)

**Goal**: Refactor the admin information architecture to brand-first routing AND ship the brand-level access-control core that the later owner-managed-roles and location-scoping phases build on. (1) Drop the `/dashboard` prefix — every admin page under the brand path (`/{brand}/...` or `/b/{brand}/...`, decided in CONTEXT); `/` redirects to the active brand; protect against brand-slug ↔ root-route collisions. (2) Flip member brand-scope from **default-allow to default-deny** — today an empty/unset `member_brand_scope` grants ALL brands; this is the real, shippable security delta. (3) Move the "active brand" from a forgeable cookie into the **server session**, reconciled against the request's brand on every call (anti-tamper, mirroring the existing `auth.tenant_mismatch` cross-check). (4) Owner switches brands freely in-session (no re-login); a non-owner session is **pinned to one active brand**, switching re-issues the session pin (no password). (5) Extend the existing `BrandScopeGuard` coverage to close opt-in gaps; optionally add brand-level RLS (GUC + policy) for defense-in-depth. Tenant stays billing-only (even the owner always works inside a brand). Source: SEED-001 + `08.2-PERSONA-REVIEWS.md`.

**Split-off (founder, 2026-06-29)** — the original SEED-001 vision is delivered as a SEQUENCE; nothing dropped:

- **Owner-managed custom roles** → its own follow-on phase: enable better-auth `dynamicAccessControl` (off today at `auth.config.ts:206` "until tenant role-creation enforces a creator-subset permission check"), build the creator-subset privilege-escalation guard, and the owner UI to create roles → toggle permissions → assign to staff. Primitives already exist (`@resto/domain` `PERMISSIONS_STATEMENT` + `SYSTEM_ROLES` owner/admin/staff; permission-checker already anticipates tenant-defined roles).
- **Location-level scoping** → its own follow-on phase: introduce a `locations` entity (none exists today) + `member_location_scope`, refine member scope from brand-level to location-level + locations admin UI.
- Both build ON this phase's access core. Sequence them after 08.2.

**Depends on**: Phase 08.1 (per-brand brand-aggregate work), Phase 3 (auth/RBAC), Phase 1 (tenancy/RLS)
**Requirements**: TBD (derive in plan-phase from CONTEXT; relates to Phase 17 operator self-service)
**Security review**: REQUIRED before code — default-deny flip + server-session active-brand pin is security-sensitive (URL/cookie/session tamper resistance); run a threat pass in planning and /gsd-secure-phase after
**Success Criteria** (draft — refine in CONTEXT/plan):

1. Admin URLs are brand-first: no `/dashboard` prefix; all pages under the brand path; `/` redirects to the active brand; deep links resolve; old `/dashboard/...` links handled per CONTEXT
2. Brand slug cannot collide with a root route (reserved-word guard extended OR structural `/b/` prefix); server-enforced; any existing colliding slug handled
3. Member brand-scope is **default-deny**: a member with empty/unset scope reaches NO brand; owner (`canViewAllBrands`/null scope) unaffected
4. Active brand lives in the **server session**, not just a cookie; forging the cookie/URL to a brand outside the session pin or the member's scope returns existence-hiding 404/403 — proven by an isolation e2e
5. Owner switches between all tenant brands in-session with no re-login; a non-owner session is bound to exactly one active brand at a time (switch = silent session re-pin, no password)
6. (If chosen) brand-level RLS policy active on at least payments/payouts + catalog; otherwise app-layer-only isolation is documented as accepted debt

**Plans**: 6 plans in 3 waves

Plans:
**Wave 1** _(parallel — no file overlap: domain pkg / db pkg / identity session)_

- [x] 08.2-01-PLAN.md — Reserved-slug expansion + ADMIN_ROOT_ROUTE_SEGMENTS contract + drift spec + D-07 collision detector (D-06/D-07/SC-2)
- [x] 08.2-02-PLAN.md — Brand RLS migration 0058 (app_bind_brand GUC + policies on 9 menu tables + orders) + withTenant brand-bind + boot preflight + [BLOCKING] db:migrate; payments documented as app-layer-only accepted debt (D-14/SC-6)
- [x] 08.2-03-PLAN.md — Server-session active-brand pin: session.activeBrandId additionalField (input:false) + set-active hook + POST /v1/identity/me/set-active-brand (owner free-switch / non-owner scoped re-pin) + AuthGuard surfacing (D-09/D-12/D-13/SC-5)

**Wave 2** _(after Wave 1)_

- [x] 08.2-04-PLAN.md — SPA brand-first routing refactor (drop /dashboard, / → active brand, team/settings brand-neutral) + Stripe Connect return-URL fix + brand-switcher API wire (D-03/D-04/D-05/D-12/D-13/SC-1/SC-5) [human-verify checkpoint]
- [x] 08.2-05-PLAN.md — Default-deny flip + BrandScopeGuard default-on (@BrandNeutral opt-out) + D-10 session-pin reconciliation (existence-hiding 404) + inverted unit matrix (D-08/D-10/D-11/SC-3/SC-4)

**Wave 3** _(after Waves 1+2 — runs against the migrated DB)_

- [x] 08.2-06-PLAN.md — SC-4 isolation e2e (forge cookie/URL → existence-hiding 404/403) + cross-brand RLS read matrix (live) + Stripe return-URL regression unit test (D-08/D-09/D-10/D-14/SC-4/SC-6)
      **UI hint**: yes
      **Persona reviewers**: persona-cto, persona-skeptic

### Phase 08.3: Owner-managed Roles & Permissions (INSERTED)

**Goal**: Enable owner-authored custom roles (dynamic RBAC) — the founder's headline access feature. Turn on better-auth `dynamicAccessControl` (off today at `auth.config.ts:206` "until tenant role-creation enforces a creator-subset permission check"); build the **creator-subset privilege-escalation guard** (a role's creator may grant ONLY permissions they themselves hold); build the owner-facing admin UI to **create a role → toggle its permissions from the catalog → assign it to staff**; persist tenant-defined roles. Reuse the existing primitives — `@resto/domain` `PERMISSIONS_STATEMENT` + `SYSTEM_ROLES` (owner/admin/staff) + the permission-checker that already anticipates tenant-defined roles. Source: SEED-001 + `08.2-CONTEXT.md` (split-off).

**Depends on**: Phase 08.2 (brand-level access-control core)
**Requirements**: TBD (derive in discuss/plan)
**Security review**: REQUIRED — re-enabling dynamic AC is a privilege-escalation surface; the creator-subset guard IS the gate that kept it disabled.
**Success Criteria** (draft):

1. Owner creates a custom role in admin, selects its permissions from the catalog, saves it (tenant-scoped)
2. Owner assigns a custom role to a staff member; the member's effective permissions reflect it on the next request
3. A role's creator cannot grant a permission they do not themselves hold — creator-subset enforced server-side, proven by test
4. `dynamicAccessControl` enabled without weakening the fixed system roles; permission-checker resolves system role + custom role

**Plans**: 5 plans in 5 waves

Plans:

- [x] 08.3-01-PLAN.md — domain RBAC prereqs: `ac` resource + colon-action rename, owner-only grant, NON_DELEGATABLE, role-definition event contracts, flip `dynamicAccessControl` + role cap
- [x] 08.3-02-PLAN.md — RestOS `/v1/roles` wrapper (create/update/archive/list), NON_DELEGATABLE + reserved-name guards, soft-archive, `lookupBaseRole` fix, role-definition audit
- [x] 08.3-03-PLAN.md — assignment-subset + self-escalation guard, `MemberRolesController` assign surface, definitive `beforeUpdateMemberRole` backstop, preset seed-at-provision
- [x] 08.3-04-PLAN.md — owner-facing admin UI: Roles list, preset-first role editor (NON_DELEGATABLE hidden), Team assignment surface
- [x] 08.3-05-PLAN.md — security-regression e2e: privilege-escalation (SC#3/D-04), brand-scope orthogonality (D-03/RBAC-09), cross-tenant isolation (RBAC-14)
      **UI hint**: yes
      **Persona reviewers**: persona-cto, persona-skeptic

### Phase 08.4: Location-scoped Access (INSERTED)

**Goal**: Introduce the **locations** entity (a brand has one or more locations/points — none exists today) and refine member scope from brand-level to **location-level**. Add a `locations` table (per brand; composite FK + RLS per the tenancy invariants) + `member_location_scope`; locations admin CRUD; assign staff to one or more locations; a member's effective brand access derives from the brands of their scoped locations. Builds directly on 08.2's brand-level access core (default-deny + server-session active-brand pin + brand RLS) and 08.3's role model. Source: SEED-001 + `08.2-CONTEXT.md` (split-off).

**Depends on**: Phase 08.2 (access core); Phase 08.3 (roles — if location-scoped custom roles are wanted)
**Requirements**: TBD (derive in discuss/plan)
**Security review**: REQUIRED — location scope is a data-isolation boundary; extend the default-deny + existence-hiding-404 pattern to location grain.
**Success Criteria** (draft):

1. A brand has one or more locations manageable in admin (create/list/archive)
2. A staff member can be scoped to one or more locations; out-of-scope locations/brands return existence-hiding 404/403, proven by an isolation e2e
3. `member_brand_scope` is refined to / superseded by location-level scope; owner (unrestricted) unaffected
4. The single-active-brand session from 08.2 interplays correctly with multi-location, multi-brand membership

**Plans**: 11 plans in 7 waves

Plans:
**Wave 1** _(parallel — db pkg / domain pkg, no file overlap)_

- [x] 08.4-01-PLAN.md — DB foundation: locations + member_location_scope tables, app_bind_location GUC, session active_location_id, isolation net (D-01/D-04/D-05/D-11/D-13)
- [x] 08.4-02-PLAN.md — Domain contracts: LocationId + location RBAC resource + system-role perms + admin-escalation regression (D-06/D-07)

**Wave 2** _(identity vs tenancy, no file overlap)_

- [x] 08.4-03-PLAN.md — Active-location session pin (asymmetric owner/staff), scope reader + reachable-brand derivation, GET /v1/me/locations (D-04/D-08/D-09/D-10/D-11)
- [x] 08.4-04-PLAN.md — Tenancy Locations CRUD + archive blast-radius warning, no auto-create (D-01/D-12/D-14/D-17)

**Wave 3**

- [x] 08.4-05-PLAN.md — LocationScopeGuard (owner-bypass + existence-hiding 404) + BrandScopeGuard reachable-brand re-point (D-04/D-05)
- [x] 08.4-06-PLAN.md — Availability/stop-list re-grain to location + default-location resolver + CDN runbook note (D-02)

**Wave 4**

- [x] 08.4-07-PLAN.md — Per-location role assignment (owner-only, NON_DELEGATABLE guard) + LocationPermissionChecker (D-06/D-07/D-08)
- [x] 08.4-08-PLAN.md — Orders location re-grain (NOT NULL location_id + RLS) + checkout default-location binding (D-03/D-12/D-13)

**Wave 5**

- [x] 08.4-09-PLAN.md — Admin: Locations CRUD page + locationSwitcher + staff pick-location + x-location-id echo [human-verify] (D-09/D-10/D-14/D-16/D-17)

**Wave 6**

- [x] 08.4-10-PLAN.md — Admin: Team (location → role) matrix + stale-copy fix [human-verify] (D-15)

**Wave 7**

- [x] 08.4-11-PLAN.md — Location isolation e2e: out-of-scope 404/403, staff no-self-switch, owner bypass, archive access-loss (D-04/D-05/D-10/D-11/D-17)
      **UI hint**: yes
      **Persona reviewers**: persona-cto, persona-skeptic

### Phase 08.5: Owner location filter UX (URL-param + all-aggregate) (INSERTED)

**Goal:** Rework admin location selection from the 08.4 server-session pin + relogin model into an OWNER-ONLY URL search-param filter (`?location=all|<id>`). `all` = aggregate summary across all brand locations (dashboard + stop-list); a specific location filters dashboard / menu / all surfaces by it. Adds backend aggregate endpoints for the `all` case — resolves the documented 08.4 owner-brand-global stop-list gap. The LocationScopeGuard's non-owner (staff) path is left UNTOUCHED (BLOCK-2/D-08 corrected the original guard mis-read); the owner filter is purely client-side, and the gap is closed by new `@LocationNeutral` aggregate endpoints behind a new backend owner-only gate — not by editing the guard. PRESERVES 08.4 D-10/D-11 for STAFF: staff stay pinned to a single location (pick-location at login, change via re-login) — the URL filter is owner-only; staff session stays scoped to a single brand (login-to-brand).
**Requirements**: TBD (derive in discuss/plan)
**Depends on:** Phase 08.4
**Plans:** 5/5 plans complete
**UI hint**: yes
**Persona reviewers**: persona-cto, persona-skeptic (security-sensitive — touches LocationScopeGuard + session model)

Plans:

- [x] 08.5-01-PLAN.md — Backend owner-only gate primitive (@OwnerOnly decorator + OwnerOnlyGuard, 5th APP_GUARD) + guard-untouched regression (D-02/D-08/D-09)
- [x] 08.5-02-PLAN.md — Backend session-pin cleanup: retire owner pin, 403 non-owner brand-switch, LOW-11 accept (D-13/D-14/D-15)
- [x] 08.5-03-PLAN.md — `all` aggregate endpoint (@LocationNeutral @OwnerOnly, no-store, N/M badge) + owner single-location server validation (D-05/D-06/D-07/D-09/D-10/D-11/D-16)
- [x] 08.5-04-PLAN.md — Client location-authority split: apiFetch locationId opt, ?location typed search param, use-effective-location hook (D-01/D-03/D-04/D-12/D-18)
- [x] 08.5-05-PLAN.md — Surfaces + URL-filter switcher + all-mode completeness sweep + real browser smoke (D-05/D-17/D-19)

### Phase 10: Admin Order Intake

**Goal**: Give operators a working order-intake surface in admin — a polled incoming-orders feed with audible alerting, the full status workflow including reject and cancel-after-accept, refunds, filtering, and a live guest-facing order-status page — so a restaurant can run a service on RestOS end to end
**Depends on**: Phase 7, Phase 8 _(Phase 9 Delivery Zones moved to MVP-2 in the 2026-06-12 rebalance, so delivery orders carry no zone, fee, address validation, or dispatch state — the feed must not render a delivery lifecycle the backend cannot back)_
**Requirements**: ORDINT-01, ORDINT-03, ORDINT-04, ORDINT-05, ORDINT-06, ORDINT-07, ORDINT-08, ORDINT-10 _(ORDINT-02 + ORDINT-09 moved to Phase 18 on 2026-08-11 — see below)_
**Success Criteria** (what must be TRUE):

1. New orders appear in the admin Orders page without a page refresh (5-second polling), are visually flagged, and raise an audible alert plus a tab-title counter so a backgrounded tab still signals; an unaccepted order escalates visually after a threshold but nothing automatic ever touches the guest's money; pickup orders work end to end
2. Operator accepts or rejects an incoming order and sets the ready time on accept; rejection auto-triggers a full Stripe refund — and reject/cancel is available to everyone who works with orders, not only the owner (discretionary arbitrary-amount refund stays owner-only `billing:update`)
3. Operator transitions an accepted order through `accepted → preparing → ready → completed`, with each transition timestamped separately
4. Operator cancels an order with a reason at any stage up to `completed`, always with a full auto-refund; a failed Stripe refund still cancels the order and surfaces a retryable red flag rather than blocking the kitchen; operator can filter by status, date, and channel and see full order details
5. The guest sees live status on their phone (`accepted → preparing → ready`) with the operator-set ready time, via the existing public `GET /v1/orders/:id/status`; the checkout captures marketing consent
6. One migration lands every new order field before the first real orders exist — short daily order number, channel, per-state timestamps, cancel reason + actor, ready time, consent — and every status transition is asserted by reading the row back from the database, not from a mocked repository
   **Plans**: 13 plans (10 waves)
   **UI hint**: yes
   **Persona reviewers**: persona-cto, persona-skeptic, persona-product-strategist, persona-growth-marketer _(run 2026-08-11 — see `.planning/phases/10-admin-order-intake/10-PERSONA-REVIEWS.md`)_

**Scope decisions from `/gsd:discuss-phase 10` (2026-08-11) — planner MUST read `10-CONTEXT.md`:**

- **Real-time SSE + graceful SSE shutdown (ORDINT-02, ORDINT-09) moved to Phase 18.** Browser `EventSource` cannot send the `x-tenant-id` / `x-brand-slug` / `x-location-id` headers `TenantContextMiddleware` resolves tenancy from, and a long-lived stream converts per-request authorization into an unbounded connect-time check — both would rework the access-control core built across Phases 08.2–08.5. This phase ships 5-second polling. The shared 60-req/min per-IP rate limit must be fixed for polling to work from several devices behind one restaurant NAT.
- **Pause ordering / opening hours moved to Phase 10.1** (persona-product BLOCK-3).
- **ORDINT-06 narrowed**: "partial refund of specific items" ships as an arbitrary-amount refund (the API that already exists); item-level accounting is deferred.
- **ORDINT-10 is ~90% already shipped** — the endpoint and the website poller exist; the delta is that the poller treats `paid` as terminal.
- **HARD PRE-REQUISITE:** a verified live bug — `CancelOrderService`/`RefundOrderService` call the INSERT-only `save()`, so `orders.status` never flips and `ordering.order_canceled.v1` / `ordering.order_refunded.v1` are dropped. Fixed as a separate quick task before this phase is planned.

Plans:

**Wave 1**

- [x] 10-01-PLAN.md — Order schema migration: new order columns, per-location daily-counter table, feed index, GDPR erase (wave 1)
- [x] 10-02-PLAN.md — RBAC: `order:cancel` verb, preset re-sync for existing tenants, D-07 third re-defer (wave 1)

**Wave 2** _(blocked on Wave 1 completion)_

- [x] 10-03-PLAN.md — Ordering domain: event payloads, widened state machine, new-column persistence (wave 2)

**Wave 3** _(blocked on Wave 2 completion)_

- [x] 10-04-PLAN.md — Order creation: short daily number, channel, marketing consent, `short_number` NOT NULL (wave 3)
- [x] 10-06-PLAN.md — Guest status contract freeze + guest-email ETA, white-label fallback, tracker link (wave 3)

**Wave 4** _(blocked on Wave 3 completion)_

- [x] 10-05-PLAN.md — Cancel/refund money-safety restructure: payment-derived refundability, Stripe outside the tx, retry (wave 4)

**Wave 5** _(blocked on Wave 4 completion)_

- [x] 10-07-PLAN.md — Forward transition services + order feed read model (wave 5)
- [x] 10-09-PLAN.md — Website guest tracker rewrite + marketing-consent checkbox (wave 5)

**Wave 6** _(blocked on Wave 5 completion)_

- [x] 10-08-PLAN.md — Operator order HTTP surface, route-by-route guard audit, poll-safe rate limiting (wave 6)

**Wave 7** _(blocked on Wave 6 completion)_

- [x] 10-10-PLAN.md — Admin Orders page: route, 5s-polled grouped feed, cards, filters, sidebar counter (wave 7)

**Wave 8** _(blocked on Wave 7 completion)_

- [x] 10-11-PLAN.md — Admin order actions: accept/reject popovers, status advance, sound + tab-title alerting (wave 8)

**Wave 9** _(blocked on Wave 8 completion)_

- [x] 10-12-PLAN.md — Order detail Sheet, cancel dialog, owner-only refund, refund-failure surface (wave 9)

**Wave 10** _(blocked on Wave 9 completion)_

- [ ] 10-13-PLAN.md — Phase verification: Playwright operator smoke, two-screen guest loop, evidence matrices (wave 10)

### Phase 10.1: Location schedule and pause ordering (INSERTED)

**Goal**: Give a location a way to stop taking orders — one-tap pause from the order feed and a weekly opening schedule — so a restaurant cannot accept paid orders while closed or overwhelmed
**Depends on**: Phase 8, Phase 10 _(origin: `persona-product-strategist` BLOCK-3 at `/gsd:discuss-phase 10`, 2026-08-11 — `locations` has no hours and no accepting-orders flag, and `CreateOrderService` never checks, so MVP-1 would otherwise close with tenants taking paid orders 24/7. Founder deferred it out of Phase 10 with the risk stated. Spec: `.planning/phases/10-admin-order-intake/10-PERSONA-PRODUCT.md` BLOCK-3.)_
**Requirements**: SCHED-01, SCHED-02, SCHED-03, SCHED-04, SCHED-05
**Success Criteria** (what must be TRUE):

1. Operator pauses order intake for a location in one tap from the order-feed header (20 min / 40 min / rest of day), sees the remaining time, and can resume early
2. While a location is paused, a guest on the site cannot reach checkout for that location and is shown a human-readable reason with the resume time; an in-flight payment already authorized is unaffected
3. Operator sets a weekly opening schedule per location (per-day open/close, closed days), and orders attempted outside those hours are rejected at checkout with the next opening time
4. Pause and schedule state is location-scoped (`ScopedTx` + RLS, consistent with the 08.4 location model) and an owner in `?location=all` mode can see and set it per location
5. Guest-facing rejection happens server-side at order creation, not only in the UI — a forged or stale client cannot create an order at a paused or closed location
   **Plans**: TBD
   **UI hint**: yes
   **Persona reviewers**: persona-product-strategist, persona-skeptic

### Phase 17: Operator Self-service Polish (post-MVP-1)

**Goal**: Ship full operator self-service UX deferred from Phase 3 once first paying customer reveals a real need. Activation trigger: first paying tenant adds a 2nd member with role ≠ owner. (The "BA ≥ 1.5 hook" trigger from the prior draft was removed — research confirmed the hook already exists in BA 1.4.22 as `organizationHooks.afterUpdateMemberRole`, and Phase 3 wires it.) Until trigger fires, all Phase 17 items are non-blocking for MVP-1 close.
**Depends on**: Phase 3 (security-core auth must already be in prod), Phase 4 (catalog admin — operator must already have something to manage before /dashboard/team is meaningful)
**Requirements**: TEAM-01, TEAM-02, TEAM-03, TEAM-04, TEAM-05
**Success Criteria** (what must be TRUE):

1. New `/dashboard/team` page (renamed from "staff" to avoid collision with the `staff` role) renders the member list with email + role + status; operator with `staff:invite` permission sees an "Invite member" affordance
2. Operator with `staff:remove` permission sees pending-invitations table and can revoke a pending invite before its 48h TTL expires
3. Owner / admin can change a member's role in place; mutation goes through `auth.api.updateMemberRole(...)` (BA server-side API — preserves permission graph + session invalidation); the audit envelope already fires from Phase 3's wired `organizationHooks.afterUpdateMemberRole` (no controller-side emit needed), so Phase 17 / TEAM-03 ships UI only; e2e test pins that an `admin`-tier operator cannot promote themselves to `owner`
4. Owner / admin can reset 2FA for subordinates from `/dashboard/team` (lost-device flow); reset emits audit row; for the owner role itself, the documented recovery remains manual founder-side via runbook (the 2FA-equals-email regression of an owner email-recovery loop stays out of scope)
5. Operator can regenerate 2FA recovery codes from `/dashboard/settings`; previous codes are invalidated atomically and the new set is shown once with copy-to-clipboard + saved-confirmation gate (same UX shape as Phase 3 enable flow)

   **Plans**: TBD
   **UI hint**: yes
   **Persona reviewers**: persona-cto, persona-skeptic

## MVP-2: Operational Completeness + AI Agent Platform (placeholder)

> Trigger: MVP-1 closed; first paying customer onboarded; standalone platform stable in prod >30 days. Detailed scope in `.planning/seeds/mvp2-ai-platform.md`. Phase numbering assigned at `/gsd-new-milestone` activation time.

### Track A — Operational Completeness

> Planned in MVP-1, moved here intact in the 2026-06-12 scope rebalance (revenue-spine cut). They run before / alongside the AI track once MVP-1 closes. Phase numbers are preserved from the original MVP-1 plan; nothing deleted.

### Phase 9: Delivery Zones

**Goal**: Give operators a polygon-based delivery zone editor with per-zone fee and threshold configuration, enforce in-zone checks at site checkout via geocoding, and add a Redis geocode cache to survive Nominatim rate limits
**Depends on**: Phase 5, Phase 7, Phase 8
**Requirements**: DELV-01, DELV-02, DELV-03, DELV-04, DELV-05, DELV-06, DELV-07, DELV-08
**Success Criteria** (what must be TRUE):

1. Operator draws a delivery polygon on a Leaflet + OpenStreetMap map (no Google Maps dependency), sets minimum order value, free-delivery threshold, and fixed delivery fee per zone
2. Operator can temporarily disable or re-enable a zone without deleting it
3. At site checkout, the guest's address is geocoded via OSM/Nominatim and checked against active zones; an out-of-zone address is blocked with a human-readable explanation
4. Geocode results are cached in Redis keyed on normalized address string with a 24h TTL; concurrent checkouts do not trip Nominatim's 1 req/sec public API limit under normal load
   **Plans**: TBD
   **UI hint**: yes
   **Persona reviewers**: persona-cto, persona-skeptic, persona-product-strategist

### Phase 10.2: Organization-per-restaurant and account onboarding (INSERTED)

**Goal**: Collapse tenant and brand into a single entity — the Better Auth organization — so one restaurant is one organization, an owner may belong to several, and the active organization chosen at sign-in is the entire context of a session; and give a new owner a working path from "create account" to "first restaurant"

**Depends on**: Phase 10 _(origin: founder, 2026-08-19. Completes a direction the codebase already drifted toward: 08.5 (D-14) closed non-owner brand switching outright, and Phase 10 made the order feed strictly single-location. The brand switcher is the last surface still assuming a session can span brands.)_

**Scope sketch (to be settled at discuss):**

- Sign-in pins exactly one brand. An owner with more than one brand chooses at sign-in — mirror the existing staff pick-location interstitial rather than inventing a second pattern.
- ~~Switching brands means signing in again. Whether that is a full re-authentication or a lighter re-pick is an open question with a real UX cost either way.~~ **Settled 2026-08-19:** switching **revokes the current session and issues a new one**, without re-prompting for the password (CONTEXT.md D-08/D-09). One session = one brand, for the life of that session.
- Remove the brand switcher; the location switcher stays and remains the only in-app context control.

**Scope grew 2026-08-19 (founder) — signup and onboarding fold in here.** The
brand picker this phase builds at sign-in is the same screen the new-account
flow needs, so both live in one phase rather than two fighting over it:

- **Registration asks for name, email and password only.** It creates the user
  AND the tenant. Today the admin form calls Better Auth directly, producing a
  user with **zero memberships** — a stranded account that cannot create a brand
  (verified live 2026-08-19). The correct endpoint `/v1/signup` already
  provisions tenant + owner atomically; the form must call it.
- **No placeholder tenant name.** `tenants.display_name` and `slug` are NOT NULL,
  but the person's own name is a real value, not a stub — use it, derive the slug
  from it plus a short random suffix, and let onboarding replace it with the
  restaurant name. Currency is derived from the country the owner picks, so it is
  never asked; `default_currency` already defaults to `USD` in the schema, which
  covers the moment between account creation and the derivation landing.
- **The signup form's currency field is dead today** — collected and never sent.
  Its "Restaurant name" label is wrong too: the value goes to Better Auth as the
  person's name.
- **Registration asks for country** ("Your country") from a list of supported
  countries, and **currency is derived from it** — never asked. No `country`
  column exists anywhere today and no country list exists in the codebase; the
  Stripe adapter already accepts `country` and `default_currency` as optional
  inputs (`stripe-provider.adapter.ts`) but nothing supplies them, so this
  finally feeds a wire that is already in place.
- **Which countries are "supported" is a product decision, not a lookup.** Stripe
  Connect Express availability differs by country, and this project deliberately
  defers per-market fiscal compliance (see Constraints in CLAUDE.md — no EU-wide
  fiscalization adapter in MVP). Start from a deliberately short list the founder
  names at discuss, not from every country Stripe lists.
- **The country list is a config, and it is the seam every per-market setting
  lands on.** One entry per supported country carrying, at minimum, its currency
  and default interface locale, with room for what follows (timezone defaults,
  address shape, and eventually the fiscal rules deliberately deferred today).
  Natural home is `packages/domain` alongside the other shared registries
  (`money.ts`, `rbac/`, `reserved-slugs.ts`) — no infrastructure imports, usable
  from api and both web apps.
- **The locale half already has real surface.** `tenants.locale` exists (NOT NULL,
  default `en`); the admin ships `ru`/`en` and the website `ru`/`uk`/`en`. A
  country whose default locale has no message catalogue must fall back
  deliberately rather than render raw keys — the failure mode already seen this
  phase when a component read a key from the wrong namespace.
- **Multi-step onboarding** when the owner has no brand: restaurant name, then
  the first brand. Currency no longer appears here either — country at signup
  already determined it.
- **After sign-in:** one brand → straight to its dashboard; several → the picker.
- **Close direct Better Auth signup** (`POST /api/auth/sign-up/email` is publicly
  open and is how stranded accounts appear). Check invitation acceptance first —
  it may share the same signup path, and blindly disabling it would break the
  invitations repaired on 2026-08-19.
- **Model confirmed (founder, 2026-08-19):** `owner` is a role on the TENANT, not
  on a brand. A user creates their company, owns it, and creates brands inside.
  Staff never self-register — they arrive by invitation.

**Already in place (do not rebuild):** the session row already carries a server-side `active_brand_id`, and `onInitialBrandPin` (auth.config.ts) pins a brand at login when none is set. `SetActiveBrandService` is the owner-only switch; non-owners are refused outright since 08.5 D-14. What is missing is only: a picker when an owner has more than one brand, removal of the in-app switcher, and the authority question below.

**Rejected before — a dedicated brand cookie.** Phase 02-03 shipped a signed `resto.active_brand` cookie (HMAC-SHA256, dedicated `ACTIVE_BRAND_COOKIE_SECRET`, four cookie I/O sites); it was replaced by brand-in-URL as D-03. Re-introducing one would duplicate a server-side field that cannot be forged and would bring back the signing secret and its I/O sites. The session cookie already identifies the session; the brand belongs on the session row, not in its own cookie.

**RESOLVED at discuss 2026-08-19 — brand authority.** The question below was settled: **the session is the single source of truth and the `/{brandSlug}` URL segment is removed entirely** (CONTEXT.md D-05). No compatibility shim for old URLs (D-06). Measured cost: 18 route files under `$brandSlug`, 58 admin files referencing `brandSlug`.

_Original question, kept for the record:_ brand currently comes from the URL segment (`/{brandSlug}`, decision D-03), and the whole admin route tree is built on it. Pinning at sign-in introduces a second source of truth. Either keep the segment and reconcile a mismatch against the pin (deep links survive, every route needs the check), or drop it (simpler model, whole route tree and existing links change). This choice drives most of the phase's cost.

**MODEL REVERSED late on 2026-08-19 — read `.planning/phases/10.2-brand-pinned-sessions/10.2-CONTEXT.md`, not the sketch above.** CONTEXT.md was rewritten from scratch; everything in the scope sketch that speaks of a tenant containing brands is superseded. `10.2-DISCUSSION-LOG.md` keeps the full path, including the model that was tried and dropped.

- **Tenant and brand merge into one entity — the Better Auth organization.** One restaurant = one organization = one legal entity with its own Stripe account, country, currency, theme and domains. An owner may belong to several; BA supports this natively (`setActiveOrganization` is already called in `signup.service.ts:229`).
- **This reverses the group model chosen the same morning.** The founder was shown the consequence — no shared staff, guest base, loyalty or group analytics across an owner's restaurants — and chose the merge anyway. Recorded in CONTEXT.md D-03 so it is not rediscovered as a surprise.
- **Physical merge, all inside 10.2.** The cheaper 1:1-satellite option was offered and declined; splitting the merge into a preceding phase was offered and declined. **Measured: 137 files** reference `brandId`/`brandSlug` (70 api, 58 admin, 7 db, 2 other); 9 `brand_id` columns across 6 schema files plus `session.active_brand_id`; 3 tables dropped (`brands`, `brand_domains`, `member_brand_scope`); the `app_bind_brand` GUC and brand RLS lineage removed. This is larger than the rest of the phase combined.
- **Real upside found while measuring:** menu tables carry both `tenant_id` and `brand_id` today — the merge removes that redundant dimension and its composite FKs permanently.
- **No data migration.** No production, no paying customer (Q1 2027 target), database reset the same day — ships as a schema rewrite with a dev reset (CONTEXT.md D-12, assumption stated). Seeds rewritten in-phase.
- **Brand pinning is no longer needed at all.** `activeOrganizationId` is the pin and BA owns it. `set-active-brand`, `active_brand_id`, `BrandScopeGuard`, `onInitialBrandPin`, `member_brand_scope` and the brand switcher are all deleted. The location switcher survives as the only in-app context control.
- **Organization lives in the host:** admin at `<orgSlug>.admin.resto.app`; the `/{brandSlug}` path segment goes. Bare `<orgSlug>.resto.app` reserved for the future public website, `.menu.` stays with guests. Needs wildcard DNS/TLS and wildcard `trustedOrigins` — match on parsed hostname, never a suffix check.
- **Switching organizations revokes the session and issues a new one**, without re-prompting for the password. Picker at every sign-in when the owner has more than one.
- **Signup:** name, email, password, country → user + first organization, via `/v1/signup`. **Onboarding:** the restaurant's name only; legal details left to Stripe. **Countries:** UA, GB, ES as a config in `packages/domain`; currency derived; Spanish catalogue added for admin and website; interface language per user with a `langSwitcher`.
- **The tenant-naming problem is moot** — the organization's name is the restaurant's name.
- **GAP created by this phase:** deleting the switcher removes the only add-organization entry point; no creation route exists outside `onboarding/brand.tsx`. An owner would be unable to create a second restaurant. See CONTEXT.md `<deferred>`.
- **Plan-based limit on organization count is explicitly NOT built here** — billing does not exist; leave the creation path a natural place for it.

**Known cost:** `set-active-brand.e2e` and `brand-isolation.e2e` were just brought onto the current contract (2026-08-19) and encode brand-switching semantics; both are rewritten by this phase. `adm-00` scenarios 3, 6, 7a and 7b test the brand switcher, cross-tab brand sync and add-brand-from-switcher — deliberately left unrepaired pending this phase.

**Plans:** 16/22 plans executed

Plans:
**Wave 1**

- [x] 10.2-01-PLAN.md — Shared domain registries: country/currency/locale config, TenantSlugValue, brand RBAC resource dropped
- [x] 10.2-02-PLAN.md — i18n foundation: Spanish catalogue for admin + website, three-locale switcher, deliberate fallback
- [x] 10.2-03-PLAN.md — Schema merge A: tenants absorbs brands, locations relocated, one domain table, session.active_brand_id dropped

**Wave 2**

- [x] 10.2-04-PLAN.md — Schema merge B: nine brand_id columns dropped, index collapse, ScopedTx/TenantContext brand removal

**Wave 3**

- [x] 10.2-05-PLAN.md — [BLOCKING] Migration 0079 + RLS teardown + boot-preflight deletion + dev reset/migrate/FK audit

**Wave 4**

- [x] 10.2-06-PLAN.md — Tenancy domain merge: Brand folded into Tenant, one provisioning path, tenancy event contracts

**Wave 5**

- [x] 10.2-07-PLAN.md — Tenancy host resolution, Stripe onboarding dedup, x-brand-slug removal, tenancy controllers
- [x] 10.2-08-PLAN.md — Identity brand machinery deleted; GET /v1/me/tenants and the renamed slug-availability check
- [x] 10.2-09-PLAN.md — Catalog context sweep (21 files)
- [x] 10.2-10-PLAN.md — Ordering + payments + notifications sweep and the ordering event contract

**Wave 6**

- [x] 10.2-11-PLAN.md — Guard chain and decorator sweep, preserving the location-bypass semantics @BrandNeutral carried

**Wave 7**

- [x] 10.2-12-PLAN.md — Better Auth revoke-and-reissue endpoint, brand-pin hook removal, wildcard trustedOrigins + cookie scope

**Wave 8**

- [x] 10.2-13-PLAN.md — Signup (name/email/password/country), onboarding finalize, closing public Better Auth signup

**Wave 9**

- [x] 10.2-14-PLAN.md — Admin data layer: apiFetch, seven query modules, payments/slug helpers

**Wave 10**

- [ ] 10.2-16-PLAN.md — Admin feature components sweep (menu, orders, roles) + auto-save model deletion

**Wave 11**

- [ ] 10.2-15-PLAN.md — Admin route-tree collapse (18 files), static organization label replacing the brand switcher

**Wave 12**

- [ ] 10.2-17-PLAN.md — Admin auth surfaces: signup form, sign-in picker, onboarding, host reconciliation, wildcard dev hosts
- [x] 10.2-18-PLAN.md — Seeds and erasure tooling on the merged model; payment-ready demo restaurant

**Wave 13**

- [ ] 10.2-19-PLAN.md — Test net rebuild: 12 e2e + 12 unit + db integration specs, adm-00 scenarios repaired

**Wave 14**

- [ ] 10.2-20-PLAN.md — Final gate: dead code, repo-wide rename proof, OpenAPI regeneration, 40-decision coverage audit

### Phase 11: Promo & Discounts

**Goal**: Give operators single-use and bulk promo code management and automatic discounts in the admin UX; the pure domain discount engine is already live from Phase 7
**Depends on**: Phase 7
**Requirements**: PROMO-01, PROMO-02, PROMO-03, PROMO-04, PROMO-05
**Success Criteria** (what must be TRUE):

1. Operator creates a promo code (percent or fixed, scoped to item/category/cart, with validity dates and max uses) and bulk-imports codes from CSV
2. Guest enters a promo code at checkout and sees the discount applied or a specific error (expired, invalid, max-uses reached); a single-use code rejects any second use
3. Operator creates an automatic discount (no code required) that applies when a cart condition is met (e.g. `cart_total > X`)
4. Promo code field on the customer site (stubbed in Phase 6) is now fully functional; discount is reflected in the order total at checkout
   **Plans**: TBD
   **UI hint**: yes
   **Persona reviewers**: persona-cto, persona-skeptic, persona-product-strategist, persona-growth-marketer

### Phase 12: CRM

**Goal**: Build the customer record layer — automatic creation on first order, order history view for operators, and GDPR delete-on-request with irreversible anonymization and audit trail
**Depends on**: Phase 7
**Requirements**: CRM-01, CRM-02, CRM-03, CRM-04, CRM-05
**Success Criteria** (what must be TRUE):

1. A customer record is created automatically on first order using phone + email as natural keys; no manual step required
2. Operator sees the customer list with filters (date range, AOV, order count) and can click any customer to see their full order history
3. GDPR delete-on-request anonymizes all PII using `AUDIT_ERASURE_SALT` hashing while keeping aggregate stats intact; the deletion writes an audit row with a hashed identifier
   **Plans**: TBD
   **UI hint**: yes
   **Persona reviewers**: persona-cto, persona-skeptic, persona-product-strategist, persona-growth-marketer

### Phase 13: Analytics

**Goal**: Give operators a revenue / AOV / order count / order conversion rate dashboard powered by real ordering and payment data from the `orders` table
**Depends on**: Phase 7, Phase 8
**Requirements**: ANL-01, ANL-02, ANL-03, ANL-04, ANL-05
**Success Criteria** (what must be TRUE):

1. Operator sees today / 7-day / 30-day revenue with prior-period comparison on the dashboard
2. Operator sees order count and AOV for the same time windows
3. Operator sees order conversion rate (`paid_orders / checkout_initiations`) for the selected period, computed server-side from the `orders` table — no client-side event instrumentation required
4. Operator sees top items by revenue and by order count
   **Plans**: TBD
   **UI hint**: yes
   **Persona reviewers**: persona-cto, persona-skeptic, persona-product-strategist, persona-growth-marketer

### Phase 14: Finance

**Goal**: Give operators an order list with advanced filtering, CSV export, refund initiation, VAT rate configuration per category, a RestOS SaaS billing line for the period, and a per-tenant billing plan (per-order commission vs fixed subscription vs hybrid)
**Depends on**: Phase 7, Phase 8
**Requirements**: FIN-01, FIN-02, FIN-03, FIN-04, FIN-05, FIN-06, FIN-07
**Success Criteria** (what must be TRUE):

1. Operator filters orders by status, date, payment status, channel, and brand; exported CSV contains all matching rows
2. Operator initiates a full or partial refund from the order detail view; the refund is reflected in both Stripe and the order state
3. Operator sets a VAT rate per category; order detail shows a VAT breakdown
4. Operator sees the RestOS SaaS billing line for the current period alongside Stripe processing fees
5. A tenant can be placed on a commission plan, a flat-subscription plan, or a hybrid; the chosen plan controls the `application_fee` on Connect charges and any recurring Stripe Billing subscription, and the operator sees their current plan and charges in the finance view
   **Plans**: TBD
   **UI hint**: yes
   **Persona reviewers**: persona-cto, persona-skeptic, persona-product-strategist, persona-growth-marketer

### Phase 15: Content & SEO

**Goal**: Give operators brand theme controls, WYSIWYG content page editing, per-city SEO landing page generation, editable meta tags, and tenant sitemap/robots.txt — with security constraints on all URL and font fields
**Depends on**: Phase 5
**Requirements**: CONT-01, CONT-02, CONT-03, CONT-04, CONT-05, CONT-06, CONT-07
**Success Criteria** (what must be TRUE):

1. Operator sets brand theme (light/dark toggle, accent color, logo, favicon) and changes are reflected on customer-facing surfaces
2. Operator edits content pages (About, Delivery, Contact, FAQ) via a simple WYSIWYG editor (Tiptap or similar)
3. Per-city SEO landing pages are auto-generated from a single template per zone; each page has an editable meta title, description, and og:image
4. Per-tenant `sitemap.xml` and `robots.txt` are generated and served correctly
5. `BrandTheme.logoUrl` rejects non-http(s) URLs; `BrandTheme.font` is restricted to an allowlist regex; both enforced at the Zod schema layer
   **Plans**: TBD
   **UI hint**: yes
   **Persona reviewers**: persona-cto, persona-skeptic, persona-product-strategist, persona-growth-marketer

### Phase 16: Self-serve Onboarding

**Goal**: Thread all prior phases into a guided signup-to-published-menu wizard so a new restaurant can go from zero to first menu live in under one hour without operator help
**Depends on**: Phases 1–15
**Requirements**: ONB-01, ONB-02, ONB-03, ONB-04, ONB-05
**Success Criteria** (what must be TRUE):

1. New user signs up at the landing CTA and creates their first tenant in the same flow — no separate "create org" step required
2. Onboarding wizard guides the operator through brand setup → first location → upload menu → preview → publish in a single coherent sequence
3. Time from signup to first menu live is measurable and the p50 target of 1 hour without support assistance is met (dev-mode skip-to-paid-flow toggle available for testing)
4. Stripe Connect onboarding is offered as a separate, skippable wizard step that can be resumed later
   **Plans**: TBD
   **UI hint**: yes
   **Persona reviewers**: persona-cto, persona-skeptic, persona-product-strategist, persona-growth-marketer, persona-investor

### Phase 18: Real-time Order Feed (SSE)

**Goal**: Replace the Phase 10 polling feed with a Server-Sent Events stream fed from `ordering.>` events, including a re-authorization model for long-lived connections and graceful drain on deploy
**Depends on**: Phase 10 _(split out of Phase 10 on 2026-08-11 at `/gsd:discuss-phase 10`. Phase 10 ships the feed on 5-second polling; this phase is a transport upgrade on top of a working product, not a prerequisite for it. Activation trigger: a paying tenant reports the polling delay as a problem, OR a kitchen-display surface is scheduled — whichever comes first.)_
**Requirements**: ORDINT-02, ORDINT-09 _(moved here from Phase 10)_
**Success Criteria** (what must be TRUE):

1. New orders appear in the admin feed without a page refresh, pushed from the server, with no polling fallback needed during normal operation
2. The stream resolves tenant, brand, and location without relying on request headers a browser `EventSource` cannot send — and the chosen mechanism is not a forgeable client-supplied identifier
3. Authorization is re-evaluated during the connection's life, not only at connect time: a revoked location scope, a brand re-pin, a session revocation, and a tenant archival each terminate or re-scope the stream within a bounded window, proven by e2e
4. Graceful shutdown drains every active connection with a `retry:` event before the HTTP adapter closes, so a rolling deploy does not hang on an open socket and clients auto-reconnect
5. The stream survives the real production edge (Cloudflare buffering / idle timeouts) and a NATS outage degrades to polling rather than to a silently dead feed with a green readiness probe

   **Plans**: TBD
   **UI hint**: yes
   **Persona reviewers**: persona-cto, persona-skeptic

**Design brief already written:** `.planning/phases/10-admin-order-intake/10-PERSONA-CTO.md` BLOCK-2, BLOCK-3, HIGH-1..HIGH-6 (transport shape, in-process fan-out vs NATS-per-connection, `LISTEN/NOTIFY` rejection, shutdown-hook ordering, rate limiting, Cloudflare) and `10-PERSONA-SKEPTIC.md` BLOCK-3, HIGH-1, HIGH-2 (subscriber soft-fail, durable-consumer/queue-group collision at 2 instances). Do not re-derive these.

### Track B — AI Agent Platform + 3 Surfaces

- [ ] **MVP-2 Phase A: AI agent platform foundation** — LLM gateway (Anthropic primary, fallback TBD), per-tenant RAG knowledge base, per-customer profile/memory, conversation/thread storage, tool registry honoring `ScopedTx` + RBAC, NATS event subscriptions, eval harness
- [ ] **MVP-2 Phase B: AI admin assistant** — agentic chat in `apps/admin`; tools: read analytics, edit menu, suggest promos, generate reports, draft emails; operator approval gate on destructive actions
- [ ] **MVP-2 Phase C: AI guest chat** — widget on `apps/website` (+ `apps/qr-menu` later); brand-voiced; per-customer memory; tools: menu search, recommend, upsell, reorder, human handoff
- [ ] **MVP-2 Phase D: AI onboarding constructor** — supersedes MVP-1 Phase 16; OCR/LLM menu extraction from photos/PDF, brand/theme generation, target <30 min signup-to-publishable-site

Open architectural questions to resolve before MVP-2 activation: vector store choice (pgvector vs managed), LLM provider lock-in + fallback, embedding model + re-embedding strategy, conversation context window strategy, tool-call safety (human-in-the-loop boundaries), unit economics (per-tenant cost caps).

## MVP-3: Telegram Channel + iiko Adapter (placeholder)

> Trigger: MVP-2 stable in prod >30 days; positioning validated with 5–10 paying tenants; iiko partnership conversation initiated. Detailed scope in `.planning/seeds/mvp3-channels-iiko.md`. Phase numbering assigned at activation.

- [ ] **MVP-3 Phase A: Telegram bot as 4th delivery channel** — per-tenant bot, catalog browsing (inline keyboard / mini-app), cart + checkout (Telegram Payments or fallback to web), AI guest chat reused across transports, push notifications for order status, bot setup wizard in admin
- [ ] **MVP-3 Phase B: iiko adapter (B2B GTM channel)** — catalog sync (iiko → RestOS, ops-side fields), order sync (RestOS → iiko), per-tenant API credentials. Sales angle: "Already on iiko? Add RestOS in 10 min for AI guest chat + digital storefront."
- [ ] **MVP-3 Phase C (optional): r_keeper / Poster / other POS adapters** — only if iiko adapter validates the partnership motion

## Progress

**Execution Order:**
MVP-1 (revenue spine) phases execute in order: 1 → 2 → 3 → 4a → 4b → 5 → 6 → 7 → 7.5 → 8 → 8.1 → 10 → 10.1. Phase 8.1 (Payments provider layer + onboarding UX) was pulled into MVP-1 on 2026-06-28; it extends Phase 8 and does not block Phase 10, so it may also run in parallel with Phase 10. Phase 17 is post-MVP-1 polish — activates only on its documented trigger (first multi-member tenant). MVP-2 "Operational Completeness" (Phases 9, 11–16) + the AI track, and MVP-3, are sequenced at their respective `/gsd-new-milestone` activations _(2026-06-12 scope rebalance)_.

Notes:

- Phase 5 (Customer Site) precedes Phase 6 (QR-Menu Customer) per 2026-05-27 AI-driven pivot decision — web shopfront is the primary customer surface and the surface AI guest chat (MVP-2) will be embedded on.
- Phase 7.5 (Production Deploy) lands before Phase 8 (Payments) — Stripe webhooks need a public HTTPS URL.
- Phase 9 (Delivery Zones) moved to MVP-2; until it ships, Phase 10 (Admin Order Intake) accepts delivery orders without polygon enforcement (pickup unaffected).

### MVP-1 Phase Status

| Phase                                         | Plans Complete | Status        | Completed  |
| --------------------------------------------- | -------------- | ------------- | ---------- |
| 1. Tenancy Hardening                          | 6/6            | ✓ Done        | 2026-05-26 |
| 2. Admin Shell                                | 5/5            | Complete      | 2026-05-27 |
| 3. Auth Completion (Security Core)            | 5/5            | Complete      | 2026-05-30 |
| 4a. Catalog Schema + API                      | 7/7            | Complete      | 2026-05-31 |
| 4b. Catalog Admin UI                          | 9/9            | Complete      | 2026-06-01 |
| 5. Customer Site                              | 6/6            | Complete      | 2026-06-12 |
| 6. QR-Menu Customer                           | 5/5            | Complete      | 2026-06-13 |
| 7. Ordering                                   | 5/5            | Complete      | 2026-06-14 |
| 7.5. Production Deploy                        | 6/11           | In Progress   |            |
| 8. Payments (Stripe Connect)                  | 8/8            | Complete      | 2026-06-27 |
| 8.1. Payments — Provider Layer & Onboarding   | 5/5            | Complete      | 2026-06-28 |
| 10. Admin Order Intake                        | 12/13          | In Progress   |            |
| 17. Operator Self-service Polish (post-MVP-1) | 0/?            | Trigger-gated | -          |

_Moved to MVP-2 "Operational Completeness" (2026-06-12 rebalance): 9. Delivery Zones · 11. Promo & Discounts · 12. CRM · 13. Analytics · 14. Finance · 15. Content & SEO · 16. Self-serve Onboarding._
