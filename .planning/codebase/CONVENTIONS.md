# Coding Conventions

**Analysis Date:** 2026-05-24

## Naming Patterns

**Files:**

- Kebab-case for all source files: `provision-tenant.service.ts`, `tenant-drizzle.repository.ts`, `error-mapping.ts`
- Suffix conventions are strict: `.service.ts`, `.repository.ts`, `.controller.ts`, `.module.ts`, `.middleware.ts`, `.guard.ts`, `.pipe.ts`, `.adapter.ts`, `.decorator.ts`, `.spec.ts`
- Event contract files follow bounded-context name: `tenancy.ts`, `identity.ts`
- Schema files in `packages/domain` are kebab-case entity names: `menu-item.ts`, `tenant.ts`

**Classes:**

- PascalCase throughout
- NestJS providers: `ProvisionTenantService`, `TenantDrizzleRepository`, `TenantsController`
- Aggregates: `Tenant`, `Brand` (no suffix)
- Errors: `TenantNotFoundError`, `TenantSlugTakenError` (always `Error` suffix)
- Ports/interfaces: `TenantRepository`, `StripeConnectPort` (no `I` prefix)
- DTOs: `ProvisionTenantInputDto` (schema → `ProvisionTenantInputSchema`, type → `ProvisionTenantInput`, class → `ProvisionTenantInputDto`)
- Adapters: `TenantDrizzleRepository`, `NoopStripeConnectAdapter`, `NatsJetStreamPublisher`

**Constants (Symbol injection tokens):**

- `SCREAMING_SNAKE_CASE` for DI tokens: `TENANT_REPOSITORY`, `STRIPE_CONNECT_PORT`, `BRAND_REPOSITORY`, `CATALOG_REPOSITORY`
- Declared in `domain/ports.ts` alongside the interface

**Functions:**

- camelCase for standalone functions and methods
- Repository methods: `findById`, `findBySlug`, `findByDomainHost`, `save`, `listDomains`
- Service entry point: always `.execute(input)` — single public method

**Variables:**

- camelCase; private class fields use `#` (native private): `readonly #events: TenantDomainEvent[]`
- `_` prefix for intentionally unused function parameters: `_res`, `_tx`

**Zod schema naming convention (packages/domain):**

- Schema: `MoneyAmountValue`, `MoneyAmount`, `Currency`, `CurrencyValue`
- Branded vs. unbranded pairs: `FooValue` (unbranded, use at HTTP boundary) / `Foo` (branded, use inside domain)
- Type always derived: `export type Foo = z.infer<typeof Foo>`

## Code Style

**Formatting (Prettier):**

- Single quotes for strings
- Trailing commas everywhere (arrays, objects, parameters)
- Semicolons required
- Print width: 100 chars
- Tab width: 2 spaces, no tabs
- `arrowParens: always`
- LF line endings

**TypeScript:**

- Strict mode + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` (except Next.js app — incompatible with Radix prop spreads)
- `verbatimModuleSyntax: false` (allows type-only imports without `import type` enforcement from tsc, but ESLint enforces it separately)
- Target: ES2022, module: ESNext, moduleResolution: Bundler

**Linting (typescript-eslint strict + stylistic):**

- `@typescript-eslint/consistent-type-imports: prefer type-imports` — enforced via ESLint
- `@typescript-eslint/no-floating-promises: error` — all Promises must be awaited or explicitly voided
- `@typescript-eslint/no-non-null-assertion: error` — no `!` assertions
- `no-console: warn` (allow `warn`/`error`) — use `Logger` from NestJS instead
- `eqeqeq: error` — always `===`, except `null` comparisons

## Import Organization

**Order (enforced by Prettier, not by import/order plugin):**

1. Node built-ins (`node:crypto`, `node:path`, `node:http`)
2. External packages (`@nestjs/*`, `drizzle-orm`, `zod`, `vitest`)
3. Monorepo packages (`@resto/db`, `@resto/domain`, `@resto/events`)
4. Local imports (relative paths, `../../../src/...`)

**Type imports:**

- `import { type Foo }` inline syntax preferred (enforced by `consistent-type-imports` rule)
- `import type { Foo }` also acceptable (same rule allows both forms)

**Path aliases:**

- No `@/` aliases in API (`apps/api`) — uses relative paths
- `@/` alias used in Next.js admin app (`apps/admin`)
- Monorepo packages accessed via `@resto/<name>` (e.g. `@resto/db`, `@resto/domain`, `@resto/events`)

## DTO / Schema Pattern

The project uses a three-export pattern per DTO:

```typescript
// Schema (Zod) — authoritative
export const ProvisionTenantInputSchema = z.object({ ... });

// Inferred type
export type ProvisionTenantInput = z.infer<typeof ProvisionTenantInputSchema>;

// NestJS DTO class (for Swagger + validation pipe)
export class ProvisionTenantInputDto extends createZodDto(ProvisionTenantInputSchema) {}
```

- Zod schemas are the single source of truth; TypeScript types are ALWAYS derived via `z.infer`
- Never write `type Foo = { ... }` separately from a Zod schema
- HTTP-boundary schemas use unbranded value types (`CurrencyValue`, `MoneyAmountValue`) so `nestjs-zod` emits `type: string` for OpenAPI
- Domain internals use branded types (`Currency`, `MoneyAmount`) to prevent cross-type misuse

## DI and Module Pattern (NestJS)

```typescript
// ports.ts — interface + Symbol token
export interface TenantRepository { ... }
export const TENANT_REPOSITORY = Symbol('TENANT_REPOSITORY');

// Module wiring
{ provide: TENANT_REPOSITORY, useClass: TenantDrizzleRepository }

// Service constructor
constructor(@Inject(TENANT_REPOSITORY) private readonly repo: TenantRepository) {}
```

- Repositories and ports are always injected by Symbol token, not by class
- Application services depend on port interfaces, never on concrete infrastructure classes
- Each bounded context owns a `*.module.ts` at its root that wires all internal providers
- All services are `@Injectable()` with a single `execute(input)` public method

## Error Handling

**Domain errors:**

- Plain `Error` subclasses defined in `domain/errors.ts` per bounded context
- Constructor sets `this.name` explicitly (for stack trace readability)
- No error codes or HTTP status in domain errors

```typescript
export class TenantNotFoundError extends Error {
  constructor(public readonly identifier: string) {
    super(`Tenant "${identifier}" was not found.`);
    this.name = 'TenantNotFoundError';
  }
}
```

**HTTP interface translation:**

- Each controller has a corresponding `error-mapping.ts` with a `mapDomainError(err)` function
- Function maps domain errors to NestJS `HttpException` subclasses (never maps `unknown` — returns it unchanged)
- Controllers wrap every handler body in `try/catch` and call `mapDomainError`:

```typescript
try {
  return toResponse(await this.queries.getCurrentTenant());
} catch (err) {
  throw mapDomainError(err);
}
```

- Alternatively, the `wrapWith(mapper)` helper is used in internal controllers:

```typescript
const wrap = wrapWith(mapCatalogError);
// ...
return wrap(() => this.upsertCategory.execute(input));
```

**Global exception filter:**

- `ProblemDetailsFilter` (`apps/api/src/shared/exception.filter.ts`) catches all unhandled exceptions
- Outputs RFC 7807 `application/problem+json`
- 5xx responses redact `detail` to prevent DB/schema leak (RES-175)
- Error `code` string maps to a stable `type` URI: `https://resto.app/problems/<code>`
- Structured log: `error` level for 5xx, `warn` for 4xx

**Catalog domain errors** also expose a `readonly kind = 'FooError' as const` discriminant field (for union type narrowing).

## Logging

**Framework:** NestJS `Logger` from `@nestjs/common`

**Patterns:**

- Class-level logger declared as `private readonly logger = new Logger(ClassName.name)`
- Structured logging — pass an object as first arg: `this.logger.log({ slug, tenantId }, 'Message.')`
- Use `logger.log` for normal operations, `logger.warn` for degraded-but-ok, `logger.error` for failures
- Never log secrets; `packages/db/src/logger.ts` has a `redact` config covering `password`, `token`, `email`, `phone`, `params`
- `no-console: warn` ESLint rule — use Logger, not `console.log`

## Comments

**When to comment:**

- WHY-comments only when there is a hidden constraint, invariant reference, or counterintuitive workaround
- Link to ADR number or ticket ID for non-obvious decisions: `// ADR-0020 I-1`, `// RES-175`
- No descriptive comments that merely restate what the code does

**JSDoc:**

- Used on public interfaces and key abstractions in `packages/`
- Not required on every method — only when the contract is non-obvious

## Tenancy Enforcement Pattern

Tenancy is enforced at two layers — both are mandatory:

1. **Postgres RLS** (second layer, safety net): every tenant-scoped table has `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`
2. **Application-layer filter** (first layer): every Drizzle query on a tenant-scoped table MUST include `eq(table.tenantId, ctx.tenantId)`

The `requireTenantContext()` helper reads the current tenant from `AsyncLocalStorage`:

```typescript
const ctx = requireTenantContext(); // throws if no context bound
const brandId = getBrandId() ?? null;
return this.repo.upsertCategory({ tenantId: ctx.tenantId, brandId, ... });
```

`db.withoutTenant(reason, fn)` bypasses RLS for system-level operations; callers must provide a non-empty `reason` string. The ESLint `no-restricted-syntax` rule restricts `withoutTenant` calls to an explicit allowlist (`packages/db/src/withoutTenant.allowlist.ts`).

`runInTenantContext` is HTTP-middleware-only (ADR-0020 I-6) and is restricted via `no-restricted-imports`.

## Event Publishing Pattern

Events flow through the transactional outbox:

```typescript
// In aggregate: accumulate domain events
this.#events.push({ kind: 'TenantProvisioned', ... });

// In repository.save(): drain events and write outbox rows in the same tx
const events = tenant.pullEvents();
for (const event of events) {
  await appendToOutbox(tx, { envelope: domainEventToEnvelope(event), aggregateId });
}
```

Event contracts are defined in `packages/events/src/contracts/` using `defineEventContract`:

```typescript
export const TenantProvisionedV1 = defineEventContract({
  type: 'tenancy.tenant_provisioned.v1',
  payload: TenantProvisionedV1Payload,
});
```

Event type format: `<context>.<event>.v<n>` (e.g. `tenancy.tenant_provisioned.v1`).

## Validation

- `RestoZodValidationPipe` is applied **per-parameter** at the controller, not globally
- Reason: `esbuild`/`tsx`/`vitest` transpiler doesn't emit `design:paramtypes` metadata required for global pipe
- Usage: `@Body(new RestoZodValidationPipe(SomeDto)) input: SomeDto`
- Validation errors produce `BadRequestException({ code: 'validation.failed', message: '...' })`

## Module Boundary Rules (ESLint / Nx)

- Apps never import from other apps
- Apps import only from `@resto/*` packages (scope:shared)
- `packages/domain` has zero infrastructure imports — no `@nestjs/*`, `drizzle-orm`, `pg`
- `packages/db` is the only place raw SQL and Drizzle schema live
- Package public API is exclusively `src/index.ts` — never import from sub-paths

---

_Convention analysis: 2026-05-24_
