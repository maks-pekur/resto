# Plan 06-05 — Summary

**Plan:** 06-05 — qr-menu production build hardening (hidden source maps + bundle test + noindex)
**Status:** Complete
**Wave:** 5
**Requirements:** QRM-11, QRM-12 (+ D-06 noindex)

## What was built

- **Hidden source maps (QRM-11):** `vite.config.ts` `build.sourcemap` changed `true → 'hidden'`. `.map` files are still emitted (for the future Sentry upload) but no inline `//# sourceMappingURL=` comment ships in the JS. Verified on a real build: `.map` present, 0 `sourceMappingURL` in dist JS. No `.map`-stripping added (intentional — see deferral).
- **noindex shell (D-06):** added `<meta name="robots" content="noindex, nofollow" />` to `index.html` head so table-session URLs are never indexed (T-06-12).
- **Bundle test (QRM-12):** appended a third `it()` to `describe('qr-menu prod bundle')` asserting (a) `.map` files exist and (b) the concatenated dist JS contains no `sourceMappingURL`.

## Verification

- `nx test qr-menu` — 7/7 pass (4 menu-view + 3 bundle, incl. the new hidden-source-map assertion) · `nx typecheck qr-menu` — pass · `nx lint qr-menu` — pass

## Deviations / notes

- **The existing bundle-test harness never actually built (latent defect, now fixed).** `apps/qr-menu/package.json` had no `build` script, so the two pre-existing tree-shake tests' `execSync('pnpm --filter @resto/qr-menu build')` exited 0 as a **no-op** — they validated whatever stale `dist/` happened to exist (RESEARCH A4/Pitfall-6 wrongly assumed the execSync built). My QRM-12 test, which depends on a freshly-built dist, exposed this. Two fixes, both within scope (test file is in `files_modified`; the package.json build script is the enabling change):
  1. Added `"scripts": { "build": "vite build" }` to `apps/qr-menu/package.json` so `pnpm --filter @resto/qr-menu build` genuinely runs the production build.
  2. Added `NODE_ENV: 'production'` to the `execSync` env of **both** existing tree-shake builds. Without it the build inherits vitest's `NODE_ENV=test`, which Vite respects — so `import.meta.env.DEV` stays truthy, the `DEV ? VITE_TENANT_SLUG : undefined` guard is **not** dead-code-eliminated, and `x-tenant-slug` + the slug fixture **leak** into the bundle. This means the ADR-0020 I-3 cross-tenant safety guarantee was never actually enforced by these tests until now; they pass for real (a strict correctness win), not by luck on stale dist.
- The `react`-version-alignment + `resolve.dedupe` from plan 06-04 are unrelated to this wave; this wave only touched sourcemap/noindex/test.

## Deferred to Phase 7.5 (carry into 7.5 planning — apps/CLAUDE.md "Source maps + production hygiene" / "Public-facing apps must have a CSP")

Phase 6 owns only `sourcemap:'hidden'` + the bundle test. The deploy-time half of the apps/CLAUDE.md HARD rule is a **REQUIRED Phase 7.5 deliverable** (threat T-06-11):

1. **Strip `.map` files from the qr-menu deploy artifact** and **upload the hidden maps to Sentry** (or equivalent). Phase 6 deliberately KEEPS `.map` in `dist/` so the 7.5 upload has them — the residual "`.map` present in dist would be publicly fetchable if served as-is" risk is explicitly owned by 7.5.
2. **Block public `*.map` requests at the CDN/web-server edge** and **add a CSP** (`img-src` / `script-src 'self'` / `connect-src` allowlists) at the CDN/web-server layer.

## Key files

- apps/qr-menu/vite.config.ts · apps/qr-menu/index.html · apps/qr-menu/test/bundle-no-dev-leak.spec.ts · apps/qr-menu/package.json (build script)
