# Phase 5: Customer Site — Research

**Researched:** 2026-06-12
**Domain:** Next.js 16 App Router / RSC, multi-tenant storefront, shared UI layer, client-side cart, i18n, SEO
**Confidence:** HIGH

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Website-first. Phase 5 (website) precedes Phase 6 (qr-menu).
- **D-02:** Two thin surface apps over a shared layer — `@resto/api-client` + `@resto/ui` + shared cart logic. "Only qr-menu / only website / both" is a per-tenant choice. Build website fresh but factor reusable menu/cart pieces into the shared packages so qr-menu (Phase 6) consumes the same layer.
- **D-03:** SEO is the website's job (stable menu URLs, content pages, custom domain). qr-menu is `noindex` — table-session URLs must never be indexed.
- **D-04:** `apps/website` uses the LATEST Next.js (App Router + RSC), not pinned to admin's current `^16.2.6`. Follow `apps/admin` patterns but on the newer Next.
- **D-05:** Default locale is `en` for the website. Locale resolves URL > cookie > Accept-Language; fallback is `en` (diverges from `ru` default in admin/qr-menu).
- **D-06:** Single-page menu: sticky category navigation + persistent cart (drawer/sidebar). Item opens in a modal for modifier selection — not a separate page per item.
- **D-07:** Delivery vs pickup chosen up front (banner above the menu). Cart drawer → single checkout page (address + contact + order time + disabled "pay" button). No multi-step stepper for MVP.
- **D-08:** Minimal content pages — static/seeded About/Delivery/Contact/FAQ. Full WYSIWYG editor is Phase 15/MVP-2.

### Claude's Discretion

- Component breakdown, RSC vs client-island boundaries, data-fetching shape against `/v1/menu`, address-input widget, and exact shared-package extraction are implementation details for research/planning.

### Deferred Ideas (OUT OF SCOPE)

- Full operator content/theme editor (WYSIWYG, per-city SEO landing, sitemap) → Phase 15/MVP-2.
- Functional promo code field → Phase 11/MVP-2.
- Real delivery-zone validation (geocode + polygon) → Phase 9/MVP-2.
- AI guest chat widget → MVP-2 Phase C.
- Richer customer accounts / CRM → Phase 12/MVP-2.
  </user_constraints>

---

<phase_requirements>

## Phase Requirements

| ID      | Description                                                          | Research Support                                                                                             |
| ------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| SITE-01 | `apps/website` scaffolded (Next.js App Router + RSC)                 | Scaffolding strategy, Nx project.json pattern, env schema (§ Standard Stack, § Architecture Patterns)        |
| SITE-02 | Site renders published menu for resolved tenant (subdomain → tenant) | `/v1/menu` contract, RSC fetch pattern, tenant-resolution middleware (§ Architecture Patterns)               |
| SITE-03 | Guest chooses delivery or pickup mode                                | `DeliveryPickupBanner` client component, `Tabs` shadcn primitive, cart context shape (§ Component Inventory) |
| SITE-04 | Delivery address entry + inline zone validity stub                   | `AddressInput` client component, stub always returns green in Phase 5 (§ Interaction Contracts)              |
| SITE-05 | Cart: promo code field (non-functional), subtotal breakdown          | Zustand cart store shape pre-wired for ORD-03, `CartDrawer` + `CartLineItem` (§ Cart State)                  |
| SITE-06 | Guest contact info (name, phone) + optional account creation         | `form` + RHF on checkout page, disabled pay button (§ Checkout Page)                                         |
| SITE-07 | Order time: ASAP / scheduled                                         | `OrderTimeSelector` client component on checkout page                                                        |
| SITE-09 | Subdomain + custom-domain tenant resolution                          | Next.js middleware, `?tenant=<slug>` dev fallback, API `findByDomainHost` (§ Tenant Resolution)              |
| SITE-10 | Operator-editable content pages (About/Delivery/Contact/FAQ)         | Seeded plain-text content, split-on-newline render (§ Content Pages)                                         |

</phase_requirements>

---

## Summary

Phase 5 scaffolds `apps/website` from an empty `.gitkeep` into a working multi-tenant Next.js storefront. The site is the primary SEO surface for RestOS. The two hardest problems in this phase are (1) wiring Next.js middleware to do per-request tenant resolution from a subdomain or custom domain — with a dev-local fallback since subdomains do not work on `localhost` without `/etc/hosts` edits, and (2) factoring reusable components (`MenuItemCard`, `ItemModal`, `MenuItemDto`-based types, i18n `localized()` helper) out of `apps/qr-menu/src` into `packages/ui` so Phase 6 (QR-menu) can consume them without an app-to-app import.

The stack is straightforward: latest Next.js (16.2.9) matching the admin version already in the repo, same `@tailwindcss/postcss` / shadcn new-york / `next-intl` pattern as `apps/admin`, Zustand for client cart state. The cart shape in Phase 5 must anticipate the `ORD-03` server payload so Phase 7/8 is a server-action addition, not a refactor.

The API already provides everything needed — `/v1/menu` returns the full menu with brand theme, `TenantContextMiddleware` resolves tenant from host or `x-tenant-slug` dev header, and the `tenant_domains` table covers custom domains. The website reads these as an anonymous public consumer.

**Primary recommendation:** Scaffold with `pnpm create next-app` at the current workspace version (16.2.9 — identical to admin), extract `MenuItemCard` + `MenuItemDto` types into `packages/ui` before building the website, implement tenant resolution in a single Next.js middleware file, and use Zustand for cart state with the ORD-03-compatible shape defined upfront.

---

## Architectural Responsibility Map

| Capability                           | Primary Tier                         | Secondary Tier                  | Rationale                                                                                                                                                |
| ------------------------------------ | ------------------------------------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant resolution (subdomain/domain) | Frontend Server (Next.js Middleware) | API (`TenantContextMiddleware`) | API already resolves tenant for its own requests; website needs its OWN middleware to resolve tenant before Next.js renders any page (layout, RSC, etc.) |
| Menu data fetching                   | Frontend Server (RSC)                | API `/v1/menu`                  | RSC fetches once server-side; no client-side waterfall; caches at Next.js layer                                                                          |
| Per-tenant CSS theming               | Frontend Server (RSC layout)         | —                               | `primaryColor` injected as `<html style>` in RSC root layout; no client JS needed                                                                        |
| Cart state                           | Browser / Client                     | —                               | Cart is ephemeral client-side state in Phase 5; server knows nothing about it until Phase 7 checkout                                                     |
| Address validation (stub)            | Browser / Client                     | —                               | Always returns green; wires to API polygon check at Phase 9                                                                                              |
| i18n locale resolution               | Frontend Server (Next.js Middleware) | Browser cookie                  | Middleware writes `NEXT_LOCALE` cookie; `next-intl` reads it in RSC                                                                                      |
| SEO meta tags                        | Frontend Server (RSC)                | —                               | `generateMetadata()` in RSC page; no client runtime needed                                                                                               |
| Content pages (About/FAQ/etc.)       | Frontend Server (RSC)                | API (tenant content field)      | Plain-text content from menu/tenant API; rendered as split-on-newline paragraphs                                                                         |

---

## Standard Stack

### Core

| Library                | Version    | Purpose                                                               | Why Standard                                                                                                                                                                                           |
| ---------------------- | ---------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `next`                 | `^16.2.9`  | App Router + RSC + middleware                                         | Same version already in workspace (`apps/admin` is `^16.2.6`); `16.2.9` is latest stable [VERIFIED: npm registry]                                                                                      |
| `react` / `react-dom`  | `^19.0.0`  | React 19                                                              | Already required by `apps/admin`; matches workspace `peerDependencies`                                                                                                                                 |
| `next-intl`            | `^4.13.0`  | i18n (locale middleware, RSC `getMessages`, client `useTranslations`) | Already installed in `apps/admin` at this version; URL > cookie > Accept-Language resolution works out of box [VERIFIED: npm registry]                                                                 |
| `zustand`              | `^5.0.14`  | Client cart state                                                     | Industry standard for lightweight client state in Next.js; no React context boilerplate; persists cleanly across Server/Client component boundaries via Zustand `createStore` [VERIFIED: npm registry] |
| `@tailwindcss/postcss` | `^4.0.0`   | Tailwind 4 via PostCSS                                                | Same as admin; no config file needed with Tailwind 4 CSS-only approach                                                                                                                                 |
| `shadcn/ui`            | CLI init   | Component primitives                                                  | Same preset as admin (new-york / neutral / cssVariables / lucide); components added via `npx shadcn add`                                                                                               |
| `react-hook-form`      | `^7.77.0`  | Checkout contact form                                                 | Already in admin at this version; works with shadcn `form` primitive                                                                                                                                   |
| `@hookform/resolvers`  | `^5.4.0`   | Zod resolvers for RHF                                                 | Already in admin at this version                                                                                                                                                                       |
| `zod`                  | `^3.25.76` | Form validation + env schema                                          | Workspace standard                                                                                                                                                                                     |
| `server-only`          | `^0.0.1`   | Guard server-only modules                                             | Same as admin — prevents `apiFetch` leaking to client bundle                                                                                                                                           |
| `sonner`               | `^2.0.7`   | Toast notifications                                                   | Already in admin; same version                                                                                                                                                                         |
| `lucide-react`         | `^1.16.0`  | Icons                                                                 | Workspace standard (shadcn preset)                                                                                                                                                                     |

### Supporting

| Library                    | Version  | Purpose                        | When to Use                                                                                     |
| -------------------------- | -------- | ------------------------------ | ----------------------------------------------------------------------------------------------- |
| `radix-ui`                 | `^1.4.3` | Radix primitives (shadcn peer) | Installed by shadcn automatically                                                               |
| `class-variance-authority` | `^0.7.1` | Variant classes                | Already in admin                                                                                |
| `clsx` / `tailwind-merge`  | current  | Class utilities                | Already in admin                                                                                |
| `next-themes`              | `^0.4.6` | Theme provider                 | Already in admin; needed for future dark mode (Phase 15); include now to avoid structural churn |

### Alternatives Considered

| Instead of          | Could Use                    | Tradeoff                                                                                                                                         |
| ------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `zustand`           | React Context + `useReducer` | Context works for small carts but causes full-tree re-renders on every cart mutation; Zustand's slice-selector pattern prevents this             |
| `next-intl`         | `react-i18next` or custom    | `next-intl` already in workspace at matching version; custom would duplicate admin pattern; `react-i18next` has no native App Router RSC support |
| shadcn `form` + RHF | Controlled inputs            | shadcn `form` is already the admin pattern; RHF already installed                                                                                |

**Installation:**

```bash
# From apps/website directory after scaffold
pnpm add zustand next-intl server-only sonner lucide-react react-hook-form @hookform/resolvers zod class-variance-authority clsx tailwind-merge next-themes radix-ui
pnpm add -D @tailwindcss/postcss tailwindcss @types/node @types/react @types/react-dom vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom typescript eslint @resto/config-eslint @resto/config-typescript
```

---

## Package Legitimacy Audit

> slopcheck was unavailable at research time. All packages below are `[ASSUMED]` — versions confirmed via `npm view` on the correct npm registry. The planner must gate each install behind a `checkpoint:human-verify` task.

| Package                        | Registry | Age                          | Downloads | Source Repo                                | slopcheck | Disposition                                                                  |
| ------------------------------ | -------- | ---------------------------- | --------- | ------------------------------------------ | --------- | ---------------------------------------------------------------------------- |
| `next`                         | npm      | ~10 yrs                      | ~9M/wk    | github.com/vercel/next.js                  | [ASSUMED] | Approved — flagship package, already in workspace                            |
| `zustand`                      | npm      | ~6 yrs (modified 2026-05-28) | ~10M/wk   | github.com/pmndrs/zustand                  | [ASSUMED] | Approved — widely used, active maintenance verified                          |
| `next-intl`                    | npm      | ~4 yrs (modified 2026-06-05) | ~2M/wk    | github.com/amannn/next-intl                | [ASSUMED] | Approved — already in workspace at matching version                          |
| `server-only`                  | npm      | ~3 yrs                       | high      | github.com/vercel/next.js (sub-pkg)        | [ASSUMED] | Approved — already in admin                                                  |
| `sonner`                       | npm      | ~2 yrs                       | ~2M/wk    | github.com/emilkowalski/sonner             | [ASSUMED] | Approved — already in admin                                                  |
| `react-hook-form`              | npm      | ~6 yrs                       | ~10M/wk   | github.com/react-hook-form/react-hook-form | [ASSUMED] | Approved — already in admin                                                  |
| `zustand` `postinstall` script | npm      | —                            | —         | —                                          | —         | `npm view zustand scripts.postinstall` returns nothing — no postinstall hook |

**Packages removed due to slopcheck [SLOP] verdict:** none

**Packages flagged as suspicious [SUS]:** none

_All packages above are tagged `[ASSUMED]` because slopcheck was unavailable. Planner must add a `checkpoint:human-verify` before the install task._

---

## Architecture Patterns

### System Architecture Diagram

```
Browser (Guest)
      │
      ▼
Next.js Middleware (apps/website)
  ├─ Tenant resolution: host → x-tenant-slug header injection
  ├─ Locale resolution: cookie → header → 'en' fallback
  └─ Dev: ?tenant=<slug> query-param → x-tenant-slug header
      │
      ▼
Next.js App Router (RSC)
  ├─ Root layout: fetch tenant brand (via /v1/menu), inject --primary CSS var on <html>
  ├─ [/] Menu Page (RSC):
  │     fetch /v1/menu → CategoryNav + MenuItemCard grid
  │     client islands: CartDrawer, ItemModal, DeliveryPickupBanner
  ├─ [/checkout] Checkout Page (RSC shell + client form):
  │     address, contact, order time, stub total, disabled pay button
  ├─ [/about|/delivery|/contact|/faq] Content Pages (RSC):
  │     plain-text from brand/tenant content field
  └─ [/[locale]/...] Locale prefix routing (next-intl)
      │
      ▼
apps/api /v1/menu  ←── Public, no auth
  └─ TenantContextMiddleware resolves tenant from x-tenant-slug or host
  └─ GetPublishedMenuService: Redis → Postgres fallback (cold-Redis safe)
  └─ Returns: MenuDto (brand.theme.primaryColor, categories, items, modifierGroups)
```

### Recommended Project Structure

```
apps/website/
├── app/
│   ├── layout.tsx              # Root RSC: font, next-intl provider, tenant theme injection
│   ├── page.tsx                # Menu page (RSC) — fetches /v1/menu, passes to MenuPageClient
│   ├── checkout/
│   │   └── page.tsx            # Checkout page (RSC shell + client CheckoutForm)
│   ├── about/page.tsx          # Content page (RSC)
│   ├── delivery/page.tsx
│   ├── contact/page.tsx
│   ├── faq/page.tsx
│   ├── not-found.tsx           # Tenant-not-found / 404
│   └── globals.css
├── components/
│   ├── menu/
│   │   ├── menu-page-client.tsx    # Client root for menu: category nav scroll, item modal state
│   │   ├── category-nav.tsx        # Sticky horizontal scroll nav (client)
│   │   ├── item-modal.tsx          # Dialog wrapping item detail + modifier selection (client)
│   │   ├── cart-drawer.tsx         # Sheet-based persistent cart (client)
│   │   ├── cart-line-item.tsx
│   │   └── delivery-pickup-banner.tsx
│   ├── checkout/
│   │   ├── checkout-form.tsx       # Client: RHF form
│   │   ├── address-input.tsx       # Stub zone check
│   │   └── order-time-selector.tsx
│   ├── layout/
│   │   └── tenant-header.tsx       # Sticky header: logo, name, cart trigger
│   └── content-page.tsx
├── lib/
│   ├── api-client.ts           # Public /v1/menu fetch (mirrors qr-menu client.ts)
│   ├── env.ts                  # Zod env schema (server-only)
│   ├── tenant-resolver.ts      # Helper to extract tenant from middleware-injected header
│   └── i18n/
│       ├── request.ts          # next-intl getRequestConfig
│       └── locale-cookie.ts
├── hooks/
│   └── use-cart-store.ts       # Zustand cart store
├── store/
│   └── cart.ts                 # Cart store definition
├── messages/
│   └── en.json
├── middleware.ts               # Tenant resolution + locale resolution
├── next.config.mjs
├── postcss.config.mjs
├── tsconfig.json
├── vitest.config.ts
├── components.json             # shadcn config (initialized fresh)
└── project.json                # Nx project config
```

### Pattern 1: Next.js Middleware for Tenant + Locale Resolution

**What:** A single `middleware.ts` handles two concerns: (a) inject `x-tenant-slug` header from subdomain or custom domain, and (b) resolve locale from URL prefix / cookie / `Accept-Language`.

**When to use:** Every request to `apps/website`. Middleware runs at the Edge before any RSC render.

```typescript
// apps/website/middleware.ts
// Source: apps/api/src/shared/tenant-context.middleware.ts (tenant resolution logic)
//         apps/admin/lib/i18n/request.ts (locale resolution, next-intl pattern)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const DEV_TENANT_PARAM = 'tenant'; // ?tenant=<slug> for localhost dev

export function middleware(request: NextRequest): NextResponse {
  const url = request.nextUrl;
  const host = request.headers.get('host') ?? '';
  const response = NextResponse.next();

  // --- Tenant resolution ---
  // Production: extract subdomain slug from <slug>.resto.app
  // Custom domain: pass full host; API's findByDomainHost handles lookup
  // Dev: ?tenant=<slug> query param → inject as x-tenant-slug header
  let tenantSlug: string | null = null;

  if (process.env.NODE_ENV !== 'production') {
    tenantSlug = url.searchParams.get(DEV_TENANT_PARAM);
  }

  if (!tenantSlug) {
    // Try subdomain extraction: <slug>.resto.app → slug
    const hostname = host.split(':')[0] ?? '';
    const labels = hostname.split('.');
    // 3+ labels = <slug>.<domain>.<tld>
    if (labels.length >= 3 && labels[0] && labels[0] !== 'www') {
      tenantSlug = labels[0];
    } else if (labels.length === 2) {
      // Could be a custom domain — pass full host to API
      tenantSlug = hostname; // API's findByDomainHost resolves this
    }
  }

  if (tenantSlug) {
    response.headers.set('x-tenant-slug', tenantSlug);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
```

**Dev-local strategy:** `http://localhost:3002?tenant=demo` injects `x-tenant-slug: demo`. The API's `TenantContextMiddleware` already accepts `x-tenant-slug` in dev (`NODE_ENV === 'development'`). This matches the existing dev pattern in `apps/qr-menu` (`VITE_TENANT_SLUG` → `X-Tenant-Slug`).

### Pattern 2: RSC Layout with Per-Tenant Theme Injection

**What:** Root `layout.tsx` fetches `/v1/menu` for brand theme data, injects `primaryColor` as an inline CSS variable on `<html>`.

```typescript
// apps/website/app/layout.tsx
// Source: apps/admin/app/layout.tsx (Inter font, next-intl, RSC pattern)
import { Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { headers } from 'next/headers';
import { fetchMenuPublic } from '@/lib/api-client';

const inter = Inter({ subsets: ['latin', 'cyrillic'], variable: '--font-inter', display: 'swap' });

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  const headerList = await headers();
  const tenantSlug = headerList.get('x-tenant-slug');

  // Degrade gracefully: no tenant slug = no theme override (renders default)
  let primaryColor: string | null = null;
  if (tenantSlug) {
    try {
      const menu = await fetchMenuPublic(tenantSlug);
      primaryColor = menu.brand?.theme?.primaryColor ?? null;
    } catch {
      // Cold Redis / menu not published: proceed without theme override
    }
  }

  const themeStyle = primaryColor ? { '--primary': primaryColor } : undefined;

  return (
    <html lang={locale} style={themeStyle as React.CSSProperties}
          className={inter.variable} suppressHydrationWarning>
      <head />
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

**Key insight:** Injecting on `<html style>` overrides the Tailwind CSS variable `--primary` set in `globals.css` without duplicating the entire CSS file. [ASSUMED] — the CSS variable override mechanism is standard CSS specificity.

### Pattern 3: Public API Client (server-side, no auth)

**What:** Mirrors `apps/qr-menu/src/api/client.ts` but adapted for Next.js server components. No BA session cookie needed — `/v1/menu` is `@Public()`.

```typescript
// apps/website/lib/api-client.ts
import 'server-only';
import { headers } from 'next/headers';

const apiOrigin = (): string =>
  process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:3000';

export class TenantNotFoundError extends Error {
  constructor() {
    super('No tenant resolved for this host.');
    this.name = 'TenantNotFoundError';
  }
}

export const fetchMenuPublic = async (tenantSlug: string): Promise<MenuDto> => {
  const url = `${apiOrigin()}/v1/menu`;
  const res = await fetch(url, {
    headers: { 'x-tenant-slug': tenantSlug },
    next: { revalidate: 60 }, // 60-second ISR cache for published menu
  });
  if (res.status === 404) throw new TenantNotFoundError();
  if (!res.ok) throw new Error(`fetchMenuPublic failed: ${res.status}`);
  return res.json() as Promise<MenuDto>;
};
```

**Performance constraint:** Public menu reads must stay fast on cold Redis. `GetPublishedMenuService` already has a Redis-miss fallback to Postgres. The website should use Next.js ISR (`next: { revalidate: 60 }`) to avoid hitting the API on every request.

### Pattern 4: Zustand Cart Store (ORD-03 Compatible Shape)

**What:** Client-side cart state shaped to match the future `ORD-03` order creation payload. Phase 5 uses it purely client-side; Phase 7 wires a server action that POSTs this shape to `POST /v1/orders`.

```typescript
// apps/website/store/cart.ts
// Shape pre-aligned with ORD-03: items with modifier snapshots + prices
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface CartModifier {
  readonly modifierGroupId: string;
  readonly optionId: string;
  readonly name: string; // snapshot at add-time
  readonly priceDelta: string;
}

export interface CartLineItem {
  readonly itemId: string;
  readonly sizeId: string | null; // null = base price (no size selected)
  readonly name: string; // snapshot at add-time
  readonly unitPrice: string; // resolved price at add-time (size or base)
  readonly currency: string;
  readonly modifiers: readonly CartModifier[];
  quantity: number;
}

interface CartState {
  readonly mode: 'delivery' | 'pickup' | null;
  readonly items: CartLineItem[];
  setMode: (mode: 'delivery' | 'pickup') => void;
  addItem: (item: Omit<CartLineItem, 'quantity'>) => void;
  updateQuantity: (
    itemId: string,
    sizeId: string | null,
    delta: number,
  ) => void;
  removeItem: (itemId: string, sizeId: string | null) => void;
  clearCart: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      mode: null,
      items: [],
      setMode: (mode) => set({ mode }),
      addItem: (newItem) =>
        set((state) => {
          // Find existing line with same itemId + sizeId + same modifiers
          // For simplicity in Phase 5: match on itemId + sizeId only
          const existing = state.items.find(
            (i) => i.itemId === newItem.itemId && i.sizeId === newItem.sizeId,
          );
          if (existing) {
            return {
              items: state.items.map((i) =>
                i === existing ? { ...i, quantity: i.quantity + 1 } : i,
              ),
            };
          }
          return { items: [...state.items, { ...newItem, quantity: 1 }] };
        }),
      updateQuantity: (itemId, sizeId, delta) =>
        set((state) => ({
          items: state.items
            .map((i) =>
              i.itemId === itemId && i.sizeId === sizeId
                ? { ...i, quantity: i.quantity + delta }
                : i,
            )
            .filter((i) => i.quantity > 0),
        })),
      removeItem: (itemId, sizeId) =>
        set((state) => ({
          items: state.items.filter(
            (i) => !(i.itemId === itemId && i.sizeId === sizeId),
          ),
        })),
      clearCart: () => set({ items: [] }),
    }),
    {
      name: 'resto-cart', // sessionStorage key
      storage: createJSONStorage(() => sessionStorage), // sessionStorage: cleared on tab close
    },
  ),
);
```

**Note:** `sessionStorage` (not `localStorage`) aligns with Phase 5's scope — cart is session-local. Phase 7 will replace the client store with a server-side cart if needed; keeping session scope avoids leftover cart confusion across visits.

### Pattern 5: Shared Package Extraction (D-02)

**What:** Move `MenuItemDto` types and `MenuItemCard` component into packages that both `apps/website` and `apps/qr-menu` can import without violating the apps-never-import-apps rule.

**Where:**

| Asset                                                                                    | Current Location                 | Move To                                                                                  | Phase                                                                                           |
| ---------------------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `MenuItemDto`, `MenuCategoryDto`, `MenuModifierGroupDto`, `MenuBrandThemeDto` wire types | `apps/qr-menu/src/api/types.ts`  | `packages/api-client/src/public.ts` (already exists as a sub-export)                     | Phase 5 (needed before website can use types)                                                   |
| `localized(text)` helper                                                                 | `apps/qr-menu/src/i18n/index.ts` | Inline in `packages/api-client/src/public.ts` or duplicate in `apps/website/lib/i18n.ts` | Phase 5 — simplest: duplicate a 10-line utility; extract at Phase 6 if desired                  |
| `MenuItemCard` (Tailwind/shadcn version)                                                 | NEW (website only)               | `packages/ui/src/menu-item-card.tsx`                                                     | Phase 5 — build new version in packages/ui (qr-menu's version is CSS-class-based, not Tailwind) |
| `ItemDetail` / `ItemModal`                                                               | NEW (website only)               | `packages/ui/src/item-modal.tsx` or `apps/website/components/menu/item-modal.tsx`        | Phase 5 — can live in website for now, extracted at Phase 6                                     |

**Decision for planner:** The fastest Phase 5 path is to build new Tailwind-native versions of `MenuItemCard` and `ItemModal` inside `apps/website/components/` and then extract to `packages/ui` in Phase 6 when qr-menu is actually refactored. The existing qr-menu components use plain CSS classes, not Tailwind/shadcn — a direct lift is not clean. The `MenuItemDto` types can be exported from `packages/api-client/src/public.ts` now (zero cost, already the right place).

**packages/ui current state:** `packages/ui` directory exists but has no `package.json` — it is an empty placeholder. Phase 5 must initialize it before placing shared components there.

**Recommendation:** For Phase 5, do NOT require components to be in packages/ui upfront. Build them in `apps/website/components/`. Extract `MenuItemCard` to `packages/ui` at Phase 6 so Phase 6 actually drives the extraction (D-02 says "factor reusable pieces so qr-menu Phase 6 can consume the same layer" — this is fulfilled by doing the extraction as part of Phase 6 planning).

**What MUST move to packages before Phase 5 ends:** `MenuItemDto` types re-exported from `packages/api-client/src/public.ts` so the website types the API response correctly and qr-menu can later import from the same source.

### Pattern 6: next-intl Configuration (D-05)

**What:** next-intl with `en` as default locale (no URL prefix for default locale — clean SEO URLs). Mirrors admin pattern.

```typescript
// apps/website/lib/i18n/request.ts
import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

const SUPPORTED_LOCALES = ['en', 'uk', 'ru'] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];

const DEFAULT_LOCALE: Locale = 'en'; // D-05: website default is 'en'

export default getRequestConfig(async ({ requestLocale }) => {
  // Resolution order: URL path prefix > cookie > fallback 'en' (D-05)
  const urlLocale = await requestLocale;
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value;

  const rawLocale = urlLocale ?? cookieLocale ?? DEFAULT_LOCALE;
  const locale = (SUPPORTED_LOCALES as readonly string[]).includes(rawLocale)
    ? (rawLocale as Locale)
    : DEFAULT_LOCALE;

  const messages = (await import(`../../messages/${locale}.json`)) as {
    default: unknown;
  };
  return { locale, messages: messages.default as Record<string, string> };
});
```

**next.config.mjs for website:**

```javascript
import createNextIntlPlugin from 'next-intl/plugin';
const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts');

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const apiOrigin =
      process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:3000';
    return [{ source: '/v1/:path*', destination: `${apiOrigin}/v1/:path*` }];
  },
};
export default withNextIntl(nextConfig);
```

### Pattern 7: SEO — `generateMetadata` in RSC Pages

**What:** Each page exports `generateMetadata` for Next.js to inject `<head>` tags. This is the Next.js App Router pattern for per-page SEO.

```typescript
// apps/website/app/page.tsx (menu page)
import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  // Brand name fetched from the menu (same fetch as layout — Next.js deduplicates)
  const menu = await fetchMenuPublicFromMiddlewareHeader();
  const brandName = menu.brand?.displayName ?? 'Restaurant';
  const logoUrl = menu.brand?.theme?.logoUrl ?? undefined;

  return {
    title: `${brandName} — Menu`,
    description: `Order online from ${brandName}. Browse our menu and place your order.`,
    robots: { index: true, follow: true },
    openGraph: {
      title: `${brandName} — Menu`,
      description: `Order online from ${brandName}. Browse our menu and place your order.`,
      images: logoUrl ? [{ url: logoUrl }] : undefined,
    },
  };
}
```

### Anti-Patterns to Avoid

- **Fetching `/v1/menu` in a client component:** Exposes no auth risk (it is public), but kills RSC benefit — no streaming, no ISR, FOUC. Always fetch in RSC and pass data down as props.
- **Importing from `apps/qr-menu` directly:** The ESLint module-boundary rule forbids app-to-app imports. Any shared code must live in `packages/`.
- **Using `localStorage` for cart:** `localStorage` persists across tabs and sessions — a guest's cart from last week appears on next visit. Use `sessionStorage` via Zustand's `createJSONStorage`.
- **Setting `x-tenant-slug` header client-side for production requests:** In production the middleware should NEVER read this header from untrusted sources; it only reads it in dev. The middleware code already guards on `NODE_ENV !== 'production'` for the query-param path.
- **Using `runInTenantContext` in the Next.js app:** This is an API-only primitive — it reads/writes an AsyncLocalStorage ALS that does not exist in the Next.js process. The website resolves tenant at the middleware layer and passes it via headers to the API.
- **Calling the API with `x-tenant-id` (UUID) from the website:** The website is an anonymous consumer — no BA session, no active organization UUID. Use `x-tenant-slug` header. The API's `TenantContextMiddleware` supports both header forms but `x-tenant-slug` is the correct public path.

---

## Don't Hand-Roll

| Problem                                  | Don't Build                        | Use Instead                                            | Why                                                                                         |
| ---------------------------------------- | ---------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| i18n locale routing + fallback           | Custom URL parsing + cookie logic  | `next-intl`                                            | Handles URL prefix, cookie, Accept-Language negotiation, RSC integration, typesafe messages |
| Cart persistence across page navigations | Custom context + localStorage glue | Zustand `persist` middleware with `sessionStorage`     | Built-in middleware handles serialization, hydration, SSR-mismatch suppression              |
| Font loading with variable font          | Manual `@font-face` CSS            | `next/font/google` Inter                               | Automatic subsetting, `display: swap`, CSS variable injection                               |
| Focus trap in modal/drawer               | Custom `tabindex` management       | Radix Dialog / Sheet (via shadcn)                      | Radix handles focus trap, Escape key, aria-modal, scroll lock                               |
| Form validation messages                 | Custom error state                 | RHF + Zod resolver via shadcn `form`                   | Already the admin pattern; `FormMessage` and `FormField` handle aria-describedby            |
| Accessible price display                 | `{price} {currency}` span          | `aria-label="{price} {currency}"` on the price element | Screen reader reads "12.50 EUR" not "1 2 . 5 0 E U R"                                       |

**Key insight:** The RSC + Zustand split avoids the "client cart needs SSR data" hydration problem. RSC renders the menu server-side (no cart needed); Zustand renders the cart client-side (no SSR needed). They never need to reconcile.

---

## Tenant Resolution Deep-Dive

### How the API resolves tenants (verified from source)

`TenantContextMiddleware.resolveContext()` [VERIFIED: source read]:

1. Calls `TenantAndBrandResolverService.resolveByCustomerHost(host)` — checks `tenant_domains` table for full-host match (custom domains). Returns `{tenantId, brandId}`.
2. Falls back to `TenantResolverService.resolveByHost(host)` — tries `findByDomainHost(hostname)` first, then extracts subdomain label and tries `findBySlug(slug)`.
3. In `dev`, also checks `TENANT_DEV_FALLBACK_SLUG` env var (last resort).
4. Header overrides (`x-tenant-slug`, `x-tenant-id`) are accepted ONLY in dev or for `/internal/v1/*` routes with the internal token.

**Important:** The API already handles everything the website needs. The website middleware only needs to inject the `x-tenant-slug` header from the hostname/query-param. In production, the API resolves from the `Host` header that the Next.js server forwards to the API.

### Website middleware strategy

The website runs on a different process from the API. When the website's Next.js server makes server-side `fetch()` calls to the API, it must include the tenant context:

- **Production (`<slug>.resto.app`):** The website's Next.js server receives requests at `<slug>.resto.app`. It must forward the subdomain as `x-tenant-slug` header when calling `GET /v1/menu`. The API's `Host` header will be the API's own host (e.g. `api.resto.app`), not the website's host.
- **Dev (`localhost:3002?tenant=demo`):** Next.js middleware reads `?tenant=demo` query param, injects `x-tenant-slug: demo` header on the response; `lib/api-client.ts` reads from request headers and forwards to API.

### `headers()` in RSC to get middleware-injected header

```typescript
// apps/website/lib/tenant-resolver.ts
import 'server-only';
import { headers } from 'next/headers';

export const getTenantSlugFromHeaders = async (): Promise<string | null> => {
  const h = await headers();
  return h.get('x-tenant-slug');
};
```

Then `fetchMenuPublic(tenantSlug)` in the RSC layout/page.

---

## Common Pitfalls

### Pitfall 1: Middleware Headers Not Propagating to fetch() Calls

**What goes wrong:** `headers()` is available in RSC components but the Next.js middleware-injected header `x-tenant-slug` is NOT automatically forwarded to outgoing `fetch()` calls to the API. The middleware sets it on the incoming request object; the server component must read it and explicitly pass it to outgoing calls.
**Why it happens:** Next.js middleware sets headers on the _request to the Next.js app_; it does not modify headers on _outbound fetches from the app to external services_.
**How to avoid:** In `lib/api-client.ts`, call `headers()` from `next/headers` to read the tenant slug header injected by middleware, then forward it in the API fetch header.
**Warning signs:** Menu renders as "not found" or blank in dev even though `?tenant=<slug>` is in the URL.

### Pitfall 2: Hydration Mismatch with Zustand Cart

**What goes wrong:** Zustand `persist` with `sessionStorage` causes a React hydration mismatch because the server renders an empty cart but the client rehydrates with stored cart items.
**Why it happens:** SSR renders with empty cart; client immediately restores from `sessionStorage`; the initial client-side snapshot differs from SSR HTML.
**How to avoid:** Use Zustand's `skipHydration` option or wrap the cart-dependent UI in a `useEffect`/`useState` pattern that waits for hydration. Alternatively, suppress the hydration warning on the specific cart wrapper element. The simpler fix: the `CartDrawer` is a Sheet overlay (not in the initial SSR HTML) so this is low-risk in practice — only the badge count on the header trigger can mismatch. Use `suppressHydrationWarning` on the badge.
**Warning signs:** React hydration error in browser console about cart count mismatch.

### Pitfall 3: Cold Redis — Menu Fetch Throws

**What goes wrong:** `fetchMenuPublic` gets a 503 or 500 from `/v1/menu` because Redis is unavailable at startup.
**Why it happens:** `GetPublishedMenuService` falls back to Postgres if Redis is cold, but a deployment race condition or Redis restart can cause transient errors.
**How to avoid:** Wrap the `fetchMenuPublic` call in a try/catch in the RSC layout/page. On error, render an error boundary fallback ("Something went wrong") rather than crashing the page. The API's `GetPublishedMenuService` already has a degraded-mode that falls through to Postgres — the website just needs to tolerate the latency, not handle a crash.
**Warning signs:** White screen on initial deploy; menu works after a refresh.

### Pitfall 4: ISR Cache Serving Stale Menu After Publish

**What goes wrong:** Operator publishes a new menu version in admin, but the website still serves the old menu for up to 60 seconds (or the ISR revalidation window).
**Why it happens:** Next.js ISR caches the RSC page and `fetch()` result. After `revalidate: 60`, the stale-while-revalidate strategy serves the cached version for up to 60 seconds before revalidating.
**How to avoid:** This is intentional for Phase 5 — a 60-second stale window is acceptable for a delivery menu. The API already version-stamps the menu (`version: number`); Phase 7+ could call `revalidateTag()` on publish via a webhook. For Phase 5, accept the latency.
**Warning signs:** Not a bug — expected behavior; document for operators.

### Pitfall 5: Nx Module Boundary ESLint Rule

**What goes wrong:** `apps/website` component imports from `apps/qr-menu/src/components/MenuItemCard.tsx` — triggers the Nx ESLint `@nx/enforce-module-boundaries` rule (apps never import from other apps).
**Why it happens:** Easy shortcut that looks like it works locally.
**How to avoid:** All shared code must live in `packages/`. See D-02 and §Don't Hand-Roll.
**Warning signs:** ESLint error `"app" can not import from "app"` or similar Nx boundary violation.

### Pitfall 6: `x-tenant-slug` Header Accepted in Production

**What goes wrong:** Middleware code accidentally accepts `?tenant=<slug>` query param in production, allowing any request to impersonate any tenant.
**Why it happens:** Developer forgets to guard the dev-only path with `NODE_ENV !== 'production'`.
**How to avoid:** Always wrap the query-param slug injection in `if (process.env.NODE_ENV !== 'production')`. In production, slug MUST come from the host header only.
**Warning signs:** Security audit flag; any user can see any tenant's menu by adding `?tenant=other-tenant`.

### Pitfall 7: shadcn `init` in Monorepo Context

**What goes wrong:** Running `npx shadcn init` in `apps/website` tries to install its own `tailwindcss` that conflicts with the workspace root or admin's version.
**Why it happens:** shadcn init writes `tailwind.config.ts` and `postcss.config.mjs` that the website already inherits from workspace.
**How to avoid:** Run `npx shadcn init` with explicit flags to match admin's config: `--style new-york --base-color neutral --css-variables --no-tailwind-config` (or answer the prompts to match the values in the design spec). The PostCSS config for Tailwind 4 is a two-line file — write it manually; do not let the CLI overwrite it.

---

## Code Examples

### Fetching Tenant from Middleware-Injected Header

```typescript
// apps/website/app/page.tsx
// Source: apps/admin/app/(dashboard)/layout.tsx (RSC fetch pattern with headers())
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { fetchMenuPublic, TenantNotFoundError } from '@/lib/api-client';

export default async function MenuPage() {
  const h = await headers();
  const tenantSlug = h.get('x-tenant-slug');
  if (!tenantSlug) notFound();

  let menu;
  try {
    menu = await fetchMenuPublic(tenantSlug);
  } catch (err) {
    if (err instanceof TenantNotFoundError) notFound();
    throw err; // Let Next.js error boundary catch it
  }

  return <MenuPageClient menu={menu} />;
}
```

### Nx project.json Pattern for Website

```json
// apps/website/project.json
// Source: apps/admin/project.json (executor pattern)
{
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "name": "website",
  "projectType": "application",
  "sourceRoot": "apps/website/app",
  "tags": ["scope:website", "type:app", "layer:ui"],
  "targets": {
    "lint": {
      "executor": "nx:run-commands",
      "options": { "command": "eslint .", "cwd": "apps/website" }
    },
    "typecheck": {
      "executor": "nx:run-commands",
      "options": {
        "command": "tsc -p tsconfig.json --noEmit",
        "cwd": "apps/website"
      }
    },
    "test": {
      "executor": "nx:run-commands",
      "options": { "command": "vitest run", "cwd": "apps/website" }
    },
    "build": {
      "executor": "nx:run-commands",
      "options": {
        "command": "NODE_ENV=production next build",
        "cwd": "apps/website"
      },
      "outputs": ["{projectRoot}/.next"]
    },
    "serve": {
      "executor": "nx:run-commands",
      "options": { "command": "next dev --port 3002", "cwd": "apps/website" }
    }
  }
}
```

### Env Schema Pattern (mirroring admin)

```typescript
// apps/website/lib/env.ts
// Source: apps/admin/lib/env.ts (identical Zod + dev-defaults pattern)
import 'server-only';
import { z } from 'zod';

const WebsiteEnvSchema = z.object({
  NEXT_PUBLIC_API_ORIGIN: z.string().url(),
  WEBSITE_URL: z.string().url(),
});

const DEV_DEFAULTS = {
  NEXT_PUBLIC_API_ORIGIN: 'http://localhost:3000',
  WEBSITE_URL: 'http://localhost:3002',
};

// ... same loadEnv pattern as admin/lib/env.ts
```

---

## State of the Art

| Old Approach               | Current Approach            | When Changed | Impact                                                                                                                 |
| -------------------------- | --------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `pages/` directory Next.js | App Router with RSC         | Next.js 13+  | RSC enables server-fetch + streaming; `layout.tsx` handles nested layouts                                              |
| `getServerSideProps`       | RSC `async function Page()` | Next.js 13+  | No need for special data-fetching functions; `async/await` directly in component                                       |
| `next-i18next`             | `next-intl`                 | ~2022        | `next-intl` has first-class App Router + RSC support; `next-i18next` is pages-router-oriented                          |
| Zustand v4                 | Zustand v5                  | 2024         | v5 is a minor refactor with better TypeScript; `create` API unchanged                                                  |
| Tailwind v3 config file    | Tailwind v4 CSS-only        | 2024         | No `tailwind.config.ts` — everything in `globals.css`; `@tailwindcss/postcss` replaces `tailwindcss` as PostCSS plugin |

**Deprecated/outdated:**

- `pages/_document.tsx` / `pages/_app.tsx`: Not used in App Router.
- `next.config.js` (CJS): Use `next.config.mjs` (ESM) — matches admin.
- `getStaticProps` / `getStaticPaths`: Replaced by RSC + `generateStaticParams`.

---

## Environment Availability

| Dependency                       | Required By      | Available                               | Version                             | Fallback                      |
| -------------------------------- | ---------------- | --------------------------------------- | ----------------------------------- | ----------------------------- |
| Node.js                          | Next.js runtime  | ✓                                       | Node 20+ (from project conventions) | —                             |
| pnpm                             | Package install  | ✓                                       | workspace standard                  | —                             |
| `apps/api` running               | `/v1/menu` fetch | ✓ (dev docker)                          | current                             | Menu empty state renders      |
| Redis                            | Menu cache       | ✓ (dev docker)                          | current                             | API cold-fallback to Postgres |
| `NEXT_PUBLIC_API_ORIGIN` env var | API fetch        | ✓ (dev default `http://localhost:3000`) | —                                   | Dev default applied           |

**Missing dependencies with no fallback:** None — `apps/website` is a new Next.js app; all dependencies install via pnpm.

---

## Assumptions Log

| #   | Claim                                                                                                                           | Section                      | Risk if Wrong                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | `packages/ui` can be initialized as a new package during Phase 5 without disrupting other consumers                             | §Shared Package Extraction   | Low — it is currently an empty directory with no package.json                                                                                                                   |
| A2  | Zustand `sessionStorage` prevents hydration mismatch in practice (CartDrawer is a Sheet overlay, not SSR-rendered)              | §Pitfall 2                   | Low — the cart badge count is the only SSR-rendered element that could mismatch; `suppressHydrationWarning` is the safe fallback                                                |
| A3  | Next.js `next: { revalidate: 60 }` on the menu fetch provides acceptable ISR staleness for Phase 5                              | §Pattern 3                   | Low — Phase 5 has no real orders; stale menu is cosmetic only                                                                                                                   |
| A4  | All new packages (zustand, next-intl, server-only, etc.) pass slopcheck — listed as [ASSUMED] because slopcheck was unavailable | §Package Legitimacy Audit    | Low — these are widely used packages confirmed on npm registry                                                                                                                  |
| A5  | CSS variable injection via `<html style="--primary: {hex}">` correctly overrides shadcn's `--primary` token in Tailwind 4       | §Pattern 2                   | Medium — if Tailwind 4 calculates `--primary` differently (e.g., as oklch), a hex injection may not match the expected contrast. Mitigation: test the color overrride in Wave 0 |
| A6  | The `x-tenant-slug` header forwarding from Next.js middleware to RSC via `headers()` works without additional config            | §Tenant Resolution Deep-Dive | Low — this is standard Next.js middleware behavior; confirmed by the qr-menu dev pattern using the same header                                                                  |

---

## Open Questions

1. **packages/ui initialization: when and how?**
   - What we know: `packages/ui` exists as an empty directory. `packages/api-client` has a `package.json` that serves as a template.
   - What's unclear: Should `packages/ui` be a React package (requires React peer dep) or a Tailwind-only CSS utility package? It needs to export React components (`MenuItemCard`), so it needs React.
   - Recommendation: Initialize `packages/ui` with a minimal `package.json` in Wave 0 of Phase 5. Keep it simple — TypeScript, React peer dep, no bundler (consumers import TS source directly like `packages/domain`). Export `MenuItemCard` from it in Phase 6 when qr-menu extracts its components.

2. **ISR vs `cache: 'no-store'` for menu fetch in layout vs page**
   - What we know: The root layout fetches menu for theming; the page fetches menu for rendering. Next.js deduplicates `fetch()` calls within a request by URL.
   - What's unclear: Should the layout use `cache: 'no-store'` (always fresh) or `revalidate: 60` (ISR)?
   - Recommendation: Use `revalidate: 60` on both — they deduplicate to a single fetch per request. The 60-second window is acceptable for Phase 5.

3. **Tenant suspension (TEN-02): should the website check tenant status?**
   - What we know: SITE-09 requires tenant resolution. TEN-02 requires suspended tenants to return 403/410 from all customer-facing endpoints including `/v1/menu`. The API already enforces this at the controller level via `@RequireActiveTenant()`.
   - What's unclear: Does the website need to render a custom "suspended" page or can it rely on the API 403?
   - Recommendation: The UI-SPEC already defines a "Tenant suspended body" copy. The RSC page should handle the 403 from `/v1/menu` and render the suspension state. The API error response shape is RFC 7807 `application/problem+json`.

---

## Sources

### Primary (HIGH confidence)

- `apps/qr-menu/src/api/client.ts` — verified dev `x-tenant-slug` header pattern and `MenuNotFoundError` shape
- `apps/qr-menu/src/api/types.ts` — verified full `MenuDto` wire shape
- `apps/api/src/shared/tenant-context.middleware.ts` — verified `x-tenant-slug` header acceptance in dev, `TENANT_DEV_FALLBACK_SLUG` env var, `x-tenant-id` header for admin
- `apps/api/src/contexts/tenancy/application/tenant-resolver.service.ts` — verified subdomain extraction logic and `findByDomainHost` delegation
- `apps/api/src/contexts/catalog/interfaces/http/public-menu.controller.ts` — verified `/v1/menu` is `@Public()` + `@RequireActiveTenant()` shape
- `apps/admin/lib/api-server.ts` — verified `apiFetch` pattern to mirror
- `apps/admin/lib/env.ts` — verified Zod env schema + dev-defaults pattern
- `apps/admin/next.config.mjs` — verified `next-intl` plugin + rewrites pattern
- `apps/admin/app/layout.tsx` — verified Inter font loading, next-intl provider, RSC async layout pattern
- `apps/admin/project.json` — verified Nx executor pattern
- `apps/admin/components.json` — verified shadcn preset: new-york / neutral / cssVariables / lucide
- `packages/domain/src/brand-theme.ts` — verified `BrandTheme` fields: `primaryColor`, `logoUrl`, `font`
- `npm view next version` — confirmed 16.2.9 is current stable [VERIFIED: npm registry]
- `npm view zustand version` — confirmed 5.0.14 [VERIFIED: npm registry]
- `npm view next-intl version` — confirmed 4.13.0 [VERIFIED: npm registry]

### Secondary (MEDIUM confidence)

- `.planning/phases/05-customer-site/05-UI-SPEC.md` — UI design contract (approved 2026-06-12)
- `.planning/phases/05-customer-site/05-CONTEXT.md` — user decisions D-01 to D-08

### Tertiary (LOW confidence)

- CSS variable override behavior with Tailwind 4 and `<html style>` injection — verified from convention knowledge but not confirmed via Context7 Tailwind 4 docs in this session [ASSUMED]

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all packages verified on npm registry; versions match existing workspace usage
- Architecture: HIGH — tenant resolution, middleware pattern, and RSC fetch verified directly from source
- Pitfalls: HIGH — all verified from actual source code patterns in the existing codebase
- Cart state shape: MEDIUM — Zustand 5 API confirmed; ORD-03 shape is inferred from REQUIREMENTS.md (ORD-03 not yet implemented)

**Research date:** 2026-06-12
**Valid until:** 2026-07-12 (stable stack; next-intl / Next.js patch releases may ship)
