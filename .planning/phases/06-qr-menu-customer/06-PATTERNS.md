# Phase 6: QR-Menu Customer - Pattern Map

**Mapped:** 2026-06-12
**Files analyzed:** 21 new/modified files
**Analogs found:** 21 / 21

---

## File Classification

| New/Modified File                                | Role       | Data Flow        | Closest Analog                                                    | Match Quality                       |
| ------------------------------------------------ | ---------- | ---------------- | ----------------------------------------------------------------- | ----------------------------------- |
| `packages/cart/package.json`                     | config     | —                | `packages/ui/package.json`                                        | exact                               |
| `packages/cart/tsconfig.json`                    | config     | —                | `packages/ui/tsconfig.json`                                       | exact                               |
| `packages/cart/project.json`                     | config     | —                | `packages/api-client/project.json`                                | exact                               |
| `packages/cart/src/index.ts`                     | utility    | —                | `packages/api-client/src/public.ts`                               | role-match                          |
| `packages/cart/src/cart.ts`                      | store      | CRUD             | `apps/website/store/cart.ts`                                      | exact (source file to extract)      |
| `apps/website/store/cart.ts`                     | —          | —                | deleted; replaced by `@resto/cart`                                | —                                   |
| `apps/website` 8× import re-points               | —          | —                | `apps/website/components/menu/menu-page-client.tsx` lines 13–14   | exact                               |
| `apps/api/.../published-menu.ts`                 | model      | —                | same file (add field)                                             | self                                |
| `apps/api/.../catalog-drizzle.repository.ts`     | repository | CRUD             | same file lines 108–175                                           | self                                |
| `apps/api/.../public-menu.controller.ts`         | controller | request-response | same file (add Zod field)                                         | self                                |
| `packages/api-client/src/menu-types.ts`          | model      | —                | same file (add field)                                             | self                                |
| `apps/qr-menu/src/api/types.ts`                  | —          | —                | deleted; replaced by `@resto/api-client/public`                   | —                                   |
| `apps/qr-menu/src/App.tsx`                       | component  | event-driven     | `apps/qr-menu/src/App.tsx` (extend)                               | self                                |
| `apps/qr-menu/src/components/MenuView.tsx`       | component  | request-response | same file + `apps/website/components/menu/menu-page-client.tsx`   | self + role-match                   |
| `apps/qr-menu/src/components/MenuItemCard.tsx`   | component  | request-response | same file + `apps/website/components/menu/menu-item-card.tsx`     | self + role-match                   |
| `apps/qr-menu/src/components/ItemDetail.tsx`     | component  | request-response | same file + `apps/website/components/menu/item-modal.tsx`         | self + role-match                   |
| `apps/qr-menu/src/components/CartDrawer.tsx`     | component  | CRUD             | `apps/website/components/menu/cart-drawer.tsx`                    | role-match (logic ref, NOT styling) |
| `apps/qr-menu/src/components/CartLineItem.tsx`   | component  | CRUD             | `apps/website/components/menu/cart-line-item.tsx`                 | role-match (logic ref, NOT styling) |
| `apps/qr-menu/src/components/TableBanner.tsx`    | component  | event-driven     | `apps/qr-menu/src/components/MenuItemCard.tsx` (same SPA pattern) | partial                             |
| `apps/qr-menu/src/components/LocaleSwitcher.tsx` | component  | event-driven     | `apps/qr-menu/src/i18n/index.ts`                                  | partial                             |
| `apps/qr-menu/src/i18n/index.ts`                 | utility    | event-driven     | same file (extend)                                                | self                                |
| `apps/qr-menu/vite.config.ts`                    | config     | —                | same file (change one line)                                       | self                                |
| `apps/qr-menu/test/bundle-no-dev-leak.spec.ts`   | test       | —                | same file (extend)                                                | self                                |

---

## Pattern Assignments

### `packages/cart/package.json` (config)

**Analog:** `packages/ui/package.json`

**Full pattern** (lines 1–25):

```json
{
  "name": "@resto/ui",
  "version": "0.0.0",
  "private": true,
  "description": "...",
  "license": "UNLICENSED",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@resto/config-eslint": "workspace:*",
    "@resto/config-typescript": "workspace:*",
    "typescript": "^6.0.3"
  }
}
```

**Delta for `@resto/cart`:** `name` → `@resto/cart`; `peerDependencies.react` → `"^18.0.0 || ^19.0.0"` (serves both qr-menu React 18 and website React 19); remove `react-dom` peer (cart store has no DOM dependency); add `"dependencies": { "zustand": "^5.0.14" }`; no `@types/react` devDep (no JSX in the package).

---

### `packages/cart/tsconfig.json` (config)

**Analog:** `packages/ui/tsconfig.json` (lines 1–9):

```json
{
  "extends": "@resto/config-typescript/react.json",
  "compilerOptions": {
    "noEmit": true,
    "rootDir": "."
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules", "dist"]
}
```

**Delta for `@resto/cart`:** Change `include` to `["src/**/*.ts"]` only — cart package has no `.tsx` files (no JSX). Keep `react.json` preset because Zustand types include React generic constraints.

---

### `packages/cart/project.json` (config)

**Analog:** `packages/api-client/project.json` (lines 1–32):

```json
{
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "name": "api-client",
  "projectType": "library",
  "sourceRoot": "packages/api-client/src",
  "tags": ["scope:shared", "type:lib", "layer:application"],
  "targets": {
    "lint": {
      "executor": "nx:run-commands",
      "options": {
        "command": "eslint .",
        "cwd": "packages/api-client"
      }
    },
    "typecheck": {
      "executor": "nx:run-commands",
      "options": {
        "command": "tsc -p tsconfig.json --noEmit",
        "cwd": "packages/api-client"
      }
    }
  }
}
```

**Delta for `@resto/cart`:** `name` → `cart`; `sourceRoot` → `packages/cart/src`; `cwd` → `packages/cart`; remove the `gen` target (no codegen needed); keep `lint` + `typecheck` targets verbatim with path substitution.

---

### `packages/cart/src/index.ts` (utility — re-exports)

**Analog:** `packages/api-client/src/public.ts` (lines 1–18) — barrel re-export pattern:

```typescript
export type {
  LocalizedText,
  MenuPhotoDto,
  // ...
} from './menu-types.js';
```

**Pattern for `@resto/cart`:** Re-export all public symbols from `./cart.ts`:

```typescript
export type { CartModifier, CartLineItem } from './cart.js';
export {
  useCartStore,
  selectSubtotal,
  selectItemCount,
  parseMinorUnits,
  formatMinorUnits,
} from './cart.js';
```

Note: `parseMinorUnits`/`formatMinorUnits` are currently private in `apps/website/store/cart.ts` (lines 32–43). Promote them to `export function` in `packages/cart/src/cart.ts` so `ItemDetail` in qr-menu can import them for live price computation.

---

### `packages/cart/src/cart.ts` (store, CRUD)

**Analog:** `apps/website/store/cart.ts` — the exact file to move verbatim with two additions.

**Full source to copy** (lines 1–103 of `apps/website/store/cart.ts`):

```typescript
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
  // ADD: table: string | null;   ← D-03 / QRM-08
  setMode: (mode: 'delivery' | 'pickup') => void;
  addItem: (item: Omit<CartLineItem, 'quantity'>) => void;
  updateQuantity: (
    itemId: string,
    sizeId: string | null,
    delta: number,
  ) => void;
  removeItem: (itemId: string, sizeId: string | null) => void;
  clearCart: () => void;
  // ADD: setTable: (table: string | null) => void;   ← D-03 / QRM-08
}
```

**`parseMinorUnits` / `formatMinorUnits`** (lines 32–44 of `apps/website/store/cart.ts`) — promote to `export function`:

```typescript
export function parseMinorUnits(value: string): number {
  const [whole = '0', frac = ''] = value.split('.');
  const fracPadded = frac.padEnd(2, '0').slice(0, 2);
  return parseInt(whole, 10) * 100 + parseInt(fracPadded, 10);
}

export function formatMinorUnits(minor: number): string {
  const whole = Math.floor(minor / 100);
  const frac = Math.abs(minor % 100)
    .toString()
    .padStart(2, '0');
  return `${whole.toString()}.${frac}`;
}
```

**`useCartStore` create call** (lines 62–103 of `apps/website/store/cart.ts`) — add `table` field and `setTable` action in the initializer:

```typescript
export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      mode: null,
      items: [],
      table: null, // D-03
      setMode: (mode) => set({ mode }),
      addItem: (newItem) =>
        set((state) => {
          /* exact copy */
        }),
      updateQuantity: (itemId, sizeId, delta) =>
        set((state) => ({
          /* exact copy */
        })),
      removeItem: (itemId, sizeId) =>
        set((state) => ({
          /* exact copy */
        })),
      clearCart: () => set({ items: [] }),
      setTable: (table) => set({ table }), // D-03
    }),
    {
      name: 'resto-cart',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
```

No `partialize` — the full state including `table` is persisted.

---

### `apps/website` — 8 import re-points (modify)

**Analog:** `apps/website/components/menu/menu-page-client.tsx` lines 13–14 (current import):

```typescript
import { useCartStore, selectItemCount } from '@/store/cart';
import { useHasHydrated } from '@/hooks/use-cart-store';
```

**After re-point pattern:** Replace every `from '@/store/cart'` and `from '../store/cart'` with `from '@resto/cart'`. The 8 files requiring this change (confirmed by research):

- `apps/website/test/cart-store.spec.ts`
- `apps/website/hooks/use-cart-store.ts`
- `apps/website/components/checkout/checkout-form.tsx`
- `apps/website/components/menu/menu-page-client.tsx`
- `apps/website/components/checkout/order-summary.tsx`
- `apps/website/components/menu/item-modal.tsx` (currently imports `type { CartLineItem, CartModifier } from '@/store/cart'`)
- `apps/website/components/menu/cart-drawer.tsx`
- `apps/website/components/menu/cart-line-item.tsx`

Also: add `"@resto/cart": "workspace:*"` to `apps/website/package.json` dependencies and delete `apps/website/store/cart.ts`.

---

### Backend: `apps/api/src/contexts/catalog/domain/published-menu.ts` (model, add field)

**Current `PublishedMenuItem` interface** (lines 77–125):

```typescript
export interface PublishedMenuItem {
  readonly id: MenuItemId;
  readonly slug: string;
  // ... all existing fields ...
  readonly modifierGroupIds: readonly MenuModifierId[];
  // MISSING: isStopListed
}
```

**Change:** Add one field to `PublishedMenuItem` after `modifierGroupIds`:

```typescript
readonly isStopListed: boolean;
```

No other changes to this file.

---

### Backend: `apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts` (repository, CRUD)

**Current stop-list logic** (lines 109–120):

```typescript
const stoppedItemIds = new Set(stopListRows.map((r) => r.itemId));
const itemsRows = allItemsRows.filter((r) => !stoppedItemIds.has(r.id));
```

**Change (lines 119–120 only):** Remove the filter; use `allItemsRows` directly and mark items:

```typescript
const stoppedItemIds = new Set(stopListRows.map((r) => r.itemId));
// REMOVE: const itemsRows = allItemsRows.filter((r) => !stoppedItemIds.has(r.id));
// KEEP: use allItemsRows below
```

**Change in item mapping block** (line 144, inside `itemsRows.map`): The `allItemsRows.map` call at line 143 becomes:

```typescript
const items = await Promise.all(
  allItemsRows.map<Promise<PublishedMenuItem>>(async (r) => {
    const photos = await this.signPhotos(r.photos);
    return {
      // ... all existing fields (lines 147–173) unchanged ...
      modifierGroupIds: (modifierGroupsByItem.get(r.id) ?? []).map((m) =>
        MenuModifierId.parse(m.modifierGroupId),
      ),
      isStopListed: stoppedItemIds.has(r.id), // ADD
    };
  }),
);
```

**RLS constraint:** `scoped.selectFrom(schema.menuStopList)` at line 115 already uses `ScopedTx` — the tenant isolation is correct. No change needed to the query; only the post-query filtering changes.

---

### Backend: `apps/api/src/contexts/catalog/interfaces/http/public-menu.controller.ts` (controller, Zod DTO)

**Current `PublishedMenuItemSchema`** (lines 36–55):

```typescript
const PublishedMenuItemSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  // ...
  modifierGroupIds: z.array(z.string().uuid()),
  // MISSING: isStopListed
});
```

**Change:** Add one Zod field after `modifierGroupIds` (line 54):

```typescript
modifierGroupIds: z.array(z.string().uuid()),
isStopListed: z.boolean(),   // ADD — QRM-09
```

No other changes to this file. OpenAPI spec regenerates from this change via `pnpm --filter @resto/api gen:openapi`.

---

### `packages/api-client/src/menu-types.ts` (model, add field)

**Current `MenuItemDto`** (lines 39–58):

```typescript
export interface MenuItemDto {
  id: string;
  // ...
  modifierGroupIds: readonly string[];
  // MISSING: isStopListed
}
```

**Change:** Add one field after `modifierGroupIds`:

```typescript
modifierGroupIds: readonly string[];
isStopListed: boolean;   // ADD — QRM-09
```

After this change, run `pnpm --filter @resto/api-client gen` to regenerate `src/generated/api.ts` from the updated `docs/api/openapi.yaml`. The `public.ts` barrel export picks up `MenuItemDto` automatically.

---

### `apps/qr-menu/src/api/types.ts` (deleted — replace with `@resto/api-client/public` import)

**Current** (lines 1–6): local file explaining why it does NOT import from `@resto/domain`.

**Change:** Delete this file. Update `apps/qr-menu/src/App.tsx` and all component imports from `'../api/types'` to `'@resto/api-client/public'`. The reason in the comment ("don't import domain types — bundle size") still holds but does NOT apply to `@resto/api-client` which is a pure TS re-export with zero runtime code.

**Import update pattern** (from `apps/qr-menu/src/components/MenuView.tsx` line 1):

```typescript
// Before:
import type { MenuDto, MenuItemDto } from '../api/types';
// After:
import type { MenuDto, MenuItemDto } from '@resto/api-client/public';
```

Also add `"@resto/api-client": "workspace:*"` to `apps/qr-menu/package.json` dependencies.

---

### `apps/qr-menu/src/App.tsx` (component, extend)

**Analog:** `apps/qr-menu/src/App.tsx` (full file, 93 lines) — extend, do not rewrite.

**Routing pattern** (lines 9–68) — keep exactly; existing `parsePath`, `navigateToItem`, `navigateToMenu` are correct:

```typescript
const ITEM_PATH = /^\/items\/([^/]+)\/?$/;
const parsePath = (pathname: string): { kind: 'menu' } | { kind: 'item'; id: string } => { ... };
```

**New additions to `useEffect` blocks:**

(1) Table binding on mount — insert as a new `useEffect` after the existing two (lines 29–57):

```typescript
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const tableParam = params.get('table');
  if (tableParam) {
    useCartStore.getState().setTable(tableParam);
  }
}, []);
```

(2) Brand theme injection — in the `fetchMenu` success callback or in a separate effect after `state.kind === 'ready'`:

```typescript
useEffect(() => {
  if (state.kind === 'ready' && state.menu.brand?.theme?.primaryColor) {
    document.documentElement.style.setProperty(
      '--resto-accent',
      state.menu.brand.theme.primaryColor,
    );
  }
}, [state]);
```

**ItemDetail route render** (line 89) — extend to pass `groups`:

```typescript
// Before:
return <ItemDetail item={item} onBack={navigateToMenu} />;
// After:
const groups = state.menu.modifierGroups.filter((g) => item.modifierGroupIds.includes(g.id));
return <ItemDetail item={item} groups={groups} onBack={navigateToMenu} />;
```

---

### `apps/qr-menu/src/components/MenuView.tsx` (component, extend)

**Analog:** `apps/qr-menu/src/components/MenuView.tsx` (60 lines) + `apps/website/components/menu/menu-page-client.tsx` for cart trigger and isStopListed pass-through.

**Core loop pattern** (lines 38–57 of existing `MenuView.tsx`) — keep the category map and section rendering verbatim.

**Stop-list pass-through** — update `MenuItemCard` render (line 51):

```typescript
// Before:
<MenuItemCard item={item} onSelect={onSelectItem} />
// After:
<MenuItemCard item={item} onSelect={onSelectItem} isStopListed={item.isStopListed} />
```

**Cart trigger badge** — add to `Props` interface and insert above category list (mirrors `menu-page-client.tsx` lines 28–32 pattern, but without shadcn):

```typescript
interface Props {
  readonly menu: MenuDto;
  readonly onSelectItem: (id: string) => void;
  readonly onOpenCart: () => void; // ADD
}
```

**Brand header** — insert at top of `<main>` before `<h1>`:

```typescript
{menu.brand && (
  <header className="menu__header">
    {menu.brand.theme?.logoUrl && (
      <img className="menu__logo" src={menu.brand.theme.logoUrl} alt={menu.brand.displayName} />
    )}
    <h1 className="menu__brand">{menu.brand.displayName}</h1>
  </header>
)}
```

---

### `apps/qr-menu/src/components/MenuItemCard.tsx` (component, extend)

**Analog:** `apps/qr-menu/src/components/MenuItemCard.tsx` (48 lines) + `apps/website/components/menu/menu-item-card.tsx` for disabled state pattern.

**Disabled state logic** from `apps/website/components/menu/menu-item-card.tsx` lines 15–42 (logic reference only — NOT the Tailwind/Next styling):

```typescript
// website pattern to translate to qr-menu CSS classes:
const handleClick = () => {
  if (unavailable) return;   // guard — no action on disabled items
  onSelect(item.id);
};
// aria-disabled on the button:
aria-disabled={isStopListed ? 'true' : undefined}
// CSS: add 'menu-item--disabled' class when isStopListed
className={['menu-item', isStopListed ? 'menu-item--disabled' : ''].join(' ').trim()}
```

**Props extension:**

```typescript
interface Props {
  readonly item: MenuItemDto;
  readonly onSelect: (id: string) => void;
  readonly isStopListed?: boolean; // ADD
}
```

**CSS class pattern** — add to `styles.css` (mirrors `cursor-not-allowed opacity-50` from website):

```css
.menu-item--disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}
```

---

### `apps/qr-menu/src/components/ItemDetail.tsx` (component, extend)

**Analog:** `apps/qr-menu/src/components/ItemDetail.tsx` (48 lines — existing skeleton to extend) + `apps/website/components/menu/item-modal.tsx` (259 lines — logic reference for modifier selection).

**Modifier selection logic** from `apps/website/components/menu/item-modal.tsx` lines 40–113 — translate to qr-menu React (no Dialog/Sheet from shadcn; keep existing `<main className="item">` scaffold):

**New `Props` interface:**

```typescript
interface Props {
  readonly item: MenuItemDto;
  readonly groups: readonly MenuModifierGroupDto[]; // ADD — pre-resolved at App level
  readonly onBack: () => void;
}
```

**State + live price** (from `item-modal.tsx` lines 41–66):

```typescript
const defaultSizeId =
  item.sizes.find((s) => s.isDefault)?.id ?? item.sizes[0]?.id ?? null;
const [selectedSizeId, setSelectedSizeId] = useState<string | null>(null);
const [selectedOptions, setSelectedOptions] = useState<
  Map<string, Set<string>>
>(new Map());
const effectiveSizeId = selectedSizeId ?? defaultSizeId;

const livePrice = useMemo(() => {
  let base = parseMinorUnits(item.basePrice);
  if (effectiveSizeId) {
    const size = item.sizes.find((s) => s.id === effectiveSizeId);
    if (size) base = parseMinorUnits(size.price);
  }
  for (const group of groups) {
    const chosen = selectedOptions.get(group.id);
    if (!chosen) continue;
    for (const opt of group.options) {
      if (chosen.has(opt.id)) base += parseMinorUnits(opt.priceDelta);
    }
  }
  return formatMinorUnits(base);
}, [item, effectiveSizeId, groups, selectedOptions]);
```

Note: Use `parseMinorUnits`/`formatMinorUnits` imported from `@resto/cart` (not the float-based `parseFloat` used in the website version which uses minor-units helpers via cart-line-item — the `@resto/cart` exported versions are decimal-safe).

**`toggleOption` pattern** (from `item-modal.tsx` lines 68–84) — copy verbatim (pure logic, no framework dependency).

**`handleAddToCart` pattern** (from `item-modal.tsx` lines 86–113):

```typescript
const handleAddToCart = () => {
  const modifiers: CartModifier[] = [];
  for (const group of groups) {
    const chosen = selectedOptions.get(group.id);
    if (!chosen) continue;
    for (const opt of group.options) {
      if (chosen.has(opt.id)) {
        modifiers.push({
          optionId: opt.id,
          name: localized(opt.name), // qr-menu uses localized() without locale arg
          priceDelta: opt.priceDelta,
          amount: 1,
        });
      }
    }
  }
  useCartStore.getState().addItem({
    itemId: item.id,
    sizeId: effectiveSizeId,
    name: localized(item.name),
    unitPrice: livePrice,
    currency: item.currency,
    modifiers,
  });
  onBack();
};
```

---

### `apps/qr-menu/src/components/CartDrawer.tsx` (NEW component, CRUD)

**Analog:** `apps/website/components/menu/cart-drawer.tsx` (132 lines) — logic reference only. Do NOT use `Sheet`, `ScrollArea`, `Button`, `AlertDialog` from shadcn. Implement with plain HTML + CSS using the qr-menu class convention.

**Structure to translate** (from `cart-drawer.tsx` lines 29–131):

```typescript
// props:
interface CartDrawerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly currency: string;
}

// store access pattern (lines 32–34):
const items = useCartStore((s) => s.items);
const subtotal = useCartStore(selectSubtotal);
const clearCart = useCartStore((s) => s.clearCart);
const table = useCartStore((s) => s.table);
```

**Key structural pattern** — slide-over via CSS position:fixed + transform (qr-menu convention replaces shadcn Sheet):

```css
.cart-drawer {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  justify-content: flex-end;
}
.cart-drawer__panel {
  width: min(400px, 100vw);
  height: 100%;
  background: var(--resto-card-bg);
  transform: translateX(100%);
  transition: transform 0.25s ease;
  display: flex;
  flex-direction: column;
}
.cart-drawer--open .cart-drawer__panel {
  transform: translateX(0);
}
```

**Empty state, item list, subtotal display, close button** — translate from `cart-drawer.tsx` lines 43–131 replacing shadcn components with plain HTML.

**Table display** — show `cart.table` value at the footer above subtotal (no analog in website cart-drawer; new for QRM-08).

---

### `apps/qr-menu/src/components/CartLineItem.tsx` (NEW component, CRUD)

**Analog:** `apps/website/components/menu/cart-line-item.tsx` (128 lines) — logic reference only. No Lucide icons, no shadcn Button, no `toast`.

**`lineTotal` helper** (lines 24–30 of `cart-line-item.tsx`):

```typescript
function lineTotal(item: CartLineItemType): string {
  let cost = parseMinorUnits(item.unitPrice);
  for (const mod of item.modifiers) {
    cost += parseMinorUnits(mod.priceDelta);
  }
  return formatMinorUnits(cost * item.quantity);
}
```

Import `parseMinorUnits`/`formatMinorUnits` from `@resto/cart` instead of duplicating.

**Store action pattern** (lines 37–42 of `cart-line-item.tsx`):

```typescript
const updateQuantity = useCartStore((s) => s.updateQuantity);
const removeItem = useCartStore((s) => s.removeItem);
```

**Quantity controls structure** (lines 79–105 of `cart-line-item.tsx`) — translate button/minus/plus pattern to plain `<button>` elements with qr-menu CSS classes.

---

### `apps/qr-menu/src/components/TableBanner.tsx` (NEW component, event-driven)

**Analog:** Pattern from `apps/qr-menu/src/App.tsx` — same SPA useCartStore access + plain HTML pattern.

**Pattern:**

```typescript
import { useCartStore } from '@resto/cart';
import { t } from '../i18n';

export const TableBanner = () => {
  const table = useCartStore((s) => s.table);
  const setTable = useCartStore((s) => s.setTable);
  const [input, setInput] = useState('');

  if (table) {
    return (
      <div className="table-banner">
        <span>{t('table.current', { table })}</span>
        <button type="button" onClick={() => { setTable(null); }}>
          {t('table.change')}
        </button>
      </div>
    );
  }
  return (
    <form className="table-banner table-banner--entry"
      onSubmit={(e) => { e.preventDefault(); if (input.trim()) setTable(input.trim()); }}>
      <label htmlFor="table-input">{t('table.prompt')}</label>
      <input id="table-input" value={input} onChange={(e) => { setInput(e.target.value); }} />
      <button type="submit">{t('table.confirm')}</button>
    </form>
  );
};
```

---

### `apps/qr-menu/src/components/LocaleSwitcher.tsx` (NEW component, event-driven)

**Analog:** `apps/qr-menu/src/i18n/index.ts` lines 36–40 — `setLocale`/`getActiveLocale` are the API.

**Pattern:**

```typescript
import { setLocale, getActiveLocale, type Locale } from '../i18n';
import { t } from '../i18n';

const LOCALES: Locale[] = ['en', 'ru'];

export const LocaleSwitcher = () => (
  <div className="locale-switcher" role="navigation" aria-label={t('locale.label')}>
    {LOCALES.map((locale) => (
      <button
        key={locale}
        type="button"
        aria-current={getActiveLocale() === locale ? 'true' : undefined}
        className={['locale-btn', getActiveLocale() === locale ? 'locale-btn--active' : ''].join(' ').trim()}
        onClick={() => {
          document.cookie = `locale=${locale}; path=/; max-age=31536000`;
          setLocale(locale);
          window.location.reload();
        }}
      >
        {locale.toUpperCase()}
      </button>
    ))}
  </div>
);
```

Note: `window.location.reload()` is the accepted approach per RESEARCH.md (A3). The React-context alternative is deferred.

---

### `apps/qr-menu/src/i18n/index.ts` (utility, extend)

**Analog:** Same file, lines 8–18 — the existing `detectLocale` function.

**Current `detectLocale`** (lines 8–18):

```typescript
const detectLocale = (): Locale => {
  const candidates: string[] =
    typeof navigator !== 'undefined'
      ? [navigator.language, ...navigator.languages]
      : ['en'];
  for (const candidate of candidates) {
    const short = candidate.toLowerCase().split('-')[0];
    if (short && short in RESOURCES) return short;
  }
  return 'en';
};
```

**Extended version** (prepend URL + cookie checks before navigator):

```typescript
const detectLocale = (): Locale => {
  const pathMatch = /^\/(en|ru)(\/|$)/.exec(window.location.pathname);
  if (pathMatch?.[1] && pathMatch[1] in RESOURCES)
    return pathMatch[1] as Locale;
  const cookieLocale = document.cookie
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith('locale='))
    ?.split('=')[1];
  if (cookieLocale && cookieLocale in RESOURCES) return cookieLocale as Locale;
  const candidates: string[] =
    typeof navigator !== 'undefined'
      ? [navigator.language, ...navigator.languages]
      : ['en'];
  for (const candidate of candidates) {
    const short = candidate.toLowerCase().split('-')[0];
    if (short && short in RESOURCES) return short;
  }
  return 'en';
};
```

All other exports (`t`, `setLocale`, `getActiveLocale`, `localized`) remain unchanged.

---

### `apps/qr-menu/vite.config.ts` (config, modify)

**Analog:** Same file, lines 7–16 — the `build` object.

**Current** (lines 7–16):

```typescript
build: {
  target: 'es2022',
  sourcemap: true,
  rollupOptions: {
    output: {
      manualChunks: {
        react: ['react', 'react-dom'],
      },
    },
  },
},
```

**Change:** One character change — `sourcemap: true` → `sourcemap: 'hidden'` (line 9).

---

### `apps/qr-menu/test/bundle-no-dev-leak.spec.ts` (test, extend)

**Analog:** Same file, lines 1–52 — the full existing test file.

**Pattern to follow** from existing file:

- `readBundleJs()` helper (lines 10–15) — reuse as-is; no rebuild needed if the new test is inside the same `describe` block
- `execSync('pnpm --filter @resto/qr-menu build', ...)` pattern (lines 25–29) — the existing tests already build; the new test is appended inside the same `describe('qr-menu prod bundle', ...)` (line 17)

**New test to add** after line 51 (before the closing `}`):

```typescript
it('emits .map files but does not reference them inline (hidden source maps)', () => {
  const mapFiles = readdirSync(distAssets).filter((f) => f.endsWith('.map'));
  const bundle = readBundleJs();
  expect(
    mapFiles.length,
    'hidden source maps: .map files must exist',
  ).toBeGreaterThan(0);
  expect(
    bundle,
    'hidden source maps: no inline sourceMappingURL comment allowed',
  ).not.toContain('sourceMappingURL');
}, 60_000);
```

Note: No new `execSync` build call needed — Vitest runs `describe` sequentially; `distAssets` is already populated by the two prior tests.

---

## Shared Patterns

### Store access pattern (all qr-menu components using `@resto/cart`)

**Source:** `apps/website/components/menu/cart-drawer.tsx` lines 32–34
**Apply to:** `CartDrawer.tsx`, `CartLineItem.tsx`, `TableBanner.tsx`, `App.tsx`

```typescript
import { useCartStore, selectSubtotal, selectItemCount } from '@resto/cart';

const items = useCartStore((s) => s.items);
const subtotal = useCartStore(selectSubtotal);
// Direct store access (non-hook) for imperative calls:
useCartStore.getState().setTable(tableParam);
```

### i18n usage pattern (all qr-menu components)

**Source:** `apps/qr-menu/src/components/MenuItemCard.tsx` lines 2, 14, 23
**Apply to:** all new qr-menu components

```typescript
import { localized, t } from '../i18n';
// For localizedText fields:
localized(item.name);
// For i18n key lookup:
t('item.back');
```

### CSS variable theming pattern (qr-menu)

**Source:** `apps/qr-menu/src/styles.css` lines 1–11
**Apply to:** all new CSS classes in `styles.css`

```css
:root {
  --resto-bg: #f7f5f2;
  --resto-fg: #111;
  --resto-muted: #555;
  --resto-accent: #c1272d; /* overridden at runtime from brand.theme.primaryColor */
  --resto-card-bg: #fff;
  --resto-radius: 12px;
}
/* New classes use var(--resto-*) tokens, never hardcoded hex */
```

### SPA navigation pattern (qr-menu)

**Source:** `apps/qr-menu/src/App.tsx` lines 59–67
**Apply to:** any qr-menu component that needs navigation

```typescript
const navigateToItem = (id: string): void => {
  window.history.pushState(null, '', `/items/${id}`);
  setRoute({ kind: 'item', id });
};
```

No React Router. History API + `popstate` listener only.

### Backend field-addition pattern (catalog domain)

**Source:** `apps/api/src/contexts/catalog/interfaces/http/public-menu.controller.ts` lines 36–55
**Apply to:** QRM-09 stop-list field addition
The 4-layer chain for adding a field: (1) domain interface (`published-menu.ts`), (2) repository mapping (`catalog-drizzle.repository.ts`), (3) controller Zod schema (`public-menu.controller.ts`), (4) `@resto/api-client` regen. Convention: Zod schema field added to `PublishedMenuItemSchema` at line 54, immediately after `modifierGroupIds`.

---

## No Analog Found

All files have analogs. No entries.

---

## Metadata

**Analog search scope:** `packages/ui/`, `packages/api-client/`, `apps/website/store/`, `apps/website/components/menu/`, `apps/qr-menu/src/`, `apps/api/src/contexts/catalog/`
**Files scanned:** 22
**Pattern extraction date:** 2026-06-12
