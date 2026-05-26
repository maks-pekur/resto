---
phase: 01
phase_name: 'tenancy-hardening'
project: 'RestOS'
generated: '2026-05-27'
counts:
  decisions: 14
  lessons: 9
  patterns: 18
  surprises: 8
missing_artifacts:
  - '01-VERIFICATION.md'
  - '01-UAT.md'
---

# Phase 01 Learnings: Tenancy Hardening

Phase 01 shipped all 18 TEN-\* requirements across 6 plans / 3 waves / 10 merged PRs (incl. 3 follow-up fixes for pre-existing e2e regressions surfaced after Wave 2). One requirement deferred to AUTH-09 in Phase 03 (BA 1.4.22 hook surface gap).

---

## Decisions

### TEN-18 verified, not re-implemented

The `better-auth =1.4.22` exact pin was already shipped in commit `19a9da2` before Phase 01 started. Plan 01-01 only verifies the pin survives; it does not re-pin.

**Rationale:** Avoid double-work and stale "this PR enforces X" commits when X is already enforced. The verification path becomes a regression-guard for the next time someone tries to loosen the spec to `~1.4.22`.
**Source:** 01-01-PLAN.md `must_haves.truths` (D-03), 01-01-SUMMARY.md

### Test compose stack is parallel-safe with dev stack

Ports 55432/54222 (test) chosen instead of 5432/4222 (dev); both bound to `127.0.0.1` only. Container names prefixed `resto-test-`.

**Rationale:** Engineers can run integration specs locally while the dev stack is up; mitigates T-02-03 (external port exposure during testing).
**Source:** 01-02-SUMMARY.md, `infra/docker/docker-compose.test.yml`

### OQ-1 — `TenantSuspendedError` maps to 403 (not 401 or 410)

The tenant exists, the caller is authenticated, the resource is intentionally unavailable. RFC 7231 semantics for 403 fit; 401 implies auth failure (it isn't), 410 implies permanently gone (it isn't — suspension is reversible).

**Rationale:** Picking the closest HTTP semantic prevents downstream clients from building wrong recovery affordances (e.g. retry-after-login on a 401 they shouldn't).
**Source:** 01-03-SUMMARY.md, 01-03-PLAN.md OQ-1

### OQ-2 — Narrow `GRANT DELETE` on `inbox_processed` only

Not granted on `inbox_events`. The retention sweep targets the processed table; `inbox_events` stays append-only with TTL cleanup at the broker tier.

**Rationale:** Smallest privilege surface. The domain-wide "no hard deletes" invariant survives — only one table, one role, one job.
**Source:** 01-03-SUMMARY.md, 01-03-PLAN.md OQ-2

### OQ-3 — Internal `/resume` route is NOT behind `@RequireActiveTenant()`

Operators must be able to revive suspended tenants from the HTTP surface; if `/resume` were itself blocked by the suspension guard, suspension would be irreversible without DB access.

**Rationale:** Recovery-path must not be locked behind the very state it recovers from.
**Source:** 01-03-SUMMARY.md, 01-03-PLAN.md OQ-3

### D-10 — `buildEnvelope` falls back to `randomUUID()` + WARN log when ALS context is empty

Rather than throwing on missing `correlationId`, log a WARN and synthesize one.

**Rationale:** The outbox dispatcher publishes events during application boot — BEFORE any HTTP middleware runs — so ALS is intentionally unbound. Throwing would crash boot; the WARN gives operators a signal without breaking the system.
**Source:** 01-03-SUMMARY.md (D-10), `packages/events/src/build-envelope.ts`

### D-11 — Cron services iterate sequentially with per-iteration try/catch + OTel error span

`TenantErasureSchedulerService` and `InboxRetentionService` both iterate `for (const t of scheduled) { try { ... } catch { /* OTel span + WARN */ } }`.

**Rationale:** One tenant's failure must not block the rest. Parallel iteration would create resource pressure and complicate per-tenant audit. Sequential + isolated catches is the simpler correctness model.
**Source:** 01-03-SUMMARY.md (D-11), `apps/api/src/infrastructure/tenant-erasure-scheduler.service.ts`

### TEN-14 deferred — 8 literal sites tagged with `eslint-disable -- TEN-14 PR-5` markers

Plan 01-04 introduced the TEN-15 ESLint ban on `correlationId: randomUUID()` but did NOT migrate the 8 pre-existing literal sites to `buildEnvelope`. They were tagged with disable markers and migration deferred to plans 01-05 (3 sites in `identity-core.module.ts`) and 01-06 (5 sites in `tenant-drizzle.repository.ts`).

**Rationale:** Preserves the per-PR atomic-commit model (D-04 6-PR sequence). Adding 8 file-edits to PR 4 would have mixed "introduce rule" with "apply rule" into a single PR.
**Source:** 01-04-SUMMARY.md, 01-04-PLAN.md TEN-14 deferral note

### `outbox.claim_failures` carries `'tenant.id': 'platform'` sentinel

`onError(err)` in the dispatcher has no envelope in scope — no tenant available — so the literal `'platform'` is used.

**Rationale:** Uniform OTel attribute shape across all 3 outbox metrics (`delivered`, `lag`, `claim_failures`) makes dashboards simpler. Sentinel value over null because OTel SDKs treat null inconsistently.
**Source:** 01-05-SUMMARY.md, `apps/api/src/infrastructure/outbox-dispatcher.service.ts`

### role-change audit row BLOCKED — deferred to AUTH-09 (Phase 03)

Better Auth 1.4.22 has no `databaseHooks.member.update.after` surface. Cannot fire `identity.role_changed.v1` audit without a hook.

**Rationale:** Persona-skeptic premature-done risk. Building a brittle workaround now would be replaced when BA exposes the hook. Mark BLOCKED, document the AUTH-09 ownership, move on.
**Source:** 01-05-SUMMARY.md, `audit-gap.md`

### Fixture 4 RLS spec reuses production RLS helpers, not parallel policy

`test_rls_fence` table's RLS policy invokes `is_system_session()` + `current_tenant_id()` — the same helpers a real tenant-scoped table would use.

**Rationale:** Guarantees the spec catches the same class of bug a production table would. A parallel policy expression could pass while real tables fail.
**Source:** 01-06-SUMMARY.md, `packages/db/test/integration/raw-tx-rls-fence.spec.ts`

### Fixture 3 INSERTs use `current_setting('app.current_tenant')::uuid`, not captured `tenantId`

Concurrent-write-race spec writes the tenant column from the GUC, not from JS variable scope.

**Rationale:** Proves the assertion fails on GUC drift — the exact bug class the spec is named for. Using the captured variable would pass even if RLS / GUC were broken.
**Source:** 01-06-SUMMARY.md, `packages/db/test/integration/concurrent-write-race.spec.ts`

### Cached-promise convergence tested by reference identity, not private-field spy

Plan 01-01's task 3 originally specified spying on `#stopResolver` to count invocations. The implementation could not access true ECMAScript private fields via `(x as any)['#field']`, so the test was rewritten to assert `p1 === p2 === p3` for 3 concurrent `stop()` callers.

**Rationale:** Identity equality is a STRONGER guarantee than counting resolver calls — it proves the cached promise IS the same reference, not just that something happened once.
**Source:** 01-01-SUMMARY.md deviation, `packages/events/test/integration/dispatcher-stop-idempotent.spec.ts`

### Defense-in-depth GRANT — issued from migration AND roles.sql

After RC-1 debug surfaced that migration 0028 silently skipped its GRANT when role didn't exist at migrate-time, the GRANT was added to `roles.sql` as well. Plus a boot-time `assertInboxProcessedDeletable` preflight.

**Rationale:** Order-independent end state. Whichever step runs second wins; both eventually grant. The preflight catches any future regression at startup before the silent-failure mode can ship.
**Source:** PR #191, `packages/db/sql/roles.sql`, `packages/db/src/preflight.ts`

---

## Lessons

### ECMAScript true private fields are inaccessible via `(x as any)['#field']`

TypeScript's `private` keyword can be bypassed via `as any`, but native `#`-private fields cannot — `Object.getOwnPropertyDescriptor` doesn't surface them, brand-checking doesn't help. Spies that depend on reaching `#field` simply do not work.

**Context:** Plan 01-01 task 3. The original test approach (count resolver invocations via a spy) was unimplementable; reframed to a stronger invariant (promise reference identity).
**Source:** 01-01-SUMMARY.md deviation

### Root-level vitest doesn't exist in this workspace

`packages/events` is the only package where both `nats` and `postgres` are hoisted. To run a cross-package smoke spec, it has to run via the events package's vitest with a custom config that aliases the modules.

**Context:** Plan 01-02 needed to register a smoke spec runnable from the repo root; the natural `pnpm test test/...` approach failed because the root has no vitest binary.
**Source:** 01-02-SUMMARY.md deviation

### ESLint flat-config does NOT merge entries within a rule across blocks

This is the single biggest landmine of Phase 01. Placing `no-restricted-syntax` selectors only in `base.mjs` is NOT enough — every consumer config that redefines the rule (apps/api, packages/db, packages/events, file-pattern overrides) silently drops the selectors. ESLint replaces, not merges. `eslint --print-config <file>` is the verification tool.

**Context:** Plan 01-04 TEN-15 implementation initially passed local lint but the rule fired in zero files in `identity-core.module.ts`. Live lint test caught it. Fix: extract a named export and spread it into every block.
**Source:** 01-04-SUMMARY.md key-decision, 01-04-PLAN.md deviation

### Migration order is not reliable — GRANTs must be order-independent

Migration 0028 wrapped `GRANT DELETE` in `IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'resto_app')`. In testcontainers (migrate-then-create-role) the guard fired → GRANT silently skipped → `InboxRetentionService` silently failed in production-runbook order too. The error was swallowed by the cron's try/catch and the cron looked healthy while `inbox_processed` grew unbounded.

**Context:** Surfaced by Phase 01 closure debug session. Fixed in PR #191 with defense-in-depth (GRANT in both migration and roles.sql) + preflight assertion.
**Source:** `.planning/debug/wave-2-e2e-regressions.md` RC-1, PR #191

### Filter / DTO contract drift goes undetected until the first asserting test

`ProblemDetailsFilter` extracted `code` from `HttpException.getResponse()` body — but only to build the `type` URI. The wire `ProblemDetails` interface and DTO had no `code` field; the filter dropped it. Controllers had been passing `{ code, message }` for weeks but `body.code` was always `undefined` over the wire. The first spec that asserted `body.code === '...'` (tenancy-suspend, in Phase 01 plan 01-03) caught it.

**Context:** Surfaced by closure debug session RC-2. Fixed in PR #192 by adding `code` to the interface + DTO + filter assignment.
**Source:** `.planning/debug/wave-2-e2e-regressions.md` RC-2, PR #192

### Pre-existing test failures can hide for weeks behind unrelated debug noise

`identity-audit.e2e.spec.ts`'s sanity probe `GET /v1/tenants/me` with only a `cookie` header has been failing since 2026-05-13 (RES-191 added `@RequiresTenantContext()` to the route). The spec was last touched 2026-05-09. Nobody noticed for ~2 weeks because no e2e CI gate runs the spec; the failure only surfaced when plan 01-05's subagent reproduced the full e2e suite to sanity-check Wave 2 baseline.

**Context:** RC-3 in closure debug session. PR #193 added `'x-tenant-id': tenant.id` to all 5 sanity probes in the spec. Underlying sign-out/password-reset audit pipeline turned out to work correctly — no 4th defect.
**Source:** `.planning/debug/wave-2-e2e-regressions.md` RC-3, PR #193

### `cwd`-relative paths break in vitest AND in bundled production images

Plan 01-04's `assertWithoutTenantCallsiteRegistered` was specified `process.cwd()`-relative. That works only when running from the repo root — vitest's cwd is `packages/db`, k8s pod cwd is `/app`. The fix is walk-up-from-import-meta-url to `pnpm-workspace.yaml`.

**Context:** Discovered during plan 01-04 implementation; documented as deviation. The walk-up pattern is now reusable for any other path-resolving preflight.
**Source:** 01-04-SUMMARY.md deviation

### `packages/config-eslint` had no test infrastructure

Plan 01-04 needed to assert that the new TEN-15 ESLint rule actually fires (and the new "legal" cases don't false-positive). The package didn't have vitest wired. Added `vitest.config.ts`, `project.json`, scripts entry, devDependencies, plus 4 fixture files exercising both forbidden and legal shapes.

**Context:** Future cross-package ESLint rules can reuse this harness — pattern is now established.
**Source:** 01-04-SUMMARY.md key-decision

### `pnpm install --frozen-lockfile` silently passed locally but failed in CI

After commit `19a9da2` pinned `better-auth` to `=1.4.22` exact in `package.json` but didn't regenerate the lockfile, every PR built on top failed Commitlint + Install dependencies in CI. The local dev install (without `--frozen-lockfile`) ignored the mismatch silently. The bug shipped 2 days before being noticed — every Phase 01 PR after the first hit it. Fixed by chore PR #185 to sync lockfile.

**Context:** Latent tech debt from a commit that "shipped TEN-18" without verifying the full CI gate. Reminder that lockfile regeneration is part of pinning, not separate from it.
**Source:** PR #185, conversation log

---

## Patterns

### Cached stop-promise idiom for idempotent async lifecycle teardown

`this.#stopPromise ??= new Promise((resolve) => { this.#stopResolver = resolve; })` — first call creates the promise, every subsequent call returns the same reference. The runLoop tail nullifies the resolver after calling it; subsequent calls hit the already-resolved promise and return immediately.

**When to use:** Any service with a `stop()` / `close()` / `shutdown()` method that might be called concurrently (k8s lifecycle hooks, test teardown, manual ops triggers). Prevents the "second caller hangs forever waiting on a nulled resolver" race.
**Source:** 01-01-SUMMARY.md, `packages/events/src/outbox/dispatcher.ts`

### Envelope-at-boundary: Zod parse before any I/O

Every adapter that serializes a domain event into infrastructure (DB insert, NATS publish, HTTP body) MUST call `EventEnvelope.parse(input)` as its first statement.

**When to use:** Application-to-infrastructure boundaries where shape drift is otherwise invisible until the consumer crashes. Fail fast at the producer, with a stack trace pointing at the offending site.
**Source:** 01-01-SUMMARY.md, `packages/events/src/outbox/repository.ts`

### Ephemeral test compose stack with `pnpm test:stack:{up,smoke,down}`

Postgres+NATS containers spun up via `infra/docker/docker-compose.test.yml` (separate ports from dev), invoked through a `scripts/test-stack.mjs` wrapper. `pnpm test:stack:smoke` exercises a full round-trip (SELECT + NATS pub/sub) before any real spec runs.

**When to use:** Local sanity check before running expensive e2e suites. The lifecycle is invoke-once, not per-spec — too slow for per-spec. The canonical testcontainers entry points (`startRealStack`, `startPostgres`) remain the per-spec harness.
**Source:** 01-02-SUMMARY.md

### Docker-availability gate via `describe.skipIf(!isDockerAvailable())`

Specs that need a live stack check `isDockerAvailable()` at the describe level. Tests skip cleanly when Docker isn't running (CI without daemon, dev without Colima).

**When to use:** Every spec that boots a container; never let an integration spec fail noisily on missing infra.
**Source:** 01-02-SUMMARY.md

### Suspend/Resume aggregate API with typed events + guard errors

`Tenant.suspend(requestedBy, now?)` and `Tenant.resume(now?)` emit `TenantSuspendedDomainEvent` / `TenantResumedDomainEvent` on success, throw `TenantAlreadySuspendedError` / `TenantNotSuspendedError` on illegal transitions (idempotency enforced at the aggregate, not at the HTTP layer).

**When to use:** Any aggregate state-machine with idempotent operator commands. HTTP layer maps the guard errors to 409, success path is one path.
**Source:** 01-03-SUMMARY.md, `apps/api/src/contexts/tenancy/domain/tenant.aggregate.ts`

### `@RequireActiveTenant()` decorator with opt-in guard registration

Guard returns 403 `tenancy.tenant_suspended` when the request's tenant is suspended. Crucially: when the ALS tenant context is unbound (e.g. a route that doesn't need a tenant), the guard fast-paths to `true` — 404-on-missing-tenant stays the responsibility of `requireTenantOr404`.

**When to use:** Public-facing routes that should disappear when the tenant is suspended (menu, ordering, qr-menu). Internal operator routes (`/resume`, audit lookups) intentionally omit the decorator.
**Source:** 01-03-SUMMARY.md, `apps/api/src/shared/auth/require-active-tenant.guard.ts`

### Single `ScheduleModule.forRoot()` in `BackgroundJobsModule`

NestJS's `ScheduleModule.forRoot()` must appear exactly once. New cron services are added as `providers` to the existing `BackgroundJobsModule`, never as a new module that re-imports `ScheduleModule.forRoot()`.

**When to use:** Every new cron — `@Cron('...')` service. The boilerplate goes in `BackgroundJobsModule.providers`, nothing else.
**Source:** 01-03-SUMMARY.md, `apps/api/src/infrastructure/background-jobs.module.ts`

### Boot preflight ordering: 6 cumulative invariants before `app.listen()`

`rls-bypass` → `tenant-lock` → `set-config-revoked` → `ba-creds` → `inbox-processed-deletable` → `without-tenant-allowlist` → `listen`. Each preflight throws a typed error class; PASS logs `logger.info` with a measurable signal (`{ checks: N }`, `{ allowed: N }`).

**When to use:** Every new system-wide invariant. Insert in the order: DB-shape checks first (RLS, GUC, GRANTs), FS checks last (allowlist), `app.listen()` strictly last. Future preflights slot between `without-tenant-allowlist` and `listen` unless they depend on a later step's DB state.
**Source:** 01-04-SUMMARY.md + PR #191 (inbox-processed-deletable added later)

### ESLint flat-config named selector arrays — `FORBIDDEN_CORRELATION_ID_LITERALS` export + spread

Cross-package ESLint rules MUST be exported as named arrays from `@resto/config-eslint` and spread into every consumer's `no-restricted-syntax` block (including file-pattern overrides). Flat-config does not merge entries within a rule across blocks.

**When to use:** Every new workspace-wide AST rule. Verify with `eslint --print-config <file>` before assuming the rule actually applies; live-lint a known-bad file to confirm it fires.
**Source:** 01-04-SUMMARY.md, `packages/config-eslint/base.mjs`

### `packages/config-eslint` vitest fixtures verify rules via ESLint JS API

Rule-correctness is asserted by running ESLint programmatically against fixture files (`forbidden-*.ts` should fail, `legal-*.ts` should pass) inside a vitest suite. Pattern reusable for any future cross-package ESLint rule.

**When to use:** Whenever you add a new selector to the shared config, write a paired fixture pair (one violating, one not) and an ESLint-API assertion.
**Source:** 01-04-SUMMARY.md, `packages/config-eslint/test/no-restricted-syntax.spec.ts`

### Producer-side envelope construction via `buildEnvelope(Contract, payload, { tenantId, occurredAt })`

The single sanctioned way to build an event envelope. Eliminates literal `correlationId`, threads ALS correlationId automatically, falls back to `randomUUID + WARN` at boot. The TEN-15 ESLint rule blocks any literal that bypasses it.

**When to use:** Every domain-event-to-envelope translator in the codebase. Never write `correlationId: randomUUID()` directly.
**Source:** 01-05-SUMMARY.md, `packages/events/src/build-envelope.ts`

### Per-tenant OTel attribute = `tenant.id` with `'platform'` sentinel for null

All cross-cutting OTel metrics carry a `tenant.id` attribute. Tenant-scoped events use the real tenant ID; platform-level events (system jobs, dispatcher claim failures with no envelope) use the literal `'platform'`. Never null.

**When to use:** Every Counter / Histogram emitted from code that may run under any tenant or no tenant. Uniform attribute shape simplifies Grafana queries.
**Source:** 01-05-SUMMARY.md, `apps/api/src/infrastructure/outbox-dispatcher.service.ts`

### Boot preflight assertion shape: `assert<Invariant>(db)` throws typed error class, logs PASS signal

Every preflight is a function that opens a single-conn `postgres` client, queries `pg_*` / `information_schema` / FS, throws a typed `<Invariant>Error` class on failure, calls `client.end({ timeout: 5 })` in `finally`, and emits `logger.info({ ... }, 'Database preflight passed: ...')` on success.

**When to use:** Every new boot invariant. Don't reuse the app's connection pool — single-conn keeps the cost predictable and the failure surface narrow.
**Source:** 01-04 + PR #191, `packages/db/src/preflight.ts`

### Workspace-root path resolution by walk-up to `pnpm-workspace.yaml`

`findWorkspaceRoot(import.meta.url)` walks parent directories until `pnpm-workspace.yaml` is found. Works in vitest (cwd = package root), in bundled images (cwd = `/app`), and from any nested helper script.

**When to use:** Any code that needs to resolve a file path relative to the monorepo root, not relative to `process.cwd()`.
**Source:** 01-04-SUMMARY.md, `packages/db/src/preflight.ts`

### Defense-in-depth GRANT (migration + roles.sql + preflight)

Privileges that the runtime app needs are issued from BOTH the migration that introduces them AND `sql/roles.sql` (which runs at role-provisioning time). A boot-time preflight (`assertInboxProcessedDeletable`) acts as the silent-witness — if both ordering paths somehow break, the app refuses to start instead of silently no-op-ing.

**When to use:** Any narrow GRANT outside the default `SELECT, INSERT, UPDATE` shape. Don't trust migration-vs-role order; idempotent issuance from two places + a witness assertion is the robust pattern.
**Source:** PR #191, `packages/db/sql/roles.sql`, `packages/db/src/preflight.ts`

### Red-then-green discipline for RLS specs

For Fixture 4 (raw `tx.select` RLS fence), temporarily dropping `POLICY test_rls_fence_iso` caused the predicate-less SELECT to return all 4 rows; the spec failed at `expect(rowsA.length).toBe(2)`. Restored, re-ran, PASS. Documented in the spec's top-of-file comment.

**When to use:** Any spec whose value rests on a single Postgres policy / RLS guard. Verify the policy is what catches the bug, not the GUC, not the application's filter. Document the red-step so future maintainers know the spec actually has teeth.
**Source:** 01-06-SUMMARY.md, `packages/db/test/integration/raw-tx-rls-fence.spec.ts`

### Cross-tenant fixture matrix (4 e2e + 1 inventory)

The TEN-08 phase gate is satisfied by 4 separate specs each probing a distinct isolation failure mode: ALS leak (Fixture 1), NATS subscriber tenantId mix (Fixture 2), concurrent withTenant write race (Fixture 3), raw `tx.select` RLS fence (Fixture 4) — plus an inventory spec mapping every fixture to the invariant it proves.

**When to use:** Any future cross-cutting isolation contract (cross-brand within a tenant, cross-environment in a single deploy). Inventory spec as the single source of truth for "what is being asserted, where".
**Source:** 01-06-SUMMARY.md, `apps/api/test/e2e/cross-tenant-isolation.e2e.spec.ts`

### Wave-based parallel execution with sequential dependency-aware ordering

Phase 01 executed as 3 waves: Wave 1 (01-01 + 01-02 in parallel — disjoint files), Wave 2 (01-03 → 01-04 sequential — 01-04 depends on 01-03), Wave 3 (01-05 + 01-06 in parallel — disjoint files). Each wave merged to main via per-plan PRs before the next wave starts.

**When to use:** Any phase with multiple plans. Build the dependency DAG from `depends_on` frontmatter; group leaves into waves; within a wave parallelize anything truly disjoint, sequence anything with shared file scope.
**Source:** Conversation log, plan frontmatter `wave:` + `depends_on:` fields

---

## Surprises

### Plan 01-03 duration: 167 minutes — 10x larger than peers

01-01 was ~6 min, 01-02 ~5 min, 01-04 ~19 min. Plan 01-03 was 167 minutes because it aggregated domain layer + HTTP routes + outbox contracts + cron module + migration + audit-kind extensions + OpenAPI regen + 9 atomic commits. The plan duration metric is heavy-tailed: most plans are quick, one is huge.

**Impact:** Future plan-sizing should treat "domain aggregate change + new HTTP routes + outbox emission + new background module" as a yellow flag — consider splitting into 2 plans if the multi-system reach is similar.
**Source:** 01-03-SUMMARY.md `duration: 167min` vs other SUMMARYs

### ESLint flat-config silently dropped TEN-15 selectors in consumer overrides

Initial TEN-15 implementation looked correct: rule defined in `base.mjs`, every consumer config extended `base`. Local lint on `identity-core.module.ts` should have shown 3 errors before disable markers were added. It showed 0. Verified via `eslint --print-config` that the rule's selectors were empty in the merged config — consumer's own `no-restricted-syntax` block REPLACED the base's, not merged. The fix (extract named export + spread into every block) is now a workspace-wide pattern.

**Impact:** Every cross-package ESLint rule now requires the spread pattern. This is the single most reusable insight from Phase 01 for future workspace-wide AST rules.
**Source:** 01-04-SUMMARY.md key-decision + deviation

### Migration 0028 silently no-op in two of the most common ordering paths

The IF EXISTS guard was meant as defense — "GRANT if role exists, else skip". In practice "skip" meant "the GRANT never happens" because role provisioning is the SECOND step in both testcontainers and production runbook. The cron in production was a silent no-op the entire time Phase 01 was on main.

**Impact:** Defense via guard-then-skip without a re-grant mechanism is worse than failing loudly. The fix added the GRANT to roles.sql (runs after role creation) AND added a preflight (refuses to boot if the GRANT didn't land). Three locations issue or witness the privilege.
**Source:** Phase 01 closure debug session RC-1

### `ProblemDetailsFilter` discarded the `code` field for ~weeks before a spec caught it

Every controller in the codebase had been passing `throw new ForbiddenException({ code: 'x', message: 'y' })`-style payloads for weeks. The filter consumed `code` only to construct the `type` URI suffix and never wrote it as a body field. The first e2e spec to assert `body.code` (tenancy-suspend in Phase 01 plan 01-03) caught it.

**Impact:** Wire-contract bugs are invisible until something asserts on them. The next defensive move would be a schema-level contract test that runs every problem-details response through `ProblemDetailsSchema.parse` and asserts every controller-set `code` survives.
**Source:** Phase 01 closure debug session RC-2

### RC-3 was a 2-week-old bug surfaced by an unrelated Wave 2 debug

`identity-audit.e2e.spec.ts` sanity probe `GET /v1/tenants/me` with cookie-only has been failing since 2026-05-13 (RES-191 added `@RequiresTenantContext()`). It was caught now because plan 01-05's subagent ran all 3 failing specs together as a sanity-check before its own commits. Without that batched-reproduction step, the broken spec could have lasted another month.

**Impact:** When investigating Wave-N failures, reproduce the full failing set — the bisect bounds will reveal what's recent (Wave-N caused) vs latent (older, surfaced now). Don't assume the most recent change is the cause.
**Source:** Phase 01 closure debug session RC-3

### Phase 01 shipped in ~1 calendar day, not the planned 9-12 working days

Plan 01-01 declared a 9-12 working-day envelope for a solo founder (D-02). Actual end-to-end (planning + execution + merge + 3 follow-up fixes): one extended session on 2026-05-26 → 2026-05-27 UTC. 10 PRs merged. Solo founder + LLM subagent execution dramatically compressed the timeline.

**Impact:** Phase sizing in ROADMAP.md is the OLD model. The honest envelope for an LLM-assisted solo founder is probably 0.5–2 days for a phase of this complexity, not 9–12. Subsequent phase estimates should be revisited.
**Source:** 01-01-PLAN.md `must_haves.truths` (D-02) vs commit timestamps

### Pre-existing CI breakage from `19a9da2` shipped invisibly for 2 days

The commit that pinned `better-auth =1.4.22` exact ("TEN-18 done") did NOT regenerate the lockfile. Every CI run after that date failed `pnpm install --frozen-lockfile`. The Phase 01 closure run was the first time anyone looked at CI output. Fixed via chore PR #185 mid-Phase-01.

**Impact:** "Done" claims that don't include `pnpm install` + lockfile commit have no CI guarantee. Add lockfile sync to the dep-bump checklist.
**Source:** PR #185, conversation log

### Plan 01-04 found a real bug in the flat-config rule it was implementing

The flat-config rule-merging hazard was discovered WHILE implementing TEN-15. The naive implementation looked correct against base.mjs but silently failed in apps/api. Treating "I implemented the rule, eslint shows no errors" as success would have shipped a no-op rule. Live-linting a known-bad file before claiming done caught it. This is the canonical example of why "evidence before assertions" matters.

**Impact:** Every new lint rule needs a positive-control test ("file that SHOULD trigger the rule actually triggers it") AND a negative-control test ("file that should NOT trigger doesn't"). Both, separately, in CI.
**Source:** 01-04-SUMMARY.md key-decision + deviation
