# Plan 05-03 — Summary

**Plan:** 05-03 — Customer-site menu render
**Status:** Complete
**Wave:** 3
**Requirements:** SITE-02

## What was built

Public menu rendering for `apps/website` over the server-only `/v1/menu` client from 05-02:

- `app/page.tsx` — RSC menu page: resolves tenant from headers, `fetchMenuPublic(slug)`, passes `MenuDto` to `MenuPageClient`; `generateMetadata` with `index: true` (D-03 SEO).
- `app/not-found.tsx` — tenant-not-found (404) state per UI-SPEC copy.
- `app/error.tsx` — error boundary ("Something went wrong" + refresh path); suspended tenant (403 → `TenantSuspendedError`) renders the "temporarily unavailable" state.
- `components/layout/tenant-header.tsx` — sticky header (brand name/logo + cart badge stub reading a selector; wired to the store in 05-04).
- `components/menu/menu-page-client.tsx` — client island: category anchors + menu-item grid (the primary visual focal point) + modal orchestration.
- `components/menu/menu-item-card.tsx` — item card; `isUnavailable` optional prop (stop-listed items visibly disabled).
- `components/menu/item-modal.tsx` — item detail dialog with modifier selection; **`onAddToCart` prop typed `(lineItem: Omit<CartLineItem, "quantity">) => void`** (contract locked for 05-04; currently a no-op stub).
- `components/menu/category-nav.tsx` — sticky category navigation.
- `store/cart-types.ts` — `CartLineItem` / `CartModifier` shape (consumed by the modal contract; the store itself is built in 05-04).
- shadcn primitives added: badge, button, dialog, scroll-area, separator, skeleton.
- `test/menu-render.spec.tsx` — render + modal-open tests.

## Verification

- `nx typecheck website` — pass
- `nx lint website` — pass
- `nx test website` — 23/23 pass (middleware + api-client + menu-render)

## Deviations / notes

- **Execution recovery:** the first two executor runs truncated mid-task (no completion marker / commit). Work was completed and committed by the orchestrator after the second run left the implementation typecheck-clean; two trailing lint nits in the test file (a disable comment referencing an unloaded `@next/next/no-img-element` rule, and a non-null assertion) were fixed before commit. Single recovery commit `c46fc0d` rather than per-task atomic commits.
- `onAddToCart` is a no-op stub; 05-04 wires it to the Zustand store additively (contract preserved).

## Key files created

- apps/website/app/page.tsx, error.tsx, not-found.tsx
- apps/website/components/menu/{menu-page-client,menu-item-card,item-modal,category-nav}.tsx
- apps/website/components/layout/tenant-header.tsx
- apps/website/store/cart-types.ts
