---
name: resto-ddd-context
description: Authoritative blueprint for Resto bounded contexts. Covers folder layout, conditional Core/Http module split, CLI standalone modules, cross-context port+adapter bridges, explicit @Inject DI, Zod DTOs + ZodValidationPipe, RFC 7807 error filter, default-deny AuthGuard + @Public, AsyncLocalStorage middleware ordering, Vitest test layout. Load when scaffolding/refactoring a context or adding cross-context dependencies.
when_to_use: |
  - Creating a new bounded context under apps/api/src/contexts/.
  - Refactoring or splitting an existing context's modules.
  - Adding code that needs data or behavior from another context (cross-context bridge).
  - Reviewing a PR that introduces or restructures a context.
status: active
---

# Resto DDD Context Blueprint

## 1. Folder layout

Every context lives under `apps/api/src/contexts/<name>/`:

```
domain/           # framework-agnostic — entities, value objects, errors, port interfaces
application/      # services, DTOs, use-case orchestration
  ports/          # per-port files (identity pattern): symbol + interface co-located
infrastructure/   # DB adapters, external HTTP, NATS, cache — implements domain ports
interfaces/
  http/           # controllers, guards, decorators, pipes, error-mapping.ts
```

`interfaces/` is the fourth layer — **not** `http/` at the top level. HTTP files live under `interfaces/http/`.

Domain port symbols live in **either** `domain/ports.ts` (tenancy, catalog pattern — all ports in one file) **or** `application/ports/<name>.port.ts` (identity pattern — one file per port). Both are valid; pick per context, stay consistent.

## 2. Module split rule — conditional, not default

| Context has CLI/job surface?                  | Module shape                                      |
| --------------------------------------------- | ------------------------------------------------- |
| Yes (e.g. `identity` → `bootstrap-owner` CLI) | `<name>-core.module.ts` + `<name>-http.module.ts` |
| No (e.g. `tenancy`, `catalog`)                | Single `<name>.module.ts`                         |

Split only when providers must be composed into a CLI standalone context (`NestFactory.createApplicationContext`) **without** mounting HTTP guards. Splitting without CLI use is ceremony without value.

Naming: kebab-case files (`identity-core.module.ts`), PascalCase classes (`IdentityCoreModule`, `IdentityHttpModule`).

`IdentityHttpModule` imports `IdentityCoreModule` and adds `APP_GUARD` providers + controllers. `BootstrapModule` imports only `IdentityCoreModule`.

## 3. CLI standalone module (`BootstrapModule`)

```ts
// apps/api/src/contexts/identity/bootstrap.module.ts
@Module({
  imports: [ConfigModule, DatabaseModule, TenancyModule, IdentityCoreModule],
  providers: [
    BootstrapOwnerService,
    { provide: TENANT_LOOKUP_PORT, useClass: TenantLookupAdapter },
    TenantLookupAdapter,
  ],
  exports: [BootstrapOwnerService],
})
export class BootstrapModule {}
```

CLI entry point: `NestFactory.createApplicationContext(BootstrapModule)` — no HTTP server, no Fastify, no `APP_GUARD`.

`DatabaseModule` must be imported explicitly here because there is no surrounding `AppModule` providing it via `@Global()`.

## 4. Cross-context bridge — port + adapter pattern

**Never** import domain types across context boundaries. Bridge via a port interface only.

Port file (identity, per-port style — `application/ports/tenant-lookup.port.ts`):

```ts
export const TENANT_LOOKUP_PORT = Symbol('TENANT_LOOKUP_PORT');

export interface TenantLookupPort {
  /** Returns null on miss — never throws. */
  findBySlug(
    slug: string,
  ): Promise<{ id: string; slug: string; displayName: string } | null>;
}
```

Adapter (`infrastructure/tenant-lookup.adapter.ts`): injects the other context's application service by **class token**, catches its domain errors, maps to `null`:

```ts
@Injectable()
export class TenantLookupAdapter implements TenantLookupPort {
  constructor(
    @Inject(TenantQueriesService)
    private readonly queries: TenantQueriesService,
  ) {}

  async findBySlug(
    slug: string,
  ): Promise<{ id: string; slug: string; displayName: string } | null> {
    try {
      const snapshot = await this.queries.getBySlug(slug);
      return {
        id: snapshot.id,
        slug: snapshot.slug,
        displayName: snapshot.displayName,
      };
    } catch (err) {
      if (err instanceof TenantNotFoundError) return null;
      throw err;
    }
  }
}
```

Register in the consuming module: `{ provide: TENANT_LOOKUP_PORT, useClass: TenantLookupAdapter }`. The other context exports its service via `exports: [TenantQueriesService]` in `TenancyModule`.

## 5. DI rule — explicit `@Inject` everywhere

Every constructor parameter needs `@Inject(TOKEN)`. NestJS `design:paramtypes` is unreliable in this codebase.

```ts
// Symbol token
@Inject(ENV_TOKEN) private readonly env: Env

// Class as its own token
@Inject(TenantQueriesService) private readonly queries: TenantQueriesService

// NestJS core types — same rule
@Inject(Reflector) private readonly reflector: Reflector
@Inject(HttpAdapterHost) private readonly httpHost: HttpAdapterHost
```

DI tokens: symbols declared in a `*.tokens.ts` file or co-located with their port. Example: `apps/api/src/contexts/identity/identity.tokens.ts` exports `AUTH_TOKEN`, `AUTH_DRIZZLE_TOKEN`.

## 6. DTO + validation — Zod, not class-validator

DTO file: `application/dto.ts`. Schema and inferred type share the same name (declaration merge):

```ts
import { z } from 'zod';
import { Currency, TenantSlug } from '@resto/domain';

export const ProvisionTenantInput = z.object({
  slug: TenantSlug,
  displayName: z.string().min(1).max(120),
  defaultCurrency: Currency,
});
export type ProvisionTenantInput = z.infer<typeof ProvisionTenantInput>;
```

Pipe: `interfaces/http/zod-validation.pipe.ts` per context (not a global pipe). Validation failure throws `BadRequestException({ message, issues[] })`.

Controller usage: `@UsePipes(new ZodValidationPipe(ProvisionTenantInput))`.

Domain primitives (`TenantSlug`, `Currency`, `Slug`, `LocalizedText`) come from `@resto/domain` and compose into schemas.

## 7. Error layering — domain → HTTP → RFC 7807

```
Domain throws → Error subclass (e.g. TenantNotFoundError) — no NestJS, no HTTP codes
Controller wraps → wrap() calls mapDomainError(err) → NestJS HttpException subclass
ProblemDetailsFilter → RFC 7807: { type, title, status, detail, instance, correlationId, traceId }
```

`error-mapping.ts` in `interfaces/http/`:

```ts
export const mapDomainError = (err: unknown): unknown => {
  if (err instanceof TenantNotFoundError)
    return new NotFoundException(err.message);
  if (err instanceof TenantSlugTakenError)
    return new ConflictException(err.message);
  return err; // unknown errors re-thrown as-is → ProblemDetailsFilter logs + 500s
};
```

Controller `wrap` helper:

```ts
const wrap = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (err) {
    throw mapDomainError(err);
  }
};
```

`ProblemDetailsFilter` (`apps/api/src/shared/exception.filter.ts`): registered globally as `{ provide: APP_FILTER, useClass: ProblemDetailsFilter }`. `type` URI: `https://resto.app/problems/<code-or-slugified-title>`. 5xx → `logger.error`, 4xx → `logger.warn`. Content-type: `application/problem+json`.

## 8. Cross-cutting middleware order

Configured in `AppModule.configure()`:

1. **`CorrelationMiddleware`** — reads `X-Correlation-Id` or generates UUID; binds via `withCorrelationId()` from `@resto/events`. Echoes the id on the response.
2. **`TenantContextMiddleware`** — resolves tenant from `X-Tenant-Slug` header, host, or dev fallback; binds via `runInTenantContext()` from `@resto/db`. Skipped on health endpoints.

Both middlewares receive `FastifyRequest['raw']` and `FastifyReply['raw']` (Fastify platform — not Express).

## 9. Default-deny auth + `@Public()`

`IdentityHttpModule` registers `{ provide: APP_GUARD, useClass: AuthGuard }` and `PermissionsGuard` globally — every route is protected by default.

`@Public()` (`interfaces/http/decorators/public.decorator.ts`) sets metadata key `identity:public`; `AuthGuard` skips the session check. Use `@Public()` only for truly unauthenticated routes (e.g. `GET /menu`). Internal operator endpoints use `InternalTokenGuard` instead.

`AuthGuard` resolves the BetterAuth session, builds a typed `Principal` (customer | operator | anonymous), and cross-checks the session's `activeOrganizationId` against the ALS-bound tenant.

## 10. Config injection

Inject typed `Env` via `ENV_TOKEN` — never use `ConfigService.get<T>()`:

```ts
@Inject(ENV_TOKEN) private readonly env: Env
```

`ConfigModule` (`apps/api/src/config/config.module.ts`) is `@Global()` — import it once at `AppModule` or at `BootstrapModule` for CLI contexts. Schema in `config/env.schema.ts` (Zod-validated via `loadEnv()`).

## 11. Test layout — Vitest only

| Kind | Location                                         |
| ---- | ------------------------------------------------ |
| Unit | `apps/api/test/unit/<context>/<service>.spec.ts` |
| E2E  | `apps/api/test/e2e/<context>.e2e.spec.ts`        |

Never place tests in `__tests__/` or next to source files. Import from `vitest` — no Jest.

Unit: instantiate services directly, mock with `vi.fn()`. No NestJS testing module needed.

E2E: `startRealStack()` from `test/e2e/with-real-stack.setup.ts` (Docker Compose + Fastify `inject()`). Guard with `const suite = isDockerAvailable() ? describe : describe.skip`.

## 12. Checklist — new bounded context

- [ ] Four dirs: `domain/`, `application/`, `infrastructure/`, `interfaces/http/`
- [ ] Domain errors extend `Error` — no NestJS in `domain/`
- [ ] Port symbols in `domain/ports.ts` (multi) or `application/ports/<name>.port.ts` (single)
- [ ] DTO in `application/dto.ts` — Zod schema + declaration-merged type
- [ ] `ZodValidationPipe` in `interfaces/http/zod-validation.pipe.ts`
- [ ] `mapDomainError` in `interfaces/http/error-mapping.ts`; `wrap()` helper in controller
- [ ] Single module unless CLI surface exists → then Core + Http split
- [ ] Every constructor param has explicit `@Inject(TOKEN)`
- [ ] `exports: []` only what other contexts actually need
- [ ] `APP_FILTER` registered once in `AppModule` only
- [ ] Tests in `test/unit/<context>/` and `test/e2e/<context>.e2e.spec.ts`

## 13. Red flags (hard fail in review)

- `import { SomeThing } from '@/contexts/tenancy/domain/...'` inside another context — cross-domain import without a port
- `@nestjs/config`'s `ConfigService.get<T>()` anywhere — use `@Inject(ENV_TOKEN)`
- Constructor param without `@Inject(TOKEN)` — DI will silently fail at runtime
- `class-validator` or `class-transformer` DTOs — Zod only
- Test files in `__tests__/` or next to source — wrong location
- `import { describe } from 'jest'` — Vitest only; no Jest imports
- Domain class importing from `@nestjs/*` or `drizzle-orm` — domain must stay framework-agnostic
- `NestFactory.create()` for a CLI standalone — use `createApplicationContext()`
- `APP_GUARD` registered inside a Core module — guards belong only in Http module

## 14. Self-test prompt

> "Add a `loyalty` context: read tenant names, expose POST /loyalty/points (internal), and add a CLI job to expire old points."

Expected answer: (1) four-dir layout; (2) Core+Http split because of CLI surface; (3) job module imports `LoyaltyCoreModule` via `createApplicationContext()`; (4) `TenantLookupPort` bridge for tenant names — no cross-domain import; (5) `ZodValidationPipe` on controller; (6) `mapDomainError` + `wrap()`; (7) internal endpoint uses `InternalTokenGuard`, not `@Public()`; (8) Vitest tests in `test/unit/loyalty/` and `test/e2e/loyalty.e2e.spec.ts`.

## 15. Sources

Verified against commit `841beea45cb25ba51f29fa45b7e272938d19b80a` on branch `res-106`. Authoritative ADRs: ADR-0001 (bounded context isolation), ADR-0002 (DDD layers).

Key files read (all under `apps/api/src/`):

- `contexts/identity/application/ports/tenant-lookup.port.ts`
- `contexts/identity/infrastructure/tenant-lookup.adapter.ts`
- `contexts/identity/{bootstrap,identity-core,identity-http}.module.ts`
- `contexts/identity/identity.tokens.ts`
- `contexts/identity/interfaces/http/guards/auth.guard.ts`
- `contexts/identity/interfaces/http/decorators/public.decorator.ts`
- `contexts/tenancy/tenancy.module.ts`, `contexts/catalog/catalog.module.ts`
- `contexts/tenancy/application/dto.ts`, `contexts/tenancy/domain/ports.ts`
- `contexts/tenancy/interfaces/http/{error-mapping,zod-validation.pipe}.ts`
- `shared/{exception.filter,correlation.middleware,tenant-context.middleware}.ts`
- `config/config.module.ts`
- `../test/unit/tenancy/provision-tenant.service.spec.ts`
- `../test/e2e/{tenancy.e2e.spec,with-real-stack.setup}.ts`
