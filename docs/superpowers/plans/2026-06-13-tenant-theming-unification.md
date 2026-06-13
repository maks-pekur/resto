# Tenant Theming Unification — Implementation Plan (Plan A of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish one shared CSS-variable token contract and make a tenant's brand theme render identically on both customer surfaces (website + qr-menu) through a single mapper.

**Architecture:** Populate the empty `@resto/config-tailwind` package with (1) `tokens.css` — the base RestOS CSS custom properties, importable by any app; (2) `preset.css` — a Tailwind 4 `@theme inline` mapping for the Next apps; (3) `buildTenantThemeVars()` — a framework-agnostic mapper from `BrandTheme` to a CSS-variable object. Then wire website (SSR injection) and qr-menu (client injection) to consume the same contract and the same mapper. Admin is untouched (it stays RestOS-branded; its token consolidation is Plan B).

**Tech Stack:** TypeScript, Tailwind 4 (CSS-first `@theme`), Vitest, Next.js 16 (website), Vite + React (qr-menu), pnpm workspaces, Nx.

**Companion spec:** `docs/superpowers/specs/2026-06-13-unified-design-system-tenant-theming-design.md`

**Branch:** run on a feature branch off `main` (suggested `res-82` — qr-menu's `styles.css` already references RES-82 as the per-tenant-theming ticket). Confirm at execution.

**Out of scope (Plan B):** `@resto/ui` shared component library, de-duplicating admin/website primitives, admin adopting the shared tokens.

---

### Task 1: Scaffold `@resto/config-tailwind` package + shared `tokens.css`

**Files:**

- Create: `packages/config-tailwind/package.json`
- Create: `packages/config-tailwind/tsconfig.json`
- Create: `packages/config-tailwind/tokens.css`
- Delete: `packages/config-tailwind/.gitkeep`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@resto/config-tailwind",
  "version": "0.0.0",
  "private": true,
  "description": "Shared Tailwind token contract + tenant-theme mapper for Resto surfaces.",
  "license": "UNLICENSED",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./tokens.css": "./tokens.css",
    "./preset.css": "./preset.css"
  },
  "files": ["src", "tokens.css", "preset.css"],
  "devDependencies": {
    "@resto/config-eslint": "workspace:*",
    "@resto/config-typescript": "workspace:*",
    "typescript": "^6.0.3",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "extends": "@resto/config-typescript/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `tokens.css`** (base RestOS contract — light values lifted from `apps/admin/app/globals.css`, plus a system `--font-sans` for the non-Tailwind qr-menu)

```css
/* @resto/config-tailwind — base RestOS token contract.
 * Plain CSS custom properties so any surface (Tailwind or not) can read them.
 * Tenant themes override a subset of these at runtime via buildTenantThemeVars. */
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: #16a34a;
  --primary-foreground: #ffffff;
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.45 0 0);
  --accent: #ede9fe;
  --accent-foreground: #4c1d95;
  --destructive: #ef4444;
  --destructive-foreground: #ffffff;
  --success: #16a34a;
  --success-foreground: #ffffff;
  --warning: #f59e0b;
  --warning-foreground: #ffffff;
  --border: oklch(0.9 0 0);
  --input: oklch(0.93 0 0);
  --ring: #8b5cf6;
  --chart-1: oklch(0.646 0.222 41.116);
  --chart-2: oklch(0.6 0.118 184.704);
  --chart-3: oklch(0.398 0.07 227.392);
  --chart-4: oklch(0.828 0.189 84.429);
  --chart-5: oklch(0.769 0.188 70.08);
  --radius: 0.75rem;
  --font-sans:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif;
}
```

- [ ] **Step 4: Delete the placeholder and install**

Run:

```bash
git rm packages/config-tailwind/.gitkeep
pnpm install
```

Expected: pnpm links `@resto/config-tailwind` into the workspace with no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/config-tailwind/package.json packages/config-tailwind/tsconfig.json packages/config-tailwind/tokens.css
git commit -m "feat(config-tailwind): scaffold package + shared token contract"
```

---

### Task 2: `buildTenantThemeVars` mapper (TDD)

**Files:**

- Create: `packages/config-tailwind/src/index.ts`
- Create: `packages/config-tailwind/src/build-tenant-theme-vars.ts`
- Create: `packages/config-tailwind/src/build-tenant-theme-vars.spec.ts`
- Create: `packages/config-tailwind/vitest.config.ts`

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
  },
});
```

- [ ] **Step 2: Write the failing test** — `src/build-tenant-theme-vars.spec.ts`

```ts
import { describe, expect, it } from 'vitest';
import { buildTenantThemeVars } from './build-tenant-theme-vars';

describe('buildTenantThemeVars', () => {
  it('maps primaryColor to the --primary CSS variable', () => {
    expect(buildTenantThemeVars({ primaryColor: '#ff0000' })).toEqual({
      '--primary': '#ff0000',
    });
  });

  it('omits the variable when primaryColor is null', () => {
    expect(buildTenantThemeVars({ primaryColor: null })).toEqual({});
  });

  it('omits the variable when primaryColor is absent', () => {
    expect(buildTenantThemeVars({})).toEqual({});
  });

  it('never emits a tenant font (deferred until allowlist)', () => {
    expect(
      buildTenantThemeVars({ primaryColor: '#ff0000', font: 'Comic Sans' }),
    ).toEqual({
      '--primary': '#ff0000',
    });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @resto/config-tailwind exec vitest run`
Expected: FAIL — cannot resolve `./build-tenant-theme-vars`.

- [ ] **Step 4: Write the implementation** — `src/build-tenant-theme-vars.ts`

```ts
/** Structural subset of the domain BrandTheme / the public menu.brand.theme DTO.
 * Kept local so this package stays free of @resto/domain coupling and works
 * with both shapes via structural typing. */
export interface TenantThemeInput {
  readonly primaryColor?: string | null;
  readonly font?: string | null;
}

/**
 * Map a tenant brand theme to the CSS custom properties that override the base
 * token contract (tokens.css). Absent/null fields are omitted so the base token
 * stays in effect. `font` is intentionally NOT emitted: BrandTheme.font has no
 * charset allowlist yet (CSS-injection vector — see packages/domain/CLAUDE.md);
 * tenant-font injection is deferred until the allowlist lands with RES-91.
 */
export function buildTenantThemeVars(
  theme: TenantThemeInput,
): Record<string, string> {
  const vars: Record<string, string> = {};
  if (theme.primaryColor) {
    vars['--primary'] = theme.primaryColor;
  }
  return vars;
}
```

- [ ] **Step 5: Create the barrel** — `src/index.ts`

```ts
export {
  buildTenantThemeVars,
  type TenantThemeInput,
} from './build-tenant-theme-vars';
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @resto/config-tailwind exec vitest run`
Expected: PASS — 4 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/config-tailwind/src packages/config-tailwind/vitest.config.ts
git commit -m "feat(config-tailwind): buildTenantThemeVars mapper"
```

---

### Task 3: Tailwind `preset.css` for the Next apps

**Files:**

- Create: `packages/config-tailwind/preset.css`

- [ ] **Step 1: Create `preset.css`** (the `@theme inline` mapping — binds the contract vars into Tailwind's namespaces; lifted from the apps' current `@theme` block)

```css
/* @resto/config-tailwind — Tailwind 4 preset.
 * Import AFTER `@import 'tailwindcss'` and AFTER tokens.css in a Tailwind app.
 * Maps the shared CSS variables into Tailwind's color/radius/font namespaces. */
@theme inline {
  --font-sans: var(--font-inter, var(--font-sans));
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/config-tailwind/preset.css
git commit -m "feat(config-tailwind): Tailwind preset mapping shared tokens"
```

---

### Task 4: Wire `apps/website` to the shared contract + mapper

**Files:**

- Modify: `apps/website/package.json` (add dependency)
- Modify: `apps/website/app/globals.css` (replace local token blocks with imports)
- Modify: `apps/website/app/layout.tsx:30-44` (use the mapper)

- [ ] **Step 1: Add the dependency** — `apps/website/package.json`

In the `"dependencies"` block, add the line (keeping alphabetical order):

```json
"@resto/config-tailwind": "workspace:*",
```

Then run:

```bash
pnpm install
```

Expected: workspace link added, no errors.

- [ ] **Step 2: Replace token blocks in `apps/website/app/globals.css`**

Replace the entire current file contents with:

```css
@import 'tailwindcss';
@import 'tw-animate-css';
@import '@resto/config-tailwind/tokens.css';
@import '@resto/config-tailwind/preset.css';

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
}

html {
  scroll-behavior: smooth;
}
```

- [ ] **Step 3: Use the mapper in `apps/website/app/layout.tsx`**

Add the import near the other `@/lib` / `@resto` imports at the top:

```ts
import { buildTenantThemeVars } from '@resto/config-tailwind';
```

Replace lines 32–44 (the `let primaryColor …` block through the `themeStyle` assignment) with:

```ts
let theme: { primaryColor?: string | null } | null = null;
if (tenantSlug) {
  try {
    const menu = await fetchMenuPublic(tenantSlug);
    theme = menu.brand?.theme ?? null;
  } catch {
    // cold Redis / not-found / suspended — render default theme
  }
}

const themeStyle = theme
  ? (buildTenantThemeVars(theme) as React.CSSProperties)
  : undefined;
```

(The `<html … style={themeStyle}>` line below is unchanged.)

- [ ] **Step 4: Verify typecheck + build**

Run:

```bash
pnpm exec nx run website:typecheck
pnpm exec nx run website:build
```

Expected: both PASS. The build emits CSS with the shared `:root` vars and Tailwind utilities resolving to them.

- [ ] **Step 5: Manual smoke (record result in the commit body of the final task, not here)**

Run the website dev server, load a tenant with a `primaryColor` set, confirm the accent renders that color; load a tenant without a theme, confirm the green base renders. (No automated assertion — visual check.)

- [ ] **Step 6: Commit**

```bash
git add apps/website/package.json apps/website/app/globals.css apps/website/app/layout.tsx pnpm-lock.yaml
git commit -m "feat(website): consume shared token contract + tenant-theme mapper"
```

---

### Task 5: Wire `apps/qr-menu` to the shared contract + mapper

**Files:**

- Modify: `apps/qr-menu/package.json` (add dependency)
- Modify: `apps/qr-menu/src/main.tsx` (import tokens.css)
- Modify: `apps/qr-menu/src/styles.css` (drop local `:root`, rename `--resto-*` → contract)
- Modify: `apps/qr-menu/src/App.tsx:51-57` (use the mapper)

- [ ] **Step 1: Add the dependency** — `apps/qr-menu/package.json`

In `"dependencies"`, add (alphabetical order, next to `@resto/cart`):

```json
"@resto/config-tailwind": "workspace:*",
```

Then:

```bash
pnpm install
```

Expected: workspace link added.

- [ ] **Step 2: Import the shared tokens** — `apps/qr-menu/src/main.tsx`

Add as the FIRST stylesheet import, before `./styles.css`:

```ts
import '@resto/config-tailwind/tokens.css';
import './styles.css';
```

(Result: the file imports `@resto/config-tailwind/tokens.css` then `./styles.css`.)

- [ ] **Step 3: Remove the local `:root` and rename the namespace** — `apps/qr-menu/src/styles.css`

Replace the top `:root { … }` block (the `--resto-*` definitions) with this comment, leaving the rest of the file in place:

```css
/* Tokens come from @resto/config-tailwind/tokens.css (imported in main.tsx).
 * Tenant themes override --primary at runtime (see App.tsx). */
```

Then rename every remaining `--resto-*` reference in the file to the shared contract:

```bash
cd apps/qr-menu
sed -i '' \
  -e 's/--resto-accent/--primary/g' \
  -e 's/--resto-bg/--background/g' \
  -e 's/--resto-card-bg/--card/g' \
  -e 's/--resto-fg/--foreground/g' \
  -e 's/--resto-muted/--muted-foreground/g' \
  -e 's/--resto-radius/--radius/g' \
  -e 's/--resto-font/--font-sans/g' \
  src/styles.css
cd ../..
```

Run:

```bash
grep -n -- '--resto-' apps/qr-menu/src/styles.css || echo "no --resto- refs remain"
```

Expected: `no --resto- refs remain`.

- [ ] **Step 4: Use the mapper in `apps/qr-menu/src/App.tsx`**

Add the import next to the other `@resto` imports at the top:

```ts
import { buildTenantThemeVars } from '@resto/config-tailwind';
```

Replace the theme effect (lines 51–57, the `useEffect` that sets `--resto-accent`) with:

```ts
useEffect(() => {
  if (state.kind !== 'ready') return;
  const theme = state.menu.brand?.theme;
  if (!theme) return;
  const vars = buildTenantThemeVars(theme);
  for (const [name, value] of Object.entries(vars)) {
    document.documentElement.style.setProperty(name, value);
  }
}, [state]);
```

- [ ] **Step 5: Verify typecheck + build**

Run:

```bash
pnpm exec nx run qr-menu:typecheck
pnpm exec nx run qr-menu:build
```

Expected: both PASS. No Tailwind/shadcn was added — only the CSS-variable contract and the mapper.

- [ ] **Step 6: Manual smoke**

Run the qr-menu dev server; with a tenant `primaryColor` set, confirm accent elements render that color after the menu loads; without a theme, confirm the base renders. Note: qr-menu's default look changes from its old red/beige to the neutral RestOS base — this is the intended unification. Confirm it reads acceptably; if the neutral base is undesirable for the menu specifically, raise it (a qr-menu-specific base override is a small follow-up, out of scope here).

- [ ] **Step 7: Commit**

```bash
git add apps/qr-menu/package.json apps/qr-menu/src/main.tsx apps/qr-menu/src/styles.css apps/qr-menu/src/App.tsx pnpm-lock.yaml
git commit -m "feat(qr-menu): consume shared token contract + tenant-theme mapper"
```

---

### Task 6: Full-workspace verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck the whole workspace**

Run: `pnpm exec nx run-many -t typecheck`
Expected: PASS for all projects (config-tailwind, website, qr-menu, and unaffected projects).

- [ ] **Step 2: Run the config-tailwind unit tests**

Run: `pnpm --filter @resto/config-tailwind exec vitest run`
Expected: PASS — 4 tests.

- [ ] **Step 3: Lint the changed packages**

Run: `pnpm exec nx run-many -t lint -p config-tailwind website qr-menu`
Expected: PASS (no warnings — repo runs `--max-warnings=0`).

- [ ] **Step 4: Confirm the contract is single-sourced**

Run:

```bash
grep -rn -- '--resto-' apps/qr-menu/src || echo "qr-menu clean"
grep -n "buildTenantThemeVars" apps/website/app/layout.tsx apps/qr-menu/src/App.tsx
```

Expected: `qr-menu clean`; both website and qr-menu reference `buildTenantThemeVars` (one mapper, two surfaces).

---

## Self-Review

**Spec coverage:**

- Goal 1 (shared design system for admin/website primitives) → **Plan B** (explicitly out of scope here; noted in header).
- Goal 2 (single token contract as plain CSS vars) → Task 1 (`tokens.css`) + Task 3 (`preset.css`).
- Goal 3 (one tenant theme identical across website + qr-menu via one mapper) → Task 2 (mapper) + Task 4 (website) + Task 5 (qr-menu).
- Goal 4 (qr-menu stays lightweight: no shadcn/Radix/Tailwind) → Task 5 adds only the CSS contract + mapper; verified in Task 5 Step 5 / Task 6 Step 1.
- Goal 5 (admin always RestOS) → admin untouched by this plan.
- Guardrail (font not injected) → Task 2 Step 4 implementation + the 4th test case.
- `@resto/config-tailwind` public API = `src/index.ts` for TS; CSS assets exported as explicit `./tokens.css` / `./preset.css` sub-paths (conventional config-asset exception to the "index-only" rule; the TS surface stays index-only).

**Placeholder scan:** No TBD/TODO; every code step shows complete content; the qr-menu rename is a concrete `sed` with a verification grep.

**Type consistency:** `buildTenantThemeVars(theme: TenantThemeInput): Record<string, string>` is defined once (Task 2) and called identically in website (Task 4) and qr-menu (Task 5). `TenantThemeInput` is structurally compatible with `menu.brand.theme` (both expose `primaryColor?: string | null`).

**Known visual delta (intended):** qr-menu's default (no-tenant) palette changes from red/beige to the neutral RestOS base. Flagged in Task 5 Step 6 for visual confirmation.
