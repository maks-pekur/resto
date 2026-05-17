---
ticket: RES-240
adr: 0020 (I-6), 0021 (Tier 1 — Multi-tenancy)
status: proposed
date: 2026-05-17
scope:
  - packages/db/src/client.ts (new TenantAwareDb.withTenantId)
  - apps/api/src/contexts/identity/infrastructure/identity-event-emitter.adapter.ts
  - packages/db/test/integration/with-tenant-id.spec.ts (new)
  - apps/api/test/e2e/identity-event-emitter.adapter.e2e.spec.ts (extend)
---

# RES-240 — close BA-hook I-6 violation in IdentityEventEmitterAdapter

## Context

ADR-0020 invariant I-6 states: **`runInTenantContext` is HTTP-middleware-only.**
Code outside `TenantContextMiddleware` that needs to bind a tenant uses
`db.withTenant` / `db.withoutTenant` (= TenantAwareDb wrappers), not the raw
ALS-seeding primitive.

`apps/api/src/contexts/identity/infrastructure/identity-event-emitter.adapter.ts`
currently violates I-6. The adapter's fallback branch for the "no ALS context
bound" case seeds ALS itself:

```ts
// current — VIOLATION
await runInTenantContext({ tenantId: envelope.tenantId }, run);
```

The branch fires from Better Auth hooks (`onSignedOut`, `onPasswordResetCompleted`)
that run during HTTP requests where `TenantContextMiddleware` did not resolve a
tenant — the `/sign-out` request typically arrives without `x-tenant-slug` and
without a tenant-bearing host. The authoritative `envelope.tenantId` is read
from the BA session snapshot, so the data is available; the question is how to
bind it to the DB session.

The fix needs to:

1. Stop using `runInTenantContext` from non-middleware code.
2. Provide an alternative on `TenantAwareDb` that accepts an explicit
   `tenantId` (the existing `withTenant(op)` reads from ALS).
3. Preserve the existing security invariant: when ALS **is** bound, the
   adapter must not let `envelope.tenantId` escape it. This is currently
   enforced by `withTenant` reading ALS + Postgres RLS `WITH CHECK` rejecting
   any mismatched INSERT.

The same shape (`db.withTenantId`) will also be needed by future non-HTTP
entry points (NATS subscribers binding the consumer's authoritative tenant,
outbox dispatcher fan-out, CLI tools, background jobs). RES-240 introduces
the primitive; its first consumer is the identity event emitter.

## Audit of existing `runInTenantContext` callers

```text
apps/api/src/contexts/identity/infrastructure/identity-event-emitter.adapter.ts  — VIOLATION (this PR)
apps/api/src/shared/tenant-context.middleware.ts                                 — LEGAL (the middleware itself)
packages/db/src/context.ts                                                       — definition
*.spec.ts                                                                        — test simulators of HTTP middleware
```

No other production callers. RES-240's adapter is the only I-6 violation in
the codebase right now; this fix closes I-6 completely, leaving only the
middleware as a legitimate user. (RES-239 will add an ESLint
`no-restricted-imports` rule to keep it that way — separate PR.)

## Design

### 1. New `TenantAwareDb.withTenantId(tenantId, op)`

**File:** `packages/db/src/client.ts`

```ts
/**
 * Run `op` inside a transaction with an EXPLICIT tenant id bound.
 *
 * Reserved for non-HTTP entry points where the caller has an authoritative
 * tenant id but does not run inside `TenantContextMiddleware`:
 *   - Better Auth hooks (`/sign-out`, `/reset-password`) — see ADR-0020 I-6.
 *   - NATS subscribers, outbox dispatcher, CLI, background jobs.
 *
 * HTTP code paths MUST use `withTenant(op)` (ALS-bound). To enforce this,
 * `withTenantId` throws when called inside an existing tenant context —
 * if `getTenantContext()` returns a value, the caller mis-routed.
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

**Behaviour:**

- ALS bound → throws synchronously (defensive: forces non-HTTP code to use
  `withTenantId` and HTTP code to use `withTenant`; eliminates the
  ALS-rebind primitive that would otherwise exist).
- Invalid UUID → throws before opening the transaction (parity with
  `runInTenantContext`'s existing validation).
- Otherwise: transaction with `SET LOCAL app.current_tenant=$tenantId` +
  `app.is_system='false'`, identical to `withTenant` except for the source
  of the id.
- Nested `withTenantId` (inside another `op` callback): `op` runs with `tx`
  but `getTenantContext()` is still empty (no ALS bind happens), so a
  nested `withTenantId` call would **not** throw on the guard but **would**
  open a new transaction. Documented in the unit test; current judgement
  is that the guard's purpose is "do not run inside HTTP middleware",
  not "do not nest". See open design notes.

**Validation reuse:** `isUuid` lives in `packages/db/src/context.ts`.
Import it from `client.ts` (no cycle — `client.ts` already imports
`requireTenantContext` from `context.ts`). Either export `isUuid` from
`context.ts` as an internal helper or move it to `packages/db/src/_uuid.ts`.
Pick the lighter move during implementation; the chosen approach goes into
the implementation plan.

### 2. `RestoTx` already exported (no change)

**File:** `packages/db/src/index.ts`

`RestoTx` is already re-exported from `@resto/db` (line 14 of `index.ts`).
Earlier note in this spec was wrong — confirmed by grep during plan
authoring. The adapter just imports it directly. No change required in
this PR.

### 3. Adapter rewrite

**File:** `apps/api/src/contexts/identity/infrastructure/identity-event-emitter.adapter.ts`

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

**What changed:**

- Removed import of `runInTenantContext`.
- Added import of `RestoTx` (exported in change 2).
- Local `append` helper eliminates triple `appendToOutbox(tx, …)` duplication.
- Three branches stay (null / ALS-bound / explicit), each commented with
  its real-world trigger.
- Behaviour preserved:
  - `envelope.tenantId == null` → `withoutTenant` (platform event)
  - ALS bound + envelope.tenantId set → `withTenant` (HTTP path; RLS validates)
  - ALS empty + envelope.tenantId set → `withTenantId` (BA-hook path)

## Tests

### Unit / integration: `packages/db/test/integration/with-tenant-id.spec.ts` (new)

| Case                                         | ALS state                              | Input                          | Expected                                                                 |
| -------------------------------------------- | -------------------------------------- | ------------------------------ | ------------------------------------------------------------------------ |
| binds explicit tenant id when ALS is empty   | empty                                  | `withTenantId(A, op)`          | INSERT with tenant_id=A succeeds; SELECT inside op returns only tenant A |
| throws when ALS is already bound (same id)   | bound to A                             | `withTenantId(A, op)`          | throws; op not executed                                                  |
| throws when ALS is bound to different tenant | bound to B                             | `withTenantId(A, op)`          | throws                                                                   |
| rejects malformed tenantId                   | empty                                  | `withTenantId('not-uuid', op)` | throws before opening tx                                                 |
| nested `withTenantId` opens new tx           | inside `op` of outer `withTenantId(A)` | inner `withTenantId(B, op2)`   | inner op runs with tenant=B (no throw; document as intentional)          |

Use the existing testcontainer harness (`packages/db/test/integration/tenant-isolation.spec.ts` is the template).

### E2E: `apps/api/test/e2e/identity-event-emitter.adapter.e2e.spec.ts` (extend)

Existing 3 cases unchanged:

1. ALS=A + envelope=A → row persisted with tenant_id=A.
2. ALS=A + envelope=B → RLS WITH CHECK rejects.
3. envelope=null → row persisted via `withoutTenant` with tenant_id=null.

New 4th case — BA-hook simulation (no-ALS path):

```ts
it('persists a tenant-bound event when ALS is empty (BA-hook path)', async () => {
  const envelope = buildEnvelope(TENANT_A_ID);
  // NOT wrapped in runInTenantContext — simulates a BA hook firing
  // outside TenantContextMiddleware.
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

This case is the regression net for the I-6 fix specifically — before the
change it would succeed via `runInTenantContext`, after the change it
succeeds via `withTenantId`. The diff in the implementation pins the new
code path.

## Rollout

### Branch + commits

Branch `res-240`, three atomic commits (bisect-friendly):

```
res-240: feat(db): add TenantAwareDb.withTenantId for non-HTTP entry points
res-240: feat(api): replace runInTenantContext in IdentityEventEmitterAdapter
res-240: test(api): add no-ALS path coverage for identity event emitter
```

Alternative single commit (`res-240: fix(api): close I-6 violation in
identity event emitter`) decided at implementation time.

### Verification (in order)

1. `pnpm exec nx run-many -t typecheck -p db,api` — green.
2. `pnpm exec nx run-many -t lint -p db,api` — green.
3. `pnpm exec nx test db` — `with-tenant-id.spec.ts` passes.
4. `pnpm exec nx test api --testPathPattern=identity-event-emitter.adapter.e2e` — 4 cases pass.
5. `pnpm exec nx test db --testPathPattern=tenant-isolation` — green (no collateral).
6. `grep -rn "runInTenantContext" apps/ packages/ --include="*.ts"` — only `tenant-context.middleware.ts`, `packages/db/src/context.ts` (definition), and `*.spec.ts` test helpers remain.

### PR

- Title: `res-240: feat(api): close I-6 violation in identity event emitter`
- Body: empty per project policy ("why" lives in Linear + ADR).
- Linear RES-240 → Done after merge. `gate-blocker` label stays (counts
  toward Tier 1 freeze in `docs/milestones/STATUS.md`).

## Out of scope

- **RES-239** — ESLint `no-restricted-imports` rule blocking
  `runInTenantContext` outside `tenant-context.middleware.ts`. After RES-240
  lands the codebase is clean, and the rule can be added on a green tree.
- **RES-238** — `db.withTenant` / `withTenantId` / `withoutTenant`
  contract document (ADR-0020 council WR-2). Contract surface grows by one
  verb in this PR; the formal write-up happens in RES-238.
- **Migrating other non-HTTP code paths** — audit shows audit consumer,
  outbox dispatcher, repositories are already on `withTenant` / `withoutTenant`.
  Nothing to migrate.
- **Dropping `runInTenantContext` from the `@resto/db` public surface** —
  candidate for a future cleanup; requires deciding how the middleware
  receives the primitive (internal subpath export, or move middleware
  inside `packages/db`). Not in this PR.

## Rejected alternatives

- **Overload `withTenant(opOrTenantId, op?)`.** Single method with two
  signatures. Smaller API surface but conflates ALS-bound vs explicit
  semantics; runtime overload dispatch on `typeof arg`. Less greppable.
- **`withExplicitTenant(tenantId, op)`.** Longer name without added clarity
  over `withTenantId`. Asymmetric with the existing `withoutTenant(reason, op)`
  family.
- **Drop the no-ALS branch in the adapter; require ALS to be bound before
  calling `emit()`.** Would require either (a) BA hooks seeding ALS — the
  exact I-6 violation we are fixing, or (b) `TenantContextMiddleware`
  reading the BA session to bind ALS pre-emit — bigger refactor with no
  symmetric benefit, and `onPasswordResetCompleted` fires before session
  is established.
- **`withTenantId` agnostic to ALS state (no guard).** Simpler but creates
  an ALS-rebind primitive: a careless `withTenantId(forgedId, …)` call
  inside an HTTP request would silently override the middleware-bound
  context. Defensive throw eliminates the footgun and is symmetric with
  RES-243's intent (block in-tx rebind of `app.current_tenant`).

## Open design notes

Resolved at implementation time, not blocking the spec:

1. **`isUuid` reuse vs duplication.** `context.ts` exposes it as a
   module-local function. Either export it from `context.ts` (internal,
   not re-exported through `index.ts`) or move to `_uuid.ts`. Pick the
   lighter move.
2. **Nested `withTenantId` behaviour.** Current design: nested calls
   succeed (no ALS bind, so guard passes; second tx opens). Document with
   a test, do not throw on nest — no real use case for it, and a throw
   would be surprising for legitimate fan-out patterns later.
3. **Single vs three commits.** Three for bisect; one is also fine. Pick
   during implementation.

## References

- [ADR-0020 — Multi-tenancy and event-bus invariants](../../adr/0020-multi-tenancy-and-event-bus-invariants.md) — invariant I-6 is the canonical statement.
- [ADR-0021 — Layered milestone strategy](../../adr/0021-layered-milestone-strategy.md) — RES-240 sits in Tier 1, blocks Tier 1 freeze.
- Linear: `RES-240 — Fix BA-hook I-6 violation: IdentityEventEmitterAdapter` (Urgent, `gate-blocker`).
- Predecessor follow-ups: RES-243 (block in-tx rebind of `app.current_tenant`), RES-239 (ESLint guard), RES-238 (contract doc).
