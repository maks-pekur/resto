# RES-239 — ESLint Guard Against `runInTenantContext` Outside Middleware Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `no-restricted-imports` ESLint rule in `apps/api/eslint.config.mjs` that blocks importing `runInTenantContext` from `@resto/db` anywhere in `apps/api/src/**` except the legitimate caller `tenant-context.middleware.ts` (and `test/**`). Structural defense for ADR-0020 I-6.

**Architecture:** Single ESLint flat-config edit. Two new config blocks (the rule + an override for the legitimate caller) and one extension to the existing `test/**` override. The rule and its override allow-list are landed together in one atomic commit because shipping the rule without the override would break lint immediately.

**Tech Stack:** ESLint 9 flat config, `no-restricted-imports` built-in rule, Nx 20 task running.

**Spec:** `docs/superpowers/specs/2026-05-17-res-239-eslint-runintenantcontext-guard-design.md`

**Branch:** `res-239` (already checked out from `main`; spec committed as `523b073`).

---

## File Map

| File                         | Action | Why                                                                                                                                                                             |
| ---------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/eslint.config.mjs` | Modify | Add `no-restricted-imports` rule for `src/**/*.ts`; allow-list `src/shared/tenant-context.middleware.ts`; extend existing `test/**/*.ts` override to also disable the new rule. |

**Pre-existing infrastructure (no changes needed):**

- `packages/config-eslint/{base,node}.mjs` untouched — rule is api-local. Spec §1 Rejected Alternative confirms.
- `packages/db/eslint.config.mjs` untouched — db package owns the primitive; `no-restricted-imports` doesn't apply to definitions or `from './context'` re-exports.
- No production source files change. RES-240 (`a19f3bf`) already removed the only violation.

---

## Task 1: Pre-flight audit — confirm clean tree

**Files:** None modified. This is verification before edits.

- [ ] **Step 1: Grep for any stray `runInTenantContext` production callers in `apps/api/src/`**

From `/Users/mp_dev/projects/RestOS`:

```bash
grep -rn "runInTenantContext" apps/api/src --include="*.ts" | grep -v "shared/tenant-context.middleware.ts"
```

Expected output: empty (zero lines).

If anything appears, RES-240 missed a caller and that must be fixed first. Stop and escalate to the controller — do not proceed with this plan until the tree is clean. This should not happen — RES-240's verification step 5 audit was empty when it merged.

- [ ] **Step 2: Confirm the legitimate caller exists where expected**

```bash
grep -n "runInTenantContext" apps/api/src/shared/tenant-context.middleware.ts
```

Expected: at least two hits — one import on line 2, one usage on line 48 (matching the post-RES-240 state).

If the file does not import `runInTenantContext` at all, the allow-list path is wrong and the spec needs revision. Stop and escalate.

---

## Task 2: Apply the three edits to `apps/api/eslint.config.mjs`

**Files:**

- Modify: `/Users/mp_dev/projects/RestOS/apps/api/eslint.config.mjs`

The current file (post-RES-240) is 56 lines. The three edits are: insert a new rule block after the existing `src/**/*.ts` rule block; insert a per-file allow-list block; extend the existing `test/**/*.ts` rules object.

- [ ] **Step 1: Verify the file's current state matches the spec's assumption**

```bash
cat apps/api/eslint.config.mjs
```

Expected: the file contains, in order, these blocks:

1. Spread of `node` preset (lines 1–3).
2. `languageOptions` block with `parserOptions.projectService` (lines 5–12).
3. `files: ['src/**/*.ts']` rule block disabling `@typescript-eslint/parameter-properties` (lines 13–20).
4. `files: ['src/**/*.module.ts']` block disabling `@typescript-eslint/no-extraneous-class` (lines 21–28).
5. `files: ['src/main.ts', 'src/openapi.ts']` block disabling `no-process-exit` (lines 29–36).
6. `files: ['test/**/*.ts']` block (lines 37–51).
7. `ignores` block (lines 52–54).

If the structure differs, surface the difference before editing — the spec's edit positions assume the post-RES-240 state.

- [ ] **Step 2: Replace the entire file with the edited version**

Open `apps/api/eslint.config.mjs` and replace the full content with:

```js
import { node } from '@resto/config-eslint/node';

export default [
  ...node,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      // NestJS controllers and providers rely on parameter decorators —
      // injected dependencies appear "unused" to the type-only checker.
      '@typescript-eslint/parameter-properties': 'off',
    },
  },
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
  {
    // Sole legitimate caller of runInTenantContext per ADR-0020 I-6.
    files: ['src/shared/tenant-context.middleware.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    // NestJS modules are class-based markers for the DI container; an
    // empty class is the idiomatic shape and not a code smell here.
    files: ['src/**/*.module.ts'],
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
  {
    // Bootstrap entrypoints terminate on fatal errors via process.exit —
    // the surrounding script tooling expects non-zero exit codes.
    files: ['src/main.ts', 'src/openapi.ts'],
    rules: {
      'no-process-exit': 'off',
    },
  },
  {
    // Test files lean on Vitest's `vi.fn()` mocks and lambda-style
    // assertion expressions; the type-aware checks fight with idiomatic
    // test code where mock return types are intentionally untyped (the
    // test asserts the shape rather than declares it).
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
  {
    ignores: [
      'dist/**',
      'dist-spec/**',
      'eslint.config.mjs',
      'vitest.config.ts',
      'build.mjs',
    ],
  },
];
```

Diff from current:

- New block inserted between `@typescript-eslint/parameter-properties` block (existing) and `@typescript-eslint/no-extraneous-class` block (existing): the `no-restricted-imports` rule.
- New block immediately after: the per-file allow-list for `src/shared/tenant-context.middleware.ts`.
- Extension of the existing `test/**/*.ts` block: `'no-restricted-imports': 'off'` added at the end of its rules object with the explanatory comment.
- No other lines changed.

**Why this ordering:** ESLint flat config processes blocks in order; later blocks override earlier ones for files that match both. Placing the allow-list block immediately after the rule block keeps the exception lexically adjacent to its rationale. The `test/**` override appearing later means it correctly turns the rule off for test files even though they would otherwise match `src/**/*.ts` is moot — test files don't match `src/**`. The override matters because `runInTenantContext` is imported by `apps/api/test/e2e/identity-event-emitter.adapter.e2e.spec.ts` and similar files.

- [ ] **Step 3: Positive check — lint must be green on the clean tree**

```bash
cd /Users/mp_dev/projects/RestOS
pnpm exec nx run api:lint
```

Expected: PASS — `Successfully ran target lint for project api`.

If it fails, the most likely cause is that Step 2's edit introduced a syntax error (missing comma, unbalanced brace). Re-read the file content versus the verbatim block above.

The second-most-likely cause is that `grep` in Task 1 Step 1 missed a violator. In that case, the lint output will name the offending file — fix the violation in the source (use the right `db.withTenant`/`withTenantId`/`withoutTenant` per ADR-0020 I-6), then re-run.

- [ ] **Step 4: Cross-package lint — confirm no collateral damage**

```bash
pnpm exec nx run-many -t lint -p db,api
```

Expected: PASS for both projects. The db package is not affected (no edits to its config or sources) so this is a parity check.

- [ ] **Step 5: Typecheck — sanity (should be cached)**

```bash
pnpm exec nx run api:typecheck
```

Expected: PASS. The change is ESLint-config only — no TS source touched, so this should be a no-op against the cache.

- [ ] **Step 6: Negative check — verify the rule actually fires**

This is a one-time manual verification. It is **not** committed; revert after.

(a) Add a violating import to any non-middleware source file. Pick `apps/api/src/contexts/identity/infrastructure/identity-event-emitter.adapter.ts` (the file RES-240 just cleaned). Open it and add the offending import at line 2 (next to the existing `@resto/db` import), and a void reference so TypeScript doesn't strip the import as unused:

```ts
import { Inject, Injectable } from '@nestjs/common';
import {
  getTenantContext,
  type RestoTx,
  TenantAwareDb,
  runInTenantContext,
} from '@resto/db';
import { appendToOutbox, type EventEnvelope } from '@resto/events';
import { randomUUID } from 'node:crypto';
import type { IdentityEventEmitterPort } from '../application/ports/identity-event-emitter.port';

void runInTenantContext;
```

(b) Run lint:

```bash
pnpm exec nx run api:lint
```

Expected: FAIL with an error citing the rule and the configured message. The relevant line of output should look approximately like:

```
.../identity-event-emitter.adapter.ts
  2:51  error  'runInTenantContext' import from '@resto/db' is restricted. ADR-0020 I-6: runInTenantContext is HTTP-middleware-only. Use db.withTenant / db.withTenantId / db.withoutTenant instead. Sole legitimate caller: apps/api/src/shared/tenant-context.middleware.ts.  no-restricted-imports
```

The column position may vary; what matters is:

- Rule name in the trailer is `no-restricted-imports`.
- Message contains `ADR-0020 I-6`.
- File path is the violator, not the allow-listed middleware.

If the rule fails to fire (lint stays green with the violation in place), the rule's `paths.name` / `paths.importNames` may not match the actual import syntax. The most likely fix is to also add `patterns` matching or to verify the `@resto/db` package name spelling exactly matches what the source imports.

(c) Revert the violation:

```bash
git checkout -- apps/api/src/contexts/identity/infrastructure/identity-event-emitter.adapter.ts
```

(d) Confirm clean tree:

```bash
git status -s
```

Expected: only `apps/api/eslint.config.mjs` modified (the actual Task 2 edit).

- [ ] **Step 7: Commit**

```bash
cd /Users/mp_dev/projects/RestOS
git add apps/api/eslint.config.mjs
git commit -m "feat(api): block runInTenantContext outside tenant middleware (lint)"
```

Project policies (`~/.claude/CLAUDE.md` + `CLAUDE.md`):

- Conventional Commits prefix required (`feat(api):`).
- No `Co-Authored-By: Claude` trailer.
- Subject line only — NO body.
- No `res-239:` task-id prefix in subject (match recent project commits).

`lint-staged` will run prettier/eslint on the staged `.mjs` file — expected and harmless; commit will land.

---

## Task 3: Final verification before PR

**Files:** None modified — verification only.

- [ ] **Step 1: Verify branch state**

```bash
git log --oneline main..res-239
```

Expected: 2 commits in this order (newest first):

```
<sha> feat(api): block runInTenantContext outside tenant middleware (lint)
523b073 docs(spec): RES-239 eslint runInTenantContext guard design
```

If there are more commits, something extra landed — surface to controller. If fewer, the commit in Task 2 Step 7 didn't land.

- [ ] **Step 2: Verify commit metadata**

```bash
git log -1 --pretty=full
```

Expected for the HEAD commit:

- Author: `maks_p <mpekur.dev@gmail.com>`.
- Subject: `feat(api): block runInTenantContext outside tenant middleware (lint)`.
- Body: empty (no `Co-Authored-By: Claude`, no description).

```bash
git log main..res-239 --format="%B" | grep -i "co-authored-by"
```

Expected: empty output (success).

- [ ] **Step 3: Re-run lint as final smoke**

```bash
pnpm exec nx run-many -t lint -p db,api
```

Expected: PASS for both.

- [ ] **Step 4: Push the branch (after user confirms)**

Confirm with the user before pushing. After approval:

```bash
git push -u origin res-239
```

- [ ] **Step 5: Open the PR (after user confirms)**

Confirm with the user before opening. After approval:

```bash
gh pr create --title "feat(api): block runInTenantContext outside tenant middleware (lint)" --body ""
```

Empty body per project policy.

- [ ] **Step 6: After PR open — Linear update**

After the PR opens, update Linear RES-239:

- Move status: `Todo` / `Backlog` → `In Review`.
- Attach PR URL.

Use the Linear MCP tools available to the controller (`mcp__claude_ai_Linear__save_issue` + `state: "In Review"` + `links: [{url: <PR URL>, title: "PR #N — feat(api): block runInTenantContext (lint)"}]`).

---

## Out of scope

- **Migration of the rule into `packages/config-eslint/node.mjs`** — wait for a second runtime consumer of `@resto/db`. Spec §Out of scope.
- **Analogous lint rules for other ADR-0020 invariants** (`set_config` outside `client.ts`, raw SQL outside `packages/db`, ...) — separate tickets per invariant.
- **Updating `apps/api/CLAUDE.md` / `packages/db/CLAUDE.md`** to mention the lint rule — the rule's error message links to ADR-0020 I-6 directly; CLAUDE.md churn reserved for higher-signal additions.
- **Permanent fixture-based ESLint test** — built-in rule, CI lint job is the ongoing defense. The Task 2 Step 6 manual negative check is sufficient.

## Notes for the executing agent

- The branch `res-239` is already checked out from `main`. The spec is already committed (`523b073 docs(spec): RES-239 eslint runInTenantContext guard design`).
- Do **not** add `Co-Authored-By: Claude` trailers — project policy.
- Do **not** add commit body / description — subject line only.
- Optional `RES-239:` prefix on commit subjects is **not** used in recent project commits — match existing pattern by omitting it.
- The lint-staged hook will run prettier on staged files; expected and harmless.
- Docker is not required for this task — it's lint-only, no testcontainers.
- The `pnpm exec nx run api:lint` invocation runs ESLint via the `api:lint` Nx target. There is no `--testPathPattern` style flag for ESLint here; the target lints the project's configured globs.
- If `nx` reports `Nothing to do` due to cache, force a re-run with `pnpm exec nx run api:lint --skip-nx-cache`. The cache should invalidate automatically because `eslint.config.mjs` is part of the project's lint inputs; surface to the controller if you see a stale cache hit.
