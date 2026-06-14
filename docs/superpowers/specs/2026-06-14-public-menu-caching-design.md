# Public Menu Caching (HTTP/CDN ETag) — Design

**Status:** Approved design (2026-06-14). Implementation plan to follow.

**Goal:** Serve the public menu through HTTP/CDN edge caching keyed on a durable Postgres menu version, so guest reads are absorbed at the edge instead of the API. Replace the optional Redis menu-cache. Stop-list (availability) is split into its own near-instant resource so it never invalidates the menu cache.

## Background / current state

- `GET /v1/menu` is the single public read, consumed by **qr-menu** (Vite SPA — the hot path, guests at the table) and **website** (Next RSC). Per-brand: the request host resolves the tenant + brand.
- Today the menu version lives in **Redis** (`catalog:menu:version:<tenantId>`). `current()` returns `1` when Redis is absent; `bump()` falls back to a _global_ `menu_versions_seq`. So the version is only a cache-bust key, **not** a durable per-tenant value — unusable as an ETag.
- The stop-list is folded **into** the menu read: `loadPublishedMenu` marks items `isStopListed`; the per-item detail read 404s stopped items. This couples a fast-changing signal (availability) to the slow-changing document (AUDIT #9 cache-coherency hazard).
- Redis is used in exactly one place (`redis-catalog-cache.adapter.ts`); it is optional and degrades to a Postgres read (degrade path hardened crash-safe in AUDIT #28).

## Architecture: two resources

Split the slow-changing catalog from the fast-changing availability.

1. **Menu document — `GET /v1/menu`**
   - Payload: categories, items, prices, descriptions, photos, modifiers, sizes — everything that changes only on **publish**.
   - The stop overlay (`isStopListed`) is **removed** from this payload.
   - Hard edge cache + `ETag` = the menu version.

2. **Availability — `GET /v1/menu/availability`**
   - Payload: `{ stoppedItemIds: string[] }` for the resolved brand. Tiny.
   - Short cache; near-instant invalidation.

3. **Clients merge.** qr-menu and website fetch both and apply the stop overlay client-side (stopped items greyed out / hidden). The menu document is fetched rarely (cached hard); availability is refreshed frequently.

## Version model (Postgres-native — the foundation)

The version moves from Redis to durable Postgres values.

- **`menuVersion` — per-tenant**, monotonic. Publish is per-tenant today (it republishes all of the tenant's brands together), so per-tenant granularity is correct: a publish should invalidate every brand's menu document. Bumped inside the publish transaction.
- **`stopVersion` — per-brand**, monotonic. A stop/unstop on brand A must not invalidate brand B's availability. Bumped inside the stop/unstop transaction.

Storage: a small `catalog_menu_version` table (or columns on the existing tenant/brand rows) holding `menu_version` (per tenant) and `stop_version` (per brand). Reads are a single indexed lookup; bumps are `UPDATE ... SET version = version + 1 RETURNING version` in the same transaction as the publish / stop write, so the version and the data move atomically. This replaces `MenuVersionPort`'s Redis implementation with a Postgres one; the port interface is unchanged for `menuVersion`, and a parallel `stopVersion` accessor is added.

## Header contract

`GET /v1/menu`:

- `ETag: "<menuVersion>"` (weak/strong: strong is fine — the version is exact).
- `Cache-Control: public, s-maxage=300, stale-while-revalidate=60`.
- Origin honors `If-None-Match`: when the request's ETag equals the current `menuVersion`, return **304** with no body. This offloads the origin even with no CDN (browsers revalidate); with a CDN, the edge revalidates after `s-maxage`.
- Publish staleness: a published change reaches guests within `s-maxage` (≤5 min). Acceptable for prices/descriptions; **no CDN purge in v1** (listed as a future enhancement for instant publish).

`GET /v1/menu/availability`:

- `ETag: "<stopVersion>"`.
- `Cache-Control: public, s-maxage=5`.
- Stop/unstop reaches guests within ~5s. `If-None-Match` → 304 when unchanged.

Both responses are public, non-personalized, per-host — safe for shared edge caching. CDN cache key is host + path (brand is in the host), so the per-brand ETag value is only a refinement, not a correctness requirement.

## Invalidation flow

- **Publish** → bump `menuVersion` (per-tenant) in the publish transaction → `/v1/menu` ETag changes → edge revalidates after `s-maxage`. `/availability` is untouched.
- **Stop / unstop** → bump `stopVersion` (per-brand) in the stop transaction → `/v1/menu/availability` ETag changes → edge revalidates after ~5s. **The menu document and its cache are untouched** — this removes the AUDIT #9 coupling entirely.

## Client merge

- **qr-menu (Vite SPA):** on load, fetch `/v1/menu` and `/v1/menu/availability` in parallel. Render the menu; hide or grey-out items whose id ∈ `stoppedItemIds`. Refresh availability on window focus and on a ~20s interval while the tab is visible; the menu document is fetched once (browser/edge cache serves repeats).
- **website (Next RSC):** fetch both server-side and merge before render; align Next's `revalidate` with the `s-maxage` values (300 for the menu, 5 for availability).
- Both clients send `If-None-Match` on refetch so unchanged resources cost a 304.

## Redis removal order

1. Add Postgres `menuVersion` (per-tenant) + `stopVersion` (per-brand); back `MenuVersionPort` with Postgres; add a `stopVersion` accessor.
2. Add ETag + `Cache-Control` to `/v1/menu`; add the new `GET /v1/menu/availability` endpoint; remove the stop overlay from the menu document.
3. Update qr-menu and website to fetch both resources and merge; send `If-None-Match`.
4. Put a CDN (Cloudflare) in front of qr-menu/API; verify edge HIT/MISS and 304 revalidation in staging.
5. **Remove the Redis cache adapter** once the edge path is proven. The Postgres degraded read becomes the origin for every cache miss. Removing it also retires the `menu_versions_seq` fallback and the `redis-catalog-cache.adapter.ts` entry in `WITHOUT_TENANT_ALLOWLIST` (the AUDIT #16 enforcement test will flag the stale entry if missed).

## Testing

- **Version/ETag:** publish bumps `menuVersion` → `/v1/menu` ETag changes; `If-None-Match` with the prior version → 200 + new body, with the current version → 304 no body.
- **Stop isolation (key property):** stop/unstop bumps `stopVersion` and changes the `/availability` ETag, while the `/v1/menu` ETag is **unchanged** — proving the menu cache stays warm across stops.
- **Per-brand availability:** `/availability` returns the correct `stoppedItemIds` for the resolved brand and does not leak another brand's stops.
- **Headers:** `Cache-Control` + `ETag` present with the specified values on both endpoints.
- **Contract:** the menu document no longer carries `isStopListed`. The per-item detail read (`GET /v1/menu/items/:id`) also drops the stop-filter and returns the item document (no longer 404s a stopped item); availability governs whether the client shows it as sold-out. Both reads thus depend only on publish state, so both are publish-versioned and edge-cacheable the same way.
- **Client merge:** stopped items are greyed/hidden after an availability refresh without re-fetching the menu document.

## Out of scope / future

- **Instant publish** via CDN purge-on-publish (Cloudflare purge API) — lets `s-maxage` grow to hours. Deferred; v1 accepts ≤5-min publish staleness.
- **Edge composition** (Cloudflare Workers/ESI) to merge menu+availability server-side at the edge into one client request — deferred (YAGNI; couples to Workers).
- Caching of authenticated/operator reads — unchanged; this spec is public reads only.

## Resolved decisions

- Menu version is **per-tenant** (matches per-tenant publish); stop version is **per-brand**.
- `s-maxage`: **300** for the menu, **5** for availability. No CDN purge in v1.
- Availability refresh: **on focus + ~20s interval while visible**, with `If-None-Match` 304s.
- The per-item detail read drops the stop-filter (stopped items return the document, not 404); availability governs sold-out display.
