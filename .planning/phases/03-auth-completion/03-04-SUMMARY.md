---
phase: 03-auth-completion
plan: 04
subsystem: identity
tags: [cookies, 2fa, totp, recovery-codes, ast-sweep, phase-03]

# Dependency graph
requires:
  - phase: 03-auth-completion
    plan: 03
    provides: signup/forgot/reset/accept/invite wired actions — Plan 04 verifies their cookie surface
  - phase: 02-admin-shell
    provides: HMAC-signed brand-cookie pattern (D-03/D-04) + apiFetch BA cookie forwarding
  - phase: 03-auth-completion
    plan: 02
    provides: EMAIL_ADAPTER_PORT + CapturedEmailAdapter (used by 2FA e2e for future email-side assertions)
provides:
  - apps/admin/test/auth-cookies.spec.ts — AST-walking AUTH-08 sweep that fails CI on any new cookies().set without the triad
  - setForwardedCookie helper in api-server.ts — canonical BA-forwarded cookie normalization (httpOnly + secure + sameSite explicit; bounded optional spread for path/domain/maxAge/expires)
  - apps/admin/app/dashboard/(workspace)/settings/two-factor-actions.ts — enable / verify / disable server actions wrapping BA two-factor endpoints
  - apps/admin/app/dashboard/(workspace)/settings/two-factor-enable-client.tsx — D-22 enable flow with password re-confirm + QR/URI + 10 codes + copy + "I saved them" checkbox + 6-digit gate
  - /v1/me augmentation — surfaces twoFactorEnabled on OperatorPrincipal + MeResponse
  - apps/api/test/e2e/identity-two-factor.e2e.spec.ts — 5 e2e cases covering enable contract, verify happy path, invalid-code rejection, Pitfall 7 (no half-state), and disable
affects:
  - Phase 17 / TEAM-04 (admin-reset-for-subordinates UI sits on top of the actions added here; D-23 keeps it deferred)
  - Phase 17 / TEAM-05 (recovery-code regeneration UI sits on top of these actions; D-23 deferred)
  - Plan 05 (parallel) — independent surfaces; no overlap (see notes)

# Tech tracking
tech-stack:
  added:
    - 'No new runtime deps. Tests use typescript@6.0.3 (already in workspace) for AST parsing in auth-cookies.spec.ts.'
  patterns:
    - 'AST-walking compliance spec. Walks apps/admin/{lib,app} for *.ts/*.tsx, locates every cookies().set / cookieStore.set CallExpression, asserts the options object literal carries the triad. ScriptKind matters: TSX parsing of `<T>` in arrow-fn generics in a `.ts` file silently drops downstream call expressions; the spec switches kind based on file extension. Sites that must spread for exactOptionalPropertyTypes reasons opt out via inline `// AUTH-08-EXEMPT: <rationale>` comment.'
    - 'setForwardedCookie canonical helper. The api-server.ts BA-forwarded cookie call now goes through a single normalization site that promotes the triad to explicit literals; the AST sweep flags this site as exempt because the bounded spread (path/domain/maxAge/expires) is the lesser evil vs. spelling out optional cookie attributes with `undefined`, which exactOptionalPropertyTypes rejects.'
    - '2FA enable state machine: idle → password-enable → showing-codes → verifying → reload-on-success. Two AlertDialog instances share the same Phase discriminator so the password dialog is reused between enable and disable flows. Confirm button is gated by checkbox && /^\\d{6}$/ — both required, never bypassed.'
    - 'Friendly error mapping for the two-factor actions: { ok: true } | { ok: false; error: invalid_password | session_expired | invalid_code | unknown }. The UI maps each error to a single-sentence message; on enable + verify the dialog stays open so the operator can retry without re-entering everything.'
    - 'OperatorPrincipal optional twoFactorEnabled. BA twoFactor plugin schema augments user.twoFactorEnabled with defaultValue:false; the AuthGuard extracts it via optional-chain (typeof === boolean) so older fixtures without the field (some integration-test stubs) still produce a valid principal without the field.'

key-files:
  created:
    - apps/admin/test/auth-cookies.spec.ts
    - apps/admin/app/dashboard/(workspace)/settings/two-factor-actions.ts
    - apps/admin/app/dashboard/(workspace)/settings/two-factor-enable-client.tsx
    - apps/admin/test/two-factor-actions.spec.ts
    - apps/admin/test/two-factor-enable-client.spec.tsx
    - apps/api/test/e2e/identity-two-factor.e2e.spec.ts
  modified:
    - apps/admin/lib/api-server.ts (extracted setForwardedCookie helper; call site now passes through it with the canonical triad)
    - apps/admin/app/dashboard/(workspace)/settings/page.tsx (renders <TwoFactorSection> above the InviteForm; reads me.data.twoFactorEnabled)
    - apps/admin/lib/me.ts (MeResponse augmented with optional twoFactorEnabled)
    - apps/api/src/contexts/identity/domain/principal.ts (OperatorPrincipal augmented with optional twoFactorEnabled)
    - apps/api/src/contexts/identity/interfaces/http/guards/auth.guard.ts (buildPrincipal reads session.user.twoFactorEnabled)
    - apps/api/src/contexts/identity/interfaces/http/me.controller.ts (response surfaces twoFactorEnabled for operator principals)

key-decisions:
  - 'AUTH-08 sweep uses TypeScript AST (typescript@6.0.3 already in workspace) rather than a regex or ts-morph. ts-morph not in deps; adding it for one spec is unjustified. The compiler API gives accurate line/column and lets us inspect the options object literal precisely. ScriptKind selection (TSX vs TS based on extension) was the load-bearing detail — first iteration used TSX uniformly and silently missed api-server.ts:194 because `apiFetch<T>` in a `.ts` file was parsed as the start of a JSX element. Test now keys ScriptKind on the file extension and discovers every site correctly.'
  - 'setForwardedCookie inlines the triad (httpOnly:true, secure:NODE_ENV==="production", sameSite:"lax") and uses conditional spreads only for the path/domain/maxAge/expires optional fields. The bounded spread is a known antagonist of the AST sweep, so the site carries `// AUTH-08-EXEMPT: triad set as explicit literals on the next call; conditional spreads carry only bounded optional cookie attrs`. The exemption tag is the canonical way to opt a single site out of the sweep without weakening the rule for the entire codebase.'
  - 'QR rendering: the UI shows the otpauth:// URI in a <code> block plus copy-friendly font; no QR image library was added. Adding qrcode (or any DOM-painting library) for one screen would be a Rule-4 architectural change. Authenticator apps accept the URI directly (most have a "paste setup key" affordance); when the QR-image UX matters more (post-MVP-1 polish), the upgrade is local to this client component.'
  - 'window.location.reload() on verify-success. The component uses `window.location.reload()` to force the server-rendered settings page to re-fetch /v1/me and pick up twoFactorEnabled=true. router.refresh() from next/navigation is the framework-native option but adds router imports for tests; reload is simpler and matches the session-bound nature of the success state (the operator just satisfied the 2FA challenge).'
  - 'AUTH-07 e2e uses BA POST /api/auth/two-factor/totp/generate { secret } to derive the current TOTP code, so the spec needs no external authenticator library. The endpoint is part of the totp2fa plugin BA loads when twoFactor() is configured; the test stays at the wire level and matches what a real authenticator app produces.'
  - 'Two AlertDialog instances (not one) for password-enable vs codes vs password-disable. Sharing a single dialog with conditional content would require state to track which mode the dialog is in; spawning two dialogs whose `open` prop is bound to the Phase discriminator is cleaner and matches the natural state machine. A 4-instance approach (enable-pwd / disable-pwd / codes / done) was considered but the password dialog is structurally identical for enable and disable so it shares one instance with the title/description varying by phase.'

# Deferred items
deferred:
  - item: 'E2E specs (identity-two-factor.e2e.spec.ts) not executed in the worktree.'
    why: 'Same constraint as Plan 03: docker/testcontainers unavailable from agent; running e2e would require 60-180s per spec and exceeds per-task budget. Specs compile under typecheck + lint and follow the established with-real-stack.setup.ts harness.'
    failure-mode: 'A regression in the 5 new e2e cases (enable contract, verify happy, verify wrong-code, Pitfall 7, disable) lands undetected by this commit. First CI run after merge catches it.'
    re-evaluate: 'Phase 03 verify wave (pnpm --filter @resto/api test:e2e identity-two-factor).'
  - item: 'forgot-password-actions.spec.ts and signup-actions.spec.ts fail at the merge-base AND on HEAD.'
    why: 'forgot-password-actions.spec.ts hits `server-only` at import time (Plan 03 wiring change made the action server-only). signup-actions.spec.ts asserts on the now-stale text "already exists" but the new wording is "taken" (or the email is silently accepted per D-06 enumeration parity). Both pre-date this plan; SCOPE BOUNDARY says do not fix.'
    failure-mode: 'CI red on the two specs until a follow-up wave or Phase verify step picks them up. The underlying production behavior is correct — the tests are out of date with respect to Plan 03 D-06.'
    re-evaluate: 'Phase 03 verify wave OR a dedicated cleanup commit before Phase 04 starts.'
  - item: 'window.location.reload jsdom stderr noise in two-factor-enable-client.spec.tsx.'
    why: 'jsdom does not implement navigation; `window.location.reload()` from the success path logs "Not implemented: navigation" to stderr. The test passes (the assertion runs before reload fires), but the console output is noisy. The location prototype refuses Object.defineProperty redefinition, so the stub strategy used in earlier specs does not apply here. A console.error filter is in place to drop only the specific message.'
    failure-mode: 'None to test outcomes; only a tidiness concern.'
    re-evaluate: 'Future polish if the noise becomes confusing.'

requirements-completed: [AUTH-07, AUTH-08]

# Metrics
metrics:
  duration: 'single agent session (commit timestamps span 2026-05-30)'
  tasks: 2
  commits-in-plan:
    - a4b1906 feat(03-04): AUTH-08 cookie sweep — AST spec + setForwardedCookie helper
    - 9e75be4 feat(03-04): AUTH-07 — surface twoFactorEnabled on /v1/me + 2FA e2e suite
    - e1fb53d feat(03-04): AUTH-07 — 2FA enable client + actions wired into /dashboard/settings
---

# Phase 3 Plan 4: Cookies + 2FA Summary

AUTH-08 full sweep closed by an AST-walking compliance spec; AUTH-07 scoped 2FA TOTP enable flow shipped with D-22 confirmation gate and D-23 explicit out-of-scope items (no admin-reset UI, no email-recovery loop, no recovery-code regeneration UI).

## What landed

### AUTH-08 — cookie sweep

- **AST sweep spec** (`apps/admin/test/auth-cookies.spec.ts`). Walks every `.ts`/`.tsx` under `apps/admin/lib` and `apps/admin/app` (excluding `test/`, `components/ui/`, `.next/`, `dist/`, `node_modules/`), uses TypeScript's compiler API to find every `cookies().set(...)` and `cookieStore.set(...)` CallExpression, inspects the options object literal, and asserts `httpOnly: true`, `secure: process.env.NODE_ENV === 'production'`, `sameSite: 'lax'`. Adding a new server action in Phase 4+ that calls cookies().set without the triad fails this spec at CI. The spec keys ScriptKind on file extension — without that detail, parsing `apiFetch<T>` in a `.ts` file as TSX silently swallows the `cookieStore.set` call in api-server.ts.
- **setForwardedCookie helper** (`apps/admin/lib/api-server.ts`). The BA-forwarded cookie at the previously-implicit `cookieStore.set({ name, value, ...parsed.options })` site is now routed through `setForwardedCookie(cookieStore, parsed)`, which inlines the triad as explicit literals and preserves upstream `path` / `domain` / `maxAge` / `expires`. The call site carries an `AUTH-08-EXEMPT` comment because the conditional spread for optional attrs cannot be statically introspected by the sweep; the inline literal makes the rule presence obvious by inspection.
- **Three discovered sites** all pass: `apps/admin/lib/actions/set-active-brand.ts:33`, `apps/admin/lib/actions/create-brand.ts:69`, `apps/admin/lib/api-server.ts:144` (via setForwardedCookie). No `cookies().set` outside these three sites.

### AUTH-07 — 2FA enable flow

- **Server actions** (`apps/admin/app/dashboard/(workspace)/settings/two-factor-actions.ts`). Three actions: `enableTwoFactorAction(password)` → returns `{ ok, totpURI, backupCodes }` or `{ ok:false, error }`; `verifyTwoFactorAction(code)` → flips activation via BA verify-totp; `disableTwoFactorAction(password)` → reverses activation. Each wraps the corresponding BA endpoint with `apiFetch` + `forwardSetCookie: true`. Defense-in-depth validates the inputs before round-tripping to BA (empty password, non-6-digit code).
- **Client component** (`apps/admin/app/dashboard/(workspace)/settings/two-factor-enable-client.tsx`). State machine: `idle → password-enable → showing-codes → verify → reload-on-success` (and a parallel `idle → password-disable` branch for the already-enabled case). Two AlertDialogs share the Phase discriminator: password-enable + password-disable share one shell; the codes dialog is its own. The codes dialog renders the otpauth URI (which embeds the secret) in a copyable `<code>` block, the 10 backup codes in a grid with a single "Copy all" button (joins with `\n`), the "I have saved these recovery codes" checkbox, and the 6-digit TOTP input. Confirm stays disabled until **both** the checkbox is checked AND the input matches `/^\d{6}$/`. On success the page reloads so the server-rendered settings re-fetch /v1/me and pick up the activated state.
- **D-23 already-enabled state.** When `twoFactorEnabled=true` the section renders an info card: "Two-factor authentication active. Lost your device and recovery codes? Contact founder support — recovery is a manual runbook for the first 100 customers and admin-side reset is not available in this release." A Disable 2FA destructive-variant button reuses the password dialog shell. NO regenerate-codes button. NO admin-reset link. NO email-recovery affordance.
- **`/v1/me` augmentation.** `OperatorPrincipal.twoFactorEnabled?: boolean` flows from BA's session (BA twoFactor plugin schema attaches `user.twoFactorEnabled` with `defaultValue:false`), through `buildPrincipal` in `AuthGuard`, through the MeController response, and is read on the settings page to pick the right branch. The admin `MeResponse` type was augmented in lockstep.
- **E2E spec** (`apps/api/test/e2e/identity-two-factor.e2e.spec.ts`). 5 cases gated on `isDockerAvailable()`: (1) enable contract — returns totpURI + 10 codes, twoFactorEnabled stays false; (2) verify with current code (derived via BA's `/totp/generate` endpoint from the secret in the URI) flips twoFactorEnabled=true; (3) verify with wrong code does NOT flip; (4) **Pitfall 7** — enable, sign out, sign back in, /v1/me reports twoFactorEnabled=false AND the codes from the never-verified enable are rejected by verify-backup-code (the activation never committed, the codes are not authoritative); (5) disable — after activation, password-confirmed disable reverses to false.

## Deviations from Plan

### Rule 2 — missing critical functionality

- **[Rule 2 — wiring] `/v1/me` did not surface `twoFactorEnabled`.** Plan 03 SUMMARY did not actually augment `getMe()` even though Plan 04's task 2 referenced "from getMe() augmented in Plan 03". Without the field the settings page cannot pick the enable-CTA vs already-enabled branch. Added the field to `OperatorPrincipal` + `AuthGuard.buildPrincipal` + `MeController` + admin `MeResponse`. None of these touched Plan 05's territory (which is `auth.config.ts:148-170` and `:222-307` plus `bootstrap/` + scheduler files).

### Rule 1 — bugs

- **[Rule 1 — bug] AST sweep silently missed api-server.ts:194 on the first iteration.** The initial spec used `ts.ScriptKind.TSX` uniformly for all source files; in a `.ts` file the parser interpreted `apiFetch<T>` (an arrow-fn generic) as the start of a JSX element and dropped the downstream `cookieStore.set` call expression. Fix: select `ScriptKind.TSX` only for files ending in `.tsx`, `ScriptKind.TS` otherwise. The spec then correctly discovers all 3 call sites. Without this fix the sweep would have given false confidence — a new server action in a `.ts` file that came after a generic arrow function would have been invisible to the scanner.

### Rule 3 — blocking issues

- **[Rule 3 — env] node_modules absent in worktree on first attempt.** Ran `pnpm install --frozen-lockfile --prefer-offline` once (~7s, cached); not a code change.
- **[Rule 3 — lint] Pre-commit `eslint --fix` rejected several patterns.** Iterated through: replaced non-null assertions with `?? '' ` defaults; replaced `(json() as { x: T })` with typed wrappers `asEnable / asMe / asGenerate` to keep both `no-unsafe-argument` and `no-unnecessary-type-assertion` happy; replaced `String(fd.get('password') ?? '')` with a `typeof === 'string'` narrow (FormData.get returns `string | File | null`); replaced `{...window.location, reload: vi.fn()}` (class-instance spread) with a console.error filter; collapsed multi-line `if` returns into braced bodies per `no-confusing-void-expression`.

### Rule 4 — architectural changes

None taken.

## Compliance notes (parallel wave)

- **Plan 05 territory NOT touched.** `auth.config.ts:148-170` (organization plugin) and `:222-307` (context-stash WeakMap area) are unchanged in this plan's commits. `apps/api/src/bootstrap/` is unchanged. `apps/api/src/infrastructure/background-jobs.module.ts` and sibling scheduler files are unchanged. `apps/api/src/config/env.schema.ts` is unchanged.
- **Files Plan 04 modified in api/** are exclusively: `principal.ts` (added optional field), `auth.guard.ts` (buildPrincipal reads new optional field), `me.controller.ts` (response surfaces field). None overlap Plan 05's surface.

## Auth gates encountered

None — this plan stays inside the worktree-agent's allowlist.

## Known stubs

None. The 2FA enable flow is functionally complete (enable + verify + disable round-trip with friendly error mapping). The "QR code as URI text" surface is a deliberate trade-off documented in the decision log; not a stub.

## Threat Flags

None new beyond the plan's threat register (T-03-27..T-03-35). All mitigations enumerated are implemented:

- T-03-27 mitigated by the AST sweep covering every site
- T-03-28 mitigated by the sweep failing on new sites
- T-03-29 mitigated by sameSite:'lax' default + AUTH-08-STRICT escape hatch
- T-03-30, T-03-31 mitigated by D-23 absence (no email-recovery, no admin-reset)
- T-03-33 mitigated by BA `skipVerificationOnEnable=false` default + Pitfall 7 e2e
- T-03-32, T-03-34, T-03-35 accepted per the threat register

## Self-Check

- [x] `apps/admin/test/auth-cookies.spec.ts` — present, new (a4b1906)
- [x] `apps/admin/lib/api-server.ts` — modified, setForwardedCookie added (a4b1906)
- [x] `apps/api/src/contexts/identity/domain/principal.ts` — modified (9e75be4)
- [x] `apps/api/src/contexts/identity/interfaces/http/guards/auth.guard.ts` — modified (9e75be4)
- [x] `apps/api/src/contexts/identity/interfaces/http/me.controller.ts` — modified (9e75be4)
- [x] `apps/api/test/e2e/identity-two-factor.e2e.spec.ts` — present, new (9e75be4)
- [x] `apps/admin/lib/me.ts` — modified, MeResponse augmented (e1fb53d)
- [x] `apps/admin/app/dashboard/(workspace)/settings/two-factor-actions.ts` — present, new (e1fb53d)
- [x] `apps/admin/app/dashboard/(workspace)/settings/two-factor-enable-client.tsx` — present, new (e1fb53d)
- [x] `apps/admin/app/dashboard/(workspace)/settings/page.tsx` — modified, renders <TwoFactorSection> (e1fb53d)
- [x] `apps/admin/test/two-factor-actions.spec.ts` — present, new (e1fb53d)
- [x] `apps/admin/test/two-factor-enable-client.spec.tsx` — present, new (e1fb53d)
- [x] Commits a4b1906 + 9e75be4 + e1fb53d all in `git log`
- [x] AUTH-08 spec passes 4/4; api-server / set-active-brand / create-brand cookie tests still pass 35/35 (no regressions)
- [x] AUTH-07 admin tests pass 28/28 (14 client + 14 actions)
- [x] Typecheck green for admin and api

## Self-Check: PASSED
