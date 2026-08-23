# Phase 10: Admin Order Intake - Pattern Map

**Mapped:** 2026-08-13
**Files analyzed:** ~38 (backend: 20, admin SPA: 10, website: 4, tests: 5)
**Analogs found:** 36 / 38 — 2 flagged "No Analog Found" (net-new browser-API integrations)

This phase has no single dominant analog — it spans backend state-machine extension, a brand-new repository query surface, RBAC edits, event-contract extension, admin SPA feed UI, and website guest-tracker fixes. Patterns below are grouped by **role**, not per literal file, because most new files in a group (e.g. the five order-transition services) share one analog almost verbatim.

## File Classification

| New/Modified File                                                                                                              | Role                   | Data Flow             | Closest Analog                                                                                                                                  | Match Quality |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `packages/db/migrations/0073_orders_intake.sql`                                                                                | migration              | batch (DDL)           | `packages/db/migrations/0070_orders_location_id.sql` + `0071_orders_location_rls.sql`                                                           | exact         |
| `packages/db/migrations/meta/_journal.json` (append)                                                                           | config                 | batch                 | same file, existing entries                                                                                                                     | exact         |
| `packages/db/src/schema/ordering.ts` (extend `orders`, add `orderDailySequences`)                                              | model                  | CRUD                  | same file (existing `orders`/`paymentRefunds` table defs)                                                                                       | exact         |
| `apps/api/src/contexts/ordering/domain/order.aggregate.ts` (`cancel()` widen, `refund()` fix, new `reject()`, actor threading) | model (aggregate)      | event-driven          | same file — existing `accept()`/`startPreparing()`/`markReady()`/`complete()` methods                                                           | exact         |
| `apps/api/src/contexts/ordering/domain/events.ts` (extend event interfaces)                                                    | model                  | event-driven          | same file                                                                                                                                       | exact         |
| `apps/api/src/contexts/ordering/domain/ports.ts` (add `list()` to `OrderRepository`)                                           | port                   | CRUD                  | `apps/api/src/contexts/catalog/domain/ports.ts` (`CatalogRepository.listItems`)                                                                 | role-match    |
| `apps/api/src/contexts/ordering/application/accept-order.service.ts` (NEW)                                                     | service                | request-response      | `apps/api/src/contexts/payments/application/cancel-order.service.ts`                                                                            | exact         |
| `apps/api/src/contexts/ordering/application/reject-order.service.ts` (NEW)                                                     | service                | request-response      | `apps/api/src/contexts/payments/application/cancel-order.service.ts`                                                                            | exact         |
| `apps/api/src/contexts/ordering/application/start-preparing-order.service.ts` (NEW)                                            | service                | request-response      | `apps/api/src/contexts/payments/application/cancel-order.service.ts`                                                                            | exact         |
| `apps/api/src/contexts/ordering/application/mark-ready-order.service.ts` (NEW)                                                 | service                | request-response      | `apps/api/src/contexts/payments/application/cancel-order.service.ts`                                                                            | exact         |
| `apps/api/src/contexts/ordering/application/complete-order.service.ts` (NEW)                                                   | service                | request-response      | `apps/api/src/contexts/payments/application/cancel-order.service.ts`                                                                            | exact         |
| `apps/api/src/contexts/ordering/application/list-orders.service.ts` (NEW, feed query)                                          | service                | CRUD (paginated read) | `apps/api/src/contexts/catalog/application/list-items.service.ts`                                                                               | exact         |
| `apps/api/src/contexts/ordering/infrastructure/order-drizzle.repository.ts` (`list()` + envelope fixes)                        | repository             | CRUD                  | `apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts` (`listItems`, `listStopListAggregateAcrossLocations`)              | exact         |
| `apps/api/src/contexts/ordering/interfaces/http/orders.controller.ts` (new mutation + feed routes)                             | controller             | request-response      | `apps/api/src/contexts/tenancy/interfaces/http/locations.controller.ts` + `apps/api/src/contexts/catalog/interfaces/http/catalog.controller.ts` | exact         |
| `apps/api/src/contexts/ordering/interfaces/http/error-mapping.ts` (extend)                                                     | utility                | transform             | same file (existing `mapOrderError`)                                                                                                            | exact         |
| `apps/api/src/contexts/payments/application/cancel-order.service.ts` (restructure per D-11)                                    | service                | request-response      | same file (being rewritten, not replaced)                                                                                                       | exact         |
| `apps/api/src/contexts/payments/application/refund-order.service.ts` (`wasPaid`/status-touch fix)                              | service                | request-response      | same file                                                                                                                                       | exact         |
| `apps/api/src/contexts/payments/application/retry-refund.service.ts` (NEW, D-11 retry)                                         | service                | request-response      | `apps/api/src/contexts/payments/application/refund-order.service.ts`                                                                            | role-match    |
| `apps/api/src/contexts/payments/interfaces/http/refunds.controller.ts` (no decorator change — client-side fix only)            | controller             | request-response      | same file                                                                                                                                       | exact         |
| `apps/api/src/contexts/identity/interfaces/http/guards/orders-feed-rate-limit.guard.ts` (NEW)                                  | middleware (guard)     | request-response      | `apps/api/src/contexts/identity/interfaces/http/guards/brand-slug-rate-limit.guard.ts`                                                          | exact         |
| `apps/api/src/shared/security.ts` (allowList addition)                                                                         | config                 | request-response      | same file                                                                                                                                       | exact         |
| `packages/domain/src/rbac/permissions.ts` / `system-roles.ts` (add `order.cancel`)                                             | config                 | CRUD                  | same files                                                                                                                                      | exact         |
| `apps/api/src/contexts/identity/application/preset-roles.ts` (add `order.cancel` to 3 presets)                                 | config                 | CRUD                  | same file                                                                                                                                       | exact         |
| `packages/events/src/contracts/ordering.ts` (extend 4 payload schemas)                                                         | model (event contract) | event-driven          | same file                                                                                                                                       | exact         |
| `apps/api/src/contexts/notifications/application/send-guest-notification.service.ts` (eta + brandName fallback)                | service                | event-driven          | same file                                                                                                                                       | exact         |
| `apps/api/src/contexts/notifications/infrastructure/guest-email-templates.ts` (no structural change — vars already accepted)   | utility                | transform             | same file                                                                                                                                       | exact         |
| `apps/website/components/checkout/order-status-poller.tsx` (rewrite)                                                           | component              | streaming (poll)      | same file                                                                                                                                       | exact         |
| `apps/website/components/checkout/checkout-form.tsx` (add consent `Checkbox` field)                                            | component              | request-response      | same file (existing `FormField` blocks)                                                                                                         | exact         |
| `apps/admin/src/routes/(protected)/$brandSlug/orders.tsx` (NEW)                                                                | route                  | CRUD (list+poll)      | `apps/admin/src/routes/(protected)/$brandSlug/menu/stop-list.tsx`                                                                               | exact         |
| `apps/admin/src/lib/queries/orders.ts` (NEW)                                                                                   | utility (query defs)   | request-response      | `apps/admin/src/lib/queries/catalog.ts`                                                                                                         | exact         |
| `apps/admin/src/components/orders/order-card.tsx` (NEW)                                                                        | component              | —                     | `apps/admin/src/components/menu/status-badge.tsx` (badge pattern) + `stop-list-table.tsx` (row/card shape)                                      | role-match    |
| `apps/admin/src/components/orders/order-status-badge.tsx` (NEW)                                                                | component              | —                     | `apps/admin/src/components/menu/status-badge.tsx`                                                                                               | exact         |
| `apps/admin/src/components/orders/accept-popover.tsx`, `reject-popover.tsx`, `cancel-dialog.tsx` (NEW)                         | component              | request-response      | none (no existing `Popover`/`AlertDialog` mutation-confirm in admin) — see No Analog Found                                                      | partial       |
| `apps/admin/src/components/app-sidebar.tsx` (add Orders nav entry)                                                             | component              | —                     | same file (existing `navMain` array)                                                                                                            | exact         |
| `apps/admin/src/components/nav-main.tsx` (add badge slot)                                                                      | component              | —                     | same file                                                                                                                                       | exact         |
| `apps/admin/src/lib/hooks/use-order-sound.ts`, `use-tab-title.ts` (NEW)                                                        | hook                   | event-driven          | none — see No Analog Found                                                                                                                      | none          |
| `apps/api/test/e2e/order-lifecycle.e2e.spec.ts` (NEW)                                                                          | test                   | CRUD (DB read-back)   | `apps/api/test/e2e/payment-lifecycle.e2e.spec.ts`                                                                                               | exact         |
| `apps/api/test/e2e/payment-lifecycle.e2e.spec.ts` (assertion fix `refunded`→`canceled`)                                        | test                   | CRUD                  | same file                                                                                                                                       | exact         |

## Pattern Assignments

### Migration + schema: `packages/db/migrations/0073_*.sql`, `packages/db/src/schema/ordering.ts`

**Analog:** `packages/db/migrations/0070_orders_location_id.sql`, `0071_orders_location_rls.sql`, `packages/db/migrations/meta/_journal.json`

**Header/WHY-comment pattern** (`0070_orders_location_id.sql:1-15`):

```sql
-- 0070_orders_location_id.sql
-- Phase 08.4 Plan 08 (D-03): re-key orders to location grain -- add NOT NULL
-- orders.location_id with composite FK (location_id, tenant_id) ->
-- locations(id, tenant_id).
--
-- D-12/D-13/Pitfall 5: no location is synthesized. A row-count check at
-- plan execution time found 5 pre-existing dev-only orders ...
```

Cite the plan/decision ID and any non-obvious data decision (e.g. why a `NOT NULL` column with no static default needs a pre-clear, per RESEARCH.md A.3's `short_number` guidance — do not add a nullable-but-should-be-NOT-NULL column in the same statement as the ADD COLUMN on a non-empty table).

**Composite FK pattern** (`0070_orders_location_id.sql:28-32`):

```sql
ALTER TABLE orders ADD COLUMN location_id uuid NOT NULL;
--> statement-breakpoint
ALTER TABLE orders
  ADD CONSTRAINT orders_location_fk
  FOREIGN KEY (location_id, tenant_id) REFERENCES locations (id, tenant_id) ON DELETE RESTRICT;
```

Use this exact shape for `order_daily_sequences`' FK to `locations(id, tenant_id)`.

**RESTRICTIVE RLS policy pattern** (`0071_orders_location_rls.sql`, full file — only needed if the new counter table wants location-grain RLS):

```sql
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders' AND policyname = 'orders_location_iso'
  ) THEN
    DROP POLICY orders_location_iso ON orders;
  END IF;
END
$$;
--> statement-breakpoint
CREATE POLICY orders_location_iso ON orders
  AS RESTRICTIVE
  USING (is_system_session() OR current_location_id() IS NULL OR location_id = current_location_id())
  WITH CHECK (is_system_session() OR current_location_id() IS NULL OR location_id = current_location_id());
```

**Journal entry pattern** (`packages/db/migrations/meta/_journal.json`, tail):

```json
{
  "idx": 72,
  "version": "7",
  "when": 1783987200000,
  "tag": "0072_tenancy_erase_locations",
  "breakpoints": true
}
```

Next entry: `idx: 73`, `when: 1784073600000` (prior `when` + 86400000), `tag: "0073_<description>"`. Verify `0073` is still the next free number at execution time (`ls packages/db/migrations/*.sql | tail -1`).

**Schema column style** (`packages/db/src/schema/ordering.ts` — `orders` table, verified structure):

```ts
export const orders = pgTable(
  'orders',
  {
    tenantId: tenantIdColumn(),
    locationId: uuid('location_id').notNull(),
    status: text('status').notNull(),
    scheduledFor: timestamp('scheduled_for', {
      withTimezone: true,
      mode: 'date',
    }),
    // ...
  },
  (table) => [
    compositeTenantFk({
      columns: [table.tenantId],
      child: { id: table.brandId, tenantId: table.tenantId },
      parent: { id: brands.id, tenantId: brands.tenantId },
    }),
    tenantParentUniqueIndex('orders', {
      id: table.id,
      tenantId: table.tenantId,
    }),
  ],
);
```

New timestamp columns (`accepted_at`, `preparing_at`, `ready_at`, `completed_at`, `eta_at`, `marketing_consent_at`) follow `scheduledFor`'s exact `timestamp(..., { withTimezone: true, mode: 'date' })` shape. `channel`/`cancel_reason`/`canceled_from_status` follow `status`'s `text(...).notNull()` (with a CHECK constraint added in the SQL migration, mirroring `orders_status_chk` — grep `packages/db/src/schema/ordering.ts:64-72` for the existing CHECK style referenced in RESEARCH.md A.3).

---

### Domain aggregate extension: `order.aggregate.ts`

**Analog:** the file's own existing transition methods (`accept()`, `cancel()`, `refund()`)

**Existing transition-method shape to copy for `reject()`** (`order.aggregate.ts:243-257`, `accept()`):

```ts
accept(now: Date = new Date()): void {
  if (this.snapshot.status !== 'paid') {
    throw new InvalidOrderTransitionError(this.snapshot.id, this.snapshot.status, 'accepted');
  }
  const previousStatus = this.snapshot.status;
  this.snapshot = { ...this.snapshot, status: 'accepted', updatedAt: now };
  this.#events.push({
    kind: 'OrderStatusChanged',
    orderId: this.snapshot.id,
    tenantId: this.snapshot.tenantId,
    previousStatus,
    newStatus: 'accepted',
    occurredAt: now,
  });
}
```

**Current `cancel()` guard to widen** (`order.aggregate.ts:307-319`) — per D-08, extend the allowed-status set from `{'created','paid'}` to `{'created','paid','accepted','preparing','ready'}`:

```ts
cancel(reason: string, now: Date = new Date()): void {
  if (this.snapshot.status !== 'created' && this.snapshot.status !== 'paid') {
    throw new InvalidOrderTransitionError(this.snapshot.id, this.snapshot.status, 'canceled');
  }
  this.snapshot = { ...this.snapshot, status: 'canceled', updatedAt: now };
  this.#events.push({ kind: 'OrderCanceled', orderId: this.snapshot.id, tenantId: this.snapshot.tenantId, reason, occurredAt: now });
}
```

**Current `refund()` bug to fix** (`order.aggregate.ts:321-344`) — the `newStatus` hardcode that must stop touching `order.status` per RESEARCH.md C.8:

```ts
refund(amountMinor: number, alreadyRefundedMinor: number, now: Date = new Date()): void {
  if (this.snapshot.status !== 'paid') { /* guard to remove/relax */ }
  const capturedMinor = toMinorUnits(this.snapshot.total);
  if (amountMinor <= 0 || amountMinor + alreadyRefundedMinor > capturedMinor) {
    throw new RefundExceedsCapturedError(/* ... */);
  }
  const isFullRefund = amountMinor + alreadyRefundedMinor === capturedMinor;
  const newStatus: OrderStatus = isFullRefund ? 'refunded' : 'paid'; // BUG: must be removed
  this.snapshot = { ...this.snapshot, status: newStatus, updatedAt: now };
  // ...
}
```

Fix: `refund()` must stop assigning `newStatus` to `this.snapshot.status` at all — only `payments.status`/`payment_refunds` change on a discretionary refund; `cancel()` is the only method that terminalizes the order.

**Actor threading** — RESEARCH.md F recommends explicit params, matching this file's existing style (`cancel(reason: string, now: Date = new Date())`): change to `cancel(reason: string, actorUserId: string | null, now: Date = new Date())`, same for `accept`, `startPreparing`, `markReady`, `complete`. Do NOT use the 08.3 WeakMap actor-stash pattern (`identity/infrastructure/better-auth/auth.config.ts`) — that exists only because Better Auth's hook signatures can't be extended; this is first-party code with no such constraint.

---

### Domain events extension: `events.ts`

**Analog:** same file, its own interfaces.

**Current shape** (`events.ts:40-47`, `OrderStatusChangedDomainEvent`):

```ts
export interface OrderStatusChangedDomainEvent {
  readonly kind: 'OrderStatusChanged';
  readonly orderId: OrderId;
  readonly tenantId: TenantId;
  readonly previousStatus: string;
  readonly newStatus: string;
  readonly occurredAt: Date;
}
```

Add `readonly locationId: string;` to every `Order*DomainEvent` interface (`OrderCreatedDomainEvent`, `OrderPaidDomainEvent`, `OrderCanceledDomainEvent`, `OrderRefundedDomainEvent`, `OrderStatusChangedDomainEvent`), `readonly total: number; readonly currency: Currency;` to `OrderPaidDomainEvent`, `readonly currency: Currency;` to `OrderRefundedDomainEvent`, and `readonly actorUserId: string | null;` to `OrderStatusChangedDomainEvent` and `OrderCanceledDomainEvent`. Every push site in `order.aggregate.ts` (`this.snapshot.locationId` is already on the snapshot) gets one new field per push — same shape as the existing pushes.

---

### Application services — order status-transition (`accept-order.service.ts`, `reject-order.service.ts`, `start-preparing-order.service.ts`, `mark-ready-order.service.ts`, `complete-order.service.ts`)

**Analog:** `apps/api/src/contexts/payments/application/cancel-order.service.ts` (full file, 58 lines)

```ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { type OrderId, type TenantId } from '@resto/domain';
import {
  ORDER_REPOSITORY,
  type OrderRepository,
} from '../../ordering/domain/ports';
import { OrderNotFoundError } from '../../ordering/domain/errors';

export interface CancelOrderInput {
  readonly orderId: OrderId;
  readonly tenantId: TenantId;
  readonly reason?: string;
}

@Injectable()
export class CancelOrderService {
  private readonly logger: Logger;

  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orderRepo: OrderRepository,
    @Inject(RefundOrderService)
    private readonly refundService: RefundOrderService,
    logger?: Logger,
  ) {
    this.logger = logger ?? new Logger(CancelOrderService.name);
  }

  async execute(input: CancelOrderInput): Promise<void> {
    const order = await this.orderRepo.findById(input.orderId);
    if (!order) throw new OrderNotFoundError(input.orderId);
    // ... domain mutation + orderRepo.update(order)
  }
}
```

**Copy exactly:** single-public-`execute(input)` shape, `@Inject(ORDER_REPOSITORY)` port injection, `findById` → 404-if-null via domain error → mutate aggregate → `orderRepo.update(order)`. Per RESEARCH.md C.11, each new transition service must add the **idempotent-by-target-state** check before calling the aggregate method:

```ts
const snap = order.toSnapshot();
if (snap.status === targetStatus) return; // no-op success, not InvalidOrderTransitionError
```

`AcceptOrderService` additionally needs `prepMinutes: number` in its input (D-15 ETA capture) and computes `eta_at = now + prepMinutes * 60_000` server-side (never trust a client timestamp, matching `create-order.service.ts`'s "never trust client prices" precedent).

---

### Application service — feed list query: `list-orders.service.ts`

**Analog:** `apps/api/src/contexts/catalog/application/list-items.service.ts` (full file, 49 lines)

```ts
@Injectable()
export class ListItemsService {
  constructor(
    @Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository,
  ) {}

  async execute(input: {
    status?: ItemStatusFilter;
    categoryId?: string | null;
    q?: string | null;
    limit?: number;
    offset?: number;
  }): Promise<ItemListResponse> {
    requireTenantContext();
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    const offset = Math.max(input.offset ?? 0, 0);
    const result = await this.repo.listItems({
      /* ... */
    });
    return {
      items: result.rows.map(/* ... */),
      total: result.total,
      limit,
      offset,
    };
  }
}
```

Copy the clamped `limit`/`offset` pattern (`Math.min(Math.max(...))`) and the `requireTenantContext()` call as the tenant-binding assertion. For the `all`-location aggregate branch, additionally copy `GetStopListAggregateService` (`apps/api/src/contexts/catalog/application/get-stop-list-aggregate.service.ts`, full file, 43 lines) — the exact pattern for "server-resolve the active-location set from `locations`, never trust a caller-supplied list":

```ts
const all = await this.locations.listForBrand(brandId, tenantId);
const active = all.filter((l) => l.status === 'active');
const { rows, totalStoppedItems } =
  await this.repo.listStopListAggregateAcrossLocations(
    tenantId,
    active.map((l) => l.id),
  );
```

---

### Repository — feed query with filters/pagination: `order-drizzle.repository.ts#list()`

**Analog:** `apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts#listItems()` (lines 1005-1108) for the single-location filtered/paginated case, and `#listStopListAggregateAcrossLocations()` (lines 1267-1330+) for the `all`-mode aggregate case.

**Single-location filter composition pattern** (`catalog-drizzle.repository.ts:1012-1040`):

```ts
async listItems(input: { status: ItemStatusFilter; categoryId: string | null; q: string | null; limit: number; offset: number }): Promise<{ rows: ItemListRow[]; total: number }> {
  return this.db.withTenant(async (tx, scoped) => {
    const statusPred = input.status === 'all' ? undefined : eq(schema.menuItems.status, input.status);
    const categoryPred = input.categoryId ? eq(schema.menuItems.categoryId, input.categoryId) : undefined;
    const composed = [statusPred, categoryPred].filter((p): p is NonNullable<typeof p> => p !== undefined).length > 0
      ? and(...[statusPred, categoryPred].filter((p): p is NonNullable<typeof p> => p !== undefined))
      : undefined;
    const rows = await scoped.selectFrom(schema.orders, composed).orderBy(/* ... */);
    // ...
  });
}
```

This is `db.withTenant((tx, scoped) => scoped.selectFrom(...))` — never a raw `WHERE tenant_id`. Compose the feed's `status ∈ [...]`, `channel`, and `created_at` date-range predicates the same way, then `.orderBy(desc(schema.orders.createdAt))`.

**`all`-mode cross-location aggregate pattern** (`catalog-drizzle.repository.ts:1267-1330`) — the sanctioned escape hatch for `GROUP BY`/cross-location reads that `ScopedTx.selectFrom()` cannot express:

```ts
async listStopListAggregateAcrossLocations(tenantId: TenantId, activeLocationIds: readonly string[]) {
  if (activeLocationIds.length === 0) return { rows: [], totalStoppedItems: 0 };
  return this.db.withTenant(async (tx) => {
    // ScopedTx.selectFrom() cannot express GROUP BY -- raw tx + explicit
    // eq(tenantId) is the sanctioned escape hatch (ADR-0020 I-1)
    const rows = await tx.select({ /* ... */ }).from(schema.menuStopList)
      .where(and(eq(schema.menuStopList.tenantId, tenantId), inArray(schema.menuStopList.locationId, activeLocationIds)));
    // ...
  });
}
```

Use this exact "raw `tx` + explicit `eq(tenantId)` + `inArray(locationId, activeLocationIds)`" shape for the feed's `all`-mode merged list (D-02's "one merged list across the brand's active locations, each row labelled with its location").

**Recommended composite index** (RESEARCH.md A.4, not yet in the codebase — new): `(tenant_id, location_id, status, created_at DESC)`.

---

### Controller + guard vocabulary: mutation routes + feed route on `orders.controller.ts`

**Analog A — brand-scoped resource controller with per-method guards:** `apps/api/src/contexts/catalog/interfaces/http/catalog.controller.ts` (grep excerpt, lines 128-335 pattern repeated per route):

```ts
@Permissions({ menu: ['update'] })
@RequireBrand()
@LocationNeutral()
```

This is the exact decorator vocabulary (`@Permissions`, `@RequireBrand`, `@LocationNeutral`) — apply `@Permissions({ order: ['cancel'] })` / `@Permissions({ order: ['update-status'] })` per route, per D-06/RESEARCH.md B.5/B.7.

**Analog B — full small controller shape:** `apps/api/src/contexts/tenancy/interfaces/http/locations.controller.ts` (full file, 131 lines):

```ts
const wrap = wrapWith(mapDomainError);

@ApiTags('tenancy')
@LocationNeutral()
@Controller('v1/tenancy/locations')
export class LocationsController {
  constructor(
    @Inject(ProvisionLocationService)
    private readonly provisionLocation: ProvisionLocationService,
    @Inject(ListLocationsService)
    private readonly listLocations: ListLocationsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Permissions({ location: ['create'] })
  @RequireActiveTenant()
  @RequireBrand()
  @ApiBody({ type: CreateLocationInputDto })
  @ApiOkResponse({ type: LocationResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  create(
    @Body(new RestoZodValidationPipe(CreateLocationInputDto))
    input: CreateLocationInputDto,
  ) {
    return wrap(async () =>
      toResponse(await this.provisionLocation.execute(input)),
    );
  }
}
```

**CRITICAL — the route-by-route decorator table (RESEARCH.md B.7, do not deviate):**

- **New feed/list `GET` route:** needs `@LocationNeutral()` — the one legitimately-aggregate-across-locations read (mirrors `LocationsController`'s class-level `@LocationNeutral()`).
- **Every mutation route** (accept/reject/start-preparing/mark-ready/complete/cancel, and the existing `refunds.controller.ts`): **do NOT add `@LocationNeutral()`**. Keep the existing `LocationScopeGuard` non-owner branch live. The `?location=all` 403 bug (CTO MED-1) is fixed **client-side** (admin sends the order's own real `locationId`, never the `'all'` sentinel) — see `apps/admin/src/lib/api-client.ts` in the Shared Patterns section below, not here.
- `@RequireActiveTenant()` stays on every order route.
- `refunds.controller.ts` keeps `@Permissions({ billing: ['update'] })` unchanged — no `@OwnerOnly()` needed (redundant, since only `owner` has `billing`).

**Existing `orders.controller.ts` shape to extend** (`orders.controller.ts:1-39`, current class-level decorators):

```ts
@ApiTags('ordering')
@Public()
@BrandNeutral()
@Controller('v1/orders')
export class OrdersController {
```

New operator-mutation routes on this same controller (or a sibling) must NOT inherit `@Public()`/`@BrandNeutral()` at class level for the mutation methods — override with method-level `@Permissions(...)` + `@RequireBrand()` (or leave the guest-only `create`/`getStatus` routes as the only `@Public()` members and put mutation routes on their own `@Controller` if class-level decorators can't be cleanly overridden per-method — verify NestJS decorator-merge semantics at implementation time).

**`wrapWith(mapper)` error pattern** (every controller in this codebase, e.g. `orders.controller.ts:17`, `locations.controller.ts:43`):

```ts
const wrap = wrapWith(mapOrderError);
// ...
create(...): Promise<OrderResponse> {
  return wrap(() => this.createOrder.execute(input));
}
```

---

### Error mapping extension: `error-mapping.ts`

**Analog:** `apps/api/src/contexts/ordering/interfaces/http/error-mapping.ts` (full file, 54 lines):

```ts
export const mapOrderError = (err: unknown): unknown => {
  if (err instanceof OrderNotFoundError) {
    return new NotFoundException({
      code: 'ordering.order_not_found',
      message: err.message,
    });
  }
  if (err instanceof InvalidOrderTransitionError) {
    return new ConflictException({
      code: 'ordering.invalid_transition',
      message: err.message,
    });
  }
  return err; // never map `unknown` — return unchanged
};
```

Add a case per any new domain error (e.g. a `CancelReasonRequiredError` if introduced) following this exact `if (err instanceof X) return new YException({ code, message })` chain, terminating in `return err;`.

---

### Rate-limit guard: `orders-feed-rate-limit.guard.ts`

**Analog:** `apps/api/src/contexts/identity/interfaces/http/guards/brand-slug-rate-limit.guard.ts` (full file, 60 lines) — the exact per-route, post-`AuthGuard`, principal-or-IP-keyed bucket pattern:

```ts
@Injectable()
export class BrandSlugRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  constructor(@Inject(ENV_TOKEN) private readonly env: Env) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const key =
      req.principal && 'userId' in req.principal
        ? req.principal.userId
        : `ip:${req.ip}`;
    const cap = this.env.RATE_LIMIT_BRAND_SLUG_CHECK_PER_MIN;
    // sweep + bucket check + HttpException(429) on exceed
  }
}
```

Copy verbatim, swap the env cap to a new `RATE_LIMIT_ORDERS_FEED_PER_MIN` (add to `apps/api/src/config/env.schema.ts` next to `RATE_LIMIT_BRAND_SLUG_CHECK_PER_MIN`), apply via `@UseGuards(OrdersFeedRateLimitGuard)` on the feed route. Then add the feed's URL path to `security.ts`'s existing `allowList` function (`apps/api/src/shared/security.ts:169-170`) so the global per-IP `RateLimitGuard` bucket does not double-count feed polls.

**Global `RateLimitGuard` → `HttpException` translation reference** (`apps/api/src/shared/rate-limit.guard.ts`, full file) — read for context only, not modified this phase; explains why the new guard must throw the same `HttpException(429, {code:'rate-limit-exceeded', ...})` shape for `ProblemDetailsFilter` to format consistently.

---

### RBAC edits: `permissions.ts`, `system-roles.ts`, `preset-roles.ts`

**Analog:** the files' own existing entries — this is a pure additive edit, not a new pattern.

`packages/domain/src/rbac/permissions.ts:2-3`:

```ts
export const PERMISSIONS_STATEMENT = {
  menu: ['read', 'create', 'update', 'delete'],
  order: ['read', 'update-status'], // add 'cancel' here
  ...
```

`packages/domain/src/rbac/system-roles.ts:6,20` — add `'cancel'` to both `owner.order` and `admin.order`:

```ts
owner: {
  order: ['read', 'update-status'], // -> ['read', 'update-status', 'cancel']
```

`apps/api/src/contexts/identity/application/preset-roles.ts:15,27,37` — add `'cancel'` to all three presets' `order` array:

```ts
{ slug: 'manager', permission: { order: ['read', 'update-status'], /* -> add 'cancel' */ } },
{ slug: 'cashier-foh', permission: { order: ['read', 'update-status'] } },
{ slug: 'kitchen', permission: { order: ['read', 'update-status'] } },
```

**`NON_DELEGATABLE` reference** (`packages/domain/src/rbac/non-delegatable.ts`, full file) — confirm `order` is NOT a key here (it isn't); add a regression test pinning `containsNonDelegatable({ order: ['cancel'] })` returns `false`, mirroring this file's own `Permission` shape.

**Landmine:** `SeedPresetRolesService` snapshots `PRESET_ROLES` into `organization_role` at provisioning time — editing `preset-roles.ts` does not retroactively reach already-seeded dev/demo tenants. Plan a reseed step.

---

### Event contract extension: `packages/events/src/contracts/ordering.ts`

**Analog:** the file's own existing payload schemas (full file, 73 lines):

```ts
export const OrderPaidV1Payload = z.object({
  orderId: z.string().uuid(),
  tenantId: TenantId,
  paymentId: z.string().uuid(),
  total: z.number().int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
});
export const OrderPaidV1 = defineEventContract({
  type: 'ordering.order_paid.v1',
  payload: OrderPaidV1Payload,
});
```

Add `locationId: z.string().uuid()` to every `Order*V1Payload`, `actorUserId: z.string().nullable()` to `OrderStatusChangedV1Payload`/`OrderCanceledV1Payload`, `currency` to `OrderRefundedV1Payload` (currently missing — confirmed). Then thread `event.locationId`/`event.actorUserId` into the corresponding `buildEnvelope(...)` call in `order-drizzle.repository.ts#domainEventToEnvelope()` (`order-drizzle.repository.ts:252-310`) — replacing the hardcoded `total: 0, currency: 'USD'` at lines 276-277 and 294 with real values from the (now-extended) domain event.

---

### Admin route with location-filter branching: `orders.tsx`

**Analog:** `apps/admin/src/routes/(protected)/$brandSlug/menu/stop-list.tsx` (full file, 77 lines):

```ts
export const Route = createRoute({
  getParentRoute: () => menuLayoutRoute,
  path: '/stop-list',
  loaderDeps: ({ search }) => ({ location: search.location }),
  loader: ({ context: { queryClient }, params: { brandSlug }, deps }) => {
    if (deps.location === undefined) return undefined;
    if (deps.location === 'all') {
      return queryClient.ensureQueryData(stopListAggregateQuery(brandSlug));
    }
    return queryClient.ensureQueryData(stopListQuery(brandSlug, deps.location));
  },
  component: StopListPage,
});

function StopListPage() {
  const { mode, locationId } = useEffectiveLocation();
  const { data: singleResult } = useQuery({ ...stopListQuery(brandSlug, locationId ?? ''), enabled: mode === 'single' && locationId !== undefined });
  const { data: aggregateResult } = useQuery({ ...stopListAggregateQuery(brandSlug), enabled: mode === 'all' });
  return mode === 'all' ? <StopListAggregateTable .../> : <StopListTable .../>;
}
```

Copy exactly: `loaderDeps`/`loader` branch on `deps.location === 'all'` vs a concrete id, component reads `useEffectiveLocation()` at render time as the actual source of truth (never trust the loader's snapshot alone), two parallel `useQuery` calls gated by `enabled: mode === 'single'` / `enabled: mode === 'all'`. This is D-02's exact mechanism — the feed's `all` mode uses the same branch, but unlike stop-list's `all` mode (read-only), the feed's `all` mode stays fully actionable per D-02.

**`useEffectiveLocation()` — do not reinvent:** `apps/admin/src/lib/hooks/use-effective-location.ts` (full file, 90 lines) is the single per-role location authority; import and use as-is, do not add a parallel location-filter mechanism.

---

### Admin query definitions: `apps/admin/src/lib/queries/orders.ts`

**Analog:** `apps/admin/src/lib/queries/catalog.ts` (lines 203-217, `stopListQuery`/`stopListAggregateQuery`):

```ts
export const stopListQuery = (brandSlug: string, locationId: string) => ({
  queryKey: ['catalog', 'stop-list', brandSlug, locationId] as const,
  queryFn: () =>
    apiFetch<StopListResponse>('/v1/catalog/stop-list', {
      brandSlug,
      locationId,
    }),
  staleTime: STALE_STABLE,
});

export const stopListAggregateQuery = (brandSlug: string) => ({
  queryKey: ['catalog', 'stop-list-aggregate', brandSlug] as const,
  queryFn: () =>
    apiFetch<AggregateStopListResponse>('/v1/catalog/stop-list/aggregate', {
      brandSlug,
      locationId: 'all',
    }),
  staleTime: STALE_STABLE,
});
```

Copy the `queryKey` tuple-with-params shape and the `apiFetch<T>(path, { brandSlug, locationId })` call shape for `ordersFeedQuery(brandSlug, locationId, filters)`. Per RESEARCH.md D.14, add `refetchInterval: 5_000, refetchIntervalInBackground: true, refetchOnWindowFocus: true` to the query object returned from `useQuery(...)` at the call site (not baked into the `queryKey` factory itself, matching how `stopListQuery`/`stopListAggregateQuery` stay declarative and let call sites layer `enabled`).

**Mutation call shape** (`catalog.ts:225-230`, `upsertCategory`):

```ts
export const upsertCategory = (
  brandSlug: string,
  id: string | null,
  data: CategoryForm,
) =>
  apiFetch<CategoryListItemApi>('/v1/catalog/categories', {
    method: 'POST',
    body: { ...data, id: id ?? undefined },
    brandSlug,
  });
```

Every new order-mutation call (accept/reject/cancel/etc.) follows this exact shape — **critical per RESEARCH.md B.7:** pass the order's own real `locationId` explicitly (never `useEffectiveLocation()`'s `'all'` sentinel) as the `locationId` option, e.g. `apiFetch(..., { brandSlug, locationId: order.locationId })`.

---

### Admin status badge / order card: `order-status-badge.tsx`, `order-card.tsx`

**Analog:** `apps/admin/src/components/menu/status-badge.tsx` (full file, 35 lines):

```tsx
const VARIANTS: Record<Status, Variant> = {
  draft: 'outline',
  published: 'default',
  paused: 'secondary',
  archived: 'ghost',
};
const EXTRA_CLASS: Partial<Record<Status, string>> = {
  modified:
    'border-amber-500 text-amber-700 dark:border-amber-400 dark:text-amber-400',
};

export function StatusBadge({ status }: StatusBadgeProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.status' });
  const label = t(status);
  const extra = EXTRA_CLASS[status];
  return (
    <Badge
      variant={VARIANTS[status]}
      className={extra}
      aria-label={t('ariaLabel', { label })}
    >
      {label}
    </Badge>
  );
}
```

This is the UI-SPEC's own cited precedent ("follow its shape exactly for the 8-state order chip") — `VARIANTS` map + `EXTRA_CLASS`-on-`Badge` targeted-override is the mechanism for the `warning`/`success` custom-color chips (Готовится/Готово) that the shadcn `Badge` variant prop alone can't express.

---

### Admin sidebar nav entry + counter badge: `app-sidebar.tsx`, `nav-main.tsx`

**Analog:** `apps/admin/src/components/app-sidebar.tsx` (full file, 116 lines) — the `navMain` array literal:

```ts
const navMain: NavMainItem[] = [
  {
    title: t('dashboard'),
    url: activeBrandSlug ? `/${activeBrandSlug}` : '/',
    icon: LayoutDashboard,
    scope: 'any',
  },
  {
    title: 'Locations',
    url: `${brandPrefix}/locations`,
    icon: MapPin,
    scope: 'brand',
  },
  // add: { title: t('orders'), url: `${brandPrefix}/orders`, icon: <pick>, scope: 'brand' },
];
```

And `apps/admin/src/components/nav-main.tsx` (full file, 99 lines) — `NavMainItem` interface has **no badge slot today**; the render sites to extend:

```tsx
<SidebarMenuButton asChild tooltip={item.title}>
  <Link to={item.url as '/'}>
    {item.icon && <item.icon />}
    <span>{item.title}</span>
    {/* add: {item.badge !== undefined && item.badge > 0 && <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>} */}
  </Link>
</SidebarMenuButton>
```

Add `badge?: number` to `NavMainItem`, render conditionally next to `<span>{item.title}</span>` in both the flat (`nav-main.tsx:54-61`) and collapsible (`:73-77`) branches — this is additive, new UI, not an extension of an existing badge system (none exists in `apps/admin/src/components` today).

---

### Website guest tracker rewrite: `order-status-poller.tsx`

**Analog:** the file's own current structure (full file, 95 lines) — being extended, not replaced wholesale:

```tsx
const TERMINAL_STATUSES = new Set(['paid', 'failed', 'canceled', 'refunded']); // BUG: 'paid' must be removed
// ...
const isPaid = status.status === 'paid';
const isFailed = status.status === 'failed' || status.status === 'canceled';
const isPending = !isPaid && !isFailed;
// ...
<dd className="capitalize">{status.status.replace('_', ' ')}</dd> {/* must become an explicit status→label map */}
```

**Fixes required** (E.15/D-16, confirmed in code): `TERMINAL_STATUSES` becomes `{'completed','canceled','refunded','failed'}`; the raw `.replace('_',' ')` becomes an explicit status→copy map covering `accepted`/`preparing`/`ready`/`completed`; the poll-interval array (`POLL_INTERVALS_MS`) and `setTimeout`-based recursive `poll()` structure stay as-is (already correct per-status backoff mechanism) but should key cadence off `status.status` per the UI-SPEC's Section 11 table. This component is also the file to switch from hardcoded English to `useTranslations()` (E.15) — no existing `checkout.status.*` i18n keys exist yet; add them to `messages/{ru,uk,en}.json` following the existing `checkout.*` namespace shape (e.g. `checkout.placeOrder`).

---

### Website consent checkbox: `checkout-form.tsx`

**Analog:** the file's own existing `FormField` blocks (`checkout-form.tsx:192-218`, the `name`/`phone` fields):

```tsx
<FormField
  control={form.control}
  name="phone"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Phone</FormLabel>
      <FormControl>
        <Input type="tel" placeholder="Your phone number" {...field} />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

Add a `marketingConsent` field to the same `useForm<CheckoutFormValues>` (`checkout-form.tsx:53-57`, `resolver: zodResolver(createCheckoutSchema(mode))`) using the new `Checkbox` primitive (`npx shadcn add checkbox`) inside an identically-shaped `FormField`/`FormItem`/`FormControl`/`FormMessage` block, defaulted `false` in `defaultValues`. The write path threads through `handleSubmit`'s `createOrder({...})` call (`checkout-form.tsx:75-83`) — add `marketingConsent: values.marketingConsent` alongside the existing `customerName`/`customerPhone`/`customerEmail` fields, which land in `CreateOrderInputSchema` (`ordering/application/dto.ts:22-63`) as a new optional boolean.

---

### Notifications service fix: `send-guest-notification.service.ts`

**Analog:** the file's own structure (full file, 99 lines) — both fixes are localized edits, not a new pattern:

```ts
const locale = 'ru';
const brandName = brand?.displayName ?? 'RestOS'; // fix: fallback must not leak the platform name
// ...
vars: {
  orderNumber: order.total,
  itemsSummary,
  total: order.total,
  currency: order.currency,
  // eta is dead-missing here — guest-email-templates.ts already reads v.eta conditionally
},
```

`guest-email-templates.ts:45,57,70,82` already interpolate `${v.eta ? ... : ''}` — the template slot exists and is dead (confirmed via grep). Fix: source `eta_at` via `NotificationOrderRepository.findOrder()` (needs the new column added to its select, same shape as every other new-column wiring in this phase) and add `eta: formattedEta` to the `vars` object above, next to `total`/`currency`.

---

### e2e test with DB read-back: `order-lifecycle.e2e.spec.ts`

**Analog:** `apps/api/test/e2e/payment-lifecycle.e2e.spec.ts` (full file read; key excerpts below) — the **non-negotiable pattern per Test Fidelity requirement**, seeded via real Postgres testcontainer, real services, only `PaymentProviderPort` (Stripe) mocked, DB read-back assertion.

**Harness + seed helpers** (`payment-lifecycle.e2e.spec.ts:1-24, 88-143`):

```ts
import { isDockerAvailable, startDbStack, stopDbStack } from './helpers/with-db-stack';
const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

suite('Payment lifecycle e2e — ...', () => {
  let stack: DbStack;
  beforeAll(async () => { stack = await startDbStack(); /* seed tenant/brand/location */ }, 120_000);
  afterAll(async () => { if (stack) await stopDbStack(stack); });

  const seedOrder = async (status: string, total = '15.00'): Promise<string> => {
    const newOrderId = randomUUID();
    await stack.db.withoutTenant('seed order for status persistence e2e', async (tx) => {
      await tx.insert(schema.orders).values({ id: newOrderId, tenantId, brandId, locationId, /* ... */ status, /* ... */ });
    });
    return newOrderId;
  };

  const readOrderStatus = async (seededOrderId: string): Promise<string | undefined> => {
    const [row] = await stack.db.withoutTenant('read order status', async (tx) =>
      tx.select({ status: schema.orders.status }).from(schema.orders).where(sql`${schema.orders.id} = ${seededOrderId}`),
    );
    return row?.status;
  };

  const readOutboxTypes = async (seededOrderId: string): Promise<string[]> => {
    const rows = await stack.db.withoutTenant('read outbox types', async (tx) =>
      tx.select({ type: schema.outboxEvents.type }).from(schema.outboxEvents).where(sql`${schema.outboxEvents.aggregateId} = ${seededOrderId}`),
    );
    return rows.map((row) => row.type);
  };
```

**Real-service-under-test invocation + DB read-back assertion** (`payment-lifecycle.e2e.spec.ts:462-495`):

```ts
it('operator cancel of an unpaid order persists status=canceled and emits ordering.order_canceled.v1', async () => {
  const seededOrderId = await seedOrder('created');
  const orderRepo = new OrderDrizzleRepository(stack.db);
  const paymentRepo = new PaymentDrizzleRepository(stack.db);
  const providerMock: PaymentProviderPort = {
    /* every method vi.fn(), createRefund mocked to resolve */
  };
  const refundService = new RefundOrderService(
    orderRepo,
    paymentRepo,
    providerMock,
    stack.db,
  );
  const cancelService = new CancelOrderService(orderRepo, refundService);

  await runInTenantContext({ tenantId }, () =>
    cancelService.execute({
      orderId: OrderId.parse(seededOrderId),
      tenantId: TenantId.parse(tenantId),
      reason: 'guest changed mind',
    }),
  );

  expect(await readOrderStatus(seededOrderId)).toBe('canceled');
  expect(await readOutboxTypes(seededOrderId)).toContain(
    'ordering.order_canceled.v1',
  );
  expect(providerMock.createRefund).not.toHaveBeenCalled();
});
```

**Copy exactly** for every new accept/reject/start-preparing/mark-ready/complete/cancel test: real `OrderDrizzleRepository`/`PaymentDrizzleRepository` against the live DB, only `PaymentProviderPort` mocked, invocation wrapped in `runInTenantContext({ tenantId }, () => service.execute(...))`, assertion via `readOrderStatus`/`readOutboxTypes` reading the actual table — never assert against the in-memory `Order` object or a mocked repository's call args.

**MANDATORY existing-test fix** (`payment-lifecycle.e2e.spec.ts:541-576`, `'operator cancel of a paid order persists the auto-refund transition'`): the assertion `expect(status).toBe('refunded')` at line 573 must become `.toBe('canceled')` once D-08/D-09 land, with a WHY-comment explaining the pre-Phase-10 interim behavior being superseded — this is Landmine 1, not an accidental regression.

## Shared Patterns

### Tenant/location plumbing on every admin mutation call

**Source:** `apps/admin/src/lib/api-client.ts:16-53` (full file, `apiFetch`)
**Apply to:** every new admin query/mutation function in `lib/queries/orders.ts`

```ts
export const apiFetch = async <T>(
  path: string,
  opts: { method?; body?; brandSlug?; locationId?; signal?: AbortSignal } = {},
): Promise<ApiFetchResult<T>> => {
  // tenantId from session, x-tenant-id / x-brand-slug / x-location-id headers,
  // AbortSignal.timeout(10s GET / 30s mutation) composed with opts.signal via AbortSignal.any,
  // one retry only on idempotent GET 5xx (maxAttempts = isGet ? 2 : 1)
};
```

**Critical:** `opts.locationId !== 'all'` guard (`api-client.ts:48-50`) means passing `'all'` omits the header entirely — every order-mutation call site MUST pass the order's own concrete `locationId`, never `useEffectiveLocation()`'s `'all'` sentinel, or `LocationScopeGuard` 403s (RESEARCH.md B.7's root-cause finding).

### `wrapWith(mapper)` + domain-error-class + error-mapping chain (backend)

**Source:** `apps/api/src/contexts/ordering/interfaces/http/error-mapping.ts` + every controller's `const wrap = wrapWith(mapXError)`
**Apply to:** every new/touched controller method in `orders.controller.ts`, `refunds.controller.ts`

### `db.withTenant((tx, scoped) => scoped.selectFrom(...))` — ScopedTx double-enforcement

**Source:** `apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts` (every read/write method)
**Apply to:** `order-drizzle.repository.ts#list()`, `order_daily_sequences` counter insert, every new repository method this phase adds. Never a raw `tx.select()` without an explicit `eq(table.tenantId, ...)` unless doing the sanctioned cross-location `GROUP BY` escape hatch (see `listStopListAggregateAcrossLocations`).

### `buildEnvelope` for every new outbox append

**Source:** `apps/api/src/contexts/ordering/infrastructure/order-drizzle.repository.ts#domainEventToEnvelope()` (`buildEnvelope(ContractV1, payload, { tenantId, occurredAt })`)
**Apply to:** every new/touched event-producing call site this phase adds (never a hand-built `EventEnvelope` literal, never `randomUUID()` for `correlationId`).

### `@Permissions` / `@RequireBrand` / `@LocationNeutral` / `@RequireActiveTenant` guard vocabulary

**Source:** `apps/api/src/contexts/catalog/interfaces/http/catalog.controller.ts` + `apps/api/src/contexts/tenancy/interfaces/http/locations.controller.ts`
**Apply to:** every new order route — per the route-by-route table in the Controller pattern section above; this is the single most consequential shared pattern in the phase (RESEARCH.md B.7/Landmine 5).

## No Analog Found

Files with no close match in the codebase (planner should use RESEARCH.md/UI-SPEC patterns instead):

| File                                                                        | Role      | Data Flow        | Reason                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------- | --------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/admin/src/lib/hooks/use-order-sound.ts`                               | hook      | event-driven     | Zero existing `new Audio(`/`HTMLAudioElement` usage anywhere in `apps/admin/src` (confirmed via repo grep in RESEARCH.md G.22) — net-new browser-API integration with an autoplay-policy constraint that has no precedent to copy. Build per UI-SPEC Section 8's explicit design (default-on, `.catch()`-wrapped `play()`, visible "enable sound" fallback on rejection).                                                                                                                                      |
| `apps/admin/src/lib/hooks/use-tab-title.ts`                                 | hook      | event-driven     | Zero existing `document.title` mutation precedent in `apps/admin/src` (confirmed via grep). Small, self-contained — mount/update effect + unmount restore, per UI-SPEC Section 8.                                                                                                                                                                                                                                                                                                                              |
| `apps/admin/src/components/orders/accept-popover.tsx`, `reject-popover.tsx` | component | request-response | `Popover` is a net-new shadcn component for `apps/admin` this phase (`npx shadcn add popover` — UI-SPEC Registry Safety section); no existing Popover-based mutation-confirm flow exists to copy the interaction shape from. Build directly from UI-SPEC Sections 4/5 (chip-tap-is-confirm, `h-12` touch targets) — the closest structural cousin is `AlertDialog`'s confirm-button pattern used elsewhere in the admin app, but the interaction model (inline, non-modal, immediate-fire-on-chip-tap) is new. |

## Metadata

**Analog search scope:** `apps/api/src/contexts/{ordering,payments,catalog,tenancy,identity,notifications}`, `apps/api/src/shared`, `packages/{db,events,domain}`, `apps/admin/src/{routes,components,lib}`, `apps/website/components/checkout`, `apps/api/test/e2e`
**Files scanned:** ~45 (read in full or targeted excerpt) across backend bounded contexts, admin SPA, website, and test harness
**Pattern extraction date:** 2026-08-13
