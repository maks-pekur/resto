# Phase 7: Ordering - Research

**Researched:** 2026-06-14
**Domain:** DDD bounded context — Order aggregate, state machine, money/totals, discount engine, event/outbox wiring, DB schema
**Confidence:** HIGH

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01** Build the full domain state machine in one pass — all states (`created → paid → accepted → preparing → ready → completed`, plus `canceled`, `refunded`, `failed`) and their transition events — but only the `cart → Order → created` entry is reachable in Phase 7. No stub `paid` transition.
- **D-02** Order captures at creation: `fulfillment_mode` ∈ {`dine_in`, `pickup`, `delivery`}; `table` (dine-in); `customer_name` + `customer_phone` (pickup/delivery); human-readable `order_number`. Delivery address deferred to Phase 8/9.
- **D-03** Money is integer minor units (cents) throughout. Rounding is per-line then summed, not round-at-total.
- **D-04** `delivery_fee` and `service_fee` columns on `orders`, defaulting to 0. Formula: `subtotal + modifiers + delivery_fee + service_fee − discount = total`, complete now.
- **D-05** Pure domain discount function (no DB calls, no codes). Computes `percentage` and `fixed-amount` discounts at `cart / category / item` scope. Takes explicit extensible `discount-spec` input. Phase 11 adds promo codes and advanced mechanics without rewriting the engine.
- **D-06** ORD-11 is ALREADY SHIPPED: `outbox_events.claim_id` UUID column + scoped `releaseOutboxClaim` / `markOutboxDelivered` landed in migration `0047_outbox_claim_id.sql` and `packages/events/src/outbox/repository.ts`. Do NOT re-plan. Cosmetic residual: requirement says `claim_token`, shipped column is `claim_id`. Guard: `packages/events/test/integration/outbox-claim-ownership.spec.ts`.

### Claude's Discretion

Exact DB column types + indexes; idempotency-key format/TTL/scope; `order_number` generation scheme; the precise immutable-snapshot shape (which fields are frozen); event payload schemas; `scheduled_for` operating-hours validation source (ORD-12); state-machine code structure.

### Deferred Ideas (OUT OF SCOPE)

- Advanced promo mechanics (gift-item trigger, gift ladder, doubling) + promo codes → Phase 11
- Real payment / `paid` transition (Stripe Connect) → Phase 8
- Operator order intake transitions (`accepted → … → completed`) → Phase 10
- Delivery address capture + zone validation → Phase 8 / Phase 9
  </user_constraints>

<phase_requirements>

## Phase Requirements

| ID       | Description                                                                                                                                                  | Research Support                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| ORD-01   | New bounded context `ordering` at `apps/api/src/contexts/ordering/` with 4-layer DDD structure                                                               | §Standard Stack, §Architecture Patterns |
| ORD-02   | `Order` aggregate with full state machine (created→paid→accepted→preparing→ready→completed, canceled, refunded, failed)                                      | §Aggregate Pattern, §State Machine      |
| ORD-03   | Anonymous cart → Order conversion; no auth required                                                                                                          | §Cart Input, §HTTP Layer                |
| ORD-04   | Immutable snapshot of items/modifiers/prices at creation                                                                                                     | §Snapshot Pattern, §Catalog Read        |
| ORD-05   | Totals formula in domain layer with rounding                                                                                                                 | §Money and Totals                       |
| ORD-06   | DB tables (orders, order_items, order_modifiers, payments) with tenant_id + composite FK                                                                     | §DB Schema Pattern                      |
| ORD-07   | Event contracts: ordering.order_created.v1, ordering.order_paid.v1, ordering.order_canceled.v1, ordering.order_refunded.v1, ordering.order_status_changed.v1 | §Event / Outbox Wiring                  |
| ORD-08   | NATS subject `ordering.>` added to STREAM_SUBJECTS                                                                                                           | §Event / Outbox Wiring                  |
| ORD-09   | Order events subscribed by `audit` context                                                                                                                   | §Audit Wiring                           |
| ORD-10   | Idempotent order creation (client-provided idempotency key)                                                                                                  | §Idempotency                            |
| ORD-11   | `outbox_events.claim_token` (shipped as `claim_id`) — ALREADY DONE                                                                                           | §ORD-11 Status                          |
| ORD-12   | `orders.scheduled_for TIMESTAMPTZ NULL` with operating-hours validation                                                                                      | §ORD-12 and Operating Hours             |
| PROMO-06 | Pure domain discount engine, no DB calls                                                                                                                     | §Discount Engine                        |

</phase_requirements>

---

## Summary

Phase 7 creates `apps/api/src/contexts/ordering/` as a new 4-layer DDD bounded context following the exact structural pattern of the existing `tenancy` and `catalog` contexts. The research confirmed every pattern needed for this phase already exists in the codebase and can be copied verbatim — the aggregate pattern (`Tenant.aggregate.ts`), the outbox/event wiring (`tenant-drizzle.repository.ts` + `packages/events/src/outbox/repository.ts`), the audit subscription (`nats-audit-subscriber.ts`), and the module wiring (`catalog.module.ts`). No new infrastructure packages are required.

The `@resto/cart` package (`packages/cart/src/cart.ts`) is the exact input shape for order creation. It already uses string decimal prices and minor-unit helpers (`parseMinorUnits`, `formatMinorUnits`). However, the existing `MoneyAmount` type in `@resto/domain` stores money as a **decimal string** with `numeric(12,2)` Postgres backing — NOT as an integer in the DB layer. The D-03 decision to use "integer minor units" applies to the **in-memory computation** inside the domain (avoid floats), but stored columns remain `numeric(12,2)` to match the rest of the schema. The domain totals function works in integers (minor units) and converts to/from the string decimal at the boundary.

The only genuine gap is ORD-12 operating-hours validation: there is no `operating_hours` table or model in the current schema for brands or tenants. The SPEC mentions "Расписания работы" as an admin-panel capability but it has never been built. The planner must decide between (a) skip validation in Phase 7 — store `scheduled_for` column as plain nullable TIMESTAMPTZ, accept any future datetime, and flag the missing source — or (b) add a minimal hours model. Option (a) is correct given the deferred scope.

**Primary recommendation:** Mirror `catalog` context structure exactly; reuse `buildEnvelope` + `appendToOutbox` for event wiring; use `ScopedTx` + composite FK for all four new tables; hand-write migration 0049 following the 0048 pattern; add `ordering.>` audit subscription in `NatsAuditSubscriber` alongside the existing `tenancy.>` and `identity.>` subscriptions.

---

## Architectural Responsibility Map

| Capability                 | Primary Tier                                                       | Secondary Tier          | Rationale                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Cart → Order conversion    | API / Backend (ordering context)                                   | —                       | Business invariants (snapshot freeze, totals) live server-side; anonymous = no auth guard needed but still server-enforced |
| Order state machine        | API domain layer                                                   | —                       | Pure TypeScript aggregate, no framework; transitions are validated domain logic                                            |
| Discount calculation       | API domain layer (pure fn)                                         | —                       | D-05 mandates no DB calls; must be callable from Phase 8 checkout without touching infra                                   |
| Immutable price snapshot   | API domain layer (write) + DB (orders/order_items/order_modifiers) | —                       | Snapshot written at creation and never mutated; historical accuracy for orders                                             |
| Totals formula             | API domain layer                                                   | —                       | ORD-05 explicitly requires domain-layer calculation with rounding rules                                                    |
| Event publishing           | API infrastructure (outbox repository)                             | NATS + OutboxDispatcher | Follows transactional outbox pattern identical to catalog/tenancy                                                          |
| Audit wiring               | Audit context (NatsAuditSubscriber)                                | —                       | Subscribes to `ordering.>` just like `tenancy.>` and `identity.>`                                                          |
| DB persistence             | API infrastructure (order-drizzle.repository.ts)                   | packages/db schema      | Standard Drizzle + ScopedTx + RLS                                                                                          |
| Idempotency key storage    | DB (idempotency_keys table or unique index on orders)              | —                       | Prevents duplicate orders from client retries                                                                              |
| Operating-hours validation | MISSING — no data source exists yet                                | —                       | ORD-12 column exists; validation must be a no-op or accept-all in Phase 7                                                  |

---

## Standard Stack

### Core (no new packages needed)

| Library          | Version   | Purpose                                                        | Why Standard                                                 |
| ---------------- | --------- | -------------------------------------------------------------- | ------------------------------------------------------------ |
| `@nestjs/common` | 10.4.15   | Injectable, Module, Controller                                 | Project-locked NestJS monolith                               |
| `drizzle-orm`    | ^0.45.2   | DB queries via ScopedTx                                        | Only ORM in project; schema in `@resto/db`                   |
| `@resto/db`      | workspace | TenantAwareDb, ScopedTx, schema helpers                        | Single DB access point per ADR-0020                          |
| `@resto/events`  | workspace | buildEnvelope, appendToOutbox, defineEventContract, runDeduped | Event bus pattern; outbox already has claim_id (ORD-11 done) |
| `@resto/domain`  | workspace | MoneyAmount, Currency, branded IDs                             | Shared business types; adds new OrderId, OrderItemId         |
| `zod`            | ^3.24.1   | DTO schemas, event payload schemas                             | Universal validation                                         |

[VERIFIED: codebase — all packages confirmed in package.json and in use across existing contexts]

### No New Packages Required

The ordering context needs zero new npm packages. The full stack (NestJS, Drizzle, Zod, events, domain types) is already available. Adding `OrderId` and `OrderItemId` branded types to `packages/domain/src/ids.ts` is the only addition to shared packages.

### Package Legitimacy Audit

Not applicable — no new packages to install.

---

## Architecture Patterns

### System Architecture Diagram

```
Browser (apps/website / apps/qr-menu)
  │  POST /v1/orders  (anonymous; idempotency-key header)
  │  cart payload from @resto/cart store
  ▼
apps/api  TenantContextMiddleware  →  @Public() CreateOrderController
  │
  ▼
CreateOrderService.execute(input)
  ├─ Load published catalog snapshot (CatalogRepository.loadPublishedMenu or read
  │   item/modifier rows directly from DB to freeze prices)
  ├─ Order.create(input)  [pure aggregate — D-01]
  │     - validates fulfillment_mode, table/customer fields (D-02)
  │     - freezes item/modifier/price snapshot (ORD-04)
  │     - computes totals via applyDiscount() (D-03/04/05)
  │     - emits OrderCreatedEvent
  │     - status = 'created'
  ├─ OrderDrizzleRepository.save(order)
  │     - INSERT orders / order_items / order_modifiers in same tx
  │     - appendToOutbox(tx, buildEnvelope(OrderCreatedV1, payload))
  │     - ON CONFLICT on idempotency_key → return existing order (ORD-10)
  │
  ▼
outbox_events row (ordering.order_created.v1)
  │
  ▼  (OutboxDispatcher polls, claims, publishes)
NATS JetStream  ordering.>
  │
  ▼
NatsAuditSubscriber  (new subscription: ordering.>)
  runDeduped → RecordAuditService.fromEnvelopeWithTx
  ACTION_TARGET_KIND['ordering.order_created'] = 'order'
```

### Recommended Project Structure

```
apps/api/src/contexts/ordering/
├── ordering.module.ts              # NestJS module — wires providers
├── domain/
│   ├── order.aggregate.ts          # Order aggregate root (pure TS)
│   ├── ports.ts                    # OrderRepository + ORDER_REPOSITORY Symbol; DISCOUNT_ENGINE token
│   ├── errors.ts                   # OrderNotFoundError, DuplicateOrderKeyError, etc.
│   └── discount.ts                 # applyDiscount() pure fn + DiscountSpec discriminated union
├── application/
│   ├── create-order.service.ts     # execute({ cart, fulfillmentMode, ... }): OrderSnapshot
│   ├── get-order.service.ts        # execute({ orderId }): OrderSnapshot  [for status endpoint Phase 10]
│   └── dto.ts                      # CreateOrderInputSchema + Zod DTOs
├── infrastructure/
│   └── order-drizzle.repository.ts # Implements OrderRepository
└── interfaces/
    └── http/
        ├── orders.controller.ts    # POST /v1/orders (public, no auth)
        └── error-mapping.ts        # Domain errors → HTTP exceptions

packages/db/src/schema/ordering.ts  # orders, order_items, order_modifiers, payments tables
packages/db/migrations/0049_ordering_tables.sql
packages/events/src/contracts/ordering.ts  # 5 event contracts
```

### Pattern 1: Aggregate Root (mirror of Tenant)

```typescript
// Source: apps/api/src/contexts/tenancy/domain/tenant.aggregate.ts
export class Order {
  readonly #events: OrderDomainEvent[] = [];

  private constructor(private snapshot: OrderSnapshot) {}

  static fromSnapshot(snapshot: OrderSnapshot): Order {
    return new Order(snapshot);
  }

  static create(input: CreateOrderInput): Order {
    const id = OrderId.parse(randomUUID());
    const now = new Date();
    const snapshot: OrderSnapshot = {
      id,
      tenantId: input.tenantId,
      brandId: input.brandId,
      orderNumber: generateOrderNumber(input.brandDailySequence),
      status: 'created',
      fulfillmentMode: input.fulfillmentMode,
      table: input.table ?? null,
      customerName: input.customerName ?? null,
      customerPhone: input.customerPhone ?? null,
      items: input.items,           // frozen snapshot (ORD-04)
      subtotal: input.subtotal,     // computed in minor units (D-03)
      modifiersTotal: input.modifiersTotal,
      deliveryFee: 0,               // default 0 (D-04)
      serviceFee: 0,                // default 0 (D-04)
      discount: input.discount,     // from applyDiscount() (D-05)
      total: input.total,           // complete formula (D-04)
      currency: input.currency,
      idempotencyKey: input.idempotencyKey,
      scheduledFor: input.scheduledFor ?? null,  // ORD-12
      createdAt: now,
      updatedAt: now,
    };
    const order = new Order(snapshot);
    order.#events.push({ kind: 'OrderCreated', orderId: id, occurredAt: now });
    return order;
  }

  // All state transitions present in domain but without HTTP surface in Phase 7:
  markPaid(paymentId: string, now: Date = new Date()): void { ... }
  accept(now: Date = new Date()): void { ... }
  cancel(reason: string, now: Date = new Date()): void { ... }
  // etc. — full state machine, unreachable transitions domain-tested only

  toSnapshot(): OrderSnapshot { return this.snapshot; }
  pullEvents(): OrderDomainEvent[] {
    const events = [...this.#events];
    this.#events.length = 0;
    return events;
  }
}
```

[VERIFIED: codebase — mirrors `apps/api/src/contexts/tenancy/domain/tenant.aggregate.ts`]

### Pattern 2: Repository with Outbox Emit (mirror of TenantDrizzleRepository.save)

```typescript
// Source: apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts
async save(order: Order): Promise<void> {
  const snapshot = order.toSnapshot();
  const events = order.pullEvents();

  await this.db.withTenant(async (tx) => {
    // ON CONFLICT on idempotency_key for ORD-10
    await tx.insert(schema.orders).values({ ... })
      .onConflictDoNothing({ target: schema.orders.idempotencyKey });

    for (const item of snapshot.items) {
      await tx.insert(schema.orderItems).values({ ... });
    }
    for (const event of events) {
      await appendToOutbox(tx, {
        envelope: buildEnvelope(contractFor(event.kind), payloadFor(event)),
        aggregateId: snapshot.id,
      });
    }
  });
}
```

[VERIFIED: codebase — identical pattern used in tenant-drizzle.repository.ts lines 127-183]

### Pattern 3: Event Contract (mirror of tenancy.ts contracts)

```typescript
// Source: packages/events/src/contracts/tenancy.ts
// File to create: packages/events/src/contracts/ordering.ts

export const OrderCreatedV1Payload = z.object({
  orderId: OrderId,
  tenantId: TenantId,
  brandId: BrandId,
  orderNumber: z.string().min(1).max(20),
  fulfillmentMode: z.enum(['dine_in', 'pickup', 'delivery']),
  total: z.number().int().nonnegative(), // minor units
  currency: Currency,
  itemCount: z.number().int().positive(),
});

export const OrderCreatedV1 = defineEventContract({
  type: 'ordering.order_created.v1',
  payload: OrderCreatedV1Payload,
});
// Repeat for: order_paid, order_canceled, order_refunded, order_status_changed
```

[VERIFIED: codebase — defineEventContract pattern confirmed in packages/events/src/envelope.ts]

### Pattern 4: Audit Subscription Extension

```typescript
// Source: apps/api/src/contexts/audit/infrastructure/nats-audit-subscriber.ts
// Add alongside TENANCY_CONSUMER_NAME / IDENTITY_CONSUMER_NAME:

const ORDERING_CONSUMER_NAME = 'audit-recorder-ordering';
const ORDERING_SUBJECT = 'ordering.>';

// In onApplicationBootstrap, add to the loop:
{ subject: ORDERING_SUBJECT, durableName: ORDERING_CONSUMER_NAME }
```

```typescript
// Source: apps/api/src/contexts/audit/application/record-audit.service.ts
// Add to ACTION_TARGET_KIND map:
'ordering.order_created': 'order',
'ordering.order_paid': 'order',
'ordering.order_canceled': 'order',
'ordering.order_refunded': 'order',
'ordering.order_status_changed': 'order',
```

[VERIFIED: codebase — pattern confirmed in nats-audit-subscriber.ts and record-audit.service.ts]

### Pattern 5: Discount Engine (PROMO-06 — greenfield pure function)

```typescript
// File: apps/api/src/contexts/ordering/domain/discount.ts

// Extensible discriminated union — D-05, Phase 11 adds new kinds without rewriting
export type DiscountSpec =
  | { kind: 'percentage'; scope: 'cart'; value: number } // value = basis points (e.g. 1000 = 10%)
  | { kind: 'percentage'; scope: 'category'; categoryId: string; value: number }
  | { kind: 'percentage'; scope: 'item'; itemId: string; value: number }
  | { kind: 'fixed'; scope: 'cart'; amountMinorUnits: number }
  | {
      kind: 'fixed';
      scope: 'category';
      categoryId: string;
      amountMinorUnits: number;
    }
  | { kind: 'fixed'; scope: 'item'; itemId: string; amountMinorUnits: number };

// Pure function — no DB, no side effects (D-05)
export function applyDiscount(
  lines: readonly OrderLineDraft[],
  spec: DiscountSpec | null,
): number {
  // returns discount in minor units
  if (!spec) return 0;
  // ... per-kind/scope computation
  // Returns 0 if result < 0 (no negative discounts)
}
```

**Design rationale:** Using basis points (integer 1/100 of a percent) for percentage keeps the engine in pure integer arithmetic. Phase 11 extends `DiscountSpec` by adding new union members (e.g. `{ kind: 'gift_item'; ... }`) without touching existing logic. [ASSUMED — specific basis-points choice is planner discretion; the extensible union structure is the key design point]

### Pattern 6: Idempotent Order Creation (ORD-10)

No existing `idempotency-key` HTTP header pattern exists in the codebase (confirmed by grep). The established approach in `@resto/events` is the inbox `runDeduped` on the consumer side. For **HTTP-initiated** order creation, the canonical approach for this codebase is a unique constraint on `orders.idempotency_key` with `ON CONFLICT DO NOTHING RETURNING`, plus a follow-up SELECT to return the existing order if the insert was a no-op.

```typescript
// In OrderDrizzleRepository.save:
const result = await tx.insert(schema.orders)
  .values({ ..., idempotencyKey: snapshot.idempotencyKey })
  .onConflictDoNothing({ target: schema.orders.idempotencyKey })
  .returning({ id: schema.orders.id });

if (result.length === 0) {
  // Duplicate — return existing
  const existing = await tx.select().from(schema.orders)
    .where(eq(schema.orders.idempotencyKey, snapshot.idempotencyKey))
    .limit(1);
  return existing[0] ?? null;
}
```

[ASSUMED — no existing HTTP idempotency key pattern in codebase; this approach is consistent with the `ON CONFLICT DO NOTHING` pattern used in brand.save() for provisioning idempotency]

### Anti-Patterns to Avoid

- **Float arithmetic in totals:** `@resto/domain`'s `MoneyAmount` is a decimal string; the `money` Drizzle type is `numeric(12,2)`. Convert to integer minor units for ALL arithmetic inside the domain (multiply string by 100, compute, divide back to string for storage). Never use `parseFloat` on price strings.
- **Calling `runInTenantContext` in NATS subscribers:** ADR-0020 I-6 prohibits this. The audit subscriber uses `runDeduped` (which calls `db.withoutTenant` internally) — follow that pattern.
- **Building `EventEnvelope` literals with `randomUUID()` as `correlationId`:** Use `buildEnvelope(contract, payload)` from `@resto/events`. The helper reads from ALS/OTel context.
- **Querying `menu_items` directly without tenant filter:** Use `ScopedTx` (via `db.withTenant`). Never raw `tx.select()` on tenant-scoped tables.
- **Soft-delete confusion:** Orders are never hard-deleted. Status transitions (`canceled`, `refunded`) ARE the soft-delete. Do not add `archived_at` column to orders — use status.
- **Missing composite FK on child tables:** `order_items(order_id, tenant_id) → orders(id, tenant_id)` and `order_modifiers(order_item_id, tenant_id) → order_items(id, tenant_id)` are mandatory per ADR-0020 I-2. Both parent tables need `tenantParentUniqueIndex`.

---

## Don't Hand-Roll

| Problem                         | Don't Build                             | Use Instead                                                            | Why                                                 |
| ------------------------------- | --------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------- |
| Tenant isolation on DB reads    | Manual `WHERE tenant_id = ?`            | `ScopedTx` via `db.withTenant`                                         | RLS is only the second layer per ADR-0020 I-1       |
| Outbox correlation ID           | `correlationId: randomUUID()`           | `buildEnvelope(contract, payload)`                                     | Breaks OTel trace link; ESLint rule enforces        |
| NATS event dedup in consumers   | Manual `hasSeen` check                  | `runDeduped(db, envelope, consumerName, handler)`                      | Transactional dedup, single tx with side effects    |
| Composite FK on child tables    | Application-layer join with tenantId    | `compositeTenantFk()` helper                                           | Cross-tenant phantom rows without it (ADR-0020 I-2) |
| Float money arithmetic          | `parseFloat(price) * qty`               | `parseMinorUnits()` from `@resto/cart` (or inline equivalent)          | IEEE-754 precision loss on `0.1 + 0.2`              |
| UUID generation in domain       | `randomUUID()` directly in Order.create | `randomUUID()` from `node:crypto` IS fine for `id` (not correlationId) | Only correlationId must come from OTel              |
| Inbox dedup for event consumers | Custom three-tx wrapper                 | `runDeduped` from `@resto/events`                                      | At-most-once guarantee only with shared tx          |

---

## Money and Totals (ORD-05)

### How the codebase stores money

`packages/db/src/schema/_types.ts` defines `money` as `numeric(12,2)` — a decimal string at the Drizzle layer. `@resto/domain/src/money.ts` defines `MoneyAmount` as a Zod-branded decimal string regex (not integer).

`packages/cart/src/cart.ts` already has `parseMinorUnits(value: string): number` and `formatMinorUnits(minor: number): string` helpers that convert between decimal string and integer minor units.

### Implication for ORD-05

- **DB columns** (`base_price`, `price_delta`, `subtotal`, `total`, etc.): stored as `numeric(12,2)` via the `money()` Drizzle custom type — same as catalog prices. [VERIFIED: packages/db/src/schema/_types.ts]
- **In-memory computation** (D-03 "integer minor units"): convert decimal strings to integer minor units at the domain boundary, perform ALL arithmetic as integers (no floats), convert back to decimal string for persistence.
- **Rounding** (D-03 "per-line then summed"): round each `order_item` line cost to integer minor units (`Math.round(parseMinorUnits(unitPrice) + parseMinorUnits(modDelta))`) then sum. Do NOT sum decimals and round at the end.
- **Existing helpers**: `parseMinorUnits` and `formatMinorUnits` from `@resto/cart` are the right tools. The ordering context can import `@resto/cart` or replicate the two functions in `@resto/domain` as `toMinorUnits` / `fromMinorUnits`. [ASSUMED — whether to import `@resto/cart` from the API context or duplicate the functions; the planner should avoid cross-boundary import from a UI-focused package]

### Totals formula

```
subtotal       = Σ (round(item.unitPrice + Σ modifier.priceDelta) × quantity)  [per line, integer minor units]
modifiers_sum  = already included in subtotal lines above
delivery_fee   = 0 (default, Phase 8 populates)
service_fee    = 0 (default, Phase 8 populates)
discount       = applyDiscount(lines, spec)  [integer minor units]
total          = subtotal + delivery_fee + service_fee − discount
```

[VERIFIED: codebase — `parseMinorUnits` / `formatMinorUnits` logic confirmed in packages/cart/src/cart.ts]

---

## DB Schema Pattern (ORD-06)

### Next migration index

Latest migration is `0048_catalog_menu_versions.sql` (index 48 in `_journal.json`). New ordering tables go in migration `0049_ordering_tables.sql`. [VERIFIED: codebase — packages/db/migrations/ directory listing]

### Table design

```sql
-- packages/db/src/schema/ordering.ts

orders:
  id              UUID PK (gen_random_uuid())
  tenant_id       UUID NOT NULL → tenants(id) ON DELETE CASCADE
  brand_id        UUID NOT NULL
  idempotency_key TEXT NOT NULL  -- client-provided, UNIQUE per tenant
  order_number    TEXT NOT NULL  -- human-readable, e.g. 'A-042'
  status          TEXT NOT NULL  CHECK IN ('created','paid','accepted','preparing','ready','completed','canceled','refunded','failed')
  fulfillment_mode TEXT NOT NULL CHECK IN ('dine_in','pickup','delivery')
  table_identifier TEXT          -- for dine_in
  customer_name   TEXT           -- for pickup/delivery
  customer_phone  TEXT           -- for pickup/delivery
  subtotal        NUMERIC(12,2) NOT NULL
  delivery_fee    NUMERIC(12,2) NOT NULL DEFAULT 0
  service_fee     NUMERIC(12,2) NOT NULL DEFAULT 0
  discount        NUMERIC(12,2) NOT NULL DEFAULT 0
  total           NUMERIC(12,2) NOT NULL
  currency        TEXT NOT NULL  CHECK ~ '^[A-Z]{3}$'
  scheduled_for   TIMESTAMPTZ    -- ORD-12, nullable
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  -- NO archived_at: status = 'canceled'/'refunded' IS the soft-delete

  UNIQUE (tenant_id, idempotency_key)      -- ORD-10
  UNIQUE (id, tenant_id)                   -- tenantParentUniqueIndex — required for child composite FKs
  FK (brand_id, tenant_id) → brands(id, tenant_id)  -- compositeTenantFk

order_items:
  id              UUID PK
  tenant_id       UUID NOT NULL
  order_id        UUID NOT NULL
  menu_item_id    UUID NOT NULL  -- snapshot source id (informational)
  name_snapshot   TEXT NOT NULL  -- frozen name at creation (ORD-04)
  unit_price      NUMERIC(12,2) NOT NULL  -- frozen price at creation (ORD-04)
  quantity        SMALLINT NOT NULL DEFAULT 1
  line_total      NUMERIC(12,2) NOT NULL  -- unit_price * quantity (rounded per D-03)
  currency        TEXT NOT NULL
  sort_order      INTEGER NOT NULL DEFAULT 0

  FK (order_id, tenant_id) → orders(id, tenant_id)  -- compositeTenantFk (ADR-0020 I-2)
  UNIQUE (id, tenant_id)   -- tenantParentUniqueIndex for order_modifiers

order_modifiers:
  id              UUID PK
  tenant_id       UUID NOT NULL
  order_item_id   UUID NOT NULL
  option_id       UUID NOT NULL  -- informational (snapshot source)
  name_snapshot   TEXT NOT NULL  -- frozen modifier name (ORD-04)
  price_delta     NUMERIC(12,2) NOT NULL  -- frozen price delta (ORD-04)
  amount          SMALLINT NOT NULL DEFAULT 1
  modifier_group_id UUID        -- informational

  FK (order_item_id, tenant_id) → order_items(id, tenant_id)  -- compositeTenantFk

payments:
  id              UUID PK
  tenant_id       UUID NOT NULL
  order_id        UUID NOT NULL
  status          TEXT NOT NULL  CHECK IN ('pending','succeeded','failed','refunded')
  amount          NUMERIC(12,2) NOT NULL
  currency        TEXT NOT NULL
  provider        TEXT NOT NULL DEFAULT 'stripe'
  provider_payment_id TEXT       -- Stripe PaymentIntent id (Phase 8)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()

  FK (order_id, tenant_id) → orders(id, tenant_id)  -- compositeTenantFk
```

### RLS policy shape (follow 0048 pattern exactly)

```sql
-- For each new table:
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" FORCE ROW LEVEL SECURITY;
CREATE POLICY "orders_iso" ON "orders"
  USING (is_system_session() OR tenant_id = current_tenant_id())
  WITH CHECK (is_system_session() OR tenant_id = current_tenant_id());
```

[VERIFIED: codebase — 0048_catalog_menu_versions.sql pattern confirmed]

---

## Event / Outbox Wiring (ORD-07, ORD-08)

### NATS subject already registered

`ordering.>` is already in `STREAM_SUBJECTS` inside `apps/api/src/infrastructure/nats.module.ts` (line 29). ORD-08 is a no-op in Phase 7. [VERIFIED: codebase — nats.module.ts confirmed]

### Event contracts to create

File: `packages/events/src/contracts/ordering.ts`

Five contracts mirroring `tenancy.ts` format:

1. `ordering.order_created.v1` — emitted on every new order (the only reachable event in Phase 7)
2. `ordering.order_paid.v1` — Phase 8 (domain has the transition; no HTTP surface yet)
3. `ordering.order_canceled.v1` — Phase 10 or Phase 8 refund
4. `ordering.order_refunded.v1` — Phase 8
5. `ordering.order_status_changed.v1` — generic transition event for `accepted/preparing/ready/completed`

Payload for `ordering.order_created.v1` should include: `orderId`, `tenantId`, `brandId`, `orderNumber`, `fulfillmentMode`, `total` (minor units), `currency`, `itemCount`. NOT customer PII (name, phone) — audit rows store metadata, not PII. [ASSUMED — PII exclusion from event payload is a privacy design choice consistent with GDPR minimisation; planner should confirm]

### buildEnvelope call site

```typescript
// In OrderDrizzleRepository.save(), inside the withTenant tx:
const envelope = buildEnvelope(OrderCreatedV1, {
  orderId: snapshot.id,
  tenantId: snapshot.tenantId,
  // ...
});
await appendToOutbox(tx, { envelope, aggregateId: snapshot.id });
```

[VERIFIED: codebase — identical pattern at tenant-drizzle.repository.ts:182]

---

## Audit Wiring (ORD-09)

### What needs to change in `audit` context

1. **`nats-audit-subscriber.ts`**: Add a third subscription loop entry for `ordering.>` with durable consumer name `'audit-recorder-ordering'`. Copy the `TENANCY_CONSUMER_NAME` block exactly.
2. **`record-audit.service.ts`**: Add 5 entries to `ACTION_TARGET_KIND`:
   - `'ordering.order_created': 'order'`
   - `'ordering.order_paid': 'order'`
   - `'ordering.order_canceled': 'order'`
   - `'ordering.order_refunded': 'order'`
   - `'ordering.order_status_changed': 'order'`
3. **`audit-record.ts` `targetId` resolver**: Add an `'order'` branch that extracts `payload.orderId`.

[VERIFIED: codebase — record-audit.service.ts lines 7-28 and 63-84 show the exact extension points]

---

## ORD-11 Status (ALREADY SHIPPED)

`outbox_events.claim_id UUID` column: confirmed in `packages/db/src/schema/outbox.ts` line 64 and `packages/db/migrations/0047_outbox_claim_id.sql`. `releaseOutboxClaim` and `markOutboxDelivered` both accept `claimId: string` and scope their WHERE clauses to `eq(schema.outboxEvents.claimId, claimId)` — confirmed in `packages/events/src/outbox/repository.ts` lines 119-153. The planner should mark ORD-11 satisfied (with the cosmetic `claim_id` vs `claim_token` note) and add no implementation tasks for it. [VERIFIED: codebase]

---

## Cart Input (ORD-03, ORD-04)

The `@resto/cart` package (`packages/cart/src/cart.ts`) defines:

```typescript
interface CartLineItem {
  readonly itemId: string;
  readonly sizeId: string | null;
  readonly name: string;
  readonly unitPrice: string; // decimal string, e.g. '12.50'
  readonly currency: string;
  readonly modifiers: readonly CartModifier[];
  quantity: number;
}

interface CartModifier {
  readonly optionId: string;
  readonly name: string;
  readonly priceDelta: string; // decimal string, e.g. '1.50'
  readonly modifierGroupId?: string;
  readonly amount?: number;
}
```

The `CreateOrderInput` DTO at the HTTP boundary consumes exactly this shape plus:

- `fulfillmentMode: 'dine_in' | 'pickup' | 'delivery'`
- `table?: string` (for dine_in)
- `customerName?: string` (for pickup/delivery)
- `customerPhone?: string` (for pickup/delivery)
- `idempotencyKey: string` (client-generated UUID, ORD-10)
- `scheduledFor?: string` (ISO datetime, ORD-12)
- `discountSpec?: DiscountSpec` (optional discount to apply, PROMO-06)

**Snapshot freeze (ORD-04):** The `name`, `unitPrice`, `currency`, and each modifier's `name` + `priceDelta` from the cart payload ARE the snapshot. The cart already carries the values the guest saw at browse time. The application service does NOT need to re-query catalog prices — the cart IS the snapshot input. However, the service MAY optionally verify that items are still published (stop-list check) before creating the order. [ASSUMED — whether to validate stop-list at order creation is a planner decision; the research confirms no forced re-read is needed for price accuracy]

[VERIFIED: codebase — packages/cart/src/cart.ts confirmed]

---

## Idempotency (ORD-10)

No existing HTTP-level idempotency key pattern exists in `apps/api`. The inbox `runDeduped` pattern handles NATS consumer dedup only.

**Recommended approach:** Client sends `Idempotency-Key: <uuid>` HTTP header (or as a body field). The `orders` table carries a `UNIQUE (tenant_id, idempotency_key)` constraint. On `INSERT ... ON CONFLICT DO NOTHING RETURNING id`, if no row is returned (conflict), the repository fetches the existing row. This is the same pattern as `BrandDrizzleRepository.save()` using `onConflictDoNothing`. Key scope: per-tenant (two different tenants may use the same client-generated UUID — they get independent orders).

TTL: no TTL needed at the DB layer. Old keys accumulate but orders are never deleted (no DELETE privilege). This is acceptable — idempotency keys are UUIDs per order, not a rolling window. [ASSUMED — TTL decision is planner discretion; no cleanup mechanism currently exists in codebase for order data]

---

## ORD-12 and Operating Hours

**Finding:** There is NO operating hours model in the current codebase. The SPEC §3.1 mentions "Расписания работы (обычное, праздничное, технологические перерывы)" under admin panel functionality, but this has never been built. The `brands` table has no `operating_hours` column. The `tenants` table has no schedule. [VERIFIED: codebase — grep for `operating_hours`, `operatingHours`, `opening_hours` returned zero results in schema files]

**Implication for ORD-12:** The `scheduled_for TIMESTAMPTZ NULL` column should be added to the `orders` table as specified. However, in Phase 7, operating-hours **validation** must be a no-op (accept any future datetime without checking against a schedule). The column is a data-model commitment for Phase 9 (Delivery Zones) and SITE-07 (scheduled order time). The planner should add a code comment (WHY: no operating-hours source yet — validation deferred to when schedule model exists) to the validation bypass site. This is the one place in Phase 7 where a WHY-comment is genuinely warranted.

[VERIFIED: codebase — zero operating_hours references; confirmed gap]

---

## Order Number Generation (D-02, Planner Discretion)

No existing order number generation in the codebase. Options: (a) Postgres sequence per brand, (b) random alphanumeric, (c) `<brand-prefix>-<daily-counter>`. Given the constraint that `resto_app` role cannot do DDL, a simple approach is a DB sequence per-tenant or a combination of date + UUID prefix for human readability. [ASSUMED — specific scheme is planner discretion per CONTEXT.md]

A practical pattern that requires no new sequence per brand: `<YYYY><MM><DD>-<5-random-alphanum>` (e.g. `20260614-A7K3P`). Collision probability over 1000 orders/day: essentially zero. Phase 10 (Admin Order Intake) needs the number to be readable and sortable. Lexicographic sort of the date prefix makes this work.

---

## Discount Engine (PROMO-06)

Confirmed: no existing discount code anywhere in the codebase (grep for `discount` returns zero application-code hits in ordering-related files). The engine is entirely greenfield.

**Design for extensibility (D-05):**

```typescript
// packages/domain is the right home for DiscountSpec type (pure type, no infra)
// OR: apps/api/src/contexts/ordering/domain/discount.ts (if ordering-only for now)

// Discriminated union — add new members in Phase 11 without breaking existing arms
export type DiscountSpec =
  | {
      readonly kind: 'percentage';
      readonly scope: 'cart';
      readonly pct: number;
    }
  | {
      readonly kind: 'percentage';
      readonly scope: 'category';
      readonly categoryId: string;
      readonly pct: number;
    }
  | {
      readonly kind: 'percentage';
      readonly scope: 'item';
      readonly itemId: string;
      readonly pct: number;
    }
  | {
      readonly kind: 'fixed';
      readonly scope: 'cart';
      readonly amountMinorUnits: number;
    }
  | {
      readonly kind: 'fixed';
      readonly scope: 'category';
      readonly categoryId: string;
      readonly amountMinorUnits: number;
    }
  | {
      readonly kind: 'fixed';
      readonly scope: 'item';
      readonly itemId: string;
      readonly amountMinorUnits: number;
    };

// All-or-nothing list for Phase 11 extensions (gift_item, ladder, doubling)
// Phase 11 adds: | { readonly kind: 'gift_item'; ... }
// Phase 11 adds: | { readonly kind: 'ladder'; ... }
```

**Pure function signature:**

```typescript
export function applyDiscount(
  lines: readonly { itemId: string; categoryId: string; lineTotal: number }[],
  spec: DiscountSpec | null,
): number; // returns discount in minor units, always >= 0
```

Phase 8 checkout calls this function by passing the discount spec from a promo code or automatic rule. Phase 11 extends the union and adds new computation arms.

[VERIFIED: codebase — no existing discount code confirmed; design is consistent with SPEC §3.1 "Скидки (% и фикс) на товар / категорию / корзину"]

---

## Common Pitfalls

### Pitfall 1: Float Arithmetic on Prices

**What goes wrong:** `parseFloat('12.50') + parseFloat('1.50')` = `14.000000000002` in some JS engines.
**Why it happens:** IEEE-754 double precision; `0.1 + 0.2 !== 0.3`.
**How to avoid:** Use `parseMinorUnits(str): number` from `@resto/cart` (confirmed in codebase) to convert to integers before any arithmetic. All totals computed as integers.
**Warning signs:** Test with `'0.10' + '0.20'` — expected `0.30`, got `0.30000000000000004`.

### Pitfall 2: Skipping `tenantParentUniqueIndex` on parent tables

**What goes wrong:** Child tables' `compositeTenantFk` silently fails at migration time or at runtime if the parent doesn't expose `UNIQUE (id, tenant_id)`.
**Why it happens:** `compositeTenantFk` requires the referenced columns to be a unique key on the parent.
**How to avoid:** Add `tenantParentUniqueIndex('orders', { id: table.id, tenantId: table.tenantId })` to the `orders` table constraints. Add it to `order_items` too (so `order_modifiers` can reference it).
**Warning signs:** Postgres constraint error on migration: `there is no unique constraint matching given keys for referenced table "orders"`.

### Pitfall 3: Missing `withTenant` on order reads

**What goes wrong:** A controller reads `order_items` with a plain `tx.select()` and skips the tenant filter. RLS catches it in tests but may not in misconfured scenarios.
**Why it happens:** Easy to forget when the controller has the orderId in the URL and "knows" which order it is.
**How to avoid:** ALL reads on `orders`, `order_items`, `order_modifiers` must go through `ScopedTx` via `db.withTenant()` with `eq(table.tenantId, ctx.tenantId)` added explicitly.

### Pitfall 4: Using `runInTenantContext` in the audit subscriber

**What goes wrong:** Concurrent NATS messages bind the wrong tenant's context to an async chain.
**Why it happens:** ALS bind in NATS subscriber is not request-scoped.
**How to avoid:** The audit subscriber uses `runDeduped` which internally calls `db.withoutTenant` — follow the existing `nats-audit-subscriber.ts` pattern exactly.

### Pitfall 5: Event payload carrying customer PII

**What goes wrong:** `customer_phone` or `customer_name` end up in `outbox_events.payload` → NATS → audit log. GDPR erasure would need to scrub event payloads.
**Why it happens:** Convenient to put all order data in the event payload.
**How to avoid:** Event payloads carry aggregate-level metadata only (orderId, total, currency, itemCount, fulfillmentMode). PII lives ONLY in the `orders` table which is covered by the tenant erasure pipeline.

### Pitfall 6: Discount engine receiving decimal strings instead of minor units

**What goes wrong:** `applyDiscount` receives `'12.50'` and computes `12.50 * 0.10 = 1.25` as a float. Then `Math.round(1.25) = 1` (banker's rounding) instead of `Math.round(1250 * 0.10) = 125` minor units.
**Why it happens:** Mixing decimal strings and minor-unit integers in the engine.
**How to avoid:** Convert ALL prices to minor units BEFORE calling `applyDiscount`. The function signature takes `lineTotal: number` (minor units), never decimal strings.

### Pitfall 7: Duplicate OrderId when `pullEvents()` drains twice

**What goes wrong:** `order.pullEvents()` is called in the repository THEN again in a test assertion — second call returns an empty array.
**Why it happens:** `pullEvents()` intentionally drains the internal events array (see `Tenant.pullEvents()` pattern).
**How to avoid:** Call `pullEvents()` exactly once in the repository before persisting. Tests should inspect the snapshot or the outbox rows, not call `pullEvents()` on the aggregate after the repo has drained it.

---

## Code Examples

### Verified Drizzle Pattern: ScopedTx with composite FK tables

```typescript
// Source: packages/db/src/schema/menu.ts (menuItemSizes table)
export const orderItems = pgTable(
  'order_items',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    orderId: uuid('order_id').notNull(),
    // ...
  },
  (table) => [
    foreignKey({
      name: 'order_items_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    compositeTenantFk({
      name: 'order_items_order_fk',
      child: { id: table.orderId, tenantId: table.tenantId },
      parent: { id: orders.id, tenantId: orders.tenantId },
    }).onDelete('cascade'),
    tenantParentUniqueIndex('order_items', {
      id: table.id,
      tenantId: table.tenantId,
    }),
  ],
);
```

### Verified Pattern: Zod DTO triple-export

```typescript
// Source: packages/events/src/contracts/tenancy.ts + CONVENTIONS.md
export const CreateOrderInputSchema = z.object({
  items: z.array(CartLineItemSchema).min(1),
  fulfillmentMode: z.enum(['dine_in', 'pickup', 'delivery']),
  table: z.string().max(20).optional(),
  customerName: z.string().max(200).optional(),
  customerPhone: z.string().max(30).optional(),
  idempotencyKey: z.string().uuid(),
  scheduledFor: z.string().datetime().optional(),
  discountSpec: DiscountSpecSchema.optional(),
});
export type CreateOrderInput = z.infer<typeof CreateOrderInputSchema>;
export class CreateOrderInputDto extends createZodDto(CreateOrderInputSchema) {}
```

### Verified Pattern: Module registration in AppModule

```typescript
// Source: apps/api/src/app.module.ts
// Add to imports array:
import { OrderingModule } from './contexts/ordering/ordering.module';
// ...
@Module({
  imports: [
    // ... existing
    OrderingModule,  // add here
  ],
})
```

---

## State of the Art

| Old Approach                                  | Current Approach                                        | Impact on Phase 7                                            |
| --------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| Manual `WHERE tenant_id = ?` on every query   | `ScopedTx` auto-injects + RLS double-enforcement        | All 4 new tables must use `db.withTenant`                    |
| Direct `EventEnvelope` construction           | `buildEnvelope(contract, payload)` helper               | All 5 ordering event emits use `buildEnvelope`               |
| Three-tx inbox dedup (`hasSeen/handler/mark`) | `runDeduped` (single tx, transactional dedup)           | Audit subscriber for `ordering.>` uses `runDeduped`          |
| `claim_token` in ORD-11 requirement           | Shipped as `claim_id` (migration 0047)                  | No action needed; ORD-11 is satisfied                        |
| Decimal float arithmetic for money            | Integer minor-unit arithmetic + `numeric(12,2)` storage | Ordering domain works in integers; stores as decimal strings |

**Deprecated/outdated:**

- `withInboxDedup` / `InboxTracker` three-transaction wrapper: removed (see CLAUDE.md for packages/events). Do not reference in any Phase 7 implementation.

---

## Assumptions Log

| #   | Claim                                                                                                          | Section              | Risk if Wrong                                                                                                                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Percentage values in `DiscountSpec` use basis points (integer) to avoid floats in the pure fn                  | §Discount Engine     | Low — planner can choose any integer representation; the key design point (integer, no floats) is verified                                                                                                                                                       |
| A2  | Idempotency key stored as `TEXT NOT NULL` on `orders` with `UNIQUE (tenant_id, idempotency_key)`               | §Idempotency         | Low — alternative is a separate table, but unique constraint is simpler and sufficient                                                                                                                                                                           |
| A3  | Cart values (name, unitPrice) are the snapshot input for ORD-04; no catalog re-read required                   | §Cart Input          | Medium — if prices change between cart load and order submit (without cache invalidation), order may freeze stale prices. Acceptable per product decision (cart price = what guest saw); Phase 8 checkout can add a freshness check                              |
| A4  | Event payloads for ordering events must NOT carry PII (customer_name, customer_phone)                          | §Event/Outbox Wiring | Medium — if payloads need to carry PII for downstream consumers (e.g. Phase 8 guest notifications), the audit log and erasure pipeline need to handle it. Current architecture (PII only in orders table, events carry IDs) is consistent with GDPR minimisation |
| A5  | `applyDiscount` lives in `ordering/domain/discount.ts` (not in `packages/domain`)                              | §Discount Engine     | Low — moving it to `packages/domain` later is a pure refactor; the function signature is the contract                                                                                                                                                            |
| A6  | `order_number` format is planner discretion — e.g. date-prefix + random alphanumeric                           | §Order Number        | Low — any human-readable unique-per-brand scheme works; no downstream system depends on the format in Phase 7                                                                                                                                                    |
| A7  | `@resto/cart`'s `parseMinorUnits` / `formatMinorUnits` should NOT be imported into `apps/api` (cross-boundary) | §Money and Totals    | Low — the functions are two-liners that can be duplicated or extracted to `@resto/domain`                                                                                                                                                                        |

---

## Open Questions

1. **`order_number` uniqueness scope**
   - What we know: D-02 requires a human-readable `order_number`. No existing pattern.
   - What's unclear: Should it be unique per brand, per tenant, or per day? Is it used to communicate to kitchen staff (where collision = bad) or just for guest reference?
   - Recommendation: Unique per brand per day with a Postgres sequence or `(brand_id, date, counter)` composite — but this requires a per-brand sequence or a counter table. The planner should decide format; a date-prefix + 5-char random alphanum is the simplest option that avoids a sequence table.

2. **Stop-list check at order creation time**
   - What we know: The catalog context maintains `menu_stop_list`. `GetMenuAvailabilityService` already exists.
   - What's unclear: Should `CreateOrderService` reject orders containing stopped items, or let the order through and let the operator handle it (with a warning)?
   - Recommendation: For Phase 7 (no operator intake yet in Phase 10), validate at creation and return a 422 with `code: 'order.item_unavailable'` if any item is on the stop-list. Requires one cross-context read.

3. **Currency source for order**
   - What we know: The cart carries `currency` on each `CartLineItem`. The brand has `defaultCurrency`. The tenant has `defaultCurrency`.
   - What's unclear: Which wins if they disagree? (Should never happen in practice, but needs explicit resolution.)
   - Recommendation: Trust the brand's `defaultCurrency` as the authoritative source (read from brand snapshot at order creation). Validate that all cart item currencies match the brand currency; reject if not. This prevents cross-currency orders.

4. **`payments` table scope in Phase 7**
   - What we know: Phase 8 wires Stripe. Phase 7 creates the `payments` table schema.
   - What's unclear: Should Phase 7 INSERT a `payments` row with `status='pending'` at order creation, or leave that to Phase 8?
   - Recommendation: Phase 7 creates the table schema only. No `payments` row is inserted until Phase 8 initiates a payment intent. The `payments` table exists in schema but is empty.

---

## Environment Availability

| Dependency           | Required By              | Available      | Version   | Fallback                          |
| -------------------- | ------------------------ | -------------- | --------- | --------------------------------- |
| PostgreSQL 16 (dev)  | DB migrations + ScopedTx | ✓ (via Docker) | 16.x      | —                                 |
| NATS JetStream (dev) | Event publishing         | ✓ (via Docker) | NATS 2.10 | NATS_DISABLED=true for unit tests |
| pnpm                 | Package installation     | ✓              | 9.15.0    | —                                 |
| Node.js              | Runtime                  | ✓              | >=22.22.1 | —                                 |

No new external dependencies. All required infrastructure is part of the existing dev stack.

---

## Validation Architecture

### Test Framework

| Property           | Value                                                                |
| ------------------ | -------------------------------------------------------------------- |
| Framework          | Vitest 2.1.8                                                         |
| Config file        | `packages/db/vitest.config.ts` (integration), per-app vitest configs |
| Quick run command  | `pnpm nx run api:test --testPathPattern=ordering`                    |
| Full suite command | `pnpm nx affected --target=test`                                     |

### Phase Requirements → Test Map

| Req ID   | Behavior                                  | Test Type   | Automated Command                                                                 | File Exists?                   |
| -------- | ----------------------------------------- | ----------- | --------------------------------------------------------------------------------- | ------------------------------ |
| ORD-02   | Order state machine transitions           | unit        | `pnpm vitest run apps/api/src/contexts/ordering/domain/order.aggregate.spec.ts`   | ❌ Wave 0                      |
| ORD-05   | Totals formula + rounding                 | unit        | `pnpm vitest run apps/api/src/contexts/ordering/domain/order.aggregate.spec.ts`   | ❌ Wave 0                      |
| ORD-06   | RLS isolation on orders table             | integration | `pnpm vitest run packages/db/test/integration/tenant-isolation.spec.ts`           | ✅ (needs ordering rows added) |
| ORD-10   | Idempotent creation rejects duplicate key | integration | `pnpm vitest run apps/api/test/integration/create-order-idempotency.spec.ts`      | ❌ Wave 0                      |
| PROMO-06 | Discount engine pure fn                   | unit        | `pnpm vitest run apps/api/src/contexts/ordering/domain/discount.spec.ts`          | ❌ Wave 0                      |
| ORD-11   | Already guarded                           | integration | `pnpm vitest run packages/events/test/integration/outbox-claim-ownership.spec.ts` | ✅ shipped                     |

### Wave 0 Gaps

- [ ] `apps/api/src/contexts/ordering/domain/order.aggregate.spec.ts` — covers ORD-02, ORD-05 (state transitions, totals, rounding)
- [ ] `apps/api/src/contexts/ordering/domain/discount.spec.ts` — covers PROMO-06 (all 6 discount spec variants)
- [ ] `apps/api/test/integration/create-order-idempotency.spec.ts` — covers ORD-10 (duplicate key → same order returned)
- [ ] Add `orders` / `order_items` rows to `packages/db/test/integration/tenant-isolation.spec.ts` — covers ORD-06

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category         | Applies | Standard Control                                                                                          |
| --------------------- | ------- | --------------------------------------------------------------------------------------------------------- |
| V2 Authentication     | no      | ORD-03 explicitly anonymous; `@Public()` on create endpoint                                               |
| V3 Session Management | no      | No session for anonymous orders                                                                           |
| V4 Access Control     | yes     | RLS + ScopedTx ensures tenant isolation on all order reads                                                |
| V5 Input Validation   | yes     | `CreateOrderInputSchema` (Zod) validates all fields; `RestoZodValidationPipe` per-parameter at controller |
| V6 Cryptography       | no      | No new cryptographic operations                                                                           |

### Known Threat Patterns for this stack

| Pattern                                              | STRIDE          | Standard Mitigation                                                                                                          |
| ---------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Cross-tenant order read                              | Info disclosure | RLS + ScopedTx double-enforcement                                                                                            |
| Negative discount manipulation                       | Tampering       | `applyDiscount` returns `Math.max(0, computed)` — discount ≥ 0 always                                                        |
| Float overflow in totals                             | Tampering       | Integer minor-unit arithmetic caps at `Number.MAX_SAFE_INTEGER` for `numeric(12,2)` (max 9,999,999,999.99 = ~1T minor units) |
| Client sending mismatched currency across cart items | Tampering       | Validate all items carry brand's `defaultCurrency` at service layer                                                          |
| Idempotency key collision across tenants             | Spoofing        | Unique constraint scoped to `(tenant_id, idempotency_key)` — cross-tenant collision is harmless                              |
| PII in event payloads                                | Info disclosure | Payloads carry only aggregate IDs + non-PII metadata (ORD-07 payload design)                                                 |

---

## Sources

### Primary (HIGH confidence)

- `apps/api/src/contexts/tenancy/domain/tenant.aggregate.ts` — aggregate pattern (private ctor, fromSnapshot, pullEvents, state transitions)
- `apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts` — repository save pattern with outbox emit in same tx
- `apps/api/src/contexts/audit/infrastructure/nats-audit-subscriber.ts` — audit subscription loop pattern
- `apps/api/src/contexts/audit/application/record-audit.service.ts` — ACTION_TARGET_KIND extension points
- `packages/events/src/contracts/tenancy.ts` — defineEventContract pattern
- `packages/events/src/outbox/repository.ts` — appendToOutbox, claimOutboxBatch, releaseOutboxClaim, markOutboxDelivered (ORD-11 confirmed shipped)
- `packages/events/src/envelope.ts` — buildEnvelope, defineEventContract
- `packages/db/src/schema/_columns.ts` — tenantIdColumn, compositeTenantFk, tenantParentUniqueIndex helpers
- `packages/db/src/schema/menu.ts` — RLS + composite FK pattern (all tables with tenant_id)
- `packages/db/src/schema/outbox.ts` — outboxEvents with claim_id column (ORD-11)
- `packages/db/src/schema/_types.ts` — money custom type = `numeric(12,2)` decimal string
- `packages/cart/src/cart.ts` — CartLineItem / CartModifier shape + parseMinorUnits / formatMinorUnits
- `packages/db/migrations/0048_catalog_menu_versions.sql` — RLS policy pattern to replicate for ordering tables
- `packages/db/migrations/meta/_journal.json` — latest index is 48; next migration is 0049
- `apps/api/src/infrastructure/nats.module.ts` — STREAM_SUBJECTS confirms `ordering.>` already present (ORD-08 no-op)
- `apps/api/src/app.module.ts` — module registration location for OrderingModule
- `apps/api/src/contexts/catalog/catalog.module.ts` — complete module wiring pattern to mirror

### Secondary (MEDIUM confidence)

- `.planning/phases/07-ordering/07-CONTEXT.md` — locked decisions confirmed in full
- `.planning/REQUIREMENTS.md` — ORD-01..12 + PROMO-06 requirement text
- `.planning/codebase/ARCHITECTURE.md`, `CONVENTIONS.md`, `STRUCTURE.md` — architectural constraints
- `SPEC.md §3.1` — "Скидки (% и фикс) на товар / категорию / корзину" — confirms Phase 7 discount scope
- `packages/domain/CLAUDE.md`, `packages/db/CLAUDE.md`, `packages/events/CLAUDE.md` — invariants

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all confirmed in running codebase; no new packages
- Architecture (4-layer DDD, event/outbox, audit wiring): HIGH — exact patterns exist in catalog/tenancy contexts
- DB schema design: HIGH — all helpers confirmed; migration index confirmed as 0049
- Money/totals: HIGH — decimal string storage confirmed; minor-unit arithmetic approach confirmed from cart package
- ORD-11 status: HIGH — code confirmed shipped in outbox/repository.ts and migration 0047
- Operating-hours gap (ORD-12): HIGH — confirmed NOT present in any schema file
- Discount engine: HIGH for structure; ASSUMED for specific representational choices (basis points)
- Idempotency: MEDIUM — pattern is consistent with codebase but no exact precedent for HTTP idempotency keys

**Research date:** 2026-06-14
**Valid until:** 2026-07-14 (stable stack)
