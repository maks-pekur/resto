# Requirements: RestOS

**Defined:** 2026-05-24
**Core Value:** A restaurant can publish its digital presence and accept paid orders from guests via web — without integrating any external POS or hiring a developer.

> v1 = MVP-1 surface per SPEC.md section 7 (Admin + QR-menu + Site). Post-MVP features live in v2 (deferred but scheduled). Out of Scope = explicit no's.

## v1 Requirements

### Tenancy (`TEN`)

> Hardening the tenancy/identity foundation to production-enterprise bar before any net-new product surface is built on top.

- [ ] **TEN-01**: Operator can suspend a tenant (`active → suspended` transition)
- [ ] **TEN-02**: Suspended tenant returns 403/410 from all customer-facing endpoints (`/v1/menu`, public site, qr-menu)
- [ ] **TEN-03**: Operator can resume a suspended tenant (`suspended → active`)
- [ ] **TEN-04**: Suspend/resume actions emit `tenancy.tenant_suspended.v1` / `tenancy.tenant_resumed.v1` events with audit rows
- [ ] **TEN-05**: Daily scheduled job processes tenants past the 30-day offboarding cool-off and runs `executeErasure`
- [ ] **TEN-06**: Erasure executor failures emit alert (OTel error span + WARN log) without destructive retry
- [ ] **TEN-07**: `resto_app` role has zero privileges on Better Auth credential tables (`account`, `session`, `two_factor`, `verification`); verified by SQL preflight at boot
- [ ] **TEN-08**: Cross-tenant isolation test net covers race conditions, ALS leaks across async boundaries, NATS subscriber tenant context mix, and concurrent-write scenarios
- [ ] **TEN-09**: Every critical action in `tenancy` and `identity` contexts (provision/archive/offboard/suspend/erase/sign-in/sign-out/role-change) emits an audit row; coverage gap analysis written to `.planning/audit-gap.md` and closed
- [ ] **TEN-10**: Per-tenant OTel metrics exposed (outbox lag, HTTP request rate, error rate) with `tenant_id` label
- [ ] **TEN-11**: `db.withoutTenant(reason, fn)` runtime assertion validates the call site against an allowlist; unregistered sites throw
- [ ] **TEN-12**: ESLint rule rejects `withoutTenant(` call sites not present in the allowlist
- [ ] **TEN-13**: Daily scheduled job deletes `inbox_processed` rows older than 30 days (both tenant-scoped and platform-level rows)
- [ ] **TEN-14**: `buildEnvelope(contract, payload, opts)` helper in `@resto/events` reads `correlationId` from active OTel span via ALS; all `EventEnvelope` construction goes through it
- [ ] **TEN-15**: ESLint rule rejects direct `EventEnvelope` literal construction with `correlationId: randomUUID()`
- [ ] **TEN-16**: `OutboxDispatcher.stop()` is idempotent — concurrent callers receive the cached stop-promise; no deadlock on re-entrant lifecycle hooks (`packages/events/src/outbox/dispatcher.ts:118-124`)
- [ ] **TEN-17**: `appendToOutbox` validates the envelope via `EventEnvelope.parse()` before insert; malformed envelopes throw at insert-time, not broker-side (`packages/events/src/outbox/repository.ts:23`)
- [ ] **TEN-18**: Better Auth pinned to `=1.4.22` exact (tilde removed from package.json); deliberate upgrade decisions become phase deliverables, not auto-resolved by the package manager

### Admin Shell (`ADM`)

> First real api ↔ admin wiring. Uses Better Auth as already configured (dev-seeded operator).

- [ ] **ADM-00**: Scaffold smoke-walk verifies existing `apps/admin` behavior end-to-end before Phase 02 modifies code — 6 scenarios (valid sign-in, 0-brand tenant, 3+ brand tenant, non-owner role, expired session, multi-tab sync); failing scenarios precisely define Phase 02 gap-closure scope (per CONTEXT.md D-18, D-19)
- [ ] **ADM-01**: Operator signs in at `/login` with email + password
- [ ] **ADM-02**: Authenticated operator lands on dashboard layout (sidebar + main pane); 401 redirects to sign-in
- [ ] **ADM-03**: Sidebar shows operator's tenants/brands (`organization` plugin output)
- [ ] **ADM-04**: Operator can create a new brand inside their current tenant (`POST /v1/tenancy/brands`)
- [ ] **ADM-05**: Operator can switch active brand; active-brand state persists in signed cookie
- [ ] **ADM-06**: All admin pages enforce `PermissionsGuard` on the api; 403 surfaces as user-friendly empty state, not a stack trace
- [ ] **ADM-07**: `NavUser` shows real operator email + role (no `operator@example.com` placeholder)
- [ ] **ADM-08**: `apiFetch` and server actions throw at boot in non-dev if `NEXT_PUBLIC_API_ORIGIN` / `ADMIN_WEB_URL` / `INTERNAL_API_TOKEN` are missing (no `localhost` fallbacks)

### Auth Completion (`AUTH`)

> Closes the production-readiness gap so real operators can be onboarded.

- [ ] **AUTH-01**: Resend SMTP adapter wired; `assertEmailAdapterWired` validates `sendVerificationEmail`, `sendResetPassword`, `sendInvitationEmail` (all three, currently only one)
- [ ] **AUTH-02**: Operator added to a tenant receives invitation email with single-use link
- [ ] **AUTH-03**: Invitation link lands on `/accept-invitation`; new user completes signup, joins tenant with assigned role
- [ ] **AUTH-04**: Operator can request password reset at `/forgot-password`
- [ ] **AUTH-05**: Operator receives password reset email with single-use link, sets new password at `/reset-password`
- [ ] **AUTH-06**: New operator receives email verification on signup; unverified accounts blocked from sensitive actions per `REQUIRE_EMAIL_VERIFICATION`
- [ ] **AUTH-07**: Operator can enable 2FA TOTP from account settings; on enable, 10 recovery codes generated, shown once with copy-to-clipboard, user confirms saved before activation completes. Lost-device admin-reset UI deferred to Phase 17 / TEAM-04; for the first 100 customers, lost-device recovery for sole owner is manual founder-side reset via SQL script with audit row.
- [ ] **AUTH-08**: All cookies set by server actions use `secure: process.env.NODE_ENV === 'production'`, `httpOnly: true`, `sameSite: 'lax'`
- [ ] **AUTH-09**: System roles `owner` / `admin` / `staff` have correct permission presets seeded (idempotent NestJS bootstrap step OR generated static SQL migration). PLUS: `organizationHooks.afterUpdateMemberRole` wired in `auth.config.ts` — emits `identity.role_changed.v1` envelope through `buildEnvelope` + outbox; `ACTION_TARGET_KIND['identity.role_changed']='user'` added to audit projection; closes the BLOCKED row in `.planning/phases/01-tenancy-hardening/audit-gap.md` (the hook EXISTS in BA 1.4.22 per Phase 3 research at `types.d.mts:520`; the earlier "BA ≥ 1.5" requirement was based on a wrong hook path narrative). No new endpoint or UI in Phase 3 — Phase 17 / TEAM-03 adds the role-change UI on top, calling BA's existing `auth.api.updateMemberRole(...)` server-side API.
- [ ] **AUTH-10**: NATS consumer `max_deliver` + DLQ subject configured; poison messages don't redeliver forever
- [ ] **AUTH-11**: Better Auth context-stash for sign-out audit (`__restoSignOut`) replaced with `WeakMap<object, Stash>` (no `as unknown as` cast)

### Operator Self-service Polish (`TEAM`) — Phase 17, post-MVP-1

> Full team-management UX deferred from Phase 3 (scope split 2026-05-29 via CTO + Skeptic persona reviews). Activation trigger: first paying tenant adds a 2nd member with role ≠ owner OR Better Auth ≥ 1.5 ships `databaseHooks.member.update.after`. Non-blocking for MVP-1 close.

- [ ] **TEAM-01**: New `/dashboard/team` page (renamed from "staff" to avoid namespace collision with the `staff` role) renders member list with email + role + status; "Invite member" affordance gated on `staff:invite` permission
- [ ] **TEAM-02**: Pending-invitations table on `/dashboard/team`; operator with `staff:remove` can revoke a pending invite before its 48h TTL
- [ ] **TEAM-03**: In-place role-change UI on `/dashboard/team` for owner / admin; mutation calls `auth.api.updateMemberRole(...)` (BA server-side API — preserves BA permission graph + session invalidation). Audit envelope (`identity.role_changed.v1`) already fires automatically from Phase 3's wired `organizationHooks.afterUpdateMemberRole` — TEAM-03 is UI-only, no audit wiring needed. E2e test asserts an `admin`-tier operator cannot promote themselves to `owner`
- [ ] **TEAM-04**: Owner / admin can reset 2FA for subordinates from `/dashboard/team` (lost-device flow); reset emits audit row. Owner-role lost-device recovery stays manual founder-side (the email-recovery-loop variant is explicitly out of scope — it cancels the 2FA security gain)
- [ ] **TEAM-05**: Operator can regenerate 2FA recovery codes from `/dashboard/settings`; previous codes invalidated atomically; new set shown once with copy-to-clipboard + saved-confirmation gate (same shape as Phase 3 / AUTH-07 enable flow)

### Catalog Admin (`CAT`)

> CRUD UX for menu management. Builds on existing `catalog` context API.

- [x] **CAT-01**: Operator creates / edits / archives menu categories; categories have explicit ordering
- [x] **CAT-02**: Operator creates / edits / archives menu items (name, description, price, allergens, BJU, ingredients, photo)
- [x] **CAT-03**: Operator uploads item photo to S3 via presigned PUT; preview shown
- [x] **CAT-04**: Operator creates / edits modifier groups + options (per-option price delta)
- [x] **CAT-05**: Operator creates variants (size/portion) per item with price overrides
- [ ] **CAT-06**: Operator triggers publish; snapshot becomes new published version (cache version bumped)
- [x] **CAT-07**: Operator manages manual stop-list (add/remove items as 86'd)
- [x] **CAT-08**: Operator sees diff between draft and currently-published menu before publishing
- [ ] **CAT-09**: Catalog DTO/Zod max-length constraints applied on all free-text fields (`imageS3Key.max(1024)`, `allergens` array `.max(50)`, etc.)
- [ ] **CAT-10**: Redis menu-version counter uses Postgres `nextval('menu_versions_seq')` sequence as authoritative fallback when Redis is unavailable; resolves cache-key collision on concurrent publish during Redis outage

### QR-menu Customer (`QRM`)

> Real customer-facing ordering UI over the already-working `/v1/menu` endpoint.

- [ ] **QRM-01**: Guest opening QR-menu sees branded restaurant header (logo, accent color, location name)
- [ ] **QRM-02**: Guest sees categories with items, photos, prices
- [ ] **QRM-03**: Guest opens item detail, sees description/allergens/photo/modifier groups
- [ ] **QRM-04**: Guest selects modifiers; price updates live
- [ ] **QRM-05**: Guest adds item to cart
- [ ] **QRM-06**: Guest sees cart with running subtotal
- [ ] **QRM-07**: Guest can adjust quantity / remove items
- [ ] **QRM-08**: Guest can specify table number (auto-bound from QR `?table=` param or manual entry)
- [ ] **QRM-09**: Stop-listed items appear visibly disabled
- [ ] **QRM-10**: Multi-language switcher (locale from URL > cookie > Accept-Language header)
- [ ] **QRM-11**: qr-menu Vite build emits source maps as `'hidden'` (not `true`) for production
- [ ] **QRM-12**: Bundle test asserts source maps are not publicly served

### Customer Site (`SITE`)

> `apps/website` from `.gitkeep` to working multi-tenant restaurant site (delivery / pickup orders). Phase 6 delivers the scaffold through cart entry; checkout cutover happens in Phase 8.

- [x] **SITE-01**: `apps/website` scaffolded (Next.js 15 App Router with RSC, matches `apps/admin` stack)
- [x] **SITE-02**: Site renders the published menu for the resolved tenant (subdomain → tenant resolution)
- [ ] **SITE-03**: Guest chooses delivery or pickup mode
- [ ] **SITE-04**: For delivery, guest enters address (geocoded), sees zone validity check inline
- [ ] **SITE-05**: Guest sees cart, promo code field renders (non-functional until Phase 11), total breakdown (subtotal + delivery; modifiers and discounts wire in via Phase 7/8/11)
- [ ] **SITE-06**: Guest provides contact info (name, phone) with optional account creation
- [ ] **SITE-07**: Guest chooses order time (ASAP / scheduled interval)
- [ ] **SITE-08**: Guest sees order confirmation page with order number after payment success (ships in Phase 8, not Phase 6)
- [x] **SITE-09**: Site supports per-tenant subdomain (`<slug>.resto.app`) and custom domain (`tenant_domains` table)
- [ ] **SITE-10**: Operator-editable content pages (About / Delivery / Contact / FAQ)

### Ordering (`ORD`)

> New bounded context. Cart, order state machine, fulfillment.

- [x] **ORD-01**: New bounded context `ordering` created at `apps/api/src/contexts/ordering/` with 4-layer DDD structure
- [x] **ORD-02**: `Order` aggregate with state machine: `created → paid → accepted → preparing → ready → completed` (plus branches: `canceled`, `refunded`, `failed`)
- [x] **ORD-03**: Cart is anonymous (no auth required); converts to `Order` on checkout
- [x] **ORD-04**: Order persists immutable snapshot of items / modifiers / prices at creation time
- [x] **ORD-05**: Order totals: `subtotal + modifiers + delivery + service_fee − discount = total`; calculation in domain layer with rounding rules
- [x] **ORD-06**: New DB tables (`orders`, `order_items`, `order_modifiers`, `payments`) with `tenant_id` + composite FK
- [x] **ORD-07**: Event contracts: `ordering.order_created.v1`, `ordering.order_paid.v1`, `ordering.order_canceled.v1`, `ordering.order_refunded.v1`, `ordering.order_status_changed.v1`
- [x] **ORD-08**: NATS subject `ordering.>` added to `STREAM_SUBJECTS` in `nats.module.ts`
- [x] **ORD-09**: Order events subscribed by `audit` context (existing pattern)
- [x] **ORD-10**: Idempotent order creation (client-provided idempotency key)
- [x] **ORD-11**: `outbox_events` table gets `claim_token UUID` column; `releaseOutboxClaim` and `markOutboxDelivered` scope to claim token to prevent multi-replica double-delivery race
- [x] **ORD-12**: `orders` table includes `scheduled_for TIMESTAMPTZ NULL` column with operating-hours validation; supports SITE-07 scheduled order time

### Payments — Stripe Connect (`PAY`)

> Replace `NoopStripeConnectAdapter` with real implementation. Includes post-payment guest communications.

- [ ] **PAY-01**: Stripe SDK installed; `StripeConnectAdapter` implements `StripeConnectPort`
- [ ] **PAY-02**: Operator can initiate Stripe Connect onboarding from admin (`POST /v1/tenancy/stripe-onboarding`)
- [ ] **PAY-03**: Stripe `account_link` generated; operator redirected to Stripe-hosted onboarding flow
- [ ] **PAY-04**: Webhook endpoint `/webhook/stripe` validates Stripe signature; rejects invalid signatures with 400
- [ ] **PAY-05**: `account.updated` webhook updates `tenant.stripe_account_id` and onboarding status
- [ ] **PAY-06**: At order checkout, `PaymentIntent` created with `transfer_data.destination = tenant Stripe account` + RestOS `application_fee_amount`
- [ ] **PAY-07**: `payment_intent.succeeded` webhook transitions order to `paid` state
- [ ] **PAY-08**: `payment_intent.payment_failed` webhook surfaces failure to guest with retry CTA
- [ ] **PAY-09**: Refund flow creates Stripe refund + transitions order to `refunded` (full or partial)
- [ ] **PAY-10**: Stripe webhook handler idempotent (uses inbox dedup pattern with Stripe event id)
- [ ] **PAY-11**: `stripeAccountId` Zod schema gets `.max(255)` constraint
- [ ] **PAY-12**: `OutboxDispatcher` exposes `outbox.is_leader` OTel gauge (1/0); `/health/readiness` probe marks pod NOT ready when leader hasn't dispatched in >30s; closes silent leader-failover gap before real Stripe events flow
- [ ] **PAY-13**: Operator can use catalog, CRM, and admin fully while Stripe Connect KYC is in progress; only the "Accept payments" live switch is gated — pending-onboarding state does not block the rest of the product

### Guest Notifications (`GNOTIF`)

> Post-payment and post-status guest communications via Resend adapter (wired in AUTH-01). Folded into Phase 8.

- [ ] **GNOTIF-01**: Guest receives order confirmation email immediately after `payment_intent.succeeded` (order #, items, total, ETA)
- [ ] **GNOTIF-02**: Guest receives status emails when order transitions to `accepted` and to `ready` / `on-its-way` (uses Resend adapter from AUTH-01)
- [ ] **GNOTIF-03**: Guest receives refund confirmation email when refund is initiated (full or partial)
- [ ] **GNOTIF-04**: Email templates respect tenant brand theme (logo, accent color); per-locale templates

### Admin Order Intake (`ORDINT`)

> Where orders land (no Staff app in MVP-1). Now Phase 10 — executes after Delivery Zones (Phase 9).

- [ ] **ORDINT-01**: Operator sees incoming-orders feed in admin; new orders visually flagged
- [ ] **ORDINT-02**: Real-time updates (Server-Sent Events stream from api on `ordering.>` events) push new orders without refresh
- [ ] **ORDINT-03**: Operator accepts or rejects incoming order; rejection auto-refunds via Stripe
- [ ] **ORDINT-04**: Operator transitions order through states (`accepted → preparing → ready → completed`)
- [ ] **ORDINT-05**: Operator cancels order with reason; auto-refund triggered if order was paid
- [ ] **ORDINT-06**: Operator initiates partial refund (specific items)
- [ ] **ORDINT-07**: Operator sees order details (items, modifiers, customer info, delivery address, total breakdown)
- [ ] **ORDINT-08**: Operator filters orders by status / date / channel (qr-menu vs site)
- [ ] **ORDINT-09**: Graceful shutdown closes all active SSE connections with a `retry:` event; clients auto-reconnect after rolling deploy
- [ ] **ORDINT-10**: Public `GET /v1/orders/:id/status` endpoint (or SSE stream) returns current order state (`accepted / preparing / ready / on its way`); used by guest-facing confirmation page for live status polling

### Delivery Zones — basic (`DELV`)

> Polygons + minimums + in-zone check at checkout. Now Phase 9 — executes before Admin Order Intake. Per SPEC section 3.1.

- [ ] **DELV-01**: Operator draws delivery polygon on map (Leaflet + OpenStreetMap tiles, no Google Maps dependency)
- [ ] **DELV-02**: Operator sets minimum order value (global default + per-zone override)
- [ ] **DELV-03**: Operator sets free-delivery threshold per zone
- [ ] **DELV-04**: Operator sets fixed delivery fee per zone
- [ ] **DELV-05**: At site checkout, address geocoded (OSM/Nominatim) → point-in-polygon check against active zones
- [ ] **DELV-06**: Out-of-zone address blocked with explanation ("вне зоны доставки — попробуйте самовывоз")
- [ ] **DELV-07**: Operator can temporarily disable / re-enable a zone
- [ ] **DELV-08**: Redis-backed Nominatim geocode cache with normalized-address key + 24h TTL; rate-limit-resilient against public Nominatim 1 req/sec ToS

### Promo & Discounts — basic (`PROMO`)

> Single + bulk codes; cart/category/item discount; per SPEC section 3.1. PROMO-06 (pure discount engine) assigned to Phase 7 in traceability — must exist before Phase 8 processes real payments.

- [ ] **PROMO-01**: Operator creates promo code (code, type=`percent|fixed`, value, scope=`item|category|cart`, validity dates, max uses)
- [ ] **PROMO-02**: Operator bulk-imports promo codes from CSV (one-time-use list)
- [ ] **PROMO-03**: Guest enters promo code at checkout, sees discount applied or specific error (expired / invalid / max-uses)
- [ ] **PROMO-04**: Single-use code rejects second use
- [ ] **PROMO-05**: Operator creates automatic discount (no code, applies on condition like `cart_total > X`)
- [x] **PROMO-06**: Discount calculation pure (no DB calls); domain layer — assigned to Phase 7 (ordering context) so it exists before Phase 8 processes real payments

### CRM — basic (`CRM`)

> Customer record + history + GDPR delete.

- [ ] **CRM-01**: Customer record created on first order (phone + email as natural keys; `customers` table)
- [ ] **CRM-02**: Operator sees customer list with filters (date range, AOV, order count)
- [ ] **CRM-03**: Operator clicks customer, sees order history
- [ ] **CRM-04**: GDPR delete-on-request anonymizes PII (`AUDIT_ERASURE_SALT` hash), keeps aggregate stats
- [ ] **CRM-05**: GDPR delete writes audit row with hashed identifier (auditable, irreversible)

### Analytics — basic (`ANL`)

> Operator-facing dashboard.

- [ ] **ANL-01**: Dashboard shows revenue (today / 7d / 30d) with prior-period comparison
- [ ] **ANL-02**: Dashboard shows order count (today / 7d / 30d)
- [ ] **ANL-03**: Dashboard shows average order value (AOV)
- [ ] **ANL-04**: Dashboard shows order conversion rate = `paid_orders / checkout_initiations` for selected period; server-side aggregation from `orders` table (full menu→cart→checkout→paid funnel with client-side instrumentation is deferred to v2 as MKT-06)
- [ ] **ANL-05**: Dashboard shows top items by revenue and by order count

### Finance — basic (`FIN`)

> Order list + refunds + VAT + commission line.

- [ ] **FIN-01**: Operator sees order list with filters (status / date / payment status / channel / brand)
- [ ] **FIN-02**: Operator exports filtered orders as CSV
- [ ] **FIN-03**: Operator refunds order (full or partial); reflected in Stripe and order state
- [ ] **FIN-04**: Operator sets VAT rate per category
- [ ] **FIN-05**: Order detail shows VAT breakdown
- [ ] **FIN-06**: Operator sees RestOS SaaS billing line for the period (separate from Stripe processing fees)

### Content & SEO (`CONT`)

> Tenant theming, content pages, SEO basics.

- [ ] **CONT-01**: Operator sets brand theme (light/dark, accent color, logo, favicon)
- [ ] **CONT-02**: Operator edits content pages (About / Delivery / Contact / FAQ) via simple WYSIWYG (Tiptap or similar)
- [ ] **CONT-03**: Per-city SEO landing pages auto-generated from one template per zone
- [ ] **CONT-04**: Each page has editable meta title / description / og:image
- [ ] **CONT-05**: Per-tenant `sitemap.xml` and `robots.txt`
- [ ] **CONT-06**: `BrandTheme.logoUrl` Zod schema rejects non-http(s) URLs (`javascript:`, `data:`)
- [ ] **CONT-07**: `BrandTheme.font` Zod schema restricted to allowlist regex

### Self-serve Onboarding (`ONB`)

> The "< 24h to publish" promise from SPEC growth-marketer lens.

- [ ] **ONB-01**: New user signs up at landing CTA → creates first tenant in same flow (no separate "create org" step)
- [ ] **ONB-02**: Onboarding wizard guides through: brand setup → first location → upload menu → preview → publish
- [ ] **ONB-03**: Time-to-published-menu (from signup to first menu live) measurable; target ≤ 1 hour without operator help
- [ ] **ONB-04**: Stripe Connect onboarding offered as separate step (can be skipped and resumed later)
- [ ] **ONB-05**: Dev-mode shortcut: skip-to-paid-flow toggle for development testing

## v2 Requirements (Deferred — MVP-2 / MVP-3 / Future)

> Deferred. Not in MVP-1 scope. After the 2026-05-27 AI-driven pivot (see `.planning/notes/ai-driven-pivot.md`), the following category mapping applies:
>
> - **MVP-2 (AI tier):** `AI` — supersedes by `.planning/seeds/mvp2-ai-platform.md`. The placeholder AI-01..03 below are obsolete under the new positioning; the actual MVP-2 requirements (LLM gateway, per-tenant RAG, per-customer memory, tool registry, 3 surfaces) will be defined at `/gsd-new-milestone` activation. The CRM category in MVP-1 may need to carry "per-customer profile fields" as AI-readiness — to decide before Phase 12 planning.
> - **MVP-3 (channels + iiko):** `TG` (Telegram Mini App), `POS` (iiko/r_keeper/Poster adapters) — see `.planning/seeds/mvp3-channels-iiko.md`. Existing TG-01..02 and POS-01..03 reqs survive in spirit but are re-scoped at MVP-3 activation (Telegram is a full ordering channel, iiko is a partnership integration).
> - **Future / post-MVP-3:** `LOY`, `MKT`, `DELVADV`, `TIPS`, `REV`, `STAFF`, `MOB`, `AGGR`, `PAYMP`, `AUTHEXT`, `CMS`, `PART` — no scheduled milestone yet.

### Loyalty (`LOY`)

- **LOY-01**: Bonus points: accrual, redemption, activation, expiration
- **LOY-02**: Loyalty tiers (Silver / Gold / Platinum) by turnover or order count
- **LOY-03**: Referral program (bonus points per invited friend)
- **LOY-04**: Welcome bonus on registration
- **LOY-05**: Loyalty rules (accrual %, exclusions, scope)

### Marketing (`MKT`)

- **MKT-01**: Email campaigns to segments
- **MKT-02**: Push campaigns (segment + trigger based)
- **MKT-03**: Stories on site
- **MKT-04**: Banners (homepage, category pages)
- **MKT-05**: Cart upsell ("frequently bought with")
- **MKT-06**: Client-side event tracking (page view, add-to-cart, checkout initiation) for full conversion funnel — requires event collection infra (PostHog or custom schema); deferred from ANL-04 redefinition

### Advanced Delivery (`DELVADV`)

- **DELVADV-01**: Dynamic delivery fee by distance
- **DELVADV-02**: Heat map of demand by zone
- **DELVADV-03**: "Busy zone" marker at peak load
- **DELVADV-04**: Holiday / peak surcharge

### Tips & Service (`TIPS`)

- **TIPS-01**: Guest can tip cook / barista / courier separately
- **TIPS-02**: Service fee configurable
- **TIPS-03**: Pet-treat option in cart
- **TIPS-04**: "Less packaging" eco-option

### Reviews (`REV`)

- **REV-01**: Post-order review request
- **REV-02**: Review tags (taste / speed / packaging)
- **REV-03**: Moderation queue + publish flow
- **REV-04**: Restaurant replies

### Staff App (`STAFF`)

- **STAFF-01**: KDS (kitchen display) — incoming orders, prep timer, "ready" status
- **STAFF-02**: Waiter view — table orders, status, send-to-kitchen, close-check
- **STAFF-03**: Manager view — shift overview, reports, manual stop-list
- **STAFF-04**: Courier view — assigned orders, route, delivery status, new-order push
- **STAFF-05**: Role-based auth, multi-location operator switching

### Telegram Mini App (`TG`)

- **TG-01**: Telegram-native ordering surface (no app install)
- **TG-02**: Telegram-bound auth

### POS Integrations (`POS`)

- **POS-01**: iiko adapter (menu sync, order push)
- **POS-02**: r_keeper adapter (menu sync, order push)
- **POS-03**: Generic POS port for future adapters

### External Delivery Aggregators (`AGGR`)

- **AGGR-01**: Glovo adapter
- **AGGR-02**: Bolt Food adapter
- **AGGR-03**: Wolt adapter
- **AGGR-04**: Uber Direct adapter (white-label courier dispatch)

### Multi-payment-provider (`PAYMP`)

- **PAYMP-01**: Mollie adapter (EU)
- **PAYMP-02**: Adyen adapter (EU enterprise)
- **PAYMP-03**: Regional acquirer adapters (per market)

### Advanced Auth (`AUTHEXT`)

- **AUTHEXT-01**: Google OAuth
- **AUTHEXT-02**: Apple Sign-In
- **AUTHEXT-03**: Telegram login
- **AUTHEXT-04**: Phone OTP

### Headless CMS (`CMS`)

- **CMS-01**: Per-tenant rich content pages beyond the four built-in pages
- **CMS-02**: Blog / news posts

### Partner Panel (`PART`)

- **PART-01**: Agency / partner account that manages multiple tenants
- **PART-02**: Partner-side billing and revenue sharing

### AI Assistant (`AI`)

- **AI-01**: Menu translation assistant
- **AI-02**: Description / SEO copy generation
- **AI-03**: Operational anomaly detection (sudden order drop, cancellations spike)

## Out of Scope

> Explicit no's, with reasoning. Not v2 — these are deliberate non-features. Re-adding requires explicit reversal in Key Decisions.

| Feature                               | Reason                                                                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Commission-from-orders SaaS pricing   | Restaurants culturally reject % cuts (already paying aggregators). Monetization v1 = flat-sub per location + tier add-ons. |
| Geographic / locale restriction       | Architecture stays locale/currency-agnostic; we ship to any market the founder qualifies.                                  |
| Full per-tenant custom RBAC (v1)      | Three system roles (`owner`, `admin`, `staff`) cover MVP. Per-tenant role editing is post-MVP overhead.                    |
| Multi-currency in a single order      | Single currency per tenant; multi-currency across a network is post-MVP.                                                   |
| Hard deletes anywhere                 | `resto_app` has no DELETE privilege; soft-delete or migration-only. Architectural invariant.                               |
| POS integration in MVP-1              | RestOS is positioned as "own core, optional POS." YAGNI until a paying customer asks.                                      |
| Real-time chat (operator ↔ guest)     | High complexity, not core to ordering. Phone fallback works.                                                               |
| Online table reservations             | Defer until first paying restaurants ask for it — orthogonal to ordering.                                                  |
| In-app order tracking via courier GPS | Requires courier mobile; defer with Staff app.                                                                             |
| Self-serve SaaS billing in MVP-1      | First paying customers can be invoice-billed manually; build adapter once volume justifies.                                |

## Traceability

> Updated 2026-05-24 — revised after persona reviews. 151 v1 requirements total (ADM-00 appended 2026-05-27).

| Requirement | Phase         | Status   |
| ----------- | ------------- | -------- |
| TEN-01      | Phase 1       | Pending  |
| TEN-02      | Phase 1       | Pending  |
| TEN-03      | Phase 1       | Pending  |
| TEN-04      | Phase 1       | Pending  |
| TEN-05      | Phase 1       | Pending  |
| TEN-06      | Phase 1       | Pending  |
| TEN-07      | Phase 1       | Pending  |
| TEN-08      | Phase 1       | Pending  |
| TEN-09      | Phase 1       | Pending  |
| TEN-10      | Phase 1       | Pending  |
| TEN-11      | Phase 1       | Pending  |
| TEN-12      | Phase 1       | Pending  |
| TEN-13      | Phase 1       | Pending  |
| TEN-14      | Phase 1       | Pending  |
| TEN-15      | Phase 1       | Pending  |
| TEN-16      | Phase 1       | Pending  |
| TEN-17      | Phase 1       | Pending  |
| TEN-18      | Phase 1       | Pending  |
| ADM-00      | Phase 2       | Pending  |
| ADM-01      | Phase 2       | Pending  |
| ADM-02      | Phase 2       | Pending  |
| ADM-03      | Phase 2       | Pending  |
| ADM-04      | Phase 2       | Pending  |
| ADM-05      | Phase 2       | Pending  |
| ADM-06      | Phase 2       | Pending  |
| ADM-07      | Phase 2       | Pending  |
| ADM-08      | Phase 2       | Pending  |
| AUTH-01     | Phase 3       | Pending  |
| AUTH-02     | Phase 3       | Pending  |
| AUTH-03     | Phase 3       | Pending  |
| AUTH-04     | Phase 3       | Pending  |
| AUTH-05     | Phase 3       | Pending  |
| AUTH-06     | Phase 3       | Pending  |
| AUTH-07     | Phase 3       | Pending  |
| AUTH-08     | Phase 3       | Pending  |
| AUTH-09     | Phase 3       | Pending  |
| AUTH-10     | Phase 3       | Pending  |
| AUTH-11     | Phase 3       | Pending  |
| CAT-01      | Phase 4b      | Complete |
| CAT-02      | Phase 4a + 4b | Complete |
| CAT-03      | Phase 4b      | Complete |
| CAT-04      | Phase 4a + 4b | Complete |
| CAT-05      | Phase 4a + 4b | Complete |
| CAT-06      | Phase 4a      | Pending  |
| CAT-07      | Phase 4b      | Complete |
| CAT-08      | Phase 4b      | Complete |
| CAT-09      | Phase 4a      | Pending  |
| CAT-10      | Phase 4a      | Pending  |
| QRM-01      | Phase 5       | Pending  |
| QRM-02      | Phase 5       | Pending  |
| QRM-03      | Phase 5       | Pending  |
| QRM-04      | Phase 5       | Pending  |
| QRM-05      | Phase 5       | Pending  |
| QRM-06      | Phase 5       | Pending  |
| QRM-07      | Phase 5       | Pending  |
| QRM-08      | Phase 5       | Pending  |
| QRM-09      | Phase 5       | Pending  |
| QRM-10      | Phase 5       | Pending  |
| QRM-11      | Phase 5       | Pending  |
| QRM-12      | Phase 5       | Pending  |
| SITE-01     | Phase 6       | Complete |
| SITE-02     | Phase 6       | Complete |
| SITE-03     | Phase 6       | Pending  |
| SITE-04     | Phase 6       | Pending  |
| SITE-05     | Phase 6       | Pending  |
| SITE-06     | Phase 6       | Pending  |
| SITE-07     | Phase 6       | Pending  |
| SITE-09     | Phase 6       | Complete |
| SITE-10     | Phase 6       | Pending  |
| ORD-01      | Phase 7       | Complete |
| ORD-02      | Phase 7       | Complete |
| ORD-03      | Phase 7       | Complete |
| ORD-04      | Phase 7       | Complete |
| ORD-05      | Phase 7       | Complete |
| ORD-06      | Phase 7       | Complete |
| ORD-07      | Phase 7       | Complete |
| ORD-08      | Phase 7       | Complete |
| ORD-09      | Phase 7       | Complete |
| ORD-10      | Phase 7       | Complete |
| ORD-11      | Phase 7       | Complete |
| ORD-12      | Phase 7       | Complete |
| PROMO-06    | Phase 7       | Complete |
| PAY-01      | Phase 8       | Pending  |
| PAY-02      | Phase 8       | Pending  |
| PAY-03      | Phase 8       | Pending  |
| PAY-04      | Phase 8       | Pending  |
| PAY-05      | Phase 8       | Pending  |
| PAY-06      | Phase 8       | Pending  |
| PAY-07      | Phase 8       | Pending  |
| PAY-08      | Phase 8       | Pending  |
| PAY-09      | Phase 8       | Pending  |
| PAY-10      | Phase 8       | Pending  |
| PAY-11      | Phase 8       | Pending  |
| PAY-12      | Phase 8       | Pending  |
| PAY-13      | Phase 8       | Pending  |
| SITE-08     | Phase 8       | Pending  |
| GNOTIF-01   | Phase 8       | Pending  |
| GNOTIF-02   | Phase 8       | Pending  |
| GNOTIF-03   | Phase 8       | Pending  |
| GNOTIF-04   | Phase 8       | Pending  |
| DELV-01     | Phase 9       | Pending  |
| DELV-02     | Phase 9       | Pending  |
| DELV-03     | Phase 9       | Pending  |
| DELV-04     | Phase 9       | Pending  |
| DELV-05     | Phase 9       | Pending  |
| DELV-06     | Phase 9       | Pending  |
| DELV-07     | Phase 9       | Pending  |
| DELV-08     | Phase 9       | Pending  |
| ORDINT-01   | Phase 10      | Pending  |
| ORDINT-02   | Phase 10      | Pending  |
| ORDINT-03   | Phase 10      | Pending  |
| ORDINT-04   | Phase 10      | Pending  |
| ORDINT-05   | Phase 10      | Pending  |
| ORDINT-06   | Phase 10      | Pending  |
| ORDINT-07   | Phase 10      | Pending  |
| ORDINT-08   | Phase 10      | Pending  |
| ORDINT-09   | Phase 10      | Pending  |
| ORDINT-10   | Phase 10      | Pending  |
| PROMO-01    | Phase 11      | Pending  |
| PROMO-02    | Phase 11      | Pending  |
| PROMO-03    | Phase 11      | Pending  |
| PROMO-04    | Phase 11      | Pending  |
| PROMO-05    | Phase 11      | Pending  |
| CRM-01      | Phase 12      | Pending  |
| CRM-02      | Phase 12      | Pending  |
| CRM-03      | Phase 12      | Pending  |
| CRM-04      | Phase 12      | Pending  |
| CRM-05      | Phase 12      | Pending  |
| ANL-01      | Phase 13      | Pending  |
| ANL-02      | Phase 13      | Pending  |
| ANL-03      | Phase 13      | Pending  |
| ANL-04      | Phase 13      | Pending  |
| ANL-05      | Phase 13      | Pending  |
| FIN-01      | Phase 14      | Pending  |
| FIN-02      | Phase 14      | Pending  |
| FIN-03      | Phase 14      | Pending  |
| FIN-04      | Phase 14      | Pending  |
| FIN-05      | Phase 14      | Pending  |
| FIN-06      | Phase 14      | Pending  |
| CONT-01     | Phase 15      | Pending  |
| CONT-02     | Phase 15      | Pending  |
| CONT-03     | Phase 15      | Pending  |
| CONT-04     | Phase 15      | Pending  |
| CONT-05     | Phase 15      | Pending  |
| CONT-06     | Phase 15      | Pending  |
| CONT-07     | Phase 15      | Pending  |
| ONB-01      | Phase 16      | Pending  |
| ONB-02      | Phase 16      | Pending  |
| ONB-03      | Phase 16      | Pending  |
| ONB-04      | Phase 16      | Pending  |
| ONB-05      | Phase 16      | Pending  |
| TEAM-01     | Phase 17      | Pending  |
| TEAM-02     | Phase 17      | Pending  |
| TEAM-03     | Phase 17      | Pending  |
| TEAM-04     | Phase 17      | Pending  |
| TEAM-05     | Phase 17      | Pending  |

**Coverage:**

- v1 requirements: 156 total (151 MVP-1 core + 5 TEAM Phase 17 post-MVP-1 polish)
- Mapped to phases: 156
- Unmapped: 0

---

_Requirements defined: 2026-05-24_
_Last updated: 2026-05-29 — Phase 3 scope split via CTO + Skeptic persona reviews; TEAM-01..05 added for new Phase 17 (post-MVP-1 polish); AUTH-07 / AUTH-09 scope-noted in place_
_2026-05-24 — initial revision after persona reviews (persona-cto, persona-skeptic); 13 new requirements added, PROMO-06 reassigned to Phase 7, SITE-08 reassigned to Phase 8, Phases 9/10 swapped, GNOTIF category added_
