---
phase: 07-ordering
verified: 2026-06-15T00:00:00Z
status: passed
score: 13/13
overrides_applied: 0
---

# Phase 7: Ordering — Verification Report

**Phase Goal:** Build the `ordering` bounded context (4-layer DDD, backend only): an `Order` aggregate with the full 9-state machine, immutable item/modifier/price snapshot at creation, domain-layer totals + pure discount engine (PROMO-06), `ordering.*` event contracts consumed by `audit`, the `ordering.>` NATS subject, idempotent anonymous order creation via `POST /v1/orders`, and the DB tables (orders, order_items, order_modifiers, payments) with composite FK + FORCE RLS.
**Verified:** 2026-06-15
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                               | Status   | Evidence                                                                                                                                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ORD-01: `ordering` bounded context exists with 4-layer DDD structure                                                                | VERIFIED | `apps/api/src/contexts/ordering/` has `domain/`, `application/`, `infrastructure/`, `interfaces/http/`; `ordering.module.ts` wires all providers                                                                                                                                                                          |
| 2   | ORD-02: `Order` aggregate has full 9-state machine with all transitions guarded                                                     | VERIFIED | `order.aggregate.ts`: 8 transition methods (`markPaid`, `accept`, `startPreparing`, `markReady`, `complete`, `cancel`, `refund`, `markFailed`), all throw `InvalidOrderTransitionError` on illegal source state; `order.aggregate.spec.ts` covers all 8 transitions with guard assertions                                 |
| 3   | ORD-03: Order creation is anonymous (no user auth required)                                                                         | VERIFIED | `orders.controller.ts` carries `@Public()` at class level; `@RequireActiveTenant()` guards only that the tenant is active — no user session required                                                                                                                                                                      |
| 4   | ORD-04: Immutable snapshot of items/modifiers/prices frozen at creation                                                             | VERIFIED | `Order.create()` builds `itemSnapshots` array and calls `Object.freeze(itemSnapshots)` (line 163); name, unitPrice, priceDelta captured from cart payload at creation; `order.aggregate.spec.ts` line 145–169 proves mutating the input array after creation has no effect                                                |
| 5   | ORD-05: Totals = subtotal + delivery + service_fee − discount; integer minor units; per-line rounding                               | VERIFIED | `computeTotals()` rounds per-line (`Math.round(unitMinor + modifierMinor) * quantity`), sums to subtotal, applies `applyDiscount()`, clamps to 0; `deliveryFee`/`serviceFee` default to `'0.00'`; `money-utils.ts` converts to/from integer minor units; spec proves per-line diverges from round-at-total                |
| 6   | ORD-06: 4 DB tables with composite FK + FORCE RLS on each                                                                           | VERIFIED | `0049_ordering_tables.sql`: all 4 tables have `FORCE ROW LEVEL SECURITY` (grep count = 4); `order_items` carries `(order_id, tenant_id) → orders(id, tenant_id)`; `order_modifiers` carries `(order_item_id, tenant_id) → order_items(id, tenant_id)`; `payments` carries `(order_id, tenant_id) → orders(id, tenant_id)` |
| 7   | ORD-07: 5 event contracts, PII-free payloads                                                                                        | VERIFIED | `packages/events/src/contracts/ordering.ts`: 5 contracts (`ordering.order_created.v1`, `ordering.order_paid.v1`, `ordering.order_canceled.v1`, `ordering.order_refunded.v1`, `ordering.order_status_changed.v1`); no `customerName`, `customerPhone`, or `tableIdentifier` in any payload schema                          |
| 8   | ORD-08: `ordering.>` added to STREAM_SUBJECTS in `nats.module.ts`                                                                   | VERIFIED | `apps/api/src/infrastructure/nats.module.ts` line 29: `'ordering.>'` in `STREAM_SUBJECTS` array                                                                                                                                                                                                                           |
| 9   | ORD-09: audit context subscribes to `ordering.>` with `runDeduped`; 5 ACTION_TARGET_KIND entries; audit row `target_id === orderId` | VERIFIED | `nats-audit-subscriber.ts`: `ORDERING_SUBJECT = 'ordering.>'` subscribed with `runDeduped`; `record-audit.service.ts` lines 28–32: 5 ordering entries in `ACTION_TARGET_KIND` all mapping to `'order'`; `targetId` resolution at lines 88–93 returns `payload.orderId`; confirmed by `ordering-audit-projection.spec.ts`  |
| 10  | ORD-10: Duplicate idempotency key returns same order, single DB row                                                                 | VERIFIED | `order-drizzle.repository.ts`: `.onConflictDoNothing({ target: [tenantId, idempotencyKey] })`, returns early if `result.length === 0`; `create-order.service.ts`: `findByIdempotencyKey()` returns existing order's id/orderNumber; `create-order-idempotency.spec.ts` proves single row and same orderId on retry        |
| 11  | ORD-11: `outbox_events` claim mechanism prevents multi-replica double-delivery                                                      | VERIFIED | `packages/db/src/schema/outbox.ts`: `claim_id` column present (migration `0047_outbox_claim_id.sql`); `packages/events/src/outbox/repository.ts`: `releaseOutboxClaim` and `markOutboxDelivered` both scope `WHERE … AND claim_id = ?`; D-06 accepts `claim_id` column name vs. requirement's `claim_token`               |
| 12  | ORD-12: `orders.scheduled_for TIMESTAMPTZ NULL`; operating-hours validation deferred with WHY comment                               | VERIFIED | Column present in schema and migration; `dto.ts` line 32: `// ORD-12: no operating-hours source exists yet — accept any future datetime; schedule validation deferred.` — correct WHY-comment                                                                                                                             |
| 13  | PROMO-06: Pure extensible discount engine, no DB calls                                                                              | VERIFIED | `discount.ts`: pure function `applyDiscount(lines, spec)` handles 6 cases (percentage + fixed) × (cart + category + item); discriminated union on `kind` + `scope` is extensible; zero DB calls; `discount.spec.ts` covers all 6 cases including clamp guards                                                             |

**Score: 13/13 truths verified**

### Required Artifacts

| Artifact                                                                    | Expected                                        | Status   | Details                                                                                                                    |
| --------------------------------------------------------------------------- | ----------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/contexts/ordering/domain/order.aggregate.ts`                  | Order aggregate with 9-state machine            | VERIFIED | 8 guarded transition methods, `pullEvents()`, `fromSnapshot()`, `Object.freeze` on items                                   |
| `apps/api/src/contexts/ordering/domain/discount.ts`                         | Pure discount engine                            | VERIFIED | `applyDiscount()` pure function, `DiscountSpecSchema` discriminated union                                                  |
| `apps/api/src/contexts/ordering/domain/events.ts`                           | Domain event types                              | VERIFIED | 5 event interfaces + `OrderDomainEvent` union                                                                              |
| `apps/api/src/contexts/ordering/application/create-order.service.ts`        | Order creation use case                         | VERIFIED | Single `execute()`, maps cart → `Order.create()`, idempotency via `findByIdempotencyKey`                                   |
| `apps/api/src/contexts/ordering/application/dto.ts`                         | Request/response DTOs + order number generation | VERIFIED | `CreateOrderInputSchema` with all validation; `generateOrderNumber()` produces dated+random string                         |
| `apps/api/src/contexts/ordering/infrastructure/order-drizzle.repository.ts` | Repository with event publishing                | VERIFIED | `save()` writes order + items + modifiers + outbox in one transaction; `onConflictDoNothing`                               |
| `apps/api/src/contexts/ordering/interfaces/http/orders.controller.ts`       | POST /v1/orders endpoint                        | VERIFIED | `@Public()`, `@RequireActiveTenant()`, `RestoZodValidationPipe`, `wrapWith(mapOrderError)`                                 |
| `apps/api/src/contexts/ordering/ordering.module.ts`                         | NestJS module wiring                            | VERIFIED | `TenancyModule` imported; `ORDER_REPOSITORY`, `CreateOrderService`, `GetOrderService`, `RequireActiveTenantGuard` provided |
| `packages/db/src/schema/ordering.ts`                                        | Drizzle schema for 4 tables                     | VERIFIED | All 4 tables with `compositeTenantFk`, `pkUuid`, `tenantIdColumn`; composite unique indexes                                |
| `packages/db/migrations/0049_ordering_tables.sql`                           | DB migration                                    | VERIFIED | DDL + 4× FORCE RLS + RLS policies + composite FKs                                                                          |
| `packages/events/src/contracts/ordering.ts`                                 | 5 event contracts                               | VERIFIED | All 5 contracts with PII-free Zod payload schemas                                                                          |
| `apps/api/src/contexts/audit/infrastructure/nats-audit-subscriber.ts`       | audit subscribes to `ordering.>`                | VERIFIED | `ORDERING_CONSUMER_NAME` + `ORDERING_SUBJECT` subscribed alongside tenancy and identity                                    |
| `apps/api/src/contexts/audit/application/record-audit.service.ts`           | 5 ordering ACTION_TARGET_KIND entries           | VERIFIED | Lines 28–32 map all 5 ordering event prefixes to `'order'`                                                                 |

### Key Link Verification

| From                             | To                                      | Via                          | Status | Details                                                                                                                                  |
| -------------------------------- | --------------------------------------- | ---------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `orders.controller.ts`           | `CreateOrderService`                    | constructor injection        | WIRED  | Controller calls `this.createOrder.execute(input)`                                                                                       |
| `CreateOrderService`             | `OrderDrizzleRepository`                | `ORDER_REPOSITORY` symbol    | WIRED  | `@Inject(ORDER_REPOSITORY)` in service; module wires `OrderDrizzleRepository`                                                            |
| `OrderDrizzleRepository.save()`  | `appendToOutbox`                        | same tx                      | WIRED  | `appendToOutbox(tx, { envelope: domainEventToEnvelope(event), aggregateId })` called inside `db.withTenant()`                            |
| `appendToOutbox` → outbox → NATS | `NatsAuditSubscriber`                   | `ordering.>` NATS subject    | WIRED  | `STREAM_SUBJECTS` includes `'ordering.>'`; subscriber subscribes to same subject                                                         |
| `NatsAuditSubscriber`            | `RecordAuditService.fromEnvelopeWithTx` | `runDeduped`                 | WIRED  | Handler: `await runDeduped(this.db, envelope, cfg.durableName, async (tx) => { await this.recorder.fromEnvelopeWithTx(envelope, tx); })` |
| `RecordAuditService`             | `auditLog` table                        | `targetId = payload.orderId` | WIRED  | Lines 88–93: `targetType === 'order'` branch extracts `payload.orderId`                                                                  |
| `Order.create()`                 | `applyDiscount()`                       | `computeTotals()`            | WIRED  | `discount.ts` `applyDiscount()` called from `computeTotals()` at line 128                                                                |
| `OrderingModule`                 | `TenancyModule`                         | `imports`                    | WIRED  | `ordering.module.ts` imports `TenancyModule` — fix from commit e0ff6b6                                                                   |

### Data-Flow Trace (Level 4)

| Artifact                      | Data Variable                       | Source                                   | Produces Real Data | Status  |
| ----------------------------- | ----------------------------------- | ---------------------------------------- | ------------------ | ------- |
| `order-drizzle.repository.ts` | `snapshot.id` (order written to DB) | `Order.create()` → `randomUUID()`        | Yes                | FLOWING |
| `order-drizzle.repository.ts` | `events[]` (outbox row)             | `order.pullEvents()` → `appendToOutbox`  | Yes                | FLOWING |
| `create-order.service.ts`     | `orderId` return value              | `findByIdempotencyKey()` → real DB query | Yes                | FLOWING |

### Requirements Coverage

| Requirement | Status    | Evidence                                                                                                                       |
| ----------- | --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| ORD-01      | SATISFIED | 4-layer directory structure present and module compiles                                                                        |
| ORD-02      | SATISFIED | All 8 transitions with `InvalidOrderTransitionError` guards; all 9 states in `OrderStatus` type                                |
| ORD-03      | SATISFIED | `@Public()` + no `@Auth()` guard; anonymous POST works                                                                         |
| ORD-04      | SATISFIED | `Object.freeze(itemSnapshots)` + `nameSnapshot`/`unitPrice`/`priceDelta` captured at creation                                  |
| ORD-05      | SATISFIED | `computeTotals()` per-line rounding; `toMinorUnits`/`fromMinorUnits`; fees default 0                                           |
| ORD-06      | SATISFIED | 4× FORCE RLS in migration; composite FKs on all child tables                                                                   |
| ORD-07      | SATISFIED | 5 contracts, no PII in payload schemas                                                                                         |
| ORD-08      | SATISFIED | `'ordering.>'` in `STREAM_SUBJECTS`                                                                                            |
| ORD-09      | SATISFIED | `runDeduped` subscription; 5 ACTION_TARGET_KIND; `target_id = orderId`                                                         |
| ORD-10      | SATISFIED | `onConflictDoNothing` + post-save `findByIdempotencyKey`; integration test covers cross-tenant isolation                       |
| ORD-11      | SATISFIED | `claim_id` column (D-06 accepts name vs requirement's `claim_token`); scoped in `releaseOutboxClaim`/`markOutboxDelivered`     |
| ORD-12      | SATISFIED | `scheduled_for TIMESTAMPTZ NULL` in schema and migration; WHY comment in dto.ts                                                |
| PROMO-06    | SATISFIED | Pure `applyDiscount()` function in domain layer; no DB calls; discriminated union `DiscountSpecSchema` extensible for Phase 11 |

### Anti-Patterns Found

| File                                                                 | Line | Pattern                    | Severity | Impact                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------- | ---- | -------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/contexts/ordering/application/create-order.service.ts` | 41   | `categoryId: ''` hardcoded | Warning  | Category-scoped `DiscountSpec` cannot match any item via HTTP (all items have `categoryId=''`); cart-scope and item-scope discounts are unaffected; pure engine itself is correct; `packages/cart`'s `CartLineItem` also has no `categoryId` field, confirming this is a consistent design gap deferred to Phase 11 |
| `apps/api/src/contexts/audit/application/record-audit.service.ts`    | 6    | `// TODO(RES-future):`     | Warning  | `TODO` is a warning-level marker (not BLOCKER — blockers are `TBD`/`FIXME`/`XXX`). Reference `RES-future` is informal but file was modified in this phase to add ordering entries; marker pre-existed the phase                                                                                                     |

### Human Verification Required

None. All observable behaviors are verifiable by static analysis and the committed test suite.

### Gaps Summary

No blocking gaps. Phase goal is achieved.

Two warnings noted:

1. **categoryId gap (Warning):** `create-order.service.ts` hardcodes `categoryId: ''` when mapping cart items to domain, because `packages/cart`'s `CartLineItem` and the HTTP DTO `CartLineItemSchema` carry no `categoryId`. The `applyDiscount()` engine is pure and correct; category-scoped discounts will silently return 0 via HTTP until Phase 11 (promo codes) adds `categoryId` to the cart line item shape. This is a deferred wiring gap, not an engine incompleteness.

2. **Informal TODO reference (Warning):** `record-audit.service.ts` line 6 carries `// TODO(RES-future):` with a non-canonical ticket reference. File was touched by this phase. `TODO` markers are Warning-level (not Blocker) and the marker describes a future refactoring, not an incomplete deliverable.

Neither warning blocks the phase goal.

---

_Verified: 2026-06-15_
_Verifier: Claude (gsd-verifier)_
