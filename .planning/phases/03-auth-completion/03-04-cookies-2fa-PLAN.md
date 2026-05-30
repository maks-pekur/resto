---
phase: 03-auth-completion
plan: 04
type: execute
wave: 4
depends_on: ['03-03']
files_modified:
  - apps/admin/lib/active-brand-cookie.ts
  - apps/admin/lib/api-server.ts
  - apps/admin/lib/actions/set-active-brand.ts
  - apps/admin/lib/actions/create-brand.ts
  - apps/admin/app/dashboard/settings/page.tsx
  - apps/admin/app/dashboard/settings/two-factor-enable-client.tsx
  - apps/admin/app/dashboard/settings/two-factor-actions.ts
  - apps/admin/test/auth-cookies.spec.ts
  - apps/api/test/e2e/identity-two-factor.e2e.spec.ts
autonomous: true
requirements:
  - AUTH-07
  - AUTH-08
goal: |
  Sweep every `cookies().set(...)` call site in apps/admin to enforce
  `secure: process.env.NODE_ENV === 'production'`, `httpOnly: true`,
  `sameSite: 'lax'` (AUTH-08 full sweep beyond the two cookies fixed in
  Phase 02 D-04). Ship the 2FA TOTP enable flow with 10 recovery codes
  shown once + explicit "I saved them" confirmation gate (AUTH-07 scoped
  per D-22). NO lost-device admin reset UI (Phase 17 / TEAM-04). NO
  email-recovery loop for owner (D-23 explicit out of scope).
tags:
  - cookies
  - 2fa
  - totp
  - recovery-codes
  - phase-03

must_haves:
  truths:
    - "Every cookies().set call site in apps/admin/lib/** AND apps/admin/app/**/actions.ts carries secure:NODE_ENV==='production', httpOnly:true, sameSite:'lax' (exhaustive — not just the two from Phase 02 D-04)"
    - 'auth-cookies.spec.ts asserts the sweep by enumerating every cookies().set site via AST + asserting attribute compliance'
    - "/dashboard/settings 2FA section: operator can enable TOTP, sees QR + 10 recovery codes once + copy-to-clipboard + 'I saved them' checkbox gated Confirm button"
    - 'BA twoFactor plugin verifies the TOTP code BEFORE flipping user.twoFactorEnabled=true (BA default skipVerificationOnEnable=false — preserved)'
    - 'Closing the tab without completing verification leaves user.twoFactorEnabled=false (no partial activation, no lockout — Pitfall 7 closed)'
    - 'NO admin-reset-for-subordinates UI ships (Phase 17 / TEAM-04 scope)'
    - 'NO email-recovery loop for owner ships (D-23 explicit out-of-scope)'
  artifacts:
    - path: 'apps/admin/test/auth-cookies.spec.ts'
      provides: 'AUTH-08 sweep enforcement — enumerates every cookies().set site + asserts attribute compliance'
      min_lines: 60
    - path: 'apps/admin/app/dashboard/settings/two-factor-enable-client.tsx'
      provides: '2FA enable UI — QR + 10 codes + copy + saved-confirmation gate'
    - path: 'apps/admin/app/dashboard/settings/two-factor-actions.ts'
      provides: 'Server actions: enable (returns QR + codes), verify (flips activation), no admin-reset'
    - path: 'apps/api/test/e2e/identity-two-factor.e2e.spec.ts'
      provides: 'AUTH-07 enable + verify + recovery-codes + partial-activation rejection'
  key_links:
    - from: 'apps/admin/lib/active-brand-cookie.ts'
      to: 'cookies().set'
      via: 'Phase 02 baseline pattern reused for any new cookies'
      pattern: 'secure:.*production'
    - from: 'apps/admin/app/dashboard/settings/two-factor-actions.ts'
      to: '/api/auth/two-factor/enable + /api/auth/two-factor/verify'
      via: 'apiFetch with INTERNAL_API_TOKEN server-only'
      pattern: '/api/auth/two-factor'
---

<objective>
Phase 02 D-04 fixed only the two cookies flagged in that phase's review. AUTH-08
demands a full sweep: every cookies().set call site in apps/admin must carry
the secure/httpOnly/sameSite triad with `secure: NODE_ENV === 'production'`.
Current codebase scan identified 4 sites:
- apps/admin/lib/api-server.ts:133+ (session cookie forwarding from BA)
- apps/admin/lib/active-brand-cookie.ts:16+ (Phase 02 baseline — already correct, verify)
- apps/admin/lib/actions/set-active-brand.ts:29+ (Phase 02 fix applied — verify)
- apps/admin/lib/actions/create-brand.ts:68+ (Phase 02 deferred?)

This plan exhaustively audits, fixes, and pins the rule via a unit-spec
that enumerates the sites at AST level so a new server action added in
Phase 4+ that misses the triad fails CI.

Purpose: AUTH-08 closure + AUTH-07 scoped 2FA TOTP enable flow per D-22. NO
lost-device admin-reset UI (deferred to Phase 17 / TEAM-04). NO email-recovery
loop for owner (D-23 explicit). NO recovery-code regeneration UI (deferred
to Phase 17 / TEAM-05).

Output: cookie sweep proven by auth-cookies.spec.ts; /dashboard/settings
2FA enable section with explicit saved-confirmation gate; AUTH-07 e2e
proving partial-activation cannot strand the user (Pitfall 7 closed).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/03-auth-completion/03-CONTEXT.md
@.planning/phases/03-auth-completion/03-RESEARCH.md
@.planning/phases/03-auth-completion/03-03-SUMMARY.md
@.planning/phases/02-admin-shell/02-CONTEXT.md
@apps/CLAUDE.md
@apps/admin/lib/active-brand-cookie.ts
@apps/admin/lib/api-server.ts
@apps/admin/lib/actions/set-active-brand.ts
@apps/admin/lib/actions/create-brand.ts
@apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts

<interfaces>
<!-- Extracted from codebase + RESEARCH.md verified evidence. -->

Cookie sites identified by codebase scan (grep "cookies()" apps/admin):

1. apps/admin/lib/api-server.ts:133 — session cookie sync from BA response (Phase 02 may have set secure flag here as part of ADM-02 wiring)
2. apps/admin/lib/active-brand-cookie.ts:16 — Phase 02 D-03 baseline (HMAC-signed cookie, already correct)
3. apps/admin/lib/actions/set-active-brand.ts:29 — Phase 02 cookie setter
4. apps/admin/lib/actions/create-brand.ts:68 — Phase 02 fixture cookie?

Sweep strategy (sources: apps/CLAUDE.md "Server actions cookies" rule + AUTH-08 scope note in ROADMAP Phase 3):

- For EACH site, ensure: `cookies().set('<name>', '<value>', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', ... })`
- The lone allowed deviation is when sameSite must be 'strict' for CSRF defense — document inline
- `maxAge` per-cookie remains site-specific

BA twoFactor plugin contract (verified RESEARCH.md):
POST /api/auth/two-factor/enable — body { password } (BA REQUIRES current password per types.d.mts:33) → response per types.d.mts:75-92 { totpURI: string, backupCodes: string[10] }; does NOT yet flip twoFactorEnabled. The totpURI is an otpauth:// URI containing the secret — render QR from this URI and extract secret for manual-entry display if desired.
POST /api/auth/two-factor/verify — body { code } → flips user.twoFactorEnabled = true; consumes TOTP
POST /api/auth/two-factor/disable — body { password } → flips off; documented but NOT shipped in admin UI in Phase 3 (Phase 17 / TEAM-05 territory)
Per RESEARCH.md "Pattern 6" + Pitfall 7: skipVerificationOnEnable defaults to false — DO NOT override; the verify step is the activation gate

D-22 confirmation gate (explicit):

- Enable POST returns 10 backup codes; UI displays them once
- UI MUST have:
  - Copy-to-clipboard for the code list (single button copies all 10)
  - Checkbox "I have saved these recovery codes" — disabled Confirm until checked
  - Confirm button posts TOTP code to /verify endpoint
- If operator closes tab between enable and verify: BA leaves user.twoFactorEnabled=false (BA default); recovery codes never were authoritative because enable just generated them, only verify activated them — Pitfall 7 closed by the default itself

D-23 (out of scope for Phase 3):

- No lost-device admin-reset UI — operator who loses TOTP device AND recovery codes contacts founder; runbook in infra/runbooks/2fa-recovery.md (Plan 05 task)
- No email-recovery loop — it cancels the 2FA security gain (anyone phishing the email mailbox bypasses TOTP)
- No recovery-code regeneration UI — Phase 17 / TEAM-05
  </interfaces>
  </context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Exhaustive cookie sweep + auth-cookies.spec.ts (AUTH-08)</name>
  <read_first>
    - apps/admin/lib/api-server.ts:130-200 (apiFetch cookie forwarding from BA — line 133 cookieStore.set call sites)
    - apps/admin/lib/active-brand-cookie.ts (Phase 02 baseline — verify)
    - apps/admin/lib/actions/set-active-brand.ts (Phase 02 fix — verify)
    - apps/admin/lib/actions/create-brand.ts:68+ (Phase 02 may have deferred this site)
    - apps/CLAUDE.md "All cookies set from server actions" rule
    - .planning/phases/02-admin-shell/02-CONTEXT.md D-04 (the two cookies fixed in Phase 02)
    - .planning/phases/03-auth-completion/03-RESEARCH.md "Phase Requirements → Test Map" row AUTH-08 (4 sites identified)
  </read_first>
  <behavior>
    - Test 1: Every cookies().set call across apps/admin/lib/**/*.ts AND apps/admin/app/**/actions.ts AND apps/admin/app/**/*.ts has options object with `httpOnly: true`
    - Test 2: Every cookies().set call has `secure: process.env.NODE_ENV === 'production'`
    - Test 3: Every cookies().set call has `sameSite: 'lax'` (unless inline-documented as 'strict' with CSRF rationale comment)
    - Test 4: The auth-cookies.spec.ts test discovers all cookies().set sites via filesystem scan + AST parse — adding a new server action that calls cookies().set without the triad FAILS CI
    - Test 5: Regression — the two cookies fixed in Phase 02 D-04 still have the correct attributes
    - Test 6 (e2e via Playwright if available, OR unit via api-server.ts mock): the BA session cookie forwarded by apiFetch carries the correct attributes when downstream receives Set-Cookie
  </behavior>
  <action>
    Step A — Audit: run `grep -rn "cookies()" apps/admin/lib apps/admin/app --include="*.ts" --include="*.tsx" | grep -v test` to enumerate every cookies().set call site. Expected sites per research scan: api-server.ts:133, active-brand-cookie.ts:16, set-active-brand.ts:29, create-brand.ts:68. If new sites surface from Plan 03 (settings invite-action.ts, accept-invitation actions.ts, reset-password actions.ts, signup actions.ts), include them.

    Step B — Fix: for EACH site, ensure the options object on cookies().set(...) call includes ALL of `httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax'`. The active-brand-cookie.ts already has this from Phase 02 D-03 — verify only. Sites that are currently missing any attribute: add them. Where path/maxAge/domain are already set, append (not replace) the triad. Match the spread pattern used in active-brand-cookie.ts so future readers see one canonical shape.

    Step C — Pin: create apps/admin/test/auth-cookies.spec.ts. Use Node's fs + ts-morph (or Vitest's `import * as ts` if ts-morph not in repo) to read every .ts and .tsx file under apps/admin/lib and apps/admin/app (excluding tests), AST-parse, find every CallExpression matching `cookieStore.set(...)` or `cookies().set(...)`, extract the second argument's ObjectLiteralExpression, assert the three properties exist with the required values. The test enumerates fail cases per file:line so CI surfaces "cookies().set at <file>:<line> missing { secure: process.env.NODE_ENV === 'production' }".

    Step D — Document: any cookie that legitimately needs `sameSite: 'strict'` (CSRF-hardened sensitive cookies) gets an inline comment `// sameSite: 'strict' — CSRF-hardened, AUTH-08-approved exception` so the AST test can allow it via comment-tag.

    NB: Per Phase 02 deferred-items: forgot-password/actions.ts:15 antipattern was closed in Plan 03 Task 3. If that file or other Plan 03 actions add new cookies they MUST already comply per Plan 03 Task 3 done-criteria; this task verifies the sweep across the whole tree.

  </action>
  <verify>
    <automated>pnpm --filter @resto/admin test auth-cookies</automated>
    <automated>grep -rn "cookies()\.set\|cookieStore\.set" apps/admin/lib apps/admin/app --include="*.ts" --include="*.tsx" | grep -v test | wc -l</automated>
    <automated>pnpm --filter @resto/admin typecheck</automated>
  </verify>
  <done>
    auth-cookies.spec.ts AST-walks every cookies().set site and asserts the triad; all sites comply; new server actions added in later phases that miss the triad fail this spec at CI; typecheck green; sweep is exhaustive (not just the two from Phase 02 D-04 — D-04 attribute scope explicitly extended per Phase 3 success criterion 4).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 2FA TOTP enable flow with 10 recovery codes + saved-confirmation gate (AUTH-07 scoped per D-22)</name>
  <read_first>
    - apps/admin/app/dashboard/settings/page.tsx (Phase 02 placeholder — may need section-shell)
    - apps/admin/components/empty-state.tsx (reuse for already-enabled state)
    - .planning/phases/03-auth-completion/03-RESEARCH.md "Pattern 6" (2FA enable flow + verification gate)
    - .planning/phases/03-auth-completion/03-RESEARCH.md "Pitfall 7" (partial activation lockout — closed by BA's skipVerificationOnEnable=false default)
    - .planning/phases/03-auth-completion/03-RESEARCH.md "Verification findings Item 22" (twoFactor opt-in confirmed at index.mjs:173)
    - .planning/phases/03-auth-completion/03-CONTEXT.md D-22 (UI gate explicit shape)
    - .planning/phases/03-auth-completion/03-CONTEXT.md D-23 (no admin-reset, no email-recovery, no regeneration in Phase 3)
    - apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts:154 (twoFactor() plugin already loaded)
  </read_first>
  <behavior>
    - Test 1: /dashboard/settings page renders a 2FA section that is "Enable 2FA" CTA when current user.twoFactorEnabled=false
    - Test 2: Clicking Enable opens <PasswordConfirmDialog>; submitting current password triggers two-factor-actions.ts enable(password) → calls BA /api/auth/two-factor/enable with body { password } → returns { totpURI, backupCodes: string[10] } per types.d.mts:75-92
    - Test 3: UI shows QR code rendered from totpURI (which embeds the secret for manual paste), 10 recovery codes in a copyable list, copy-to-clipboard button, "I have saved these recovery codes" checkbox, and TOTP code input — Confirm button DISABLED until checkbox checked AND TOTP code matches /^\d{6}$/
    - Test 4: Submitting verify() with valid TOTP → BA /api/auth/two-factor/verify → user.twoFactorEnabled flips to true; UI shows "2FA active" badge
    - Test 5: Submitting verify() with invalid TOTP → BA returns error; UI surfaces friendly message, user.twoFactorEnabled stays false
    - Test 6: Closing the tab between enable() and verify() — opening /dashboard/settings again shows "Enable 2FA" CTA (no half-state); user.twoFactorEnabled still false; previously-shown recovery codes are NOT recoverable (BA didn't persist activation, the codes were tied to the never-committed activation attempt)
    - Test 7: Section shows EmptyState "2FA already enabled" + "Lost device? Contact founder support via runbook" link (D-23 explicit — NO regenerate-codes UI, NO admin-reset UI)
    - Test 8 (e2e): existing operator with twoFactorEnabled=true who signs in → BA two-factor middleware enforces TOTP challenge per BA's opt-in-by-flag mechanism verified at index.mjs:173
  </behavior>
  <action>
    Create apps/admin/app/dashboard/settings/two-factor-enable-client.tsx ('use client'). State machine: idle → enabling → showing-codes → verifying → done. State transitions use server actions. Layout: idle shows "Enable 2FA" button; showing-codes shows secret (mono font), QR (use 'qrcode' npm pkg if not present, OR render the qrCodeUri data URL directly via <img>), the 10 codes in a styled list, copy-button (uses navigator.clipboard.writeText join '\n'), checkbox "I have saved these recovery codes", TOTP code input (numeric, 6-digit), Confirm button (disabled until checkbox checked AND code is exactly 6 digits per pattern /^\d{6}$/).

    Create two-factor-actions.ts ('use server'): exports enable(password) and verify(code: string).

    The 2FA enable flow (locked per plan-checker W-4 2026-05-30 + RESEARCH.md Open Question 4 RESOLVED — BA `node_modules/.../two-factor/index.d.mts` verified by orchestrator):

    1. User clicks "Enable 2FA" in /dashboard/settings — opens a <PasswordConfirmDialog> component (NOT session-pull; BA requires the user CURRENT password per types.d.mts:33 `{ password: z.ZodString }`).
    2. User re-enters current password. On confirm, the client calls the enable(password) server action.
    3. enable(password) calls apiFetch POST /api/auth/two-factor/enable with body { password }. Server-side this routes through BA `auth.api.enableTwoFactor` (verified at types.d.mts:23).
    4. BA returns response shape per types.d.mts:75-92 — includes `totpURI: string` (TOTP otpauth:// URI usable for QR rendering AND manual secret extraction) and `backupCodes: string[]` (plain string array, shown once). Return this exact shape to the client; do not invent extra fields.
    5. Client renders the QR code from `totpURI` (use either a `qrcode` npm dep OR render the URI through any QR-rendering library wrapper; the URI itself contains the secret so no separate secret-extraction step needed) plus the `backupCodes` array in a <BackupCodesDialog>.
    6. The dialog shows the codes in a copy-to-clipboard list (`navigator.clipboard.writeText(codes.join('\n'))`), a checkbox "I have saved these recovery codes", and a TOTP code input. Confirm button stays DISABLED until the checkbox is checked AND the TOTP input matches `/^\d{6}$/`.
    7. On confirm, client calls verify(code) which calls apiFetch POST /api/auth/two-factor/verify with body { code }. BA flips `user.twoFactorEnabled=true` only on successful verification (Pitfall 7 closed: BA `skipVerificationOnEnable=false` default preserved).
    8. On success the dialog closes; the settings page re-renders with "2FA active" badge + "Disable 2FA" affordance.

    verify(code) returns `{ ok: true }` on success and `{ error: 'invalid_code' | 'session_expired' | 'unknown' }` on failure for friendly UI surfacing. No half-state can strand the user — closing the tab between step 4 and step 7 leaves `user.twoFactorEnabled=false` and the just-shown backup codes are NOT valid for any sign-in flow (BA did not commit them).

    Update /dashboard/settings/page.tsx (Phase 02 + Plan 03 Task 2 modified): add the 2FA section above the invite section (or as a tabbed section, layout matches Phase 02 D-02 sketch). Section auto-detects user.twoFactorEnabled (from getMe() augmented in Plan 03) and renders enable-flow vs already-enabled EmptyState.

    For the already-enabled state (twoFactorEnabled=true), render EmptyState variant=info with title "Two-factor authentication active" + body "Lost your device and recovery codes? Contact founder support via the runbook." (D-23 — NO regenerate codes button, NO admin-reset link in Phase 3; Phase 17 / TEAM-05 ships the regenerate UI). Surface a "View runbook" link to infra/runbooks/2fa-recovery.md (Plan 05 ships the runbook; for now link is a placeholder anchor + tooltip).

    Create apps/api/test/e2e/identity-two-factor.e2e.spec.ts: covers behaviors 1-8 with a CapturedEmailAdapter wired (for tests). Mock BA TOTP via deterministic secret + generated code in test setup. Specifically pin behavior 6 (no half-state lockout) per Pitfall 7 — sequence: enable() → close tab (simulate by not calling verify()) → fresh page load → assert user.twoFactorEnabled=false in DB AND UI shows enable CTA again AND previously-generated recovery codes are NOT valid for any sign-in flow.

  </action>
  <verify>
    <automated>pnpm --filter @resto/admin test two-factor-enable-client</automated>
    <automated>pnpm --filter @resto/admin test two-factor-actions</automated>
    <automated>pnpm --filter @resto/api test:e2e identity-two-factor</automated>
  </verify>
  <done>
    /dashboard/settings has 2FA section; enable() returns QR + codes + secret; UI shows copy + saved-checkbox + TOTP-input + disabled-until-both-met Confirm; verify() flips twoFactorEnabled only after successful TOTP submission; Pitfall 7 closed (no half-state); already-enabled state shows EmptyState info with founder-recovery runbook link (D-23 — no regenerate, no admin-reset UI); e2e behaviors 1-8 green.
  </done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                             | Description                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| Browser ↔ /dashboard/settings        | Authenticated operator surface; cookies must defend over passive HTTP                |
| BA twoFactor → user.twoFactorEnabled | Plugin enforces opt-in; misconfiguration could enforce globally                      |
| Operator → recovery-codes display    | Codes shown once; if mishandled (browser cache + tab restore) attacker could harvest |
| TOTP code → BA verify                | Single-use; replay protection from BA's totp module                                  |

## STRIDE Threat Register

| Threat ID | Category               | Component                                                      | Disposition | Mitigation Plan                                                                                                                                                                   |
| --------- | ---------------------- | -------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-03-27   | Information Disclosure | Cookie leaks over passive HTTP without secure flag             | mitigate    | AUTH-08 sweep covers EVERY cookies().set site; AST-walking spec pins the rule                                                                                                     |
| T-03-28   | Tampering              | New server action in Phase 4+ adds cookies().set without triad | mitigate    | auth-cookies.spec.ts fails CI on any new non-compliant site                                                                                                                       |
| T-03-29   | Spoofing               | CSRF on session cookies                                        | mitigate    | sameSite:'lax' default; sites that need 'strict' have inline rationale comment per Task 1 Step D                                                                                  |
| T-03-30   | Elevation of Privilege | 2FA bypass via email-recovery loop                             | mitigate    | D-23 explicit — no email-recovery loop exists in Phase 3 codebase                                                                                                                 |
| T-03-31   | Elevation of Privilege | Owner self-resets TOTP via admin UI                            | mitigate    | D-23 — no admin-reset-for-self in Phase 3 (Phase 17 / TEAM-04 reserved for subordinate-reset; even there, owner stays manual runbook)                                             |
| T-03-32   | Repudiation            | TOTP enable not audited                                        | accept      | BA's existing audit on sign-in / sign-out continues to fire; TOTP enable is a settings change not currently in the 8-action audit set; revisit if compliance requirement surfaces |
| T-03-33   | Denial of Service      | Operator locked out by half-state activation                   | mitigate    | Pitfall 7 closed by BA skipVerificationOnEnable=false default — preserved; behavior 6 e2e proves no half-state strands user                                                       |
| T-03-34   | Information Disclosure | Recovery codes cached in browser tab restoration               | accept      | Codes shown once on a session-bound flow; navigating away forfeits them by design (this IS the security property — single-show + saved-confirmation)                              |
| T-03-35   | Tampering              | BA twoFactor enforces TOTP globally by mistake                 | accept      | Verified at two-factor/index.mjs:173 (RESEARCH.md Item 22) — short-circuits if !user.twoFactorEnabled; safe to keep plugin loaded                                                 |

</threat_model>

<verification>
- pnpm --filter @resto/admin test auth-cookies
- pnpm --filter @resto/admin test two-factor-enable-client
- pnpm --filter @resto/admin test two-factor-actions
- pnpm --filter @resto/api test:e2e identity-two-factor
- grep -rn "cookies()\.set" apps/admin/lib apps/admin/app --include="*.ts" --include="*.tsx" | grep -v test | grep -v "secure:" returns 0 lines
- grep -rn "cookieStore\.set" apps/admin/lib apps/admin/app --include="*.ts" --include="*.tsx" | grep -v test | grep -v "secure:" returns 0 lines
- ls apps/admin/app/dashboard/settings/two-factor-enable-client.tsx exists
- ls apps/admin/app/dashboard/settings/two-factor-actions.ts exists
- grep -c "email-recovery\|emailRecovery" apps/admin/app/dashboard/settings/two-factor-enable-client.tsx returns 0 (D-23 verification)
- grep -c "admin.reset\|adminReset\|reset.*subordinate" apps/admin/app/dashboard/settings/two-factor-actions.ts returns 0 (no admin-reset UI shipped)
</verification>

<success_criteria>

- AUTH-08 ROADMAP Success Criterion 4 (first half) satisfied: all cookies set by server actions carry secure/httpOnly/sameSite per the rule — full sweep, not just the two cookies fixed in Phase 02 D-04
- AUTH-07 ROADMAP Success Criterion 3 satisfied: operator can enable 2FA TOTP from account settings; 10 recovery codes generated on enable; shown once with copy-to-clipboard; require explicit "I saved them" confirmation before activation; owner email-recovery loop NOT shipped
- D-22 confirmation gate UI implemented
- D-23 explicit out-of-scope items confirmed absent: no email-recovery loop, no admin-reset UI for subordinates, no recovery-code regeneration UI
- auth-cookies.spec.ts ensures new server actions in Phases 4+ cannot regress the sweep
  </success_criteria>

<output>
Create `.planning/phases/03-auth-completion/03-04-SUMMARY.md` when done.
</output>
