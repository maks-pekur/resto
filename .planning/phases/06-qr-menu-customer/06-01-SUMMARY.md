# Plan 06-01 — Summary

**Plan:** 06-01 — Shared `@resto/cart` package + website re-point
**Status:** Complete
**Wave:** 1
**Requirements:** QRM-05, QRM-06, QRM-07, QRM-08 (foundation — consumed by Wave 3/4)

## What was built

- **New `@resto/cart` package** (`packages/cart/`): `package.json` (private, type:module, exports→src/index.ts, peer `react ^18||^19`, dep `zustand ^5.0.14`), `tsconfig.json` (extends `@resto/config-typescript/react.json`), `project.json` (Nx lint+typecheck), `eslint.config.mjs` (node config — added beyond the plan's file list; the project.json lint target needs a config, and `packages/ui` has none).
- `packages/cart/src/cart.ts`: the website cart store moved verbatim, plus **`table: string|null` + `setTable`** (D-03/QRM-08), and `parseMinorUnits`/`formatMinorUnits` promoted to exports (qr-menu live-price reuse). persist config unchanged (`resto-cart`, sessionStorage, no partialize).
- `packages/cart/src/index.ts`: barrel re-export of the public surface.
- **Website re-pointed:** all 8 `@/store/cart` / `../store/cart` import sites grep-discovered and re-pointed to `@resto/cart`; `apps/website/store/cart.ts` deleted; `apps/website/package.json` depends on `@resto/cart` workspace:\*.

## Verification

- `nx typecheck cart` — pass · `nx lint cart` — pass
- `nx typecheck website` — pass · `nx lint website` — pass
- `nx test website` — 47/47 pass (behavior identical after re-point)

## Deviations / notes

- Added `packages/cart/eslint.config.mjs` (mirrors `packages/api-client`) — not in the plan's `files_modified` but required because the project.json lint target runs `eslint .` and there is no inherited package config.
- Initial `pnpm --filter website add` did not link `@resto/cart`'s own `zustand` dep into `packages/cart/node_modules` (pnpm strict) — a full root `pnpm install` fixed cart typecheck + website vitest resolution.
- The sed re-point initially mis-split on a `for` loop; redone with an IFS-safe `while read` (0 residual `store/cart` refs).

## Key files

- packages/cart/{package.json,tsconfig.json,project.json,eslint.config.mjs,src/cart.ts,src/index.ts}
- apps/website (8 import sites re-pointed; store/cart.ts deleted)
