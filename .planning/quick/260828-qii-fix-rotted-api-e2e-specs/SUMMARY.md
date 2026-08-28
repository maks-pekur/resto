---
quick_id: 260828-qii
slug: fix-rotted-api-e2e-specs
date: 2026-08-28
status: complete
branch: fix-rotted-api-e2e-specs
commits: [3d84f97a, 2e22e773, 3d9f6c59]
---

# Summary — 6 rotted e2e specs repaired

All six now green, each verified in its own vitest process. **Test files only; no
`src/` change.** Every production behaviour these specs tripped over was confirmed
correct during the audit and left alone.

| spec                        | before        | after     |
| --------------------------- | ------------- | --------- |
| audit-pipeline              | 3 failed (3)  | 3 passed  |
| tenancy                     | 5 failed / 9  | 9 passed  |
| tenancy-offboarding         | 7 failed / 11 | 11 passed |
| tenancy-erasure             | 4 failed (4)  | 4 passed  |
| identity-email-verification | 1 failed / 2  | 2 passed  |
| payment-lifecycle           | 1 failed / 6  | 6 passed  |

Neighbours re-checked and still green: payments-isolation 5, order-cancel-refund 9,
signup 6, tenant-onboarding 3. `api:typecheck` and `api:lint` pass.

## What was done

**1. `country` replaces `defaultCurrency` — 11 sites, 4 specs.** Mechanical, per
D-32/D-34. No spec asserted on the response currency, so no assertion churn.

**2. `tenancy-erasure` needed more than the payload fix.** The payload change took
it from 4 red to 2; the remaining two failed on `AUDIT_ERASURE_SALT must be set`.
That var is documented in `.env.example:170` but **absent from the local `.env`**,
and the schema marks it `.optional()` — so the suite failed as if erasure were
broken. Pinned in the spec's `beforeAll` (`??=`) so it no longer depends on which
env is loaded. **The developer `.env` is still missing it** — worth adding there too.

**3. `identity-email-verification` — split into two suites.** The test posted to
`/api/auth/sign-up/email`, closed by D-29. Repointing it to `/v1/signup` still gave
400, and the cause is worth recording: with `REQUIRE_EMAIL_VERIFICATION=true` (which
the suite set for the _other_ test), `/v1/signup` provisions the tenant and the user
and is then refused its own closing auto-sign-in. Since that env is read when the Nest
app builds BA, it cannot be toggled between `it` blocks — so the two halves now get a
stack each: part 1 without the gate, part 2 with it.

**4. `payment-lifecycle` — three disagreeing currency sources** (mock GBP, seed
country GB + EUR, orders EUR) reconciled on ES/EUR, the smallest move since orders
and the seeded currency were already EUR.

## Flagged, not fixed

**`POST /v1/signup` returns 400 under `REQUIRE_EMAIL_VERIFICATION=true` after
already creating the tenant and the user.** The account exists; the caller gets an
error. Whether that should be a 201-without-session is a product decision, so it was
deliberately NOT frozen into an assertion — part 1 runs without the gate instead.
Worth a decision if that flag is ever intended for production.

**A second env-sensitivity data point for the CI work.** `security.e2e` was skewed by
`.env` raising the rate limits; `tenancy-erasure` by `.env` _omitting_ a var that
`.env.example` documents. Two different failure modes, same root: the suite's result
depends on a developer's untracked `.env`. The api:e2e CI job must pin its env
explicitly — this is now evidence, not a hypothesis.

## Still open from the audit

- `tenants-controller` offboard-cancel 403 — `/gsd-debug`, unresolved
- `beforeUpdateMemberRole` returns 500 instead of 403 — separate mechanical task
- `identity-role-changed` — blocked on the `admin`-role product decision
