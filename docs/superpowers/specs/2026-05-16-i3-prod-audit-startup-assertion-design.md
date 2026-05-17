# I-3 prod audit + startup assertion — design

- **Status:** draft
- **Date:** 2026-05-16
- **Authoritative reference:** [ADR-0020 § Invariant I-3](../../adr/0020-multi-tenancy-and-event-bus-invariants.md)
- **Follow-on:** [writing-plans] this design feeds a single execute-phase
  plan. No multi-phase decomposition.

## Context

ADR-0020 was accepted 2026-05-16 (commit `ff1adcd`). Invariant I-3 codifies
that any "safe in dev, dangerous in production" value MUST be gated by
**both** a runtime guard and an env-schema `superRefine` block. The ADR
enumerates three concrete existing violations:

1. `apps/api/src/config/env.schema.ts:92` —
   `S3_SECRET_KEY: z.string().default('minio_dev_password')`. The dev MinIO
   credential is silently used in any environment that forgets to set the
   var, including production.
2. `apps/api/src/contexts/tenancy/application/offboard-tenant.service.ts:9,49` —
   the hardcoded constant `DEV_SALT_FALLBACK = 'dev-only-erasure-salt-32-chars-padding'`
   is used via `env.AUDIT_ERASURE_SALT ?? DEV_SALT_FALLBACK`, regardless of
   `NODE_ENV`. If `AUDIT_ERASURE_SALT` is unset in prod, audit-log PII
   anonymisation runs with a predictable salt — the very property the salt
   exists to prevent.
3. `apps/qr-menu/src/api/client.ts:5,16` — `VITE_TENANT_SLUG` is read from
   `import.meta.env` and baked into the qr-menu bundle at build time, with
   no `import.meta.env.DEV` guard. A prod build environment that has the
   var set ships a bundle that pins every customer to one tenant.

Prod is not deployed yet (confirmed 2026-05-16). The audit step therefore
verifies "what would ship if we deployed today" rather than inspecting a
live instance. The startup assertion is the safety net for the first
prod deploy.

## Goals

- Eliminate the three I-3 violations enumerated in ADR-0020.
- Add an eager `apps/api` startup assertion that refuses to boot if any
  known dev-fallback constant is still effective in a non-dev `NODE_ENV`.
- Add a qr-menu build-time test that fails CI if `VITE_TENANT_SLUG` or its
  derived `x-tenant-slug` header literal leaks into the production bundle.
- Produce a short runbook (`docs/runbooks/i3-prod-fallback-audit.md`) that
  enumerates every dev-fallback found, what replaced it, and the manual
  checklist for the first prod rollout.

## Non-goals

- Generic ESLint / `dependency-cruiser` rule for "no dev-fallback constants
  anywhere in the repo". That is part of the I-1 enforcement-infrastructure
  follow-up; this phase only fixes the three named violations.
- Coverage of `apps/admin` `NEXT_PUBLIC_*` fallbacks (mentioned in
  `apps/CLAUDE.md` but not in ADR-0020 I-3 violation list). Separate PR.
- I-5 / I-5b inbox-dedup strengthening — separate follow-up.
- Re-keying any existing prod secret. Nothing is rotated.

## Architecture — three independent defense layers

Each layer catches a different class of regression. ADR-0020 I-3 mandates
"BOTH a runtime guard AND a `superRefine` block"; the startup assertion is
the third, defense-in-depth, layer explicitly requested in the project
follow-up memory.

```
┌─ Layer 1 — Zod parse time (env.schema.ts superRefine) ──────┐
│  Catches:  "var unset in Vault on prod deploy"               │
│  Mechanism: in non-dev, S3_* and AUDIT_ERASURE_SALT MUST be │
│             set; loadEnv() throws EnvValidationError.        │
└──────────────────────────────────────────────────────────────┘
                          │ loadEnv() passed
                          ▼
┌─ Layer 2 — Nest boot time (prod-guardrails.ts) ─────────────┐
│  Catches:  "schema's superRefine was weakened in a refactor"│
│  Mechanism: assertProdGuardrails(env) re-checks the same   │
│             conditions independently; throws before any     │
│             controller mounts.                              │
└──────────────────────────────────────────────────────────────┘
                          │ boot continues
                          ▼
┌─ Layer 3 — Consumer-site runtime guards ────────────────────┐
│  Catches:  "default sneaks back into the schema"            │
│  Mechanism: OffboardTenantService throws if AUDIT_ERASURE_  │
│             SALT is undefined; qr-menu wraps TENANT_SLUG_   │
│             OVERRIDE in `if (import.meta.env.DEV)` so Vite  │
│             tree-shakes the prod bundle.                    │
└──────────────────────────────────────────────────────────────┘
```

The qr-menu fix is structurally one-layered (build-time dead-code
elimination, plus a CI test asserting the elimination happened). Layers 1
and 2 are api-only because qr-menu has no `loadEnv` / `main.ts`.

## Components

### Component 1 — `apps/api/src/config/env.schema.ts`

**Change.** Drop `.default(...)` on three S3 fields; move them into the
`superRefine` required-list.

```ts
// before
S3_ENDPOINT:   z.string().url().default('http://localhost:9000'),
S3_ACCESS_KEY: z.string().default('minio'),
S3_SECRET_KEY: z.string().default('minio_dev_password'),

// after
S3_ENDPOINT:   z.string().url().optional(),
S3_ACCESS_KEY: z.string().optional(),
S3_SECRET_KEY: z.string().optional(),
```

`S3_REGION` and `S3_BUCKET` keep their `.default(...)` — neither is a
secret nor a tenant-isolation primitive. `'us-east-1'` is just the AWS
SDK default; `'resto-dev'` is a non-sensitive bucket name.

**Add to the existing `superRefine` required-list** (alongside
`BETTER_AUTH_SECRET`, `AUDIT_ERASURE_SALT`, etc.):

```ts
'S3_ENDPOINT', 'S3_ACCESS_KEY', 'S3_SECRET_KEY',
```

**TypeScript impact.** `Env['S3_SECRET_KEY']` becomes `string | undefined`.
Any consumer that constructs an S3 client must handle this (today there is
no S3 client wired in MVP-1 — the plan phase confirms). When the consumer
lands, it follows the same `if (!env.X) throw` pattern as Component 3a.

**Dev wiring.** Dev environments must now supply `S3_*` explicitly:

- `infra/docker/.env` (or equivalent) sets the values used by `pnpm dev:up`.
- `apps/api/.env.example` documents them as required-with-dev-defaults.

The plan phase reads the actual locations of these files (this design
doesn't pre-judge the paths) and produces the diff.

### Component 2 — `apps/api/src/config/prod-guardrails.ts` (new)

```ts
import type { Env } from './env.schema';

const DEV_DEFAULTS = {
  S3_SECRET_KEY: 'minio_dev_password',
  S3_ACCESS_KEY: 'minio',
  S3_ENDPOINT: 'http://localhost:9000',
  AUDIT_ERASURE_SALT: 'dev-only-erasure-salt-32-chars-padding',
} as const;

export class ProdGuardrailsError extends Error {
  constructor(public readonly violations: readonly string[]) {
    super(`prod-guardrails: refusing to start: ${violations.join('; ')}`);
    this.name = 'ProdGuardrailsError';
  }
}

export const assertProdGuardrails = (env: Env): void => {
  if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') return;
  const violations: string[] = [];
  for (const [key, devDefault] of Object.entries(DEV_DEFAULTS)) {
    const value = env[key as keyof typeof DEV_DEFAULTS];
    if (value === undefined || value === devDefault) {
      violations.push(`${key} is unset or equals the dev default`);
    }
  }
  if (violations.length > 0) throw new ProdGuardrailsError(violations);
};
```

**Contract.** Synchronous (no I/O). Returns `void` on pass; throws
`ProdGuardrailsError` on fail. Caller (`main.ts`) propagates via the
existing `bootstrap().catch(...)` which already does `process.exit(1)`.

**Wire-up in `apps/api/src/main.ts:41-42`.** Insert one line after
`assertNoRlsBypass`:

```ts
await assertNoRlsBypass(env.DATABASE_URL);
assertProdGuardrails(env);
```

**Why duplicate the conditions across Layers 1 and 2.** They check the
same things by design. The schema enforces structure ("S3_SECRET_KEY must
be set in non-dev"). The guardrail enforces values ("S3_SECRET_KEY must
not equal the known dev default"). The two together close the loophole
where someone sets `S3_SECRET_KEY=minio_dev_password` in prod env vars
(passes schema, fails guardrail) AND the loophole where someone weakens
the schema (schema passes, guardrail still fires).

### Component 3 — Consumer-site cleanups

**3a. `apps/api/src/contexts/tenancy/application/offboard-tenant.service.ts`**

Delete the `DEV_SALT_FALLBACK` constant (line 9). Rewrite `executeErasure`:

```ts
async executeErasure(input: { tenantId: string }): Promise<TenantSnapshot> {
  const id = TenantId.parse(input.tenantId);
  const salt = this.env.AUDIT_ERASURE_SALT;
  if (!salt) {
    throw new Error(
      'AUDIT_ERASURE_SALT must be set — env.schema validation should ' +
      'have caught this in any NODE_ENV; reaching this branch indicates ' +
      'a schema regression.',
    );
  }
  const snapshot = await this.repo.eraseTenant(id, salt);
  this.logger.warn({ tenantId: id }, 'Tenant erased (irreversible)');
  return snapshot;
}
```

The dev value (matching the deleted constant for backwards-compat with any
dev script that depends on it) is supplied by `infra/docker/.env` instead.

**3b. `apps/qr-menu/src/api/client.ts`**

```ts
const env = import.meta.env as Record<string, string | undefined>;
const API_URL: string = env.VITE_API_URL ?? '';
// import.meta.env.DEV is a static boolean Vite resolves at build time;
// in a prod build the entire `env.VITE_TENANT_SLUG` read is dead-code-
// eliminated, taking the `x-tenant-slug` header construction with it.
const TENANT_SLUG_OVERRIDE: string | undefined = import.meta.env.DEV
  ? env.VITE_TENANT_SLUG
  : undefined;
```

The rest of the file (`buildHeaders`, `fetchMenu`) is unchanged — because
`TENANT_SLUG_OVERRIDE` is statically `undefined` in prod, the
`if (TENANT_SLUG_OVERRIDE)` branch is dead-stripped automatically.

**3c. `apps/qr-menu/test/bundle-no-dev-fallbacks.spec.ts` (new)**

A Vitest spec that runs the production build and asserts no dev-only
identifiers leaked into the artifact:

```ts
// pseudocode
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

test('prod bundle contains no dev-only tenant fallback', () => {
  execSync('pnpm --filter @resto/qr-menu build', { stdio: 'inherit' });
  const distAssets = join(__dirname, '..', 'dist', 'assets');
  const jsFiles = readdirSync(distAssets).filter((f) => f.endsWith('.js'));
  const haystack = jsFiles
    .map((f) => readFileSync(join(distAssets, f), 'utf8'))
    .join('\n');
  for (const needle of ['VITE_TENANT_SLUG', 'x-tenant-slug']) {
    expect(haystack).not.toContain(needle);
  }
});
```

**Trade-off — vitest vs CI script.** A vitest test is self-contained and
runs in `pnpm test`; a CI script is decoupled from local dev. Recommend
vitest — same dev-feedback loop as other tests. The plan phase confirms
qr-menu's vitest setup actually runs in CI (suspect yes via Nx affected,
but verify).

### Component 4 — Tests

**4a. `apps/api/src/config/prod-guardrails.spec.ts` (new) — unit**

| case                           | NODE_ENV      | env values                                                    | expected                                  |
| ------------------------------ | ------------- | ------------------------------------------------------------- | ----------------------------------------- |
| dev passes                     | `development` | all dev defaults                                              | no throw                                  |
| test passes                    | `test`        | all dev defaults                                              | no throw                                  |
| prod all good                  | `production`  | all S3\_\* + SALT set to real prod values                     | no throw                                  |
| prod missing S3_SECRET_KEY     | `production`  | `S3_SECRET_KEY=undefined`                                     | throw, violation mentions `S3_SECRET_KEY` |
| prod dev-default S3_SECRET_KEY | `production`  | `S3_SECRET_KEY='minio_dev_password'`                          | throw                                     |
| prod dev-default SALT          | `production`  | `AUDIT_ERASURE_SALT='dev-only-erasure-salt-32-chars-padding'` | throw                                     |
| prod multiple violations       | `production`  | S3_SECRET_KEY + SALT both bad                                 | throw, `violations.length === 2`          |
| staging behaves like prod      | `staging`     | dev-default S3_SECRET_KEY                                     | throw                                     |

**4b. `apps/api/src/config/env.schema.spec.ts` — supplement**

The plan phase confirms whether the file exists. New cases:

- prod env without `S3_ENDPOINT` → `EnvValidationError`
- prod env without `S3_ACCESS_KEY` → `EnvValidationError`
- prod env without `S3_SECRET_KEY` → `EnvValidationError`
- dev env without `S3_*` → parses (Component 1 dropped defaults; consumers
  carry the burden of handling undefined in dev)
- existing required-in-non-dev cases (`BETTER_AUTH_SECRET`, etc.) — not
  re-tested if existing tests cover them

**4c. `apps/api/src/contexts/tenancy/application/offboard-tenant.service.spec.ts` — supplement**

- `executeErasure` with `env.AUDIT_ERASURE_SALT` set → calls
  `repo.eraseTenant` with that salt
- `executeErasure` with `env.AUDIT_ERASURE_SALT === undefined` → throws
  (the Layer-3 guard fires)

### Component 5 — Audit deliverable

`docs/runbooks/i3-prod-fallback-audit.md` — new file, ~1 page:

1. **Inventory.** Every dev-fallback we found in this audit (start with the
   three from ADR-0020; the plan-phase researcher adds anything else
   discovered via `rg -n "(default\\(|fallback|DEV_)"` heuristic over
   `apps/`).
2. **Resolution.** For each entry: which file housed it, what replaced it,
   which layer (1/2/3) catches the regression now.
3. **First-deploy checklist.** Manual steps before flipping a real prod
   deploy:
   - Confirm Vault has values for `S3_ENDPOINT`, `S3_ACCESS_KEY`,
     `S3_SECRET_KEY`, `AUDIT_ERASURE_SALT`, plus existing prod-required
     vars from `env.schema.ts:superRefine`.
   - Confirm the qr-menu prod build artifact does not include the strings
     `VITE_TENANT_SLUG` or `x-tenant-slug` (the vitest spec from 3c does
     this automatically; the checklist documents how to re-run manually).
   - Confirm `assertProdGuardrails` is on the boot path by tailing the
     first start log for a clean handoff to "Resto api listening on …".
4. **Cross-references.** ADR-0020 I-3; this spec; the implementation PR.

The runbook is not a one-time artifact — it is the steady-state procedure
for any future prod-fallback review.

## Risks and open questions for the plan phase

- **Dev-env file locations are unknown to this design.** The plan phase
  reads `infra/docker/.env*` and `apps/api/.env.example` (or equivalents)
  before proposing edits. If they don't exist as expected, the plan
  surfaces this as a checkpoint.
- **Vitest in qr-menu may need build-time env to run.** The bundle-audit
  test invokes `pnpm build`, which itself reads env. The plan phase
  confirms whether the test runs cleanly without local env, or whether the
  test should set `VITE_API_URL=http://localhost:3000` defensively.
- **S3 client construction site does not exist in MVP-1.** Once it does
  (post-MVP-1), the consumer must add its own runtime guard mirroring
  Component 3a's pattern. Out of scope for this phase but flagged here for
  the consumer's PR.
- **`assertProdGuardrails` placement.** Today there is one `await
assertNoRlsBypass(...)` call in `main.ts:41`. We add a synchronous call
  immediately after. If we accumulate more boot-time guards over time, a
  `await runBootChecks(env)` aggregator may be warranted — but introducing
  it now for two checks is premature abstraction (CLAUDE.md "Don't add
  features beyond what the task requires").

## Out of scope (re-stated for the plan)

- Custom ESLint rule for "no fallback constants in source" — I-1 work.
- `apps/admin` `NEXT_PUBLIC_*` audits.
- I-5 / I-5b changes.
- Any secret rotation.
