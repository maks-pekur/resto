# RES-246 Implementation Plan — close S3 e2e bootstrap regression

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Zod defaults to the three S3 env-schema fields so dev/test boot without per-spec env-seeding; remove the redundant `superRefine` "required-in-prod" entries (the boot-time `assertProdGuardrails` check is now the sole prod-rejection layer for them); add a `.refine` to preserve whitespace-only rejection; reword the adapter's now-misleading "schema regression" error.

**Architecture:** Single API project change. env schema migrates from `.optional()` to `.default(<DEV_DEFAULTS>)` on `S3_ENDPOINT` / `S3_ACCESS_KEY` / `S3_SECRET_KEY`. The contract that "missing S3 envs in prod → boot fails" is preserved because the schema default value is exactly the `DEV_DEFAULTS` constant that `assertProdGuardrails` already rejects. Whitespace-only inputs (which are non-`undefined` and therefore bypass `.default()`) get caught by a `.refine` instead of the dropped `superRefine` `!env[key]?.trim()` check.

**Tech Stack:** NestJS 11 + Fastify, Zod 4, Vitest. ADR-0020 I-3 (env-schema invariants). `prod-guardrails.ts` boot-time defense-in-depth.

**Spec:** `docs/superpowers/specs/2026-05-23-res-246-s3-e2e-bootstrap-fix-design.md`

---

## File map

**Modify:**

- `apps/api/src/config/env.schema.ts` — S3 field defaults + `.refine` whitespace guard + drop S3 keys from `superRefine` prod-required list + JSDoc rewrite.
- `apps/api/src/contexts/catalog/infrastructure/s3-signed-image-url.adapter.ts` — reword error message (the structurally-unreachable check stays as defense-in-depth).
- `apps/api/test/unit/env.spec.ts` — rewrite the three "rejects production boot when S3_X is missing" tests to express the new schema-default → `assertProdGuardrails`-rejection chain; add two new tests pinning the defaults + the override-acceptance contract; keep the whitespace-only test (passes via the new `.refine`).

**No new files. No changes to `prod-guardrails.ts` itself** (its existing behavior is exactly what the migration leans on — verified by inspection of `prod-guardrails.spec.ts:42-76`, which already covers the `undefined` + `=== devDefault` cases that the new path produces).

**Explicitly NOT touched in this PR** (per user-chosen narrow scope):

- `.github/workflows/ci.yml:135-143` (openapi-drift S3 placeholders) — defer to follow-up commit/PR.
- `apps/api/test/e2e/tenants-controller.e2e.spec.ts` (RES-242 side-commit `8f00650`) — defer to a follow-up commit on `main` after RES-242 PR #159 merges.

---

## Task 1 — Schema migration (defaults + refine + remove from superRefine) + test rewrite

**Files:**

- Modify: `apps/api/src/config/env.schema.ts:87-97` (S3 JSDoc + field block)
- Modify: `apps/api/src/config/env.schema.ts:171-193` (drop S3 keys from `superRefine` list)
- Modify: `apps/api/test/unit/env.spec.ts:156-208` (rewrite 3 missing-S3 tests + add 2 new tests)

This is a contract migration: the schema layer's "reject missing S3 in prod" guarantee moves to the boot-time `assertProdGuardrails` layer. The two pieces ship together in one commit; splitting would leave intermediate states where either the schema or the tests are inconsistent.

- [ ] **Step 1.1: Add the two new positive tests (failing first per TDD)**

Edit `apps/api/test/unit/env.spec.ts`. Append two new `it` blocks at the end of the `describe('loadEnv')` block (just before the closing `});` on line 246). Use the existing `baseEnv` (line 4-7) for the minimal-env shape — no extra setup needed:

```ts
it('applies S3 dev defaults when S3_* envs are unset', () => {
  const env = loadEnv(baseEnv);
  expect(env.S3_ENDPOINT).toBe('http://localhost:9000');
  expect(env.S3_ACCESS_KEY).toBe('minio');
  expect(env.S3_SECRET_KEY).toBe('minio_dev_password');
  expect(env.S3_REGION).toBe('us-east-1');
  expect(env.S3_BUCKET).toBe('resto-dev');
});

it('accepts explicit S3 overrides when env vars are set', () => {
  const env = loadEnv({
    ...baseEnv,
    S3_ENDPOINT: 'https://r2.example.com',
    S3_ACCESS_KEY: 'real-key',
    S3_SECRET_KEY: 'real-secret',
  });
  expect(env.S3_ENDPOINT).toBe('https://r2.example.com');
  expect(env.S3_ACCESS_KEY).toBe('real-key');
  expect(env.S3_SECRET_KEY).toBe('real-secret');
});
```

- [ ] **Step 1.2: Rewrite the three "rejects production boot when S3_X is missing" tests**

Edit `apps/api/test/unit/env.spec.ts`. The current tests at lines 156-208 assert that `loadEnv(productionEnv)` throws when S3\_\* envs are absent. Post-fix, `loadEnv` will NOT throw — the schema default kicks in. The new contract is: `loadEnv` succeeds, returns the `DEV_DEFAULTS` value, and `assertProdGuardrails` then rejects.

Replace the three `it` blocks at lines 156-208 (`'rejects production boot when S3_ENDPOINT is missing'`, `'... S3_ACCESS_KEY ...'`, `'... S3_SECRET_KEY ...'`) with the following three `it` blocks. First, add the import for `assertProdGuardrails` near the top of the file (alongside the existing `loadEnv` / `EnvValidationError` import on line 2):

```ts
import { EnvValidationError, loadEnv } from '../../src/config/env.schema';
import {
  assertProdGuardrails,
  ProdGuardrailsError,
} from '../../src/config/prod-guardrails';
```

Then replace lines 156-208 with:

```ts
it('applies S3_ENDPOINT default in production but assertProdGuardrails rejects it', () => {
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
    INTERNAL_API_TOKEN: 'production-token-32-chars-padding-aaaaa',
  };
  const env = loadEnv(productionEnv);
  expect(env.S3_ENDPOINT).toBe('http://localhost:9000');
  expect(() => assertProdGuardrails(env)).toThrow(ProdGuardrailsError);
  expect(() => assertProdGuardrails(env)).toThrow(/S3_ENDPOINT/);
});

it('applies S3_ACCESS_KEY default in production but assertProdGuardrails rejects it', () => {
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
    INTERNAL_API_TOKEN: 'production-token-32-chars-padding-aaaaa',
  };
  const env = loadEnv(productionEnv);
  expect(env.S3_ACCESS_KEY).toBe('minio');
  expect(() => assertProdGuardrails(env)).toThrow(/S3_ACCESS_KEY/);
});

it('applies S3_SECRET_KEY default in production but assertProdGuardrails rejects it', () => {
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
    INTERNAL_API_TOKEN: 'production-token-32-chars-padding-aaaaa',
  };
  const env = loadEnv(productionEnv);
  expect(env.S3_SECRET_KEY).toBe('minio_dev_password');
  expect(() => assertProdGuardrails(env)).toThrow(/S3_SECRET_KEY/);
});
```

The whitespace-only test at line 228 (`'rejects production boot when a required var is whitespace-only'`) stays untouched — the new `.refine` on the S3 fields (added in Step 1.5) keeps the rejection at the schema layer for the `'   '` case.

- [ ] **Step 1.3: Run tests, verify the right failures**

Run: `pnpm --filter @resto/api exec vitest run test/unit/env.spec.ts`

Expected: 5 tests FAIL.

- 2 new tests fail with: defaults not applied (S3 fields are `undefined`, not `'http://localhost:9000'` etc).
- 3 rewritten tests fail with: `loadEnv(productionEnv)` STILL throws (the schema hasn't been updated yet, so missing S3_X still triggers superRefine).

The whitespace-only test (line 228) should still pass (no schema change yet).

- [ ] **Step 1.4: Update `env.schema.ts` — replace optional with default + add refine for whitespace**

Edit `apps/api/src/config/env.schema.ts`. Find lines 87-97 (the S3 JSDoc + 5 field declarations). Replace with:

```ts
    /**
     * S3-compatible bucket for menu images (R2 / AWS S3 / MinIO in dev).
     *
     * Defaults match `prod-guardrails.DEV_DEFAULTS` so dev/test boot
     * without env-seed. `assertProdGuardrails` (boot-time, non-dev/test)
     * is the prod-rejection layer for these three keys — it throws
     * `ProdGuardrailsError` if any of the values reaching the running
     * process equals the dev default. ADR-0020 I-3.
     *
     * The `.refine` rejects whitespace-only values (e.g. `'   '`).
     * `.default(...)` only applies when the input is `undefined`; a
     * whitespace string is "set" from Zod's perspective, so without
     * `.refine` it would bypass the default and reach the adapter.
     */
    S3_ENDPOINT: z
      .string()
      .url()
      .default('http://localhost:9000')
      .refine((s) => s.trim().length > 0, 'S3_ENDPOINT must not be whitespace-only'),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().default('resto-dev'),
    S3_ACCESS_KEY: z
      .string()
      .default('minio')
      .refine((s) => s.trim().length > 0, 'S3_ACCESS_KEY must not be whitespace-only'),
    S3_SECRET_KEY: z
      .string()
      .default('minio_dev_password')
      .refine((s) => s.trim().length > 0, 'S3_SECRET_KEY must not be whitespace-only'),
```

- [ ] **Step 1.5: Drop S3 keys from `superRefine` required-in-prod list**

Edit `apps/api/src/config/env.schema.ts`. Find lines 171-193 (the `superRefine` block — currently has `'S3_ENDPOINT'`, `'S3_ACCESS_KEY'`, `'S3_SECRET_KEY'` in the `for...of` array). Remove those three entries.

Before (current):

```ts
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'development' && env.NODE_ENV !== 'test') {
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
        'INTERNAL_API_TOKEN',
      ] as const) {
```

After:

```ts
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'development' && env.NODE_ENV !== 'test') {
      // S3_ENDPOINT / S3_ACCESS_KEY / S3_SECRET_KEY are now always set
      // via Zod `.default(...)` (matching `DEV_DEFAULTS`). Prod rejection
      // for them moves to `assertProdGuardrails` (boot-time), which
      // catches the dev-default values via the `=== devDefault` check.
      // ADR-0020 I-3.
      for (const key of [
        'BETTER_AUTH_SECRET',
        'BETTER_AUTH_BASE_URL',
        'BETTER_AUTH_DATABASE_URL',
        'ADMIN_WEB_URL',
        'AUTH_COOKIE_DOMAIN',
        'AUDIT_ERASURE_SALT',
        'TRUST_PROXY',
        'INTERNAL_API_TOKEN',
      ] as const) {
```

- [ ] **Step 1.6: Run tests, verify green**

Run: `pnpm --filter @resto/api exec vitest run test/unit/env.spec.ts`

Expected: ALL tests PASS. The new defaults tests should be green (defaults are now applied). The three rewritten tests should be green (schema applies default → `assertProdGuardrails` rejects). The whitespace test at line 228 should still be green (the new `.refine` enforces it at the schema layer).

If anything fails — particularly if `loadEnv(productionEnv)` doesn't throw the way the whitespace test expects, OR if Zod's `.default()` + `.refine()` chain has a subtle ordering bug — STOP and report BLOCKED. The order of operations is: input parsing → `.default()` substitutes `undefined` → `.refine` runs on the resolved value. For a whitespace input `'   '`, no default applies (input is non-undefined), so `.refine` rejects.

- [ ] **Step 1.7: Run full unit suite to confirm no collateral damage**

Run: `pnpm exec nx run api:typecheck && pnpm exec nx run api:lint && pnpm exec nx run api:test`

Expected: ALL pass. The schema change is type-compatible (the inferred type for `S3_ENDPOINT` changes from `string | undefined` to `string`, which can only make consumers happier — adapter no longer needs the `!env.S3_ENDPOINT` check at the type level but we keep it as defense-in-depth in Task 2).

- [ ] **Step 1.8: Commit**

```bash
git add apps/api/src/config/env.schema.ts apps/api/test/unit/env.spec.ts
git commit -m "fix(api): apply S3 dev defaults in env.schema (RES-246)"
```

---

## Task 2 — Reword S3 adapter error message

**Files:**

- Modify: `apps/api/src/contexts/catalog/infrastructure/s3-signed-image-url.adapter.ts:26-32`

The adapter's check (`if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY)`) becomes structurally unreachable post-Task-1 (schema defaults guarantee all three are set). We keep the check as defense-in-depth (project pattern — same family as the `InternalTokenGuard` "missing token throw" branch that became structurally unreachable per the ADR-0020 follow-up observation backlog). The current error message claims "env.schema validation should have caught this in any NODE_ENV; reaching this branch indicates a schema regression (ADR-0020 I-3)." — that claim is now accurate post-Task-1, but the wording can be sharper.

- [ ] **Step 2.1: Reword the error message**

Edit `apps/api/src/contexts/catalog/infrastructure/s3-signed-image-url.adapter.ts:26-32`. Replace:

```ts
if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) {
  throw new Error(
    'S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY must be set — env.schema ' +
      'validation should have caught this in any NODE_ENV; reaching this ' +
      'branch indicates a schema regression (ADR-0020 I-3).',
  );
}
```

with:

```ts
if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) {
  throw new Error(
    'S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY are missing. env.schema ' +
      'now supplies dev defaults (matching `prod-guardrails.DEV_DEFAULTS`) ' +
      'so this branch is structurally unreachable; reaching it indicates ' +
      'the schema was rolled back. ADR-0020 I-3.',
  );
}
```

- [ ] **Step 2.2: Verify typecheck + lint stay green**

Run: `pnpm exec nx run api:typecheck && pnpm exec nx run api:lint`

Expected: PASS. No tests exercise this branch directly (it's structurally unreachable); the existing prod-guardrails + env-schema tests cover the contract that prevents this branch from firing.

- [ ] **Step 2.3: Commit**

```bash
git add apps/api/src/contexts/catalog/infrastructure/s3-signed-image-url.adapter.ts
git commit -m "docs(api): reword S3 adapter error to reflect new env.schema contract (RES-246)"
```

---

## Task 3 — E2E bootstrap canary (no commit)

**Files:** none modified.

Verifies AC #1 of the spec: "all e2e specs in `apps/api/test/e2e/` can bootstrap `AppModule` without any manual env-seed." We use `me-brands.e2e.spec.ts` as the canary — it's a previously-broken spec that doesn't seed S3 in its `beforeAll`.

- [ ] **Step 3.1: Run me-brands e2e and observe the bootstrap behavior**

Run: `pnpm --filter @resto/api exec vitest run test/e2e/me-brands.e2e.spec.ts`

Expected: `AppModule` bootstraps successfully — i.e., the run no longer fails with `S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY must be set ...`. The test bodies inside the spec may still fail for OTHER reasons (RES-248 `innerJoin` bug, rate-limit pollution, etc.) — that's expected and outside RES-246 scope. The gate is purely: did the `Test.createTestingModule(...).compile()` call succeed?

If the bootstrap still fails with an S3-related error, STOP and report BLOCKED — the Task 1 change didn't land correctly.

If the bootstrap fails with a DIFFERENT error (Docker not running, container start timeout, an unrelated env issue), STOP and report — Docker availability is an environment concern, not RES-246.

If the bootstrap succeeds, regardless of what the individual test bodies do, AC #1 is met.

- [ ] **Step 3.2: No commit — verification only.**

---

## Task 4 — Full project verification before PR

**Files:** none modified.

- [ ] **Step 4.1: Lint**

Run: `pnpm exec nx run api:lint`
Expected: PASS, no new warnings.

- [ ] **Step 4.2: Typecheck**

Run: `pnpm exec nx run api:typecheck`
Expected: PASS.

- [ ] **Step 4.3: Full unit-test suite**

Run: `pnpm exec nx run api:test`
Expected: PASS — all 289+ unit tests (was 289 at RES-242 close; RES-246 adds 2 new tests, possibly more if test count drifted on `main`).

- [ ] **Step 4.4: No commit — verification only.**

---

## PR preparation (after Task 4)

When opening the PR:

- **Title:** `fix(api): close S3 e2e bootstrap regression (RES-246)`
- **Body:** include the prod-rejection contract migration note (schema layer → boot-time layer), call out the two intentionally-deferred follow-ups (CI cleanup + tenants-controller seed removal post-RES-242 merge), link the spec + plan + ADR-0020 I-3.
- **AC #2 caveat:** explicitly note in the PR description that "CI runs the full e2e suite green" from the Linear ticket is downgraded to "bootstrap unblocked" per the user-chosen narrow scope — the broader e2e suite has other pre-existing failures (RES-248 brand-drizzle, rate-limit pollution, missing AUDIT_ERASURE_SALT in some specs) that this PR does NOT address.
- Linear: move RES-246 → In Review with the PR attached.

---

## Self-review notes (for the executor)

- All 4 AC items from RES-246 are covered: AC1 by Task 3 (bootstrap canary), AC2 by Task 1 (CI green for `api:test` + `tenants-controller.e2e`), AC3 by Task 1's three rewritten tests proving the prod-rejection contract migration, AC4 by Task 2's adapter message rewrite. AC2 from the Linear ticket ("full e2e suite green") is explicitly out of scope per user choice — note in PR description.
- The schema change is intentionally minimal: only the three S3 keys that participate in the regression. `AUDIT_ERASURE_SALT` and `INTERNAL_API_TOKEN` could receive the same treatment but are deferred to follow-up per spec.
- Zod `.default()` + `.refine()` ordering invariant: defaults are substituted at the `ZodOptional` unwrap step (when input is `undefined`), refines run on the resolved value. A whitespace `'   '` input is non-undefined → default doesn't apply → refine sees `'   '` → rejects. This is verified by the existing whitespace test at `env.spec.ts:228` staying green after Task 1.
- If Task 1's Step 1.6 surfaces that the whitespace test now FAILS unexpectedly, the cause is almost certainly a Zod 4 quirk in how `.default()` interacts with `.refine()`. Fallback: extend `assertProdGuardrails` to also reject whitespace-only values, and drop the schema-level `.refine`. Document the change in the commit if so.
