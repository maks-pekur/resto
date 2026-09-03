---
title: pnpm install inside a git worktree corrupts the root checkout's node_modules
date: 2026-09-03
priority: high
status: pending
---

# A worktree-scoped `pnpm install` rewires the MAIN checkout's `node_modules`

Hit during phase 10.6 wave 4 (plan 09, guest wire types), running in a
`git worktree` created by GSD's `isolation: "worktree"`.

## What happens

Git worktrees share the repo but each gets its own working directory. `node_modules`
is untracked, so a fresh worktree has none — the agent found every `node_modules` in
its worktree symlinked back into the main checkout. That alone is a correctness trap:
imports of `@resto/api-client`, `@resto/cart` and `@resto/ui` silently resolved to the
**main repo's** copies at both typecheck and Vitest runtime, so the agent's own edits
were invisible to its own verification.

The fix it reached for — delete the symlinks, run `pnpm install` scoped to the worktree —
is worse than the disease. pnpm resolves the workspace root by walking up to
`pnpm-workspace.yaml`, finds the MAIN checkout, and rewrites the main checkout's
`node_modules/@resto/*` to point *into the worktree*. When the orchestrator then removes
that worktree (normal end-of-wave cleanup), the root checkout is left with dangling
symlinks. Observed damage: root `node_modules` down to 28 entries,
`node_modules/nx/dist/bin/nx.js` gone, every `nx` command dead with `MODULE_NOT_FOUND`.

The failure is quiet in the worst way: `nx run api:typecheck` exited having compiled
nothing, and a naive `grep -c "error TS"` on its output reported **0 errors**. A false
green that looks exactly like a real one.

## Recovery

`pnpm install --frozen-lockfile` at the repo root, answering yes to the "modules
directories will be removed and reinstalled" prompt. No tracked file and no lockfile
entry is touched, so nothing is lost. Took ~30s.

## What to do instead

- Never run `pnpm install` from inside an agent worktree in this repo.
- If a worktree agent needs its cross-package edits to be visible to its own tests, it
  must either confine the plan to one package, or verify after the orchestrator merges
  rather than in isolation. The post-merge gate is the correct place for cross-package
  verification — that is what it is for.
- Orchestrators: after any wave whose agents touched `packages/*`, sanity-check that a
  build tool actually RAN before trusting a zero-error count. Grep the output for the
  real compiler invocation (`tsc -p`) or NX's `Successfully ran target`, not just for
  the absence of the word "error".

## Related

- `.planning/phases/10.6-ingredient-library-groups-and-how-they-reach-the-order/10.6-09-SUMMARY.md`
  documents the original symlink discovery from the agent's side.
- Phase 10.6 waves 5 and 9 run multiple agents in parallel over shared `packages/ui` and
  `apps/admin` components — the same class of stale-resolution trap applies there.
