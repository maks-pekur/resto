# Public Menu Edge Caching — CDN Runbook

How to put a CDN (Cloudflare) in front of the public menu reads so guest traffic is absorbed at the edge. Phase 4 of `docs/superpowers/plans/2026-06-14-public-menu-caching.md`.

This is an **ops** procedure — the API already emits the right headers; the CDN must be configured to honor them and verified in staging. There is no app code to ship for the edge to work beyond what Phases 1–3 already landed.

## What the origin emits (already shipped)

All three are `@Public`, host-resolved (the request host resolves directly to a tenant — there is no brand layer, D-04), and carry **no `Set-Cookie`** (enforced by `menu-response.e2e` so it cannot silently regress):

| Route                       | Cache-Control                                     | ETag                                                   | On `If-None-Match`         |
| --------------------------- | ------------------------------------------------- | ------------------------------------------------------ | -------------------------- |
| `GET /v1/menu`              | `public, s-maxage=300, stale-while-revalidate=60` | `"<menuVersion>"` (per-tenant; bumps on publish)       | empty `304` when unchanged |
| `GET /v1/menu/items/:id`    | `public, s-maxage=300, stale-while-revalidate=60` | `"<menuVersion>"`                                      | empty `304`                |
| `GET /v1/menu/availability` | `public, s-maxage=5`                              | `"<stopVersion>"` (per-location; bumps on stop/unstop) | empty `304`                |

A stop/unstop changes only the `/availability` ETag — the menu-document ETag is unchanged, so its edge cache stays warm. A publish changes the menu ETag.

## Cloudflare configuration

1. **Cache rule** matching the menu paths on the tenant hostnames (`<slug>.<apex>` subdomains and any verified custom domains — 07.5-14 collapsed the map to one apex, so there is no separate `.menu.` label to match). Match `URI Path starts with /v1/menu`. Creating this rule and proving it red-then-green against the real edge is plan 07.5-10's job, not this runbook's — this document describes the mechanism the rule must implement.
   - Action: **Eligible for cache**.
   - **Respect origin Cache-Control** (Cloudflare "Use cache-control header" / honor `s-maxage`). Do NOT set a fixed Edge-TTL that overrides the origin — the origin already distinguishes 300 (menu) from 5 (availability).
   - Cache key: **host + path** (default). Each tenant subdomain is its own host, so each tenant's menu caches as a distinct entry — that is the intended per-tenant isolation. `cf-cache-status` (Cloudflare's own response header) is the signal that isolation is working — a bespoke application-level cache-status header existed for one phase and was removed once the zone cache became the real mechanism again; do not go looking for it.
2. **Origin Cache-Control is authoritative.** Confirm no Page Rule / Transform Rule strips or overrides `Cache-Control`/`ETag`/`Vary` on these paths.
3. **CORS headers are benign here.** Cross-origin API access reflects `Vary: Origin` + `Access-Control-Allow-Credentials: true`. The menu content is public (no per-user data), so it is safe to cache; `Vary: Origin` simply yields a per-origin entry.

**Open question (research assumption A9, MEDIUM, unexecuted by this runbook):** how the Cache Rule interacts with `Vary` and with `Set-Cookie` on `/v1/menu` has not been run against the real edge. The no-`Set-Cookie` regression test guards the origin's own contract, but whether Cloudflare's cache correctly treats a `Vary: Origin` response as cacheable per-origin (rather than refusing to cache it, or worse, serving one origin's cached body to another) is unproven here. Plan 07.5-10 closes A9 with a live two-tenant smoke against the real zone; do not treat this runbook's guidance as a substitute for that proof.

## Staging verification

1. **Cold → warm.** `curl -sD - https://<slug>.<apex>/v1/menu -o /dev/null` twice. First → `cf-cache-status: MISS` (or `EXPIRED`), second (within `s-maxage`) → `cf-cache-status: HIT`.
2. **Conditional 304.** Repeat with `-H 'If-None-Match: "<etag from the response>"'` → `304` empty body.
3. **Publish reflects within s-maxage.** Publish the menu (operator panel), then poll `/v1/menu` — after ≤300s the served `ETag` is the new `menuVersion` and the body reflects the change.
4. **Stop is near-instant + menu stays warm.** Stop an item, then: `/v1/menu/availability` reflects the new `stoppedItemIds` within ≤5s (its ETag changed), while `/v1/menu` keeps serving `cf-cache-status: HIT` with the **same** `ETag` (the menu document did not change).

## Guardrails (do not break edge caching)

- The public menu reads MUST stay **`Set-Cookie`-free** and MUST NOT gain `Cache-Control: private`/`no-store`. The e2e "public menu reads carry no Set-Cookie so an edge cache can store them" is the regression net — keep it green.
- Instant publish (CDN purge-on-publish) and edge composition (Workers) are out of scope for v1 — see the spec's "Out of scope / future".

## Known limitation: no location dimension in the cache key (Phase 08.4)

`/v1/menu/availability` is now backed by **per-location** stop-lists (Phase 08.4, D-02) — each kitchen/point-of-sale 86's its own items, resolved to a guest's **default location** (the tenant's earliest active location by `createdAt`) since guests have no location pin yet. The edge cache key is still **host + path** (unchanged, see above) — there is **no location dimension anywhere in the cache key**.

This is safe today only because Phase 08.4 defers guest-facing location selection (D-03): every tenant a guest can reach still resolves to a single default location, so `host + path` and `host + path + location` are equivalent in practice. The moment a tenant goes live with **2+ active locations**, this equivalence breaks — a cached `/v1/menu/availability` response computed for one location's stop-list can be served to a guest who should see a different location's availability, until the entry expires (`s-maxage=5`, so the blast radius per tenant is small, but non-zero and silently wrong).

**Not fixed in Phase 08.4** — the guest "pick a branch" UX is a later concern (D-03), and adding a location dimension to the cache key without a way for the guest to choose a location would be premature. Future fix options, once guest-facing location selection ships:

- A location URL segment or query param becomes part of the cache key (e.g. `/v1/menu/availability?location=<id>`), or
- `Vary` on a location-identifying header (CDN cache-by-header support varies; a Cloudflare Cache Rule change would be required).

Symptom to watch for post-launch: a customer-support report of "wrong items shown as available/unavailable" for a tenant with 2+ locations is very likely this gap, not a data bug.
