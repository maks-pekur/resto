# RES-252 Phase 2b — `withoutTenant` allowlist + ESLint enforcement

**Status:** design approved 2026-05-24 — ready for plan.
**Ticket:** [RES-252](https://linear.app/restico/issue/RES-252) Phase 2b — the last unchecked AC item from the parent (ticket itself is marked Done because Phase 2a closed the bulk; this finishes the allowlist + linter that the AC explicitly required).
**Authority:** ADR-0020 I-1 (mandatory tenant filter at repository layer); ADR-0021 Tier 1 freeze criteria.
**Branch:** `res-252-phase-2b` (off main at `bdeb831`).

## 1. Purpose

Close the last RES-252 acceptance item: ship an explicit, auditable allowlist of files that may call `db.withoutTenant(reason, op)`, plus an ESLint rule that fails any call from outside the allowlist. Today the helper is reviewer-enforced — exactly the regime ADR-0021 calls out as paper-only.

## 2. Scope

### 2.1 In scope

- **`packages/db/src/withoutTenant.allowlist.ts`** — TS source-of-truth exporting `WITHOUT_TENANT_ALLOWLIST: readonly string[]` with the canonical list of allowed call sites (repo-root-relative file paths). One inline comment per entry justifying WHY the file legitimately needs system context (this is a documented allowlist — exception to no-comments policy; WHY is the entire point).
- **ESLint rule** in three configs: `apps/api/eslint.config.mjs`, `packages/db/eslint.config.mjs`, `packages/events/eslint.config.mjs`. Blocks `CallExpression[callee.property.name='withoutTenant']` everywhere by default; an override block per config re-enables it on the allowlist files for THAT package.
- **Parity test** at `packages/db/test/unit/withoutTenant-allowlist.spec.ts` that imports `WITHOUT_TENANT_ALLOWLIST` from the TS module, reads each of the three `eslint.config.mjs` files as text, extracts the allowlist literal from each override block, and asserts the union of those literals exactly equals the TS constant.

### 2.2 Allowlist contents (current production callers)

Six files across three packages. Verified via `grep -rn "withoutTenant(" --include='*.ts'` filtered for production code (excluding `.spec.ts`, `.test.ts`, `test/`, `packages/db/src/client.ts` itself which defines the helper).

| File                                                                              | Why                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/contexts/tenancy/infrastructure/brand-drizzle.repository.ts`        | Host-based brand resolution (`findByDomainHost`, `findBySlug`, `findActiveSlugsByPrefix`) — runs before ALS tenant binding because the host IS what resolves the tenant.                                                                                                   |
| `apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts`       | Tenant lifecycle (`findBySlug`, `findByDomainHost`, `listDomains`, `save`, `listScheduledForErasure`, `eraseTenant`, `findById`) — same reason as brand repo: lookups happen before ALS binding, plus platform-level ops (provision/erase) operate cross-tenant by design. |
| `apps/api/src/contexts/audit/application/record-audit.service.ts`                 | Audit consumer writes to the platform-wide `audit_log` table (which is intentionally NOT tenant-scoped on SELECT — `tenant_id` is nullable for platform events).                                                                                                           |
| `apps/api/src/contexts/identity/infrastructure/identity-event-emitter.adapter.ts` | Identity event emitter writes to outbox from Better Auth hook handlers — BA hooks fire OUTSIDE any HTTP request, so no ALS tenant is bound.                                                                                                                                |
| `packages/db/src/cli/audit-fks.ts`                                                | CLI tool — system-context schema scan, runs outside any tenant.                                                                                                                                                                                                            |
| `packages/events/src/inbox/run-deduped.ts`                                        | Inbox dedup consumer wrapper — message-broker delivery path has no ALS tenant, message envelope carries `tenantId` for downstream handler.                                                                                                                                 |

### 2.3 Out of scope

- **Test files.** All e2e/integration specs that use `withoutTenant` for fixture seeding stay covered by existing `files: ['test/**/*.ts']` overrides that disable `no-restricted-syntax` per-package. No change.
- **`packages/db/src/client.ts`.** It DEFINES `withoutTenant` (`async withoutTenant<T>(reason, op) { ... }`). The selector matches `CallExpression[callee.property.name='withoutTenant']` — a method definition is not a call. The selector also doesn't match `this.withoutTenant(...)` internal usage by name, but if it did the existing `files: ['src/client.ts']` override in `packages/db/eslint.config.mjs` would cover it.
- **`apps/admin`, `apps/qr-menu`, `apps/website`, `apps/mobile`, `apps/landing`.** These apps don't import `@resto/db` directly — they go through `@resto/api-client`. No ESLint coverage added there; if they ever DO import `@resto/db`, that would be a separate ADR-violating decision that the package-boundary lint catches first.
- **A custom `@resto/eslint-plugin` package.** ADR-0021 tooling preference order said "ESLint plugin under `tools/eslint-plugin-resto/` — last resort". We're not building a custom plugin; built-in `no-restricted-syntax` is sufficient and matches the existing RES-243 / RES-239 / I-1-tx pattern.

## 3. Architecture

### 3.1 Single source of truth + parity test

The TS constant is the canonical "what's allowed" doc. ESLint configs hardcode the same paths in their `files:` override blocks because ESLint flat config (`.mjs`) can't trivially import `.ts` at config-resolution time without extra tooling. The parity test bridges the gap: import the TS const, read the three `.mjs` files as text, regex out the override `files:` arrays, union them, compare to the const.

This shape means:

- **Adding a new allowed caller:** dev edits the TS const + the relevant package's `eslint.config.mjs` override `files:` array. PR reviewer sees both edits. Parity test passes only if both match.
- **Forgetting one edit:** parity test fails on the next CI run.

### 3.2 ESLint rule shape

Per package, add to `eslint.config.mjs`:

```mjs
{
  files: ['<src-path>/**/*.ts'],
  rules: {
    'no-restricted-syntax': [
      'error',
      // ... existing entries unchanged
      {
        selector: "CallExpression[callee.property.name='withoutTenant']",
        message:
          "RES-252 I-1: `withoutTenant` bypasses tenant filter + RLS. Allowed only in <package>'s allowlist (packages/db/src/withoutTenant.allowlist.ts). Add the file path there + update this config's allow-block, or use db.withTenant / db.withTenantId.",
      },
    ],
  },
},
{
  // Allowlisted callers per RES-252 / withoutTenant.allowlist.ts
  files: [
    'src/contexts/tenancy/infrastructure/brand-drizzle.repository.ts',
    // ... (full allowlist for this package)
  ],
  rules: {
    'no-restricted-syntax': 'off',
  },
},
```

Note the override block uses `'no-restricted-syntax': 'off'` (turning off the entire rule for the file) rather than removing only the `withoutTenant` selector. This matches the existing pattern in `apps/api/eslint.config.mjs` (e.g., the repo-adapter override block at line 100). The cost is that allowlisted files also bypass the `tx.*` and `set_config` selectors — acceptable because those files are already trusted repository adapters or system-context utilities.

### 3.3 Parity test mechanics

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WITHOUT_TENANT_ALLOWLIST } from '../../src/withoutTenant.allowlist';

const ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');

const CONFIGS = [
  { path: 'apps/api/eslint.config.mjs', prefix: 'apps/api/' },
  { path: 'packages/db/eslint.config.mjs', prefix: 'packages/db/' },
  { path: 'packages/events/eslint.config.mjs', prefix: 'packages/events/' },
];

const extractAllowlist = (configText: string, prefix: string): string[] => {
  // Scan for paths that start with "src/" inside any `files: [...]` array
  // attached to a `no-restricted-syntax: 'off'` block and return them
  // prefixed with the package directory.
  // Implementation in plan.
  return [];
};

describe('RES-252 Phase 2b: withoutTenant allowlist parity', () => {
  it('TS const matches the union of ESLint override blocks', () => {
    const fromConfigs = CONFIGS.flatMap((c) =>
      extractAllowlist(readFileSync(resolve(ROOT, c.path), 'utf-8'), c.prefix),
    );
    expect(fromConfigs.sort()).toEqual([...WITHOUT_TENANT_ALLOWLIST].sort());
  });
});
```

The exact extraction logic is plan-level — the spec contract is "test asserts the two sources agree".

## 4. Verification (local)

1. `pnpm --filter @resto/api lint` — passes (allowlisted callers green, no new violations).
2. `pnpm --filter @resto/db lint` — passes.
3. `pnpm --filter @resto/events lint` — passes.
4. `pnpm --filter @resto/db exec vitest run test/unit/withoutTenant-allowlist.spec.ts` — passes.
5. Negative test (manual, not committed): temporarily add `db.withoutTenant('test bypass', tx => ...)` inside some non-allowlisted file (e.g. `apps/api/src/main.ts`); confirm `pnpm --filter @resto/api lint` fails with the RES-252 message. Revert.
6. `pnpm --filter @resto/api test integration` — no regression (existing specs that use `withoutTenant` for fixtures are inside `test/**/*.ts` which already has the rule disabled per-package).
7. `pnpm typecheck` clean.

## 5. PR shape

- **Branch:** `res-252-phase-2b` (already created off main at `bdeb831`).
- **Commits (3):**
  1. `feat(db): add withoutTenant allowlist source-of-truth (RES-252)` — new TS const file.
  2. `feat(api,db,events): enforce withoutTenant allowlist via ESLint (RES-252)` — adds the rule + override block in three configs.
  3. `test(db): parity test for withoutTenant allowlist (RES-252)` — new spec.
- **PR title:** `feat(api,db,events): enforce withoutTenant allowlist (RES-252)`.
- **PR body:** none (per project convention).

## 6. Followups (file post-merge)

- **Documentation in `packages/db/README.md` § Tenant context wrappers**: add a short paragraph pointing at the allowlist + linter as the I-1 enforcement layer. The README already mentions ESLint enforcement elsewhere (line 117) — extending it is mechanical.
- **gsd-extract-learnings note**: the "two-file consistency via parity test" pattern is now used twice (this ticket + planned future ones). Worth a short ADR if a third instance shows up.

## 7. Risks and mitigations

| Risk                                                                      | Mitigation                                                                                                                                                                                            |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I missed a production callsite                                            | The first `pnpm lint` run after the rule lands fails fast on any missed file. Fix is one allowlist edit.                                                                                              |
| ESLint mjs config can't import TS at resolution time                      | Confirmed; that's why parity test bridges TS const ↔ mjs literal arrays.                                                                                                                              |
| Override block disables full `no-restricted-syntax` for allowlisted files | Acceptable — same pattern used elsewhere in `apps/api/eslint.config.mjs` (the repo-adapter override at line 100 disables the rule entirely for files that take responsibility for the tenant filter). |
| Parity test extracts allowlist wrong (regex fragility)                    | Plan-phase nails the extraction logic; test runs in CI and fails loudly if the configs / TS const diverge.                                                                                            |
| Tests that legitimately use `withoutTenant` for fixture seeding break     | All three configs already have `files: ['test/**/*.ts']` overrides that turn off `no-restricted-syntax` for tests. Unchanged.                                                                         |

## 8. Acceptance criteria

- `packages/db/src/withoutTenant.allowlist.ts` exists, exports `WITHOUT_TENANT_ALLOWLIST: readonly string[]` with 6 entries (all listed in §2.2).
- ESLint rule blocking `CallExpression[callee.property.name='withoutTenant']` exists in `apps/api/eslint.config.mjs`, `packages/db/eslint.config.mjs`, `packages/events/eslint.config.mjs`.
- Each config has an override block that re-enables (via `'no-restricted-syntax': 'off'`) the rule for the allowlisted files within its package.
- Parity test at `packages/db/test/unit/withoutTenant-allowlist.spec.ts` passes.
- `pnpm lint` passes across all three packages.
- Manual negative test: a temporary non-allowlisted `withoutTenant` call surfaces the RES-252 message at lint time.
- 3 commits with exact subjects from §5.
