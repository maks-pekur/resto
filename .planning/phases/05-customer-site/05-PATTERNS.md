# Phase 5: Customer Site — Pattern Map

**Mapped:** 2026-06-12
**Files analyzed:** 18 new/modified files
**Analogs found:** 16 / 18

---

## File Classification

| New/Modified File                                    | Role       | Data Flow        | Closest Analog                                                                      | Match Quality |
| ---------------------------------------------------- | ---------- | ---------------- | ----------------------------------------------------------------------------------- | ------------- |
| `apps/website/project.json`                          | config     | —                | `apps/admin/project.json`                                                           | exact         |
| `apps/website/tsconfig.json`                         | config     | —                | `apps/admin/tsconfig.json`                                                          | exact         |
| `apps/website/eslint.config.mjs`                     | config     | —                | `apps/admin/eslint.config.mjs`                                                      | exact         |
| `apps/website/postcss.config.mjs`                    | config     | —                | `apps/admin/postcss.config.mjs`                                                     | exact         |
| `apps/website/components.json`                       | config     | —                | `apps/admin/components.json`                                                        | exact         |
| `apps/website/next.config.mjs`                       | config     | —                | `apps/admin/next.config.mjs`                                                        | exact         |
| `apps/website/vitest.config.ts`                      | config     | —                | `apps/admin/vitest.config.ts`                                                       | exact         |
| `apps/website/middleware.ts`                         | middleware | request-response | `apps/admin/lib/i18n/locale-cookie.ts` + `apps/qr-menu/src/api/client.ts`           | role-match    |
| `apps/website/app/layout.tsx`                        | component  | request-response | `apps/admin/app/layout.tsx`                                                         | exact         |
| `apps/website/app/page.tsx`                          | component  | request-response | `apps/admin/app/dashboard/(workspace)/page.tsx`                                     | role-match    |
| `apps/website/lib/api-client.ts`                     | utility    | request-response | `apps/qr-menu/src/api/client.ts`                                                    | exact         |
| `apps/website/lib/env.ts`                            | utility    | —                | `apps/admin/lib/env.ts`                                                             | exact         |
| `apps/website/lib/tenant-resolver.ts`                | utility    | request-response | `apps/admin/lib/api-server.ts` (headers() pattern)                                  | role-match    |
| `apps/website/lib/i18n/request.ts`                   | utility    | request-response | `apps/admin/lib/i18n/request.ts`                                                    | exact         |
| `apps/website/lib/i18n/locales.ts`                   | utility    | —                | `apps/admin/lib/i18n/locales.ts`                                                    | exact         |
| `apps/website/lib/i18n/locale-cookie.ts`             | utility    | request-response | `apps/admin/lib/i18n/locale-cookie.ts`                                              | exact         |
| `apps/website/store/cart.ts`                         | store      | event-driven     | — (no Zustand store exists yet)                                                     | none          |
| `apps/website/components/checkout/checkout-form.tsx` | component  | request-response | `apps/admin/app/(auth)/login/login-form-client.tsx` + `item-detail-form-client.tsx` | role-match    |
| `apps/website/components/menu/menu-page-client.tsx`  | component  | event-driven     | `apps/qr-menu/src/components/MenuView.tsx`                                          | role-match    |
| `apps/website/components/menu/menu-item-card.tsx`    | component  | request-response | `apps/qr-menu/src/components/MenuItemCard.tsx`                                      | role-match    |
| `apps/website/components/menu/item-modal.tsx`        | component  | event-driven     | `apps/qr-menu/src/components/ItemDetail.tsx`                                        | role-match    |
| `packages/api-client/src/public.ts`                  | utility    | —                | `packages/api-client/src/public.ts` (extend)                                        | exact         |

---

## Pattern Assignments

### `apps/website/project.json` (config)

**Analog:** `apps/admin/project.json`

Copy this file verbatim, replacing `"name": "admin"` with `"name": "website"`, `"scope:admin"` with `"scope:website"`, port `3001` with `3002`, and `cwd: "apps/admin"` with `cwd: "apps/website"`.

**Full analog** (`apps/admin/project.json`, lines 1-52):

```json
{
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "name": "admin",
  "projectType": "application",
  "sourceRoot": "apps/admin/app",
  "tags": ["scope:admin", "type:app", "layer:ui"],
  "targets": {
    "lint": {
      "executor": "nx:run-commands",
      "options": { "command": "eslint .", "cwd": "apps/admin" }
    },
    "typecheck": {
      "executor": "nx:run-commands",
      "options": {
        "command": "tsc -p tsconfig.json --noEmit",
        "cwd": "apps/admin"
      }
    },
    "test": {
      "executor": "nx:run-commands",
      "options": { "command": "vitest run", "cwd": "apps/admin" }
    },
    "build": {
      "executor": "nx:run-commands",
      "options": {
        "command": "NODE_ENV=production next build",
        "cwd": "apps/admin"
      },
      "outputs": ["{projectRoot}/.next"]
    },
    "serve": {
      "executor": "nx:run-commands",
      "options": { "command": "next dev --port 3001", "cwd": "apps/admin" }
    }
  }
}
```

**Changes for website:** `name → "website"`, tag `"scope:website"`, port `3001 → 3002`, all `cwd` to `"apps/website"`.

---

### `apps/website/tsconfig.json` (config)

**Analog:** `apps/admin/tsconfig.json` (lines 1-22)

Copy verbatim. The `exactOptionalPropertyTypes: false` override exists because shadcn-generated code uses `prop: undefined` patterns — keep it. The `"@/*": ["./*"]` path alias is the workspace standard.

```json
{
  "extends": "@resto/config-typescript/nextjs.json",
  "compilerOptions": {
    "noEmit": true,
    "rootDir": ".",
    "paths": { "@/*": ["./*"] },
    "types": ["node"],
    "exactOptionalPropertyTypes": false
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", ".next", "dist"]
}
```

---

### `apps/website/eslint.config.mjs` (config)

**Analog:** `apps/admin/eslint.config.mjs` (lines 1-53)

Copy verbatim. The shadcn relaxation block (`components/ui/**`, rule overrides for `no-unnecessary-condition`, etc.) is required — shadcn-generated code triggers those rules. The `ignores` block is identical.

**Imports pattern** (lines 1-3):

```javascript
import { react } from '@resto/config-eslint/react';

export default [
  ...react,
  {
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
  },
  // shadcn relaxation block — copy as-is from apps/admin/eslint.config.mjs lines 15-43
```

---

### `apps/website/postcss.config.mjs` (config)

**Analog:** `apps/admin/postcss.config.mjs` (lines 1-7)

Copy verbatim — two-line Tailwind 4 config:

```javascript
const config = { plugins: { '@tailwindcss/postcss': {} } };
export default config;
```

---

### `apps/website/components.json` (config)

**Analog:** `apps/admin/components.json` (lines 1-22)

Copy verbatim, changing only `"css": "app/globals.css"` (same path). Do NOT copy — run `npx shadcn init` in `apps/website` and match these values when prompted: `style: new-york`, `baseColor: neutral`, `cssVariables: true`, `iconLibrary: lucide`, `rsc: true`, `tsx: true`. The aliases block is identical to admin.

**Reference preset:**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

---

### `apps/website/next.config.mjs` (config)

**Analog:** `apps/admin/next.config.mjs` (lines 1-22)

Mirror the admin config. Key differences: (1) only proxy `/v1/:path*` (website has no `/api/:path*` BA auth flow), (2) same `withNextIntl` plugin wrapping `'./lib/i18n/request.ts'`.

**Admin pattern** (lines 1-22):

```javascript
import createNextIntlPlugin from 'next-intl/plugin';
const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts');

const nextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  async rewrites() {
    const apiOrigin =
      process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:3000';
    return [
      { source: '/api/:path*', destination: `${apiOrigin}/api/:path*` },
      { source: '/v1/:path*', destination: `${apiOrigin}/v1/:path*` },
    ];
  },
};
export default withNextIntl(nextConfig);
```

**Website change:** Remove the `/api/:path*` rewrite entry. Keep `/v1/:path*`. Add `typedRoutes: true`.

---

### `apps/website/vitest.config.ts` (config)

**Analog:** `apps/admin/vitest.config.ts` (lines 1-17)

Copy verbatim:

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: false,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.{spec,test}.{ts,tsx}'],
  },
  resolve: {
    alias: { '@': new URL('.', import.meta.url).pathname },
  },
});
```

---

### `apps/website/middleware.ts` (middleware, request-response)

**Analogs:**

- `apps/qr-menu/src/api/client.ts` — `VITE_TENANT_SLUG` → `x-tenant-slug` dev-override pattern (lines 3-10, 19-25)
- `apps/admin/lib/i18n/locale-cookie.ts` — locale resolution cookie → Accept-Language (lines 19-27)

**Tenant slug injection pattern** from `apps/qr-menu/src/api/client.ts` (lines 3-10):

```typescript
const TENANT_SLUG_OVERRIDE: string | undefined = import.meta.env.DEV
  ? (import.meta.env.VITE_TENANT_SLUG as string | undefined)
  : undefined;

const buildHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {};
  if (TENANT_SLUG_OVERRIDE) {
    headers['x-tenant-slug'] = TENANT_SLUG_OVERRIDE;
  }
  return headers;
};
```

**Website adaptation:** In `middleware.ts`, replace the Vite env check with `process.env.NODE_ENV !== 'production'` guard on the `?tenant=` query-param path. The `x-tenant-slug` header key is identical.

**Locale resolution pattern** from `apps/admin/lib/i18n/locale-cookie.ts` (lines 8-27):

```typescript
const negotiateFromAcceptLanguage = (header: string | null): Locale | null => {
  if (!header) return null;
  for (const token of header.split(',')) {
    const tag = token.split(';')[0]?.trim().toLowerCase() ?? '';
    if (tag.length === 0) continue;
    const primary = tag.split('-')[0] ?? '';
    if (isLocale(primary)) return primary;
  }
  return null;
};

export const resolveLocale = async (): Promise<Locale> => {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  const headersList = await headers();
  const negotiated = negotiateFromAcceptLanguage(
    headersList.get('accept-language'),
  );
  return negotiated ?? DEFAULT_LOCALE;
};
```

**Website adaptation:** Adapt for `NextRequest` (middleware context, not RSC): read `request.cookies.get('resto.locale')` and `request.headers.get('accept-language')`. Write resolved locale to response cookie `NEXT_LOCALE`. The `DEFAULT_LOCALE` changes from `'ru'` to `'en'` (D-05).

---

### `apps/website/app/layout.tsx` (component, request-response)

**Analog:** `apps/admin/app/layout.tsx` (lines 1-41)

**Full analog** (lines 1-41):

```typescript
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'cyrillic'], variable: '--font-inter', display: 'swap' });

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale} suppressHydrationWarning className={inter.variable}>
      <head />
      <body className="bg-background text-foreground min-h-screen antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider>{children}<Toaster /></ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

**Website additions on top of this pattern:**

1. Import `{ headers }` from `'next/headers'` — read `x-tenant-slug` header injected by middleware.
2. Call `fetchMenuPublic(tenantSlug)` inside a try/catch (cold-Redis resilience) to get `brand.theme.primaryColor`.
3. Inject `style={{ '--primary': primaryColor } as React.CSSProperties}` on `<html>` when `primaryColor` is non-null.
4. Remove `<ThemeProvider>` — website is light-mode only in Phase 5 (Phase 15 adds dark mode).

**RSC layout server-fetch pattern** from `apps/admin/app/dashboard/layout.tsx` (lines 24-31):

```typescript
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [tenantRes, brandsRes, meRes, cookieBrandSlug] = await Promise.all([
    apiFetch<TenantSummary>('/v1/tenants/me'),
    // ...
  ]);
  if (!tenantRes.ok || !tenantRes.data) { redirect('/login'); }
```

**Website adaptation:** Single `fetchMenuPublic(tenantSlug)` call (no `Promise.all` needed); graceful fallback (no redirect) when tenant not resolved — render default theme.

---

### `apps/website/app/page.tsx` (component, request-response)

**Analog:** `apps/admin/app/dashboard/(workspace)/page.tsx` (RSC async page)

**RSC page pattern** (dashboard page, lines 1-33):

```typescript
import { getTranslations } from 'next-intl/server';
import { apiFetch } from '@/lib/api-server';

export default async function Page() {
  const t = await getTranslations('dashboard');
  const [brandsRes, stopListRes] = await Promise.all([...]);
  const brandsCount = brandsRes.ok && brandsRes.data ? brandsRes.data.brands.length : 0;
  return (
    <>
      <PageHeading title={t('title')} />
      ...
    </>
  );
}
```

**Website page pattern** — replace `apiFetch` (auth-session aware) with `fetchMenuPublic` from `@/lib/api-client` (public, no auth), read `x-tenant-slug` from `headers()`, handle `TenantNotFoundError` with `notFound()`:

```typescript
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
    throw err;
  }
  return <MenuPageClient menu={menu} />;
}
```

This `headers()` → `notFound()` → `fetchData` → pass-props-to-client-island shape is the standard RSC page pattern for this project.

---

### `apps/website/lib/api-client.ts` (utility, request-response)

**Analog:** `apps/qr-menu/src/api/client.ts` (lines 1-48)

**Full analog:**

```typescript
import type { MenuDto } from './types';

const API_URL: string =
  (import.meta.env as Record<string, string | undefined>).VITE_API_URL ?? '';
const TENANT_SLUG_OVERRIDE: string | undefined = import.meta.env.DEV
  ? (import.meta.env.VITE_TENANT_SLUG as string | undefined)
  : undefined;

export class MenuNotFoundError extends Error {
  constructor() {
    super('Menu not found for this tenant.');
    this.name = 'MenuNotFoundError';
  }
}

const buildHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {};
  if (TENANT_SLUG_OVERRIDE) {
    headers['x-tenant-slug'] = TENANT_SLUG_OVERRIDE;
  }
  return headers;
};

export const fetchMenu = async (signal?: AbortSignal): Promise<MenuDto> => {
  const init: RequestInit = { headers: buildHeaders() };
  if (signal) init.signal = signal;
  const res = await fetch(apiUrl('/v1/menu'), init);
  if (res.status === 404) throw new MenuNotFoundError();
  if (!res.ok) throw new Error(`fetchMenu failed: ${res.status.toString()}`);
  return (await res.json()) as MenuDto;
};
```

**Website adaptation:**

- Replace `import.meta.env` with `process.env` (Next.js server)
- Add `import 'server-only'` at top
- Add `import { headers } from 'next/headers'` — read `x-tenant-slug` from middleware headers
- Replace `TENANT_SLUG_OVERRIDE` header injection with reading the header from the Next.js request context
- Add `next: { revalidate: 60 }` ISR option on `fetch()`
- Rename `MenuNotFoundError` → `TenantNotFoundError` (RESEARCH Pattern 3 rationale: 404 from `/v1/menu` means no tenant, not no menu)
- Function signature: `fetchMenuPublic(tenantSlug: string): Promise<MenuDto>` (explicit slug argument — middleware passes it)

**Server-only guard pattern** from `apps/admin/lib/api-server.ts` (line 1):

```typescript
import 'server-only';
```

Apply to `api-client.ts` — prevents this module leaking to client bundle.

---

### `apps/website/lib/env.ts` (utility, —)

**Analog:** `apps/admin/lib/env.ts` (lines 1-73)

**Full pattern** (lines 1-73) — copy structure exactly:

```typescript
import 'server-only';
import { z } from 'zod';

const AdminEnvSchema = z.object({
  NEXT_PUBLIC_API_ORIGIN: z.string().url(),
  ADMIN_WEB_URL: z.string().url(),
  INTERNAL_API_TOKEN: z.string().min(16),
  ACTIVE_BRAND_COOKIE_SECRET: z.string().min(32),
});
type AdminEnv = z.infer<typeof AdminEnvSchema>;

const DEV_DEFAULTS: AdminEnv = {
  NEXT_PUBLIC_API_ORIGIN: 'http://localhost:3000',
  ADMIN_WEB_URL: 'http://localhost:3001',
  // ...
};

export class AdminEnvValidationError extends Error {
  constructor(public readonly issues: z.ZodIssue[]) {
    super(
      `Invalid admin env: ${issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
    this.name = 'AdminEnvValidationError';
  }
}

const isPermissive = (nodeEnv: string | undefined): boolean =>
  nodeEnv === 'development' || nodeEnv === 'test';

const loadAdminEnv = (raw: NodeJS.ProcessEnv = process.env): AdminEnv => {
  const candidate = {
    /* pick from raw */
  };
  if (isPermissive(raw.NODE_ENV)) {
    for (const key of Object.keys(candidate) as (keyof AdminEnv)[]) {
      if (candidate[key] === undefined || candidate[key] === '')
        candidate[key] = DEV_DEFAULTS[key];
    }
  }
  const parsed = AdminEnvSchema.safeParse(candidate);
  if (!parsed.success) throw new AdminEnvValidationError(parsed.error.issues);
  return parsed.data;
};

const env = loadAdminEnv();
export const apiOrigin = (): string => env.NEXT_PUBLIC_API_ORIGIN;
```

**Website schema:** Replace `AdminEnvSchema` fields with:

```typescript
const WebsiteEnvSchema = z.object({
  NEXT_PUBLIC_API_ORIGIN: z.string().url(),
  WEBSITE_URL: z.string().url(),
});
```

DEV_DEFAULTS: `NEXT_PUBLIC_API_ORIGIN: 'http://localhost:3000'`, `WEBSITE_URL: 'http://localhost:3002'`. Export `apiOrigin()` and `websiteUrl()` accessors.

---

### `apps/website/lib/tenant-resolver.ts` (utility, request-response)

**Analog:** `apps/admin/lib/api-server.ts` — `headers()` from `next/headers` usage pattern (lines 168-196)

The website equivalent is simpler — just read the header injected by `middleware.ts`:

```typescript
// Pattern: read Next.js request headers in an RSC
import 'server-only';
import { headers } from 'next/headers';

// From apps/admin/lib/api-server.ts — the headers() call and null-safe get:
const cookieStore = await cookies();
const cookieHeader = cookieStore
  .getAll()
  .map((c) => `${c.name}=${c.value}`)
  .join('; ');
```

**Website implementation** (no existing analog — write directly):

```typescript
import 'server-only';
import { headers } from 'next/headers';

export const getTenantSlugFromHeaders = async (): Promise<string | null> => {
  const h = await headers();
  return h.get('x-tenant-slug');
};
```

---

### `apps/website/lib/i18n/request.ts` (utility, request-response)

**Analog:** `apps/admin/lib/i18n/request.ts` (lines 1-11)

**Full analog:**

```typescript
import { getRequestConfig } from 'next-intl/server';
import { resolveLocale } from './locale-cookie';
import { MESSAGES } from './messages-index';

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return { locale, messages: MESSAGES[locale] };
});
```

**Website adaptation:** Same structure. The `MESSAGES` import depends on whether a `messages-index.ts` pattern is used or direct dynamic import. Admin uses a `messages-index.ts` that pre-imports all locale JSON. Website can mirror that or use dynamic import:

```typescript
const messages = (await import(`../../messages/${locale}.json`)) as {
  default: unknown;
};
return { locale, messages: messages.default as Record<string, string> };
```

Either is valid — match whichever the planner chooses.

---

### `apps/website/lib/i18n/locales.ts` (utility, —)

**Analog:** `apps/admin/lib/i18n/locales.ts` (lines 1-8)

**Full analog:**

```typescript
export const LOCALES = ['ru', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'ru';
export const isLocale = (value: string | undefined): value is Locale =>
  value !== undefined && (LOCALES as readonly string[]).includes(value);
export const LOCALE_COOKIE_NAME = 'resto.locale';
```

**Website change:** `DEFAULT_LOCALE: Locale = 'en'` (D-05). Add `'uk'` to `LOCALES` if Ukrainian is a target locale for Phase 5 (per research `['en', 'uk', 'ru']`). Cookie name stays `'resto.locale'`.

---

### `apps/website/lib/i18n/locale-cookie.ts` (utility, request-response)

**Analog:** `apps/admin/lib/i18n/locale-cookie.ts` (lines 1-27)

**Full analog:**

```typescript
import 'server-only';
import { cookies, headers } from 'next/headers';
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  LOCALES,
  isLocale,
  type Locale,
} from './locales';

const negotiateFromAcceptLanguage = (header: string | null): Locale | null => {
  if (!header) return null;
  for (const token of header.split(',')) {
    const tag = token.split(';')[0]?.trim().toLowerCase() ?? '';
    if (tag.length === 0) continue;
    const primary = tag.split('-')[0] ?? '';
    if (isLocale(primary)) return primary;
    for (const known of LOCALES) {
      if (tag === known || tag.startsWith(`${known}-`)) return known;
    }
  }
  return null;
};

export const resolveLocale = async (): Promise<Locale> => {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  const headersList = await headers();
  const negotiated = negotiateFromAcceptLanguage(
    headersList.get('accept-language'),
  );
  return negotiated ?? DEFAULT_LOCALE;
};
```

Copy verbatim. The only effective change is via `locales.ts` — `DEFAULT_LOCALE` becomes `'en'`.

---

### `apps/website/components/checkout/checkout-form.tsx` (component, request-response)

**Analog 1 — RHF + zodResolver pattern:** `apps/admin/app/dashboard/(workspace)/menu/items/[id]/item-detail-form-client.tsx` (lines 1-113)

**Client island marker + RHF setup** (lines 1-87):

```typescript
'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FormProvider, useForm, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormField } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ItemEditorFormSchema, type ItemEditorForm } from '@/lib/menu/zod-schemas';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';

export function ItemDetailFormClient({ initialValues, ... }: ItemDetailFormClientProps) {
  const form = useForm<ItemEditorForm>({
    resolver: zodResolver(ItemEditorFormSchema),
    defaultValues: initialValues,
    mode: 'onChange',
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setPending(true);
    const res = await upsertItemAction(currentItemId, values, currentPhotoS3Key);
    setPending(false);
    if (!res.ok) { showError(res.error, t('saveFailed')); return; }
    showSuccess(isNew ? t('itemCreated') : tCommon('saved'), { duration: 1500 });
  });

  return (
    <FormProvider {...form}>
      <form id={formId} onSubmit={(e) => { void onSubmit(e); }} className="flex flex-col gap-6">
        ...
      </form>
    </FormProvider>
  );
}
```

**Analog 2 — simpler form (no RHF, server-action):** `apps/admin/app/(auth)/login/login-form-client.tsx` (lines 1-68)

The checkout form is a client-side form (cart submission in Phase 5 is client-only; no server action until Phase 7). Use the RHF + zodResolver pattern from `item-detail-form-client.tsx`. Key difference: no `FormProvider` needed if there's only one form with no child contexts; use `useForm` directly with `register`.

**Disabled submit button pattern** (login form, lines 14-21):

```typescript
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : 'Sign in'}
    </Button>
  );
}
```

**Website checkout button:** Always `disabled` in Phase 5 (no payment yet per D-07). Use `<Button type="button" disabled>Pay</Button>`.

---

### `apps/website/components/menu/menu-page-client.tsx` (component, event-driven)

**Analog:** `apps/qr-menu/src/components/MenuView.tsx` (lines 1-60)

**Structure pattern** (lines 15-60):

```typescript
export const MenuView = ({ menu, onSelectItem }: Props) => {
  const itemsByCategory = new Map<string, MenuItemDto[]>();
  for (const item of menu.items) {
    const list = itemsByCategory.get(item.categoryId);
    if (list) { list.push(item); } else { itemsByCategory.set(item.categoryId, [item]); }
  }

  if (menu.items.length === 0) {
    return (
      <main className="state state--empty">
        <h1>{t('menu.title')}</h1>
        <p>{t('menu.empty')}</p>
      </main>
    );
  }

  return (
    <main className="menu">
      {menu.categories.map((category) => {
        const items = itemsByCategory.get(category.id) ?? [];
        if (items.length === 0) return null;
        return (
          <section key={category.id} className="menu__section" aria-labelledby={`cat-${category.id}`}>
            <h2 id={`cat-${category.id}`}>{localized(category.name)}</h2>
            <ul className="menu__items">
              {items.map((item) => (
                <li key={item.id}><MenuItemCard item={item} onSelect={onSelectItem} /></li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
};
```

**Website adaptations:**

- Add `'use client'` directive (this is a client island)
- Replace CSS class names with Tailwind utility classes
- Replace `localized(text)` with `useTranslations()` from `next-intl` for UI strings; keep `localized(text)` helper for `LocalizedText` map resolution (inline or from `lib/i18n/locale-cookie.ts`)
- Add `selectedItemId` state + `onSelectItem` handler that opens `ItemModal`
- Add `CartDrawer` alongside the menu grid
- Replace qr-menu's `onSelectItem(id)` prop with `useState<string | null>` for modal state

---

### `apps/website/components/menu/menu-item-card.tsx` (component, request-response)

**Analog:** `apps/qr-menu/src/components/MenuItemCard.tsx` (lines 1-47)

**Full analog:**

```typescript
import type { MenuItemDto } from '../api/types';
import { localized, t } from '../i18n';

export const MenuItemCard = ({ item, onSelect }: Props) => {
  const onActivate = (): void => { onSelect(item.id); };
  return (
    <button type="button" className="menu-item" onClick={onActivate} aria-label={localized(item.name)}>
      {item.imageUrl ? (
        <img className="menu-item__image" src={item.imageUrl} alt="" loading="lazy" decoding="async" />
      ) : (
        <div className="menu-item__image menu-item__image--placeholder" aria-hidden="true" />
      )}
      <div className="menu-item__body">
        <h3 className="menu-item__name">{localized(item.name)}</h3>
        {item.description && <p className="menu-item__description">{localized(item.description)}</p>}
        <p className="menu-item__price" aria-label={`${item.basePrice} ${item.currency}`}>
          {t('item.priceFrom', { price: item.basePrice, currency: item.currency })}
        </p>
      </div>
    </button>
  );
};
```

**Website adaptations:**

- Add `'use client'` directive (handles click events)
- Replace CSS class names (`menu-item`, `menu-item__image`, etc.) with Tailwind utility classes per UI-SPEC spacing scale
- Replace `localized()` import from qr-menu with inline helper or import from `@/lib/i18n`
- Replace `t()` with `useTranslations()` from `next-intl`
- Use `<Image>` from `next/image` instead of `<img>` for optimization
- Add `aria-label` price format: `aria-label="{price} {currency}"` (UI-SPEC accessibility rule)
- Add `"Add to cart"` button or make the whole card the trigger for `ItemModal` (D-06: item opens in modal)

---

### `apps/website/components/menu/item-modal.tsx` (component, event-driven)

**Analog:** `apps/qr-menu/src/components/ItemDetail.tsx` (lines 1-48)

**Full analog:**

```typescript
import type { MenuItemDto } from '../api/types';
import { localized, t } from '../i18n';

export const ItemDetail = ({ item, onBack }: Props) => (
  <main className="item">
    <button type="button" className="item__back" onClick={onBack}>← {t('item.back')}</button>
    {item.imageUrl ? <img className="item__image" src={item.imageUrl} alt="" loading="lazy" /> : ...}
    <h1 className="item__name">{localized(item.name)}</h1>
    {item.description && <p className="item__description">{localized(item.description)}</p>}
    <p className="item__price" aria-label={`${item.basePrice} ${item.currency}`}>
      <span>{item.basePrice}</span> <span>{item.currency}</span>
    </p>
    {item.sizes.length > 0 && (
      <ul className="item__variants">
        {item.sizes.map((size) => (
          <li key={size.id} className={size.isDefault ? 'is-default' : undefined}>
            <span>{localized(size.name)}</span>
            <span>{size.price} {item.currency}</span>
          </li>
        ))}
      </ul>
    )}
  </main>
);
```

**Website adaptations:**

- Wrap in shadcn `<Dialog>` / `<Sheet>` instead of routing to a separate page (D-06: item modal not a separate page)
- Add `'use client'` directive
- Replace CSS class names with Tailwind utility classes per UI-SPEC
- Add modifier group selection UI (checkboxes/radio for required/optional modifier groups)
- Add "Add to cart" button that calls `useCartStore().addItem(...)` with size + modifier snapshots
- Add quantity stepper (+/−) per UI-SPEC touch target rules (44px min hit area)

---

### `packages/api-client/src/public.ts` (utility, —)

**Analog:** `apps/qr-menu/src/api/types.ts` (lines 1-115) — the types to re-export

**Current `public.ts`** (lines 1-4):

```typescript
import type { paths as allPaths } from './generated/api.js';
export type paths = Pick<allPaths, Extract<keyof allPaths, `/v1/${string}`>>;
export type { components, operations } from './generated/api.js';
```

**What to add:** Re-export the `MenuDto` wire types from `apps/qr-menu/src/api/types.ts` so `apps/website` can import from `@resto/api-client/public` without importing from `apps/qr-menu`. The types are currently duplicated in `qr-menu` — they should be the canonical source in `packages/api-client/src/public.ts`.

Types to export (from `apps/qr-menu/src/api/types.ts`):

```typescript
export type {
  LocalizedText,
  MenuPhotoDto,
  MenuItemSizeDto,
  MenuModifierOptionDto,
  MenuModifierGroupDto,
  MenuItemDto,
  MenuCategoryDto,
  MenuBrandThemeDto,
  MenuBrandDto,
  MenuDto,
} from './menu-types';
```

Simplest approach: create `packages/api-client/src/menu-types.ts` with the full type definitions copied from `apps/qr-menu/src/api/types.ts` (zero runtime cost — types only), then re-export from `public.ts`. qr-menu will import from `@resto/api-client/public` at Phase 6.

---

### `apps/website/store/cart.ts` (store, event-driven)

**Analog:** None — no Zustand store exists in this codebase yet.

See RESEARCH.md Pattern 4 for the full Zustand `persist` + `sessionStorage` implementation to build from scratch. Key interface to pre-align with ORD-03:

```typescript
interface CartLineItem {
  readonly itemId: string;
  readonly sizeId: string | null;
  readonly name: string; // snapshot at add-time
  readonly unitPrice: string; // resolved price at add-time
  readonly currency: string;
  readonly modifiers: readonly CartModifier[];
  quantity: number;
}
```

Use `create<CartState>()(persist(..., { name: 'resto-cart', storage: createJSONStorage(() => sessionStorage) }))` pattern.

---

## Shared Patterns

### `import 'server-only'` Guard

**Source:** `apps/admin/lib/api-server.ts` line 1, `apps/admin/lib/env.ts` line 1
**Apply to:** `apps/website/lib/api-client.ts`, `apps/website/lib/env.ts`, `apps/website/lib/tenant-resolver.ts`, `apps/website/lib/i18n/locale-cookie.ts`

```typescript
import 'server-only';
```

### `'use client'` Directive

**Source:** `apps/admin/app/(auth)/login/login-form-client.tsx` line 1, `apps/admin/components/ai-preview-card-client.tsx` line 1
**Apply to:** All components in `apps/website/components/` that use hooks, event handlers, or browser APIs:

- `menu-page-client.tsx`, `menu-item-card.tsx`, `item-modal.tsx`, `cart-drawer.tsx`
- `cart-line-item.tsx`, `delivery-pickup-banner.tsx`, `category-nav.tsx`
- `checkout/checkout-form.tsx`, `checkout/address-input.tsx`, `checkout/order-time-selector.tsx`

```typescript
'use client';
```

### Env Validation Pattern (Zod + DEV_DEFAULTS)

**Source:** `apps/admin/lib/env.ts` (lines 15-72)
**Apply to:** `apps/website/lib/env.ts`

The full `loadAdminEnv` function with `isPermissive()`, `DEV_DEFAULTS`, `safeParse()`, and typed accessor exports (`apiOrigin()` etc.) is the exact shape to copy. Only schema fields change.

### RSC Async Page Pattern

**Source:** `apps/admin/app/dashboard/(workspace)/page.tsx` (lines 1-33), `apps/admin/app/dashboard/layout.tsx` (lines 24-73)
**Apply to:** `apps/website/app/page.tsx`, `apps/website/app/layout.tsx`, all content pages (`about/page.tsx`, `delivery/page.tsx`, `contact/page.tsx`, `faq/page.tsx`)

Pattern: `export default async function Page()` with direct `await` calls in the function body. No `getServerSideProps`. Data fetching happens at the top of the function, errors handled with `redirect()` or `notFound()`, props passed down to client islands.

### next-intl Provider in Layout

**Source:** `apps/admin/app/layout.tsx` (lines 1-41)
**Apply to:** `apps/website/app/layout.tsx`

```typescript
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';

// In async RootLayout:
const locale = await getLocale();
const messages = await getMessages();
// Wrap children: <NextIntlClientProvider locale={locale} messages={messages}>
```

### Shadcn Form Pattern (RHF + zodResolver)

**Source:** `apps/admin/app/dashboard/(workspace)/menu/items/[id]/item-detail-form-client.tsx` (lines 9-113)
**Apply to:** `apps/website/components/checkout/checkout-form.tsx`

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormField } from '@/components/ui/form';

const form = useForm<FormType>({
  resolver: zodResolver(FormSchema),
  defaultValues: initialValues,
  mode: 'onChange',
});
```

### LocalizedText Resolution Helper

**Source:** `apps/qr-menu/src/i18n/index.ts` (lines 46-53)
**Apply to:** `apps/website/lib/i18n/localized.ts` (new small utility), consumed by all menu-rendering components

```typescript
export const localized = (
  text: Record<string, string> | null | undefined,
  locale: string,
): string => {
  if (!text) return '';
  const exact = text[locale];
  if (exact) return exact;
  if (text.en) return text.en;
  const first = Object.values(text)[0];
  return first ?? '';
};
```

**Note:** qr-menu's `localized()` reads from a module-level `activeLocale` variable. Website should pass locale as a parameter (cleaner for RSC where locale comes from `next-intl`) or use `useTranslations` for UI strings and the helper only for `LocalizedText` map resolution.

### Error Boundary / notFound Pattern

**Source:** `apps/admin/app/dashboard/layout.tsx` (lines 31-35)
**Apply to:** `apps/website/app/page.tsx`, `apps/website/app/layout.tsx`

```typescript
if (!tenantRes.ok || !tenantRes.data) {
  redirect('/login');
}
```

Website equivalent: `if (!tenantSlug) notFound();` and `if (err instanceof TenantNotFoundError) notFound();`

---

## No Analog Found

| File                                                       | Role      | Data Flow        | Reason                                                                                            |
| ---------------------------------------------------------- | --------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| `apps/website/store/cart.ts`                               | store     | event-driven     | No Zustand store exists in codebase; use RESEARCH.md Pattern 4 as implementation spec             |
| `apps/website/components/menu/category-nav.tsx`            | component | event-driven     | No sticky scroll-nav exists; build with `IntersectionObserver` + shadcn `ScrollArea`              |
| `apps/website/components/menu/delivery-pickup-banner.tsx`  | component | event-driven     | No delivery/pickup mode toggle exists; use shadcn `Tabs` primitive                                |
| `apps/website/components/menu/cart-drawer.tsx`             | component | event-driven     | No cart drawer exists; use shadcn `Sheet` (same Radix as Dialog)                                  |
| `apps/website/components/checkout/address-input.tsx`       | component | event-driven     | No address input exists; Phase 5 is a stub — plain text input, always green                       |
| `apps/website/components/checkout/order-time-selector.tsx` | component | event-driven     | No order time selector exists; use shadcn `RadioGroup` or `Select`                                |
| `apps/website/components/layout/tenant-header.tsx`         | component | request-response | No public-facing tenant header exists in admin (admin has `SiteHeader` but it is operator-facing) |

---

## Metadata

**Analog search scope:** `apps/admin/`, `apps/qr-menu/src/`, `packages/api-client/src/`, `packages/domain/src/`
**Files scanned:** 28
**Pattern extraction date:** 2026-06-12
