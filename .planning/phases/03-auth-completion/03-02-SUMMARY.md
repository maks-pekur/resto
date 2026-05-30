---
phase: 03-auth-completion
plan: 02
subsystem: identity
tags: [email, resend, mailhog, better-auth, boot-guards, auth-01, phase-03]

# Dependency graph
requires:
  - phase: 03-auth-completion
    plan: 01
    provides: IdentityEmailDispatchFailedV1 contract (reason='resend_terminal_failure' branch), TEN-11 allowlist parity test scaffolding
  - phase: 01-tenancy-hardening
    provides: TEN-11 withoutTenant allowlist + parity ESLint overrides
provides:
  - EMAIL_ADAPTER_PORT (Symbol) + EmailAdapterPort (4-method interface + adapterName readonly)
  - Three concrete adapters wired by NODE_ENV factory (Resend / MailHog SMTP / in-memory Captured)
  - Resend retry-with-backoff (3 retries on 5xx/network, <6s total; 4xx incl. 429 terminal with WARN log)
  - Resend terminal-failure outbox emission (IdentityEmailDispatchFailedV1, reason='resend_terminal_failure') via db.withTenantId or db.withoutTenant (pre-org-bind path)
  - assertEmailAdapterWired 3-callback + structural-type + verifyTransport gate (D-13/D-15/D-17)
  - assertProdGuardrails extended for RESEND_API_KEY presence + dummy-literal rejection + adapter class name (D-01/Skeptic HIGH-2)
  - Boot-time integration test asserting prod misconfig is caught at module construction (D-14)
  - Plain-text EN+RU locale strings (3 emails × subject+body each) — D-02/D-03
  - getLocale(headers) — supports plain object + WHATWG Headers + Fastify array values
  - requireEmailVerificationOnInvitation: true on BA organization plugin (Pitfall 8)
  - TEN-11 allowlist registration for resend.adapter.ts (pre-org-bind verification branch)
affects:
  [
    03-03-flows,
    03-04-cookies-2fa,
    03-05-role-seed-hook-closure,
    all downstream AUTH-* waves needing operator email,
  ]

# Tech tracking
tech-stack:
  added:
    - 'resend@6.12.4 (verified via npm view — Resend SDK, no postinstall script)'
    - 'nodemailer@8.0.10 (verified — npm publisher, no postinstall script)'
    - '@types/nodemailer@8.0.0 (DefinitelyTyped)'
  patterns:
    - 'NODE_ENV-keyed factory pattern: createEmailAdapter(env, deps) switches on NODE_ENV; staging/prod requires RESEND_API_KEY; defense-in-depth alongside assertProdGuardrails'
    - 'Discriminated-union mock pattern for Resend SDK: explicit ResendSendResult / ResendDomainsResult union types in resend.adapter.ts; tests build mock arrays with stable type targets (avoids the inferred-union test-type stall the prior agent hit at 600s watchdog)'
    - 'Two-pass assertProdGuardrails: first pass env-only at top of main.ts (catches missing RESEND_API_KEY before adapter construction → clean ProdGuardrailsError, not opaque DI exception); second pass after app context build (adapterName check + verifyTransport ping)'
    - 'BA send-callback wrapper pattern: each of the 3 callbacks resolves locale from request?.headers via getLocale, resolves tenantId from BA data payload, constructs URL, delegates to adapter; module-level assertion catches missing callback BEFORE BA boot'
    - 'TEN-11 allowlist triad for resend.adapter.ts: (1) entry in withoutTenant.allowlist.ts, (2) @withoutTenant-allowlist override block updated in apps/api/eslint.config.mjs, (3) parity test length bumped 9→10'

key-files:
  created:
    - apps/api/src/contexts/identity/infrastructure/email/captured.adapter.ts
    - apps/api/src/contexts/identity/infrastructure/email/mailhog-smtp.adapter.ts
    - apps/api/src/contexts/identity/infrastructure/email/resend.adapter.ts
    - apps/api/src/contexts/identity/infrastructure/email/email-adapter.factory.ts
    - apps/api/test/unit/identity/captured-email-adapter.spec.ts
    - apps/api/test/unit/identity/mailhog-smtp-adapter.spec.ts
    - apps/api/test/unit/identity/resend-email-adapter.spec.ts
    - apps/api/test/unit/identity/email-adapter-factory.spec.ts
    - apps/api/test/unit/identity/identity-boot-integration.spec.ts
  modified:
    - apps/api/src/contexts/identity/identity-core.module.ts
    - apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts
    - apps/api/src/config/prod-guardrails.ts
    - apps/api/src/main.ts
    - apps/api/test/unit/identity/email-adapter-gate.spec.ts
    - apps/api/test/unit/identity/build-auth-from-env.spec.ts
    - apps/api/test/unit/prod-guardrails.spec.ts
    - apps/api/eslint.config.mjs
    - packages/db/src/withoutTenant.allowlist.ts
    - packages/db/test/unit/withoutTenant-allowlist.spec.ts

key-decisions:
  - 'Discriminated-union mock pattern (ResendSendResult, ResendDomainsResult) — explicit union types declared in resend.adapter.ts as exported types; tests reference them when building mock responses. This was the root-cause fix for the prior-agent stall: TypeScript could not narrow a union inferred from a heterogeneous array literal, so explicit types break the inference cycle.'
  - 'D-13 NOOP removal uses conditional spread (`...(opts.sendResetPassword ? { sendResetPassword: opts.sendResetPassword } : {})`) rather than direct assignment. Reason: BA exact-optional-property-types semantics — `{ sendResetPassword: undefined }` is NOT equivalent to `{}` for BA at runtime; the former bypasses BA validation, the latter triggers it.'
  - 'assertEmailAdapterWired is async (returns Promise) — async needed for verifyTransport ping (D-15). The module factory call invokes the SYNCHRONOUS slice via `void assertEmailAdapterWired(...)` (callback check only, no adapter arg); the BOOT-time slice with adapter+verifyTransport is invoked from main.ts where await is available. Test fixtures use `await expect(...).rejects/.resolves`.'
  - 'Two-pass assertProdGuardrails — first pass env-only is intentional. If we only ran the extended pass after app.get(), the operator would see a NestJS DI exception ("Cannot resolve provider EMAIL_ADAPTER_PORT") instead of "RESEND_API_KEY is required". Defense-in-depth: factory ALSO throws if dummy literal reaches it.'
  - 'Resend tier ASSUMED 100/day + 3000/month per researcher A3 — operator MUST confirm at https://resend.com/pricing before staging deploy. Tier log line ships at boot via verifyTransport success path; if real values differ, update DUMMY_RESEND_API_KEY_LITERAL comment + verifyTransport log values.'

# Deferred items
deferred:
  - item: 'DNS posture (SPF + DKIM + DMARC at Cloudflare) for resto.app'
    why: 'Per Task 0 checkpoint resolution (c): runbook step before staging deploy. Plan 05 Task 3 (D-07 checklist) covers this.'
    failure-mode: 'Without DNS, Gmail will dmarc=fail and silently drop operator emails. Reproduces on first invitation in staging.'
    re-evaluate: 'Before first staging deploy. Plan 05 Task 3 is the natural place.'
  - item: 'D-08 Resend bounce-webhook handler + invitation.delivery_status column + UI flag'
    why: 'Planner-discretion deferral per Task 0 checkpoint resolution. Solo-throughput is the binding constraint; bounce visibility is a polish loop rather than MVP-1 gating.'
    failure-mode: 'If invitation/reset email bounces, operator sees no UI flag and may click "Resend" several times. Manual founder intervention via Resend dashboard.'
    re-evaluate: 'First paying customer reports bounce issue, OR Phase 17 TEAM-02 (pending-invitations table — natural place for delivery_status + UI).'

requirements-completed: [AUTH-01]

# Metrics
duration: ~45 min (Task 0 + Task 1 in prior wave; Tasks 2/3/4 in this recovery wave = ~25 min)
completed: 2026-05-30
---

# Phase 3 Plan 02: Email Adapter Wiring (AUTH-01) Summary

**Three-environment EmailAdapterPort now drives BA's three send-callbacks (sendInvitationEmail / sendResetPassword / sendVerificationEmail), the NOOP `?? (() => Promise.resolve())` defaults at auth.config.ts:137/142/152 are gone, assertEmailAdapterWired checks all 3 callbacks + verifies transport at boot in staging/prod, assertProdGuardrails rejects empty + dummy RESEND_API_KEY + wrong adapter class, Resend retries 3× with jittered backoff and emits identity.email_dispatch_failed.v1 onto the outbox on terminal failure, and a D-14 boot-integration test proves prod misconfig is caught at MODULE construction not at first BA endpoint hit.**

## What shipped

- **Three adapters** (`captured.adapter.ts`, `mailhog-smtp.adapter.ts`, `resend.adapter.ts`) — each implements the 4-method `EmailAdapterPort` interface plus a `readonly adapterName` literal. Captured (in-memory queue, test-only) is the simplest; MailHog uses `nodemailer.createTransport` with `ignoreTLS: true` against `:1025`; Resend wraps the SDK with the full D-05 retry + outbox emission contract.
- **NODE_ENV-keyed factory** (`email-adapter.factory.ts`) — dispatches on `env.NODE_ENV`: development → MailHog, test → Captured, staging/production → Resend. Throws `EmailAdapterFactoryError` synchronously when staging/production is missing RESEND_API_KEY or carries the documented dummy literal (defense-in-depth alongside `assertProdGuardrails`).
- **NestJS provider for EMAIL_ADAPTER_PORT** in `identity-core.module.ts` — `{ inject: [ENV_TOKEN, TenantAwareDb], useFactory: createEmailAdapter }`. Exported from the module so the BA `buildAuth` factory and the bootstrap CLI both see the same instance.
- **BA callback wrappers** in `buildAuthFromEnv` — each of the 3 callbacks (`sendInvitationEmail`, `sendResetPassword`, `sendVerificationEmail`) resolves `locale` from `request?.headers` via `getLocale`, resolves `tenantId` from BA data payload (`data.organization.id` for invitations; `data.user.activeOrganization?.id` for reset-password per plan-checker W-1; `undefined` for verification on signup pre-org-bind), constructs the URL, and delegates to the adapter.
- **NOOP defaults removed** at `auth.config.ts:137/142/152` — replaced with conditional spread `...(opts.X ? { X: opts.X } : {})` so BA gets a real callback in staging/prod (the assertion catches missing) and gets `{}` in dev (BA's own runtime check applies).
- **`requireEmailVerificationOnInvitation: true`** added to the BA organization plugin per Pitfall 8 — defends against an attacker inviting a mailbox they don't own and accepting from a fresh unverified account.
- **`assertEmailAdapterWired` extended** to 3 callbacks (REQUIRED_EMAIL_CALLBACKS) + structural-type check on the adapter's 3 send methods + `verifyTransport()` ping in staging/production only. Now async — main.ts awaits the boot-time pass.
- **`assertProdGuardrails` extended** for RESEND_API_KEY (rejects empty + whitespace-only + the documented dummy literal in staging/production) + optional `emailAdapterName` parameter (rejects non-'resend' in staging/production).
- **main.ts two-pass guardrails**: first call BEFORE NestJS factory (env-only check) so a missing RESEND_API_KEY surfaces as a clean ProdGuardrailsError instead of a DI exception; second call AFTER `app.get<EmailAdapterPort>(EMAIL_ADAPTER_PORT)` with `emailAdapterName` populated; then `assertEmailAdapterWired` awaits verifyTransport.
- **Resend terminal-failure emission** — on 4xx (incl. 429 with WARN log) OR 5xx-after-3-retries OR network-error-after-3-retries, builds `IdentityEmailDispatchFailedV1` envelope (reason='resend_terminal_failure', errorMessage truncated to 2048 chars, userId+tenantId when known) and appends via `db.withTenantId(tenantId, ...)` when bound or `db.withoutTenant('email dispatch failure — no tenant context (BA pre-org-bind path)', ...)` for the verification-on-signup branch. Then rethrows so BA logs the failure.
- **D-14 boot-integration test** (`identity-boot-integration.spec.ts`) — 9 scenarios proving the misconfig family is caught at module construction: `staging without RESEND_API_KEY → assertProdGuardrails throws`, `production with dummy literal → throws`, `factory ALSO throws (defense-in-depth)`, `main.ts boot order produces ProdGuardrailsError not DI exception`, plus the three happy-path scenarios.
- **TEN-11 allowlist triad updated** for `resend.adapter.ts` — entry in `withoutTenant.allowlist.ts` (10th entry), matching block in `apps/api/eslint.config.mjs` `@withoutTenant-allowlist` override, parity test bumped 9 → 10. Inline `/* eslint-disable no-restricted-syntax */` at the top of resend.adapter.ts justifying the `db.withoutTenant` call site.

## How it ties together

```
loadEnv → assertProdGuardrails(env)          ← first pass: env-only
                ↓ pass
NestFactory.create(AppModule)
   ↓ provider wiring
   IdentityCoreModule.emailAdapterProvider
        useFactory: createEmailAdapter(env, { db })
              ↓ NODE_ENV switch
              prod → new ResendEmailAdapter(new Resend(key), env, db)
              dev  → new MailhogSmtpAdapter(env)
              test → new CapturedEmailAdapter()
                ↓
   IdentityCoreModule.authProvider
        useFactory: buildAuthFromEnv(authDb, env, emitter, emailAdapter)
              ↓ wraps adapter into 3 BA callbacks via buildBaCallbacks
              ↓ kicks off (sync, void) assertEmailAdapterWired callback check
              ↓ buildAuth({ ...callbacks, requireEmailVerificationOnInvitation: true })
        ← Auth instance
   ↓
app.get(EMAIL_ADAPTER_PORT) → assertProdGuardrails(env, { emailAdapterName })  ← second pass
                            → await assertEmailAdapterWired(env.NODE_ENV, callbacks, emailAdapter)
                                ↓ in staging/prod: await emailAdapter.verifyTransport()
                                  ↓ Resend.domains.list() → 200 → log tier
                                  ↓ Resend 401 → throw at boot
app.listen(...)
```

## Tests

- 79 tests across 7 spec files added/updated:
  - `captured-email-adapter.spec.ts` (7) — push/clear/getCaptured snapshot semantics + no-op verifyTransport.
  - `mailhog-smtp-adapter.spec.ts` (8) — placeholder substitution (EN+RU), createTransport opts, verifyTransport delegation + error propagation.
  - `resend-email-adapter.spec.ts` (13) — happy path, retry-on-5xx-succeeds, exhausted-retries-on-5xx, 429 terminal, 4xx terminal, <6s total elapsed, sendResetPassword/sendVerification with tenantId-known + tenantId-undefined branches, idempotencyKey scoping, network-error path, verifyTransport ping.
  - `email-adapter-factory.spec.ts` (10) — every NODE_ENV branch including dummy-literal rejection and isResendEmailAdapter type-guard.
  - `email-adapter-gate.spec.ts` (13, REWRITTEN) — D-13 3-callback enforcement, D-15 verifyTransport ping, D-17 structural-type check.
  - `build-auth-from-env.spec.ts` (3, UPDATED) — new emailAdapter arg, forwarded callback assertions.
  - `prod-guardrails.spec.ts` (21, EXTENDED with 10 new D-01/Skeptic HIGH-2 cases) — RESEND_API_KEY presence/dummy/whitespace; adapterName=mailhog-smtp/captured rejection in staging/prod.
  - `identity-boot-integration.spec.ts` (9 NEW, D-14 regression) — proves prod misconfig is caught at module construction.

- Full `apps/api` unit suite: **52 files, 379 tests, all passing** (no regressions from BA config / module rewrites).
- `packages/db` unit suite: **4 files, 50 tests, all passing** (allowlist parity + cli-reset guards still green).

## Deviations from plan

### Auto-fixed (Rules 1/2/3 — no permission needed)

- **[Rule 3 — Blocking issue] Conditional-spread vs direct assignment for BA callbacks** — original plan said remove the NOOPs and pass `opts.sendResetPassword` directly. With BA's `exactOptionalPropertyTypes` semantics that emits `{ sendResetPassword: undefined }` which BA treats differently from `{}`. Switched to `...(opts.sendResetPassword ? { sendResetPassword: opts.sendResetPassword } : {})`. Behavior matches plan intent (no NOOP closure ever passed to BA in dev).
- **[Rule 3 — Test type stall avoidance] Discriminated-union mock pattern** — exported `ResendSendResult` and `ResendDomainsResult` as discriminated unions from `resend.adapter.ts`. Tests reference these types directly when building mock responses, avoiding the TypeScript inference cycle that stalled the prior agent at the 600s watchdog. The explicit `mockClient` factory signature noted in `<execution_recovery_context>` was implemented as `buildMockClient(responses: ResendSendResult[])` returning `{ client, sendSpy, domainsListSpy }`.
- **[Rule 2 — Critical functionality] Pre-existing allowlist parity test updated** — `packages/db/test/unit/withoutTenant-allowlist.spec.ts` hard-coded `expect(WITHOUT_TENANT_ALLOWLIST).toHaveLength(9)`. Bumped to 10 with comment referencing Plan 03-02. Without this the parity test would have failed at the first attempt to commit, blocking the wave.

### Escalations (Rule 4) — none required

### Auth gates — none (no manual human-action required during execution; Task 0 checkpoint resolved before this wave started)

## Threat-flag scan

| Flag                            | File                                                                                        | Description                                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| threat_flag: external-IO        | `apps/api/src/contexts/identity/infrastructure/email/resend.adapter.ts`                     | New HTTPS egress to api.resend.com. Mitigated by `AbortSignal.timeout(5500)`, 3-retry budget <6s, terminal failure auditable via outbox. Plan threat register T-03-11 (DoS via 429) addressed. |
| threat_flag: pre-org-bind-write | `apps/api/src/contexts/identity/infrastructure/email/resend.adapter.ts` (verification flow) | New `db.withoutTenant(...)` call site. Allowlisted (TEN-11) + ESLint-overridden + parity-test-verified. Reason string explicit.                                                                |

## Recovery note (transparency)

This wave is a continuation of a stall. The prior agent (`aa1052ea4d4995d03`) reached the 600-second watchdog while iterating on a TypeScript-test-type issue: heterogeneous-array inference of the Resend SDK's discriminated `Response<T>` union. Two clean commits (`9327a7e` deps install + `a4df74f` port/locale/envs/strings) were cherry-picked onto main by the orchestrator; the 3 adapter implementations + their tests + ESLint mod + allowlist mod were uncommitted at stall time and were lost in worktree cleanup.

This continuation agent re-implemented the lost work in three commits (`3d11df9` adapters + tests + allowlist, `c113cae` factory + module rewrite + NOOP removal, `3a067ac` prod-guardrails + boot integration), avoiding the original stall by declaring `ResendSendResult` and `ResendDomainsResult` as exported discriminated-union types FIRST and building mock responses against those types — the prior agent was trying to coax TypeScript into inferring the union from a heterogeneous literal array, which never succeeds under strict mode. Total recovery time: ~25 minutes from base commit `a4df74f` to this SUMMARY.

## Resend free-tier (per Skeptic MED-10 visibility recommendation)

- **Researcher A3 ASSUMED:** 100/day + 3000/month free tier — these are the values baked into the verifyTransport startup log.
- **Operator action required before staging deploy:** confirm at https://resend.com/pricing. If actual values differ, update the log line in `resend.adapter.ts:228` (the `this.#logger.log({ tier: 'free', dailyLimit: 100, monthlyLimit: 3000 }, ...)` call).
- **Upgrade-threshold runbook line (Claude's-Discretion-item-5):** when the at-startup tier log shows free tier AND the operator dashboard shows monthly sends > 2700, schedule a paid-tier upgrade conversation. The 429 WARN log in `#sendWithRetry` is the leading indicator.

## Package legitimacy audit (per Task 0 checkpoint)

- `resend@6.12.4` — verified via inspection of `node_modules/.pnpm/resend@6.12.4/node_modules/resend/package.json` and the public TypeScript declarations at `dist/index.d.mts`. SDK shape matches `new Resend(key).emails.send({...})` and `.domains.list()`. No postinstall script. Already installed by Wave 1 commit `9327a7e`.
- `nodemailer@8.0.10` — verified via `@types/nodemailer@8.0.0` types resolving cleanly in `apps/api/tsconfig.json`. No postinstall script. Already installed by `9327a7e`.

## Plan verification grep targets

The plan's `<verification>` section calls out 7 greps. All but one pass cleanly:

- `pnpm --filter @resto/api typecheck` → **PASS** (nx cache hit; underlying `tsc -p tsconfig.json --noEmit` returns 0)
- `pnpm --filter @resto/api test` → **PASS** (52 files / 379 tests, no regressions)
- `grep -c "?? (() => Promise.resolve())" auth.config.ts` → **returns 1 — but the match is a COMMENT referencing the removed pattern, not actual code**. Live BA callback wiring is `...(opts.X ? { X: opts.X } : {})`. Substring grep is a false positive against the comment. `grep -n` confirms only line 137 (the doc-comment) matches.
- `grep -n "REQUIRED_EMAIL_CALLBACKS" identity-core.module.ts` → **PASS** (3 matches; constant has all 3 callbacks)
- `grep -n "RESEND_API_KEY" prod-guardrails.ts` → **PASS** (8 matches)
- `grep -n "runInTenantContext" apps/api/src/contexts/identity/infrastructure/email/` → **PASS** (2 matches; both are doc-comments saying "NEVER call runInTenantContext" — zero actual call sites, plan intent satisfied)
- `grep -n "requireEmailVerificationOnInvitation" auth.config.ts` → **PASS** (1 match; set to `true` on the organization plugin)

## Commits

- `9327a7e` chore(03-02): add resend + nodemailer runtime deps + types — **prior wave** (cherry-picked by orchestrator)
- `a4df74f` feat(03-02): add EMAIL_ADAPTER_PORT + locale helper + 6 email envs — **prior wave** (cherry-picked)
- `3d11df9` feat(03-02): add 3 email adapters (Resend retry+outbox, MailHog SMTP, Captured) + allowlist — **this wave**
- `c113cae` feat(03-02): wire EMAIL_ADAPTER_PORT factory + BA callbacks + remove NOOP defaults (D-13) — **this wave**
- `3a067ac` feat(03-02): extend assertProdGuardrails for Resend + boot verifyTransport ping (D-01/14/15) — **this wave**

## Self-Check: PASSED

All 9 files claimed under `key-files.created` exist on disk and all 5 commits (`9327a7e`, `a4df74f`, `3d11df9`, `c113cae`, `3a067ac`) are reachable from HEAD.
