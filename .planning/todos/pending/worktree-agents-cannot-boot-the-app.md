---
title: Agent worktrees have no .env, so any task needing app boot silently fails there
date: 2026-09-03
priority: medium
status: pending
---

# `.env` is gitignored, so an isolated worktree cannot boot the API

Found in phase 10.6 wave 9. Plan 12 discovered a real bug (ingredient photos wiped on
upsert), implemented the correct fix, then had to REVERT it — because regenerating the
committed OpenAPI contract requires `pnpm -C apps/api openapi:emit`, which boots the Nest
app, and the boot died in the worktree.

The cause is not the generator. `.env` is listed in `.gitignore:24`, so it is untracked,
so `git worktree add` does not put it in the new working directory. `loadEnv()` validates
env with Zod and throws `EnvValidationError` before any controller mounts, so the app
cannot start. The failure reads as "codegen failed silently" rather than "no env", which
is what made it expensive to diagnose.

## Consequence for GSD wave planning

Any plan whose verification requires the API to actually RUN — contract regeneration,
integration tests that boot the app, seeding through the app — cannot be executed by an
agent under `isolation: "worktree"`. It will either fail confusingly or, worse, an agent
will conclude the step is impossible and skip it.

Note this is narrower than it sounds: `packages/db` integration tests were fine, because
testcontainers supply their own connection string rather than reading `.env`.

## Options when it comes up

1. Run that plan sequentially on the main checkout (what the orchestrator did to close
   the two wave-9 gaps). Simplest, and correct when the plan is alone in its wave.
2. Copy `.env` into the worktree as a setup step before dispatch. Cheap, but it puts real
   secrets into a throwaway directory that gets force-removed — acceptable for local dev
   values, not something to make habitual.
3. Give `apps/api` a committed `.env.test`-style defaults file that `openapi:emit`
   specifically can boot from, since emitting a contract needs no real database or
   credentials. This is the durable fix and probably the right one.

Option 3 is worth doing before the next phase that regenerates the contract.

## Related

- `.planning/phases/10.6-ingredient-library-groups-and-how-they-reach-the-order/10.6-12-SUMMARY.md`
  — the reverted fix and its root-cause analysis.
- `.planning/todos/pending/worktree-pnpm-install-corrupts-root-node-modules.md` — the other
  worktree-isolation trap found in the same phase. Both come from the same root: an agent
  worktree is not a fully provisioned checkout, and agents assume it is.
