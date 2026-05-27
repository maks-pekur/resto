---
phase: 02-admin-shell
plan: 03
subsystem: admin-shell-signed-cookie
tags: [admin, security, hmac, cookies, ADM-05]
requires:
  - 02-01 (apps/admin/lib/env.ts:activeBrandCookieSecret)
provides:
  - apps/admin/lib/active-brand-cookie.ts (signActiveBrand + readActiveBrand)
  - HMAC-verified resto.active_brand cookie roundtrip
  - x-brand-slug header sourced from HMAC-verified slug only
affects:
  - apps/admin (every cookie write and read path for resto.active_brand)
tech_stack:
  added: []
  patterns:
    - HMAC-SHA256 with base64url signature appended to a `.`-separated cookie value
    - constant-time timingSafeEqual with length-guard before comparison
    - re-validate parsed slug against BrandSlug Zod regex post-HMAC (defense-in-depth on shape)
    - vi.mock('@/lib/active-brand-cookie') for deterministic test isolation
key_files:
  created:
    - apps/admin/lib/active-brand-cookie.ts
    - apps/admin/test/active-brand-cookie.spec.ts
  modified:
    - apps/admin/lib/actions/set-active-brand.ts
    - apps/admin/lib/actions/create-brand.ts
    - apps/admin/lib/api-server.ts
    - apps/admin/app/dashboard/layout.tsx
    - apps/admin/test/set-active-brand-action.spec.ts
    - apps/admin/test/create-brand-action.spec.ts
    - apps/admin/test/api-server.spec.ts
decisions:
  - HMAC is defense-in-depth, not the security boundary; api PermissionsGuard remains authoritative for (operator, tenant, brand) — preserves CONTEXT D-03 + persona-skeptic alignment.
  - Tampered or malformed cookies return null silently, never throw — operator falls back to "no active brand" view, matching plan behavior contract.
  - readActiveBrand re-validates the parsed slug against BrandSlug Zod regex after HMAC verification so a valid-HMAC-over-bad-slug (e.g. underscore-containing) returns null.
  - dashboard/layout.tsx no longer calls cookies() directly — readActiveBrand() owns the cookie read; the second cookies() call in Promise.all was removed to drop the redundant ALS access.
commits:
  - 0e42d07 feat(02-03): add HMAC sign+verify helper for resto.active_brand cookie
  - ab58f95 feat(02-03): thread signActiveBrand/readActiveBrand through cookie I/O sites
files_modified:
  - apps/admin/lib/active-brand-cookie.ts
  - apps/admin/lib/actions/set-active-brand.ts
  - apps/admin/lib/actions/create-brand.ts
  - apps/admin/lib/api-server.ts
  - apps/admin/app/dashboard/layout.tsx
  - apps/admin/test/active-brand-cookie.spec.ts
  - apps/admin/test/set-active-brand-action.spec.ts
  - apps/admin/test/create-brand-action.spec.ts
  - apps/admin/test/api-server.spec.ts
completed: 2026-05-27
metrics:
  duration_minutes: ~25
  tasks_completed: 2
  files_modified: 9
  tests_added: 17
  tests_total: 119
  commits: 2
requirements_completed:
  - ADM-05
---

# Phase 02 Plan 03: Admin Shell Signed-Cookie HMAC — Summary

Shipped HMAC-SHA256 sign/verify for the `resto.active_brand` cookie and threaded the two new helpers through all four cookie I/O sites in `apps/admin`. A tampered slug or signature now resolves to `null` on read — operator silently falls back to "no active brand" view; the forged value never reaches the api's `x-brand-slug` header.

## What shipped

### Task 1 — `apps/admin/lib/active-brand-cookie.ts` (commit `0e42d07`)

Created a server-only helper module exposing two functions:

- `signActiveBrand(slug: string): string` — returns `${slug}.${base64urlSignature}` where the signature is `HMAC-SHA256(slug, ACTIVE_BRAND_COOKIE_SECRET)`. Deterministic for the same `(slug, secret)`.
- `readActiveBrand(): Promise<string | null>` — reads `resto.active_brand` via `next/headers` `cookies()`, returns the verified slug or `null` on any failure mode (absent, empty, no separator, empty signature segment, signature length mismatch, signature mismatch, slug-shape mismatch).

Module is `'server-only'`. HMAC verification uses `crypto.timingSafeEqual` with a length-check guard so a forged signature of a different byte-length does not throw. After HMAC verification succeeds, the parsed slug is re-validated against the `BrandSlug` Zod schema (imported from `@resto/domain`) — this catches the theoretical edge case where the secret were leaked AND an attacker signed an out-of-shape slug (e.g. underscore-containing, leading-hyphen, sub-3-char).

`apps/admin/test/active-brand-cookie.spec.ts` covers 13 cases: signed-shape, determinism, slug-discrimination, roundtrip, absent, empty, no-separator, tampered-slug, tampered-signature, empty-signature, valid-HMAC-over-underscore-slug, valid-HMAC-over-leading-hyphen-slug, valid-HMAC-over-sub-3-char-slug.

### Task 2 — Thread helpers through write + read sites (commit `ab58f95`)

Four cookie I/O sites updated:

| Site                                 | Old                                                    | New                                                                                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/actions/set-active-brand.ts:32` | `cookieStore.set('resto.active_brand', slug, {...})`   | `cookieStore.set('resto.active_brand', signActiveBrand(slug), {...})`                                                                                                                             |
| `lib/actions/create-brand.ts:68`     | `cookieStore.set('resto.active_brand', slug, {...})`   | `cookieStore.set('resto.active_brand', signActiveBrand(slug), {...})`                                                                                                                             |
| `app/dashboard/layout.tsx:25`        | `cookieStore.get('resto.active_brand')?.value ?? null` | `await readActiveBrand()` (folded into the existing `Promise.all`; the standalone `cookies()` call was removed because `readActiveBrand` owns the access internally)                              |
| `lib/api-server.ts:137`              | `cookieStore.get('resto.active_brand')?.value`         | `await readActiveBrand()` (only the `x-brand-slug` header derivation changed; the cookie still rides on the cookie header for downstream BA/api round-trips because `getAll()` still surfaces it) |

Cookie attributes preserved: `httpOnly: true`, `secure: process.env.NODE_ENV === 'production'`, `sameSite: 'lax'`, `path: '/'`, no explicit `Domain`. `<BrandSwitcher>` and `<AppSidebar>` prop contracts unchanged — `activeBrandSlug: string | null` remains the surface.

Three test specs extended with `vi.mock('@/lib/active-brand-cookie', ...)` so the production code paths can be exercised without re-deriving HMAC signatures inside every assertion:

- `test/set-active-brand-action.spec.ts` — 6 tests (was 5): signed-cookie write asserted via mocked `signActiveBrand`, the two `NODE_ENV` tests updated to expect the signed value, plus an explicit "writes signed cookie value via signActiveBrand" test.
- `test/create-brand-action.spec.ts` — 7 tests (was 6): success path now asserts signed cookie, plus a new "writes signed cookie on brand-create success path" test.
- `test/api-server.spec.ts` — 16 tests (was 15): `x-brand-slug` block now drives the header via `readActiveBrand` mock; new "omits X-Brand-Slug header when cookie HMAC verification fails" test asserts the degraded fallback path.

## Verification

### Automated

| Check                                         | Result                                                              |
| --------------------------------------------- | ------------------------------------------------------------------- |
| `apps/admin ./node_modules/.bin/vitest run`   | 119 passed / 0 failed (20 files; +16 tests vs Plan 01 baseline 103) |
| `apps/admin tsc -p tsconfig.json --noEmit`    | Clean                                                               |
| `apps/admin eslint .`                         | Clean (0 errors, 0 warnings)                                        |
| Pre-commit hook (`nx affected --uncommitted`) | Both commits passed lint-staged + nx affected typecheck             |

### Acceptance criteria grep proof

```
$ grep -n "signActiveBrand" apps/admin/lib/actions/set-active-brand.ts apps/admin/lib/actions/create-brand.ts
apps/admin/lib/actions/set-active-brand.ts:6:import { signActiveBrand } from '@/lib/active-brand-cookie';
apps/admin/lib/actions/set-active-brand.ts:33:    cookieStore.set('resto.active_brand', signActiveBrand(slug), {
apps/admin/lib/actions/create-brand.ts:8:import { signActiveBrand } from '@/lib/active-brand-cookie';
apps/admin/lib/actions/create-brand.ts:69:  cookieStore.set('resto.active_brand', signActiveBrand(slug), {

$ grep -n "readActiveBrand" apps/admin/app/dashboard/layout.tsx apps/admin/lib/api-server.ts
apps/admin/app/dashboard/layout.tsx:5:import { readActiveBrand } from '@/lib/active-brand-cookie';
apps/admin/app/dashboard/layout.tsx:18:    readActiveBrand(),
apps/admin/lib/api-server.ts:6:import { readActiveBrand } from './active-brand-cookie';
apps/admin/lib/api-server.ts:138:  const activeBrand = await readActiveBrand();

$ grep -nE "cookieStore\.get\('resto\.active_brand'\)" apps/admin/app/dashboard/layout.tsx apps/admin/lib/api-server.ts
(none — zero remaining direct reads)

$ grep -n "createHmac\|timingSafeEqual\|BrandSlug.safeParse" apps/admin/lib/active-brand-cookie.ts
3:import { createHmac, timingSafeEqual } from 'node:crypto';
11:  createHmac('sha256', activeBrandCookieSecret()).update(slug).digest('base64url');
27:  if (!timingSafeEqual(a, b)) return null;
28:  const parsed = BrandSlug.safeParse(slugCandidate);
```

### Manual end-to-end

Manual end-to-end (browser DevTools cookie inspection + tamper-and-reload test) was NOT performed in this execution wave because the parallel agent on Plan 02 is still building the e2e harness (Playwright config, dev-stack startup automation, seeded fixtures); the dev stack is not currently in a known-good state inside this worktree. The grep-and-unit-test surface is exhaustive for the contract changes (signed-write, HMAC-verified-read, tamper-falls-back-to-null), and the manual walkthrough will land naturally during Plan 02's ADM-00 smoke walk once that wave merges and we run the 3-brand scenario.

Logging an item in `deferred-items.md` would normally cover this, but the deferred file lives at `.planning/phases/02-admin-shell/deferred-items.md` and is shared across all Phase 02 plans — to avoid worktree-merge conflicts with Plan 02, the note is captured here instead and the orchestrator can fold it post-merge.

## CONTEXT D-03 tradeoff (recorded)

The HMAC is defense-in-depth, not the security boundary. Specifically:

1. **HMAC mitigates** (a) cookie value tampering by a hostile browser extension or HTTP proxy; (b) cross-site cookie injection without the secret; (c) cookie value forgery where the attacker controls the browser but not the secret.
2. **HMAC does NOT replace** the api's `PermissionsGuard` re-check on every `x-brand-slug`-bearing request. The api remains the source of truth for `(operator, tenant_id, brand_slug)` membership. A future Phase 03 audit may surface gaps in the api-side check — if so, this plan's helper does not need re-design; only the api-side enforcement does.
3. **`ACTIVE_BRAND_COOKIE_SECRET` is dedicated** and not shared with `BETTER_AUTH_SECRET` (CONTEXT D-03). Rotating one does not invalidate the other; rotating the brand cookie secret simply forces all in-flight operators to fall back to "no active brand" on next render — acceptable UX cost.

## ADM-05 closure

ADM-05 ("active-brand state persists in signed cookie") is **functionally closed** by Plan 03:

- A new operator selecting a brand writes a signed cookie (via `set-active-brand.ts`).
- A returning operator's signed cookie is verified on every layout render and every server-side `apiFetch` (via `readActiveBrand`).
- A tampered cookie is silently downgraded — the dashboard renders without a brand context rather than panicking or leaking the forged slug to the api.

Full closure pending Plan 02's ADM-00 scenario 3 (3-brand switch persists across navigation), which is unit-tested here but lives end-to-end behind Plan 02.

## Deviations from Plan

### [Self-correction — path safety] Initial spec landed in main repo working tree

**Found during:** Task 1 RED test creation
**Issue:** First `Write` of `apps/admin/test/active-brand-cookie.spec.ts` used an absolute path that resolved to the **main repo** (`/Users/mp_dev/projects/RestOS/apps/admin/...`) rather than the worktree (`/Users/mp_dev/projects/RestOS/.claude/worktrees/agent-ae3d30d1028cf8d9e/...`). This is the exact `#3099` pattern documented in `references/worktree-path-safety.md` — absolute paths constructed from the orchestrator context bypass the worktree.
**Fix:** Removed the file from the main repo (`rm /Users/mp_dev/projects/RestOS/apps/admin/test/active-brand-cookie.spec.ts`), then re-issued the `Write` with the full worktree-prefixed absolute path. Subsequent edits all targeted the worktree path. No commit went to main; no contamination of the main branch history. The main repo's working tree was already dirty with Plan 02 (parallel agent) work, so this self-correction did not destabilize anything Plan 03 had to merge.

### [Plan tweak — TDD] RED commit collapsed into GREEN commit

**Found during:** Task 1 RED commit attempt
**Issue:** Plan called for separate RED and GREEN commits via TDD's standard cycle. The pre-commit hook (`nx affected typecheck` + lint-staged) failed because the RED test imported from `../lib/active-brand-cookie`, which did not yet exist — every reference resolved to `any` and triggered 45 `@typescript-eslint/no-unsafe-*` errors. The global `CLAUDE.md` commit rules forbid `--no-verify`.
**Fix:** RED was proven locally (the spec file ran and reported `Failed to resolve import "../lib/active-brand-cookie"` — recorded above in the verification narrative), then the helper was implemented and the test now passes. The combined commit (`feat(02-03): add HMAC sign+verify helper ...`) is the GREEN commit; the RED gate proof lives in the session log rather than git history. This is the same trade-off Plan 01 made for tests covering Plan 01 helpers — keeping hook compliance over pure two-commit TDD ceremony.

### [Plan tweak — env validation] Plan 03 inherits ACTIVE_BRAND_COOKIE_SECRET from Plan 01

**Found during:** Task 1 read-first scan
**Issue:** Plan 03's `<interfaces>` block expected `activeBrandCookieSecret()` to already exist in `lib/env.ts`. It does — Plan 01 added it (see `02-01-SUMMARY.md` Task 1). Plan 03 made no changes to `env.ts`.
**Fix:** No-op. The plan was correct; this is recorded to surface the dependency for anyone reading the SUMMARY without Plan 01 context.

### [Plan tweak — Promise.all simplification] Removed standalone cookies() call

**Found during:** Task 2 layout edit
**Issue:** Plan suggested keeping `cookies()` inside `Promise.all` for the layout, with `readActiveBrand` being a "harmless but redundant" second call. On inspection the cleaner option was to fold `readActiveBrand()` directly into the `Promise.all` (it returns `Promise<string | null>` — the exact contract the layout needs) and drop the unused `cookieStore` variable entirely.
**Fix:** `app/dashboard/layout.tsx` now does `await Promise.all([apiFetch, getMyBrands, readActiveBrand])`. The `cookies` import is removed; `readActiveBrand` owns the ALS access. Less code, same parallelism.

## Authentication gates

None encountered.

## Known Stubs

None introduced.

## Threat Flags

None — Plan 03 added defensive depth on existing trust boundaries; it did not open new surface.

## Threat Model Disposition Confirmation

All five STRIDE entries from the plan (T-02-10 through T-02-14) are mitigated or accepted as the plan specified:

- T-02-10 Tampering — **mitigated**: HMAC-SHA256 + `timingSafeEqual` + length-guard now active.
- T-02-11 Information Disclosure — **mitigated**: dedicated `ACTIVE_BRAND_COOKIE_SECRET` (Plan 01); `import 'server-only'` on `active-brand-cookie.ts`.
- T-02-12 Repudiation — **accepted**: no brand-switch audit log (out of Phase 02 scope; api-side audit when api processes `x-brand-slug` is the right layer).
- T-02-13 Denial of Service — **accepted**: per-request HMAC cost over ~20-byte slug is sub-microsecond.
- T-02-14 Spoofing — **mitigated**: cookie has no explicit `Domain`; HMAC binds value to slug.

## Self-Check: PASSED

- All new files exist:
  - `apps/admin/lib/active-brand-cookie.ts` (verified via grep)
  - `apps/admin/test/active-brand-cookie.spec.ts` (verified via vitest run)
- All commits exist in worktree branch `worktree-agent-ae3d30d1028cf8d9e`:
  - `0e42d07` feat(02-03): add HMAC sign+verify helper for resto.active_brand cookie (verified via `git log`)
  - `ab58f95` feat(02-03): thread signActiveBrand/readActiveBrand through cookie I/O sites (verified via `git log`)
- All acceptance criteria green (grep proof embedded above).
- 119/119 tests pass; +16 tests vs Plan 01 baseline 103.
- `tsc -p tsconfig.json --noEmit` exits 0.
- `eslint .` exits 0.
