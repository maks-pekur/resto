# Persona Review: CTO — Phase 3 Auth Completion

**Reviewer:** CTO
**Date:** 2026-05-28
**Scope:** Implementation decisions captured during /gsd-discuss-phase 3
**Severity scale:** HIGH (must address before planning) | MEDIUM (raise in plan) | LOW (note for execute)

## Summary

Yellow with one structural red flag. The email-transport and invitation-UX choices are sane and right-sized for solo throughput, but two decisions are mis-sized for a 7-month-to-first-customer horizon: (a) the synchronous BA-hook email-send path will silently swallow Resend outages with no operator visibility, and (b) the 11-req + 4-carry-over + new-page + custom-endpoint + 2FA-UI scope is roughly 1.5–2 phases of solo work. Recommend descope before planning begins.

## Findings

### HIGH

1. **Phase scope is ~1.5–2 phases of solo work — must split before planning.**
   - WHAT: 11 functional reqs (AUTH-01..11) + 4 carry-over technical-debt items (secure-cookie sweep, sign-in 3-call fan-out, localhost fallback, WeakMap refactor of context-stash) + new `/dashboard/staff` page (list + invite form + role dropdown + pending-invites table + revoke + role-change) + custom `PATCH /v1/identity/members/:id/role` endpoint + 2FA TOTP UI (enroll + recovery codes + lost-device flow + admin reset-for-subordinate flow) + 3-environment email adapter (nodemailer/MailHog + in-memory captured + Resend) + idempotent role-seed migration + DLQ wiring. Phase 02 carried 5 non-critical items forward; this phase has at least 12 distinct deliverable surfaces.
   - WHY: At solo cadence with the existing test-discipline (e2e + RLS regression + audit-row materialization), this overruns Q1-2027 by weeks. More dangerously, when scope overruns, the items that get cut tend to be the security-critical ones — the visible UX work (invitations, staff page, 2FA enroll) absorbs the calendar and the WeakMap refactor / cookie sweep / DLQ silently slip.
   - HOW: Split into **Phase 3a (security-critical, must-ship for MVP-1 first paying customer)** and **Phase 3b (operator-self-service polish, can ship post-first-customer)**. Recommended cut:
     - **3a:** AUTH-01 (email-adapter wiring + assert all three callbacks), AUTH-02/03/04 (invitation + reset + verification flows via BA defaults, no custom UI beyond accept-invitation), AUTH-08 (cookie sweep), AUTH-10 (NATS DLQ), AUTH-11 (WeakMap refactor), AUTH-09 role seeding migration only, and the localhost-fallback + sign-in fan-out carry-overs. Skip the staff-management page; invites issued via `POST /v1/identity/invitations` with a minimal admin form (one input, one button).
     - **3b (next phase):** Full `/dashboard/staff` page (member list, pending invites, revoke, role-change), AUTH-07 2FA TOTP enroll + recovery + lost-device + admin-reset-for-subordinate, the custom `PATCH .../role` endpoint with audit emission. 2FA is operator opt-in for MVP-1 — onboarding 1–5 paying customers does not require enforced MFA.

2. **Email send-path through synchronous BA hooks has no outbox / no retry / no operator-visible failure mode.**
   - WHAT: BA's `sendInvitationEmail` / `sendResetPassword` / `sendVerificationEmail` are invoked synchronously inside the BA request lifecycle. Per the decisions captured, the Resend adapter will be called inline. If Resend has a 5xx burst on a Friday afternoon, the operator hits "Invite sent" but no email goes out — and there is no DLQ entry, no outbox row, nothing the operator can re-trigger from the admin UI.
   - WHY: `OutboxDispatcher` exists exactly for this kind of side-effect (`packages/events/src/outbox/dispatcher.ts`); not using it for email re-introduces the dual-write problem the platform spent ADR-0020 I-4/I-5 closing. With BA defaults invitation TTL = 48h and reset TTL = 1h, a transient Resend outage during onboarding silently burns the entire reset window for that operator. Blast radius scales with chain-size — onboarding a 10-location chain on Friday is exactly when you can't observe-and-retry.
   - HOW: Two acceptable shapes, pick one:
     - **(Preferred for solo throughput)** Wrap the Resend SDK call in a thin retry-with-backoff inside the adapter (3 attempts, jittered, 250ms→1s→4s, total budget < 6s so the request doesn't blow past BA's own timeout), AND on terminal failure emit a `identity.email_dispatch_failed.v1` envelope through outbox + surface it on a `/dashboard/system/email-dispatch` admin view as a `MEDIUM` follow-up. This keeps BA's happy-path synchronous (which Phase 3 already assumes) and adds an audit + observability tail.
     - **(More work, better long-term)** Replace the BA email callback bodies with `appendToOutbox(tx, { envelope: identity.email_queued.v1, … })` in the same tx as the BA write, and run a dedicated outbox consumer that dequeues to Resend with NATS DLQ on exhaustion. This is the right model for Phase 8 GNOTIF anyway — but introducing it in Phase 3 is +1 week of work and a new ADR.
   - Either way, the plan MUST address "what does the operator see when Resend is down 90 seconds into the request" — silent swallow is the default with the current decisions and is unacceptable.

3. **Custom `PATCH /v1/identity/members/:id/role` endpoint risks bypassing BA's permission graph — make this explicit before planning.**
   - WHAT: The proposed shim mutates the BA `member.role` row "via the BA adapter" then writes the audit envelope in the same tx. There are three failure modes the planning doc must address before execute:
     - (a) BA's `organization.updateMemberRole` server-side handler does its own permission check (caller has `staff:role:update`, target role exists in `organization_role` for this tenant, caller is not demoting the last owner). If the shim mutates `member.role` directly via the Drizzle adapter, all those checks are bypassed. This is the easy way to ship "any admin can promote themselves to owner" by accident.
     - (b) BA emits its own session-cache invalidation when role changes (otherwise the target user keeps the old `accessControl` until session expiry). A direct row update sidesteps that.
     - (c) The audit envelope's `actorSubject` MUST be the operator making the change, not the target user — easy to get wrong in a custom endpoint that doesn't go through `AuthGuard`'s standard principal binding.
   - WHY: Quietly relaxing RBAC inside an audit-closure shim is the textbook way to ship a vertical privilege escalation. The original BLOCKED row was scoped at "no first-class hook"; the fix being chosen is heavier than that — it changes the role-mutation control-plane entirely.
   - HOW: Three acceptable paths, in priority order:
     1. **(Preferred)** Call BA's existing `auth.api.updateMemberRole({ memberId, role }, { headers })` server-action from inside the NestJS controller (BA exposes a server-side API for every public endpoint). That preserves BA's permission graph + session invalidation. Then in the same request the controller appends the `identity.role_changed.v1` envelope. Audit-row is eventually-consistent vs. the BA write (already the project's stance — see `identity-core.module.ts:56` "audit pipeline is eventually-consistent observability"), and the BLOCKED disposition in `audit-gap.md` is closed without a custom row-mutation path.
     2. Stay BLOCKED until BA 1.5.x ships the hook. Not great — leaves a known gap visible to compliance reviewers.
     3. Postgres trigger on `member` UPDATE that writes the envelope. Don't do this — it puts an audit-emit dependency on the DB layer, breaks the "no business logic in triggers" rule, and the trigger has no `actorSubject` context.
   - The plan must specify which of (1)/(2) is chosen and the corresponding e2e test that proves an `admin`-tier operator cannot promote themselves to `owner` via the new endpoint.

### MEDIUM

1. **Tenant context on the email dispatch path needs to be explicit per ADR-0020 I-6.**
   - WHAT: BA's email callbacks fire inside the BA request, which runs on the `resto_auth` connection (BYPASSRLS) — so ALS may or may not be bound at that point. Per `identity-event-emitter.adapter.ts:14-30`, the existing pattern already distinguishes "HTTP path: ALS bound" from "BA hook with no ALS: bind explicitly via `withTenantId`". Phase 3's plan must specify how the Resend adapter resolves the tenant for logging / per-tenant rate-limiting / Resend's `metadata.tenant_id` tagging.
   - WHY: If the adapter calls `db.withTenant(...)` and ALS is unbound, it throws; if it skips the bind and writes an audit row, RLS WITH CHECK rejects it. Either bug looks like an email that "just doesn't send" to the operator and is hard to repro.
   - HOW: Codify in plan: email adapter takes `tenantId` as an explicit constructor / call arg derived from the BA invitation or session row (organizationId), uses `db.withTenantId(tenantId, append)` for any audit / failure row, and never relies on ALS. Make this the third precondition in `assertEmailAdapterWired`.

2. **GDPR retention on `invitation` and `verification` tables is unspecified.**
   - WHAT: `invitation` table holds `email` (PII) + `organizationId` + `role`; `verification` table holds the token `value` (which for reset tokens is the userId). Both have `expires_at` but no documented purge job. Phase 1 erasure cascade covers tenant-scoped tables; `verification` is a global BA table (see `0005_identity_rls.sql:62` comment), unclear whether it's caught.
   - WHY: GDPR Art. 5(1)(e) "storage limitation" — keeping an invitation row with a real email forever after the 48h TTL expires is a defensible audit item but only if there's a stated retention story. "We never delete" is not it.
   - HOW: Two-line addition to AUTH-04 plan: (a) confirm or add a daily sweep of `invitation WHERE expires_at < now() - 30d AND status IN ('expired','revoked','accepted')` → soft-archive to `invitation_history` (or hard-purge with an audit row, simpler). (b) Confirm `verification` rows are deleted by BA itself on consumption + add the same TTL sweep for stale rows. (c) Add `invitation_email_revealed_count` or similar PII-access counter to satisfy the "audit log of all PII touches" constraint from `CLAUDE.md`.

3. **Per-tenant burst rate-limit on sign-in is absent.**
   - WHAT: `RATE_LIMIT_AUTH_SIGNIN_PER_MIN=10` (env.schema.ts:174) is per-IP; `RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN=10` (181) is per-email. A 10-location chain doing simultaneous onboarding from the same office NAT can plausibly trip the per-IP limit; conversely, a credential-stuffing attack against many emails in one tenant gets no tenant-aggregate visibility.
   - WHY: Aligns with the "no per-tenant noisy-neighbor patterns" constraint and the "Friday-evening simultaneous spikes" scenario in `CLAUDE.md` Constraints. Also — when a real attack happens, the only signal you have is "lots of 401s across the tenant" and you want to be able to ship a tenant-scoped circuit-breaker without a code change.
   - HOW: Add `RATE_LIMIT_AUTH_SIGNIN_PER_TENANT_PER_MIN` env (default e.g. 60 — generous for onboarding, tight against stuffing). Implement on the sign-in route by extracting tenant from `x-tenant-slug` (or the org being signed into, if multi-org); on miss fall back to per-IP+per-email. Document the default and the "tune up for known-large-tenant onboarding" runbook line.

4. **2FA TOTP adds login-path latency — but the bigger concern is the lost-device recovery loop using the email transport.**
   - WHAT: For owner-role lost-device, the proposed flow is "email-recovery loop using same reset-token transport". If a tenant has a single owner and that owner loses their TOTP device AND the email account is also compromised (the whole reason 2FA exists), there is no out-of-band recovery — you've reduced the 2FA factor to `email && TOTP`, which is no stronger than email alone for the account-takeover threat model.
   - WHY: This is the standard "2FA without a real recovery story is theater" trap. For paying SaaS, having no documented "contact support, prove identity via billing-card last-4 + tenant-ID" path means the first locked-out paying owner becomes a Saturday emergency.
   - HOW: Cleaner MVP-1 stance: 2FA is opt-in but the only documented recovery for a sole owner is "use one of your 10 recovery codes" (which is why we mint them and force "I saved them" confirmation). If they lose recovery codes AND device, **the documented MVP-1 answer is "contact support; manual identity-prove out-of-band"** — track as a runbook item, not a Phase 3 deliverable. For admin/staff, owner-tier reset-via-admin-UI is fine. Explicitly remove the "email-recovery for owner" idea — it cancels the security gain.

### LOW

1. **Email localization via `Accept-Language` will return EN for some real RU operators.**
   - WHAT: BA's invitation send originates from the inviter's request, so `Accept-Language` is the inviter's browser, not the invitee's. An EN-speaking admin inviting an RU-speaking new operator → RU operator gets EN email.
   - WHY: First impression friction, not a blocker.
   - HOW: Acceptable for MVP-1 (per the decision). Document the limitation in the plan; LOW because the proper fix (per-user `locale` BA additionalField) is correctly deferred.

2. **Idempotent role-seed migration should be a Drizzle-aware step, not a raw SQL file.**
   - WHAT: Decision says "idempotent Drizzle migration reading from `SYSTEM_ROLES`". Phase 1 conventions (`packages/db/CLAUDE.md`) put hand-written DDL in `migrations/` SQL files run by `pnpm db:migrate`. Reading TS constants at migration-time means the migration is no longer a pure SQL artifact — diverging from convention.
   - WHY: Migrations are run from CI under `resto_admin`; loading TS at that boundary creates a new dependency surface (the migration binary needs the `@resto/domain` source tree available). Drift-prone.
   - HOW: Instead, ship the seed as a NestJS bootstrap step in `apps/api/src/main.ts` that runs once at boot after migrations, idempotent (UPSERT with WHERE NOT EXISTS), under a startup-task pattern. Or, generate the SQL from `SYSTEM_ROLES` once and commit it as a static SQL migration — that's still idempotent and stays inside `db:migrate`. Either path keeps the convention.

3. **`assertEmailAdapterWired` is asserting a runtime function-existence, not adapter health.**
   - WHAT: Current shape asserts the callback is non-undefined. A no-op function passes. Phase 3 extends to all three callbacks but still no real check.
   - WHY: Misleading boot guard — passes if someone wires a `() => Promise.resolve()` placeholder.
   - HOW: Extend the assert to call a `verifyTransport()` method on the adapter at boot (Resend: a `GET /domains` ping; nodemailer: SMTP STARTTLS handshake; in-memory: no-op). Fail boot in staging/prod if the ping fails. Cheap, catches the "env var typo" class of bug before first user hits forget-password.

4. **`/dashboard/staff` route name collides with the `staff` permission namespace.**
   - WHAT: Cosmetic. The "staff" role in `SYSTEM_ROLES` is the lowest-privilege role, but the `/dashboard/staff` page is the _member management_ page (used by owner/admin). Naming confusion will get worse as roles diversify.
   - HOW: Prefer `/dashboard/team` or `/dashboard/members` to match BA's terminology (`member` table). Trivial rename, save the confusion.

## Affirmations

1. **Building the in-memory `CapturedEmailAdapter` for tests + MailHog for dev + Resend for staging/prod is exactly the right shape.** Three-environment adapter split with deterministic assertion in tests and human-visible UI in dev is the highest-leverage choice you could make here — it makes invitation/reset/verification flows testable end-to-end without flake and without burning Resend's free tier on dev work. Don't trade this off for any "simpler" alternative when scope pressure hits.

2. **Plain-text emails for MVP-1, deferring HTML templates to Phase 8 with GNOTIF, is a correct deferral.** The temptation to ship "RestOS-branded" emails for the first paying customer is real but wrong — branded HTML is a non-trivial vertical (responsive table layout, dark-mode, MIME multipart, inlined CSS, Apple-Mail vs. Outlook quirks) and Phase 8 will need it for guest emails anyway. Resist any planner instinct to add "minimal HTML wrapper" to Phase 3.

3. **Role-at-invite-time encoded in token, immutable through accept-flow, is the right call vs. role-at-accept-time.** Eliminates a class of TOCTOU bug (inviter picks `admin`, invitee accepts after inviter is removed → who decides their role?), eliminates the "invitee picks their own role from a dropdown" UX trap, and pairs naturally with BA's existing invitation model. Owner-only-can-grant-owner check at invite-time is the right enforcement point.

4. **Resolving the BLOCKED audit-gap row in Phase 3 rather than waiting for BA upstream is correct triage** — the audit gap is visible to compliance review (first paying customer's procurement might ask) and waiting on a third-party version bump for a multi-month deliverable would be wrong. The _mechanism_ of closure needs scrutiny (see HIGH-3) but the timing is right.
