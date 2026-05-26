# Phase 1: Tenancy Hardening — Pattern Map

**Mapped:** 2026-05-26
**Phase character:** Brownfield hardening — most files are MODIFIED, not new. Every TEN-xx has a verified analog in the codebase (per `01-RESEARCH.md` §Discovered Patterns).
**Files in scope:** 26 (8 new, 18 modified)
**Analogs found:** 26 / 26 (zero `NO_ANALOG`)

This document is the planner's quick-reference. For each file the phase touches, it names the closest existing analog (with line numbers) and the pattern to copy. Cross-cutting patterns referenced 3+ times are excerpted once in §Shared Patterns.

---

## File-by-File Table

### PR 1 — Outbox bug fixes (TEN-16, TEN-17)

| New/Modified file                                                                | Role          | Closest analog (file:line)                                                             | Pattern to replicate                                                                                                                   |
| -------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/events/src/outbox/dispatcher.ts` (modify ~L118-141)                    | infra adapter | self, current `stop()` body                                                            | Cache `#stopPromise ??= new Promise(...)`; resolver captured into local before nullification. See §Shared `Cached stop-promise idiom`. |
| `packages/events/src/outbox/repository.ts` (modify L23, top of `appendToOutbox`) | infra repo    | self, existing `EventEnvelope` usage in same file                                      | Add `EventEnvelope.parse(options.envelope)` as first statement; let Zod throw `ZodError` before INSERT. 1-line change.                 |
| `packages/events/test/integration/outbox-roundtrip.spec.ts` (modify)             | test          | self (existing happy-path test)                                                        | Add malformed-envelope case: assert `ZodError` thrown AND `outbox_events` row count unchanged.                                         |
| `packages/events/test/integration/dispatcher-stop-idempotent.spec.ts` (new)      | test          | `apps/api/test/e2e/outbox-dispatcher.e2e.spec.ts` (159 lines, existing dispatcher e2e) | Two parallel `stop()` calls via `Promise.all`; assert both resolve to the same value.                                                  |

### PR 2 — Docker test stack (D-06)

| New/Modified file                            | Role         | Closest analog (file:line)                     | Pattern to replicate                                                                                                                             |
| -------------------------------------------- | ------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `infra/docker/docker-compose.test.yml` (new) | infra config | `infra/docker/docker-compose.dev.yml`          | Copy service names (postgres, nats); reduce resource limits; use ephemeral (anonymous) volumes; drop dev-only services (MailHog, Jaeger, MinIO). |
| `scripts/test-stack.mjs` (new, optional)     | tooling      | existing `tools/` or `scripts/` runner pattern | Convenience wrapper `up`/`down`. Optional — testcontainers already manage lifecycle.                                                             |

### PR 3 — Suspend lifecycle + background jobs + buildEnvelope

#### TEN-01..04 — suspend/resume aggregate + service + route + event

| New/Modified file                                                                          | Role                | Closest analog (file:line)                                              | Pattern to replicate                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------ | ------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/api/src/contexts/tenancy/domain/tenant.aggregate.ts` (modify)                        | domain              | self, `archive()` and `scheduleOffboarding()` methods                   | Add `suspend(requestedBy, now?)` + `resume(now?)`. Guard against current status; mutate `this.snapshot`; push to `this.#events`. See §Shared `Aggregate state-transition method`.                                                                                  |
| `apps/api/src/contexts/tenancy/domain/events.ts` (modify)                                  | domain              | self, `TenantArchivedDomainEvent` interface + `TenantDomainEvent` union | Add `TenantSuspendedDomainEvent` + `TenantResumedDomainEvent` interfaces; extend the discriminated union.                                                                                                                                                          |
| `apps/api/src/contexts/tenancy/domain/errors.ts` (modify)                                  | domain              | self, `TenantAlreadyArchivedError`                                      | Add `TenantSuspendedError`, `TenantAlreadySuspendedError`, `TenantNotSuspendedError`, `TenantSuspensionNotAllowedError`. Plain `Error` subclass; set `this.name` explicitly.                                                                                       |
| `apps/api/src/contexts/tenancy/application/suspend-tenant.service.ts` (new)                | application service | `apps/api/src/contexts/tenancy/application/archive-tenant.service.ts`   | `@Injectable`, `@Inject(TENANT_REPOSITORY)`, two public methods `suspend()` and `resume()` (or two services — planner decides). See §Shared `Application service shape`.                                                                                           |
| `apps/api/src/contexts/tenancy/application/dto.ts` (modify)                                | application DTO     | self, existing `ArchiveTenantInputDto` / Zod schema pair                | Add `SuspendTenantInputSchema` + `ResumeTenantInputSchema` (Zod) and the matching `*Dto` classes via `createZodDto`.                                                                                                                                               |
| `apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts` (modify L292+) | infra repo          | self, `domainEventToEnvelope` switch around L296                        | Add `case 'TenantSuspended'` and `case 'TenantResumed'` branches. **Combined with TEN-14 migration:** new branches use `buildEnvelope(contract, payload, opts)`, NOT a literal `{ correlationId: randomUUID(), ... }`. See §Shared `domainEventToEnvelope branch`. |
| `apps/api/src/contexts/tenancy/interfaces/http/internal-tenants.controller.ts` (modify)    | interfaces/http     | self, existing `archive` and offboard route handlers in same file       | Add `@Post(':id/suspend')` + `@Post(':id/resume')` mirror methods; `@UseGuards(InternalTokenGuard)`; wrap body in `wrapWith(mapDomainError)`.                                                                                                                      |
| `apps/api/src/contexts/tenancy/interfaces/http/error-mapping.ts` (modify)                  | interfaces/http     | self, existing `mapDomainError` switch on archive errors                | Add `if (err instanceof TenantSuspendedError) return new ForbiddenException(...)` (403 per OQ-1). `TenantAlreadySuspendedError` → `ConflictException`. `TenantNotSuspendedError` → `ConflictException`.                                                            |
| `packages/events/src/contracts/tenancy.ts` (modify)                                        | event contract      | self, `TenantArchivedV1` (`defineEventContract`)                        | Add `TenantSuspendedV1Payload` (Zod), `TenantSuspendedV1` contract; same for Resumed. See §Shared `defineEventContract`. Re-export from `packages/events/src/index.ts`.                                                                                            |
| `apps/api/src/contexts/audit/application/record-audit.service.ts` (modify)                 | audit               | self, existing `ACTION_TARGET_KIND` map                                 | Add `'tenancy.tenant_suspended.v1'` and `'tenancy.tenant_resumed.v1'` entries mapping to target kind `'tenant'`.                                                                                                                                                   |
| `apps/api/src/contexts/audit/infrastructure/nats-audit-subscriber.ts` (verify only)        | audit subscriber    | self, existing wildcard subscriber on `tenancy.>`                       | NO CODE CHANGE expected — wildcard already catches new event types. Verify in test.                                                                                                                                                                                |

#### TEN-02 — customer-facing route block (decorator approach per OQ-3 recommendation)

| New/Modified file                                                                  | Role              | Closest analog (file:line)                                                                                 | Pattern to replicate                                                                                                       |
| ---------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/shared/auth/require-active-tenant.decorator.ts` (new)                | shared decorator  | `apps/api/src/shared/auth/` existing decorators (e.g. `@Public()`, `@RequirePermissions()`)                | `applyDecorators(SetMetadata, UseGuards(RequireActiveTenantGuard))` pattern.                                               |
| `apps/api/src/shared/auth/require-active-tenant.guard.ts` (new)                    | shared guard      | existing guards in `apps/api/src/shared/auth/*.guard.ts` (e.g. `auth.guard.ts`, `internal-token.guard.ts`) | `@Injectable` + `CanActivate`; read tenant from current context; throw `TenantSuspendedError` if status === `'suspended'`. |
| `apps/api/src/contexts/catalog/interfaces/http/public-menu.controller.ts` (modify) | controller        | self                                                                                                       | Apply `@RequireActiveTenant()` to `menu()` and `item()` handlers.                                                          |
| `apps/api/src/shared/tenant-context.middleware.ts` (verify only)                   | shared middleware | self                                                                                                       | NO change — middleware stays purely informational (per OQ-3 recommendation).                                               |

#### TEN-05/06 + TEN-13 — Background jobs module

| New/Modified file                                                       | Role             | Closest analog (file:line)                                                                | Pattern to replicate                                                                                                                                                                                             |
| ----------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/infrastructure/background-jobs.module.ts` (new)           | NestJS module    | `apps/api/src/infrastructure/nats.module.ts` (existing infrastructure module)             | `@Module({ imports: [ScheduleModule.forRoot(), TenancyModule, DatabaseModule], providers: [...] })`.                                                                                                             |
| `apps/api/src/infrastructure/tenant-erasure-scheduler.service.ts` (new) | cron service     | NEW PATTERN — no `@Cron` analog in tree                                                   | Follow `01-RESEARCH.md` §Pattern 4 verbatim: `@Cron('0 2 * * *', { name: 'tenant-erasure', timeZone: 'UTC' })`; sequential loop with per-tenant try/catch + OTel `recordException` + WARN log + continue (D-11). |
| `apps/api/src/infrastructure/inbox-retention.service.ts` (new)          | cron service     | sibling — `tenant-erasure-scheduler.service.ts` (this same PR)                            | Same `@Cron` shape; offset 15 min (`'15 2 * * *'`); calls helper in `packages/db`.                                                                                                                               |
| `packages/db/src/inbox-retention.ts` (new)                              | db helper        | existing tx-execute helpers in `packages/db/src/` (e.g. `client.ts` `withoutTenant` body) | Raw SQL stays in `packages/db` (project rule). DELETE under `db.withoutTenant('inbox-retention-sweep', tx => ...)`. Requires `GRANT DELETE ON inbox_processed TO resto_app` (see OQ-2 recommendation).           |
| `packages/db/migrations/0028_*.sql` (new)                               | migration        | `packages/db/migrations/0027_revoke_resto_app_ba_credential_tables.sql`                   | Narrow `GRANT DELETE ON inbox_processed TO resto_app;` (OQ-2 Option B).                                                                                                                                          |
| `apps/api/src/app.module.ts` (modify)                                   | composition root | self                                                                                      | Add `BackgroundJobsModule` to root imports.                                                                                                                                                                      |
| `apps/api/package.json` (modify)                                        | config           | self                                                                                      | `pnpm add --filter @resto/api @nestjs/schedule@^4.1.2` (or `=4.1.2` for TEN-18 parity).                                                                                                                          |

#### TEN-14 — `buildEnvelope` helper

| New/Modified file                                                   | Role           | Closest analog (file:line)                                                 | Pattern to replicate                                                                                                                                                        |
| ------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/events/src/envelope.ts` (modify — append `buildEnvelope`) | library helper | self, existing `EventEnvelope` schema + `defineEventContract` in same file | Free function (NOT a port). Reads `getCorrelationId()` from `./correlation`; falls back to `randomUUID()` + WARN log (D-10). See `01-RESEARCH.md` §Pattern 2 for full body. |
| `packages/events/src/index.ts` (modify)                             | barrel         | self                                                                       | Re-export `buildEnvelope` + `BuildEnvelopeOptions`.                                                                                                                         |
| `packages/events/test/unit/build-envelope.spec.ts` (new)            | unit test      | existing unit tests in `packages/events/test/unit/`                        | Three cases: ALS-bound correlationId, explicit override, no-ALS fallback (asserts WARN log emitted).                                                                        |

### PR 4 — Boot preflights + ESLint enforcement

| New/Modified file                                                                        | Role                | Closest analog (file:line)                                                                | Pattern to replicate                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/db/src/preflight.ts` (modify — append `assertNoBaCredentialAccess`)            | preflight assertion | self, existing `assertNoRlsBypass`, `assertTenantLockInstalled`, `assertSetConfigRevoked` | 12 × `has_table_privilege('resto_app', '<table>', '<priv>')` checks. Custom error class `BaCredentialAccessNotRevokedError` (sets `this.name`). See §Shared `Preflight assertion shape`.                                      |
| `packages/db/src/preflight.ts` (modify — append `assertWithoutTenantCallsiteRegistered`) | preflight assertion | self, same family                                                                         | Per Pitfall 6 + D-08: **presence-check only** (every path in `WITHOUT_TENANT_ALLOWLIST` exists as a file). NOT a stack-walker.                                                                                                |
| `apps/api/src/main.ts` (modify ~L48)                                                     | bootstrap           | self, existing preflight call chain                                                       | Add 4th and 5th `await` calls after `assertSetConfigRevoked`.                                                                                                                                                                 |
| `packages/db/src/withoutTenant.allowlist.ts` (verify, possibly modify)                   | config              | self                                                                                      | Already exists. TEN-11 promotes its parity test to a runtime assertion — no new entries expected.                                                                                                                             |
| `packages/db/test/integration/preflight-ba-creds.spec.ts` (new)                          | test                | `packages/db/test/integration/auth-role-grants.spec.ts` (existing TEN-07 foundation test) | Real Postgres via `startPostgres()`; assert preflight passes after migration 0027; assert it throws if a GRANT is reintroduced.                                                                                               |
| `packages/config-eslint/base.mjs` (modify)                                               | ESLint config       | self, existing `no-restricted-syntax` block (multiple entries)                            | Append two selectors: (1) `Property[key.name='correlationId'] > CallExpression[callee.name='randomUUID']`, (2) `crypto.randomUUID()` variant via `callee.object.name='crypto'`. See `01-RESEARCH.md` §ESLint rule for TEN-15. |
| `apps/api/eslint.config.mjs` (verify)                                                    | ESLint config       | self, existing per-file `withoutTenant` overrides                                         | NO change to the override blocks — the allowlist itself isn't expanding. Verify the rule reference still works after `base.mjs` edits.                                                                                        |
| `packages/db/eslint.config.mjs` (modify)                                                 | ESLint config       | `apps/api/eslint.config.mjs` (existing pattern)                                           | Extend the `withoutTenant`-restriction rule + per-file override to parity (D-09).                                                                                                                                             |
| `packages/events/eslint.config.mjs` (modify)                                             | ESLint config       | same                                                                                      | Same parity extension.                                                                                                                                                                                                        |

### PR 5 — Observability + audit gap close (TEN-09 + TEN-14 migration + TEN-10)

| New/Modified file                                                                                                 | Role           | Closest analog (file:line)                                                                                                   | Pattern to replicate                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/contexts/identity/identity-core.module.ts` (modify L106, L122, L147)                                | infra adapter  | sibling tenancy repo (after TEN-14 helper exists)                                                                            | Replace inline `{ correlationId: randomUUID(), ... }` literal with `buildEnvelope(contract, payload, opts)`. 3 sites.                                                                     |
| `apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts` (modify L296, L312, L323, L338, L352) | infra repo     | self, same switch                                                                                                            | Migrate 5 existing branches to `buildEnvelope`. **Combined with new Suspend/Resumed branches from PR 3** — per D-15, identity + tenancy migrations ship in this PR.                       |
| `apps/api/src/infrastructure/outbox-dispatcher.service.ts` (modify)                                               | infra adapter  | self, existing `deliveredCounter.add(1, { 'event.type': ... })`, `lagHistogram.record(...)`, `claimFailuresCounter.add(...)` | Extend the attribute bag: add `'tenant.id': envelope.tenantId ?? 'platform'` to each `.add()` / `.record()` call.                                                                         |
| `apps/api/src/shared/http-metrics.interceptor.ts` (new OR modify if exists)                                       | interceptor    | existing OTel auto-instrumentation in `bootstrap-telemetry.ts`                                                               | Emit per-request counter + error counter with `tenant.id` label read via `requireTenantContext()`. Cardinality ceiling documented as 50+ tenants (D-05).                                  |
| `.planning/phases/01-tenancy-hardening/audit-gap.md` (new)                                                        | doc            | `.planning/codebase/CONCERNS.md` (existing table format)                                                                     | Markdown table per OQ-4: `Action \| Context \| Current Status \| Gap \| Closure Task`. Rows for 8 actions (provision, archive, offboard, suspend, erase, sign-in, sign-out, role-change). |
| `apps/api/test/e2e/identity-audit.e2e.spec.ts` (modify)                                                           | test           | self                                                                                                                         | Add assertions for any new audit rows created by closing identified gaps.                                                                                                                 |
| `apps/api/test/e2e/outbox-dispatcher.e2e.spec.ts` (modify)                                                        | test           | self                                                                                                                         | Assert OTel attributes include `tenant.id` on `delivered` counter.                                                                                                                        |
| `apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts` (verify only — OQ-5)                   | adapter config | self                                                                                                                         | Read existing BA callbacks to confirm whether `role-change` has a hookable surface. If not, gap stays open in `audit-gap.md` and deferred to AUTH-09.                                     |

### PR 6 — Cross-tenant test net (TEN-08 — PHASE GATE)

| New/Modified file                                                  | Role             | Closest analog (file:line)                                                                                                                                 | Pattern to replicate                                                                                                     |
| ------------------------------------------------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `apps/api/test/e2e/cross-tenant-als-leak.e2e.spec.ts` (new)        | e2e test         | `apps/api/test/e2e/with-real-stack.setup.ts` (canonical setup) + `cross-tenant-isolation.e2e.spec.ts` (existing scaffold, 227 lines — read first per OQ-6) | `Promise.all` two HTTP requests under different tenants; assert each sees only its own data. Run 100× in CI (Pitfall 4). |
| `apps/api/test/e2e/cross-tenant-nats-mix.e2e.spec.ts` (new)        | e2e test         | same                                                                                                                                                       | Publish A/B/A/B interleaved; assert `runDeduped` handler always processes the envelope's tenantId, not a leaked one.     |
| `packages/db/test/integration/concurrent-write-race.spec.ts` (new) | integration test | `packages/db/test/integration/tenant-isolation.spec.ts` (canonical RLS regression test)                                                                    | `Promise.all` writes from two `withTenant` callbacks; inject `pg_sleep(0.5)` to widen the leak window (Pitfall 5).       |
| `packages/db/test/integration/raw-tx-rls-fence.spec.ts` (new)      | integration test | same                                                                                                                                                       | Deliberately omit `WHERE tenant_id` in a raw `tx.select()`; assert RLS still returns ONLY the bound tenant's rows.       |

---

## Shared Patterns

These patterns are referenced 3+ times above. Excerpts here, planner cites them by section name in `<read_first>` blocks.

### Aggregate state-transition method

Origin: `apps/api/src/contexts/tenancy/domain/tenant.aggregate.ts` (existing `archive()` / `scheduleOffboarding()` — both follow this shape)

```typescript
suspend(requestedBy: string, now: Date = new Date()): void {
  if (this.snapshot.status === 'suspended') {
    throw new TenantAlreadySuspendedError(this.snapshot.id);
  }
  if (this.snapshot.status !== 'active') {
    throw new TenantSuspensionNotAllowedError(this.snapshot.id, this.snapshot.status);
  }
  this.snapshot = { ...this.snapshot, status: 'suspended', updatedAt: now };
  this.#events.push({
    kind: 'TenantSuspended',
    tenantId: this.snapshot.id,
    requestedBy,
    suspendedAt: now,
    occurredAt: now,
  });
}
```

Invariants every transition must follow: guard current status → mutate snapshot immutably → push onto `#events`. Events are drained by `pullEvents()` inside the repository `save()`.

### Application service shape

Origin: `apps/api/src/contexts/tenancy/application/archive-tenant.service.ts`

```typescript
@Injectable()
export class SuspendTenantService {
  private readonly logger = new Logger(SuspendTenantService.name);
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly repo: TenantRepository,
  ) {}

  async suspend(input: {
    tenantId: string;
    requestedBy: string;
  }): Promise<TenantSnapshot> {
    const id = TenantId.parse(input.tenantId);
    const tenant = await this.repo.findById(id);
    if (!tenant) throw new TenantNotFoundError(input.tenantId);
    tenant.suspend(input.requestedBy);
    await this.repo.save(tenant);
    this.logger.warn(
      { tenantId: id, requestedBy: input.requestedBy },
      'Tenant suspended',
    );
    return tenant.toSnapshot();
  }
}
```

Convention: single public method, Symbol-token repo injection, structured log (object first, then message), return snapshot not aggregate.

### `domainEventToEnvelope` branch (using `buildEnvelope`)

Origin: `apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts:296` (existing branches will migrate in PR 5; new branches in PR 3 use the new shape directly).

```typescript
case 'TenantSuspended':
  return buildEnvelope(
    TenantSuspendedV1,
    {
      tenantId: event.tenantId,
      requestedBy: event.requestedBy,
      suspendedAt: event.suspendedAt,
    },
    { tenantId: event.tenantId, occurredAt: event.occurredAt },
  );
```

NEVER write `{ correlationId: randomUUID(), ... }` directly in a new branch — ESLint TEN-15 will reject it.

### `defineEventContract` shape

Origin: `packages/events/src/contracts/tenancy.ts` (existing `TenantArchivedV1`, `TenantProvisionedV1`, etc.)

```typescript
export const TenantSuspendedV1Payload = z.object({
  tenantId: TenantId,
  requestedBy: z.string().min(1),
  suspendedAt: z.coerce.date(),
});
export type TenantSuspendedV1Payload = z.infer<typeof TenantSuspendedV1Payload>;

export const TenantSuspendedV1 = defineEventContract({
  type: 'tenancy.tenant_suspended.v1',
  payload: TenantSuspendedV1Payload,
});
```

Naming convention strict: `<context>.<noun>_<verb>.v<n>`. Both payload schema and contract must be re-exported from `packages/events/src/index.ts`.

### Preflight assertion shape

Origin: `packages/db/src/preflight.ts` (existing `assertNoRlsBypass`, `assertTenantLockInstalled`, `assertSetConfigRevoked`)

```typescript
export class BaCredentialAccessNotRevokedError extends Error {
  constructor(public readonly grants: { table: string; priv: string }[]) {
    super(
      `TEN-07: resto_app retains the following privileges on BA credential tables: ` +
        grants.map((g) => `${g.priv} ${g.table}`).join(', ') +
        `. Re-run pnpm db:migrate (migration 0027).`,
    );
    this.name = 'BaCredentialAccessNotRevokedError';
  }
}

export const assertNoBaCredentialAccess = async (
  url: string,
): Promise<void> => {
  const client = postgres(url, {
    max: 1,
    prepare: false,
    onnotice: () => undefined,
  });
  try {
    // ... has_table_privilege checks ...
    logger.info({ checks: 12 }, 'Database preflight passed: …');
  } finally {
    await client.end({ timeout: 5 });
  }
};
```

Convention: short-lived dedicated connection (`max: 1`), named error class with `this.name`, info-log on success, throws custom error on failure. Wired into `apps/api/src/main.ts` after `assertSetConfigRevoked`.

### Cached stop-promise idiom

Origin: NEW for TEN-16 in `packages/events/src/outbox/dispatcher.ts:118-141` (no in-tree analog; documented in `packages/events/CLAUDE.md`)

```typescript
async stop(): Promise<void> {
  if (!this.#running) return;
  this.#stopped = true;
  this.#stopPromise ??= new Promise<void>((resolve) => {
    this.#stopResolver = resolve;
  });
  return this.#stopPromise;
}
// in #runLoop after the while exits:
this.#running = false;
const resolver = this.#stopResolver;
this.#stopResolver = null;
resolver?.();
```

Capture resolver into a local before nullifying `this.#stopResolver` so concurrent stop callers don't race on the field.

### `@Cron` service shape (NEW pattern in this codebase)

Origin: NEW for TEN-05/06/13 — no `@Cron` analog in tree. Use this as the project's first instance.

```typescript
@Injectable()
export class TenantErasureSchedulerService {
  private readonly logger = new Logger(TenantErasureSchedulerService.name);
  private readonly tracer = trace.getTracer('resto.api.erasure-scheduler');

  constructor(
    @Inject(OffboardTenantService)
    private readonly offboard: OffboardTenantService,
  ) {}

  @Cron('0 2 * * *', { name: 'tenant-erasure', timeZone: 'UTC' }) // D-11, Pitfall 7
  async run(): Promise<void> {
    const scheduled = await this.offboard.listScheduled();
    let ok = 0,
      failed = 0;
    for (const t of scheduled) {
      try {
        await this.offboard.executeErasure({ tenantId: t.id });
        ok += 1;
      } catch (err) {
        failed += 1;
        const span = this.tracer.startSpan('erasure.tenant', {
          attributes: { 'tenant.id': t.id },
        });
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        span.end();
        this.logger.warn(
          { tenantId: t.id, err },
          'Erasure failed; will retry next run',
        );
      }
    }
    this.logger.log(
      { ok, failed, total: scheduled.length },
      'Erasure cron complete',
    );
  }
}
```

Invariants: explicit `timeZone: 'UTC'` (Pitfall 7), sequential loop (NOT `Promise.all` — Pitfall 1 from research's anti-patterns), per-iteration try/catch, OTel error span on failure, aggregate result log line at end.

### Test-stack pattern (TEN-08, TEN-07, integration tests)

Origin: `apps/api/test/e2e/with-real-stack.setup.ts` + `packages/db/test/setup.ts:startPostgres()`

- Use `with-real-stack.setup.ts` as-is for HTTP-level fixtures (it starts Postgres + NATS testcontainers and a full NestJS app)
- Use `startPostgres()` + `packages/db/test/integration/tenant-isolation.spec.ts` shape for DB-level fixtures
- Gate with `isDockerAvailable()` for local skipping; CI must have Docker

---

## Files With No Analog (planner must invent)

None. Every requirement maps to an existing pattern. The one "new pattern in tree" is the `@Cron` service shape — but `@nestjs/schedule` itself is a widely-documented canonical NestJS API, so the planner has external precedent. The example in `§Shared @Cron service shape` is load-bearing.

---

## Metadata

**Analog search scope:**

- `apps/api/src/contexts/{tenancy,identity,catalog,audit}/**`
- `apps/api/src/shared/**`
- `apps/api/src/infrastructure/**`
- `apps/api/test/e2e/**`
- `packages/db/src/**`
- `packages/db/test/integration/**`
- `packages/events/src/**`
- `packages/events/test/integration/**`
- `packages/config-eslint/**`
- `infra/docker/**`

**Files scanned:** ~40 (all already itemized in `01-RESEARCH.md` §Sources Primary)
**Re-derived from research, not re-discovered:** 100% of analog assignments are taken directly from `01-RESEARCH.md` §Discovered Patterns and §File-level refs in `01-CONTEXT.md` `<canonical_refs>`.

## PATTERN MAPPING COMPLETE
