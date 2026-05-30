# Roadmap: RestOS

## Overview

RestOS is a brownfield multi-tenant restaurant SaaS pivoting to **AI-driven positioning** (decided 2026-05-27 — see `.planning/notes/ai-driven-pivot.md`). The roadmap is staged across three milestones:

| Milestone | Scope                                                                                                                                  | Gate                                                         | Target     |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------- |
| **MVP-1** | Standalone non-AI platform: admin + auth + catalog + customer site + qr-menu + ordering + payments + ops + content/SEO + onboarding    | First paying restaurant takes paid orders end-to-end via web | Q1 2027    |
| **MVP-2** | AI agent platform + 3 surfaces (admin assistant, guest chat, AI onboarding constructor)                                                | Restaurant uses AI daily; onboarding <30 min via AI          | Q2–Q3 2027 |
| **MVP-3** | Telegram channel as 4th delivery surface; iiko adapter as B2B GTM channel; other POS adapters as the partnership motion validates them | Active iiko partnership pipeline; measurable Telegram volume | Q4 2027+   |

MVP-2 and MVP-3 are seeded in `.planning/seeds/mvp2-ai-platform.md` and `.planning/seeds/mvp3-channels-iiko.md`. Detailed planning happens when their trigger conditions activate (`/gsd-new-milestone`).

## MVP-1: Standalone Platform — Phases

**Phase Numbering:**

- Integer phases (1–16): MVP-1 planned work
- Decimal phases (e.g. 3.1): Urgent insertions added post-planning via `/gsd:phase insert`
- MVP-2 / MVP-3 phases will be numbered 17+ at their respective `/gsd-new-milestone` activation

- [x] **Phase 1: Tenancy Hardening** - Close all enterprise/GDPR/security gaps in the existing tenancy and identity contexts before any net-new product surface is built _(shipped 2026-05-26)_
- [x] **Phase 2: Admin Shell** - Wire the existing Better Auth dev setup into a real operator sign-in + brand management UX (completed 2026-05-27)
- [x] **Phase 3: Auth Completion (Security Core)** - Close production-readiness gaps in auth so real operators can be onboarded: email adapter (Resend + MailHog + in-memory), invitations, password reset, email verification, secure cookies, NATS DLQ, RBAC role seeding; minimal invite UX in settings. Full operator self-service UX (team management page + 2FA lost-device flow) deferred to Phase 17 _(scope split via persona review 2026-05-29 — CTO HIGH-1)_ (completed 2026-05-30)
- [ ] **Phase 4: Catalog Admin** - CRUD UX for menu management so operators have something to publish before customer surfaces go live
- [ ] **Phase 5: Customer Site** - Scaffold `apps/website` with menu display, delivery/pickup mode selection, address validation, cart entry — checkout button disabled until Phase 8 completes _(reordered to precede QR-menu on 2026-05-27 — web shopfront is the primary customer surface)_
- [ ] **Phase 6: QR-Menu Customer** - Real customer-facing ordering UI over the working `/v1/menu` endpoint (cart, modifiers, table binding)
- [ ] **Phase 7: Ordering** - New `ordering` bounded context: cart, order aggregate, state machine, event contracts, DB tables; includes pure discount engine (PROMO-06) and outbox claim-token fix (ORD-11)
- [ ] **Phase 8: Payments (Stripe Connect)** - Replace `NoopStripeConnectAdapter` with real Stripe Connect Express; includes pending-KYC UX state, outbox leader health probe, order confirmation page (SITE-08), and guest notification emails (GNOTIF)
- [ ] **Phase 9: Delivery Zones** - Polygon-based delivery zone editor, fee/threshold config, in-zone check at checkout with Redis geocode cache
- [ ] **Phase 10: Admin Order Intake** - Incoming-orders feed and operational controls in admin (no Staff app in MVP-1); requires zones to exist for delivery validation
- [ ] **Phase 11: Promo & Discounts** - Single + bulk promo codes, automatic discounts, admin UX (pure discount engine already shipped in Phase 7)
- [ ] **Phase 12: CRM** - Customer record, order history, GDPR delete-on-request _(open question for Phase 12 discuss: include MVP-2-ready customer profile fields to avoid retrofit?)_
- [ ] **Phase 13: Analytics** - Revenue / AOV / order count / conversion rate dashboard for operators
- [ ] **Phase 14: Finance** - Order list with filters + export, refunds, VAT, RestOS commission line
- [ ] **Phase 15: Content & SEO** - Tenant theming, content pages, per-city SEO landing pages, sitemap
- [ ] **Phase 16: Self-serve Onboarding (non-AI)** - End-to-end signup-to-published-menu wizard threading all prior phases together. MVP-2 supersedes this with the AI onboarding constructor.
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

### Phase 4: Catalog Admin

**Goal**: Give operators a full CRUD UX for menu management — categories, items, modifiers, variants, photos, stop-lists, and a publish flow — so the catalog is ready to be consumed by customer-facing surfaces
**Depends on**: Phase 3
**Requirements**: CAT-01, CAT-02, CAT-03, CAT-04, CAT-05, CAT-06, CAT-07, CAT-08, CAT-09, CAT-10
**Success Criteria** (what must be TRUE):

1. Operator creates, edits, and archives categories and items (with name, description, price, allergens, photo) with explicit ordering, and uploads photos via presigned S3 PUT with preview
2. Operator creates and manages modifier groups with per-option price deltas and item variants with price overrides
3. Operator triggers publish and the snapshot becomes the new published version with cache invalidation; operator can see a diff between draft and published before publishing; menu version counter uses Postgres `nextval` sequence as authoritative fallback when Redis is unavailable
4. Operator manages a manual stop-list, marking items as 86'd so they appear disabled on customer surfaces
5. All catalog free-text fields enforce Zod max-length constraints (`imageS3Key`, `allergens` array and element lengths)
   **Plans**: TBD
   **UI hint**: yes
   **Persona reviewers**: persona-cto, persona-skeptic, persona-product-strategist, persona-growth-marketer

### Phase 5: Customer Site

**Goal**: Scaffold `apps/website` with menu display, delivery/pickup mode selection, address validation, cart entry — checkout button is disabled until Phase 8 completes
**Depends on**: Phase 4
**Requirements**: SITE-01, SITE-02, SITE-03, SITE-04, SITE-05, SITE-06, SITE-07, SITE-09, SITE-10
**Success Criteria** (what must be TRUE):

1. `apps/website` builds and serves the published menu for the resolved tenant via subdomain routing (`<slug>.resto.app`); custom domain resolution via `tenant_domains` table works
2. Guest selects delivery or pickup, enters a delivery address and sees inline zone validity feedback (stub — real zone check wires in at Phase 9), and can choose ASAP or scheduled order time
3. Guest sees cart with promo code field (non-functional placeholder until Phase 11) and a total breakdown showing subtotal; delivery fee, modifiers, and discounts wire in via Phase 7/8/11
4. Guest provides contact info and the checkout button is visible but disabled with a "coming soon" state until Phase 8 completes; no real payment flow is initiated in this phase
5. Operator-editable content pages (About, Delivery, Contact, FAQ) are accessible from the site
   **Plans**: TBD
   **UI hint**: yes
   **Persona reviewers**: persona-cto, persona-skeptic, persona-product-strategist, persona-growth-marketer

### Phase 6: QR-Menu Customer

**Goal**: Deliver a real customer-facing ordering UX in `apps/qr-menu` — branded menu display, item detail with modifiers, cart, table binding — over the already-working `/v1/menu` API
**Depends on**: Phase 4
**Requirements**: QRM-01, QRM-02, QRM-03, QRM-04, QRM-05, QRM-06, QRM-07, QRM-08, QRM-09, QRM-10, QRM-11, QRM-12
**Success Criteria** (what must be TRUE):

1. Guest sees the restaurant's branded header, categories, items with photos and prices; stop-listed items appear visibly disabled
2. Guest opens an item detail, selects modifiers with live price updates, adds the item to cart, adjusts quantity, and sees running subtotal
3. Guest's table number is auto-bound from the `?table=` QR param or can be entered manually
4. Multi-language switcher works (locale from URL > cookie > Accept-Language)
5. Production build emits source maps as `'hidden'` and the bundle test asserts source maps are not publicly served
   **Plans**: TBD
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
   **Plans**: TBD
   **UI hint**: no
   **Persona reviewers**: persona-cto, persona-skeptic, persona-investor

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
   **Plans**: TBD
   **UI hint**: no
   **Persona reviewers**: persona-cto, persona-skeptic, persona-investor

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

### Phase 10: Admin Order Intake

**Goal**: Give operators a real-time incoming-orders feed in admin with status transitions, cancel/refund actions, order filtering, graceful SSE shutdown, and a public order-status endpoint for guest-facing confirmation page polling
**Depends on**: Phase 7, Phase 8, Phase 9
**Requirements**: ORDINT-01, ORDINT-02, ORDINT-03, ORDINT-04, ORDINT-05, ORDINT-06, ORDINT-07, ORDINT-08, ORDINT-09, ORDINT-10
**Success Criteria** (what must be TRUE):

1. New orders appear in the admin feed in real time via Server-Sent Events without a page refresh; incoming orders are visually flagged; delivery zone validation is enforced for all delivery orders (zones exist from Phase 9)
2. Operator accepts or rejects an incoming order; rejection auto-triggers a refund via Stripe
3. Operator transitions an accepted order through `accepted → preparing → ready → completed`
4. Operator cancels an order with a reason; if the order was paid, auto-refund is triggered; operator can filter orders by status, date, and channel; operator sees full order details (items, modifiers, customer info, delivery address, total breakdown)
5. Graceful shutdown closes all active SSE connections with a `retry:` event so clients auto-reconnect; public `GET /v1/orders/:id/status` endpoint returns current order state for guest-facing confirmation page polling
   **Plans**: TBD
   **UI hint**: yes
   **Persona reviewers**: persona-cto, persona-skeptic, persona-product-strategist, persona-growth-marketer

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

**Goal**: Give operators an order list with advanced filtering, CSV export, refund initiation, VAT rate configuration per category, and a RestOS SaaS billing line for the period
**Depends on**: Phase 7, Phase 8
**Requirements**: FIN-01, FIN-02, FIN-03, FIN-04, FIN-05, FIN-06
**Success Criteria** (what must be TRUE):

1. Operator filters orders by status, date, payment status, channel, and brand; exported CSV contains all matching rows
2. Operator initiates a full or partial refund from the order detail view; the refund is reflected in both Stripe and the order state
3. Operator sets a VAT rate per category; order detail shows a VAT breakdown
4. Operator sees the RestOS SaaS billing line for the current period alongside Stripe processing fees
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

## MVP-2: AI Agent Platform + 3 Surfaces (placeholder)

> Trigger: MVP-1 closed; first paying customer onboarded; standalone platform stable in prod >30 days. Detailed scope in `.planning/seeds/mvp2-ai-platform.md`. Phase numbering assigned at `/gsd-new-milestone` activation time.

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
MVP-1 phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16. Phase 17 is post-MVP-1 polish — activates only on its documented trigger (first multi-member tenant OR BA ≥ 1.5 hook). MVP-2/3 phases are sequenced at their respective `/gsd-new-milestone` activations.

Notes:

- Phase 5 (Customer Site) precedes Phase 6 (QR-Menu Customer) per 2026-05-27 AI-driven pivot decision — web shopfront is the primary customer surface and the surface AI guest chat (MVP-2) will be embedded on.
- Phase 9 (Delivery Zones) precedes Phase 10 (Admin Order Intake) so zone validation exists before live delivery orders are accepted through the operator intake feed.

### MVP-1 Phase Status

| Phase                                         | Plans Complete | Status        | Completed  |
| --------------------------------------------- | -------------- | ------------- | ---------- |
| 1. Tenancy Hardening                          | 6/6            | ✓ Done        | 2026-05-26 |
| 2. Admin Shell                                | 5/5            | Complete      | 2026-05-27 |
| 3. Auth Completion (Security Core)            | 5/5            | Complete      | 2026-05-30 |
| 4. Catalog Admin                              | 0/?            | Not started   | -          |
| 5. Customer Site                              | 0/?            | Not started   | -          |
| 6. QR-Menu Customer                           | 0/?            | Not started   | -          |
| 7. Ordering                                   | 0/?            | Not started   | -          |
| 8. Payments (Stripe Connect)                  | 0/?            | Not started   | -          |
| 9. Delivery Zones                             | 0/?            | Not started   | -          |
| 10. Admin Order Intake                        | 0/?            | Not started   | -          |
| 11. Promo & Discounts                         | 0/?            | Not started   | -          |
| 12. CRM                                       | 0/?            | Not started   | -          |
| 13. Analytics                                 | 0/?            | Not started   | -          |
| 14. Finance                                   | 0/?            | Not started   | -          |
| 15. Content & SEO                             | 0/?            | Not started   | -          |
| 16. Self-serve Onboarding                     | 0/?            | Not started   | -          |
| 17. Operator Self-service Polish (post-MVP-1) | 0/?            | Trigger-gated | -          |
