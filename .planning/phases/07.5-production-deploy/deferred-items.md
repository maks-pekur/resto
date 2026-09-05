# Deferred Items

Out-of-scope discoveries logged during plan execution.

## From 07.5-13 — all three resolved 2026-09-06, none deferred

The plan-13 executor correctly identified three red specs as pre-existing relative to its own
changes (confirmed by `git stash` + rerun) and logged them here rather than fixing them. Two of the
three turned out to be **mine**, introduced hours earlier while finishing `07.4-06` by hand, so
"pre-existing" was true of plan 13 and not of the branch. All three are now fixed.

- **`test/unit/env.spec.ts`** expected a production boot to fail naming `AUTH_COOKIE_DOMAIN`.
  I removed that key from the required set in `07.4-06` (07.4 D-05 — the admin session cookie is
  host-only by design) and did not update this assertion; my verify ran `admin-web-url.spec.ts`
  and not this file. The case now asserts on `WEBSITE_PUBLIC_URL`, so the required-set still has a
  guard, and the cookie's own shape rule stays covered in `admin-web-url.spec.ts`.
- **`test/unit/tenancy/start-tenant-onboarding-url.spec.ts`** expected `${ADMIN_WEB_URL}/payouts`.
  I repointed that to `/tenant/payouts` in `07.4-06` — the real route, `/payouts` having been dead
  since the 7.6 Vite migration — and again missed the spec.
- **`test/integration/analytics-dashboard-reader.spec.ts`** was genuinely older and not mine. Its
  seed put `'paid'` in `orders.status`, which is a **`payment_status`** value, so every insert
  violated `orders_status_chk` and the file crashed at `beforeAll`. Revenue is filtered on
  `orders.paymentStatus = 'paid'` (`analytics-drizzle.reader.ts:32,82`), so the two columns had
  been conflated. The seed helper now takes the two separately and sets `paidAt` alongside, which
  `orders_paid_at_chk` requires: `(payment_status = 'paid') = (paid_at IS NOT NULL)`.
  Same class as commit `8fdee2f3`, which fixed it in a sibling spec and missed this file.

**The lesson, since it recurred twice in one day:** a change to an env key or a route must sweep
every spec that names it, not only the spec the plan happens to list. Both of mine would have been
caught by `grep -rl AUTH_COOKIE_DOMAIN apps/api/test` before claiming done.
