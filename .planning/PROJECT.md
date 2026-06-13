# RestOS

## What This Is

RestOS is an **AI-driven multi-tenant SaaS for restaurants**. One subscription gives a restaurant a turnkey digital presence (public site, in-restaurant QR-menu, and — later — Telegram channel) backed by an AI layer that is present in every operator and guest interaction. One SaaS customer = one restaurant company (Tenant) with internal `Brand → Location → Menu / Zones / Staff` hierarchy. RestOS owns the customer-facing layer (orders, menu, customers, loyalty, marketing) + the AI layer. Third-party POS systems (iiko, r_keeper, Poster) are **partner integrations** that open a B2B GTM channel, never a technical prerequisite — a restaurant arriving without any POS gets full value standalone.

The pivot to AI-driven positioning was decided on 2026-05-27 via `/gsd-explore`. The authoritative pivot context lives in `.planning/notes/ai-driven-pivot.md`; the rollout is staged across three milestones (see "Milestone Structure" below). The canonical product specification is `SPEC.md` (Russian, kept as source-of-truth for product surface area).

## Core Value

A restaurant can publish its digital presence (menu, brand, locations) and start accepting paid orders from guests via web — without integrating any external POS or hiring a developer. This is the **MVP-1** bar: standalone, ship-able, billable.

The AI layer — admin assistant + guest chat + onboarding constructor — is **MVP-2**, layered on top once the standalone platform is paying. Telegram channel + iiko/POS adapters are **MVP-3**.

If everything else fails (no loyalty, no marketing automation, no advanced analytics, no AI, no Telegram, no Staff app), the MVP-1 capability still delivers value on its own: a restaurant goes from "no digital presence" to "guests place paid orders that I can fulfill" inside RestOS alone.

## Milestone Structure

> Decided 2026-05-27 (see `.planning/notes/ai-driven-pivot.md`). The 16-phase original ROADMAP becomes MVP-1; MVP-2 and MVP-3 are seeded forward.

| Milestone | Scope                                                                                                                                                                                                                          | Gate criterion                                                                                                                        | Target      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| **MVP-1** | Standalone non-AI platform: admin shell, auth, catalog, customer site, QR-menu (after site), ordering, payments, delivery zones, admin order intake, basic CRM, basic analytics, content/SEO, self-serve onboarding (non-AI).  | "First paying customer" — restaurant signs up, publishes site, takes paid orders end-to-end.                                          | **Q1 2027** |
| **MVP-2** | AI agent platform (LLM gateway, per-tenant RAG, per-customer memory, tool registry) + 3 surfaces: AI assistant in admin, AI chat with guest, AI onboarding constructor. Supersedes the old MVP-1 self-serve onboarding wizard. | Restaurant uses AI assistant in admin daily; guest chat handles >X% of customer interactions; onboarding completes in <30 min via AI. | Q2–Q3 2027  |
| **MVP-3** | Telegram bot as 4th delivery channel. iiko adapter as B2B GTM channel into the iiko customer base. r_keeper / Poster / other POS adapters as the partnership motion validates.                                                 | Active iiko partnership pipeline. Measurable Telegram order volume.                                                                   | Q4 2027+    |

**Authoritative seeds for MVP-2 / MVP-3:** `.planning/seeds/mvp2-ai-platform.md`, `.planning/seeds/mvp3-channels-iiko.md`. Detailed requirements + roadmap for MVP-2 and MVP-3 are deferred to their respective `/gsd-new-milestone` activations once trigger conditions are met.

## Requirements

### Validated

> Inferred from existing code (see `.planning/codebase/` maps). These are platform foundations already shipped; they are locked unless a phase explicitly revisits.

**Platform & infrastructure:**

- ✓ NestJS modular monolith (`apps/api`) with 4 bounded contexts: `identity`, `tenancy`, `catalog`, `audit`
- ✓ DDD + Hexagonal layout per context (`domain / application / infrastructure / interfaces/http`)
- ✓ Postgres 16 + Drizzle ORM + per-tenant Row-Level Security with `FORCE ROW LEVEL SECURITY` (double enforcement: `ScopedTx` at application layer + RLS at DB layer)
- ✓ Three-role Postgres separation: `resto_admin` (migrations), `resto_app` (runtime, NOBYPASSRLS), `resto_auth` (Better Auth, BYPASSRLS on credential tables only)
- ✓ Composite FK on every tenant-scoped child table (`parent_id, tenant_id`)
- ✓ Tenant context propagation via `AsyncLocalStorage` + `TenantContextMiddleware`
- ✓ Transactional outbox + NATS JetStream event bus + inbox dedup pattern (`runDeduped`)
- ✓ Redis catalog cache (graceful degradation to DB on outage)
- ✓ S3-compatible object storage with presigned URLs (MinIO dev, S3/R2 prod target)
- ✓ OpenTelemetry tracing with auto-instrumentation; Pino structured logging with PII redaction
- ✓ Zod-based validation at every boundary (env, HTTP DTOs, event envelopes, domain VOs)
- ✓ ProblemDetails (RFC 7807) error responses
- ✓ Better Auth wired with email+password, organization plugin (maps to tenants), 2FA TOTP, bearer tokens
- ✓ Production env guardrails (`assertProdGuardrails`) — boot-time rejection of dev-default values

**Tenant lifecycle (partial):**

- ✓ Tenant provisioning, archival, offboarding (with 30-day cool-off), erasure via internal endpoints + CLI
- ✓ `withoutTenant` bypass allowlist with audit logging
- ✓ Hard-delete forbidden (no DELETE privilege on `resto_app`); soft-delete via `archived_at` / `status = 'archived'`

**Catalog:**

- ✓ Menu items, categories, modifier groups, item sizes in Drizzle schema — iiko-aligned nomenclature (renamed from `menu_modifiers`/`menu_variants` in Phase 4a)
- ✓ Category tree via nullable `menu_categories.parent_id` (composite tenant self-FK)
- ✓ Menu items carry photos[] JSONB, БЖУ (proteins/fats/carbs/kcal), source provenance (`manual`/`iiko`/`ai`), `needs_review`, `source_external_id`
- ✓ Modifier options carry iiko `default_amount` + `free_amount`; item sizes carry absolute `price` (not delta)
- ✓ Stop-list as separate table (`menu_stop_list`) with read-overlay in `loadPublishedMenu`
- ✓ Slug auto-derive via `transliteration.slugify`; slug-history kept in `menu_item_slug_aliases` for SEO redirects (D-4a-04)
- ✓ Delayed-publish revert (5s in-memory timer per tenant + cancel/undo) — `DelayedPublishService` (CAT-06 / D-4a-05)
- ✓ First-publish vs republish detection via `tenants.menu_first_published_at` — emits `MenuFirstPublishedV1` / `MenuRepublishedV1` outbox events (D-4a-06)
- ✓ Redis menu-version cache with `nextval('menu_versions_seq')` fallback on Redis outage (CAT-10 / D-4a-07)
- ✓ Public published-menu read endpoint `/v1/menu` with Redis cache and presigned photos[]
- ✓ OpenAPI drift-check (`pnpm openapi:check`) wired as CI gate (D-4a-08)
- ✓ Cross-tenant isolation matrix in `tenant-isolation.spec.ts` covers all 6 catalog tables (composite-FK audit green, RLS ENABLE+FORCE on every new table)

**Apps (scaffolded):**

- ✓ `apps/admin` — Next.js 15 RSC operator dashboard scaffold (shadcn/ui, App Router, server actions, `apiFetch` with BA session forwarding)
- ✓ `apps/qr-menu` — Vite+React customer-facing menu reader

### Active

> Current scope. These are the hypotheses we're building toward. Each phase in `ROADMAP.md` advances one or more.

**MVP-1 — Standalone non-AI platform (target Q1 2027 first-paying gate)**

> Ordering: site comes BEFORE qr-menu (decided 2026-05-27); web shopfront is the primary customer surface and the surface AI guest chat will later live on.

- [x] **Tenancy hardening to production-enterprise bar** — close out `suspend` lifecycle, automated erasure scheduler, BA credential separation closure, expanded cross-tenant test net, audit completeness gap fix, per-tenant observability, `withoutTenant` runtime + lint enforcement, `inbox_processed` retention, `correlationId` via OTel span (`buildEnvelope`) — _shipped 2026-05-26_
- [ ] **Admin shell + auth wiring** — sign-in flow, tenant resolution UI, brand list/create/switch UI over existing Better Auth
- [x] **Auth completion to operator-onboarding bar** — Resend SMTP email adapter, invitation flow, password reset, RBAC presets (`owner`, `admin`, `staff`), secure cookie fix, full email-callback assertions, NATS DLQ, 2FA TOTP, boot-time role drift guard, `organizationHooks.afterUpdateMemberRole` audit hook, AUTH-11 WeakMap stash refactor, per-tenant signin rate-limit, GDPR sweep on invitation+verification tables — _shipped 2026-05-30 (static verification 11/11; 9 e2e items in HUMAN-UAT pending Docker stack)_
- [ ] **Catalog admin UX** — CRUD for categories / items / modifiers / variants / photos, publish-flow UI, stop-lists (manual)
- [ ] **Customer Site** — `apps/website` scaffolded from `.gitkeep` to working multi-tenant restaurant site (menu, delivery/pickup, cart, checkout)
- [ ] **QR-menu customer polish** — real ordering UI over `/v1/menu` (cart, item detail, modifier selection, table binding via QR param)
- [ ] **Ordering bounded context** — new `ordering` context: cart, checkout, payment intent, fulfillment state machine; new DB tables, event contracts (`ordering.>`), NATS subject
- [ ] **Stripe Connect implementation** — replace `NoopStripeConnectAdapter` with real adapter: account creation, account-link onboarding, payment-intent routing with application fee, webhook handling
- [ ] **Admin order intake & operational view** — incoming-orders feed, status transitions, refund/cancel actions (where Staff app would be, MVP uses Admin)
- [ ] **Delivery zones (basic)** — polygon-on-map editor, minimum order value, free-delivery threshold, in-zone check at checkout
- [ ] **Promo & discounts (basic)** — single-use and bulk promo codes, percent/fixed discount on item/category/cart
- [ ] **CRM (basic)** — customer base with order history, GDPR delete-on-request. _Open question for milestone setup: include "per-customer profile fields" (dietary preferences, brand-voice opt-ins) to avoid retrofit at MVP-2?_
- [ ] **Analytics (basic)** — revenue / AOV / order count / conversion dashboard
- [ ] **Finance (basic)** — order list with filters and export, refunds, VAT rates, RestOS commission line
- [ ] **Content & SEO basics** — restaurant theming (light/dark, accent), logo, content pages (About / Delivery / Contact / FAQ), per-city SEO pages generated from templates
- [ ] **Self-serve onboarding (non-AI)** — restaurant signs up, configures, and publishes within < 24 hours without operator help. MVP-2 supersedes this with the AI onboarding constructor.

**MVP-2 — AI agent platform + 3 surfaces** (forward-looking; see `.planning/seeds/mvp2-ai-platform.md`)

- [ ] **AI agent platform foundation** — LLM gateway (Anthropic primary), per-tenant RAG knowledge base, per-customer profile + memory, conversation/thread storage, tool registry honoring `ScopedTx` + RBAC, NATS event subscriptions for context refresh, eval harness
- [ ] **AI admin assistant** — agentic chat in `apps/admin`; tool calls to read analytics, edit menu, suggest promos, generate reports, draft emails; operator approval gate on destructive actions
- [ ] **AI guest chat** — widget on `apps/website` (+ `apps/qr-menu`); brand-voiced; per-customer memory; tools for menu search, recommend, upsell, reorder, human handoff
- [ ] **AI onboarding constructor** — replaces non-AI onboarding wizard; OCR/LLM menu extraction from photos/PDF, brand/theme generation, <30 min from signup to publishable site

**MVP-3 — Telegram channel + iiko adapter** (forward-looking; see `.planning/seeds/mvp3-channels-iiko.md`)

- [ ] **Telegram bot as 4th delivery channel** — per-tenant bot, catalog browsing, cart + checkout (Telegram Payments or fallback to web), AI guest chat reused across transports
- [ ] **iiko adapter (B2B GTM channel)** — catalog sync (iiko → RestOS, ops-side fields), order sync (RestOS → iiko), per-tenant API credentials. Sales positioning: "Already on iiko? Add RestOS in 10 min for AI guest chat + digital storefront."
- [ ] **r_keeper / Poster / other POS adapters** — only if iiko adapter validates the partnership motion

**Future / post-MVP-3 (deferred — these don't fit MVP-1/2/3, scheduled for later)**

- [ ] Loyalty program (points, tiers, referrals, welcome bonus)
- [ ] Marketing automation (email campaigns, push, stories, banners, upsell)
- [ ] Advanced delivery (zone heatmap, peak-load markers, dynamic pricing)
- [ ] Tip splitting (cook / barista / courier)
- [ ] Reviews (post-order request, tag taxonomy, moderation, restaurant replies)
- [ ] Staff app (web or native app) — KDS, waiter, manager, courier views
- [ ] External delivery integrations (Glovo, Bolt Food, Wolt, Uber Direct)
- [ ] Multi-payment-provider support (Mollie, Adyen, regional acquirers)
- [ ] Advanced auth (Google, Apple, Telegram, Phone OTP)
- [ ] Headless CMS for restaurant content
- [ ] Partner / agency panel

### Out of Scope

> Explicit no's, with reasoning. Do not re-add without revisiting.

- **Headless CMS for restaurant content (initially)** — one shared site template with per-tenant theming is enough for v1. Skeptic lens: avoid the headless-CMS detour until at least 10 paying tenants explicitly need it.
- **POS integration in MVP-1** — RestOS is positioned as "own core, optional POS partnership." Building POS adapters in MVP-1 is YAGNI; iiko (and other POS) adapters move to MVP-3 where they serve a partnership GTM motion, not a technical dependency.
- **Commission-from-orders pricing model** — restaurants culturally reject % cuts (already paying delivery aggregators). Monetization v1 = flat subscription per location + tier add-ons. Stripe Connect handles restaurant↔guest payments; SaaS billing is a separate (later) adapter.
- **Geographic restriction** — architecture stays locale/currency-agnostic. RU and EU are the baseline test markets; no code paths assume a specific region.
- **Full RBAC customization in v1** — three system roles (`owner`, `admin`, `staff`) cover MVP; per-tenant custom roles defer to post-MVP.
- **Multi-currency in a single order** — single currency per tenant; multi-currency support per tenant network is post-MVP.
- **Hard deletes anywhere** — `resto_app` has no DELETE privilege; all destructive ops are soft-delete or run via `resto_admin` migration paths only.

## Context

**Origin & motivation.** Solo founder with 10 years restaurant-industry experience and 3 years JS development. RestOS is the vertical SaaS bet: bring the operational pattern the founder knows works (own core, optional POS, broad operator surface) into a multi-tenant SaaS targeted at restaurants under-served by enterprise platforms (Toast, Olo) and over-charged by aggregators.

**Reset event.** On 2026-05-24, the prior planning structure (22 ADRs, root `ROADMAP.md`, layered T1..T6 milestone model, project-local skill files) was wiped (commit `56e5f52`). GSD is now the single source of truth for both planning AND durable decisions; `.planning/` is committed; ADRs as a separate artifact category are abandoned. The codebase itself retains the architectural patterns the deleted ADRs established (RLS double-enforcement, composite FK, scoped tx, audit subscriber) — those are now captured in `### Validated` above, not in ADR numbers.

**Target customer (per SPEC section 6).**

- Independent restaurants and small networks, 1–10 locations
- Markets: EU + English-speaking (global-ready architecture)
- All cuisine segments (no vertical restriction inside restaurants)
- Mid-to-high average check (not budget / fast-food race-to-bottom)

**Positioning relative to alternatives.**

- vs. Toast / Olo: lower-touch, EU-first, no POS hardware lock-in, AI-driven differentiation
- vs. iiko / r_keeper / Poster: NOT a competitor. They own POS / kitchen / fiscal back-of-house; RestOS owns the customer-facing layer + AI. iiko adapter in MVP-3 is a partnership, not a feature-parity play.
- vs. Tilda / no-code site builders: not a competitor — they build static sites, RestOS builds AI-assisted operational restaurants with ordering
- vs. delivery aggregators (Glovo, Bolt, Wolt, Uber Eats): restaurant owns its customer and conversion path
- vs. Choice / Tablein / SumUp: broader vertical surface; not just bookings or just payments

**Codebase state (2026-05-24).** Substantial platform foundation already shipped — see `.planning/codebase/` for the full map. Most "missing" things in the gap analysis are _business features_ (ordering, payments, CRM, loyalty, marketing, analytics, delivery zones) — the _platform_ is mature. CONCERNS.md lists ~15 open technical debt / security items that get folded into Phase 1 (tenancy hardening) where they cluster.

**Known surfaces of the SaaS (from SPEC).**

- `apps/admin` — operator dashboard
- `apps/qr-menu` — in-restaurant QR-driven menu (dine-in)
- `apps/website` — public restaurant site (delivery + pickup orders) ← scaffolded only, must be built for MVP
- (Staff app, Telegram MA, support back-office) ← post-MVP

## Constraints

- **Tech stack**: TypeScript end-to-end, NestJS modular monolith on the backend, Next.js 15 RSC for admin and (planned) website, Vite+React for qr-menu, Postgres+RLS, NATS JetStream, Redis, S3 — locked. Stack decisions inherited from the existing codebase; revisit only if a phase has a documented blocker.
- **Multi-tenancy**: Every tenant-scoped query MUST go through `ScopedTx` AND Postgres RLS — RLS alone is not sufficient. Composite FK on every child table. Hard deletes forbidden. Origin: CTO + skeptic lens, "what breaks tenancy if a dev forgets `tenant_id`?"
- **Compliance**: GDPR (EU) — full erasure pipeline with 30-day cool-off, anonymization via `AUDIT_ERASURE_SALT`, audit log of all PII touches. PCI never directly touched (Stripe Connect tokenizes everything). Fiscal compliance per market is a deferred problem (skeptic lens: do not build EU-wide fiscalization adapter in MVP).
- **Performance**: Public menu reads MUST stay fast on cold Redis (degraded mode is acceptable but must not crash). Peak load assumption: Friday-evening simultaneous order spikes across many tenants — no per-tenant noisy-neighbor patterns allowed.
- **Team**: Solo founder on the 12-month roadmap horizon. Phase sizing accommodates solo throughput (no parallel multi-developer assumptions). Persona reviews substitute for the missing co-founder/tech-lead second opinion.
- **Timeline / monetization milestone**: First paying customer target Q1 2027 (~7–9 months from 2026-05-27). MVP-1 (all phases under the MVP-1 milestone in ROADMAP.md) is the bar for "can take a customer's money." MVP-2 (AI tier) targets Q2–Q3 2027; MVP-3 (Telegram + iiko) Q4 2027+. AI-driven marketing without AI in MVP-1 is a known positioning risk — re-tested at MVP-1 close.
- **Budget**: Bootstrap; infra cost-sensitivity matters. Prefer managed services that scale to zero (R2 over S3 if neutral, NATS over Kafka, self-hosted Better Auth over Auth0).
- **`.planning/` is committed**: planning artifacts are durable, version-controlled, and reviewed. Decision log lives in `## Key Decisions` below + phase artifacts, NOT in a separate ADR directory.

## Persona Reviews (GSD Convention)

> Established 2026-05-24 during init. SPEC.md section 8 defines the four canonical RestOS reviewer lenses; this section codifies the workflow integration.

**On every `/gsd:discuss-phase`:** spawn at minimum `persona-cto` + `persona-skeptic`. Add `persona-product-strategist` + `persona-growth-marketer` when the phase has user-facing surface area (admin UX, customer flows, marketing/loyalty features). Add `persona-investor` for fundability- or moat-impacting bets (Stripe Connect, multi-tenancy architecture, vertical positioning, pricing model).

**Outputs:** `.planning/{phase}/PERSONA-REVIEWS.md`, consumed by `gsd-planner` and aggregated into PLAN.md risk assessment. For project-level reviews (initial ROADMAP, milestone audits), `.planning/PERSONA-REVIEWS.md`.

**RestOS-specific lenses** (verbatim from SPEC section 8 — do not rephrase, these are the founder's brief to each persona):

- **CTO** (`persona-cto`) — multitenancy correctness, scale to peak-Friday spikes, POS-abstraction as real port, GDPR/PCI compliance, build-vs-buy per block, observability + blast radius, dev velocity bounded by solo throughput. Typical questions: "Что сломает мультитенантность, если разработчик в спешке забудет `tenant_id`?" / "Зачем мы пишем это сами, если есть готовое решение за $X в месяц?"
- **Growth marketer** (`persona-growth-marketer`) — self-serve onboarding < 24h, per-tenant SEO as a growth loop for tenants AND RestOS, referral + loyalty as built-in growth loops, marketer-grade analytics as retention driver, partner channels (POS vendors, acquirers, aggregators) as acquisition. Typical: "Где гость в первый раз скажет „вау"?" / "Какой % ресторанов запускается без помощи саппорта?"
- **Skeptic** (`persona-skeptic`) — hidden assumptions, premature optimization, MVP omissions (returns, cook-side cancellations, post-order mutations, concurrent menu edits), over-engineering (headless CMS vs templates, custom domains vs subdomains, React Native vs PWA), quicksand of partial integrations, third-party API dependency exposure. Typical: "Что если убрать эту фичу — продукт ещё имеет смысл?" / "Что мы предполагаем и что не проверили?"
- **Investor** (`persona-investor`) — TAM for EU 1–10-location restaurants, CAC/LTV in independent-restaurant niche (high churn, low ACV, long sales cycle), capital efficiency to $1M ARR, moat vs Toast/Olo/Choice/Tablein expansion, regulatory exposure (per-market fiscalization), dependency risk (Stripe/Cloudflare/iiko/Apple/Google policy), pricing model unit economics. Typical: "Если Toast/Choice объявят expansion в ЕС — у нас есть то что они не скопируют за квартал?"

## Key Decisions

| Decision                                                                           | Rationale                                                                                                                                                                                                                                                                                                                                                          | Outcome                                  |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| GSD is single source of truth for planning AND decisions; abandon ADRs             | One consistent home for planning, decisions, execution; prior ADR+ROADMAP+memory split was high-overhead for a solo founder. Decided 2026-05-24.                                                                                                                                                                                                                   | — Pending (revisit at milestone-1 audit) |
| `.planning/` committed (removed from `.gitignore`)                                 | Consequence of above — GSD artifacts are durable, not ephemeral.                                                                                                                                                                                                                                                                                                   | — Pending                                |
| Drop layered T1..T6 milestone model (from deleted ADR-0021)                        | The 6-tier freeze-gate model was over-structured for solo throughput; new GSD ROADMAP uses flat phase ordering.                                                                                                                                                                                                                                                    | — Pending (revisit if scope grows)       |
| Persona reviews are mandatory on `/gsd:discuss-phase` (CTO + skeptic baseline)     | Solo founder lacks the friction of co-founder/tech-lead debate; persona spawns substitute. Decided 2026-05-24.                                                                                                                                                                                                                                                     | — Pending                                |
| Project structure mode = Horizontal Layers (`PROJECT_MODE=standard`)               | User explicitly chose layer-by-layer ordering (tenancy → auth → admin → catalog → ordering → ...) over vertical MVP slices, because the platform foundation needed depth-first completion before product breadth.                                                                                                                                                  | — Pending                                |
| Monetization v1 = flat sub per location + tier add-ons; NOT % commission           | Restaurants culturally reject %-from-orders (already paying delivery aggregators). Margin model is rent-like recurring, not transactional.                                                                                                                                                                                                                         | — Pending                                |
| Target first paying customer = Q1 2027                                             | Realistic given solo founder + 6 phases to MVP-bar + onboarding + sales cycle. Drives phase-sizing pressure.                                                                                                                                                                                                                                                       | — Pending                                |
| Phase 2 = Admin shell BEFORE Phase 3 = Auth completion                             | Admin shell can run on the dev-only Better Auth wire that already exists; auth completion (email/invitations/secure cookies) closes the prod-readiness gaps once there's UX to integrate them into.                                                                                                                                                                | — Pending                                |
| MVP-1 customer surface = Admin + Site + QR-menu (no Staff app, no Telegram, no AI) | Per SPEC section 7, adjusted 2026-05-27: Site BEFORE QR-menu (web shopfront is the primary customer surface). Skeptic lens: every surface deferred saves 4–8 weeks; first paying customer doesn't need them. Order intake in MVP-1 runs through Admin's operational view.                                                                                          | — Pending                                |
| Stripe Connect for restaurant↔guest, separate adapter (later) for SaaS billing     | Two payment surfaces serve different flows; coupling them creates "you can't sign up until you have Stripe" friction. SaaS billing can stay manual / invoiced until MVP-2.                                                                                                                                                                                         | — Pending                                |
| Pivot to AI-driven positioning; 3-milestone structure MVP-1/2/3                    | 2026-05-27 explore session decided: AI is the differentiator across all RestOS surfaces; iiko = partner not competitor; Tilda = irrelevant. Rollout pragmatic: standalone platform first (preserves Q1 2027 first-paying gate), AI tier MVP-2 (Q2-Q3 2027), Telegram + iiko MVP-3 (Q4 2027+). Authoritative context: `.planning/notes/ai-driven-pivot.md` + seeds. | — Pending (revisit at MVP-1 close)       |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):

1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):

1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state (active tenants, revenue, surfaced gaps)
5. Revisit each pending Key Decision; mark ✓ Good or ⚠️ Revisit

---

_Last updated: 2026-05-31 — Phase 04a (Catalog Schema + API redesign) shipped; verification 19/19 must_haves; iiko nomenclature aligned (sizes, modifier_groups), photos/БЖУ/source/stop-list/slug-aliases/delayed-publish/Redis-fallback all wired; OpenAPI drift-check on CI_
