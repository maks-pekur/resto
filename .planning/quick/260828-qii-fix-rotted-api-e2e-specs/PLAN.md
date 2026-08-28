---
quick_id: 260828-qii
slug: fix-rotted-api-e2e-specs
date: 2026-08-28
branch: fix-rotted-api-e2e-specs
---

# Fix the 6 rotted apps/api e2e specs

Source: the full e2e audit of 2026-08-28 (`.planning/notes/e2e-audit-2026-08-28-findings.md`).
56 of 65 specs green; these 6 are rot — stale test payloads, not production defects.

**Test files only. No `src/` changes.** Every production behaviour these specs trip
over was verified during the audit to be correct and deliberate.

## Task 1 — `country` replaces `defaultCurrency` (5 specs, 11 sites)

D-32/D-34 made `country` required on tenant provisioning and dropped
`defaultCurrency` (currency and locale derive from country). `ProvisionTenantInputSchema`
(apps/api/src/contexts/tenancy/application/dto.ts:5). Zod strips the unknown
`defaultCurrency` silently; the 400 is the missing required `country`.

    audit-pipeline.e2e.spec.ts        40, 77, 119
    tenancy.e2e.spec.ts               34 (buildBody const), 159, 175, 200, 254, 262
    tenancy-offboarding.e2e.spec.ts   29
    tenancy-erasure.e2e.spec.ts       33

Replace `defaultCurrency: 'USD'` with `country: 'GB'`, matching sibling specs
(catalog-presign-degraded, host-resolution, order-cancel-refund).
Verified: no spec asserts on the response currency, so no assertion churn.

## Task 2 — `identity-email-verification.e2e` repointed to the live signup route

The "triggers sendVerification on BA sign-up email path" test posts to
`/api/auth/sign-up/email`, which D-29 deliberately closed (403
`signup.direct_disabled`, auth.config.ts:460). The block names its replacement.

Repoint to `POST /v1/signup` with `{ name, email, password, country: 'GB' }`
(SignUpInputSchema, identity/application/dto.ts:36), expect 201, keep the
verification-email assertion unchanged.

Verified during the audit that this reaches the adapter:
`emailVerification.sendOnSignUp: true` (auth.config.ts:213), SignUpService calls
`auth.api.signUpEmail`, and server-side `auth.api.*` calls pass no `ctx.request`
so the D-29 hook returns early.

## Task 3 — `payment-lifecycle.e2e` currency made self-consistent

The spec holds three disagreeing sources: `makeFakeTenantSnap` (35-36) GBP,
db seed (98-99) country GB + EUR, orders EUR. The service reads the injected
mock, so an EUR order meets a GBP tenant and `CurrencyMismatchError` fires —
the guard working correctly.

Make all three agree on ES/EUR (orders and the seeded currency are already EUR,
so this is the smallest change).

## Verification

Each of the 6 specs run in its own vitest process (batching produces false
failures — established anti-pattern). Plus the 3 previously-green neighbours most
likely to be disturbed by a shared-fixture edit.

Do NOT source `.env` expectations into assertions: it sets
`RATE_LIMIT_AUTH_SIGNIN_PER_MIN=1000` against a schema default of 10. Irrelevant
to these six, but it is what made `security.e2e` look like a regression.

## Out of scope

- the `admin`-role product decision (`identity-role-changed.e2e`)
- the offboard-cancel 403 (`tenants-controller.e2e`) — needs `/gsd-debug`
- the 500-instead-of-403 throws in `beforeUpdateMemberRole` — separate task
- putting api:e2e into CI
