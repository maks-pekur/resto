# @resto/api-client

## Purpose

TypeScript types generated from `docs/api/openapi.yaml` by
`openapi-typescript`. Single source of truth for the api surface;
hand-written request/response types in apps are forbidden by the
top-level CLAUDE.md.

## Layout

- `src/generated/api.ts` — auto-generated, committed to git. Never edit
  by hand. Regenerated via `pnpm exec nx run api-client:gen`.
- `src/index.ts` — full surface re-export (`paths` / `components` /
  `operations`).
- `src/public.ts` — `paths` filtered to `/v1/*`.
- `src/internal.ts` — `paths` filtered to `/internal/v1/*`.

## Workflows

```sh
pnpm exec nx run api:openapi:emit       # 1. regenerate the spec from controllers
pnpm exec nx run api-client:gen         # 2. regenerate types from the spec
git diff -- docs/api packages/api-client  # 3. commit if anything changed
```

CI (`openapi-drift` job in `.github/workflows/ci.yml`) runs both targets
and fails the PR via `git diff --exit-code` when either output drifts
from what's committed.

## Rules

- The spec is authoritative. If you change a controller, regenerate the
  types in the same PR — don't ship a runtime change without the type
  update.
- Apps import via the sub-paths (`@resto/api-client/public`,
  `@resto/api-client/internal`) so unused surface tree-shakes out.
- **`unknown` in a generated DTO request field is a contract bug.**
  ([ADR-0020 I-7](../../docs/adr/0020-multi-tenancy-and-event-bus-invariants.md).)
  Consumers are **not** allowed to cast their way around (`payload.slug as
string`) — that defeats the whole point of generating types. The fix is
  always upstream: add `@ApiProperty({ type: String, … })` (or derive the
  type from a Zod schema) on the controller DTO and regenerate. A CI grep
  for `: unknown` inside DTO bodies will land as part of I-7 enforcement.
- **The default barrel (`.`) export must not leak the `/internal/v1/*`
  surface into the public-import default.** Either drop `"."` from
  `package.json` `exports` (force consumers to pick `/public` or `/internal`
  explicitly), or have the default `paths` resolve to the public subset
  only. The autocomplete leak is the type-level equivalent of a token leak;
  customer-facing apps should not see internal route names.
- **Sub-path enforcement is a CI lint contract.** A `dependency-cruiser` /
  Nx `enforce-module-boundaries` rule should fail when a non-server app
  imports `@resto/api-client/internal`. Until that lands, reviewers enforce
  it manually.
- Request/response _bodies_ land in the types only when controllers
  carry `@ApiResponse` / `@ApiBody` decorators. Adding those is a
  separate, controller-by-controller follow-up — but every `content?:
never` 200 response in the generated file represents a controller
  missing `@ApiResponse({ type: … })`. The contract gap is visible; the
  fix is upstream.
