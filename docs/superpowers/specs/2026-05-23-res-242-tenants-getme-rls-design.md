---
ticket: RES-242
adr: 0020 (I-1), 0021 (Tier 1 — Multi-tenancy)
status: proposed
date: 2026-05-23
scope:
  - apps/api/src/contexts/tenancy/domain/ports.ts (add 2 port methods)
  - apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts (implement them, no withoutTenant)
  - apps/api/src/contexts/tenancy/application/tenant-queries.service.ts (add 2 service methods)
  - apps/api/src/contexts/tenancy/interfaces/http/tenants.controller.ts (rewire getMe + getMeDomains)
  - apps/api/test/e2e/tenants-controller.e2e.spec.ts (extend with 2 RLS-layer tests)
  - apps/api/test/integration/tenancy/tenant-drizzle.repository.spec.ts (new)
---

# RES-242 — close `TenantsController.getMe` / `getMeDomains` RLS bypass

## Context

ADR-0020 invariant I-1: **every repository read/write must explicitly filter
by `eq(table.tenantId, ctx.tenantId)`; Postgres RLS is the second line of
defense, not the first.**

`TenantsController.getMe` is an operator-facing endpoint (`GET /v1/tenants/me`)
whose entire purpose is "return the caller's own tenant row." Today the read
goes through `TenantDrizzleRepository.findById`, which wraps `loadByIdWithTx`
in `db.withoutTenant(...)`:

```ts
// apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts:193-195
private loadById(id: TenantId): Promise<Tenant | null> {
  return this.db.withoutTenant('tenancy.findById', (tx) => this.loadByIdWithTx(tx, id));
}
```

`withoutTenant` sets `app.is_system = true` (and clears `app.current_tenant`),
which causes the `tenants_self_iso` RLS policy
(`packages/db/migrations/0001_rls_policies.sql:56-57`):

```sql
USING (is_system_session() OR id = current_tenant_id())
```

to short-circuit on `is_system_session()` and return any row matching the
explicit `eq(tenants.id, id)` filter — regardless of which tenant is "the
operator." The same bypass exists for `getMeDomains`, which routes through
`repo.findById` (again) and `repo.listDomains` (also `withoutTenant`).

**Impact:** any code path that miscomputes the `tenantId` the controller
hands to `TenantQueriesService.getById` would leak the foreign tenant's row.
Today the cross-tenant `AuthGuard` (RES-126) blocks the simplest forged-header
cases, but a future bug in the guard or in the resolver would have nothing
underneath to catch it. Per ADR-0020 we are not supposed to rely on the auth
layer alone for tenant isolation.

`repo.findById` also has six legitimate system-context callers (tenant
resolver, AuthGuard cross-check, internal archive / offboard / provision /
bootstrap). They all need `withoutTenant` and must keep working. So the fix
is not "remove `withoutTenant` from `findById`" — it is "add a tenant-scoped
read path that operator endpoints use instead."

## Goals (acceptance criteria from RES-242)

1. `TenantsController.getMe` no longer reads through a `withoutTenant` code path.
2. The read is explicitly filtered by the active tenant id (`eq(tenants.id, ctx.tenantId)`)
   with `LIMIT 1`; RLS provides the second layer.
3. E2E: operator authenticated for tenant A → `GET /me` returns A; the RLS
   layer (not just the auth guard) rejects the foreign-row case.
4. PR description includes a list of every other operator-adjacent
   `withoutTenant` site we audited (search-and-list, not necessarily fix).

The same treatment applies to `getMeDomains` (identical bypass class, same
controller, same review). Scope confirmed in brainstorming.

## Design

### Repository port (`apps/api/src/contexts/tenancy/domain/ports.ts`)

Add two methods to `TenantRepository`:

```ts
/**
 * Tenant-scoped read of the active tenant's own row. Reads from ALS via
 * the implementation's `db.withTenant` call; throws if no tenant context
 * is bound. Returns null if RLS filters the row out — should be
 * unreachable for a legitimate operator, treated as not-found by the
 * service layer.
 */
findCurrentTenant(): Promise<Tenant | null>;

/** Tenant-scoped list of the active tenant's domains. Same contract. */
listCurrentTenantDomains(): Promise<readonly TenantDomain[]>;
```

Existing methods (`findById`, `findBySlug`, `findByDomainHost`, `save`,
`listDomains`, `eraseTenant`, `listScheduledForErasure`) are **unchanged** —
all six system-callers keep their `withoutTenant` semantics.

### Repository implementation (`apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts`)

Both new methods use `db.withTenant(op)`, which:

- Calls `requireTenantContext()` internally (throws if no ALS-bound context).
- Binds `app.current_tenant` via the `app_bind_tenant` SECURITY DEFINER
  wrapper (RES-243).
- Asserts no GUC drift at end-of-callback (RES-243 defense B).

```ts
async findCurrentTenant(): Promise<Tenant | null> {
  return this.db.withTenant(async (tx) => {
    // ALS-bound id; redundant filter per ADR-0020 I-1 (explicit + RLS).
    // requireTenantContext() already ran inside withTenant — this is a
    // re-read of the same value for the explicit predicate.
    const { tenantId } = requireTenantContext();
    return this.loadByIdWithTx(tx, TenantId.parse(tenantId));
  });
}

async listCurrentTenantDomains(): Promise<readonly TenantDomain[]> {
  return this.db.withTenant(async (tx) => {
    const { tenantId } = requireTenantContext();
    const rows = await tx
      .select()
      .from(schema.tenantDomains)
      .where(eq(schema.tenantDomains.tenantId, TenantId.parse(tenantId)));
    return rows.map(rowToTenantDomain);
  });
}
```

Notes:

- `tenants` table is special — `id` IS the tenant id, not a `tenant_id` FK.
  `ScopedTx.selectFrom` cannot be used here (it auto-filters by
  `table.tenantId`, which `tenants` does not have). We use raw `tx` with the
  explicit `eq(tenants.id, ctx.tenantId)` filter that `loadByIdWithTx`
  already provides.
- `tenant_domains` has `tenant_id` and could in principle use `ScopedTx`,
  but the existing `rowToTenantDomain` mapper already takes the raw row
  shape; we keep the raw `tx.select().from().where()` for consistency
  with `loadByIdWithTx` and to avoid churn.
- The redundant `requireTenantContext()` inside the `withTenant` callback
  exists only to extract the id for the explicit filter; `withTenant`
  itself already enforced presence. If `db.withTenant` is ever extended to
  expose the bound id directly (e.g. `withTenant((tx, ctx) => ...)`), this
  redundancy goes away.

### Application service (`apps/api/src/contexts/tenancy/application/tenant-queries.service.ts`)

Add two methods, leave the existing system-context ones untouched:

```ts
/**
 * "My tenant" read, used by operator-facing GET /v1/tenants/me.
 * Throws TenantNotFoundError if RLS yields nothing (operator with a
 * context for a tenant whose row was erased mid-request).
 */
async getCurrentTenant(): Promise<TenantSnapshot> {
  const tenant = await this.repo.findCurrentTenant();
  if (!tenant) throw new TenantNotFoundError('current');
  return tenant.toSnapshot();
}

async listCurrentTenantDomains(): Promise<readonly TenantDomain[]> {
  return this.repo.listCurrentTenantDomains();
}
```

The existing `getById(rawId)` / `findById(rawId)` / `listDomains(rawId)`
methods stay — they serve the system-context callers (identity bootstrap,
auth guard, internal admin endpoints). Renaming them to `*System` for
clarity is a separate refactor (out of scope; would be pure churn).

### Controller (`apps/api/src/contexts/tenancy/interfaces/http/tenants.controller.ts`)

Both endpoints stop dereferencing `tenantId`:

```ts
@Get('me')
@Permissions({ tenant: ['read'] })
@RequiresTenantContext()
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

The controller no longer extracts `tenantId` from `requireTenantContext()` —
removing the only line in the operator path that could pass a forged id to
the service. Authority moves entirely to the ALS binding that
`TenantContextMiddleware` set, plus the RLS layer underneath.

`@RequiresTenantContext()` decorator stays (asserts the middleware ran);
`@Permissions({ tenant: ['read'] })` stays (RBAC).

## Tests

### E2E — extend `apps/api/test/e2e/tenants-controller.e2e.spec.ts`

Existing coverage stays (RES-126 cross-tenant guard, RES-127 archive
pre-check, RES-191 missing context, basic happy path, `me/domains` happy
path). Add a new `describe('RLS enforcement (RES-242)')` block:

1. **`returns 404 (or 403 archived) when the operator's tenant row was
erased / archived mid-request`** — Provision tenant A, sign in
   operator, archive A via the internal admin endpoint (already covered
   in the existing RES-127 test for archived), then `GET /me`. The
   assertion: the operator never receives a foreign tenant's snapshot.
   Exact status code depends on which guard fires first (archive
   pre-check or the new RLS-layer null result) — both outcomes are
   correct for the security contract this PR establishes. Planning
   confirms the precise status; the test asserts the security property,
   not a specific code path.

2. **`returns 404 if a request is forced to a non-member tenant's id at the
repo layer`** — Direct repo-level harness (not HTTP): bind ALS to tenant
   A, call a debug helper that asks the repo for tenant B's row via the
   old `findById` path → succeeds (system context). Then call
   `findCurrentTenant()` → returns A's row, never B's. Confirms the new
   port honors ALS.

Test (2) overlaps with the integration suite below — if it's cleaner there,
drop the e2e version and keep only the erasure case.

### Integration — new file `apps/api/test/integration/tenancy/tenant-drizzle.repository.spec.ts`

Follows the pattern of `packages/db/test/integration/tenant-isolation.spec.ts`
(Postgres testcontainer + Drizzle migrations + role provisioning). Cases:

- **ALS bound to A → `findCurrentTenant()` returns A's snapshot.** Positive
  control.
- **ALS bound to A, manual `UPDATE tenants` to swap row id to B's value
  inside `withoutTenant` → ALS bound to A → `findCurrentTenant()` returns
  null.** Demonstrates RLS filters the foreign-id row.
- **No ALS context → `findCurrentTenant()` throws via
  `requireTenantContext()`.**
- **ALS bound to A → `listCurrentTenantDomains()` returns A's domains
  only; B's domains never leak.**
- **No ALS context → `listCurrentTenantDomains()` throws.**

This file becomes the canonical regression net for the two new port
methods. Future tenant-scoped repo additions follow the same template.

### Acceptance criteria mapping (verbatim from RES-242)

- [x] `TenantsController.getMe` no longer wraps the read in `withoutTenant`
      — controller calls `queries.getCurrentTenant()`; repo uses
      `db.withTenant`.
- [x] Repository read is filtered by `eq(tenants.id, ctx.tenantId)` and
      asserts on `LIMIT 1` — preserved in `loadByIdWithTx` (filter on line 201,
      `.limit(1)` on line 202).
- [x] e2e test: operator A authenticated → `GET /me` returns A; operator A
      forged → 404 not B's row — existing RES-126 test covers the auth-guard
      layer; new RES-242 RLS-enforcement test covers the repo layer.
- [x] Audit: every other operator-adjacent `withoutTenant` site flagged in
      PR description — list in PR description section below.

## Audit (for PR description)

Every current `withoutTenant` call in `apps/api/src/`, classified:

| Site                                                                                | Role                                                    | Status                       |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------- |
| `tenancy/infrastructure/tenant-drizzle.repository.ts:39` `findBySlug`               | System (host resolution, bootstrap)                     | Keep as-is                   |
| `tenancy/infrastructure/tenant-drizzle.repository.ts:52` `findByDomainHost`         | System (public/host resolution)                         | Keep as-is                   |
| `tenancy/infrastructure/tenant-drizzle.repository.ts:65` `listDomains`              | Operator (was) → covered by `listCurrentTenantDomains`  | RES-242 (this PR)            |
| `tenancy/infrastructure/tenant-drizzle.repository.ts:78` `save`                     | System (admin / internal write)                         | Keep as-is                   |
| `tenancy/infrastructure/tenant-drizzle.repository.ts:139` `listScheduledForErasure` | System (background job)                                 | Keep as-is                   |
| `tenancy/infrastructure/tenant-drizzle.repository.ts:158` `eraseTenant`             | System (admin / internal write)                         | Keep as-is                   |
| `tenancy/infrastructure/tenant-drizzle.repository.ts:194` `findById`                | System (resolver / guard / internal endpoints)          | Keep as-is                   |
| `tenancy/infrastructure/brand-drizzle.repository.ts:33` `findByDomainHost`          | System (public host resolution)                         | Keep as-is                   |
| `tenancy/infrastructure/brand-drizzle.repository.ts:56` `findBySlug`                | System (public slug resolution)                         | Keep as-is                   |
| `tenancy/infrastructure/brand-drizzle.repository.ts:158` `findActiveSlugsByPrefix`  | System (platform-wide slug availability)                | Keep as-is                   |
| `identity/infrastructure/identity-event-emitter.adapter.ts:16`                      | BA hook — `withoutTenant` for cross-tenant emitter path | Shipped via RES-240          |
| `audit/application/record-audit.service.ts:27`                                      | NATS consumer (audit)                                   | Keep as-is (system consumer) |

**No other operator-facing `withoutTenant` reads exist today.** `getMe` and
`getMeDomains` were the only operator-path bypasses; both are closed in
this PR.

## Out of scope (follow-ups, noted in PR description, not new tickets unless requested)

- ESLint guard restricting `withoutTenant` to an explicit allowlist —
  overlaps RES-235e (withoutTenant allowlist mechanism, deferred).
- Renaming the system-context `findById` / `getById` / `listDomains` →
  `*System` for clarity — pure churn, defer.
- Per-invariant verification metric for ADR-0020 I-1 (council WR-3) —
  separate phase.
- The redundancy of re-extracting `tenantId` inside the `withTenant`
  callback in the new repo methods (see Implementation notes) — addressable
  by a separate `db.withTenant((tx, ctx) => ...)` ergonomics change.

## Risks and unknowns

- **Erasure / archive precedence (e2e case 1).** Whether the new RLS layer
  or the existing archive pre-check (RES-127) fires first determines the
  status code (404 vs. 403 `tenant.archived`). Both outcomes uphold the
  security contract. Planning confirms which path is taken; the test
  asserts the security property (no foreign snapshot returned), not a
  specific code path.

- **`AuthGuard` ordering.** The guard runs after `TenantContextMiddleware`,
  so when the controller hits the new `findCurrentTenant`, ALS is already
  bound. No ordering surprise expected, but the integration test confirms
  it.

- **Brand context.** `TenantContextMiddleware` sets `tenantId` (always) and
  `brandId` (when an `x-brand-slug` header is present). `db.withTenant`
  binds `app.current_tenant` from the ALS-bound `tenantId`; `brandId` does
  not affect the `tenants_self_iso` policy. No interaction expected, but
  worth a one-line assertion in the integration suite (`brandId` set ⇒
  same `findCurrentTenant` result).
