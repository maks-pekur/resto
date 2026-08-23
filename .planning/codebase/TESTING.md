# Testing Patterns

**Analysis Date:** 2026-08-18

This document is topology-first: which command runs which files, what each
layer touches (in-process mocks vs. throwaway Postgres vs. the real dev
stack), and the specific traps that have already cost real time on this
project. Read this before assuming a green run means anything, and before
assuming a command you remember from another repo does the right thing
here.

## The One Trap That Wastes The Most Time

**`pnpm --filter api test` is a SILENT NO-OP.** `apps/api/package.json` has
no `"test"` script at all (its `scripts` block contains only
`openapi:emit`). pnpm does not error, does not warn — it exits 0 with zero
output. Verified directly: `pnpm --filter api test` produces a truly empty
stdout/stderr and exit code 0. If you run this expecting the API test suite
to execute, you will believe you have a green suite when nothing ran.

**The correct commands run through Nx, not through pnpm's own script
runner**, because the actual test commands live in `apps/api/project.json`
targets, not `apps/api/package.json` scripts:

```bash
pnpm nx run api:test        # unit + co-located src specs
pnpm nx run api:e2e         # e2e specs (testcontainers)
pnpm nx run admin:test      # admin unit/component specs (vitest + jsdom)
pnpm nx run admin:e2e       # admin Playwright specs (real dev-style stack)
pnpm nx run-many -t test    # every project's "test" target (what CI uses, via `nx affected -t test`)
```

`pnpm nx test api` (Nx's shorthand form) is equivalent to `pnpm nx run
api:test` and also works. The trap is specifically the pnpm-workspace
`--filter <pkg> <script>` form, because it looks past Nx entirely and goes
straight to `package.json` `scripts`, which api's package.json doesn't
define for tests.

## Command → What Actually Runs (verified from `project.json`, not assumed)

| Project           | Target | Command (from `project.json`)                       | What it covers                                                                |
| ----------------- | ------ | --------------------------------------------------- | ----------------------------------------------------------------------------- |
| `apps/api`        | `test` | `vitest run test/unit src` (cwd `apps/api`)         | Unit specs in `test/unit/**` **plus** every co-located `src/**/*.spec.ts`     |
| `apps/api`        | `e2e`  | `vitest run test/e2e`                               | HTTP-level e2e specs, each boots a throwaway `testcontainers` Postgres        |
| `apps/admin`      | `test` | `vitest run` (config include: `src/**` + `test/**`) | Component/unit specs (jsdom + Testing Library)                                |
| `apps/admin`      | `e2e`  | `playwright test`                                   | Browser specs in `apps/admin/e2e/`, against a real running api + Postgres     |
| `packages/db`     | `test` | `vitest run` (no directory restriction)             | Unit specs **and** `test/integration/**` (testcontainers) — both run together |
| `packages/events` | `test` | `vitest run` (no directory restriction)             | Unit specs **and** `test/integration/**` (testcontainers) — both run together |
| `packages/domain` | `test` | `vitest run`                                        | Pure unit specs, no infra                                                     |

The `apps/api` row is the outlier worth internalizing: unlike `packages/db`
and `packages/events`, whose `test` target is a bare `vitest run` that lets
the vitest config's `include` glob decide scope, `apps/api`'s `test` target
passes explicit directory arguments (`test/unit src`) on the CLI. Vitest CLI
directory args narrow the config's `include` glob rather than just
supplementing it — anything matching `include` but outside those two
directories silently does not run under this target.

## Why `src` Was Added To The `api:test` Command — And What It Missed Before

Until commit `c39f5361` ("test(api): include co-located src specs in the nx
test target"), the target was `vitest run test/unit` — no `src`. At the
commit immediately before that fix, **17 co-located `*.spec.ts` files under
`apps/api/src/` had never been executed by any Nx target or CI job**,
including six in the payments context specifically:
`cancel-order.service.spec.ts`, `create-checkout-payment.service.spec.ts`,
`handle-stripe-event.service.spec.ts`, `refund-order.service.spec.ts`,
`stub-provider.adapter.spec.ts`, `stripe-webhook.controller.spec.ts`.

This is not hypothetical. One day earlier, commit `642bf8c` ("fix: persist
order status on cancel and refund via repository update") fixed a real
production bug — `CancelOrderService`/`RefundOrderService` called an
INSERT-only `OrderDrizzleRepository.save()` instead of `update()`, so
`orders.status` never flipped to `canceled`/`refunded` and the associated
outbox events were silently dropped. The fix touched
`cancel-order.service.spec.ts` and `refund-order.service.spec.ts` directly —
specs that existed, in the exact files that assert the exact behavior that
broke, and were not part of the enforced test target until the very next
commit. Whether those specific specs would have caught the regression
before it shipped is secondary to the structural fact: an entire class of
co-located specs, including the payments/refund ones, ran on nobody's
machine and in no CI job for some period of this project's life. If you add
a new bounded context or move specs around, re-verify that
`test/unit src` (or whatever superset it becomes) still covers every
`*.spec.ts` under `src/`.

## The Orphaned Directory Nobody Runs: `apps/api/test/integration/`

`apps/api/test/integration/` currently holds three testcontainers-backed
specs — `create-order-idempotency.spec.ts`,
`ordering-audit-projection.spec.ts`, `postgres-menu-version.adapter.spec.ts`
— that are covered by **neither** the `test` target (`test/unit src`
excludes it) **nor** the `e2e` target (`test/e2e` excludes it). No script
anywhere in the repo (`package.json`, CI, or otherwise) references
`test/integration`. These files exist, use the same `startDbStack()`
testcontainers harness as `test/e2e`, and do not run under any command a
developer or CI would normally invoke. This mirrors the `packages/db` /
`packages/events` naming convention (`test/integration/`) but, unlike those
two packages (whose bare `vitest run` target picks up everything under
`test/`), `apps/api`'s directory-scoped target leaves this one stranded. If
you touch code these specs exercise, run them explicitly:
`cd apps/api && pnpm vitest run test/integration`. Fixing the target
(`vitest run test/unit test/integration src`, or folding these files into
`test/e2e`) is an open, undocumented gap — do not assume it is someone
else's problem to have already closed.

## The Three Test-Data Tiers — Know Which One You're About To Touch

1. **In-process mocks (unit specs, `test/unit/**`and co-located`src/**/\*.spec.ts`)** — no Docker, no network. Repositories/ports are
   `vi.fn()` mocks or hand-built fakes. Fast, safe to run anytime, touches
   nothing external.

2. **Throwaway `testcontainers` Postgres (`test/e2e/**`,
`test/integration/**`in`apps/api`; `test/integration/**`in`packages/db`and`packages/events`)** — each spec file (or the shared
`startDbStack()`/`with-real-stack.setup.ts`harness) boots its own
ephemeral`postgres:16-alpine`container via`@testcontainers/postgresql`,
runs migrations, provisions the `resto_app`role, and tears the
container down after. **These never touch your local dev database** —
they allocate their own container and (usually random, testcontainers-
assigned) port. Gated by`isDockerAvailable()`
(`apps/api/test/e2e/helpers/docker-availability.ts`): if Docker isn't
running, specs `describe.skip`locally, but **CI sets`RESTO_REQUIRE_DOCKER=1`\*\*, which makes the same gate throw instead of
   silently skipping (AUDIT #5 — a missing Docker daemon must fail closed,
   not quietly turn into "0 tests ran, all green").

3. **The dedicated e2e "test stack" for Playwright
   (`infra/docker/docker-compose.test.yml`, `pnpm test:stack:up` /
   `scripts/test-stack.mjs`)** — a persistent-for-the-session pair of
   Postgres (`127.0.0.1:55432`) and NATS (`127.0.0.1:54222`) containers,
   deliberately on **non-default ports** distinct from the interactive dev
   stack (`infra/docker/docker-compose.dev.yml`, `pnpm dev:up`, default
   ports 5432/4222/...). Data lives on `tmpfs` (wiped whenever the
   containers restart, not wiped per test). `apps/admin/playwright.config.ts`
   only auto-starts the **admin** dev server via its `webServer` block
   (`reuseExistingServer: !process.env.CI`); it does **not** start `apps/api`
   — you run the API yourself pointed at the test-stack's Postgres/NATS
   URLs (see `apps/admin/e2e/README.md` for the three-terminal recipe).
   The result: Playwright specs drive a real, running NestJS process talking
   to a real Postgres — not mocks, not a testcontainer spun up per test —
   but a **separate real stack from the one you use for manual click-through
   testing**, not the same shared dev database.

**Practical consequence:** it is always safe to run `apps/api` unit specs
or `apps/api:e2e` / `packages/db:test` / `packages/events:test` while you
are manually testing against the interactive dev stack — they allocate
their own throwaway containers. Running `apps/admin:e2e` concurrently with
manual dev-stack testing is _also_ safe from a data-corruption standpoint,
because it targets the distinct test-stack ports (55432/54222) — but only
if that test stack is actually up and the API instance you point at it is
not the same process you're using for manual testing. Never assume
"e2e" implies "touches your dev DB" in this repo — check which of the three
tiers a given spec belongs to before worrying about interference.

## CI Coverage — What Actually Runs On Every PR, And What Doesn't

`.github/workflows/ci.yml`'s `affected` job matrix is
`[lint, typecheck, test, build]`, run via `pnpm exec nx affected -t
<target>`. **There is no `e2e` entry in that matrix, and no separate
Playwright job anywhere in the workflow file.** That means:

- `apps/api`'s `e2e` target (testcontainers HTTP-level specs) does **not**
  run in CI.
- `apps/admin`'s Playwright specs do **not** run in CI.
- The only CI signal for those layers is whatever a developer ran locally
  before merging.

This is a real, current gap, not a historical one — verify against
`.github/workflows/ci.yml` before assuming otherwise if you're deciding
whether to trust "CI is green" as e2e proof. `test` in the CI matrix maps
to each project's `test` Nx target (see table above), so for `apps/api`
that means CI **does** run the co-located `src` specs and `test/unit`, and
(via `packages/db`/`packages/events`'s bare `vitest run`) does run those
two packages' `test/integration` testcontainers specs — just not
`apps/api`'s own `test/e2e` or `test/integration`, and not
`apps/admin`'s Playwright suite.

## Known False-Failure Mode: Full-Suite Contention

Running the entire `apps/api` vitest suite in one long-lived process
(`cd apps/api && pnpm vitest run` with no path filter, or any invocation
that lets ~100+ e2e spec files share one process) produces **false
failures** that do not reproduce in isolation — chiefly `expected 429 to be
<2xx>` (rate-limit trips) and occasional timeouts. Root cause: e2e specs run
under `pool: 'forks'` / `poolOptions.forks.singleFork: true`
(`apps/api/vitest.config.ts`), and across the full file count in one
process, accumulated request volume against the shared
`RateLimitGuard` trips it even with the harness's relaxed
`RATE_LIMIT_*_PER_MIN=10000`. Per-file runs each boot a fresh Nest app, so
limits reset and the false failures disappear.

**How to trust a red result:** re-run the specific failing spec file(s) in
isolation or in a small batch before treating a failure as a regression —
`pnpm vitest run test/e2e/foo.e2e.spec.ts test/e2e/bar.e2e.spec.ts` from
`apps/api`. An isolated/small-batch run is authoritative; a red full-suite
run is not evidence of anything until reproduced that way. (Observed
concretely during Phase 08.2 gap-closure: a full run showed 27 failures;
every one of them was green in isolation. The only real regressions
surfaced through targeted batches.)

## Standing Known-Red Specs (as of this analysis — verify against

`.planning/STATE.md` "Blockers/Concerns" before trusting this list, it is a
point-in-time snapshot)

Recorded in `.planning/STATE.md` under `### Blockers/Concerns`, not in a
dedicated `deferred-items.md` (per-phase `deferred-items.md` files exist
under `.planning/phases/<phase>/` but the authoritative running list of
known-red e2e specs lives in `STATE.md`):

- `set-active-brand.e2e.spec.ts` (2 cases) and `brand-isolation.e2e.spec.ts`
  still seed the pre-08.4 `member_brand_scope` model; after D-04, brand
  reachability derives from `member_location_scope` instead, so these
  fixtures need reseeding. Confirmed **not** a derivation bug — proven by
  `me-brands`/`catalog`/`cross-tenant-isolation` e2e staying green — this is
  test-fixture debt, not product debt. Open since 08.4, still open through
  08.4-11 (out of that plan's file-list scope).
- `catalog-reads.e2e.spec.ts` (2 tests) and
  `catalog-brand-read-isolation.e2e.spec.ts` (1 test) fail with
  `403 location.context_required` — owner fixtures in these specs never
  create a location or send `x-location-id`, relying on an ambient location
  context that stopped resolving after the 08.5 owner-pin retirement.
  Confirmed unrelated to 08.5-03's own changes (isolated and reverted to
  verify). Full analysis in
  `.planning/phases/08.5-owner-location-filter-ux-url-param-all-aggregate/deferred-items.md`.
- `identity-bootstrap`, `identity-invitation`, `offboard-cancel`, and
  `signup-enumeration` e2e specs have residual failures confirmed
  pre-existing and unrelated to location-scope work — carried as known-red
  rather than blocking phases that don't touch identity.

Before spending time chasing a red e2e result, check whether it's already
on this list.

## Prod Bugs Tests Missed, And What The Project Now Does Differently

The 08.4 phase verification found **two real production bugs during manual
verification that unit tests missed because the tests mocked the
repositories involved**: an owner brand-global dashboard white-screen
(location-less stop-list 403 crash, fixed `3590cd0`), and
`InitialLocationDrizzleRepository.resolveForUserInBrand` unconditionally
calling `withTenantId()`, which throws inside an ALS-bound HTTP context —
silently resetting `activeLocationId` to `null` on every brand switch in
production (fixed `db3624d`). Both are recorded in `.planning/STATE.md`'s
"Phase 08.4 COMPLETE" note specifically as bugs unit tests did not catch.

The discipline this produced, and that plans/executors are expected to
follow:

1. **Prove a test fails without the fix, before writing the fix.** A test
   that was never run red against the broken code is not proof it catches
   the regression — it may pass trivially (see the reorder bug below).
2. **Prefer reading state back from real Postgres over asserting on mock
   call shapes.** The order-status persistence bug
   (`CancelOrderService`/`RefundOrderService` calling `save()` — an
   INSERT-only path — instead of `update()`, so `orders.status` never
   flipped) was proven fixed with a DB read-back assertion, not a mock
   assertion:

   ```typescript
   // apps/api/test/e2e/payment-lifecycle.e2e.spec.ts — reads the row back
   // from the testcontainers Postgres after the mutation, not the mock call args
   expect(paymentRow?.status).toBe('refunded');
   ```

   A unit spec asserting `repo.save` was called with `{status: 'refunded'}`
   would have passed even with the INSERT-only bug, because the mock
   doesn't know INSERT silently orphans the row from an UPDATE-shaped
   caller's expectations. Reading the real row after the real repository
   method runs is what catches it.

3. **A passing build is not proof a page renders, and a passing unit test
   is not proof a feature works end to end.** The canonical cautionary
   example: a drag-and-drop reorder feature shipped through green
   `tsc + vitest` because the unit test asserted against a fixture with
   distinct `sortOrder` values (0, 1, 2), while production data had all
   zeros — swapping two zeros is a no-op, so the failure mode the bug
   actually produced was invisible to that fixture. The Postgres
   `UPDATE ... SET sortOrder = 0 WHERE sortOrder = 0` "succeeded" (returned
   `{ok: true}`), and the frontend discarded the action's return value
   entirely. Concretely, this means: at least one test per feature should
   use production-shape data (all-zero sort orders, empty arrays, missing
   optional fields — not the convenient fixture), the caller must branch on
   an action's `{success, error}` return rather than discard it, and
   non-trivial admin features get a browser-smoke pass (or a Playwright
   spec) for the happy path before being called done.

## Test File Organization

**`apps/api`:**

- `test/unit/<context>/**` — cross-cutting or infra-adjacent unit specs
  (env validation, guardrails, health, OpenAPI contract) organized by
  bounded context subdirectory.
- `src/**/*.spec.ts` — co-located unit specs next to the service/adapter
  they test; this is the primary location for application-service and
  domain-aggregate specs (e.g.
  `src/contexts/payments/application/refund-order.service.spec.ts`).
- `test/e2e/*.e2e.spec.ts` — flat directory, one file per HTTP-surface
  concern, named `<subject>.e2e.spec.ts`; shared harness in
  `test/e2e/helpers/` (`with-db-stack.ts`, `with-real-stack.setup.ts`,
  `docker-availability.ts`).
- `test/integration/*.spec.ts` — testcontainers specs that don't fit the
  full HTTP e2e harness; currently orphaned from any run target (see above).

**`apps/admin`:**

- `src/**/*.spec.tsx` co-located next to components (e.g.
  `src/components/orders/order-card-refund.spec.tsx`).
- `test/setup.ts` — global jsdom polyfills (see Mocking below).
- `e2e/*.spec.ts` — Playwright specs, named `adm-NN-<scenario>.spec.ts`;
  `e2e/fixtures/` holds seed helpers; `e2e/README.md` documents the
  three-terminal manual recipe.

## Test Structure

Standard vitest `describe`/`it` nesting, no custom suite wrapper:

```typescript
describe('RefundOrderService', () => {
  it('rejects a refund with no reason', async () => { ... });
  it('marks the payment refunded and emits ordering.order_refunded.v1', async () => { ... });
});
```

Per the comment policy (`CONVENTIONS.md`), test bodies carry no comments —
the `describe`/`it` names are expected to fully convey intent.

## Mocking

**`apps/api` unit specs** — hand-built fakes or `vi.fn()`-based mocks
satisfying the port interface, not a mocking framework:

```typescript
const makeTx = (): RestoTx => {
  const insertReturning = {
    returning: vi.fn().mockResolvedValue([{ id: 'outbox-id' }]),
  };
  const insertValues = { values: vi.fn().mockReturnValue(insertReturning) };
  const insert = vi.fn().mockReturnValue(insertValues);
  return { insert } as unknown as RestoTx;
};
```

Domain aggregates are reconstructed via `Order.fromSnapshot({...})` with
explicit field values rather than a factory library — this is also where
the "use production-shape data" discipline above applies: prefer
boundary-value fixtures (zeros, nulls, empty arrays) over convenient
round-number ones.

**`apps/admin` component specs** — `vi.mock()` module factories combined
with `vi.hoisted()` for the mock functions referenced inside them (hoisting
is required because `vi.mock` calls are hoisted above imports by vitest):

```typescript
const { apiFetchMock, toastSuccessMock, toastErrorMock, canMock } = vi.hoisted(
  () => ({
    apiFetchMock: vi.fn(),
    toastSuccessMock: vi.fn(),
    toastErrorMock: vi.fn(),
    canMock: vi.fn(),
  }),
);

vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));
vi.mock('sonner', () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}));
vi.mock('@/lib/hooks/use-permissions', () => ({
  usePermissions: () => ({ can: canMock }),
}));
```

`react-i18next` is mocked to a passthrough translator (`t: (key, vars) =>
...`) rather than loading real locale files, so specs assert against key
strings, not localized copy.

**What to mock:** the network boundary (`apiFetch`), toasts, permission
checks, i18n — anything crossing outside the component under test.
**What NOT to mock:** `@tanstack/react-query`'s `QueryClient` (a real
`QueryClient` with `retry: false` is constructed per test via
`makeQueryClient()`) and Radix/shadcn primitives — these are exercised for
real so interaction behavior (popovers, dialogs) is actually verified.

**jsdom gaps requiring stubs** (`apps/admin/test/setup.ts`): jsdom 25 lacks
`ResizeObserver` (Radix popper components throw without it),
`hasPointerCapture`/`setPointerCapture`/`releasePointerCapture`, and
`scrollIntoView` — all stubbed globally in the setup file rather than
per-spec, because Radix components used across many components need them
unconditionally.

## Fixtures and Factories

- No dedicated fixture-factory library (no `@faker-js/faker`-style
  generators observed as a standard). Fixtures are inline object literals
  with explicit, deterministic UUIDs (`TenantId.parse('00000000-...-0001')`)
  so assertions can reference the same constant.
- `apps/admin/e2e/fixtures/seed-tenants.ts` provisions operator fixtures via
  the API's own internal endpoints (`POST /internal/v1/tenants`, etc.),
  idempotently (checks for an existing row before creating).
- `pnpm resto:seed seed-demo` (root script, `tools/scripts/seed/cli.ts`) is
  the reusable demo-data fixture for manual/dev-stack testing — distinct
  from e2e fixtures, does not create a payment-ready brand (guest checkout
  smoke-testing against `seed-demo` output currently 404s on
  `payments.not_enabled` until Stripe Connect onboarding is completed
  manually).

## Coverage

- `packages/db` and `apps/admin` vitest configs define a `coverage`
  block (`provider: 'v8'`); no repo-wide coverage threshold is enforced in
  CI. `packages/db`'s coverage explicitly excludes `src/cli/**` from the
  _exclude_ list — i.e., `db:reset`/`db:migrate` CLI scripts are
  deliberately **included** in coverage because they are safety-critical
  and get their own unit tests stubbing `process.exit`.
- Treat "no coverage regression" as aspirational, not gated — nothing fails
  a PR for a coverage drop today.

## Common Patterns

**Docker-gated e2e/integration specs:**

```typescript
const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;
if (!dockerOk) {
  console.warn('[create-order-idempotency] Docker not available — skipping.');
}
suite('...', () => { ... });
```

`RESTO_REQUIRE_DOCKER=1` (set in CI) makes `isDockerAvailable()` throw
instead of returning `false`, converting a missing daemon into a hard
failure rather than a silent `describe.skip` — this is deliberate
fail-closed behavior (AUDIT #5), not an oversight to "fix" by relaxing it.

**Async testing:** standard `async`/`await` in `it(...)`, no callback-style
tests observed.

**Error testing:** assert on the thrown domain error's class/`kind`
discriminant, not on message string matching, since error classes carry
`readonly kind = 'FooError' as const` (see CONVENTIONS.md).

---

_Testing analysis: 2026-08-18_
