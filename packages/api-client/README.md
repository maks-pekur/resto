# @resto/api-client

TypeScript types generated from `docs/api/openapi.yaml` by
`openapi-typescript`. Single source of truth for the api surface;
hand-written request/response types in `apps/*` are forbidden by the
top-level CLAUDE.md.

## Layout

```
src/
  generated/api.ts     auto-generated, committed to git, never edit by hand
  index.ts             full surface (paths / components / operations)
  public.ts            paths filtered to /v1/*
  internal.ts          paths filtered to /internal/v1/*
```

## Workflows

```sh
pnpm exec nx run api:openapi:emit       # 1. spec from controllers
pnpm exec nx run api-client:gen         # 2. types from spec
git diff -- docs/api packages/api-client  # 3. commit if anything changed
```

CI (`openapi-drift` job in `.github/workflows/ci.yml`) runs both targets
and fails the PR via `git diff --exit-code` when either output drifts
from what's committed.

## Rules

- The spec is authoritative. If you change a controller, regenerate
  the types in the same PR — don't ship a runtime change without the
  type update.
- Apps import via the sub-paths (`@resto/api-client/public`,
  `@resto/api-client/internal`) so unused surface tree-shakes out.
- Request/response _bodies_ land in the types only when controllers
  carry `@ApiResponse` / `@ApiBody` decorators. Adding those is a
  separate, controller-by-controller follow-up — not part of this
  package's contract.
