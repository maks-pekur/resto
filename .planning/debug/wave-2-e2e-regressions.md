---
slug: wave-2-e2e-regressions
status: resolved
created: 2026-05-26
resolved: 2026-05-26
phase_context: 01-tenancy-hardening (completed, all 6 plans merged to main via PRs #183-#190)
baseline_commit: 7161336 (Wave 2 merged state, before Wave 3) — failures observed here BEFORE plan 01-05 commits landed
resolution_commits:
  - 917e30f (PR #191) — RC-1: GRANT DELETE on inbox_processed via roles.sql + preflight
  - c10c8bc (PR #192) — RC-2: ProblemDetailsFilter emits `code` field in body
  - 9443a07 (PR #193) — RC-3: identity-audit spec sanity probes pass x-tenant-id header
final_main: 9443a07
verification:
  - background-jobs.e2e.spec.ts → 4/4 PASS (was 3/4)
  - tenancy-suspend.e2e.spec.ts → 6/6 PASS (was 2/6)
  - identity-audit.e2e.spec.ts → 4/4 PASS (was 2/4)
---

# Debug Session: Phase 01 Wave 2 e2e Regressions

## Trigger

User-reported issue (verbatim): three pre-existing e2e regressions surfaced after Phase 01 Wave 2 merge: (1) identity-audit.e2e.spec.ts — sign-out and password-reset cases failing; (2) tenancy-suspend.e2e.spec.ts — 4 menu-block / 409-code cases failing; (3) background-jobs.e2e.spec.ts — inbox retention failing. Subagent reported these failed on baseline 7161336 BEFORE Wave 3 commits, so root cause is in Wave 2 plans 01-03 (tenancy domain) or 01-04 (preflight).

## Symptoms

1. **Expected behavior:** All `apps/api/test/e2e/*.spec.ts` pass on `main`.
2. **Actual behavior:** Three spec files have failing test cases (all reproduced locally on `7993c35`):
   - `apps/api/test/e2e/background-jobs.e2e.spec.ts` — 1 failure: `InboxRetentionService > deletes inbox_processed rows older than retention threshold` — `expected 5 to be +0` (line 91).
   - `apps/api/test/e2e/tenancy-suspend.e2e.spec.ts` — 4 failures, all of the same shape: `expected undefined to be 'tenancy.*'` on `body.code` (lines 92, 119, 167, 181).
   - `apps/api/test/e2e/identity-audit.e2e.spec.ts` — 2 failures: `records identity.signed_out.v1 ...` (line 145) and `revokes all user sessions ...` (similar sanity-check failure) — both `expected 403 to be 200` on the `sanityBefore` GET `/v1/tenants/me` probe.
3. **Reproduction recipe (corrected):** the specs use **testcontainers via `startRealStack()`** (`apps/api/test/e2e/with-real-stack.setup.ts`), NOT the `pnpm test:stack:up` Docker Compose stack. The harness spins fresh Postgres+NATS per spec file. Reproduce with:
   - `pnpm --filter @resto/api exec vitest run test/e2e/background-jobs.e2e.spec.ts`
   - `pnpm --filter @resto/api exec vitest run test/e2e/tenancy-suspend.e2e.spec.ts`
   - `pnpm --filter @resto/api exec vitest run test/e2e/identity-audit.e2e.spec.ts`

## Evidence

- timestamp: 2026-05-26T23:44 — ran background-jobs spec → 1/4 failed: `expected 5 to be 0` on remaining rows count.
- timestamp: 2026-05-26T23:45 — wrote ad-hoc diagnostic spec checking grants on `inbox_processed` for `resto_app` → returned **`INSERT, SELECT, UPDATE` only — no DELETE**. Direct DELETE attempt raised "Failed query: DELETE FROM inbox_processed ..." (permission denied), confirmed swallowed by `InboxRetentionService.run()`'s try/catch (which logs at `warn` but warns are emitted to stdout in this test config and visible — but no "Inbox retention sweep failed" line appeared because the assertion ran before the log flush).
- timestamp: 2026-05-26T23:45 — read `packages/db/migrations/0028_grant_delete_inbox_processed.sql` → wraps `GRANT DELETE` in `IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resto_app')`. Read `apps/api/test/e2e/with-real-stack.setup.ts` → `migrate(...)` runs FIRST, `provisionAppRole(...)` runs SECOND. Migration's IF EXISTS guard fails → GRANT skipped → role gets no DELETE → retention DELETE silently errors → no rows deleted.
- timestamp: 2026-05-26T23:46 — ran tenancy-suspend spec → 4/6 failed, all on `body.code` being undefined. Read `apps/api/src/shared/exception.filter.ts` → `ProblemDetails` interface (lines 14-22) lacks a `code` field; the filter extracts `code` from the exception body only to build the `type` URI (line 84), never adds it to the response body. Read `apps/api/src/shared/api/problem-details.dto.ts` → same omission. Grep across all `apps/api/test/e2e/` for `body.code` returns ONLY the four `tenancy-suspend` assertions — no other spec exercises this field, which is why the bug went undetected.
- timestamp: 2026-05-26T23:47 — ran identity-audit spec → 2/4 failed, both on `expect(sanityBefore.statusCode).toBe(200)` (got 403). Read `tenants.controller.ts` → `/v1/tenants/me` decorated `@RequiresTenantContext()`. Read `apps/api/src/contexts/identity/interfaces/http/guards/auth.guard.ts` lines 117-126 → AuthGuard returns 403 `auth.tenant_context_missing` when `alsTenantId` is unbound. Read `apps/api/src/shared/tenant-context.middleware.ts` → middleware only resolves tenant from `x-tenant-id` / `x-tenant-slug` headers or host header; cookies are never inspected. Test's sanity probe passes only `{ cookie }`, so ALS is unbound → 403. Confirmed against the `tenants-controller.e2e.spec.ts` spec (which passes): it always passes `'x-tenant-slug': slug` alongside the cookie. The `@RequiresTenantContext` was added to `/v1/tenants/me` on 2026-05-13 (commit `86aefd8`, RES-191); identity-audit spec was last touched 2026-05-09 (commit `c279b66`) and was never updated → it's been broken since 2026-05-13, unrelated to Wave 2.

## Root Causes (3 independent)

### RC-1 — background-jobs: GRANT DELETE skipped at migrate-time

- **What:** `0028_grant_delete_inbox_processed.sql` runs under `IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resto_app')`. In the testcontainers harness (and in any fresh dev DB), the migration runs BEFORE `provisionAppRole` creates the role. The guard fires → GRANT is skipped → `resto_app` never gets DELETE on `inbox_processed`.
- **Why latent in dev:** `pnpm db:reset` cycles seem to recreate roles AND tables in the order that leaves `resto_app` present at re-migrate time; the test harness uses a brand-new container every run, where the role is created strictly after migrate.
- **Impact:** `InboxRetentionService.run()` swallows the resulting `permission denied for table inbox_processed` error in its `try/catch` and the daily cron silently does nothing in production-shape deployments where roles are also provisioned post-migrate (per runbook).
- **Suggested specialist hint:** `general` (cross-cutting infra + SQL).

### RC-2 — tenancy-suspend: ProblemDetailsFilter does not emit `code` in the body

- **What:** `apps/api/src/shared/exception.filter.ts` extracts `code` from `HttpException.getResponse()` and uses it only for the `type` URI suffix. The wire body's `ProblemDetails` interface and `ProblemDetailsDto` schema lack a `code` field, so the field never reaches the client.
- **Why latent:** No other e2e spec asserts on `body.code` (verified by grep). All other consumers branch on the `type` URI suffix.
- **Impact:** Tests assert `body.code === 'tenancy.tenant_suspended'` etc. and always get `undefined`. Status codes 403/409 are correct; only the field is missing.
- **Two acceptable fixes:** (a) add `code` to the filter output + DTO (cheap, matches what callers ALREADY set in `throw new ForbiddenException({ code, message })` shape), or (b) change tests to parse the suffix of `type` instead. Option (a) is the principle-of-least-surprise fix because controllers already pass `code` and the filter strips it on the way out.
- **Suggested specialist hint:** `typescript` (NestJS shape + Zod DTO).

### RC-3 — identity-audit: `/v1/tenants/me` sanity probe never carried tenant context

- **What:** Spec's sanity probe `GET /v1/tenants/me` with `{ cookie }` only — no `x-tenant-id`/`x-tenant-slug`. The `@RequiresTenantContext()` decorator added in RES-191 (May 13) requires ALS tenant binding from the middleware, which only reads HEADERS not cookies. AuthGuard 403s with `auth.tenant_context_missing` before the handler runs.
- **Why latent:** Predates Wave 2 (broken since 2026-05-13). Not actually a Wave 2 regression — was bundled into this debug session because the plan-05 subagent ran all three failing specs together.
- **Impact:** The two sanity-probe failures (lines 145, 215) prevent the actual sign-out / password-reset assertions further down from ever running. The underlying audit behaviour may or may not work — we cannot tell until the probes pass.
- **Fix:** Pass `'x-tenant-id': tenant.id` (matches what admin app sends per RES-181 comment) alongside `cookie` on each sanity probe. This mirrors the `tenants-controller.e2e.spec.ts` pattern.
- **Suggested specialist hint:** `typescript` (test-only fix).

## Current Focus

Root cause identified for all three failures. Awaiting user decision on fix approach + branch strategy.

## Investigation Plan (completed)

1. ✅ Reproduce — got exact error output for each failing case (see Evidence).
2. ✅ Skip bisect — root causes are clear without it: RC-1 (migration ordering) and RC-2 (filter omission) are intrinsic to plan 01-03's surface; RC-3 is a pre-existing test gap from May 13 unrelated to Wave 2.
3. ✅ Verify migration state — confirmed via diagnostic spec showing actual grants on `inbox_processed`.
4. ✅ Diff suspect surface — `exception.filter.ts`, `problem-details.dto.ts`, `tenant-context.middleware.ts`, `auth.guard.ts`, `roles.sql`, migration `0028`, `inbox-retention.service.ts` all inspected.

## Constraints

- **Do NOT use --no-verify.** Pre-commit hooks must pass.
- **Do NOT silence or skip tests** as a "fix" — find and fix the actual defect.
- **Phase 01 is closed and shipped.** Any fix here is a follow-up commit / PR against main, not a re-open of Phase 01.
- **Branch decision:** discuss with user via checkpoint before creating a fix branch — the user's pattern is to ask before non-trivial work that produces commits.
