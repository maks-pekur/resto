---
phase: 03-auth-completion
plan: 02
type: execute
wave: 2
depends_on: ['03-01']
files_modified:
  - apps/api/package.json
  - apps/api/src/contexts/identity/domain/ports.ts
  - apps/api/src/contexts/identity/domain/email-locale.ts
  - apps/api/src/contexts/identity/infrastructure/email/resend.adapter.ts
  - apps/api/src/contexts/identity/infrastructure/email/mailhog-smtp.adapter.ts
  - apps/api/src/contexts/identity/infrastructure/email/captured.adapter.ts
  - apps/api/src/contexts/identity/infrastructure/email/get-locale.ts
  - apps/api/src/contexts/identity/infrastructure/email/email-strings.en.ts
  - apps/api/src/contexts/identity/infrastructure/email/email-strings.ru.ts
  - apps/api/src/contexts/identity/infrastructure/email/email-adapter.factory.ts
  - apps/api/src/contexts/identity/identity-core.module.ts
  - apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts
  - apps/api/src/config/env.schema.ts
  - apps/api/src/config/prod-guardrails.ts
  - apps/api/test/identity-core.module.spec.ts
  - apps/api/test/resend.adapter.spec.ts
  - apps/api/test/prod-guardrails.spec.ts
  - .env.example
# contains checkpoint:human-verify for package legitimacy + Resend free-tier confirmation
autonomous: false
requirements:
  - AUTH-01
user_setup:
  - service: resend
    why: 'Production/staging email transport (D-01)'
    env_vars:
      - name: RESEND_API_KEY
        source: 'Resend Dashboard → API Keys → Create API Key'
      - name: RESEND_FROM
        source: "Verified sender format: 'RestOS <noreply@resto.app>'"
      - name: RESEND_REPLY_TO
        source: 'support@resto.app (must be deliverable mailbox)'
    dashboard_config:
      - task: 'Verify resto.app sender domain in Resend'
        location: 'Resend Dashboard → Domains → Add Domain → Verify DKIM'
      - task: 'Confirm current free-tier daily + monthly send limits'
        location: 'https://resend.com/pricing (researcher A3 in 03-RESEARCH.md is ASSUMED 100/day + 3000/month)'
goal: |
  Wire the three-environment email adapter port (Resend / MailHog SMTP /
  in-memory Captured) into Better Auth's three send callbacks
  (sendInvitationEmail / sendResetPassword / sendVerificationEmail), close
  the assertEmailAdapterWired false-positive (currently 1-of-3 callbacks
  checked) per Skeptic HIGH-1, remove the NOOP `?? (() => Promise.resolve())`
  defaults at auth.config.ts:137,152 per D-13, extend assertProdGuardrails
  for RESEND_API_KEY + adapter-class-name + verifyTransport() ping per
  D-01/D-15, add the IdentityEmailDispatchFailed → outbox terminal-failure
  branch per D-05, and define the EN+RU locale strings per D-03.
tags:
  - email
  - resend
  - mailhog
  - better-auth
  - boot-guards
  - phase-03

must_haves:
  truths:
    - 'Three concrete email adapters exist (Resend, MailHog SMTP, in-memory Captured) implementing EMAIL_ADAPTER_PORT'
    - 'assertEmailAdapterWired throws at boot in staging/production if ANY of sendInvitationEmail, sendResetPassword, sendVerificationEmail is missing'
    - 'auth.config.ts no longer contains `?? (() => Promise.resolve())` defaults at lines 137 and 152'
    - 'assertProdGuardrails rejects boot in staging/production when RESEND_API_KEY is empty OR wired adapter class != ResendEmailAdapter'
    - "Resend adapter retries 3× with jittered backoff (250→1000→4000ms, <6s total) on transient 5xx and emits identity.email_dispatch_failed.v1 (reason: 'resend_terminal_failure') through outbox on terminal failure"
    - 'verifyTransport() is called at boot for the wired adapter (Resend: GET /domains; MailHog: SMTP STARTTLS; Captured: no-op)'
    - "getLocale(headers) helper returns 'en' or 'ru' from Accept-Language; fallback 'en'"
    - 'Email adapter receives tenantId as explicit constructor or call argument; failure-emission uses db.withTenantId — never runInTenantContext'
  artifacts:
    - path: 'apps/api/src/contexts/identity/domain/ports.ts'
      provides: 'EMAIL_ADAPTER_PORT Symbol + EmailAdapterPort interface'
      contains: 'EMAIL_ADAPTER_PORT'
    - path: 'apps/api/src/contexts/identity/infrastructure/email/resend.adapter.ts'
      provides: 'ResendEmailAdapter with retry-with-backoff + verifyTransport + tenantId binding'
      min_lines: 80
    - path: 'apps/api/src/contexts/identity/infrastructure/email/mailhog-smtp.adapter.ts'
      provides: 'MailhogSmtpAdapter via nodemailer createTransport'
    - path: 'apps/api/src/contexts/identity/infrastructure/email/captured.adapter.ts'
      provides: 'CapturedEmailAdapter for test deterministic assertions'
    - path: 'apps/api/src/config/prod-guardrails.ts'
      provides: 'assertProdGuardrails extended for RESEND_API_KEY + adapter class + verifyTransport ping'
      contains: 'RESEND_API_KEY'
  key_links:
    - from: 'apps/api/src/contexts/identity/identity-core.module.ts'
      to: 'EMAIL_ADAPTER_PORT'
      via: 'factory provider keyed on NODE_ENV'
      pattern: 'EMAIL_ADAPTER_PORT'
    - from: 'apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts'
      to: 'EmailAdapterPort.sendInvitation/sendResetPassword/sendVerification'
      via: 'BA send callbacks delegate to injected adapter'
      pattern: 'sendInvitationEmail|sendResetPassword|sendVerificationEmail'
    - from: 'apps/api/src/contexts/identity/infrastructure/email/resend.adapter.ts'
      to: 'identity.email_dispatch_failed.v1 outbox emission'
      via: "buildEnvelope on terminal failure (reason='resend_terminal_failure')"
      pattern: "identity\\.email_dispatch_failed\\.v1"
---

<objective>
Build the email transport foundation that AUTH-02..06 depend on. Today
auth.config.ts:137,152 silently default sendResetPassword and
sendInvitationEmail to NOOP closures, and identity-core.module.ts:28 only
checks sendVerificationEmail. Result: a prod deploy missing email config
boots happily, operator clicks Resend, nothing arrives, no log. Skeptic
HIGH-1 + CTO HIGH-2 converge on this as the most dangerous false-positive in
the codebase.

Purpose: deliver the EMAIL_ADAPTER_PORT (Symbol + interface), the three
concrete adapters (Resend SDK + retry-with-backoff per D-05; nodemailer SMTP
for MailHog dev path; in-memory Captured for deterministic tests), the
NODE_ENV-keyed factory at composition root, the verifyTransport() boot
ping per D-15, the extended assertEmailAdapterWired three-callback check
per D-13, the assertProdGuardrails Resend assertion per D-01, the boot
integration test per D-14, the EN+RU locale strings per D-03, and the
terminal-failure outbox emission per D-05. The contract
IdentityEmailDispatchFailedV1 shipped in Plan 01 is reused here with
reason='resend_terminal_failure'.

Output: a working email send path on all three environments, with
production-readiness gates that fail boot loudly on misconfiguration, and
unit + integration tests proving the gates fire.
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
@packages/events/CLAUDE.md
@apps/CLAUDE.md
@apps/api/src/contexts/identity/identity-core.module.ts
@apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts
@apps/api/src/config/env.schema.ts
@apps/api/src/config/prod-guardrails.ts
@apps/api/src/contexts/identity/infrastructure/identity-event-emitter.adapter.ts

<interfaces>
<!-- Contracts the executor needs. Extracted from RESEARCH.md + codebase verification. -->

EMAIL_ADAPTER_PORT (new — define in domain/ports.ts):
export const EMAIL_ADAPTER_PORT = Symbol('EMAIL_ADAPTER_PORT');
export interface EmailAdapterPort {
sendInvitation(input: { to: string; locale: 'en'|'ru'; url: string; tenantSlug: string; inviterName: string; tenantId: TenantId }): Promise<void>;
sendResetPassword(input: { to: string; locale: 'en'|'ru'; url: string; userId: string; tenantId?: TenantId }): Promise<void>;
sendVerification(input: { to: string; locale: 'en'|'ru'; url: string; userId: string; tenantId?: TenantId }): Promise<void>;
verifyTransport(): Promise<void>; // boot ping; throws on failure (D-15)
readonly adapterName: 'resend' | 'mailhog-smtp' | 'captured'; // for assertProdGuardrails assertion
}

BA send callback signatures (verified RESEARCH.md Pattern 1 — node_modules/better-auth@1.4.22):
sendInvitationEmail(data: { id, role, email, organization, invitation, inviter }, request?: Request)
sendResetPassword(data: { user, url, token }, request?: Request)
sendVerificationEmail(data: { user, url, token }, request?: Request)
All three receive a request? param — extract Accept-Language via getLocale(request?.headers).
tenantId for sendInvitation comes from data.organization.id (cast to TenantId).
tenantId for sendResetPassword + sendVerification: prefer `data.user.activeOrganization?.id` (cast to TenantId) — falls back to undefined only when truly absent (e.g., verification email on signup pre-org-bind). Plan-checker W-1 2026-05-30 tightened: do not default to undefined when the field is populated by BA.

D-17 (tenant binding rule, ADR-0020 I-6):
Adapter NEVER calls runInTenantContext; failure emission uses db.withTenantId(tenantId, ...). When tenantId is undefined (verification email pre-org-bind), use db.withoutTenant('email dispatch failure — no tenant context (BA pre-org-bind path)') for outbox append.

D-05 retry contract (Resend adapter only):
attempts: [0ms, 250ms+jitter, 1000ms+jitter, 4000ms+jitter] — total budget < 6s
AbortSignal.timeout(5500) per apps/CLAUDE.md "Server-side fetch must have AbortSignal.timeout"
Treat 5xx and network as retryable; 4xx as terminal (including 429 rate-limit — surface as terminal with WARN log per Claude's-Discretion-item-5 visibility recommendation)

D-13 (REQUIRED_EMAIL_CALLBACKS extension):
Current at identity-core.module.ts:28 — `const REQUIRED_EMAIL_CALLBACKS = ['sendVerificationEmail'] as const;`
EXTEND to `['sendVerificationEmail', 'sendResetPassword', 'sendInvitationEmail'] as const;`

D-13 (NOOP default removal):
At auth.config.ts:137 — `sendResetPassword: opts.sendResetPassword ?? (() => Promise.resolve()),` → remove the `??` fallback; if opts.sendResetPassword is undefined, pass undefined (BA will throw if not wired) — assertEmailAdapterWired catches this at module construction BEFORE BA boot
At auth.config.ts:142 — `sendVerificationEmail: opts.sendVerificationEmail ?? (() => Promise.resolve()),` → same removal
At auth.config.ts:152 — `sendInvitationEmail: opts.sendInvitationEmail ?? (() => Promise.resolve()),` → same removal

env.schema.ts additions (D-01):
RESEND_API_KEY: z.string().min(1).optional() // required only in staging/production via assertProdGuardrails
RESEND_FROM: z.string().min(1).default('RestOS <noreply@resto.app>')
RESEND_REPLY_TO: z.string().email().default('support@resto.app')
MAILHOG_HOST: z.string().min(1).default('localhost')
MAILHOG_PORT: z.coerce.number().int().positive().default(1025)
RATE_LIMIT_AUTH_SIGNIN_PER_TENANT_PER_MIN: z.coerce.number().int().positive().default(60) // D-20 — env in this plan even though enforcement lands in Plan 03

IdentityEmailDispatchFailedV1 (from Plan 01):
reason: 'resend_terminal_failure' for D-05 terminal path; reason: 'dlq_routed' for NATS poison branch
Reuse the same contract — single audit row family for both flows
</interfaces>
</context>

<tasks>

<task type="checkpoint:human-verify" gate="blocking-human">
  <name>Task 0: Package legitimacy + Resend free-tier confirmation (gate before install)</name>
  <what-built>This is a pre-install verification step. Nothing has been built yet. Per 03-RESEARCH.md "Package Legitimacy Audit" section, the slopcheck CLI was unavailable so `resend` and `nodemailer` are tagged [ASSUMED]. Per package-legitimacy gate rules, legitimacy checkpoints are never auto-approvable.</what-built>
  <how-to-verify>
    1. Run `npm view resend version` — confirm 4.x latest.
    2. Run `npm view resend repository.url` — confirm `git+https://github.com/resend/resend-node.git` or similar `github.com/resend*` authoritative source.
    3. Run `npm view resend scripts.postinstall` — confirm empty / undefined (no install-time scripts).
    4. Visit https://npmjs.com/package/resend in browser — confirm weekly downloads in 10k+ range AND publisher is Resend organization.
    5. Run `npm view nodemailer version` — confirm 6.x latest.
    6. Run `npm view nodemailer repository.url` — confirm `git+https://github.com/nodemailer/nodemailer.git` authoritative source.
    7. Run `npm view nodemailer scripts.postinstall` — confirm empty / undefined.
    8. Visit https://npmjs.com/package/nodemailer — confirm weekly downloads in 1M+ range.
    9. Run `npm view @types/nodemailer version` — confirm 6.x latest; @types packages auto-publisher is DefinitelyTyped, no postinstall expected.
    10. Visit https://resend.com/pricing — RECORD the current free-tier daily + monthly send limits in 03-02-SUMMARY.md (researcher A3 ASSUMED 100/day + 3000/month — confirm or update). These numbers determine the at-startup tier log and the upgrade-threshold runbook line per Claude's-Discretion-item-5.
  </how-to-verify>
  <resume-signal>Type "approved" with the recorded version numbers and Resend free-tier limits, OR describe what failed (e.g., postinstall script present → STOP and choose alternative). On approval, executor proceeds to Task 1.</resume-signal>
</task>

<task type="auto" tdd="true">
  <name>Task 1: Install packages + env schema + EMAIL_ADAPTER_PORT contracts + locale helpers</name>
  <read_first>
    - apps/api/src/contexts/identity/domain/ports.ts (existing port Symbol + interface pattern — match shape)
    - apps/api/src/config/env.schema.ts:160-185 (existing rate-limit + REQUIRE_EMAIL_VERIFICATION envs — append new envs here)
    - .env.example (root) — add new envs in same order
    - apps/api/src/contexts/identity/infrastructure/identity-event-emitter.adapter.ts (D-17 proven pattern for db.withTenantId outside HTTP middleware)
    - .planning/phases/03-auth-completion/03-RESEARCH.md "Pattern 1: BA email callback signature" (data shape per BA 1.4.22 verified locally)
  </read_first>
  <behavior>
    - Test 1: getLocale({}) returns 'en' (default fallback)
    - Test 2: getLocale({ 'accept-language': 'ru-RU,ru;q=0.9' }) returns 'ru'
    - Test 3: getLocale({ 'accept-language': 'en-US,en;q=0.9' }) returns 'en'
    - Test 4: getLocale({ 'accept-language': 'fr-FR' }) returns 'en' (unsupported locale → fallback per D-03)
    - Test 5: getLocale(undefined) returns 'en' (no headers — for non-HTTP code paths)
    - Test 6: EMAIL_ADAPTER_PORT Symbol is exported; EmailAdapterPort interface has the 4 methods + adapterName readonly per interfaces block
    - Test 7: env.schema.ts parse() of valid env yields RESEND_API_KEY (optional), RESEND_FROM (with default), MAILHOG_HOST/PORT (with defaults), RATE_LIMIT_AUTH_SIGNIN_PER_TENANT_PER_MIN=60 default
  </behavior>
  <action>
    Per D-01: run `pnpm --filter @resto/api add resend nodemailer` and `pnpm --filter @resto/api add -D @types/nodemailer` — use versions verified in Task 0. Per D-03: create apps/api/src/contexts/identity/domain/email-locale.ts exporting `type EmailLocale = 'en' | 'ru';` and `const SUPPORTED_LOCALES: readonly EmailLocale[] = ['en', 'ru'] as const;`. Create apps/api/src/contexts/identity/infrastructure/email/get-locale.ts exporting getLocale(headers?: Record<string,string|undefined|string[]> | Headers | undefined): EmailLocale — parse the Accept-Language header (split by `,`, take first segment, strip quality, lowercase, take 2-char primary subtag), match against SUPPORTED_LOCALES, fallback 'en'. Handle Headers instance AND plain object AND undefined. Create email-strings.en.ts and email-strings.ru.ts each exporting 6 string constants (3 emails × subject+body) — copy/edit text from BA defaults: invitationSubject, invitationBody (uses {{inviterName}} + {{tenantSlug}} + {{url}} placeholders), resetSubject, resetBody (uses {{url}}), verificationSubject, verificationBody (uses {{url}}). Strings are plain text per D-02 (NO HTML wrapper — CTO Affirmation-2 explicit). In apps/api/src/contexts/identity/domain/ports.ts add EMAIL_ADAPTER_PORT Symbol + EmailAdapterPort interface per the interfaces block. In apps/api/src/config/env.schema.ts add the new env entries per D-01 + D-20 (RESEND_API_KEY optional at schema level, RESEND_FROM/REPLY_TO defaulted, MAILHOG_HOST/PORT defaulted, RATE_LIMIT_AUTH_SIGNIN_PER_TENANT_PER_MIN default 60). Update .env.example with the same new vars + comments. NO assertProdGuardrails change yet — Task 4.
  </action>
  <verify>
    <automated>pnpm install &amp;&amp; pnpm --filter @resto/api typecheck</automated>
    <automated>pnpm --filter @resto/api test get-locale</automated>
    <automated>pnpm --filter @resto/api test env.schema</automated>
  </verify>
  <done>resend + nodemailer + @types/nodemailer installed (pnpm-lock.yaml updated, no postinstall ran); EMAIL_ADAPTER_PORT + EmailAdapterPort exported from identity/domain/ports.ts; get-locale.ts handles 5 behavior cases; env.schema.ts parses the 6 new envs with correct defaults; .env.example updated; typecheck passes.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Three concrete adapters (Resend with retry+IdentityEmailDispatchFailedV1, MailHog SMTP, Captured)</name>
  <read_first>
    - apps/api/src/contexts/identity/infrastructure/identity-event-emitter.adapter.ts (db.withTenantId pattern — line 30 per RESEARCH.md)
    - packages/events/src/contracts/identity.ts (IdentityEmailDispatchFailedV1 just-shipped in Plan 01 — payload shape)
    - packages/events/src/envelope.ts (buildEnvelope signature — correlationId from OTel)
    - packages/events/src/outbox/repository.ts (appendToOutbox signature)
    - apps/CLAUDE.md "Server-side fetch must have AbortSignal.timeout" rule
    - apps/api/src/contexts/identity/identity-core.module.ts:28-42 (current assertEmailAdapterWired shape — task 4 extends; here adapters reference shape)
    - .planning/phases/03-auth-completion/03-RESEARCH.md "Pitfall 3" (BA hooks fire outside ALS → tenantId is explicit arg)
    - .planning/phases/03-auth-completion/03-RESEARCH.md "Don't Hand-Roll" row 9 (Resend SDK signature verification — D-08 deferred this plan)
  </read_first>
  <behavior>
    - Test 1: ResendEmailAdapter.sendInvitation succeeds on first attempt (mock Resend SDK returns 200) → no outbox row written
    - Test 2: ResendEmailAdapter.sendInvitation retries 3× on 5xx and eventually succeeds on attempt 2 (no terminal failure, no outbox row)
    - Test 3: ResendEmailAdapter.sendInvitation hits 5xx on all 3 attempts → emits IdentityEmailDispatchFailedV1 envelope (reason='resend_terminal_failure', userId/tenantId populated) via buildEnvelope + appendToOutbox + db.withTenantId(tenantId, ...); rethrows so BA records the failure
    - Test 4: ResendEmailAdapter.sendInvitation on 429 rate-limit response logs WARN (Claude's-Discretion-item-5 visibility) and treats as terminal (no retry)
    - Test 5: Total elapsed time on 3 retries < 6 seconds (jittered backoff 250+1000+4000 wallclock < 6000ms)
    - Test 6: ResendEmailAdapter.verifyTransport calls Resend domains.list — throws on auth failure, succeeds on 200
    - Test 7: ResendEmailAdapter.adapterName === 'resend'
    - Test 8: MailhogSmtpAdapter.sendInvitation hits MailHog SMTP on localhost:1025; sent message visible at MailHog UI :8025 (dev integration test or smoke)
    - Test 9: MailhogSmtpAdapter.verifyTransport performs STARTTLS handshake (or noop for MailHog — verify connection only) → throws when MAILHOG_HOST unreachable
    - Test 10: MailhogSmtpAdapter.adapterName === 'mailhog-smtp'
    - Test 11: CapturedEmailAdapter.sendInvitation pushes record to internal queue; getCaptured() returns the queue
    - Test 12: CapturedEmailAdapter.verifyTransport is no-op (returns immediately)
    - Test 13: CapturedEmailAdapter.adapterName === 'captured'
  </behavior>
  <action>
    Create apps/api/src/contexts/identity/infrastructure/email/resend.adapter.ts implementing EmailAdapterPort. Constructor injects: Resend SDK client (instantiated from env.RESEND_API_KEY), Drizzle db (AUTH_DRIZZLE_TOKEN), env (RESEND_FROM + RESEND_REPLY_TO), Logger. Public methods sendInvitation/sendResetPassword/sendVerification all delegate to internal #sendWithRetry({ to, subject, body, idempotencyKey, tenantId, userId }) which: composes subject+body from email-strings.<locale>.ts using template substitution, builds Resend payload { from: env.RESEND_FROM, to, reply_to: env.RESEND_REPLY_TO, subject, text: body, idempotency_key: idempotencyKey }, attempts up to 3 sends with backoff 250+jitter, 1000+jitter, 4000+jitter (Math.random()*100), each call wrapped in AbortSignal.timeout(5500). On 5xx or network error retry; on 4xx (including 429) treat as terminal: emit IdentityEmailDispatchFailedV1 envelope via buildEnvelope (reason='resend_terminal_failure', userId, tenantId, originalSubject taken from BA flow context like 'invitation'|'password_reset'|'verification', errorMessage from response.statusText or err.message). For envelope outbox append, use db.withTenantId(tenantId, async (tx) => await appendToOutbox(tx, envelope, aggregateId)) when tenantId is defined; when tenantId is undefined (verification email pre-org-bind), use db.withoutTenant('email dispatch failure — no tenant context (BA pre-org-bind path)') — explicit reason satisfies TEN-11 allowlist. After emitting the audit envelope, rethrow the original error so BA logs it. verifyTransport() calls Resend `domains.list()` (or `domains.get` if list is rate-limited) and rejects on non-200. adapterName getter returns 'resend'. ALSO log at startup the current Resend tier (parse from /domains response or assume free tier per A3) for Skeptic MED-10 visibility recommendation.

    Create mailhog-smtp.adapter.ts using nodemailer.createTransport({ host: env.MAILHOG_HOST, port: env.MAILHOG_PORT, secure: false, ignoreTLS: true, auth: undefined }). Methods compose subject+body same way then call transport.sendMail. verifyTransport() runs transport.verify() — nodemailer's connect+capability check. adapterName 'mailhog-smtp'. NO retry, NO outbox emission (dev path — failures surface immediately to dev console).

    Create captured.adapter.ts as `export class CapturedEmailAdapter implements EmailAdapterPort` storing records in a private readonly queue: Array<{ kind, to, locale, url, ... }>. Provide a public `getCaptured(): readonly Captured[]` for tests + a `clear()` between tests. verifyTransport() is `async () => {}`. adapterName 'captured'.

    For all three adapters, the EmailAdapterPort.sendInvitation input includes `tenantId: TenantId`. The adapter MUST NOT call runInTenantContext per ADR-0020 I-6. Imports are `import { type AuthDrizzle, AUTH_DRIZZLE_TOKEN } from '../../identity.tokens'`.

  </action>
  <verify>
    <automated>pnpm --filter @resto/api test resend.adapter</automated>
    <automated>pnpm --filter @resto/api test mailhog-smtp.adapter</automated>
    <automated>pnpm --filter @resto/api test captured.adapter</automated>
    <automated>pnpm --filter @resto/api typecheck</automated>
  </verify>
  <done>Three adapters exist with verifyTransport + adapterName + the 3 send methods; Resend retry-with-backoff under 6s budget verified by elapsed-time assertion in test 5; Resend terminal failure emits IdentityEmailDispatchFailedV1 with reason='resend_terminal_failure' through buildEnvelope+appendToOutbox using db.withTenantId; all 13 behavior tests pass; no runInTenantContext usage (grep -n "runInTenantContext" apps/api/src/contexts/identity/infrastructure/email/ returns 0 matches).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Adapter factory + EMAIL_ADAPTER_PORT wiring in identity-core.module.ts + BA callbacks delegate to adapter + NOOP default removal</name>
  <read_first>
    - apps/api/src/contexts/identity/identity-core.module.ts (entire file — adapter factory pattern, BuildOpts construction, REQUIRED_EMAIL_CALLBACKS line 28, assertEmailAdapterWired call line 92)
    - apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts (entire file — current NOOP defaults at L137,142,152; how BuildOpts.sendResetPassword/sendVerificationEmail/sendInvitationEmail wire into BA config; how `request?: Request` flows through to callbacks)
    - .planning/phases/03-auth-completion/03-RESEARCH.md "Pattern 1: BA email callback signature" (data shape — 5 fields for invitation + inviter + optional request)
    - apps/api/src/contexts/identity/identity.tokens.ts (token exports — model new factory after existing module wiring shape)
  </read_first>
  <behavior>
    - Test 1: factory called with NODE_ENV='development' returns MailhogSmtpAdapter instance
    - Test 2: factory called with NODE_ENV='test' returns CapturedEmailAdapter instance
    - Test 3: factory called with NODE_ENV='staging' and RESEND_API_KEY set returns ResendEmailAdapter instance
    - Test 4: factory called with NODE_ENV='production' and RESEND_API_KEY set returns ResendEmailAdapter instance
    - Test 5: factory called with NODE_ENV='staging' and RESEND_API_KEY undefined THROWS at construction time (before BA boot)
    - Test 6: identity-core.module.ts REQUIRED_EMAIL_CALLBACKS array now equals ['sendVerificationEmail', 'sendResetPassword', 'sendInvitationEmail']
    - Test 7: BA BuildOpts at auth.config.ts L137/L142/L152 no longer contain `?? (() => Promise.resolve())` — direct opts pass-through
    - Test 8: BA sendInvitationEmail callback (when triggered with mock invitation data) calls emailAdapter.sendInvitation with correct tenantId (from data.organization.id) + locale (from request.headers Accept-Language) + url (constructed from env.ADMIN_WEB_URL + `/accept-invitation/${data.id}`)
    - Test 9: BA sendResetPassword callback calls emailAdapter.sendResetPassword with correct url (data.url) + userId (data.user.id) + tenantId (data.user.activeOrganization?.id when present)
    - Test 10: BA sendVerificationEmail callback calls emailAdapter.sendVerification analogously
  </behavior>
  <action>
    Create apps/api/src/contexts/identity/infrastructure/email/email-adapter.factory.ts exporting `createEmailAdapter(env: Env, deps: { db: AuthDrizzle; logger: Logger }): EmailAdapterPort` — switch on env.NODE_ENV: 'development' → new MailhogSmtpAdapter(env, deps); 'test' → new CapturedEmailAdapter(); 'staging'|'production' → if !env.RESEND_API_KEY throw new Error('RESEND_API_KEY required for ' + env.NODE_ENV); else new ResendEmailAdapter(new Resend(env.RESEND_API_KEY), env, deps).

    In apps/api/src/contexts/identity/identity-core.module.ts: extend `REQUIRED_EMAIL_CALLBACKS` per D-13 to `['sendVerificationEmail', 'sendResetPassword', 'sendInvitationEmail'] as const`. Update assertEmailAdapterWired call at L92 to pass all three callbacks. Add a NestJS provider for EMAIL_ADAPTER_PORT using factory: { provide: EMAIL_ADAPTER_PORT, inject: [EnvService, AUTH_DRIZZLE_TOKEN], useFactory: (env, db) => createEmailAdapter(env, { db, logger: new Logger('EmailAdapter') }) }. The provider's useFactory output is the SAME instance used to construct BuildOpts.sendInvitationEmail/sendResetPassword/sendVerificationEmail closures.

    In apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts at L137 remove `?? (() => Promise.resolve())` so `sendResetPassword: opts.sendResetPassword` direct pass-through; at L142 same for sendVerificationEmail; at L152 same for sendInvitationEmail. In identity-core.module.ts, when constructing BuildOpts for buildAuth(), pass the wrappers:
      sendInvitationEmail: async (data, request) => {
        const locale = getLocale(request?.headers);
        const url = `${env.ADMIN_WEB_URL}/accept-invitation/${data.id}`;
        await emailAdapter.sendInvitation({ to: data.email, locale, url, tenantSlug: data.organization.slug, inviterName: data.inviter.user.name ?? data.inviter.user.email, tenantId: data.organization.id as TenantId });
      }
      sendResetPassword: async (data, request) => {
        const locale = getLocale(request?.headers);
        // D-17: resolve organizationId when available, withoutTenant only for genuine pre-org-bind paths (verification email on signup).
        // Per plan-checker W-1 2026-05-30: BA sometimes attaches data.user.activeOrganization for an authenticated reset-password call.
        // Resolve from that field first; fall back to undefined only when truly absent.
        const tenantId = data.user.activeOrganization?.id as TenantId | undefined;
        await emailAdapter.sendResetPassword({ to: data.user.email, locale, url: data.url, userId: data.user.id, tenantId });
      }
      sendVerificationEmail: async (data, request) => {
        const locale = getLocale(request?.headers);
        await emailAdapter.sendVerification({ to: data.user.email, locale, url: data.url, userId: data.user.id, tenantId: undefined });
      }
    The tenantId=undefined branches in reset+verification mean Resend adapter terminal-failure emission uses db.withoutTenant per Task 2 implementation. Per Pitfall 8 in 03-RESEARCH.md: also set `requireEmailVerificationOnInvitation: true` on the organization() plugin config in auth.config.ts (small one-line addition where organization plugin is configured — guards against spoofing pre-AUTH-06 land).

  </action>
  <verify>
    <automated>pnpm --filter @resto/api test email-adapter.factory</automated>
    <automated>pnpm --filter @resto/api test identity-core.module</automated>
    <automated>pnpm --filter @resto/api typecheck</automated>
    <automated>grep -c "?? (() => Promise.resolve())" apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts</automated>
  </verify>
  <done>Factory returns correct adapter per NODE_ENV across all 5 cases; REQUIRED_EMAIL_CALLBACKS extends to 3 callbacks; all three NOOP `??` defaults at auth.config.ts:137/142/152 removed (grep returns 0); BA callbacks delegate to adapter with correct tenantId/locale extraction; requireEmailVerificationOnInvitation: true set on organization plugin; typecheck green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Boot guards — assertProdGuardrails + assertEmailAdapterWired three-callback + verifyTransport ping + boot-time integration test</name>
  <read_first>
    - apps/api/src/config/prod-guardrails.ts (entire file — current assertProdGuardrails shape, S3 guard pattern from ADR-0020 I-3 in research)
    - apps/api/src/contexts/identity/identity-core.module.ts (assertEmailAdapterWired implementation — extend with adapter precondition checks D-13 + D-15 + D-17)
    - apps/api/src/main.ts (boot sequence — confirm assertProdGuardrails runs before NestJS factory)
    - .planning/phases/03-auth-completion/03-CONTEXT.md D-13 (NOOP default removal already done in Task 3 — Task 4 closes the guard)
    - .planning/phases/03-auth-completion/03-CONTEXT.md D-14 (boot-time integration test requirements)
    - .planning/phases/03-auth-completion/03-CONTEXT.md D-15 (verifyTransport ping at boot)
  </read_first>
  <behavior>
    - Test 1: assertProdGuardrails throws when NODE_ENV='staging' AND RESEND_API_KEY is empty
    - Test 2: assertProdGuardrails throws when NODE_ENV='production' AND RESEND_API_KEY is empty
    - Test 3: assertProdGuardrails throws when NODE_ENV='staging' AND adapter.adapterName !== 'resend' (e.g., MailHog accidentally wired in prod)
    - Test 4: assertProdGuardrails passes when NODE_ENV='staging' AND RESEND_API_KEY set AND adapter.adapterName='resend'
    - Test 5: assertProdGuardrails skipped for NODE_ENV='development' and 'test' (no assertion)
    - Test 6: assertEmailAdapterWired throws when REQUIRED_EMAIL_CALLBACKS has 3 entries but only 2 callback fns provided in any non-development env
    - Test 7: assertEmailAdapterWired calls adapter.verifyTransport() at boot in staging/production; throws when verifyTransport rejects
    - Test 8: assertEmailAdapterWired does NOT call verifyTransport in development (so Resend domains.list isn't called in dev where MailHog is wired)
    - Test 9: Boot-time integration: a programmatic `buildModule(env={NODE_ENV:'staging', RESEND_API_KEY: undefined})` throws synchronously during module construction (NOT later when BA endpoint hit)
  </behavior>
  <action>
    In apps/api/src/config/prod-guardrails.ts extend assertProdGuardrails(env, { emailAdapterName?: string }) — when env.NODE_ENV is 'staging' or 'production': throw if !env.RESEND_API_KEY with message 'RESEND_API_KEY required in {NODE_ENV} — D-01 / Phase 3 boot guard'; throw if emailAdapterName !== 'resend' with message 'Email adapter must be ResendEmailAdapter in {NODE_ENV}, got {emailAdapterName} — D-01'. Skip silently when NODE_ENV is 'development' or 'test'. Wire main.ts to pass the wired adapter's adapterName into assertProdGuardrails after the IdentityCoreModule is constructed (NestJS app context provides EMAIL_ADAPTER_PORT).

    In identity-core.module.ts extend assertEmailAdapterWired to: (a) ensure all three callback keys per REQUIRED_EMAIL_CALLBACKS extension (D-13 already done — verify count==3); (b) ensure the adapter exposes a tenant-scoped emit path (D-17 third precondition: verify adapter has the three send methods with tenantId in signature — TypeScript guarantee, runtime check is `typeof adapter.sendInvitation === 'function' && typeof adapter.sendResetPassword === 'function' && typeof adapter.sendVerification === 'function'`); (c) when NODE_ENV in ('staging','production') call `await adapter.verifyTransport()` per D-15 — if throws, rethrow with context 'verifyTransport failed at boot — check RESEND_API_KEY / connectivity'. For NODE_ENV='development' DO NOT call verifyTransport (avoids hitting Resend in dev).

    Create apps/api/test/identity-core.module.spec.ts (unit) verifying behaviors 1-8 with mocked adapter + env. Create or extend apps/api/test/prod-guardrails.spec.ts verifying behaviors 1-5. Create apps/api/test/identity-boot-integration.spec.ts (D-14) that imports the actual IdentityCoreModule with NODE_ENV='staging' and an in-memory env override missing RESEND_API_KEY and asserts the module construction throws synchronously (behavior 9 — this is the production misconfiguration regression).

  </action>
  <verify>
    <automated>pnpm --filter @resto/api test identity-core.module</automated>
    <automated>pnpm --filter @resto/api test prod-guardrails</automated>
    <automated>pnpm --filter @resto/api test identity-boot-integration</automated>
  </verify>
  <done>All 9 behavior tests pass; assertProdGuardrails has the Resend assertion; assertEmailAdapterWired checks 3 callbacks + tenant-scoped emit + verifyTransport (staging/prod only); D-14 boot integration test proves prod misconfig is caught at module construction not at BA endpoint hit.</done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                                            | Description                                                                                                    |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| BA send-email callback → adapter                    | BA hook fires outside HTTP middleware ALS frame; adapter must NOT rely on AsyncLocalStorage for tenant context |
| Adapter → Resend HTTPS API                          | External SaaS; rate-limit, auth-failure, 5xx, timing all potential failure modes                               |
| Adapter → MailHog SMTP (dev)                        | Local dev container; no auth; integrity not a concern                                                          |
| Outbox terminal-failure emission → audit subscriber | Audit log integrity depends on envelope construction via buildEnvelope (correlationId from OTel)               |
| .env / Vault → Resend API key                       | Misconfigured prod must fail loud (D-01 + D-14)                                                                |

## STRIDE Threat Register

| Threat ID | Category               | Component                                                         | Disposition | Mitigation Plan                                                                                                                                                                                        |
| --------- | ---------------------- | ----------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-03-08   | Tampering              | Resend webhook signature                                          | accept      | Bounce-webhook (D-08) deferred — no webhook accepted in Phase 3                                                                                                                                        |
| T-03-09   | Spoofing               | Sender domain spoofed (SPF/DKIM/DMARC fail)                       | mitigate    | Pre-deploy DNS checklist per D-07 — committed runbook in infra/runbooks/ (planner task: see Plan 05)                                                                                                   |
| T-03-10   | Information Disclosure | RESEND_API_KEY in client bundle                                   | mitigate    | env.schema.ts declares RESEND*API_KEY without NEXT_PUBLIC* prefix; ESLint catches client-side imports                                                                                                  |
| T-03-11   | Denial of Service      | Resend 429 rate-limit during onboarding                           | mitigate    | At-startup tier log (Claude's-Discretion-5); WARN on 429; runbook line for upgrade-threshold                                                                                                           |
| T-03-12   | Repudiation            | Resend send failure silently swallowed                            | mitigate    | D-05 terminal-failure emits IdentityEmailDispatchFailedV1 (reason='resend_terminal_failure') to outbox → audit row                                                                                     |
| T-03-13   | Elevation of Privilege | Adapter receives wrong tenantId, emits failure under wrong tenant | mitigate    | D-17 explicit tenantId arg; db.withTenantId — RLS WITH CHECK rejects cross-tenant inserts                                                                                                              |
| T-03-14   | Information Disclosure | Email body leaks internal data                                    | accept      | Plain-text BA-default content per D-02 — bodies are URL + minimal copy; no PII beyond invitee email                                                                                                    |
| T-03-15   | Tampering              | NOOP fallback ships to prod by mistake                            | mitigate    | D-13 NOOP defaults REMOVED at L137/142/152 + assertEmailAdapterWired 3-callback check + verifyTransport boot ping + D-14 boot integration test asserts misconfigured staging/prod throws synchronously |
| T-03-16   | Information Disclosure | Adapter logs body containing reset/verification URL               | mitigate    | adapters log subject + to + adapterName only; URL excluded from log redact config; existing Pino redact applies                                                                                        |
| T-03-SC   | Tampering              | Supply chain — `resend` or `nodemailer` package compromised       | mitigate    | Task 0 blocking-human checkpoint per Package Legitimacy Gate (npm view source repo + postinstall + downloads); legitimacy never auto-approvable                                                        |

</threat_model>

<verification>
- pnpm --filter @resto/api typecheck (post all 4 tasks)
- pnpm --filter @resto/api test (full unit suite green)
- grep -c "?? (() => Promise.resolve())" apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts returns 0
- grep -n "REQUIRED_EMAIL_CALLBACKS" apps/api/src/contexts/identity/identity-core.module.ts shows array length 3
- grep -n "RESEND_API_KEY" apps/api/src/config/prod-guardrails.ts returns at least 1 match
- grep -n "runInTenantContext" apps/api/src/contexts/identity/infrastructure/email/ returns 0 matches
- grep -n "requireEmailVerificationOnInvitation" apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts returns 1 match (=true)
</verification>

<success_criteria>

- AUTH-01 ROADMAP Success Criterion 6 satisfied: Email adapter wired three-way (Resend / MailHog / Captured); assertEmailAdapterWired extended to all three callbacks AND the NOOP defaults removed; assertProdGuardrails extended to assert non-empty RESEND_API_KEY + adapter class name in staging/production; Resend retries 3× (250→1000→4000ms, <6s) on 5xx and emits identity.email_dispatch_failed.v1 (reason='resend_terminal_failure') through outbox on terminal failure
- D-13, D-14, D-15, D-17 all implemented and tested
- IdentityEmailDispatchFailedV1 contract from Plan 01 reused for the resend_terminal_failure branch (single audit row family for both flows)
- requireEmailVerificationOnInvitation: true set on BA organization plugin per Pitfall 8 (defends spoofing pre-AUTH-06 land)
- New envs RESEND_API_KEY/RESEND_FROM/RESEND_REPLY_TO/MAILHOG_HOST/MAILHOG_PORT/RATE_LIMIT_AUTH_SIGNIN_PER_TENANT_PER_MIN in env.schema.ts + .env.example
  </success_criteria>

<output>
Create `.planning/phases/03-auth-completion/03-02-SUMMARY.md` when done (include Resend free-tier numbers recorded in Task 0 + the package versions installed).
</output>
