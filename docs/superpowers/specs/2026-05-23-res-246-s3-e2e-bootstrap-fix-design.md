---
ticket: RES-246
adr: 0020 (I-3)
status: proposed
date: 2026-05-23
scope:
  - apps/api/src/config/env.schema.ts (S3 field defaults + remove S3 keys from superRefine prod-required list + JSDoc update)
  - apps/api/src/contexts/catalog/infrastructure/s3-signed-image-url.adapter.ts (error message reworded; structurally-unreachable check kept as defense-in-depth)
  - apps/api/test/unit/env.spec.ts (new test block — defaults applied + explicit override accepted)
---

# RES-246 — close S3 e2e bootstrap regression (schema-adapter mismatch)

## Context

ADR-0020 invariant I-3: production deploys must fail loudly at module load
when secrets are missing; dev defaults must require BOTH an
`NODE_ENV ∈ {development, test}` runtime guard AND a non-dev
`superRefine` block in the env schema.

Two related guardrails landed under I-3 in the recent past:

- `apps/api/src/config/env.schema.ts:171-193` — `superRefine` requires
  `S3_ENDPOINT` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` only in
  non-dev/test. In dev/test, all three are `.optional()` and may be
  absent.
- `apps/api/src/contexts/catalog/infrastructure/s3-signed-image-url.adapter.ts:26-32`
  — throws unconditionally on construction when any of the three is
  missing, regardless of `NODE_ENV`. The error message admits the bug:
  "validation should have caught this in any NODE_ENV; reaching this
  branch indicates a schema regression (ADR-0020 I-3)."

The result: every e2e spec that loads `AppModule` (and isn't explicitly
seeding S3 envs in `beforeAll`) fails at
`Test.createTestingModule(...).compile()`. T7 verification on RES-242
counted 20+ broken specs:

- `apps/api/test/e2e/me-brands.e2e.spec.ts`
- `apps/api/test/e2e/menu-brand-response.e2e.spec.ts`
- `apps/api/test/e2e/brand-host-resolution.e2e.spec.ts`
- `apps/api/test/e2e/identity-bootstrap.e2e.spec.ts`
- `apps/api/test/e2e/auth-brute-force.e2e.spec.ts`
- (+15 more)

CI workflow `.github/workflows/ci.yml:135-143` patches the
`openapi-drift` job with explicit S3 placeholders alongside a comment
diagnosing the schema regression honestly. The CI e2e job (if any)
either doesn't run the full suite or has been silently failing the same
way, allowing the regression to land.

In RES-242 (PR #159), `tenants-controller.e2e.spec.ts` was patched with
a narrow per-spec env-seed (commit `8f00650`) so the operator-path tests
could run. That unblocked one spec; the rest remain broken.

Regression origin: commits `9d88196 feat(api): require S3_* env vars in non-dev (ADR-0020 I-3)`
followed by `23ae726 refactor(catalog): replace S3 env non-null assertions
with explicit guard (ADR-0020 I-3)`. The schema half landed correctly;
the adapter half didn't honor the dev/test gate.

## Goals (acceptance criteria from RES-246)

1. All e2e specs in `apps/api/test/e2e/` can bootstrap `AppModule`
   without any manual env-seed in `beforeAll`.
2. The `S3SignedImageUrlAdapter` error message no longer falsely claims
   "schema regression" — it accurately reflects the post-fix contract.
3. The boot-time prod-rejection contract is preserved: a prod deploy
   that fails to set real `S3_*` values still fails to start (now via
   `assertProdGuardrails`, not the schema's `superRefine`).
4. AC #2 from the Linear ticket ("CI runs the full e2e suite green") is
   explicitly **downgraded to "bootstrap unblocked"** for this PR per
   the user's narrow-scope decision. CI cleanup (`openapi-drift` S3
   placeholders) and broader e2e green status are tracked as
   follow-ups, not gated by RES-246.

## Design

### Approach: schema-level defaults aligned to `DEV_DEFAULTS`

`apps/api/src/config/prod-guardrails.ts:15-21` already canonicalizes the
dev values that must never reach production:

```ts
const DEV_DEFAULTS = {
  S3_SECRET_KEY: 'minio_dev_password',
  S3_ACCESS_KEY: 'minio',
  S3_ENDPOINT: 'http://localhost:9000',
  AUDIT_ERASURE_SALT: 'dev-only-erasure-salt-32-chars-padding',
  INTERNAL_API_TOKEN: 'internal_dev_token_change_me',
} as const;
```

`assertProdGuardrails` runs at boot in non-dev/test and throws
`ProdGuardrailsError` if any env value equals its dev default.

The fix promotes those dev values into the env schema as Zod `.default(...)`
on the three S3 fields. This:

- Gives dev/test a usable default with zero per-spec configuration.
- Preserves the prod-rejection contract: in prod, missing S3 envs →
  schema applies the default → `assertProdGuardrails` matches the value
  to `DEV_DEFAULTS` → boot fails with `ProdGuardrailsError`.
- Removes the redundant `superRefine` "required in prod" check for
  these three keys; the defense moves entirely to `assertProdGuardrails`,
  which is already canonical for this class of leak (and which the
  schema regression `9d88196` should have updated to remove the
  superRefine entries when it added them — symmetry restored here).
- Eliminates the schema-adapter mismatch: the adapter's
  `if (!env.S3_ENDPOINT || ...)` guard becomes structurally
  unreachable in normal operation. We keep it as defense-in-depth (the
  project pattern; see ADR-0020 follow-up "structurally unreachable"
  notes) and reword the error message so it no longer falsely claims
  "schema regression."

### Changes

**`apps/api/src/config/env.schema.ts:93-97`** — replace `.optional()` with
`.default(...)` on `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`.
Update the JSDoc block.

```ts
/**
 * S3-compatible bucket for menu images (R2 / AWS S3 / MinIO in dev).
 * Defaults match `prod-guardrails.DEV_DEFAULTS` so dev/test boot
 * without env-seed; `assertProdGuardrails` (boot-time, non-dev/test)
 * rejects any of these reaching prod with their dev values. ADR-0020 I-3.
 */
S3_ENDPOINT: z.string().url().default('http://localhost:9000'),
S3_REGION: z.string().default('us-east-1'),
S3_BUCKET: z.string().default('resto-dev'),
S3_ACCESS_KEY: z.string().default('minio'),
S3_SECRET_KEY: z.string().default('minio_dev_password'),
```

**`apps/api/src/config/env.schema.ts:171-193`** — drop `'S3_ENDPOINT'`,
`'S3_ACCESS_KEY'`, `'S3_SECRET_KEY'` from the `superRefine`
required-in-prod list. The keys are always set after default-application;
`assertProdGuardrails` is the prod-rejection point.

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
      // S3_ENDPOINT/S3_ACCESS_KEY/S3_SECRET_KEY — now always set
      // by schema defaults; prod rejection is via
      // assertProdGuardrails (DEV_DEFAULTS match). ADR-0020 I-3.
      'INTERNAL_API_TOKEN',
    ] as const) {
      // ...
    }
    // ...
  }
});
```

**`apps/api/src/contexts/catalog/infrastructure/s3-signed-image-url.adapter.ts:26-32`** —
reword the error message; the check itself stays.

```ts
if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) {
  throw new Error(
    'S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY are missing. env.schema ' +
      'now supplies dev defaults so this branch is structurally unreachable; ' +
      'reaching it indicates the schema was rolled back. ADR-0020 I-3.',
  );
}
```

The check is defense-in-depth — same family as `InternalTokenGuard`'s
"structurally unreachable" missing-token branch noted in the ADR-0020
follow-up observation backlog. The project pattern is to keep these
checks because the cost is one branch and the benefit is loud failure
if a schema change ever removes the defaults.

## Tests

### New unit tests (`apps/api/test/unit/env.spec.ts`)

Add a new `describe` block at the end of the file:

```ts
describe('env.schema — S3 defaults (RES-246)', () => {
  it('applies DEV_DEFAULTS to S3 fields when unset (test mode)', () => {
    const env = envSchema.parse(/* minimal test env without S3_* */);
    expect(env.S3_ENDPOINT).toBe('http://localhost:9000');
    expect(env.S3_ACCESS_KEY).toBe('minio');
    expect(env.S3_SECRET_KEY).toBe('minio_dev_password');
    expect(env.S3_REGION).toBe('us-east-1');
    expect(env.S3_BUCKET).toBe('resto-dev');
  });

  it('accepts explicit overrides when S3_* env vars are set', () => {
    const env = envSchema.parse(/* test env + S3_* set to real values */);
    expect(env.S3_ENDPOINT).toBe('https://r2.example.com');
    expect(env.S3_ACCESS_KEY).toBe('real-key');
    expect(env.S3_SECRET_KEY).toBe('real-secret');
  });
});
```

The implementer reads the existing `env.spec.ts` to learn the
"minimal test env" shape used by other test cases and reuses it.

### Existing tests that must keep passing

- **`apps/api/test/unit/prod-guardrails.spec.ts`** — `assertProdGuardrails`
  rejects when `S3_*` values equal `DEV_DEFAULTS` in prod. This is the
  load-bearing regression net: with the new schema defaults, a prod
  deploy that forgets to set `S3_*` envs gets defaults applied → values
  equal `DEV_DEFAULTS` → `assertProdGuardrails` throws
  `ProdGuardrailsError`. The whole prod-rejection contract for these
  three keys migrates from schema-time (`superRefine`) to boot-time
  (`assertProdGuardrails`); this existing test is what proves the
  contract still holds end-to-end.
- **`apps/api/test/unit/env.spec.ts`** (existing tests) — schema parses
  test/dev envs. Defaults are additive; existing cases should keep
  passing without changes.

### E2E sanity check (no e2e file modifications)

After the schema change, pick one previously-broken e2e
(`apps/api/test/e2e/me-brands.e2e.spec.ts` is a good canary) and verify
that `Test.createTestingModule(...).compile()` no longer throws with
"S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY must be set" inside its
`beforeAll`. Whether tests further in the file pass is not the gate —
many e2es have other pre-existing failures (rate-limit pollution, the
`innerJoin` bug from RES-248, etc.). The gate for RES-246 is
"bootstrap unblocked."

Do **not** add S3 seeding to any e2e spec — the whole point of this PR
is that no spec ever needs to seed S3 envs.

## Out of scope (follow-ups, noted in PR description)

- **CI `openapi-drift` job cleanup** (`.github/workflows/ci.yml:135-143`)
  — the explicit S3 placeholders and the apologetic comment become
  redundant. Trivial follow-up commit, deferred per user scope choice.
  Worth doing soon to keep the comment from rotting.
- **Remove `8f00650` per-spec S3 seed from `tenants-controller.e2e.spec.ts`**
  — the seed lives on the `res-242` branch (PR #159, In Review).
  Removing it BEFORE RES-242 merges creates a merge conflict; removing
  it AFTER is a one-line cleanup. Deferred to a follow-up commit on
  `main` once RES-242 merges. Track as a sub-task or by tagging the
  commit in the RES-242 PR description.
- **Other broken e2e specs** (`me-brands`, `identity-bootstrap`,
  `auth-brute-force`, etc.) — the bootstrap unblock here is necessary
  but not sufficient. Each spec may have its own broken state (rate-limit
  pollution, RES-248 `innerJoin` bug, `AUDIT_ERASURE_SALT` missing in
  some specs, etc.). Per-spec triage is outside RES-246's scope; T1
  freeze gate (the gate-blocker label) needs broader e2e health work
  separately.
- **`AUDIT_ERASURE_SALT` and `INTERNAL_API_TOKEN`** could receive the
  same defaults-from-`DEV_DEFAULTS` treatment in a follow-up — the
  pattern would be identical. Out of scope here to keep the diff
  minimal and the security review focused on the S3-specific path.

## Risks and unknowns

- **`prod-guardrails` test must already cover the migration.** Verify
  during planning that `apps/api/test/unit/prod-guardrails.spec.ts`
  asserts the case where `S3_*` equals `DEV_DEFAULTS` (it should — that's
  the whole point of the file). If the test only covers the
  `undefined` case, add a case covering `=== DEV_DEFAULTS[key]` so the
  new path (schema applies default → guardrail rejects) is explicit.
- **Schema `.default()` ordering with `superRefine`.** Zod applies
  defaults DURING parse, before `superRefine` callbacks. The
  superRefine sees the default value as set, so removing the S3 keys
  from the required list is correct (and necessary — leaving them would
  be redundant noise, not a bug). Worth a one-line confirmation in
  planning by reading the Zod docs (`.default()` is applied at the
  `ZodOptional`-unwrap step, well before `.superRefine`).
- **Adapter check kept as defense-in-depth.** A future PR that removes
  the schema defaults without realizing the adapter relies on them
  would reproduce the regression. The kept adapter check fires with the
  reworded error — pointer to the schema is part of the message. Low
  risk; documented.
- **No production behavior change.** In prod, the schema would have
  rejected an unset env via superRefine; now it applies the default and
  `assertProdGuardrails` rejects via `DEV_DEFAULTS` match. Both paths
  reach `process.exit(1)`-equivalent at boot. The user-visible failure
  message changes (from
  `"S3_ENDPOINT is required when NODE_ENV is production"`
  to
  `"prod-guardrails: refusing to start: S3_ENDPOINT is unset or equals the dev default; ..."`).
  Acceptable — the new message is more actionable.
