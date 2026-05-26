---
phase: 01-tenancy-hardening
plan: 02
subsystem: testing
tags: [docker, compose, integration, postgres, nats, smoke, test-infra]

requires:
  - phase: pre-01
    provides: existing infra/docker dev compose stack + packages/events postgres+nats clients
provides:
  - Ephemeral docker-compose.test.yml (postgres 16 + nats 2.10) parallel-safe with dev stack
  - pnpm script wrapper (test:stack:up|down|status|smoke) backed by scripts/test-stack.mjs
  - Compose-stack smoke spec that proves the test stack actually accepts SQL + NATS pub/sub
affects: [01-04, 01-06]

tech-stack:
  added: []
  patterns:
    - 'Ephemeral compose stack: tmpfs volumes, localhost-only port bindings, separate ports from dev stack, conservative resource limits'
    - 'Docker-gated specs: use `describe.skipIf(!isDockerAvailable())` so CI without Docker is not blocked'

key-files:
  created:
    - infra/docker/docker-compose.test.yml
    - infra/docker/test-stack-smoke.spec.ts
    - infra/docker/vitest.smoke.config.ts
    - scripts/test-stack.mjs
    - scripts/test-stack-smoke.mjs
  modified:
    - package.json

key-decisions:
  - "Smoke spec runs via the events package's vitest binary (with a custom config that aliases nats + postgres into events/node_modules) rather than registering a new root vitest. The workspace has no root vitest; events is the only package where both clients are hoisted."
  - 'Port mapping: 55432 (postgres) and 54222 (nats) bound to 127.0.0.1 only — coexists with dev stack on 5432/4222 and mitigates external exposure (T-02-03).'

patterns-established:
  - 'Test compose stack lifecycle: `pnpm test:stack:up && pnpm test:stack:smoke && pnpm test:stack:down` is the canonical local check'
  - 'Docker-availability gate via isDockerAvailable() inside the smoke spec — pattern reusable by future docker-dependent specs'

requirements-completed: []

duration: 5min
completed: 2026-05-26
---

# Plan 01-02: Test Infrastructure Foundation (PR 2) — Summary

Ephemeral postgres+nats compose stack and a smoke spec proving it boots, accepts a `SELECT 1`, and round-trips a NATS publish/subscribe. Foundation for the testcontainers-driven E2E work in plans 01-04 and 01-06.

## Verification

| Command                                                                 | Result                                 |
| ----------------------------------------------------------------------- | -------------------------------------- |
| `docker compose -f infra/docker/docker-compose.test.yml config --quiet` | PASS                                   |
| `docker compose -f infra/docker/docker-compose.test.yml up -d --wait`   | PASS (both services healthy)           |
| `pnpm test:stack:up && pnpm test:stack:status && pnpm test:stack:down`  | PASS (lifecycle round-trip clean)      |
| `pnpm test:stack:smoke`                                                 | PASS — 2/2 in 3.3s, stack auto-cleaned |
| `docker ps -a \| grep resto-test-`                                      | PASS — zero leaked containers post-run |
| Pre-commit `nx run-many -t typecheck` on task 3 commit                  | PASS                                   |

## Commits

- `f81c6e9` `feat(infra): add ephemeral docker-compose.test.yml for postgres+nats`
- `c64ce72` `feat(scripts): add test-stack wrapper with up/down/status/smoke pnpm scripts`
- `78adfaa` `test(infra): add compose-stack smoke spec with postgres+nats roundtrip`

## Deviations

- **`test:stack:smoke` script added in Task 2 instead of Task 3** — Task 2's "3 new scripts" expanded to 4 so the smoke entry-point existed when Task 3 referenced it. Same outcome.
- **Smoke runs via `node scripts/test-stack-smoke.mjs`** which invokes the events-package vitest with an aliased config, rather than a root vitest binary (which does not exist). Behavior is identical; spec lives at the plan-mandated path; smoke spec is not picked up by any default `pnpm test` run.
- **Helper script is both `chmod +x` and invoked via `node` shebang** — defensive belt-and-suspenders; matches the plan intent.

## Downstream

Plans 01-04 (TEN-07 preflight integration test) and 01-06 (TEN-08 fixture matrix) can build on this compose stack for long-running scenarios. The canonical testcontainers entry points (`startRealStack`, `startPostgres`) are untouched.
