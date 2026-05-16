---
name: resto-e2e-with-rls
description: Authoritative recipe for Resto API e2e tests. Two harness patterns (full stack via startRealStack vs inline testcontainer), tenant context flow via x-tenant-slug header (NOT direct ALS calls), system-context reads via withoutTenant for assertions, mandatory cross-tenant isolation tests, Vitest singleFork constraints. Load when writing or debugging any e2e under apps/api/test/e2e/.
when_to_use: |
  - Writing a new e2e spec under apps/api/test/e2e/.
  - Debugging an e2e where rows "exist but cannot be read" (likely RLS).
  - Adding cross-tenant isolation coverage for a feature.
  - Reviewing a PR that adds or modifies an e2e spec.
status: active
---

# Resto API — E2E Testing with RLS

Resto's API e2e tests exercise the full request path from Fastify through NestJS middleware, application services, Drizzle ORM, and PostgreSQL 16 with Row-Level Security enabled. The two harness patterns correspond to whether the test also exercises the NATS outbox chain (ADR-0006). Harness files live under `apps/api/test/e2e/`.

## Two harness patterns

### Pattern A — full stack (`startRealStack`) — use when NATS is required

Use when the scenario must verify the outbox → NATS publish chain, or when you want to share one container set across many test files (e.g. the main catalog suite).

```ts
import {
  startRealStack,
  stopRealStack,
  isDockerAvailable,
  type RealStack,
} from './with-real-stack.setup';

const suite = isDockerAvailable() ? describe : describe.skip;

suite('my feature', () => {
  let stack: RealStack;
  beforeAll(async () => {
    stack = await startRealStack();
  }, 180_000);
  afterAll(async () => {
    await stopRealStack(stack);
  });

  it('does the thing', async () => {
    const res = await stack.app.inject({
      method: 'GET',
      url: '/v1/...',
      headers: { 'x-tenant-slug': 'cafe-a' },
    });
    expect(res.statusCode).toBe(200);
  });
});
```

`RealStack` shape: `{ pg: StartedPostgreSqlContainer, nats: StartedTestContainer, app: NestFastifyApplication, databaseUrl, natsUrl }`. Starts `postgres:16-alpine` + `nats:2.10-alpine` concurrently, runs Drizzle migrations, calls `provisionAppRole()`, bootstraps `AppModule`.

### Pattern B — inline testcontainer — use when NATS is unneeded

Use when the test exercises a specific module in isolation (e.g. `BootstrapModule`) or when avoiding NATS overhead. Wire the container manually in `beforeAll`.

```ts
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { provisionAppRole, provisionAuthRole } from '@resto/db';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16').start();
  const adminClient = postgres(container.getConnectionUri());
  await provisionAppRole(adminClient, { appPassword: APP_PASSWORD });
  await provisionAuthRole(adminClient, { authPassword: AUTH_PASSWORD }); // only if Better Auth involved
  await migrate(drizzle(adminClient), { migrationsFolder: MIGRATIONS_DIR });
  await adminClient.end();
  // set process.env.DATABASE_URL, NATS_DISABLED=true, etc. then bootstrap AppModule
}, 180_000);
```

Existing examples by pattern:

- **A:** `tenancy.e2e.spec.ts` (outbox→NATS chain)
- **B:** `catalog.e2e.spec.ts`, `identity-smoke.e2e.spec.ts`, `identity-bootstrap.e2e.spec.ts`, `tenants-controller.e2e.spec.ts`
- **Special:** `health.e2e.spec.ts` — pure stub `TenantAwareDb`, no containers (trivial endpoints only)

## Tenant context flow — through middleware ONLY

**Rule, not convention:** tests never call `runInTenantContext()` or manipulate AsyncLocalStorage directly. This is forbidden.

Tenant context binds through `TenantContextMiddleware`, which reads the `x-tenant-slug` request header, resolves the tenant id from the DB, and wraps the request in `runInTenantContext()`. Tests drive tenant context by setting the header on `app.inject()`:

```ts
// Public tenant-scoped endpoint
await stack.app.inject({
  method: 'GET',
  url: '/v1/menu/items/123',
  headers: { 'x-tenant-slug': 'cafe-a' },
});

// Internal-only endpoint: needs both slug AND internal token
await stack.app.inject({
  method: 'POST',
  url: '/internal/v1/catalog/categories',
  headers: { 'x-tenant-slug': 'cafe-a', 'x-internal-token': INTERNAL_TOKEN },
  payload: { slug: 'drinks', name: { en: 'Drinks' } },
});
```

The `INTERNAL_API_TOKEN` env var is set to a fixed test value when the stack starts (e.g. `'integration-test-token-1234567890'` in `with-real-stack.setup.ts`). Pattern B specs set their own unique value in `process.env.INTERNAL_API_TOKEN`.

## System-context reads for assertions

To verify that a row actually persisted (or inspect the outbox), use `TenantAwareDb.withoutTenant()`. This is the only sanctioned bypass of RLS. The `reason` string is required and non-empty (logged at WARN level).

```ts
// apps/api/test/e2e/tenancy.e2e.spec.ts (lines 80-101)
const db = stack.app.get(TenantAwareDb);

const tenants = await db.withoutTenant('inspect tenants', (tx) =>
  tx.select().from(schema.tenants).where(eq(schema.tenants.id, body.id)),
);
expect(tenants).toHaveLength(1);

const outboxRows = await db.withoutTenant('inspect outbox', (tx) =>
  tx
    .select()
    .from(schema.outboxEvents)
    .where(eq(schema.outboxEvents.tenantId, body.id)),
);
expect(outboxRows).toHaveLength(1);
```

Do not use `withoutTenant` to drive application reads — only for assertions after a write.

## Tenant fixtures

All helpers live in `apps/api/test/e2e/helpers/operator-fixture.ts`.

| Helper             | Signature                                                   | When to use                                                                                                                                            |
| ------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `provisionTenant`  | `(app, slug, internalToken) → TenantFixture`                | Create a tenant row via internal HTTP. Returns `{ id, slug }`.                                                                                         |
| `runBootstrap`     | `({ tenantSlug, email, password, name }) → BootstrapResult` | Spins up a standalone `BootstrapModule` context and runs `BootstrapOwnerService`. Returns `{ tenantId, userId }`. Use when a test needs an owner user. |
| `signIn`           | `(app, email, password) → cookie`                           | POST to `/api/auth/sign-in/email`, returns session cookie string.                                                                                      |
| `signInAsOperator` | `(app, email, password, tenantId) → cookie`                 | `signIn` + sets active organization. Returns updated session cookie.                                                                                   |
| `extractCookies`   | `(setCookie) → string`                                      | Strips cookie attributes from `Set-Cookie` headers; produces a `Cookie` header value.                                                                  |

For unique slugs per test, append a short UUID suffix inline — helpers do not auto-uniquify:

```ts
import { randomUUID } from 'node:crypto';
const slug = `cafe-${randomUUID().slice(0, 8)}`;
```

## Cross-tenant isolation — mandatory

**Every bounded context that exposes a per-resource GET endpoint must have at least one cross-tenant isolation test.** RLS is the second line of defense; this test is the first.

**Canonical example — `apps/api/test/e2e/catalog.e2e.spec.ts` lines 191-222:**

1. Provision tenant A, POST a resource with `x-tenant-slug: cafe-a` (+ internal token).
2. Capture the resource id from the response.
3. GET the same id with `x-tenant-slug: cafe-b`.
4. Assert `statusCode === 404` — RLS rejects the row, the controller surfaces 404.

Skeleton for new contexts:

```ts
it("tenant B cannot read tenant A's <resource> (RLS gate)", async () => {
  const slug = `cafe-${randomUUID().slice(0, 8)}`;
  const slugB = `cafe-${randomUUID().slice(0, 8)}`;
  const authA = { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': slug };

  // Arrange: provision tenants
  await provisionTenant(stack.app, slug, INTERNAL_TOKEN);
  await provisionTenant(stack.app, slugB, INTERNAL_TOKEN);

  // Act: write resource as tenant A
  const createRes = await stack.app.inject({
    method: 'POST',
    url: '/internal/v1/<resource>',
    headers: authA,
    payload: {
      /* ... */
    },
  });
  const { id } = createRes.json<{ id: string }>();

  // Assert: tenant B cannot see it
  const sniff = await stack.app.inject({
    method: 'GET',
    url: `/v1/<resource>/${id}`,
    headers: { 'x-tenant-slug': slugB },
  });
  expect(sniff.statusCode).toBe(404);
}, 60_000);
```

## Vitest gotchas

- `pool: 'forks'` + `poolOptions.forks.singleFork: true` — all spec files run sequentially in one forked process. Prevents testcontainer port collisions and `process.env` races. Never override this.
- Default `testTimeout` and `hookTimeout`: `30_000` ms. Always override `beforeAll` to `180_000` ms when spinning up containers.
- No `setupFiles`. Each spec file bootstraps its own containers/app.
- Run commands:
  ```bash
  nx run api:e2e
  # or from apps/api/:
  pnpm vitest run test/e2e
  ```
- Cold container startup: 3–6 minutes on a laptop. `isDockerAvailable()` guards Pattern A suites with `describe.skip` when Docker is absent.

## Idempotency

Every `it` must pass alone, in full suite order, and on re-run without manual cleanup. Achieve this by:

- UUID-suffixed slugs per test (not per suite): `cafe-${randomUUID().slice(0, 8)}`.
- No shared mutable state between `it` blocks beyond what `beforeAll` sets up.
- No post-test truncation — rely on slug uniqueness, not table cleanup.
- Pattern B specs use unique passwords per file to avoid credential collisions across parallel-run scenarios.

## Checklist — adding a new e2e spec

- [ ] Chosen the right pattern: A (need NATS) or B (don't need NATS).
- [ ] `beforeAll` timeout set to `180_000` ms when starting containers.
- [ ] Tenant context flows via `x-tenant-slug` header — no direct ALS calls.
- [ ] Internal endpoints use `x-internal-token` header with the fixture token value.
- [ ] System-context assertions use `db.withoutTenant(reason, op)` with a descriptive reason string.
- [ ] All slugs are UUID-suffixed for idempotency.
- [ ] Cross-tenant isolation `it` block present for every per-resource GET endpoint.
- [ ] `isDockerAvailable()` guard applied if using Pattern A.
- [ ] File placed in `apps/api/test/e2e/<context>.e2e.spec.ts` (flat, no subdirs).
- [ ] `nx run api:e2e` passes locally before PR.

## Red flags (hard fail in review)

- `runInTenantContext()` called directly in test code.
- AsyncLocalStorage set or read from test scope.
- `setupTenantPg()`, `withTenantContext()`, or `freshTenant()` — these helpers do not exist; their presence means copy-paste from wrong source.
- `beforeAll` with container startup and no timeout override (will hit the 30s default and flake).
- Cross-tenant isolation test absent for a context that exposes per-resource GET.
- `db.withoutTenant()` called with an empty reason string.
- Any `it` block that relies on state written by a previous `it` (ordering dependency).
- Raw `process.env.INTERNAL_API_TOKEN` access inside a test assertion (use the local `INTERNAL_TOKEN` constant).

## Self-test

Load this skill and ask: "Show me how to write an e2e spec for a new `reservations` context that provisions two tenants, creates a reservation under tenant A, and asserts tenant B gets 404."

---

## Sources

- SHA `841beea45cb25ba51f29fa45b7e272938d19b80a` (D1 research snapshot)
- ADR-0006 — outbox/NATS event pattern (`docs/adr/0006-*.md`)
- `apps/api/test/e2e/with-real-stack.setup.ts` — Pattern A harness implementation
- `apps/api/test/e2e/helpers/operator-fixture.ts` — canonical tenant/auth fixtures
- `apps/api/test/e2e/catalog.e2e.spec.ts` lines 191-222 — cross-tenant isolation gold standard
