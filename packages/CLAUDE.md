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
- `api-client/` — TypeScript types generated from `docs/api/openapi.yaml`
  (RES-117). Exposes `paths` / `components` / `operations`; sub-path
  exports `./public` and `./internal` filter the surface by route prefix.
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

### Layering + boundaries

- **No tenant-aware logic in `domain/`.** Tenant context is enforced at the
  application/repository layer (db package + AsyncLocalStorage).
- **`domain/` has zero infra imports.** No NestJS, no Drizzle, no axios, no
  express. Only `zod` and pure utilities. Enforced by a `dependency-cruiser`
  rule (planned) and by a smoke test that imports every file in `domain/src`
  and asserts no transitive `@nestjs/*` / `drizzle-orm` / `pg` resolution.
- **Zod schemas are authoritative** — derive TypeScript types from them via
  `z.infer`, not the other way around.
- **Free-text fields in domain schemas MUST have a max length.** A
  `z.string().min(1)` with no upper bound is a DoS vector at the HTTP
  boundary. Default cap for human-entered text: 4 KiB.
- **URL fields in domain schemas MUST restrict scheme.** `z.string().url()`
  accepts `javascript:` and `data:` — anything that lands in `<img src>`,
  `<a href>`, or CSS `url(...)` is an XSS/CSS-injection vector. Use
  `.refine(u => /^https?:/i.test(u), 'must be http(s)')`.
- **No circular dependencies** between packages. If you feel the need,
  you've crossed a bounded-context boundary — extract a third package or
  rethink the layering.
- **Public API** of each package is its `src/index.ts`. Anything else is
  internal and must not be imported from outside the package.
- New package → add `package.json` with `name: "@resto/<name>"`, populate
  `src/index.ts`, and update `tsconfig.base.json` paths if needed.

### Cross-cutting invariants (canonical: ADR-0020)

These are the platform-level rules that span packages. The canonical
statement lives in
[ADR-0020](../docs/adr/0020-multi-tenancy-and-event-bus-invariants.md);
the per-package CLAUDE.md files (`db/`, `events/`, `api-client/`) restate
the specific rules they own.

- **Composite FKs on tenant-scoped children** (ADR-0020 I-2) — every child
  table that carries `tenant_id` AND a parent `*_id` MUST declare
  `FOREIGN KEY (parent_id, tenant_id) REFERENCES parent(id, tenant_id)`.
  Owned by `packages/db`.
- **Inbox dedup is transactional with handler side effects** (ADR-0020 I-5)
  — consumers use `runDeduped(db, envelope, consumer, async (tx) => …)`
  which inserts the inbox marker and runs the handler in the same Drizzle
  transaction. The old `withInboxDedup` three-tx wrapper is removed.
  Owned by `packages/events`.
- **Outbox envelope `correlationId` derives from the active OTel span**
  (ADR-0020 I-4) — `randomUUID()` is not an acceptable value. Use the
  shared `buildEnvelope` helper from `packages/events`. Owned by
  `packages/events`.
- **`runInTenantContext` is HTTP-middleware-only** (ADR-0020 I-6) — code in
  any package that needs to bind a tenant outside the request middleware
  uses `db.withTenant` / `db.withoutTenant`, not `runInTenantContext`.
- **`unknown` in `@resto/api-client` generated DTO request fields is a
  contract bug** (ADR-0020 I-7) — fix upstream via `@ApiProperty`. Owned
  by `packages/api-client`.
