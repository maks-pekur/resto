---
phase: 10-admin-order-intake
plan: 01
subsystem: database
tags: [drizzle, postgres, rls, migrations, gdpr-erasure]

# Dependency graph
requires:
  - phase: 08.4-location-scoped-access
    provides: locations table + current_location_id() GUC + is_system_session() helpers this migration's RLS policies reuse
provides:
  - orders table extended with 15 order-intake columns (short_number, channel, per-state timestamps, cancel reason/actor, ETA, marketing consent)
  - order_daily_sequences per-location daily counter table (composite PK, both FKs, ENABLE+FORCE RLS, PERMISSIVE tenant + RESTRICTIVE location policies)
  - orders_feed_idx covering index for the admin order feed query
  - tenancy_erase_tenant extended to erase order_daily_sequences rows
affects:
  [
    10-02,
    10-03,
    10-04,
    10-05,
    admin order intake plans that build the mutation/feed surface on top of this schema,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Hand-authored migration SQL matching Drizzle schema, since drizzle-kit generate is confirmed broken past migration 0018 (snapshot drift)'
    - 'New tenant-scoped table gets ENABLE+FORCE RLS + baseline PERMISSIVE tenant_id policy + RESTRICTIVE location-grain policy, in that order'

key-files:
  created:
    - packages/db/migrations/0073_orders_intake.sql
    - packages/db/migrations/0074_tenancy_erase_order_sequences.sql
  modified:
    - packages/db/src/schema/ordering.ts
    - packages/db/migrations/meta/_journal.json
    - packages/db/test/integration/erase-includes-ordering.spec.ts

key-decisions:
  - "short_number is nullable in this migration; plan 10-04's migration 0075 tightens it to NOT NULL once CreateOrderService can populate it via order_daily_sequences"
  - 'refund() vs cancel() status ownership, cancel-reason enum, and every other application-layer decision are explicitly out of scope for this plan — schema only'
  - 'order_daily_sequences business_date has no timezone-derivation logic yet — that lands with the counter-generation service in plan 10-04'

patterns-established:
  - "New order-adjacent tenant-scoped tables mirror order_daily_sequences' RLS shape: baseline PERMISSIVE tenant_id policy is mandatory before any RESTRICTIVE policy, per the 0067 retrofit landmine"

requirements-completed: [ORDINT-04, ORDINT-05, ORDINT-07, ORDINT-08]

# Metrics
duration: 25min
completed: 2026-08-13
---

# Phase 10 Plan 01: Orders-Intake Schema Migration Summary

**Migrations 0073/0074 land 15 new `orders` columns, the `order_daily_sequences` per-location daily counter table (composite PK, dual FK, ENABLE+FORCE RLS with PERMISSIVE tenant + RESTRICTIVE location policies), the `orders_feed_idx` covering index, and the GDPR erase-function extension — applied and verified live against the shared dev Postgres.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-08-13
- **Tasks:** 3 completed
- **Files modified:** 5

## Accomplishments

- Extended the Drizzle `orders` schema with every field D-04 requires: `short_number` (nullable, tightened in plan 10-04), `channel`, per-state timestamps (`accepted_at`/`preparing_at`/`ready_at`/`completed_at`/`canceled_at`), cancel actor/reason/note/`canceled_from_status`, `eta_at`, and marketing consent + timestamp — plus three new CHECK constraints and the `orders_feed_idx` covering index.
- Added the `order_daily_sequences` table: composite `(tenant_id, location_id, business_date)` primary key, tenant FK (cascade) + composite location FK (restrict), full RLS (ENABLE + FORCE, baseline PERMISSIVE tenant policy, RESTRICTIVE location policy) — this is the atomic counter plan 10-04's `CreateOrderService` will use for the short daily order number.
- Hand-authored migrations `0073_orders_intake.sql` and `0074_tenancy_erase_order_sequences.sql` (drizzle-kit generate remains confirmed-broken past migration 0018 — see `0073`'s header comment for the workflow note), applied them to the shared local dev database, and proved the applied state via live `information_schema`/`pg_policies`/`pg_indexes`/`pg_constraint`/`pg_proc` queries (raw output below).
- Extended `tenancy_erase_tenant` to `DELETE FROM order_daily_sequences` before the existing `DELETE FROM orders` — closing the exact GDPR gap 08.4-08 had to retrofit for `locations`, this time before any real data exists in the new table.
- Extended `erase-includes-ordering.spec.ts` to seed an `order_daily_sequences` row and assert it is erased along with the rest of the tenant's ordering data; the full testcontainer suite (fresh Postgres, all migrations applied from scratch) passes, independently proving the migration is clean on an empty database.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend the Drizzle ordering schema with every new order column and the daily-counter table** - `dc54277` (feat)
2. **Task 2: Hand-author migrations 0073 and 0074 plus their journal entries** - `e5db7dc` (feat)
3. **Task 3: [BLOCKING] Apply the migrations and assert the live database state** - `a16eaac` (test)

_Note: Task 3's migration-apply step itself produces no file diff (it mutates the live database, not the repo) — only its integration-test extension is committed._

## Files Created/Modified

- `packages/db/src/schema/ordering.ts` - 15 new `orders` columns, 3 new CHECK constraints, `orders_feed_idx`, new `orderDailySequences` Drizzle table
- `packages/db/migrations/0073_orders_intake.sql` - hand-written migration: ADD COLUMN x15, 3 CHECK constraints, feed index, `order_daily_sequences` table + both FKs + RLS + both policies
- `packages/db/migrations/0074_tenancy_erase_order_sequences.sql` - `tenancy_erase_tenant` extended with `DELETE FROM order_daily_sequences`, otherwise byte-identical to `0072`'s function body
- `packages/db/migrations/meta/_journal.json` - journal entries idx 73/74 appended
- `packages/db/test/integration/erase-includes-ordering.spec.ts` - seeds + asserts erasure of an `order_daily_sequences` row

## Decisions Made

- **`short_number` stays nullable in this migration.** The generator that populates it (`order_daily_sequences` + `CreateOrderService`) doesn't exist until plan 10-04, which ships migration `0075` to tighten the column to `NOT NULL` once the write path exists. Adding `NOT NULL` now would break every existing order-insert call site with no value to supply.
- **`order_daily_sequences` gets the same three-policy RLS shape as `orders`/`locations`**: ENABLE + FORCE RLS, a baseline PERMISSIVE `tenant_id = current_tenant_id()` policy, and a RESTRICTIVE `location_id = current_location_id()` policy — mirroring the exact fix `0067_location_tenant_iso.sql` had to retrofit after `0063`/`0064` shipped without the baseline policy. This plan lands both policies from the start, no retrofit needed.
- **`eta_at` is a distinct column from `scheduledFor`.** `scheduledFor` already means "the guest's requested time"; conflating the two was flagged as a bug this phase must avoid, not extend.

## Deviations from Plan

None — plan executed exactly as written. The only environment-level action beyond the plan's literal task list was copying the gitignored root `.env` into this worktree and running `pnpm install` (git worktrees do not share ignored files or `node_modules`), both required simply to have a working dev environment to execute against — not a deviation in the deviation-rule sense (no code/behavior changed as a result).

## Task 3 — Raw Catalog Query Output

**Migration apply (`pnpm --filter @resto/db db:migrate`, exit 0):**

```
{"level":30,...,"msg":"Applying migrations…"}
NOTICE: schema "drizzle" already exists, skipping
NOTICE: relation "__drizzle_migrations" already exists, skipping
{"level":30,...,"msg":"Migrations applied."}
```

`drizzle.__drizzle_migrations` confirms both new rows recorded, keyed by the journal's `when` timestamps:

```
{ id: 74, hash: 'ed4d7693a...', created_at: '1784073600000' }   -- 0073_orders_intake
{ id: 75, hash: '4cad6bc74...', created_at: '1784160000000' }   -- 0074_tenancy_erase_order_sequences
```

**Q1 — `information_schema.columns` (15 rows, nullability as specified):**

```
column_name            is_nullable   data_type
accepted_at             YES          timestamp with time zone
accepted_by_user_id     YES          text
cancel_note             YES          text
cancel_reason           YES          text
canceled_at             YES          timestamp with time zone
canceled_by_user_id     YES          text
canceled_from_status    YES          text
channel                 NO           text
completed_at             YES          timestamp with time zone
eta_at                  YES          timestamp with time zone
marketing_consent       NO           boolean
marketing_consent_at    YES          timestamp with time zone
preparing_at            YES          timestamp with time zone
ready_at                YES          timestamp with time zone
short_number            YES          integer
```

**Q2 — `SELECT to_regclass('public.order_daily_sequences')`:**

```
{ reg: 'order_daily_sequences' }
```

**Q3 — `pg_policies` for `order_daily_sequences` (exactly 2 rows):**

```
{ policyname: 'order_daily_sequences_iso', permissive: 'PERMISSIVE' }
{ policyname: 'order_daily_sequences_location_iso', permissive: 'RESTRICTIVE' }
```

**Q4 — `pg_indexes` for `orders_feed_idx`:**

```
{ indexname: 'orders_feed_idx' }
```

**Q5 — `pg_constraint` (5 rows):**

```
{ conname: 'order_daily_sequences_location_fk' }
{ conname: 'order_daily_sequences_tenant_fk' }
{ conname: 'orders_cancel_reason_chk' }
{ conname: 'orders_canceled_from_status_chk' }
{ conname: 'orders_channel_chk' }
```

**Q6 — `has_table_privilege('resto_app', 'order_daily_sequences', ...)` for SELECT/INSERT/UPDATE:**

```
{ ok: true }
```

(Satisfied by the existing `ALTER DEFAULT PRIVILEGES` grant in `packages/db/sql/roles.sql` — no explicit GRANT statement was needed in `0073`.)

**Q7 — `pg_proc.prosrc` for `tenancy_erase_tenant` mentions `order_daily_sequences`:**

```
{ ok: true }
```

**Extra confirmation — RLS flags + full constraint set on `order_daily_sequences`:**

```
{ relrowsecurity: true, relforcerowsecurity: true }
[
  { conname: 'order_daily_sequences_location_fk', contype: 'f' },
  { conname: 'order_daily_sequences_pk', contype: 'p' },
  { conname: 'order_daily_sequences_tenant_fk', contype: 'f' }
]
```

**Integration test — `erase-includes-ordering.spec.ts` (fresh testcontainer Postgres, all migrations applied from scratch):**

```
✓ test/integration/erase-includes-ordering.spec.ts (1 test) 60237ms
Test Files  1 passed (1)
     Tests  1 passed (1)
```

## Issues Encountered

None. The worktree had no `node_modules` and no `.env` (both gitignored, not shared across git worktrees) — resolved by running `pnpm install` and copying the root `.env` before any DB-touching command, as documented above.

## User Setup Required

None — no external service configuration required. The migration was applied directly to the existing shared local dev Postgres container (`resto-postgres`, port 5433), which was already running per the plan's `<database_note>`.

## Next Phase Readiness

- The schema gate is closed: every field the rest of Phase 10 needs on `orders`, plus `order_daily_sequences`, exists in the live dev database.
- Plan 10-04 (short-number generator + `CreateOrderService` wiring + migration `0075` tightening `short_number` to `NOT NULL`) can proceed.
- Plans 10-02/10-03/10-05 (aggregate/application/controller/RBAC/event-contract work) can proceed against this schema without further DB changes.
- No blockers.

---

_Plan: 10-admin-order-intake/01_
_Completed: 2026-08-13_
