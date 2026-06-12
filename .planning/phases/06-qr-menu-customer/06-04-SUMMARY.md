# Plan 06-04 — Summary

**Plan:** 06-04 — qr-menu cart drawer + table binding + stop-list disabled + locale switcher
**Status:** Complete
**Wave:** 4
**Requirements:** QRM-06, QRM-07, QRM-08, QRM-09, QRM-10

## What was built

- **CartDrawer + CartLineItem (QRM-06/07):** `CartDrawer.tsx` — CSS slide-over (`position:fixed` + `translateX`, backdrop-click closes, no overlay lib), reads `items`/`selectSubtotal`/`clearCart`/`table` from `@resto/cart`; empty state + line list + footer (bound table value above running subtotal + clear-cart). `CartLineItem.tsx` — `lineTotal` via `parseMinorUnits`/`formatMinorUnits`, quantity −/+ via `updateQuantity`, remove via `removeItem`. `MenuView` mounts the drawer + a `cart-trigger` with a live `selectItemCount` badge; **App owns the open-state** (`useState`) threaded down as `cartOpen`/`onOpenCart`/`onCloseCart` (plan-03 stub removed).
- **Table binding (QRM-08):** `App.tsx` mount effect reads `?table=`, sanitizes (`sanitizeTable`: trim → cap 32 → null-if-empty), and calls `setTable`. `TableBanner.tsx` (mounted between header and categories) shows the current table + a change button, or a manual-entry form whose submit runs the same `sanitizeTable`. Table value rendered as React text only (T-06-08).
- **Stop-list disabled (QRM-09):** `MenuItemCard` gained `isStopListed?`; when set it guards the click (early return), sets `aria-disabled`, adds `menu-item--disabled` (opacity/pointer-events:none), and swaps the price line for an `item.unavailable` label. `MenuView` passes `isStopListed={item.isStopListed}`.
- **Locale switcher (QRM-10/D-05):** `detectLocale` now resolves **URL path `/(en|ru)` > `locale=` cookie > navigator > `en`** (only the URL+cookie checks prepended; the rest untouched). `LocaleSwitcher.tsx` toggles en/ru, writes the year-long cookie, calls `setLocale`, then `window.location.reload()` (module-level i18n state needs reload — RESEARCH A3). Mounted in the header.
- **i18n:** added `item.unavailable`, `item.qtyDecrease`, `item.qtyIncrease`, `item.remove`, `cart.{title,empty,subtotal,clear,close,table}`, `table.{current,change,prompt,confirm}`, `locale.label` to `en.json` + `ru.json`.
- **CSS:** added `.menu__actions`, `.cart-trigger__badge`, `.locale-switcher`/`.locale-btn`(`--active`), `.table-banner*`, `.menu-item--disabled`, `.menu-item__unavailable`, `.cart-drawer*`, `.cart-line-item*` (all `var(--resto-*)` tokens).

## Verification

- `nx typecheck qr-menu` — pass · `nx test qr-menu` — pass · `nx lint qr-menu` — pass · `nx build qr-menu` — pass (52 modules, single React in bundle)

## Deviations / notes

- **qr-menu bumped React 18.3.1 → 19 (deviation, not in declared file set).** Root cause surfaced when `MenuView` started calling a zustand hook (`useCartStore`) in-render: tests died with `Cannot read properties of null (reading 'useCallback')`. `@resto/cart` is shared between website (React 19) and qr-menu (React 18); pnpm's auto-install-peers resolved cart's React peer to **19.2.5** while qr-menu rendered with **18.3.1** — two React instances, null dispatcher. This also corrupts the **prod bundle** (zustand would pull a 2nd React chunk), so it's a real defect, not a test artifact. Fix: align qr-menu to the workspace's `react@^19` (`react`, `react-dom`, `@types/react`, `@types/react-dom`); after `pnpm install` both `apps/qr-menu/node_modules/react` and `packages/cart/node_modules/react` symlink to the same `react@19.2.5`. No qr-menu source needed changes (standard hooks + `createRoot`).
- **Added `resolve.dedupe: ['react','react-dom']` to `vite.config.ts` + `vitest.config.ts`** — defensive single-instance hygiene so a future React-version drift in any `@resto/*` consumer can't silently re-introduce the split. (`vite.config.ts` is also touched by plan 06-05 for `sourcemap`; no conflict.)
- Open-state lives in `App` (per plan Task 1) and is threaded to `MenuView`→`CartDrawer`; `menu-view.spec.tsx` updated via a `renderMenu` helper passing the new props.

## Key files

- apps/qr-menu/src/components/{CartDrawer,CartLineItem,TableBanner,LocaleSwitcher,MenuView,MenuItemCard}.tsx
- apps/qr-menu/src/App.tsx · apps/qr-menu/src/i18n/{index.ts,en.json,ru.json} · apps/qr-menu/src/styles.css
- apps/qr-menu/{package.json, vite.config.ts, vitest.config.ts} · apps/qr-menu/test/menu-view.spec.tsx
