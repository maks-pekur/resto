# Phase 6: QR-Menu Customer - Research

**Researched:** 2026-06-12
**Domain:** Vite + React SPA extension, shared Zustand package, public menu API extension, in-venue ordering UI
**Confidence:** HIGH

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `apps/qr-menu` stays Vite + React (QRM-11 mandates Vite build with hidden source maps). Build out the existing display-only app — not a rewrite, not a migration to Next.
- **D-02:** Extract Zustand cart store + `CartLineItem`/`CartModifier` from `apps/website/store/cart.ts` into a new shared package `@resto/cart`; both `apps/website` and `apps/qr-menu` consume it. Re-point website imports to `@resto/cart` (keep behavior identical). UI components NOT shared.
- **D-03:** Add `table: string | null` + `setTable` to the shared `@resto/cart` store. qr-menu reads `?table=` on mount → `setTable`; manual fallback when param absent. `apps/website` ignores `table` field.
- **D-04:** Extend existing qr-menu components (`MenuView`, `MenuItemCard`, `ItemDetail`). Keep qr-menu's own lean Vite styling (`styles.css`). No shadcn, no Next-isms in the Vite app.
- **D-05:** Default locale `en`. Keep qr-menu's existing i18n (ru/en) with URL > cookie > Accept-Language resolution chain.
- **D-06:** qr-menu is `noindex`. Production Vite build uses `sourcemap: 'hidden'`. Bundle test asserts source maps not publicly served.

### Claude's Discretion

- Exact `@resto/cart` package shape (tsconfig/exports), how the cart drawer is presented in the Vite app, modifier-selection widget details, table-entry UX.

### Deferred Ideas (OUT OF SCOPE)

- Real order submission / order aggregate / state machine → Phase 7.
- Payments → Phase 8.
- AI guest chat widget on qr-menu → MVP-2 Phase C.
- Full `@resto/ui` component library (cross-framework shared UI) — not pursued.
  </user_constraints>

<phase_requirements>

## Phase Requirements

| ID     | Description                                                              | Research Support                                                                                                               |
| ------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| QRM-01 | Guest sees branded restaurant header (logo, accent color, location name) | `menu.brand` on `MenuDto` has `theme.logoUrl`, `theme.primaryColor`, `brand.displayName` — inject as CSS vars                  |
| QRM-02 | Guest sees categories with items, photos, prices                         | `MenuView`+`MenuItemCard` already render this display-only; extend to show `isStopListed` state                                |
| QRM-03 | Guest opens item detail — description/allergens/photo/modifier groups    | `ItemDetail` renders basic fields; needs modifier group rendering from `MenuDto.modifierGroups` via `item.modifierGroupIds`    |
| QRM-04 | Guest selects modifiers; price updates live                              | Modifier selection + live price computation in `ItemDetail`; price delta strings already on `MenuModifierOptionDto.priceDelta` |
| QRM-05 | Guest adds item to cart                                                  | `addItem` action from `@resto/cart`; call after modifier selection in `ItemDetail`                                             |
| QRM-06 | Guest sees cart with running subtotal                                    | Cart drawer component + `selectSubtotal` from `@resto/cart`                                                                    |
| QRM-07 | Guest adjusts quantity / removes items                                   | `updateQuantity` + `removeItem` actions from `@resto/cart`                                                                     |
| QRM-08 | Guest specifies table number (auto-bound from `?table=` or manual entry) | `setTable` on `@resto/cart`; URLSearchParams on mount; manual fallback UI                                                      |
| QRM-09 | Stop-listed items appear visibly disabled                                | **BLOCKER: API currently filters stop-listed items out entirely** — needs backend `isStopListed: true` field on `MenuItemDto`  |
| QRM-10 | Multi-language switcher (URL > cookie > Accept-Language)                 | Extend existing `i18n/index.ts`; add locale switcher UI + URL/cookie read on mount                                             |
| QRM-11 | Vite build emits source maps as `'hidden'`                               | Change `vite.config.ts` `build.sourcemap` from `true` to `'hidden'`                                                            |
| QRM-12 | Bundle test asserts source maps not publicly served                      | Extend existing `bundle-no-dev-leak.spec.ts` — verify no `.map` file in `dist/assets/`                                         |

</phase_requirements>

---

## Summary

Phase 6 extends the existing display-only `apps/qr-menu` (Vite + React SPA) into a full in-venue ordering surface. The app already has a working `/v1/menu` fetch, basic component structure, i18n, and a bundle test harness. The extension work falls into four groups: (1) create `@resto/cart` shared package and re-point website; (2) add cart UI (drawer, modifier selection, live price, quantity controls) to qr-menu; (3) add table binding and locale switcher; (4) harden the build (source maps + bundle test extension).

The single most important discovery is that **QRM-09 (stop-listed items visibly disabled) requires a backend change**. The current `/v1/menu` implementation in `GetPublishedMenuService` → `catalog-drizzle.repository.ts:loadPublishedMenu` **filters out** stop-listed items before building the DTO — they do not appear in the response at all. Phase 5 (`apps/website`) shipped `MenuItemCard` with an `unavailable` prop but never passes it because the data does not exist. To show items as "disabled" in qr-menu, the backend must include stopped items with an `isStopListed: true` field on `MenuItemDto`, and the qr-menu front-end renders them disabled. This requires a coordinated backend + frontend change as a single plan.

The `@resto/cart` package follows the exact pattern of `@resto/ui` and `@resto/api-client`: `package.json` (private, `type: module`, `main`/`types`/`exports` pointing to `src/index.ts`), `tsconfig.json` extending `@resto/config-typescript/react.json`, `project.json` with Nx `lint`/`typecheck` targets, and a `peerDependencies` declaration for React. The website's `store/cart.ts` moves verbatim into the package with one addition: `table: string | null` and `setTable`. The import sites in `apps/website` that currently reference `@/store/cart` are re-pointed to `@resto/cart` (discover all at execution time via grep — do not hard-code the count).

**Primary recommendation:** Plan five waves — (1) `@resto/cart` package creation + website re-point, (2) backend `isStopListed` extension + `@resto/api-client` regen, (3) qr-menu cart UI + modifier selection, (4) table binding + locale switcher, (5) source map hardening + bundle test extension.

---

## Architectural Responsibility Map

| Capability                           | Primary Tier     | Secondary Tier | Rationale                                                                     |
| ------------------------------------ | ---------------- | -------------- | ----------------------------------------------------------------------------- |
| Cart state (items, modifiers, table) | Browser / Client | —              | Anonymous, session-scoped; no auth; sessionStorage persist in `@resto/cart`   |
| Menu data fetch                      | Browser / Client | API / Backend  | Vite SPA fetches `/v1/menu` on mount; API is source of truth                  |
| Stop-list flag in menu response      | API / Backend    | —              | Repository must include `isStopListed` on items instead of filtering them out |
| Table binding                        | Browser / Client | —              | URLSearchParams read on mount; `@resto/cart` `table` field holds value        |
| Locale resolution                    | Browser / Client | —              | URL > cookie > `navigator.language`; no SSR in Vite SPA                       |
| Source map emission                  | CDN / Static     | —              | Vite build config; hidden maps served only to error monitoring tools          |
| Tenant resolution                    | API / Backend    | —              | Host-based; qr-menu inherits same `X-Tenant-Slug` header contract             |

---

## Standard Stack

### Core

| Library           | Version   | Purpose      | Why Standard                                                                                  |
| ----------------- | --------- | ------------ | --------------------------------------------------------------------------------------------- |
| zustand           | `^5.0.14` | Cart store   | Already used in `apps/website`; `@resto/cart` adds `table` field; version locked in pnpm-lock |
| vite              | `^5.4.11` | Build tool   | Locked by D-01; existing `apps/qr-menu` build target                                          |
| react / react-dom | `^18.3.1` | UI framework | Locked; existing qr-menu uses React 18                                                        |

**Note on React versions:** `apps/website` uses React 19 (`^19.0.0`), `apps/qr-menu` uses React 18 (`^18.3.1`). The `@resto/cart` package must declare `peerDependencies: { "react": "^18.0.0 || ^19.0.0" }` to be compatible with both apps. [VERIFIED: codebase inspection]

### Supporting

| Library                | Version   | Purpose          | When to Use                                            |
| ---------------------- | --------- | ---------------- | ------------------------------------------------------ |
| vitest                 | `^2.1.8`  | Test runner      | Existing; `bundle-no-dev-leak.spec.ts` already uses it |
| @testing-library/react | `^16.1.0` | Component tests  | Existing `menu-view.spec.tsx` pattern                  |
| jsdom                  | `^25.0.1` | Test environment | Existing vitest setup                                  |

### No New Packages Required

All functionality is achievable with the existing dependency set:

- Cart store → Zustand 5 (already in workspace)
- Modifier selection UI → plain React state + existing CSS system
- Cart drawer → pure CSS + React state (no dialog lib needed for Vite surface)
- Table binding → native `URLSearchParams` (browser API)
- Locale switcher → existing `i18n/index.ts` `setLocale` + `getActiveLocale`

**Installation (new package only):**

```bash
pnpm --filter @resto/cart add zustand
```

`@resto/cart` declares zustand as a `peerDependency` (same as `@resto/ui` declares react).

---

## Package Legitimacy Audit

No new external packages are introduced in this phase. All required libraries (`zustand`, `vite`, `react`, `vitest`, `@testing-library/react`) are already installed in the workspace with locked versions in `pnpm-lock.yaml`.

| Package        | Registry | Status                            | Disposition               |
| -------------- | -------- | --------------------------------- | ------------------------- |
| zustand@5.0.14 | npm      | Already installed, version locked | Approved — no new install |
| vite@5.4.11    | npm      | Already installed                 | Approved — no new install |
| react@18.3.1   | npm      | Already installed in qr-menu      | Approved — no new install |

**Packages removed due to slopcheck:** none  
**Packages flagged as suspicious:** none

---

## Architecture Patterns

### System Architecture Diagram

```
Guest scans QR code
        │
        ▼
 ┌─────────────────────────────────────────────────────────┐
 │  apps/qr-menu (Vite SPA — browser)                     │
 │                                                         │
 │  App.tsx ──mount──► URLSearchParams → @resto/cart.setTable │
 │       │          └► i18n detectLocale (URL>cookie>nav)  │
 │       │                                                 │
 │  fetchMenu(/v1/menu) ──────────────────────────────────►│──► apps/api
 │       │                            ◄── MenuDto (items   │    /v1/menu
 │       │                                 incl isStopListed)   GetPublishedMenuService
 │       │                                                 │    + repo includes stopped
 │       ▼                                                 │    items w/ flag
 │  MenuView                                               │
 │   └─ MenuItemCard (stop-listed → 50% opacity, no-op)   │
 │       └─ click ─► ItemDetail (modal/slide-over)         │
 │                    ├─ modifier group selection          │
 │                    ├─ live price = basePrice +          │
 │                    │    Σ(selectedOption.priceDelta)    │
 │                    └─ "Add to cart" ─► @resto/cart.addItem │
 │                                                         │
 │  CartDrawer (slide-over)                                │
 │   ├─ CartLineItem × N                                   │
 │   ├─ quantity +/- → @resto/cart.updateQuantity          │
 │   ├─ remove → @resto/cart.removeItem                    │
 │   ├─ subtotal via selectSubtotal(@resto/cart)           │
 │   └─ table display / entry → setTable                   │
 │                                                         │
 │  @resto/cart (sessionStorage persist, Zustand 5)        │
 │   { mode, items[], table }  ←─ Phase 7 reads table      │
 └─────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

New `@resto/cart` package:

```
packages/cart/
├── package.json          # name: @resto/cart, type: module
├── tsconfig.json         # extends @resto/config-typescript/react.json
├── project.json          # Nx: projectType: library, lint+typecheck targets
└── src/
    ├── index.ts          # re-exports store + types + selectors
    └── cart.ts           # useCartStore, CartLineItem, CartModifier, selectors
```

qr-menu source additions:

```
apps/qr-menu/src/
├── App.tsx               # extend: URLSearchParams → setTable on mount
├── components/
│   ├── MenuView.tsx      # extend: pass isStopListed, CartDrawer trigger
│   ├── MenuItemCard.tsx  # extend: disabled state when isStopListed
│   ├── ItemDetail.tsx    # extend: modifier selection, live price, add-to-cart
│   ├── CartDrawer.tsx    # NEW: slide-over cart with line items + subtotal
│   ├── CartLineItem.tsx  # NEW: single cart row with quantity controls
│   ├── TableBanner.tsx   # NEW: table display + manual entry fallback
│   └── LocaleSwitcher.tsx# NEW: en/ru toggle
├── i18n/
│   ├── en.json           # extend with cart/modifier/table keys
│   ├── ru.json           # extend
│   └── index.ts          # extend: URL and cookie read on init
└── styles.css            # extend with cart, modifier, table CSS classes
```

### Pattern 1: `@resto/cart` — Framework-Agnostic Zustand Package

**What:** Move `apps/website/store/cart.ts` content into `packages/cart/src/cart.ts` with one change: add `table: string | null` and `setTable` to the store state. The `createJSONStorage(() => sessionStorage)` persist config works in both Vite (browser) and Next.js (client components) because sessionStorage is only accessed at runtime on the client — not at SSR build time. [ASSUMED — standard Zustand pattern for SSR-safe persistence]

**Key issue:** The Next.js app server-renders pages, so `useCartStore` must only be called in client components. The existing `apps/website` code already correctly gates this (the store is only used in `'use client'` components). No changes needed to the consumption pattern.

**Package shape — matching existing pattern from `@resto/ui`:**

```json
{
  "name": "@resto/cart",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0"
  },
  "dependencies": {
    "zustand": "^5.0.14"
  }
}
```

[VERIFIED: codebase — `@resto/ui/package.json` uses identical structure with peerDependencies]

**tsconfig.json for `@resto/cart`:**

```json
{
  "extends": "@resto/config-typescript/react.json",
  "compilerOptions": { "noEmit": true, "rootDir": "." },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules"]
}
```

[VERIFIED: codebase — `packages/ui/tsconfig.json` identical shape]

**`table` field addition to store:**

```typescript
interface CartState {
  readonly mode: 'delivery' | 'pickup' | null;
  readonly items: CartLineItem[];
  readonly table: string | null; // NEW — D-03
  setMode: (mode: 'delivery' | 'pickup') => void;
  addItem: (item: Omit<CartLineItem, 'quantity'>) => void;
  updateQuantity: (
    itemId: string,
    sizeId: string | null,
    delta: number,
  ) => void;
  removeItem: (itemId: string, sizeId: string | null) => void;
  clearCart: () => void;
  setTable: (table: string | null) => void; // NEW — D-03
}
```

[VERIFIED: codebase — extends existing `apps/website/store/cart.ts`]

**Website re-point:** All `@/store/cart` (and relative `../store/cart`) import sites in `apps/website` need re-pointing to `@resto/cart`. Discover the full list at execution time via grep — do NOT hard-code the count (PATTERNS.md observed 8 files; RESEARCH originally noted 9 — the action MUST grep-discover and re-point every match rather than depend on the exact number):

```bash
grep -rl -e "@/store/cart" -e "\.\./store/cart" apps/website/{components,hooks,store,test}
```

Also add `"@resto/cart": "workspace:*"` to `apps/website/package.json` dependencies and remove local `store/cart.ts`.
[VERIFIED: codebase grep of all `@/store/cart` and `../store/cart` imports in `apps/website`]

**`tsconfig.base.json` does NOT need new path aliases** for `@resto/cart` — the existing packages (`@resto/ui`, `@resto/api-client`) are not in the base paths file; they resolve via `pnpm-workspace.yaml` + `main`/`types` in `package.json`. Only NestJS-used packages (`@resto/domain`, `@resto/db`, `@resto/events`) have base tsconfig paths.
[VERIFIED: codebase — `tsconfig.base.json` paths map]

### Pattern 2: QRM-09 Stop-List Backend Extension (CRITICAL)

**Current behavior (verified from source):** `catalog-drizzle.repository.ts:loadPublishedMenu` fetches `menu_stop_list` rows, builds `stoppedItemIds = new Set(...)`, then does `allItemsRows.filter(r => !stoppedItemIds.has(r.id))` — stopped items are **excluded** from the response entirely.

**Required change for QRM-09:** Add `isStopListed: boolean` to `PublishedMenuItem` domain type and include stopped items with the flag set to `true`. The repository change: include all items, mark stopped ones. The public-menu controller Zod schema and DTO types in `packages/api-client/src/menu-types.ts` + `apps/qr-menu/src/api/types.ts` must add the field.

**Impact on Phase 5 website:** `apps/website/components/menu/menu-page-client.tsx` currently passes no `unavailable` prop to `MenuItemCard`. After the backend change, update the usage to pass `unavailable={item.isStopListed}`.

**Plan this as a single atomic change:**

1. `apps/api` domain type + repository + controller Zod schema
2. `packages/api-client/src/menu-types.ts` + OpenAPI regen
3. `apps/qr-menu/src/api/types.ts`
4. `apps/website/components/menu/menu-page-client.tsx` (pass the flag)

[VERIFIED: codebase — confirmed by reading `catalog-drizzle.repository.ts` lines 108-120 and `published-menu.ts` interface — no `isStopListed` field present]

### Pattern 3: Table Binding (QRM-08)

**How to read `?table=` in a Vite SPA:**

```typescript
// In App.tsx useEffect on mount:
const params = new URLSearchParams(window.location.search);
const table = params.get('table');
if (table) {
  useCartStore.getState().setTable(table);
}
```

This is a pure browser API — no router needed. [VERIFIED: standard browser API, Vite SPA has full access to `window.location`]

**Manual entry fallback:** A `TableBanner` component shows the current table value (if set) or an inline text input when absent. This banner sits between the app header and the menu content. The input writes to `@resto/cart.setTable` on submit/blur.

**Persistence:** Stored in `sessionStorage` via Zustand `persist` middleware — the same persist config on `useCartStore` already covers `table` once added to initial state.

**Phase 7 forward-compatibility:** Phase 7 reads `cart.table` at order creation. The shape is already correct — `string | null`.

### Pattern 4: Modifier Selection + Live Price (QRM-03/04)

**Data model (verified from source):**

- `MenuItemDto.modifierGroupIds: readonly string[]` — IDs referencing `MenuDto.modifierGroups`
- `MenuDto.modifierGroups: readonly MenuModifierGroupDto[]` — full group + options
- `MenuModifierGroupDto.minSelectable` / `maxSelectable` / `isRequired`
- `MenuModifierOptionDto.priceDelta: string` — decimal string, can be negative

**ItemDetail extension pattern:**

```typescript
// Local state for selected options per group
const [selected, setSelected] = useState<Map<string, string[]>>(new Map());

// Resolve groups for this item
const groups = item.modifierGroupIds.map(
  id => menu.modifierGroups.find(g => g.id === id)!
).filter(Boolean);

// Live price computation (matches selectSubtotal minor-units logic)
const livePrice = useMemo(() => {
  let total = parseMinorUnits(item.basePrice);
  for (const [, optionIds] of selected) {
    for (const optId of optionIds) {
      const opt = /* find option in groups */;
      total += parseMinorUnits(opt.priceDelta);
    }
  }
  return formatMinorUnits(total);
}, [selected, item.basePrice]);
```

The `parseMinorUnits` / `formatMinorUnits` helpers are in `@resto/cart` (extracted from the existing store). Export them from the package so qr-menu can reuse without duplication.

**ItemDetail currently receives only `item: MenuItemDto`** — it needs access to the full `menu.modifierGroups` map. Options:

- Pass `modifierGroups: readonly MenuModifierGroupDto[]` as a prop to `ItemDetail`.
- Or pass the resolved groups: `groups: readonly MenuModifierGroupDto[]`.

Recommending the latter (resolved groups) to keep `ItemDetail` self-contained.

**Routing implication:** Currently `App.tsx` routes to `<ItemDetail item={item} onBack={navigateToMenu} />` with just the item. The route handler needs to pass resolved groups. Change App.tsx route render to: `<ItemDetail item={item} groups={resolvedGroups} onBack={navigateToMenu} />`.

### Pattern 5: i18n Locale Resolution Chain (QRM-10, D-05)

**Current state:** `i18n/index.ts:detectLocale()` uses `navigator.language` / `navigator.languages` only — no URL or cookie check. Default falls back to `'en'` which satisfies D-05.

**Extensions needed:**

1. Check URL path prefix (`/en/` or `/ru/`) before `navigator.language`
2. Check a `locale` cookie before `navigator.language`
3. `setLocale` already exists — use it in the locale switcher UI component

**Extended `detectLocale`:**

```typescript
const detectLocale = (): Locale => {
  // 1. URL path segment: /en/... or /ru/...
  const pathMatch = /^\/(en|ru)(\/|$)/.exec(window.location.pathname);
  if (pathMatch?.[1] && pathMatch[1] in RESOURCES)
    return pathMatch[1] as Locale;
  // 2. Cookie: locale=en or locale=ru
  const cookieLocale = document.cookie
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith('locale='))
    ?.split('=')[1];
  if (cookieLocale && cookieLocale in RESOURCES) return cookieLocale as Locale;
  // 3. navigator.language (existing logic)
  const candidates =
    typeof navigator !== 'undefined'
      ? [navigator.language, ...navigator.languages]
      : ['en'];
  for (const c of candidates) {
    const short = c.toLowerCase().split('-')[0];
    if (short && short in RESOURCES) return short as Locale;
  }
  return 'en';
};
```

**Locale switcher:** A simple `<LocaleSwitcher>` button (EN/RU toggle) calls `setLocale` and writes the `locale` cookie (`document.cookie = 'locale=en; path=/'`). Since the i18n system uses module-level state (not React state), a locale change requires either a page reload or React re-render trigger. The simplest approach in the Vite SPA: `setLocale(locale); window.location.reload()`. Or wrap the app in a React context that tracks active locale. Recommend the context approach to avoid full reload UX. [ASSUMED — implementation detail within Claude's discretion]

### Pattern 6: Source Maps + Bundle Test (QRM-11/12)

**QRM-11 — Change `vite.config.ts`:**

```typescript
build: {
  target: 'es2022',
  sourcemap: 'hidden',  // was: true — changed to 'hidden'
  // ...
}
```

`sourcemap: 'hidden'` emits `.js.map` files in `dist/assets/` but does NOT add a `//# sourceMappingURL=` comment inside the `.js` files. This means browsers do not automatically load the maps (they serve as error-monitoring-tool maps only, not public browser debugger maps). [ASSUMED — Vite sourcemap option behavior from training knowledge; verify against Vite 5 docs before implementing]

**QRM-12 — Bundle test:** Extend `bundle-no-dev-leak.spec.ts` with a new test:

```typescript
it('does not emit inline sourceMappingURL comments in JS assets', () => {
  // Assumes the build from prior test already ran
  const bundle = readBundleJs();
  expect(bundle).not.toContain('//# sourceMappingURL=');
});

it('.map files exist but are not referenced from JS (hidden maps)', () => {
  const mapFiles = readdirSync(distAssets).filter((f) => f.endsWith('.map'));
  expect(mapFiles.length).toBeGreaterThan(0); // maps ARE emitted
  const bundle = readBundleJs();
  expect(bundle).not.toContain('sourceMappingURL'); // but NOT referenced
});
```

**Note on what "not publicly served" means in QRM-12:** The requirement is that `.map` files not be _publicly accessible_ — but this is a server configuration concern, not a bundle concern. In a Vite SPA, `dist/assets/` is served statically. The bundle test can assert (1) no inline `sourceMappingURL` comment (so browsers don't auto-load maps), and (2) maps exist as files (for error monitoring tooling to find). A real "not served" guarantee requires CDN/nginx config to block `*.map` requests — that is **Phase 7.5 (production deploy) territory** and is tracked as an explicit deferral: `apps/CLAUDE.md` ("Source maps + production hygiene") REQUIRES customer-facing apps to strip `.map` from the deploy artifact and upload via Sentry/equivalent. Phase 6 keeps the hidden maps (needed for the future Sentry upload) and asserts no inline reference; the residual ".map present in dist" risk is owned by Phase 7.5's PLAN (see plan 06-05 threat T-06-11). The bundle test covers the QRM-12 build-time intent. [ASSUMED — interpretation of "not publicly served" in QRM-12]

### Pattern 7: Branded Header (QRM-01)

**`MenuDto.brand` shape (verified):**

```typescript
interface MenuBrandDto {
  readonly id: string;
  readonly slug: string;
  readonly displayName: string;
  readonly theme: {
    logoUrl: string | null;
    primaryColor: string | null;
    font: string | null;
  } | null;
}
```

**Inject theme at App level (mirrors Phase 5 website pattern):**

```typescript
useEffect(() => {
  if (menu.brand?.theme?.primaryColor) {
    document.documentElement.style.setProperty(
      '--resto-accent',
      menu.brand.theme.primaryColor,
    );
  }
}, [menu.brand]);
```

The `--resto-accent` CSS variable is already defined in `styles.css` and used throughout. This is the correct injection point.

**Header component:** A new `<Header>` component at the top of `MenuView` (or App.tsx) renders `brand.theme.logoUrl` (img) + `brand.displayName` (h1 or div). Currently `MenuView` hard-codes `t('menu.title')` as the page title — replace with brand name when available, fallback to translation key.

### Anti-Patterns to Avoid

- **Don't import `@resto/cart` in `apps/api`** — the NestJS API must never import front-end packages. The cart shape is defined in `@resto/cart`; Phase 7 ordering context defines its own DTO/aggregate independently.
- **Don't use Zustand SSR snapshot in qr-menu** — this is a pure Vite SPA; no server-side rendering occurs. The `createJSONStorage(() => sessionStorage)` persist config is safe.
- **Don't check `typeof window === 'undefined'` in `useCartStore` actions** — Vite SPA always runs in the browser. The guard only belongs in `@resto/cart` if the package is used in Next.js server components (it's not — the website only uses it in `'use client'` components).
- **Don't use React Router or any SPA routing library** — existing qr-menu uses manual `window.history.pushState` + `popstate`. D-04 says extend, not rewrite.
- **Don't share `@resto/ui` components from website** — D-02 explicitly excludes this. `@resto/ui` currently exports nothing (`export {}`) and can be populated later.

---

## Don't Hand-Roll

| Problem               | Don't Build                   | Use Instead                                             | Why                                                               |
| --------------------- | ----------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| Cart state shape      | Custom cart logic             | `@resto/cart` (extracted from website)                  | ORD-03 phase seam; both surfaces must have identical shape        |
| Minor-units math      | Custom currency arithmetic    | `parseMinorUnits`/`formatMinorUnits` from `@resto/cart` | Existing, tested, decimal-safe implementation                     |
| Menu data types       | Duplicate `MenuDto` interface | Import from `@resto/api-client/public`                  | Already shared; qr-menu's `api/types.ts` is a near-identical copy |
| i18n locale detection | New locale lib                | Extend existing `i18n/index.ts`                         | Tiny, in-repo, already working for en/ru                          |

**Key insight on types duplication:** `apps/qr-menu/src/api/types.ts` is an almost-identical copy of `packages/api-client/src/menu-types.ts`. They currently differ only in comment annotations. The plan should switch qr-menu to import from `@resto/api-client/public` — this eliminates the duplication and ensures qr-menu gets the `isStopListed` field when the backend adds it. The qr-menu comment in `api/types.ts` explains why it does NOT import from `@resto/domain` (bundle size) — that reasoning applies to domain types, not to the api-client types package, which is already a pure TS re-export with zero runtime code.

---

## Common Pitfalls

### Pitfall 1: Zustand sessionStorage Hydration Flash (SSR-safe but still has timing issue)

**What goes wrong:** In the Vite SPA, `useCartStore` initializes with empty state, then `persist` middleware hydrates from sessionStorage on the next tick. Components that read cart state on first render get the empty state, causing a flash.

**How to avoid:** Use Zustand's `persist` `onRehydrateStorage` callback or check `useCartStore.persist.hasHydrated()` before rendering cart UI. Pattern: render cart badge as `undefined` / hidden until hydrated.

**Warning signs:** Cart badge shows 0 then jumps to correct count on page load.

### Pitfall 2: `table` Field Not Included in sessionStorage Persist

**What goes wrong:** If `table` is added to `CartState` but the `persist` middleware `partialize` option is used (or if it was in the future), `table` might be excluded from the persisted slice.

**How to avoid:** The current `apps/website/store/cart.ts` has NO `partialize` option — the full state is persisted. Keep it that way: all fields including `table` are stored. QR-scan creates a new session; sessionStorage per-tab is correct.

### Pitfall 3: Stop-List API Change Breaks Website Cache

**What goes wrong:** When `isStopListed: boolean` is added to `PublishedMenuItem`, the serialized menu cache in Redis will have the old shape for any cached versions. Requests will get the old (missing field) shape until TTL expires (5 minutes).

**How to avoid:** Plan the backend change to also bump the cache invalidation strategy. Simplest: deploy the API change and let the 5-minute TTL expire naturally. Or: bump the `CACHE_TTL_SECONDS` constant to 0 temporarily post-deploy. Not a blocker but worth a note in the plan.

### Pitfall 4: `modifierGroupIds` References Stale After Menu Update

**What goes wrong:** `item.modifierGroupIds` references group IDs that exist in `menu.modifierGroups`. If the item detail renders with a stale `menu` state that doesn't contain a referenced group, the lookup returns `undefined` and crashes.

**How to avoid:** Always filter-and-verify: `item.modifierGroupIds.map(id => groups.find(g => g.id === id)).filter(Boolean)`. Already demonstrated in the `ItemDetail` extension pattern above.

### Pitfall 5: i18n Module-Level State Stale After Locale Switch

**What goes wrong:** `activeLocale` is module-level state (not React state). Changing it via `setLocale` does not trigger a React re-render of components that called `t()` or `localized()` synchronously.

**How to avoid:** The locale switcher must cause a re-render. Options: (a) `window.location.reload()` — simple, loses scroll position; (b) React context wrapping the app with `useState(activeLocale)` — clean, requires refactoring all components to consume locale from context rather than calling `getActiveLocale()` directly. For the Vite SPA (no SSR complexity), `window.location.reload()` is acceptable. Plan should decide.

### Pitfall 6: `dist/assets/` Does Not Exist Before Bundle Tests Run

**What goes wrong:** `bundle-no-dev-leak.spec.ts` calls `execSync('pnpm --filter @resto/qr-menu build', ...)` to generate the dist before reading it. The new source-map test must either (a) run after the existing tests build the artifact, or (b) explicitly rebuild. The existing tests in the file already rebuild in every `it` block — the new test can reference the same `distAssets` output without rebuilding again if tests run sequentially in the same file.

**How to avoid:** Add the new source-map assertion test inside the same `describe('qr-menu prod bundle', ...)` block, after the existing builds have run. Vitest runs `describe` blocks top-to-bottom sequentially by default.

---

## Code Examples

### @resto/cart — Full `src/cart.ts` (extends website store)

```typescript
// Source: apps/website/store/cart.ts + D-03 table addition
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface CartModifier {
  readonly optionId: string;
  readonly name: string;
  readonly priceDelta: string;
  readonly modifierGroupId?: string;
  readonly amount?: number;
}

export interface CartLineItem {
  readonly itemId: string;
  readonly sizeId: string | null;
  readonly name: string;
  readonly unitPrice: string;
  readonly currency: string;
  readonly modifiers: readonly CartModifier[];
  quantity: number;
}

interface CartState {
  readonly mode: 'delivery' | 'pickup' | null;
  readonly items: CartLineItem[];
  readonly table: string | null; // D-03: QRM-08
  setMode: (mode: 'delivery' | 'pickup') => void;
  addItem: (item: Omit<CartLineItem, 'quantity'>) => void;
  updateQuantity: (
    itemId: string,
    sizeId: string | null,
    delta: number,
  ) => void;
  removeItem: (itemId: string, sizeId: string | null) => void;
  clearCart: () => void;
  setTable: (table: string | null) => void; // D-03: QRM-08
}

export function parseMinorUnits(value: string): number {
  /* ... same as website */
}
export function formatMinorUnits(minor: number): string {
  /* ... same as website */
}
export function selectSubtotal(state: CartState): string {
  /* ... same as website */
}
export function selectItemCount(state: CartState): number {
  /* ... same as website */
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      mode: null,
      items: [],
      table: null, // D-03
      setMode: (mode) => set({ mode }),
      // ... same actions as website ...
      setTable: (table) => set({ table }), // D-03
    }),
    {
      name: 'resto-cart',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
```

### App.tsx — Table binding on mount (QRM-08)

```typescript
// On mount, read ?table= and store it
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const tableParam = params.get('table');
  if (tableParam) {
    useCartStore.getState().setTable(tableParam);
  }
}, []);
```

### vite.config.ts — Hidden source maps (QRM-11)

```typescript
build: {
  target: 'es2022',
  sourcemap: 'hidden',  // emits .map files but no //# sourceMappingURL= inline comment
  rollupOptions: {
    output: { manualChunks: { react: ['react', 'react-dom'] } },
  },
},
```

### Bundle test addition (QRM-12)

```typescript
// In test/bundle-no-dev-leak.spec.ts, inside the same describe block
it('emits .map files but does not reference them inline (hidden source maps)', () => {
  const mapFiles = readdirSync(distAssets).filter((f) => f.endsWith('.map'));
  const bundle = readBundleJs();
  // Hidden maps: .map files ARE emitted (for error monitoring tools)
  expect(mapFiles.length).toBeGreaterThan(0);
  // But no inline //# sourceMappingURL= comment in JS
  expect(bundle).not.toContain('sourceMappingURL');
});
```

---

## State of the Art

| Old Approach                               | Current Approach                       | When Changed         | Impact                                                     |
| ------------------------------------------ | -------------------------------------- | -------------------- | ---------------------------------------------------------- |
| Duplicate types in qr-menu `api/types.ts`  | Import from `@resto/api-client/public` | Phase 6 (this phase) | Single source of truth; auto-picks up `isStopListed`       |
| Stop-listed items excluded from `/v1/menu` | Include with `isStopListed: true` flag | Phase 6 (this phase) | QRM-09 becomes implementable                               |
| `sourcemap: true` (public maps)            | `sourcemap: 'hidden'`                  | Phase 6 (this phase) | QRM-11 compliance                                          |
| Cart store local to `apps/website`         | Extracted to `@resto/cart`             | Phase 6 (this phase) | Phase 7 ordering reads consistent shape; qr-menu gets cart |

---

## Critical Finding: Stop-List API Gap (QRM-09)

**This is the highest-risk discovery in Phase 6.**

The CONTEXT.md says "public-menu.controller.ts — `/v1/menu` contract incl. stop-list (QRM-09)" implying the stop-list data is already exposed. It is not.

**Verified from source (lines 108-120 of `catalog-drizzle.repository.ts`):**

```typescript
const stoppedItemIds = new Set(stopListRows.map((r) => r.itemId));
const itemsRows = allItemsRows.filter((r) => !stoppedItemIds.has(r.id));
// ↑ stopped items are REMOVED, not flagged
```

**`PublishedMenuItem` domain type** (confirmed: `apps/api/src/contexts/catalog/domain/published-menu.ts`) has no `isStopListed` field.

**`MenuItemDto`** in both `packages/api-client/src/menu-types.ts` and `apps/qr-menu/src/api/types.ts` has no `isStopListed` field.

**Plan implication:** Phase 6 Wave 1 (or Wave 0) MUST include a backend plan to add `isStopListed: boolean` to `PublishedMenuItem`, change `loadPublishedMenu` to include stopped items with the flag, update the controller Zod schema, regen `@resto/api-client`, and update qr-menu types. This is a 2-3 hour task but it is a hard dependency for QRM-09. The website's `MenuItemCard` `unavailable` prop becomes functional as a side effect (currently dead code because the field never arrives).

---

## Open Questions (RESOLVED)

1. **`modifierGroupIds` lookup in ItemDetail — prop vs context**
   - What we know: `ItemDetail` receives only `item: MenuItemDto`; modifier groups are on `menu.modifierGroups`
   - What's unclear: best way to pass them (prop drilling vs React context vs store)
   - Recommendation: Pass as `groups: readonly MenuModifierGroupDto[]` prop (pre-resolved at App level). Simple; no over-engineering for a 2-group typical case.
   - **RESOLVED:** plan 06-03 Task 3 pre-resolves groups in App.tsx via `state.menu.modifierGroups.filter((g) => item.modifierGroupIds.includes(g.id))` (filter-and-verify guards Pitfall 4) and passes them as a `groups: readonly MenuModifierGroupDto[]` prop to ItemDetail — the recommended prop approach.

2. **Cart drawer trigger in the Vite SPA — overlay vs page push**
   - What we know: existing routing is URL-path based (menu / item); no dialog system
   - What's unclear: should cart be a URL route (`/cart`), a slide-over div, or a modal
   - Recommendation: CSS-only slide-over (position fixed, transform translateX). No JS overlay library. Matches D-04 "keep qr-menu's own lean Vite styling."
   - **RESOLVED:** plan 06-04 Task 1 builds CartDrawer as a CSS-only slide-over (`position:fixed` + `transform: translateX` via `.cart-drawer` / `.cart-drawer__panel` / `.cart-drawer--open`, backdrop click closes), open-state held in App.tsx useState — no routing/overlay library, per the recommendation and D-04.

3. **Locale switcher placement**
   - What we know: existing UI has no header component; menu title is inside `MenuView`
   - Recommendation: Add a `<Header>` component to `MenuView` (or App.tsx) that renders brand name + locale switcher buttons (EN / RU text links).
   - **RESOLVED:** plan 06-03 Task 2 adds the branded `<header className="menu__header">` to MenuView; plan 06-04 Task 3 mounts `<LocaleSwitcher>` (en/ru buttons) in that header next to the brand name — matching the recommendation.

4. **`?table=` persistence across page navigations within the SPA**
   - What we know: sessionStorage persists the table; URL changes within the SPA remove `?table=` from the URL bar
   - What's unclear: does the QR URL need `?table=` visible at all times
   - Recommendation: Store in sessionStorage only; no need to re-append to every URL push. The table is set once on first mount.
   - **RESOLVED:** plan 06-04 Task 2 reads `?table=` once in a mount useEffect → `setTable` (persisted to sessionStorage via the existing Zustand persist config); the value is never re-appended to in-SPA URL pushes — sessionStorage-only persistence per the recommendation.

---

## Environment Availability

This phase is purely frontend + minor backend addition. All tools confirmed present.

| Dependency         | Required By                         | Available | Version | Fallback           |
| ------------------ | ----------------------------------- | --------- | ------- | ------------------ |
| Node.js            | pnpm, Vite build                    | ✓         | —       | —                  |
| pnpm               | Workspace management                | ✓         | —       | —                  |
| Vite               | `apps/qr-menu` build                | ✓         | 5.4.11  | —                  |
| Vitest             | Bundle tests                        | ✓         | 2.1.8   | —                  |
| NestJS API running | Integration test of stop-list field | Dev-local | —       | Mock in unit tests |

---

## Assumptions Log

| #   | Claim                                                                                                            | Section                   | Risk if Wrong                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| A1  | `sourcemap: 'hidden'` in Vite 5 emits `.map` files but omits inline `sourceMappingURL` comments                  | Pattern 6, vite.config.ts | Low — can be verified by running `vite build` and inspecting output; Vite docs confirm this is the purpose of `'hidden'` |
| A2  | Zustand `createJSONStorage(() => sessionStorage)` is safe in a Vite SPA (browser-only, no SSR)                   | Pattern 1                 | Very low — qr-menu is a pure Vite SPA, no SSR path exists                                                                |
| A3  | `window.location.reload()` is acceptable for locale switching                                                    | Pattern 5                 | Low — UX tradeoff only; React context approach is the alternative if reload is unacceptable                              |
| A4  | The bundle test new assertions can reuse the existing build output from prior tests (no second `execSync build`) | Pattern 6, bundle test    | Low — vitest runs describe blocks sequentially; the dist already exists after the first test in the describe             |

---

## Sources

### Primary (HIGH confidence)

- `apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts` lines 108-120 — stop-list filter behavior confirmed by code reading
- `apps/api/src/contexts/catalog/domain/published-menu.ts` — confirmed no `isStopListed` field on `PublishedMenuItem`
- `packages/api-client/src/menu-types.ts` — wire types confirmed; no `isStopListed`
- `apps/qr-menu/src/api/types.ts` — confirmed near-identical to api-client menu-types
- `apps/qr-menu/src/App.tsx`, `components/*.tsx`, `i18n/index.ts` — current app state confirmed
- `apps/website/store/cart.ts` — store shape + actions confirmed; `table` field absent
- `apps/qr-menu/test/bundle-no-dev-leak.spec.ts` — existing bundle test infrastructure confirmed
- `packages/ui/package.json`, `packages/ui/tsconfig.json` — package creation template confirmed
- `apps/website/package.json` — zustand 5.0.14 confirmed; import sites enumerated
- `apps/qr-menu/vite.config.ts` — `sourcemap: true` confirmed (needs change to `'hidden'`)
- `.planning/config.json` — `nyquist_validation: false` confirmed (Validation Architecture section omitted)

### Secondary (MEDIUM confidence)

- `apps/website/components/menu/menu-item-card.tsx` — `unavailable` prop exists but is never passed (dead code until API change)
- `apps/website/components/menu/menu-page-client.tsx` — confirmed no `unavailable` prop passed

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all packages verified from codebase; no new external packages
- Architecture: HIGH — code-level inspection of all relevant files
- Stop-list API gap: HIGH — verified by reading repository source
- QRM-12 source map test behavior: ASSUMED (A1) — Vite `'hidden'` option behavior based on training knowledge, should be verified against Vite 5 docs

**Research date:** 2026-06-12
**Valid until:** 2026-07-12 (stable stack; only risk is a Zustand major version bump)
