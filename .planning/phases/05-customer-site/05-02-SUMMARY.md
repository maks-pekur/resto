---
phase: 05-customer-site
plan: "02"
subsystem: website-middleware-i18n
tags: [next, middleware, tenant-resolution, i18n, api-client, env, layout, rsc]
dependency_graph:
  requires: [05-01]
  provides:
    - apps/website/middleware.ts (per-request tenant + locale resolution)
    - apps/website/lib/api-client.ts (public /v1/menu server fetch)
    - apps/website/lib/env.ts (Zod env schema, no INTERNAL_API_TOKEN)
    - apps/website/lib/tenant-resolver.ts (RSC header reader)
    - apps/website/lib/i18n/locales.ts (LOCALES=['en','uk','ru'], DEFAULT_LOCALE='en')
    - apps/website/lib/i18n/locale-cookie.ts (resolveLocale)
    - apps/website/lib/i18n/request.ts (getRequestConfig full implementation)
    - apps/website/lib/i18n/localized.ts (localized() helper with locale param)
    - apps/website/messages/en.json (full UI-SPEC copy)
    - apps/website/app/layout.tsx (per-tenant --primary injection, NextIntlClientProvider, Toaster)
    - apps/website/components/ui/sonner.tsx (light-only Toaster, no ThemeProvider)
  affects: [apps/website]
tech_stack:
  added: []
  patterns:
    - Next.js Edge Middleware with NextResponse.next({ request: { headers } })
    - vi.stubEnv + vi.resetModules for NODE_ENV-sensitive unit tests
    - server-only guard on all lib/* server modules
    - Zod env schema with DEV_DEFAULTS (isPermissive pattern from admin)
    - RSC root layout with graceful try/catch on fetchMenuPublic for --primary theming
key_files:
  created:
    - apps/website/middleware.ts
    - apps/website/lib/env.ts
    - apps/website/lib/api-client.ts
    - apps/website/lib/tenant-resolver.ts
    - apps/website/lib/i18n/locales.ts
    - apps/website/lib/i18n/locale-cookie.ts
    - apps/website/lib/i18n/localized.ts
    - apps/website/messages/en.json
    - apps/website/components/ui/sonner.tsx
    - apps/website/.env.example
    - apps/website/test/middleware.spec.ts
    - apps/website/test/api-client.spec.ts
  modified:
    - apps/website/lib/i18n/request.ts (stub replaced with full implementation)
    - apps/website/app/layout.tsx (stub replaced with per-tenant theme injection)
decisions:
  - "x-tenant-slug is set on forwarded request headers via NextResponse.next({ request: { headers } }); RSC reads it via headers() — not on the HTTP response headers (Pitfall 1)"
  - "Unit tests assert x-middleware-request-x-tenant-slug on response (Next.js internal prefix for forwarded request mutations)"
  - "vi.stubEnv + vi.resetModules pattern used for NODE_ENV-sensitive tests (Object.defineProperty fails on process.env in Node 24)"
  - "Red test + stub committed together so ESLint/TypeScript pre-commit hook can type-check the spec; behavior RED confirmed via 11 failing assertions against the no-op stub"
  - "localized() takes locale as a parameter (not module-global) for clean RSC usage"
  - "Sonner Toaster uses theme=light (no ThemeProvider — website is light-only in Phase 5 per UI-SPEC)"
  - ".env.local created for local build with DEV values; .env.example committed for onboarding"
metrics:
  duration: ~25min
  completed: "2026-06-12"
  tasks: 3
  files: 14
---

# Phase 5 Plan 2: Middleware, API Client, i18n, Layout Summary

One-liner: Edge middleware resolves tenant (subdomain + dev ?tenant=) and locale (en default) per request; server-only fetchMenuPublic fetches /v1/menu with x-tenant-slug; RSC root layout injects per-tenant --primary CSS variable from brand theme with graceful fallback.

## Tasks Executed

| Task      | Name                                | Commit  | Files                                                                                                                                           |
| --------- | ----------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 (RED)   | Middleware RED test + stub          | cd6ca52 | test/middleware.spec.ts, middleware.ts (stub)                                                                                                   |
| 1 (GREEN) | Tenant + locale middleware          | 1883875 | middleware.ts, lib/i18n/locales.ts, test/middleware.spec.ts                                                                                     |
| 2         | Env schema + server-only API client | 0bac5cf | lib/env.ts, lib/api-client.ts, lib/tenant-resolver.ts, test/api-client.spec.ts                                                                  |
| 3         | i18n config + RSC layout            | 79a26d0 | lib/i18n/locale-cookie.ts, lib/i18n/request.ts, lib/i18n/localized.ts, messages/en.json, app/layout.tsx, components/ui/sonner.tsx, .env.example |

## Verification

- `pnpm nx test website` — 19/19 tests pass (11 middleware + 8 api-client)
- `pnpm nx typecheck website` — passes (0 errors)
- `pnpm nx build website` — passes after adding `.env.local` with dev defaults
- Production security invariant test: NODE_ENV=production + ?tenant=evil → null x-tenant-slug (hard-tested, was RED before middleware existed)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Adapted TDD RED approach to satisfy pre-commit TypeScript strict typing**

- **Found during:** Task 1 RED commit
- **Issue:** Dynamic `import('@/middleware')` returned `any` because the module didn't exist yet, triggering 12 `no-unsafe-assignment` / `no-unsafe-member-access` ESLint errors in the RED test
- **Fix:** Created a minimal no-op stub `middleware.ts` alongside the RED test so TypeScript could type-check the imports; stub contained no real behavior (returned `NextResponse.next()` with no headers) so all 11 behavioral assertions remained RED
- **Files modified:** apps/website/middleware.ts (stub), apps/website/test/middleware.spec.ts
- **Commit:** cd6ca52

**2. [Rule 1 - Bug] Used vi.stubEnv instead of Object.defineProperty for NODE_ENV**

- **Found during:** Task 1 GREEN — tests failed with `ERR_INVALID_OBJECT_DEFINE_PROPERTY`
- **Issue:** Node 24 disallows `Object.defineProperty` on `process.env` properties; `process.env.NODE_ENV` is not a configurable/writable data descriptor
- **Fix:** Replaced all `Object.defineProperty(process.env, 'NODE_ENV', ...)` with `vi.stubEnv('NODE_ENV', ...)` + `vi.unstubAllEnvs()` in afterEach; used `vi.resetModules()` so each test gets a fresh module evaluation respecting the stubbed env
- **Files modified:** apps/website/test/middleware.spec.ts
- **Commit:** 1883875

**3. [Rule 1 - Bug] Test assertions checked wrong header name**

- **Found during:** Task 1 GREEN — response.headers.get('x-tenant-slug') returned null
- **Issue:** `NextResponse.next({ request: { headers } })` places forwarded request mutations under `x-middleware-request-*` prefix on the response object, not directly as `x-tenant-slug`; this is how Next.js Edge Middleware propagates request header overrides to RSC `headers()`
- **Fix:** Updated all tenant-slug assertions to check `x-middleware-request-x-tenant-slug`; documented in decisions
- **Files modified:** apps/website/test/middleware.spec.ts
- **Commit:** 1883875

**4. [Rule 2 - Missing critical] Added .env.local and .env.example for website**

- **Found during:** Task 3 build verification
- **Issue:** `pnpm nx build website` fails in production mode without env vars because `lib/env.ts` throws `WebsiteEnvValidationError` at module load; no `.env.local` existed
- **Fix:** Created `apps/website/.env.local` with localhost defaults (gitignored by root `.gitignore`'s `.env.*` pattern) and `apps/website/.env.example` as the onboarding reference (committed, matches admin's pattern)
- **Files modified:** apps/website/.env.local (untracked), apps/website/.env.example
- **Commit:** 79a26d0

## Known Stubs

None — all stubs from 05-01 resolved:

| Previously Stub                                            | File                | Status                                                                         |
| ---------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------ |
| `getRequestConfig(() => ({ locale: 'en', messages: {} }))` | lib/i18n/request.ts | Replaced with full resolveLocale() + dynamic message import                    |
| Plain `<html><body>` layout                                | app/layout.tsx      | Replaced with getTenantSlugFromHeaders + fetchMenuPublic + --primary injection |

The static "RestOS Website" heading in `app/page.tsx` remains a stub — it is out of scope for 05-02 (page content is a 05-03+ deliverable).

## Threat Flags

No new security-relevant surface introduced beyond what was planned in the threat model. All T-05-02-\* mitigations implemented:

- T-05-02-S: `NODE_ENV !== 'production'` guard on `?tenant=` path — hard-tested by PROD GUARD spec
- T-05-02-T: Middleware sets `x-tenant-slug` from host/dev-query only; never reflects inbound client header
- T-05-02-I: `lib/env.ts` schema has no `INTERNAL_API_TOKEN`; confirmed by test
- T-05-02-D: Locale written from `LOCALES` allowlist via `isLocale()` only

## Self-Check: PASSED

- [x] apps/website/middleware.ts exists
- [x] apps/website/lib/env.ts exists (no INTERNAL_API_TOKEN)
- [x] apps/website/lib/api-client.ts exists (import 'server-only', TenantNotFoundError, TenantSuspendedError, fetchMenuPublic)
- [x] apps/website/lib/tenant-resolver.ts exists (import 'server-only')
- [x] apps/website/lib/i18n/locales.ts exists (DEFAULT_LOCALE='en', LOCALES=['en','uk','ru'])
- [x] apps/website/lib/i18n/locale-cookie.ts exists (import 'server-only')
- [x] apps/website/lib/i18n/request.ts replaced (no empty-messages stub)
- [x] apps/website/lib/i18n/localized.ts exists (locale parameter)
- [x] apps/website/messages/en.json exists (contains "temporarily unavailable" and "Apply")
- [x] apps/website/app/layout.tsx calls fetchMenuPublic in try/catch, injects --primary, no ThemeProvider
- [x] Commit cd6ca52 exists (RED)
- [x] Commit 1883875 exists (GREEN Task 1)
- [x] Commit 0bac5cf exists (Task 2)
- [x] Commit 79a26d0 exists (Task 3)
