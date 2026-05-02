# @resto/qr-menu

Customer-facing menu app loaded by scanning a QR code at the table.
Vite + React, no SSR — the bundle is meant to be tiny enough to render
LCP under 1.5s on a throttled 4G profile.

## Architecture

- **Routing.** No router dependency in the bundle. `window.location`
  drives a tiny client-side router (`/` for the full menu, `/items/:id`
  for the deep-linked detail view).
- **Tenant resolution.** In production the app is served from
  `<slug>.menu.resto.app` and the api answers same-origin — the
  fetcher uses a relative path. In development the api lives on
  `:3000` and the dev server on `:3003`; set `VITE_API_URL` and
  optionally `VITE_TENANT_SLUG` (overrides the host with an
  `X-Tenant-Slug` header).
- **i18n.** JSON resources for `en` and `ru` under `src/i18n/`.
  Locale auto-detected from `navigator.languages` with English
  fallback. `localized(text)` picks the best string from a
  `LocalizedText` map; `t(key, replacements)` for static copy.
- **Theming.** CSS variables on `:root` (`--resto-accent`,
  `--resto-bg`, etc.). Per-tenant overrides land when the api
  exposes tenant theme tokens — for MVP-1 the design is one
  consistent skin.

## Dev

```bash
# Run the api on :3000 with a tenant provisioned as `cafe-roma`
pnpm dev:up
pnpm --filter @resto/api exec tsx src/main.ts

# Run the qr-menu against it
VITE_API_URL=http://localhost:3000 VITE_TENANT_SLUG=cafe-roma \
  pnpm exec nx run qr-menu:serve
```

Open `http://localhost:3003/`.

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
