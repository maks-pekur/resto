# ADR 0014: Vitest as the test runner across the workspace

- **Status:** accepted
- **Date:** 2026-05-03
- **Deciders:** Resto core team
- **Supersedes:** —
- **Superseded by:** —

## Context

The Resto monorepo runs tests across packages with different shapes:

- `apps/api` — NestJS modular monolith with two distinct test suites:
  fast unit tests under `test/unit/`, and slower integration / e2e
  tests under `test/e2e/` that spin up testcontainers for Postgres +
  NATS and apply the live `packages/db` migrations.
- `packages/db` — RLS integration tests that need a real Postgres
  container with `resto_app` provisioned and migrations applied.
- `packages/domain`, `packages/events` — pure TS, fast unit tests with
  no infrastructure.
- Future: `apps/admin` (Next.js), `apps/qr-menu` (Vite), `apps/mobile`
  (Expo) — each with its own preferred ecosystem.

The tooling needs of those suites are not the same. Picking one runner
that holds across the workspace is the lever; the alternative — Jest
in some packages, Vitest in others — was already drifting.

The forces in play:

- **Speed of unit tests.** The api unit suite runs on every pre-push
  hook and in CI affected. Anything slower than ~1s for the full unit
  suite is felt.
- **Testcontainer correctness.** The e2e suites and the `packages/db`
  integration suite open Postgres containers, run migrations, and bind
  per-tenant GUCs. They MUST run sequentially within a process: two
  parallel test workers binding the same `app.current_tenant` GUC on
  shared connections will produce undefined behaviour. The runner must
  expose a single-fork / serialized-test mode.
- **TypeScript ergonomics.** The codebase is strict TS with
  `noUncheckedIndexedAccess` and friends; the runner needs zero-config
  TS support so test files use the same project tsconfig.
- **Sharing utilities with Vite-built apps.** `packages/ui` and
  `apps/qr-menu` are Vite-bundled. A Vite-native runner reuses the
  existing config and plugin chain.

## Decision

Standardize on **Vitest 2.x** as the test runner for every package
that has tests (and every future package).

Per-project `vitest.config.ts` files extend a shared base and pick
their own pool/reporter as needed. The api project's e2e config sets:

```ts
pool: 'forks',
poolOptions: { forks: { singleFork: true } },
```

This is load-bearing for the RLS testcontainer pattern (see
`apps/api/test/e2e/with-real-stack.setup.ts` and
`apps/api/test/e2e/helpers/with-db-stack.ts`): a single Vitest worker
holds the Postgres container handle, applies migrations once, and runs
all tests in that file sequentially.

## Alternatives considered

### Jest

**Strongest argument:** the dominant Node test runner, mature
matchers, deep mocking surface, well-known by every JS engineer.

**Rejected because:** TS support requires `ts-jest` / `@swc/jest`
configuration per project (we have ten); ESM support is still
post-hoc; startup time is ~10× Vitest's for the unit suite. The
testcontainer single-fork story is doable (`maxWorkers: 1`) but the
Vite-native overlap with `apps/qr-menu` and `packages/ui` is missing.

### Node test runner (`node:test`)

**Strongest argument:** zero dependencies, ships with Node 22 LTS,
runs anywhere Node runs.

**Rejected because:** matcher API is bare bones (no `expect.any`,
`toMatchObject`, snapshot testing); ecosystem of testcontainer
helpers and Nest testing utilities targets `vi.fn()` / `jest.fn()`
shapes, not `mock.fn()`. We would write our own matcher suite; we are
not in that business.

### Bun test

**Strongest argument:** very fast, integrated with the Bun runtime
(0-config TS, JSX, etc.).

**Rejected because:** we run on Node 22 (ADR — Stack), not Bun;
introducing two runtimes for tests vs production breaks the principle
that tests run code as the runtime sees it. Worth revisiting if/when
we adopt Bun for the api.

## Consequences

### Positive

- One runner, one config shape, one set of matchers across the
  workspace. Tests look the same whether you opened
  `packages/domain/test/` or `apps/api/test/e2e/`.
- Vite-native — reuses `apps/qr-menu` and `packages/ui` config when
  those packages get tests.
- ESM-native — no transpile step in dev/test loop. Strict TS works
  without `ts-jest` ceremony.
- `singleFork: true` is a one-line opt-in, and the contract is
  explicit (vs Jest's `maxWorkers: 1`, which still leaves Jest free
  to fork per-file).

### Negative

- Some snapshot semantics differ from Jest (different prettier-format
  output for inline snapshots). Matters only if we migrate a Jest
  suite into Vitest later — none today.
- `vi.mock` hoisting rules are not identical to `jest.mock`'s; new
  contributors who Jest-muscle-memory are occasionally bitten. Linked
  in `apps/api/CLAUDE.md` for mitigation.

### Neutral

- Coverage uses `@vitest/coverage-v8` (V8 native). Works the same way
  Jest's `--coverage` does for our purposes.

## Implementation notes

- Per-project configs live next to `package.json`:
  `apps/api/vitest.config.ts`, `packages/db/vitest.config.ts`, etc.
- The singleFork constraint applies to **every suite that uses
  testcontainers or shared GUC state**. New tests that touch a
  Postgres container must inherit (or copy) that config.
- The `resto-e2e-with-rls` skill at `.claude/skills/` documents the
  two harness patterns (`startRealStack` and the lighter
  `startDbStack`) and the singleFork rule.
- CI affected detection (`nrwl/nx-set-shas`) runs only the projects
  whose graph touches the change — Vitest spinning up its own worker
  pool inside that affected project is fine.
