---
phase: 01-tenancy-hardening
plan: 04
subsystem: db
tags:
  [
    preflight,
    boot-assertion,
    rls,
    grants,
    eslint,
    flat-config,
    no-restricted-syntax,
    correlation-id,
    tenancy,
  ]

requires:
  - phase: 01-02
    provides: ephemeral postgres+nats test stack for integration assertions
  - phase: 01-03
    provides: buildEnvelope helper, BackgroundJobsModule, RequireActiveTenant guard, migration 0028 (inbox_processed DELETE grant)
provides:
  - assertNoBaCredentialAccess preflight (TEN-07) — 12-check has_table_privilege matrix proving resto_app cannot read Better Auth user/account/session/verification tables
  - assertWithoutTenantCallsiteRegistered preflight (TEN-11) — pure FS presence-check that every db.withoutTenant call site exists in the allowlist
  - Wave-3 ready bootstrap order in apps/api/src/main.ts — setConfig=54 < ba=60 < without=66 < listen=76
  - FORBIDDEN_CORRELATION_ID_LITERALS ESLint selector exported from packages/config-eslint/base.mjs (TEN-15)
  - no-restricted-imports ban on runInTenantContext outside HTTP middleware (TEN-12)
  - All 8 pre-existing correlationId randomUUID() literals tagged with TEN-14 PR-5 disable markers (deferred migration to buildEnvelope)
  - packages/config-eslint test infrastructure (vitest + nx project + fixtures)
affects: [01-05, 01-06]

tech-stack:
  added: []
  patterns:
    - 'Boot preflight assertion: assert<Invariant>(db) throws typed error class on failure; logger.info on PASS with a measurable signal ({ checks: N }, { allowed: N })'
    - 'Workspace-root path resolution: walk up from import.meta.url until pnpm-workspace.yaml is found — works in any cwd (vitest, esbuild bundle, k8s pod)'
    - 'ESLint flat-config rule-merging: ESLint does NOT merge entries within a rule across blocks — every consumer must spread the shared selector array (FORBIDDEN_CORRELATION_ID_LITERALS) into its own no-restricted-syntax block'

key-files:
  created:
    - packages/db/test/integration/preflight-ba-creds.spec.ts
    - packages/db/test/integration/preflight-without-tenant-allowlist.spec.ts
    - packages/config-eslint/test/no-restricted-syntax.spec.ts
    - packages/config-eslint/test/fixtures/forbidden-random-uuid.ts
    - packages/config-eslint/test/fixtures/forbidden-crypto-random-uuid.ts
    - packages/config-eslint/test/fixtures/legal-build-envelope.ts
    - packages/config-eslint/test/fixtures/legal-other-key.ts
    - packages/config-eslint/vitest.config.ts
    - packages/config-eslint/project.json
  modified:
    - packages/db/src/preflight.ts (added 2 new assertions + 2 typed error classes)
    - packages/db/src/index.ts (export new preflights)
    - apps/api/src/main.ts (wired both new awaits after assertSetConfigRevoked)
    - packages/config-eslint/base.mjs (FORBIDDEN_CORRELATION_ID_LITERALS export)
    - packages/config-eslint/package.json (test script + vitest devDep)
    - apps/api/eslint.config.mjs (spread FORBIDDEN_CORRELATION_ID_LITERALS into all no-restricted-syntax blocks)
    - packages/db/eslint.config.mjs (TEN-12 runInTenantContext ban + TEN-15 mirror)
    - packages/events/eslint.config.mjs (TEN-15 mirror)
    - apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts (5 eslint-disable -- TEN-14 PR-5 markers)
    - apps/api/src/contexts/identity/identity-core.module.ts (3 eslint-disable -- TEN-14 PR-5 markers)

key-decisions:
  - "Flat-config rule-merging hazard discovered during execution: ESLint does NOT merge entries within a rule across blocks. Initial implementation placed TEN-15 selectors only in base.mjs's top-level no-restricted-syntax; consumer configs that redefined the rule silently dropped the selectors. Fix: extract named array (FORBIDDEN_CORRELATION_ID_LITERALS), spread into every consumer's no-restricted-syntax. This is the workspace-wide pattern going forward."
  - 'Workspace-root resolution for TEN-11: plan said cwd-relative. Replaced with walk-up-from-source-file to pnpm-workspace.yaml — vitest cwd is package root, k8s pod cwd is /app, both must work.'
  - "TEN-14 8 existing literal sites are NOT migrated in this plan — they're tagged with eslint-disable -- TEN-14 PR-5 markers and deferred to plan 01-05 (identity context) and plan 01-06 (final integration). This preserves the per-PR atomic-commit model."

patterns-established:
  - 'Boot preflight order in main.ts: rls-bypass < tenant-lock < set-config-revoked < ba-creds < without-tenant-allowlist < listen'
  - 'ESLint flat-config — exported named selector arrays for cross-package consistency (FORBIDDEN_CORRELATION_ID_LITERALS pattern reusable for future cross-package rules)'
  - 'packages/config-eslint has its own vitest suite — verifies rules behave correctly against fixture files via the ESLint JS API'

requirements-completed:
  - TEN-07
  - TEN-11
  - TEN-12
  - TEN-15

duration: 19min
completed: 2026-05-26
---

# Plan 01-04: DB Preflight + Cross-Package ESLint Rules (PR 4) — Summary

Two new boot preflight assertions in `packages/db/src/preflight.ts` close the last RLS-related boot-guard gaps: `assertNoBaCredentialAccess` runs a 12-check `has_table_privilege` matrix proving the `resto_app` role cannot read Better Auth's user/account/session/verification tables; `assertWithoutTenantCallsiteRegistered` performs a pure FS presence-check that every `db.withoutTenant` call site in the workspace is listed in the allowlist. Both wire into `apps/api/src/main.ts` after `assertSetConfigRevoked` (boot order: rls-bypass < tenant-lock < set-config-revoked < ba-creds < without-tenant-allowlist < listen).

Two cross-package ESLint rules ship alongside: TEN-15 blocks direct `correlationId: randomUUID()` / `crypto.randomUUID()` construction (exported as `FORBIDDEN_CORRELATION_ID_LITERALS` from `@resto/config-eslint` for cross-package reuse), and TEN-12 bans `runInTenantContext` imports outside HTTP middleware. The 8 pre-existing literal sites are tagged with `eslint-disable -- TEN-14 PR-5` markers, deferring migration to plan 01-05 / 01-06.

## Verification

| Command                                      | Result                                                          |
| -------------------------------------------- | --------------------------------------------------------------- |
| `pnpm --filter @resto/db test`               | PASS — 147/147 (incl. 11 preflight tests)                       |
| `pnpm --filter @resto/config-eslint test`    | PASS — 4/4 ESLint fixture tests                                 |
| `apps/api` typecheck                         | PASS                                                            |
| `apps/api` esbuild build                     | PASS — 341.6 KB dist/main.cjs                                   |
| `pnpm exec nx run-many -t lint --parallel=3` | PASS — 8/8 projects (2 unrelated pre-existing warnings in seed) |
| Order assertion in `main.ts`                 | setConfig=54 < ba=60 < without=66 < listen=76                   |

## Commits

- `905e67c` `feat(db): add assertNoBaCredentialAccess boot preflight (TEN-07)`
- `d20fe65` `feat(db): add assertWithoutTenantCallsiteRegistered presence-check (TEN-11)`
- `a7b8fdd` `feat(api): wire TEN-07 and TEN-11 preflight checks into bootstrap`
- `17e00f8` `feat(eslint): block direct correlationId construction (TEN-15)`
- `72207f7` `chore(api): tag 8 correlationId literals with TEN-14 PR-5 disable markers`
- `5b7a851` `chore(eslint): mirror TEN-12 and TEN-15 rules into db and events configs`

## Deviations

4 deviations documented in `01-04-PLAN.md` `## Deviations` section. The most important one:

- **Flat-config rule-merging hazard** (discovered during execution): ESLint flat-config does NOT merge entries within a rule across blocks — initial implementation that placed selectors only in `base.mjs`'s top-level `no-restricted-syntax` silently dropped them in every consumer config that redefined the rule. Fixed by extracting `FORBIDDEN_CORRELATION_ID_LITERALS` as a named export and spreading it into every consumer's `no-restricted-syntax` block, including the `*-drizzle.repository.ts` file-pattern override. Verified via `eslint --print-config` and live lint against `identity-core.module.ts` (3 errors before disable comments, 0 after).
- Workspace-root path resolution for TEN-11 replaced cwd-relative resolution (broken in vitest + bundled images) with walk-up-to-`pnpm-workspace.yaml`.
- `packages/config-eslint` gained vitest + nx-project + scripts (test infrastructure didn't exist).

## Downstream

Plan 01-05 (identity context) and 01-06 (final integration) inherit:

- The boot preflight order is now locked at 6 phases (`rls-bypass → tenant-lock → set-config-revoked → ba-creds → without-tenant-allowlist → listen`). Any new preflight in plan 01-05/06 slots between `without-tenant-allowlist` and `listen`.
- TEN-14 migration (8 literal sites → `buildEnvelope`) is deferred to plan 01-05 (identity-core.module.ts: 3 sites) and plan 01-06 (tenant-drizzle.repository.ts: 5 sites). The `eslint-disable -- TEN-14 PR-5` markers point exactly to those sites.
- `FORBIDDEN_CORRELATION_ID_LITERALS` is the canonical export for any future ESLint-config consumer that wants to block correlationId literals.
