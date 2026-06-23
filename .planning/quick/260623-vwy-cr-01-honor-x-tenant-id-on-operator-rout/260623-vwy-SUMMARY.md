---
phase: quick
plan: 260623-vwy
subsystem: api/shared
tags: [tenant-context, middleware, production-fix, unit-test]
dependency_graph:
  requires: []
  provides: [x-tenant-id honored on all operator routes in prod]
  affects: [apps/api/src/shared/tenant-context.middleware.ts]
tech_stack:
  added: []
  patterns: [split header gating — UUID header unconditional, slug header gated]
key_files:
  modified:
    - apps/api/src/shared/tenant-context.middleware.ts
    - apps/api/test/unit/shared/tenant-context.middleware.spec.ts
  created: []
decisions:
  - Split x-tenant-id and x-tenant-slug gating: UUID header unconditional (safe via AuthGuard RES-172 backstop), slug header stays behind shouldAcceptTenantSlugHeader (seed-CLI escape hatch RES-176)
metrics:
  duration: ~8min
  completed: 2026-06-23
  tasks: 3
  files: 3
---

# Quick 260623-vwy: CR-01 — Honor x-tenant-id on Operator Routes in Prod Summary

**One-liner:** Split header gating in `resolveTenantOnly` so `x-tenant-id` (UUID) is honored unconditionally on all routes while `x-tenant-slug` stays gated, unblocking the admin SPA's `/v1/*` operator calls in production.

## Tasks Completed

| #   | Name                                     | Commit                       | Files                                                         |
| --- | ---------------------------------------- | ---------------------------- | ------------------------------------------------------------- |
| 1   | Un-gate x-tenant-id in resolveTenantOnly | `527969c`                    | `apps/api/src/shared/tenant-context.middleware.ts`            |
| 2   | Add production-mode unit coverage        | `fdb0e06`                    | `apps/api/test/unit/shared/tenant-context.middleware.spec.ts` |
| 3   | Mark CR-01 closed in 07.6-REVIEW.md      | (uncommitted — orchestrator) | `.planning/phases/07.6-admin-vite-spa/07.6-REVIEW.md`         |

## What Changed

**Task 1 — middleware fix:**

`resolveTenantOnly` previously read `x-tenant-id` and `x-tenant-slug` inside the same `shouldAcceptTenantSlugHeader` gate (dev/test OR `/internal/v1/*` + valid token). In production on a single `admin.resto.app` host the gate was never satisfied for `/v1/*` routes, so the header was silently ignored and every `@RequiresTenantContext()` route returned 403 `auth.tenant_context_missing`.

Fix: moved the `x-tenant-id` (HEADER_TENANT_ID → `resolveById`) lookup OUT of the gate to run on every route. `x-tenant-slug` (HEADER_TENANT → `resolveBySlug`) stays inside the gate. Comments updated to WHY-only (RES-181 + RES-172 backstop for the ID path; RES-176 for the slug gate). `shouldAcceptTenantSlugHeader` and `timingSafeEqualString` untouched.

**Task 2 — unit tests:**

Added `describe('TenantContextMiddleware — x-tenant-id header (operator routes)')` to the existing spec with 3 new tests (all NODE_ENV='production'):

- **(a)** `x-tenant-id` UUID on `/v1/catalog/items` binds ALS context (asserts `getTenantContext()?.tenantId` inside `next` callback)
- **(b)** `x-tenant-slug` only (no `x-tenant-id`, non-resolving host) leaves context unbound — `resolveBySlug` not called
- **(c)** Customer-host resolution via `brands.findByDomainHost` takes precedence — `resolveById` not reached when host resolves a customer brand

Total spec: 10 tests (7 pre-existing + 3 new), all green.

**Task 3 — review doc:**

CR-01 bullet in `07.6-REVIEW.md` Remediation Status updated to `RESOLVED 2026-06-23` with commit references. CR-03a/CR-04/WR-04 untouched.

## Verification Output

```
pnpm --filter @resto/api exec vitest run test/unit/shared/tenant-context.middleware.spec.ts
  ✓ test/unit/shared/tenant-context.middleware.spec.ts (10 tests) 7ms
  Test Files  1 passed (1)
       Tests  10 passed (10)

pnpm exec nx run api:typecheck → NX Successfully ran target typecheck (cache)

pnpm --filter @resto/api exec eslint src/shared/tenant-context.middleware.ts test/unit/shared/tenant-context.middleware.spec.ts → (no output, clean)
```

## Deviations from Plan

None — plan executed exactly as written. The node_modules symlink (`node_modules → /Users/mp_dev/projects/RestOS/node_modules` and `apps/api/node_modules → /Users/mp_dev/projects/RestOS/apps/api/node_modules`) was created in the worktree to satisfy the `pnpm lint-staged` pre-commit hook. These symlinks are untracked and were not committed.

## Self-Check: PASSED

- `527969c` exists: `git log --oneline | grep 527969c` → `527969c fix(api): honor x-tenant-id on operator routes in prod`
- `fdb0e06` exists: `git log --oneline | grep fdb0e06` → `fdb0e06 test(api): add production-mode unit coverage for x-tenant-id operator path`
- `apps/api/src/shared/tenant-context.middleware.ts` — `HEADER_TENANT_ID` at line 79 (before `shouldAcceptTenantSlugHeader` at line 86)
- `apps/api/test/unit/shared/tenant-context.middleware.spec.ts` — new describe block present, 10 tests pass
- `.planning/phases/07.6-admin-vite-spa/07.6-REVIEW.md` — CR-01 line contains `RESOLVED 2026-06-23`
