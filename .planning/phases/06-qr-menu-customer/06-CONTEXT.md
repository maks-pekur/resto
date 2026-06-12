# Phase 6: QR-Menu Customer - Context

**Gathered:** 2026-06-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn the existing display-only `apps/qr-menu` (Vite + React SPA) into a real in-venue ordering UI over the working `/v1/menu`: branded header, categories/items/photos/prices, item detail with modifier selection + live price, cart with running subtotal + quantity/remove, table binding from the `?table=` QR param (manual fallback), stop-listed items visibly disabled, multi-language switcher, hidden production source maps + a bundle test. The surface is `noindex`.

Requirements: QRM-01..QRM-12.

**Not this phase:** real order submission / order aggregate (Phase 7), payments (Phase 8), AI guest chat (MVP-2 — reuses this surface later). No menu-management (that's admin/catalog, done).
</domain>

<decisions>
## Implementation Decisions

### Stack

- **D-01:** `apps/qr-menu` stays **Vite + React** (QRM-11 mandates a Vite build with hidden source maps). Phase 6 builds out the existing display-only app — not a rewrite, not a migration to Next.

### Code reuse / shared layer

- **D-02:** Extract the Zustand cart store + `CartLineItem`/`CartModifier` types from `apps/website/store/cart.ts` into a new shared package **`@resto/cart`**; BOTH `apps/website` and `apps/qr-menu` consume it (single ORD-03-compatible cart shape — the seam Phase 7 ordering reads). Re-point `apps/website`'s store imports to `@resto/cart` (small refactor of Phase-5 code; keep behavior identical). **UI components are NOT shared** — website is Next + shadcn, qr-menu is Vite with its own styling; cross-framework component sharing isn't worth it. `@resto/api-client` menu-types (already shared) remain the wire-type source.

### Table binding (QRM-08)

- **D-03:** Add `table: string | null` + `setTable` to the shared `@resto/cart` store. qr-menu reads `?table=` on mount → `setTable`; a manual table-entry UI is the fallback when the param is absent. `apps/website` ignores the field (delivery/pickup). Phase 7 reads `cart.table` at order creation. Forward-compatible, no Phase-7 refactor.

### UI approach

- **D-04:** **Extend** the existing qr-menu components (`MenuView`, `MenuItemCard`, `ItemDetail`) — add modifier selection + live price + add-to-cart + a cart drawer + table UI + stop-list disabled state — rather than rebuild. Keep qr-menu's own lightweight Vite styling (`styles.css`); do NOT pull shadcn/Next-isms into the Vite app. Visual divergence from the website storefront is acceptable (different surfaces: in-venue table ordering vs web delivery storefront).

### i18n

- **D-05:** Default locale **`en`** (aligns with website D-05). Keep qr-menu's existing i18n (ru/en) + the resolution chain URL > cookie > Accept-Language (QRM-10).

### SEO / build hardening

- **D-06:** qr-menu is **`noindex`** (table-session URLs must never be indexed — carried from Phase 5 D-03). QRM-11: production Vite build emits source maps as `'hidden'` (not `true`). QRM-12: a bundle test asserts source maps are not publicly served.

### Claude's Discretion

- Exact `@resto/cart` package shape (tsconfig/exports), how the cart drawer is presented in the Vite app, modifier-selection widget details, table-entry UX — implementation details for research/planning.
  </decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements

- `.planning/ROADMAP.md` — "### Phase 6: QR-Menu Customer" detail block + Phase 5/6 surface-ordering rationale
- `.planning/REQUIREMENTS.md` — QRM-01..QRM-12 (note: the traceability table labels QRM as "Phase 5" — stale; ROADMAP Phase 6 is authoritative)
- `.planning/notes/ai-driven-pivot.md` — qr-menu is the in-venue surface; AI guest chat (MVP-2) embeds on it later

### Phase 5 carry-over (patterns + the shared seam)

- `apps/website/store/cart.ts` — the Zustand cart store to EXTRACT into `@resto/cart` (ORD-03 shape, sessionStorage persist, `selectSubtotal`/`selectItemCount`)
- `.planning/phases/05-customer-site/05-CONTEXT.md` + `05-UI-SPEC.md` — cart/modal/menu UX patterns + the qr-menu noindex decision (D-03) to mirror
- `packages/api-client/src/menu-types.ts` + `packages/api-client/src/public.ts` — shared `MenuDto` wire types

### Existing qr-menu + API

- `apps/qr-menu/src/` (`api/client.ts` = `VITE_TENANT_SLUG` → `X-Tenant-Slug`; `api/types.ts`; `components/MenuView.tsx`, `MenuItemCard.tsx`, `ItemDetail.tsx`; `i18n/`) — the app being built out
- `apps/qr-menu/vite.config.ts` — where the `build.sourcemap: 'hidden'` change lands (QRM-11)
- `apps/api/src/contexts/catalog/interfaces/http/public-menu.controller.ts` — `/v1/menu` contract incl. stop-list (QRM-09)
  </canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `apps/website/store/cart.ts`: the cart store to extract to `@resto/cart` — already ORD-03-shaped; add `table`/`setTable` for QRM-08.
- `apps/qr-menu/src/components/{MenuView,MenuItemCard,ItemDetail}.tsx`: existing display-only components to extend (cart/modifiers/table).
- `apps/qr-menu/src/api/client.ts` + `types.ts`: working `/v1/menu` fetch + tenant header — already present; reconcile types with `@resto/api-client/public` where sensible.
- `packages/api-client/src/menu-types.ts`: shared wire types (MenuDto etc.).

### Established Patterns

- Tenant resolution for qr-menu: `VITE_TENANT_SLUG` → `X-Tenant-Slug` header (same contract the website middleware uses).
- Cart math: decimal-safe minor-units (`selectSubtotal` in the store) — reuse via `@resto/cart`.
- Apps import only from `@resto/*` — so the shared cart MUST live in a package (`@resto/cart`), not be imported app-to-app.

### Integration Points

- `/v1/menu` (public-menu.controller) — primary read; includes stop-list for QRM-09 (disabled items) and modifier groups for QRM-03/04.
- `@resto/cart` store — new shared seam consumed by website (re-point) + qr-menu; Phase 7 ordering reads its shape + `table`.
- Vite build config — `sourcemap: 'hidden'` (QRM-11) + a bundle test (QRM-12).
  </code_context>

<specifics>
## Specific Ideas

- qr-menu keeps its own lean Vite styling; no shadcn/Next coupling (D-04).
- Table binding via `?table=` with manual fallback, stored on the shared cart (D-03).
  </specifics>

<deferred>
## Deferred Ideas

- Real order submission / order aggregate / state machine → Phase 7.
- Payments → Phase 8.
- AI guest chat widget on qr-menu → MVP-2 Phase C.
- Full @resto/ui component library (cross-framework shared UI) — not pursued; only the cart store + api-client types are shared. Revisit only if a third React surface appears.

### Reviewed Todos (not folded)

None — discussion stayed within phase scope.
</deferred>

---

_Phase: 6-qr-menu-customer_
_Context gathered: 2026-06-12_
