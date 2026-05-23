# RES-244 + RES-245 Implementation Plan — harden db:reset + role-provisioning

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close two pkg/db security findings in one PR: (RES-244) replace `db:reset` blocklist guard with allowlist + sentinel + host check + drop `DATABASE_URL` fallback; (RES-245) eliminate the SQL-injection primitive in role-provisioning via parameterized `CREATE/ALTER ROLE` from Node, whitelist-regex password validation, and a `assertRoleAttributes` defense-in-depth check called at the end of provisioning.

**Architecture:** All changes in `@resto/db`. RES-244 factors guard logic into a pure `cli/reset-guards.ts` module (testable without mocking `process.exit`) and rewrites `cli/reset.ts` to wire them. RES-245 removes the placeholder-substitution DO-block in SQL files (CREATE/ALTER ROLE moves to Node via postgres-js tagged templates), adds a shared `internal/password.ts` whitelist validator, and adds `assertRoleAttributes` + `RoleAttributeMismatchError` to `preflight.ts`. Two fixture passwords need a bump (one in pkg/db, one in apps/api e2e setup).

**Tech Stack:** TypeScript strict, postgres-js (parameterized via tagged template literals), Vitest, Postgres 16 testcontainer for integration tests.

**Spec:** `docs/superpowers/specs/2026-05-23-res-244-245-db-cli-hardening-design.md`

---

## File map

**RES-244 — one commit:**

- Create: `packages/db/src/cli/reset-guards.ts` — pure guard functions, throws on bad input (no `process.exit`).
- Modify: `packages/db/src/cli/reset.ts` — rewrite `main` to wire the pure guards, drop `DATABASE_URL` fallback, exit on caught error.
- Create: `packages/db/test/unit/cli-reset-guards.spec.ts` — 6 unit tests for the pure guards.

**RES-245 — one commit (more files but one logical migration):**

- Create: `packages/db/src/internal/password.ts` — shared `validateRolePassword` whitelist validator.
- Create: `packages/db/test/unit/password-validation.spec.ts` — 12+ unit tests.
- Modify: `packages/db/src/preflight.ts` — add `assertRoleAttributes` + `RoleAttributeMismatchError`.
- Modify: `packages/db/src/roles.ts` — parameterized `CREATE/ALTER ROLE`; call `validateRolePassword` + `assertRoleAttributes`; load grants SQL.
- Modify: `packages/db/src/auth-role.ts` — same pattern.
- Modify: `packages/db/sql/roles.sql` — remove DO block (CREATE/ALTER ROLE moves to Node); keep grants + DEFAULT PRIVILEGES + `app_bind_tenant` grant.
- Modify: `packages/db/sql/auth-role.sql` — remove DO block; keep grants + DEFAULT PRIVILEGES.
- Modify: `packages/db/test/setup.ts:25` — bump `APP_ROLE_PASSWORD` to ≥16 chars matching whitelist.
- Modify: `apps/api/test/e2e/with-real-stack.setup.ts:25-26` — bump `APP_ROLE_PASSWORD` + `AUTH_ROLE_PASSWORD` to ≥16 chars.
- Create: `packages/db/test/integration/role-provisioning.spec.ts` — end-to-end role-provisioning + attribute-assertion integration tests.

**No changes to:**

- `apps/api/test/e2e/{tenants-controller,identity-bootstrap,identity-smoke,me-brands,auth-brute-force}.e2e.spec.ts` — verified during planning; all use passwords ≥16 chars matching whitelist.
- `infra/docker/postgres/init/02-app-role.sql` — out of scope per spec (runs once at container creation with hardcoded dev password; injection vector contained).

---

## Task 1 — RES-244: pure guards + rewrite reset.ts + tests (one commit)

**Files:**

- Create: `packages/db/src/cli/reset-guards.ts`
- Modify: `packages/db/src/cli/reset.ts`
- Create: `packages/db/test/unit/cli-reset-guards.spec.ts`

The current `reset.ts` mixes guard logic with `process.exit` calls — not unit-testable without mocking `process.exit`. Factor the guards into a pure module that throws on bad input; the CLI shell catches the throw, logs, and exits. This makes the guards trivially testable.

- [ ] **Step 1.1: Write the failing unit tests**

Create `packages/db/test/unit/cli-reset-guards.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  assertNodeEnvAllowed,
  assertConfirmationProvided,
  assertHostAllowed,
  ResetGuardError,
} from '../../src/cli/reset-guards';

describe('cli/reset-guards', () => {
  describe('assertNodeEnvAllowed', () => {
    it('accepts development', () => {
      expect(() => assertNodeEnvAllowed('development')).not.toThrow();
    });
    it('accepts test', () => {
      expect(() => assertNodeEnvAllowed('test')).not.toThrow();
    });
    it('rejects production', () => {
      expect(() => assertNodeEnvAllowed('production')).toThrow(ResetGuardError);
      expect(() => assertNodeEnvAllowed('production')).toThrow(/allowlist/);
    });
    it('rejects unset', () => {
      expect(() => assertNodeEnvAllowed(undefined)).toThrow(/allowlist/);
    });
    it('rejects typo "prod"', () => {
      expect(() => assertNodeEnvAllowed('prod')).toThrow(/allowlist/);
    });
  });

  describe('assertConfirmationProvided', () => {
    it('accepts the literal sentence', () => {
      expect(() =>
        assertConfirmationProvided('yes-wipe-my-dev-db'),
      ).not.toThrow();
    });
    it('rejects empty / unset', () => {
      expect(() => assertConfirmationProvided(undefined)).toThrow(
        /RESTO_CONFIRM_RESET/,
      );
      expect(() => assertConfirmationProvided('')).toThrow(
        /RESTO_CONFIRM_RESET/,
      );
    });
    it('rejects "1" (a boolean-style toggle would be too easy)', () => {
      expect(() => assertConfirmationProvided('1')).toThrow(
        /RESTO_CONFIRM_RESET/,
      );
    });
    it('rejects close-but-wrong value', () => {
      expect(() => assertConfirmationProvided('yes-wipe-my-db')).toThrow(
        /RESTO_CONFIRM_RESET/,
      );
    });
  });

  describe('assertHostAllowed', () => {
    it('accepts localhost', () => {
      expect(() =>
        assertHostAllowed('postgres://x@localhost:5432/y'),
      ).not.toThrow();
    });
    it('accepts 127.0.0.1', () => {
      expect(() =>
        assertHostAllowed('postgres://x@127.0.0.1:5432/y'),
      ).not.toThrow();
    });
    it('accepts the docker-compose hostname "postgres"', () => {
      expect(() =>
        assertHostAllowed('postgres://x@postgres:5432/y'),
      ).not.toThrow();
    });
    it('rejects an external hostname', () => {
      expect(() =>
        assertHostAllowed('postgres://x@db.example.com:5432/y'),
      ).toThrow(/allowlist/);
    });
    it('rejects an invalid URL', () => {
      expect(() => assertHostAllowed('not a url')).toThrow(/valid URL/);
    });
    it('rejects undefined URL', () => {
      expect(() => assertHostAllowed(undefined)).toThrow(
        /DATABASE_ADMIN_URL is required/,
      );
    });
  });
});
```

- [ ] **Step 1.2: Run test, verify it fails**

Run: `pnpm --filter @resto/db exec vitest run test/unit/cli-reset-guards.spec.ts`

Expected: tests FAIL because the module doesn't exist (`Cannot find module '../../src/cli/reset-guards'`).

- [ ] **Step 1.3: Create the pure guards module**

Create `packages/db/src/cli/reset-guards.ts`:

```ts
const ALLOWED_NODE_ENVS = ['development', 'test'] as const;
const CONFIRMATION_VAR = 'RESTO_CONFIRM_RESET';
const CONFIRMATION_VALUE = 'yes-wipe-my-dev-db';
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', 'postgres']);

/**
 * Thrown by any of the `db:reset` guards when their precondition fails.
 * The CLI shell catches this and exits 1 after logging the message.
 * Pure-function design keeps the guards unit-testable without mocking
 * `process.exit`.
 */
export class ResetGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResetGuardError';
  }
}

/**
 * Layer 1: NODE_ENV allowlist. Anything other than the listed values
 * — including unset, `prod`, `live`, typos — refused.
 */
export const assertNodeEnvAllowed = (nodeEnv: string | undefined): void => {
  if (!nodeEnv || !(ALLOWED_NODE_ENVS as readonly string[]).includes(nodeEnv)) {
    throw new ResetGuardError(
      `db:reset refused: NODE_ENV must be one of ${ALLOWED_NODE_ENVS.join('/')} ` +
        `(got ${JSON.stringify(nodeEnv ?? '<unset>')}). This is an allowlist, ` +
        `not a blocklist — typos and unset values are refused.`,
    );
  }
};

/**
 * Layer 2: Confirmation sentinel. Literal sentence value (not a boolean
 * toggle) to defeat muscle-memory `export ${VAR}=1` in a `.bashrc`.
 */
export const assertConfirmationProvided = (value: string | undefined): void => {
  if (value !== CONFIRMATION_VALUE) {
    throw new ResetGuardError(
      `db:reset refused: ${CONFIRMATION_VAR} must equal "${CONFIRMATION_VALUE}" ` +
        `(got ${JSON.stringify(value ?? '<unset>')}). ` +
        `Re-run with: ${CONFIRMATION_VAR}=${CONFIRMATION_VALUE} pnpm db:reset`,
    );
  }
};

/**
 * Layer 3: Host allowlist. The URL must be a valid Postgres URL whose
 * hostname is in the dev-host allowlist. No fallback to DATABASE_URL —
 * symmetry with packages/db/CLAUDE.md § CLI rule for db:migrate.
 */
export const assertHostAllowed = (url: string | undefined): void => {
  if (!url) {
    throw new ResetGuardError(
      'db:reset refused: DATABASE_ADMIN_URL is required ' +
        '(no fallback to DATABASE_URL; that fallback masks "your terminal ' +
        'is pointed at prod" misconfigurations).',
    );
  }
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new ResetGuardError(
      'db:reset refused: DATABASE_ADMIN_URL is not a valid URL.',
    );
  }
  if (!ALLOWED_HOSTS.has(host)) {
    throw new ResetGuardError(
      `db:reset refused: host ${JSON.stringify(host)} not in dev-host ` +
        `allowlist [${[...ALLOWED_HOSTS].join(', ')}]. Set DATABASE_ADMIN_URL ` +
        `to a local Postgres.`,
    );
  }
};
```

- [ ] **Step 1.4: Run tests, verify green**

Run: `pnpm --filter @resto/db exec vitest run test/unit/cli-reset-guards.spec.ts`

Expected: all 14 tests PASS.

- [ ] **Step 1.5: Rewrite `cli/reset.ts` to use the pure guards**

Replace the current 38-line `packages/db/src/cli/reset.ts` with:

```ts
import postgres from 'postgres';
import { logger } from '../logger';
import {
  assertConfirmationProvided,
  assertHostAllowed,
  assertNodeEnvAllowed,
  ResetGuardError,
} from './reset-guards';

const CONFIRMATION_VAR = 'RESTO_CONFIRM_RESET';

/**
 * Drop and recreate the `public` schema, then re-run migrations. Dev only.
 *
 * Three layers of defense via `cli/reset-guards.ts` (testable without
 * mocking `process.exit`):
 *   1. `NODE_ENV` must be `development` or `test` (allowlist).
 *   2. `RESTO_CONFIRM_RESET=yes-wipe-my-dev-db` literal value required.
 *   3. `DATABASE_ADMIN_URL` host must be in {localhost, 127.0.0.1, postgres}.
 *
 * No fallback to `DATABASE_URL` — operators must explicitly point at the
 * admin URL.
 */
const main = async (): Promise<void> => {
  assertNodeEnvAllowed(process.env.NODE_ENV);
  assertConfirmationProvided(process.env[CONFIRMATION_VAR]);

  const url = process.env.DATABASE_ADMIN_URL;
  assertHostAllowed(url);

  // assertHostAllowed proves `url` is a non-empty valid URL — TS doesn't
  // narrow it via the assert because the guard is in another module.
  const adminUrl = url as string;
  const client = postgres(adminUrl, { max: 1, prepare: false });

  try {
    logger.warn('Dropping public schema and recreating…');
    await client.unsafe(
      'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;',
    );
    logger.info('Schema reset complete. Run `pnpm db:migrate` next.');
  } finally {
    await client.end({ timeout: 5 });
  }
};

main().catch((err: unknown) => {
  if (err instanceof ResetGuardError) {
    // Guard failures get a clean one-line error; full stack trace would
    // bury the actionable message.
    logger.error(err.message);
  } else {
    logger.error({ err }, 'Reset failed.');
  }
  process.exit(1);
});
```

- [ ] **Step 1.6: Run typecheck + lint + db unit tests**

Run: `pnpm exec nx run db:typecheck && pnpm exec nx run db:lint && pnpm --filter @resto/db exec vitest run test/unit`

Expected: ALL pass. The new unit tests should all be green; existing unit tests (e.g., `context.spec.ts`) should be unaffected.

- [ ] **Step 1.7: Commit**

```bash
git add packages/db/src/cli/reset.ts packages/db/src/cli/reset-guards.ts packages/db/test/unit/cli-reset-guards.spec.ts
git commit -m "fix(db): harden db:reset with NODE_ENV allowlist + RESTO_CONFIRM_RESET sentinel + host allowlist (RES-244)"
```

---

## Task 2 — RES-245: parameterize SQL + whitelist password + role-attribute assertion (one commit)

**Files (all in one atomic commit):**

- Create: `packages/db/src/internal/password.ts`
- Create: `packages/db/test/unit/password-validation.spec.ts`
- Modify: `packages/db/src/preflight.ts` (add `assertRoleAttributes` + `RoleAttributeMismatchError`)
- Modify: `packages/db/src/roles.ts` (parameterized + validation + assertion)
- Modify: `packages/db/src/auth-role.ts` (same)
- Modify: `packages/db/sql/roles.sql` (drop DO block)
- Modify: `packages/db/sql/auth-role.sql` (drop DO block)
- Modify: `packages/db/test/setup.ts:25` (fixture password bump)
- Modify: `apps/api/test/e2e/with-real-stack.setup.ts:25-26` (fixture passwords bump)
- Create: `packages/db/test/integration/role-provisioning.spec.ts`

Many files, one logical change: the migration from string-interpolation SQL to parameterized SQL + defense-in-depth attribute assertion. Splitting would leave half-migrated states (e.g., the SQL files have the placeholder removed but the Node code still tries to substitute, or vice versa). The TDD discipline is via the order of sub-steps within this task.

- [ ] **Step 2.1: Write failing tests for `validateRolePassword`**

Create `packages/db/test/unit/password-validation.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { validateRolePassword } from '../../src/internal/password';

describe('validateRolePassword', () => {
  describe('accepts', () => {
    it('a 16-char alphanumeric password', () => {
      expect(() =>
        validateRolePassword('test', 'abcdef1234567890'),
      ).not.toThrow();
    });
    it('a 128-char password (max length)', () => {
      expect(() => validateRolePassword('test', 'a'.repeat(128))).not.toThrow();
    });
    it('a mix of allowed punctuation', () => {
      expect(() =>
        validateRolePassword('test', 'A1b2!@#$%^&*()_+-=ab'),
      ).not.toThrow();
    });
  });

  describe('rejects by length', () => {
    it('empty password', () => {
      expect(() => validateRolePassword('test', '')).toThrow(/length=0/);
    });
    it('15-char password (one short)', () => {
      expect(() => validateRolePassword('test', 'a'.repeat(15))).toThrow(
        /length=15/,
      );
    });
    it('129-char password (one long)', () => {
      expect(() => validateRolePassword('test', 'a'.repeat(129))).toThrow(
        /length=129/,
      );
    });
  });

  describe('rejects SQL-injection vectors', () => {
    it('newline', () => {
      expect(() =>
        validateRolePassword('test', 'abcdef1234567890\nALTER'),
      ).toThrow(/whitelist/i);
    });
    it('carriage return', () => {
      expect(() =>
        validateRolePassword('test', 'abcdef1234567890\rALTER'),
      ).toThrow(/whitelist/i);
    });
    it('null byte', () => {
      expect(() =>
        validateRolePassword('test', 'abcdef1234567890\0ALTER'),
      ).toThrow(/whitelist/i);
    });
    it("single quote (')", () => {
      expect(() =>
        validateRolePassword('test', "abcdef1234567890'OR1=1"),
      ).toThrow(/whitelist/i);
    });
    it('backslash', () => {
      expect(() =>
        validateRolePassword('test', 'abcdef1234567890\\ALTER'),
      ).toThrow(/whitelist/i);
    });
    it('SQL line comment (--)', () => {
      expect(() =>
        validateRolePassword('test', 'abcdef1234567890--ALTER'),
      ).toThrow(/whitelist/i);
    });
    it('SQL block comment (/*)', () => {
      expect(() =>
        validateRolePassword('test', 'abcdef1234567890/*ALTER*/'),
      ).toThrow(/whitelist/i);
    });
    it('semicolon', () => {
      expect(() =>
        validateRolePassword('test', 'abcdef1234567890;ALTER'),
      ).toThrow(/whitelist/i);
    });
    it('space', () => {
      expect(() =>
        validateRolePassword('test', 'abcdef1234567890 ALTER'),
      ).toThrow(/whitelist/i);
    });
    it('tab', () => {
      expect(() =>
        validateRolePassword('test', 'abcdef1234567890\tALTER'),
      ).toThrow(/whitelist/i);
    });
    it('non-ASCII', () => {
      expect(() => validateRolePassword('test', 'abcdef1234567890é')).toThrow(
        /whitelist/i,
      );
    });
  });

  describe('security — error never leaks the raw password', () => {
    it("doesn't include the raw value when rejecting whitespace", () => {
      const raw = "abcdef1234567890'; DROP TABLE users; --";
      let captured: string | undefined;
      try {
        validateRolePassword('test', raw);
      } catch (err) {
        captured = (err as Error).message;
      }
      expect(captured).toBeDefined();
      expect(captured).not.toContain(raw);
      expect(captured).not.toContain('DROP TABLE');
      expect(captured).toContain('sanitised');
    });
  });

  describe('error message includes purpose context', () => {
    it('names the purpose passed in', () => {
      expect(() => validateRolePassword('provisionAppRole', 'short')).toThrow(
        /provisionAppRole/,
      );
    });
  });
});
```

- [ ] **Step 2.2: Run test, verify it fails**

Run: `pnpm --filter @resto/db exec vitest run test/unit/password-validation.spec.ts`

Expected: tests FAIL because `internal/password.ts` doesn't exist.

- [ ] **Step 2.3: Create `validateRolePassword`**

Create `packages/db/src/internal/password.ts`:

```ts
/**
 * Whitelist regex for role-provisioning passwords.
 *
 * Allowed characters: ASCII alphanumerics + `!@#$%^&*()_+-=`.
 * Length: 16-128 chars.
 *
 * The character class is intentionally narrow. The point isn't that
 * other characters are dangerous in a parameterized statement (they
 * aren't — postgres-js binds the password via the wire protocol). The
 * point is that narrow validation is cheaper to reason about than broad
 * with carve-outs, and it provides defense-in-depth if a future caller
 * accidentally interpolates the password into raw SQL.
 *
 * Excluded characters that would otherwise enable SQL/shell injection:
 * newline, CR, null byte, single-quote, backslash, `--`, `/*`,
 * semicolon, whitespace, non-ASCII.
 */
const ROLE_PASSWORD_RE = /^[A-Za-z0-9!@#$%^&*()_+\-=]{16,128}$/;

export const validateRolePassword = (purpose: string, pwd: string): void => {
  if (!ROLE_PASSWORD_RE.test(pwd)) {
    throw new Error(
      `${purpose}: password must match /^[A-Za-z0-9!@#$%^&*()_+\\-=]{16,128}$/. ` +
        `Whitelist excludes newline, CR, null byte, single-quote, backslash, ` +
        `'--', '/*', semicolons, whitespace, and other SQL-injection vectors. ` +
        `Got length=${pwd.length} (sanitised; raw value not logged).`,
    );
  }
};
```

- [ ] **Step 2.4: Run tests, verify green**

Run: `pnpm --filter @resto/db exec vitest run test/unit/password-validation.spec.ts`

Expected: all ~20 tests PASS.

- [ ] **Step 2.5: Add `assertRoleAttributes` + `RoleAttributeMismatchError` to preflight.ts**

Edit `packages/db/src/preflight.ts`. Append at the end of the file:

```ts
/**
 * Thrown when a provisioned role does not have the expected attribute
 * set. Defense-in-depth: catches anyone bypassing `provisionAppRole` /
 * `provisionAuthRole` (hand-crafted SQL, an attacker who slipped a
 * privilege escalation in, etc.).
 */
export class RoleAttributeMismatchError extends Error {
  constructor(
    public readonly role: string,
    public readonly expected: Readonly<Record<string, boolean>>,
    public readonly actual: Readonly<Record<string, boolean>>,
  ) {
    super(
      `Role "${role}" has unexpected attributes. ` +
        `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}. ` +
        `Provisioning was likely bypassed or tampered with — refuse to proceed.`,
    );
    this.name = 'RoleAttributeMismatchError';
  }
}

interface ExpectedRoleAttributes {
  readonly rolsuper: boolean;
  readonly rolbypassrls: boolean;
  readonly rolcreaterole: boolean;
  readonly rolcreatedb: boolean;
}

/**
 * Verify that a named role has the expected attributes. Called at the
 * end of `provisionAppRole` / `provisionAuthRole` as defense-in-depth.
 */
export const assertRoleAttributes = async (
  client: Sql,
  roleName: string,
  expected: ExpectedRoleAttributes,
): Promise<void> => {
  const rows = await client<(ExpectedRoleAttributes & { rolname: string })[]>`
    SELECT rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb
    FROM pg_roles
    WHERE rolname = ${roleName}
  `;
  const row = rows[0];
  if (!row) {
    throw new Error(`assertRoleAttributes: role "${roleName}" does not exist.`);
  }
  const { rolname: _ignored, ...actual } = row;
  for (const key of Object.keys(expected) as (keyof ExpectedRoleAttributes)[]) {
    if (actual[key] !== expected[key]) {
      throw new RoleAttributeMismatchError(roleName, expected, actual);
    }
  }
};
```

- [ ] **Step 2.6: Update SQL files — drop DO blocks**

Replace `packages/db/sql/roles.sql` with:

```sql
-- =============================================================================
-- Resto runtime role provisioning — GRANTS ONLY.
--
-- The `resto_app` role itself is now CREATED/ALTERED by the Node helper
-- in `packages/db/src/roles.ts` via parameterized SQL (postgres-js
-- tagged template; eliminates the SQL-injection primitive from password
-- handling — RES-245). This file is the static-DDL grants block that
-- follows role creation.
--
-- Idempotent. Used by:
--   • test container setup   (packages/db/src/roles.ts)
--   • production runbook     (docs/runbooks/database-roles.md)
-- =============================================================================

GRANT USAGE ON SCHEMA public TO resto_app;

-- DELETE intentionally omitted: domain rules forbid hard deletes (use
-- soft-delete via `archived_at`). Future GC jobs run under their own
-- privileged role rather than reusing the runtime grant.
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO resto_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO resto_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO resto_app;

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

-- Future tables / sequences / functions created by the admin role inherit
-- the same grants automatically — operators do not need to remember to
-- re-grant after every migration.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO resto_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO resto_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO resto_app;
```

Replace `packages/db/sql/auth-role.sql` with:

```sql
-- =============================================================================
-- Resto auth runtime role provisioning — GRANTS ONLY.
--
-- The `resto_auth` role itself is now CREATED/ALTERED by the Node helper
-- in `packages/db/src/auth-role.ts` via parameterized SQL (RES-245).
-- This file is the static-DDL grants block that follows role creation.
--
-- `resto_auth` has BYPASSRLS so BA admin/runtime calls (organization
-- plugin's cross-tenant member/invitation queries, dynamicAccessControl
-- role admin) work against the per-tenant RLS policies in migration 0005.
--
-- The application's regular runtime role (`resto_app`) remains
-- NOBYPASSRLS so business queries are RLS-bound to current_tenant_id().
-- =============================================================================

GRANT USAGE ON SCHEMA public TO resto_auth;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO resto_auth;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO resto_auth;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO resto_auth;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO resto_auth;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO resto_auth;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO resto_auth;
```

- [ ] **Step 2.7: Rewrite `packages/db/src/roles.ts`**

Replace the entire file with:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Sql } from 'postgres';
import { validateRolePassword } from './internal/password';
import { assertRoleAttributes } from './preflight';

const GRANTS_SQL_PATH = resolve(import.meta.dirname, '..', 'sql', 'roles.sql');

/**
 * Provision the `resto_app` runtime role on the connected database.
 *
 * Caller must connect as a role with privileges to `CREATE ROLE` / `GRANT`
 * — typically the bootstrap superuser (dev) or `resto_admin` (production).
 * Idempotent: safe to re-run; password is updated to whatever is supplied.
 *
 * Password handling is parameterized via postgres-js tagged template
 * (RES-245); no SQL string interpolation. `validateRolePassword`
 * additionally enforces a strict whitelist as defense-in-depth.
 * `assertRoleAttributes` verifies the resulting role has no
 * SUPERUSER / BYPASSRLS / CREATEROLE / CREATEDB attributes.
 */
export const provisionAppRole = async (
  client: Sql,
  options: { appPassword: string },
): Promise<void> => {
  validateRolePassword('provisionAppRole', options.appPassword);

  const rows = await client<{ exists: boolean }[]>`
    SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'resto_app') AS exists
  `;
  if (rows[0]?.exists) {
    await client`
      ALTER ROLE resto_app WITH LOGIN NOSUPERUSER NOBYPASSRLS
      PASSWORD ${options.appPassword}
    `;
  } else {
    await client`
      CREATE ROLE resto_app WITH LOGIN NOSUPERUSER NOBYPASSRLS
      PASSWORD ${options.appPassword}
    `;
  }

  await client.unsafe(readFileSync(GRANTS_SQL_PATH, 'utf8'));

  await assertRoleAttributes(client, 'resto_app', {
    rolsuper: false,
    rolbypassrls: false,
    rolcreaterole: false,
    rolcreatedb: false,
  });
};

/**
 * Resolved name of the runtime role provisioned by `provisionAppRole`.
 * Exported so callers (tests, runbook tooling) can build a connection
 * URL without hard-coding the literal in a second place.
 */
export const RESTO_APP_ROLE = 'resto_app';
```

- [ ] **Step 2.8: Rewrite `packages/db/src/auth-role.ts`**

Replace the entire file with:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Sql } from 'postgres';
import { validateRolePassword } from './internal/password';
import { assertRoleAttributes } from './preflight';

const GRANTS_SQL_PATH = resolve(
  import.meta.dirname,
  '..',
  'sql',
  'auth-role.sql',
);

/**
 * Provision the `resto_auth` BYPASSRLS role for Better Auth's drizzle
 * client. Mirrors `provisionAppRole` but with BYPASSRLS. Caller must be
 * connected as a role with CREATE ROLE / GRANT privileges (bootstrap
 * superuser in dev; resto_admin in prod).
 *
 * Idempotent. Password handling is parameterized via postgres-js tagged
 * template (RES-245); no SQL string interpolation.
 * `validateRolePassword` enforces a strict whitelist as defense-in-depth.
 * `assertRoleAttributes` verifies the resulting role has BYPASSRLS but
 * no SUPERUSER / CREATEROLE / CREATEDB attributes.
 */
export const provisionAuthRole = async (
  client: Sql,
  options: { authPassword: string },
): Promise<void> => {
  validateRolePassword('provisionAuthRole', options.authPassword);

  const rows = await client<{ exists: boolean }[]>`
    SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'resto_auth') AS exists
  `;
  if (rows[0]?.exists) {
    await client`
      ALTER ROLE resto_auth WITH LOGIN NOSUPERUSER BYPASSRLS
      PASSWORD ${options.authPassword}
    `;
  } else {
    await client`
      CREATE ROLE resto_auth WITH LOGIN NOSUPERUSER BYPASSRLS
      PASSWORD ${options.authPassword}
    `;
  }

  await client.unsafe(readFileSync(GRANTS_SQL_PATH, 'utf8'));

  await assertRoleAttributes(client, 'resto_auth', {
    rolsuper: false,
    rolbypassrls: true,
    rolcreaterole: false,
    rolcreatedb: false,
  });
};

/**
 * Resolved name of the BYPASSRLS role provisioned by `provisionAuthRole`.
 * Exported so callers (tests, runbook tooling) can build a connection URL
 * without hard-coding the literal in a second place.
 */
export const RESTO_AUTH_ROLE = 'resto_auth';
```

- [ ] **Step 2.9: Bump fixture password in `packages/db/test/setup.ts`**

Edit `packages/db/test/setup.ts:25`. Change:

```ts
const APP_ROLE_PASSWORD = 'resto_app';
```

to:

```ts
const APP_ROLE_PASSWORD = 'resto_app_test_password_local';
```

(29 chars, matches whitelist. The old `'resto_app'` is 9 chars and fails the 16-char minimum.)

- [ ] **Step 2.10: Bump fixture passwords in `apps/api/test/e2e/with-real-stack.setup.ts`**

Edit `apps/api/test/e2e/with-real-stack.setup.ts:25-26`. Change:

```ts
const APP_ROLE_PASSWORD = 'resto_app';
const AUTH_ROLE_PASSWORD = 'resto_auth_e2e';
```

to:

```ts
const APP_ROLE_PASSWORD = 'resto_app_real_stack_e2e';
const AUTH_ROLE_PASSWORD = 'resto_auth_real_stack_e2e';
```

(24 and 25 chars respectively, both match whitelist. Old values were 9 and 14 chars — both below 16.)

- [ ] **Step 2.11: Write integration tests for end-to-end role provisioning**

Create `packages/db/test/integration/role-provisioning.spec.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import {
  provisionAppRole,
  provisionAuthRole,
  RESTO_APP_ROLE,
  RESTO_AUTH_ROLE,
} from '../../src/index';
import {
  assertRoleAttributes,
  RoleAttributeMismatchError,
} from '../../src/preflight';
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
    '[role-provisioning] Docker not available — skipping integration tests.',
  );
}

const APP_PWD = 'role_provisioning_app_pwd_1234';
const AUTH_PWD = 'role_provisioning_auth_pwd_1234';

suite('Role provisioning — end-to-end (RES-245)', () => {
  let pg: TestPg;
  let admin: ReturnType<typeof postgres>;

  beforeAll(async () => {
    pg = await startPostgres();
    admin = postgres(pg.adminUrl, { max: 1, prepare: false });
  }, 90_000);

  afterAll(async () => {
    await admin.end({ timeout: 5 });
    await stopPostgres(pg);
  });

  it('provisionAppRole produces resto_app with NOSUPERUSER NOBYPASSRLS', async () => {
    await provisionAppRole(admin, { appPassword: APP_PWD });
    // assertRoleAttributes is called internally; if it threw, the test
    // body wouldn't reach here. Re-assert externally as a guard against
    // a future refactor accidentally removing the internal call.
    await assertRoleAttributes(admin, RESTO_APP_ROLE, {
      rolsuper: false,
      rolbypassrls: false,
      rolcreaterole: false,
      rolcreatedb: false,
    });
  });

  it('provisionAuthRole produces resto_auth with NOSUPERUSER BYPASSRLS', async () => {
    await provisionAuthRole(admin, { authPassword: AUTH_PWD });
    await assertRoleAttributes(admin, RESTO_AUTH_ROLE, {
      rolsuper: false,
      rolbypassrls: true,
      rolcreaterole: false,
      rolcreatedb: false,
    });
  });

  it('assertRoleAttributes throws RoleAttributeMismatchError when role is tampered with', async () => {
    // Sanity-grant SUPERUSER to resto_app out-of-band, then re-assert.
    // Revert in finally so a failed assertion doesn't leak the SUPERUSER
    // state into subsequent tests in this describe.
    await admin.unsafe('ALTER ROLE resto_app WITH SUPERUSER');
    try {
      const err = await assertRoleAttributes(admin, RESTO_APP_ROLE, {
        rolsuper: false,
        rolbypassrls: false,
        rolcreaterole: false,
        rolcreatedb: false,
      }).then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(RoleAttributeMismatchError);
    } finally {
      await admin.unsafe('ALTER ROLE resto_app WITH NOSUPERUSER');
    }
  });

  it('assertRoleAttributes throws when the role does not exist', async () => {
    await expect(
      assertRoleAttributes(admin, 'role_that_never_existed', {
        rolsuper: false,
        rolbypassrls: false,
        rolcreaterole: false,
        rolcreatedb: false,
      }),
    ).rejects.toThrow(/does not exist/);
  });

  it('provisionAppRole is idempotent — second call updates password without error', async () => {
    // First call already happened in test 1. Re-run with a different password.
    await provisionAppRole(admin, { appPassword: 'role_idempotency_app_pwd' });
    // Verify by connecting as resto_app with the new password.
    const appUrl = new URL(pg.adminUrl);
    appUrl.username = RESTO_APP_ROLE;
    appUrl.password = 'role_idempotency_app_pwd';
    const appClient = postgres(appUrl.toString(), { max: 1, prepare: false });
    try {
      const result = await appClient`SELECT current_user AS user`;
      expect(result[0]?.user).toBe(RESTO_APP_ROLE);
    } finally {
      await appClient.end({ timeout: 5 });
    }
  });

  it('provisionAppRole rejects an injection-attempt password before any SQL is sent', async () => {
    const malicious = "abcdef1234567890'; ALTER ROLE resto_app SUPERUSER; --";
    await expect(
      provisionAppRole(admin, { appPassword: malicious }),
    ).rejects.toThrow(/whitelist/i);
    // Verify resto_app's attributes are still clean (no SUPERUSER leaked).
    await assertRoleAttributes(admin, RESTO_APP_ROLE, {
      rolsuper: false,
      rolbypassrls: false,
      rolcreaterole: false,
      rolcreatedb: false,
    });
  });
});
```

- [ ] **Step 2.12: Run db tests — unit + integration**

Run: `pnpm exec nx run db:typecheck && pnpm exec nx run db:lint && pnpm --filter @resto/db exec vitest run`

Expected: ALL pass. The new integration suite + new unit tests + existing unit tests all green. Docker required for the integration suite; if Docker is unavailable, the suite is skipped (per the `isDockerAvailable` guard).

If `roles.ts` / `auth-role.ts` typecheck fails on the import of `assertRoleAttributes`, ensure `preflight.ts` exports it from the public surface — it does (it's a top-level `export`), but `packages/db/src/index.ts` may need an explicit re-export if other consumers reference it. Check and add: `export { assertRoleAttributes, RoleAttributeMismatchError } from './preflight';` to `packages/db/src/index.ts` if needed.

- [ ] **Step 2.13: Run api tests — confirm fixture password bumps don't break anything**

Run: `pnpm exec nx run api:typecheck && pnpm exec nx run api:lint && pnpm exec nx run api:test`

Expected: ALL pass. The api unit tests don't exercise role provisioning directly, but the `with-real-stack.setup.ts` change could affect anything that imports from it; verify.

- [ ] **Step 2.14: Commit**

```bash
git add packages/db/src/internal/password.ts packages/db/src/preflight.ts packages/db/src/roles.ts packages/db/src/auth-role.ts packages/db/sql/roles.sql packages/db/sql/auth-role.sql packages/db/test/setup.ts packages/db/test/unit/password-validation.spec.ts packages/db/test/integration/role-provisioning.spec.ts apps/api/test/e2e/with-real-stack.setup.ts
git commit -m "fix(db): parameterize role-provisioning SQL + whitelist password validation + post-provision attribute assertion (RES-245)"
```

If `packages/db/src/index.ts` was modified in Step 2.12 to export `assertRoleAttributes` / `RoleAttributeMismatchError`, add it to the `git add` list.

---

## Task 3 — Full project verification before PR

**Files:** none modified.

- [ ] **Step 3.1: db package full gates**

Run: `pnpm exec nx run db:lint && pnpm exec nx run db:typecheck && pnpm --filter @resto/db exec vitest run`
Expected: ALL pass. Unit tests (existing + new) + integration suite (Docker permitting).

- [ ] **Step 3.2: api package full gates**

Run: `pnpm exec nx run api:lint && pnpm exec nx run api:typecheck && pnpm exec nx run api:test`
Expected: ALL pass.

- [ ] **Step 3.3: Sanity grep — verify all `provisionAppRole(` / `provisionAuthRole(` callers have whitelist-compliant fixture passwords**

Run:

```bash
grep -rn "provisionAppRole(\|provisionAuthRole(" apps/ packages/ --include="*.ts" | grep -v node_modules
```

Then for each callsite, locate the password constant and verify it matches `/^[A-Za-z0-9!@#$%^&*()_+\-=]{16,128}$/`. Known sites (verified during planning):

| Site                                                     | Password                                                               | Length  | OK  |
| -------------------------------------------------------- | ---------------------------------------------------------------------- | ------- | --- |
| `packages/db/test/setup.ts:25`                           | `resto_app_test_password_local` (post-bump)                            | 29      | ✓   |
| `apps/api/test/e2e/tenants-controller.e2e.spec.ts:18-20` | `'app_password_tenants_ctrl_e2e'` / `'auth_password_tenants_ctrl_e2e'` | 29 / 30 | ✓   |
| `apps/api/test/e2e/with-real-stack.setup.ts:25-26`       | `resto_app_real_stack_e2e` / `resto_auth_real_stack_e2e` (post-bump)   | 24 / 25 | ✓   |
| `apps/api/test/e2e/auth-brute-force.e2e.spec.ts:19-20`   | `'app_password_brute_force_e2e'` / `'auth_password_brute_force_e2e'`   | 28 / 29 | ✓   |
| `apps/api/test/e2e/identity-smoke.e2e.spec.ts:16-17`     | `'app_password_test'` / `'auth_password_test'`                         | 17 / 18 | ✓   |
| `apps/api/test/e2e/me-brands.e2e.spec.ts:19-20`          | `'app_password_me_brands_e2e'` / `'auth_password_me_brands_e2e'`       | 26 / 27 | ✓   |
| `apps/api/test/e2e/identity-bootstrap.e2e.spec.ts:24-25` | `'app_password_bootstrap_e2e'` / `'auth_password_bootstrap_e2e'`       | 26 / 27 | ✓   |

If a new callsite appears that fails the regex, surface it and bump in the same commit as the closest related fix (or report and ask).

- [ ] **Step 3.4: No commit — verification only.**

---

## PR preparation (after Task 3)

When opening the PR:

- **Title:** `fix(db): harden db:reset CLI + role-provisioning SQL injection vectors (RES-244, RES-245)`
- **Body:** include the per-ticket "what changed" section, the call-site audit table from Step 3.3, the operational note about the new `RESTO_CONFIRM_RESET=yes-wipe-my-dev-db` muscle-memory-defeating sentinel (anyone running `pnpm db:reset` daily will need to set it once per shell — document the workflow), and the out-of-scope follow-ups (docker init script update, `db:migrate` `DATABASE_ADMIN_URL` enforcement, `assertRoleAttributes` at API boot).
- Linear: move RES-244 → In Review with the PR attached, then move RES-245 → In Review with the same PR attached (one PR closes both tickets).
- Squash or merge-commit per project convention — merge-commit preserves the per-ticket atomicity (2 commits visible in `main` history); squash collapses to one commit titled by the PR title.

---

## Self-review notes (for the executor)

- All AC items from both tickets covered. RES-244: AC1-3 by `assertNodeEnvAllowed` + `assertConfirmationProvided` + `assertHostAllowed` + their error messages; AC4-5 by the unit tests in `cli-reset-guards.spec.ts`. RES-245: AC1 by `validateRolePassword` regex; AC2 by parameterized `client\`...PASSWORD ${pwd}\``in`provisionAppRole`/`provisionAuthRole`; AC3 by `assertRoleAttributes`; AC4 by unit tests in `password-validation.spec.ts`; AC5 by integration tests in `role-provisioning.spec.ts`.
- Spec out-of-scope list (docker init script, `db:migrate` AdminURL enforcement, API boot integration, AUDIT_ERASURE_SALT/INTERNAL_API_TOKEN defaults, SQL file renames) is intentionally not addressed here.
- `process.exit` is only called in the CLI entry point's catch handler. All guard logic is pure functions throwing `ResetGuardError`. No test mocks `process.exit`.
- Postgres-js parameterized template `client\`ALTER ROLE foo PASSWORD ${pwd}\``binds`pwd`via the wire protocol; this is the postgres-js convention for prepared statements. The literal SQL identifier`resto_app` is interpolated by the template (not parameterized) — that's safe because it's a static string in our code, not user input.
- If the `DO $$ ... GRANT EXECUTE ON FUNCTION app_bind_tenant ... $$` block in `roles.sql` causes any test to fail with "function does not exist" (because the test runs against a fresh DB before migration 0022), the existing `IF EXISTS` guard handles it (no-op). The block stays as-is.
