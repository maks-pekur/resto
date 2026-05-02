# Remove dead dependencies — design

- **Date:** 2026-05-02
- **Status:** ready for implementation
- **Branch:** `chore-remove-dead-deps`
- **Origin:** user request to keep dependencies minimal in Resto. Audit
  performed across all 7 `package.json` files in the monorepo.

## Goal

Make every `package.json` in the repo an accurate inventory of what its
code actually imports. Concretely: remove dependencies that are
declared but produce zero matches when grepping source, tests, and
build/test config files for an `import` or `require` of them.

## Non-goals

- **No ADR revisions.** Nx (ADR-0007), OpenTelemetry (ADR-0008), and
  the husky / lint-staged / commitlint pre-commit chain stay. They are
  used; they may feel heavy, but that is a separate conversation about
  architectural choices, not dead code.
- **No new tooling.** No `knip`, no `depcheck`, no CI guardrail. Adding
  a tool to enforce minimal deps contradicts the "minimal deps" rule
  itself. If regressions accumulate later we revisit deliberately, via
  ADR.
- **No `dependencies` ↔ `devDependencies` reclassification.** The four
  removal candidates either go away entirely or stay where they are;
  no shuffling.
- **No transitive cleanup.** We only act on directly-declared deps. If
  a removed package's transitive children remain in `node_modules`
  because something else pulls them in, that is fine — the workspace
  is no longer the one declaring the relationship.

## Removals

The audit found exactly four packages. Each row lists the workspace,
the dependency category, the package, and the evidence that it is
unused.

| Workspace     | Category          | Package           | Evidence of dead-ness                                                                                                                                                                                                                                               |
| ------------- | ----------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api`    | `dependencies`    | `@nestjs/config`  | Zero matches for `from '@nestjs/config'` or `require('@nestjs/config')` in `apps/api/src` and `apps/api/test`. The api uses a custom `ConfigModule` at `apps/api/src/config/config.module.ts` built directly on Zod.                                                |
| `apps/api`    | `dependencies`    | `@fastify/helmet` | Zero matches in source/tests. `apps/api/src/main.ts` does not call `app.register(...)` for it. Bare-bones Fastify boot.                                                                                                                                             |
| `apps/api`    | `dependencies`    | `pino-pretty`     | Zero matches. `pino-pretty` is loaded by `pino` only when configured via `transport: { target: 'pino-pretty' }`. Our `pino` instance is created without a transport, so the package is never resolved at runtime.                                                   |
| `packages/db` | `devDependencies` | `testcontainers`  | `packages/db/test/setup.ts` imports only `@testcontainers/postgresql`. The bare `testcontainers` parent package is a transitive dependency of `@testcontainers/postgresql` and remains available in `node_modules` without being declared at the `@resto/db` level. |

## Mechanics

For each row above, run the corresponding `pnpm remove` in the
matching workspace directory:

```bash
pnpm --filter @resto/api remove @nestjs/config @fastify/helmet pino-pretty
pnpm --filter @resto/db remove testcontainers
```

`pnpm install` is implicit on remove and updates `pnpm-lock.yaml` in
the same step.

## Verification

The change is mechanical, so the gate is mechanical: every existing
quality check must stay green. Run, in order:

1. `pnpm exec nx run-many -t typecheck` — surfaces any type-only
   reference (`@nestjs/config`'s `ConfigService` would land here, for
   example).
2. `pnpm exec nx run-many -t lint` — ESLint catches stray imports
   that survived the package.json edit.
3. `pnpm exec nx run-many -t test` — unit tests across all six
   projects.
4. `pnpm exec nx run api:e2e` — testcontainers-backed e2e suite for
   the api. Strict gate for the `packages/db` `testcontainers` removal
   in particular.

If any step fails: revert the removal that caused the failure. **Do
not patch around it.** A failure means the audit was wrong about that
package being dead, and the package must go back with an explicit
note of who imports it.

### Optional sanity check

After a successful gate, in `apps/api/`:

```bash
node -e "require('@nestjs/config')" 2>&1 | grep MODULE_NOT_FOUND
node -e "require('@fastify/helmet')" 2>&1 | grep MODULE_NOT_FOUND
node -e "require('pino-pretty')"     2>&1 | grep MODULE_NOT_FOUND
```

Each line should print a `MODULE_NOT_FOUND` match — confirms the api
no longer transitively pulls these in via any other path. Not a
must-have; useful for paranoia.

## Branching, commit, PR

- Branch: `chore-remove-dead-deps` (created off `main` after the
  ADR-0012 merge at `b49b20a`).
- Commit: a single `chore: remove unused dependencies`. Title only,
  no body, per the title-only convention captured in
  `feedback_pr_no_description.md`.
- Push only after explicit user approval (standing convention).
- PR: title-only, no description. Merge into `main` once green.

## Rollback

The change is one commit and touches no application code.
`git revert <sha>` plus `pnpm install` returns the project to exactly
the prior state. There is no migration, no persistent state, and
nothing depends on the removed packages, so revert is safe at any
time.

## Future hygiene

The rule "if it isn't imported, it doesn't belong in `package.json`"
is captured in
`/Users/mp_dev/.claude/projects/-Users-mp-dev-projects-resto/memory/feedback_minimal_deps.md`,
and that memory will guide future audits and resist speculative
additions. No tooling is introduced now; if dead deps accumulate
later, that is the moment to revisit `knip`/`depcheck` deliberately
and via ADR — not preemptively.
