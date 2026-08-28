# Putting api:e2e into CI — findings (2026-08-28)

## Where the suite stands

Integration branch = main + the three fix branches (#270, #271, #272) merged.
The three merged with **no code conflict** — only `.planning/STATE.md` collided, where
two quick-task rows landed in the same table.

Full 65-spec sweep, one process each, pinned env: **64 green, 1 red.**

The single red is `identity-role-changed.e2e`, blocked on the `admin`-role product
decision. Everything the audit found is closed:

    audit-pipeline               3 passed
    identity-email-verification  2 passed
    payment-lifecycle            6 passed
    tenancy                      9 passed
    tenancy-offboarding         11 passed
    tenancy-erasure              4 passed
    tenants-controller          22 passed   (the offboard-cancel fix)
    security                     9 passed   (green once env is pinned)

Raw: `e2e-sweep-2026-08-28-all-three-fixes.txt`

## What the CI job must get right

### 1. Pin the env — this is the load-bearing one

Two specs were proven to pass or fail purely on which env is loaded:

- `security.e2e` — the root `.env` sets `RATE_LIMIT_AUTH_SIGNIN_PER_MIN=1000` against
  a schema default of 10, so the rotating-cookie test can never see its 429 and reads
  as a security regression.
- `tenancy-erasure.e2e` — `AUDIT_ERASURE_SALT` is documented in `.env.example` but
  optional in the schema and missing from the local `.env`, so erasure failed as if
  broken. (Now pinned inside the spec, but the class of problem stands.)

A CI job that inherits a developer `.env`, or that silently relies on its absence, will
be green in one place and red in the other. Pin explicitly.

### 2. Docker is all the infrastructure needed

Each spec starts its own Postgres and NATS via testcontainers
(`test/e2e/with-real-stack.setup.ts`). No `services:` block required — `ubuntu-latest`
ships a Docker daemon. `RESTO_REQUIRE_DOCKER=1` should be set so the suite hard-errors
instead of silently degrading to `describe.skip` (the AUDIT #5 pattern already used by
the `affected` job).

### 3. Process isolation — MEASURED, not assumed

`apps/api/vitest.config.ts` sets `pool: 'forks'` with `poolOptions.forks.singleFork:
true`, so every spec shares ONE forked process, and the `e2e` target
(`vitest run test/e2e test/integration`) inherits that. The checkpoint's anti-pattern
table says batching two or more e2e specs produces failures that vanish when run alone
("hit twice").

Checked rather than trusted: `tenancy` + `tenancy-offboarding` + `tenancy-erasure` in
one batched process came back **24 passed (24)** — the anti-pattern did not reproduce
on that trio. A full batched `nx run api:e2e` was then run to compare against the
one-per-process sweep; see the result recorded below before choosing a pool setting.

If batched matches 64/1, the existing target can go into CI unchanged and the
anti-pattern note is stale. If it does not, the target needs
`--poolOptions.forks.singleFork=false --fileParallelism=false` so each spec gets a
fresh process, at the cost of wall-clock.

### 4. The last red has to be handled deliberately

`identity-role-changed.e2e` cannot go green until the `admin`-role decision lands. A CI
job added today is red on main unless that spec is excluded with a comment pointing at
`.planning/todos/pending/admin-role-cannot-be-assigned.md`. Excluding it is a real
trade-off, not a formality: an excluded spec is an untested path.

## Sequencing

The CI job must merge AFTER #270, #271 and #272, or main goes red the moment it lands.
