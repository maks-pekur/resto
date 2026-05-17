# RES-240 — Close BA-hook I-6 Violation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close ADR-0020 I-6 violation in `IdentityEventEmitterAdapter` by introducing `TenantAwareDb.withTenantId(tenantId, op)` for non-HTTP entry points and routing the adapter through it.

**Architecture:** Add a guarded explicit-tenant variant on `TenantAwareDb` (throws if ALS is bound — defensive split between HTTP and non-HTTP entry points). Adapter keeps its 3-branch logic (null / ALS-bound / explicit) but the third branch swaps `runInTenantContext` for `withTenantId`. Behaviour preserved at all 3 e2e cases; new 4th case pins the BA-hook (no-ALS) path.

**Tech Stack:** TypeScript, NestJS, Drizzle ORM (`postgres-js`), Postgres 16, Vitest, testcontainers.

**Spec:** `docs/superpowers/specs/2026-05-17-res-240-ba-hook-i6-fix-design.md`

**Branch:** `res-240` (already checked out from `main`).

---

## File Map

| File                                                                              | Action | Why                                                                                                                  |
| --------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| `docs/superpowers/specs/2026-05-17-res-240-ba-hook-i6-fix-design.md`              | Modify | Spec misstates that `RestoTx` is not exported — it already is. Correct the design note.                              |
| `packages/db/src/client.ts`                                                       | Modify | Add `TenantAwareDb.withTenantId(tenantId, op)` method.                                                               |
| `packages/db/src/context.ts`                                                      | Modify | Export `isUuid` as internal helper so `client.ts` can reuse it.                                                      |
| `packages/db/test/integration/with-tenant-id.spec.ts`                             | Create | Integration test for `withTenantId` (5 cases).                                                                       |
| `apps/api/src/contexts/identity/infrastructure/identity-event-emitter.adapter.ts` | Modify | Replace `runInTenantContext` fallback with `withTenantId`; introduce local `append` helper using exported `RestoTx`. |
| `apps/api/test/e2e/identity-event-emitter.adapter.e2e.spec.ts`                    | Modify | Add 4th case (no-ALS / BA-hook simulation). Existing 3 cases stay.                                                   |

**Pre-existing infrastructure (no changes needed):**

- `packages/db/src/index.ts` already re-exports `RestoTx` (line 14). Spec Section 2 turns out to be a no-op — corrected in Task 1.
- `packages/db/test/setup.ts` already provides `startPostgres()`, `stopPostgres()`, `isDockerAvailable()` — Task 2 reuses them.

---

## Task 1: Correct spec misstatement about `RestoTx` export

**Files:**

- Modify: `docs/superpowers/specs/2026-05-17-res-240-ba-hook-i6-fix-design.md`

- [ ] **Step 1: Confirm `RestoTx` is already exported**

Run:

```bash
grep -n "RestoTx" packages/db/src/index.ts
```

Expected: line 14 `type RestoTx,` is present in the re-export block.

- [ ] **Step 2: Update the spec to reflect reality**

In `docs/superpowers/specs/2026-05-17-res-240-ba-hook-i6-fix-design.md`, replace the `### 2. Export RestoTx from @resto/db` section content with a note that the export already exists.

Find this block:

```markdown
### 2. Export `RestoTx` from `@resto/db`

**File:** `packages/db/src/index.ts`

`RestoTx` is defined in `client.ts` but not currently exported. The adapter
needs it to type the local `append` helper without resorting to
`Parameters<Parameters<TenantAwareDb['withTenant']>[0]>[0]`. Adding the
export is a one-line change with no API surface risk — `RestoTx` is already
the de-facto callback parameter type across the codebase.
```

Replace with:

```markdown
### 2. `RestoTx` already exported (no change)

**File:** `packages/db/src/index.ts`

`RestoTx` is already re-exported from `@resto/db` (line 14 of `index.ts`).
Earlier note in this spec was wrong — confirmed by grep during plan
authoring. The adapter just imports it directly. No change required in
this PR.
```

Also update the front-matter `scope:` list — remove the `packages/db/src/index.ts (export RestoTx)` entry.

- [ ] **Step 3: Commit the correction**

```bash
git add docs/superpowers/specs/2026-05-17-res-240-ba-hook-i6-fix-design.md
git commit -m "docs(spec): RestoTx already exported, drop section 2"
```

---

## Task 2: Add `TenantAwareDb.withTenantId` with TDD

**Files:**

- Modify: `packages/db/src/context.ts` (export `isUuid` for internal reuse)
- Modify: `packages/db/src/client.ts` (add `withTenantId` method)
- Create: `packages/db/test/integration/with-tenant-id.spec.ts`

- [ ] **Step 1: Write the failing integration test**

Create `packages/db/test/integration/with-tenant-id.spec.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { runInTenantContext, schema } from '../../src/index';
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
    '[with-tenant-id] Docker not available — skipping integration tests.',
  );
}

suite(
  'TenantAwareDb.withTenantId — explicit tenant for non-HTTP entry points',
  () => {
    let pg: TestPg;
    let tenantA: string;
    let tenantB: string;

    beforeAll(async () => {
      pg = await startPostgres();
      await pg.db.withoutTenant(
        'seed tenants for withTenantId test',
        async (tx) => {
          const [a] = await tx
            .insert(schema.tenants)
            .values({ slug: 'wtid-a', displayName: 'WithTenantId A' })
            .returning({ id: schema.tenants.id });
          const [b] = await tx
            .insert(schema.tenants)
            .values({ slug: 'wtid-b', displayName: 'WithTenantId B' })
            .returning({ id: schema.tenants.id });
          if (!a || !b) throw new Error('Failed to seed tenants.');
          tenantA = a.id;
          tenantB = b.id;
        },
      );
    }, 90_000);

    afterAll(async () => {
      await stopPostgres(pg);
    });

    it('binds the explicit tenant id when ALS is empty', async () => {
      const rows = await pg.db.withTenantId(tenantA, async (tx) =>
        tx.select().from(schema.tenants).where(eq(schema.tenants.id, tenantA)),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(tenantA);
    });

    it('throws when ALS is already bound (same tenant id)', async () => {
      const error = await runInTenantContext({ tenantId: tenantA }, () =>
        pg.db
          .withTenantId(tenantA, async () => 'unreachable')
          .then(
            () => null,
            (e: unknown) => e,
          ),
      );
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/withTenantId.*ALS-bound/i);
    });

    it('throws when ALS is bound to a different tenant', async () => {
      const error = await runInTenantContext({ tenantId: tenantB }, () =>
        pg.db
          .withTenantId(tenantA, async () => 'unreachable')
          .then(
            () => null,
            (e: unknown) => e,
          ),
      );
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/withTenantId.*ALS-bound/i);
    });

    it('rejects a malformed tenant id before opening a transaction', async () => {
      const error = await pg.db
        .withTenantId('not-a-uuid', async () => 'unreachable')
        .then(
          () => null,
          (e: unknown) => e,
        );
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/invalid tenant id/i);
    });

    it('nested withTenantId opens a new transaction with the inner tenant', async () => {
      // Documented as intentional: withTenantId does not bind ALS, so a
      // nested call passes the ALS guard and opens its own transaction.
      // No real use case today; this test pins the behaviour against
      // accidental change.
      const visibleInsideInner = await pg.db.withTenantId(tenantA, async () =>
        pg.db.withTenantId(tenantB, async (tx) =>
          tx
            .select()
            .from(schema.tenants)
            .where(eq(schema.tenants.id, tenantB)),
        ),
      );
      expect(visibleInsideInner).toHaveLength(1);
      expect(visibleInsideInner[0]?.id).toBe(tenantB);
    });
  },
);
```

- [ ] **Step 2: Run the new test to verify it fails (method does not exist)**

Run:

```bash
pnpm exec nx test db --testPathPattern=with-tenant-id
```

Expected: FAIL — `TypeError: pg.db.withTenantId is not a function` on the first case (or similar). The other cases will not run because `withTenantId` is undefined.

If Docker is not available, the suite will skip cleanly with the warning line — that is also a valid "not yet passing" state but does not exercise the failure. Confirm Docker is up: `docker info | head -3`.

- [ ] **Step 3: Export `isUuid` from `context.ts` for internal reuse**

Modify `packages/db/src/context.ts`. Find:

```ts
const isUuid = (value: string): boolean => UUID_RE.test(value);
```

Change to:

```ts
export const isUuid = (value: string): boolean => UUID_RE.test(value);
```

No other change in `context.ts`. The `UUID_RE` constant stays module-local.

- [ ] **Step 4: Implement `withTenantId` in `client.ts`**

Modify `packages/db/src/client.ts`.

a) Update the import line from `./context`:

```ts
import { getTenantContext, isUuid, requireTenantContext } from './context';
```

(The existing import is `import { requireTenantContext } from './context';` — replace with the above.)

b) Add the method on `TenantAwareDb` immediately after `withTenant`. Insert this block between the existing `withTenant` method (ends around line 77) and the existing `withoutTenant` method (starts around line 79 of the docstring):

```ts
  /**
   * Run `op` inside a transaction with an EXPLICIT tenant id bound.
   *
   * Reserved for non-HTTP entry points where the caller has an
   * authoritative tenant id but does not run inside
   * `TenantContextMiddleware`:
   *   - Better Auth hooks (`/sign-out`, `/reset-password`) — ADR-0020 I-6.
   *   - NATS subscribers, outbox dispatcher, CLI, background jobs.
   *
   * HTTP code paths MUST use `withTenant(op)` (ALS-bound). To enforce
   * the split, `withTenantId` throws when an ALS context is already
   * bound — that path indicates a mis-routed caller.
   */
  async withTenantId<T>(tenantId: string, op: (tx: RestoTx) => Promise<T>): Promise<T> {
    if (getTenantContext()) {
      throw new Error(
        'withTenantId must not be called inside an ALS-bound context — use withTenant() instead.',
      );
    }
    if (!isUuid(tenantId)) {
      throw new Error(`Invalid tenant id: expected a uuid, got ${JSON.stringify(tenantId)}.`);
    }
    return this.#db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant', ${tenantId}, true)`);
      await tx.execute(sql`SELECT set_config('app.is_system', 'false', true)`);
      return op(tx);
    });
  }
```

- [ ] **Step 5: Run the new test to verify it passes**

Run:

```bash
pnpm exec nx test db --testPathPattern=with-tenant-id
```

Expected: PASS — all 5 cases green.

- [ ] **Step 6: Run the rest of the db package tests to confirm no regression**

Run:

```bash
pnpm exec nx test db
```

Expected: PASS — `tenant-isolation.spec.ts`, `brands-rls.spec.ts`, `erase-includes-brands.spec.ts`, `preflight.spec.ts`, `context.spec.ts`, and the new `with-tenant-id.spec.ts` all green.

- [ ] **Step 7: Typecheck the db package**

Run:

```bash
pnpm exec nx run db:typecheck
```

Expected: PASS — no type errors. (`isUuid` is now used by `client.ts` as well.)

- [ ] **Step 8: Commit**

```bash
git add packages/db/src/context.ts packages/db/src/client.ts packages/db/test/integration/with-tenant-id.spec.ts
git commit -m "feat(db): add TenantAwareDb.withTenantId for non-HTTP entry points"
```

---

## Task 3: Rewrite `IdentityEventEmitterAdapter` to use `withTenantId`

**Files:**

- Modify: `apps/api/src/contexts/identity/infrastructure/identity-event-emitter.adapter.ts`

- [ ] **Step 1: Replace the adapter file content**

Open `apps/api/src/contexts/identity/infrastructure/identity-event-emitter.adapter.ts` and replace the entire file with:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { getTenantContext, type RestoTx, TenantAwareDb } from '@resto/db';
import { appendToOutbox, type EventEnvelope } from '@resto/events';
import { randomUUID } from 'node:crypto';
import type { IdentityEventEmitterPort } from '../application/ports/identity-event-emitter.port';

@Injectable()
export class IdentityEventEmitterAdapter implements IdentityEventEmitterPort {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  async emit(envelope: EventEnvelope): Promise<void> {
    const aggregateId = envelope.tenantId ?? randomUUID();
    const append = (tx: RestoTx): Promise<void> =>
      appendToOutbox(tx, { envelope, aggregateId });

    if (!envelope.tenantId) {
      await this.db.withoutTenant(`identity event: ${envelope.type}`, append);
      return;
    }
    if (getTenantContext()) {
      // HTTP path: ALS bound by TenantContextMiddleware. RLS WITH CHECK
      // validates envelope.tenantId against the bound tenant — a forged
      // envelope with a different tenantId is rejected at INSERT time.
      await this.db.withTenant(append);
      return;
    }
    // Non-HTTP path: Better Auth hook fired with no ALS (e.g. `/sign-out`
    // arrived without `x-tenant-slug` and no host resolved). Authoritative
    // tenantId comes from the BA session snapshot. ADR-0020 I-6 forbids
    // seeding ALS here — bind explicitly via TenantAwareDb instead.
    await this.db.withTenantId(envelope.tenantId, append);
  }
}
```

Diff from current:

- Drop `runInTenantContext` import.
- Add `type RestoTx` import.
- Replace inline `run` arrow with local `append` typed via `RestoTx`.
- Replace the final `runInTenantContext({...}, run)` call with `this.db.withTenantId(envelope.tenantId, append)`.
- Add explanatory comments at the two non-trivial branches.

- [ ] **Step 2: Typecheck the api app**

Run:

```bash
pnpm exec nx run api:typecheck
```

Expected: PASS — no type errors. `RestoTx` resolves through `@resto/db`.

- [ ] **Step 3: Lint the api app**

Run:

```bash
pnpm exec nx run api:lint
```

Expected: PASS — no lint errors in the modified file.

- [ ] **Step 4: Run the existing adapter e2e (the 3 pre-existing cases)**

Run:

```bash
pnpm exec nx test api --testPathPattern=identity-event-emitter.adapter.e2e
```

Expected: PASS — all 3 existing cases stay green. The new no-ALS case lands in Task 4.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contexts/identity/infrastructure/identity-event-emitter.adapter.ts
git commit -m "feat(api): replace runInTenantContext in IdentityEventEmitterAdapter"
```

---

## Task 4: Add no-ALS path coverage to adapter e2e

**Files:**

- Modify: `apps/api/test/e2e/identity-event-emitter.adapter.e2e.spec.ts`

- [ ] **Step 1: Add the 4th case to the spec file**

Open `apps/api/test/e2e/identity-event-emitter.adapter.e2e.spec.ts`. The existing `suite(...)` block (lines 36–100) ends with the case `'persists a platform event (envelope.tenantId=null) via system context'`. Add a 4th `it(...)` block immediately after that one, before the closing `});` of the `suite(...)` block:

```ts
it('persists a tenant-bound event when ALS is empty (BA-hook path)', async () => {
  const envelope = buildEnvelope(TENANT_A_ID);
  // NOT wrapped in runInTenantContext — simulates a Better Auth hook
  // firing outside TenantContextMiddleware (e.g. `/sign-out` request
  // that did not carry `x-tenant-slug` or a tenant-bearing host).
  // Authoritative tenantId comes from the BA session snapshot.
  await adapter.emit(envelope);

  const rows = await stack.db.withoutTenant('inspect emitted row', (tx) =>
    tx
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.id, envelope.id)),
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]?.tenantId).toBe(TENANT_A_ID);
});
```

No other changes to this file.

- [ ] **Step 2: Run the adapter e2e to confirm all 4 cases pass**

Run:

```bash
pnpm exec nx test api --testPathPattern=identity-event-emitter.adapter.e2e
```

Expected: PASS — 4 cases green. The new case exercises the `withTenantId` path of the adapter (Task 3's change).

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/e2e/identity-event-emitter.adapter.e2e.spec.ts
git commit -m "test(api): add no-ALS path coverage for identity event emitter"
```

---

## Task 5: Final verification before PR

**Files:** None modified — verification only.

- [ ] **Step 1: Cross-package typecheck**

Run:

```bash
pnpm exec nx run-many -t typecheck -p db,api
```

Expected: PASS — both packages.

- [ ] **Step 2: Cross-package lint**

Run:

```bash
pnpm exec nx run-many -t lint -p db,api
```

Expected: PASS — both packages.

- [ ] **Step 3: Run the full db integration test suite**

Run:

```bash
pnpm exec nx test db
```

Expected: PASS — all integration specs green (including `with-tenant-id`, `tenant-isolation`, `brands-rls`).

- [ ] **Step 4: Run the adapter e2e suite**

Run:

```bash
pnpm exec nx test api --testPathPattern=identity-event-emitter.adapter.e2e
```

Expected: PASS — 4 cases.

- [ ] **Step 5: Grep audit — no stray `runInTenantContext` outside middleware**

Run:

```bash
grep -rn "runInTenantContext" apps/ packages/ --include="*.ts" | grep -v node_modules
```

Expected output (production callers only — test files are allowed):

```
apps/api/src/shared/tenant-context.middleware.ts:2:import { runInTenantContext, type TenantContext } from '@resto/db';
apps/api/src/shared/tenant-context.middleware.ts:48:    await runInTenantContext(context, () => {
packages/db/src/context.ts:31:export const runInTenantContext = <T>(context: TenantContext, op: () => Promise<T>): Promise<T> => {
```

Plus test file references (allowed). If any other `apps/api/src/**` or `packages/**/src/**` file imports `runInTenantContext`, that is a new I-6 violation — investigate before opening the PR.

- [ ] **Step 6: Verify git log on the branch**

Run:

```bash
git log --oneline main..res-240
```

Expected: 5 commits in order (newest first):

```
test(api): add no-ALS path coverage for identity event emitter
feat(api): replace runInTenantContext in IdentityEventEmitterAdapter
feat(db): add TenantAwareDb.withTenantId for non-HTTP entry points
docs(spec): RestoTx already exported, drop section 2
docs(spec): RES-240 BA-hook I-6 fix design
```

- [ ] **Step 7: Push the branch**

Confirm with the user before pushing. After approval:

```bash
git push -u origin res-240
```

- [ ] **Step 8: Open the PR**

Confirm with the user before opening. After approval:

```bash
gh pr create --title "res-240: feat(api): close I-6 violation in identity event emitter" --body ""
```

Empty body per project policy ("why" lives in Linear RES-240 + ADR-0020).

After the PR opens, update Linear RES-240 with the PR URL and move to "In Review".

---

## Out of scope (do NOT include in this PR)

- **RES-239** — ESLint `no-restricted-imports` rule blocking `runInTenantContext` outside `tenant-context.middleware.ts`. Separate ticket; lands after this one on a green tree.
- **RES-238** — formal `db.withTenant` / `withTenantId` / `withoutTenant` contract document. Separate ticket.
- Migrating any other code path to `withTenantId` — audit confirmed there are no other non-middleware `runInTenantContext` production callers.
- Lifting `runInTenantContext` from the `@resto/db` public surface — candidate future cleanup.

## Notes for the executing agent

- The branch `res-240` is already checked out from `main`. The spec is already committed (`062e55f docs(spec): RES-240 BA-hook I-6 fix design`).
- Do **not** add `Co-Authored-By: Claude …` trailers — project policy.
- Do **not** add commit body / description — subject line only.
- Optional `RES-240:` prefix on commit subjects is **not** used in recent project commits — match existing pattern by omitting it.
- The lint-staged hook will run prettier on staged files; expected and harmless.
- Docker must be running for the db integration tests and the adapter e2e (testcontainers). If `docker info` fails, surface this to the user before claiming green.
