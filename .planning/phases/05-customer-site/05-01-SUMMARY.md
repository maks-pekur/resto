---
phase: 05-customer-site
plan: "01"
subsystem: website-scaffold
tags: [next, tailwind, shadcn, api-client, ui-package, scaffold]
dependency_graph:
  requires: []
  provides: [apps/website buildable app, @resto/api-client/public MenuDto types, @resto/ui package]
  affects: [packages/api-client, packages/ui, apps/website]
tech_stack:
  added: [zustand ^5.0.14, next-intl ^4.13.0, next-themes ^0.4.6, sonner ^2.0.7]
  patterns: [Next.js App Router RSC, Tailwind 4 CSS-only, shadcn new-york/neutral, next-intl getRequestConfig stub]
key_files:
  created:
    - packages/api-client/src/menu-types.ts
    - packages/ui/package.json
    - packages/ui/tsconfig.json
    - packages/ui/src/index.ts
    - apps/website/package.json
    - apps/website/project.json
    - apps/website/tsconfig.json
    - apps/website/eslint.config.mjs
    - apps/website/postcss.config.mjs
    - apps/website/next.config.mjs
    - apps/website/vitest.config.ts
    - apps/website/components.json
    - apps/website/app/globals.css
    - apps/website/app/layout.tsx
    - apps/website/app/page.tsx
    - apps/website/lib/utils.ts
    - apps/website/lib/i18n/request.ts
    - apps/website/test/setup.ts
  modified:
    - packages/api-client/src/public.ts
decisions:
  - Task 1 package gate cleared by human before execution — all packages verified legitimate
  - lib/i18n/request.ts is a stub returning locale=en with empty messages; fully replaced in 05-02 Task 3
  - packages/ui ships with an empty index.ts export; components added in Phase 6 when qr-menu refactor drives extraction (D-02)
  - No dark mode block in globals.css — Phase 5 is light-only per UI-SPEC; dark block deferred to Phase 15
metrics:
  duration: ~20min
  completed: "2026-06-12"
  tasks: 3 (1 gate pre-cleared, 2 executed)
  files: 20
---

# Phase 5 Plan 1: Website Scaffold + Shared Type Layer Summary

One-liner: Next.js 16.2.9 App Router app at port 3002 with shadcn new-york/neutral, MenuDto wire types in @resto/api-client/public, and @resto/ui initialized as an importable package.

## Tasks Executed

| Task | Name                           | Commit               | Files                                                            |
| ---- | ------------------------------ | -------------------- | ---------------------------------------------------------------- |
| 1    | Package legitimacy gate        | Pre-cleared by human | —                                                                |
| 2    | MenuDto types + @resto/ui init | 002b954              | packages/api-client/src/menu-types.ts, public.ts, packages/ui/\* |
| 3    | Scaffold apps/website          | 3ac2a0f              | apps/website/\* (18 files)                                       |

## Verification

- `pnpm nx build website` exits 0, produces `apps/website/.next`
- `pnpm nx typecheck website` exits 0
- `pnpm nx lint website` exits 0
- `pnpm --filter @resto/api-client exec tsc --noEmit` passes with menu-types added
- `pnpm --filter @resto/ui exec tsc --noEmit` passes
- `apps/website/next.config.mjs` has `/v1/:path*` rewrite, no `/api/:path*`
- `apps/website/project.json` serve target: port 3002
- `apps/website/package.json` pins `next` at `^16.2.9` (D-04)
- `apps/website/components.json` style new-york, baseColor neutral, cssVariables true, iconLibrary lucide, rsc true

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed async from i18n request stub**

- **Found during:** Task 3 lint verification
- **Issue:** `getRequestConfig(async () => ...)` with no `await` triggers `@typescript-eslint/require-await`
- **Fix:** Removed `async` — the stub returns a plain object synchronously
- **Files modified:** apps/website/lib/i18n/request.ts
- **Commit:** 3ac2a0f (included in Task 3 commit)

## Package Gate Record

Task 1 was pre-cleared by the human before execution. Approved package set:

- `zustand ^5.0.14` — verified: github.com/pmndrs/zustand, ~10M downloads/wk, no postinstall script
- `next ^16.2.9` — verified: same 16.2.9 as admin's semver-resolved version
- All other deps (react 19, next-intl ^4.13.0, next-themes ^0.4.6, sonner, react-hook-form, @hookform/resolvers, zod, lucide-react, class-variance-authority, clsx, tailwind-merge, server-only) — exact versions mirrored from apps/admin

## Known Stubs

| Stub                                                       | File                             | Reason                                                                                           |
| ---------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------ |
| `getRequestConfig(() => ({ locale: 'en', messages: {} }))` | apps/website/lib/i18n/request.ts | Placeholder so `withNextIntl` resolves at build time; full locale/messages wired in 05-02 Task 3 |
| Static "RestOS Website" heading                            | apps/website/app/page.tsx        | Placeholder page; replaced in 05-02 with real menu page RSC fetch                                |
| Plain `<html><body>` layout                                | apps/website/app/layout.tsx      | Placeholder; tenant theme injection + Toaster added in 05-02                                     |

Stubs are intentional — 05-02 replaces all three as its first deliverable.

## Self-Check: PASSED

- [x] packages/api-client/src/menu-types.ts exists
- [x] packages/ui/package.json exists with @resto/ui name
- [x] packages/ui/src/index.ts exists
- [x] apps/website/.next directory exists (build succeeded)
- [x] apps/website/lib/i18n/request.ts exists
- [x] Commit 002b954 exists (Task 2)
- [x] Commit 3ac2a0f exists (Task 3)
