# Subdomain-Based Tenant/Brand Resolution for website + qr-menu — Design

**Date:** 2026-06-13
**Status:** Approved (brainstorming), pending implementation plan
**Scope:** Make the two customer-facing surfaces (website, qr-menu) resolve their tenant **and brand** purely from the request subdomain — in production **and** in local development. The operator admin panel is out of scope (stays header-based).

## Problem

Per-tenant theming (`docs/superpowers/specs/2026-06-13-unified-design-system-tenant-theming-design.md`, shipped as Plan A) injects `buildTenantThemeVars(menu.brand?.theme)` on website and qr-menu. But an audit of the resolution layer found the data never reaches website:

- The API (`apps/api/src/shared/tenant-context.middleware.ts` → `tenant-and-brand-resolver.service.ts`) resolves brand from the **subdomain**: for a host with ≥3 labels, `labels[0]` is the brand slug → `findBySlug` → `{ tenantId, brandId }`. This is the production `resolveByCustomerHost` path.
- **qr-menu** works with this model: served at `brand.menu.domain`, it fetches the API **same-origin**, so the API sees the brand subdomain as `Host` and resolves the brand. Theme flows. ✓
- **website** does **not**: its middleware treats the subdomain as a **tenant** (`labels[0] → x-tenant-slug`) and `fetchMenuPublic` sends only `x-tenant-slug` to a fixed `NEXT_PUBLIC_API_ORIGIN`. The brand subdomain never reaches the API → `menu.brand` is null → the theme never applies (in dev or prod).
- In **dev**, neither surface uses subdomains: website uses `?tenant=`, qr-menu uses `VITE_TENANT_SLUG`. So per-tenant theming cannot be exercised locally at all.

Verified resolution map (current):

| Surface        | Sends to API                          | Tenant                | Brand                           |
| -------------- | ------------------------------------- | --------------------- | ------------------------------- |
| API (resolver) | —                                     | host / gated headers  | host subdomain / `x-brand-slug` |
| admin          | `x-tenant-id` + `x-brand-slug`        | header                | ✅ header                       |
| qr-menu        | prod same-origin; dev `x-tenant-slug` | prod host; dev header | ✅ prod host; ❌ dev            |
| website        | `x-tenant-slug` only                  | header                | ❌ never                        |

## Goals

1. website and qr-menu resolve **brand** (and therefore tenant) from their subdomain, consistently, in prod and dev.
2. Local dev mirrors production: open `brand.lvh.me:3002` (website) / `brand.menu.lvh.me:3003` (qr-menu) and the brand resolves from the subdomain.
3. Remove the dev-only header shortcuts (`?tenant=`, `x-tenant-slug` forwarding on website; `VITE_TENANT_SLUG` / `VITE_API_URL` on qr-menu) from the customer resolution path.
4. Per-tenant theme (Plan A) renders end-to-end on both surfaces with zero further changes to the theming code.

## Non-Goals

- admin (operator panel) — stays header-based (`x-tenant-id` + `x-brand-slug`, UI-driven tenant/brand switch). Unchanged.
- The production gateway/ingress configuration (infra, not application code).
- Custom-domain resolution — already handled by `findByDomainHost`; unchanged.
- Multi-brand-per-tenant selection UX — out of scope.

## Decisions (locked during brainstorming)

| #   | Decision                                                                                                                                                                        | Rationale                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Scope = website + qr-menu only; admin unchanged.                                                                                                                                | admin is an operator tool serving many tenants/brands via UI switch; it cannot be a per-brand subdomain.                                                                                      |
| D2  | Production topology = **same-origin** API at the brand subdomain (gateway routes `*.domain/v1/*` and `/internal/*` to the API).                                                 | Matches how qr-menu already works; the brand subdomain reaches the API as `Host` with no header forwarding.                                                                                   |
| D3  | Dev mechanism = **per-app proxy + wildcard DNS** (Approach 1).                                                                                                                  | No extra dev process. Next `rewrites` (website) + Vite `server.proxy` (qr-menu) forward `/v1` (+`/internal`) to the API; `lvh.me` is a zero-config wildcard resolving `*.lvh.me` → 127.0.0.1. |
| D4  | The API **resolver is not changed for the label rule** — dev domains `brand.lvh.me` (3 labels) / `brand.menu.lvh.me` (4) already satisfy the existing `labels.length > 2` rule. | Smallest change; reuse the proven resolver.                                                                                                                                                   |
| D5  | `x-tenant-slug` stays for the seed CLI / internal-token path; only the **customer dev path** stops using it.                                                                    | The seed CLI provisions via `/internal/v1/*` with `x-internal-token`; that path is unaffected and still needed.                                                                               |

## Architecture

### Production data flow (both surfaces)

```
browser → brand.domain (website)            browser → brand.menu.domain (qr-menu)
   │  gateway routes /v1/* and /internal/* → API; everything else → the app
   ▼                                            ▼
website SSR fetch: GET https://${host}/v1/menu  qr-menu fetch: GET /v1/menu (same-origin)
   │  Host: brand.domain                        │  Host: brand.menu.domain
   ▼                                            ▼
API TenantContextMiddleware → resolveByCustomerHost(Host)
   → labels[0] = brand slug → findBySlug → { tenantId, brandId }  (ALS bound)
   → /v1/menu returns menu incl. brand.theme
```

### `apps/api`

- **No resolver logic change** for the label rule (D4).
- **Open implementation detail (resolve via a spike at the start of the plan):** website is SSR — in production its server fetch to `https://${incomingHost}/v1/menu` relies on the gateway preserving the original `Host`. The plan's first step is a spike to confirm:
  1. that `resolveByCustomerHost` reads the effective host correctly behind the gateway, and
  2. whether the dev Next `rewrites` preserve the original `Host` to the proxied API.
  - If `Host` is preserved end-to-end → **zero API change**.
  - If `Host` is lost at any hop → add a small, `TRUST_PROXY`-gated read of `x-forwarded-host` in the resolver (standard reverse-proxy pattern), and have the website dev rewrite / SSR fetch set `x-forwarded-host` to the brand host. This is the documented fallback; the spike decides which path ships.

### `apps/website`

- `middleware.ts`: remove the subdomain→tenant derivation and the `x-tenant-slug` request header (`?tenant=` dev param included). Keep the locale-negotiation logic untouched.
- `lib/api-client.ts` (`fetchMenuPublic`): fetch the menu **same-origin** — read the incoming request host (Next `headers()`), build `fetch(\`${proto}://${host}/v1/menu\`)`, and drop `apiOrigin()`+ the`x-tenant-slug` header. (`proto`/`host` come from the forwarded request headers Next exposes.)
- `app/layout.tsx`: **no change** — it already calls `buildTenantThemeVars(menu.brand?.theme)` (Plan A). Once `menu.brand` is populated, the theme applies.

### `apps/qr-menu`

- `src/api/client.ts`: fetch **same-origin** relative paths (`/v1/...`); remove the `VITE_API_URL` base and the `VITE_TENANT_SLUG` → `x-tenant-slug` override from the resolution path.
- `vite.config.ts`: add `server.proxy` for `/v1` (and `/internal` if needed by tooling) → `http://localhost:3000` with `changeOrigin: false` so the brand `Host` (`brand.menu.lvh.me:3003`) is preserved to the API.
- Remove `apps/qr-menu/.env.local` (the dev `VITE_API_URL` / `VITE_TENANT_SLUG`).

### Dev mechanism (Approach 1)

- **Wildcard DNS:** `lvh.me` (`*.lvh.me` → 127.0.0.1, public, zero-config — no `/etc/hosts` edits).
- **website** at `http://cafe-demo.lvh.me:3002` — Next `rewrites`: `/v1/:path*` → `http://localhost:3000/v1/:path*` (+ `/internal/:path*` if used). Host-preservation per the spike (D-spike).
- **qr-menu** at `http://cafe-demo.menu.lvh.me:3003` — Vite proxy preserves Host via `changeOrigin: false`.
- The API continues to run on `:3000`.

## What is removed vs. retained

- **Removed (customer resolution path):** website `?tenant=` + `x-tenant-slug` forwarding; qr-menu `VITE_TENANT_SLUG` + `VITE_API_URL`.
- **Retained, untouched:** admin (`x-tenant-id` + `x-brand-slug`); seed CLI (`x-tenant-slug` under `/internal/v1/*` + `x-internal-token`); the `AuthGuard` tenant-mismatch / internal-token security cross-checks (RES-172 / RES-176).

## Error handling

- Unresolvable subdomain (unknown/erased brand) → API returns 404 → website renders its existing `TenantNotFoundError` state; qr-menu renders its existing `MenuNotFoundError` not-found state.
- Reserved hosts (`admin`, `api`, `www`) and hosts with ≤2 labels → `resolveByCustomerHost` returns null (existing behavior); the customer surfaces are only ever served at a brand subdomain, so this only affects misconfiguration.

## Testing

- **API:** existing `resolveByCustomerHost` unit tests cover subdomain→brand; add a case asserting a 3-label host (`brand.lvh.me`) resolves (parity with the 4-label qr-menu host). If the `x-forwarded-host` fallback ships, add a `TRUST_PROXY`-gated unit test.
- **website:** `middleware.spec.ts` — assert no `x-tenant-slug` header is set and locale logic is intact; `api-client.spec.ts` — assert `fetchMenuPublic` builds a same-origin URL from the incoming host with no tenant header.
- **qr-menu:** assert the client builds same-origin relative `/v1` requests; a config test (or manual note) that the Vite proxy uses `changeOrigin: false`.
- **e2e (manual smoke, dev):** `http://cafe-demo.lvh.me:3002` → website renders the cafe-demo theme (`#2563eb`); `http://dovezuka.menu.lvh.me:3003` → qr-menu renders the dovezuka theme (`#e11d48`).

## Success criteria

1. website served at `brand.lvh.me:3002` resolves the brand from its subdomain; `menu.brand.theme` is populated and the theme renders.
2. qr-menu served at `brand.menu.lvh.me:3003` resolves the brand from its subdomain; theme renders.
3. No customer-path code reads `?tenant=` / `VITE_TENANT_SLUG` / `x-tenant-slug` for resolution.
4. admin, seed CLI, and the security cross-checks are unchanged and still pass their tests.
