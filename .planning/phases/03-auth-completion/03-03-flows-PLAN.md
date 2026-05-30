---
phase: 03-auth-completion
plan: 03
type: execute
wave: 3
depends_on: ['03-02']
files_modified:
  - apps/api/src/contexts/identity/interfaces/http/error-mapping.ts
  - apps/api/src/contexts/identity/interfaces/http/signup.controller.ts
  - apps/api/src/contexts/identity/application/signup.service.ts
  - apps/admin/app/login/actions.ts
  - apps/admin/app/signup/actions.ts
  - apps/admin/app/signup/page.tsx
  - apps/admin/app/forgot-password/actions.ts
  - apps/admin/app/forgot-password/page.tsx
  - apps/admin/app/reset-password/actions.ts
  - apps/admin/app/reset-password/[token]/page.tsx
  - apps/admin/app/accept-invitation/[id]/page.tsx
  - apps/admin/app/accept-invitation/[id]/actions.ts
  - apps/admin/app/dashboard/settings/page.tsx
  - apps/admin/app/dashboard/settings/invite-form-client.tsx
  - apps/admin/app/dashboard/settings/invite-action.ts
  - apps/api/test/e2e/identity-invitation.e2e.spec.ts
  - apps/api/test/e2e/identity-password-reset.e2e.spec.ts
  - apps/api/test/e2e/identity-email-verification.e2e.spec.ts
  - apps/api/test/e2e/signup-enumeration.e2e.spec.ts
autonomous: true
requirements:
  - AUTH-02
  - AUTH-03
  - AUTH-04
  - AUTH-05
  - AUTH-06
goal: |
  Wire the four operator email flows on top of the email adapter from
  Plan 02: invitation send + accept (AUTH-02/03), password reset
  send + apply (AUTH-04/05), email verification on signup with
  REQUIRE_EMAIL_VERIFICATION gate (AUTH-06), plus the /v1/signup
  enumeration parity wrap (D-06). Also closes Phase 02 carry-overs:
  forgot-password/actions.ts:15 localhost fallback + login/actions.ts:36-74
  3-call fan-out refactor.
tags:
  - invitation
  - password-reset
  - email-verification
  - enumeration-parity
  - phase-03

must_haves:
  truths:
    - 'Operator invited via /dashboard/settings receives invitation email via the wired adapter; link points to /accept-invitation/<id>'
    - 'Existing-account email auto-attaches to the new tenant on accept (BA mechanism — no duplicate user row)'
    - 'Owner-tier role available only when inviter has owner role; admin trying to invite role=owner returns 403 (BA creatorRole enforcement)'
    - 'Operator at /forgot-password receives reset email with single-use 1h-TTL link via the wired adapter'
    - 'Operator at /reset-password/<token> sets new password; all existing sessions revoked (BA cascade in auth.config.ts:285-307)'
    - 'New signup triggers email verification per BA emailVerification.sendOnSignUp:true'
    - 'REQUIRE_EMAIL_VERIFICATION=true blocks sensitive endpoints for users where user.emailVerified=false'
    - '/v1/signup returns identical status + body + ±10ms timing for existing vs nonexistent email'
    - '/api/auth/request-password-reset returns identical status + body + ±10ms (verified BA defaults already correct — Phase 3 adds the e2e proof)'
    - "forgot-password/actions.ts no longer contains '?? \\'http://localhost:3001\\'' fallback"
    - 'login/actions.ts no longer fans out 3 calls in a row — refactored to a single coherent flow'
  artifacts:
    - path: 'apps/admin/app/accept-invitation/[id]/page.tsx'
      provides: 'Invitation accept route (RSC reads invitation, client submits)'
    - path: 'apps/admin/app/dashboard/settings/invite-form-client.tsx'
      provides: 'Single email + role + submit form (D-09 minimal shape, NO members list/revoke)'
    - path: 'apps/admin/app/dashboard/settings/invite-action.ts'
      provides: 'Server action calling auth.api.createInvitation via apiFetch + INTERNAL_API_TOKEN'
    - path: 'apps/api/src/contexts/identity/interfaces/http/signup.controller.ts'
      provides: 'Enumeration-parity wrapper hiding email-taken distinction'
      contains: 'executeOrTimeEqualize'
    - path: 'apps/api/test/e2e/identity-invitation.e2e.spec.ts'
      provides: 'AUTH-02/03 invitation flow + owner-only-grants-owner regression (Skeptic LOW-12)'
    - path: 'apps/api/test/e2e/identity-password-reset.e2e.spec.ts'
      provides: 'AUTH-04/05 reset flow + enumeration parity timing'
    - path: 'apps/api/test/e2e/signup-enumeration.e2e.spec.ts'
      provides: 'D-06 /v1/signup parity proof (status + body + ±10ms)'
    - path: 'apps/api/test/e2e/identity-email-verification.e2e.spec.ts'
      provides: 'AUTH-06 REQUIRE_EMAIL_VERIFICATION blocks sensitive endpoint'
  key_links:
    - from: 'apps/admin/app/forgot-password/actions.ts'
      to: 'apps/admin/lib/env.ts adminOrigin()'
      via: "import { adminOrigin } from '@/lib/env'"
      pattern: "adminOrigin\\("
    - from: 'apps/admin/app/dashboard/settings/invite-action.ts'
      to: '/api/auth/organization/invite-member'
      via: 'apiFetch with INTERNAL_API_TOKEN server-only'
      pattern: '/api/auth/organization/invite'
    - from: 'apps/admin/app/accept-invitation/[id]/page.tsx'
      to: 'BA /organization/accept-invitation route'
      via: 'client form post via apiFetch'
      pattern: 'accept-invitation'
---

<objective>
Plan 02 shipped the email adapter; this plan wires the four operator email
flows that consume it AND the enumeration parity wrap for /v1/signup. BA
1.4.22 verification in 03-RESEARCH.md confirmed:
- BA's request-password-reset already has timing-attack parity built in
  (verified password.mjs:51-61); Phase 3 adds the e2e proof, NO BA wrapping
  needed.
- BA's accept-invitation requires session.user.email === invitation.email
  (verified crud-invites.mjs:335); existing-account auto-attach happens
  automatically via BA's afterAcceptInvitation hook.
- BA enforces owner-only-can-grant-owner at crud-invites.mjs:112 (verified);
  Phase 3 adds the regression e2e (Skeptic LOW-12).
- BA's /api/auth/sign-up/email returns USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL
  distinct message — but admin uses /v1/signup (RestOS custom), not BA's
  endpoint. /v1/signup error-mapping.ts:46 surfaces signup.email_taken
  distinct code — THIS is the D-06 wrapping target.

Purpose: deliver AUTH-02/03/04/05/06 + D-06 + Phase 02 carry-overs in a
single coherent wave. After this plan: an operator can be invited, click
the invitation link, accept into either a new account or auto-attach into
their existing one; forgot their password and reset via the email link;
sign up and complete email verification; the signup endpoint stops leaking
"is this email taken" via response divergence.

Output: minimal invite form in /dashboard/settings (NOT a dedicated team
page — D-09 explicit), the accept-invitation route, real forgot/reset
wiring (replacing Phase 02 placeholders), email-verification gate,
enumeration parity wrap on /v1/signup, the four gating e2e specs, and the
two Phase 02 carry-over refactors absorbed.
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
@.planning/phases/03-auth-completion/03-01-SUMMARY.md
@.planning/phases/03-auth-completion/03-02-SUMMARY.md
@.planning/phases/02-admin-shell/02-CONTEXT.md
@.planning/phases/02-admin-shell/deferred-items.md
@apps/CLAUDE.md
@apps/api/src/contexts/identity/interfaces/http/error-mapping.ts
@apps/api/src/contexts/identity/interfaces/http/signup.controller.ts
@apps/admin/app/login/actions.ts
@apps/admin/app/forgot-password/actions.ts
@apps/admin/lib/env.ts
@apps/admin/lib/api-server.ts
@apps/admin/components/empty-state.tsx
@apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts

<interfaces>
<!-- Extracted from research + codebase scans. -->

BA endpoints used (mounted at /api/auth/\* — verified in research):
POST /api/auth/organization/invite-member — body { email, role, organizationId? } → BA creates invitation + fires sendInvitationEmail callback (which now delegates to adapter from Plan 02)
POST /api/auth/organization/accept-invitation — body { invitationId } → BA matches session.user.email to invitation.email, attaches user to org via afterAcceptInvitation
POST /api/auth/request-password-reset — body { email, redirectTo } → BA enumeration parity built in
POST /api/auth/reset-password — body { newPassword, token } → BA flips password, our hooks.after cascade revokes sessions
POST /api/auth/sign-up/email (NOT used by admin — RestOS uses /v1/signup)
POST /api/auth/verify-email?token=... → BA flips emailVerified

D-06 wrap target — apps/api/src/contexts/identity/interfaces/http/error-mapping.ts:46:
Current: maps EmailTakenError to NestJS ConflictException with code 'signup.email_taken'
Fix: SignUpService.executeOrTimeEqualize catches EmailTakenError internally; runs no-op DB write (cost ~= real path including bcrypt-equivalent hash burn); controller returns same 201 + body shape as success branch — REMOVE the distinct error surface (per RESEARCH.md Pattern 3)
Trade-off: admin signup UI loses the friendly "email taken" message. Mitigation: toast + redirect to /login (per RESEARCH.md Pattern 3 recommendation)

Phase 02 carry-over targets:
apps/admin/app/forgot-password/actions.ts:15 — `process.env.ADMIN_WEB_URL ?? 'http://localhost:3001'` — replace with `import { adminOrigin } from '@/lib/env'; const origin = adminOrigin();`
apps/admin/app/login/actions.ts:36-74 — 3 calls in sequence: signIn → setActiveOrganization → redirect. Refactor: extract a single signInAndBindOrg helper in apps/admin/lib/actions/sign-in-and-bind-org.ts that does the work atomically, with a single try/catch + single 401 handling path.

REQUIRE_EMAIL_VERIFICATION enforcement (AUTH-06):
env.schema.ts:167 — REQUIRE_EMAIL_VERIFICATION exists with default 'false'
BA already has emailAndPassword.requireEmailVerification:true to enforce on sign-in (verified in BA docs)
Wire this in auth.config.ts emailAndPassword config: `requireEmailVerification: env.REQUIRE_EMAIL_VERIFICATION === 'true'`
Document the env spec: staging/production sets REQUIRE_EMAIL_VERIFICATION=true; development can stay false for inner-loop speed

D-10 (owner-only-can-grant-owner) — BA already enforces at crud-invites.mjs:112 (verified). Phase 3 regression test asserts admin → role=owner returns 403 from BA, mapped by error-mapping.ts to NestJS ForbiddenException, surfaced as user-friendly EmptyState in admin UI.

D-11 (duplicate-email auto-attach) — BA's afterAcceptInvitation adds the user to the new org; user's existing password works; on next /login the new tenant appears in brand-switcher (Phase 02 mechanism).

Accept-invitation flow flow control:

1. RSC at /accept-invitation/[id]/page.tsx reads invitation via `auth.api.getInvitation({ invitationId: params.id })` server-side using INTERNAL_API_TOKEN
2. If invitation.expiresAt < now or status !== 'pending' → render <EmptyState variant="forbidden" title="Invitation invalid or expired">
3. If user not signed in → show "Sign in to accept" link to /login?next=/accept-invitation/[id]
4. If user signed in but user.email !== invitation.email → render <EmptyState variant="forbidden" title="This invitation was sent to a different email">
5. If user signed in AND user.email matches but emailVerified=false → render <EmptyState variant="forbidden" title="Please verify your email first"> (BA error EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION per Pitfall 8)
6. Else show "Join {tenantSlug}" confirm button → submits to actions.ts → POSTs /api/auth/organization/accept-invitation → success redirects to /dashboard
   </interfaces>
   </context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: /v1/signup enumeration parity wrap (D-06) + identity-password-reset + identity-email-verification e2e specs</name>
  <read_first>
    - apps/api/src/contexts/identity/interfaces/http/signup.controller.ts (entire file)
    - apps/api/src/contexts/identity/application/signup.service.ts (entire file — find EmailTakenError throw site)
    - apps/api/src/contexts/identity/interfaces/http/error-mapping.ts:46 (signup.email_taken mapping)
    - apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts:285-307 (password-reset cascade hooks — verify still fires after WeakMap refactor in Plan 05)
    - apps/api/test/e2e/identity-audit.e2e.spec.ts (testharness pattern — testcontainers, db setup, BA sign-in helper)
    - .planning/phases/03-auth-completion/03-RESEARCH.md "Pattern 3: /v1/signup enumeration parity" (executeOrTimeEqualize design)
    - .planning/phases/03-auth-completion/03-RESEARCH.md "Pitfall 1" (Set-Cookie divergence is its own channel — fix below)
  </read_first>
  <behavior>
    - Test 1: POST /v1/signup with new email returns 201 + body { status: 'pending_verification' } (or similar success shape — no specific cookies, no tenant id leaked)
    - Test 2: POST /v1/signup with email of existing user returns IDENTICAL 201 + same body shape; no Set-Cookie present; no distinct code
    - Test 3: Timing parity: 100 paired calls (existing vs new email, interleaved), |median(existing) - median(new)| < 10ms
    - Test 4: POST /api/auth/request-password-reset with existing vs nonexistent email returns identical body (BA built-in — proven, not implemented); timing within ±10ms; rate-limit boundary (RATE_LIMIT_AUTH_RESET_PER_EMAIL_PER_MIN) does NOT divulge bucket allocation by 429-timing divergence
    - Test 5: With REQUIRE_EMAIL_VERIFICATION=true env, GET on a sensitive endpoint (use /v1/tenancy/brands as the AUTH-protected sensitive route) with a user whose emailVerified=false returns 403 with a user-recognizable error code
    - Test 6: Same sensitive endpoint with emailVerified=true succeeds
  </behavior>
  <action>
    In apps/api/src/contexts/identity/application/signup.service.ts add an `executeOrTimeEqualize(input): Promise<SignupResult>` method that wraps existing `execute(input)`. Internal flow: try the real path; on EmailTakenError, instead of rethrowing, run a no-op DB write (e.g., a SELECT 1 from users + a bcrypt.hash on a throwaway random string with the same cost factor that PASSWORD_MIN_LENGTH path uses — matches the bcrypt cost of the happy path); compute a deterministic-looking SignupResult shape that mirrors the success branch's serialised body (status: 'pending_verification') WITHOUT setting any session cookie. In apps/api/src/contexts/identity/interfaces/http/signup.controller.ts change the endpoint to call executeOrTimeEqualize instead of execute; return the same 201 response shape on both branches. In error-mapping.ts:46 remove or downgrade the `signup.email_taken` distinct code mapping — it should never reach the controller since executeOrTimeEqualize swallows internally. Per RESEARCH.md Pattern 3 trade-off: admin signup UI updates in Task 3 below to show generic "Check your email" toast + redirect to /login (no longer surfaces "email taken").

    Per apps/CLAUDE.md "open redirect" rule: the BA reset-password redirectTo param goes through originCheck (BA built-in verified at password.mjs:86); Phase 3 does not need additional refinement for the BA endpoint, BUT the admin's /reset-password/[token] page must refine any `?next=` query param against `z.string().startsWith('/').refine(s => !/^\/[\\/]/.test(s))` per the apps/CLAUDE.md rule — applies to both reset and accept-invitation routes.

    Create apps/api/test/e2e/signup-enumeration.e2e.spec.ts asserting behaviors 1-3 above. The 100-paired-calls timing test uses Vitest performance.now() + median calculation; mark it `.concurrent` to avoid scheduling bias. Create apps/api/test/e2e/identity-password-reset.e2e.spec.ts asserting behavior 4 (extending identity-audit.e2e.spec.ts style). Create apps/api/test/e2e/identity-email-verification.e2e.spec.ts asserting behaviors 5-6 (REQUIRE_EMAIL_VERIFICATION env override per spec). Wire `requireEmailVerification: env.REQUIRE_EMAIL_VERIFICATION === 'true'` into the emailAndPassword block of auth.config.ts.

  </action>
  <verify>
    <automated>pnpm --filter @resto/api test signup.service</automated>
    <automated>pnpm --filter @resto/api test:e2e signup-enumeration</automated>
    <automated>pnpm --filter @resto/api test:e2e identity-password-reset</automated>
    <automated>pnpm --filter @resto/api test:e2e identity-email-verification</automated>
    <automated>grep -c "signup.email_taken" apps/api/src/contexts/identity/interfaces/http/error-mapping.ts</automated>
  </verify>
  <done>signup.service.ts has executeOrTimeEqualize; signup.controller.ts returns identical body for both branches; error-mapping.ts no longer surfaces signup.email_taken distinctly (grep returns 0 in the error-mapping export of that code); REQUIRE_EMAIL_VERIFICATION wired into BA emailAndPassword config; 4 e2e specs green; timing parity test passes with ±10ms tolerance.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Invitation send + accept flow (AUTH-02, AUTH-03) — server action + accept route + e2e</name>
  <read_first>
    - apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts (organization plugin block — confirm requireEmailVerificationOnInvitation:true wired in Plan 02 Task 3)
    - apps/admin/lib/api-server.ts:130-200 (apiFetch + cookie binding pattern)
    - apps/admin/lib/me.ts (getMe() cached identity — used for owner-can-grant-owner UI gate)
    - apps/admin/components/empty-state.tsx (EmptyState variant="forbidden" + reuse for invalid/expired invitation)
    - .planning/phases/03-auth-completion/03-RESEARCH.md "Pitfall 5" (BA enforces owner-only-grants-owner at crud-invites.mjs:112)
    - .planning/phases/03-auth-completion/03-RESEARCH.md "Pitfall 8" (requireEmailVerificationOnInvitation must be true — applied in Plan 02)
    - .planning/phases/02-admin-shell/02-CONTEXT.md D-02 (placeholder route ready at /signup, /accept-invitation may not exist yet)
  </read_first>
  <behavior>
    - Test 1 (e2e): owner-tier operator submits /dashboard/settings invite form with admin role → invitation created, BA invokes sendInvitationEmail, CapturedEmailAdapter records the send with correct to/url/locale/tenantSlug/inviterName/tenantId
    - Test 2 (e2e regression — Skeptic LOW-12 mandatory): admin-tier operator submits invite form with role=owner → server action receives 403 from BA's creatorRole enforcement; UI renders EmptyState variant=forbidden (NOT a stack trace per ADM-06 baseline)
    - Test 3 (e2e): new user clicks invitation URL while not signed-in → /accept-invitation/[id] page shows "Sign in to accept" CTA pointing at /login?next=/accept-invitation/[id]
    - Test 4 (e2e): existing user (different email than invitation) signed-in clicks invitation URL → renders forbidden EmptyState "This invitation was sent to a different email"
    - Test 5 (e2e): existing user (matching email, emailVerified=true) signed-in → shows confirm button → submits → BA accept-invitation called → user appears as member of the new org with correct role (D-11 auto-attach)
    - Test 6 (e2e): existing user (matching email, emailVerified=false) → forbidden EmptyState "Please verify your email first" with verification-resend CTA (uses BA EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION error)
    - Test 7 (e2e): admin UI form's role dropdown is computed from getMe() — only roles inviter is allowed to grant appear (e.g., admin sees ['admin','staff'], owner sees ['owner','admin','staff'])
    - Test 8 (e2e): expired invitation (BA-default 48h elapsed) → forbidden EmptyState "Invitation invalid or expired"
  </behavior>
  <action>
    Per D-09 + D-24: create /dashboard/settings route if not present, host the minimal invite form there (NOT a new /dashboard/team route — that's Phase 17 / TEAM-01). Create apps/admin/app/dashboard/settings/page.tsx as RSC that imports InviteFormClient and renders it under existing layout. Create invite-form-client.tsx as a 'use client' component: single email <input>, single role <Select> (options derived from getMe()'s role per D-10), single Submit button. No optimistic update, no live invitation list (D-09 explicit minimal). On submit calls invite-action.ts server action.

    Create invite-action.ts as server action ('use server' module). Reads form data, validates with Zod (`{ email: z.string().email().max(254), role: z.enum(['owner','admin','staff']) }`). Calls apiFetch (server-only, INTERNAL_API_TOKEN attached) to POST `/api/auth/organization/invite-member` with `{ email, role }`. Wraps in try/catch; on 403 from BA returns `{ error: 'forbidden' }` for the UI to render EmptyState variant=forbidden. On success returns `{ ok: true }`. The role dropdown UI option-filtering is defense-in-depth; BA's crud-invites.mjs:112 is the authoritative check (Pitfall 5).

    Create apps/admin/app/accept-invitation/[id]/page.tsx as RSC: reads params.id, refines `?next=` query param against `z.string().startsWith('/').refine(s => !/^\/[\\/]/.test(s))` per apps/CLAUDE.md open-redirect rule. Server-fetches the invitation via apiFetch GET `/api/auth/organization/get-invitation?invitationId=<id>` with INTERNAL_API_TOKEN. Renders per the state machine documented in the interfaces block above (5 outcome branches → EmptyState variants OR confirm button). The confirm button posts to apps/admin/app/accept-invitation/[id]/actions.ts which calls POST `/api/auth/organization/accept-invitation` with BA session cookie (from request) — on success redirect to /dashboard.

    Create apps/api/test/e2e/identity-invitation.e2e.spec.ts. Use CapturedEmailAdapter via NODE_ENV=test composition. Covers 8 behaviors above. Test 2 (owner-only-grants-owner) is the Skeptic LOW-12 mandated regression — admin attempting `role: 'owner'` MUST get 403 mapped to friendly EmptyState. Use existing identity-audit.e2e.spec.ts test scaffolding to bootstrap operator users with each role.

  </action>
  <verify>
    <automated>pnpm --filter @resto/api test:e2e identity-invitation</automated>
    <automated>pnpm --filter @resto/admin test invite-form-client</automated>
    <automated>pnpm --filter @resto/admin test invite-action</automated>
  </verify>
  <done>/dashboard/settings invite form ships (3 form elements per D-09); /accept-invitation/[id] route renders all 5 outcome branches as EmptyState or confirm; 8 e2e behaviors green; owner-only-grants-owner regression test pinned per Skeptic LOW-12; D-10 + D-11 + Pitfall 8 all enforced.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Real forgot/reset/signup wiring + carry-overs (forgot-password localhost fallback + login 3-call fan-out)</name>
  <read_first>
    - apps/admin/app/login/actions.ts (entire file — lines 36-74 the 3-call fan-out)
    - apps/admin/app/forgot-password/actions.ts (entire file — line 15 the antipattern)
    - apps/admin/app/reset-password/ (Phase 02 placeholder — may be EmptyState only)
    - apps/admin/app/signup/ (Phase 02 placeholder — may be EmptyState only)
    - apps/admin/lib/env.ts (adminOrigin() accessor — line 70 per RESEARCH.md)
    - .planning/phases/02-admin-shell/deferred-items.md (Phase 02 → Phase 03 carry-over surface — fix list)
    - .planning/phases/03-auth-completion/03-RESEARCH.md "Pitfall 4" (forgot-password localhost fallback ships to prod failure mode)
    - apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts (sendResetPassword now real, sendVerificationEmail now real per Plan 02 Task 3)
  </read_first>
  <behavior>
    - Test 1: forgot-password/actions.ts no longer contains the string "http://localhost:3001"; instead uses adminOrigin() from @/lib/env
    - Test 2: forgot-password form POST triggers BA /api/auth/request-password-reset; reset email arrives at adapter (verify via CapturedEmailAdapter under test) with URL pointing at adminOrigin() + /reset-password/<token>
    - Test 3: reset-password/[token]/page.tsx refines `?next=` query param against z.string().startsWith('/').refine(s => !/^\/[\\/]/.test(s)) per apps/CLAUDE.md open-redirect rule
    - Test 4: reset-password form POST triggers BA /api/auth/reset-password; success → existing sessions revoked + redirect to /login?reset=success
    - Test 5: signup/page.tsx (was placeholder) is now real form; submits to /v1/signup; on success → toast + redirect to /login (per RESEARCH.md Pattern 3 trade-off resolution — no more email-taken distinguishing message)
    - Test 6: login/actions.ts no longer has 3 sequential calls in lines 36-74; extracted into single helper apps/admin/lib/actions/sign-in-and-bind-org.ts
    - Test 7: sign-in-and-bind-org helper handles 401 path (apiFetch returns 401 → redirect to /login?expired=1) per apps/admin/lib/api-server.ts:186-188 baseline
    - Test 8: All cookies set in the modified actions.ts files (login, forgot-password, reset-password, signup if any cookies) carry `secure: process.env.NODE_ENV === 'production'`, `httpOnly: true`, `sameSite: 'lax'` — verified by grep (full sweep is Plan 04 Task 1, but flow files touched here must comply)
  </behavior>
  <action>
    In apps/admin/app/forgot-password/actions.ts replace the `process.env.ADMIN_WEB_URL ?? 'http://localhost:3001'` at line 15 with `import { adminOrigin } from '@/lib/env';` then `const origin = adminOrigin();` (carry-over closure per Pitfall 4). Wire the actual reset request: POST to apiFetch('/api/auth/request-password-reset', { method: 'POST', body: JSON.stringify({ email, redirectTo: `${origin}/reset-password` }) }). Display success message regardless of whether email exists (parity).

    In apps/admin/app/reset-password/[token]/page.tsx: real form (not EmptyState placeholder). RSC reads `params.token`, refines `?next=` query param per apps/CLAUDE.md. Client form posts to actions.ts which calls BA /api/auth/reset-password. Apply tooltip-quality copy from Phase 02 baseline. On success redirect to /login with `?reset=success` toast cue.

    In apps/admin/app/signup/page.tsx + actions.ts: replace placeholder with real form. Submits to /v1/signup. On success (which is now always 201 per Task 1 wrap) display generic toast "Check your email to verify your account" + redirect to /login. The admin UI no longer differentiates email-taken from new-signup per RESEARCH.md Pattern 3 trade-off.

    In apps/admin/app/login/actions.ts refactor lines 36-74: extract the signIn → setActiveOrganization → redirect sequence into a single helper at apps/admin/lib/actions/sign-in-and-bind-org.ts exporting `signInAndBindOrg(input: { email, password, next?: string }): Promise<{ ok: boolean; redirect?: string; error?: string }>`. Single try/catch around the BA sign-in + setActiveOrganization. Handle 401 from apiFetch by redirecting to /login?expired=1 per the api-server.ts:186-188 baseline. Use this helper from login/actions.ts; the actions.ts file shrinks to a thin wrapper.

    Verify all modified actions.ts files (login, forgot-password, reset-password, signup) — any `cookies().set(...)` calls MUST carry secure/httpOnly/sameSite. Full sweep is Plan 04 Task 1; this task only ensures the files touched here comply.

  </action>
  <verify>
    <automated>grep -c "http://localhost:3001" apps/admin/app/forgot-password/actions.ts</automated>
    <automated>grep -c "adminOrigin(" apps/admin/app/forgot-password/actions.ts</automated>
    <automated>pnpm --filter @resto/admin test forgot-password</automated>
    <automated>pnpm --filter @resto/admin test reset-password</automated>
    <automated>pnpm --filter @resto/admin test signup</automated>
    <automated>pnpm --filter @resto/admin test sign-in-and-bind-org</automated>
    <automated>pnpm --filter @resto/api test:e2e identity-password-reset</automated>
  </verify>
  <done>
    forgot-password/actions.ts:15 localhost fallback REMOVED (grep returns 0 on 'http://localhost:3001'); login/actions.ts no longer has the 3-call fan-out (lines 36-74 extracted to sign-in-and-bind-org.ts helper); reset-password and signup pages real (no longer EmptyState placeholders); all cookies in touched actions.ts files carry the secure/httpOnly/sameSite triad; e2e specs from Task 1 still green after the wiring.
  </done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                                                  | Description                                                                                  |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Browser → /v1/signup                                      | Untrusted input; enumeration channel risk                                                    |
| Browser → /api/auth/request-password-reset                | Untrusted; BA parity already correct, e2e proof                                              |
| Browser → /accept-invitation/[id]                         | Token-based; need email match + verification + open-redirect refinement on next=             |
| Server action → BA `/api/auth/organization/invite-member` | Trusted server-side; BA enforces owner-only-grants-owner                                     |
| Inviter → invitee (cross-account)                         | BA's `requireEmailVerificationOnInvitation:true` + email-match prevents takeover (Pitfall 8) |
| `?next=` query param → redirect                           | Open-redirect vector (apps/CLAUDE.md rule)                                                   |

## STRIDE Threat Register

| Threat ID | Category               | Component                                                             | Disposition | Mitigation Plan                                                                                                                                                                                               |
| --------- | ---------------------- | --------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-03-17   | Information Disclosure | /v1/signup enumeration via response divergence                        | mitigate    | executeOrTimeEqualize wraps EmailTakenError; identical 201 body; bcrypt time-equalize burn; Set-Cookie symmetry per Pitfall 1; D-06 timing parity e2e                                                         |
| T-03-18   | Information Disclosure | /api/auth/request-password-reset enumeration                          | mitigate    | BA built-in parity (verified); Phase 3 e2e proves it; rate-limit boundary timing parity also asserted (D-06 second clause)                                                                                    |
| T-03-19   | Elevation of Privilege | Admin promotes invitee to owner via crafted role                      | mitigate    | BA crud-invites.mjs:112 creatorRole enforcement; regression e2e admin → role='owner' returns 403 mapped to EmptyState (Skeptic LOW-12)                                                                        |
| T-03-20   | Spoofing               | Attacker signs up as victim's email, then accepts victim's invitation | mitigate    | requireEmailVerificationOnInvitation:true + REQUIRE_EMAIL_VERIFICATION=true (combined Pitfall 8 mitigation) — attacker's unverified account cannot accept                                                     |
| T-03-21   | Tampering              | next= or redirectTo= param weaponized for open redirect               | mitigate    | z.string().startsWith('/').refine(s => !/^\/[\\/]/.test(s)) on all next= params in reset-password + accept-invitation pages per apps/CLAUDE.md CR-01                                                          |
| T-03-22   | Repudiation            | Reset token reuse                                                     | mitigate    | BA findVerificationValue + deleteVerificationValue single-use semantics (verified)                                                                                                                            |
| T-03-23   | Information Disclosure | forgot-password localhost fallback ships to prod                      | mitigate    | Carry-over fix: actions.ts:15 migrated to adminOrigin() from @/lib/env; eager env validation throws in non-dev when ADMIN_WEB_URL missing (Pitfall 4 closed)                                                  |
| T-03-24   | Denial of Service      | Resend bounce → operator clicks Resend 3×                             | accept      | D-08 bounce-webhook handler DEFERRED beyond Phase 3 (planner decision documented in 03-CONTEXT.md final summary); operator-facing failure mode: no automatic UI flag for bounced emails until follow-up phase |
| T-03-25   | Tampering              | Existing session not revoked after password change                    | mitigate    | auth.config.ts:285-307 cascade hooks revoke sessions on reset-password completion (preserved; verified)                                                                                                       |
| T-03-26   | Information Disclosure | Sensitive endpoints accessed with unverified email                    | mitigate    | REQUIRE_EMAIL_VERIFICATION=true env + BA emailAndPassword.requireEmailVerification:true wired (AUTH-06); 403 surfaces via EmptyState                                                                          |

</threat_model>

<verification>
- pnpm --filter @resto/api test:e2e identity-invitation
- pnpm --filter @resto/api test:e2e identity-password-reset
- pnpm --filter @resto/api test:e2e identity-email-verification
- pnpm --filter @resto/api test:e2e signup-enumeration
- pnpm --filter @resto/admin test (full admin suite)
- grep -v '^#' apps/admin/app/forgot-password/actions.ts | grep -c "http://localhost:3001" returns 0
- grep -n "adminOrigin(" apps/admin/app/forgot-password/actions.ts returns at least 1 match
- ls apps/admin/lib/actions/sign-in-and-bind-org.ts exists
- ls apps/admin/app/accept-invitation/\[id\]/page.tsx exists
- ls apps/admin/app/dashboard/settings/invite-form-client.tsx exists
- grep -n "requireEmailVerification" apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts returns at least 1 match
</verification>

<success_criteria>

- AUTH-02/03 ROADMAP Success Criterion 1 satisfied: operator added to tenant receives invitation email; existing-account auto-attach works; role encoded in token and immutable; owner role gated by inviter tier with regression test
- AUTH-04/05 ROADMAP Success Criterion 2 satisfied: forgot-password sends reset email via wired adapter; reset-password sets new password and revokes sessions
- AUTH-06 ROADMAP Success Criterion 2 (second half) satisfied: signup triggers verification; REQUIRE_EMAIL_VERIFICATION blocks sensitive actions
- D-06 enumeration parity proven via e2e for both /v1/signup AND /api/auth/request-password-reset (BA built-in already correct; this plan adds the e2e proof)
- Phase 02 carry-overs CLOSED: forgot-password/actions.ts:15 localhost fallback gone; login/actions.ts:36-74 3-call fan-out refactored
- requireEmailVerificationOnInvitation:true wired (Pitfall 8) — Plan 02 prerequisite verified
- All open-redirect refinement on next= params per apps/CLAUDE.md
- D-08 Resend bounce-webhook DEFERRED beyond Phase 3 with documented operator-facing failure mode (planner discretion)
  </success_criteria>

<output>
Create `.planning/phases/03-auth-completion/03-03-SUMMARY.md` when done.
</output>
