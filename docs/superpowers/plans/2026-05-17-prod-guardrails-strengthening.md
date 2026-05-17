# Prod-guardrails strengthening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close four minor strengthening items from the I-3 (PR #130)
final code review — `INTERNAL_API_TOKEN` fail-fast at boot,
whitespace-bypass fix in the `superRefine` loop, stronger
`bundle-no-dev-leak` test with a real slug fixture, and an
operator-actionable trailer on `ProdGuardrailsError`.

**Architecture:** All four fixes are surgical extensions to files that
I-3 already touched. No new files, no new abstractions. `env.schema.ts`
gains one required-list entry + a `.trim()` predicate change.
`prod-guardrails.ts` gains one `DEV_DEFAULTS` entry + a longer
`ProdGuardrailsError.message`. `bundle-no-dev-leak.spec.ts` gains one
new `it()` case with a real fixture value. Tests are added or
strengthened alongside each component.

**Tech Stack:** TypeScript 6.0 · NestJS · Zod v3 (`superRefine`) ·
Vitest 2 · Vite 5

**Spec:** [`docs/superpowers/specs/2026-05-17-prod-guardrails-strengthening-design.md`](../specs/2026-05-17-prod-guardrails-strengthening-design.md)

**Branch:** `prod-guardrails-strengthening` (spec already committed
there as `02b768e`).

---

## Pre-flight

- Confirm branch: `git branch --show-current` → `prod-guardrails-strengthening`.
- Confirm Docker is running (Task 4 builds the qr-menu bundle twice;
  no Postgres testcontainer needed, just Vite's build pipeline runs
  natively).
- No `pnpm install` needed — the lockfile is current from prior PRs.

**Important finding from the spec phase:** the four existing
production-fixture tests in `apps/api/test/unit/env.spec.ts` do NOT
include `INTERNAL_API_TOKEN` today. The spec's claim that they
"already include it via post-T1 work" turned out to be wrong. Task 1
proactively adds `INTERNAL_API_TOKEN: 'production-token-32-chars-padding-aaaaa'`
to the relevant fixtures BEFORE adding it to the schema's required-
list, so each test continues to fail only for its named reason.

---

## Task 1 — `INTERNAL_API_TOKEN` required in non-dev

Add the env var to the env-schema required-list and to
`prod-guardrails.ts` `DEV_DEFAULTS`, with corresponding tests.

**Files:**

- Modify: `apps/api/src/config/env.schema.ts`
- Modify: `apps/api/src/config/prod-guardrails.ts`
- Modify: `apps/api/test/unit/env.spec.ts`
- Modify: `apps/api/test/unit/prod-guardrails.spec.ts`

- [ ] **Step 1: Update existing prod fixtures to include `INTERNAL_API_TOKEN`**

In `apps/api/test/unit/env.spec.ts`, add the line
`INTERNAL_API_TOKEN: 'production-token-32-chars-padding-aaaaa',` to
each of these existing production-fixture tests (matching the indent
of the surrounding fields):

1. `rejects TENANT_DEV_FALLBACK_SLUG outside development` (around line 43-57)
2. `accepts a production environment with a properly-shaped AUTH_COOKIE_DOMAIN` (around line 83-97)
3. `rejects production boot when TRUST_PROXY is missing` (around line 112-125)
4. `rejects TRUST_PROXY=true outside dev/test` (around line 129-143)
5. `rejects production boot when S3_ENDPOINT is missing` (around line 152+)
6. `rejects production boot when S3_ACCESS_KEY is missing`
7. `rejects production boot when S3_SECRET_KEY is missing`

Do NOT add `INTERNAL_API_TOKEN` to the `rejects production boot when
AUTH_COOKIE_DOMAIN is missing` test (around line 70-78). That fixture
is intentionally minimal to test "schema rejects when a BA-area var
is missing"; adding more vars muddies it. The test's
`.toThrow(/AUTH_COOKIE_DOMAIN/)` regex matches even when the error
also mentions `INTERNAL_API_TOKEN`.

In `apps/api/test/unit/prod-guardrails.spec.ts`, add
`INTERNAL_API_TOKEN: 'production-token-32-chars-padding-aaaaa',` to
the `okProdValues` const (lines 5-10):

```ts
const okProdValues = {
  S3_ENDPOINT: 'https://s3.amazonaws.com',
  S3_ACCESS_KEY: 'prod-access',
  S3_SECRET_KEY: 'prod-secret-replace-me',
  AUDIT_ERASURE_SALT: 'production-erasure-salt-32-chars-padding',
  INTERNAL_API_TOKEN: 'production-token-32-chars-padding-aaaaa',
} as const;
```

This step is a pure-extension preparation — all tests should still
pass after this step alone (no schema change yet means
`INTERNAL_API_TOKEN` is still optional, and the new entries are
ignored by Zod's `.strip()` default).

- [ ] **Step 2: Run all tests to verify the fixture additions are non-breaking**

Run: `pnpm --filter @resto/api test`

Expected: all tests PASS. The new `INTERNAL_API_TOKEN` entries in
each fixture are silently accepted by the current schema. If any
test fails, STOP and investigate — the fixture changes should be
behaviorally inert.

- [ ] **Step 3: Write the failing tests (RED)**

In `apps/api/test/unit/env.spec.ts`, append a new `it()` case at the
bottom of the `describe('loadEnv', …)` block, right before the
closing `});`. Use the same prod-fixture pattern (set all required
vars except `INTERNAL_API_TOKEN`, expect a regex match):

```ts
it('rejects production boot when INTERNAL_API_TOKEN is missing', () => {
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
    S3_SECRET_KEY: 'prod-secret-replace-me',
  };
  expect(() => loadEnv(productionEnv)).toThrow(/INTERNAL_API_TOKEN/);
});
```

In `apps/api/test/unit/prod-guardrails.spec.ts`, append a new `it()`
case at the bottom of the `describe('assertProdGuardrails', …)`
block, right before the closing `});`:

```ts
it('throws when INTERNAL_API_TOKEN is the dev placeholder', () => {
  expect(() =>
    assertProdGuardrails(
      buildEnv({ INTERNAL_API_TOKEN: 'internal_dev_token_change_me' }),
    ),
  ).toThrow(/INTERNAL_API_TOKEN/);
});
```

- [ ] **Step 4: Run tests to verify the two new cases fail (RED phase confirmation)**

Run: `pnpm --filter @resto/api test -- env.spec`

Expected: the new `rejects production boot when INTERNAL_API_TOKEN is
missing` test FAILS — the current schema marks `INTERNAL_API_TOKEN`
as `.optional()` and no superRefine entry forces it, so the missing
var causes no error to be thrown. The existing tests still PASS
(Step 1 made them non-breaking).

Run: `pnpm --filter @resto/api test -- prod-guardrails`

Expected: the new `throws when INTERNAL_API_TOKEN is the dev placeholder`
test FAILS — `DEV_DEFAULTS` doesn't include `INTERNAL_API_TOKEN` yet.

- [ ] **Step 5: Update `env.schema.ts`**

In `apps/api/src/config/env.schema.ts`, locate the existing
`superRefine` required-list loop (currently around lines 167-185)
and append `'INTERNAL_API_TOKEN'` to the array:

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
  'INTERNAL_API_TOKEN',
] as const) {
```

No other change to the schema field declaration —
`INTERNAL_API_TOKEN: z.string().min(16).optional()` stays exactly as-is.

- [ ] **Step 6: Update `prod-guardrails.ts`**

In `apps/api/src/config/prod-guardrails.ts`, append `INTERNAL_API_TOKEN`
to the `DEV_DEFAULTS` const (currently around lines 15-20):

```ts
const DEV_DEFAULTS = {
  S3_SECRET_KEY: 'minio_dev_password',
  S3_ACCESS_KEY: 'minio',
  S3_ENDPOINT: 'http://localhost:9000',
  AUDIT_ERASURE_SALT: 'dev-only-erasure-salt-32-chars-padding',
  INTERNAL_API_TOKEN: 'internal_dev_token_change_me',
} as const;
```

The dev-default string matches the `.env.example` placeholder so the
Layer-2 check catches "someone copied .env.example into prod Vault".

- [ ] **Step 7: Run tests to verify GREEN**

Run: `pnpm --filter @resto/api test`

Expected: all tests PASS, including:

- The new `rejects production boot when INTERNAL_API_TOKEN is missing` test.
- The new `throws when INTERNAL_API_TOKEN is the dev placeholder` test.
- The existing 11+ prod-fixture tests (which now include the new
  `INTERNAL_API_TOKEN: 'production-token-...-aaaaa'` line from Step 1).

If any test fails, investigate — most likely a missed fixture from
Step 1. Confirm with `git diff apps/api/test/unit/env.spec.ts` that
all 7 production fixtures (not the AUTH_COOKIE_DOMAIN-minimal one)
got the new line.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/config/env.schema.ts apps/api/src/config/prod-guardrails.ts apps/api/test/unit/env.spec.ts apps/api/test/unit/prod-guardrails.spec.ts
git commit -m "feat(api): require INTERNAL_API_TOKEN in non-dev boot (ADR-0020 I-3)"
```

---

## Task 2 — Whitespace-bypass fix in `superRefine` loop

Change the unset-check predicate from `!env[key]` to `!env[key]?.trim()`
so whitespace-only values (e.g., `'   '`) are treated as unset.

**Files:**

- Modify: `apps/api/src/config/env.schema.ts`
- Modify: `apps/api/test/unit/env.spec.ts`

- [ ] **Step 1: Write the failing test**

In `apps/api/test/unit/env.spec.ts`, append a new `it()` case at the
bottom of the `describe('loadEnv', …)` block (above the closing `});`,
after the Task 1 `INTERNAL_API_TOKEN` test):

```ts
it('rejects production boot when a required var is whitespace-only', () => {
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
    S3_SECRET_KEY: '   ',
    INTERNAL_API_TOKEN: 'production-token-32-chars-padding-aaaaa',
  };
  expect(() => loadEnv(productionEnv)).toThrow(/S3_SECRET_KEY/);
});
```

(`S3_SECRET_KEY` was chosen because it has `.string()` with no
parser-level format guard — whitespace would otherwise sneak past.
One whitespace case proves the loop predicate works; we don't need
one per key.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @resto/api test -- env.spec`

Expected: the new test FAILS — current `!env[key]` treats `'   '` as
truthy, so the schema accepts the whitespace value. The test expects
a throw but gets none.

- [ ] **Step 3: Update the loop predicate in `env.schema.ts`**

In `apps/api/src/config/env.schema.ts`, find the inner `if` inside
the `superRefine` for-loop (currently around line 177):

```ts
// before
if (!env[key]) {
  ctx.addIssue({ … });
}

// after
if (!env[key]?.trim()) {
  ctx.addIssue({ … });
}
```

Single-line change. The rest of the loop (the `ctx.addIssue` call
and the for-of array) is unchanged.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `pnpm --filter @resto/api test -- env.spec`

Expected: all tests in `env.spec.ts` PASS, including the new
whitespace case.

Run the full api unit suite to confirm nothing else broke:
`pnpm --filter @resto/api test`. Expected: green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/config/env.schema.ts apps/api/test/unit/env.spec.ts
git commit -m "fix(api): reject whitespace-only required env vars in non-dev"
```

---

## Task 3 — Strengthen `bundle-no-dev-leak.spec.ts`

Add a second test case that builds qr-menu with a real
`VITE_TENANT_SLUG` fixture value and asserts the value (plus the two
existing needles) does not leak into the bundle.

**Files:**

- Modify: `apps/qr-menu/test/bundle-no-dev-leak.spec.ts`

- [ ] **Step 1: Add the new test case**

In `apps/qr-menu/test/bundle-no-dev-leak.spec.ts`, append a second
`it()` case inside the existing `describe('qr-menu prod bundle', …)`
block, right after the existing test (which ends with `}, 60_000);`
at the current line ~34):

```ts
it('tree-shakes VITE_TENANT_SLUG even when the env var has a real value', () => {
  const SLUG_FIXTURE = 'leak-test-slug-do-not-ship';
  execSync('pnpm --filter @resto/qr-menu build', {
    cwd: resolve(projectRoot, '..', '..'),
    stdio: 'inherit',
    env: { ...process.env, VITE_TENANT_SLUG: SLUG_FIXTURE },
  });
  const bundle = readBundleJs();
  // The fixture value itself MUST be tree-shaken — its presence in the
  // bundle would indicate Vite inlined the env var despite the
  // `import.meta.env.DEV` guard. Same `x-tenant-slug` literal still
  // matters for the header construction.
  for (const needle of ['VITE_TENANT_SLUG', 'x-tenant-slug', SLUG_FIXTURE]) {
    expect(bundle, `bundle must not contain "${needle}"`).not.toContain(needle);
  }
}, 60_000);
```

The existing first test (empty-string fixture, ~line 18-34) is
unchanged. The describe block now contains two `it()` cases.

- [ ] **Step 2: Run the spec to verify both cases pass**

Run: `pnpm --filter @resto/qr-menu test -- bundle-no-dev-leak`

Expected: both tests PASS. The bundle (produced by `pnpm build` with
`VITE_TENANT_SLUG=leak-test-slug-do-not-ship`) does NOT contain the
fixture string because the `import.meta.env.DEV` guard in
`apps/qr-menu/src/api/client.ts` (added in I-3 / PR #130) makes Vite
tree-shake the entire `VITE_TENANT_SLUG` read path.

If the new test fails: confirm with
`grep -c 'leak-test-slug-do-not-ship' apps/qr-menu/dist/assets/*.js`
(should return `0`). If the literal is present, the
`import.meta.env.DEV` guard regressed — investigate before fixing
the test.

Wall-clock: the spec now runs two Vite builds back-to-back. Each
build is ~5-15s. Total ~10-30s. Acceptable.

- [ ] **Step 3: Run the rest of the qr-menu test suite**

Run: `pnpm --filter @resto/qr-menu test`

Expected: all tests pass, including the existing `menu-view.spec.tsx`.

- [ ] **Step 4: Commit**

```bash
git add apps/qr-menu/test/bundle-no-dev-leak.spec.ts
git commit -m "test(qr-menu): assert real-slug VITE_TENANT_SLUG also tree-shakes"
```

---

## Task 4 — Operator-actionable `ProdGuardrailsError` trailer

Append a deployment-secrets hint to the error message so a botched
prod boot tells the on-call engineer what to do, not just what's wrong.
Strengthen the test to lock the trailer in.

**Files:**

- Modify: `apps/api/src/config/prod-guardrails.ts`
- Modify: `apps/api/test/unit/prod-guardrails.spec.ts`

- [ ] **Step 1: Strengthen the existing "reports every violation" test (RED)**

In `apps/api/test/unit/prod-guardrails.spec.ts`, locate the existing
test `'reports every violation in a single error'`. Inside its
`catch (err)` block (alongside the existing `expect(err).toBeInstanceOf(...)`
and `violations.length` checks), add one new assertion:

```ts
expect((err as Error).message).toContain('deployment secrets');
```

The rest of the test body stays as-is.

- [ ] **Step 2: Run test to verify it fails (RED phase confirmation)**

Run: `pnpm --filter @resto/api test -- prod-guardrails`

Expected: the strengthened test FAILS — the current
`ProdGuardrailsError` message contains "prod-guardrails: refusing to
start: …" but no "deployment secrets" substring.

The other tests in the file should still pass.

- [ ] **Step 3: Update `ProdGuardrailsError.message` in `prod-guardrails.ts`**

In `apps/api/src/config/prod-guardrails.ts`, replace the
`ProdGuardrailsError` constructor body (currently around lines 24-28):

```ts
// before
export class ProdGuardrailsError extends Error {
  constructor(public readonly violations: readonly string[]) {
    super(`prod-guardrails: refusing to start: ${violations.join('; ')}`);
    this.name = 'ProdGuardrailsError';
  }
}

// after
export class ProdGuardrailsError extends Error {
  constructor(public readonly violations: readonly string[]) {
    super(
      `prod-guardrails: refusing to start: ${violations.join('; ')}. ` +
        'Set real values in your deployment secrets (Vault / 1Password ' +
        'Connect / cloud secret manager) and redeploy. Do NOT bypass by ' +
        'setting NODE_ENV=development.',
    );
    this.name = 'ProdGuardrailsError';
  }
}
```

- [ ] **Step 4: Run tests to verify GREEN**

Run: `pnpm --filter @resto/api test -- prod-guardrails`

Expected: all 11 tests in `prod-guardrails.spec.ts` PASS (10 from
prior PRs + the new INTERNAL_API_TOKEN test from Task 1 + the
strengthened "reports every violation" assertion). The trailer
"deployment secrets" is now present in the constructed error message.

Also run the full api unit suite: `pnpm --filter @resto/api test`.
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/config/prod-guardrails.ts apps/api/test/unit/prod-guardrails.spec.ts
git commit -m "feat(api): add operator-actionable trailer to ProdGuardrailsError"
```

---

## Task 5 — Final verification

Run the full pipeline one more time before opening a PR.

- [ ] **Step 1: Run typecheck for all projects**

```bash
pnpm exec nx run-many --target=typecheck --all
```

Expected: 8/8 projects green.

- [ ] **Step 2: Run all unit/integration tests**

```bash
pnpm exec nx run-many --target=test --all
```

Expected: green across api (282+ tests after the additions), events
(18), qr-menu (5 — `menu-view` 3 + `bundle-no-dev-leak` 2), and any
other test targets.

- [ ] **Step 3: Run lint where it was already clean on `main`**

```bash
pnpm exec nx run qr-menu:lint
pnpm exec nx run admin:lint
pnpm exec nx run events:lint
```

Expected: all green.

`api:lint` has unrelated pre-existing failures on `main` (some
`withInboxDedup`-style deprecation tech debt that PR #132 may have
partially addressed); not a blocker for this PR.

- [ ] **Step 4: Inspect commit log**

```bash
git log main..HEAD --oneline
```

Expected: spec commit `02b768e` plus 4 implementation commits from
Tasks 1-4 (Task 5 has no commit — verification only). Each commit
follows Conventional Commits, single-line subject, no body, no Claude
attribution.

- [ ] **Step 5: Hand off**

Stop. Ask the user before `git push` and before opening a PR. The
final PR description is driven by the finishing-a-development-branch
skill.

---

## Out of scope (re-stated for the executor)

If any of these surface, flag to the user — do NOT silently expand
scope:

- `OffboardTenantService` / `S3SignedImageUrlAdapter` constructor
  error messages — different audience (developer "schema regression",
  not operator).
- `EnvValidationError` (`env.schema.ts:207`) message — fires in dev
  too, hint misleading.
- Replicating `DEV_DEFAULTS` into a registry shared with `env.schema`.
- ESLint rule for "no dev-fallback constants" — separate I-1 work.
- DDD layering of `S3SignedImageUrlAdapter`.
- Any new fail-fast var beyond `INTERNAL_API_TOKEN` (e.g., adding
  `REDIS_URL` or `NATS_USERNAME` to required-list).
- Database schema changes.
- Pre-existing `api:lint` failures on `main`.
