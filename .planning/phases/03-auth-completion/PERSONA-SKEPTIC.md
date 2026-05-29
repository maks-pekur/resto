# Persona Review: Skeptic — Phase 3 Auth Completion

**Reviewer:** Skeptic
**Date:** 2026-05-28
**Scope:** Implementation decisions captured during /gsd-discuss-phase 3
**Severity scale:** HIGH (must address before planning) | MEDIUM (raise in plan) | LOW (note for execute)

## Summary

Phase 3 is doing too much for a first-paying-customer who almost certainly signs in alone, never invites anybody, never enables 2FA, and reads English. The single highest-value items (AUTH-01 wired-loudly, AUTH-04/05 reset, AUTH-08 cookie flags, AUTH-10 DLQ) are real and load-bearing. The rest — TOTP recovery loops, staff page with role-change UI, role-change audit endpoint, RU localization, custom NestJS workaround for a BA hook gap — is volume that has not earned its complexity at MVP-1.

## Findings

### HIGH

**1. `assertEmailAdapterWired` is a false positive waiting to happen — guard currently passes when invitation and reset are still NOOPs**

- **WHAT:** `apps/api/src/contexts/identity/identity-core.module.ts:28` declares `REQUIRED_EMAIL_CALLBACKS = ['sendVerificationEmail']` — exactly one entry. `auth.config.ts:137` and `:152` default `sendResetPassword` and `sendInvitationEmail` to `() => Promise.resolve()`. If Phase 3 extends the assertion list but the production wiring forgets to pass one callback, BA will silently accept-then-drop the email instead of throwing, because the default never errors.
- **WHY:** The defining failure mode of Phase 3 is "operator clicks 'Resend invitation' in prod, nothing arrives, no log, no exception, support ticket two days later." The guard exists precisely to prevent this and is currently 1/3 effective.
- **HOW:** Phase 3 must (a) extend `REQUIRED_EMAIL_CALLBACKS` to all three, (b) **remove the `?? (() => Promise.resolve())` defaults from `auth.config.ts`** so the only path to a NOOP is `process.env.NODE_ENV === 'development'` explicitly wiring one, and (c) add a boot-time integration test that asserts `loadEnv` + module-construction throws when `staging`/`production` is set and any of the three are missing. The CapturedEmailAdapter pattern only covers test, not the prod-wiring smoke.

**2. Three email adapter modes (Resend / MailHog / in-memory) selected by `NODE_ENV` create a "what if prod boots with `NODE_ENV=development`" failure mode**

- **WHAT:** Plan ships three adapters chosen at composition time by `env.NODE_ENV`. The `prod-guardrails.ts` pattern handles S3 dev defaults, but emails are not on that path. If a deployment misconfigures `NODE_ENV` (forgotten in k8s manifest, defaulted by Next bundling, `tsx` script run against prod DB), the dev fallback wires MailHog SMTP and silently drops every operator invitation.
- **WHY:** Operator-invitation email is the workflow that gates "first paying customer can add their accountant." A silent miss costs the deal.
- **HOW:** Two complementary guards: (i) add Resend adapter selection to `assertProdGuardrails` — assert wired adapter class name when `NODE_ENV in {staging, production}`; (ii) require `RESEND_API_KEY` to be a non-empty env var when `NODE_ENV in {staging, production}` even if you intend to "test" something else, force-fail at boot. Do NOT rely on Resend-side delivery monitoring as the first signal.

**3. Email enumeration through divergent error responses on signup / forgot-password is not on the Phase 3 checklist**

- **WHAT:** Better Auth's default behavior on `POST /api/auth/sign-up/email` and `POST /api/auth/request-password-reset` for an existing-vs-nonexistent email is not documented as identical, and the plan does not include a "must return identical 200 + identical timing" assertion. With per-email rate limit of 5/min on reset (`RATE_LIMIT_AUTH_RESET_PER_EMAIL_PER_MIN`) and 10/min on signin, an attacker can enumerate the operator table by observing 429 boundaries — the per-email bucket only exists for _valid_ emails.
- **WHY:** Operator email leak is the first step in a phishing campaign against a paying restaurant's owner. Cheap to leak, expensive to undo.
- **HOW:** Add explicit AUTH spec item: `POST /api/auth/sign-up/email` and `POST /api/auth/request-password-reset` MUST return identical status + body + ±10ms timing for "email exists" vs "does not." Test with two specs in `identity-audit.e2e.spec.ts` style. If BA does not provide this, wrap the handler.

**4. The custom NestJS `PATCH /v1/identity/members/:id/role` endpoint to close the BLOCKED row is the wrong fix for the wrong moment**

- **WHAT:** `audit-gap.md:16` is explicit that BA 1.4.22 lacks `databaseHooks.member.update.after` so a custom NestJS endpoint is one option. The plan picks the custom-endpoint option AND adds a `/dashboard/staff` UI to drive it AND adds an `identity.role_changed.v1` contract AND extends `ACTION_TARGET_KIND`. All for a tenant universe where there is ONE user (owner). There is no member to change a role for. The endpoint is a UI without users.
- **WHY:** This stacks four artifacts — endpoint, contract, audit map entry, UI page — to satisfy an audit row whose first real consumer (regulator, internal-fraud detective) won't read it for years, and whose first real _write_ won't happen until a tenant has ≥2 members, which the plan itself admits is post-MVP-1 most likely.
- **HOW:** Keep the BLOCKED row BLOCKED. Add a TODO with an explicit re-evaluation trigger: "when first tenant adds a 2nd member with role ≠ owner." Or even cheaper: when a role change actually happens, do it in SQL transaction via a script the founder runs, audited manually, until BA exposes the hook. Cost: 0 LoC. Benefit identical until tenant.members.count > 1.

### MEDIUM

**5. 2FA TOTP with recovery codes + lost-device superior-reset + email-recovery loop for owner is a Year-1 <1% adoption feature with three failure surfaces**

- **WHAT:** AUTH-07 ships TOTP opt-in (BA gives this for free — `auth.config.ts:154` already loads `twoFactor()`), 10 single-show recovery codes, lost-device admin-reset flow, and an email-recovery loop for the owner. The owner email-recovery loop is itself a security regression: anyone who phishes the owner's email mailbox bypasses 2FA entirely, which is the threat model TOTP was supposed to mitigate.
- **WHY:** Restaurant-industry adoption of optional 2FA is empirically <5% even on POS systems that nag aggressively (Toast, Square). For a SaaS in soft launch with one customer, building the lost-device UI today buys a ticket from zero users. The email-recovery loop also negates the entire 2FA value proposition for the most security-sensitive role.
- **HOW:** Ship TOTP enable + recovery codes (BA already does this). Defer the lost-device admin-reset UI to first-paying-customer + 1 quarter. For owner lockout, document a manual support-driven reset (founder runs an SQL script with audit row) — this is exactly what every SaaS does for the first 100 customers. Re-evaluate when MAU ≥ 50.

**6. EN + RU localization is 2x the email template surface for zero RU paying customers in MVP-1**

- **WHAT:** Decision picks EN + RU via Accept-Language for invitation / password-reset / verification emails. Plain text BA defaults are easy; but introducing localization machinery means a string registry, a language detection pipeline, two sets of tested templates, two sets of QA passes when copy changes.
- **WHY:** First paying customer Q1 2027 has no known locale signal. Adding RU on day one because the founder speaks Russian is a personal-comfort optimization, not a product one. When the first RU customer signs up post-MVP-1, adding `ru` is a one-day task with the EN architecture in place. Doing it now doubles the surface for testing this phase.
- **HOW:** Ship EN-only. Land a `getLocale(headers): 'en'` stub that always returns `en`. When the first RU customer signs up, extend the stub. Delete one column of work from Phase 3.

**7. NATS DLQ + `max_deliver` (AUTH-10) is the right thing but is being added to the same phase as TOTP and invitation UI — risk of "everything ships, nothing tested deeply"**

- **WHAT:** AUTH-10 is correct and load-bearing — without `max_deliver`, a poison message will redeliver indefinitely and either melt the subscriber or eat dispatcher capacity. But this is unrelated infrastructure work being bundled with auth UX. Solo founder, single phase, 11 requirements: high risk that DLQ gets a 3-line config + 0 e2e tests because the auth UI ate the week.
- **WHY:** A DLQ that's wired but untested is worse than no DLQ — it silently swallows real errors.
- **HOW:** Either (a) split AUTH-10 into its own phase `3.1`, or (b) make AUTH-10 the _first_ requirement closed in Phase 3 and require an e2e test that publishes a deliberately poisoned envelope and asserts (i) `max_deliver` reached, (ii) message lands in DLQ subject, (iii) audit alert emitted. Mark phase verification gate dependent on this.

**8. Sign-out / password-change propagation across multiple tabs is not in the Phase 3 plan**

- **WHAT:** Phase 02 shipped `BrandTabSync` (`apps/admin/components/brand-tab-sync.tsx`). Phase 03 adds password-reset that revokes all sessions (`auth.config.ts:293` already calls `deleteSessions`). But no Phase 3 requirement adds a SessionTabSync companion: an operator who resets their password while two admin tabs are open will continue using the now-revoked session in the other tab until the next API call returns 401, then probably get a generic error rather than the `?expired=1` flow from Phase 2.
- **WHY:** Real operators leave multiple tabs open all day. After a password change "to be safe," the stale tab is a security smell AND a usability smell.
- **HOW:** Either add SessionTabSync in Phase 3 (mirror BrandTabSync — listen on `storage` event for a `resto.session_revoked` ping written by sign-out and password-reset success handlers), or explicitly defer to Phase 4 with a ticket and accept the gap for MVP-1.

**9. Email bounce / deliverability is not on the Phase 3 plan, but the operator-invitation flow depends on it**

- **WHAT:** Decision picks `noreply@resto.app` and assumes resto.app gets verified in Resend once. No mention of: (a) SPF/DKIM/DMARC configuration verification at boot or in deploy checklist, (b) Resend webhook for bounce/complaint notifications, (c) what happens in admin UI when an invitation lands in a dead inbox (operator typed wrong email).
- **WHY:** The invitation flow is the #1 user journey for AUTH-02/03. A bounce that the operator can't see means they click "Resend" 3x, generating 3 valid tokens, and never figuring out the email was wrong. If DMARC isn't configured, Gmail will reject as `dmarc=fail` — silently, from the operator's perspective.
- **HOW:** Add to Phase 3 plan: (a) explicit pre-deploy checklist item "resto.app SPF/DKIM/DMARC verified at Cloudflare," (b) Resend webhook handler that flips invitation status to `bounced` in DB and surfaces in the invitation list, (c) UI affordance "this invitation bounced — fix the email and re-send." If you defer (b)+(c) say so explicitly and own that operator-facing failure mode for MVP-1.

**10. Resend free tier is 3,000/month / 100/day — fine for MVP-1 but the rate-limit ceiling collides with rate-limit settings**

- **WHAT:** Phase 3 wires Resend without an explicit plan for what happens on (a) free-tier monthly cap exhaustion (3,000 emails/month at last published tier), (b) daily cap (100/day on free tier), (c) Resend transient 5xx during onboarding. Per-IP signup rate limit is 5/min and per-email reset rate limit is 5/min — an attacker triggering the reset bucket 100x in a single minute against valid emails (e.g. scraped from LinkedIn) doesn't hit the rate limit but does eat the daily Resend cap.
- **WHY:** A daily Resend cap of 100 + 5 reset/min/email \* 20 known operator emails = 100 emails in 1 minute. Cap exhausted. New legitimate signups now silently fail send.
- **HOW:** Add to plan: (a) at-startup log of Resend tier/limit, (b) document threshold at which to upgrade (e.g., before any marketing push), (c) circuit-breaker around Resend client that emits structured WARN log on 4xx-rate-limit, (d) consider whether the per-email rate limit of 5/min should be lowered to 1/min for reset specifically. Cheap controls.

### LOW

**11. AUTH-11 (WeakMap refactor of `__restoSignOut` context stash) is pure tech debt — defer it**

- **WHAT:** AUTH-11 swaps a `(ctx as { __restoSignOut?: ... }).__restoSignOut` cast (`auth.config.ts:222-230`) for a `WeakMap<object, Stash>`. Zero behavior change. Zero user benefit. Zero impact on first paying customer.
- **WHY:** It's in Phase 3 only because it's "near" the BA hooks. Doing it in any future phase has the same effect. Doing it now is volume.
- **HOW:** Move to a future "tech debt sweep" phase or do it opportunistically when another change touches the same lines. Reclaim ~half a day for Phase 3 verification depth.

**12. The "owner role only available to owner-tier inviter" rule is correct but needs a regression test**

- **WHAT:** Decision says owner role at invite time is only selectable by an owner-tier inviter. `system-roles.ts:13` gives `owner` the `staff: ['invite', 'remove', 'role:create', 'role:update']` permission. Without a passing regression test, a future admin-permission tweak (which the system-roles CLAUDE.md explicitly warns against) silently lets admin promote to owner.
- **WHY:** A single tenant.delete permission leaked to admin via a permission-bag bug is catastrophic.
- **HOW:** Add explicit unit test in the AUTH-09 plan: "admin attempting to invite with role=owner returns 403; only owner can." Pin to assertion structure.

**13. `/dashboard/staff` page in MVP-1 — single page for invite + pending list + revoke + role-change is high surface for an empty audience**

- **WHAT:** The page conflates four operations. For an MVP-1 tenant with 1-3 users, the operator hits this page once, invites one accountant, never returns. The pending-invitations table, revoke flow, and role-change dropdown are all built but never exercised.
- **WHY:** Building UX for 4 operations vs 1 is roughly 4x the spec/QA/Playwright burden for a page that's seldom-visited.
- **HOW:** Ship a stripped `/dashboard/staff` with: list members, "Invite" button → modal with email+role. Defer pending-invitations table, revoke button, in-place role-change to the first phase where >1 tenant has >2 members. Pending invitation that the operator wants to revoke can be handled by "let it TTL (48h) and re-send if needed" — Better Auth's defaults are doing the work.

## Things you might want to remove from scope

1. **AUTH-07 lost-device + email-recovery flow for owner** — Ship TOTP enable + recovery codes (BA already gives this for free). Defer the recovery UX. Document manual founder-side recovery for the first 100 customers. Saves 2-3 days; <1% will use the feature in Year 1.

2. **AUTH-09 custom `PATCH /v1/identity/members/:id/role` + `identity.role_changed.v1` contract + audit map entry** — Keep the BLOCKED row BLOCKED with an explicit re-eval trigger ("when first tenant adds a 2nd member with role ≠ owner"). Ship only the role-seeding migration half of AUTH-09. The audit-row consumer (regulator, internal fraud detective) doesn't exist for years, and the writer (multi-member tenant) doesn't exist in MVP-1.

3. **RU localization of operator emails + `/dashboard/staff` four-operation UI (pending/revoke/role-change)** — Ship EN-only with a `getLocale(): 'en'` stub. Ship `/dashboard/staff` as a minimal "list + invite modal." Defer revoke and in-place role-change to the phase where >1 tenant has >2 members. Combined saves ~3 days; loses zero confirmed customer value.

## What we're assuming but haven't tested

- **That first paying customers (Q1 2027) will actually use the invitation flow.** First customers per the project brief are 1-3 location restaurants with 1 owner + 2-5 staff. But it has not been validated whether the owner invites staff as RestOS users at all, or whether the owner is the only RestOS account-holder and "staff" means in-restaurant cooks who never touch the admin panel. If the latter, AUTH-02/AUTH-03/staff UI is YAGNI for the first 20 paying customers.

- **That `assertEmailAdapterWired` with three callbacks listed will actually fire on a misconfigured production deploy.** The current implementation gates on `NODE_ENV in {staging, production}`. We haven't tested what happens when (a) `NODE_ENV` is `undefined` (Zod default kicks in to `development`, guard never fires), (b) the deploy is `test` env but routed at real users by accident, (c) the host k8s pod inherits the wrong env from a sibling deployment.

- **That BA's defaults for sign-up + reset don't leak account existence via response divergence.** No e2e test in the existing codebase asserts identical responses for "email exists" vs "doesn't" on either endpoint. Assumed but unverified.

- **That Resend's free tier (100/day, 3k/month) is acceptable for the entire pre-launch + first-customer period.** Worth confirming: if soft launch generates 200 sign-ups in week 1 (each triggering verification + welcome + possibly reset), free tier exhausts in 12h. No backpressure plan.

- **That the `twoFactor()` plugin enabled in `auth.config.ts:154` is actually a no-op until a user opts in.** Confirmed by reading BA docs would be cheap; if the plugin enables enforcement-by-default for any session, that's an MVP regression for the operator who signs in and is forced into TOTP they don't want.

- **That `databaseHooks.member.update.after` has not landed in BA between 1.4.22 (pinned) and current upstream.** The plan to ship a custom endpoint workaround assumes the BA gap persists. If BA 1.5 or 1.4.23 added the hook, the cheaper fix is to bump BA + wire the hook (with re-running tenancy hardening invariants). Worth checking before committing to the custom endpoint route.
