# Phase 7: Ordering — Pattern Map

**Mapped:** 2026-06-14
**Files analyzed:** 19 new/modified files
**Analogs found:** 17 / 19 (2 greenfield: discount engine, domain events union)

---

## File Classification

| New / Modified File                                                         | Role               | Data Flow        | Closest Analog                                                              | Match Quality |
| --------------------------------------------------------------------------- | ------------------ | ---------------- | --------------------------------------------------------------------------- | ------------- |
| `apps/api/src/contexts/ordering/domain/order.aggregate.ts`                  | aggregate          | event-driven     | `apps/api/src/contexts/tenancy/domain/tenant.aggregate.ts`                  | exact         |
| `apps/api/src/contexts/ordering/domain/ports.ts`                            | port definitions   | —                | `apps/api/src/contexts/catalog/domain/ports.ts`                             | exact         |
| `apps/api/src/contexts/ordering/domain/errors.ts`                           | domain errors      | —                | `apps/api/src/contexts/tenancy/domain/errors.ts`                            | exact         |
| `apps/api/src/contexts/ordering/domain/discount.ts`                         | pure function      | transform        | —                                                                           | greenfield    |
| `apps/api/src/contexts/ordering/application/create-order.service.ts`        | service            | request-response | `apps/api/src/contexts/catalog/application/upsert-item.service.ts`          | exact         |
| `apps/api/src/contexts/ordering/application/get-order.service.ts`           | service            | request-response | `apps/api/src/contexts/catalog/application/upsert-item.service.ts`          | role-match    |
| `apps/api/src/contexts/ordering/application/dto.ts`                         | DTO / schema       | —                | `apps/api/src/contexts/catalog/application/dto.ts`                          | role-match    |
| `apps/api/src/contexts/ordering/infrastructure/order-drizzle.repository.ts` | repository         | CRUD             | `apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts` | exact         |
| `apps/api/src/contexts/ordering/interfaces/http/orders.controller.ts`       | controller         | request-response | `apps/api/src/contexts/catalog/interfaces/http/public-menu.controller.ts`   | role-match    |
| `apps/api/src/contexts/ordering/interfaces/http/error-mapping.ts`           | error mapping      | —                | `apps/api/src/contexts/catalog/interfaces/http/error-mapping.ts`            | exact         |
| `apps/api/src/contexts/ordering/ordering.module.ts`                         | NestJS module      | —                | `apps/api/src/contexts/catalog/catalog.module.ts`                           | exact         |
| `apps/api/src/contexts/audit/infrastructure/nats-audit-subscriber.ts`       | MODIFY subscriber  | event-driven     | self (add third entry)                                                      | exact         |
| `apps/api/src/contexts/audit/application/record-audit.service.ts`           | MODIFY audit map   | —                | self (add 5 entries + 'order' branch)                                       | exact         |
| `packages/db/src/schema/ordering.ts`                                        | DB schema          | CRUD             | `packages/db/src/schema/menu.ts`                                            | exact         |
| `packages/db/migrations/0049_ordering_tables.sql`                           | migration          | —                | `packages/db/migrations/0048_catalog_menu_versions.sql`                     | exact         |
| `packages/db/migrations/meta/_journal.json`                                 | MODIFY journal     | —                | self (append idx 49 entry)                                                  | exact         |
| `packages/events/src/contracts/ordering.ts`                                 | event contracts    | event-driven     | `packages/events/src/contracts/tenancy.ts`                                  | exact         |
| `packages/domain/src/ids.ts`                                                | MODIFY branded IDs | —                | self (add OrderId, OrderItemId)                                             | role-match    |
| `apps/api/src/app.module.ts`                                                | MODIFY app module  | —                | self (add OrderingModule import)                                            | exact         |

---

## Pattern Assignments

### `apps/api/src/contexts/ordering/domain/order.aggregate.ts`

**Analog:** `apps/api/src/contexts/tenancy/domain/tenant.aggregate.ts`

**Imports pattern** (lines 1–13):

```typescript
import { randomUUID } from 'node:crypto';
import { TenantId, type Currency } from '@resto/domain';
import type { OrderDomainEvent } from './events';
import { InvalidOrderTransitionError, OrderNotFoundError } from './errors';
```

**Snapshot interface + status union** (lines 18–46):

```typescript
export type OrderStatus =
  | 'created'
  | 'paid'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'completed'
  | 'canceled'
  | 'refunded'
  | 'failed';

export interface OrderSnapshot {
  readonly id: OrderId;
  readonly tenantId: TenantId;
  readonly brandId: string;
  readonly idempotencyKey: string;
  readonly orderNumber: string;
  readonly status: OrderStatus;
  readonly fulfillmentMode: 'dine_in' | 'pickup' | 'delivery';
  readonly tableIdentifier: string | null;
  readonly customerName: string | null;
  readonly customerPhone: string | null;
  readonly items: readonly OrderItemSnapshot[];
  readonly subtotal: string; // numeric(12,2) decimal string
  readonly deliveryFee: string; // default '0.00'
  readonly serviceFee: string; // default '0.00'
  readonly discount: string; // default '0.00'
  readonly total: string;
  readonly currency: Currency;
  readonly scheduledFor: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
```

**Class skeleton: private constructor + fromSnapshot + create + pullEvents** (lines 65–113, mirror exactly):

```typescript
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
      idempotencyKey: input.idempotencyKey,
      orderNumber: input.orderNumber,
      status: 'created',
      fulfillmentMode: input.fulfillmentMode,
      tableIdentifier: input.tableIdentifier ?? null,
      customerName: input.customerName ?? null,
      customerPhone: input.customerPhone ?? null,
      items: input.items,
      subtotal: input.subtotal,
      deliveryFee: '0.00',
      serviceFee: '0.00',
      discount: input.discount,
      total: input.total,
      currency: input.currency,
      scheduledFor: input.scheduledFor ?? null,
      createdAt: now,
      updatedAt: now,
    };
    const order = new Order(snapshot);
    order.#events.push({ kind: 'OrderCreated', orderId: id, occurredAt: now });
    return order;
  }

  // Full state machine — all transitions present in domain; unreachable via HTTP in Phase 7:
  markPaid(_paymentId: string, _now: Date = new Date()): void {
    /* Phase 8 */
  }
  accept(_now: Date = new Date()): void {
    /* Phase 10 */
  }
  cancel(_reason: string, _now: Date = new Date()): void {
    /* Phase 10 */
  }
  refund(_now: Date = new Date()): void {
    /* Phase 8 */
  }
  startPreparing(_now: Date = new Date()): void {
    /* Phase 10 */
  }
  markReady(_now: Date = new Date()): void {
    /* Phase 10 */
  }
  complete(_now: Date = new Date()): void {
    /* Phase 10 */
  }
  markFailed(_reason: string, _now: Date = new Date()): void {
    /* Phase 8 */
  }

  toSnapshot(): OrderSnapshot {
    return this.snapshot;
  }

  pullEvents(): OrderDomainEvent[] {
    const events = [...this.#events];
    this.#events.length = 0;
    return events;
  }
}
```

**State guard pattern** (mirror of `archive()` / `suspend()` in tenant.aggregate.ts lines 115–147):

```typescript
cancel(reason: string, now: Date = new Date()): void {
  if (this.snapshot.status !== 'created' && this.snapshot.status !== 'paid') {
    throw new InvalidOrderTransitionError(this.snapshot.id, this.snapshot.status, 'canceled');
  }
  this.snapshot = { ...this.snapshot, status: 'canceled', updatedAt: now };
  this.#events.push({ kind: 'OrderCanceled', orderId: this.snapshot.id, reason, occurredAt: now });
}
```

---

### `apps/api/src/contexts/ordering/domain/ports.ts`

**Analog:** `apps/api/src/contexts/catalog/domain/ports.ts`

**Symbol-keyed port pattern** (lines 53–66 of catalog/domain/ports.ts):

```typescript
import type { OrderSnapshot } from './order.aggregate';

export interface OrderRepository {
  save(order: Order): Promise<void>;
  findById(id: OrderId): Promise<Order | null>;
  findByIdempotencyKey(tenantId: TenantId, key: string): Promise<Order | null>;
}

export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');
```

No other Symbol tokens needed in Phase 7. The discount engine is a pure function — no DI token required.

---

### `apps/api/src/contexts/ordering/domain/errors.ts`

**Analog:** `apps/api/src/contexts/tenancy/domain/errors.ts`

**Error class pattern** (lines 8–27):

```typescript
export class OrderNotFoundError extends Error {
  constructor(public readonly orderId: string) {
    super(`Order "${orderId}" was not found.`);
    this.name = 'OrderNotFoundError';
  }
}

export class DuplicateOrderKeyError extends Error {
  constructor(public readonly idempotencyKey: string) {
    super(`Order with idempotency key "${idempotencyKey}" already exists.`);
    this.name = 'DuplicateOrderKeyError';
  }
}

export class InvalidOrderTransitionError extends Error {
  constructor(
    public readonly orderId: string,
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Cannot transition order "${orderId}" from "${from}" to "${to}".`);
    this.name = 'InvalidOrderTransitionError';
  }
}

export class OrderItemUnavailableError extends Error {
  constructor(public readonly itemId: string) {
    super(`Menu item "${itemId}" is on the stop-list and cannot be ordered.`);
    this.name = 'OrderItemUnavailableError';
  }
}
```

Note: catalog uses a `kind` discriminant on a union `CatalogDomainError`. Ordering can use the same pattern (add `readonly kind: 'OrderNotFoundError'` etc.) to enable exhaustive switching in `error-mapping.ts`. Mirror whichever approach is used by the catalog context.

---

### `apps/api/src/contexts/ordering/domain/discount.ts`

**Analog:** none — greenfield pure function

**Pattern to use** (derived from D-05, PROMO-06, RESEARCH.md §Discount Engine):

```typescript
// Discriminated union — extensible; Phase 11 appends new kind members
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

export interface OrderLineDraft {
  readonly itemId: string;
  readonly categoryId: string;
  readonly lineTotal: number; // minor units (integer), already rounded per D-03
}

// Pure — no DB, no side effects (D-05)
// Returns discount in minor units; always >= 0 (negative discount clamped to 0)
export function applyDiscount(
  lines: readonly OrderLineDraft[],
  spec: DiscountSpec | null,
): number {
  if (!spec) return 0;
  // ... per kind/scope arms
  return Math.max(0, computed);
}
```

`pct` is a plain integer percentage (e.g. `10` = 10%). Using basis points is a planner option but integer percentage is simpler and sufficient for Phase 7 PROMO-06 scope. Clarify in PLAN before coding.

---

### `apps/api/src/contexts/ordering/application/create-order.service.ts`

**Analog:** `apps/api/src/contexts/catalog/application/upsert-item.service.ts`

**Imports + `@Injectable` + single `execute()` pattern** (lines 1–65):

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { ORDER_REPOSITORY, type OrderRepository } from '../domain/ports';
import { Order } from '../domain/order.aggregate';
import { applyDiscount } from '../domain/discount';
import { formatMinorUnits, parseMinorUnits } from '../domain/money-utils';
import type { CreateOrderInput } from './dto';

@Injectable()
export class CreateOrderService {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly repo: OrderRepository,
  ) {}

  async execute(
    input: CreateOrderInput,
  ): Promise<{ orderId: string; orderNumber: string }> {
    const ctx = requireTenantContext();
    // ... compute totals, call Order.create(), call repo.save()
    return {
      orderId: order.toSnapshot().id,
      orderNumber: order.toSnapshot().orderNumber,
    };
  }
}
```

The service uses `requireTenantContext()` to pick up `tenantId` from ALS (set by `TenantContextMiddleware`) — mirror of `upsert-item.service.ts` lines 18–19.

---

### `apps/api/src/contexts/ordering/application/dto.ts`

**Analog:** `apps/api/src/contexts/catalog/application/dto.ts` (pattern), `packages/events/src/contracts/tenancy.ts` (Zod triple-export shape)

**Triple-export DTO pattern** (from CONVENTIONS.md + RESEARCH.md):

```typescript
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { DiscountSpecSchema } from '../domain/discount';

const CartModifierSchema = z.object({
  optionId: z.string().uuid(),
  name: z.string().min(1).max(200),
  priceDelta: z.string().regex(/^-?\d+(\.\d{1,2})?$/),
  modifierGroupId: z.string().uuid().optional(),
  amount: z.number().int().positive().optional(),
});

const CartLineItemSchema = z.object({
  itemId: z.string().uuid(),
  sizeId: z.string().uuid().nullable(),
  name: z.string().min(1).max(200),
  unitPrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
  modifiers: z.array(CartModifierSchema),
  quantity: z.number().int().positive(),
});

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

All three exports (Schema / type / Dto class) are required per CONVENTIONS.md DTO/Schema pattern.

---

### `apps/api/src/contexts/ordering/infrastructure/order-drizzle.repository.ts`

**Analog:** `apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts`

**Imports + `@Injectable` + constructor** (lines 1–22 of analog):

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext, schema, TenantAwareDb, type RestoTx } from '@resto/db';
import {
  appendToOutbox,
  buildEnvelope,
  OrderCreatedV1,
  type EventEnvelope,
} from '@resto/events';
import { eq } from 'drizzle-orm';
import { Order, type OrderSnapshot } from '../domain/order.aggregate';
import { OrderNotFoundError } from '../domain/errors';
import type { OrderDomainEvent } from '../domain/events';
import type { OrderRepository } from '../domain/ports';

@Injectable()
export class OrderDrizzleRepository implements OrderRepository {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}
```

**`save()` with idempotency + child inserts + outbox emit in one tx** (mirror of lines 122–191 of analog):

```typescript
async save(order: Order): Promise<void> {
  const snapshot = order.toSnapshot();
  const events = order.pullEvents();

  await this.db.withTenant(async (tx) => {
    // ORD-10: ON CONFLICT on (tenant_id, idempotency_key) — returns nothing on duplicate
    const result = await tx
      .insert(schema.orders)
      .values({
        id: snapshot.id,
        tenantId: snapshot.tenantId,
        brandId: snapshot.brandId,
        idempotencyKey: snapshot.idempotencyKey,
        orderNumber: snapshot.orderNumber,
        status: snapshot.status,
        fulfillmentMode: snapshot.fulfillmentMode,
        tableIdentifier: snapshot.tableIdentifier,
        customerName: snapshot.customerName,
        customerPhone: snapshot.customerPhone,
        subtotal: snapshot.subtotal,
        deliveryFee: snapshot.deliveryFee,
        serviceFee: snapshot.serviceFee,
        discount: snapshot.discount,
        total: snapshot.total,
        currency: snapshot.currency,
        scheduledFor: snapshot.scheduledFor,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
      })
      .onConflictDoNothing({ target: [schema.orders.tenantId, schema.orders.idempotencyKey] })
      .returning({ id: schema.orders.id });

    if (result.length === 0) return; // idempotent: already exists, no outbox re-emit

    for (const item of snapshot.items) {
      await tx.insert(schema.orderItems).values({ ... });
      for (const mod of item.modifiers) {
        await tx.insert(schema.orderModifiers).values({ ... });
      }
    }

    for (const event of events) {
      await appendToOutbox(tx, { envelope: domainEventToEnvelope(event), aggregateId: snapshot.id });
    }
  });
}
```

**`domainEventToEnvelope` switch** (mirror of lines 325–392 of analog):

```typescript
const domainEventToEnvelope = (event: OrderDomainEvent): EventEnvelope => {
  switch (event.kind) {
    case 'OrderCreated':
      return buildEnvelope(
        OrderCreatedV1,
        {
          orderId: event.orderId,
          tenantId: event.tenantId,
          brandId: event.brandId,
          orderNumber: event.orderNumber,
          fulfillmentMode: event.fulfillmentMode,
          total: event.totalMinorUnits,
          currency: event.currency,
          itemCount: event.itemCount,
        },
        { tenantId: event.tenantId, occurredAt: event.occurredAt },
      );
    // Other events have no HTTP surface in Phase 7 but must be handled
    // so the switch is exhaustive when Phase 8/10 add their domain events
  }
};
```

**`findById`** (mirror of `loadById` / `loadByIdWithTx` pattern, lines 255–298):

```typescript
async findById(id: OrderId): Promise<Order | null> {
  const ctx = requireTenantContext();
  return this.db.withTenant(async (tx) => {
    const rows = await tx
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, id))
      .limit(1);
    // ADR-0020 I-1: ScopedTx auto-applies tenant filter; explicit eq also mandatory
    const row = rows[0];
    if (!row) return null;
    const items = await tx
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.orderId, id));
    // ... reconstruct snapshot and return Order.fromSnapshot(snapshot)
  });
}
```

---

### `apps/api/src/contexts/ordering/interfaces/http/orders.controller.ts`

**Analog:** `apps/api/src/contexts/catalog/interfaces/http/public-menu.controller.ts` (for `@Public()`) + `apps/api/src/contexts/catalog/interfaces/http/catalog.controller.ts` (for `wrapWith` + `RestoZodValidationPipe`)

**Imports + class scaffold** (from public-menu.controller.ts lines 1–16 and 125–135):

```typescript
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { RestoZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { Public, RequireActiveTenant } from '../../../../shared/auth';
import { wrapWith } from '../../../../shared/api/wrap';
import {
  CreateOrderInputDto,
  OrderResponseSchema,
} from '../../application/dto';
import { CreateOrderService } from '../../application/create-order.service';
import { mapOrderError } from './error-mapping';

const wrap = wrapWith(mapOrderError);

class OrderResponseDto extends createZodDto(OrderResponseSchema) {}

@ApiTags('ordering')
@Public()
@Controller('v1/orders')
export class OrdersController {
  constructor(
    @Inject(CreateOrderService)
    private readonly createOrder: CreateOrderService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireActiveTenant()
  @ApiBody({ type: CreateOrderInputDto })
  @ApiCreatedResponse({ type: OrderResponseDto })
  create(
    @Body(new RestoZodValidationPipe(CreateOrderInputDto))
    input: CreateOrderInputDto,
    @Headers('idempotency-key') _headerKey?: string,
  ): Promise<OrderResponseDto> {
    return wrap(() => this.createOrder.execute(input));
  }
}
```

Key points: `@Public()` is required (ORD-03 — anonymous, no auth). `@RequireActiveTenant()` still required so 404 is returned when no tenant resolves from host. `RestoZodValidationPipe` is per-parameter (CONVENTIONS.md Validation section).

---

### `apps/api/src/contexts/ordering/interfaces/http/error-mapping.ts`

**Analog:** `apps/api/src/contexts/catalog/interfaces/http/error-mapping.ts`

**Pattern** (lines 1–107 of analog, adapted for ordering errors):

```typescript
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  DuplicateOrderKeyError,
  InvalidOrderTransitionError,
  OrderItemUnavailableError,
  OrderNotFoundError,
} from '../../domain/errors';

export const mapOrderError = (err: unknown): unknown => {
  if (err instanceof OrderNotFoundError) {
    return new NotFoundException({
      code: 'ordering.order_not_found',
      message: err.message,
    });
  }
  if (err instanceof DuplicateOrderKeyError) {
    return new ConflictException({
      code: 'ordering.duplicate_idempotency_key',
      message: err.message,
    });
  }
  if (err instanceof OrderItemUnavailableError) {
    return new UnprocessableEntityException({
      code: 'ordering.item_unavailable',
      message: err.message,
    });
  }
  if (err instanceof InvalidOrderTransitionError) {
    return new ConflictException({
      code: 'ordering.invalid_transition',
      message: err.message,
    });
  }
  return err;
};
```

Note: `mapOrderError` must return `err` unchanged for unknown errors (the `ProblemDetailsFilter` handles them upstream). Do NOT throw inside the mapper.

---

### `apps/api/src/contexts/ordering/ordering.module.ts`

**Analog:** `apps/api/src/contexts/catalog/catalog.module.ts` (lines 1–73)

**Full module pattern**:

```typescript
import { Module } from '@nestjs/common';
import { ORDER_REPOSITORY } from './domain/ports';
import { OrderDrizzleRepository } from './infrastructure/order-drizzle.repository';
import { CreateOrderService } from './application/create-order.service';
import { GetOrderService } from './application/get-order.service';
import { OrdersController } from './interfaces/http/orders.controller';

@Module({
  controllers: [OrdersController],
  providers: [
    { provide: ORDER_REPOSITORY, useClass: OrderDrizzleRepository },
    CreateOrderService,
    GetOrderService,
  ],
})
export class OrderingModule {}
```

---

### `apps/api/src/contexts/audit/infrastructure/nats-audit-subscriber.ts` (MODIFY)

**Analog:** self — add one entry to the existing `for...of` array at lines 42–45

**Exact insertion point** (lines 19–45 of the file):

```typescript
// Add after IDENTITY_CONSUMER_NAME / IDENTITY_SUBJECT:
const ORDERING_CONSUMER_NAME = 'audit-recorder-ordering';
const ORDERING_SUBJECT = 'ordering.>';

// In onApplicationBootstrap, extend the array at line 42:
for (const cfg of [
  { subject: TENANCY_SUBJECT, durableName: TENANCY_CONSUMER_NAME },
  { subject: IDENTITY_SUBJECT, durableName: IDENTITY_CONSUMER_NAME },
  { subject: ORDERING_SUBJECT, durableName: ORDERING_CONSUMER_NAME },  // ADD
]) {
```

No other changes to this file.

---

### `apps/api/src/contexts/audit/application/record-audit.service.ts` (MODIFY)

**Analog:** self — two surgical edits

**Edit 1: `ACTION_TARGET_KIND` map** (after line 27, before closing `}`):

```typescript
  // ordering context — Phase 7
  'ordering.order_created': 'order',
  'ordering.order_paid': 'order',
  'ordering.order_canceled': 'order',
  'ordering.order_refunded': 'order',
  'ordering.order_status_changed': 'order',
```

**Edit 2: `targetId` resolver in `project()` method** (after the `'user'` branch at lines 78–83):

```typescript
if (targetType === 'order') {
  return typeof payload.orderId === 'string' && payload.orderId.length > 0
    ? payload.orderId
    : null;
}
```

---

### `packages/db/src/schema/ordering.ts`

**Analog:** `packages/db/src/schema/menu.ts`

**Imports** (mirror of menu.ts lines 1–28):

```typescript
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { money } from './_types';
import {
  compositeTenantFk,
  pkUuid,
  tenantIdColumn,
  tenantParentUniqueIndex,
} from './_columns';
import { tenants } from './tenants';
import { brands } from './brands';
```

**`orders` table** (mirror of `menuCategories` pattern, lines 30–67 of menu.ts):

```typescript
export const orders = pgTable(
  'orders',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    brandId: uuid('brand_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    orderNumber: text('order_number').notNull(),
    status: text('status').notNull(),
    fulfillmentMode: text('fulfillment_mode').notNull(),
    tableIdentifier: text('table_identifier'),
    customerName: text('customer_name'),
    customerPhone: text('customer_phone'),
    subtotal: money('subtotal').notNull(),
    deliveryFee: money('delivery_fee').notNull().default('0.00'),
    serviceFee: money('service_fee').notNull().default('0.00'),
    discount: money('discount').notNull().default('0.00'),
    total: money('total').notNull(),
    currency: text('currency').notNull(),
    scheduledFor: timestamp('scheduled_for', {
      withTimezone: true,
      mode: 'date',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    foreignKey({
      name: 'orders_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    compositeTenantFk({
      name: 'orders_brand_fk',
      child: { id: table.brandId, tenantId: table.tenantId },
      parent: { id: brands.id, tenantId: brands.tenantId },
    }).onDelete('restrict'),
    uniqueIndex('orders_idempotency_key_uq').on(
      table.tenantId,
      table.idempotencyKey,
    ), // ORD-10
    // ADR-0020 I-2: parent unique index required for order_items compositeTenantFk
    tenantParentUniqueIndex('orders', {
      id: table.id,
      tenantId: table.tenantId,
    }),
    check(
      'orders_status_chk',
      sql`${table.status} IN ('created','paid','accepted','preparing','ready','completed','canceled','refunded','failed')`,
    ),
    check(
      'orders_fulfillment_mode_chk',
      sql`${table.fulfillment_mode} IN ('dine_in','pickup','delivery')`,
    ),
  ],
);
```

**`orderItems` table** (child of `orders`; `tenantParentUniqueIndex` required so `orderModifiers` can reference it):

```typescript
export const orderItems = pgTable(
  'order_items',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    orderId: uuid('order_id').notNull(),
    menuItemId: uuid('menu_item_id').notNull(), // snapshot source id
    nameSnapshot: text('name_snapshot').notNull(), // frozen at creation (ORD-04)
    unitPrice: money('unit_price').notNull(), // frozen at creation (ORD-04)
    quantity: smallint('quantity').notNull().default(1),
    lineTotal: money('line_total').notNull(), // per-line rounded (D-03)
    currency: text('currency').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
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

**`orderModifiers` table** (child of `orderItems`):

```typescript
export const orderModifiers = pgTable(
  'order_modifiers',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    orderItemId: uuid('order_item_id').notNull(),
    optionId: uuid('option_id').notNull(),
    nameSnapshot: text('name_snapshot').notNull(),
    priceDelta: money('price_delta').notNull(),
    amount: smallint('amount').notNull().default(1),
    modifierGroupId: uuid('modifier_group_id'),
  },
  (table) => [
    foreignKey({
      name: 'order_modifiers_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    compositeTenantFk({
      name: 'order_modifiers_order_item_fk',
      child: { id: table.orderItemId, tenantId: table.tenantId },
      parent: { id: orderItems.id, tenantId: orderItems.tenantId },
    }).onDelete('cascade'),
  ],
);
```

**`payments` table** (schema only; no rows inserted in Phase 7):

```typescript
export const payments = pgTable(
  'payments',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    orderId: uuid('order_id').notNull(),
    status: text('status').notNull(),
    amount: money('amount').notNull(),
    currency: text('currency').notNull(),
    provider: text('provider').notNull().default('stripe'),
    providerPaymentId: text('provider_payment_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    foreignKey({
      name: 'payments_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    compositeTenantFk({
      name: 'payments_order_fk',
      child: { id: table.orderId, tenantId: table.tenantId },
      parent: { id: orders.id, tenantId: orders.tenantId },
    }).onDelete('cascade'),
    check(
      'payments_status_chk',
      sql`${table.status} IN ('pending','succeeded','failed','refunded')`,
    ),
  ],
);
```

Do NOT use `timestampsColumns()` helper on orders/payments — orders have no `archived_at` (status is the soft-delete, per anti-patterns in RESEARCH.md).

---

### `packages/db/migrations/0049_ordering_tables.sql`

**Analog:** `packages/db/migrations/0048_catalog_menu_versions.sql`

**Structure to follow** (lines 1–41 of analog):

```sql
-- CREATE TABLE for orders, order_items, order_modifiers, payments
-- Each separated by --> statement-breakpoint
-- Then for EACH table:
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "orders" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "orders_iso" ON "orders"
  USING (is_system_session() OR tenant_id = current_tenant_id())
  WITH CHECK (is_system_session() OR tenant_id = current_tenant_id());
--> statement-breakpoint
```

RLS must be added for all four tables: `orders`, `order_items`, `order_modifiers`, `payments`. The policy name pattern is `<table>_iso`. The `is_system_session()` and `current_tenant_id()` functions already exist in the DB from earlier migrations.

---

### `packages/db/migrations/meta/_journal.json` (MODIFY)

**Analog:** self — append one entry after idx 48

```json
{
  "idx": 49,
  "version": "7",
  "when": <timestamp>,
  "tag": "0049_ordering_tables",
  "breakpoints": true
}
```

---

### `packages/events/src/contracts/ordering.ts`

**Analog:** `packages/events/src/contracts/tenancy.ts` (lines 1–93)

**Imports + triple-export pattern** (mirror of lines 1–22 for each contract):

```typescript
import { z } from 'zod';
import { TenantId } from '@resto/domain';
import { defineEventContract } from '../envelope';

export const OrderCreatedV1Payload = z.object({
  orderId: z.string().uuid(),
  tenantId: TenantId,
  brandId: z.string().uuid(),
  orderNumber: z.string().min(1).max(20),
  fulfillmentMode: z.enum(['dine_in', 'pickup', 'delivery']),
  total: z.number().int().nonnegative(), // minor units (D-03)
  currency: z.string().regex(/^[A-Z]{3}$/),
  itemCount: z.number().int().positive(),
  // NO customer PII (Pitfall 5 — GDPR minimisation)
});
export type OrderCreatedV1Payload = z.infer<typeof OrderCreatedV1Payload>;

export const OrderCreatedV1 = defineEventContract({
  type: 'ordering.order_created.v1',
  payload: OrderCreatedV1Payload,
});

// Repeat for: OrderPaidV1, OrderCanceledV1, OrderRefundedV1, OrderStatusChangedV1
// These contracts exist now; their HTTP surface arrives in Phase 8/10.
// OrderStatusChangedV1Payload adds: previousStatus, newStatus, reason?
```

---

### `packages/domain/src/ids.ts` (MODIFY)

**Analog:** self — check the file for the existing branded ID pattern, then add:

```typescript
export const OrderId = z.string().uuid().brand<'OrderId'>();
export type OrderId = z.infer<typeof OrderId>;

export const OrderItemId = z.string().uuid().brand<'OrderItemId'>();
export type OrderItemId = z.infer<typeof OrderItemId>;
```

---

### `apps/api/src/app.module.ts` (MODIFY)

**Analog:** self — one import + one array entry:

```typescript
import { OrderingModule } from './contexts/ordering/ordering.module';

@Module({
  imports: [
    // ... existing modules
    OrderingModule,  // add
  ],
})
```

---

## Shared Patterns

### `ScopedTx` / `db.withTenant` (ALL repository methods)

**Source:** `apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts` lines 65–108 (`findCurrentTenant`, `listCurrentTenantDomains`)

```typescript
// Tenant-scoped reads: db.withTenant (ALS auto-injects tenant filter via RLS + ScopedTx)
return this.db.withTenant(async (tx) => {
  const rows = await tx
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.id, id))   // explicit filter mandatory (ADR-0020 I-1)
    .limit(1);
  // ...
});

// Cross-tenant or system reads: db.withoutTenant (require non-empty reason)
return this.db.withoutTenant('ordering.findByIdempotencyKey', async (tx) => { ... });
```

### `buildEnvelope` + `appendToOutbox` (ALL domain event emissions)

**Source:** `apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts` lines 180–183 and 325–392

```typescript
// ALWAYS use buildEnvelope (reads OTel correlationId from ALS)
// NEVER construct EventEnvelope literal directly (ADR-0020 I-4)
const envelope = buildEnvelope(
  OrderCreatedV1,
  { orderId, tenantId, ... },
  { tenantId: snapshot.tenantId, occurredAt: event.occurredAt },
);
await appendToOutbox(tx, { envelope, aggregateId: snapshot.id });
// Both calls happen inside the same db.withTenant tx — transactional outbox guarantee
```

### `wrapWith` (ALL controller handlers)

**Source:** `apps/api/src/shared/api/wrap.ts` (entire file, 9 lines)

```typescript
// At file top, create context-specific wrap:
const wrap = wrapWith(mapOrderError);

// In each handler:
return wrap(() => this.createOrder.execute(input));
```

### `RestoZodValidationPipe` (ALL controller `@Body` parameters)

**Source:** `apps/api/src/contexts/catalog/interfaces/http/catalog.controller.ts` lines 90–93

```typescript
// Per-parameter, not global (CONVENTIONS.md Validation section)
@Body(new RestoZodValidationPipe(CreateOrderInputDto)) input: CreateOrderInputDto
```

### Money: `parseMinorUnits` / `formatMinorUnits`

**Source:** `packages/cart/src/cart.ts` lines 34–50

```typescript
export function parseMinorUnits(value: string): number { ... }  // '12.50' → 1250
export function formatMinorUnits(minor: number): string { ... } // 1250 → '12.50'
```

These functions should NOT be imported from `@resto/cart` into `apps/api` (cross-boundary: cart is a UI package). Replicate them verbatim in `apps/api/src/contexts/ordering/domain/money-utils.ts` or add them to `packages/domain/src/money.ts` as `toMinorUnits` / `fromMinorUnits`. Planner decides; either option is valid.

### `@Public()` + `@RequireActiveTenant()` combination (anonymous public endpoint)

**Source:** `apps/api/src/contexts/catalog/interfaces/http/public-menu.controller.ts` lines 126–128, 138

```typescript
@Public()                   // skip AuthGuard entirely (ORD-03: no auth required)
@Controller('v1/orders')
export class OrdersController { ... }

@RequireActiveTenant()      // still 404 if no tenant resolved from host
@Post()
create(...) { ... }
```

### RLS policy block in migration (ALL four new tables)

**Source:** `packages/db/migrations/0048_catalog_menu_versions.sql` lines 20–26

```sql
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "orders" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "orders_iso" ON "orders"
  USING (is_system_session() OR tenant_id = current_tenant_id())
  WITH CHECK (is_system_session() OR tenant_id = current_tenant_id());
--> statement-breakpoint
```

### Domain error class shape

**Source:** `apps/api/src/contexts/tenancy/domain/errors.ts` lines 8–27

```typescript
export class FooError extends Error {
  constructor(public readonly someId: string) {
    super(`<human message with ${someId}.`);
    this.name = 'FooError'; // explicit name for stack trace readability
  }
}
```

No `code` fields, no HTTP status — only plain `Error` subclasses in the domain layer.

---

## No Analog Found

| File                                                | Role               | Data Flow | Reason                                                                                                                                                                      |
| --------------------------------------------------- | ------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/contexts/ordering/domain/discount.ts` | pure function      | transform | No discount code anywhere in codebase; greenfield per RESEARCH.md §Discount Engine                                                                                          |
| `apps/api/src/contexts/ordering/domain/events.ts`   | domain event union | —         | Each context defines its own event union type; the union shape is trivial to write from scratch once the state machine transitions are designed — no analog adds value here |

For the discount engine: use the `DiscountSpec` discriminated union + `applyDiscount` signature documented in §Pattern Assignments above. For the domain events union: mirror the pattern from `apps/api/src/contexts/tenancy/domain/events.ts` (a simple union of `{ kind: 'X'; ... }` literal types).

---

## Metadata

**Analog search scope:** `apps/api/src/contexts/tenancy/`, `apps/api/src/contexts/catalog/`, `apps/api/src/contexts/audit/`, `packages/events/src/`, `packages/db/src/`, `packages/cart/src/`

**Files scanned:** 14 analog files read in full or in targeted sections

**Key constraint reminders for planner/executor:**

- `timestampsColumns()` helper includes `archivedAt` — do NOT use it on `orders` or `payments`; write timestamp columns manually (orders use status for soft-delete)
- `pullEvents()` drains the array — call exactly once in repository, never in tests
- All four new DB tables need both `ENABLE` and `FORCE ROW LEVEL SECURITY` in the migration
- `ordering.>` in `STREAM_SUBJECTS` is already present in `nats.module.ts` (ORD-08 is a no-op)
- ORD-11 (`outbox_events.claim_id`) is already shipped in migration 0047; do not re-plan
- Migration index is 49 — hand-write SQL, `pnpm db:generate` is unusable for ordering tables
