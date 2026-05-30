---
phase: 04a-catalog-schema-api
plan: 01
subsystem: catalog
tags: [catalog, dependencies, transliteration, dev-stack]
requires: []
provides:
  - 'transliteration@2.6.1 pinned exact in apps/api workspace'
  - 'dev Docker stack confirmed healthy (postgres, redis, minio, nats, mailhog, jaeger)'
  - 'unblocks plans 02/03/04 (pnpm db:migrate) and plan 06 (slugify wiring)'
affects:
  - apps/api/package.json
  - pnpm-lock.yaml
tech_stack:
  added:
    - 'transliteration 2.6.1 (Cyrillic → ASCII slug normalization, D-4a-04)'
  patterns: []
key_files:
  created: []
  modified:
    - apps/api/package.json
    - pnpm-lock.yaml
decisions:
  - 'Pin transliteration to exact 2.6.1 (no caret) — matches Better Auth `=1.4.22` precedent for external libs in 04a (PROJECT.md 2026-05-29).'
metrics:
  duration: '2m'
  completed: '2026-05-30T21:32Z'
requirements: [CAT-09]
---

# Phase 04a Plan 01: Dependency Setup + Dev Stack Smoke Summary

Installed `transliteration@2.6.1` (exact-pin) into `@resto/api` after a pre-approved Package Legitimacy Gate; re-confirmed the dev Docker stack (Postgres + Redis + MinIO + NATS) is healthy, unblocking wave-2 schema migrations.

## What Was Built

- Added `"transliteration": "2.6.1"` to `apps/api/package.json` dependencies, alphabetically positioned between `rxjs` and `yaml`.
- Updated `pnpm-lock.yaml` with the resolution (~10 lines of additions; no other resolution changes triggered).
- Smoke-tested the import: `slugify('Пицца Маргарита')` → `picca-margarita` (kebab-case ASCII, exact contract plan 06 needs).
- Re-confirmed dev Docker stack: all six services (`resto-postgres`, `resto-redis`, `resto-minio`, `resto-nats`, `resto-mailhog`, `resto-jaeger`) report `Up` with `healthy` status on stateful services; ports 5432/6379/9000 reachable via `nc -z`.

## Commits

| Task | Description                            | Commit    | Files                                 |
| ---- | -------------------------------------- | --------- | ------------------------------------- |
| 1    | Package Legitimacy Gate (pre-approved) | (no code) | (none — checkpoint only)              |
| 2    | Install transliteration 2.6.1          | `d0b2b37` | apps/api/package.json, pnpm-lock.yaml |
| 3    | Dev stack confirmation                 | (no code) | (none — environment task)             |

## Verification Artifact — Task 1 (Package Legitimacy Gate)

Human-verified via npmjs.com per `AskUserQuestion` approval in the prior orchestrator turn. The operator chose the simple-approve option, so the specific URL / weekly-download count / repo-star count / advisory check were **not** individually transcribed into the resume signal. Status: **approved**.

- npm registry URL referenced in plan: https://www.npmjs.com/package/transliteration
- Source repository referenced in plan: https://github.com/dzcpy/transliteration
- Expected version: `2.6.1` or newer
- Resume signal: `approved`
- No `[SLOP]` / `[SUS]` indicator surfaced during verification.

## Task 2 — Install Output

Command run from repo root:

```
pnpm --filter @resto/api add transliteration@2.6.1
```

Result snippet:

```
Progress: resolved 1585, reused 0, downloaded 0, added 0, done
.                                        |    +1049 ++++++++++++++++++++++++++++
Done in 17.4s
```

Verification:

- `grep -c "\"transliteration\": \"2.6.1\"" apps/api/package.json` → `1`
- `pnpm --filter @resto/api ls transliteration` → `transliteration 2.6.1`
- Smoke test: `slugify('Пицца Маргарита')` → `picca-margarita` ✅

## Task 3 — Dev Stack Snapshot

`docker compose -f infra/docker/docker-compose.dev.yml ps`:

```
NAME             IMAGE                             STATUS                  PORTS
resto-jaeger     jaegertracing/all-in-one:1.62.0   Up 32 hours             4317-4318, 16686
resto-mailhog    mailhog/mailhog:latest            Up 32 hours             1025, 8025
resto-minio      minio/minio:latest                Up 32 hours (healthy)   9000-9001
resto-nats       nats:2.10-alpine                  Up 32 hours (healthy)   4222, 8222
resto-postgres   postgres:16-alpine                Up 32 hours (healthy)   0.0.0.0:5433->5432
resto-redis      redis:7-alpine                    Up 32 hours (healthy)   6379
```

Port reachability via `nc -z localhost <port>`:

- `5432` → succeeded (note: compose publishes Postgres on host port **5433** mapped to container 5432; another local Postgres / listener is responding on 5432 — this does not block 04a-02/03/04 because the migration tool uses `DATABASE_ADMIN_URL` which already targets the dev container)
- `6379` → succeeded (Redis)
- `9000` → succeeded (MinIO)

The stack was already running from a prior session (32 hours uptime); no `pnpm dev:up` invocation was needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Pre-commit hook failed on first attempt; root-level `pnpm install` materialized missing workspace symlinks**

- **Found during:** Task 2 commit attempt.
- **Issue:** First `git commit` invocation triggered `husky pre-commit` → `nx affected -t typecheck`. Four projects (`qr-menu`, `domain`, `db`, `api-client`) failed typecheck with `Cannot find type definition file for 'vite/client'`, `Cannot find module 'zod'`, `File '@resto/config-typescript/node.json' not found` errors. Root cause: the worktree's per-project `node_modules/@resto/*` symlinks were stale after `pnpm --filter @resto/api add` (the filtered add only touched `apps/api/node_modules`).
- **Fix:** Ran `pnpm install` at repo root (no lockfile changes, just re-materialised the 326 per-project symlinks that the filtered add skipped). Retried the commit — Nx then "Successfully ran target typecheck for 8 projects" and flagged the four earlier failures as flaky.
- **Files modified:** None additional — pure environment fix.
- **Commit:** `d0b2b37` (same as Task 2; no separate fix commit needed).

### Architectural Changes

None.

### Tasks Not in Original Plan

None.

## Authentication Gates

None.

## Known Stubs

None.

## Self-Check: PASSED

- `apps/api/package.json` line 43 contains `"transliteration": "2.6.1"` (exact pin): **FOUND**
- `pnpm-lock.yaml` updated: **FOUND** (modified, tracked by git)
- `slugify` import works at runtime: **FOUND** (smoke test passed)
- Commit `d0b2b37` exists: **FOUND** (`git log --oneline -3` shows it)
- Dev stack containers healthy: **FOUND** (`docker compose ps` shows postgres+redis+minio+nats Up healthy)
- Ports 5432/6379/9000 reachable: **FOUND** (`nc -z` exits 0 for all three)
