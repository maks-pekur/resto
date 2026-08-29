# Coding Conventions

**Analysis Date:** 2026-08-18

## Naming Patterns

**Files:**

- Kebab-case for all source files: `provision-tenant.service.ts`, `tenant-drizzle.repository.ts`, `error-mapping.ts`
- Suffix conventions are strict: `.service.ts`, `.repository.ts`, `.controller.ts`, `.module.ts`, `.middleware.ts`, `.guard.ts`, `.pipe.ts`, `.adapter.ts`, `.decorator.ts`, `.spec.ts`
- Event contract files follow bounded-context name: `tenancy.ts`, `identity.ts`, `ordering.ts`
- Schema files in `packages/domain` are kebab-case entity names: `menu-item.ts`, `tenant.ts`

**Classes:**

- PascalCase throughout
- NestJS providers: `ProvisionTenantService`, `TenantDrizzleRepository`, `TenantsController`
- Aggregates: `Tenant`, `Location`, `Order`, `TableZone`, `RestaurantTable` (no suffix). There is no `Brand` aggregate — phase 10.2 removed the brand level entirely.
- Errors: `TenantNotFoundError`, `RefundReasonRequiredError` (always `Error` suffix)
- Ports/interfaces: `TenantRepository`, `PaymentProviderPort` (no `I` prefix)
- DTOs: `ProvisionTenantInputDto` (schema → `ProvisionTenantInputSchema`, type → `ProvisionTenantInput`, class → `ProvisionTenantInputDto`)
- Adapters: `TenantDrizzleRepository`, `NoopStripeConnectAdapter`, `NatsJetStreamPublisher`

**Constants (Symbol injection tokens):**

- `SCREAMING_SNAKE_CASE` for DI tokens: `TENANT_REPOSITORY`, `ORDER_REPOSITORY`, `MENU_PRICING_PORT`, `ORDER_FEED_REPOSITORY`
- Declared in `domain/ports.ts` (or `application/ports/*.ts`) alongside the interface

**Functions:**

- camelCase for standalone functions and methods
- Repository methods: `findById`, `findBySlug`, `findByDomainHost`, `save`, `listDomains`
- Service entry point: always `.execute(input)` — single public method, verified across contexts (e.g. `RefundOrderService.execute`, `CreateOrderService.execute`)

**Variables:**

- camelCase; private class fields use `#` (native private): `readonly #events: TenantDomainEvent[]`
- `_` prefix for intentionally unused function parameters and caught errors: `_res`, `_tx` — ESLint `caughtErrorsIgnorePattern: '^_'` also applies

**Zod schema naming convention (packages/domain):**

- Schema: `MoneyAmountValue`, `MoneyAmount`, `Currency`, `CurrencyValue`
- Branded vs. unbranded pairs: `FooValue` (unbranded, use at HTTP boundary) / `Foo` (branded, use inside domain)
- Type always derived: `export type Foo = z.infer<typeof Foo>`

**Domain error discriminant:**

- Domain errors additionally expose `readonly kind = 'FooError' as const` (e.g. `PaymentsNotEnabledError`, `CurrencyMismatchError` in `apps/api/src/contexts/payments/domain/errors.ts`) for union narrowing in application code — this is now a settled pattern across payments, ordering, and catalog, not catalog-only.

## Code Style

**Formatting (Prettier):**

- Single quotes for strings
- Trailing commas everywhere (arrays, objects, parameters)
- Semicolons required
- Print width: 100 chars
- Tab width: 2 spaces, no tabs
- `arrowParens: always`
- LF line endings

**TypeScript (`packages/config-typescript/base.json` + per-app overrides):**

- Strict mode + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes: true` at the base preset.
- `exactOptionalPropertyTypes` is explicitly disabled (`false`) in exactly two apps' own `tsconfig.json`, both Radix/shadcn-ui consumers: `apps/admin/tsconfig.json` and `apps/website/tsconfig.json`. Radix component prop spreads assign `undefined` to optional props in a way `exactOptionalPropertyTypes: true` rejects. `apps/qr-menu` (Vite + plain React, no Radix) keeps the strict default.
- `verbatimModuleSyntax: false` (allows type-only imports without `import type` enforcement from tsc, but ESLint enforces it separately)
- Target: ES2022, module: ESNext, moduleResolution: Bundler (NestJS overrides to `CommonJS`/`Node` via `packages/config-typescript/nest.json` for decorator metadata emission)

**Linting (`packages/config-eslint/base.mjs` — typescript-eslint strict + stylistic type-checked):**

- `@typescript-eslint/consistent-type-imports: prefer type-imports, fixStyle: inline-type-imports` — enforced via ESLint
- `@typescript-eslint/no-floating-promises: error`, `await-thenable: error`, `no-misused-promises: error`
- `@typescript-eslint/no-non-null-assertion: error` — no `!` assertions
- `@typescript-eslint/restrict-template-expressions: error` (numbers/booleans allowed in templates, nothing else)
- `no-console: warn` (allow `warn`/`error`) — use `Logger` from NestJS instead
- `eqeqeq: error` — always `===`, except `null` comparisons
- `no-restricted-syntax` carries a growing list of project-specific forbidden patterns beyond the general rules above — see "Enforced Invariants" below. Each entry cites its ADR/ticket in the ESLint config itself, not just in docs.
- The comment-ban policy (below) is **not** ESLint-enforced — there is no `no-warning-comments`/custom rule blocking descriptive comments. It is enforced by code review discipline and periodic cleanup commits (see Comments section).

## Import Organization

**Order (enforced by Prettier, not by import/order plugin):**

1. Node built-ins (`node:crypto`, `node:path`, `node:http`)
2. External packages (`@nestjs/*`, `drizzle-orm`, `zod`, `vitest`)
3. Monorepo packages (`@resto/db`, `@resto/domain`, `@resto/events`)
4. Local imports (relative paths, `../../../src/...`)

**Type imports:**

- `import { type Foo }` inline syntax preferred (enforced by `consistent-type-imports` rule, `fixStyle: inline-type-imports`)
- `import type { Foo }` also acceptable (same rule allows both forms)

**Path aliases per app — verified against each app's own `tsconfig.json` / `vite.config.ts`:**

- `apps/api` — no `@/` alias; relative paths only.
- `apps/admin` — Vite + React SPA (TanStack Router, not Next.js/RSC — the app was migrated off Next.js). `@/*` → `./src/*`, configured in both `apps/admin/tsconfig.json` (`paths`) and `apps/admin/vite.config.ts` (`resolve.alias`).
- `apps/website` — still Next.js App Router/RSC. `@/*` → `./*` (root-relative, not `./src/*` — website has no `src/` dir).
- `apps/qr-menu` — no `@/` alias observed; relative paths.
- Monorepo packages accessed via `@resto/<name>` (e.g. `@resto/db`, `@resto/domain`, `@resto/events`) — resolved through `tsconfig.base.json` path mappings and workspace `package.json` exports, never a relative `../../packages/...` reach-across.

## DTO / Schema Pattern

The project uses a three-export pattern per DTO:

```typescript
// Schema (Zod) — authoritative
export const CreateOrderInputSchema = z.object({ ... });

// Inferred type
export type CreateOrderInput = z.infer<typeof CreateOrderInputSchema>;

// NestJS DTO class (for Swagger + validation pipe)
export class CreateOrderInputDto extends createZodDto(CreateOrderInputSchema) {}
```

- Zod schemas are the single source of truth; TypeScript types are ALWAYS derived via `z.infer`
- Never write `type Foo = { ... }` separately from a Zod schema
- HTTP-boundary schemas use unbranded value types (`CurrencyValue`, `MoneyAmountValue`) so `nestjs-zod` emits `type: string` for OpenAPI
- Domain internals use branded types (`Currency`, `MoneyAmount`) to prevent cross-type misuse
- `packages/domain` rule (not previously in this doc): free-text fields require an explicit max length (`z.string().max(...)`, default cap 4 KiB) and URL fields must restrict scheme via `.refine(u => /^https?:/i.test(u), ...)` — unbounded `z.string()` / `.url()` are DoS and XSS/CSS-injection vectors respectively at the HTTP boundary. Enforced by convention + review, not a lint rule.

## DI and Module Pattern (NestJS)

```typescript
// ports.ts — interface + Symbol token
export interface OrderRepository { ... }
export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');

// Module wiring
{ provide: ORDER_REPOSITORY, useClass: OrderDrizzleRepository }

// Service constructor
constructor(@Inject(ORDER_REPOSITORY) private readonly repo: OrderRepository) {}
```

- Repositories and ports are always injected by Symbol token, not by class
- Application services depend on port interfaces, never on concrete infrastructure classes
- Each bounded context owns a `*.module.ts` at its root that wires all internal providers
- All services are `@Injectable()` with a single `execute(input)` public method
- NestJS module classes are intentionally empty marker classes for the DI container — `apps/api/eslint.config.mjs` explicitly turns off `@typescript-eslint/no-extraneous-class` for `**/*.module.ts` rather than treating the pattern as a smell.

## Error Handling

**Domain errors:**

- Plain `Error` subclasses defined in `domain/errors.ts` per bounded context
- Constructor sets `this.name` explicitly (for stack trace readability)
- No error codes or HTTP status in domain errors
- Payments/ordering/catalog error classes additionally carry `readonly kind = 'FooError' as const` (see Naming Patterns)

```typescript
export class PaymentsNotEnabledError extends Error {
  readonly kind = 'PaymentsNotEnabledError' as const;
  constructor(public readonly tenantId: string) {
    super(`Tenant "${tenantId}" cannot accept payments — KYC not complete.`);
    this.name = 'PaymentsNotEnabledError';
  }
}
```

**HTTP interface translation:**

- Each controller has a corresponding `error-mapping.ts` with a `mapDomainError(err)` function
- Function maps domain errors to NestJS `HttpException` subclasses (never maps `unknown` — returns it unchanged)
- Controllers wrap every handler body in `try/catch` and call `mapDomainError`, or use the `wrapWith(mapper)` helper (`apps/api/src/shared/api/wrap.ts`) in internal controllers:

```typescript
try {
  return toResponse(await this.queries.getCurrentTenant());
} catch (err) {
  throw mapDomainError(err);
}
```

**Global exception filter:**

- `ProblemDetailsFilter` (`apps/api/src/shared/exception.filter.ts`) catches all unhandled exceptions
- Outputs RFC 7807 `application/problem+json`
- 5xx responses redact `detail` to prevent DB/schema leak (RES-175)
- Error `code` string maps to a stable `type` URI: `https://resto.app/problems/<code>`
- Structured log: `error` level for 5xx, `warn` for 4xx

## Logging

**Framework:** NestJS `Logger` from `@nestjs/common`

**Patterns:**

- Class-level logger declared as `private readonly logger = new Logger(ClassName.name)`
- Structured logging — pass an object as first arg: `this.logger.log({ slug, tenantId }, 'Message.')`
- Use `logger.log` for normal operations, `logger.warn` for degraded-but-ok, `logger.error` for failures
- Never log secrets; `packages/db/src/logger.ts` has a `redact` config covering `password`, `token`, `email`, `phone`, `params`
- `no-console: warn` ESLint rule — use Logger, not `console.log`

## Comments — HARD default: ZERO

This is enforced in practice, not just documented. Canonical statement lives in `apps/CLAUDE.md`; restated here because it governs every file this document's readers will write.

**Default: no comments.** Well-named identifiers are expected to document the code by themselves.

**The only exception is a critical WHY, capped at ~2 lines:**

- A hidden constraint (e.g. a library quirk, a database/RLS behavior that isn't visible from the call site)
- A counterintuitive workaround (e.g. why a seemingly-wrong branch is actually correct)
- A subtle invariant that a future reader would otherwise silently violate

Even the WHY exception is a link/pointer, not an essay — cite an ADR number where one exists (`// ADR-0020 I-1`); a bare ticket ID (`// RES-175`) is used when there is no ADR.

**Forbidden, explicitly:**

- `// what this does` comments that restate the following line
- File-header doc blocks restating the file's role
- `// added for X / fix for #Y` — that belongs in the commit message, not the code
- Section-divider banners (`// ======`)
- JSDoc on internal helpers — JSDoc is reserved for `packages/*` public API where the contract is genuinely non-obvious
- Comments inside test bodies — `describe`/`it` names carry the intent instead

**This is retroactive.** Touching a file is licence to strip any comment that fails the WHY bar, whether or not it's related to the current change. Not lint-enforced (no ESLint rule blocks comments) — enforced by review and by dedicated cleanup commits. A representative one: `363fc0e9` ("style(10): strip narrative comments from phase 10 code") touched 47 files across `apps/api`, `apps/website`, `packages/db`, `packages/domain`, `packages/events`, and `tools/scripts` for a net **411 comment-line deletions, 0 insertions**. Smaller single-purpose versions of the same cleanup recur regularly (`01efd2ec`, `503e2c4a`, `2bb0407b`, `92e90c73`, `8d39c531`, and others) — expect to be asked to do this on almost every phase, not just once.

**JSDoc (narrow exception):**

- Used on public interfaces and key abstractions in `packages/` only, and only where the contract is non-obvious
- Not required on every method

## Enforced Invariants (ESLint, beyond generic style)

`packages/config-eslint/base.mjs` and each app's own `eslint.config.mjs` encode several project-specific invariants as `no-restricted-syntax` / `no-restricted-imports` rules — these are load-bearing, not stylistic, and each one traces to an ADR or ticket cited directly in the rule's `message`:

- **`correlationId` must come from `buildEnvelope()`**, never `randomUUID()`/`crypto.randomUUID()` literally assigned to a `correlationId` property (`FORBIDDEN_CORRELATION_ID_LITERALS`, ADR-0020 I-4 / TEN-15). Defined once in `base.mjs`, spread into every consumer config that redefines `no-restricted-syntax` — flat-config rule arrays don't merge across configs, so this spread is required at every site, not optional boilerplate.
- **`runInTenantContext` is HTTP-middleware-only** (ADR-0020 I-6) — `apps/api/eslint.config.mjs` bans importing it from `@resto/db` anywhere except `src/shared/tenant-context.middleware.ts`. Everywhere else uses `db.withTenant` / `db.withTenantId` / `db.withoutTenant`.
- **Direct `tx.select/insert/update/delete` bypasses `ScopedTx`** (ADR-0020 I-1) — banned outside `*-drizzle.repository.ts` / `*-drizzle.reader.ts` adapters (which take on responsibility for the tenant filter themselves) and the audit consumer.
- **`withoutTenant` calls are allowlisted by file path** (RES-252 I-1) — mirrored between `apps/api/eslint.config.mjs` and `packages/db/src/withoutTenant.allowlist.ts`; adding a new caller means updating both.
- **`stripe` SDK import is banned from `payments/application` and `payments/domain`** (PAY-16) — only `payments/infrastructure/stripe/` may import it; application/domain code depends on `PaymentProviderPort`.
- Test files (`test/**/*.ts`, `src/**/*.spec.ts`) get `no-restricted-imports`/`no-restricted-syntax` turned back **off** — tests legitimately simulate the middleware layer and seed via raw `tx.*` under `withoutTenant`.

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

`db.withoutTenant(reason, fn)` bypasses RLS for system-level operations; callers must provide a non-empty `reason` string, and the caller's file path must be on the explicit allowlist (see Enforced Invariants above).

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

_Convention analysis: 2026-08-18_
