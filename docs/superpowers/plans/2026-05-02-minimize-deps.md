# Minimize dependencies — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove four dead dependencies (`@nestjs/config`, `@fastify/helmet`, `pino-pretty` from `apps/api`; `testcontainers` from `packages/db`) so each `package.json` accurately reflects what its code imports.

**Architecture:** Mechanical removal via `pnpm remove`, no source-code changes. The existing test gate (`typecheck` / `lint` / `test` / `e2e`) is the safety net — green before, green after, otherwise revert.

**Tech Stack:** pnpm 9 workspaces, Nx 20, vitest, testcontainers (kept — only the parent package is dropped from `packages/db`).

**Spec:** [`docs/superpowers/specs/2026-05-02-minimize-deps-design.md`](../specs/2026-05-02-minimize-deps-design.md)

---

## File Structure

Files this plan modifies — nothing else:

| File                       | What changes                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| `apps/api/package.json`    | Remove three entries from `dependencies`: `@nestjs/config`, `@fastify/helmet`, `pino-pretty` |
| `packages/db/package.json` | Remove one entry from `devDependencies`: `testcontainers`                                    |
| `pnpm-lock.yaml`           | Auto-updated by pnpm when removals run                                                       |

No source files change. No new files. No tests change.

---

## Task 1: Pre-flight — establish a green baseline

**Files:** none modified.

The whole plan rests on "the test gate is green before _and_ after". If it's not green now, removals can't tell us anything. This task proves the starting state.

- [ ] **Step 1: Confirm branch and working tree**

Run:

```bash
git rev-parse --abbrev-ref HEAD
git status --short
```

Expected:

```
chore-remove-dead-deps
```

(Empty status — no uncommitted changes other than this plan if you just wrote it.)

If `git status` shows the new plan file as untracked, commit it on its own first:

```bash
git add docs/superpowers/plans/2026-05-02-minimize-deps.md
git commit -m "docs(plan): minimize deps — implementation plan"
```

- [ ] **Step 2: Verify the four target deps are still declared (sanity check that the audit is current)**

Run:

```bash
node -e "const p=require('./apps/api/package.json'); console.log(['@nestjs/config','@fastify/helmet','pino-pretty'].map(d => d+'='+(d in (p.dependencies||{}))).join(' '))"
node -e "const p=require('./packages/db/package.json'); console.log('testcontainers='+('testcontainers' in (p.devDependencies||{})))"
```

Expected:

```
@nestjs/config=true @fastify/helmet=true pino-pretty=true
testcontainers=true
```

If any prints `false`, the spec is stale — STOP and re-audit before continuing.

- [ ] **Step 3: Run the full gate to prove the starting state is green**

Run:

```bash
pnpm exec nx run-many -t typecheck
pnpm exec nx run-many -t lint
pnpm exec nx run-many -t test
pnpm exec nx run api:e2e
```

Expected: every command exits 0. The last one (e2e) takes ~10–60 s because it spins up a Postgres testcontainer.

If anything fails: STOP. The plan is invalid until the baseline is green. Fix the failing test first, on a separate branch, separately reviewed.

---

## Task 2: Remove the three `apps/api` dead deps

**Files:**

- Modify: `apps/api/package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Remove the three packages from `apps/api`**

Run:

```bash
pnpm --filter @resto/api remove @nestjs/config @fastify/helmet pino-pretty
```

Expected output ends with something like:

```
dependencies:
- @fastify/helmet 12.0.x
- @nestjs/config 3.3.x
- pino-pretty 11.3.x
```

(`pnpm` lists removed entries with a leading `-`.) Lockfile updates inline; no separate `pnpm install` needed.

- [ ] **Step 2: Confirm `apps/api/package.json` no longer declares them**

Run:

```bash
node -e "const p=require('./apps/api/package.json'); for (const d of ['@nestjs/config','@fastify/helmet','pino-pretty']) console.log(d, d in (p.dependencies||{}) ? 'STILL DECLARED' : 'gone')"
```

Expected:

```
@nestjs/config gone
@fastify/helmet gone
pino-pretty gone
```

If any line says `STILL DECLARED` — STOP, the remove command did not apply (e.g., wrong filter name). Investigate before continuing.

- [ ] **Step 3: Confirm `apps/api/package.json` and `pnpm-lock.yaml` are the only modified files**

Run:

```bash
git status --short
```

Expected:

```
 M apps/api/package.json
 M pnpm-lock.yaml
```

If anything else is modified — STOP and inspect; pnpm should not be touching other files.

---

## Task 3: Remove the `packages/db` dead dep

**Files:**

- Modify: `packages/db/package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Remove `testcontainers` from `packages/db`**

Run:

```bash
pnpm --filter @resto/db remove testcontainers
```

Expected output ends with something like:

```
devDependencies:
- testcontainers 10.16.x
```

- [ ] **Step 2: Confirm `packages/db/package.json` no longer declares it**

Run:

```bash
node -e "const p=require('./packages/db/package.json'); console.log('testcontainers', 'testcontainers' in (p.devDependencies||{}) ? 'STILL DECLARED' : 'gone')"
```

Expected:

```
testcontainers gone
```

- [ ] **Step 3: Confirm only the four files are modified**

Run:

```bash
git status --short
```

Expected:

```
 M apps/api/package.json
 M packages/db/package.json
 M pnpm-lock.yaml
```

(Three lines, not four — the lockfile is shared across workspaces.)

---

## Task 4: Run the full verification gate

**Files:** none modified — read-only verification.

This is the load-bearing step. If it fails, we revert; we do not patch around.

- [ ] **Step 1: Typecheck across all workspaces**

Run:

```bash
pnpm exec nx run-many -t typecheck
```

Expected: ` NX   Successfully ran target typecheck for 6 projects`.

If it fails: read the error. If it points at `@nestjs/config`, `@fastify/helmet`, or `pino-pretty` — the audit was wrong, that package IS used somewhere we missed. Add it back with the smallest possible scope (devDependency if test-only) and document the call site in this plan as a correction.

- [ ] **Step 2: Lint across all workspaces**

Run:

```bash
pnpm exec nx run-many -t lint
```

Expected: ` NX   Successfully ran target lint for 6 projects`.

- [ ] **Step 3: Unit tests across all workspaces**

Run:

```bash
pnpm exec nx run-many -t test
```

Expected: ` NX   Successfully ran target test for 6 projects`.

- [ ] **Step 4: e2e against testcontainers**

Run:

```bash
pnpm exec nx run api:e2e
```

Expected: ` NX   Successfully ran target e2e for project api`. Three test files (`catalog`, `tenancy`, `health`), 10 tests pass total.

This is the strict gate for the `packages/db` `testcontainers` removal — it provisions a real Postgres in a container via `@testcontainers/postgresql`, which transitively depends on `testcontainers`.

If this step fails with a `Cannot find module 'testcontainers'` error: revert just the `packages/db` change and retry:

```bash
git checkout packages/db/package.json pnpm-lock.yaml
pnpm install
pnpm exec nx run api:e2e
```

The audit was wrong — `@testcontainers/postgresql` v10 declares `testcontainers` as a peer, not a regular, dependency. Document the correction inline below this step and continue with only the three `apps/api` removals.

---

## Task 5: Optional — `MODULE_NOT_FOUND` sanity check

**Files:** none modified.

Belt-and-suspenders verification that the api workspace truly no longer pulls these in via any path. Skip if you trust steps 1–4.

- [ ] **Step 1: Try to require each removed package from `apps/api`**

Run:

```bash
cd apps/api
node -e "require('@nestjs/config')"   2>&1 | grep -E 'MODULE_NOT_FOUND|Error'
node -e "require('@fastify/helmet')"  2>&1 | grep -E 'MODULE_NOT_FOUND|Error'
node -e "require('pino-pretty')"      2>&1 | grep -E 'MODULE_NOT_FOUND|Error'
cd ../..
```

Expected: each line prints something containing `MODULE_NOT_FOUND` or `Cannot find module ...`.

If a `require` succeeds silently, the package is still resolvable from `apps/api/node_modules`. That means another runtime dep transitively pulls it in. Not a blocker — the workspace is no longer the one declaring it — but worth noting.

---

## Task 6: Commit

**Files:** committed: `apps/api/package.json`, `packages/db/package.json`, `pnpm-lock.yaml`.

Per spec: a single commit with a title-only conventional message.

- [ ] **Step 1: Stage exactly the three changed files**

Run:

```bash
git add apps/api/package.json packages/db/package.json pnpm-lock.yaml
git status --short
```

Expected:

```
M  apps/api/package.json
M  packages/db/package.json
M  pnpm-lock.yaml
```

(Capital `M` in column 1 — staged.)

- [ ] **Step 2: Commit**

Run:

```bash
git commit -m "chore: remove unused dependencies"
```

Expected: husky/lint-staged runs prettier on the staged files; commit succeeds with `chore-remove-dead-deps <sha>` summary.

If the pre-commit hook reformats `package.json` — let it; the commit still goes through.

- [ ] **Step 3: Confirm a clean working tree**

Run:

```bash
git status --short
git log -1 --stat
```

Expected: empty `git status`, last commit shows three files changed with negative line counts dominating.

---

## Task 7: Push + PR (gated on explicit user approval)

**Files:** none modified locally.

Per the standing convention, do not push without asking. Stop here, surface the diff to the user, and wait for an explicit "yes" before running the push.

- [ ] **Step 1: Show the user the final state and ask for push approval**

Run:

```bash
git log --oneline main..HEAD
git show --stat HEAD
```

Expected output: one commit ahead of main, three files modified.

Tell the user verbatim:

> Готово. Один коммит на ветке `chore-remove-dead-deps`. Пушнуть и открыть PR?

Wait for their reply. If they say no — stop. If yes:

- [ ] **Step 2: Push**

Run:

```bash
git push -u origin chore-remove-dead-deps
```

Expected: branch tracks `origin/chore-remove-dead-deps`; GitHub returns the PR-create URL in the output.

- [ ] **Step 3: Surface the PR URL**

`gh` is not installed locally. Print the compare URL the user can click:

```
https://github.com/maks-pekur/resto/compare/main...chore-remove-dead-deps
```

Title (matches the commit subject):

```
chore: remove unused dependencies
```

Description: empty (title-only convention, per `feedback_pr_no_description.md`).

---

## Self-review checklist

Before declaring this plan done:

- [ ] All four removals from the spec table appear in Tasks 2 and 3 (apps/api ×3, packages/db ×1) — ✓.
- [ ] Verification covers all four spec steps (typecheck, lint, test, e2e) — Task 4 — ✓.
- [ ] Optional sanity check from spec — Task 5 — ✓.
- [ ] Single-commit constraint from spec — Task 6 — ✓.
- [ ] Push only after approval, per `feedback_pr_no_description.md` and standing convention — Task 7 step 1 gate — ✓.
- [ ] Rollback path documented — Task 4 step 4 inline (revert + reinstall) — ✓.
- [ ] No placeholders (`TBD`, `TODO`, "appropriate error handling", etc.) — none found.
- [ ] Every command has expected output. Every "if it fails" has a concrete next move.
