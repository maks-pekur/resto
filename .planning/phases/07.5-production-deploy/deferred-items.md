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

## From 07.5-14 — pre-existing findings, not fixed, out of this plan's scope

Running the plan's own literal verify command,
`PUBLIC_APEX_DOMAIN=example.invalid bash infra/scripts/assert-no-domain-literals.sh infra
docs/runbooks .planning/codebase/STACK.md`, surfaces findings unrelated to this plan's own
changes (confirmed by re-running with a non-colliding dummy apex,
`zzz-plan14-verify.invalid`, which makes them the only survivors):

- **`infra/runbooks/2fa-recovery.md`** and **`infra/runbooks/spf-dkim-dmarc-checklist.md`** —
  pre-existing operational runbooks (2FA recovery, SPF/DKIM/DMARC), never touched by any plan in
  this phase, naming `resto.app`/`amazonses.com`/`mail-tester.com` as illustrative examples. Not
  in this plan's file list; genuinely unrelated content.
- **`docs/runbooks/spa-workers.md:59`** — an `example.com` literal, pre-existing from phase
  07.5-12's rewrite of that file (not touched by this plan).
- **The `docker-compose.dev`/`docker-compose.test` filename family trips the TLD net's `.dev`
  entry repo-wide** (`infra/CLAUDE.md`, `.planning/codebase/STACK.md`, and almost certainly other
  files this scan didn't cover) — a `.dev`-suffixed filename is not a domain literal, but the
  regex can't tell the difference. This predates every plan in this phase and is a guard-tuning
  question (narrow the regex, or extend `domain-literal-allowlist.txt`), not a per-plan fix.

**Also pre-existing, not caused by this plan:** `assert-no-domain-literals.sh`'s own
self-test fallback (`local pub="${PUBLIC_APEX_DOMAIN:-example.invalid}"`) and
`assert-hostname-depth.sh`'s identical fallback, plus `local-prod-rehearsal.sh`'s own
`PUBLIC_APEX_DOMAIN="example.invalid"` assignment, all legitimately contain the literal
`example.invalid` — the exact same value the plan's own verify command chooses as its demo scan
target. Running the scan with `PUBLIC_APEX_DOMAIN=example.invalid` therefore always self-flags
these three lines, in every one of these files, regardless of what any plan does — confirmed by
checking the pre-Task-2 committed version of `assert-no-domain-literals.sh`, which already
contained this exact self-referential default. A verify command choosing a demo value that
collides with the codebase's own standing test fixture is a verify-tooling gap, not a domain-leak
finding; the adjusted-but-equivalent command above (a non-colliding dummy apex) is the correct way
to exercise the real invariant.

---

## Found by CI on 2026-09-06 — the phase's own e2e regression, never measured before

Phase 7.5's plans were verified by typecheck, lint, targeted unit specs and a local production
rehearsal. **The API e2e suite was never run against them.** CI only runs on PRs targeting `main`,
`main` has not moved since 2026-08-29, and no PR existed — so nothing compared the branch to
anything until #281/#282 were opened.

Measured across three runs of the same job:

| branch | failing e2e spec files | failing tests |
|---|---|---|
| `main` (2a3958db) | 7 | 39 |
| `phase-10.6-ingredients` | 16 | 44 |
| `phase-7.5-deploy` | 44 | 92 |

The 28-file jump between 10.6 and 7.5 has one dominant cause.

### `guestHostForTenant` made an optional env var load-bearing

`apps/api/src/shared/guest-links.ts:24` throws when `PUBLIC_APEX_DOMAIN` is unset and the tenant
has no primary verified custom domain. The throw is deliberate and the reasoning in its docblock is
sound — an emailed link on a broken host is worse than one that failed to build.

But `PUBLIC_APEX_DOMAIN` is `.optional()` in `env.schema.ts:113` and is not in the `superRefine`
required-outside-dev list, and **nothing in `apps/api/test/e2e` sets it**. There is no vitest setup
file and no shared env fixture — each spec wires its own services — so every e2e path that composes
a guest URL now 500s. That is most of tenancy, catalog and identity, because tenant provisioning
emits the menu URL.

Before 07.5-13 an unset apex simply meant the `<slug>.menu.<domain>` shape resolved instead. That
shape was deleted; the fallback went with it. The schema's docblock still described the old
behaviour until 2026-09-06, when it was corrected.

**Not a design flaw — an unfinished migration.** Either the e2e specs get an apex, or the var joins
the required list and the specs get one anyway. The work is spread across ~28 files that each build
their own env, so it is a plan, not a one-liner.

### Two smaller findings from the same runs

- **`bundle-no-dev-leak.spec.ts` read `dist/assets`** after 07.5-12 moved the qr-menu bundle to
  `dist/qr/`. Four assertions failed. Fixed 2026-09-06 (`90ad5755`); the admin's matching move to
  `dist/admin/` has no test looking at it, so nothing else was affected — swept and confirmed.
- **`Docker API boot smoke` passes on 7.5 and fails on both `main` and 10.6** (`Cannot find module
  'pino'`). The phase fixes a runtime image that had never been bootable. Worth stating plainly:
  this is the phase delivering, and it was invisible until a PR existed.

### What this changes about the phase's evidence

`07.5-VERIFICATION.md` records four adversarial review rounds. None of them ran the e2e suite, and
the local rehearsal exercises the production compose stack rather than the test harness. The
phase's own verification gate should require the e2e job before 7.5 closes — otherwise plans 08-10
will be built on a branch whose regression surface has still never been measured.

---

## 2026-09-06 — what the e2e repair actually uncovered

Fixing the suite was not bookkeeping. Two shipped defects were hiding behind the stale fixtures,
and both were invisible for the same reason: the tests that should have caught them asserted the
wrong column.

### 1. Every payment transition was lost on write (money path)

`OrderDrizzleRepository`'s INSERT wrote `payment_status` and `paid_at`; its UPDATE
(`#runUpdate`) did not. `Order.markPaid`, `markRequiresAction`, `refund` and `markFailed` all move
those two fields on the aggregate snapshot, and nothing else in `apps/api/src` writes those columns
— confirmed by grep. So an order created `pending` stayed `pending` forever, whatever happened to
the money.

Consequences: `AnalyticsDrizzleReader` sums `orders.total` filtered on `payment_status = 'paid'`,
so **revenue reads zero**; the operator order feed projects `paymentStatus`, so every order shows
unpaid.

Never caught because `payment-lifecycle.e2e.spec.ts` read `orders.status` while asserting
`'requires_action'` and `'paid'` — values that column has not accepted since migration 0010. The
assertion could only ever compare the wrong column. Fixed in `0d97ed5b`; the spec now reads
`payment_status`, and it fails without the fix (observed: `Expected "paid", Received "pending"`).

### 2. Deleting a location with orders returned 500, not 409

`DeleteLocationService` matched the database's `RAISE 'location_has_orders'` with
`err.message.includes(...)`. Drizzle wraps a Postgres error in `DrizzleQueryError` whose own
message is the failed SQL — the raised name survives only on `.cause`. The branch never fired, so
`LocationHasOrdersError` was never thrown and the mapping to a 409 was unreachable.

Proven with a temporary probe: the database does raise `location_has_orders`. Fixed in `963651d7`
by walking the cause chain; the spec now exercises the service and asserts the domain error, and
fails against the old check (observed: 1 of 3).

### The pattern worth keeping

Both defects sat behind fixtures that wrote a payment value into the fulfilment column. A fixture
that lies does not merely fail — it can pass, and hide the thing it was meant to prove. The
`orders.status` / `payment_status` split needed a fixture sweep in the same commit; it did not get
one, and two production defects lived in the gap for as long as the suite stayed red for
"unrelated" reasons.
