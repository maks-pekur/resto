# SPA Workers — admin and qr-menu on Cloudflare

`apps/admin` and `apps/qr-menu` are Vite SPAs served by Cloudflare Workers with
Static Assets. Neither project has a Worker script — both are assets-only.
Under the single-apex scheme (`.planning/notes/url-scheme-single-apex.md`)
their hostnames are ordinary hostnames Caddy already serves, so there is
nothing for a Worker script to proxy.

## One zone, one apex

Every surface lives at depth ≤ 1 of a single zone (`<apex>`), which is what
the free Universal SSL certificate covers — SANs `DNS:<apex>, DNS:*.<apex>`,
measured live 2026-09-05 (`07.5-RESEARCH.md` M-03):

| Hostname            | Serves                                     |
| ------------------- | ------------------------------------------ |
| `<apex>`            | marketing landing (website, via Caddy)     |
| `<apex>/admin*`     | admin SPA (Worker Route → Static Assets)   |
| `<slug>.<apex>`     | tenant storefront (website, via Caddy)     |
| `<slug>.<apex>/qr*` | QR menu SPA (Worker Route → Static Assets) |
| `api.<apex>`        | API (Caddy → `api:3000`)                   |

## Why assets-only, not a Worker script

The two SPAs used to carry a Worker script that reverse-proxied `/v1/*` (and
`/api/*` for admin) to the API's own hostname, because under the three-apex
scheme the SPA hostnames (`<admin-apex>`, `*.<guest-apex>`) had no origin
behind them — same-origin API access required a proxy. Under one apex,
`<apex>/admin` and `<slug>.<apex>/qr` are paths on hostnames Caddy already
serves; the SPA's own `/v1/*` and `/api/*` calls simply miss the Worker Route
and fall through to Caddy. There is nothing left to proxy, so the Worker
scripts, their cross-origin cache options, their forwarded-host handling and
their 440 lines of tests were deleted rather than rewritten.

## Billing — why assets-only matters operationally

(`[CITED: developers.cloudflare.com/workers/static-assets/billing-and-limitations/]`)
Cloudflare documents that requests to static assets are free and unlimited,
while requests that reach a Worker's own script are billed under ordinary
Workers pricing — and for a free-tier project, a config option exists that
forces every matching request through the script regardless of asset
availability, falling back to a rate-limited response once the free-tier
request budget is exhausted rather than serving the asset.

Both Worker configs previously set that option on `/v1/*` (and `/api/*` for
admin), putting every JS/CSS asset of both SPAs behind the free tier's
100k/day request budget — a menu that goes white at a busy restaurant once
the budget is hit. Neither config declares a Worker script any more, so
every request to either SPA is a static-asset request: free and unlimited,
no such cliff to hit.

## The subdirectory trap (measured, not read from the docs)

(`[CITED: developers.cloudflare.com/workers/static-assets/routing/advanced/serving-a-subdirectory/]`,
requires Wrangler ≥ 3.98.0; this repo is on 4.129.0)

> "Assets defined for a Worker must be nested in a directory structure that
> mirrors the desired path. For example, to serve assets from
> `example.com/blog/*`, create a `blog` directory in your asset directory."

Measured under `wrangler 4.129.0 dev --local` (research M-09): the
single-page-application fallback serves `/index.html` at the asset **root**,
not the subdirectory's index. With assets nested under `dist/admin/` or
`dist/qr/` and nothing at `dist/index.html`, the SPA's own root loads
(`/admin/`, `/qr/`) but every deep link 404s — for `qr-menu` this means a
scanned sticker path (`/qr/t/<token>`) dies silently.

The fix, measured working: both `build` scripts run `vite build` and then
copy the subdirectory's `index.html` to the asset root —
`cp dist/admin/index.html dist/index.html` (admin),
`cp dist/qr/index.html dist/index.html` (qr-menu). Both `package.json` `build`
scripts and both Nx `project.json` `build` targets run the copy, so a build
triggered through either path produces the same two files.

## Target config shape

```jsonc
{
  "name": "resto-qr-menu",
  "compatibility_date": "2026-09-01",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application",
  },
}
```

Neither `wrangler.jsonc` declares a Worker script entry point, an assets
binding, the free-tier request-forcing option, `routes`, or `vars` — the apex
stays a deploy-time argument, enforced by `assert-no-domain-literals.sh`.

## Deploy invocations

```bash
# admin
wrangler deploy --routes "$PUBLIC_APEX_DOMAIN/admin*"

# qr-menu
wrangler deploy --routes "*.$PUBLIC_APEX_DOMAIN/qr*"
```

No origin variable to pass — there is no Worker script left to read one.
Route binding is proven against the real zone in plan 07.5-08, not by
`--dry-run` (`wrangler deploy --dry-run` never contacts Cloudflare and cannot
prove a route binds).

## Build-time env each bundle needs

| App     | Var                           | Notes                                                                           |
| ------- | ----------------------------- | ------------------------------------------------------------------------------- |
| admin   | `VITE_PUBLIC_APEX_DOMAIN`     | guest storefront apex for the onboarding preview — dev default `localhost:3002` |
| admin   | `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe Connect onboarding UI                                                    |
| qr-menu | `VITE_STRIPE_PUBLISHABLE_KEY` | guest checkout Payment Element                                                  |

Neither app reads a build-time API origin var. `/v1/*` calls are
root-absolute and same-origin; Caddy owns `/v1/*` (and `/api/*` for admin) on
the hostname the browser is actually on.

## DNS records the routes need

Cloudflare requires some DNS record to exist for a Worker Route to trigger,
even though a Worker Route with no script never contacts whatever IP the
record points at:

| Host       | Type | Target          | Proxied |
| ---------- | ---- | --------------- | ------- |
| `<apex>`   | A    | the VPS (Caddy) | Yes     |
| `*.<apex>` | A    | the VPS (Caddy) | Yes     |

Both records already exist for Caddy's own routing — no new record is created
for the Worker Routes; a Worker Route on an existing proxied hostname is
enough.

## The edge cache — the platform's default, not a Worker's

The qr-menu Worker used to hold a hand-rolled cache entry of its own, keyed
deliberately on the incoming request URL rather than the rewritten origin
URL, because the rewrite it performed (`<slug>.<apex>` → the API's own
hostname) would otherwise have collapsed every tenant's `/v1/menu` onto one
shared cache entry. With no rewrite, `<slug>.<apex>/v1/menu` is served
directly by Caddy and the Cloudflare **zone** cache keys on the full request
URL — which already carries the tenant in its host. The property the
Worker's own cache existed to guarantee is Cloudflare's default behaviour for
this request shape; there is no Worker-side cache left to test. The live
two-tenant body comparison in plans 07.5-08/07.5-10's smoke is the
replacement evidence, run against the real edge rather than a stubbed
`fetch`.

`cf-cache-status` — Cloudflare's own response header — is the cache signal to
read at the edge now; the Worker-produced cache-status header this system
used to set no longer exists, because there is no Worker producing it.
