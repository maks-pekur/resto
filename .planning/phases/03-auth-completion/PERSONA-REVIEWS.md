# Persona Reviews — Phase 3 Auth Completion (Security Core)

**Date:** 2026-05-29
**Reviewers spawned:** persona-cto, persona-skeptic (per ROADMAP Phase 3 + PROJECT.md persona convention)
**Inputs:** captured decisions from `/gsd-discuss-phase 3` (email transport, invitation flow UX, 2FA defaults, AUTH-09 workaround)
**Raw artifacts:** `PERSONA-CTO.md`, `PERSONA-SKEPTIC.md` (full structured reviews — read those for evidence; this file is the consolidated planner-facing aggregate)

---

## Verdicts

| Reviewer | Posture                                                       | Counts                 | Top concern                                                            |
| -------- | ------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------- |
| CTO      | Yellow with one structural red flag                           | HIGH 3 / MED 4 / LOW 4 | Scope is ~1.5–2 phases of solo work; split before planning             |
| Skeptic  | Doing too much for a first-paying-customer who signs in alone | HIGH 4 / MED 6 / LOW 3 | `assertEmailAdapterWired` false-positive (NOOP defaults silently pass) |

Convergence between the two reviewers was sharper than typical — every HIGH finding mapped to a concrete planner-actionable item, with three on-which the user delivered an explicit decision (scope split, RU localization, AUTH-09 endpoint) and the rest applied unilaterally.

---

## User Decisions on Reviewer Recommendations

> All three were presented as explicit options after both reviews landed. Source: `03-DISCUSSION-LOG.md`.

| #   | Question                                                                                            | User picked                                                                | Effect on Phase 3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Scope cut — CTO 3a/3b split vs Skeptic per-item cuts vs keep                                        | **CTO 3a/3b split**                                                        | Phase 3 rescoped as "Auth Completion (Security Core)"; new Phase 17 "Operator Self-service Polish" appended post-MVP-1 to hold full /dashboard/team page + AUTH-07 lost-device UX (see ROADMAP + REQUIREMENTS TEAM-01..05).                                                                                                                                                                                                                                                                                                                                                |
| 2   | RU localization in MVP-1 — keep vs EN-only stub                                                     | **Keep EN+RU**                                                             | Implementation goes through `getLocale(headers)` helper that does Accept-Language detection (en/ru, fallback en); both message files ship in Phase 3.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 3   | AUTH-09 role-change endpoint — keep direct mutation, switch to BA server-side API, or drop entirely | **Drop entirely** (Skeptic variant) — **REVISED 2026-05-29 post-research** | Original decision: ship role-seeding only, keep BLOCKED row in `audit-gap.md` with "BA ≥ 1.5 hook" trigger. Research overturned the basis: `organizationHooks.afterUpdateMemberRole` ALREADY exists in BA 1.4.22 (`types.d.mts:520`, independently verified). Revised decision (user ratified): Phase 3 NOW wires the hook (~½ day, no UI, no custom endpoint) and closes the BLOCKED row. Skeptic's anti-endpoint argument still stands — the hook is NOT an endpoint, no UI surface added; Phase 17 / TEAM-03 reduces to UI-only since audit envelope is wired upstream. |

---

## Convergent Findings — Applied Unilaterally to Phase 3 Plan

> Both reviewers agreed; the decisions below are now mandatory inputs for `gsd-planner` and `gsd-phase-researcher`.

### Email adapter & boot guards (HIGH severity in both reviews)

1. **Extend `REQUIRED_EMAIL_CALLBACKS`** in `apps/api/src/contexts/identity/identity-core.module.ts:28` to all three callbacks (`sendVerificationEmail`, `sendResetPassword`, `sendInvitationEmail`).
2. **Remove the `?? (() => Promise.resolve())` defaults** in `auth.config.ts:137` and `:152`. The only path to a NOOP must be `NODE_ENV === 'development'` explicitly wiring one.
3. **Extend `assertProdGuardrails`** to assert non-empty `RESEND_API_KEY` AND wired adapter class name when `NODE_ENV ∈ {staging, production}`. Force-fail at boot.
4. **Add boot-time integration test** that asserts `loadEnv` + identity module construction throws when staging/production env has any of the three callbacks missing.
5. **Resend adapter retry-with-backoff inside the adapter**: 3 attempts, jittered, 250ms→1000ms→4000ms, total budget < 6s. On terminal failure, emit `identity.email_dispatch_failed.v1` envelope through outbox + surface as `MEDIUM` follow-up on a future admin observability view. (Keeps BA's happy path synchronous, adds an audit + observability tail without the "swallow Resend outage silently" failure mode.)
6. **Email-enumeration parity** on `POST /api/auth/sign-up/email` and `POST /api/auth/request-password-reset`: identical status + body + ±10ms timing for "email exists" vs "does not." E2e test in `identity-audit.e2e.spec.ts` style for each endpoint. Wrap the BA handler if BA's defaults diverge.

### Email adapter wiring details (MEDIUM in CTO)

7. **Tenant binding on email dispatch path** — Email adapter takes `tenantId` as an explicit constructor / call arg derived from the BA invitation or session row (organizationId), uses `db.withTenantId(tenantId, ...)` for any audit / failure row. Never relies on ALS. This becomes the third precondition in `assertEmailAdapterWired` (verify the adapter has a tenant-scoped emit path).

### NATS DLQ (MEDIUM in Skeptic, structural)

8. **AUTH-10 ships first in the wave order**, NOT last. Plan must enforce wave dependency: e2e poison-message test (publish deliberately broken envelope → assert `max_deliver: 5` reached → assert message lands in `dlq.<subject>` → assert alert envelope emitted) is the gating test before any other AUTH-\* requirement is marked complete.

### Per-tenant sign-in rate limit (MEDIUM in CTO)

9. **Add `RATE_LIMIT_AUTH_SIGNIN_PER_TENANT_PER_MIN` env** (default 60). Implement on sign-in route by extracting tenant from `x-tenant-slug` or organization being signed into; on miss fall back to per-IP + per-email. Document tuning runbook line for known-large onboarding events.

### GDPR retention on auth tables (MEDIUM in CTO)

10. **Daily sweep job:** `DELETE FROM invitation WHERE expires_at < now() - 30d AND status IN ('expired','revoked','accepted')` (or soft-archive variant); confirm `verification` rows are deleted by BA itself on consumption and add same TTL sweep for stale rows. Document as part of GDPR retention story.

### 2FA UX trim (HIGH in CTO, MED in Skeptic)

11. **Remove the email-recovery loop for owner-role lost-device.** This collapses 2FA to "email && TOTP" which is no stronger than email alone for the account-takeover threat model. MVP-1 stance: 2FA optional; recovery via 10 codes shown once on enable; if codes AND device lost → manual support-driven reset by founder (runbook item, not a Phase 3 deliverable). Lost-device admin-reset for subordinates ships in Phase 17 / TEAM-04.

### SPF/DKIM/DMARC + bounce handling (MEDIUM in Skeptic)

12. **Pre-deploy checklist item**: `resto.app` SPF + DKIM + DMARC verified at the DNS provider (Cloudflare). Without this, Gmail will silently `dmarc=fail` operator invitations.
13. **Resend bounce-webhook handler** that flips invitation status to `bounced` in DB and surfaces in invitation list with affordance to fix-and-resend. If deferred, must be deferred explicitly and documented as a known MVP-1 operator-facing failure mode.

### Convention fits (LOW)

14. **Route rename:** `/dashboard/staff` → `/dashboard/team` (avoid collision with the `staff` role namespace). Applies to both Phase 3 minimal-invite-form route AND Phase 17 full team page.
15. **Role-seed mechanism:** NestJS bootstrap step in `apps/api/src/main.ts` that runs once at boot after migrations (idempotent UPSERT with WHERE NOT EXISTS), OR a generated static SQL migration committed to `packages/db/migrations/` — NOT a TS-importing Drizzle migration (that would create a `@resto/domain` dependency at the `pnpm db:migrate` boundary).
16. **`assertEmailAdapterWired` health check:** Extend the assertion to call a `verifyTransport()` method on the adapter at boot (Resend: `GET /domains` ping; nodemailer: SMTP STARTTLS handshake; in-memory: no-op). Fail boot in staging/prod if the ping fails.
17. **Owner-only-can-grant-owner regression test** in AUTH-09 — admin attempting to invite with `role=owner` returns 403; only owner can. Pin to assertion structure.

### LOW deferrals / assumption flags

18. **AUTH-11 (WeakMap refactor of `__restoSignOut` context stash) — kept in Phase 3** because both reviewers acknowledge it's near the BA hooks that Phase 3 already modifies; doing it now is opportunistic. If wave order pressure surfaces, it's the first candidate to slip to Phase 17 or a tech-debt sweep — Skeptic marks it as the cheapest cut (LOW-11).
19. **Email localization caveat (CTO LOW-1):** BA's invitation send originates from the inviter's request, so `Accept-Language` is the inviter's browser, not the invitee's. An EN-speaking admin inviting an RU-speaking new operator → RU operator gets EN email. Accepted limitation; proper fix (per-user `locale` BA additionalField) deferred to MVP-2 CRM phase.
20. **Verify before planning:** Skeptic-flagged assumption — check whether `databaseHooks.member.update.after` landed in Better Auth between 1.4.22 (pinned) and current upstream. If it did, the cheaper path is to bump BA + wire the hook in Phase 17 (instead of the `auth.api.updateMemberRole` shim). Reseacher should confirm before Phase 17 plans.
21. **Verify before planning:** Skeptic-flagged assumption — check current Resend free-tier rate limit (3,000/month, 100/day at last published tier). Document startup log of Resend tier/limit and an upgrade-threshold runbook line.
22. **Verify before planning:** Skeptic-flagged assumption — confirm BA `twoFactor()` plugin enabled in `auth.config.ts:154` is a no-op until user opt-in (i.e., does NOT enforce TOTP by default for any session). MVP regression if it does.

---

## Affirmations Recorded (CTO)

Solo founder is the entire validation surface for these calls — recording them keeps the persona-substitution audit trail honest.

1. **Three-environment email adapter split (Resend / MailHog / `CapturedEmailAdapter`) is the right shape.** Deterministic test assertions + human-visible dev UI + production transport — highest-leverage choice. Don't trade away under scope pressure.
2. **Plain-text emails for MVP-1, HTML deferred to Phase 8 GNOTIF.** Branded HTML is a non-trivial vertical (responsive table layout, dark-mode, MIME multipart, inlined CSS, Apple-Mail vs. Outlook). Resist any planner instinct to add "minimal HTML wrapper" to Phase 3.
3. **Role-at-invite-time encoded in token, immutable through accept.** Eliminates TOCTOU bug class and the "invitee picks own role" UX trap; pairs with BA's existing invitation model; owner-only-can-grant-owner is the right enforcement point.
4. **Resolving the BLOCKED audit-gap row before relying on a BA upstream version bump was correct triage** — but the chosen mechanism (custom direct-mutation endpoint) was wrong. User picked Skeptic's "keep BLOCKED with explicit re-eval trigger" which is even more conservative. Both pass the triage test; the final shape is even safer.

---

## Things Considered for Scope Removal — Decisions

| Item                                                                   | Persona challenge                                          | Decision                                                                                                                                    |
| ---------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Email-recovery loop for owner 2FA lost-device                          | Both: cancels 2FA security gain                            | **Removed.** Manual founder-side recovery via runbook.                                                                                      |
| Custom `PATCH /v1/identity/members/:id/role` endpoint + audit emission | Both: unused users in MVP-1 + risk of privilege escalation | **Removed from Phase 3.** Deferred to Phase 17 / TEAM-03 with `auth.api.updateMemberRole` shape.                                            |
| Full `/dashboard/staff` page (list + pending + revoke + role-change)   | Both: 4 operations for an empty audience                   | **Removed from Phase 3.** Phase 3 ships minimal invite form in `/dashboard/settings`. Full `/dashboard/team` page → Phase 17 / TEAM-01..02. |
| Lost-device admin-reset UI for 2FA                                     | Both: <1% adoption Year 1                                  | **Removed from Phase 3.** Phase 17 / TEAM-04.                                                                                               |
| EN + RU localization                                                   | Skeptic only: 0 known RU paying customers in MVP-1         | **Kept** (user override). Justification: founder is RU; soft-launch cohort likely RU; 6 strings × 2 languages is not the budget driver.     |
| AUTH-11 WeakMap refactor                                               | Skeptic LOW: pure tech debt                                | **Kept** (CTO + planner discretion — opportunistic, near the touched BA hook code). First candidate to slip if wave pressure surfaces.      |

---

## What's NOT In Phase 3 (Explicit Out-of-Scope)

- Full `/dashboard/team` page (Phase 17 / TEAM-01..02)
- Custom NestJS `PATCH /v1/identity/members/:id/role` endpoint (Phase 17 / TEAM-03 via `auth.api.updateMemberRole`)
- In-place role-change UI (Phase 17 / TEAM-03)
- 2FA lost-device admin-reset UI for subordinates (Phase 17 / TEAM-04)
- 2FA recovery code regeneration UI (Phase 17 / TEAM-05)
- Email-recovery loop for owner 2FA (out of scope entirely — see decision above)
- Branded HTML email templates (Phase 8 GNOTIF)
- Per-tenant email domain (Phase 8 GNOTIF)
- Per-user explicit `locale` BA additionalField (MVP-2 CRM phase)
- Resend bounce-webhook with admin UI affordance — deferred IF the planner sizes this as Phase 3 overflow; otherwise included with the SPF/DKIM/DMARC checklist item. **Planner decides.**

---

_Generated 2026-05-29 — aggregates `PERSONA-CTO.md` + `PERSONA-SKEPTIC.md` with the three user decisions from `03-DISCUSSION-LOG.md`. This file is the planner-facing input; raw reviewer artifacts remain available alongside for evidence trail._
