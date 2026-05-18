# RES-243 — Harden `withTenant` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make in-transaction re-binding of `app.current_tenant` either structurally impossible (Postgres-level `REVOKE EXECUTE` on `set_config` + SECURITY DEFINER wrapper) or detected before any wrong-tenant data reaches the caller (end-of-callback drift sentinel that rolls back the transaction).

**Architecture:** Two complementary defenses combined in `packages/db`:

1. **Structural lock** — new `app_bind_tenant(p_tenant TEXT, p_is_system BOOLEAN)` SECURITY DEFINER function is the only way `resto_app` can bind `app.current_tenant`; the function asserts the GUC is empty or matches before binding; `pg_catalog.set_config(text,text,boolean)` is revoked from PUBLIC.
2. **Drift sentinel** — `TenantAwareDb` runs `SELECT current_setting('app.current_tenant', true)` at the end of every `withTenant` / `withTenantId` / `withoutTenant` callback; mismatch throws → Drizzle rolls back → the locally-computed result is discarded.

Plus fail-closed preflight assertions and an ESLint guard.

**Tech Stack:** TypeScript, Drizzle ORM (`postgres-js` driver), PostgreSQL 16 (RLS + custom GUC `app.current_tenant`), Vitest (`pool: forks`, `singleFork: true`), Testcontainers, ESLint flat config.

**Spec:** `docs/superpowers/specs/2026-05-18-res-243-withtenant-guc-lock-design.md`
**Branch:** `res-243` (already created)
**Linear:** [RES-243](https://linear.app/restico/issue/RES-243)

**Migration split rationale:** Two migrations (`0022_tenant_guc_lock.sql` for the wrapper, `0023_revoke_set_config.sql` for the REVOKE) instead of one combined file. This lets the wrapper land while existing `set_config` call sites still work (Tasks 1–3), then the REVOKE is sequenced after `client.ts` has fully switched away from raw `set_config` (Task 6). Bundling both in one migration would create a broken intermediate where `client.ts`'s `set_config` calls fail before they are migrated to the wrapper.

---

## File Structure

**Create:**

- `packages/db/migrations/0022_tenant_guc_lock.sql` — Drizzle SQL migration (wrapper function + grant)
- `packages/db/migrations/0023_revoke_set_config.sql` — Drizzle SQL migration (REVOKE)
- `packages/db/sql/rollback/0022_tenant_guc_lock.down.sql` — manual rollback (Drizzle-kit is forward-only)
- `packages/db/sql/rollback/0023_revoke_set_config.down.sql` — manual rollback

**Modify:**

- `packages/db/migrations/meta/_journal.json` — add idx 22 + idx 23 entries
- `packages/db/sql/roles.sql` — `GRANT EXECUTE ON FUNCTION app_bind_tenant(text,boolean) TO resto_app`
- `packages/db/src/client.ts` — route `withTenant` / `withTenantId` / `withoutTenant` through `app_bind_tenant`; add `#assertGucUnchanged` drift sentinel; update top-of-file doc
- `packages/db/src/preflight.ts` — add `assertTenantLockInstalled`, `assertSetConfigRevoked`, error subclasses
- `packages/db/src/index.ts` — re-export the new preflight assertions
- `packages/db/test/integration/tenant-isolation.spec.ts` — delete old forge test, add 7 new tests + 4 preflight tests
- `apps/api/src/main.ts` — wire the two new preflight assertions next to `assertNoRlsBypass`
- `apps/api/eslint.config.mjs` — merge `no-restricted-syntax` rules (existing I-1 + RES-243)
- `packages/db/eslint.config.mjs` — new `no-restricted-syntax` block + allowlist for `client.ts` / `preflight.ts`

---

## Task 1: Add the wrapper-function migration

**Files:**

- Create: `packages/db/migrations/0022_tenant_guc_lock.sql`
- Create: `packages/db/sql/rollback/0022_tenant_guc_lock.down.sql`
- Modify: `packages/db/migrations/meta/_journal.json`

- [ ] **Step 1.1: Write the migration SQL**

Create `packages/db/migrations/0022_tenant_guc_lock.sql`:

```sql
-- 0022_tenant_guc_lock.sql
-- RES-243 (ADR-0020 I-1, ADR-0021 Tier 1):
-- Introduce `app_bind_tenant(text, boolean)` as the SECURITY DEFINER
-- wrapper that becomes the only sanctioned way to bind `app.current_tenant`.
-- The wrapper raises on rebind to a different tenant; same-tenant rebind
-- is idempotent.
--
-- This migration adds the wrapper only. The companion REVOKE of
-- `pg_catalog.set_config(text,text,boolean)` lands in migration
-- 0023_revoke_set_config.sql once `client.ts` is fully migrated to call
-- the wrapper.

CREATE OR REPLACE FUNCTION app_bind_tenant(p_tenant TEXT, p_is_system BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_current TEXT := current_setting('app.current_tenant', true);
BEGIN
  IF v_current IS NOT NULL AND v_current <> '' AND v_current <> p_tenant THEN
    RAISE EXCEPTION
      'app.current_tenant already bound to % — refusing to rebind to %',
      v_current, p_tenant
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM set_config('app.current_tenant', p_tenant, true);
  PERFORM set_config(
    'app.is_system',
    CASE WHEN p_is_system THEN 'true' ELSE 'false' END,
    true
  );
END
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app_bind_tenant(TEXT, BOOLEAN) FROM PUBLIC;
--> statement-breakpoint
-- Conditional grant: in a fresh test container `resto_app` is provisioned
-- after migrations run, so this DO block is a no-op there; `roles.sql`
-- repeats the GRANT for that path.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resto_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION app_bind_tenant(TEXT, BOOLEAN) TO resto_app';
  END IF;
END
$$;
```

- [ ] **Step 1.2: Append the journal entry**

Open `packages/db/migrations/meta/_journal.json`. The last entry is `idx: 21`. Append after it (preserving JSON syntax — note the comma after the previous entry):

```json
{
  "idx": 22,
  "version": "7",
  "when": <Date.now() output>,
  "tag": "0022_tenant_guc_lock",
  "breakpoints": true
}
```

Compute `Date.now()` via:

```sh
node -e 'console.log(Date.now())'
```

The value must be larger than `1778450400000` (idx 21's `when`).

- [ ] **Step 1.3: Write the rollback SQL**

Create directory if missing: `mkdir -p packages/db/sql/rollback`. Then create `packages/db/sql/rollback/0022_tenant_guc_lock.down.sql`:

```sql
-- Rollback for 0022_tenant_guc_lock.sql.
-- Drizzle-kit is forward-only; this script is run manually by an operator
-- via `psql -f packages/db/sql/rollback/0022_tenant_guc_lock.down.sql`.

DROP FUNCTION IF EXISTS app_bind_tenant(text, boolean);
```

- [ ] **Step 1.4: Run integration tests to verify the migration applies**

Run: `pnpm --filter @resto/db test -- tenant-isolation.spec.ts`

Expected:

- testcontainer Postgres starts; migrations apply cleanly (no SQL error from `0022`).
- All 8 existing tests pass — `client.ts` still calls `set_config` directly, which still works because no REVOKE has been applied; the wrapper is added but unused.

If the migration fails to apply, double-check the JSON syntax in `_journal.json` and the SQL syntax in the migration.

- [ ] **Step 1.5: Commit**

```bash
git add packages/db/migrations/0022_tenant_guc_lock.sql \
        packages/db/migrations/meta/_journal.json \
        packages/db/sql/rollback/0022_tenant_guc_lock.down.sql
git commit -m "feat(db): RES-243 — add app_bind_tenant wrapper migration"
```

---

## Task 2: Grant the wrapper to resto_app in roles.sql

**Files:**

- Modify: `packages/db/sql/roles.sql`

- [ ] **Step 2.1: Append the GRANT block**

Open `packages/db/sql/roles.sql`. After the existing `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO resto_app;` line (~line 44), insert:

```sql

-- RES-243: resto_app's only path to bind `app.current_tenant` is the
-- SECURITY DEFINER wrapper `app_bind_tenant(text, boolean)`. Migration
-- 0022 revokes the PUBLIC EXECUTE on the wrapper; this restores access
-- for resto_app. The IF EXISTS guard keeps the file safe to run before
-- migration 0022 has applied (no-op in that order).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'app_bind_tenant' AND n.nspname = 'public'
  ) THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION app_bind_tenant(text, boolean) TO resto_app';
  END IF;
END
$$;
```

- [ ] **Step 2.2: Run integration tests**

Run: `pnpm --filter @resto/db test -- tenant-isolation.spec.ts`

Expected: testcontainer reapplies migrations and reprovisions `resto_app`; existing 8 tests still pass.

- [ ] **Step 2.3: Commit**

```bash
git add packages/db/sql/roles.sql
git commit -m "feat(db): RES-243 — grant resto_app execute on app_bind_tenant"
```

---

## Task 3: Switch `client.ts` to use the wrapper

**Files:**

- Modify: `packages/db/src/client.ts`

This task does not yet add the drift sentinel (Task 4) — it is a one-for-one replacement of two `set_config(...)` calls with a single `app_bind_tenant(...)` call in each of the three methods. Behavior remains observably identical for legitimate callers; the existing forge test still passes (the forge uses raw `tx.execute(SELECT set_config(...))` which is not yet revoked).

- [ ] **Step 3.1: Rewrite `withTenant`**

Open `packages/db/src/client.ts`. Locate `withTenant` (~line 186). Replace its body:

```ts
  /**
   * Run `op` inside a transaction with the current tenant context bound.
   * RLS will reject any row whose `tenant_id` does not match.
   *
   * Binding goes through the `app_bind_tenant` SECURITY DEFINER wrapper
   * (RES-243). The wrapper raises on rebind to a different tenant;
   * same-tenant rebind is idempotent.
   */
  async withTenant<T>(op: (tx: RestoTx, scoped: ScopedTx) => Promise<T>): Promise<T> {
    const ctx = requireTenantContext();
    return this.#db.transaction(async (tx) => {
      await tx.execute(sql`SELECT app_bind_tenant(${ctx.tenantId}, false)`);
      return op(tx, new ScopedTx(tx, ctx.tenantId));
    });
  }
```

- [ ] **Step 3.2: Rewrite `withTenantId`**

In the same file, `withTenantId` (~line 208). Replace its body:

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
      await tx.execute(sql`SELECT app_bind_tenant(${tenantId}, false)`);
      return op(tx, new ScopedTx(tx, tenantId));
    });
  }
```

- [ ] **Step 3.3: Rewrite `withoutTenant`**

`withoutTenant` (~line 234). Replace its body:

```ts
  async withoutTenant<T>(reason: string, op: (tx: RestoTx) => Promise<T>): Promise<T> {
    if (reason.trim().length === 0) {
      throw new Error('withoutTenant(reason, op) requires a non-empty reason.');
    }
    logger.warn({ reason }, 'Running database operation without a tenant context (RLS bypass)');
    return this.#db.transaction(async (tx) => {
      await tx.execute(sql`SELECT app_bind_tenant('', true)`);
      return op(tx);
    });
  }
```

- [ ] **Step 3.4: Run typecheck**

Run: `pnpm --filter @resto/db typecheck`

Expected: clean — no type changes.

- [ ] **Step 3.5: Run integration tests**

Run: `pnpm --filter @resto/db test -- tenant-isolation.spec.ts`

Expected: all 8 existing tests pass. If a test fails with "function app_bind_tenant does not exist", the migration didn't apply or `roles.sql` didn't grant — revisit Tasks 1/2.

- [ ] **Step 3.6: Commit**

```bash
git add packages/db/src/client.ts
git commit -m "feat(db): RES-243 — route withTenant through app_bind_tenant"
```

---

## Task 4 (TDD): Drift sentinel + first forge test

**Files:**

- Modify: `packages/db/src/client.ts`
- Modify: `packages/db/test/integration/tenant-isolation.spec.ts`

The existing forge test on `tenant-isolation.spec.ts:91-116` documents the leak. It will be deleted as part of this task (it cannot survive the drift sentinel — its `await visible = ...` would reject before any `expect` line runs). A new TDD-style failing test replaces it.

- [ ] **Step 4.1: Delete the existing forge test**

In `packages/db/test/integration/tenant-isolation.spec.ts`, locate the `it('forged current_setting flips RLS — application code MUST NOT call set_config (contract test)' …)` block (lines 91-116). Delete the entire `it(...)` block including its body.

- [ ] **Step 4.2: Add a new failing test for `SET LOCAL` forge**

Insert in the same place where the deleted test was:

```ts
it('RES-243: forge via SET LOCAL is caught by drift sentinel', async () => {
  // REVOKE EXECUTE on set_config does not block the top-level `SET LOCAL`
  // SQL command — Postgres has no privilege mechanism for that on custom
  // GUCs. The end-of-callback drift sentinel is the defense.
  const error = await runInTenantContext({ tenantId: tenantA }, () =>
    pg.db.withTenant(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant = '${tenantB}'`));
      return tx.select().from(schema.tenants);
    }),
  ).then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toMatch(/Tenant GUC drift detected/);
});
```

Notes:

- `sql.raw(...)` is required for `SET LOCAL` because postgres-js refuses to parameterize a `SET` command. `tenantB` is a UUID string and safe to interpolate.
- The `.then(success, fail)` pattern captures the rejection without using try/catch.

- [ ] **Step 4.3: Run the test — it should FAIL**

Run: `pnpm --filter @resto/db test -- --reporter=verbose -t "forge via SET LOCAL"`

Expected: FAIL. The drift sentinel doesn't exist yet, so the callback returns successfully with tenantB's rows; `error` is `null`; `expect(error).toBeInstanceOf(Error)` fails.

If the test PASSES at this stage, the assertion is wrong or the sentinel was accidentally added — investigate.

- [ ] **Step 4.4: Implement `#assertGucUnchanged`**

In `packages/db/src/client.ts`, inside `TenantAwareDb`, add a new private method. Place it after the `connection` getter and before `withTenant`:

```ts
  /**
   * RES-243 drift sentinel: assert `app.current_tenant` still matches the
   * value bound at transaction start. Catches `SET LOCAL` / `RESET` forge
   * forms that `REVOKE EXECUTE` on `set_config` cannot block.
   *
   * Called at end of every `withTenant` / `withTenantId` / `withoutTenant`
   * callback before the result is returned, so a drift throws while
   * Drizzle still rolls the transaction back — the locally-computed
   * `result` is discarded and never reaches the caller.
   */
  async #assertGucUnchanged(tx: RestoTx, expected: string, scope: string): Promise<void> {
    const rows = await tx.execute<{ v: string | null }>(
      sql`SELECT current_setting('app.current_tenant', true) AS v`,
    );
    const actual = rows[0]?.v ?? '';
    if (actual !== expected) {
      throw new Error(
        `Tenant GUC drift detected in ${scope}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}. Transaction rolled back.`,
      );
    }
  }
```

- [ ] **Step 4.5: Wire the sentinel into `withTenant`**

Update `withTenant` body:

```ts
  async withTenant<T>(op: (tx: RestoTx, scoped: ScopedTx) => Promise<T>): Promise<T> {
    const ctx = requireTenantContext();
    return this.#db.transaction(async (tx) => {
      await tx.execute(sql`SELECT app_bind_tenant(${ctx.tenantId}, false)`);
      const result = await op(tx, new ScopedTx(tx, ctx.tenantId));
      await this.#assertGucUnchanged(tx, ctx.tenantId, 'withTenant');
      return result;
    });
  }
```

- [ ] **Step 4.6: Wire the sentinel into `withTenantId`**

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
      await tx.execute(sql`SELECT app_bind_tenant(${tenantId}, false)`);
      const result = await op(tx, new ScopedTx(tx, tenantId));
      await this.#assertGucUnchanged(tx, tenantId, 'withTenantId');
      return result;
    });
  }
```

- [ ] **Step 4.7: Wire the sentinel into `withoutTenant`**

```ts
  async withoutTenant<T>(reason: string, op: (tx: RestoTx) => Promise<T>): Promise<T> {
    if (reason.trim().length === 0) {
      throw new Error('withoutTenant(reason, op) requires a non-empty reason.');
    }
    logger.warn({ reason }, 'Running database operation without a tenant context (RLS bypass)');
    return this.#db.transaction(async (tx) => {
      await tx.execute(sql`SELECT app_bind_tenant('', true)`);
      const result = await op(tx);
      await this.#assertGucUnchanged(tx, '', 'withoutTenant');
      return result;
    });
  }
```

- [ ] **Step 4.8: Run the test — it should PASS now**

Run: `pnpm --filter @resto/db test -- --reporter=verbose -t "forge via SET LOCAL"`

Expected: PASS. Drift sentinel detects, throws, the result variable never reaches the test runner.

- [ ] **Step 4.9: Run the full suite**

Run: `pnpm --filter @resto/db test -- tenant-isolation.spec.ts`

Expected: all tests pass (7 original + 1 new forge test). If a legitimate test starts failing, the sentinel is too strict — investigate. Most likely cause: a seed flow inside `withoutTenant` that includes raw tx work; check the message — `expected '', got <uuid>` would indicate a re-bind in the seed.

- [ ] **Step 4.10: Commit**

```bash
git add packages/db/src/client.ts packages/db/test/integration/tenant-isolation.spec.ts
git commit -m "feat(db): RES-243 — add GUC drift sentinel + SET LOCAL forge test"
```

---

## Task 5: Add more drift-sentinel tests (RESET, system→tenant binding)

**Files:**

- Modify: `packages/db/test/integration/tenant-isolation.spec.ts`

- [ ] **Step 5.1: Add the `RESET` forge test**

Immediately after the SET LOCAL test added in Task 4:

```ts
it('RES-243: forge via RESET is caught by drift sentinel', async () => {
  const error = await runInTenantContext({ tenantId: tenantA }, () =>
    pg.db.withTenant(async (tx) => {
      await tx.execute(sql`RESET app.current_tenant`);
      return tx.select().from(schema.tenants);
    }),
  ).then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toMatch(/Tenant GUC drift detected/);
});
```

- [ ] **Step 5.2: Add the `binding inside withoutTenant` test**

Immediately after:

```ts
it('RES-243: binding a tenant inside withoutTenant is caught', async () => {
  // Outer `withoutTenant` expects current_tenant=''. If a callback rebinds
  // to a tenant uuid, the wrapper allows the transition (current was '')
  // but the outer drift sentinel catches it on exit.
  const error = await pg.db
    .withoutTenant('test cross-context binding', async (tx) => {
      await tx.execute(sql`SELECT app_bind_tenant(${tenantA}, false)`);
      return tx.select().from(schema.tenants);
    })
    .then(
      () => null,
      (e: unknown) => e,
    );
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toMatch(
    /Tenant GUC drift detected in withoutTenant/,
  );
});
```

- [ ] **Step 5.3: Run the new tests**

Run: `pnpm --filter @resto/db test -- --reporter=verbose -t "RES-243"`

Expected: 3 tests pass (SET LOCAL from Task 4, RESET, withoutTenant→bind).

- [ ] **Step 5.4: Run the full suite**

Run: `pnpm --filter @resto/db test -- tenant-isolation.spec.ts`

Expected: green.

- [ ] **Step 5.5: Commit**

```bash
git add packages/db/test/integration/tenant-isolation.spec.ts
git commit -m "test(db): RES-243 — cover RESET + cross-context binding"
```

---

## Task 6 (TDD): REVOKE `pg_catalog.set_config` migration

**Files:**

- Create: `packages/db/migrations/0023_revoke_set_config.sql`
- Create: `packages/db/sql/rollback/0023_revoke_set_config.down.sql`
- Modify: `packages/db/migrations/meta/_journal.json`
- Modify: `packages/db/test/integration/tenant-isolation.spec.ts`

- [ ] **Step 6.1: Add the failing test**

In `packages/db/test/integration/tenant-isolation.spec.ts`, after the tests added in Task 5, add:

```ts
it('RES-243: forge via set_config() is blocked at the role level', async () => {
  // After migration 0023, `pg_catalog.set_config(text, text, boolean)` is
  // REVOKED from PUBLIC. resto_app can no longer call set_config directly;
  // attempting to do so inside a withTenant block fails immediately with
  // SQLSTATE 42501 — the transaction rolls back before the drift sentinel
  // would have had a chance to fire.
  const error = await runInTenantContext({ tenantId: tenantA }, () =>
    pg.db.withTenant(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('app.current_tenant', ${tenantB}, true)`,
      );
      return tx.select().from(schema.tenants);
    }),
  ).then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(Error);
  const cause = (error as Error).cause as { code?: string } | undefined;
  expect(cause?.code).toBe('42501');
});
```

- [ ] **Step 6.2: Run the new test — it should FAIL**

Run: `pnpm --filter @resto/db test -- --reporter=verbose -t "blocked at the role level"`

Expected: FAIL. Without the REVOKE, the `set_config` call succeeds, the forge returns tenantB's rows, then the drift sentinel catches with the drift message. The test expects `cause.code === '42501'`, which is not the case → fails.

- [ ] **Step 6.3: Write the migration**

Create `packages/db/migrations/0023_revoke_set_config.sql`:

```sql
-- 0023_revoke_set_config.sql
-- RES-243: revoke EXECUTE on the function form of `set_config` so that
-- `resto_app` cannot bind GUCs directly. The SECURITY DEFINER wrapper
-- `app_bind_tenant` (introduced in migration 0022) is now the only path
-- and it raises on rebind to a different tenant.
--
-- `resto_auth` (BYPASSRLS Better Auth role per ADR-0013) does not call
-- set_config; it needs no replacement grant.

REVOKE EXECUTE ON FUNCTION pg_catalog.set_config(text, text, boolean) FROM PUBLIC;
```

- [ ] **Step 6.4: Append the journal entry**

In `packages/db/migrations/meta/_journal.json`, append after the `0022` entry:

```json
{
  "idx": 23,
  "version": "7",
  "when": <Date.now() output>,
  "tag": "0023_revoke_set_config",
  "breakpoints": true
}
```

Use a `when` larger than `0022`'s.

- [ ] **Step 6.5: Write the rollback SQL**

Create `packages/db/sql/rollback/0023_revoke_set_config.down.sql`:

```sql
-- Rollback for 0023_revoke_set_config.sql.
GRANT EXECUTE ON FUNCTION pg_catalog.set_config(text, text, boolean) TO PUBLIC;
```

- [ ] **Step 6.6: Run the new test — it should PASS now**

Run: `pnpm --filter @resto/db test -- --reporter=verbose -t "blocked at the role level"`

Expected: PASS. `set_config` throws SQLSTATE 42501; `cause.code === '42501'`.

- [ ] **Step 6.7: Run the full suite**

Run: `pnpm --filter @resto/db test -- tenant-isolation.spec.ts`

Expected: green. No regression — legitimate paths (`withTenant`, `withoutTenant`) go through the wrapper, not `set_config` directly.

- [ ] **Step 6.8: Commit**

```bash
git add packages/db/migrations/0023_revoke_set_config.sql \
        packages/db/migrations/meta/_journal.json \
        packages/db/sql/rollback/0023_revoke_set_config.down.sql \
        packages/db/test/integration/tenant-isolation.spec.ts
git commit -m "feat(db): RES-243 — revoke pg_catalog.set_config from PUBLIC"
```

---

## Task 7: Add wrapper-semantics tests (rebind different, idempotent same)

**Files:**

- Modify: `packages/db/test/integration/tenant-isolation.spec.ts`

- [ ] **Step 7.1: Add the rebind-different test**

After the tests added in Task 6:

```ts
it('RES-243: rebind to a different tenant via app_bind_tenant raises', async () => {
  const error = await runInTenantContext({ tenantId: tenantA }, () =>
    pg.db.withTenant(async (tx) => {
      await tx.execute(sql`SELECT app_bind_tenant(${tenantB}, false)`);
      return tx.select().from(schema.tenants);
    }),
  ).then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(Error);
  const cause = (error as Error).cause as
    | { code?: string; message?: string }
    | undefined;
  expect(cause?.code).toBe('42501');
  expect(cause?.message).toContain(tenantA);
  expect(cause?.message).toContain(tenantB);
});
```

- [ ] **Step 7.2: Add the idempotent-same test**

Immediately after:

```ts
it('RES-243: rebind to the same tenant via app_bind_tenant is idempotent', async () => {
  // Same-tenant rebind is a documented no-op of the wrapper contract;
  // exists so nested `withTenant` calls compose cleanly even though
  // current code has no such nesting.
  const rows = await runInTenantContext({ tenantId: tenantA }, () =>
    pg.db.withTenant(async (tx) => {
      await tx.execute(sql`SELECT app_bind_tenant(${tenantA}, false)`);
      return tx.select().from(schema.tenants);
    }),
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]?.id).toBe(tenantA);
});
```

- [ ] **Step 7.3: Run the new tests**

Run: `pnpm --filter @resto/db test -- --reporter=verbose -t "RES-243: rebind"`

Expected: both PASS.

- [ ] **Step 7.4: Run the full suite**

Run: `pnpm --filter @resto/db test -- tenant-isolation.spec.ts`

Expected: green.

- [ ] **Step 7.5: Commit**

```bash
git add packages/db/test/integration/tenant-isolation.spec.ts
git commit -m "test(db): RES-243 — cover wrapper rebind semantics"
```

---

## Task 8: Add preflight assertions

**Files:**

- Modify: `packages/db/src/preflight.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 8.1: Add error subclasses and `assertTenantLockInstalled`**

Open `packages/db/src/preflight.ts`. After the existing `assertNoRlsBypass` definition (~line 71), append:

```ts
/**
 * Error raised when the RES-243 GUC lock is not installed on the
 * connected database. Distinct subclass so the boot path can emit an
 * actionable "run `pnpm db:migrate`" message instead of a generic
 * undefined-function crash on the first request.
 */
export class TenantLockNotInstalledError extends Error {
  constructor(public readonly detail: string) {
    super(
      `RES-243 tenant GUC lock is not installed on the database: ${detail}. ` +
        'Run `pnpm db:migrate` (migrations 0022 + 0023) and verify ' +
        '`roles.sql` has been re-applied for resto_app.',
    );
    this.name = 'TenantLockNotInstalledError';
  }
}

/**
 * Verify that the SECURITY DEFINER wrapper `app_bind_tenant(text,boolean)`
 * exists and the current connection role has EXECUTE on it. Run at boot
 * alongside `assertNoRlsBypass` — if missing, the API refuses to start.
 */
export const assertTenantLockInstalled = async (url: string): Promise<void> => {
  const client = postgres(url, {
    max: 1,
    prepare: false,
    onnotice: () => undefined,
  });
  try {
    const fnRows = await client<{ exists: boolean }[]>`
      SELECT to_regprocedure('public.app_bind_tenant(text,boolean)') IS NOT NULL AS exists
    `;
    if (!fnRows[0]?.exists) {
      throw new TenantLockNotInstalledError(
        'app_bind_tenant(text,boolean) is missing',
      );
    }
    const grantRows = await client<{ has_exec: boolean }[]>`
      SELECT has_function_privilege(
        current_user,
        'public.app_bind_tenant(text,boolean)',
        'EXECUTE'
      ) AS has_exec
    `;
    if (!grantRows[0]?.has_exec) {
      throw new TenantLockNotInstalledError(
        'current_user lacks EXECUTE on app_bind_tenant(text,boolean)',
      );
    }
    logger.info(
      'Database preflight passed: app_bind_tenant wrapper installed and executable.',
    );
  } finally {
    await client.end({ timeout: 5 });
  }
};
```

- [ ] **Step 8.2: Add `assertSetConfigRevoked`**

Below the previous additions:

```ts
/**
 * Error raised when `pg_catalog.set_config(text,text,boolean)` is still
 * executable by the connected role — RES-243 expects the PUBLIC grant
 * to have been revoked.
 */
export class SetConfigNotRevokedError extends Error {
  constructor() {
    super(
      'RES-243: pg_catalog.set_config(text,text,boolean) is still ' +
        'executable by the application role. The structural lock against ' +
        'GUC re-bind is bypassed. Re-run `pnpm db:migrate` (migration 0023).',
    );
    this.name = 'SetConfigNotRevokedError';
  }
}

/**
 * Verify that the application role does NOT have EXECUTE on the
 * `set_config(text,text,boolean)` function. Defense A of RES-243.
 */
export const assertSetConfigRevoked = async (url: string): Promise<void> => {
  const client = postgres(url, {
    max: 1,
    prepare: false,
    onnotice: () => undefined,
  });
  try {
    const rows = await client<{ has_exec: boolean }[]>`
      SELECT has_function_privilege(
        current_user,
        'pg_catalog.set_config(text,text,boolean)',
        'EXECUTE'
      ) AS has_exec
    `;
    if (rows[0]?.has_exec) {
      throw new SetConfigNotRevokedError();
    }
    logger.info(
      'Database preflight passed: set_config is not executable by application role.',
    );
  } finally {
    await client.end({ timeout: 5 });
  }
};
```

- [ ] **Step 8.3: Re-export from `src/index.ts`**

Open `packages/db/src/index.ts`. Find the existing preflight export (run `grep -n 'preflight' packages/db/src/index.ts` if unsure). Extend it to include the new symbols. If the existing line is:

```ts
export { assertNoRlsBypass, RlsBypassError } from './preflight';
```

Replace with:

```ts
export {
  assertNoRlsBypass,
  assertSetConfigRevoked,
  assertTenantLockInstalled,
  RlsBypassError,
  SetConfigNotRevokedError,
  TenantLockNotInstalledError,
} from './preflight';
```

If preflight is not yet exported, add the block above.

- [ ] **Step 8.4: Run typecheck**

Run: `pnpm --filter @resto/db typecheck`

Expected: clean.

- [ ] **Step 8.5: Commit**

```bash
git add packages/db/src/preflight.ts packages/db/src/index.ts
git commit -m "feat(db): RES-243 — add tenant lock + set_config preflight assertions"
```

---

## Task 9: Wire preflight into the API bootstrap

**Files:**

- Modify: `apps/api/src/main.ts`

- [ ] **Step 9.1: Update imports**

Open `apps/api/src/main.ts`. The existing import at line 15 pulls `assertNoRlsBypass` from `@resto/db`. Extend it:

```ts
import {
  assertNoRlsBypass,
  assertSetConfigRevoked,
  assertTenantLockInstalled,
} from '@resto/db';
```

- [ ] **Step 9.2: Add the assertion calls**

At line 42 (or wherever `await assertNoRlsBypass(env.DATABASE_URL);` lives), add after it:

```ts
// RES-243: refuse to start if the GUC lock (app_bind_tenant wrapper +
// revoked set_config) is not installed. Catches mis-deploy where the
// new image rolls before `pnpm db:migrate` completes.
await assertTenantLockInstalled(env.DATABASE_URL);
await assertSetConfigRevoked(env.DATABASE_URL);
```

- [ ] **Step 9.3: Run typecheck**

Run: `pnpm --filter @resto/api typecheck`

Expected: clean.

- [ ] **Step 9.4: Build the API**

Run: `pnpm --filter @resto/api build`

Expected: clean.

- [ ] **Step 9.5: Commit**

```bash
git add apps/api/src/main.ts
git commit -m "feat(api): RES-243 — wire tenant lock preflight into bootstrap"
```

---

## Task 10: Add preflight tests

**Files:**

- Modify: `packages/db/test/integration/tenant-isolation.spec.ts`

- [ ] **Step 10.1: Import postgres at the top of the test file**

Open `packages/db/test/integration/tenant-isolation.spec.ts`. After the existing imports, add:

```ts
import postgres from 'postgres';
import {
  assertSetConfigRevoked,
  assertTenantLockInstalled,
  SetConfigNotRevokedError,
  TenantLockNotInstalledError,
} from '../../src/index';
```

The existing top-of-file imports include `describe`, `it`, `expect`, `sql`, etc. Verify by reading the first ~10 lines and merge carefully.

- [ ] **Step 10.2: Add a nested `describe` block for preflight**

Inside the outer `suite('Row-Level Security — tenant isolation', …)` block, immediately before its closing `});`, add:

```ts
describe('preflight (RES-243)', () => {
  it('assertTenantLockInstalled passes on a freshly-migrated DB', async () => {
    await expect(assertTenantLockInstalled(pg.url)).resolves.toBeUndefined();
  });

  it('assertTenantLockInstalled throws when the wrapper is dropped', async () => {
    const adminClient = postgres(pg.adminUrl, { max: 1, prepare: false });
    try {
      await adminClient`DROP FUNCTION IF EXISTS app_bind_tenant(text, boolean)`;
      await expect(assertTenantLockInstalled(pg.url)).rejects.toBeInstanceOf(
        TenantLockNotInstalledError,
      );
    } finally {
      // Restore so subsequent tests aren't poisoned (singleFork: true).
      await adminClient.unsafe(`
          CREATE OR REPLACE FUNCTION app_bind_tenant(p_tenant TEXT, p_is_system BOOLEAN)
          RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
          SET search_path = pg_catalog, public
          AS $func$
          DECLARE v_current TEXT := current_setting('app.current_tenant', true);
          BEGIN
            IF v_current IS NOT NULL AND v_current <> '' AND v_current <> p_tenant THEN
              RAISE EXCEPTION
                'app.current_tenant already bound to % — refusing to rebind to %',
                v_current, p_tenant USING ERRCODE = 'insufficient_privilege';
            END IF;
            PERFORM set_config('app.current_tenant', p_tenant, true);
            PERFORM set_config(
              'app.is_system',
              CASE WHEN p_is_system THEN 'true' ELSE 'false' END,
              true
            );
          END $func$;
        `);
      await adminClient`GRANT EXECUTE ON FUNCTION app_bind_tenant(text, boolean) TO resto_app`;
      await adminClient.end({ timeout: 5 });
    }
  });

  it('assertSetConfigRevoked passes on a freshly-migrated DB', async () => {
    await expect(assertSetConfigRevoked(pg.url)).resolves.toBeUndefined();
  });

  it('assertSetConfigRevoked throws when the PUBLIC grant is restored', async () => {
    const adminClient = postgres(pg.adminUrl, { max: 1, prepare: false });
    try {
      await adminClient`GRANT EXECUTE ON FUNCTION pg_catalog.set_config(text, text, boolean) TO PUBLIC`;
      await expect(assertSetConfigRevoked(pg.url)).rejects.toBeInstanceOf(
        SetConfigNotRevokedError,
      );
    } finally {
      await adminClient`REVOKE EXECUTE ON FUNCTION pg_catalog.set_config(text, text, boolean) FROM PUBLIC`;
      await adminClient.end({ timeout: 5 });
    }
  });
});
```

Notes:

- `adminClient.unsafe(sqlText)` is the postgres-js method for raw SQL with PL/pgSQL bodies (the tagged-template form `adminClient`…``doesn't handle multi-statement`DO $$` blocks the same way).
- The `$func$` dollar-quoted body avoids conflict with the surrounding `$$` if any.
- Vitest runs this suite with `singleFork: true` (per `vitest.config.ts`), so restoring state in the `finally` block is mandatory.

- [ ] **Step 10.3: Run the preflight describe block**

Run: `pnpm --filter @resto/db test -- --reporter=verbose -t "preflight \\(RES-243\\)"`

Expected: 4 tests pass.

- [ ] **Step 10.4: Run the full suite**

Run: `pnpm --filter @resto/db test -- tenant-isolation.spec.ts`

Expected: green.

- [ ] **Step 10.5: Commit**

```bash
git add packages/db/test/integration/tenant-isolation.spec.ts
git commit -m "test(db): RES-243 — preflight assertion coverage"
```

---

## Task 11: Add ESLint guard

**Files:**

- Modify: `apps/api/eslint.config.mjs`
- Modify: `packages/db/eslint.config.mjs`

- [ ] **Step 11.1: Merge `no-restricted-syntax` selectors in `apps/api/eslint.config.mjs`**

Open `apps/api/eslint.config.mjs`. The existing `no-restricted-syntax` block (ADR-0020 I-1 enforcement) covers `tx.select|insert|update|delete`. Add the RES-243 selectors to the **same** rule array (a flat-config block with the same `files` pattern would replace, not merge — so we extend the existing block in place).

Locate the block at ~line 58-70 (the one with selector `"CallExpression[callee.object.name='tx']…"`). Replace the entire `rules: { 'no-restricted-syntax': [...] }` with:

```js
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.name='tx'][callee.property.name=/^(select|insert|update|delete)$/]",
          message:
            'ADR-0020 I-1: direct tx.select/insert/update/delete bypasses ScopedTx auto-filter. Use scoped.selectFrom / insertInto / updateTable, or place this code in a *-drizzle.repository.ts where the rule is allow-listed (the adapter takes responsibility for the tenant filter).',
        },
        {
          selector: "Literal[value=/^app\\.(current_tenant|is_system)$/]",
          message:
            'RES-243: literal string `app.current_tenant` / `app.is_system` is reserved for packages/db internals. Use db.withTenant / withTenantId / withoutTenant.',
        },
        {
          selector: "TemplateElement[value.raw=/\\bset_config\\b/]",
          message:
            'RES-243: `set_config` is reserved for packages/db/src/client.ts. Use db.withTenant / withTenantId / withoutTenant.',
        },
        {
          selector: "Identifier[name='set_config']",
          message:
            'RES-243: `set_config` is reserved for packages/db/src/client.ts. Use db.withTenant / withTenantId / withoutTenant.',
        },
      ],
    },
```

The existing allowlist block (`files: ['src/contexts/**/infrastructure/*-drizzle.repository.ts', …], rules: { 'no-restricted-syntax': 'off' }`) continues to disable the rule entirely for those paths.

- [ ] **Step 11.2: Add the rule to `packages/db/eslint.config.mjs`**

Open `packages/db/eslint.config.mjs`. After the existing `src/cli/**/*.ts` block, insert:

```js
  {
    // RES-243: `app.current_tenant` / `app.is_system` literals and the
    // `set_config` identifier belong only inside `client.ts` and
    // `preflight.ts`. Anywhere else is a forge primitive or contract
    // violation.
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "Literal[value=/^app\\.(current_tenant|is_system)$/]",
          message:
            'RES-243: literal `app.current_tenant` / `app.is_system` belongs only in client.ts / preflight.ts.',
        },
        {
          selector: "TemplateElement[value.raw=/\\bset_config\\b/]",
          message: 'RES-243: `set_config` belongs only in client.ts.',
        },
        {
          selector: "Identifier[name='set_config']",
          message: 'RES-243: `set_config` belongs only in client.ts.',
        },
      ],
    },
  },
  {
    // Wrapper invocations and drift-sentinel query live here.
    files: ['src/client.ts', 'src/preflight.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    // Tests deliberately exercise the forge / forge-detection paths.
    files: ['test/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
```

- [ ] **Step 11.3: Run lint**

Run: `pnpm --filter @resto/api lint && pnpm --filter @resto/db lint`

Expected: clean. If a real violation surfaces in non-allowlisted code, inspect — likely a stale `set_config` usage that needs migration to `withTenant`.

- [ ] **Step 11.4: Negative check — confirm the rule fires**

Create a temporary file at `apps/api/src/_forge_check_temp.ts` (inside `src/` so ESLint picks it up):

```ts
import { sql } from 'drizzle-orm';
export const forge = () =>
  sql`SELECT set_config('app.current_tenant', '...', true)`;
```

Run: `pnpm --filter @resto/api lint -- src/_forge_check_temp.ts`

Expected: FAIL with at least one RES-243 message (matching `Literal` for the string, `TemplateElement` for `set_config`, or `Identifier` for `set_config`).

Delete the temp file after verification:

```sh
rm apps/api/src/_forge_check_temp.ts
```

- [ ] **Step 11.5: Commit**

```bash
git add apps/api/eslint.config.mjs packages/db/eslint.config.mjs
git commit -m "feat(api,db): RES-243 — ESLint guard for set_config / GUC literals"
```

---

## Task 12: Final touches — top-of-file doc, sanity grep, full verification

**Files:**

- Modify: `packages/db/src/client.ts` (doc only)

- [ ] **Step 12.1: Update the top-of-file doc on `TenantAwareDb`**

In `packages/db/src/client.ts`, replace the existing doc comment above `export class TenantAwareDb` (~line 151) with:

```ts
/**
 * Tenant-aware Drizzle client.
 *
 * Every operation runs inside a Postgres transaction with `app.current_tenant`
 * bound to the current `TenantContext.tenantId`, so RLS policies enforce
 * isolation at the database layer regardless of application bugs.
 *
 * Binding is funneled through the SECURITY DEFINER wrapper
 * `app_bind_tenant(text, boolean)` (RES-243). `resto_app` cannot call
 * `pg_catalog.set_config` directly — the PUBLIC grant is revoked. A
 * mismatch between the GUC value at bind time and at end-of-callback is
 * detected by `#assertGucUnchanged`, which throws and rolls back the
 * transaction so wrong-tenant rows never reach the caller.
 *
 * Use the `withoutTenant(reason, op)` escape hatch for system code that
 * legitimately needs to see across tenants (migrations, outbox dispatcher,
 * platform admin). Every bypass is logged with the reason; the same
 * wrapper enforces "no rebind" while the GUC is empty.
 *
 * The formal contract for the three methods is in RES-238 (separate PR).
 */
```

- [ ] **Step 12.2: Sanity grep**

From the repo root, run:

```sh
rg "set_config|app\.current_tenant" apps/api/src packages/db/src
```

Expected hits ONLY:

- `packages/db/src/client.ts` — wrapper invocations + drift-sentinel query
- `packages/db/src/preflight.ts` — `has_function_privilege` query

Anything else is a leak — fix the offender before merging.

- [ ] **Step 12.3: Run full lint + typecheck + test**

```sh
pnpm --filter @resto/db lint
pnpm --filter @resto/db typecheck
pnpm --filter @resto/db test
pnpm --filter @resto/api lint
pnpm --filter @resto/api typecheck
pnpm --filter @resto/api test:unit
```

Use `pnpm --filter @resto/api test` if `test:unit` isn't an Nx target.

Expected: every command green.

- [ ] **Step 12.4: Commit**

```bash
git add packages/db/src/client.ts
git commit -m "docs(db): RES-243 — document tenant lock contract on TenantAwareDb"
```

- [ ] **Step 12.5: Confirm with user before push**

Do NOT push without explicit user confirmation. When the user approves:

```bash
git push -u github-personal HEAD
```

Use the `github-personal` SSH alias per `~/.claude/CLAUDE.md`.

After push, ask whether to open a PR with `gh pr create`. Recommended title: `feat(db,api): RES-243 — harden withTenant against GUC re-bind`. Title-only convention (no body).

---

## Spec Coverage Check

| Spec section                                  | Task(s)                                    |
| --------------------------------------------- | ------------------------------------------ |
| Defense A — wrapper function                  | Tasks 1, 2, 3                              |
| Defense A — REVOKE set_config                 | Task 6                                     |
| Defense B — drift sentinel                    | Task 4                                     |
| Defense C — ESLint guard                      | Task 11                                    |
| Component 1: `app_bind_tenant` SQL            | Task 1                                     |
| Component 2: privilege migration              | Tasks 1, 6                                 |
| Component 3: client.ts rewrite                | Tasks 3, 4                                 |
| Component 4: preflight assertions             | Tasks 8, 9                                 |
| Component 5: integration tests #1-#8          | Tasks 4, 5, 6, 7                           |
| Component 6: preflight tests #9-#12           | Task 10                                    |
| Component 7: ESLint rule                      | Task 11                                    |
| roles.sql update                              | Task 2                                     |
| Top-of-file doc                               | Task 12                                    |
| Sanity grep                                   | Task 12                                    |
| Migration rollback SQL                        | Tasks 1, 6                                 |
| Migration ordering — code change leads REVOKE | Plan task ordering (1 → 2 → 3 → 4 → 5 → 6) |
