# Plan 06-03 — Summary

**Plan:** 06-03 — qr-menu: shared wire types + branded header + ItemDetail ordering surface
**Status:** Complete
**Wave:** 3
**Requirements:** QRM-01, QRM-02, QRM-03, QRM-04, QRM-05

## What was built

- **Shared wire types (QRM-02 carry-over):** deleted `apps/qr-menu/src/api/types.ts`; re-pointed all 6 import sites (`api/client.ts`, `App.tsx`, `MenuView.tsx`, `MenuItemCard.tsx`, `ItemDetail.tsx`, `test/menu-view.spec.tsx`) to `@resto/api-client/public`. `api/client.ts` tenant-header logic untouched. qr-menu now depends on `@resto/api-client` + `@resto/cart` (workspace:\*). Zero residual `api/types` refs.
- **QRM-02 render now verified, not assumed:** `menu-view.spec.tsx` re-pointed; Margherita fixture given a non-null `imageUrl` + `isStopListed: false`; a new test asserts the card renders its price (`12.50`) and its `<img.menu-item__image>` src — proving the display path survived the type-swap. Existing category/item-name/empty-state/onSelectItem assertions kept.
- **Branded header (QRM-01):** `MenuView` renders `<header className="menu__header">` with the brand logo (when `brand.theme.logoUrl` present) + `brand.displayName` (falls back to `t('menu.title')` when no brand), plus a `.cart-trigger` button. `App.tsx` injects `brand.theme.primaryColor` into `--resto-accent` via a `state`-keyed `useEffect`. All brand/menu text rendered as React children (auto-escaped) — no innerHTML (T-06-05).
- **ItemDetail ordering surface (QRM-03/04/05):** `App.tsx` pre-resolves `groups = menu.modifierGroups.filter(g => item.modifierGroupIds.includes(g.id))` (Pitfall-4 stale-id guard) and passes them in. `ItemDetail` gained `groups` prop, size radios, modifier groups (radio when `min===1 && max===1 && isRequired`, else checkbox), a `useMemo` live price via `@resto/cart` `parseMinorUnits`/`formatMinorUnits` (decimal-safe, no `parseFloat`), and `handleAddToCart` → `useCartStore.getState().addItem({...})` then `onBack()`. Description/allergens/photo render preserved.
- **i18n:** added `item.addToCart` + `cart.open` to `en.json` and `ru.json`.
- **CSS:** added `.menu__header`, `.menu__brand`, `.menu__logo`, `.cart-trigger`, `.item-modifiers`, `.item-modifier-group`, `.item-modifier-option`, `.item-live-price`, `.item-add-btn` to `styles.css` using `var(--resto-*)` tokens only (no hardcoded hex).

## Verification

- `nx typecheck qr-menu` — pass · `nx test qr-menu` — pass (6 tests, incl. new price+photo render) · `nx lint qr-menu` — pass
- `nx typecheck cart` / `nx lint cart` — pass · `nx test website` — 6/6 pass (shared-helper change is backward-compatible)

## Deviations / notes

- **Cart-trigger is wired to a stub pending plan 04.** `App.tsx` `onOpenCart` flips a local `setCartOpen(true)` (value intentionally unbound via `const [, setCartOpen]`); the actual drawer + open-state consumption lands in plan 04.
- **Fixed a latent correctness bug in `@resto/cart` `parseMinorUnits`** (not in this plan's declared file set — deviation). The original attached the sign only to the whole part, so `"-1.50"` parsed to `-50` minor units instead of `-150`. The plan states `priceDelta` can be negative and mandates `parseMinorUnits` over `parseFloat`, so following it literally would have mis-priced negative modifiers; the same bug also silently corrupted `selectSubtotal` for any negative modifier already in the cart. Fix: strip+reapply the sign around the existing whole/frac math. `formatMinorUnits` left unchanged — every call site formats a non-negative running total, so its (separate) negative-input quirk is unreachable.
- The qr-menu i18n `localized()` takes no locale arg (active-locale module state), unlike the website's `localized(text, locale)` — ItemDetail uses the qr-menu form.

## Key files

- apps/qr-menu/package.json · apps/qr-menu/src/{App.tsx, api/client.ts, components/{MenuView,ItemDetail}.tsx, i18n/{en,ru}.json, styles.css}
- apps/qr-menu/src/api/types.ts (deleted) · apps/qr-menu/test/menu-view.spec.tsx
- packages/cart/src/cart.ts (parseMinorUnits sign fix)
