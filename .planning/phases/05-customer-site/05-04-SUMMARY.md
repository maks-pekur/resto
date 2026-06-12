# Plan 05-04 — Summary

**Plan:** 05-04 — Customer-site cart
**Status:** Complete
**Wave:** 4
**Requirements:** SITE-03, SITE-05

## What was built

- `store/cart.ts` — Zustand store, sessionStorage-persisted (`resto-cart`), ORD-03-compatible `CartLineItem` (snapshots `unitPrice`, `currency`, `modifiers`); `selectSubtotal` (decimal-safe minor-units math) + `selectItemCount`; `addItem`/`updateQuantity`/`removeItem`/`clearCart`/`setMode`.
- `hooks/use-cart-store.ts` — re-export wrapper + `useHasHydrated()` (hydration gate for the badge).
- `components/menu/delivery-pickup-banner.tsx` — sticky `top-16` mode banner (Tabs pills bound to store `mode`/`setMode`, accent selected state, address prompt on delivery).
- `components/menu/cart-line-item.tsx` — line row: −/+ quantity (44px targets), line total (`tabular-nums`), `×` remove with `aria-label="Remove {item} from cart"` + Sonner undo toast.
- `components/menu/cart-drawer.tsx` — right Sheet (400px / full-width mobile): scrollable line items, empty state, **non-functional promo** (`"Apply Code"` at `opacity-50`, disabled, helper copy), subtotal row + stub delivery, Clear-cart `AlertDialog`, "Go to checkout" → `/checkout`.
- Wiring (additive, no menu restructure): `ItemModal.onAddToCart` → `addItem` + "Added to cart" toast; `TenantHeader` badge reads `selectItemCount` gated by `useHasHydrated`; `MenuPageClient` mounts banner + drawer (drawer open controlled by header trigger).

## Verification

- `nx typecheck website` — pass
- `nx lint website` — pass
- `nx test website` — 37/37 pass (cart-store + middleware + api-client + menu-render)

## Deviations / notes

- **Execution recovery:** the executor agent truncated mid-task (store committed at `5ca8dde`; UI + wiring left partial/uncommitted). The orchestrator completed the cart drawer + wiring by hand. Single recovery commit `91590de`.
- **Type reconciliation:** the interrupted runs left two divergent `CartModifier`/`CartLineItem` definitions (`store/cart.ts` with `modifierGroupId`, deleted `store/cart-types.ts` with `amount`). Unified onto `store/cart.ts` as the single source — `CartModifier` now carries `optionId/name/priceDelta` required with `modifierGroupId?`/`amount?` optional (satisfies both the store test and the modal builder); `cart-types.ts` deleted; `item-modal.tsx` repointed to `@/store/cart`.
- Promo field non-functional (Phase 11); delivery line is a stub (Phase 9 zones / Phase 8 totals); cart-to-order conversion is Phase 7.

## Key files

- apps/website/store/cart.ts, hooks/use-cart-store.ts
- apps/website/components/menu/{cart-drawer,cart-line-item,delivery-pickup-banner}.tsx
