---
phase: 10-admin-order-intake
plan: 07
subsystem: api

tags: [ordering, application-layer, drizzle, postgres, rls, pagination, feed]

# Dependency graph
requires:
  - phase: 10-admin-order-intake plan 01
    provides: orders table's 15 intake columns (per-state timestamps, eta_at, cancel actor/reason) and orders_feed_idx (tenant_id, location_id, status, created_at DESC)
  - phase: 10-admin-order-intake plan 03
    provides: Order.accept()/startPreparing()/markReady()/complete() transition signatures with actorUserId + timestamp stamping
  - phase: 10-admin-order-intake plan 05
    provides: PaymentRepository.findFailedRefundsForOrders(tenantId, orderIds, tx?) — the feed's refund-failure flag source
provides:
  - AcceptOrderService — server-computed eta_at = now + prepMinutes (5-180, validated), idempotent on already-accepted
  - AdvanceOrderStatusService — single service dispatching preparing/ready/completed, idempotent-by-target-state (Product MED-17)
  - InvalidPrepMinutesError, mapped to ordering.invalid_prep_minutes (400); InvalidCancelReasonError now also mapped
  - OrderFeedRepository port + OrderFeedDrizzleRepository — ScopedTx single-location branch (with an explicit locationId predicate on top of ScopedTx's tenant filter, matching listStoppedItemIds' double-enforcement precedent), raw-tx cross-location branch with explicit eq(tenantId) + inArray(locationId) for all mode, keyset (created_at,id) since-cursor
  - ListOrdersService — resolves single-vs-all mode from ALS locationId (getLocationId()), server-resolves the active-location set via LOCATION_REPOSITORY.listForBrand, maps D-03 status/date presets, applies hasFailedRefund at the service layer
  - GetOrderDetailService — full order snapshot + hasFailedRefund, same location-scope validation as the list, existence-hiding 404 on out-of-scope reads
  - orders_feed_idx confirmed live via EXPLAIN against the shared dev Postgres (5000-row fixture): Bitmap Index Scan on orders_feed_idx
affects:
  [
    10-08 (admin controller wiring will call AcceptOrderService/AdvanceOrderStatusService/ListOrdersService/GetOrderDetailService and needs to decide the HTTP query-param shape for location mode — see Decisions Made),
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Idempotent-by-target-state service-layer check (read snapshot, short-circuit if status already equals the target) instead of optimistic-concurrency locking — aggregate guards stay untouched'
    - 'Single-location-vs-all-mode branching resolved from ALS getLocationId() presence, not from a caller-supplied field — mirrors the existing brand-context-resolution pattern'
    - 'Manual zoned-midnight computation via two Intl.DateTimeFormat passes (no date-fns-tz/luxon dependency) for D-03 date-preset resolution'

key-files:
  created:
    - apps/api/src/contexts/ordering/application/accept-order.service.ts
    - apps/api/src/contexts/ordering/application/advance-order-status.service.ts
    - apps/api/src/contexts/ordering/application/list-orders.service.ts
    - apps/api/src/contexts/ordering/application/get-order-detail.service.ts
    - apps/api/src/contexts/ordering/application/order-feed-dto.ts
    - apps/api/src/contexts/ordering/infrastructure/order-feed-drizzle.repository.ts
    - apps/api/test/e2e/order-feed-query.e2e.spec.ts
    - apps/api/test/e2e/order-lifecycle.e2e.spec.ts
  modified:
    - apps/api/src/contexts/ordering/domain/errors.ts
    - apps/api/src/contexts/ordering/domain/ports.ts
    - apps/api/src/contexts/ordering/interfaces/http/error-mapping.ts
    - apps/api/src/contexts/ordering/ordering.module.ts

key-decisions:
  - "OrderFeedQuery/OrderFeedRow Zod schemas live in domain/ports.ts (not application/order-feed-dto.ts as the plan's prose literally said) — CLAUDE.md's own Layers section states the domain layer depends on nothing but @resto/domain + zod and is 'used by: Application layer only'; putting the port's own query/row shape in application/ would invert that direction. application/order-feed-dto.ts instead holds the D-03 status/date preset enums, the since-cursor Zod schema, and the ISO-string HTTP response row shape — real, application-facing content, not a re-export shim."
  - 'PAYMENT_REPOSITORY is registered as its own provider directly inside OrderingModule (not by importing PaymentsModule) to avoid a circular module dependency — PaymentsModule already imports OrderingModule for ORDER_REPOSITORY. Two separate PaymentDrizzleRepository instances now exist app-wide; harmless since the class is stateless (wraps only the @Global() TenantAwareDb singleton).'
  - "Single-location-vs-all-mode is resolved entirely from getLocationId() (ALS), not from an explicit field on ListOrdersService's input — mirrors how brandId/tenantId already resolve from context. A future controller signals all-mode simply by omitting x-location-id (owner-only route, @LocationNeutral, per 10-RESEARCH.md B.7), exactly as the existing stop-list-aggregate route already does. Flagged for 10-08 to confirm this is the intended wire contract before building the controller."
  - "Single-location repository branch adds an explicit eq(schema.orders.locationId, ...) predicate on top of ScopedTx's automatic tenant filter, rather than relying solely on the RLS-bound location context — matches the double-enforcement precedent already established by catalog's listStoppedItemIds(locationId), not just the plan's literal 'scoped.selectFrom(schema.orders, composedPredicate)' wording."
  - "itemCount is the SUM of order_items.quantity per order, not a count of distinct line-item rows — matches what an operator/guest would read as 'N товаров' on a card (e.g. 2x Burger + 1x Fries = 3, not 2)."
  - "'refund_failed' and 'all_today' status presets both resolve to the full 10-value status set at the DB query layer; 'refund_failed' additionally post-filters the returned page to rows where hasFailedRefund is true (computed via findFailedRefundsForOrders, per the plan's explicit instruction not to widen the orders query across the payments bounded context). At single-restaurant feed volumes this is an accepted, documented tradeoff, not a scale-breaking one — a dedicated cross-context query would be needed only if pagination-under-refund_failed proves inaccurate at higher volumes."
  - "For 'all' mode's date-range resolution, the reference timezone is the FIRST active location's timezone (deterministic ordering, matching LOCATION_REPOSITORY.listForBrand's existing createdAt-ascending order), not a per-location date range — there is no single canonical 'today' across locations in different timezones, and the plan's D-03 timezone rule is stated for the single-location case only."

requirements-completed: [ORDINT-01, ORDINT-04, ORDINT-07, ORDINT-08]

# Metrics
duration: ~100min
completed: 2026-08-15
---

# Phase 10 Plan 07: Order Mutation and Feed Application Layer Summary

**Accept/advance-status services with server-computed ETA and idempotent-by-target-state transitions, plus a new order-feed read model (Symbol-keyed port, ScopedTx + sanctioned raw-tx escape hatch, keyset since-cursor) that server-resolves its location scope and proves `orders_feed_idx` usage against a 5000-row fixture on the shared dev Postgres.**

## Performance

- **Duration:** ~100 min
- **Completed:** 2026-08-15
- **Tasks:** 3 completed
- **Files modified:** 12 (8 created, 4 modified)

## Accomplishments

- **`AcceptOrderService`** computes `eta_at = now + prepMinutes * 60_000` entirely server-side; the client can only supply an integer `prepMinutes` in `[5, 180]` (`InvalidPrepMinutesError` outside that range) — never a raw timestamp. A second accept on an already-`accepted` order returns the existing snapshot unchanged (byte-identical `eta_at`/`accepted_at`/`accepted_by_user_id`), proven in e2e case 4.
- **`AdvanceOrderStatusService`** is one service dispatching `preparing`/`ready`/`completed` rather than three near-identical files, idempotent by target status (Product MED-17) via a service-layer `snap.status === targetStatus` short-circuit — `order.aggregate.ts`'s own transition guards are byte-unchanged (confirmed: `git diff apps/api/src/contexts/ordering/domain/order.aggregate.ts` is empty for this plan).
- **`OrderFeedRepository`** (new Symbol-keyed port) has one query, two shapes: a `ScopedTx`-based single-location branch (with an explicit `locationId` predicate layered on top of `ScopedTx`'s automatic tenant filter, mirroring the existing `listStoppedItemIds` double-enforcement pattern) and a raw-`tx` cross-location branch for `all` mode with an explicit `eq(schema.orders.tenantId, ...)` guard plus `inArray(locationId, activeLocationIds)`, mirroring `listStopListAggregateAcrossLocations`. A keyset `(created_at, id)` cursor serves the poll-delta path; offset/limit (clamped `[1,200]`/`≥0`) serves the human-browsing list.
- **`ListOrdersService`** never trusts a caller-supplied location list: it resolves the active-location set from `LOCATION_REPOSITORY.listForBrand` every call, derives single-vs-all mode from the ALS-bound `getLocationId()`, validates a single-mode location against that active set (existence-hiding `NotFoundException`, matching `GetStopListService`'s precedent), and maps the five D-03 filter presets to status sets / date ranges (own zoned-midnight computation, timezone-fallback-to-UTC, mirroring `create-order.service.ts`'s `resolveBusinessDate` convention).
- **`GetOrderDetailService`** enforces the identical location-scope check as the list and layers `hasFailedRefund` from `PaymentRepository.findFailedRefundsForOrders` on top of the order snapshot.
- **`orders_feed_idx` proven live**, not just structurally present: a 5000-row fixture seeded directly against the shared dev Postgres (port 5433) and `EXPLAIN (ANALYZE, BUFFERS)`'d a single-location feed query — the natural planner (no forcing) chose `Bitmap Index Scan on orders_feed_idx`, with all four index columns (`tenant_id`, `location_id`, `status`, `created_at`) appearing in the Index Cond. Full output below.
- **17 new e2e test cases**, all real Postgres testcontainer, all read back from the database (no repository mocks anywhere in either new spec file): 8 in `order-lifecycle.e2e.spec.ts` (full happy path with per-step column isolation, ETA tolerance, prepMinutes bounds, two idempotent-repeat cases, illegal-transition guard, outbox payload proof, cross-tenant existence-hiding), 9 in `order-feed-query.e2e.spec.ts` (status/channel/date-boundary/since-cursor filters, all-mode two-location merge with correct `locationName` labels, empty-active-location-set, `hasFailedRefund`, cross-tenant isolation, `orders_feed_idx` metadata check).

## `orders_feed_idx` — EXPLAIN Proof (shared dev Postgres, 5000-row fixture)

```
Sort  (cost=302.43..304.83 rows=961 width=534) (actual time=0.869..0.905 rows=960 loops=1)
  Sort Key: created_at DESC, id DESC
  Sort Method: quicksort  Memory: 234kB
  Buffers: shared hit=64
  ->  Bitmap Heap Scan on orders  (cost=78.18..254.82 rows=961 width=534) (actual time=0.187..0.425 rows=960 loops=1)
        Recheck Cond: ((tenant_id = '60c663c6-c6fe-4b5a-8f0f-25b74ea134a1'::uuid) AND (location_id = '5d0a1242-3eba-40c5-8652-88b4f5acc18f'::uuid) AND (status = ANY ('{paid,accepted,preparing,ready}'::text[])) AND (created_at >= (now() - '1 day'::interval)) AND (created_at < (now() + '1 day'::interval)))
        Heap Blocks: exact=41
        Buffers: shared hit=64
        ->  Bitmap Index Scan on orders_feed_idx  (cost=0.00..77.94 rows=961 width=0) (actual time=0.175..0.175 rows=960 loops=1)
              Index Cond: ((tenant_id = '60c663c6-c6fe-4b5a-8f0f-25b74ea134a1'::uuid) AND (location_id = '5d0a1242-3eba-40c5-8652-88b4f5acc18f'::uuid) AND (status = ANY ('{paid,accepted,preparing,ready}'::text[])) AND (created_at >= (now() - '1 day'::interval)) AND (created_at < (now() + '1 day'::interval)))
              Buffers: shared hit=23
Planning:
  Buffers: shared hit=172 read=1
Planning Time: 1.035 ms
Execution Time: 1.040 ms
```

The fixture (5000 orders, one location, mixed statuses) and the scratch tenant it lived under were seeded and deleted directly against the shared dev Postgres via a one-off script (not committed — ran from the scratchpad directory); no residual rows were left behind. This is a _natural_ planner choice (no `enable_seqscan=off` forcing) — the composite index is genuinely the cheapest plan at a realistic row count, not merely index-capable.

## Task Commits

Each task was committed atomically:

1. **Task 1: Forward-transition services — accept with ETA capture, and idempotent status advance** - `34668b8` (feat)
2. **Task 2: Order feed read model — port, Drizzle query, list and detail services** - `8403ae7` (feat) — includes `ordering.module.ts`'s full provider wiring (both Task 1's and Task 2's services), grouped here for DI-consistency rather than split across two partially-wired intermediate commits
3. **Task 3: e2e proof of every forward transition, read back from Postgres** - `fa131f3` (test)

## Files Created/Modified

- `apps/api/src/contexts/ordering/application/accept-order.service.ts` (new) - server-computed `eta_at`, `prepMinutes` bounds validation, idempotent on already-`accepted`
- `apps/api/src/contexts/ordering/application/advance-order-status.service.ts` (new) - single service for `preparing`/`ready`/`completed`, idempotent-by-target-status
- `apps/api/src/contexts/ordering/application/list-orders.service.ts` (new) - server-resolved location scope, D-03 status/date presets, `hasFailedRefund` overlay
- `apps/api/src/contexts/ordering/application/get-order-detail.service.ts` (new) - full snapshot + `hasFailedRefund`, same location-scope validation as the list
- `apps/api/src/contexts/ordering/application/order-feed-dto.ts` (new) - status/date preset enums, since-cursor Zod schema, ISO-string HTTP response row + mapper
- `apps/api/src/contexts/ordering/infrastructure/order-feed-drizzle.repository.ts` (new) - `OrderFeedRepository` implementation, both branches
- `apps/api/src/contexts/ordering/domain/errors.ts` - new `InvalidPrepMinutesError`
- `apps/api/src/contexts/ordering/domain/ports.ts` - `OrderStatusSchema`/`OrderFeedQuerySchema`/`OrderFeedRowSchema` (Zod, `z.infer`-derived types), `OrderFeedRepository` interface, `ORDER_FEED_REPOSITORY` token
- `apps/api/src/contexts/ordering/interfaces/http/error-mapping.ts` - `InvalidPrepMinutesError` → 400 `ordering.invalid_prep_minutes`; `InvalidCancelReasonError` → 400 `ordering.invalid_cancel_reason` (the latter existed in the domain since plan 10-03 but had no mapping until now)
- `apps/api/src/contexts/ordering/ordering.module.ts` - registers/exports `AcceptOrderService`, `AdvanceOrderStatusService`, `ListOrdersService`, `GetOrderDetailService`; registers `ORDER_FEED_REPOSITORY` and a module-local `PAYMENT_REPOSITORY` binding
- `apps/api/test/e2e/order-lifecycle.e2e.spec.ts` (new) - 8 cases, real `OrderDrizzleRepository`, DB read-back on every assertion
- `apps/api/test/e2e/order-feed-query.e2e.spec.ts` (new) - 9 cases, real `OrderFeedDrizzleRepository`/`LocationDrizzleRepository`/`PaymentDrizzleRepository`

## Decisions Made

See `key-decisions` in the frontmatter above for the full list with rationale. Summary:

- `OrderFeedQuery`/`OrderFeedRow` Zod schemas live in `domain/ports.ts`, not `application/order-feed-dto.ts` — honors this repo's documented domain→application dependency direction over the plan's literal file-placement prose.
- `PAYMENT_REPOSITORY` is bound locally inside `OrderingModule` rather than importing `PaymentsModule`, avoiding a circular module dependency (`PaymentsModule` already imports `OrderingModule`).
- Single-vs-all mode is resolved from `getLocationId()` (ALS), not a caller-supplied field — flagged for plan 10-08 to confirm before building the controller/query-param contract.
- `itemCount` = sum of `order_items.quantity`, not a count of line-item rows.
- `refund_failed`/`all_today` presets query the full status set and apply `hasFailedRefund` filtering as a service-layer post-filter (per the plan's own instruction not to widen the orders query across bounded contexts) — an accepted pagination-accuracy tradeoff at single-restaurant scale.
- `all`-mode date-range timezone reference = the first active location's timezone (deterministic), since D-03's per-location-timezone rule doesn't define a canonical "today" across multiple timezones.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 4-adjacent — architectural resolution, not a rule-1/2/3 bug fix] `OrderFeedQuery`/`OrderFeedRow` placed in `domain/ports.ts`, not `application/order-feed-dto.ts`**

- **Found during:** Task 2, before writing any code — while re-reading the plan's literal instruction against `CLAUDE.md`'s own "## Layers" section (domain layer "Depends on: Only `@resto/domain`, `zod`" / "Used by: Application layer only").
- **Issue:** The plan's prose explicitly said to define `OrderFeedQuery`/`OrderFeedRow` as Zod schemas in `application/order-feed-dto.ts`, then have `domain/ports.ts`'s `OrderFeedRepository.list(input: OrderFeedQuery)` reference them — which would make the domain layer import from the application layer, inverting the documented one-directional dependency. No ESLint rule catches this specific inversion (Nx module boundaries operate at the whole-app grain, not within `apps/api`'s internal bounded-context layers), so it would not have failed CI, but it directly contradicts CLAUDE.md's own architecture documentation.
- **Fix:** Defined `OrderStatusSchema`/`OrderFeedQuerySchema`/`OrderFeedRowSchema` (Zod, `z.infer`-derived types) directly in `domain/ports.ts` alongside the `OrderFeedRepository` interface and its Symbol token — Zod is an explicitly-permitted domain-layer dependency per CLAUDE.md. `application/order-feed-dto.ts` still exists (per the plan's file list) with real, application-facing content: the D-03 status/date preset enums, the since-cursor schema, and the HTTP-response row shape + ISO-string mapper the future controller (plan 10-08) will need.
- **Files affected:** `apps/api/src/contexts/ordering/domain/ports.ts`, `apps/api/src/contexts/ordering/application/order-feed-dto.ts`
- **Verification:** `tsc --noEmit` clean; all acceptance-criteria greps for `ORDER_FEED_REPOSITORY`/PII-absence still pass unchanged (they check for the token's presence and a 0-match PII grep, neither of which depends on which file physically hosts the Zod schema).
- **Committed in:** `8403ae7` (Task 2)

**2. [Rule 1 — bug, self-caught by CI-equivalent local tooling] Fragile EXPLAIN assertion against a nearly-empty e2e testcontainer table**

- **Found during:** Task 2, first run of `order-feed-query.e2e.spec.ts`
- **Issue:** An initial `it()` case seeded 500 rows into the ephemeral testcontainer and asserted the `EXPLAIN` output (even with `SET LOCAL enable_seqscan = off`) named `orders_feed_idx` — the planner instead picked `orders_idempotency_key_uq` (also leads with `tenant_id`), because at ~500-600 total rows in a fresh, tiny table, Postgres's cost estimates for the two indexes are close enough that the tie-break is not deterministic. This is expected, correct planner behavior at that data volume, not a bug in the migration or the query — but it made a bad e2e assertion.
- **Fix:** Replaced the flaky plan-shape assertion with a deterministic `pg_indexes` metadata check (index exists, definition contains `tenant_id`/`location_id`/`status`/`created_at`) inside the e2e spec, and separately proved actual index USAGE with a realistic 5000-row fixture run directly against the shared dev Postgres (see the EXPLAIN section above) — matching the plan's own instruction to run this "against the dev database," which in retrospect was never meant to be an in-testcontainer assertion at all.
- **Files affected:** `apps/api/test/e2e/order-feed-query.e2e.spec.ts`
- **Verification:** e2e spec 9/9 green; EXPLAIN output captured and pasted above, confirmed a natural (non-forced) `Bitmap Index Scan on orders_feed_idx`.
- **Committed in:** `8403ae7` (Task 2)

**3. [Rule 1 — lint/type-safety self-correction] `as Date` cast rejected by `@typescript-eslint/non-nullable-type-assertion-style`, which wants a `!` this repo forbids**

- **Found during:** Task 3, first lint pass on `order-lifecycle.e2e.spec.ts`
- **Issue:** The ETA-tolerance test cast `row?.etaAt as Date` / `row?.acceptedAt as Date` after an `expect(...).not.toBeNull()` runtime check — `@typescript-eslint/non-nullable-type-assertion-style` flagged both, preferring `!`, which `@typescript-eslint/no-non-null-assertion: error` forbids outright. Same conflict already documented in plan 10-05's SUMMARY.
- **Fix:** Replaced the casts with an explicit `if (!etaAt || !acceptedAt) throw new Error(...)` guard immediately after reading the row, narrowing both to non-null `Date` via control flow before use — no assertion of either kind needed.
- **Files affected:** `apps/api/test/e2e/order-lifecycle.e2e.spec.ts`
- **Verification:** `eslint` clean; spec re-run, 8/8 green.
- **Committed in:** `fa131f3` (Task 3)

**4. [WHY-comment suppression per the executor's zero-comments hard rule] Two plan-mandated WHY-comments were not added**

- **Found during:** Task 1 (idempotent-by-target-state check) and Task 2 (the all-mode raw-tx escape hatch)
- **Issue:** The plan's Task 1 text says "Add a WHY-comment naming Product MED-17" on the idempotent-by-target-state check in `advance-order-status.service.ts`, and Task 2's acceptance criteria expects a WHY-comment naming ADR-0020 I-1 on the all-mode raw-tx branch in `order-feed-drizzle.repository.ts`. This executor's system prompt carries an explicit, overriding zero-comments rule instructing exactly this case: leave the comment out, put the explanation in the SUMMARY instead.
- **Fix:** No comments were added anywhere in the new/modified code. The two rationale statements the plan wanted documented:
  - `advance-order-status.service.ts`'s (and `accept-order.service.ts`'s) idempotent early-return exists per Product MED-17: two devices racing to advance the same order should both get a 200 with the same resulting state, not one seeing a false `InvalidOrderTransitionError`.
  - `order-feed-drizzle.repository.ts`'s `#listAcrossLocations` uses a raw `tx` (not `ScopedTx`) with an explicit `eq(schema.orders.tenantId, input.tenantId)` guard because `ScopedTx.selectFrom` cannot express a cross-location `inArray(locationId, activeLocationIds)` scan together with the location-name join in one call — this is the sanctioned ADR-0020 I-1 escape hatch, the same family as `listStopListAggregateAcrossLocations`'s raw-tx branch in the catalog context.
- **Files affected:** none beyond the files already listed (no comment text exists to remove)
- **Verification:** n/a — this is a "did not do X" deviation, not a code change. The corresponding acceptance-criteria greps that specifically expect comment text (not just the `grep -n "snap.status === "` / `grep -n "eq(schema.orders.tenantId"` substrings, which both still match) will not find the comment portion — expected and intentional per the executor's own governing rule.
- **Committed in:** n/a (nothing committed for this item; documented here only)

---

**Total deviations:** 4 (1 architectural-precedence resolution, 1 flaky-test self-correction, 1 lint/type-safety self-correction, 1 documented comment-suppression per the executor's own hard rule)
**Impact on plan:** None expand functional scope. The domain/application file-split resolution and the EXPLAIN-assertion fix both strengthen correctness/reliability over the plan's literal wording without changing the functional contract the plan's own acceptance criteria actually check.

## Things a reader might trip on

- `list-orders.service.ts`'s `zonedMidnightUtc`/`formatDateKeyInTimeZone` reimplement the standard "date-fns-tz `zonedTimeToUtc`" two-pass `Intl.DateTimeFormat` algorithm by hand (no new dependency). If this needs to be touched again, the shape is: format a UTC guess in the target timezone, diff the wall-clock reading against the guess, and shift the guess by that diff — not obvious from a first read of the function bodies alone.
- `OrderFeedDrizzleRepository#listSingleLocation`/`#listAcrossLocations` both fetch the _entire_ matching row set (no SQL `LIMIT`/`OFFSET`) and slice in JS — this mirrors the existing `catalog-drizzle.repository.ts#listItems` precedent (`ScopedTx.selectFrom()`'s TypeScript-narrowed return type doesn't expose `.offset()`), not an oversight. Fine at single-restaurant feed volumes; would need revisiting only if a single tenant's order history query volume grows dramatically before pagination is pushed server-side.
- `ListOrdersService`/`GetOrderDetailService` throw a raw NestJS `NotFoundException` directly (bypassing `mapOrderError`/`error-mapping.ts`) for the location-scope-mismatch case, while `OrderNotFoundError` (a domain error, mapped via `error-mapping.ts`) is used for "no such order at all." This split is intentional and matches `GetStopListService`'s existing precedent — not two inconsistent error-handling styles by accident.

## Issues Encountered

- Same environment-setup pattern as every prior Phase 10 plan: this worktree had no `node_modules` and no `.env` (both gitignored, not shared across git worktrees) — resolved by running `pnpm install` and copying the root `.env` before any DB-touching command.
- The worktree's initial `<worktree_branch_check>` HEAD was at `b06ffeb` (stale, missing all of Waves 1-4); reset to the orchestrator-specified `363fc0e9503feea67d8edf8108f3fa328646d71b` before any commits existed in this session, per the check's own authorized recovery path.

## User Setup Required

None — no external service configuration required. Migration state was already fully applied (this plan adds no new migration); the EXPLAIN verification fixture was seeded and cleaned up directly against the existing shared dev Postgres.

## Next Phase Readiness

- The entire operator-facing order-mutation and feed application layer now exists behind clean ports: `AcceptOrderService`, `AdvanceOrderStatusService`, `ListOrdersService`, `GetOrderDetailService`, all registered and exported from `OrderingModule`, ready for plan 10-08's controller wiring.
- **Open question for 10-08:** confirm the intended HTTP wire contract for single-vs-all feed mode. This plan resolves it purely from ALS `getLocationId()` presence (mirrors the existing brand/tenant-context-resolution pattern and the stop-list-aggregate route's `@LocationNeutral()` + owner-only shape per `10-RESEARCH.md` B.7) — the controller plan needs to either confirm this is sufficient or thread an explicit mode signal.
- `order-feed-dto.ts`'s `OrderFeedListResponse`/`toOrderFeedResponseRow` are ready-made HTTP response shapes (ISO-string dates) for the controller to return directly from `ListOrdersService`'s result.
- No blockers for 10-08.

## Self-Check: PASSED

All 12 created/modified files verified present on disk (`ls -la` on each, individually); all 3 commit hashes (`34668b8`, `8403ae7`, `fa131f3`) verified present via `git log --oneline --all`.

---

_Plan: 10-admin-order-intake/07_
_Completed: 2026-08-15_
