# @resto/qr-menu

Customer-facing menu app loaded by scanning a QR code at the table.
Vite + React, no SSR — the bundle is meant to be tiny enough to render
LCP under 1.5s on a throttled 4G profile.

## Architecture

- **Routing.** No router dependency in the bundle. `window.location`
  drives a tiny client-side router (`/` for the full menu, `/items/:id`
  for the deep-linked detail view).
- **Brand resolution.** The brand (and its tenant) is resolved from the
  subdomain. The app is served from `<brand-slug>.menu.<domain>` and
  fetches the api **same-origin** with a relative `/v1` path, so the api
  resolves the brand from the request `Host`. In dev the Vite server
  proxies `/v1` to the api on `:3000` with `changeOrigin: false`,
  preserving the brand `Host`. See `docs/dev-subdomains.md`.
- **i18n.** JSON resources for `en` and `ru` under `src/i18n/`.
  Locale auto-detected from `navigator.languages` with English
  fallback. `localized(text)` picks the best string from a
  `LocalizedText` map; `t(key, replacements)` for static copy.
- **Theming.** Base tokens come from `@resto/config-tailwind`
  (`tokens.css`: `--primary`, `--background`, `--radius`, …). A tenant's
  `brand.theme.primaryColor` overrides `--primary` at runtime via
  `buildTenantThemeVars` after the menu loads.

## Dev

```bash
pnpm dev:up                          # infra (Postgres/Redis/NATS/…)
pnpm exec nx serve api               # api on :3000
pnpm exec nx run qr-menu:serve       # qr-menu on :3003
```

Open `http://<brand-slug>.menu.lvh.me:3003/` (e.g.
`http://dovezuka.menu.lvh.me:3003/`) — `*.lvh.me` resolves to 127.0.0.1,
and the brand resolves from the subdomain. See `docs/dev-subdomains.md`.

## Build

```bash
pnpm exec nx run qr-menu:build
```

The output lands in `dist/` and is meant to be served behind a CDN
that maps `<slug>.menu.resto.app` to the same bucket.

## Performance budget

- **Critical-path JS:** < 100 KB gzipped (manual-chunk split keeps
  React in its own chunk).
- **LCP target:** < 1.5s on a throttled 4G profile (320 Kbps, 400ms
  RTT, 4× CPU slowdown).
- **Bundle analyzer + Lighthouse CI** are deferred — RES-82 PR ships
  the runtime; budget enforcement lands when CI is wired.

## Acceptance status

- [x] Subdomain routing + `/v1/menu` fetch
- [x] Menu list / item detail / not-found views
- [x] i18n scaffold (en + ru)
- [x] Lazy-loaded images, CSS-variable theming hooks
- [ ] Service worker (stale-while-revalidate) — deferred
- [ ] Lighthouse score targets — deferred (manual)
- [ ] Playwright e2e — deferred (needs api running in CI)
- [ ] Bundle analyzer in CI — deferred
