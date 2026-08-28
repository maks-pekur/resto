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

### 3. Process isolation is REQUIRED — measured, with a mechanism

`apps/api/vitest.config.ts` sets `pool: 'forks'` with `poolOptions.forks.singleFork:
true`, so every spec shares ONE forked process, and the `e2e` target inherited that.

Measured both ways on the integration branch, same pinned env:

    one process per spec   64 passed, 1 failed
    batched (nx api:e2e)   62 passed, 3 failed        <- 2 false failures

The two extra failures were `security.e2e` (rotating-cookie rate limit) and
`cross-tenant-als-leak.e2e` (100 concurrent request pairs).

The mechanism is not a mystery and is worth stating exactly, because it defeats the
obvious workaround: **26 e2e specs assign `process.env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN`
in their own `beforeAll`** — mostly to `'1000'`, one to `'3'`, one to `'10000'`. With
`singleFork: true` they all share a process, so whichever spec ran last decides the
limit `security.e2e` then measures. Pinning the variable at the CI job level does NOT
help: the contamination happens inside the process, after the job env is read.

An earlier check of three specs (`tenancy` + `tenancy-offboarding` + `tenancy-erasure`)
came back 24/24 and looked like evidence the anti-pattern was stale. It was not — that
trio simply does not touch the leaked variable. Do not generalise from a passing batch.

Fix applied: the `e2e` target now runs
`--poolOptions.forks.singleFork=false --fileParallelism=false`, giving each spec a
fresh process, sequentially. The shared `vitest.config.ts` is left alone so the `test`
(unit) target keeps its current behaviour.

Longer term the specs should not be mutating shared `process.env` at all, but that is
26 files and a separate task.

### 4. The last red has to be handled deliberately

`identity-role-changed.e2e` cannot go green until the `admin`-role decision lands. A CI
job added today is red on main unless that spec is excluded with a comment pointing at
`.planning/todos/pending/admin-role-cannot-be-assigned.md`. Excluding it is a real
trade-off, not a formality: an excluded spec is an untested path.

## Sequencing

The CI job must merge AFTER #270, #271 and #272, or main goes red the moment it lands.

## The job, as built and verified (2026-08-28)

`api-e2e` in `.github/workflows/ci.yml`. Every choice in it was measured:

isolation flags batched 62/3 vs isolated 64/1, mechanism identified
pinned rate limits 26 specs mutate the var in-process; job-level env alone
cannot fix it, but the pin still guards the read
no `services:` block each spec starts its own Postgres + NATS (testcontainers)
placeholder env set 4 representative specs (health, tenancy,
catalog-photo-upload, security) run green on a clean
environment with NO .env sourced

End-to-end simulation of the CI step — the exact command, `.env` deliberately not
sourced: **64 passed (64), rc=0, 400s.**

### Two things that would have shipped broken

1. Three specs batched (`tenancy` + `tenancy-offboarding` + `tenancy-erasure`) came
   back 24/24, which looked like evidence the batching anti-pattern was stale. It is
   not — that trio simply does not touch the leaked variable. Generalising from it
   would have put a contaminated job into CI.
2. The "known-blocked spec" step was first written as
   `nx run api:e2e -- --fileParallelism=false <file>`. nx appends forwarded args to
   the target's own command, duplicating `--fileParallelism` and making vitest's arg
   parser throw. Under `continue-on-error` that reads as "the spec is red" when in
   fact the step never ran. Now calls vitest directly.

### The excluded spec

`e2e-ci` = `e2e` minus `identity-role-changed`, which cannot pass until the admin-role
decision lands. A second step runs it with `continue-on-error: true` so the exclusion
stays visible on every run rather than being quietly forgotten. When the decision
ships, delete both the step and the `e2e-ci` target.
