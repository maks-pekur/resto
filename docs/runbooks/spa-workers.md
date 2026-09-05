# SPA Workers — admin and qr-menu on Cloudflare

`apps/admin` and `apps/qr-menu` are Vite SPAs served by Cloudflare Workers with
Static Assets, each bundling its own same-origin `/v1/*` (`/api/*` too, for
admin) proxy to the API. Neither Worker's own source or config names a
hostname — every apex is supplied at deploy time.

## Why Workers, not classic Pages

Classic Cloudflare Pages custom domains do not support wildcard subdomains,
and never have. The app already requires wildcard per-tenant hosts for both
surfaces (`<slug>.<admin-apex>`, `<slug>.<guest-apex>`) — a Pages project
would work for the apex/demo case and hard-block the moment a second tenant
needs its own subdomain. Cloudflare Workers with Static Assets serve the
identical SPA bundle and additionally let the same Worker script implement
the same-origin proxy, which Pages cannot do at all.

## The three-apex map

Cloudflare's free Universal SSL covers a zone's root domain and its
first-level subdomains only, not deeper subdomains
(`[CITED: developers.cloudflare.com/ssl/edge-certificates/universal-ssl/limitations/]`).
A `<slug>.menu.<apex>`-shaped host sits at depth 2 under a single apex and
would fail the TLS handshake. The fix is three apexes, one per surface
family, so every host is at depth ≤ 1 of its own zone:

| Env parameter        | Hostnames                          | Serves                      |
| -------------------- | ---------------------------------- | --------------------------- |
| `PUBLIC_APEX_DOMAIN` | `<apex>`, `*.<apex>`, `api.<apex>` | website + API (Caddy → VPS) |
| `ADMIN_APEX_DOMAIN`  | `<admin-apex>`, `*.<admin-apex>`   | admin Worker                |
| `GUEST_APEX_DOMAIN`  | `*.<guest-apex>`                   | qr-menu Worker              |

`GUEST_APEX_DOMAIN` is also `apps/api`'s own env var (`env.schema.ts`) — the
resolver's guest branch (`tenant-resolver.service.ts`) matches
`<slug>.<GUEST_APEX_DOMAIN>` exactly, the same way the website branch matches
`<slug>.<PUBLIC_APEX_DOMAIN>`. Neither branch is a shape test any more: under
this map both hosts have the identical shape `<slug>.<apex>`, so what
separates them is only which configured apex the remainder equals.
`<slug>.<ADMIN_APEX_DOMAIN>` is not a value either branch's apex can equal
(a different zone), so it falls through both and resolves to no tenant.

## Deploy invocations

Neither `wrangler.jsonc` carries `routes` or `vars` — those are the two
fields that would otherwise bake an apex into committed config. They are
supplied on the CLI at deploy time; each Worker's routes now live on a single
zone, so no invocation needs a per-route `zone_name`.

```bash
# qr-menu
wrangler deploy --var API_ORIGIN:"https://api.$PUBLIC_APEX_DOMAIN" \
  --routes "*.$GUEST_APEX_DOMAIN/*"

# admin
wrangler deploy --var API_ORIGIN:"https://api.$PUBLIC_APEX_DOMAIN" \
  --routes "$ADMIN_APEX_DOMAIN/*" \
  --routes "*.$ADMIN_APEX_DOMAIN/*"
```

`--routes`/`--route` and `--var` are both present in `wrangler@4.129.0`
(confirmed via `wrangler deploy --help`), so the direct-CLI-flags path is the
one this phase uses — no rendered-`wrangler.generated.jsonc`/`envsubst`
fallback was needed. Plans 08 and 09 invoke the commands above verbatim.

Each app also has a `worker:dry-run` script (`vite build && wrangler deploy
--dry-run` with the flags above) confirmed to succeed with all three apexes
supplied from the environment. **`--dry-run` needs no Cloudflare credentials
and therefore validates only that the invocation parses and the bundle
builds — it does not contact Cloudflare and cannot prove a route binds or
that a wildcard pattern is accepted for the zone.** Route binding is proven
for the first time in plan 08 Task 3, against the real zones.

## Build-time env each bundle needs

| App     | Var                           | Notes                                                                           |
| ------- | ----------------------------- | ------------------------------------------------------------------------------- |
| admin   | `VITE_PUBLIC_APEX_DOMAIN`     | guest storefront apex for the onboarding preview — dev default `localhost:3002` |
| admin   | `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe Connect onboarding UI                                                    |
| qr-menu | `VITE_STRIPE_PUBLISHABLE_KEY` | guest checkout Payment Element                                                  |

Neither app reads `VITE_API_ORIGIN` — it was deleted in phase 10.2 (D-39)
because admin talking cross-origin loses the session cookie. Both apps talk
to the API same-origin, through their own Worker's proxy.

## DNS records the routes need

One proxied record per Worker-bound wildcard host — Cloudflare requires some
DNS record to exist for a Worker Route to trigger, even though the Worker
never contacts whatever IP the record points at. Plan 08 creates these on the
real zones:

| Host             | Type | Target              | Proxied |
| ---------------- | ---- | ------------------- | ------- |
| `<admin-apex>`   | A    | dummy (`192.0.2.1`) | Yes     |
| `*.<admin-apex>` | A    | dummy               | Yes     |
| `*.<guest-apex>` | A    | dummy               | Yes     |

## Cache-key rule

The qr-menu Worker's cache key is built from the **incoming** request URL,
never the rewritten origin URL — `apps/qr-menu/test/worker.spec.ts` (`keys
the cache on the incoming request URL, not the rewritten origin URL`, and the
cross-tenant isolation test) is the test that enforces it. Keying on the
rewritten URL collapses every tenant's `/v1/menu` request onto one cache
entry.

## The `X-Resto-Cache` contract

Both Workers set `X-Resto-Cache` on every response they return from a
proxied path — a Worker serving from `caches.default` does not produce
Cloudflare's own `cf-cache-status` header, so this is the signal a live smoke
can assert instead of guessing:

- qr-menu: `MISS` (first request), `HIT` (served from the Worker cache),
  `BYPASS` (any non-cacheable `/v1/` path — mutating routes, `Set-Cookie`
  responses, non-`ok` responses).
- admin: always `BYPASS` — the admin Worker never touches the Cache API at
  all; every proxied response is `BYPASS` by construction.

## The zone cache — Workers replace it, they do not sit beside it

Every subrequest either Worker issues to `api.<PUBLIC_APEX_DOMAIN>` carries
`cf: { cacheTtl: 0, cacheEverything: false }` — asserted on the recorded
`fetch` call in both Worker test suites. That subrequest is tenant-blind (the
URL is identical for every tenant); if the `api.<apex>` zone ever cached it
via a Cache Rule, "Cache Everything", or the CDN cache-rules D-08 originally
contemplated, tenant B's Worker would receive tenant A's menu before its own
correctly-keyed cache entry is ever consulted. **These Workers' own
tenant-keyed cache replaces the CDN cache rules D-08 contemplated for
`/v1/menu*` — the zone must not cache `api.<apex>/v1/*` at all.** Plan 08's
Cloudflare runbook sets a Bypass rule on that path as a second, independent
layer (belt-and-braces): the `cf` opt-out on the subrequest is the primary
guarantee and does not depend on the Bypass rule also being correctly
configured.
