---
tickets: RES-244, RES-245
adr: 0020 (I-1, I-3), 0021 (Tier 1 — Multi-tenancy)
status: proposed
date: 2026-05-23
scope:
  - packages/db/src/cli/reset.ts (rewrite guard — 3 layers, drop DATABASE_URL fallback)
  - packages/db/src/roles.ts (parameterized CREATE/ALTER ROLE + whitelist regex + post-provision assertion)
  - packages/db/src/auth-role.ts (same shape for BYPASSRLS role)
  - packages/db/src/internal/password.ts (NEW — shared whitelist validator)
  - packages/db/src/preflight.ts (add `assertRoleAttributes` sibling)
  - packages/db/sql/roles.sql (split — DO block removed, grants kept)
  - packages/db/sql/auth-role.sql (same shape)
  - packages/db/test/setup.ts (bump APP_ROLE_PASSWORD to ≥16 chars)
  - packages/db/test/unit/cli-reset.spec.ts (NEW — 6 guard tests)
  - packages/db/test/unit/password-validation.spec.ts (NEW — 12+ whitelist tests)
  - packages/db/test/integration/ (extend — role-attribute assertion)
---

# RES-244 + RES-245 — harden `db:reset` CLI + role-provisioning SQL injection vectors

## Context

Two gate-blocker security findings from the 2026-05-16 full-codebase
review (`.planning/reviews/2026-05-16-full-codebase/pkg-db-REVIEW.md`),
both in `@resto/db` — the single package that owns Postgres. Bundled
into one PR because they share an owner (the db package), they share a
review pattern (CLI / SQL hardening), and shipping them together avoids
a second round of review ceremony for the same surface.

### RES-244 — `pnpm db:reset` blast radius

`packages/db/src/cli/reset.ts` (38 LOC) is a `DROP SCHEMA public CASCADE`
script. Current guard at line 11:

```ts
if (env === 'production' || env === 'staging') { … exit 1 … }
```

A blocklist with two entries. Any other `NODE_ENV` value — including
unset, `prod`, `live`, typo, or simply forgetting to source the dev
`.env` — passes through and proceeds to drop the schema. There is no
confirmation env var, no host check. A misconfigured deploy or a
developer who switched terminals can silently wipe production.

The risk vector is real and documented as a Critical finding (pkg/db
CR-01); the fix is a small file. `packages/db/CLAUDE.md` Rules § CLI
already documents the target shape (allowlist + confirmation var + host
check) but the implementation hasn't caught up.

### RES-245 — role-provisioning SQL injection

`packages/db/src/roles.ts` and `packages/db/src/auth-role.ts` provision
the `resto_app` (NOBYPASSRLS) and `resto_auth` (BYPASSRLS) Postgres
roles. Password handling today:

```ts
// roles.ts:40-44
const sqlText = readFileSync(ROLES_SQL_PATH, 'utf8').replaceAll(
  PASSWORD_PLACEHOLDER,
  options.appPassword,
);
await client.unsafe(sqlText);
```

Validation rejects only empty + single-quote. Newline, CR, null byte,
backslash, `--`, `/*`, `;` all pass through into the SQL string. Because
the SQL form is `ALTER ROLE … PASSWORD '<placeholder>'`, a password like
`x'; ALTER ROLE resto_app SUPERUSER; --` would inject a privilege
escalation after the password line. `assertNoRlsBypass` checks the
APP's role (`current_user`), not roles being provisioned — so the
injection wouldn't be caught at boot.

This is an RLS-escape primitive (Critical, pkg/db CR-02): RLS as
second-line defense (ADR-0020 I-1) is meaningless if first-line role
config can be subverted.

## Goals

### RES-244 acceptance criteria

1. NODE_ENV allowlist — refuse anything except `development` / `test`.
2. Confirmation env var required even in dev/test.
3. Error messages name all guards explicitly.
4. Test: `NODE_ENV=foo` → exit 1, no DB connection opened.
5. Test: `NODE_ENV=development` + no confirmation → exit 1.

### RES-245 acceptance criteria

1. Password validation rejects newline, CR, null byte, single-quote,
   backslash, `--`, `/*` (whitelist preferred over blocklist per ticket).
2. Role-provisioning SQL uses parameterized form OR `quote_literal()` +
   post-construction regex assertion.
3. `assertNoRlsBypass` extended (or sibling added) to scan newly-created
   roles for SUPERUSER / BYPASSRLS / CREATEROLE.
4. Test: each vector fails fast with the correct error.
5. Test: provisioning + verifying no superuser/bypassrls attribute.

## Design

### RES-244 — three-layer guard on `db:reset`

Rewrite the guard block at the top of `packages/db/src/cli/reset.ts`.
Keep the drop-and-recreate logic unchanged.

```ts
const ALLOWED_NODE_ENVS = ['development', 'test'] as const;
const CONFIRMATION_VAR = 'RESTO_CONFIRM_RESET';
const CONFIRMATION_VALUE = 'yes-wipe-my-dev-db';
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', 'postgres']);

const main = async (): Promise<void> => {
  // Layer 1: NODE_ENV allowlist (explicit, no default substitution).
  const nodeEnv = process.env.NODE_ENV;
  if (!nodeEnv || !(ALLOWED_NODE_ENVS as readonly string[]).includes(nodeEnv)) {
    logger.error(
      { nodeEnv },
      `db:reset refused: NODE_ENV must be one of ${ALLOWED_NODE_ENVS.join('/')} ` +
        `(got ${JSON.stringify(nodeEnv ?? '<unset>')}). This is an allowlist, ` +
        `not a blocklist — typos and unset values are refused.`,
    );
    process.exit(1);
  }

  // Layer 2: confirmation sentinel (defeats muscle-memory; literal value,
  // not a boolean toggle).
  if (process.env[CONFIRMATION_VAR] !== CONFIRMATION_VALUE) {
    logger.error(
      {},
      `db:reset refused: ${CONFIRMATION_VAR} must equal "${CONFIRMATION_VALUE}" ` +
        `(got ${JSON.stringify(process.env[CONFIRMATION_VAR] ?? '<unset>')}). ` +
        `Re-run with: ${CONFIRMATION_VAR}=${CONFIRMATION_VALUE} pnpm db:reset`,
    );
    process.exit(1);
  }

  // Layer 3: host allowlist. No fallback to DATABASE_URL — symmetry with
  // packages/db/CLAUDE.md § CLI rule for db:migrate.
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) {
    logger.error(
      'db:reset refused: DATABASE_ADMIN_URL is required ' +
        '(no fallback to DATABASE_URL; that fallback masks "your terminal ' +
        'is pointed at prod" misconfigurations).',
    );
    process.exit(1);
  }
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    logger.error(
      { url: '<redacted>' },
      'db:reset refused: DATABASE_ADMIN_URL is not a valid URL.',
    );
    process.exit(1);
  }
  if (!ALLOWED_HOSTS.has(host)) {
    logger.error(
      { host },
      `db:reset refused: host ${JSON.stringify(host)} not in dev-host ` +
        `allowlist [${[...ALLOWED_HOSTS].join(', ')}]. Set DATABASE_ADMIN_URL ` +
        `to a local Postgres.`,
    );
    process.exit(1);
  }

  // (existing drop-and-recreate logic — unchanged from current lines 24-32)
  const client = postgres(url, { max: 1, prepare: false });
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
```

**Notes on the design:**

- `CONFIRMATION_VALUE = 'yes-wipe-my-dev-db'` follows `packages/db/CLAUDE.md`'s
  documented form (a literal sentence that defeats muscle memory) rather
  than the Linear ticket's `RESTO_ALLOW_DB_RESET=1` (a boolean toggle).
  The former is harder to leak into a `.bashrc` and harder to set "by
  accident."
- Host check uses the URL `hostname` (no port, no path). `'postgres'` is
  the docker-compose service hostname used by `infra/docker/`.
- URL is never logged verbatim (it contains credentials); the host
  rejection logs only the parsed `hostname`.
- No fallback to `DATABASE_URL`. The CLI is explicitly a dev tool —
  asking the operator to set the admin URL explicitly is a feature, not
  friction.

### RES-245 — parameterized SQL + whitelist + post-provision assertion

Four artifacts.

**1. Shared password validator** — `packages/db/src/internal/password.ts` (NEW):

```ts
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

The regex is the contract. `{16,128}` is NIST-aligned for service
passwords; the character class is intentionally narrow — not because
those characters are dangerous in a parameterized statement (they
aren't), but because narrow validation is cheaper to reason about than
broad with carve-outs. Error message NEVER includes the raw password
(security — logs / stack traces).

**2. `provisionAppRole` rewrite** — `packages/db/src/roles.ts`:

```ts
const GRANTS_SQL_PATH = resolve(import.meta.dirname, '..', 'sql', 'roles.sql');

export const provisionAppRole = async (
  client: Sql,
  options: { appPassword: string },
): Promise<void> => {
  validateRolePassword('provisionAppRole', options.appPassword);

  // Parameterized — postgres-js tagged template binds the password
  // via the wire protocol. No SQL string interpolation; the injection
  // primitive is eliminated, not just blocked.
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

  // Static-DDL grants (no parameters needed).
  await client.unsafe(readFileSync(GRANTS_SQL_PATH, 'utf8'));

  // Defense-in-depth: assert the role actually has the expected
  // attributes. Catches anyone bypassing this helper (hand-crafted
  // SQL on a separate connection, an attacker who slipped a privilege
  // change in earlier, etc.).
  await assertRoleAttributes(client, 'resto_app', {
    rolsuper: false,
    rolbypassrls: false,
    rolcreaterole: false,
    rolcreatedb: false,
  });
};
```

**3. `provisionAuthRole` rewrite** — `packages/db/src/auth-role.ts`:
Same shape. Expected attributes for `resto_auth`:

```ts
{ rolsuper: false, rolbypassrls: true, rolcreaterole: false, rolcreatedb: false }
```

**4. SQL files split** — `packages/db/sql/roles.sql` keeps everything
_except_ the DO block (lines 27-35 of current file):

```sql
-- (header comment kept; updated to reflect the new shape — CREATE/ALTER
-- ROLE is now performed by the Node helper, this file is grants-only.)

GRANT USAGE ON SCHEMA public TO resto_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO resto_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO resto_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO resto_app;

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

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO resto_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO resto_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO resto_app;
```

The `__APP_PASSWORD__` placeholder is gone — no caller needs to
substitute. The `app_bind_tenant` grant DO-block stays (it's static DDL
inside a defensive existence check; no parameters needed).

`auth-role.sql` gets the same treatment.

Renaming the file (e.g. to `roles-grants.sql`) is tempting but adds
churn to runbook references. Spec keeps the filename. The header comment
gets updated to reflect that the file is now grants-only.

**5. `assertRoleAttributes` sibling in `packages/db/src/preflight.ts`**:

```ts
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

**6. Fixture password bump** — `packages/db/test/setup.ts:25`:
`APP_ROLE_PASSWORD = 'resto_app'` (9 chars) is the only known fixture
that fails the new whitelist. Bump to a ≥16-char value matching the
regex, e.g. `'resto_app_test_password_local'`.

### Cross-callsite verification

The planning step will grep all callers of `provisionAppRole(` /
`provisionAuthRole(` and verify each password is ≥16 chars and matches
the whitelist. Known sites:

| Site                                                     | Variable                               | Expected                         |
| -------------------------------------------------------- | -------------------------------------- | -------------------------------- |
| `packages/db/test/setup.ts:25`                           | `APP_ROLE_PASSWORD = 'resto_app'`      | **fix in this PR** (bump to ≥16) |
| `apps/api/test/e2e/tenants-controller.e2e.spec.ts:18-20` | `'app_password_tenants_ctrl_e2e'` (29) | ✓                                |
| `apps/api/test/e2e/with-real-stack.setup.ts:51-52`       | (verify during planning)               | likely ✓                         |
| `apps/api/test/e2e/auth-brute-force.e2e.spec.ts:30-31`   | `APP_PASSWORD` / `AUTH_PASSWORD`       | verify during planning           |

Any additional site found during planning must be either compliant or
bumped in the same PR.

## Tests

### RES-244 — `packages/db/test/unit/cli-reset.spec.ts` (NEW)

Stub `process.env`, `process.exit` (assert called with `1`), and the
`postgres` module (assert NOT called when guards refuse). Six tests:

1. `NODE_ENV=production` → exit 1, no DB connect.
2. `NODE_ENV` unset → exit 1, no DB connect.
3. `NODE_ENV=development`, no confirmation var → exit 1.
4. `NODE_ENV=development`, `RESTO_CONFIRM_RESET=anything-else` → exit 1.
5. `NODE_ENV=development`, confirmation OK, `DATABASE_ADMIN_URL=
postgres://x@example.com/y` → exit 1 (host not in allowlist).
6. Happy path: all guards satisfied with a fake postgres-style URL
   pointing at `localhost`; assert the schema-reset SQL was issued
   exactly once.

### RES-245 — unit (`packages/db/test/unit/password-validation.spec.ts`, NEW)

Twelve+ cases for `validateRolePassword`:

- **Reject:** empty, 15-char (too short), 129-char (too long), contains
  `\n` / `\r` / `\0` / `'` / `\` / `--` / `/*` / `;` / `<space>` /
  `<tab>` / non-ASCII (e.g. `é`).
- **Accept:** 16-char minimum, 128-char maximum, mix of allowed
  punctuation `!@#$%^&*()_+-=`.
- **Security assertion:** each rejection error message must NOT contain
  the raw password value (grep the error string).

### RES-245 — integration (extend `packages/db/test/integration/`)

New file `packages/db/test/integration/role-provisioning.spec.ts` (or
extend an existing `tenant-isolation.spec.ts` if cleaner):

1. Boot a Postgres testcontainer + admin client.
2. Provision `resto_app` with a valid password → `assertRoleAttributes`
   returns clean.
3. Provision `resto_auth` with a valid password → `assertRoleAttributes`
   returns clean with `BYPASSRLS: true`.
4. Provision `resto_app`, then manually
   `ALTER ROLE resto_app SUPERUSER`, then call `assertRoleAttributes`
   directly → throws `RoleAttributeMismatchError`.
5. Try to provision with a password containing each of the seven main
   injection vectors → throws before any SQL is sent.
6. Round-trip: provision, then connect as `resto_app` with the supplied
   password (proves parameterization preserved the literal value
   end-to-end, no encoding mishap).

## Out of scope (follow-ups, noted in PR description)

- **Docker init `02-app-role.sql`** (`infra/docker/postgres/init/02-app-role.sql`)
  — still uses the old DO-block + literal placeholder. Runs once at
  container creation with a hardcoded dev password from
  `infra/docker-compose.dev.yml`; injection vector is contained.
  Deferred (separate cleanup ticket).
- **`db:migrate` `DATABASE_ADMIN_URL` enforcement** — `packages/db/CLAUDE.md`
  says `db:migrate` should require `DATABASE_ADMIN_URL` explicitly in
  non-dev, no fallback. Currently unverified — separate ticket if
  non-compliant.
- **`assertRoleAttributes` at API boot** — wire alongside
  `assertNoRlsBypass` in `apps/api/src/main.ts` so a tampered `resto_app`
  fails the app at startup. Defense-in-depth; deferred.
- **`AUDIT_ERASURE_SALT` / `INTERNAL_API_TOKEN` defaults-from-DEV_DEFAULTS**
  — same pattern as RES-246. Continues the env-schema cleanup family.
  Separate ticket.
- **Renaming `roles.sql` → `roles-grants.sql`** — clarity but adds churn
  to runbook references. Defer.

## Risks and unknowns

- **`provisionAppRole` callers in apps/api e2e fixtures** — must all use
  passwords compatible with the new whitelist. Planning step will grep
  and fix any non-compliant site in this PR (alongside `test/setup.ts:25`).
  If many sites fail, scope may grow — surface during planning.
- **`db:reset` test design** — needs to stub `process.exit` without
  exiting the test process. Vitest pattern: `vi.spyOn(process, 'exit')
.mockImplementation((code) => { throw new ProcessExitError(code); })`.
  Tests catch the thrown error and assert the code. Existing
  `prod-guardrails.spec.ts` uses the same pattern — borrow it.
- **DO-block removal in `roles.sql`** — anyone running the raw SQL file
  by hand (runbook, ad-hoc psql) without the Node helper will now find
  it does NOT create the role. The header comment must be updated to
  point at `provisionAppRole` as the entry point. Operator-facing doc
  (`docs/runbooks/database-roles.md`) may need a follow-up update —
  flag during planning if so.
- **Whitelist breaks operator-facing scripts that generate passwords**
  — if any tool generates passwords containing characters outside the
  whitelist (e.g. `pwgen` defaults), it will fail validation. The
  whitelist excludes only structural SQL-injection vectors and shell
  meta-characters; standard password generators with
  `--no-symbols --secure` or punctuation matching `!@#$%^&*()_+-=` work
  fine. Document the regex prominently in the runbook.
