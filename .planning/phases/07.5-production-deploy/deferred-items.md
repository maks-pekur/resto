# Deferred Items

Out-of-scope discoveries logged during plan execution, per the executor's scope-boundary rule.
Not fixed here — pre-existing, unrelated to the executing plan's own changes.

## From 07.5-13 (single-apex collapse)

Confirmed pre-existing on the unmodified tree via `git stash` + rerun before this plan touched
anything (all three fail identically with my changes stashed out):

- **`apps/api/test/unit/env.spec.ts` — "rejects production boot when AUTH_COOKIE_DOMAIN is
  missing"** expects the validation error to mention `AUTH_COOKIE_DOMAIN`, but phase 07.4-06 made
  `AUTH_COOKIE_DOMAIN` optional outside dev (07.4 D-05 — the admin session cookie is host-only by
  design). The assertion was never updated after that change landed.
- **`apps/api/test/unit/tenancy/start-tenant-onboarding-url.spec.ts` — "redirects to
  `${ADMIN_WEB_URL}/payouts`"** expects `/payouts` but `ADMIN_PAYOUTS_PATH`
  (`apps/api/src/shared/admin-links.ts`) is `/tenant/payouts`. Stale since whichever change
  introduced the `/tenant/payouts` path.
- **`apps/api/test/integration/analytics-dashboard-reader.spec.ts`** — its `beforeAll` seed
  insert violates `orders_status_chk` (uses `'paid'`, which is a `payment_status` value, not one
  of the five valid `orders.status` values: `placed`, `accepted`, `preparing`, `ready`,
  `completed`, `canceled`). Crashes the whole file at setup, not just one test. The top-of-branch
  commit `8fdee2f3` ("test: seed lifecycle orders as placed and paid, not an invalid status")
  fixed this exact class of bug in a sibling spec but evidently missed this file.

None of the three are in the `tenancy`/`notifications`/`shared` files this plan touches, and none
regressed — all three were already red before this plan's first edit.
