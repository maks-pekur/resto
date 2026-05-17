---
ticket: RES-235c (phase C of RES-235 split; ticket to create)
adr: 0020 (I-1), 0021 (Tier 1 — Multi-tenancy)
status: proposed
date: 2026-05-18
scope:
  - apps/api/eslint.config.mjs (add no-restricted-syntax rule + 2 overrides)
---

# RES-235c — ESLint guard against raw `tx.*` outside repository adapters

## Context

ADR-0020 I-1 says repo-layer tenant filter is mandatory ON TOP of RLS. RES-235a
shipped `ScopedTx` (the helper that auto-applies the filter); RES-241 migrated
the catalog repo to use it. RES-235c is the structural defense: lint blocks
`tx.select/insert/update/delete` anywhere in `apps/api/src/**` outside the
narrow allow-list of repository adapters and the system-context audit
consumer.

Audit of current production `tx.*` sites in `apps/api/src/**` (post RES-241):

- `apps/api/src/contexts/audit/application/record-audit.service.ts:34` —
  `tx.insert(schema.auditLog)` inside a `withoutTenant` block. The `auditLog`
  table is platform-wide (no tenantId column); legitimate system-context write.
- `apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts` —
  the single remaining raw query is the brands projection inside
  `loadPublishedMenu` (manual `eq(brands.tenantId, …)` per RES-241 spec §2).
- `apps/api/src/contexts/tenancy/infrastructure/brand-drizzle.repository.ts` —
  198 LOC; still on raw `tx.*` (not yet migrated; per memory mostly already
  has explicit tenantId filters). Phase C does NOT migrate this in this
  ticket — it just allowlists the file. Migration is a future ticket
  (RES-235d).
- `apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts` —
  the `tenants` table has no tenantId column (it IS the tenants table);
  uses `withoutTenant` extensively. Allowlist.

All four files fall under the `*-drizzle.repository.ts` glob (3 files) + the
specific audit service path.

## Design

### 1. Add `no-restricted-syntax` rule to `apps/api/eslint.config.mjs`

Insert three blocks (one new rule + two overrides) into the existing flat
config. Place adjacent to the existing `no-restricted-imports` rule from
RES-239 for proximity.

**(a) Block raw `tx.*` Drizzle verbs in `src/**/\*.ts`:\*\*

```js
{
  // ADR-0020 I-1: bypass-ScopedTx-by-default. Direct `tx.select/insert/
  // update/delete` is permitted only in repository adapters (where the
  // adapter takes responsibility for the tenant filter) and the audit
  // consumer (system context via `withoutTenant`; auditLog table is not
  // tenant-scoped). Everywhere else, route through ScopedTx.
  files: ['src/**/*.ts'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector:
          "CallExpression[callee.object.name='tx'][callee.property.name=/^(select|insert|update|delete)$/]",
        message:
          'ADR-0020 I-1: direct tx.select/insert/update/delete bypasses ScopedTx auto-filter. Use scoped.selectFrom / insertInto / updateTable, or place this code in a *-drizzle.repository.ts where the rule is allow-listed (the adapter takes responsibility for the tenant filter).',
      },
    ],
  },
},
```

**(b) Allow-list repository adapters and the audit consumer:**

```js
{
  // Sole legitimate callers of raw tx.* in api production code per
  // ADR-0020 I-1. The brand repo still uses raw tx.* pending migration
  // (RES-235d); the catalog repo retains a single manual brands
  // projection query that carries an explicit `eq(brands.tenantId, …)`.
  // record-audit.service.ts writes to the platform-wide auditLog table
  // (no tenant_id column) inside withoutTenant.
  files: [
    'src/contexts/**/infrastructure/*-drizzle.repository.ts',
    'src/contexts/audit/application/record-audit.service.ts',
  ],
  rules: {
    'no-restricted-syntax': 'off',
  },
},
```

**(c) Extend the existing `test/**/_.ts`override** with`'no-restricted-syntax': 'off'`— tests seed via raw`tx._`inside`withoutTenant` (system context) routinely.

### 2. No production source changes

The rule lands on a green tree. RES-241's catalog migration left only the
manual brands projection as the lone raw `tx.*` inside a repo; that repo is
allowlisted by the glob. brand-drizzle / tenant-drizzle repos still use raw
`tx.*` extensively — also allowlisted. audit service is the only non-repo
hit, explicitly allowlisted by path.

## Verification

In order:

1. **Pre-flight grep** — confirm the four allowlist paths cover every raw
   `tx.*` site in `apps/api/src/**`:

   ```bash
   grep -rnE "tx\.(select|insert|update|delete)" apps/api/src --include="*.ts" | grep -v "drizzle.repository.ts" | grep -v "record-audit.service.ts"
   ```

   Expected output: empty. If anything appears, either expand the allowlist
   or fix the offending callsite to use ScopedTx.

2. **Apply the edits** (Step 1 (a) + (b) + (c)).

3. **Positive lint** on a green tree:

   ```bash
   pnpm exec nx run api:lint
   ```

   Expected: PASS.

4. **Cross-package lint:**

   ```bash
   pnpm exec nx run-many -t lint -p db,api
   ```

   Expected: PASS.

5. **Negative check (manual, non-committed)** — verify the rule actually
   fires:
   - Add `await tx.select().from(schema.menuItems);` to a non-allowlisted
     file (e.g. `apps/api/src/contexts/catalog/application/get-menu-item.service.ts`
     — pick any `application/` or `interfaces/` file that lives outside
     `infrastructure/`). The line needs a `tx` variable in scope; if none,
     prefix with a local `const tx: never = undefined as never;` just to
     satisfy the parser and let the lint rule fire (the assertion never runs
     because we revert).
   - `pnpm exec nx run api:lint`.
   - Expected: FAIL with the configured ADR-0020 I-1 message at the
     offending line.
   - Revert with `git checkout -- <file>`.
   - Confirm clean tree.

6. **Typecheck** (sanity, cached):
   ```bash
   pnpm exec nx run api:typecheck
   ```
   Expected: PASS.

## Rollout

### Branch + commit

- **Branch:** `res-235c` (already checked out from `main`).
- **Single commit:**
  ```
  feat(api): block raw tx.select/insert/update outside repo adapters (lint)
  ```
  Atomic — rule + allowlist must land together or lint goes immediately red.

### PR + Linear

- PR title: `feat(api): block raw tx.* outside repo adapters (RES-235c)`.
- PR body: empty per project policy.
- Linear: create **RES-235c** as a child / sibling of RES-235 with the
  scope above. Attach PR on open. Move to In Review → Done on merge.
- RES-235 stays In Progress until brand migration (RES-235d, future) and
  `withoutTenant` allowlist (RES-235e, future) close. Or — judgment call
  at PR time — mark RES-235 itself Done if the user prefers tracking
  235d/235e as independent issues.

## Out of scope (this PR)

- **Brand repo migration** to ScopedTx — RES-235d (future ticket). The repo
  is allowlisted now; migration is a separate refactor.
- **`withoutTenant` allowlist mechanism** — RES-235e (future). Designing a
  list of legitimate paths or a decorator that limits which call sites can
  use the system-context escape hatch is a larger design question.
- **Stricter selector that targets only tenant-scoped tables** — current
  selector is verb-based (`tx.select/insert/update/delete`), so it fires on
  ALL Drizzle calls in non-allowlisted files including non-tenant-scoped
  tables. Acceptable trade-off: forces every raw `tx.*` to live in a repo
  or be justified explicitly. Refinement to table-aware selector would
  require enumerating tenant-scoped tables — fragile.
- **Permanent fixture / programmatic ESLint test** — overkill for a
  built-in rule, same as RES-239.

## Rejected alternatives

- **Shared preset (`packages/config-eslint/node.mjs`).** Only `apps/api`
  has repos with `tx.*`. Other apps don't consume `@resto/db`. Promote
  when a second runtime consumer appears.
- **AST grep / custom ESLint plugin.** Per ADR-0021 "Tooling preference
  order", `no-restricted-syntax` is the cheapest viable option. Custom
  plugin is last-resort.
- **Block via `no-restricted-imports`** of `schema.<tenant-scoped-table>`.
  Repos must import them; allowlist-by-file would be required anyway, and
  the import-based rule doesn't catch the actual misuse pattern
  (`tx.select().from(table)`).

## Open design notes

Resolved at impl time:

1. **Exact ESLint selector syntax** — `CallExpression[callee.object.name='tx'][callee.property.name=/^(select|insert|update|delete)$/]`. ESLint supports both attribute equality and regex-match on properties via `esquery`. Verified by RES-239's `no-restricted-imports` shape; `no-restricted-syntax` uses the same engine.
2. **Negative check fixture** — picking a non-allowlisted file. Any `application/` or `interfaces/http/` file works; `get-menu-item.service.ts` is suggested above.

## References

- [ADR-0020 — Multi-tenancy and event-bus invariants](../../adr/0020-multi-tenancy-and-event-bus-invariants.md) — invariant I-1.
- [ADR-0021 — Layered milestone strategy](../../adr/0021-layered-milestone-strategy.md) — Tier 1; tooling preference order names this rule explicitly.
- [RES-235a spec](./2026-05-17-res-235a-scoped-tx-design.md) — the ScopedTx primitive.
- [RES-241 spec](./2026-05-18-res-241-catalog-scopedtx-migration-design.md) — preceding catalog migration.
- [RES-239 spec](./2026-05-17-res-239-eslint-runintenantcontext-guard-design.md) — sibling lint guard pattern (I-6).
- Linear: RES-235c (to create); RES-235 (parent); RES-235d / RES-235e (future, brand migration + withoutTenant allowlist).
