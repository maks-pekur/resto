---
phase: 10-admin-order-intake
plan: 04
subsystem: api

tags: [ordering, drizzle, postgres, concurrency, gdpr-consent, e2e-testing]

# Dependency graph
requires:
  - phase: 10-admin-order-intake plan 01
    provides: order_daily_sequences per-location daily counter table (composite PK, dual FK, RLS) and orders' 15 new intake columns including nullable short_number
  - phase: 10-admin-order-intake plan 03
    provides: Order aggregate's OrderSnapshot/CreateOrderInput already carrying shortNumber/channel/marketingConsent fields, and order-drizzle.repository.ts persisting them
provides:
  - ORDER_SEQUENCE_PORT + OrderSequenceDrizzleRepository -- single-statement atomic INSERT ... ON CONFLICT DO UPDATE ... RETURNING counter increment, proven duplicate-free/gap-free under 25-way concurrency read back from Postgres
  - CreateOrderService fills shortNumber (post idempotency-check, never burned on replay), channel, and marketingConsent + server-set marketingConsentAt on every new order
  - Business-date resolution via Intl.DateTimeFormat with explicit UTC fallback for locations with no timezone set
  - Migration 0075 tightens orders.short_number to NOT NULL; OrderSnapshot/CreateOrderInput/OrderResponseSchema all non-nullable end to end
  - CreateOrderInputSchema.channel (enum, default 'site') and .marketingConsent (boolean, default false); OrderResponseSchema gains shortNumber + channel
affects:
  [
    10-05 (admin order feed/detail UI will render shortNumber as №{n} and filter by channel),
    12 (CRM) — marketing_consent + marketing_consent_at is the lawful-basis record any future consent-driven mailing list must read,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Atomic per-key counter via INSERT ... ON CONFLICT (composite PK) DO UPDATE SET counter = counter + 1 RETURNING counter, run under db.withTenant with tenantId part of both the insert values and the conflict target (ADR-0020 I-1 escape hatch, same family as catalog-drizzle.repository.ts#listStopListAggregateAcrossLocations)'
    - 'Idempotency-key lookup moved ahead of any counter-consuming work in the service, so a retried request returns the existing order without wasting a sequence value'
    - 'Nullable-timezone business-date resolution: Intl.DateTimeFormat({ timeZone }).formatToParts(now), explicit UTC fallback, never the ambient server-local zone'

key-files:
  created:
    - apps/api/src/contexts/ordering/infrastructure/order-sequence-drizzle.repository.ts
    - packages/db/migrations/0075_orders_short_number_not_null.sql
    - apps/api/test/e2e/order-short-number.e2e.spec.ts
  modified:
    - apps/api/src/contexts/ordering/domain/ports.ts
    - apps/api/src/contexts/ordering/ordering.module.ts
    - apps/api/src/contexts/ordering/application/dto.ts
    - apps/api/src/contexts/ordering/application/create-order.service.ts
    - apps/api/src/contexts/ordering/domain/order.aggregate.ts
    - apps/api/src/contexts/ordering/infrastructure/order-drizzle.repository.ts
    - packages/db/src/schema/ordering.ts
    - packages/db/migrations/meta/_journal.json

key-decisions:
  - 'shortNumber is required (non-optional) on CreateOrderInput; unlike channel/marketingConsent it has no safe synthetic default -- the caller must resolve a real counter value before Order.create()'
  - 'No consent-copy/version field added -- flag + server-set timestamp only, matching the only precedent this repo has for consent storage (RESEARCH E.18); copy-versioning is an explicit founder-level open question, not a planner decision'
  - 'Idempotent replay short-circuits on findByIdempotencyKey before any pricing/counter work, so a retried checkout burns zero sequence values (T-10-04-06), proven by a before/after DB-read-back delta assertion, not inferred from row counts alone'
  - 'Pre-tightening SELECT count(*) FROM orders WHERE short_number IS NULL returned 0 on the shared dev database -- migration 0075 is a pure constraint tightening, no clear/backfill needed'

patterns-established:
  - 'order_daily_sequences is the template for any future per-tenant atomic daily counter: composite PK, ON CONFLICT DO UPDATE ... RETURNING, run under db.withTenant with the WHY-comment naming ADR-0020 I-1'

requirements-completed: [ORDINT-07, ORDINT-08]

# Metrics
duration: ~55min
completed: 2026-08-14
---

# Phase 10 Plan 04: Order Short Number, Channel & Marketing Consent Summary

**Atomic per-location daily order-number counter (`order_daily_sequences` + `OrderSequenceDrizzleRepository`) wired into `CreateOrderService`, proven duplicate-free/gap-free under 25 concurrent generations read back from Postgres; `orders.short_number` tightened to `NOT NULL` via migration 0075; channel and GDPR-lawful marketing consent (flag + server-set timestamp) now fill on every new order.**

## Performance

- **Duration:** ~55 min
- **Completed:** 2026-08-14
- **Tasks:** 3 completed
- **Files modified:** 24

## Accomplishments

- Added `OrderSequencePort`/`ORDER_SEQUENCE_PORT` and `OrderSequenceDrizzleRepository`: a single-statement `INSERT ... ON CONFLICT (tenant_id, location_id, business_date) DO UPDATE SET counter = counter + 1 RETURNING counter`, run under `db.withTenant` with a WHY-comment naming the ADR-0020 I-1 raw-`tx` escape hatch (`ScopedTx` cannot express `ON CONFLICT DO UPDATE ... RETURNING`). No `MAX(short_number) + 1` read-then-write race, no per-location Postgres sequences.
- `CreateOrderService` now resolves the order's business date via `Intl.DateTimeFormat({ timeZone }).formatToParts(now)`, falling back to `'UTC'` explicitly when `locations.timezone` is null (RESEARCH Open Question #1 / T-10-04-07), calls `nextShortNumber` **after** the idempotency-key short-circuit (T-10-04-06 — a retried checkout never burns a counter value), and threads `channel`/`marketingConsent` from the DTO into `Order.create()`.
- `CreateOrderInputSchema` gains `channel` (`z.enum(['site','qr-menu'])`, default `'site'`) and `marketingConsent` (`z.boolean()`, default `false`) — no consent-copy/version field, matching the only precedent this repo has for consent storage. `OrderResponseSchema` gains `shortNumber`/`channel` so the create response can render `№{n}` without a second fetch.
- Migration `0075_orders_short_number_not_null.sql` tightens `orders.short_number` to `NOT NULL`; the pre-tightening row count was 0 on the shared dev database, so this is a pure constraint tightening with no clear/backfill needed. `OrderSnapshot`/`CreateOrderInput`/`OrderResponseSchema`/`order-drizzle.repository.ts` all made non-nullable end to end.
- New `order-short-number.e2e.spec.ts` proves, against a real Postgres testcontainer: two locations under the same tenant both start at 1 on the same business date; the same location resets to 1 on a new business date; **25 concurrent `nextShortNumber` calls for the same `(tenant, location, date)` produce exactly `1..25` with no duplicates, and `order_daily_sequences.counter` reads back as `25` from the database**; a `locationId` from another tenant is rejected by the composite FK.
- Strengthened `create-order-idempotency.spec.ts` with a before/after `order_daily_sequences` counter-sum delta assertion proving a duplicate-idempotency-key retry consumes exactly one counter value across both calls, not two — direct database evidence for T-10-04-06, not an inference from row counts alone.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the order-sequence port and its atomic Drizzle implementation** - `0d5cbf8` (feat)
2. **Task 2: Fill short number, channel and marketing consent on the create-order path** - `4cc7dbd` (feat)
3. **Task 3: [BLOCKING] Tighten short_number to NOT NULL, sweep fixtures, and prove concurrency against Postgres** - `761749d` (test)
4. **Follow-up: strengthen idempotent-replay coverage with a DB-read-back counter delta** - `fa41fe8` (test)

## Files Created/Modified

- `apps/api/src/contexts/ordering/domain/ports.ts` - `OrderSequencePort`/`ORDER_SEQUENCE_PORT`
- `apps/api/src/contexts/ordering/infrastructure/order-sequence-drizzle.repository.ts` - atomic counter repository
- `apps/api/src/contexts/ordering/ordering.module.ts` - `ORDER_SEQUENCE_PORT` provider registration
- `apps/api/src/contexts/ordering/application/dto.ts` - `channel`/`marketingConsent` on `CreateOrderInputSchema`; `shortNumber`/`channel` on `OrderResponseSchema`
- `apps/api/src/contexts/ordering/application/create-order.service.ts` - idempotency short-circuit, business-date resolution, `nextShortNumber` wiring, `toOrderResponse` helper
- `apps/api/src/contexts/ordering/domain/order.aggregate.ts` - `shortNumber` tightened to required/non-nullable on `OrderSnapshot`/`CreateOrderInput`
- `apps/api/src/contexts/ordering/infrastructure/order-drizzle.repository.ts` - dropped the now-incorrect `?? null` fallback on `shortNumber` read-back
- `packages/db/src/schema/ordering.ts` - `shortNumber: integer('short_number').notNull()`
- `packages/db/migrations/0075_orders_short_number_not_null.sql` - the `NOT NULL` tightening migration
- `packages/db/migrations/meta/_journal.json` - journal entry idx 75 appended
- `apps/api/test/e2e/order-short-number.e2e.spec.ts` - new concurrency + reset + cross-tenant-FK e2e spec
- `apps/api/test/e2e/payment-lifecycle.e2e.spec.ts`, `apps/api/test/e2e/payments-upsert-partial-index.e2e.spec.ts`, `packages/db/test/integration/erase-includes-ordering.spec.ts`, `packages/db/test/integration/tenant-isolation.spec.ts` - fixture sweep, every `insert(schema.orders)` site now supplies a deterministic `shortNumber`
- `apps/api/test/integration/create-order-idempotency.spec.ts`, `apps/api/test/unit/create-order.service.spec.ts`, `apps/api/test/e2e/outbox-nats-decoupling.e2e.spec.ts` - ripple-effect call-site updates for the widened `CreateOrderService` constructor/`CreateOrderInput` type, plus the counter-delta strengthening
- `apps/api/src/contexts/ordering/domain/order.aggregate.spec.ts`, `apps/api/src/contexts/ordering/interfaces/http/orders.controller.spec.ts`, `apps/api/src/contexts/payments/application/{cancel-order,refund-order,create-checkout-payment,handle-stripe-event}.service.spec.ts` - ripple-effect fixture updates for the now-required, non-nullable `shortNumber`

## Decisions Made

- **`shortNumber` is required on `CreateOrderInput`, not optional-with-a-null-fallback.** Unlike `channel`/`marketingConsent`, there is no safe synthetic default for a per-location daily counter value — the caller (`CreateOrderService`) must resolve a real value via `ORDER_SEQUENCE_PORT.nextShortNumber()` before calling `Order.create()`.
- **No consent-copy/version field.** Flag + server-set timestamp only (`marketing_consent`/`marketing_consent_at`), matching the only precedent this repo has for consent storage (RESEARCH E.18 — no consent-versioning table/column exists anywhere else). Copy-versioning is flagged as a founder-level open question, not decided here.
- **Idempotent replay short-circuits before any pricing or counter work.** `findByIdempotencyKey` is checked at the very top of `execute()`, before the pricing snapshot load and before `nextShortNumber` — a retried checkout burns zero counter values, proven by a before/after DB-read-back delta on `order_daily_sequences`, not inferred from row-count assertions alone.
- **Pre-tightening `SELECT count(*) FROM orders WHERE short_number IS NULL` returned `0`** on the shared dev database at execution time — migration 0075 is a pure constraint tightening; no clear/backfill decision was needed (unlike the `0070` precedent it otherwise mirrors).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — bug] `resolveBusinessDate` initially queried via raw `tx` without a tenant filter**

- **Found during:** Task 2, self-review before typecheck
- **Issue:** First draft of the business-date lookup used `this.db.withTenant(async (tx) => tx.select()...)` with the raw `tx` handle and no explicit tenant predicate — a tenancy-enforcement gap (CLAUDE.md: every tenant-scoped query MUST go through `ScopedTx` AND RLS, RLS alone is not sufficient).
- **Fix:** Rewrote to use the `scoped` second callback argument (`ScopedTx.selectFrom`), which auto-applies `eq(table.tenantId, ...)`.
- **Files modified:** `apps/api/src/contexts/ordering/application/create-order.service.ts`
- **Verification:** Code review before the query ever ran against real data; `tsc --noEmit` clean.
- **Committed in:** `4cc7dbd` (Task 2)

**2. [Rule 3 — blocking] Ripple-effect breakage in files outside this plan's stated file list**

- **Found during:** Task 2 and Task 3, after widening `CreateOrderService`'s constructor (3→5 params) and `CreateOrderInput`'s required fields, then tightening `OrderSnapshot.shortNumber`/`CreateOrderInput.shortNumber` from `number | null` to `number`
- **Issue:** `pnpm --filter api exec tsc --noEmit -p tsconfig.json` surfaced compile errors in 3 test files calling `new CreateOrderService(repo, pricing, defaultLocation)` with the old 3-arg signature and object literals missing the now-required `channel`/`marketingConsent` fields (Task 2), then in 6 more spec files whose `OrderSnapshot` object literals hardcoded `shortNumber: null` (Task 3). None of these files are in the plan's stated `<files>` lists, but the plan's own `<verification>` section requires a clean `tsc --noEmit`, which is impossible without adapting these call sites.
- **Fix:** Minimal, non-scope-creeping adaptations only: added `orderSequence`/`db` (fake or real, matching each file's harness) to every `new CreateOrderService(...)` call; added `channel: 'site'`/`marketingConsent: false` to `CreateOrderInput` object literals; changed `shortNumber: null` to `shortNumber: 1` (or an incrementing counter in `payment-lifecycle.e2e.spec.ts`'s `seedOrder` helper) across the affected `OrderSnapshot` fixtures.
- **Files modified:** `apps/api/test/e2e/outbox-nats-decoupling.e2e.spec.ts`, `apps/api/test/integration/create-order-idempotency.spec.ts`, `apps/api/test/unit/create-order.service.spec.ts` (Task 2); `apps/api/src/contexts/ordering/domain/order.aggregate.ts`, `apps/api/src/contexts/ordering/domain/order.aggregate.spec.ts`, `apps/api/src/contexts/ordering/infrastructure/order-drizzle.repository.ts`, `apps/api/src/contexts/ordering/interfaces/http/orders.controller.spec.ts`, `apps/api/src/contexts/payments/application/{cancel-order,refund-order,create-checkout-payment,handle-stripe-event}.service.spec.ts` (Task 3)
- **Verification:** `pnpm typecheck` clean across all 11 projects; `pnpm nx run api:test` (95 files / 763 tests) and `pnpm nx run db:test` (27 files / 214 tests) both green; every touched e2e/integration spec re-run individually and passing.
- **Committed in:** `4cc7dbd` (Task 2), `761749d` (Task 3)

**3. [Enhancement — test strengthening, not a bug fix] Added a direct DB-read-back proof for T-10-04-06**

- **Found during:** post-Task-3 review of the threat model's test-evidence bar
- **Issue:** The plan's Task 2 acceptance criteria for "idempotent replay does not burn a counter value" was a static grep (call-order position), and the pre-existing `create-order-idempotency.spec.ts` only asserted on row counts, not on the counter table itself — leaving the T-10-04-06 mitigation without direct dynamic proof, unlike T-10-04-01's explicit concurrency test.
- **Fix:** Added a before/after `order_daily_sequences` counter-sum delta assertion to the existing "duplicate idempotency key" test, proving the retry consumes exactly one counter value across both calls.
- **Files modified:** `apps/api/test/integration/create-order-idempotency.spec.ts`
- **Verification:** `pnpm exec vitest run test/integration/create-order-idempotency.spec.ts` — 4/4 green.
- **Committed in:** `fa41fe8`

---

**Total deviations:** 3 (1 Rule 1 self-caught tenancy bug, 1 Rule 3 ripple-effect fix spanning two tasks, 1 test-coverage enhancement)
**Impact on plan:** All auto-fixes were necessary to keep the repository compiling, tenancy-correct, and its existing test suite green after this plan's (in-scope) contract-widening changes. The test-strengthening addition closes a real gap between the threat model's stated mitigation and its test evidence; none expand the plan's functional scope.

## Issues Encountered

- `pnpm --filter @resto/db db:migrate` failed with "DATABASE_ADMIN_URL (preferred) or DATABASE_URL is required" when run via plain `pnpm --filter`, because `migrate.ts` reads `process.env` directly and pnpm does not auto-load `.env`. Resolved by passing `DATABASE_ADMIN_URL`/`DATABASE_URL` explicitly on the command line (matching the shared dev Postgres credentials already in the worktree's `.env`); not a deviation in the code sense, just an environment-invocation detail.
- Same environment-setup pattern as plans 10-01/10-03: this worktree had no `node_modules` and no `.env` (both gitignored, not shared across git worktrees) — resolved by running `pnpm install` and copying the root `.env` before any DB-touching command.

## User Setup Required

None — no external service configuration required. Migration 0075 was applied directly to the existing shared local dev Postgres container (`resto-postgres`, port 5433), which was already running.

## Next Phase Readiness

- Every field D-04/D-17 requires on `orders` is now filled by the create path: `short_number` (NOT NULL, atomically generated, per-location daily reset), `channel`, `marketing_consent` + `marketing_consent_at`.
- `order_daily_sequences` is proven duplicate-free and gap-free under real concurrency (25-way), reading back from Postgres, not inferred from in-memory return values.
- Plan 10-05 (admin order feed/detail UI, cancel/refund wiring) can render `№{n}` and filter by `channel` directly from the `OrderResponse`/`OrderSnapshot` shapes this plan finalized.
- No blockers. The idempotent-replay counter-non-consumption behavior (T-10-04-06) now has direct DB-read-back test evidence, closing the one gap found during review.

## Self-Check: PASSED

All created files verified present on disk; all 4 commit hashes (`0d5cbf8`, `4cc7dbd`, `761749d`, `fa41fe8`) verified in `git log --oneline --all`.

---

_Plan: 10-admin-order-intake/04_
_Completed: 2026-08-14_
