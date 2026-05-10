# ADR 0019: Multi-brand under tenant

- **Status:** proposed
- **Date:** 2026-05-09
- **Deciders:** Resto core team
- **Supersedes:** —
- **Superseded by:** —
- **Related:** [ADR 0006](./0006-multi-tenancy-row-level-with-rls.md) (RLS-by-tenant), [ADR 0009](./0009-stripe-connect-for-payments.md) (Stripe Connect), [ADR 0013](./0013-better-auth-for-mvp2-identity.md) (Better Auth)

## Context

Resto's tenancy model assumes one brand per tenant: `tenants.slug`, `tenants.display_name`, `tenants.stripe_account_id`, and `tenant_domains` all encode that 1:1 relationship. ADR-0006 designed the RLS isolation around it.

Real operators run **dark kitchens** with multiple brands cooked from one shared kitchen. Each brand is often a **separate legal entity** (ИП/ООО) with its own tax registration, bank account, fiscalization integration, and customer-facing identity (name, logo, theme, subdomain, Telegram bot).

A single dark-kitchen operator wants:

- One SaaS account with Resto (one bill, one login, one staff pool, one KDS).
- N brands underneath, each as an independent legal-and-presentation unit.
- Per-brand Stripe Connect Express payouts to the right legal entity's bank account.
- Per-brand fiscalization (RES-29 Checkbox UA, future OFD-RU).
- Customer-facing brands fully independent — different subdomains, themes, customer bases (no merge), Telegram bots.

The current schema cannot represent this: there is no place to attach a second Stripe Connect account, a second domain set, a second customer base, a second fiscalization config to the same tenant.

## Decision

Introduce a **`brands` sub-aggregate under `tenants`**.

- **Tenant** stays as the SaaS account / operator entity / billing entity / one BA-organization. Tenant carries shared concerns: staff pool, kitchen, inventory, SaaS billing.
- **Brand** is a new entity, FK to `tenants`. Brand carries:
  - **Legal:** `legal_name`, `legal_form` (IP/OOO/LLC/...), `tax_id`.
  - **Money out:** `stripe_account_id` (Stripe Connect Express, per brand), `fiscalization_config` (RES-29 territory).
  - **Customer-facing:** `slug`, `display_name`, `theme` (logo/color/font, RES-91 territory), domains (`brand_domains`).
- **Staff scoping** via `member_brand_scope (member_id, brand_id, role?)`. Empty rows ⇒ member sees all brands of their tenant; non-empty ⇒ scoped subset. `owner` baseRole bypasses.
- **RLS** stays `tenant_id`-only (ADR-0006 unchanged). Brand-isolation is **application-layer**: `BrandScopeGuard` (Nest) plus repository helpers that include `brand_id` in every query. Reason: brand-aware RLS would require sessions to carry `member_id`, breaking the `withoutTenant` paradigm used by CLI/seed/dispatcher code.
- **AsyncLocalStorage** carries `{ tenantId, brandId? }`. Brand resolved from host (customer-facing), from `X-Brand-Slug` header (operator), from explicit param (internal API).
- **Brand-scoped tables** get a `brand_id` column: all `menu_*`, `customer_profiles`, `outbox_events` (nullable for tenant-level events).
- **Tenant-scoped tables** stay unchanged: `audit_log`, `member`, `tenants` itself, `inbox_processed`.

A full design doc with migration plan and open questions lives in `.claude/superpowers/specs/2026-05-09-multi-brand-architecture-design.md` until the first implementation ships; it is the source for follow-up tickets.

## Alternatives considered

- **Account-over-tenant (B).** New `accounts` table groups N tenants; tenant stays = brand. Each tenant remains its own BA-organization with its own legal entity attached.
  - **Strongest argument:** DB-level legal isolation per tenant matches the legal boundary 1:1, and Stripe Connect is naturally per-tenant.
  - **Rejected:** identity becomes "user belongs to N orgs in the same account" — heavier BA usage. Cross-brand panel = app-layer aggregation across N tenant rows on every read, painful for KDS-style streams. Staff-shared-across-brands forces duplicated `member` rows per tenant. Account-level shared inventory/kitchen is awkward to model when tenant = legal entity.
- **Single-brand status quo (C).** Three brands = three Resto accounts.
  - **Strongest argument:** zero schema work; current code untouched.
  - **Rejected:** unified KDS impossible across three logins; one human paying three bills for one operation is hostile UX. Doesn't serve the dark-kitchen segment, which is a deliberate target market.

## Consequences

### Positive

- One SaaS billing relationship per operator, even with N brands.
- Per-brand legal/financial isolation matches real-world tax law (separate ИП/ООО, separate bank, separate fiscal receipts).
- Unified KDS / cross-brand staff works naturally (one tenant scope, brand is a column).
- Backwards-compatible RLS: ADR-0006 contract preserved; brand isolation layered on top via application-layer scope.
- Identity model unchanged at the BA level: `organization` stays = tenant, `member.role` stays = baseRole.
- RES-91 (theme tokens) and RES-29 (fiscalization) get the right home (brand) before they're implemented at the wrong level (tenant).

### Negative

- Schema migration touches every brand-scoped table (one-time, MVP-1 scale, no real customers yet).
- Repository code complexity rises: every brand-scoped read carries `brand_id` explicitly.
- Cross-brand cart UX (one customer ordering from two brands of one tenant) becomes a real concern: legally produces two orders / two charges / two fiscal receipts. Deferred to a follow-up spec.
- "Multiple brands sharing one Telegram bot" vs "one bot per brand" needs explicit storage and registration design (deferred).

### Neutral

- Default subdomain for customer-facing menu shifts from `<tenant-slug>.menu.resto.app` to `<brand-slug>.menu.resto.app`. Greenfield migration (no live customers), so no legacy redirect required.
- Staff `member_brand_scope` with **empty = all brands** chosen as the UX-friendly default; `owner` always bypasses.

## Implementation notes

- Spec source: `.claude/superpowers/specs/2026-05-09-multi-brand-architecture-design.md` (gitignored).
- Migration is one Drizzle schema migration + one data backfill + one constraint-tightening migration. Greenfield assumption permits a transactional cut rather than zero-downtime backfill.
- Tickets seeded by this ADR (each becomes its own `RES-` ticket once the ADR is accepted):
  - Schema migration (`brands`, `member_brand_scope`, `brand_domains`, `brand_id` columns)
  - `tenant-and-brand-resolver` + brand carry in `TenantContext`
  - `BrandScopeGuard` + `@RequireBrand()` decorator
  - Repository helpers brand-aware
  - `/v1/menu` response includes `brand` object
  - Admin brand-switcher UI + scope-aware nav
  - Onboarding flow update — signup creates **tenant + member only**;
    the operator picks a slug + display name on `/dashboard/brands/new`
    after first sign-in (RES-158, walks back the original "auto-default-
    brand" plan).
  - Re-scope RES-91 (theme tokens at brand level)
  - Re-scope RES-29 (fiscalization at brand level)
  - Backfill CLI command
- Open questions left for spec / first-PR review:
  - Brand bounded-context placement (`tenancy` vs new `branding`).
  - `member_brand_scope.role` per-brand role override — column added but unused in v1 guard.
  - Inventory scope — tenant-level by default; per-brand only if a real demand surfaces.
