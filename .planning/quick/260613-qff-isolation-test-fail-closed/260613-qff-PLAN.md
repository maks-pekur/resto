---
quick_id: 260613-qff
slug: isolation-test-fail-closed
date: 2026-06-13
status: planned
source: .planning/AUDIT.md finding #5 (HIGH)
---

# Quick Task 260613-qff: Isolation test suite must fail-closed in CI

## Problem (AUDIT.md #5, HIGH)

56 integration/e2e specs gate on Docker via `const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;`. When `docker info` fails the
whole isolation net (RLS, ScopedTx, cross-tenant, ALS-leak, composite-FK, brand
isolation) silently turns into `describe.skip` and the file reports **green with
0 assertions**. A regression dropping an RLS policy could merge clean on any host
without Docker. CI (`nx affected -t test`) does nothing to force Docker presence.

## Approach

Make the shared `isDockerAvailable()` probes **fail-closed under an opt-in env
flag** instead of returning `false`. Because specs call it at module-eval time
(`const dockerOk = isDockerAvailable()`), a throw surfaces as a hard suite error —
the file can no longer pass silently. Local dev (flag absent) keeps skipping.

Two identical probe definitions exist; both must change:

- `packages/db/test/setup.ts` → `isDockerAvailable`
- `apps/api/test/e2e/helpers/docker-availability.ts` → `isDockerAvailable`

Then set the flag in CI so the ~56 specs can never skip on the runner.

## Tasks

### Task 1 — Make both `isDockerAvailable()` probes fail-closed under `RESTO_REQUIRE_DOCKER`

- **files:** `packages/db/test/setup.ts`, `apps/api/test/e2e/helpers/docker-availability.ts`
- **action:** In the `catch` branch (docker unavailable), if
  `process.env.RESTO_REQUIRE_DOCKER` is truthy (`'1'`/`'true'`), `throw` a clear
  Error instead of `return false`. When the flag is absent, behaviour is unchanged
  (`return false` → suite skips). Keep the success path (`return true`) identical.
  Extract the truthiness check into a tiny local helper or inline `=== '1' || === 'true'`.
- **verify:** `grep RESTO_REQUIRE_DOCKER` shows the guard in both files; the throw
  message names the flag and explains the refusal to skip.
- **done:** Both probes throw when flag set + docker absent; return false when flag
  unset + docker absent; return true when docker present (flag irrelevant).

### Task 2 — Unit test the fail-closed contract

- **files:** `packages/db/test/unit/docker-availability-guard.spec.ts` (new)
- **action:** Vitest unit test that mocks `node:child_process` `execSync` to throw
  (docker absent) and asserts: (a) with `RESTO_REQUIRE_DOCKER` unset →
  `isDockerAvailable()` returns `false`; (b) with `RESTO_REQUIRE_DOCKER='1'` →
  it throws. Restore env + mocks in `afterEach`. This spec needs NO Docker, so it
  runs everywhere (including the no-Docker case it protects).
- **verify:** `pnpm exec vitest run packages/db/test/unit/docker-availability-guard.spec.ts` passes.
- **done:** Test green; covers both flag states.

### Task 3 — Force Docker presence in CI test job

- **files:** `.github/workflows/ci.yml`
- **action:** Add `RESTO_REQUIRE_DOCKER: "1"` as a job-level `env` on the
  `affected` job (matrix runs lint/typecheck/test/build; the flag only affects the
  `test` target since it's only read by the probes). GitHub `ubuntu-latest` ships a
  Docker daemon, so steady-state is unaffected — but if Docker ever goes missing on
  the runner, the isolation specs now hard-fail instead of green-skipping.
- **verify:** `RESTO_REQUIRE_DOCKER` present in ci.yml under the affected job env;
  `pnpm format:check` / yaml stays valid.
- **done:** CI test runs can no longer silently skip the isolation suite.

## Out of scope (do NOT touch)

- Audit findings #14 (audit-fks blindness), #15/#17, #28 — separate tasks.
- No change to the 56 consuming spec files — the gate fix is centralised.

## must_haves

- truths:
  - "With RESTO_REQUIRE_DOCKER=1 and no Docker, isolation specs error instead of skipping"
  - "Local dev with no flag keeps skipping cleanly"
  - "CI sets RESTO_REQUIRE_DOCKER=1 for the test job"
- artifacts:
  - "packages/db/test/setup.ts (guarded probe)"
  - "apps/api/test/e2e/helpers/docker-availability.ts (guarded probe)"
  - "packages/db/test/unit/docker-availability-guard.spec.ts (new test)"
  - ".github/workflows/ci.yml (RESTO_REQUIRE_DOCKER env)"
