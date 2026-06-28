---
id: SEED-001
status: dormant
planted: 2026-06-29
planted_during: v1.0 / Phase 08.1 (payments-provider-layer-and-onboarding-ux)
trigger_when: admin IA refactor, or before onboarding the first multi-member tenant (relates to Phase 17 trigger)
scope: large
---

# SEED-001: Brand-first routing + brand-scoped access & session model (admin + api)

## Why This Matters

During Phase 08.1 local testing the founder decided the admin information architecture
and access model should change. The current admin nests pages under a `/dashboard`
prefix and the brand appears as a redundant middle segment
(`/dashboard/{brand}/brands/{brand}/payouts`-class URLs); "dashboard" is overloaded as
both the app prefix and a page name. More importantly, the intended **access model** is
not yet implemented: owner vs member brand-switching behavior, location-scoped members,
and a single-active-brand session. The member-pinning piece is **security-sensitive** —
it must be enforced server-side, so it cannot be coded ad-hoc alongside a URL rename.

## When to Surface

**Trigger:** when undertaking the admin IA refactor, **or before onboarding the first
multi-member tenant** (the access model only bites once tenants have non-owner members —
overlaps Phase 17 "Operator Self-service Polish", trigger = first multi-member tenant).

Needs a **discuss/plan pass + a security review** (member scope enforcement) before any
code.

## Scope Estimate

**Large.** Touches the admin route tree (restructure to a pathless brand-first shell),
the brand-switcher, the api-client header logic, login/onboarding/redirect URLs, AND the
backend (location-level member scope, single-active-brand session enforcement,
reserved-word slug validation). Likely a dedicated phase, not a quick task.

## Model & Decisions (captured)

### Levels
- **Tenant** = billing / subscriptions only. No tenant-level admin *workspace* — even the
  owner always works inside a specific brand. (Tenant billing = FIN-07 / Phase 14.)
- **Brand** = the actual workspace.

### Routing — brand-first
- Drop the `/dashboard` prefix. All admin pages live under `/{brand}/...`:
  `dashboard, menu, payouts, theme, domains, team, settings`.
- `/` redirects to the active brand.
- **Note:** `team` / `settings` URLs move under the brand now, but their per-brand **data
  scope** is a later backend change — today they are tenant-scoped (one team / settings
  per tenant). URL-first, data-scope-later.

### Reserved-words guard
- With the brand as the top URL segment, brand slugs must not collide with root route
  words: `login, signup, onboarding, forgot-password, reset-password,
  accept-invitation, api, dashboard, assets, …`.
- Enforce **server-side** at brand-slug creation (a brand slug `login` could otherwise
  shadow the login route — correctness + security).

### Access model
- **Owner:** access to ALL brands of the tenant; switches between them **freely in-session
  (no re-login)**. Active brand stored in a cookie.
- **Member:** scoped to one or more **locations/points** (location-level, **NOT**
  brand-level — this is a new backend scope; today `member_brand_scope` is brand-level).
  Session is active in **one brand at a time**; switching to another permitted brand
  requires **re-login**. Active brand stored in a cookie.
- **Server-side enforcement (security):** a member must NOT be able to reach a
  brand/location outside their scope by changing the URL or the cookie. The
  single-active-brand pinning + scope is enforced on the **server**, not just the UI.

### Reuse / extend existing primitives
- `member_brand_scope` (extend brand → location level).
- `canViewAllBrands` (owner = `null` scope → unrestricted) — see
  `list-my-brands.service.ts`.
- Brand context resolved from the `x-brand-slug` header in `TenantContextMiddleware`.
- Principal derives `tenantId` / `baseRole` from the active organization (= tenant) — set
  on login via `authClient.organization.setActive`.

### Admin changes implied
- Route-tree restructure (pathless app shell, brand-first) in `apps/admin/src/main.tsx`
  + the `(protected)/dashboard/**` route files.
- Brand-switcher behavior: owner free-switch vs member re-login
  (`apps/admin/src/components/brand-switcher.tsx`).
- `api-client` sends the active-brand header from the cookie/URL
  (`apps/admin/src/lib/api-client.ts` — already sends `x-tenant-id`).
- Login / onboarding / redirect URL updates (`login.tsx`, `onboarding/brand.tsx`,
  `dashboard/_layout.tsx`). The OAuth-return URL was already cleaned to `/{slug}/payouts`
  (a44239a).

## Breadcrumbs

- `apps/admin/src/main.tsx` — route tree assembly (the `/dashboard/$brandSlug/...` nesting to flatten).
- `apps/admin/src/components/app-sidebar.tsx` — `brandPrefix` + nav URLs.
- `apps/admin/src/components/brand-switcher.tsx` — switch UX (owner vs member).
- `apps/admin/src/lib/api-client.ts` — `x-tenant-id` header (add active-brand header).
- `apps/api/src/contexts/identity/application/list-my-brands.service.ts` + `infrastructure/member-brand-scope-drizzle.reader.ts` + `application/ports/member-brand-scope-reader.port.ts` — brand-scope reader (extend to location).
- `apps/api/src/contexts/identity/interfaces/http/guards/brand-scope.guard.ts` — per-brand authorization guard.
- `apps/api/src/shared/tenant-context.middleware.ts` — `x-brand-slug` / `x-tenant-id` resolution.
- `packages/db/src/schema` — `member`, `member_brand_scope`, `brands`, locations.
- ROADMAP Phase 17 (Operator Self-service Polish, post-MVP-1, trigger = first multi-member tenant) and Phase 14 (Finance / FIN-07, tenant billing) are the related roadmap homes.

## Notes

DEFER: do not start implementation from this seed. It needs a discuss/plan pass and a
security review of the member single-active-brand enforcement before any code. Captured
one-shot during Phase 08.1 testing; promote to a phase at the trigger above.
