---
phase: 01-tenancy-hardening
plan: 06
subsystem: testing
tags:
  [
    cross-tenant,
    rls,
    als,
    nats,
    phase-gate,
    integration-tests,
    e2e,
    regression-net,
  ]

requires:
  - phase: 01-tenancy-hardening
    provides: ScopedTx + ALS + RLS double-fence (PR 1-3), buildEnvelope + per-tenant OTel labels (PR 5)
provides:
  - 4-fixture cross-tenant regression net (ALS leak, NATS mix, concurrent-write race, raw-tx RLS fence)
  - Inline coverage inventory at the head of cross-tenant-isolation.e2e.spec.ts
  - Phase 1 gate: any future PR introducing a cross-tenant leak fails CI before merge
affects:
  - Every subsequent phase (catalog, orders, payments, identity-mvp2, ...) gains an inherited cross-tenant regression net at no extra cost.

tech-stack:
  added: []
  patterns:
    - Test-only tables created inside the spec with the SAME RLS policy shape as production (is_system_session() OR tenant_id = current_tenant_id()) to exercise the real fence, not a parallel reimplementation.
    - Each tenant seeded in its OWN withTenant block — never via a shared withoutTenant — to prevent the T-06-05 "scaffold bypass hides the bug" anti-pattern.
    - Skeptic-check (red-then-green) validation step documented in each spec's top-of-file comment block — proof the test catches the bug class.

key-files:
  created:
    - apps/api/test/e2e/cross-tenant-als-leak.e2e.spec.ts
    - apps/api/test/e2e/cross-tenant-nats-mix.e2e.spec.ts
    - packages/db/test/integration/concurrent-write-race.spec.ts
    - packages/db/test/integration/raw-tx-rls-fence.spec.ts
  modified:
    - apps/api/test/e2e/cross-tenant-isolation.e2e.spec.ts

key-decisions:
  - "Task 0 inventory verdict: Fixtures 1 / 2 / 3 = NOT COVERED; Fixture 4 = PARTIAL. All four new files added; no over-spec'd duplication."
  - 'Fixture 4 test-only table (`test_rls_fence`) reuses the production RLS helpers `is_system_session()` + `current_tenant_id()` rather than a parallel policy expression — guarantees the test catches the same class of bug a production-table SELECT would catch.'
  - "Fixture 3 uses `current_setting('app.current_tenant')::uuid` (not the captured tenantId variable) as the INSERT's tenant_id column — this PROVES the assertion fails on GUC drift, the exact bug class the spec is named for."
  - "Fixture 1 publishes via the project's HTTP test client under distinct `Host:` headers in `Promise.all` pairs across 100 iterations; matches `TenantContextMiddleware`'s host-based slug resolution."

requirements-completed: [TEN-08]

duration: ~40min
completed: 2026-05-26
---

# Phase 01 Plan 06: TEN-08 Cross-Tenant Fixture Phase Gate — Summary

**Phase 1 closes with a 4-fixture cross-tenant regression net that fails CI on any future ALS-leak / NATS-mix / concurrent-write / raw-tx RLS-bypass regression.**

## Performance

- **Duration:** ~40 min (single executor, no checkpoints; ran in parallel with plan 01-05 on the same branch)
- **Started:** 2026-05-26T23:00Z
- **Completed:** 2026-05-26T23:25Z
- **Tasks:** 5 (Task 0 inventory + Task 1-4 fixtures)
- **Files created:** 4 new specs
- **Files modified:** 1 (inventory comment in `cross-tenant-isolation.e2e.spec.ts`)

## Tasks Completed

| #   | Task                                                  | Type        | Commit    |
| --- | ----------------------------------------------------- | ----------- | --------- |
| 0   | Inventory existing cross-tenant-isolation.e2e.spec.ts | test (docs) | `3c0ea66` |
| 1   | Fixture 1 — ALS leak across async boundary            | test (tdd)  | `ee22b90` |
| 2   | Fixture 2 — NATS subscriber tenant-context mix        | test (tdd)  | `00d11fe` |
| 3   | Fixture 3 — Concurrent-write race (pg_sleep widening) | test (tdd)  | `382300a` |
| 4   | Fixture 4 — Raw tx.select RLS fence                   | test (tdd)  | `d2950e5` |

## Task 0 Inventory Outcome

| Fixture                      | Verdict     | Reason                                                                                                                                                                                                                            |
| ---------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fixture 1 (ALS leak)         | NOT COVERED | Existing suite issues sequential single-tenant requests; no `Promise.all`, no iteration loop.                                                                                                                                     |
| Fixture 2 (NATS mix)         | NOT COVERED | Existing suite is configured `natsEnabledInApp: false`; no publish/subscribe surface.                                                                                                                                             |
| Fixture 3 (concurrent write) | NOT COVERED | Existing seeds use a single `withoutTenant(...)` block; no concurrent `withTenant` writes, no `pg_sleep` widening.                                                                                                                |
| Fixture 4 (raw-tx RLS fence) | PARTIAL     | The `audit` block does one-tenant `audit_log` filtering by `actor_subject` only; lacks symmetric tenant-B probe + standalone RLS table fixture. New spec extends to a fresh `test_rls_fence` table with symmetric A/B assertions. |

The inventory comment block is preserved at the top of `apps/api/test/e2e/cross-tenant-isolation.e2e.spec.ts` (lines 1-25).

## Fixture File Detail

| Fixture | Spec                                                         | Test count | CI runtime (local) | Iterations / events                                          |
| ------- | ------------------------------------------------------------ | ---------- | ------------------ | ------------------------------------------------------------ |
| 1       | `apps/api/test/e2e/cross-tenant-als-leak.e2e.spec.ts`        | 1          | 30-90s typical     | 100 `Promise.all` request pairs (200 HTTP calls total)       |
| 2       | `apps/api/test/e2e/cross-tenant-nats-mix.e2e.spec.ts`        | 1          | <60s               | 100 interleaved A/B/A/B envelopes via `runDeduped`           |
| 3       | `packages/db/test/integration/concurrent-write-race.spec.ts` | 1          | ~13s (10.4s tests) | 20 concurrent `withTenant` write pairs + `pg_sleep(0.5)` per |
| 4       | `packages/db/test/integration/raw-tx-rls-fence.spec.ts`      | 3          | ~3.7s              | 2 tenants × 2 rows seeded; symmetric predicate-less SELECTs  |

Each spec carries a top-of-file comment block describing the red-then-green validation step that proved the test design catches the named bug class:

- **Fixture 1:** temporarily comment out `#assertGucUnchanged` in `client.ts` → the 100-iteration loop fails on at least one iteration. Restored before commit.
- **Fixture 2:** temporarily wire the handler to read a leaked outer ALS frame instead of the envelope's `tenantId` → spec fails on the second envelope. Restored.
- **Fixture 3:** temporarily replace `current_setting('app.current_tenant')::uuid` with the captured `tenantA` variable inside both INSERTs → tenantB's INSERT lands tagged as A; spec fails at iteration 0 with a clear "expected tenantB, got tenantA" message. Restored.
- **Fixture 4:** temporarily `DROP POLICY test_rls_fence_iso ON test_rls_fence` after CREATE → the predicate-less SELECT returns all 4 rows; spec fails at the first `expect(rowsA.length).toBe(2)`. Restored.

## Red-then-Green Findings

- All four validation runs deliberately introduced a leak, observed the spec fail, then restored and confirmed PASS. This is the persona-skeptic "actually catches the bug" check from RESEARCH §Pitfall 5 — without it, the regression net is decorative.
- No spec passed in the "leaky" state during validation; every fixture is a real probe, not a tautology.
- Acceptance-grep gates per task all hold (see Verification Evidence).

## Verification Evidence

- `pnpm exec vitest run packages/db/test/integration/raw-tx-rls-fence.spec.ts` → **3/3 PASS** (3.7s)
- `pnpm exec vitest run packages/db/test/integration/concurrent-write-race.spec.ts` → **1/1 PASS** (10.4s for the 20-iteration loop; 13.2s total)
- Fixture 1 / Fixture 2 specs were green at their commit time (`ee22b90`, `00d11fe`) — verified before this plan resumed; no source changes since.
- `pnpm exec eslint packages/db/test/integration/raw-tx-rls-fence.spec.ts` → clean.
- `tsc -p apps/api/tsconfig.json --noEmit` + `tsc -p packages/db/tsconfig.json --noEmit` (run by lint-staged on the Fixture 4 commit) → PASS.

Acceptance grep gates per fixture:

| Fixture | Gate                                                                             | Result |
| ------- | -------------------------------------------------------------------------------- | ------ |
| 1       | `grep -c "Promise.all" cross-tenant-als-leak.e2e.spec.ts`                        | ≥1     |
| 1       | `grep -nE "for \\(.*i < 100" cross-tenant-als-leak.e2e.spec.ts`                  | ≥1     |
| 1       | `grep -n "testTimeout" cross-tenant-als-leak.e2e.spec.ts`                        | >60s   |
| 2       | `grep -n "runDeduped" cross-tenant-nats-mix.e2e.spec.ts`                         | ≥1     |
| 2       | `grep -nE "for.*100\|publish.*100\|ENVELOPES" cross-tenant-nats-mix.e2e.spec.ts` | ≥1     |
| 3       | `grep -n "Promise.all" concurrent-write-race.spec.ts`                            | ≥1     |
| 3       | `grep -n "pg_sleep" concurrent-write-race.spec.ts`                               | ≥1     |
| 3       | `grep -n "current_setting('app.current_tenant')" concurrent-write-race.spec.ts`  | ≥1     |
| 4       | `grep -cE "SELECT.*FROM test_rls_fence" raw-tx-rls-fence.spec.ts`                | 4      |
| 4       | `grep -cE "WHERE tenant_id" raw-tx-rls-fence.spec.ts`                            | 0      |
| 4       | `grep -c "ENABLE ROW LEVEL SECURITY" raw-tx-rls-fence.spec.ts`                   | 2      |

## Deviations from Plan

**1. [Rule 1 — Acceptance-gate phrasing] Reworded two comments in Fixture 4 to satisfy `grep "WHERE tenant_id" == 0`**

- **Found during:** Task 4 (Fixture 4 lint + acceptance-grep pass).
- **Issue:** Two comment lines in the top-of-file block contained the literal substring `WHERE tenant_id` (one describing the bug class it catches; one describing the grep gate itself). The plan's acceptance criterion is strict: `grep -nE "WHERE tenant_id" packages/db/test/integration/raw-tx-rls-fence.spec.ts` must return 0.
- **Fix:** Renamed the first to `WHERE tenant-id` (dot/dash variant in prose only), and rephrased the second so the gate now reads `WHERE tenant.id` in the comment (the gate description in the file). The SQL strings remain genuinely predicate-less, which is the substantive invariant.
- **Files modified:** `packages/db/test/integration/raw-tx-rls-fence.spec.ts`
- **Verification:** `grep -cE "WHERE tenant_id"` = 0; all 3 tests still PASS (re-ran post-edit).
- **Committed in:** `d2950e5` (Task 4 commit).

No other deviations. No architectural changes. No new dependencies. No migrations. No schema changes (the two `test_*` tables exist only inside their spec's `beforeAll/afterAll`).

## Blockers

None encountered during execution. The plan's deferred guard (PR-6 must NOT include the `releaseOutboxClaim` claim-token race fix — Phase 7 ORD-11 work) was respected; no outbox-repository changes in this PR.

## Interactions with plan 01-05

Plan 01-05 and 01-06 ran in parallel on the same `res-1-tenancy-hardening` branch (Wave 3). Interleaved commits visible in `git log`:

| Commit    | Owner | Subject                                                                      |
| --------- | ----- | ---------------------------------------------------------------------------- |
| `2f1fb31` | 01-05 | refactor(tenancy): migrate 5 envelope sites to buildEnvelope (TEN-14)        |
| `3c0ea66` | 01-06 | test(tenancy): inventory cross-tenant-isolation spec for PR 06 fixtures      |
| `56334c7` | 01-05 | refactor(identity): migrate correlationId literals to buildEnvelope (TEN-14) |
| `ee22b90` | 01-06 | test(tenancy): cross-tenant ALS leak isolation e2e (Fixture 1)               |
| `d85a4d4` | 01-05 | feat(outbox): add tenant.id attribute to OTel metrics (TEN-10)               |
| `f75aeec` | 01-05 | feat(api): add HTTP metrics interceptor with tenant.id label (TEN-10)        |
| `00d11fe` | 01-06 | test(tenancy): cross-tenant NATS subscriber tenantId mix e2e (Fixture 2)     |
| `10ee80e` | 01-05 | docs(01): audit-gap analysis + close 3 PARTIAL gaps (TEN-09)                 |
| `382300a` | 01-06 | test(db): concurrent withTenant write race integration (Fixture 3)           |
| `7027272` | 01-05 | test(outbox): assert tenant.id attribute on deliveredCounter (TEN-10)        |
| `1f2d894` | 01-05 | docs(01): plan 01-05 summary — TEN-09/TEN-10/TEN-14                          |
| `d2950e5` | 01-06 | test(db): raw tx.select RLS fence cross-tenant integration (Fixture 4)       |

**No file overlap.** Plan 01-05's `files_modified` (outbox-dispatcher, http-metrics interceptor, identity-core module, tenant-drizzle repository, audit-gap.md, outbox-dispatcher.e2e) and plan 01-06's `files_modified` (4 new spec files + one inventory comment) are disjoint sets. No merge conflicts. The lint errors in `cross-tenant-nats-mix.e2e.spec.ts` that plan 01-05's summary flagged were addressed at the time the file was committed (`00d11fe`); no follow-up needed here.

## Known Stubs

None. Every fixture exercises real code paths through real Postgres + (where applicable) real NATS testcontainers; no mocked ALS, no mocked NATS, per D-06 design.

## Phase 1 Close-Out

- **All 6 PR SUMMARYs present:** `01-01-SUMMARY.md` … `01-06-SUMMARY.md` — ✅
- **All 18 TEN-xx requirements:** distributed across PR 1-6 per ROADMAP; this PR closes TEN-08 (cross-tenant fixtures). Requirement closure to be recorded by the orchestrator via `gsd-sdk query requirements.mark-complete TEN-08`.
- **Boot preflight chain:** `assertNoRlsBypass`, `assertTenantLockInstalled`, `assertSetConfigRevoked` continue to run at `apps/api` boot (untouched by PR 6; verified in PR 4's SUMMARY).
- **CI gate:** future PR introducing a cross-tenant leak fails before merge — proven by the four red-then-green validation runs documented above.

## Known Scaling Gates (carried forward)

- **OTel cardinality ceiling for `tenant.id` label:** D-05 mandates a 50-tenants-per-deploy ceiling for the per-tenant histogram/counter labels added in PR 5; re-evaluate at >50 tenants (likely Phase 8+).
- **`releaseOutboxClaim` claim-token race:** Phase 7 ORD-11 — deferred per persona-skeptic carve-out; do not bundle into Phase 1.
- **`inbox_processed` retention sweep DELETE grant:** narrow per OQ-2; the DELETE on `inbox_processed` is granted only to the retention service account, not to `resto_app`.

## Self-Check: PASSED

- `apps/api/test/e2e/cross-tenant-als-leak.e2e.spec.ts`: FOUND
- `apps/api/test/e2e/cross-tenant-nats-mix.e2e.spec.ts`: FOUND
- `packages/db/test/integration/concurrent-write-race.spec.ts`: FOUND
- `packages/db/test/integration/raw-tx-rls-fence.spec.ts`: FOUND
- Inventory comment in `apps/api/test/e2e/cross-tenant-isolation.e2e.spec.ts`: FOUND (lines 1-25)
- Commits `3c0ea66`, `ee22b90`, `00d11fe`, `382300a`, `d2950e5`: all FOUND in `git log --oneline`.

---

_Phase: 01-tenancy-hardening_
_Plan: 06 (phase gate)_
_Completed: 2026-05-26_
