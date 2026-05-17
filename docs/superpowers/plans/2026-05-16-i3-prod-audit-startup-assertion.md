# I-3 prod audit + startup assertion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the three dev-only fallback constants enumerated in
ADR-0020 Invariant I-3, and add three independent layers of defense that
prevent each one from reaching production.

**Architecture:** Layer 1 — Zod `superRefine` in `apps/api/src/config/env.schema.ts`
requires the previously-defaulted `S3_*` keys in non-dev. Layer 2 — new
`assertProdGuardrails(env)` in `apps/api/src/config/prod-guardrails.ts` is
invoked from `main.ts` after `assertNoRlsBypass`; throws if any tracked env
value is still the dev default in non-dev. Layer 3 — consumer-site guards:
`OffboardTenantService` throws when `AUDIT_ERASURE_SALT` is unset, and
`apps/qr-menu/src/api/client.ts` wraps the `VITE_TENANT_SLUG` override in
`if (import.meta.env.DEV)` so Vite tree-shakes it from prod bundles.
A new Vitest spec rebuilds qr-menu and asserts the bundle contains no
`VITE_TENANT_SLUG` / `x-tenant-slug` literals. Audit deliverable is a
single runbook documenting findings + first-deploy checklist.

**Tech Stack:** TypeScript 5.7 · Nx 20 + pnpm 9 · NestJS · Zod v3
(`superRefine`) · Vitest 2 · Vite 5

**Spec:** [`docs/superpowers/specs/2026-05-16-i3-prod-audit-startup-assertion-design.md`](../specs/2026-05-16-i3-prod-audit-startup-assertion-design.md)

**Branch:** `i3-prod-guardrails` (spec already committed there as `8c470ed`)

---

## Pre-flight

These do not need their own task — verify before starting.

- The branch is `i3-prod-guardrails`. Run `git branch --show-current` to
  confirm. If not on this branch, stop and reconcile with the user before
  proceeding (the spec lives on this branch).
- `pnpm install` is already current. Run `pnpm --version` → 9.x; node
  `nvm use` if `.nvmrc` mismatches.
- Local dev stack is NOT required for this plan. All work is unit-tested
  with Vitest; no test in this plan touches Postgres/Redis/NATS/MinIO.

---

## Task 1 — env.schema: require `S3_*` in non-dev

Drop the three `.default(...)` calls on `S3_ENDPOINT`, `S3_ACCESS_KEY`,
`S3_SECRET_KEY` and add them to the existing `superRefine` required-list.
`S3_REGION` and `S3_BUCKET` keep their defaults — neither is a secret.

**Files:**

- Modify: `apps/api/src/config/env.schema.ts`
- Modify: `apps/api/test/unit/env.spec.ts`

- [ ] **Step 1: Write the failing tests**

Add these three cases to `apps/api/test/unit/env.spec.ts` at the bottom of
the `describe('loadEnv', ...)` block (above the closing `});`). Reuse the
existing `productionEnv`-style fixture pattern (see lines 67-95 of the
current file).

```ts
it('rejects production boot when S3_ENDPOINT is missing', () => {
  const productionEnv: NodeJS.ProcessEnv = {
    ...baseEnv,
    NODE_ENV: 'production',
    BETTER_AUTH_SECRET: 'production-secret-32-chars-padding-padding',
    BETTER_AUTH_BASE_URL: 'https://api.resto.app',
    BETTER_AUTH_DATABASE_URL: 'postgres://auth@localhost:5432/resto',
    ADMIN_WEB_URL: 'https://admin.resto.app',
    AUTH_COOKIE_DOMAIN: '.resto.app',
    AUDIT_ERASURE_SALT: 'production-erasure-salt-32-chars-padding',
    TRUST_PROXY: '10.0.0.0/8',
    S3_ACCESS_KEY: 'prod-access',
    S3_SECRET_KEY: 'prod-secret-replace-me',
  };
  expect(() => loadEnv(productionEnv)).toThrow(/S3_ENDPOINT/);
});

it('rejects production boot when S3_ACCESS_KEY is missing', () => {
  const productionEnv: NodeJS.ProcessEnv = {
    ...baseEnv,
    NODE_ENV: 'production',
    BETTER_AUTH_SECRET: 'production-secret-32-chars-padding-padding',
    BETTER_AUTH_BASE_URL: 'https://api.resto.app',
    BETTER_AUTH_DATABASE_URL: 'postgres://auth@localhost:5432/resto',
    ADMIN_WEB_URL: 'https://admin.resto.app',
    AUTH_COOKIE_DOMAIN: '.resto.app',
    AUDIT_ERASURE_SALT: 'production-erasure-salt-32-chars-padding',
    TRUST_PROXY: '10.0.0.0/8',
    S3_ENDPOINT: 'https://s3.amazonaws.com',
    S3_SECRET_KEY: 'prod-secret-replace-me',
  };
  expect(() => loadEnv(productionEnv)).toThrow(/S3_ACCESS_KEY/);
});

it('rejects production boot when S3_SECRET_KEY is missing', () => {
  const productionEnv: NodeJS.ProcessEnv = {
    ...baseEnv,
    NODE_ENV: 'production',
    BETTER_AUTH_SECRET: 'production-secret-32-chars-padding-padding',
    BETTER_AUTH_BASE_URL: 'https://api.resto.app',
    BETTER_AUTH_DATABASE_URL: 'postgres://auth@localhost:5432/resto',
    ADMIN_WEB_URL: 'https://admin.resto.app',
    AUTH_COOKIE_DOMAIN: '.resto.app',
    AUDIT_ERASURE_SALT: 'production-erasure-salt-32-chars-padding',
    TRUST_PROXY: '10.0.0.0/8',
    S3_ENDPOINT: 'https://s3.amazonaws.com',
    S3_ACCESS_KEY: 'prod-access',
  };
  expect(() => loadEnv(productionEnv)).toThrow(/S3_SECRET_KEY/);
});
```

Also update the existing `accepts a production environment with a
properly-shaped AUTH_COOKIE_DOMAIN` test (around line 80) — it must now
also supply `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, otherwise it
will start failing once we add the superRefine entries. Add these three
lines into the `productionEnv` object in that test:

```ts
S3_ENDPOINT: 'https://s3.amazonaws.com',
S3_ACCESS_KEY: 'prod-access',
S3_SECRET_KEY: 'prod-secret-replace-me',
```

Repeat the same addition in the two `productionEnv` fixtures used by the
`rejects production boot when TRUST_PROXY is missing` (around line 106)
and `rejects TRUST_PROXY=true outside dev/test` (around line 120) tests.
Otherwise those tests will start failing for the wrong reason (missing
S3 var) before reaching their actual assertion (`/TRUST_PROXY/` /
`/unsafe/`).

Likewise, the `rejects TENANT_DEV_FALLBACK_SLUG outside development` test
around line 40 already sets BA + AUDIT_ERASURE_SALT + TRUST_PROXY; add
the same three S3 lines so the only validation issue it surfaces remains
TENANT_DEV_FALLBACK_SLUG.

- [ ] **Step 2: Run env tests to verify the new three fail**

Run: `pnpm --filter @resto/api test -- env.spec`
Expected: 3 of the new tests FAIL with an error like
`expected [Function] to throw error including 'S3_ENDPOINT' but it didn't`
(because the current schema's `.default(...)` populates these values, so
no error is raised). Existing tests should still pass.

If the existing four production tests (the ones we added S3 lines to)
already pass before our schema change, that's fine — they were not testing
S3 directly.

- [ ] **Step 3: Update `env.schema.ts`**

In `apps/api/src/config/env.schema.ts`:

Replace the S3 block (currently lines 88-92):

```ts
/** S3-compatible bucket for menu images (R2 / AWS S3 / MinIO in dev). */
S3_ENDPOINT: z.string().url().default('http://localhost:9000'),
S3_REGION: z.string().default('us-east-1'),
S3_BUCKET: z.string().default('resto-dev'),
S3_ACCESS_KEY: z.string().default('minio'),
S3_SECRET_KEY: z.string().default('minio_dev_password'),
```

with:

```ts
/**
 * S3-compatible bucket for menu images (R2 / AWS S3 / MinIO in dev).
 * Endpoint and credentials are required in non-dev (enforced by
 * superRefine below); dev/test pulls them from the root `.env`
 * file alongside the docker-compose MinIO stack. ADR-0020 I-3.
 */
S3_ENDPOINT: z.string().url().optional(),
S3_REGION: z.string().default('us-east-1'),
S3_BUCKET: z.string().default('resto-dev'),
S3_ACCESS_KEY: z.string().optional(),
S3_SECRET_KEY: z.string().optional(),
```

In the `superRefine` required-list (currently lines 168-176), append the
three S3 keys. The full updated array:

```ts
for (const key of [
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_BASE_URL',
  'BETTER_AUTH_DATABASE_URL',
  'ADMIN_WEB_URL',
  'AUTH_COOKIE_DOMAIN',
  'AUDIT_ERASURE_SALT',
  'TRUST_PROXY',
  'S3_ENDPOINT',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
] as const) {
```

- [ ] **Step 4: Run env tests to verify all pass**

Run: `pnpm --filter @resto/api test -- env.spec`
Expected: all tests PASS, including the three new ones and the four
existing production tests (which now carry the three S3 lines).

Run the wider api test suite to confirm nothing else relied on the dropped
defaults: `pnpm --filter @resto/api test`
Expected: all tests PASS. (If anything fails because it called
`env.S3_SECRET_KEY` expecting a value — that's a pre-existing layering
violation; surface it to the user and stop before "fixing" it.)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/config/env.schema.ts apps/api/test/unit/env.spec.ts
git commit -m "feat(api): require S3_* env vars in non-dev (ADR-0020 I-3)"
```

---

## Task 2 — Create `assertProdGuardrails` + unit tests

A boot-time defense-in-depth check that complements (does not replace)
the schema validation from Task 1.

**Files:**

- Create: `apps/api/src/config/prod-guardrails.ts`
- Create: `apps/api/test/unit/prod-guardrails.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/test/unit/prod-guardrails.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Env } from '../../src/config/env.schema';
import {
  assertProdGuardrails,
  ProdGuardrailsError,
} from '../../src/config/prod-guardrails';

const okProdValues = {
  S3_ENDPOINT: 'https://s3.amazonaws.com',
  S3_ACCESS_KEY: 'prod-access',
  S3_SECRET_KEY: 'prod-secret-replace-me',
  AUDIT_ERASURE_SALT: 'production-erasure-salt-32-chars-padding',
} as const;

const buildEnv = (overrides: Partial<Env> = {}): Env =>
  ({
    NODE_ENV: 'production',
    ...okProdValues,
    ...overrides,
  }) as Env;

describe('assertProdGuardrails', () => {
  it('returns silently in development regardless of values', () => {
    const env = buildEnv({
      NODE_ENV: 'development',
      S3_SECRET_KEY: 'minio_dev_password',
      AUDIT_ERASURE_SALT: 'dev-only-erasure-salt-32-chars-padding',
    });
    expect(() => assertProdGuardrails(env)).not.toThrow();
  });

  it('returns silently in test regardless of values', () => {
    const env = buildEnv({
      NODE_ENV: 'test',
      S3_SECRET_KEY: 'minio_dev_password',
    });
    expect(() => assertProdGuardrails(env)).not.toThrow();
  });

  it('passes when all prod values are set to real secrets', () => {
    expect(() => assertProdGuardrails(buildEnv())).not.toThrow();
  });

  it('throws when S3_SECRET_KEY is the dev default in production', () => {
    expect(() =>
      assertProdGuardrails(buildEnv({ S3_SECRET_KEY: 'minio_dev_password' })),
    ).toThrow(ProdGuardrailsError);
    expect(() =>
      assertProdGuardrails(buildEnv({ S3_SECRET_KEY: 'minio_dev_password' })),
    ).toThrow(/S3_SECRET_KEY/);
  });

  it('throws when S3_ACCESS_KEY is the dev default', () => {
    expect(() =>
      assertProdGuardrails(buildEnv({ S3_ACCESS_KEY: 'minio' })),
    ).toThrow(/S3_ACCESS_KEY/);
  });

  it('throws when S3_ENDPOINT is the dev default', () => {
    expect(() =>
      assertProdGuardrails(buildEnv({ S3_ENDPOINT: 'http://localhost:9000' })),
    ).toThrow(/S3_ENDPOINT/);
  });

  it('throws when AUDIT_ERASURE_SALT is the dev fallback constant', () => {
    expect(() =>
      assertProdGuardrails(
        buildEnv({
          AUDIT_ERASURE_SALT: 'dev-only-erasure-salt-32-chars-padding',
        }),
      ),
    ).toThrow(/AUDIT_ERASURE_SALT/);
  });

  it('throws when a value is undefined in production', () => {
    expect(() =>
      assertProdGuardrails(buildEnv({ S3_SECRET_KEY: undefined })),
    ).toThrow(/S3_SECRET_KEY/);
  });

  it('reports every violation in a single error', () => {
    try {
      assertProdGuardrails(
        buildEnv({
          S3_SECRET_KEY: 'minio_dev_password',
          AUDIT_ERASURE_SALT: 'dev-only-erasure-salt-32-chars-padding',
        }),
      );
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ProdGuardrailsError);
      const violations = (err as ProdGuardrailsError).violations;
      expect(violations).toHaveLength(2);
      expect(violations.join(' ')).toMatch(/S3_SECRET_KEY/);
      expect(violations.join(' ')).toMatch(/AUDIT_ERASURE_SALT/);
    }
  });

  it('also fires in staging (treated like production)', () => {
    expect(() =>
      assertProdGuardrails(
        buildEnv({ NODE_ENV: 'staging', S3_SECRET_KEY: 'minio_dev_password' }),
      ),
    ).toThrow(/S3_SECRET_KEY/);
  });
});
```

- [ ] **Step 2: Run the new spec to verify all tests fail**

Run: `pnpm --filter @resto/api test -- prod-guardrails`
Expected: every test FAILS with a module-not-found-style error (the file
`prod-guardrails.ts` doesn't exist yet).

- [ ] **Step 3: Create `apps/api/src/config/prod-guardrails.ts`**

```ts
import type { Env } from './env.schema';

/**
 * Boot-time defense-in-depth check for ADR-0020 Invariant I-3.
 *
 * env.schema's `superRefine` SHOULD already reject each of these
 * conditions; this assertion fires if a future refactor weakens the
 * schema, OR if a deploy hands the API a "real" env var whose value
 * happens to equal the local dev default (the schema cannot tell those
 * apart — it only sees a non-empty string).
 *
 * Mirrors the schema conditions intentionally — when the schema's
 * superRefine moves, this moves too.
 */
const DEV_DEFAULTS = {
  S3_SECRET_KEY: 'minio_dev_password',
  S3_ACCESS_KEY: 'minio',
  S3_ENDPOINT: 'http://localhost:9000',
  AUDIT_ERASURE_SALT: 'dev-only-erasure-salt-32-chars-padding',
} as const;

type GuardedKey = keyof typeof DEV_DEFAULTS;

export class ProdGuardrailsError extends Error {
  constructor(public readonly violations: readonly string[]) {
    super(`prod-guardrails: refusing to start: ${violations.join('; ')}`);
    this.name = 'ProdGuardrailsError';
  }
}

export const assertProdGuardrails = (env: Env): void => {
  if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') return;
  const violations: string[] = [];
  for (const key of Object.keys(DEV_DEFAULTS) as GuardedKey[]) {
    const value = env[key];
    const devDefault = DEV_DEFAULTS[key];
    if (value === undefined || value === devDefault) {
      violations.push(`${key} is unset or equals the dev default`);
    }
  }
  if (violations.length > 0) throw new ProdGuardrailsError(violations);
};
```

- [ ] **Step 4: Run the new spec to verify all tests pass**

Run: `pnpm --filter @resto/api test -- prod-guardrails`
Expected: all 10 tests PASS.

Also run `pnpm --filter @resto/api typecheck` to confirm the `Env` type
import is satisfied (Task 1 made `S3_*` optional, so accessing them
returns `string | undefined` — the comparison `=== undefined` handles it
naturally).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/config/prod-guardrails.ts apps/api/test/unit/prod-guardrails.spec.ts
git commit -m "feat(api): add assertProdGuardrails defense-in-depth check (ADR-0020 I-3)"
```

---

## Task 3 — Wire `assertProdGuardrails` into `main.ts`

One-line wiring. There is no clean unit-test boundary around `main.ts`
because `bootstrap()` builds the full Nest container; the unit tests in
Task 2 are the regression coverage for the assertion logic. This task is
the integration into the boot path.

**Files:**

- Modify: `apps/api/src/main.ts:14-42`

- [ ] **Step 1: Update `main.ts`**

In `apps/api/src/main.ts`, add an import (alphabetised with the existing
config imports) and a call to `assertProdGuardrails(env)` immediately
after the existing `assertNoRlsBypass` line.

Add to the import block (after the existing `import { loadEnv, type Env }`
line at line 18):

```ts
import { assertProdGuardrails } from './config/prod-guardrails';
```

Update the boot sequence (currently lines 35-42):

```ts
const env = app.get<Env>(ENV_TOKEN);

// RLS preflight — refuse to start if the DB connection role can
// bypass row-level security. Surfaces the misconfiguration in the
// very first log line rather than the day a tenant discovers
// another tenant's data (RES-83).
await assertNoRlsBypass(env.DATABASE_URL);

// ADR-0020 I-3 defense-in-depth: refuse to start if any tracked
// dev-fallback constant is still present in a non-dev NODE_ENV.
assertProdGuardrails(env);
```

- [ ] **Step 2: Verify the api still starts cleanly in dev**

(Pseudo-integration check — no separate test framework is set up for
`main.ts`.) Run the api in dev mode:

```bash
pnpm --filter @resto/api start &
sleep 6
curl -sf http://localhost:3000/v1/health || echo "health check failed"
kill %1 2>/dev/null
```

Expected: log line `Resto api listening on :3000` appears within ~5s,
the health check returns 2xx, and no `prod-guardrails` error is logged.
(Local `.env` sets `NODE_ENV=development`, so `assertProdGuardrails`
early-returns.)

If `pnpm start` cannot be run interactively in your session, skip the
boot test — Task 2's unit tests + the existing e2e suite (which boots
the full container under `NODE_ENV=test`) catch a broken wiring.

- [ ] **Step 3: Run the full api unit + integration test suite**

```bash
pnpm --filter @resto/api test
```

Expected: all tests PASS. The existing e2e tests boot the full Nest
container under `NODE_ENV=test`; `assertProdGuardrails` early-returns in
test env, so adding the call is invisible there. Any failure means the
wiring broke something — investigate before committing.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/main.ts
git commit -m "feat(api): call assertProdGuardrails on boot (ADR-0020 I-3)"
```

---

## Task 4 — Remove `DEV_SALT_FALLBACK` from `OffboardTenantService`

Replace the in-service fallback constant with a strict guard. The salt
already comes from the env (`AUDIT_ERASURE_SALT`); the `??` fallback
hides schema regressions.

**Files:**

- Modify: `apps/api/src/contexts/tenancy/application/offboard-tenant.service.ts`
- Modify: `apps/api/test/unit/tenancy/offboard-tenant.service.spec.ts`

- [ ] **Step 1: Write the failing test**

In `apps/api/test/unit/tenancy/offboard-tenant.service.spec.ts`, add a
new case at the bottom of the `describe('OffboardTenantService', ...)`
block. Reuse the existing `baseEnv` and `buildRepoMock` helpers (lines
19-34 of the current file).

```ts
it('executeErasure throws when AUDIT_ERASURE_SALT is unset', async () => {
  const tenant = Tenant.provision(baseProvisionInput());
  tenant.scheduleOffboarding('user-abc', new Date('2026-06-01T10:00:00Z'));
  tenant.executeErasure(new Date('2026-07-02T10:00:00Z'));
  const repo = buildRepoMock();
  repo.eraseTenant = vi.fn().mockResolvedValue(tenant.toSnapshot());
  // baseEnv() sets AUDIT_ERASURE_SALT — override to undefined to simulate
  // a schema regression where the env var is missing.
  const envWithoutSalt = baseEnv({
    AUDIT_ERASURE_SALT: undefined as unknown as string,
  });
  const service = new OffboardTenantService(repo, envWithoutSalt);
  await expect(
    service.executeErasure({ tenantId: tenant.toSnapshot().id }),
  ).rejects.toThrow(/AUDIT_ERASURE_SALT/);
  expect(repo.eraseTenant).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the spec to verify the new test fails**

Run: `pnpm --filter @resto/api test -- offboard-tenant.service`
Expected: the new test FAILS — the current code uses
`env.AUDIT_ERASURE_SALT ?? DEV_SALT_FALLBACK`, so when the env var is
absent the constant kicks in and `repo.eraseTenant` is called with the
fallback string instead of throwing.

- [ ] **Step 3: Update `offboard-tenant.service.ts`**

In `apps/api/src/contexts/tenancy/application/offboard-tenant.service.ts`:

Delete the constant on line 9:

```ts
const DEV_SALT_FALLBACK = 'dev-only-erasure-salt-32-chars-padding';
```

Replace `executeErasure` (currently lines 47-53):

```ts
async executeErasure(input: { tenantId: string }): Promise<TenantSnapshot> {
  const id = TenantId.parse(input.tenantId);
  const salt = this.env.AUDIT_ERASURE_SALT;
  if (!salt) {
    throw new Error(
      'AUDIT_ERASURE_SALT must be set — env.schema validation should ' +
        'have caught this in any NODE_ENV; reaching this branch indicates ' +
        'a schema regression (ADR-0020 I-3).',
    );
  }
  const snapshot = await this.repo.eraseTenant(id, salt);
  this.logger.warn({ tenantId: id }, 'Tenant erased (irreversible)');
  return snapshot;
}
```

- [ ] **Step 4: Run the spec to verify all tests pass**

Run: `pnpm --filter @resto/api test -- offboard-tenant.service`
Expected: all 6 tests PASS (the existing 5 plus the new one).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contexts/tenancy/application/offboard-tenant.service.ts apps/api/test/unit/tenancy/offboard-tenant.service.spec.ts
git commit -m "refactor(tenancy): drop DEV_SALT_FALLBACK, fail on missing AUDIT_ERASURE_SALT (ADR-0020 I-3)"
```

---

## Task 5 — Add qr-menu bundle-audit Vitest spec (RED)

Add the test before fixing the leak so the spec captures the current
broken behaviour as a failing baseline. The next task makes it green.

**Files:**

- Create: `apps/qr-menu/test/bundle-no-dev-leak.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/qr-menu/test/bundle-no-dev-leak.spec.ts`:

```ts
// @vitest-environment node
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(__dirname, '..');
const distAssets = join(projectRoot, 'dist', 'assets');

const readBundleJs = (): string => {
  expect(existsSync(distAssets), `expected ${distAssets} after build`).toBe(
    true,
  );
  const jsFiles = readdirSync(distAssets).filter((f) => f.endsWith('.js'));
  expect(jsFiles.length, 'expected at least one .js asset').toBeGreaterThan(0);
  return jsFiles
    .map((f) => readFileSync(join(distAssets, f), 'utf8'))
    .join('\n');
};

describe('qr-menu prod bundle', () => {
  it('does not leak dev-only tenant override identifiers', () => {
    // Build with no VITE_TENANT_SLUG in the env — even so, the literal
    // string `VITE_TENANT_SLUG` (used by Vite's env replacement) and the
    // resulting `x-tenant-slug` header value must not appear in the
    // emitted JS. If they do, a future build that DOES set the env var
    // would silently ship a cross-tenant primitive (ADR-0020 I-3,
    // apps/CLAUDE.md "VITE_* is baked into the bundle at build time").
    execSync('pnpm --filter @resto/qr-menu build', {
      cwd: resolve(projectRoot, '..', '..'),
      stdio: 'inherit',
      env: { ...process.env, VITE_TENANT_SLUG: '' },
    });
    const bundle = readBundleJs();
    for (const needle of ['VITE_TENANT_SLUG', 'x-tenant-slug']) {
      expect(bundle, `bundle must not contain "${needle}"`).not.toContain(
        needle,
      );
    }
  }, 60_000);
});
```

The `// @vitest-environment node` directive at the top of the file
overrides the jsdom default from `apps/qr-menu/vitest.config.ts`
(`fs`/`child_process` don't work under jsdom). `60_000` ms timeout
accommodates the build step.

- [ ] **Step 2: Run the spec to verify it fails**

Run: `pnpm --filter @resto/qr-menu test -- bundle-no-dev-leak`
Expected: the test FAILS — the current `apps/qr-menu/src/api/client.ts`
reads `env.VITE_TENANT_SLUG` unguarded, so the literal `VITE_TENANT_SLUG`
ends up in the bundle (either as a leftover identifier reference or as
the `x-tenant-slug` header literal).

If the test passes unexpectedly: STOP and investigate. Either the
current code already tree-shakes the reference (unlikely given the
ADR-0020 review), or the test is mis-targeting. Report to user before
"fixing" anything.

- [ ] **Step 3: Commit the failing test**

(This is a deliberate RED commit — the next task makes it green. Keeping
the RED commit on the branch lets a future bisect attribute regressions
correctly.)

```bash
git add apps/qr-menu/test/bundle-no-dev-leak.spec.ts
git commit -m "test(qr-menu): assert prod bundle has no dev tenant fallback (failing)"
```

---

## Task 6 — Guard `VITE_TENANT_SLUG` in qr-menu client (GREEN)

Wrap the override in `import.meta.env.DEV` so Vite tree-shakes the entire
branch — including the `x-tenant-slug` header construction — out of prod
builds.

**Files:**

- Modify: `apps/qr-menu/src/api/client.ts:1-20`

- [ ] **Step 1: Update `client.ts`**

In `apps/qr-menu/src/api/client.ts`, replace the top of the file
(currently lines 1-20):

```ts
import type { MenuDto } from './types';

const env = import.meta.env as Record<string, string | undefined>;
const API_URL: string = env.VITE_API_URL ?? '';
// `import.meta.env.DEV` is a static boolean Vite inlines at build time.
// In a prod build this expression becomes `false ? ... : undefined`, so
// the `env.VITE_TENANT_SLUG` read and the downstream `x-tenant-slug`
// header construction are dead-code-eliminated. ADR-0020 I-3.
const TENANT_SLUG_OVERRIDE: string | undefined = import.meta.env.DEV
  ? env.VITE_TENANT_SLUG
  : undefined;

export class MenuNotFoundError extends Error {
  constructor() {
    super('Menu not found for this tenant.');
    this.name = 'MenuNotFoundError';
  }
}

const buildHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {};
  if (TENANT_SLUG_OVERRIDE) {
    headers['x-tenant-slug'] = TENANT_SLUG_OVERRIDE;
  }
  return headers;
};
```

The rest of the file (`apiUrl`, `fetchMenu`) is unchanged.

- [ ] **Step 2: Re-run the bundle-audit test to verify it passes**

Run: `pnpm --filter @resto/qr-menu test -- bundle-no-dev-leak`
Expected: the test PASSES. The build runs, the bundle is emitted, and
neither `VITE_TENANT_SLUG` nor `x-tenant-slug` appears in any
`dist/assets/*.js`.

If it still fails: inspect the actual bundle content. Vite minifies
property accesses but should DCE the `false ? X : undefined` branch.
Confirm with `cat dist/assets/*.js | grep -c 'x-tenant-slug'` (expect
`0`). If the literal is still present, the static-boolean check may
have been miscoded — verify `import.meta.env.DEV` is used (not
`process.env.NODE_ENV` or similar).

- [ ] **Step 3: Run the rest of the qr-menu test suite**

Run: `pnpm --filter @resto/qr-menu test`
Expected: all tests PASS, including the existing `menu-view.spec.tsx`.
The component test does not exercise `client.ts` directly — but if it
does (transitively via `MenuView`), the static `false` branch in prod
mode would still resolve to `undefined` in unit tests (which run under
Vite's dev mode). Behaviour in dev is unchanged.

- [ ] **Step 4: Commit**

```bash
git add apps/qr-menu/src/api/client.ts
git commit -m "fix(qr-menu): guard VITE_TENANT_SLUG behind import.meta.env.DEV (ADR-0020 I-3)"
```

---

## Task 7 — Update root `.env.example`

`.env.example` already lists `S3_ENDPOINT`, `S3_ACCESS_KEY`,
`S3_SECRET_KEY` with dev defaults (lines 58, 63-64). After Tasks 1-2,
these are required-in-non-dev rather than schema-defaulted. Update the
comment block so a fresh developer reading the example knows the
production deploy must explicitly set them.

No tests for doc-only change.

**Files:**

- Modify: `.env.example:53-64`

- [ ] **Step 1: Update the MinIO comment block**

In `.env.example`, replace the block starting at line 53 (`# ---------- MinIO (S3-compatible object storage) ----------`)
through line 64 with:

```
# ---------- MinIO (S3-compatible object storage) ----------
# `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` are required outside
# NODE_ENV=development/test (ADR-0020 I-3). The values below are the
# local docker-compose MinIO credentials; production deploys inject
# per-bucket IAM credentials from Vault / 1Password Connect.
MINIO_ROOT_USER=minio
MINIO_ROOT_PASSWORD=minio_dev_password
MINIO_PORT=9000
MINIO_CONSOLE_PORT=9001
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=resto-dev
S3_ACCESS_KEY=minio
S3_SECRET_KEY=minio_dev_password
```

(Only the comment changed; the values are identical.)

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs(env): note S3_* are required outside dev (ADR-0020 I-3)"
```

---

## Task 8 — Create `docs/runbooks/i3-prod-fallback-audit.md`

Audit deliverable. Documents what was found, what replaced it, and the
manual checklist for the first prod rollout.

**Files:**

- Create: `docs/runbooks/i3-prod-fallback-audit.md`

- [ ] **Step 1: Create the runbook**

```markdown
# Runbook — I-3 prod-fallback audit

> **Authority:** [ADR-0020 § Invariant I-3](../adr/0020-multi-tenancy-and-event-bus-invariants.md).
> Audit performed 2026-05-16 by founder during pre-prod hardening. Prod
> not yet deployed at audit time.

## Inventory and resolution

| Source location                                                                                | Original value                                               | Replaced by                                                                           | Catches future regression                                                                                                 |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/config/env.schema.ts:88-92` (S3\_\* `.default(...)`)                             | `'http://localhost:9000'`, `'minio'`, `'minio_dev_password'` | `.optional()` + entries in `superRefine` required-list                                | Layer 1 (Zod parse) + Layer 2 (`assertProdGuardrails`)                                                                    |
| `apps/api/src/contexts/tenancy/application/offboard-tenant.service.ts:9` (`DEV_SALT_FALLBACK`) | `'dev-only-erasure-salt-32-chars-padding'`                   | constant deleted; service throws if `env.AUDIT_ERASURE_SALT` is undefined             | Layer 1 (existing superRefine) + Layer 2 (`assertProdGuardrails`) + Layer 3 (service throw)                               |
| `apps/qr-menu/src/api/client.ts:5,16` (`VITE_TENANT_SLUG`)                                     | unguarded read of `import.meta.env.VITE_TENANT_SLUG`         | wrapped in `import.meta.env.DEV ? ... : undefined`; Vite tree-shakes from prod bundle | Layer 3 only (qr-menu has no `main.ts` / `loadEnv`); reinforced by `apps/qr-menu/test/bundle-no-dev-leak.spec.ts` CI test |

If a future audit discovers a new dev-fallback, the resolution must
satisfy ADR-0020 I-3: both an `if (NODE_ENV ===
'development' \|\| 'test')` runtime guard AND a non-dev `superRefine`
block, OR an equivalent (Layer 2 / Layer 3) belt-and-suspenders pair.
Add the row to this table.

## First-deploy checklist

Before flipping the first real prod deploy, verify each item:

- [ ] Vault (or chosen secret store) contains values for every key
      enforced by `env.schema.ts:superRefine` in non-dev:
      `BETTER_AUTH_SECRET`, `BETTER_AUTH_BASE_URL`, `BETTER_AUTH_DATABASE_URL`,
      `ADMIN_WEB_URL`, `AUTH_COOKIE_DOMAIN`, `AUDIT_ERASURE_SALT`,
      `TRUST_PROXY`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`.
- [ ] None of those values equal a dev default. Specifically:
      `S3_SECRET_KEY \!= 'minio_dev_password'`, `S3_ACCESS_KEY \!= 'minio'`,
      `S3_ENDPOINT \!= 'http://localhost:9000'`,
      `AUDIT_ERASURE_SALT \!= 'dev-only-erasure-salt-32-chars-padding'`.
- [ ] CI artifact for qr-menu: confirm `apps/qr-menu/dist/assets/*.js`
      contains neither `VITE_TENANT_SLUG` nor `x-tenant-slug`. Reproduce
      locally: `pnpm --filter @resto/qr-menu build && grep -c 'x-tenant-slug'
apps/qr-menu/dist/assets/*.js` (expect `0`). The automated test
      `bundle-no-dev-leak.spec.ts` runs in CI as a backstop.
- [ ] On first deploy, tail the api logs for one of:
  - **expected (pass)** — `[bootstrap] Resto api listening on :<port>`
  - **expected (fail)** — `prod-guardrails: refusing to start: <list>`
    followed by `process.exit(1)`. If you see this, fix the env vars in
    Vault and redeploy. Do NOT bypass.

## Cross-references

- ADR-0020 § Invariant I-3 — the canonical rule.
- `docs/superpowers/specs/2026-05-16-i3-prod-audit-startup-assertion-design.md`
  — design rationale.
- `apps/api/src/config/prod-guardrails.ts` — Layer 2 implementation.
- `apps/qr-menu/test/bundle-no-dev-leak.spec.ts` — qr-menu CI gate.
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/i3-prod-fallback-audit.md
git commit -m "docs(runbooks): I-3 prod-fallback audit + first-deploy checklist"
```

---

## Final verification

After Task 8, before opening a PR:

- [ ] Run the full test suite: `pnpm test`
      Expected: all green.
- [ ] Run the linter: `pnpm lint`
      Expected: clean.
- [ ] Run typecheck: `pnpm typecheck`
      Expected: clean.
- [ ] Inspect the commit log:
      `bash
    git log main..HEAD --oneline
    `
      Expected: 8 commits, each in the form
      `<type>(<scope>): <subject>` per Conventional Commits. No
      Co-Authored-By footer. No multi-paragraph bodies.
- [ ] Confirm the qr-menu bundle is clean one more time:
      `bash
    pnpm --filter @resto/qr-menu build
    grep -c 'x-tenant-slug\|VITE_TENANT_SLUG' apps/qr-menu/dist/assets/*.js
    `
      Expected: `0`.

Ask the user before `git push` and before opening a PR.

---

## Out of scope (re-stated for the executor)

If you find any of these, surface to the user — do NOT silently expand
the work:

- Custom ESLint rule that bans `.default('...secret...')` patterns repo-
  wide. That is I-1 enforcement-infrastructure work, separate phase.
- `apps/admin` `NEXT_PUBLIC_*` fallbacks. Separate PR.
- I-5 / I-5b inbox-dedup strengthening.
- Rotating any existing secret. Nothing is rotated by this work.
- Adding S3 client construction code. The S3 client doesn't exist in
  MVP-1; when a consumer adds one, that consumer's PR adds its own
  runtime guard mirroring `OffboardTenantService`'s pattern.
