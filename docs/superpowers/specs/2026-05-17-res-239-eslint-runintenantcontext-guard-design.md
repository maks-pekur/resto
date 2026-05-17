---
ticket: RES-239
adr: 0020 (I-6), 0021 (Tier 1 — Multi-tenancy)
status: proposed
date: 2026-05-17
scope:
  - apps/api/eslint.config.mjs (add no-restricted-imports rule + 2 overrides)
---

# RES-239 — ESLint guard against `runInTenantContext` outside the tenant middleware

## Context

ADR-0020 invariant I-6 declares `runInTenantContext` HTTP-middleware-only.
RES-240 (merged 2026-05-17, commit `a19f3bf`) closed the code violation in
`IdentityEventEmitterAdapter` and the audit pass confirmed the production
callers are now:

- `apps/api/src/shared/tenant-context.middleware.ts` — legitimate
- `packages/db/src/context.ts` — the definition
- `packages/db/src/index.ts` — internal re-export

RES-239 adds the **structural defense** so a future regression (re-importing
`runInTenantContext` into any other code path) is caught at lint time
instead of relying on post-hoc grep audits. This is the second half of the
RES-240 fix: code clean + rule enforced.

## Design

### 1. Add the rule and overrides to `apps/api/eslint.config.mjs`

The rule lives **locally in the api app**, not in the shared `node` preset.
Rationale: only `apps/api` consumes `@resto/db` at runtime today (admin /
qr-menu / website / mobile are frontends and do not import the package).
Promotion to `packages/config-eslint/node.mjs` happens when a second
runtime consumer appears.

Three modifications to `apps/api/eslint.config.mjs`:

**(a)** Insert a new block after the existing `files: ['src/**/*.ts']` rule
block (current lines 13–20):

```js
{
  // ADR-0020 I-6: `runInTenantContext` binds tenant in AsyncLocalStorage
  // and is HTTP-middleware-only. Non-HTTP code paths (BA hooks, NATS
  // subscribers, outbox dispatcher, CLI, background jobs) must use
  // `db.withTenant` (ALS-bound) or `db.withTenantId(id, op)` (explicit)
  // or `db.withoutTenant(reason, op)` (system) — see
  // packages/db/src/client.ts.
  files: ['src/**/*.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '@resto/db',
            importNames: ['runInTenantContext'],
            message:
              'ADR-0020 I-6: runInTenantContext is HTTP-middleware-only. Use db.withTenant / db.withTenantId / db.withoutTenant instead. Sole legitimate caller: apps/api/src/shared/tenant-context.middleware.ts.',
          },
        ],
      },
    ],
  },
},
```

**(b)** Insert a per-file override allow-listing the only legitimate
caller. Place it adjacent to the rule block so the exception lives next
to its rationale:

```js
{
  // Sole legitimate caller of runInTenantContext per ADR-0020 I-6.
  files: ['src/shared/tenant-context.middleware.ts'],
  rules: {
    'no-restricted-imports': 'off',
  },
},
```

**(c)** Extend the existing `files: ['test/**/*.ts']` block (current lines
42–51) to also disable the new rule for test files — they simulate HTTP
middleware behaviour to exercise tenant-aware paths and may legitimately
call `runInTenantContext`. Add one more line inside the rules object:

```js
{
  files: ['test/**/*.ts'],
  rules: {
    '@typescript-eslint/unbound-method': 'off',
    '@typescript-eslint/no-confusing-void-expression': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unnecessary-condition': 'off',
    // Test files simulate HTTP middleware behavior to exercise
    // tenant-aware paths — they may legitimately call runInTenantContext.
    'no-restricted-imports': 'off',
  },
},
```

### 2. No changes anywhere else

- `packages/config-eslint/**` untouched — rule is api-local.
- `packages/db/eslint.config.mjs` untouched — the package owns the
  primitive (`context.ts` defines, `index.ts` re-exports). Neither file
  imports `runInTenantContext` from `@resto/db`; they reference it
  directly. `no-restricted-imports` only checks imports from the named
  module, so the rule would not fire on these even if it were applied
  there.
- No production source files change. RES-240 already removed the only
  violation.

## Verification

In order:

1. **Pre-flight grep** — confirm no leftover violations before applying
   the rule:

   ```bash
   grep -rn "runInTenantContext" apps/api/src --include="*.ts" | grep -v "shared/tenant-context.middleware.ts"
   ```

   Expected output: empty. If anything appears, RES-240 missed a caller
   and that must be fixed first (this should not happen — audit was clean
   when RES-240 merged).

2. **Apply the three edits** above.

3. **Positive check** — lint must be green on the existing clean tree:

   ```bash
   pnpm exec nx run api:lint
   ```

   Expected: PASS.

4. **Cross-package lint** — confirm no collateral damage:

   ```bash
   pnpm exec nx run-many -t lint -p db,api
   ```

   Expected: PASS.

5. **Negative check (manual, non-committed)** — verify the rule actually
   fires when violated:
   - Add `import { runInTenantContext } from '@resto/db';` (and a
     no-op reference like `void runInTenantContext;`) to any
     `apps/api/src/contexts/**/*.ts` file (e.g. the just-fixed
     `identity-event-emitter.adapter.ts`).
   - Run `pnpm exec nx run api:lint`.
   - Expected: FAIL with the configured error message at the offending
     line.
   - Revert: `git checkout -- <file>`.
   - The negative check is a one-time verification, not a permanent
     fixture test. Built-in rules don't need their own programmatic
     tests; the CI lint job is the ongoing defense.

6. **Typecheck** — sanity, should be cached:
   ```bash
   pnpm exec nx run api:typecheck
   ```
   Expected: PASS.

## Rollout

### Branch + commit

- **Branch:** `res-239` (already checked out from `main`).
- **Single commit:**
  ```
  feat(api): block runInTenantContext outside tenant middleware (lint)
  ```
  Single commit because the rule and its override allow-list are
  inseparable — landing one without the other produces an immediately
  broken lint state. Bisect-friendly as one atomic unit.

### PR + Linear

- PR title: `feat(api): block runInTenantContext outside tenant middleware (lint)`.
- PR body: empty per project policy.
- Linear RES-239 → In Review on PR open, attach PR link.
- After merge → Linear Done. Memory update on `adr-0020-followup`: I-6
  now structurally enforced.

## Rejected alternatives

- **Put the rule in the shared `packages/config-eslint/node.mjs` preset.**
  Broader reach but introduces per-app override paths that the shared
  preset cannot know about (`apps/api/src/shared/tenant-context.middleware.ts`
  is api-specific). The api-local rule is exactly as effective today and
  trivially promotable when a second runtime consumer of `@resto/db`
  appears.
- **Use `no-restricted-syntax` to match arbitrary AST shapes.** Overkill
  for a one-named-import-from-one-module case. `no-restricted-imports` is
  the idiomatic built-in for this exact pattern.
- **Add a fixture file and a programmatic ESLint test** that asserts the
  rule fires on a known violator. The maintenance cost of running
  `ESLint.lintText` in a unit test outweighs the value for a built-in
  rule; the CI lint job already provides the same regression net on every
  PR. The manual negative check in §5 of Verification is sufficient.
- **Defend via grep in CI** (e.g. a `pnpm audit:i6` script). Possible but
  redundant with the lint rule and adds a second CI job to maintain.
  Drop in favor of a single source of truth.

## Out of scope

- Migration to shared preset — wait for second runtime consumer.
- Analogous lint rules for other ADR-0020 invariants (e.g. `set_config`
  outside `client.ts`, raw SQL outside `packages/db`) — separate tickets
  per invariant when needed. ADR-0020 I-1 already has its own enforcement
  mechanism planned (RES-235 Drizzle repo base class).
- Updating `apps/api/CLAUDE.md` or `packages/db/CLAUDE.md` to mention the
  lint rule — the rule's error message links to ADR-0020 I-6 directly;
  CLAUDE.md churn is reserved for higher-signal additions.

## Open design notes

Resolved at implementation time, not blocking the spec:

1. **Exact placement of the two new blocks** in `apps/api/eslint.config.mjs` —
   adjacent to existing `files: ['src/**/*.ts']` rule (line 13–20). The
   per-file allow-list block should be near the rule block for proximity
   of rationale, not buried among the other overrides.

## References

- [ADR-0020 — Multi-tenancy and event-bus invariants](../../adr/0020-multi-tenancy-and-event-bus-invariants.md) — invariant I-6.
- [ADR-0021 — Layered milestone strategy](../../adr/0021-layered-milestone-strategy.md) — RES-239 sits in Tier 1.
- [RES-240 spec](./2026-05-17-res-240-ba-hook-i6-fix-design.md) — preceding code fix.
- Linear: `RES-239 — Build ESLint no-restricted-imports rule blocking runInTenantContext outside middleware` (High, `gate-blocker`).
