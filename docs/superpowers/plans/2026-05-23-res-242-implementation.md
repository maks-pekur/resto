# RES-242 Implementation Plan — close `TenantsController.getMe` / `getMeDomains` RLS bypass

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the two operator-facing tenant reads (`getMe`, `getMeDomains`) off the `db.withoutTenant(...)` bypass and onto an ALS-bound, RLS-enforced `db.withTenant(...)` path, while leaving the six legitimate system-context callers of `repo.findById` / `repo.listDomains` untouched.

**Architecture:** Add two new methods to `TenantRepository` (`findCurrentTenant`, `listCurrentTenantDomains`) implemented via `db.withTenant`. Add matching `TenantQueriesService.getCurrentTenant` / `listCurrentTenantDomains`. Rewire the controller to call them. Cover with unit tests at the service layer (mocked repo) and integration tests at the repo layer (real Postgres testcontainer, executed inside the existing `tenants-controller.e2e.spec.ts` setup).

**Tech Stack:** NestJS 11 + Fastify, Drizzle ORM, Postgres 16 (RLS), `@resto/db` `TenantAwareDb`, Vitest, Testcontainers, ADR-0020 invariants I-1 + I-6.

**Spec:** `docs/superpowers/specs/2026-05-23-res-242-tenants-getme-rls-design.md`

---

## File map

**Modify:**

- `apps/api/src/contexts/tenancy/domain/ports.ts` — add 2 method signatures to `TenantRepository`.
- `apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts` — implement the 2 new methods via `db.withTenant`.
- `apps/api/src/contexts/tenancy/application/tenant-queries.service.ts` — add `getCurrentTenant` + `listCurrentTenantDomains`.
- `apps/api/src/contexts/tenancy/interfaces/http/tenants.controller.ts` — rewire `getMe` + `getMeDomains` to the new service methods.
- `apps/api/test/unit/tenancy/tenant-queries.service.spec.ts` — extend `buildRepo()` + add tests for the new service methods.
- `apps/api/test/e2e/tenants-controller.e2e.spec.ts` — add `describe('TenantDrizzleRepository — RLS enforcement (RES-242)')` block that exercises the new repo methods directly against the e2e Postgres testcontainer.

**No new files.** No changes to `packages/db/*` (the `db.withTenant` primitive already exists and is the right shape, per spec).

---

## Task 1 — Extend `TenantRepository` port + update test mock

**Files:**

- Modify: `apps/api/src/contexts/tenancy/domain/ports.ts:11-25`
- Modify: `apps/api/test/unit/tenancy/tenant-queries.service.spec.ts:8-16`

- [ ] **Step 1.1: Add 2 method signatures to the `TenantRepository` port**

Edit `apps/api/src/contexts/tenancy/domain/ports.ts`. Inside the `TenantRepository` interface, append after `listDomains(id)`:

```ts
  /**
   * Tenant-scoped read of the active tenant's own row. Reads from ALS;
   * implementations MUST use `db.withTenant` (not `withoutTenant`) so
   * Postgres RLS enforces the second layer of isolation. Throws if no
   * ALS tenant context is bound. Returns null if RLS filters the row
   * out (should be unreachable for a legitimate operator).
   */
  findCurrentTenant(): Promise<Tenant | null>;
  /**
   * Tenant-scoped list of the active tenant's domains. Same contract
   * as `findCurrentTenant`.
   */
  listCurrentTenantDomains(): Promise<readonly TenantDomain[]>;
```

- [ ] **Step 1.2: Update the unit-test repo mock so existing tests still compile**

Edit `apps/api/test/unit/tenancy/tenant-queries.service.spec.ts`. Extend `buildRepo()`:

```ts
const buildRepo = (): TenantRepository => ({
  findById: vi.fn(),
  findBySlug: vi.fn(),
  findByDomainHost: vi.fn(),
  save: vi.fn(),
  listDomains: vi.fn().mockResolvedValue([]),
  eraseTenant: vi.fn(),
  listScheduledForErasure: vi.fn().mockResolvedValue([]),
  findCurrentTenant: vi.fn(),
  listCurrentTenantDomains: vi.fn().mockResolvedValue([]),
});
```

- [ ] **Step 1.3: Verify the project still type-checks and existing unit tests pass**

Run: `pnpm exec nx run api:typecheck && pnpm --filter @resto/api exec vitest run test/unit/tenancy/tenant-queries.service.spec.ts`
Expected: typecheck PASS; all existing 9 service tests PASS (no behavior change yet).

- [ ] **Step 1.4: Commit**

```bash
git add apps/api/src/contexts/tenancy/domain/ports.ts apps/api/test/unit/tenancy/tenant-queries.service.spec.ts
git commit -m "refactor(api): add findCurrentTenant/listCurrentTenantDomains port methods (RES-242)"
```

---

## Task 2 — TDD `TenantQueriesService.getCurrentTenant`

**Files:**

- Modify: `apps/api/test/unit/tenancy/tenant-queries.service.spec.ts` (add new describe block at end)
- Modify: `apps/api/src/contexts/tenancy/application/tenant-queries.service.ts` (add method)

- [ ] **Step 2.1: Write the failing test**

Append to `apps/api/test/unit/tenancy/tenant-queries.service.spec.ts`:

```ts
describe('TenantQueriesService.getCurrentTenant', () => {
  let repo: TenantRepository;
  let service: TenantQueriesService;

  beforeEach(() => {
    repo = buildRepo();
    service = new TenantQueriesService(repo);
  });

  it('returns the snapshot read via repo.findCurrentTenant', async () => {
    const tenant = tenantFor('cafe-current');
    repo.findCurrentTenant = vi.fn().mockResolvedValue(tenant);
    const snap = await service.getCurrentTenant();
    expect(snap.slug).toBe('cafe-current');
    expect(repo.findCurrentTenant).toHaveBeenCalledTimes(1);
    expect(repo.findById).not.toHaveBeenCalled();
  });

  it('throws TenantNotFoundError when repo.findCurrentTenant returns null', async () => {
    repo.findCurrentTenant = vi.fn().mockResolvedValue(null);
    await expect(service.getCurrentTenant()).rejects.toBeInstanceOf(
      TenantNotFoundError,
    );
  });
});
```

- [ ] **Step 2.2: Run test, verify it fails**

Run: `pnpm --filter @resto/api exec vitest run test/unit/tenancy/tenant-queries.service.spec.ts`
Expected: 2 new tests FAIL — `service.getCurrentTenant is not a function`.

- [ ] **Step 2.3: Implement the service method**

Edit `apps/api/src/contexts/tenancy/application/tenant-queries.service.ts`. After the existing `findById` method (around line 49), add:

```ts
  /**
   * "My tenant" read for operator-facing `GET /v1/tenants/me`. Runs
   * under the active tenant context (`db.withTenant`), not the
   * system-context `withoutTenant` path used by `getById` /
   * `findById`. ADR-0020 I-1: RLS is the second layer underneath.
   */
  async getCurrentTenant(): Promise<TenantSnapshot> {
    const tenant = await this.repo.findCurrentTenant();
    if (!tenant) {
      throw new TenantNotFoundError('current');
    }
    return tenant.toSnapshot();
  }
```

- [ ] **Step 2.4: Run tests, verify green**

Run: `pnpm --filter @resto/api exec vitest run test/unit/tenancy/tenant-queries.service.spec.ts`
Expected: all service tests PASS (11 total — 9 original + 2 new).

- [ ] **Step 2.5: Commit**

```bash
git add apps/api/src/contexts/tenancy/application/tenant-queries.service.ts apps/api/test/unit/tenancy/tenant-queries.service.spec.ts
git commit -m "feat(api): TenantQueriesService.getCurrentTenant (RES-242)"
```

---

## Task 3 — TDD `TenantQueriesService.listCurrentTenantDomains`

**Files:**

- Modify: `apps/api/test/unit/tenancy/tenant-queries.service.spec.ts` (append)
- Modify: `apps/api/src/contexts/tenancy/application/tenant-queries.service.ts` (add method)

- [ ] **Step 3.1: Write the failing test**

Append to `apps/api/test/unit/tenancy/tenant-queries.service.spec.ts`:

```ts
describe('TenantQueriesService.listCurrentTenantDomains', () => {
  let repo: TenantRepository;
  let service: TenantQueriesService;

  beforeEach(() => {
    repo = buildRepo();
    service = new TenantQueriesService(repo);
  });

  it('returns the domains read via repo.listCurrentTenantDomains', async () => {
    const tenant = tenantFor('cafe-current-doms');
    repo.listCurrentTenantDomains = vi
      .fn()
      .mockResolvedValue([tenant.toSnapshot().primaryDomain]);
    const domains = await service.listCurrentTenantDomains();
    expect(domains).toHaveLength(1);
    expect(repo.listCurrentTenantDomains).toHaveBeenCalledTimes(1);
    expect(repo.findById).not.toHaveBeenCalled();
    expect(repo.listDomains).not.toHaveBeenCalled();
  });

  it('returns an empty array when the active tenant has no domain rows', async () => {
    repo.listCurrentTenantDomains = vi.fn().mockResolvedValue([]);
    await expect(service.listCurrentTenantDomains()).resolves.toEqual([]);
  });
});
```

- [ ] **Step 3.2: Run test, verify it fails**

Run: `pnpm --filter @resto/api exec vitest run test/unit/tenancy/tenant-queries.service.spec.ts`
Expected: 2 new tests FAIL — `service.listCurrentTenantDomains is not a function`.

- [ ] **Step 3.3: Implement the service method**

Edit `apps/api/src/contexts/tenancy/application/tenant-queries.service.ts`. After `getCurrentTenant`, add:

```ts
  /**
   * Domain rows for the active tenant — used by operator-facing
   * `GET /v1/tenants/me/domains`. Runs `db.withTenant`; ADR-0020 I-1.
   */
  async listCurrentTenantDomains(): Promise<readonly TenantDomain[]> {
    return this.repo.listCurrentTenantDomains();
  }
```

- [ ] **Step 3.4: Run tests, verify green**

Run: `pnpm --filter @resto/api exec vitest run test/unit/tenancy/tenant-queries.service.spec.ts`
Expected: all 13 service tests PASS.

- [ ] **Step 3.5: Commit**

```bash
git add apps/api/src/contexts/tenancy/application/tenant-queries.service.ts apps/api/test/unit/tenancy/tenant-queries.service.spec.ts
git commit -m "feat(api): TenantQueriesService.listCurrentTenantDomains (RES-242)"
```

---

## Task 4 — TDD `TenantDrizzleRepository.findCurrentTenant` (integration, real Postgres)

**Files:**

- Modify: `apps/api/test/e2e/tenants-controller.e2e.spec.ts` (add a `describe` block + bring `TENANT_REPOSITORY` + `runInTenantContext` into scope; do NOT modify existing tests)
- Modify: `apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts` (add method)

Note: this repo-level test runs against the existing testcontainer set up by the e2e file. We resolve the repo from the Nest container via `app.get(TENANT_REPOSITORY)`. We use `runInTenantContext` directly (test-only — same pattern as `packages/db/test/integration/tenant-isolation.spec.ts:54`) to bind ALS without going through HTTP.

- [ ] **Step 4.1: Extend imports + grab the repo handle**

Edit `apps/api/test/e2e/tenants-controller.e2e.spec.ts`. In the imports at the top, add:

```ts
import { runInTenantContext } from '@resto/db';
import {
  TENANT_REPOSITORY,
  type TenantRepository,
} from '../../src/contexts/tenancy/domain/ports';
```

- [ ] **Step 4.2: Write the failing repo-level tests**

Append a new `describe` block at the end of the file, INSIDE the outer `describe('TenantsController E2E')`:

```ts
// ---------------------------------------------------------------------------
// TenantDrizzleRepository — RLS enforcement (RES-242)
// ---------------------------------------------------------------------------
describe('TenantDrizzleRepository — RLS enforcement (RES-242)', () => {
  let repo: TenantRepository;
  let tenantA: { id: string; slug: string };
  let tenantB: { id: string; slug: string };

  beforeAll(async () => {
    repo = app.get<TenantRepository>(TENANT_REPOSITORY);
    const slugA = `repo-rls-a-${randomUUID().slice(0, 8)}`;
    const slugB = `repo-rls-b-${randomUUID().slice(0, 8)}`;
    tenantA = {
      ...(await provisionTenant(app, slugA, INTERNAL_TOKEN)),
      slug: slugA,
    };
    tenantB = {
      ...(await provisionTenant(app, slugB, INTERNAL_TOKEN)),
      slug: slugB,
    };
  });

  it('findCurrentTenant returns A when ALS is bound to A', async () => {
    const result = await runInTenantContext({ tenantId: tenantA.id }, () =>
      repo.findCurrentTenant(),
    );
    expect(result).not.toBeNull();
    expect(result?.toSnapshot().id).toBe(tenantA.id);
    expect(result?.toSnapshot().slug).toBe(tenantA.slug);
  });

  it('findCurrentTenant returns B when ALS is bound to B (cross-tenant isolation)', async () => {
    const result = await runInTenantContext({ tenantId: tenantB.id }, () =>
      repo.findCurrentTenant(),
    );
    expect(result?.toSnapshot().id).toBe(tenantB.id);
    expect(result?.toSnapshot().id).not.toBe(tenantA.id);
  });

  it('findCurrentTenant throws when called outside an ALS context', async () => {
    await expect(repo.findCurrentTenant()).rejects.toThrowError(
      /tenant context/i,
    );
  });
});
```

- [ ] **Step 4.3: Run e2e and verify it fails**

Run: `pnpm --filter @resto/api exec vitest run test/e2e/tenants-controller.e2e.spec.ts`
Expected: 3 new tests FAIL — `repo.findCurrentTenant is not a function`. Existing tests still PASS.

- [ ] **Step 4.4: Implement the repo method**

Edit `apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts`. Add `requireTenantContext` to the existing `@resto/db` import (currently `import { schema, TenantAwareDb, type RestoTx } from '@resto/db';`):

```ts
import {
  requireTenantContext,
  schema,
  TenantAwareDb,
  type RestoTx,
} from '@resto/db';
```

Then add the method right after the existing `findById` (around line 36, before `findBySlug`):

```ts
  async findCurrentTenant(): Promise<Tenant | null> {
    // requireTenantContext() runs here AND inside db.withTenant. Calling
    // explicitly first lets us hoist tenantId into the closure without
    // re-reading ALS inside the transaction callback.
    const { tenantId } = requireTenantContext();
    return this.db.withTenant(async (tx) =>
      this.loadByIdWithTx(tx, TenantId.parse(tenantId)),
    );
  }
```

The `loadByIdWithTx` already does `eq(tenants.id, id)` + `LIMIT 1` (existing lines 197-204). RLS policy `tenants_self_iso` (USING `is_system_session() OR id = current_tenant_id()`) provides the second layer.

- [ ] **Step 4.5: Run e2e and verify green**

Run: `pnpm --filter @resto/api exec vitest run test/e2e/tenants-controller.e2e.spec.ts`
Expected: all tests PASS, including 3 new RES-242 repo tests.

- [ ] **Step 4.6: Commit**

```bash
git add apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts apps/api/test/e2e/tenants-controller.e2e.spec.ts
git commit -m "feat(api): TenantDrizzleRepository.findCurrentTenant via db.withTenant (RES-242)"
```

---

## Task 5 — TDD `TenantDrizzleRepository.listCurrentTenantDomains` (integration)

**Files:**

- Modify: `apps/api/test/e2e/tenants-controller.e2e.spec.ts` (append to the RES-242 `describe` block)
- Modify: `apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts` (add method)

- [ ] **Step 5.1: Write the failing test**

Inside the `describe('TenantDrizzleRepository — RLS enforcement (RES-242)')` block created in Task 4, append:

```ts
it('listCurrentTenantDomains returns A domains only when ALS bound to A', async () => {
  const domainsA = await runInTenantContext({ tenantId: tenantA.id }, () =>
    repo.listCurrentTenantDomains(),
  );
  const domainsB = await runInTenantContext({ tenantId: tenantB.id }, () =>
    repo.listCurrentTenantDomains(),
  );
  expect(domainsA.length).toBeGreaterThan(0);
  expect(domainsA.every((d) => d.tenantId === tenantA.id)).toBe(true);
  expect(domainsA.every((d) => d.tenantId !== tenantB.id)).toBe(true);
  expect(domainsB.length).toBeGreaterThan(0);
  expect(domainsB.every((d) => d.tenantId === tenantB.id)).toBe(true);
});

it('listCurrentTenantDomains throws when called outside an ALS context', async () => {
  await expect(repo.listCurrentTenantDomains()).rejects.toThrowError(
    /tenant context/i,
  );
});
```

- [ ] **Step 5.2: Run e2e, verify fail**

Run: `pnpm --filter @resto/api exec vitest run test/e2e/tenants-controller.e2e.spec.ts`
Expected: 2 new tests FAIL — `repo.listCurrentTenantDomains is not a function`.

- [ ] **Step 5.3: Implement the repo method**

Edit `apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts`. Add after `listDomains` (around line 72):

```ts
  async listCurrentTenantDomains(): Promise<readonly TenantDomain[]> {
    const { tenantId } = requireTenantContext();
    return this.db.withTenant(async (tx) => {
      const rows = await tx
        .select()
        .from(schema.tenantDomains)
        .where(eq(schema.tenantDomains.tenantId, TenantId.parse(tenantId)));
      return rows.map(rowToTenantDomain);
    });
  }
```

`tenant_domains` RLS policy `tenant_domains_iso` (USING + WITH CHECK both bound to `current_tenant_id()`) provides the second layer.

- [ ] **Step 5.4: Run e2e, verify green**

Run: `pnpm --filter @resto/api exec vitest run test/e2e/tenants-controller.e2e.spec.ts`
Expected: all tests PASS.

- [ ] **Step 5.5: Commit**

```bash
git add apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts apps/api/test/e2e/tenants-controller.e2e.spec.ts
git commit -m "feat(api): TenantDrizzleRepository.listCurrentTenantDomains via db.withTenant (RES-242)"
```

---

## Task 6 — Rewire `TenantsController` to the new service methods

**Files:**

- Modify: `apps/api/src/contexts/tenancy/interfaces/http/tenants.controller.ts:33-61`

This task removes the only operator-path uses of `requireTenantContext()`-derived `tenantId` from the controller. The HTTP-layer authority now lives entirely in `@RequiresTenantContext()` (decorator) + `@Permissions(...)` (RBAC) + the ALS binding set by `TenantContextMiddleware` + RLS underneath. The existing e2e tests already cover the happy path + cross-tenant guard cases — they MUST keep passing after this change.

- [ ] **Step 6.1: Rewire `getMe` and `getMeDomains`**

Edit `apps/api/src/contexts/tenancy/interfaces/http/tenants.controller.ts`. Replace lines 33-61 with:

```ts
  async getMe(): Promise<TenantResponseDto> {
    try {
      return toResponse(await this.queries.getCurrentTenant());
    } catch (err) {
      throw mapDomainError(err);
    }
  }

  @Get('me/domains')
  @Permissions({ tenant: ['read'] })
  @RequiresTenantContext()
  @ApiOkResponse({ type: TenantDomainDto, isArray: true })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  async getMeDomains(): Promise<TenantDomainDto[]> {
    try {
      const domains = await this.queries.listCurrentTenantDomains();
      return domains.map((d) => ({
        id: d.id,
        domain: d.domain,
        kind: d.kind,
        isPrimary: d.isPrimary,
        verifiedAt: d.verifiedAt?.toISOString() ?? null,
      }));
    } catch (err) {
      throw mapDomainError(err);
    }
  }
```

(Keep the `@Get('me')` + decorators above `getMe` untouched — the diff is only the method body.)

- [ ] **Step 6.2: Remove the now-unused `requireTenantContext` import**

Check the top of the file. If `requireTenantContext` from `@resto/db` is no longer used (the controller no longer references it), remove it from the import:

Change `import { requireTenantContext } from '@resto/db';` to: delete that line entirely.

- [ ] **Step 6.3: Run the full e2e file to confirm nothing broke**

Run: `pnpm --filter @resto/api exec vitest run test/e2e/tenants-controller.e2e.spec.ts`
Expected: ALL tests PASS — the 4 RES-242 repo tests from Tasks 4 + 5, the existing `GET /me` / `GET /me/domains` happy paths, RES-191 missing-context, RES-126 cross-tenant guard, RES-127 archive pre-check.

- [ ] **Step 6.4: Commit**

```bash
git add apps/api/src/contexts/tenancy/interfaces/http/tenants.controller.ts
git commit -m "fix(api): TenantsController.getMe/getMeDomains use tenant-scoped reads (RES-242)"
```

---

## Task 7 — Full project verification before PR

**Files:** none modified.

- [ ] **Step 7.1: Run lint on the api project**

Run: `pnpm exec nx run api:lint`
Expected: PASS, no new warnings.

- [ ] **Step 7.2: Run typecheck on api**

Run: `pnpm exec nx run api:typecheck`
Expected: PASS.

- [ ] **Step 7.3: Run the full api unit + e2e test suites**

Run: `pnpm exec nx run api:test && pnpm exec nx run api:e2e`
Expected: all tests PASS.

- [ ] **Step 7.4: Confirm we did not accidentally regress related e2e suites**

Run: `pnpm --filter @resto/api exec vitest run test/e2e/menu-brand-response.e2e.spec.ts test/e2e/me-brands.e2e.spec.ts test/e2e/brand-host-resolution.e2e.spec.ts test/e2e/tenancy.e2e.spec.ts`
Expected: PASS — these touch tenant-context-bound reads and would be the most likely silent regressions.

- [ ] **Step 7.5: No commit (verification only).**

---

## PR preparation (after Task 7)

When opening the PR:

- **Title:** `fix(api): close TenantsController.getMe RLS bypass (RES-242)`
- **Body:** include the audit table from the spec (`Audit (for PR description)` section) verbatim. The audit answers AC #4 ("any other operator-facing endpoint using `withoutTenant` flagged in PR description"). The conclusion is that `getMe` + `getMeDomains` were the only operator-path bypasses; all other `withoutTenant` sites are system-context by design.
- Link the spec + plan + ADR-0020 I-1.
- Linear: move RES-242 → In Review with the PR attached.

---

## Self-review notes (for the executor)

- All 4 acceptance criteria from RES-242 are covered: AC1 + AC2 by Task 6 (controller no longer wraps in `withoutTenant`) + Tasks 4 + 5 (the explicit `eq(...)` filter is preserved in `loadByIdWithTx`); AC3 by Task 4's `findCurrentTenant` returns A when bound to A test + the existing RES-126 cross-tenant guard test that already protects the forged-header case; AC4 by the audit table prepared for the PR description.
- The spec's "out of scope" list (lint guard for `withoutTenant`, renaming `*System`, per-invariant metric, redundant ctx re-read) is intentionally not addressed here; if any of those land in this PR the scope creeps.
- `db.withTenant` is the existing primitive — no `@resto/db` changes needed; the `requireTenantContext` re-read inside the callback is avoided by capturing `tenantId` from the outer scope (mild improvement over the spec wording, same security property).
