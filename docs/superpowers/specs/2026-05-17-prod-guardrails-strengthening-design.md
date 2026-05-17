# Prod-guardrails strengthening bundle — design

- **Status:** draft
- **Date:** 2026-05-17
- **Authoritative reference:** [ADR-0020 § Invariant I-3](../../adr/0020-multi-tenancy-and-event-bus-invariants.md). Builds on the I-3 implementation shipped in PR #130 + #131.
- **Follow-on:** [writing-plans] this design feeds a single execute-phase plan.

## Context

PR #130 (I-3 prod-fallback guardrails) shipped 2026-05-17 with three
defense layers (env-schema superRefine; `assertProdGuardrails`
boot-time check; consumer-site runtime guards in `OffboardTenantService`
and `S3SignedImageUrlAdapter`; qr-menu `bundle-no-dev-leak.spec.ts`).
The final code review of that PR surfaced four minor strengthening
items that were intentionally deferred. This bundle closes all four in
one PR.

The four items share an audience (deployment operators reading boot
logs and Vault contents) and a surface (the existing I-3 plumbing — no
new files, no new abstractions). Bundling avoids four separate
small-PR overheads.

**Severity context for item #1.** During the spec-phase exploration we
confirmed `InternalTokenGuard` (`apps/api/src/shared/api/internal-token.guard.ts:42-45`)
already fails closed in non-dev when `INTERNAL_API_TOKEN` is missing:
it throws `UnauthorizedException('Server is misconfigured: …')` for
every internal-route request. This is NOT a security hole — internal
routes refuse to serve. But the boot still succeeds, so an operator
who didn't set the token sees the API come up green, and every
`/internal/v1/*` call fails 401 with a misleading "Invalid or missing
internal token" log line. Moving the check into env.schema's superRefine
turns this into a fail-fast-at-boot error with a clear message —
operator UX, not a security fix.

## Goals

- Add `INTERNAL_API_TOKEN` to the env.schema `superRefine` non-dev
  required-list and to `prod-guardrails.ts` `DEV_DEFAULTS` map.
- Fix the whitespace-bypass in the `superRefine` required-list loop:
  `if (!env[key])` accepts `'   '` as a valid value. Change to
  `if (!env[key]?.trim())`.
- Strengthen `apps/qr-menu/test/bundle-no-dev-leak.spec.ts` with a
  second test case that builds with a real `VITE_TENANT_SLUG` fixture
  value and asserts that value does not leak into the bundle.
- Add an operator-actionable trailer to `ProdGuardrailsError.message`
  so a botched-deploy boot crash tells the on-call engineer what to
  do, not just what's wrong.

## Non-goals

- Updating `OffboardTenantService` and `S3SignedImageUrlAdapter`
  constructor error messages. Those errors explicitly frame the
  condition as "schema regression — fix the schema"; the audience is
  the developer, not the operator. Operator-hint trailer would be
  misleading there.
- Updating `EnvValidationError` (`env.schema.ts:207`). It fires in dev
  too (e.g., malformed `DATABASE_URL` in local `.env`); an operator-
  specific hint is out of place.
- Schema changes to any database table.
- Migration of any existing prod env-var values. The `.env.example`
  placeholder `'internal_dev_token_change_me'` already documents the
  expected dev value.
- New helpers or abstractions. All four fixes extend existing code.
- Replicating `prod-guardrails.ts` DEV_DEFAULTS into a registry that
  env.schema also reads. The redundancy is intentional (defense in
  depth per I-3 design); the two lists drift only if someone changes
  one without the other, which the new I-1-style "this branch
  indicates a schema regression" error catches.

## Architecture — four extensions to I-3 plumbing

All four fixes are surgical extensions to files I-3 already touched.
No new files, no new abstractions. The bundle is internally
independent — each fix could ship alone; they're bundled because they
share audience and surface, not because they have logical
dependencies.

```
┌─ env.schema.ts ─────────────────────────────────────────────┐
│  Component 1a: add INTERNAL_API_TOKEN to required-list.     │
│  Component 2: replace `!env[key]` with `!env[key]?.trim()`. │
└──────────────────────────────────────────────────────────────┘
┌─ prod-guardrails.ts ────────────────────────────────────────┐
│  Component 1b: add INTERNAL_API_TOKEN to DEV_DEFAULTS map.  │
│  Component 4: ProdGuardrailsError.message gets operator     │
│               trailer ("Set real values in Vault…").        │
└──────────────────────────────────────────────────────────────┘
┌─ apps/qr-menu/test/bundle-no-dev-leak.spec.ts ──────────────┐
│  Component 3: add a second `it()` case that builds with a   │
│               real VITE_TENANT_SLUG fixture and asserts the │
│               fixture value does not appear in the bundle.  │
└──────────────────────────────────────────────────────────────┘
┌─ apps/api/test/unit/env.spec.ts ────────────────────────────┐
│  +3 tests: INTERNAL_API_TOKEN missing; whitespace-only;     │
│            (the existing 4 prod fixtures already include    │
│            INTERNAL_API_TOKEN explicitly via post-T1 work,  │
│            so they keep passing — verified at plan time).   │
└──────────────────────────────────────────────────────────────┘
┌─ apps/api/test/unit/prod-guardrails.spec.ts ────────────────┐
│  +1 case: INTERNAL_API_TOKEN dev-default rejected in prod.  │
│  Strengthen existing "reports every violation" test to      │
│  assert the operator-trailer substring.                     │
└──────────────────────────────────────────────────────────────┘
```

## Components

### Component 1 — `INTERNAL_API_TOKEN` required in non-dev

**1a. `apps/api/src/config/env.schema.ts` — append to required-list:**

The existing `superRefine` block iterates a `for (const key of [...])`
list and rejects each key that is unset in non-dev. Append
`'INTERNAL_API_TOKEN'` at the end of that array. No other change to
the schema field itself — `INTERNAL_API_TOKEN: z.string().min(16).optional()`
stays as-is. The superRefine closes the non-dev gap.

**1b. `apps/api/src/config/prod-guardrails.ts` — DEV_DEFAULTS map:**

Append one entry to the `DEV_DEFAULTS` const object:

```ts
const DEV_DEFAULTS = {
  S3_SECRET_KEY: 'minio_dev_password',
  S3_ACCESS_KEY: 'minio',
  S3_ENDPOINT: 'http://localhost:9000',
  AUDIT_ERASURE_SALT: 'dev-only-erasure-salt-32-chars-padding',
  INTERNAL_API_TOKEN: 'internal_dev_token_change_me',
} as const;
```

The value matches the `.env.example` placeholder (line 30) so the
Layer-2 check fires if anyone copies `.env.example` verbatim into a
prod Vault.

**Tests:**

In `apps/api/test/unit/env.spec.ts`, add one new case
`'rejects production boot when INTERNAL_API_TOKEN is missing'`. Use the
same prod-env fixture pattern as the existing
`'rejects production boot when S3_SECRET_KEY is missing'` test (set
all other required vars, omit only `INTERNAL_API_TOKEN`, expect
`EnvValidationError` mentioning `INTERNAL_API_TOKEN`).

The plan-phase researcher confirms whether the existing four prod
fixtures (TENANT_DEV_FALLBACK_SLUG, AUTH_COOKIE_DOMAIN happy, TRUST_PROXY
missing, TRUST_PROXY=true) already supply `INTERNAL_API_TOKEN`. If they
don't, plan adds the three-line `INTERNAL_API_TOKEN: 'real-prod-token-16-chars-plus'`
addition to each, otherwise those four tests would now fail because of
the new required-list entry rather than for their original reason.

In `apps/api/test/unit/prod-guardrails.spec.ts`, add one new case:

```ts
it('throws when INTERNAL_API_TOKEN is the dev placeholder', () => {
  expect(() =>
    assertProdGuardrails(
      buildEnv({ INTERNAL_API_TOKEN: 'internal_dev_token_change_me' }),
    ),
  ).toThrow(/INTERNAL_API_TOKEN/);
});
```

The existing `'throws when a value is undefined in production'` case
already covers the undefined branch for the whole loop, so no second
new test is needed for INTERNAL_API_TOKEN-specific undefined.

### Component 2 — Whitespace-bypass fix

**`apps/api/src/config/env.schema.ts` — single line in superRefine loop:**

```ts
// before
if (!env[key]) {
// after
if (!env[key]?.trim()) {
```

This change applies uniformly to every key in the required-list
(BETTER_AUTH_SECRET, BETTER_AUTH_BASE_URL, BETTER_AUTH_DATABASE_URL,
ADMIN_WEB_URL, AUTH_COOKIE_DOMAIN, AUDIT_ERASURE_SALT, TRUST_PROXY,
S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, INTERNAL_API_TOKEN).
Defense-in-depth — Zod's `z.string().url()` already rejects URL fields
made of whitespace, but `BETTER_AUTH_SECRET`, `AUDIT_ERASURE_SALT`,
`S3_ACCESS_KEY`, `S3_SECRET_KEY`, `INTERNAL_API_TOKEN`, `TRUST_PROXY`
are plain strings with no parser to catch a `'   '` payload.

**Interaction with the existing `TRUST_PROXY === 'true'` check:** The
loop fix only changes the unset/empty branch. The downstream
`if (env.TRUST_PROXY === 'true') { /* reject */ }` block is unchanged
and still catches the dev-only literal `'true'`.

**Tests:**

In `apps/api/test/unit/env.spec.ts`, add one new case:

```ts
it('rejects production boot when a required var is whitespace-only', () => {
  const productionEnv = buildProductionEnv({ S3_SECRET_KEY: '   ' });
  expect(() => loadEnv(productionEnv)).toThrow(/S3_SECRET_KEY/);
});
```

(The `buildProductionEnv` helper is constructed at plan time — the
current `env.spec.ts` builds prod fixtures inline; if a helper doesn't
yet exist, the test uses the same inline pattern as the existing
"rejects production boot when X is missing" tests.)

One whitespace case is sufficient — the loop is shared across all
keys, so proving the predicate works for one key proves it for all.

### Component 3 — Strengthen `bundle-no-dev-leak.spec.ts`

**`apps/qr-menu/test/bundle-no-dev-leak.spec.ts` — add a second `it()` case:**

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

The existing first test (empty-string fixture) stays as-is. The two
tests cover complementary regressions: the empty case catches
identifier-reference leaks, the real-slug case catches "Vite inlined
the env value despite our guard" regressions.

**Trade-off — test duration.** Going from one build to two roughly
doubles the spec's wall-clock time (one Vite prod build is ~5-15s).
This is the right cost for the regression net; CI parallelism is
unaffected. No new infrastructure (parallel builds, dist-per-case)
needed.

### Component 4 — Operator-actionable `ProdGuardrailsError` trailer

**`apps/api/src/config/prod-guardrails.ts` — message update:**

```ts
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

The trailer answers four on-call questions in order:

| Question            | Answer in message                                  |
| ------------------- | -------------------------------------------------- |
| What do I do?       | "Set real values in your deployment secrets"       |
| Where?              | "Vault / 1Password Connect / cloud secret manager" |
| Restart?            | "and redeploy"                                     |
| Just flip NODE_ENV? | "Do NOT bypass by setting NODE_ENV=development"    |

**Tests:**

In `apps/api/test/unit/prod-guardrails.spec.ts`, strengthen the
existing `'reports every violation in a single error'` test by adding
an assertion that the error message contains the substring
`'deployment secrets'` (or `'Vault'`). This locks the operator-hint in
place against future "someone simplified the message" regressions.

```ts
// inside the existing try/catch block, alongside the violations.length === 2 check:
expect((err as Error).message).toContain('deployment secrets');
```

## Risks and open questions for the plan phase

- **`InternalTokenGuard` test impact.** No existing unit test for the
  guard depends on the env-var being optional (the guard's behaviour
  is the same for both "unset" and "wrong token"). Plan verifies at
  the test-spec file location.
- **Bundle-test duration in CI.** Two consecutive Vite builds may push
  the qr-menu suite over a CI step timeout if the timeout is tight.
  Plan checks `.github/workflows/ci.yml` for the relevant target's
  timeout. If close to the limit, the timeout in the `it()` call
  (currently `60_000`) is increased to `90_000`.
- **`buildProductionEnv` helper extraction.** The four (now five with
  Component 1 test) production fixtures in `env.spec.ts` repeat the
  same 8-10 env vars verbatim. Plan may include a small helper
  extraction in Component 1's test step if the repetition crosses
  readability threshold; otherwise it stays inline. Not a strict
  requirement — readability call.

## Out of scope (re-stated for the plan)

- New ADR or amendment to ADR-0020. The bundle implements existing
  ADR-0020 I-3 invariants more thoroughly; no decision changes.
- ESLint rules or AST checks for "no dev-fallback constants in
  source". Separate I-1 enforcement-infrastructure work.
- DDD layering of `S3SignedImageUrlAdapter`. Carried over observation.
- `OffboardTenantService` / `S3SignedImageUrlAdapter` / `EnvValidationError`
  message updates — different audience (developer, not operator).
- Schema additions to `inbox_processed`, `outbox_events`, or any other
  table.
- I-5b ledger.
