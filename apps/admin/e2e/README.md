# apps/admin e2e — ADM-00 scaffold smoke-walk

Playwright-driven regression net for the operator admin shell. Six scenarios
from Phase 02 CONTEXT D-18 verify the post-Plan-01 stack and lock the
behaviors that subsequent plans (03, 04, 05) ship.

## Scenarios (CONTEXT D-18)

| #   | Scenario                                                 | Today                                                                                        |
| --- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | Valid sign-in → /dashboard with brand list               | active `test()` — passes against Plan 01 baseline                                            |
| 2   | 0-brand tenant → EmptyState empty-variant                | `test.fixme()` — Plan 04 ships the EmptyState; Plan 05 flips the annotation                  |
| 3   | 3+ brand tenant → dropdown switcher selects and persists | active `test()` — passes against existing scaffold                                           |
| 4   | Non-owner role → filtered `/v1/me/brands`                | active `test()` — may downgrade to `.fixme` at first run if the existing RBAC seed disagrees |
| 5   | Expired session → `/login?expired=1`                     | active `test()` — Plan 01 (Wave 1) shipped the 401-redirect                                  |
| 6   | Multi-tab brand-sync converges within ~1s                | active `test()` — `BrandTabSync` `storage` event listener                                    |

## One-time setup

```bash
pnpm install
pnpm --filter @resto/admin exec playwright install chromium
```

The Chromium binary lives in `~/Library/Caches/ms-playwright/` on macOS — it
is not under workspace `node_modules/` and is not deleted by `pnpm` operations.

## Running the suite

The admin e2e suite runs against a live `apps/api` and the shared
`infra/docker/docker-compose.test.yml` data stack (Postgres + NATS). The
test stack does **not** start `apps/api` — the api service was deferred
from this stack to keep `infra/CLAUDE.md` discipline (immutable image
tags, no hot-reload services in IaC). Wiring the api into the test compose
is a Phase 03 infra task.

Solo-founder flow (three terminals):

```bash
# Terminal 1 — data stack
docker compose -f infra/docker/docker-compose.test.yml up

# Terminal 2 — api against the test DB
DATABASE_URL=postgres://resto:resto_test_dev_only@localhost:55432/resto_test \
NATS_URL=nats://localhost:54222 \
pnpm --filter @resto/api dev

# Terminal 3 — playwright (auto-starts admin via webServer config)
pnpm --filter @resto/admin e2e
```

Variants:

- `pnpm --filter @resto/admin e2e:headed` — opens the browser visibly
- `pnpm --filter @resto/admin e2e:ui` — Playwright UI mode (interactive runner)

The `playwright.config.ts` `webServer` block starts `apps/admin` on port
3001 automatically. If you already have the admin running (`pnpm --filter
@resto/admin dev`), the suite reuses it (`reuseExistingServer: true` in
non-CI mode).

## test.fixme / test.fail lifecycle

`test.fixme(name, fn)` marks a scenario as a known gap — the runner skips
it and reports it as `[skipped]` without failing the suite. Use this when
the assertion is correct but the implementation has not landed yet.

`test.fail(name, fn)` runs the body and asserts that it _fails_. Use this
when documenting a regression that must be fixed before flipping back to
`test()`.

The Phase 02 exit gate: every `test.fixme` / `test.fail` in
`adm-00-smoke-walk.spec.ts` has been removed (active `test()` is the
norm), OR scenario 4 remains `.fixme` with a Phase 03 RBAC-seed backlog
note. Plan 05 owns flipping scenario 2's `.fixme`; Plans 03 and 04 ship
the behaviors that scenarios 3, 5, 6 already assert.

## Fixture seeding

`fixtures/seed-tenants.ts` calls `apps/api`'s internal endpoints
(`POST /internal/v1/tenants`, `POST /internal/v1/tenants/:id/owner`,
`POST /v1/me/brands`) to provision four operator fixtures:

- `zero@e2e.test` — 0-brand tenant
- `one@e2e.test` — 1-brand tenant (owner)
- `staff@e2e.test` — same tenant, staff role (Phase 03 RBAC seed)
- `three@e2e.test` — 3-brand tenant

The seed helper is idempotent: it provisions a tenant only when the
preflight lookup returns no row. The four fixture emails use a static
test-only password (`e2e-passwd-1234`) — these have no production analogue
and live exclusively on the test-stack DB.

## Reports

Failed runs write artifacts to `playwright-report/` (HTML) and
`test-results/` (traces, screenshots). Both are git-ignored.

## Baseline pass/fixme tally

See `.planning/phases/02-admin-shell/02-02-SUMMARY.md` for the live
baseline captured at Plan 02 ship time.
