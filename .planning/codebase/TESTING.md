# Testing Patterns

**Analysis Date:** 2026-05-24

## Test Framework

**Runner:**

- Vitest (all packages and apps)
- Config per project: `vitest.config.ts` in each app/package root
- `globals: false` — Vitest globals are NOT enabled; always import `describe`, `it`, `expect`, `vi`, `beforeAll`, `afterAll`, `beforeEach` from `vitest`

**Assertion library:**

- Vitest's built-in `expect` (Jest-compatible API)
- `@testing-library/jest-dom/vitest` used in `apps/admin` for DOM matchers (setup via `test/setup.ts`)

**Run commands:**

```bash
pnpm test                                    # Run all tests (Nx run-many)
pnpm test:e2e                                # Run all e2e tests (Nx run-many)
nx run @resto/db:test                        # Single package tests
nx run api:test                              # Single app tests
nx run api:e2e                               # Single app e2e tests
```

**Coverage:**

```bash
# Run with coverage (per project — add --coverage to vitest)
nx run @resto/db:test --coverage
nx run @resto/domain:test --coverage
```

## Test File Organization

**Location:**

- All tests in a dedicated `test/` directory at the project root, NOT co-located with source
- `apps/api/test/unit/` — unit tests mirroring `src/` structure
- `apps/api/test/e2e/` — full-stack end-to-end tests
- `apps/api/test/e2e/helpers/` — shared e2e fixtures and harness utilities
- `packages/db/test/unit/` — DB package unit tests
- `packages/db/test/integration/` — DB integration tests (Testcontainers)
- `packages/events/test/unit/` — event package unit tests
- `packages/events/test/integration/` — event integration tests
- `packages/domain/test/` — domain schema/value-object tests (flat, no subdirs)
- `apps/admin/test/` — Next.js server actions tests

**Naming:**

- `*.spec.ts` is the primary convention (`provision-tenant.service.spec.ts`, `tenant-isolation.spec.ts`)
- `*.test.ts` also recognized (both patterns in `include: ['test/**/*.{spec,test}.ts', 'src/**/*.{spec,test}.ts']`)
- E2E files: `<subject>.e2e.spec.ts`
- Setup files: `test/setup.ts` (per package)
- Harness: `with-real-stack.setup.ts`, `with-db-stack.ts`

**Structure:**

```
apps/api/
  test/
    unit/
      tenancy/
        provision-tenant.service.spec.ts
        tenant.aggregate.spec.ts
      catalog/
        upsert-category.service.spec.ts
      shared/
        exception.filter.spec.ts
        tenant-context.middleware.spec.ts
      identity/
        auth-guard.spec.ts
    e2e/
      tenancy.e2e.spec.ts
      cross-tenant-isolation.e2e.spec.ts
      helpers/
        operator-fixture.ts
        with-db-stack.ts
        docker-availability.ts
      with-real-stack.setup.ts

packages/db/
  test/
    setup.ts
    unit/
      context.spec.ts
      cli-reset-guards.spec.ts
    integration/
      tenant-isolation.spec.ts
      brands-rls.spec.ts
```

## Test Structure

**Suite organization:**

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('ProvisionTenantService', () => {
  let repo: TenantRepository;
  let service: ProvisionTenantService;

  beforeEach(() => {
    repo = buildRepo();
    service = new ProvisionTenantService(repo, stripeNoop);
  });

  it('saves a new aggregate with a TenantProvisioned event in the outbox', async () => { ... });
  it('returns the existing snapshot without saving when the slug is already active', async () => { ... });
  it('refuses to re-provision an archived slug', async () => { ... });
});
```

**Patterns:**

- `beforeEach` rebuilds mocks from a factory function — avoids state bleed between tests
- `beforeAll` / `afterAll` for expensive setup (Docker container start/stop)
- No `afterEach` for Docker teardown — containers persist for the whole suite, isolation by unique slugs

## Mocking

**Framework:** Vitest `vi.fn()`, `vi.mocked()`, `vi.mock()`

**Repository mock pattern (unit tests):**

```typescript
const buildRepo = (): TenantRepository => ({
  findById: vi.fn(),
  findBySlug: vi.fn().mockResolvedValue(null),
  findByDomainHost: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined),
  listDomains: vi.fn(),
  eraseTenant: vi.fn(),
  listScheduledForErasure: vi.fn().mockResolvedValue([]),
  findCurrentTenant: vi.fn(),
  listCurrentTenantDomains: vi.fn().mockResolvedValue([]),
});
```

- Repositories are NEVER mocked with `vi.mock()` module-level mock — always use factory functions returning typed implementations with `vi.fn()` stubs
- Services are instantiated directly with `new Service(repo, port)` — NestJS DI container is NOT used in unit tests
- `vi.mocked(mock.method).mock.calls[0]?.[0]` pattern for asserting call arguments

**Module mock pattern (Next.js admin tests):**

```typescript
const apiFetchMock = vi.fn();
vi.mock('@/lib/api-server', () => ({ apiFetch: apiFetchMock }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('REDIRECT');
  }),
}));
// Dynamic import AFTER vi.mock() calls (required for hoisting)
const { signUpAction } = await import('../app/signup/actions');
```

**What to mock:**

- Infrastructure adapters (repositories, external ports) in unit tests
- Next.js navigation helpers (`redirect`, `cookies`, `headers`) in action tests
- API fetch functions in Next.js action tests

**What NOT to mock:**

- The domain aggregate itself — test it directly
- Zod schemas — test by calling `.parse()` on real schemas
- `TenantAwareDb` in integration/e2e tests — use real DB from Testcontainers

## Test Harnesses

### Pattern A: Full stack (HTTP + DB + NATS) — `with-real-stack.setup.ts`

```typescript
// apps/api/test/e2e/with-real-stack.setup.ts
export const startRealStack = async (options = {}): Promise<RealStack> => {
  const [{ container: pg, ... }, { container: nats, ... }] = await Promise.all([
    startPostgres(), startNats()
  ]);
  // Provisions app role, runs migrations, builds NestJS app module
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(...));
  await app.init();
  return { pg, nats, app, databaseUrl, natsUrl };
};
```

Used for: full HTTP round-trip tests, tenant isolation regression, event pipeline

```typescript
// Test usage
beforeAll(async () => {
  stack = await startRealStack();
}, 180_000);

it('...', async () => {
  const res = await stack.app.inject({
    method: 'POST',
    url: '/internal/v1/tenants',
    headers: { 'x-internal-token': 'integration-test-token-1234567890' },
    payload: buildBody(slug),
  });
  expect(res.statusCode).toBe(201);
});
```

**Provider override support:**

```typescript
stack = await startRealStack({
  overrideProviders: [{ provide: IMAGE_URL_PORT, useValue: stubAdapter }],
});
```

### Pattern B: DB-only — `with-db-stack.ts`

```typescript
// apps/api/test/e2e/helpers/with-db-stack.ts
export const startDbStack = async (): Promise<DbStack> => {
  const pg = await new PostgreSqlContainer('postgres:16-alpine')...start();
  // Migrations + provision app role only — no NATS, no NestJS
  return { pg, db: new TenantAwareDb({ url: appUrl }), adminUrl, appUrl };
};
```

Used for: RLS tests, schema tests, role-grant tests that don't need HTTP

### Pattern C: `packages/db/test/setup.ts`

Similar to Pattern B — used by all `packages/db` integration tests. Shared via named exports:

```typescript
import {
  isDockerAvailable,
  startPostgres,
  stopPostgres,
  type TestPg,
} from '../setup';
```

## Docker-Skip Pattern

All integration/e2e suites that require Docker check availability at suite-level:

```typescript
import { execSync } from 'node:child_process';
const isDockerAvailable = (): boolean => {
  try { execSync('docker info', { stdio: 'ignore' }); return true; }
  catch { return false; }
};

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[suite-name] Docker not available — skipping integration tests.');
}

suite('...', () => { ... });
```

This is the canonical pattern in EVERY integration/e2e file. Tests skip cleanly in CI environments without Docker.

## Fixtures and Factories

**Isolated slug pattern (prevents cross-test DB collisions):**

```typescript
const freshSlug = (prefix: string): string => {
  const suffix = randomUUID().slice(0, 8);
  return `${prefix}-${suffix}`;
};

it('provisions a tenant', async () => {
  const slug = freshSlug('roma');  // e.g. 'roma-3f7a9c2b'
  ...
});
```

Rationale: `resto_app` role has no DELETE privilege — truncation between tests is not possible. Each test uses unique slugs for isolation.

**Shared fixture object pattern:**

```typescript
const baseInput = {
  slug: TenantSlug.parse('cafe-roma'),
  displayName: 'Cafe Roma',
  locale: 'en',
  defaultCurrency: Currency.parse('USD'),
};
```

**Operator fixture helpers** (`apps/api/test/e2e/helpers/operator-fixture.ts`):

```typescript
export const provisionTenant = async (app, slug, internalToken): Promise<TenantFixture>
export const runBootstrap = async ({ tenantSlug, email, password, name }): Promise<BootstrapResult>
export const signIn = async (app, email, password): Promise<string>  // returns cookie
export const signInAsOperator = async (app, email, password, tenantId): Promise<string>
```

**Env stub pattern (unit tests with Env):**

```typescript
const baseEnv = (overrides: Partial<Env> = {}): Env => ({
  NODE_ENV: 'production',
  // ... all required fields ...
  ...overrides,
});
```

## Tenancy in Tests

**Unit tests — `runInTenantContext` wrapper:**

```typescript
import { runInTenantContext } from '@resto/db';

const result = await runInTenantContext({ tenantId: TENANT_ID }, () =>
  service.execute(baseInput),
);
```

This is the ONLY place outside HTTP middleware that `runInTenantContext` is allowed. Test files have `no-restricted-imports` turned off for this purpose.

**Integration tests — `db.withTenant` / `db.withoutTenant`:**

```typescript
// Read as a specific tenant
const rows = await runInTenantContext({ tenantId: tenantA }, () =>
  pg.db.withTenant(async (tx) => tx.select().from(schema.tenants))
);

// System-context read (bypasses RLS)
await db.withoutTenant('seed two tenants', async (tx) => {
  await tx.insert(schema.tenants).values({ slug: 'cafe-a', ... });
});
```

## Coverage

**Configuration (per project):**

```typescript
coverage: {
  provider: 'v8',
  include: ['src/**/*.ts'],
  exclude: ['src/cli/**', 'src/**/*.d.ts'],
  reporter: ['text', 'lcov'],
}
```

**Requirements:**

- No numeric coverage threshold enforced globally
- `packages/db/vitest.config.ts` MUST NOT exclude `src/cli/**` — safety-critical CLI scripts require coverage
- Canonical regression requirements by area:
  - Every tenant-scoped table must have an entry in `packages/db/test/integration/tenant-isolation.spec.ts`
  - Every value-object schema in `packages/domain` must have a unit test covering happy and rejection cases
  - `packages/events/test/integration/run-deduped.spec.ts` must cover rollback semantics

## Test Types

**Unit tests** (`test/unit/`):

- Scope: single service/handler/middleware/guard in isolation
- NestJS DI is bypassed — services instantiated directly
- All I/O mocked with `vi.fn()` factories
- Timeout: default (5s)
- Examples: `apps/api/test/unit/tenancy/`, `apps/api/test/unit/shared/`

**Integration tests** (`packages/*/test/integration/`):

- Scope: real Postgres via Testcontainers + real Drizzle queries
- Tests RLS policies, composite FKs, role grants, outbox round-trips
- Timeout: 60s–90s (container startup)
- Examples: `packages/db/test/integration/`, `packages/events/test/integration/`

**E2E tests** (`apps/api/test/e2e/`):

- Scope: full NestJS app + real Postgres + real NATS via Testcontainers
- Uses `stack.app.inject()` (Fastify injection) for HTTP requests — no real TCP port
- Timeout: 60s per test, 180s for `beforeAll`
- Examples: `apps/api/test/e2e/tenancy.e2e.spec.ts`, `apps/api/test/e2e/cross-tenant-isolation.e2e.spec.ts`

**Frontend unit tests** (`apps/admin/test/`):

- Scope: Next.js server actions, utility functions
- Mocks: `vi.mock()` for `@/lib/api-server`, `next/navigation`, `next/headers`
- Setup: `test/setup.ts` installs `@testing-library/jest-dom` matchers and cleans up after each test
- Uses dynamic import after `vi.mock()` calls for correct hoisting

## Common Patterns

**Async testing:**

```typescript
it('...', async () => {
  await expect(service.execute(input)).rejects.toBeInstanceOf(
    TenantSlugArchivedError,
  );
  expect(repo.save).not.toHaveBeenCalled();
});
```

**Error testing:**

```typescript
// Domain error rejection
await expect(service.execute(baseInput)).rejects.toBeInstanceOf(
  TenantSlugArchivedError,
);

// Schema rejection (synchronous throws)
expect(() => MoneyAmount.parse('1.234')).toThrow();

// HTTP status assertion (e2e)
expect(res.statusCode).toBe(409);
expect(res.json<{ detail: string }>().detail).toMatch(/archived/i);
```

**`it.each` for value-object tests:**

```typescript
it.each(['0', '0.0', '12', '12.34'])('accepts %s', (v) => {
  expect(MoneyAmount.parse(v)).toBe(v);
});
it.each(['-1', '0.123', 'abc'])('rejects %s', (v) => {
  expect(() => MoneyAmount.parse(v)).toThrow();
});
```

**Asserting spy call arguments:**

```typescript
const saveMock = vi.mocked(repo.save);
const tenantArg = saveMock.mock.calls[0]?.[0];
expect(tenantArg).toBeDefined();
const events = tenantArg?.pullEvents() ?? [];
expect(events).toHaveLength(1);
```

**Describe.skip for unavailable infrastructure:**

```typescript
const suite = dockerOk ? describe : describe.skip;
suite('Row-Level Security — tenant isolation', () => { ... });
```

---

_Testing analysis: 2026-05-24_
