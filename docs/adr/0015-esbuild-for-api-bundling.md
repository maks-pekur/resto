# ADR 0015: esbuild for `apps/api` production bundling

- **Status:** accepted
- **Date:** 2026-05-03
- **Deciders:** Resto core team
- **Supersedes:** —
- **Superseded by:** —

## Context

`apps/api` is a NestJS modular monolith deployed as a single
container image. The image is rebuilt on every merge to `main` and on
every release tag. The deploy pipeline cares about three things:

- **Build time.** A 30-second build is invisible in CI; a
  five-minute build erodes the trust that `main` is shippable.
- **Image size.** Cold-start latency on EKS scales with image pull
  size. Smaller image → faster horizontal scaling.
- **Runtime correctness.** NestJS lazy-loads many transport adapters
  (Express, Microservices, WebSockets, gRPC, Kafka, MQTT, AMQP,
  Redis, Mongoose) at runtime. A naive bundler tries to resolve every
  import statically and either fails or pulls in code we never use.

We also need:

- Source maps for production stack traces (Sentry consumes them).
- Native CommonJS output. NestJS's reflection metadata + Better Auth's
  organization plugin both have ESM-vs-CJS edge cases that bite in
  bundled output. CJS sidesteps both.
- Easy ejection — every line of build config lives in one file
  (`apps/api/build.mjs`), no plugin chains.

## Decision

Bundle `apps/api` for production with **esbuild**, configured in
`apps/api/build.mjs` as a single `build()` call:

```js
await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: 'dist/main.cjs',
  external: NESTJS_OPTIONAL_PEERS,
  sourcemap: true,
});
```

`NESTJS_OPTIONAL_PEERS` is an explicit allow-list of NestJS optional
adapters and their transitive deps that must NOT be bundled. Anything
in that list must also stay out of the runtime image's
`node_modules` — otherwise NestJS will lazy-load it and silently
enable the corresponding feature.

## Alternatives considered

### `nest build` (Webpack via `@nestjs/cli`)

**Strongest argument:** the NestJS-native answer; Webpack gracefully
handles the lazy-load pattern with a `commonjsImportEverywhere` shim.

**Rejected because:** ~10× slower than esbuild on our codebase
(~12s vs ~1.2s on cold cache); the Webpack config sprawl is opaque
and locks us into NestJS's choice of bundler. esbuild's external
list is more honest — we name what we exclude, instead of relying on
a transitive shim to paper over the lazy-loads.

### `tsc` + Docker layer caching, no bundle

**Strongest argument:** simplest possible build — just emit JS and
ship `node_modules`.

**Rejected because:** the runtime image swells past 350MB even with
production-only deps, mostly from the optional peers we never use.
That hurts cold-start on EKS and inflates ECR storage.
Bundle + tree-shake takes the runtime layer to ~25MB.

### tsup

**Strongest argument:** wraps esbuild with a friendlier config
surface and dual-format (ESM + CJS) output.

**Rejected because:** dual format is wasted on the api (we ship CJS
only); tsup adds another dependency and a layer of config indirection
for no payoff. Worth revisiting for `packages/*` if any package
needs dual format.

### Bun build

**Strongest argument:** very fast bundler; no plugin chain.

**Rejected because:** introduces Bun as a build dependency; ADR-0014
already noted we run on Node, not Bun. Worth revisiting if we adopt
Bun in the runtime.

## Consequences

### Positive

- **Cold builds finish in ~1.2s** on a developer laptop, ~3s on CI.
- **Runtime image stays small** — ~25MB layer for `dist/main.cjs`
  plus a thin `node_modules` of _only_ the peers we use (postgres,
  drizzle, fastify, better-auth, etc.).
- **Optional-peer behaviour is explicit.** The `NESTJS_OPTIONAL_PEERS`
  list documents every adapter we deliberately exclude. Anyone
  enabling Microservices later must remove the entry, not silently
  pull in a transitive dep.
- **Source maps work end-to-end.** Sentry receives them at deploy
  time and shows source-level stack traces.

### Negative

- **No watch/HMR for dev.** Dev still uses `tsx watch src/main.ts`,
  so the dev runtime path differs slightly from prod (CJS vs TS).
  Mitigated by the e2e harness: it boots the full Nest app from
  `src/`, so the production-shape integration coverage stays honest.
- **Single-file bundler config.** Adding new externals is a file edit,
  not a CLI flag; reviewers must remember to update the list when
  adding (e.g.) a Mongoose adapter.

### Neutral

- **CommonJS output.** NestJS's decorator/metadata reflection works
  best on CJS; ESM works but requires `"type": "module"` and
  topological loading caveats. We ship CJS until ESM gives us
  something concrete.

## Implementation notes

- Build entrypoint: `apps/api/build.mjs`. Invoked via
  `nx run api:build`.
- Externals list: `NESTJS_OPTIONAL_PEERS` in the same file. Comment
  at the top explains the contract.
- Output: `apps/api/dist/main.cjs` + `dist/main.cjs.map`.
- The runtime image (`infra/docker/api.Dockerfile` once it lands per
  RES-86) copies only `dist/`, `package.json`, and a pruned
  `node_modules/` produced by `pnpm deploy --filter=api --prod`.
- Anything we add to `NESTJS_OPTIONAL_PEERS` must be paired with a
  test or a doc note that proves the runtime never reaches it.
