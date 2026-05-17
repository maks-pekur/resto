# RES-235a — `ScopedTx` Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `ScopedTx` helper class in `@resto/db` that wraps Drizzle tx with auto-applied `tenantId` filter on SELECT/UPDATE/DELETE and auto-injected `tenantId` on INSERT. Extend `TenantAwareDb.withTenant` and `withTenantId` to pass a `ScopedTx` instance as the second callback argument. Backward compatible — existing 1-arg callbacks keep working.

**Architecture:** Class-on-callback-arg pattern. `TenantAwareDb.withTenant(op)` already enters a transaction with `app.current_tenant` set; we additionally construct `new ScopedTx(tx, tenantId)` and pass it as `op`'s second argument. `ScopedTx` methods chain into Drizzle's native query builder post-`.where()`, so callers retain full Drizzle ergonomics for `.limit/.orderBy/.returning/...` while losing the ability to silently miss the tenant filter.

**Tech Stack:** Drizzle ORM (`postgres-js`), Postgres 16, Vitest, testcontainers, AsyncLocalStorage.

**Spec:** `docs/superpowers/specs/2026-05-17-res-235a-scoped-tx-design.md` (committed `9d4c8ee`).

**Branch:** `res-235` (already checked out from `main`; spec committed).

---

## File Map

| File                                             | Action | Why                                                                                                                                                                               |
| ------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/db/src/client.ts`                      | Modify | Add `TenantScopedTable` type alias; add `ScopedTx` class; extend `withTenant`/`withTenantId` callback signatures to pass `ScopedTx` as 2nd arg; construct it inside both methods. |
| `packages/db/src/index.ts`                       | Modify | Export `ScopedTx` and `TenantScopedTable`.                                                                                                                                        |
| `packages/db/test/integration/scoped-tx.spec.ts` | Create | 9 integration test cases covering selectFrom / insertInto / updateTable + wiring. (Originally 10 — `deleteFrom` case dropped, see plan deviation note below.)                     |

**Pre-existing infrastructure (no changes needed):**

- `packages/db/test/setup.ts` provides `startPostgres()` / `stopPostgres()` / `isDockerAvailable()` — reused.
- `packages/db/src/context.ts` exports `getTenantContext` / `isUuid` / `requireTenantContext` — already imported by `client.ts`.
- `packages/db/src/schema/menu.ts` provides `menuCategories` (the canonical tenant-scoped table the tests use).

**Mid-implementation deviation (2026-05-17):** Discovery during Task 2 exposed that `resto_app` role lacks DELETE privilege by project policy (`packages/db/sql/roles.sql:39` — domain forbids hard deletes, soft-delete via `archived_at` is the rule). Two changes from the original spec/plan, applied via a `docs(spec/plan)` commit before the feat commit:

1. **`ScopedTx.deleteFrom` dropped.** The method would compile but always fail at runtime with `permission denied`. Spec §2 updated; plan Task 3 impl reduced from 4 methods to 3 (select/insert/update).
2. **`beforeEach` cleanup replaced with unique slug prefixes per test.** Tests use `c1-…`, `c2-…`, etc. + `.where(eq(slug, '<unique>'))` to filter assertions to their own rows. No truncate.

Case count: 10 → 9 (deleteFrom case removed). Verification expectations updated accordingly.

---

## Task 1: Pre-flight audit

**Files:** None modified. Verification only.

- [ ] **Step 1: Confirm branch and clean tree**

```bash
cd /Users/mp_dev/projects/RestOS
git status -s
git log -1 --oneline
```

Expected:

- `git status -s` empty (clean working tree).
- `git log -1 --oneline` shows `9d4c8ee docs(spec): RES-235a ScopedTx helper design`.

If working tree dirty or HEAD differs, stop and surface to controller.

- [ ] **Step 2: Confirm Docker is available (testcontainers will need it)**

```bash
docker info > /dev/null 2>&1 && echo "docker ok" || echo "docker MISSING"
```

Expected: `docker ok`. If missing, stop and surface — the integration tests skip cleanly via `isDockerAvailable()` but we want to actually exercise them.

- [ ] **Step 3: Inspect current `withTenant` / `withTenantId` signatures**

```bash
grep -n "async withTenant\|async withTenantId" packages/db/src/client.ts
```

Expected: two methods, both with callback signature `(tx: RestoTx) => Promise<T>` (single argument). The plan extends this to `(tx: RestoTx, scoped: ScopedTx) => Promise<T>`.

---

## Task 2: Write the failing integration test

**Files:**

- Create: `packages/db/test/integration/scoped-tx.spec.ts`

- [ ] **Step 1: Create the spec file with all 10 cases**

Create `packages/db/test/integration/scoped-tx.spec.ts` with the following content:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { runInTenantContext, schema, ScopedTx } from '../../src/index';
import {
  isDockerAvailable,
  startPostgres,
  stopPostgres,
  type TestPg,
} from '../setup';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn(
    '[scoped-tx] Docker not available — skipping integration tests.',
  );
}

suite('ScopedTx — tenant-scoped Drizzle helper', () => {
  let pg: TestPg;
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    pg = await startPostgres();
    await pg.db.withoutTenant('seed tenants for scoped-tx test', async (tx) => {
      const [a] = await tx
        .insert(schema.tenants)
        .values({ slug: 'scoped-a', displayName: 'Scoped A' })
        .returning({ id: schema.tenants.id });
      const [b] = await tx
        .insert(schema.tenants)
        .values({ slug: 'scoped-b', displayName: 'Scoped B' })
        .returning({ id: schema.tenants.id });
      if (!a || !b) throw new Error('Failed to seed tenants.');
      tenantA = a.id;
      tenantB = b.id;
    });
  }, 90_000);

  afterAll(async () => {
    await stopPostgres(pg);
  });

  beforeEach(async () => {
    // Clean menuCategories between tests so seed ordering does not leak.
    await pg.db.withoutTenant('reset menuCategories', async (tx) => {
      await tx.delete(schema.menuCategories);
    });
  });

  it('selectFrom auto-applies tenant filter', async () => {
    await pg.db.withoutTenant('seed A + B rows', async (tx) => {
      await tx.insert(schema.menuCategories).values([
        { tenantId: tenantA, slug: 'pizza', name: { en: 'Pizza A' } },
        { tenantId: tenantB, slug: 'pizza', name: { en: 'Pizza B' } },
      ]);
    });
    const rows = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (_tx, scoped) =>
        scoped.selectFrom(schema.menuCategories),
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tenantId).toBe(tenantA);
    expect(rows[0]?.slug).toBe('pizza');
  });

  it('selectFrom composes extra where with AND', async () => {
    await pg.db.withoutTenant('seed multi rows', async (tx) => {
      await tx.insert(schema.menuCategories).values([
        { tenantId: tenantA, slug: 'pizza', name: { en: 'Pizza A' } },
        { tenantId: tenantA, slug: 'burger', name: { en: 'Burger A' } },
        { tenantId: tenantB, slug: 'pizza', name: { en: 'Pizza B' } },
      ]);
    });
    const rows = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (_tx, scoped) =>
        scoped.selectFrom(
          schema.menuCategories,
          eq(schema.menuCategories.slug, 'pizza'),
        ),
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tenantId).toBe(tenantA);
    expect(rows[0]?.slug).toBe('pizza');
  });

  it('selectFrom chains Drizzle ops (.limit)', async () => {
    await pg.db.withoutTenant('seed 3 rows for tenantA', async (tx) => {
      await tx.insert(schema.menuCategories).values([
        { tenantId: tenantA, slug: 'one', name: { en: 'One' } },
        { tenantId: tenantA, slug: 'two', name: { en: 'Two' } },
        { tenantId: tenantA, slug: 'three', name: { en: 'Three' } },
      ]);
    });
    const rows = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (_tx, scoped) =>
        scoped.selectFrom(schema.menuCategories).limit(2),
      ),
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.tenantId === tenantA)).toBe(true);
  });

  it('insertInto auto-injects tenantId', async () => {
    await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (_tx, scoped) =>
        scoped.insertInto(schema.menuCategories, {
          slug: 'pizza-a',
          name: { en: 'Pizza A' },
        }),
      ),
    );
    const rows = await pg.db.withoutTenant('verify inserted row', async (tx) =>
      tx
        .select()
        .from(schema.menuCategories)
        .where(eq(schema.menuCategories.slug, 'pizza-a')),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tenantId).toBe(tenantA);
  });

  it('insertInto throws if values include tenantId', async () => {
    const error = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db
        .withTenant(async (_tx, scoped) =>
          scoped.insertInto(schema.menuCategories, {
            tenantId: tenantB,
            slug: 'sneaky',
            name: { en: 'Sneaky' },
          } as unknown as Parameters<typeof scoped.insertInto>[1]),
        )
        .then(
          () => null,
          (e: unknown) => e,
        ),
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(
      /values must not include tenantId/i,
    );

    // Nothing was inserted.
    const rows = await pg.db.withoutTenant('verify no insert', async (tx) =>
      tx
        .select()
        .from(schema.menuCategories)
        .where(eq(schema.menuCategories.slug, 'sneaky')),
    );
    expect(rows).toHaveLength(0);
  });

  it('updateTable auto-filters by tenantId', async () => {
    await pg.db.withoutTenant('seed A + B', async (tx) => {
      await tx.insert(schema.menuCategories).values([
        { tenantId: tenantA, slug: 'pizza', name: { en: 'Pizza A' } },
        { tenantId: tenantB, slug: 'pizza', name: { en: 'Pizza B' } },
      ]);
    });
    await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (_tx, scoped) =>
        scoped.updateTable(schema.menuCategories, {
          name: { en: 'Updated A' },
        }),
      ),
    );
    const all = await pg.db.withoutTenant('inspect after update', async (tx) =>
      tx.select().from(schema.menuCategories),
    );
    const a = all.find((r) => r.tenantId === tenantA);
    const b = all.find((r) => r.tenantId === tenantB);
    expect(a?.name).toEqual({ en: 'Updated A' });
    expect(b?.name).toEqual({ en: 'Pizza B' });
  });

  it('deleteFrom auto-filters by tenantId', async () => {
    await pg.db.withoutTenant('seed A + B', async (tx) => {
      await tx.insert(schema.menuCategories).values([
        { tenantId: tenantA, slug: 'pizza', name: { en: 'Pizza A' } },
        { tenantId: tenantB, slug: 'pizza', name: { en: 'Pizza B' } },
      ]);
    });
    await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (_tx, scoped) =>
        scoped.deleteFrom(schema.menuCategories),
      ),
    );
    const remaining = await pg.db.withoutTenant(
      'inspect after delete',
      async (tx) => tx.select().from(schema.menuCategories),
    );
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.tenantId).toBe(tenantB);
  });

  it('withTenant callback receives ScopedTx as 2nd argument', async () => {
    const result = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant((_tx, scoped) =>
        Promise.resolve(scoped instanceof ScopedTx),
      ),
    );
    expect(result).toBe(true);
  });

  it('withTenantId callback receives ScopedTx (no-ALS path)', async () => {
    await pg.db.withoutTenant('seed A row', async (tx) => {
      await tx
        .insert(schema.menuCategories)
        .values({ tenantId: tenantA, slug: 'wtid-row', name: { en: 'WTID' } });
    });
    // No runInTenantContext wrapping — exercises the BA-hook style path.
    const rows = await pg.db.withTenantId(tenantA, async (_tx, scoped) =>
      scoped.selectFrom(schema.menuCategories),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tenantId).toBe(tenantA);
  });

  it('withoutTenant callback signature stays 1-arg (compile-time pin)', async () => {
    // The callback below has 1 parameter. If withoutTenant ever gains a 2nd
    // ScopedTx parameter, this code would still compile but the type
    // expectation is documented in the spec — system context has no tenantId
    // and would make a ScopedTx meaningless. Runtime smoke: the callback
    // executes without error.
    const ok = await pg.db.withoutTenant('compile-time pin', (tx) =>
      tx
        .select()
        .from(schema.menuCategories)
        .then(() => true),
    );
    expect(ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails (ScopedTx and 2nd-arg do not exist yet)**

```bash
cd /Users/mp_dev/projects/RestOS
pnpm exec nx test db -- scoped-tx
```

Expected: FAIL — TypeScript compile error for `import { ScopedTx } from '../../src/index'` (no such export), and / or for the 2-arg callback shape of `withTenant`. The exact error depends on Vitest's TS handling; either way, the test cannot reach the assertions.

If Docker is unavailable, the suite skips cleanly and reports zero tests — the failure surface is the missing TypeScript export, which the typecheck step will catch independently.

If Vitest's nx invocation does not accept the positional file pattern (recall: RES-240 hit this with `nx test api` vs `nx run api:e2e`), use `pnpm exec vitest run test/integration/scoped-tx.spec.ts` from `/Users/mp_dev/projects/RestOS/packages/db/`.

---

## Task 3: Implement `ScopedTx` in `packages/db/src/client.ts`

**Files:**

- Modify: `packages/db/src/client.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Update the `client.ts` import block**

Open `packages/db/src/client.ts` and update the imports at the top of the file (currently lines 1–6) to:

```ts
import { and, eq, sql, type SQL } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { getTenantContext, isUuid, requireTenantContext } from './context';
import { logger } from './logger';
import * as schema from './schema/index';
```

Diff from current:

- Add `and` to the `drizzle-orm` named import (already imports `sql`; was missing `and` and `SQL` type).
- Add `import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';` line.
- The existing `getTenantContext, isUuid, requireTenantContext` import from `./context` is unchanged from what RES-240 left.

- [ ] **Step 2: Add the `TenantScopedTable` type alias**

After the `RestoTx` type declaration (around line 14 in the current file), add:

```ts
/**
 * Compile-time marker for tables carrying `tenant_id NOT NULL`. Any table
 * whose Drizzle definition exposes a `tenantId` column satisfies this
 * constraint automatically — no per-table opt-in required. The constraint
 * is what makes `scoped.selectFrom(table)` refuse the `tenants` table
 * (no `tenantId` column on itself) at compile time.
 */
export type TenantScopedTable = PgTable & { tenantId: PgColumn };
```

- [ ] **Step 3: Add the `ScopedTx` class**

Below the `TenantScopedTable` type and above the `TenantAwareDb` class, add:

```ts
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
}
```

**No `deleteFrom`** — the `resto_app` role lacks DELETE privilege by project policy (`packages/db/sql/roles.sql:39`). Including it would create a runtime-failing footgun. Future GC jobs that need hard delete will use a separate privileged role + helper.

- [ ] **Step 4: Extend `withTenant` and `withTenantId` signatures**

Locate the existing `withTenant` method (around lines 70–77 in current `client.ts`):

```ts
async withTenant<T>(op: (tx: RestoTx) => Promise<T>): Promise<T> {
  const ctx = requireTenantContext();
  return this.#db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_tenant', ${ctx.tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.is_system', 'false', true)`);
    return op(tx);
  });
}
```

Replace with:

```ts
async withTenant<T>(op: (tx: RestoTx, scoped: ScopedTx) => Promise<T>): Promise<T> {
  const ctx = requireTenantContext();
  return this.#db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_tenant', ${ctx.tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.is_system', 'false', true)`);
    return op(tx, new ScopedTx(tx, ctx.tenantId));
  });
}
```

Locate the existing `withTenantId` method (added in RES-240, around lines 80–97 in current `client.ts`):

```ts
async withTenantId<T>(tenantId: string, op: (tx: RestoTx) => Promise<T>): Promise<T> {
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
    return op(tx);
  });
}
```

Replace with:

```ts
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
    return op(tx, new ScopedTx(tx, tenantId));
  });
}
```

`withoutTenant` is **unchanged** — its signature stays `(reason: string, op: (tx: RestoTx) => Promise<T>) => Promise<T>`.

- [ ] **Step 5: Update `packages/db/src/index.ts` exports**

Open `packages/db/src/index.ts` and replace the existing `./client` export block (currently lines 8–15) with:

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

Diff: add `ScopedTx` (class) and `type TenantScopedTable` to the exports, keep the rest. Other exports (context, preflight, roles, schema, etc.) unchanged.

---

## Task 4: Verify and commit

**Files:** Verification only — code changes already in Tasks 2 and 3. Commit captures everything.

- [ ] **Step 1: Typecheck the `db` package**

```bash
cd /Users/mp_dev/projects/RestOS
pnpm exec nx run db:typecheck
```

Expected: PASS. The generic `T extends TenantScopedTable` constraint must narrow correctly at the call sites in `scoped-tx.spec.ts`.

If typecheck fails inside `client.ts`, the most likely cause is a stale `Drizzle` API expectation about `.select().from(table).where()` return types — check the Drizzle version in `packages/db/package.json` and adjust the return-type annotations (the method bodies are unannotated and rely on inference, so the call site reveals the inferred type).

- [ ] **Step 2: Run the integration test suite**

```bash
pnpm exec nx test db -- scoped-tx
```

Or if positional args don't pass through:

```bash
cd /Users/mp_dev/projects/RestOS/packages/db
pnpm exec vitest run test/integration/scoped-tx.spec.ts
```

Expected: PASS — 9 cases green.

If a case fails, do not "fix" the spec — re-read the failing assertion against the spec (`docs/superpowers/specs/2026-05-17-res-235a-scoped-tx-design.md`) and adjust the implementation if it diverges from intent.

- [ ] **Step 3: Run the full `db` test suite to confirm no regression**

```bash
cd /Users/mp_dev/projects/RestOS
pnpm exec nx test db
```

Expected: 6 test files / **53 tests passed** (existing 44 + new 9).

- [ ] **Step 4: Cross-package typecheck — confirm existing api callers still compile**

```bash
pnpm exec nx run-many -t typecheck -p db,api
```

Expected: PASS for both projects. This is critical — extending `withTenant` callback signature must not break existing `apps/api/**` callers that pass 1-arg arrows. TypeScript permits functions with fewer parameters than declared, so this should be a no-op for them.

If `api:typecheck` fails, the diff isn't backwards-compat. Most likely cause: a caller does something type-clever like passing `withTenant(myFn)` where `myFn` is annotated `(tx: RestoTx) => Promise<…>`, and TypeScript variance rules reject the wider expected signature. The fix in that case is to widen the caller's annotation (but check whether this signals a real issue before adjusting).

- [ ] **Step 5: Lint `db`**

```bash
pnpm exec nx run db:lint
```

Expected: PASS.

- [ ] **Step 6: Commit everything atomically**

```bash
cd /Users/mp_dev/projects/RestOS
git add packages/db/src/client.ts packages/db/src/index.ts packages/db/test/integration/scoped-tx.spec.ts
git commit -m "feat(db): add ScopedTx helper for tenant-scoped Drizzle queries"
```

Project policies:

- Conventional Commits prefix (`feat(db):`).
- No `Co-Authored-By: Claude` trailer.
- Subject only — no body.
- No `res-235:` task-id prefix in subject (match recent project commits).

`lint-staged` will run prettier + eslint + typecheck on the staged files — expected and harmless.

---

## Task 5: Final verification before PR

**Files:** None modified — verification only.

- [ ] **Step 1: Verify branch state**

```bash
git log --oneline main..res-235
```

Expected: 2 commits in this order (newest first):

```
<sha> feat(db): add ScopedTx helper for tenant-scoped Drizzle queries
9d4c8ee docs(spec): RES-235a ScopedTx helper design
```

If more commits, something extra landed — surface to controller. If fewer, the commit in Task 4 Step 6 didn't land.

- [ ] **Step 2: Verify commit metadata**

```bash
git log -1 --pretty=full
git log main..res-235 --format="%B" | grep -i "co-authored-by"
```

Expected:

- HEAD commit author `maks_p <mpekur.dev@gmail.com>`.
- Subject exactly `feat(db): add ScopedTx helper for tenant-scoped Drizzle queries`.
- Body empty.
- `grep -i "co-authored-by"` returns empty (success).

- [ ] **Step 3: Final cross-package smoke**

```bash
pnpm exec nx run-many -t lint -p db,api
pnpm exec nx run-many -t typecheck -p db,api
pnpm exec nx test db
```

Expected: all green. The db test suite re-runs because we want to catch any flakiness one more time before pushing.

- [ ] **Step 4: Push the branch (after user confirms)**

Confirm with the user before pushing. After approval:

```bash
git push -u origin res-235
```

- [ ] **Step 5: Open the PR (after user confirms)**

Confirm with the user before opening. After approval:

```bash
gh pr create --title "feat(db): add ScopedTx helper for tenant-scoped Drizzle queries" --body ""
```

Empty body per project policy.

- [ ] **Step 6: After PR opens — Linear update**

Post a comment on RES-235 stating this PR is **phase A** of the 3-phase split (per spec):

- Phase A (this PR): ScopedTx helper + tests.
- Phase B (next): migrate `CatalogDrizzleRepository`; closes RES-241.
- Phase C (later): ESLint guard + audit/migrate remaining repos + `withoutTenant` allowlist.

Move RES-235 → In Review. Attach PR URL via `links`.

Tools to use (controller has them loaded):

- `mcp__claude_ai_Linear__save_comment` — post the phase-split note.
- `mcp__claude_ai_Linear__save_issue` — state to "In Review", attach link.

---

## Out of scope (phase A — explicit)

- **Migration of `CatalogDrizzleRepository`** to use `ScopedTx`. Phase B (RES-235b — to be created as a sub-issue or sibling ticket).
- **Migration of `BrandDrizzleRepository`** to use `ScopedTx`. Phase C audit will decide if it needs it (most callsites already filter explicitly per the spec's repo audit).
- **`TenantDrizzleRepository`** — the `tenants` table has no `tenantId` column; it's the tenant table itself. Not in scope of `ScopedTx` at any phase.
- **ESLint `no-restricted-syntax` rule** blocking raw `tx.select().from(<tenant-scoped table>)` patterns outside `ScopedTx`. Phase C.
- **`withoutTenant` allowlist mechanism** — file paths or decorator-based. Phase C.
- **Convenience methods** (`findById`, `upsert`, `count`, `selectOne`) — YAGNI. Add when a second consumer drives the need.
- **Type-level forbid of `.where()` after `selectFrom()`** — runtime `and()` composition (case 2 test) is the correct mechanism; type-level forbid would break legitimate Drizzle chains and is overengineering.

## Notes for the executing agent

- Branch `res-235` is already checked out from `main`. Spec already committed (`9d4c8ee`).
- Do **not** add `Co-Authored-By: Claude` trailers — project policy.
- Do **not** add commit body / description — subject line only.
- Optional `RES-235:` prefix on commit subjects is **not** used in recent project commits — match existing pattern by omitting it.
- The lint-staged hook runs prettier + eslint + typecheck on staged files; expected and harmless.
- Docker MUST be running for integration tests (testcontainers Postgres). If `docker info` fails, surface to controller — do not skip the verification.
- `nx test db -- <pattern>` may not forward the positional pattern in this project's setup; fall back to `pnpm exec vitest run <relative-path>` from the `packages/db/` directory if so.
- The `withoutTenant` callback signature is intentionally unchanged in this PR — system context has no tenantId.
- After RES-240, the `withTenantId` callback now also receives a `ScopedTx` — that's by design (BA hooks and similar non-HTTP entry points should benefit from the same ergonomic).
