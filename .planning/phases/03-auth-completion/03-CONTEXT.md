# Phase 3: Auth Completion (Security Core) - Context

**Gathered:** 2026-05-29
**Status:** Ready for planning
**Scope split:** Phase 3 rescoped post-persona-review (CTO HIGH-1 + Skeptic HIGH-4). Full operator self-service UX (team management page + 2FA lost-device flow + role-change endpoint) moved to new Phase 17 (post-MVP-1 polish). See `PERSONA-REVIEWS.md` for the full reasoning trail.

<domain>
## Phase Boundary

Phase 3 ships the **security-critical subset of auth completion** that the first paying customer must run on top of: real email transport, invitation + accept flow, password reset, email verification enforcement, secure cookies sweep, NATS DLQ wiring, role permission seeding, plus three Phase 02 carry-over technical-debt items. Operator-self-service polish (full /dashboard/team, 2FA lost-device admin reset, in-place role-change UI) is explicitly out of scope and lives in Phase 17.

**In scope (11 requirements + 4 carry-overs):**

- AUTH-01: extend `assertEmailAdapterWired` to all 3 BA callbacks + remove NOOP defaults in `auth.config.ts:137,152`; extend `assertProdGuardrails` for Resend
- AUTH-02, AUTH-03: invitation send + accept-invitation flow (BA org-plugin defaults; role at invite-time encoded in token; existing-account auto-attach to new tenant)
- AUTH-04, AUTH-05: password reset send + reset (BA defaults; 1h TTL)
- AUTH-06: email verification + `REQUIRE_EMAIL_VERIFICATION` enforcement (sensitive actions blocked for unverified)
- AUTH-07 (scoped): enable 2FA TOTP + 10 recovery codes shown once + confirmation gate. NO lost-device admin-reset UI. NO email-recovery loop for owner.
- AUTH-08: full secure-cookie sweep across all server actions (not just the two flagged in Phase 02 D-04)
- AUTH-09 (scoped): idempotent role-seeding (NestJS bootstrap step or generated SQL migration) + **wire `organizationHooks.afterUpdateMemberRole`** in `auth.config.ts` (hook EXISTS in BA 1.4.22 per Phase 3 research — `node_modules/.../organization/types.d.mts:520`; the prior "BA ≥ 1.5 trigger" narrative was based on a wrong hook path). Hook emits `identity.role_changed.v1` envelope through `buildEnvelope` + outbox; `ACTION_TARGET_KIND['identity.role_changed']='user'`. Closes BLOCKED row in audit-gap.md invisibly. NO custom endpoint, NO UI — Phase 17 / TEAM-03 adds role-change UI on top using BA's `auth.api.updateMemberRole`.
- AUTH-10: NATS consumer `max_deliver: 5` + `dlq.<subject>` + e2e poison-message test (this requirement ships FIRST in wave order per Skeptic MED-7)
- AUTH-11: WeakMap refactor of `__restoSignOut` / `__restoPasswordReset` context stash
- Carry-over: `apps/admin/app/forgot-password/actions.ts:15` `?? 'http://localhost:3001'` antipattern → migrate to `@/lib/env`
- Carry-over: refactor `apps/admin/app/login/actions.ts:36-74` 3-call sign-in fan-out (CTO suggested in Phase 02, deferred)
- Carry-over: full secure-cookie sweep audit (covered by AUTH-08)
- New persona-review-applied items: per-tenant signin rate-limit env, GDPR retention sweep on `invitation` + `verification` tables, Resend retry+outbox+DLQ tail on email send failure, email-enumeration parity test on signup/reset

**Out of scope (explicit, see Phase 17 / TEAM-01..05):**

- Full `/dashboard/team` page (Phase 17 / TEAM-01)
- Pending-invitations table + revoke (Phase 17 / TEAM-02)
- In-place role-change UI (Phase 17 / TEAM-03 — UI only; audit envelope already wired in Phase 3 via `organizationHooks.afterUpdateMemberRole`)
- 2FA lost-device admin-reset for subordinates (Phase 17 / TEAM-04)
- 2FA recovery code regeneration UI (Phase 17 / TEAM-05)
- Branded HTML email templates (Phase 8 / GNOTIF)
- Per-tenant email domain (Phase 8 / GNOTIF)
- Per-user `locale` BA additionalField (MVP-2 / CRM phase)
- Owner email-recovery loop for 2FA (out entirely — it cancels the 2FA security gain)

</domain>

<decisions>
## Implementation Decisions

### Email transport (user decisions)

- **D-01: Three-environment adapter split.** Dev → MailHog (already in docker-compose, SMTP :1025, UI :8025) via nodemailer adapter. Tests → in-memory `CapturedEmailAdapter` for deterministic `expect(emails).toContainEqual(...)` assertions, no external dependencies. Staging/prod → Resend via official SDK. Selection at composition time in `identity-core.module.ts` based on `NODE_ENV`. Skeptic HIGH-2 enforcement: `assertProdGuardrails` extended to assert wired adapter class name AND non-empty `RESEND_API_KEY` when `NODE_ENV ∈ {staging, production}` — force-fail at boot if MailHog adapter accidentally wires in prod.
- **D-02: Plain text + URL from Better Auth defaults for all 3 operator emails** (invitation, password reset, email verification). No HTML templates in Phase 3 — branded HTML infrastructure ships in Phase 8 with GNOTIF guest emails (per-tenant brand-themed). Resist any planner instinct to add a "minimal HTML wrapper" — CTO Affirmation-2.
- **D-03: EN + RU localization via `Accept-Language`.** `getLocale(headers): 'en' | 'ru'` helper at email-send call site, fallback EN. No new BA user `additionalFields`, no migration. 6 string constants per language (3 emails × subject+body). Known limitation (CTO LOW-1): invitation send originates from inviter's request → `Accept-Language` is the inviter's browser; an EN-speaking admin inviting an RU-speaking new operator → RU operator gets EN email. Accepted; proper per-user `locale` deferred to MVP-2 CRM.
- **D-04: From / Reply-To.** `From: RestOS <noreply@resto.app>`, `Reply-To: support@resto.app`. resto.app verified in Resend once. Env vars: `RESEND_FROM`, `RESEND_REPLY_TO` (defaulted in dev). Per-tenant `noreply@<slug>.resto.app` deferred to Phase 8 GNOTIF (guest emails — "от Ресторана Имя" makes sense for guests, not for operator account flows).

### Email failure mode and observability (CTO HIGH-2)

- **D-05: Resend adapter wraps the SDK call in retry-with-backoff** — 3 attempts, jittered, 250ms → 1000ms → 4000ms, total budget < 6s (so the request doesn't blow past BA's own timeout). On terminal failure, emit `identity.email_dispatch_failed.v1` envelope through outbox. Surfacing in admin UI deferred to a follow-up phase (the envelope + audit row is the immediate fix; admin observability view is a Phase 17 candidate or earlier if scope allows). Keeps BA's happy-path synchronous (which the rest of Phase 3 assumes) while adding the audit + observability tail.
- **D-06: Email enumeration parity.** `POST /api/auth/sign-up/email` and `POST /api/auth/request-password-reset` MUST return identical status + body + ±10ms timing for "email exists" vs "does not." Add two e2e specs in `identity-audit.e2e.spec.ts` style. If BA's defaults diverge, wrap the handler. Per-email rate-limit buckets (`RATE_LIMIT_AUTH_RESET_PER_EMAIL_PER_MIN=5`, `RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN=10`) must NOT divulge bucket-allocation by 429-boundary divergence — verify timing parity holds at rate-limit miss too.
- **D-07: SPF / DKIM / DMARC pre-deploy checklist.** Configure resto.app DNS at Cloudflare BEFORE first deploy that ships Phase 3 to staging or prod. Document in `infra/` checklist. Without this, Gmail will silently `dmarc=fail` operator invitations.
- **D-08: Resend bounce-webhook handler — planner decision.** Mark in plan whether bounce-handler (Skeptic MED-9: flip invitation.status='bounced' + UI affordance) ships in Phase 3 or is explicitly deferred. If deferred, the deferral and its operator-facing failure mode must be documented as a known MVP-1 limitation.

### Invitation / accept flow UX (user decisions)

- **D-09: Minimal invite form in `/dashboard/settings`** (NOT a dedicated /dashboard/team page). One email input + one role dropdown + one submit button. Members list + pending-invitations table + revoke + role-change all deferred to Phase 17. Page rename note: the deferred page is `/dashboard/team`, not `/dashboard/staff`, to avoid namespace collision with the `staff` role (CTO LOW-4).
- **D-10: Role chosen by inviting operator at invite-time**, encoded in BA invitation token, immutable through accept flow. Owner-role option ONLY available to owner-tier inviter; enforced at the invite-create endpoint with regression test (Skeptic LOW-12: e2e asserts admin attempting to invite with `role=owner` returns 403). CTO Affirmation-3: eliminates TOCTOU bug class and "invitee picks own role" UX trap; pairs naturally with BA's invitation model.
- **D-11: Duplicate-email auto-attach.** Invited email already has an account (this tenant or another) → BA org-plugin auto-attaches existing user to new tenant. User logs in with existing password, new tenant appears in brand-switcher (Phase 02 mechanism). Supports the legitimate consultant / co-owner / accountant-shared-across-restaurants use case.
- **D-12: TTL = BA defaults.** Invitation 48h, password reset 1h. Both are settable via BA plugin config; we accept the defaults. Operator manual-revoke of pending invite is part of TEAM-02 / Phase 17 (not Phase 3 minimal form). 48h on invite is pragmatic (Monday-accept of Friday invite); 1h on reset is OWASP-aligned.

### Boot guards + role seeding (applied from persona reviews)

- **D-13: Extend `assertEmailAdapterWired` to all three callbacks** (`sendVerificationEmail`, `sendResetPassword`, `sendInvitationEmail`) in `apps/api/src/contexts/identity/identity-core.module.ts:28`. AND **remove** the `?? (() => Promise.resolve())` defaults at `apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts:137,152` so the only path to a NOOP is `NODE_ENV === 'development'` explicitly wiring one (Skeptic HIGH-1). The guard exists precisely to prevent "operator clicks 'Resend invitation' in prod, nothing arrives, no log, no exception" — currently it's 1/3 effective.
- **D-14: Boot-time integration test** that asserts `loadEnv` + identity module construction throws when `NODE_ENV=staging` or `NODE_ENV=production` is set and any of the three callbacks is missing. Covers Skeptic HIGH-2 deployment misconfiguration ("`NODE_ENV` defaulted by Next bundling, `tsx` script run against prod DB").
- **D-15: `assertEmailAdapterWired` health-check extension (CTO LOW-3).** Beyond function-existence: call a `verifyTransport()` method on the adapter at boot. Resend: `GET /domains` ping. nodemailer: SMTP STARTTLS handshake. in-memory: no-op. Fail boot in staging/prod if the ping fails.
- **D-16: Role-seed via NestJS bootstrap step.** A startup task in `apps/api/src/main.ts` runs once after migrations complete, reads `SYSTEM_ROLES` from `packages/domain/src/rbac/system-roles.ts`, idempotent UPSERT into BA `organization_role` for `owner` / `admin` / `staff`. Alternative acceptable: generate the SQL once from `SYSTEM_ROLES` and commit as a static SQL migration in `packages/db/migrations/` — that keeps the `pnpm db:migrate` convention (CTO LOW-2). Do NOT make the migration TS-importing — creates a `@resto/domain` dependency at the `resto_admin` migration boundary which is convention drift.
- **D-16a (revised post-research, 2026-05-29):** AUTH-09 now ALSO includes wiring `organizationHooks.afterUpdateMemberRole` in `auth.config.ts`. Pattern mirrors existing `onSignedOut` / `onPasswordResetCompleted` hooks at `auth.config.ts:259-307`: hook callback receives `(member, previousRole, user, organization)` per BA 1.4.22 `types.d.mts:520`, uses `db.withTenantId(member.organizationId, ...)` (D-17 pattern) to call `buildEnvelope({ type: 'identity.role_changed.v1' }, { userId, tenantId, previousRole, newRole, actorUserId })` then `appendToOutbox(tx, envelope)`. New event contract added to `packages/events/src/contracts/identity.ts`. `ACTION_TARGET_KIND['identity.role_changed']='user'` added in audit projection. The BLOCKED row in `.planning/phases/01-tenancy-hardening/audit-gap.md` is updated by Phase 3 executor to WIRED with reference to the live hook. Earlier basis for keeping BLOCKED ("wait for BA ≥ 1.5") was refuted by research; user explicitly reaffirmed reversal 2026-05-29.
- **D-17: Tenant binding on email dispatch path (CTO MEDIUM-1).** Email adapter takes `tenantId` as an explicit constructor or call argument derived from the BA invitation or session row (`organizationId`). For any audit/failure row emission, the adapter uses `db.withTenantId(tenantId, ...)` — NOT `runInTenantContext` (which is HTTP-middleware-only per ADR-0020 I-6) and NOT relying on ALS being bound (BA hooks fire on `resto_auth` connection which BYPASSRLS). Make this the third precondition in `assertEmailAdapterWired`.

### NATS DLQ (AUTH-10 — ships FIRST in wave order)

- **D-18: AUTH-10 must close before any other AUTH-\* requirement.** Plan must order waves so DLQ ships first with the e2e poison test gating the rest. Test publishes deliberately broken envelope, asserts (i) `max_deliver: 5` reached, (ii) message lands in `dlq.<original_subject>`, (iii) `identity.email_dispatch_failed.v1`-style alert envelope emitted. Without this, every other auth flow is shipping into infrastructure that silently swallows poison messages (Skeptic MED-7).
- **D-19: NATS subscriber defaults from `packages/events/CLAUDE.md`** are confirmed acceptable: `max_deliver: 5`, exhausted → `dlq.<subject>`, `max_ack_pending > 1` (per-consumer concurrency cap), `ack_wait` set deliberately based on slowest expected handler (Phase 3 default: 30s for identity/audit consumers; revisit per consumer). `#run()` MUST wrap entire `for await` in try/catch (already enforced in repo; verify in audit subscriber under Phase 3 modifications).

### Rate limits + GDPR retention (CTO MEDIUM 2-3)

- **D-20: Per-tenant signin rate-limit.** Add `RATE_LIMIT_AUTH_SIGNIN_PER_TENANT_PER_MIN` env (default 60 — generous for onboarding, tight against credential stuffing). Implement on sign-in route by extracting tenant from `x-tenant-slug` or organization being signed into; on miss fall back to existing per-IP + per-email buckets. Document the default and the "tune up for known-large onboarding" runbook line.
- **D-21: Daily GDPR sweep on `invitation` + `verification` tables.** Job runs same path as Phase 1 erasure cron. `DELETE FROM invitation WHERE expires_at < now() - 30d AND status IN ('expired','revoked','accepted')` (or soft-archive to `invitation_history` if planner prefers — simpler is hard-delete with an audit row). Confirm `verification` rows are deleted by BA itself on consumption + add same TTL sweep for stale rows. Add `invitation_email_revealed_count` or similar PII-access counter to satisfy the "audit log of all PII touches" constraint from `CLAUDE.md`.

### 2FA scoping (CTO HIGH-trim + Skeptic MED-5)

- **D-22: 2FA TOTP = opt-in, no enforcement.** BA `twoFactor()` plugin already loaded in `auth.config.ts:154`. Phase 3 ships a `/dashboard/settings` 2FA section: enable flow + 10 recovery codes shown once with copy-to-clipboard + explicit "I saved them" confirmation gate before activation completes. Planner verifies BA plugin is no-op until user opt-in (Skeptic assumption-flag — confirm in research step).
- **D-23: Lost-device recovery for owner = manual founder-side runbook for the first 100 customers.** SQL script disables 2FA + writes audit row + force-revokes sessions. NO email-recovery loop ships (CTO HIGH-trim: it cancels the 2FA security gain — anyone who phishes the owner's email mailbox bypasses 2FA entirely, which is the exact threat model TOTP was supposed to mitigate). Document the runbook in `infra/runbooks/`; track as a non-code Phase 3 deliverable.

### Naming conventions

- **D-24: `/dashboard/team` not `/dashboard/staff`** for the future Phase 17 team-management page. Avoids namespace collision with the `staff` system role (CTO LOW-4). Phase 3 minimal invite form lives in `/dashboard/settings`; no new route in Phase 3.

### Claude's Discretion

- Wave ordering inside the plan (subject to D-18: DLQ first). Recommended: DLQ → email adapter boot guards → invitation send + accept → password reset → email verification + REQUIRE_EMAIL_VERIFICATION → secure cookie sweep → 2FA enable + recovery codes → carry-overs + WeakMap refactor.
- Whether bounce-webhook handler (D-08) ships in Phase 3 or defers. If solo throughput is tight, defer it explicitly with a documented operator-facing failure mode (operator clicks "Resend" 3× because they can't see the bounce). If headroom, ship the minimal version (webhook → DB column → list affordance).
- Exact API shape of `getLocale(headers)` helper — colocated with email adapter vs. shared utility in `packages/`. Cheaper: colocated until Phase 8 GNOTIF needs it too.
- Whether AUTH-11 WeakMap refactor stays in Phase 3 or slips to a tech-debt sweep / Phase 17. Skeptic LOW-11 marks it as the first cut candidate; CTO accepted it as opportunistic. Default: keep in Phase 3 since the BA hook code is already being modified for D-13.
- Whether to also fix the Resend free-tier visibility (Skeptic MED-10): at-startup log of Resend tier/limit + circuit-breaker around Resend client + WARN on 4xx-rate-limit. Cheap and high-leverage; recommend including.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 3 persona review trail (Phase 3-internal)

- `.planning/phases/03-auth-completion/PERSONA-REVIEWS.md` — consolidated planner-facing aggregate (read this first; it summarizes user decisions on every reviewer recommendation)
- `.planning/phases/03-auth-completion/PERSONA-CTO.md` — raw CTO review with HIGH/MED/LOW findings and evidence
- `.planning/phases/03-auth-completion/PERSONA-SKEPTIC.md` — raw Skeptic review with hidden-assumption hunt + scope-removal candidates
- `.planning/phases/03-auth-completion/03-DISCUSSION-LOG.md` — full discussion log (every question asked + user answer)

### RestOS planning + invariants

- `.planning/PROJECT.md` — RestOS positioning, AI-driven pivot, MVP-1/2/3 milestone structure, persona convention, Key Decisions
- `.planning/ROADMAP.md` — Phase 3 (Security Core) + new Phase 17 (Operator Self-service Polish) post-MVP-1
- `.planning/REQUIREMENTS.md` — AUTH-01..11 scoped notes + new TEAM-01..05 for Phase 17
- `.planning/STATE.md` — Phase 02 closeout state + carry-over notes
- `.planning/codebase/ARCHITECTURE.md` — 4-context DDD + RLS double-enforcement + outbox/inbox dedup + tenant context propagation
- `.planning/codebase/STACK.md` — Better Auth 1.4.22 pinned, twoFactor + organization + bearer plugins, Resend dependency planned (not yet installed)

### Phase 2 → Phase 3 hand-off

- `.planning/phases/02-admin-shell/02-VERIFICATION.md` — 5/5 SC verified, 9/9 reqs satisfied, 0 critical (note SC-4 forbidden-variant wiring depends on Phase 3 RBAC seed — flagged as carry-over)
- `.planning/phases/02-admin-shell/02-CONTEXT.md` — D-02 (placeholder routes ready), D-03 (HMAC-signed brand cookie pattern), D-04 (the two flagged cookies fixed, full sweep deferred to Phase 3 / AUTH-08)
- `.planning/phases/02-admin-shell/deferred-items.md` — Phase 02 → Phase 03 deferred surface (`forgot-password/actions.ts:15` localhost fallback antipattern, sign-out / sign-in `apiFetch` probes, sign-in 3-call fan-out)

### Tenancy / audit foundation (Phase 1)

- `.planning/phases/01-tenancy-hardening/audit-gap.md` — role-change row stays BLOCKED; **executor must update this file in Phase 3** to add the explicit re-eval trigger note ("first multi-member tenant with role ≠ owner OR BA ≥ 1.5 ships `databaseHooks.member.update.after`")
- `.planning/phases/01-tenancy-hardening/01-CONTEXT.md` — Phase 1 tenancy + identity hardening decisions (read for context on `withoutTenant` allowlist, ESLint rule, audit subscriber, outbox patterns)
- `docs/adr/0020-multi-tenancy-and-event-bus-invariants.md` — invariants I-1..I-7 (RLS double-enforcement, composite FK, correlationId from OTel span, runDeduped, runInTenantContext HTTP-middleware-only)

### Better Auth wiring

- `apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts` — `BuildOpts` shape, all three send callbacks already declared with NOOP defaults to remove, `twoFactor()` + `organization()` plugins, hooks.before/after sign-out + reset-password cascade
- `apps/api/src/contexts/identity/infrastructure/better-auth/access-control.ts` — `ownerRole` / `adminRole` / `staffRole` constructed from `PERMISSIONS_STATEMENT` and `SYSTEM_ROLES`
- `apps/api/src/contexts/identity/identity-core.module.ts:28-42` — `REQUIRED_EMAIL_CALLBACKS` array and `assertEmailAdapterWired` (currently checks 1 callback — Phase 3 extends to 3)
- `packages/domain/src/rbac/system-roles.ts` — `SYSTEM_ROLES` source of truth for role permissions (read at bootstrap for D-16 seed)
- `packages/domain/src/rbac/permissions.ts` — `PERMISSIONS_STATEMENT` and `Permission` type (consumed by BA accessControl)

### Env + boot guardrails

- `apps/api/src/config/env.schema.ts` — `REQUIRE_EMAIL_VERIFICATION` (default 'false'), `RATE_LIMIT_AUTH_SIGNIN_PER_MIN`, `RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN`, `RATE_LIMIT_AUTH_RESET_PER_EMAIL_PER_MIN`, `PASSWORD_MIN_LENGTH`. Phase 3 adds: `RATE_LIMIT_AUTH_SIGNIN_PER_TENANT_PER_MIN`, `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_REPLY_TO`, `MAILHOG_HOST`, `MAILHOG_PORT`
- `apps/api/src/bootstrap/prod-guardrails.ts` (current location TBD per scout) — extend with email-adapter assertion per Skeptic HIGH-2

### NATS / outbox / inbox conventions

- `packages/events/CLAUDE.md` — DLQ defaults `max_deliver: 5` + `dlq.<subject>`, `max_ack_pending > 1`, `ack_wait` set deliberate, `#run()` try/catch — Phase 3 AUTH-10 follows this directly
- `packages/events/src/envelope.ts` + `packages/events/src/contracts/identity.ts` — pattern for adding new event contracts (`identity.email_dispatch_failed.v1` per D-05)
- `packages/events/src/outbox/dispatcher.ts` — `OutboxDispatcher`; email-failure envelope flows through this same path
- `packages/events/src/inbox/run-duped.ts` — `runDeduped` pattern for the (eventual) email-dispatch consumer in a future phase

### Phase 2 surface code that Phase 3 modifies

- `apps/admin/app/signup/` — Phase 02 placeholder; Phase 3 wires real `signupAction` + email verification trigger
- `apps/admin/app/forgot-password/` — Phase 02 placeholder; Phase 3 wires real reset-request action + fixes `actions.ts:15` localhost fallback per Phase 02 deferred-items
- `apps/admin/app/reset-password/` — Phase 02 placeholder; Phase 3 wires real token-validation + set-password action
- `apps/admin/app/accept-invitation/` — Phase 02 may not have this yet; Phase 3 creates the route
- `apps/admin/app/login/actions.ts:36-74` — Phase 02 deferred 3-call fan-out refactor (`signInAction` → calls sign-in, then set-active-org, then redirect)
- `apps/admin/components/app-sidebar.tsx` — sidebar Dashboard / Brands / Settings (Phase 3 does NOT add `/dashboard/team` link — that's Phase 17). Phase 3 may add an "Invite member" affordance inside Settings.
- `apps/admin/lib/env.ts` — `forgot-password/actions.ts:15` localhost fallback migrates here (Phase 02 deferred-items item 3)

### External docs (verify before use)

- Better Auth docs (use Context7 `mcp__context7__*` in research step): organization plugin invitation send + accept, twoFactor() plugin enable + recovery codes + verify, `auth.api.*` server-side API surface, `databaseHooks.member.update.after` availability check across 1.4.22 → current upstream (Skeptic assumption flag #5 in PERSONA-REVIEWS.md)
- Resend SDK docs (Context7): Node SDK install + send + bounce webhook contract + free-tier rate limits (Skeptic assumption flag #4)
- Nodemailer docs (Context7 if approach is unclear): SMTP transport for MailHog dev path
- OWASP password reset cheat sheet (token TTL, single-use, identical responses) — informs D-06 enumeration parity
- RFC 7807 (already adopted via ProblemDetailsFilter) — Phase 3 mappers stay consistent

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`<EmptyState variant="forbidden">`** (`apps/admin/components/empty-state.tsx`) — Phase 02 built this; Phase 3 reuses for "verification required" + "invitation invalid/expired" + "reset link expired" empty states. No new component needed.
- **HMAC-signed cookie pattern** (`apps/admin/lib/active-brand-cookie.ts`) — Phase 02 D-03 established. Phase 3 reuses pattern shape for any new cookies (verification-pending banner suppression, post-invite welcome banner) if needed. AUTH-08 cookie sweep uses the same `secure: NODE_ENV==='production'` + `httpOnly: true` + `sameSite: 'lax'` baseline as the active-brand cookie.
- **`apiFetch` BA session forwarding** (`apps/admin/lib/api-server.ts:186-188`) — 401 → `/login?expired=1` redirect already wired. Phase 3 post-password-reset flow can lean on this for stale-session detection.
- **`getMe()` cached identity** (`apps/admin/lib/me.ts:5-36`) — Phase 02 wired discriminated `MeResponse`; Phase 3's invite-member action receives `getMe()` result for permission check (owner-can-grant-owner enforcement per D-10).
- **`@resto/events` `buildEnvelope` + outbox** — Phase 3's new `identity.email_dispatch_failed.v1` contract slots into the existing event pipeline (correlationId from OTel span, dispatcher publishes, audit subscribes via `identity.>`).
- **BA hook context-stash pattern** (`auth.config.ts:222-256`) — `__restoSignOut` + `__restoPasswordReset` already use `(ctx.context as { ... }).__resto*` casts. AUTH-11 refactors both to `WeakMap<object, Stash>`. Pattern is local — no other contexts touched.

### Established Patterns

- **Per-context error mapping** — `interfaces/http/error-mapping.ts` per context; `wrapWith(mapError)` factory in `apps/api/src/shared/api/wrap.ts` is the idiomatic try/catch wrapper. Phase 3's new identity endpoints follow this.
- **DI by Symbol token** — `EMAIL_ADAPTER_PORT` (new) follows the `STRIPE_CONNECT_PORT` / `CATALOG_CACHE_PORT` shape (declared in `domain/ports.ts` with Symbol + interface).
- **Zod schema = source of truth, types via `z.infer`** — applies to new DTOs (InviteMemberDto, AcceptInvitationDto, ResetPasswordRequestDto). Free-text fields get `.max(...)`; URL fields restrict to http(s).
- **`runDeduped(db, envelope, consumer, async (tx) => …)`** — Phase 3 doesn't add new consumers, but the audit subscriber (`apps/api/src/contexts/audit/infrastructure/nats-audit-subscriber.ts`) automatically picks up `identity.email_dispatch_failed.v1` since it subscribes on `identity.>`. Extend `ACTION_TARGET_KIND` map if the new event needs a `targetType` projection.
- **Phase 02 cookie pattern as Phase 3 baseline** — every server action that sets a cookie via `next/headers` `cookies()` follows the Phase 02 D-03/D-04 shape. AUTH-08 sweep validates every existing `cookies().set(...)` site.

### Integration Points

- **Better Auth handler mount** — already in `bootstrap.module.ts`; Phase 3 doesn't change the mount, only the `BuildOpts` passed to `buildAuth()`.
- **Email adapter port** — new `EMAIL_ADAPTER_PORT` Symbol in `apps/api/src/contexts/identity/domain/ports.ts`; three concrete adapters in `infrastructure/email/` (resend / mailhog-smtp / in-memory-captured); NestJS module wires the right one based on `NODE_ENV` + env flags. The same port interface satisfies all three BA callbacks (send invitation / send reset / send verification) — adapter implements all three methods.
- **Admin → Backend invite call** — admin `/dashboard/settings` invite form posts to a server action that calls `/v1/identity/invitations` (new endpoint that wraps `auth.api.createInvitation` to enforce role-permission check per D-10 + emit audit event) using `apiFetch` with `INTERNAL_API_TOKEN` server-only.
- **NATS subject `identity.>`** — already in `STREAM_SUBJECTS`. Phase 3 publishes new `identity.email_dispatch_failed.v1` envelopes on this subject; audit subscriber picks them up automatically.
- **`OutboxDispatcher`** — no changes needed; the email-failure envelope rides the existing dispatcher.

</code_context>

<specifics>
## Specific Ideas

- **Wave-1 starts with NATS DLQ test infrastructure** (per D-18) — every subsequent wave depends on knowing poison messages won't melt the subscriber.
- **`/dashboard/settings` invite form is intentionally small** — one input, one role dropdown (only options the inviter's role permits), one submit. No optimistic UI updates, no live invitation list. The list view + revoke + role-change all wait for Phase 17.
- **Email enumeration test is paired** — one e2e for signup ("`existing@example.com` returns identical to `nonexistent@example.com`"), one for reset ("same"). Timing assertion (`±10ms`) is the load-bearing part; status + body equality is the cheap one.
- **Founder-side 2FA reset runbook** is a real Phase 3 deliverable — committed to `infra/runbooks/2fa-recovery.md` even though it's "manual." The SQL script ships in `tools/` or `scripts/` so the founder doesn't write it from memory at 11pm.
- **The Resend bounce-webhook flip** (if shipped — D-08 planner discretion) updates an `invitation.delivery_status` enum column ('pending'|'delivered'|'bounced'|'complaint'|'unknown'). UI affordance is single-line: "✗ Bounced — check the email and resend" with a re-send button. Cheap; defer cleanly if scope is tight.

</specifics>

<deferred>
## Deferred Ideas

### Moved to Phase 17 (Operator Self-service Polish, post-MVP-1)

- Full `/dashboard/team` page (member list, pending invitations, revoke, role-change) → TEAM-01, TEAM-02
- Custom `PATCH /v1/identity/members/:id/role` via `auth.api.updateMemberRole` + `identity.role_changed.v1` envelope → TEAM-03 (closes audit-gap BLOCKED row at activation)
- 2FA lost-device admin-reset for subordinates → TEAM-04
- 2FA recovery code regeneration UI → TEAM-05

### Moved to Phase 8 (Payments + GNOTIF)

- Branded HTML email templates (3-environment compat — Outlook / Gmail / Apple Mail, dark-mode, MIME multipart, inlined CSS, per-tenant brand-themed)
- Per-tenant email sender domain (`noreply@<slug>.resto.app`) — makes sense for guest emails ("от Ресторана Имя"), not for platform operator emails

### Moved to MVP-2 (AI tier) — likely CRM phase

- Per-user `locale` BA `additionalField` + UI selector in operator settings. Current MVP-1 fallback: `Accept-Language` header detection at email-send call site (good enough until founder hires staff with explicit locale preferences mismatching browser language).

### Out of scope entirely (not scheduled)

- **Email-recovery loop for owner 2FA lost-device.** Removed unilaterally per CTO + Skeptic convergent finding: collapses 2FA to "email && TOTP" which is no stronger than email alone. Manual founder-side reset is the documented path; do not re-add without overturning this decision in PROJECT.md Key Decisions.

### Reviewed Todos (not folded)

- `restructure-roadmap-ai-driven.md` — status: completed (resolved 2026-05-27 via inline restructure). Surfaced by `todo.match-phase` but already done; no scope impact on Phase 3.

</deferred>

---

_Phase: 03-auth-completion_
_Context gathered: 2026-05-29_
