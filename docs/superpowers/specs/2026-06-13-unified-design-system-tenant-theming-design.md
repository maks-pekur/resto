# Unified Design System + Tenant Theming — Design

**Date:** 2026-06-13
**Status:** Approved (brainstorming), pending implementation plan
**Scope:** Consolidate a single shadcn-based design system across the apps and make per-tenant theming flow consistently to all of a tenant's customer-facing surfaces. The operator theme editor is out of scope (deferred to RES-91).

## Problem

The three front-end apps currently have three divergent styling systems:

- `apps/admin` — own local shadcn copy (new-york / neutral), Tailwind 4, full CSS-variable token set incl. dark mode + sidebar tokens.
- `apps/website` — own local shadcn copy, near-identical to admin but missing dark mode; `button/form/dialog` are exact duplicates of admin's.
- `apps/qr-menu` — a styling island: no Tailwind, no shadcn, 432 lines of hand-written CSS using a separate `--resto-*` custom-property namespace.

The shared packages meant to hold the design system already exist but are empty:

- `packages/ui` (`@resto/ui`) — `src/index.ts` is `export {}`. No app imports it.
- `packages/config-tailwind` (`@resto/config-tailwind`) — only a `.gitkeep`, no `package.json`.

Tenant theming half-exists and is **inconsistent**: `BrandTheme` (primaryColor `#hex`, logoUrl, font) is defined in `packages/domain`, persisted in `brands.theme` (jsonb), and flows through the public menu API as `menu.brand.theme`. It is applied two different ways:

- `apps/website/app/layout.tsx` injects `--primary` into `<html style>` at SSR.
- `apps/qr-menu/src/App.tsx` sets `--resto-accent` on `documentElement` client-side after the menu loads.

Because the two surfaces override **different** CSS variables via **different** code, a tenant's brand is not guaranteed to render identically across its customer surfaces.

## Goals

1. One shared, consistent design system for the apps that need rich components (admin, website), eliminating the duplicated `button/form/dialog` etc.
2. A single token contract expressed as plain CSS custom properties — the lingua franca consumed by Tailwind apps and by qr-menu alike.
3. One tenant theme applied **identically** across all of a tenant's customer-facing surfaces (website + qr-menu), via one shared mapper.
4. qr-menu stays lightweight: **no shadcn, no Radix, no Tailwind** — it consumes the shared tokens directly to honor the cold-start-speed constraint.
5. The operator admin panel always renders in the RestOS brand, never a tenant's.

## Decisions (locked during brainstorming)

| #   | Decision                                                                                                                                                         | Rationale                                                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Admin is **always** RestOS-branded; tenant theme applies only to customer surfaces (website, qr-menu).                                                           | Operators across tenants see a consistent product; no contrast/readability risk in an operational tool.                                                                                                       |
| D2  | qr-menu does **not** adopt shadcn/Radix/Tailwind. It joins the system via the shared **CSS-variable token contract** only.                                       | Honors the documented "qr-menu optimized for cold-start on mobile networks" constraint; shadcn's value (Radix overlays) does not outweigh the bundle cost for qr-menu's small surface.                        |
| D3  | Component library stays **shadcn** (not HeroUI or another lib).                                                                                                  | Plain-CSS-variable theming fits per-tenant runtime theming better than a build-time plugin-theme system; admin+website are already shipped on shadcn; source-ownership + lighter bundle on customer surfaces. |
| D4  | Architecture = shared tokens (`@resto/config-tailwind`) + shared base primitives (`@resto/ui`); app-specific components stay in-app.                             | Balances DRY against shadcn's copy-the-component model and the apps' differing component needs.                                                                                                               |
| D5  | Scope = design system + theming plumbing. The operator theme editor stays deferred (RES-91). Theme is wired for the **existing** fields (primaryColor, logoUrl). | The user explicitly framed customization as a future ("if we later allow customization").                                                                                                                     |

## Architecture

### `@resto/config-tailwind` — the token / theme package

The owner of the token contract. Exposes three artifacts through its public `src/index.ts` / package `exports`:

1. **`tokens.css`** — plain CSS:

   ```css
   :root {
     --background: …;
     --foreground: …;
     --card: …;
     --card-foreground: …;
     --primary: …;
     --primary-foreground: …;
     --secondary: …;
     --muted: …;
     --muted-foreground: …;
     --accent: …;
     --accent-foreground: …;
     --border: …;
     --input: …;
     --ring: …;
     --radius: …;
     --font-sans: …;
   }
   ```

   Base values are the current RestOS theme (neutral greys + green `#16a34a`, `--radius: 0.75rem`) lifted from the existing `apps/admin/app/globals.css`. Importable by **any** app, Tailwind or not.

2. **Tailwind 4 preset** — an `@theme inline` mapping that binds the CSS vars into Tailwind's color/radius/font namespaces (`--color-primary: var(--primary)`, etc.). Consumed by **admin + website** so utility classes (`bg-primary`, `rounded-lg`) resolve to the shared tokens.

3. **`buildTenantThemeVars(theme): Record<string, string>`** — a framework-agnostic TypeScript function mapping a domain `BrandTheme` to a CSS-variable object:
   - `primaryColor` → `--primary`
   - (font reserved — see Guardrails; not injected yet)
   - `null`/absent fields are **omitted** from the result, so the base `:root` token remains in effect.

   Has **no React, Radix, or Tailwind dependency** so qr-menu can import it without weight.

### `@resto/ui` — shared base primitives

The genuinely-duplicated shadcn primitives, as a real package exporting React components plus the `cn` helper:

- Candidate set (the intersection of admin's and website's current usage): `button`, `input`, `label`, `dialog`, `form`, `tabs`, `tooltip`, `separator`, `skeleton`, `scroll-area`, `radio-group`. The exact list is finalized during implementation by diffing the two apps' `components/ui/`.
- Depends on `react`, the relevant `@radix-ui/*` primitives, `class-variance-authority`, `clsx`, `tailwind-merge`, and `@resto/config-tailwind` (for tokens).
- Consumed by **admin + website only**. App-specific components stay in their app:
  - admin keeps: sidebar, table, dropdown-menu, select, switch, textarea, field, item, input-group, avatar, breadcrumb, collapsible, progress.
  - website keeps: its menu/cart components and `sheet` (until/unless promoted to shared).

### Consumption matrix

| App     | `tokens.css` | Tailwind preset | `@resto/ui` | `buildTenantThemeVars` |    Tenant theme    |
| ------- | :----------: | :-------------: | :---------: | :--------------------: | :----------------: |
| admin   |      ✅      |       ✅        |     ✅      |           ❌           | ❌ (always RestOS) |
| website |      ✅      |       ✅        |     ✅      |        ✅ (SSR)        |         ✅         |
| qr-menu |      ✅      |       ❌        |     ❌      |      ✅ (client)       |         ✅         |

## Data flow — tenant theme

```
BrandTheme (domain)
  └─ brands.theme (jsonb)
       └─ API: menu.brand.theme  (already wired)
            ├─ website (RSC): layout.tsx
            │     const vars = buildTenantThemeVars(theme)
            │     <html style={vars}> …            // SSR, no FOUC
            └─ qr-menu (SPA): App.tsx (on menu load)
                  const vars = buildTenantThemeVars(theme)
                  Object.entries(vars).forEach(([k,v]) =>
                    document.documentElement.style.setProperty(k, v))
```

Both surfaces override the **same** variables through the **same** mapper, so a tenant's brand renders identically. A short FOUC window exists on qr-menu (base theme until the menu fetch resolves) — acceptable for an SPA.

## Per-app changes

- **`@resto/config-tailwind`**: add `package.json` (`name: "@resto/config-tailwind"`), `src/index.ts`, `tokens.css`, Tailwind preset, `buildTenantThemeVars` + unit test. Register in `tsconfig.base.json` paths if needed.
- **`@resto/ui`**: populate with the shared primitives + `cn`; wire `package.json` deps/peerDeps; export via `src/index.ts`.
- **admin**: replace local duplicated primitives with `@resto/ui` imports where they match; point `globals.css` at `tokens.css` + the shared preset (admin keeps its dark-mode and sidebar tokens as local additions on top). No tenant theming.
- **website**: replace duplicated primitives with `@resto/ui`; point `globals.css` at the shared tokens/preset; generalize `layout.tsx` injection to `buildTenantThemeVars(theme)`.
- **qr-menu**: import `tokens.css`; rename its `--resto-*` properties to the shared contract (`--resto-accent` → `--primary`, `--resto-bg` → `--background`, `--resto-radius` → `--radius`, etc.) across `styles.css`; replace the manual `--resto-accent` injection in `App.tsx` with `buildTenantThemeVars(theme)`. No Tailwind, no `@resto/ui`.

## Guardrails

- **Font not injected yet.** `BrandTheme.font` has no charset allowlist (CSS-injection vector per `packages/domain/CLAUDE.md`). The contract reserves `--font-sans`, but tenant-font injection is deferred until the allowlist lands (with the editor, RES-91). `buildTenantThemeVars` must not emit `--font-sans` from tenant data in this scope.
- **Contrast.** `primaryColor` only drives accent surfaces where the paired `*-foreground` is a fixed readable token we control; automatic contrast validation is deferred to RES-91.
- **`@resto/config-tailwind` public API is `src/index.ts` only** (no sub-path imports), per `packages/CLAUDE.md`. `buildTenantThemeVars` and the preset/tokens paths are exported from there.

## Out of scope

- Operator theme editor UI (RES-91).
- Dark mode for website/qr-menu (admin keeps its existing dark mode).
- Expanding `BrandTheme` fields (secondary/background/radius/etc.).
- Automated contrast/accessibility validation.
- Migrating qr-menu to Tailwind or shadcn.

## Testing

- **`@resto/config-tailwind`**: unit test for `buildTenantThemeVars` — maps `primaryColor` → `--primary`; omits null/absent fields; never emits a tenant `--font-sans` in this scope.
- **`@resto/ui`**: smoke render for each exported primitive.
- **website**: existing SSR theme-injection behavior preserved (now via the mapper); a tenant with a `primaryColor` renders it on `<html>`.
- **qr-menu**: builds without Tailwind/shadcn; a tenant `primaryColor` applies to `--primary`; base theme renders when no tenant theme.
- **Visual**: manual smoke across the three apps (not automated).

## Success criteria

1. `button/form/dialog` (and the other shared primitives) exist in exactly one place (`@resto/ui`); admin and website import them rather than holding duplicates.
2. All three apps resolve their base colors/radius/font from the single `tokens.css` contract.
3. A tenant's `primaryColor` renders identically on website and qr-menu, produced by one shared mapper.
4. qr-menu ships without Tailwind, shadcn, or Radix added.
5. admin renders unchanged visually (RestOS brand, dark mode, sidebar intact).
