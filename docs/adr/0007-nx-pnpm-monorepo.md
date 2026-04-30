# ADR 0007: Nx + pnpm monorepo

- **Status:** accepted
- **Date:** 2026-04-30
- **Deciders:** Resto core team

## Context

Resto produces multiple deployables (admin, website, qr-menu, mobile,
landing, api) that share a substantial domain layer (menu, orders,
identity, payments). Cross-app refactors must stay atomic; type safety
must extend across boundaries; CI must scale as the workspace grows.

## Decision

Single **Nx monorepo** managed with **pnpm workspaces**, hosting all
apps and shared packages in the layout described in `CLAUDE.md`.

## Alternatives considered

- **Polyrepo.** Strongest argument: each app owned independently,
  smaller per-repo blast radius. Rejected: with our shared domain and
  small team, cross-repo coordination overhead (private package
  publishing, version pinning, atomic refactors) far outweighs the
  isolation benefit. We can extract a repo later cheaply; merging
  back is much more expensive.
- **Turborepo.** Strongest argument: simpler than Nx, fast remote
  caching. Rejected: weaker generators, weaker module-boundary
  enforcement, less mature for deeply integrated DDD layouts. The Nx
  task graph and `affected` story is meaningfully better at our
  expected scale.
- **Bazel / Pants.** Strongest argument: serious scale, strict
  hermeticity. Rejected: build-system overhead is way too high for
  our team size and JS-only stack.
- **Yarn / npm workspaces without Nx.** Strongest argument: less
  tooling. Rejected: no task graph, no caching, no affected detection
  — CI does not scale.

## Consequences

### Positive

- One install, one lockfile, one CI configuration to maintain.
- Atomic cross-package refactors in single PRs.
- Affected-only CI keeps build/test time bounded as the workspace
  grows.
- Module-boundary rules prevent illegal imports across packages.

### Negative

- The repo will be large; new contributors need a brief tour.
- Misuse of shared packages can slow CI (touching `@resto/domain`
  invalidates the cache for many consumers). We mitigate with careful
  package boundaries.

### Neutral

- pnpm workspaces handle hoisting; we keep `auto-install-peers=true`
  to avoid surprises.

## Implementation notes

- Nx version: 20.x.
- Node 22 LTS (`.nvmrc`); pnpm via Corepack pinned in `packageManager`.
- `nx.json` defines named inputs (default, production, sharedGlobals)
  and target defaults so individual projects need minimal config.
- Module-boundary tags will be added per project to enforce: apps
  cannot import each other; `domain` cannot import infrastructure;
  `db` is imported only by `api`.
