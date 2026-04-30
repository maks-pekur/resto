# packages/

## Purpose

Shared libraries consumed by `apps/*`. Packages may depend on other
packages; cycles are forbidden (Nx enforces via `enforce-module-boundaries`
once we add it).

## Layout

- `domain/` — pure TypeScript domain types and Zod schemas. Single source
  of truth for business types (Tenant, MenuItem, Order, etc.). No runtime
  framework imports.
- `db/` — Drizzle schema, migrations, repository helpers, RLS policies,
  seed scripts. Only this package knows the database.
- `events/` — event contracts (Zod schemas) shared across bounded contexts;
  outbox dispatcher and NATS subscriber utilities.
- `api-client/` — typed clients generated from OpenAPI plus tRPC types for
  internal admin↔api calls.
- `ui/` — design system (Radix primitives + Tailwind + tokens). Used by
  Next apps and the qr-menu.
- `feature-flags/` — OpenFeature client with the configured provider
  (Unleash self-hosted).
- `config-typescript/` — shared tsconfig presets (base, node, nest, react,
  nextjs, vite, expo).
- `config-eslint/` — shared ESLint flat-config presets (base, node, react,
  nextjs).
- `config-tailwind/` — shared Tailwind preset (tokens, plugins).

## Rules

- **No tenant-aware logic in `domain/`.** Tenant context is enforced at the
  application/repository layer (db package + AsyncLocalStorage).
- **Zod schemas are authoritative** — derive TypeScript types from them via
  `z.infer`, not the other way around.
- **No circular dependencies** between packages. If you feel the need,
  you've crossed a bounded-context boundary — extract a third package or
  rethink the layering.
- **Public API** of each package is its `src/index.ts`. Anything else is
  internal and must not be imported from outside the package.
- New package → add `package.json` with `name: "@resto/<name>"`, populate
  `src/index.ts`, and update `tsconfig.base.json` paths if needed.
