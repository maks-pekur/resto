# api e2e audit — findings (2026-08-28, main @ 81bb3160)

## audit-pipeline.e2e.spec.ts — 3/3 red — ROT, not a defect

All three tests fail identically at the provisioning call, `expected 400 to be 201`.
The audit pipeline itself is never exercised — the suite dies on its own setup.

Cause: the spec's `POST /internal/v1/tenants` payload predates the country/currency
model change.

    sends:    { slug, displayName, defaultCurrency: 'USD', locale: 'en' }
    schema:   ProvisionTenantInputSchema  (apps/api/src/contexts/tenancy/application/dto.ts:5)
              { slug, displayName, country: CountryCodeValue (REQUIRED), locale?, status? }

`defaultCurrency` no longer exists (stripped silently by zod); `country` is required and
absent -> 400. `CountryCodeValue` is `z.enum(['UA','GB','ES'])` — 'USD' would not be a
valid value anyway.

Fix: 3 call sites in the spec (lines ~40, ~78, ~120), replace
`defaultCurrency: 'USD'` with `country: 'GB'`, matching every sibling spec
(catalog-presign-degraded, host-resolution, order-cancel-refund, ...).

Confidence: high. Zero production code involved.

## identity-email-verification.e2e.spec.ts — 1 of 2 red — ROT, deliberate closure

Test: "triggers sendVerification on BA sign-up email path".
Fails `expected [200,201] to include 403` at line 74 — note **403**, not the 400
the handoff recorded. The 400 was from the abandoned repair attempt against
`/v1/signup`; the unmodified spec gets 403.

Cause: the spec posts to `POST /api/auth/sign-up/email`, which D-29 deliberately
closed (auth.config.ts:460). The before-hook throws
`FORBIDDEN / signup.direct_disabled` unless the email has a pending, unexpired
invitation. Message names the replacement: "Create an account via POST /v1/signup."

This is a load-bearing security control working as designed. The test asserts a
route that was intentionally removed -> rot.

### Resolves the handoff's open question ("400 needs the AUTH-06 contract re-read")

`SignUpInputSchema` (identity/application/dto.ts:36) is:
{ name (2..120), email, password (12..128), country: CountryCodeValue }

`country` is REQUIRED. The earlier repair almost certainly omitted it -> 400.
No contract re-read needed; it is a missing required field.

### ROOT CAUSE SHARED WITH audit-pipeline

Both reds are the same rot: **`country` became a required field and the e2e
payloads were never updated.** D-32/D-34 made currency+locale derive from
`country`; `defaultCurrency` was dropped. Two suites still send the old shape.

This is the third instance of the anti-pattern the checkpoint already names
("verification that stops at static gates") — a request contract changed, the
`test/` callers were not grepped, and nothing caught it because api:e2e is not
in CI. It is the strongest argument for closing that CI gap.

### Repair sketch (NOT applied — needs a GSD task + review)

Point the test at `POST /v1/signup` with `{ name, email, password, country: 'GB' }`,
assert 201, then assert the captured verification email. The suite reads the
adapter off `stack.app`, and `/v1/signup` runs in that same Nest context, so the
"runBootstrap has its own context" problem noted in the handoff does NOT apply to
this test. Must first confirm SignUpService triggers sendVerificationEmail.

## identity-role-changed.e2e.spec.ts — 1/1 red — KNOWN product decision

## + A SECOND, UNRECORDED DEFECT (worth fixing on its own)

### (a) the known part

Confirmed as the parked admin-role bug: promoting to `admin` is refused because
`SYSTEM_ROLES.admin` carries `staff:['remove']`, `containsNonDelegatable` matches,
`beforeUpdateMemberRole` rejects. Blocked on the founder decision in
.planning/todos/pending/admin-role-cannot-be-assigned.md. Nothing to fix here
until that call is made.

### (b) NEW — the refusal returns 500, not 403

The test's actual assertion failure is `expected [200,201] to include 500`.
Not 403. The authorization refusal reaches the client as a SERVER ERROR.

Cause: `beforeUpdateMemberRole` throws NestJS `ForbiddenException` from inside a
Better Auth hook. BA's router (better-call) only understands its own `APIError`;
anything else is an unhandled throw, so it logs `# SERVER_ERROR` and returns 500.
The BA error object even carries `status: 403, code:'role.insufficient_permissions'`
— that intent is discarded on the wire.

Evidence this is the outlier, not the convention — same integration:
auth.config.ts:292, 299, 306 throw new ForbiddenException <-- all 3 in
beforeUpdateMemberRole
auth.config.ts:487 throw new APIError('FORBIDDEN') correct
organization-switch.plugin.ts:37,51,61 throw new APIError(...) correct
4 correct sites vs 3 wrong ones, all 3 wrong in a single hook.

Why it matters beyond the test:

- every legitimate role-change refusal looks like a server fault to the admin UI,
  which cannot show the operator a real reason;
- `ProblemDetailsFilter` redacts `detail` on 5xx (RES-175), so the reason is
  actively stripped from the body — the client gets nothing to act on;
- fake 5xx pollute Sentry and any alerting keyed on server-error rate.

Fix: swap the 3 throws to `new APIError('FORBIDDEN', { code, message })`, matching
line 487. Mechanical, in-repo precedent, independent of the product decision —
all three refusal paths (unverifiable role, unknown/archived slug, non-delegatable)
are wrong the same way, and the other two are reachable WITHOUT the admin question
being settled.

### email-verification repair — caveat resolved, path is viable

Verified rather than assumed:

- `emailVerification.sendOnSignUp: true` is still set (auth.config.ts:213-218)
  and `sendVerificationEmail` is wired from opts, so the adapter is reachable.
- `SignUpService` calls `auth.api.signUpEmail` (signup.service.ts:193-195
  discriminates 'signUpEmail' vs 'addMember' failure stages).
- Server-side `auth.api.*` calls pass no `ctx.request`, so the D-29 before-hook
  returns early and does NOT block them — the same escape hatch
  bootstrap-owner.service.ts relies on.

So `POST /v1/signup` reaches signUpEmail, which fires sendOnSignUp, which lands in
the captured adapter on `stack.app`. Repair is a payload+URL change in the test,
no production change. One caveat remains benign: `executeOrTimeEqualize` swallows
SignupEmailAlreadyExistsError, irrelevant for a fresh randomUUID email.

## payment-lifecycle.e2e.spec.ts — 1 of 6 red — ROT — **_ NOT ON THE KNOWN-RED LIST _**

New. Would have been invisible to the checkpoint's own audit script, which
collapses any line containing "passed (" — this one reads
`Tests 1 failed | 5 passed (6)`.

Failure: step 2 (checkout -> requires_action + payment row)
CurrencyMismatchError: Order currency "EUR" does not match tenant
settlement currency "GBP".
create-checkout-payment.service.ts:70

The spec holds THREE disagreeing sources of tenant currency:
line 35-36 makeFakeTenantSnap -> country 'GB', defaultCurrency 'GBP' (the MOCK)
line 98-99 db seed -> country 'GB', defaultCurrency 'EUR' (impossible pair)
line 123/148/162 orders -> currency 'EUR'
The service reads the injected `makeTenantRepoMock` (GBP), not the seeded row, so
an EUR order meets a GBP tenant and the guard fires.

Ruled out, not assumed: the repository reads the column directly
(tenant-drizzle.repository.ts:354 `Currency.parse(row.defaultCurrency)`), and there
is no DB trigger deriving currency — so the GBP can only have come from the mock.

Same root cause family as the other two: when `country` joined TenantSnapshot
(D-32/D-34), the fixture's currency was corrected to GBP to match 'GB', and the
EUR orders + EUR db seed in the same file were left behind.

PRODUCTION IS CORRECT. `CurrencyMismatchError` is a money-path guard doing its job
— refusing to charge in a currency the tenant cannot settle. Nothing to fix in src.

Real consequence: the checkout step-2 path (order -> requires_action + payment row
written) has had NO passing e2e coverage for however long this has been red. On the
money path. That is the cost of api:e2e being out of CI, stated concretely.

Fix: make the three agree. Cheapest is country 'ES' + currency 'EUR' everywhere
(orders and db-seed currency are already EUR; change mock GBP->EUR and country
GB->ES in the two fixtures). Alternative: move the orders to GBP.

## security.e2e.spec.ts — 1 of 9 red — **_ FALSE POSITIVE. HARNESS ARTIFACT. NOT A DEFECT _**

Test: "a rotating session cookie cannot mint fresh sign-in buckets".
`expected -1 to be greater than or equal to 0` — the rate limit never fired in 12
attempts. Reads like a security regression. IT IS NOT.

Cause is the audit harness itself. The runner does `set -a; . ./.env; set +a`, and
the root .env carries:
.env:73 RATE_LIMIT_AUTH_SIGNIN_PER_MIN=1000
.env:74 RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN=1000
The schema default is 10 (env.schema.ts:258). The test loops 12 times and expects a
429 by attempt 10 — against a ceiling of 1000 it cannot possibly trigger.

PROVEN, not reasoned: re-ran the spec with the two vars at their schema defaults,
everything else identical -> Tests 9 passed (9), the rotating-cookie test green.

The per-IP sign-in limiter is working. No production issue.

### This invalidates part of the audit method — including the checkpoint's own script

The command in .continue-here.md carries the same `. ./.env` line, so the previously
recorded audit would have produced this same false red.

Consequence for the CI question, which is the whole point of this audit:
**some specs pass or fail purely on which env is loaded.** In CI there is no root
.env, so schema defaults apply and this spec passes; locally with .env it fails.
Any api:e2e CI job must therefore pin rate-limit env explicitly rather than inherit
a developer .env — otherwise the job is green in CI and red on every laptop, which
is how a suite stops being trusted.

Remaining reds must each be checked for the same env sensitivity before being
called defects.

## tenancy.e2e / tenancy-erasure.e2e / tenancy-offboarding.e2e — ROT, same country cause

All three fail `expected 400 to be 201` on `POST /internal/v1/tenants`, sending the
identical dead payload:
tenancy-erasure.e2e.spec.ts:33 defaultCurrency: 'USD', no country
tenancy-offboarding.e2e.spec.ts:29 defaultCurrency: 'USD', no country
tenancy.e2e.spec.ts:34,159,175,200 defaultCurrency: 'USD', no country
Same fix as audit-pipeline: drop defaultCurrency, add country: 'GB'.

## tenants-controller.e2e.spec.ts — 1 of 21 red — **_ UNRESOLVED. CANDIDATE REAL DEFECT _**

Test: DELETE /v1/tenants/me/offboard "returns 200 and clears offboardingScheduledAt
for owner" -> expected 403 to be 200.

The owner schedules offboarding (POST, asserted 202, PASSES) and is then refused
403 on the cancel, seconds later, with the SAME cookie and slug.

What is established:

- Reproducible IN ISOLATION (`-t` single test, fresh tenant/owner/session,
  20 others skipped) -> NOT cross-test pollution, NOT order dependence.
- Both routes carry identical `@Permissions({ tenant:['delete'] })`
  (tenants.controller.ts:77 and :100).
- The neighbouring "403 for non-owner (admin)" tests pass on BOTH routes, so the
  gate itself functions.
- The domain EXPECTS this to work: `cancelOffboarding` (tenant.aggregate.ts:283)
  requires status === 'pending_offboarding', which is exactly what
  `scheduleOffboarding` just set.
- It is NOT a domain error surfacing: both TenantOffboardingNotAllowedError and
  TenantOffboardingCoolOffExpiredError map to 409, not 403 (error-mapping.ts:41-46).
- It is NOT TenantSuspendedError (the only tenancy error mapping to 403) — that
  class is defined and mapped but never thrown anywhere in src.
- PermissionsGuard has no tenant-status logic; it delegates to
  BetterAuthPermissionChecker -> auth.api.hasPermission.
- No tenant-status filter found in the BA store adapters.

By elimination the 403 is the guard's own `auth.forbidden` — the owner genuinely
fails the tenant:delete check on the second call. The mechanism is NOT identified.
The refusal code could not be confirmed from the captured log (4xx problem bodies
are not in the captured output).

NOT GUESSING FURTHER. This needs /gsd-debug.

Why it matters if real: scheduling offboarding flips the tenant to
'pending_offboarding', and the cancel path is the 30-day cool-off rescue. If an
owner cannot cancel, a tenant that requests deletion cannot reverse it through the
API — a GDPR-cool-off path that exists precisely to be reversible.

Priority: highest of the audit, jointly with the 500-vs-403 role-change defect.
