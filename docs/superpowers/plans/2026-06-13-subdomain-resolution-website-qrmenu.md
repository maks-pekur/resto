# Subdomain-Based Resolution (website + qr-menu) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve tenant+brand from the request subdomain on website and qr-menu, in prod and dev, so per-tenant theming flows end-to-end.

**Architecture:** qr-menu fetches the API **same-origin** (Vite dev proxy preserves the brand `Host`). website is SSR, so it reads its incoming brand host and forwards it to the API as `x-forwarded-host`; the API resolver honors that header **only when `TRUST_PROXY` is configured** (so it can't be spoofed by untrusted clients) and feeds it to the existing `resolveByCustomerHost`. admin and the seed CLI are untouched.

**Tech Stack:** NestJS + Fastify (API), Next.js 16 RSC (website), Vite + React (qr-menu), Vitest, pnpm + Nx. Dev uses the `lvh.me` wildcard (`*.lvh.me` → 127.0.0.1).

**Companion spec:** `docs/superpowers/specs/2026-06-13-subdomain-resolution-website-qrmenu-design.md`

**Branch:** run on a feature branch off `main` (suggested `res-83`). Confirm at execution.

**Security note:** honoring `x-forwarded-host` is gated by `TRUST_PROXY` (dev/test or a prod CIDR). `/v1/menu` is public, so a spoofed brand host only exposes already-public published menus; authenticated/internal routes remain protected by the `AuthGuard` tenant-mismatch (RES-172) and `x-internal-token` (RES-176) checks, which this plan does not touch.

---

### Task 1: Spike — confirm the host-propagation mechanism (no code change)

**Goal:** Verify the two assumptions the design rests on, using the already-running local stack (API on `:3000`, a seeded brand `cafe-demo` whose theme is `#2563eb`). Record the result; it confirms we ship the `x-forwarded-host` path.

- [ ] **Step 1: Confirm the API resolver currently reads the literal `Host`, not a forwarded host**

Run:

```bash
cd /Users/mp_dev/projects/RestOS
docker exec resto-redis redis-cli FLUSHALL >/dev/null
curl -s -H 'Host: localhost:3000' -H 'x-forwarded-host: cafe-demo.lvh.me' http://localhost:3000/v1/menu \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('brand:',j.brand&&j.brand.slug)})"
```

Expected: `brand: null` — proving `x-forwarded-host` is currently ignored (the resolver uses the literal `Host=localhost:3000`, ≤2 labels → no brand). This is the gap Task 2 closes.

- [ ] **Step 2: Confirm subdomain resolution already works when the host IS the brand**

Run:

```bash
curl -s -H 'Host: cafe-demo.lvh.me' http://localhost:3000/v1/menu \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('brand:',j.brand&&j.brand.slug,'items:',j.items.length)})"
```

Expected: `brand: cafe-demo items: 5` — the resolver works when the brand subdomain arrives as `Host`. So qr-menu (Vite proxy preserving Host) needs no API change; only website (SSR, can't set `Host`) needs the forwarded-host path.

- [ ] **Step 3: Record the decision (no commit)**

Decision is fixed: ship `x-forwarded-host` honored under `TRUST_PROXY` (Task 2); website forwards its brand host (Task 3); qr-menu uses same-origin + Vite proxy (Task 4). No further branching. Proceed to Task 2.

---

### Task 2: API honors `x-forwarded-host` under `TRUST_PROXY` (TDD)

**Files:**

- Create: `apps/api/src/shared/effective-host.ts`
- Create: `apps/api/test/unit/shared/effective-host.spec.ts`
- Modify: `apps/api/src/shared/tenant-context.middleware.ts` (use the helper at the two `req.headers.host` reads)

- [ ] **Step 1: Write the failing test** — `apps/api/test/unit/shared/effective-host.spec.ts`

```ts
import { describe, expect, it } from 'vitest';
import { effectiveHost } from '../../../src/shared/effective-host';

describe('effectiveHost', () => {
  it('returns the literal Host when trustProxy is off', () => {
    const headers = {
      host: 'localhost:3000',
      'x-forwarded-host': 'cafe-demo.lvh.me',
    };
    expect(effectiveHost(headers, false)).toBe('localhost:3000');
  });

  it('prefers x-forwarded-host when trustProxy is on', () => {
    const headers = {
      host: 'localhost:3000',
      'x-forwarded-host': 'cafe-demo.lvh.me',
    };
    expect(effectiveHost(headers, true)).toBe('cafe-demo.lvh.me');
  });

  it('uses the first value of a comma-joined x-forwarded-host', () => {
    const headers = {
      host: 'gw',
      'x-forwarded-host': 'cafe-demo.lvh.me, gw.internal',
    };
    expect(effectiveHost(headers, true)).toBe('cafe-demo.lvh.me');
  });

  it('falls back to Host when x-forwarded-host is absent even with trustProxy on', () => {
    expect(effectiveHost({ host: 'cafe-demo.lvh.me' }, true)).toBe(
      'cafe-demo.lvh.me',
    );
  });

  it('returns undefined when neither header is present', () => {
    expect(effectiveHost({}, true)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @resto/api exec vitest run test/unit/shared/effective-host.spec.ts`
Expected: FAIL — cannot resolve `../../../src/shared/effective-host`.

- [ ] **Step 3: Write the implementation** — `apps/api/src/shared/effective-host.ts`

```ts
/**
 * The host the request was addressed to. When the app sits behind a trusted
 * proxy (`TRUST_PROXY` configured), the original brand subdomain arrives in
 * `x-forwarded-host` (the literal `Host` is the proxy/loopback). We honor it
 * ONLY when trustProxy is on, so an untrusted client cannot spoof a brand.
 * `/v1/menu` is public, and authenticated routes still pass the AuthGuard
 * tenant-mismatch cross-check (RES-172), so this is safe under the gate.
 */
export function effectiveHost(
  headers: Record<string, string | string[] | undefined>,
  trustProxy: boolean,
): string | undefined {
  if (trustProxy) {
    const fwd = headers['x-forwarded-host'];
    const raw = Array.isArray(fwd) ? fwd[0] : fwd;
    const first = raw?.split(',')[0]?.trim();
    if (first) return first;
  }
  const host = headers.host;
  const literal = Array.isArray(host) ? host[0] : host;
  return literal && literal.length > 0 ? literal : undefined;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @resto/api exec vitest run test/unit/shared/effective-host.spec.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Wire the helper into the middleware**

In `apps/api/src/shared/tenant-context.middleware.ts`:

1. Add the import near the other shared imports at the top:

```ts
import { effectiveHost } from './effective-host';
```

2. The middleware already injects the validated env (used as `this.env`). Compute the trust flag once at the start of the resolve method and replace the two literal `req.headers.host` reads.
   - Replace line 55 `const host = req.headers.host;` with:

```ts
const trustProxy =
  this.env.TRUST_PROXY !== undefined && this.env.TRUST_PROXY.length > 0;
const host = effectiveHost(req.headers, trustProxy);
```

- Replace the `resolveByHost(req.headers.host)` call (the line `const fromHost = await this.tenants.resolveByHost(req.headers.host);`) with:

```ts
const fromHost = await this.tenants.resolveByHost(
  effectiveHost(
    req.headers,
    this.env.TRUST_PROXY !== undefined && this.env.TRUST_PROXY.length > 0,
  ),
);
```

(If `this.env` is not already available in the middleware, inject it the same way the existing code reads `this.env.NODE_ENV` — that read already exists in `resolveTenantOnly`, so `this.env` is in scope.)

- [ ] **Step 6: Run the API unit tests + typecheck**

Run:

```bash
pnpm --filter @resto/api exec vitest run test/unit/shared/
pnpm exec nx run api:typecheck
```

Expected: PASS (including the existing `tenant-context.middleware.spec.ts`).

- [ ] **Step 7: Live verification against the running stack**

Run:

```bash
docker exec resto-redis redis-cli FLUSHALL >/dev/null
curl -s -H 'Host: localhost:3000' -H 'x-forwarded-host: cafe-demo.lvh.me' http://localhost:3000/v1/menu \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('brand:',j.brand&&j.brand.slug,'theme:',j.brand&&j.brand.theme&&j.brand.theme.primaryColor)})"
```

Expected: `brand: cafe-demo theme: #2563eb` — `x-forwarded-host` now resolves the brand (TRUST_PROXY is set in the dev `.env`). Restart the API dev server first if it does not hot-reload the middleware (`tsx watch` should).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/shared/effective-host.ts apps/api/test/unit/shared/effective-host.spec.ts apps/api/src/shared/tenant-context.middleware.ts
git commit -m "feat(api): resolve customer host from x-forwarded-host under TRUST_PROXY"
```

---

### Task 3: website forwards its brand host (SSR) + drops tenant-header derivation

**Files:**

- Modify: `apps/website/lib/api-client.ts` (`fetchMenuPublic` — forward host, drop `x-tenant-slug`)
- Modify: `apps/website/app/layout.tsx` (call `fetchMenuPublic()` with no slug)
- Modify: `apps/website/middleware.ts` (remove tenant derivation; keep locale)
- Delete: `apps/website/lib/tenant-resolver.ts` (no longer used)
- Test: `apps/website/test/api-client.spec.ts`

- [ ] **Step 1: Update `fetchMenuPublic`** — `apps/website/lib/api-client.ts`

Replace the whole `fetchMenuPublic` function (and drop the now-unused `tenantSlug` param) with:

```ts
import 'server-only';
import { headers } from 'next/headers';
import type { MenuDto } from '@resto/api-client/public';
import { apiOrigin } from './env';

export class TenantNotFoundError extends Error {
  constructor() {
    super('No tenant resolved for this host.');
    this.name = 'TenantNotFoundError';
  }
}

export class TenantSuspendedError extends Error {
  constructor() {
    super('This restaurant is temporarily unavailable.');
    this.name = 'TenantSuspendedError';
  }
}

/**
 * Fetch the published menu for the brand identified by the incoming request
 * host. website is SSR, so it forwards its brand subdomain to the api as
 * `x-forwarded-host`; the api resolves the brand from it (under TRUST_PROXY).
 */
export const fetchMenuPublic = async (): Promise<MenuDto> => {
  const h = await headers();
  const host = h.get('host') ?? '';
  const res = await fetch(`${apiOrigin()}/v1/menu`, {
    headers: { 'x-forwarded-host': host },
    next: { revalidate: 60 },
  });
  if (res.status === 404) throw new TenantNotFoundError();
  if (res.status === 403) throw new TenantSuspendedError();
  if (!res.ok)
    throw new Error(`fetchMenuPublic failed: ${res.status.toString()}`);
  return res.json() as Promise<MenuDto>;
};
```

- [ ] **Step 2: Update the failing test** — `apps/website/test/api-client.spec.ts`

Replace the test body with one that asserts the host is forwarded and no tenant header is sent. (Mock `next/headers` and `fetch`.)

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

const getHeader = vi.fn();
vi.mock('next/headers', () => ({
  headers: () => Promise.resolve({ get: getHeader }),
}));
vi.mock('../lib/env', () => ({ apiOrigin: () => 'http://api.test' }));

import { fetchMenuPublic, TenantNotFoundError } from '../lib/api-client';

afterEach(() => vi.restoreAllMocks());

describe('fetchMenuPublic', () => {
  it('forwards the incoming host as x-forwarded-host and sends no tenant header', async () => {
    getHeader.mockReturnValue('cafe-demo.lvh.me');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ brand: { slug: 'cafe-demo' }, items: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchMenuPublic();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/v1/menu');
    expect(init.headers).toEqual({ 'x-forwarded-host': 'cafe-demo.lvh.me' });
    expect(init.headers['x-tenant-slug']).toBeUndefined();
  });

  it('throws TenantNotFoundError on 404', async () => {
    getHeader.mockReturnValue('nope.lvh.me');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );
    await expect(fetchMenuPublic()).rejects.toBeInstanceOf(TenantNotFoundError);
  });
});
```

- [ ] **Step 3: Run the test (fails until impl matches), then passes**

Run: `pnpm --filter website exec vitest run test/api-client.spec.ts`
Expected: PASS after Step 1's implementation (the test and impl are co-delivered; if the repo's pre-commit blocks a separate RED commit, that is fine — this is a refactor of an existing function).

- [ ] **Step 4: Update `layout.tsx`** — `apps/website/app/layout.tsx`

Replace the tenant-fetch block (the `getTenantSlugFromHeaders()` call through the `theme` assignment) with a host-driven fetch:

```ts
let theme: { primaryColor?: string | null } | null = null;
try {
  const menu = await fetchMenuPublic();
  theme = menu.brand?.theme ?? null;
} catch {
  // unresolved host / cold Redis / suspended — render default theme
}

const themeStyle = theme
  ? (buildTenantThemeVars(theme) as React.CSSProperties)
  : undefined;
```

Remove the now-unused import of `getTenantSlugFromHeaders` and the `fetchMenuPublic(tenantSlug)` argument. Keep the `buildTenantThemeVars` import and the `<html … style={themeStyle}>` usage.

- [ ] **Step 5: Simplify `middleware.ts`** — `apps/website/middleware.ts`

Remove the tenant derivation. Replace the body of `middleware` so it only negotiates locale (no `x-tenant-slug`, no `?tenant=`, no host parsing):

```ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  isLocale,
  type Locale,
} from '@/lib/i18n/locales';

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

export function middleware(request: NextRequest): NextResponse {
  const fromCookie = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
  const locale: Locale = isLocale(fromCookie)
    ? fromCookie
    : (negotiateFromAcceptLanguage(request.headers.get('accept-language')) ??
      DEFAULT_LOCALE);

  const response = NextResponse.next();
  response.cookies.set('NEXT_LOCALE', locale, {
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
  });
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
```

- [ ] **Step 6: Delete the dead tenant resolver**

Run:

```bash
git rm apps/website/lib/tenant-resolver.ts
grep -rn "getTenantSlugFromHeaders\|tenant-resolver" apps/website --include='*.ts' --include='*.tsx' || echo "no references remain"
```

Expected: `no references remain`.

- [ ] **Step 7: Typecheck + tests + build**

Run:

```bash
pnpm exec nx run website:typecheck
pnpm --filter website exec vitest run
pnpm exec nx run website:build
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/website/lib/api-client.ts apps/website/app/layout.tsx apps/website/middleware.ts apps/website/test/api-client.spec.ts
git commit -m "feat(website): resolve brand by forwarding host to api; drop tenant-slug path"
```

---

### Task 4: qr-menu fetches same-origin + Vite proxy preserves Host

**Files:**

- Modify: `apps/qr-menu/src/api/client.ts` (relative same-origin; drop VITE\_\* resolution)
- Modify: `apps/qr-menu/vite.config.ts` (add `server.proxy` for `/v1`, `changeOrigin: false`)
- Delete: `apps/qr-menu/.env.local`

- [ ] **Step 1: Make the client same-origin** — `apps/qr-menu/src/api/client.ts`

Replace the API-base + tenant-override logic. Delete the `API_URL`, `TENANT_SLUG_OVERRIDE`, `buildHeaders`, and `apiUrl` constructs; fetch relative paths so the request is same-origin (the browser's brand subdomain is the `Host`). The top of the file becomes:

```ts
import type { MenuDto } from '@resto/api-client/public';

export class MenuNotFoundError extends Error {
  constructor() {
    super('Menu not found for this tenant.');
    this.name = 'MenuNotFoundError';
  }
}
```

And the fetch uses the relative path directly (no `apiUrl()`, no custom headers):

```ts
export const fetchMenu = async (signal?: AbortSignal): Promise<MenuDto> => {
  const init: RequestInit = {};
  if (signal) init.signal = signal;
  const res = await fetch('/v1/menu', init);
  if (res.status === 404) throw new MenuNotFoundError();
  if (!res.ok) throw new Error(`fetchMenu failed: ${res.status.toString()}`);
  return res.json() as Promise<MenuDto>;
};
```

(Apply the same `'/v1/...'` relative-path change to any other fetch in this file, e.g. an item fetch, removing `apiUrl(...)`.)

- [ ] **Step 2: Add the dev proxy** — `apps/qr-menu/vite.config.ts`

Replace the `server` block with one that proxies `/v1` (and `/internal`) to the API while preserving the brand `Host` (`changeOrigin: false`):

```ts
  server: {
    port: 3003,
    host: true,
    // Dev only: forward the public/internal api paths to the api on :3000.
    // `changeOrigin: false` keeps the brand subdomain Host (e.g.
    // `cafe-demo.menu.lvh.me`) so the api resolves the brand from it,
    // mirroring same-origin production.
    proxy: {
      '/v1': { target: 'http://localhost:3000', changeOrigin: false },
      '/internal': { target: 'http://localhost:3000', changeOrigin: false },
    },
  },
```

- [ ] **Step 3: Remove the dev env override**

Run:

```bash
rm -f apps/qr-menu/.env.local
grep -rn "VITE_API_URL\|VITE_TENANT_SLUG" apps/qr-menu/src || echo "no VITE_ resolution refs remain"
```

Expected: `no VITE_ resolution refs remain`.

- [ ] **Step 4: Typecheck + build**

Run:

```bash
pnpm exec nx run qr-menu:typecheck
pnpm exec nx run qr-menu:build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/qr-menu/src/api/client.ts apps/qr-menu/vite.config.ts
git commit -m "feat(qr-menu): fetch api same-origin; dev proxy preserves brand host"
```

---

### Task 5: Dev run documentation

**Files:**

- Modify: `apps/CLAUDE.md` (add a short "Running customer surfaces by subdomain (dev)" note)

- [ ] **Step 1: Document the dev subdomain workflow** — append to `apps/CLAUDE.md` under a new subsection in the website / qr-menu area:

```markdown
### Running customer surfaces by subdomain (dev)

website and qr-menu resolve the brand from their subdomain (same as prod).
Use the `lvh.me` wildcard (`*.lvh.me` → 127.0.0.1, no `/etc/hosts` needed):

- website: `http://<brand-slug>.lvh.me:3002` (e.g. `http://cafe-demo.lvh.me:3002`).
  Next forwards the brand host to the api as `x-forwarded-host`; the api
  honors it because dev `.env` sets `TRUST_PROXY`.
- qr-menu: `http://<brand-slug>.menu.lvh.me:3003`. Vite proxies `/v1` to the
  api with `changeOrigin: false`, preserving the brand subdomain `Host`.

There is no `?tenant=` / `VITE_TENANT_SLUG` shortcut anymore — open the brand
subdomain directly. The api still accepts `x-tenant-slug` only on
`/internal/v1/*` with a valid `x-internal-token` (the seed CLI path).
```

- [ ] **Step 2: Commit**

```bash
git add apps/CLAUDE.md
git commit -m "docs: dev workflow for subdomain-based customer surfaces"
```

---

### Task 6: End-to-end smoke (manual, dev)

**Files:** none (verification only)

- [ ] **Step 1: Ensure the stack + dev servers are running**

API on `:3000` (with the Task 2 change), website dev on `:3002`, qr-menu dev on `:3003`, and the seeded themed brands (`cafe-demo` → `#2563eb`, `dovezuka` → `#e11d48`). Flush the menu cache: `docker exec resto-redis redis-cli FLUSHALL`.

- [ ] **Step 2: website renders the brand theme via subdomain**

Run:

```bash
curl -s http://cafe-demo.lvh.me:3002/ | grep -o 'style="[^"]*--primary[^"]*"' | head -1
```

Expected: the inline `<html>` style contains `--primary:#2563eb` (the cafe-demo theme), proving website resolved the brand from its subdomain and injected the theme. (If empty, confirm the API picked up the Task 2 change and Redis was flushed.)

- [ ] **Step 3: qr-menu resolves the brand via subdomain**

Load `http://dovezuka.menu.lvh.me:3003/` in a browser (or drive headless) and confirm the accent renders `#e11d48`. As a non-browser check, confirm the proxied API call resolves the brand:

```bash
curl -s -H 'Host: dovezuka.menu.lvh.me:3003' http://localhost:3003/v1/menu \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('brand:',j.brand&&j.brand.slug)})"
```

Expected: `brand: dovezuka` (the Vite proxy preserved the Host through to the API).

- [ ] **Step 4: Record the smoke result in the final commit/PR description** (no code).

---

## Self-Review

**Spec coverage:**

- Goal 1 (website + qr-menu resolve brand from subdomain, prod+dev) → Task 2 (API forwarded-host) + Task 3 (website) + Task 4 (qr-menu).
- Goal 2 (dev mirrors prod via `lvh.me`) → Task 4 (Vite proxy), Task 3 (website forwards host), Task 5 (docs).
- Goal 3 (remove dev header shortcuts) → Task 3 Step 5 (`?tenant=`/`x-tenant-slug` gone), Task 4 Step 3 (`VITE_*` gone).
- Goal 4 (theme renders, no theming-code change) → `layout.tsx` keeps `buildTenantThemeVars`; Task 6 verifies.
- D1 (admin untouched) → no admin files in any task.
- D2 (same-origin) → qr-menu same-origin (Task 4); website SSR forwards host (the spec's documented fallback for the SSR case, confirmed in Task 1).
- D4 (label rule unchanged) → Task 2 changes only the host SOURCE (forwarded-host), not the `labels.length > 2` rule.
- D5 (`x-tenant-slug` retained for seed/internal) → unchanged; only `shouldAcceptTenantSlugHeader` gating governs it, untouched.

**Placeholder scan:** No TBD/TODO; every code step shows complete content; the spike (Task 1) is concrete curl checks with a fixed decision.

**Type consistency:** `effectiveHost(headers, trustProxy)` is defined in Task 2 and used in the middleware in the same task. `fetchMenuPublic()` becomes zero-arg in Task 3 and is called zero-arg in `layout.tsx` (same task). `fetchMenu(signal?)` keeps its signature in qr-menu (Task 4); only its internals change.

**Known follow-ups (out of scope, flagged):** the possible admin operator-route production gap surfaced during the audit (admin `x-tenant-id` honored only on `/internal/v1/*` in prod) is NOT addressed here — separate investigation.
