---
phase: 07-ordering
plan: 05
subsystem: api
tags: [nestjs, ordering, audit, nats, postgres, rls, vitest]

requires:
  - phase: 07-04
    provides: CreateOrderService, GetOrderService, OrderDrizzleRepository, CreateOrderInputDto, OrderResponseSchema, all domain errors (OrderNotFoundError, DuplicateOrderKeyError, OrderItemUnavailableError, InvalidOrderTransitionError)

provides:
  - Anonymous POST /v1/orders endpoint (@Public + @RequireActiveTenant) with per-param RestoZodValidationPipe and wrapWith(mapOrderError)
  - OrderingModule wiring ORDER_REPOSITORY + CreateOrderService + GetOrderService + OrdersController, registered in app.module.ts
  - audit context subscribes to ordering.> via durable consumer audit-recorder-ordering
  - ACTION_TARGET_KIND extended with 5 ordering.* → 'order' entries; targetId resolver handles payload.orderId
  - orders + order_items folded into tenant-isolation.spec.ts cross-tenant denial net (ORD-06)
  - Mandatory NATS-independent RecordAuditService projection test (ordering-audit-projection.spec.ts) asserting audit_log row with target_id === orderId

affects: [08-payments, audit, ordering]

tech-stack:
  added: []
  patterns:
    - '@Public() + @RequireActiveTenant() on anonymous but tenant-gated endpoints'
    - 'wrapWith(mapOrderError) controller try-catch; error-mapping returns err unchanged for unknown'
    - 'Per-parameter RestoZodValidationPipe(@Body) not global pipe'
    - 'Audit subscriber: runDeduped path, never runInTenantContext (ADR-0020 I-6)'
    - 'NATS-independent projection test: feed EventEnvelope to RecordAuditService.fromEnvelopeWithTx inside db.withoutTenant; assert audit_log row directly'

key-files:
  created:
    - apps/api/src/contexts/ordering/interfaces/http/error-mapping.ts
    - apps/api/src/contexts/ordering/interfaces/http/orders.controller.ts
    - apps/api/src/contexts/ordering/ordering.module.ts
    - apps/api/test/integration/ordering-audit-projection.spec.ts
  modified:
    - apps/api/src/app.module.ts
    - apps/api/src/contexts/audit/infrastructure/nats-audit-subscriber.ts
    - apps/api/src/contexts/audit/application/record-audit.service.ts
    - apps/api/src/contexts/audit/infrastructure/nats-audit-subscriber.ts
    - packages/db/test/integration/tenant-isolation.spec.ts
    - apps/api/test/unit/audit/nats-audit-subscriber.spec.ts

key-decisions:
  - "ORD-09 proven by NATS-independent RecordAuditService.fromEnvelopeWithTx projection test; no disjunctive 'audit row OR outbox row' fallback"
  - 'Controller return type narrowed to Promise<{orderId, orderNumber}> (matching CreateOrderService output) while @ApiCreatedResponse({type: OrderResponseDto}) preserves OpenAPI docs'
  - 'NatsAuditSubscriber unit test count updated from 2 to 3 (Rule 1 auto-fix) after ordering.> subscription added'

patterns-established:
  - 'Anonymous HTTP endpoints: @Public() + @RequireActiveTenant() + wrapWith(domain-error-mapper) + per-param RestoZodValidationPipe'
  - 'Audit subscription expansion: add CONSUMER_NAME + SUBJECT constants, append {subject, durableName} to loop array; never add runInTenantContext'
  - 'ACTION_TARGET_KIND expansion: add event-type-prefix → targetKind entries; add targetType branch in targetId resolver IIFE'
  - 'Integration test for audit projections: db.withoutTenant seed tenant, call service.fromEnvelopeWithTx, db.withoutTenant read audit_log'

requirements-completed: [ORD-01, ORD-03, ORD-07, ORD-09]

duration: ~90min
completed: 2026-06-15
---

# Phase 07 Plan 05: Integration Wave — HTTP Surface, Audit Wiring, Isolation Net

**Anonymous POST /v1/orders controller wired end-to-end with OrderingModule, audit context extended to subscribe ordering.> events and project audit rows, orders/order_items folded into cross-tenant isolation net, and mandatory NATS-independent ORD-09 audit projection test added**

## Performance

- **Duration:** ~90 min
- **Started:** 2026-06-14T21:40:00Z
- **Completed:** 2026-06-15T00:00:00Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Surfaced the ordering context over HTTP: anonymous `POST /v1/orders` with `@Public()` + `@RequireActiveTenant()` (404 on unresolved tenant), per-param `RestoZodValidationPipe`, domain error mapping (409 duplicate, 422 unavailable, 404 not-found, 409 invalid-transition), and `wrapWith(mapOrderError)` — satisfying ORD-01 and ORD-03
- `OrderingModule` registered in `app.module.ts`; api builds and typechecks clean with the full wiring
- `audit` context extended to subscribe `ordering.>` via durable consumer `audit-recorder-ordering`; `ACTION_TARGET_KIND` gains five `ordering.* → 'order'` entries; `targetId` resolver handles `payload.orderId` — satisfying ORD-07 and ORD-09
- `orders` and `order_items` tables folded into `tenant-isolation.spec.ts` cross-tenant denial matrix (ORD-06): SELECT returns zero rows for tenant B, INSERT with mismatched composite FK is rejected
- Mandatory ORD-09 audit projection test (`ordering-audit-projection.spec.ts`) feeds `ordering.order_created.v1` envelope directly through `RecordAuditService.fromEnvelopeWithTx` and asserts exactly one `audit_log` row with `target_id === orderId` — NATS-timing-independent, no disjunctive fallback

## Task Commits

1. **Task 1: orders.controller + error-mapping + OrderingModule + app.module registration** — `1e3d2ce` (feat)
2. **Task 2: audit wiring — ordering.> subscription + ACTION_TARGET_KIND + 'order' targetId branch** — `a04d16f` (feat)
3. **Task 3: tenant-isolation rows + mandatory audit-projection test + DLQ count update** — `82f48ef` (test)

## Files Created/Modified

- `apps/api/src/contexts/ordering/interfaces/http/error-mapping.ts` — domain error → NestJS HttpException mapper (4 error types; returns err unchanged for unknown)
- `apps/api/src/contexts/ordering/interfaces/http/orders.controller.ts` — anonymous POST /v1/orders with @Public, @RequireActiveTenant, per-param Zod pipe, wrapWith
- `apps/api/src/contexts/ordering/ordering.module.ts` — NestJS module wiring ORDER_REPOSITORY + 2 services + controller
- `apps/api/src/app.module.ts` — added OrderingModule import after CatalogModule
- `apps/api/src/contexts/audit/infrastructure/nats-audit-subscriber.ts` — third subscription entry: ordering.> / audit-recorder-ordering
- `apps/api/src/contexts/audit/application/record-audit.service.ts` — 5 ACTION_TARGET_KIND entries + 'order' targetId branch (payload.orderId)
- `packages/db/test/integration/tenant-isolation.spec.ts` — orders + order_items cross-tenant denial cases (ORD-06)
- `apps/api/test/integration/ordering-audit-projection.spec.ts` — mandatory NATS-independent ORD-09 projection test (2 test cases)
- `apps/api/test/unit/audit/nats-audit-subscriber.spec.ts` — DLQ count updated 2 → 3 (Rule 1 auto-fix)

## Decisions Made

- Controller return type is `Promise<{ orderId: string; orderNumber: string }>` (matches `CreateOrderService.execute` output), not `Promise<OrderResponseDto>` — `@ApiCreatedResponse({ type: OrderResponseDto })` preserves OpenAPI docs without a compile-time lie
- ORD-09 audit projection test is fully NATS-independent: invokes `RecordAuditService.fromEnvelopeWithTx` directly inside `db.withoutTenant`, no broker round-trip; the mandatory requirement admits no disjunctive fallback

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated NatsAuditSubscriber unit test DLQ count**

- **Found during:** Task 3
- **Issue:** `nats-audit-subscriber.spec.ts` asserted `toHaveLength(2)` in both test cases; after adding the `ordering.>` subscription in Task 2, the subscriber now registers 3 consumers; the test was correctly covering the old state but broke by the correct Task 2 change
- **Fix:** Updated both `toHaveLength(2)` calls to `toHaveLength(3)`
- **Files modified:** `apps/api/test/unit/audit/nats-audit-subscriber.spec.ts`
- **Verification:** Full api test suite passes (428 tests across 60 files)
- **Committed in:** `82f48ef` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug)
**Impact on plan:** Required for test correctness. No scope creep.

## Issues Encountered

- **TypeScript error — Promise<OrderResponseDto> return type mismatch:** `OrderResponseDto` includes `status`, `total`, `currency` but `CreateOrderService.execute` only returns `{ orderId, orderNumber }`. Fixed by narrowing the TypeScript return type annotation while keeping `@ApiCreatedResponse({ type: OrderResponseDto })` for OpenAPI only.
- **`eq is not a function` in projection test:** Initial import was `import { eq, schema } from '@resto/db'` but `@resto/db` does not re-export `eq` from drizzle-orm. Fixed by splitting to separate imports.
- **`TenantId` branded type required in `EventEnvelope.tenantId`:** `EventEnvelope.tenantId` is typed as `TenantId | null` (Zod-branded string); passing `randomUUID()` as plain string fails tsc. Fixed by importing `TenantId` from `@resto/domain` and wrapping with `TenantId.parse(tenantId)`.
- **Pre-commit hook (typecheck) rejected the first commit attempt** for the TenantId error; fixed and re-committed successfully without `--no-verify`.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 07 is fully complete: schema (02), catalog integration (03), application+infrastructure layer (04), integration wave (05) all committed and passing
- `POST /v1/orders` accepts anonymous requests and creates orders end-to-end
- Audit records `ordering.order_created` rows with correct `target_id = orderId` — proven by NATS-independent test
- Phase 08 (Payments) can start immediately; ordering context is the hard prerequisite

---

_Phase: 07-ordering_
_Completed: 2026-06-15_
