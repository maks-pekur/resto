# ADR 0020: Multi-tenancy and event-bus invariants

- **Status:** accepted
- **Date:** 2026-05-16
- **Deciders:** Resto core team
- **Revises:** [ADR 0006](./0006-multi-tenancy-row-level-with-rls.md) (tightens "RLS as defense-in-depth" to mandate repository-layer filter AND adds composite-FK rule), [ADR 0004](./0004-nats-jetstream-event-bus.md) (adds transactional-inbox dedup rule + outbox correlation-id rule), [ADR 0013](./0013-better-auth-for-mvp2-identity.md) (clarifies `runInTenantContext` is HTTP-middleware-only — BA hooks must use `withoutTenant`).

## Context

A full-codebase review on 2026-05-16 surfaced **34 critical findings across 10 units** (`/.planning/reviews/2026-05-16-full-codebase/INDEX.md`). The findings cluster into a small number of recurring rule-vs-reality gaps:

1. ADR-0006 says "repository helpers in `packages/db` always filter by `tenant_id`, and RLS policies enforce the filter as defense-in-depth." In practice, multiple domain repos rely on RLS as the **first** line of tenant defense — there is no repo-layer `eq(table.tenantId, …)` filter on several reads/writes. The rule is aspirational; nothing in CI catches a violation.

2. The schema carries `tenant_id` as a value column on tenant-scoped children (`menu_items`, `menu_variants`, `member_brand_scope`, `customer_profiles`, …) but no composite foreign key ties `(child.id, child.tenant_id)` to the parent's `(id, tenant_id)`. Buggy or malicious writes under `withoutTenant` (or via a forged `app.current_tenant`) create phantom rows that pass RLS but reference cross-tenant parents.

3. `pkg/events`' `withInboxDedup` advertises handler dedup but only dedupes persistence — `hasSeen`, `handler()`, `markProcessed` run in three separate transactions. Two replicas can both see "unseen", both run the handler with full side effects (emails, payments, audit rows), and only one of the `markProcessed` calls wins. The downstream audit pipeline inherits this defect.

4. Outbox dispatchers mint a fresh `randomUUID()` for `envelope.correlationId`, severing end-to-end OTel tracing.

5. Several dev fallbacks are committed to source without a non-dev guard: `S3_SECRET_KEY: 'minio_dev_password'` (in env-schema defaults), `DEV_SALT_FALLBACK` for audit erasure (in `OffboardTenantService`), `VITE_TENANT_SLUG` in the QR-menu bundle, `NEXT_PUBLIC_API_ORIGIN`/`ADMIN_WEB_URL` in admin lib. Each is a dev convenience that, if accidentally promoted to production, silently breaks tenant isolation or ships dev credentials.

6. `IdentityEventEmitterAdapter` calls `runInTenantContext` from inside Better Auth hooks (not HTTP middleware) and binds the ALS tenant from an event envelope. ADR-0013 documented a BA-as-DB-client carve-out; this is a different and undocumented violation: our code in BA hooks bypasses the canonical "HTTP middleware is the only setter" contract.

7. `packages/api-client`'s generated DTOs contain `unknown` fields (`slug`, `currency`, `basePrice`, `defaultCurrency`) because upstream controllers lack `@ApiProperty` decorators. Consumers cast (`slug as string`), i.e. hand-write the shape — exactly what the "always generate API clients from OpenAPI" rule was supposed to prevent.

These are not bugs in one place. They are _missing invariants_ — rules the architecture assumes are true but never enforced.

## Decision

Codify seven invariants. Each invariant has a stated rule, an enforcement mechanism (lint, test, runtime check, or — last resort — code review), and an explicit owner.

### Invariant I-1 — RLS is the SECOND line of defense, not the first

**Rule.** Every domain repository read and write that targets a tenant-scoped table MUST include an explicit `eq(table.tenantId, ctx.tenantId)` predicate (or equivalent composite key). RLS exists to catch bugs in the application layer; the application layer does not get to rely on RLS to be correct.

**Enforcement.**

- **CI lint (P1, owner: platform).** A custom ESLint or `dependency-cruiser` rule, OR an AST grep that runs in CI, MUST fail the build when any Drizzle `select` / `update` / `delete` / `insert` against a known tenant-scoped table is missing a `tenantId` predicate. Allowlist for legitimate `withoutTenant` callsites is explicit, by file path, audited at PR time.
- **Repository unit tests (P2).** Each tenant-scoped repository test MUST include a "no ALS, no implicit filter → repository call throws" assertion. This is regression coverage for the lint above.

**Consequence.** Existing code that relies solely on RLS is technical debt (see catalog repo CRs in the review). The CI lint lands before any new tenant-scoped repo merges.

### Invariant I-2 — Composite FK on every tenant-scoped child

**Rule.** Every tenant-scoped child table MUST declare a composite foreign key back to its parent on both `id` AND `tenant_id`:

```sql
FOREIGN KEY (parent_id, tenant_id) REFERENCES parent(id, tenant_id)
```

This requires the parent to expose a `UNIQUE (id, tenant_id)` (cheap — `id` is already the PK).

**Enforcement.**

- **Migration review (P1, owner: db package owner).** Any new table that includes `tenant_id NOT NULL` AND a `*_id` column referencing a parent MUST include the composite FK. Reviewer rejects the PR otherwise.
- **Schema audit script (P2).** A `pnpm db:audit-fks` script enumerates tenant-scoped child tables and prints those missing the composite FK. Run in CI.

**Why.** Without the composite FK, a row in `menu_items` can declare `tenant_id = X` while linking `category_id` to a category whose `tenant_id = Y`. RLS shows the menu_item to tenant X but the category is invisible — phantom dangling reference, and a real cross-tenant data-leak primitive for joins.

### Invariant I-3 — Dev fallbacks require explicit `NODE_ENV` guard + `superRefine`

**Rule.** Any value that is "safe in dev, dangerous in production" — credentials, secrets, dev-only tenant slugs, dev-only feature flags, dev-only stub endpoints — MUST be gated by **both**:

1. A runtime guard: `if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test')`. The dev value is only used when the guard is true.
2. An env-schema `superRefine` block: when `NODE_ENV !== 'development' && NODE_ENV !== 'test'`, the corresponding env var is **required** (no `.default(…)`, no `.optional()`).

**Enforcement.**

- **Code review (P1).** Reviewers reject any new `.default('something-secret-looking')` or hardcoded fallback constant without both guards.
- **`env.schema.ts` schema test (P2).** A unit test enumerates the env schema, finds any var that resolves to a defaulted secret-shaped value in production, and fails.

**Forbidden examples (existing tech debt — bookmark for fix):**

- `S3_SECRET_KEY: z.string().default('minio_dev_password')` — `apps/api/src/config/env.schema.ts`
- `DEV_SALT_FALLBACK = 'dev-only-erasure-salt-32-chars-padding'` — `apps/api/src/contexts/tenancy/application/offboard-tenant.service.ts`
- `VITE_TENANT_SLUG` baked into the qr-menu bundle with no IS_DEV guard — `apps/qr-menu/src/api/client.ts`

### Invariant I-4 — Outbox `correlationId` derives from the active OTel span

**Rule.** When constructing an envelope in any outbox-write site, `correlationId` MUST be read from the active OTel span context (W3C `traceparent`) or from a shared `getCurrentCorrelationId()` helper backed by the same ALS frame that the HTTP correlation middleware populates. `randomUUID()` is **not** an acceptable value for `correlationId`.

**Enforcement.**

- **Helper enforcement (P1).** `packages/events` exposes `buildEnvelope({ type, payload, … })` which derives `correlationId` internally. Direct construction of `EventEnvelope` literals in application code is forbidden.
- **ESLint rule (P2).** `no-restricted-syntax` rule disallows `correlationId: randomUUID()` and `correlationId: crypto.randomUUID()` literals.

### Invariant I-5 — Inbox dedup MUST share a transaction with handler side effects

**Rule.** `withInboxDedup` (and any wrapper with the same intent) MUST perform `INSERT INTO inbox_processed (event_id, consumer) VALUES (…) ON CONFLICT DO NOTHING RETURNING 1` **inside the same database transaction** as the handler's database side effects. If the inbox INSERT returns zero rows, the handler MUST short-circuit before running.

This converts at-least-once delivery into at-most-once handler invocation _for handlers whose side effects are confined to the same database_. For handlers with side effects outside that database (sending email, charging cards, calling external APIs), see I-5b.

**I-5b — External-side-effect handlers MUST be idempotent by design.** When the handler's side effect cannot share a transaction with the inbox insert (HTTP call, email send, payment intent creation), the handler MUST derive an idempotency key from the envelope (`envelope.id` is the canonical key) and pass it to the external system as that system's idempotency token. The handler is expected to be safely re-runnable.

**Enforcement.**

- **API redesign (P1).** `withInboxDedup`'s current wrapper-of-handler shape is deprecated in favour of `runDeduped(envelope, async (tx) => { … })` which gives the handler the same `tx` used for the inbox insert.
- **Documentation (P1).** `packages/events/CLAUDE.md` calls out I-5 and I-5b explicitly.
- **Integration test (P2).** A "crash between handler commit and markProcessed" test asserts the new wrapper produces zero duplicate side effects.

### Invariant I-6 — `runInTenantContext` is HTTP-middleware-only

**Rule.** `runInTenantContext` is called **only** from `TenantContextMiddleware`. It is **not** called from:

- Better Auth hooks (`databaseHooks.*.after`, `hooks.before/after`),
- NATS subscriber message handlers,
- Outbox dispatcher tick code,
- CLI / migration / seed code,
- Any background job.

Code in those locations that needs to write to the database under a specific tenant context uses `db.withTenant(tenantId, async (tx) => { … })`, NOT `runInTenantContext`. Code that needs system-wide (cross-tenant) access uses `db.withoutTenant(reason, async (tx) => { … })` with an explicit, audited reason string.

The distinction matters: `runInTenantContext` binds the ALS frame for the _duration of the callback_. Outside HTTP, the callback's scope is shorter than expected because the surrounding execution is itself a callback or microtask; the bound tenant can leak into adjacent async work, or be torn down before the work completes.

**Enforcement.**

- **ESLint rule (P1).** `no-restricted-imports` allows `runInTenantContext` only from files matching `apps/api/src/shared/tenant-context.middleware.ts`. All other files import `withTenant` / `withoutTenant` from `@resto/db`.
- **Code review (P1).** Any PR that adds a call to `runInTenantContext` outside the middleware is blocked.

**Existing tech debt:** `apps/api/src/contexts/identity/infrastructure/identity-event-emitter.adapter.ts` violates this rule. Fix is to switch the adapter to `db.withoutTenant('identity event emitter', tx => …)`.

### Invariant I-7 — `unknown` in a generated DTO request field is a contract bug

**Rule.** Any `unknown` type in a request DTO field in `packages/api-client/src/generated/api.ts` is a contract bug. The fix is upstream: add `@ApiProperty({ type: String, … })` (or derive the type from a Zod schema) on the controller DTO, then regenerate. Consumers are **not** allowed to cast their way around an `unknown` (`payload.slug as string`) — that defeats the purpose of generating types.

**Enforcement.**

- **CI grep (P1).** A CI step greps `packages/api-client/src/generated/api.ts` for `: unknown` inside DTO bodies and fails the build with a list of offending operations.
- **ESLint rule (P2).** A `no-unsafe-cast` rule (custom) disallows `as string` / `as number` / `as boolean` on values typed `unknown` from `@resto/api-client/*` imports.

## Alternatives considered

- **Document the invariants without enforcement.** Rejected — that is exactly the current state; the review demonstrated it produces aspirational rules and code that quietly violates them.
- **Encode the invariants only in CLAUDE.md, not in ADRs.** Rejected — these are decisions about _how the platform stays correct over time_, not local conventions. They belong in the durable, immutable ADR record. CLAUDE.md cross-references this ADR.
- **One ADR per invariant.** Rejected — the seven invariants share context, share enforcement infrastructure, and are easier to evolve together. Splitting would create 7 nearly-empty ADRs that obscure their interrelationships.
- **Strict enforcement with no tech debt grandfathering.** Rejected as impractical: existing code violates several invariants. The ADR enumerates the existing violations explicitly so they become tracked work, not invisible drift.

## Consequences

### Positive

- Single durable source of truth for the cross-cutting platform invariants. Any future ambiguity about "should this code be allowed to do X" has an answer in this ADR.
- The enforcement mechanisms (CI lints, schema audit script, ESLint rules) make the invariants self-defending — drift is caught at PR time, not at the next code review six months later.
- Existing tech debt is enumerated rather than hidden; it becomes prioritized backlog rather than ambient anxiety.

### Negative

- The CI lints and helper-only constructors (I-4, I-5, I-7) add friction to legitimate work. Trade-off accepted: the friction is one-time-per-pattern; the bug class is repeating.
- Tech debt from the existing violations must be paid down. The full-codebase review estimates ~12 P0 fixes and ~30 P1 fixes; each ships under a dedicated ticket.

### Neutral

- The invariants do not change the public API of any package or the wire shape of any event. They are internal correctness rules.

## Implementation notes

- The full-codebase review `.planning/reviews/2026-05-16-full-codebase/INDEX.md` is the inventory of existing violations. Each P0 / P1 there cross-references the invariant it violates.
- The CI lints land in `tools/eslint-plugin-resto/` (new package, to be created as part of I-1 work).
- The schema audit script (I-2) lands in `packages/db/src/cli/audit-fks.ts`.
- The `buildEnvelope` helper (I-4) and `runDeduped` wrapper (I-5) land in `packages/events/src/`.
- The "allowlist for legitimate `withoutTenant` callsites" (I-1) lives in `packages/db/src/withoutTenant.allowlist.ts` and is enforced by the ESLint rule.

## Adoption sequencing

1. **This ADR merges first.** Documents the invariants; no code change yet.
2. **CLAUDE.md updates land in the same PR or immediately after** — root + per-area + per-package — referencing this ADR for the canonical statement.
3. **Enforcement infrastructure (CI lints, helper APIs) lands as a discrete phase** before the tech-debt fixes. Otherwise fixes drift again.
4. **Tech-debt fixes proceed per the review punch list**, each PR cross-referencing the invariant it satisfies and the violation it closes.
