---
ticket: RES-235 (phase A of A/B/C split)
adr: 0020 (I-1), 0021 (Tier 1 — Multi-tenancy)
status: proposed
date: 2026-05-17
scope:
  - packages/db/src/client.ts (add ScopedTx class; extend withTenant + withTenantId signatures)
  - packages/db/src/index.ts (export ScopedTx + TenantScopedTable)
  - packages/db/test/integration/scoped-tx.spec.ts (new)
---

# RES-235a — `ScopedTx` helper for tenant-scoped Drizzle queries

## Context

ADR-0020 invariant I-1 states: every read/write on a tenant-scoped table
MUST explicitly filter by `eq(table.tenantId, ctx.tenantId)`. RLS is the
second line of defense, not the first.

RES-235 (Linear) calls for a **Drizzle repository base class with
tenant_id auto-filter** — ~80 LOC, no tooling — that makes the I-1 filter
the default path. The ticket has 5 acceptance criteria:

1. Base class with select/insert/update/delete wrappers that auto-attach
   `eq(table.tenantId, ctx.tenantId)`.
2. Throws if invoked without ALS tenant context.
3. Migrates ≥1 existing tenant-scoped repo (catalog — also closes
   RES-241 CR-01/02/03 filter gaps).
4. CI gate (lint / typecheck) blocks raw Drizzle queries against
   tenant-scoped tables outside this helper.
5. Explicit allowlist for legitimate `withoutTenant` callsites.

This spec covers **phase A only** — the helper itself, its tests, and
its wiring into `TenantAwareDb.withTenant` / `withTenantId`. Phases B
and C are separate tickets:

- **Phase B (RES-235b):** migrate `CatalogDrizzleRepository` to use the
  helper. Same ticket also closes RES-241 (catalog filter gaps —
  CR-01/02/03).
- **Phase C (RES-235c):** ESLint guard against raw `tx.select().from(...)`
  on tenant-scoped tables outside repos; audit + migration of brand /
  tenant repos; `withoutTenant` allowlist mechanism.

The phasing keeps each PR bisect-friendly and lets the API design
stabilise on real code (B) before locking the door (C).

Audit of current Drizzle repos (`apps/api/src/contexts/**/*.repository.ts`):

- `catalog-drizzle.repository.ts` — 341 LOC; 6+ `tx.select().from(...)`
  calls without explicit `tenantId` filter. RLS catches today; RES-241
  closes the gap. RES-235b migrates these to `ScopedTx`.
- `brand-drizzle.repository.ts` — 198 LOC; mostly already filters
  explicitly via `eq(brands.tenantId, ...)`.
- `tenant-drizzle.repository.ts` — 336 LOC; the `tenants` table itself
  has no `tenantId` column (it IS the tenant table); most reads use
  `withoutTenant` for cross-tenant lookups. Not in scope for
  `ScopedTx` migration.

## Design

### 1. `TenantScopedTable` compile-time marker

**File:** `packages/db/src/client.ts`

```ts
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

/**
 * Compile-time marker for tables carrying `tenant_id NOT NULL`. Any table
 * whose Drizzle definition exposes a `tenantId` column satisfies this
 * constraint automatically — no per-table opt-in required. The constraint
 * is what makes `scoped.selectFrom(table)` refuse the `tenants` table
 * (no `tenantId` column on itself) at compile time.
 */
export type TenantScopedTable = PgTable & { tenantId: PgColumn };
```

### 2. `ScopedTx` class

**File:** `packages/db/src/client.ts`

```ts
import { and, eq, sql, type SQL } from 'drizzle-orm';
import { getTenantContext, isUuid, requireTenantContext } from './context';

/**
 * Tenant-scoped query builder. Wraps a `RestoTx` with a pinned tenantId;
 * every helper method auto-applies `eq(table.tenantId, this.tenantId)` on
 * SELECT / UPDATE / DELETE and auto-injects `tenantId` on INSERT.
 *
 * Obtained from `TenantAwareDb.withTenant(op)` / `withTenantId(id, op)`
 * as the second callback argument. Not directly constructible by callers —
 * the wiring guarantees a tenant context is bound.
 *
 * For queries that must escape (joins to non-tenant tables, raw SQL),
 * use the unrestricted `tx` (first callback argument). The escape is
 * audited by code review, not the type system.
 */
export class ScopedTx {
  constructor(
    private readonly tx: RestoTx,
    private readonly tenantId: string,
  ) {}

  /**
   * SELECT with auto-applied `eq(table.tenantId, this.tenantId)`. The
   * returned Drizzle builder is post-`.where()` — caller chains
   * `.limit/.orderBy/.innerJoin/...` freely but should NOT call
   * `.where()` again (Drizzle replaces; tenant filter is lost). Pass
   * any extra predicate as the second argument; it is composed with the
   * tenant filter via `and()`.
   */
  selectFrom<T extends TenantScopedTable>(table: T, extraWhere?: SQL) {
    const tenantFilter = eq(table.tenantId, this.tenantId);
    const where = extraWhere ? and(tenantFilter, extraWhere) : tenantFilter;
    return this.tx.select().from(table).where(where);
  }

  /**
   * INSERT with auto-injected tenantId. Caller-provided values MUST NOT
   * include `tenantId` — the TypeScript signature forbids it, and a
   * runtime guard throws if it leaks through (e.g. via `as any` cast).
   * The runtime guard catches the cross-tenant insert primitive that
   * would otherwise let a row from tenant A be re-inserted under
   * tenant B's ALS context.
   */
  insertInto<T extends TenantScopedTable>(
    table: T,
    values: Omit<T['$inferInsert'], 'tenantId'>,
  ) {
    if ('tenantId' in (values as object)) {
      throw new Error(
        `ScopedTx.insertInto: values must not include tenantId — it is injected from the bound tenant context. Got tenantId=${JSON.stringify((values as { tenantId: unknown }).tenantId)}.`,
      );
    }
    return this.tx
      .insert(table)
      .values({ ...values, tenantId: this.tenantId } as T['$inferInsert']);
  }

  /**
   * UPDATE with auto-applied `eq(table.tenantId, this.tenantId)`. Returns
   * a builder ready for `.returning()` or `.execute()`. Extra where
   * composes with the tenant filter via `and()` — same pattern as
   * `selectFrom`.
   */
  updateTable<T extends TenantScopedTable>(
    table: T,
    set: Partial<T['$inferInsert']>,
    extraWhere?: SQL,
  ) {
    const tenantFilter = eq(table.tenantId, this.tenantId);
    const where = extraWhere ? and(tenantFilter, extraWhere) : tenantFilter;
    return this.tx.update(table).set(set).where(where);
  }

  /**
   * DELETE with auto-applied `eq(table.tenantId, this.tenantId)`.
   */
  deleteFrom<T extends TenantScopedTable>(table: T, extraWhere?: SQL) {
    const tenantFilter = eq(table.tenantId, this.tenantId);
    const where = extraWhere ? and(tenantFilter, extraWhere) : tenantFilter;
    return this.tx.delete(table).where(where);
  }
}
```

**Size:** ~50 LOC of code + ~30 LOC docstrings ≈ 80 LOC. Matches the
ticket's estimate.

### 3. Wiring into `TenantAwareDb`

**File:** `packages/db/src/client.ts`

Extend `withTenant` and `withTenantId` callback signatures to pass a
`ScopedTx` as the second argument:

```ts
async withTenant<T>(op: (tx: RestoTx, scoped: ScopedTx) => Promise<T>): Promise<T> {
  const ctx = requireTenantContext();
  return this.#db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_tenant', ${ctx.tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.is_system', 'false', true)`);
    const scoped = new ScopedTx(tx, ctx.tenantId);
    return op(tx, scoped);
  });
}

async withTenantId<T>(
  tenantId: string,
  op: (tx: RestoTx, scoped: ScopedTx) => Promise<T>,
): Promise<T> {
  if (getTenantContext()) {
    throw new Error(
      'withTenantId must not be called inside an ALS-bound context — use withTenant() instead.',
    );
  }
  if (!isUuid(tenantId)) {
    throw new Error(`Invalid tenant id: expected a uuid, got ${JSON.stringify(tenantId)}.`);
  }
  return this.#db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_tenant', ${tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.is_system', 'false', true)`);
    const scoped = new ScopedTx(tx, tenantId);
    return op(tx, scoped);
  });
}
```

`withoutTenant` stays unchanged: `(tx) => Promise<T>` — no `scoped`
param. System context has no tenantId; passing a `ScopedTx` there would
be misleading.

**Backwards-compat:** existing callers `db.withTenant((tx) => ...)` keep
working — TypeScript permits functions with fewer parameters than the
declared signature. No call-site changes required for adoption.

### 4. ALS guard — already in place

The ScopedTx constructor does NOT itself check for a bound ALS context.
Its only construction paths are:

- `withTenant` — already gated by `requireTenantContext()` which throws
  if ALS is unbound.
- `withTenantId` — already gated by the RES-240 guard that throws if
  ALS IS bound (the inverse case — non-HTTP entry points), and validates
  the provided tenantId as a UUID.

Both guards established before construction. Adding a third check inside
`ScopedTx` would be redundant defense without new coverage. One layer of
guard per construction path.

### 5. Exports

**File:** `packages/db/src/index.ts`

Add to the public surface:

```ts
export {
  createDb,
  ScopedTx,
  TenantAwareDb,
  type CreateClientOptions,
  type ResolvedConnection,
  type RestoSchema,
  type RestoTx,
  type TenantScopedTable,
} from './client';
```

`ScopedTx` is exported so test code and (future) repo migrations can
reference its type. `TenantScopedTable` is exported for callers that
want to assert a particular table satisfies the constraint at the type
level. Neither is constructed directly by external code.

## Tests

**File (new):** `packages/db/test/integration/scoped-tx.spec.ts`

Pattern follows `with-tenant-id.spec.ts` and `tenant-isolation.spec.ts`:
testcontainer Postgres via `startPostgres()` / `stopPostgres()`,
skip-when-no-Docker via `isDockerAvailable()`.

10 cases:

| #   | Case                                                  | Setup                                | Action                                                                                   | Expectation                                       |
| --- | ----------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1   | selectFrom auto-applies tenant filter                 | seed A row + B row in menuCategories | ALS=A → `scoped.selectFrom(menuCategories)`                                              | returns only A row                                |
| 2   | selectFrom composes extra where with AND              | A: pizza+burger, B: pizza            | ALS=A → `scoped.selectFrom(menuCategories, eq(slug, 'pizza'))`                           | returns 1 row (A pizza)                           |
| 3   | selectFrom chains Drizzle ops (.limit)                | seed 3 rows tenant A                 | `scoped.selectFrom(menuCategories).limit(2)`                                             | returns 2 rows                                    |
| 4   | insertInto auto-injects tenantId                      | empty                                | ALS=A → `scoped.insertInto(menuCategories, { slug:'x', name:{en:'X'} })`                 | row inserted with tenantId=A; SELECT confirms     |
| 5   | insertInto throws if values include tenantId          | empty                                | ALS=A → `scoped.insertInto(menuCategories, { tenantId:'…', slug:'y', name:{…} } as any)` | throws with informative message; nothing inserted |
| 6   | updateTable auto-filters by tenantId                  | A:pizza, B:pizza                     | ALS=A → `scoped.updateTable(menuCategories, { name:{en:'Updated'} })`                    | only A row updated; B unchanged                   |
| 7   | deleteFrom auto-filters by tenantId                   | A:pizza, B:pizza                     | ALS=A → `scoped.deleteFrom(menuCategories)`                                              | A gone; B remains                                 |
| 8   | withTenant callback receives ScopedTx                 | n/a                                  | `db.withTenant((tx, scoped) => scoped instanceof ScopedTx)`                              | true                                              |
| 9   | withTenantId callback receives ScopedTx (no-ALS path) | n/a                                  | `db.withTenantId(A, (tx, scoped) => scoped.selectFrom(menuCategories))`                  | works without runInTenantContext wrapping         |
| 10  | withoutTenant callback signature stays single-arg     | n/a (compile-time only)              | TS check: `db.withoutTenant('r', (tx) => ...)` accepts arrow with 1 param                | type-checks; no `scoped` available                |

Case 10 is a compile-time-only check — runs as part of `pnpm exec nx run db:typecheck`. Concretely: the test file includes a type-level assertion using `expectTypeOf` or a no-op arrow that the suite never actually invokes, just to pin the signature.

## Rollout

### Branch + commit

- **Branch:** `res-235` (already created from `main`).
- **Single commit** (TDD: tests + impl together, atomic unit):

  ```
  feat(db): add ScopedTx helper for tenant-scoped Drizzle queries
  ```

  Single commit because the class, its wiring, and the tests are
  inseparable — the helper without callers is dead code; the wiring
  without the class doesn't compile.

### Verification

1. `pnpm exec nx run db:typecheck` → PASS. Generic `T extends TenantScopedTable` must correctly narrow at call sites.
2. `pnpm exec nx run db:lint` → PASS.
3. `pnpm exec nx test db` → 10 new cases + existing 44 = **54** total, all green.
4. `pnpm exec nx run-many -t typecheck -p db,api` → PASS. Critical: extending `withTenant` callback signature must not break existing callers in `apps/api/**` that pass a 1-arg arrow.

### PR + Linear

- PR title: `feat(db): add ScopedTx helper for tenant-scoped Drizzle queries`.
- PR body: empty per project policy.
- Linear update: post a comment on RES-235 noting this is phase A; create RES-235b and RES-235c as separate Linear issues under the same Tier 1 project (referencing the original ticket). RES-235a in scope of THIS PR; B and C tracked separately.

  _Alternative:_ keep RES-235 as a single ticket and link the 3 PRs as it progresses. Choose at commit time based on Linear ergonomics — both work.

- After PR opens: Linear RES-235 → In Review (or In Progress if we keep it as an umbrella).

## Out of scope (phase A)

- **Migration of any existing repo** to `ScopedTx`. Phase B (RES-235b).
- **ESLint rule** blocking raw `tx.select().from(<tenant-scoped table>)` patterns. Phase C (RES-235c).
- **`withoutTenant` allowlist mechanism**. Phase C (RES-235c).
- **Convenience methods** (`findById`, `upsert`, `count`, `selectOne`) — YAGNI. Four base operations cover the catalog repo's needs; add when a second consumer drives a need.
- **Type-level forbid of `.where()` after `selectFrom()`** — runtime composition through `and()` (case 2 test) is the correct mechanism; type-level forbid is overengineering and would break legitimate Drizzle chains.

## Rejected alternatives

- **Don't extend `withTenant` — add new `withTenantScoped` method.** More verbose at the API level (existing callers must opt in) but no real benefit over the chosen path: TypeScript happily accepts callbacks with fewer parameters than declared, so existing call sites need zero changes and new code gets the helper for free. Phase B's catalog migration will demonstrate the ergonomic win.
- **Functional helper `tenantScoped(tx)` instead of a class.** Equivalent semantics, but boilerplate at every call site (`const scoped = tenantScoped(tx);` first line of every callback). The class-via-callback-param removes that boilerplate.
- **Mark each tenant-scoped table at the schema layer** (e.g. `markTenantScoped(menuItems)`). Redundant — Drizzle already exposes the column on the table's type; the structural type `PgTable & { tenantId: PgColumn }` captures it for free.
- **`expectTypeOf` test infrastructure new dependency.** Use built-in TypeScript `// @ts-expect-error` annotations or a no-op signature check instead of pulling in `expect-type` for one case.

## Open design notes

Resolved at implementation time:

1. **Drizzle `.where()` chain semantics** — case 2 empirically verifies that the helper's `and()` composition is correct.
2. **Runtime `'tenantId' in values` check** — TypeScript already forbids the key via `Omit<...>`; the runtime guard catches `as any` escapes (case 5).
3. **Single Linear ticket vs split into A/B/C sub-issues** — decided at PR / Linear update time.

## References

- [ADR-0020 — Multi-tenancy and event-bus invariants](../../adr/0020-multi-tenancy-and-event-bus-invariants.md) — invariant I-1 is the canonical rule.
- [ADR-0021 — Layered milestone strategy](../../adr/0021-layered-milestone-strategy.md) — Tier 1; ScopedTx is one of the cheapest tooling options in the preference order.
- [RES-240 spec](./2026-05-17-res-240-ba-hook-i6-fix-design.md) — established the `withTenantId` primitive this spec extends with a 2nd callback arg.
- [RES-239 spec](./2026-05-17-res-239-eslint-runintenantcontext-guard-design.md) — sibling I-6 structural defense. RES-235c will add the analogous I-1 lint guard.
- Linear: RES-235 (parent / phase A scope), RES-241 (catalog filters — to be closed by phase B), Tier 1 Multi-tenancy freeze project.
