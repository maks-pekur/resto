# Running the customer surfaces by subdomain (dev)

website and qr-menu resolve the **brand** from their subdomain — the same way
they do in production. There is no `?tenant=` / `VITE_TENANT_SLUG` shortcut.

Use the `lvh.me` wildcard (`*.lvh.me` resolves to `127.0.0.1`, so no `/etc/hosts`
edits are needed):

| Surface | Open in the browser                                                              | How the brand reaches the api                                                                                                                      |
| ------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| website | `http://<brand-slug>.lvh.me:3002` (e.g. `http://cafe-demo.lvh.me:3002`)          | website is SSR; it forwards the incoming brand host to the api as `x-forwarded-host`. The api honors it because the dev `.env` sets `TRUST_PROXY`. |
| qr-menu | `http://<brand-slug>.menu.lvh.me:3003` (e.g. `http://dovezuka.menu.lvh.me:3003`) | qr-menu fetches the api same-origin; the Vite dev proxy forwards `/v1` to the api with `changeOrigin: false`, preserving the brand `Host`.         |

The api still accepts `x-tenant-slug` **only** on `/internal/v1/*` with a valid
`x-internal-token` — that is the seed-CLI path, unaffected by this change.

## Prereqs

- Dev stack up: `pnpm dev:up` (Postgres on the port from `.env`, Redis, NATS, …).
- api running on `:3000` (`pnpm exec nx serve api`).
- A brand whose `theme.primaryColor` is set (provision + publish a menu via the
  seed CLI / admin, then set the brand theme). The brand `slug` is the subdomain
  label you open.

## Production note

In production a gateway routes `*.domain/v1/*` and `/internal/*` to the api, so
both surfaces reach the api at their own brand host and the subdomain resolves
the brand with no forwarding for qr-menu and an `x-forwarded-host` hop for
website's SSR fetch.
