# RestOS

## What This Is

RestOS is a multi-tenant SaaS for restaurants. One subscription gives a restaurant a "turnkey digital presence": guests order via QR-menu, public site, and (post-MVP) mobile / Telegram; staff work in dedicated surfaces; everything is administered from one operator panel. One SaaS customer = one restaurant company (Tenant) with internal `Brand → Location → Menu / Zones / Staff` hierarchy. RestOS owns the core (orders, menu, customers, loyalty, marketing); third-party POS systems are optional adapter integrations, never a prerequisite.

The canonical product specification is `SPEC.md` (Russian, kept as source-of-truth for product surface area). This document captures planning context, decisions, and scope boundaries — not duplicated product detail.

## Core Value

A restaurant can publish its digital presence (menu, brand, locations) and start accepting paid orders from guests via web — without integrating any external POS or hiring a developer.

If everything else fails (no mobile, no loyalty, no marketing automation, no advanced analytics, no Telegram, no Staff app), this one capability still delivers value: a restaurant goes from "no digital presence" to "guests place paid orders that I can fulfill" inside RestOS alone.

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

**Catalog (partial):**

- ✓ Menu items, categories, modifiers, variants in Drizzle schema
- ✓ Public published-menu read endpoint `/v1/menu` with Redis cache
- ✓ Image S3 presigning for menu items

**Apps (scaffolded):**

- ✓ `apps/admin` — Next.js 15 RSC operator dashboard scaffold (shadcn/ui, App Router, server actions, `apiFetch` with BA session forwarding)
- ✓ `apps/qr-menu` — Vite+React customer-facing menu reader
- ✓ Empty placeholder apps: `apps/website`, `apps/landing`, `apps/mobile` (scaffolded but `.gitkeep`-only)

### Active

> Current scope. These are the hypotheses we're building toward. Each phase in `ROADMAP.md` advances one or more.

**MVP-1 (v1) — per SPEC section 7: Admin + QR-menu + Site**

- [ ] **Tenancy hardening to production-enterprise bar** — close out `suspend` lifecycle, automated erasure scheduler, BA credential separation closure, expanded cross-tenant test net, audit completeness gap fix, per-tenant observability, `withoutTenant` runtime + lint enforcement, `inbox_processed` retention, `correlationId` via OTel span (`buildEnvelope`)
- [ ] **Admin shell + auth wiring** — sign-in flow, tenant resolution UI, brand list/create/switch UI over existing Better Auth
- [ ] **Auth completion to operator-onboarding bar** — Resend SMTP email adapter, invitation flow, password reset, RBAC presets (`owner`, `admin`, `staff`), secure cookie fix, full email-callback assertions
- [ ] **Catalog admin UX** — CRUD for categories / items / modifiers / variants / photos, publish-flow UI, stop-lists (manual)
- [ ] **QR-menu customer polish** — real ordering UI over `/v1/menu` (cart, item detail, modifier selection, table binding via QR param)
- [ ] **Customer Site** — `apps/website` scaffolded from `.gitkeep` to working multi-tenant restaurant site (menu, delivery/pickup, cart, checkout)
- [ ] **Ordering bounded context** — new `ordering` context: cart, checkout, payment intent, fulfillment state machine; new DB tables, event contracts (`ordering.>`), NATS subject
- [ ] **Stripe Connect implementation** — replace `NoopStripeConnectAdapter` with real adapter: account creation, account-link onboarding, payment-intent routing with application fee, webhook handling
- [ ] **Admin order intake & operational view** — incoming-orders feed, status transitions, refund/cancel actions (where Staff app would be, MVP uses Admin)
- [ ] **Delivery zones (basic)** — polygon-on-map editor, minimum order value, free-delivery threshold, in-zone check at checkout
- [ ] **Promo & discounts (basic)** — single-use and bulk promo codes, percent/fixed discount on item/category/cart
- [ ] **CRM (basic)** — customer base with order history, GDPR delete-on-request
- [ ] **Analytics (basic)** — revenue / AOV / order count / conversion dashboard
- [ ] **Finance (basic)** — order list with filters and export, refunds, VAT rates, RestOS commission line
- [ ] **Content & SEO basics** — restaurant theming (light/dark, accent), logo, content pages (About / Delivery / Contact / FAQ), per-city SEO pages generated from templates
- [ ] **Self-serve onboarding** — restaurant signs up, configures, and publishes within < 24 hours without operator help (per SPEC growth-marketer lens)

**Post-MVP (deferred, but not "Out of Scope" — explicitly scheduled for later milestones)**

- [ ] Loyalty program (points, tiers, referrals, welcome bonus)
- [ ] Marketing automation (email campaigns, push, stories, banners, upsell)
- [ ] Advanced delivery (zone heatmap, peak-load markers, dynamic pricing)
- [ ] Tip splitting (cook / barista / courier)
- [ ] Reviews (post-order request, tag taxonomy, moderation, restaurant replies)
- [ ] Staff app (`apps/mobile-staff` or web) — KDS, waiter, manager, courier views
- [ ] Customer mobile app — React Native iOS/Android
- [ ] Telegram Mini App
- [ ] POS integrations (iiko, r_keeper) via adapters
- [ ] External delivery integrations (Glovo, Bolt Food, Wolt, Uber Direct)
- [ ] Multi-payment-provider support (Mollie, Adyen, regional acquirers)
- [ ] Advanced auth (Google, Apple, Telegram, Phone OTP)
- [ ] Headless CMS for restaurant content
- [ ] Partner / agency panel
- [ ] AI assistant

### Out of Scope

> Explicit no's, with reasoning. Do not re-add without revisiting.

- **Headless CMS for restaurant content (initially)** — one shared site template with per-tenant theming is enough for v1. Skeptic lens: avoid the headless-CMS detour until at least 10 paying tenants explicitly need it.
- **Custom mobile apps in MVP-1** — React Native deferred per SPEC section 7. Customer can order via web; Telegram MA is the lightweight alternative if mobile gap hurts retention.
- **POS integration in MVP-1** — RestOS is positioned as "own core, optional POS sync." Building POS adapters before having paying customers actively asking for them is YAGNI.
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

- vs. Toast / Olo: lower-touch, EU-first, no POS hardware lock-in
- vs. POS-attached SaaS (iiko, r_keeper Marketplace): RestOS is the source of truth, not a plugin
- vs. delivery aggregators (Glovo, Bolt, Wolt, Uber Eats): restaurant owns its customer and conversion path
- vs. Choice / Tablein / SumUp: broader vertical surface; not just bookings or just payments

**Codebase state (2026-05-24).** Substantial platform foundation already shipped — see `.planning/codebase/` for the full map. Most "missing" things in the gap analysis are _business features_ (ordering, payments, CRM, loyalty, marketing, analytics, delivery zones) — the _platform_ is mature. CONCERNS.md lists ~15 open technical debt / security items that get folded into Phase 1 (tenancy hardening) where they cluster.

**Known surfaces of the SaaS (from SPEC).**

- `apps/admin` — operator dashboard
- `apps/qr-menu` — in-restaurant QR-driven menu (dine-in)
- `apps/website` — public restaurant site (delivery + pickup orders) ← scaffolded only, must be built for MVP
- `apps/landing` — RestOS SaaS marketing site ← post-MVP
- `apps/mobile` — React Native customer app ← post-MVP
- (Staff app, Telegram MA, support back-office) ← post-MVP

## Constraints

- **Tech stack**: TypeScript end-to-end, NestJS modular monolith on the backend, Next.js 15 RSC for admin and (planned) website, Vite+React for qr-menu, Postgres+RLS, NATS JetStream, Redis, S3 — locked. Stack decisions inherited from the existing codebase; revisit only if a phase has a documented blocker.
- **Multi-tenancy**: Every tenant-scoped query MUST go through `ScopedTx` AND Postgres RLS — RLS alone is not sufficient. Composite FK on every child table. Hard deletes forbidden. Origin: CTO + skeptic lens, "what breaks tenancy if a dev forgets `tenant_id`?"
- **Compliance**: GDPR (EU) — full erasure pipeline with 30-day cool-off, anonymization via `AUDIT_ERASURE_SALT`, audit log of all PII touches. PCI never directly touched (Stripe Connect tokenizes everything). Fiscal compliance per market is a deferred problem (skeptic lens: do not build EU-wide fiscalization adapter in MVP).
- **Performance**: Public menu reads MUST stay fast on cold Redis (degraded mode is acceptable but must not crash). Peak load assumption: Friday-evening simultaneous order spikes across many tenants — no per-tenant noisy-neighbor patterns allowed.
- **Team**: Solo founder on the 12-month roadmap horizon. Phase sizing accommodates solo throughput (no parallel multi-developer assumptions). Persona reviews substitute for the missing co-founder/tech-lead second opinion.
- **Timeline / monetization milestone**: First paying customer target Q1 2027 (~7–9 months from 2026-05-24). MVP-1 (Phases 1–7) is the bar for "can take a customer's money."
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

| Decision                                                                                         | Rationale                                                                                                                                                                                                         | Outcome                                  |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| GSD is single source of truth for planning AND decisions; abandon ADRs                           | One consistent home for planning, decisions, execution; prior ADR+ROADMAP+memory split was high-overhead for a solo founder. Decided 2026-05-24.                                                                  | — Pending (revisit at milestone-1 audit) |
| `.planning/` committed (removed from `.gitignore`)                                               | Consequence of above — GSD artifacts are durable, not ephemeral.                                                                                                                                                  | — Pending                                |
| Drop layered T1..T6 milestone model (from deleted ADR-0021)                                      | The 6-tier freeze-gate model was over-structured for solo throughput; new GSD ROADMAP uses flat phase ordering.                                                                                                   | — Pending (revisit if scope grows)       |
| Persona reviews are mandatory on `/gsd:discuss-phase` (CTO + skeptic baseline)                   | Solo founder lacks the friction of co-founder/tech-lead debate; persona spawns substitute. Decided 2026-05-24.                                                                                                    | — Pending                                |
| Project structure mode = Horizontal Layers (`PROJECT_MODE=standard`)                             | User explicitly chose layer-by-layer ordering (tenancy → auth → admin → catalog → ordering → ...) over vertical MVP slices, because the platform foundation needed depth-first completion before product breadth. | — Pending                                |
| Monetization v1 = flat sub per location + tier add-ons; NOT % commission                         | Restaurants culturally reject %-from-orders (already paying delivery aggregators). Margin model is rent-like recurring, not transactional.                                                                        | — Pending                                |
| Target first paying customer = Q1 2027                                                           | Realistic given solo founder + 6 phases to MVP-bar + onboarding + sales cycle. Drives phase-sizing pressure.                                                                                                      | — Pending                                |
| Phase 2 = Admin shell BEFORE Phase 3 = Auth completion                                           | Admin shell can run on the dev-only Better Auth wire that already exists; auth completion (email/invitations/secure cookies) closes the prod-readiness gaps once there's UX to integrate them into.               | — Pending                                |
| MVP-1 customer surface = Admin + QR-menu + Site (no Staff app, no mobile, no Telegram MA, no AI) | Per SPEC section 7. Skeptic lens: every surface deferred saves 4–8 weeks; first paying customer doesn't need them. Order intake in MVP-1 runs through Admin's operational view.                                   | — Pending                                |
| Stripe Connect for restaurant↔guest, separate adapter (later) for SaaS billing                   | Two payment surfaces serve different flows; coupling them creates "you can't sign up until you have Stripe" friction. SaaS billing can stay manual / invoiced until MVP-2.                                        | — Pending                                |

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

_Last updated: 2026-05-24 after initialization (post-reset)_
