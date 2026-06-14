# Design: Brand read-path isolation (#7/#8/#9)

**Date:** 2026-06-14
**Source:** `.planning/AUDIT.md` findings #7, #8, #9 (MEDIUM)
**Status:** Approved — ready for implementation plan
**Part of:** multibrand isolation. Write side (#2/#3) merged via PR #207. **This = read side.** Per-operator authz (#15) is separate.

## Problem

Now that `brand_id` is NOT NULL on every menu table, the public/customer read path still leaks across brands within a tenant:

- **#7** — `loadPublishedMenu` brand-filters categories + items but reads `menu_modifier_groups` and `menu_modifier_options` **tenant-wide** (`catalog-drizzle.repository.ts:129,136`). The published-menu JSON's top-level `modifierGroups` therefore contains brand B's modifiers + option pricing when a guest loads brand A's menu. Cross-brand leak of public business data within a tenant.
- **#8** — the brand filter is conditional (`brandId ? eq(...) : undefined`). On a request with no resolved brand (`brandId = null`), `loadPublishedMenu` returns items/categories of **all** brands merged into one document (items reference other brands' categories). Incoherent for a multibrand tenant.
- **#9** — the menu cache keys per `(tenant, brand, version)` with a `'no-brand'` key for brandless reads (`redis-catalog-cache.adapter.ts:12`). A stop-list write invalidates only the resolving brand's key, leaving the merged `no-brand` cached menu stale.

## Decided contract (via brainstorming)

The public menu is **always per-brand** (guest enters via `<brand-slug>.menu.resto.app`; the brand is resolved from the customer host by `TenantContextMiddleware`). A read with no resolved brand is invalid → **404**. No merged-all-brands menu, no arbitrary default brand.

## Key facts (verified against current code)

- `loadPublishedMenu(tenantId, version, brandId?)` — items/categories brand-filtered only when `brandId` truthy (`:90,117`); `menu_modifier_groups` (`:129`) + `menu_modifier_options` (`:136`) + the stop-list overlay (`:120`) read tenant-wide. `findPublishedItem` (`:232`) mirrors the item brand-filter.
- The stop-list overlay matches by `itemId`, and `itemId` is brand-unique (each item belongs to one brand) — so a cross-brand stop never affects another brand's _items_. The only real #9 staleness was the `no-brand` merged cache, which #8 removes.
- Cache: `MENU_KEY(tenant, version, brandId ?? 'no-brand')`; per-brand `invalidate(tenant, version, brandId)`; the stop-list service already passes a real `requireBrandContext()` brand (Phase 1).
- Read services use `getBrandId() ?? null` (`get-published-menu.service.ts`, `get-menu-item.service.ts`).

## Approach

Make brand filtering **unconditional** on every read (brand is required), and reject a brandless public read with 404. This closes #7 (filter the modifier reads), #8 (no merged menu / 404), and #9 (no `no-brand` cache key; per-brand invalidation is then correct). Writes are untouched.

## Components

### 1. Read services require a resolved brand → 404

`apps/api/src/contexts/catalog/application/get-published-menu.service.ts` + `get-menu-item.service.ts`:

- Replace `getBrandId() ?? null` with a required brand: if `getBrandId()` is `undefined`, return a "menu not found" result (or throw the menu-not-found domain error) so the public controller maps it to **404** — NOT a 400/500 (it's a public endpoint; an unresolvable brand host is a not-found).
- The single-item read (`get-menu-item`) does the same.

### 2. Repository — brand-filter every read (#7)

`catalog-drizzle.repository.ts`, `loadPublishedMenu` + `findPublishedItem`:

- `brandId` is now a required `string` on these methods (drop the `?? null` / optional).
- Apply `eq(table.brandId, brandId)` **unconditionally** to: `menu_modifier_groups` (`:129`), `menu_modifier_options` (`:136`), the stop-list overlay read (`:120`), in addition to the already-filtered items + categories. Remove the `brandId ? … : undefined` ternaries.
- The brand-row lookup (`:94,107`) already requires brandId — keep.

### 3. Cache — drop the `no-brand` key (#9)

`redis-catalog-cache.adapter.ts`:

- `brandId` becomes a required `string` on `get`/`set`/`invalidate` and `MENU_KEY` (no `?? 'no-brand'` / `?? null`). With #8 there are no brandless reads, so the `no-brand` key is dead. The existing per-brand invalidation is correct once the `no-brand` key is gone; no enumeration / version-bump needed.

## Data flow (public menu read)

1. Guest GET on `<brand-slug>.menu.resto.app` → `TenantContextMiddleware` resolves tenant + brand from the host → ALS `brandId`.
2. `GetPublishedMenuService` reads `getBrandId()`; if absent → 404.
3. `loadPublishedMenu(tenant, version, brandId)` brand-filters every table (items, categories, modifier groups, modifier options, stop overlay) → only this brand's menu.
4. Cache key `(tenant, brand, version)`; a stop under this brand invalidates exactly this key.

## Error handling

A brandless public menu read → 404 (menu not found) via the public controller's error mapping. Reuse existing not-found mapping; do not leak which brands exist.

## Testing

- **e2e** (`catalog-brand-read-isolation.e2e.spec.ts`, new): one tenant, two brands, each with items + a modifier group/option. Assert:
  - Guest reading brand A's published menu sees ONLY brand A's modifier groups/options (brand B's modifier + pricing absent from the JSON) — #7.
  - A read with no resolved brand (no `x-brand-slug` / non-brand host) → 404 — #8.
  - Stop a brand-A item → brand A's published menu hides it; brand B's published menu is unaffected and still shows its own items — #9.
- Update existing public-menu e2e/unit that read without a brand to supply one (they'll now 404 otherwise).

## Integration check

All public-menu consumers must resolve a brand before reading `/v1/menu`:

- **qr-menu** — on a brand subdomain; brand resolves. OK.
- **apps/website** (multi-tenant SSR) — **verify** it reads the menu per-brand. If any path reads at tenant level (no brand), after #8 it 404s and must pass a brand. Small website-side fix if so; confirm during implementation.

## Out of scope

- Writes (#2/#3, done). Per-operator brand authz (#15). Composite FK on brand_id (#13). DB-level brand RLS.

## Definition of done

- Public menu read is brand-scoped on every table; brand B's modifiers never appear in brand A's menu.
- A brandless public menu read returns 404; no merged-all-brands document; no `no-brand` cache key.
- Stop-list staleness is gone (per-brand cache + brand-filtered reads).
- e2e proves cross-brand modifier isolation + 404-no-brand + stop-list per-brand; existing menu specs updated. typecheck/lint/openapi green. No code comments.
