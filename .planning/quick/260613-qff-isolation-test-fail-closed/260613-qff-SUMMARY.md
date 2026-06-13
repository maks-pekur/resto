---
quick_id: 260613-qff
slug: isolation-test-fail-closed
date: 2026-06-13
status: complete
source: .planning/AUDIT.md finding #5 (HIGH)
---

# Quick Task 260613-qff — Summary

Closed AUDIT.md finding #5 (HIGH): the cross-tenant isolation test suite could
silently `describe.skip` and report green with zero assertions whenever Docker
was unavailable, so an RLS/ScopedTx regression could merge unverified.

## What changed

| #   | Change                                                                                                                                                                                                                                                                                                       | Files                                                                           | Commit  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ------- |
| 1   | Both shared `isDockerAvailable()` probes now `throw` (instead of `return false`) when `RESTO_REQUIRE_DOCKER` is `1`/`true` and Docker is absent. Specs call the probe at module-eval time, so the throw surfaces as a hard suite error — no silent skip. Flag absent → unchanged skip behaviour (local dev). | `packages/db/test/setup.ts`, `apps/api/test/e2e/helpers/docker-availability.ts` | 9f6efc7 |
| 2   | Unit test proving the contract: mocks `execSync` to simulate Docker-absent, asserts return-false (flag unset) and throw (flag `1`/`true`). Needs no Docker — runs in exactly the environment it protects.                                                                                                    | `packages/db/test/unit/docker-availability-guard.spec.ts`                       | 22eb6de |
| 3   | CI `affected` job sets `RESTO_REQUIRE_DOCKER: "1"` so the ~56 testcontainer specs can never green-skip on the runner. ubuntu-latest ships Docker → steady-state unaffected; a missing daemon now hard-fails.                                                                                                 | `.github/workflows/ci.yml`                                                      | 961b104 |

## Verification

- `pnpm exec vitest run test/unit/docker-availability-guard.spec.ts` → 3/3 pass.
- Pre-commit eslint + `nx typecheck` (db, events, api) green on every commit.
- `prettier --check` clean on ci.yml.
- Flag wiring confirmed present in all 4 intended locations.

## Notes / scope

- Centralised at the two probe definitions — none of the 56 consuming specs touched.
- Could NOT exercise the real throw path end-to-end on this machine (Docker is
  present locally, so real specs run rather than skip); the unit test covers the
  Docker-absent branch via mock. The flag's real-CI effect is a config change
  validated by inspection.
- Out of scope (separate AUDIT findings, not touched): #14 (`db:audit-fks`
  blindness to missing FKs), #15/#17 (`@RequireBrand` coverage), #28 (degraded
  cache test).
