---
ticket: RES-243
adr: 0020 (I-1, I-6), 0021 (Tier 1)
tier: T1 — Multi-tenancy freeze
scope: packages/db/src/client.ts, packages/db/src/preflight.ts, packages/db/sql/roles.sql, packages/db/migrations/, packages/db/test/integration/tenant-isolation.spec.ts, apps/api/eslint.config.mjs
date: 2026-05-18
status: draft
---

# RES-243 — Harden `withTenant`: block in-transaction re-binding of `app.current_tenant`

## Problem

`withTenant` (`packages/db/src/client.ts:186-193`) sets `app.current_tenant` GUC via `SET LOCAL` once per transaction and trusts that nobody re-binds it. The integration test on `tenant-isolation.spec.ts:91-116` openly documents the inverse: any code path that can execute SQL inside a `withTenant` block can re-bind the GUC to another tenant and read/write across the tenancy boundary while RLS still passes. This is a real **tenant-escalation primitive**, not a theoretical concern. The current convention "reviewers reject `set_config` outside `client.ts`" (`packages/db/CLAUDE.md`) is enforcement by code review only.

## Threat model

Three forge vectors any code inside a `withTenant` callback could exploit:

1. **Function form** — `tx.execute(sql\`SELECT set_config('app.current_tenant', '<other>', true)\`)`
2. **SQL-command form** — `tx.execute(sql\`SET LOCAL app.current_tenant = '<other>'\`)`
3. **Reset form** — `tx.execute(sql\`RESET app.current_tenant\`)`

Postgres has no privilege mechanism to deny a role from executing the `SET LOCAL` / `RESET` commands on a custom GUC. `REVOKE EXECUTE` on `pg_catalog.set_config(text,text,boolean)` closes only vector (1). Vectors (2) and (3) require a different defense.

The threat we are realistically protecting against is **application bug / supply-chain accident**, not a determined inside attacker (who can run arbitrary SQL anyway). The acceptance bar: any of the three forge forms either (a) fails at the database with a permission error, or (b) is caught before the read result is returned to the caller, and the transaction is rolled back.

## Solution

Two complementary defenses combine into a single defense graph; neither stands alone.

### Defense A — Structural lock via SECURITY DEFINER wrapper + `set_config` revoke

A new SECURITY DEFINER function `app_bind_tenant(p_tenant TEXT, p_is_system BOOLEAN)` is the **only** sanctioned way to bind `app.current_tenant`. It runs with `resto_admin`'s privileges, so it can call `set_config` even though `resto_app` cannot. Before binding, it asserts the current GUC value is empty/unset or equal to the requested tenant — a mismatch raises `SQLSTATE 42501`.

`resto_app` loses `EXECUTE` on `pg_catalog.set_config(text,text,boolean)` (`REVOKE ... FROM PUBLIC` + selective `GRANT` to `resto_admin` only). Forge vector (1) becomes a permission error at the database.

This defense is **necessary but not sufficient** — it only closes vector (1).

### Defense B — Drift-detection sentinel before callback return

After `op(tx, scoped)` resolves but **before** the result is returned from `withTenant` (and therefore before Drizzle commits the transaction), `client.ts` runs one extra round-trip:

```sql
SELECT current_setting('app.current_tenant', true) AS v
```

If the value no longer matches the expected tenant, `client.ts` throws. Drizzle's transaction wrapper rolls back. The caller's `await` rejects — **the locally-computed `result` value is discarded and never returned**. This closes vectors (2) and (3).

The sentinel also catches vector (1) on the off-chance Defense A is somehow bypassed (privilege misconfiguration, future Postgres behavior change). Defense in depth.

### Defense C — ESLint guard (lightweight, source-level)

`no-restricted-syntax` rule in `apps/api/eslint.config.mjs` flags `set_config` and the literal strings `'app.current_tenant'` / `'app.is_system'` outside `packages/db/src/client.ts` and `packages/db/src/preflight.ts`. Source-level signal at PR time; structural defenses (A + B) remain the truth at runtime.

## Components

### 1. `app_bind_tenant` SECURITY DEFINER function

```sql
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

ALTER FUNCTION app_bind_tenant(TEXT, BOOLEAN) OWNER TO resto_admin;
REVOKE EXECUTE ON FUNCTION app_bind_tenant(TEXT, BOOLEAN) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION app_bind_tenant(TEXT, BOOLEAN) TO resto_app;
```

Notes:

- `SET search_path = pg_catalog, public` — mandatory for `SECURITY DEFINER` functions; defends against schema-injection by a non-admin caller. `pg_catalog` first so `set_config` resolves without ambiguity.
- The rebind check explicitly allows `v_current = ''` → bind tenant (this is the path `withoutTenant` → `withTenant` would take inside a nested savepoint; the outer `withoutTenant`'s drift-sentinel still catches the inversion on exit).
- Idempotent rebind to the same tenant (`v_current = p_tenant`) is a no-op (the `PERFORM set_config(..., p_tenant, ...)` reassigns the same value). Documented as part of the contract.

### 2. `set_config` privilege migration

```sql
REVOKE EXECUTE ON FUNCTION pg_catalog.set_config(text, text, boolean) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION pg_catalog.set_config(text, text, boolean) TO resto_admin;
-- resto_auth (BYPASSRLS Better Auth role, ADR-0013) does not call set_config — no grant.
-- resto_app gains access only via app_bind_tenant().
```

This lives in the same Drizzle migration file as the `app_bind_tenant` definition so the two changes are atomic on every environment.

`packages/db/sql/roles.sql` is updated in parallel — fresh dev / CI testcontainer bootstrap receives the same lockdown without running migrations.

### 3. `client.ts` rewrite

All three methods route binding through `app_bind_tenant` and add an end-of-callback drift check (`withTenant` / `withTenantId` only when `requireTenantContext()` was used; `withoutTenant` checks `''`).

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

The `#` private-field syntax is consistent with the existing `#db` / `#raw` fields. Drift-sentinel is a single helper, not duplicated.

### 4. Preflight assertions

`packages/db/src/preflight.ts` gains two new fail-closed checks called by `bootstrap()` alongside `assertNoRlsBypass`:

- `assertTenantLockInstalled(db)` — runs `SELECT to_regprocedure('public.app_bind_tenant(text,boolean)')` and `SELECT has_function_privilege(current_user, 'public.app_bind_tenant(text,boolean)', 'EXECUTE')`. Throws with a clear "run pnpm db:migrate" message if either fails.
- `assertSetConfigRevoked(db)` — runs `SELECT has_function_privilege(current_user, 'pg_catalog.set_config(text,text,boolean)', 'EXECUTE')`. Throws if `true` — privilege should be denied for `resto_app`.

Both protect the deploy ordering: if the new code ships before the migration applies, the API refuses to start with an actionable error instead of crashing on the first request with `UNDEFINED FUNCTION`.

### 5. Integration tests

`packages/db/test/integration/tenant-isolation.spec.ts` is amended. The existing forge test on line 91 is rewritten — it currently asserts the inverse (forge succeeds) and must now assert the forge is blocked.

| #   | Test name                                             | Setup                                                                                                       | Expectation                                                                                                                     |
| --- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `forge via set_config() is blocked at the role level` | `withTenant(A)` body calls `tx.execute(SELECT set_config('app.current_tenant', B, true))`                   | rejects with `Error` whose `cause.code === '42501'` (insufficient privilege)                                                    |
| 2   | `forge via SET LOCAL is caught by drift sentinel`     | `withTenant(A)` body calls `tx.execute(SET LOCAL app.current_tenant = B)`, then `tx.select().from(tenants)` | rejects with `Error.message` matching `/Tenant GUC drift detected/`; the locally-bound result variable never reaches the caller |
| 3   | `forge via RESET is caught by drift sentinel`         | `withTenant(A)` body calls `tx.execute(RESET app.current_tenant)`                                           | rejects with `Error.message` matching `/Tenant GUC drift detected/`                                                             |
| 4   | `rebind to a different tenant via wrapper raises`     | `withTenant(A)` body calls `tx.execute(SELECT app_bind_tenant(B, false))`                                   | rejects with `Error` whose `cause.code === '42501'`; message contains both tenant ids                                           |
| 5   | `rebind to the same tenant via wrapper is a no-op`    | `withTenant(A)` body calls `tx.execute(SELECT app_bind_tenant(A, false))`                                   | resolves; subsequent SELECT returns tenant A's rows unchanged                                                                   |
| 6   | `binding a tenant inside withoutTenant is caught`     | `withoutTenant('test')` body calls `tx.execute(SELECT app_bind_tenant(A, false))`                           | rejects with `Error.message` matching `/Tenant GUC drift detected/` (expected `''`, got A uuid)                                 |
| 7   | `existing withoutTenant happy path is unaffected`     | `withoutTenant('seed')` running multi-tenant INSERTs (the existing `beforeAll` shape)                       | resolves without error                                                                                                          |
| 8   | `all pre-existing tests in this suite still pass`     | unchanged                                                                                                   | green                                                                                                                           |

### 6. Preflight tests

Same file, separate `describe` block (or a new `preflight.spec.ts` if the count grows past four):

| #   | Test                                                       | Setup                                                                                              | Expectation                                                            |
| --- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 9   | `assertTenantLockInstalled passes after migrations`        | fresh testcontainer                                                                                | resolves silently                                                      |
| 10  | `assertTenantLockInstalled throws when wrapper is dropped` | `DROP FUNCTION app_bind_tenant(text,boolean)` then call assertion                                  | throws with message including `app_bind_tenant` and `pnpm db:migrate`  |
| 11  | `assertSetConfigRevoked passes after migrations`           | fresh testcontainer, resto_app session                                                             | resolves silently                                                      |
| 12  | `assertSetConfigRevoked throws when grant is restored`     | `GRANT EXECUTE ON FUNCTION pg_catalog.set_config(text,text,boolean) TO PUBLIC` then call assertion | throws with message including `set_config` and `privilege not revoked` |

### 7. ESLint rule

Both `apps/api/eslint.config.mjs` and `packages/db/eslint.config.mjs` exist (verified). A `no-restricted-syntax` entry is added to **both** (or hoisted to the root `eslint.config.mjs` if the plan finds a clean shared-config place — implementation-time call). The rule flags:

- Template-literal substrings matching `/\bset_config\b/` (covers any `sql\`... set_config ...\``)
- String literals exactly equal to `'app.current_tenant'` and `'app.is_system'`

Allowlist: `packages/db/src/client.ts`, `packages/db/src/preflight.ts`, and `packages/db/test/**` (tests deliberately use these to assert behavior).

Verified the same way as RES-239 / RES-235c: a small `/tmp/forge.ts` snippet calling `set_config` triggers the rule when piped through `pnpm eslint`.

## Acceptance criteria (from ticket, mapped to deliverables)

| Ticket criterion                                                                                           | Deliverable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Integration test "forging current_setting is blocked" passes for the right reason                          | Test #1 + #2 + #3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Re-bind via raw SQL inside `withTenant` callback is detected and rejected before any subsequent query runs | Drift sentinel (defense B) + structural lock (defense A); tests #1–#4. **Deviation from ticket-literal wording:** the sentinel runs at end of callback, not before each subsequent query inside the same callback. A Proxy-based per-`tx.execute` interceptor would match the literal wording but adds per-query overhead and complexity. The chosen end-of-callback shape still satisfies the underlying intent — the rejected promise prevents the callback's `result` from reaching the caller, so no wrong-tenant rows are returned. Side effects executed inside the callback before the sentinel fires (e.g. an outbound HTTP call based on a wrong-tenant SELECT) remain a separate concern, addressed by the I-1 / `ScopedTx` mandatory-filter contract rather than this hardening. |
| Drift-detection sentinel added before commit                                                               | `#assertGucUnchanged` invocation in `withTenant` / `withTenantId` / `withoutTenant`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Documentation of the locking mechanism added to RES-238 contract document                                  | Out of scope for this PR (RES-238 is a separate ticket). This PR adds a top-of-file doc-comment in `client.ts` summarizing the new contract; the formal contract document waits for RES-238 to land.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## Out of scope

- **RES-238 (formal `withTenant` / `withoutTenant` contract document).** Cross-referenced; not authored here.
- **Per-query drift check.** The end-of-callback check is sufficient for the application-bug threat model. Per-`tx.execute` interception via a Proxy would catch faster but adds round-trips and complexity for marginal benefit when the threat is accidental, not adversarial.
- **`assertNoRlsBypass` rework.** Existing assertion stays as-is; new assertions are additive.
- **Cross-tenant e2e probes.** Covered by RES-237.
- **`pg_catalog.set_config(text,text)` 2-arg overload.** That overload sets non-local (session-scoped) values. Not used by Resto code; if revoked from PUBLIC by accident in the future, it does not affect this design.

## Migration & rollback

**Forward**:

1. CI runs `pnpm db:migrate` against staging/prod before the new image rolls out.
2. Preflight (`assertTenantLockInstalled` + `assertSetConfigRevoked`) fails closed if the migration somehow did not apply, so the new image refuses to start.
3. New code paths route through `app_bind_tenant`.

**Backward** (Drizzle-kit migrations are forward-only — there is no `pnpm db:rollback`. A manual rollback script is committed alongside the forward migration in `packages/db/sql/rollback/`):

```sql
-- packages/db/sql/rollback/NNNN_tenant_guc_lock.down.sql
GRANT EXECUTE ON FUNCTION pg_catalog.set_config(text, text, boolean) TO PUBLIC;
DROP FUNCTION IF EXISTS app_bind_tenant(text, boolean);
```

Operator runbook entry: `psql -f packages/db/sql/rollback/NNNN_tenant_guc_lock.down.sql` followed by redeploy of the previous API image (which still calls `set_config` directly). The TypeScript drift-sentinel disappears with the code revert. Rollback is operationally cheap; the migration is two grants and one function definition.

## Risks

| Risk                                                                                                                         | Likelihood | Mitigation                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SET search_path` on the SECURITY DEFINER is incorrect → privilege escalation primitive of its own kind                      | Low        | `pg_catalog, public` is the standard Postgres-docs-recommended setting; integration test #4 exercises the function under `resto_app`                                                                                                                   |
| `current_setting('app.current_tenant', true)` returns differently across Postgres versions (NULL vs empty string when unset) | Low        | `?? ''` normalizes; tests exercise both initial (`NULL`) and explicit (`''`) states                                                                                                                                                                    |
| Hidden caller in `packages/db` other than `client.ts` calls `set_config`                                                     | Low        | grep already verified: only `client.ts` calls `set_config`; ESLint rule + tests prevent future regressions                                                                                                                                             |
| Resto tests outside `tenant-isolation.spec.ts` (`apps/api/test/e2e/**`) rely on now-disallowed nesting patterns              | Medium     | Spec section "edge cases" notes the audit step in the plan; if found, those tests are fixed (most likely a `withoutTenant` seed flow that calls a `withTenant` repo method, which is already a contract violation per the `resto-multi-tenancy` skill) |
| Production DB has unrelated `set_config` callers (extensions, monitoring tools) that lose access                             | Low        | All Postgres extensions Resto uses run as superuser during creation, not as `resto_app` at runtime; verified by inspecting `roles.sql` allowlist                                                                                                       |
| RES-235 `ScopedTx` builds Drizzle queries internally that call `set_config` — unlikely but theoretically possible            | Low        | `ScopedTx` source verified: it constructs `eq` / `and` predicates only, no GUC manipulation                                                                                                                                                            |

## Sanity grep — post-merge check

```sh
# Expected matches: only packages/db/src/client.ts (wrapper invocations)
# and packages/db/src/preflight.ts (assertion query).
rg "set_config\(|app\.current_tenant" apps/api/src packages/db/src
```

If any other hit appears, the ESLint rule or the spec scope missed something — fix before merge.

## References

- `docs/adr/0020-multi-tenancy-and-event-bus-invariants.md` — I-1, I-6 (canonical invariants)
- `docs/adr/0021-layered-milestone-strategy.md` — Tier 1 freeze criteria
- `.planning/reviews/2026-05-16-full-codebase/pkg-db-REVIEW.md` — original WR-01 finding (gitignored; local only)
- `packages/db/CLAUDE.md` § Repository / read-write — "planned hardening: REVOKE set_config from resto_app" (this spec realizes it)
- Linear ticket [RES-243](https://linear.app/restico/issue/RES-243/harden-withtenant-block-in-transaction-re-binding-of-appcurrent-tenant)
- Companion ticket [RES-238](https://linear.app/restico/issue/RES-238/specify-dbwithtenant-dbwithouttenant-contract-document) — formal contract document (separate PR)
