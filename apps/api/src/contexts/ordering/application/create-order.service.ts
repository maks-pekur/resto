import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext, schema, TenantAwareDb, withLocation } from '@resto/db';
import { Currency, TenantId } from '@resto/domain';
import { eq } from 'drizzle-orm';
import { DefaultLocationResolverService } from '../../catalog/application/default-location-resolver.service';
import {
  MENU_PRICING_PORT,
  ORDER_REPOSITORY,
  ORDER_SEQUENCE_PORT,
  ORDER_TABLE_LOOKUP_PORT,
  type MenuPricingPort,
  type PricedMenuItem,
  type OrderRepository,
  type OrderSequencePort,
  type OrderTableLookupPort,
  type ResolvedOrderTable,
} from '../domain/ports';
import {
  OrderIngredientUnavailableError,
  OrderItemNotOrderableError,
  OrderItemUnavailableError,
  OrderModifierNotAvailableError,
  OrderModifierSelectionInvalidError,
  OrderTableNotResolvedError,
} from '../domain/errors';
import { Order, type CreateOrderInput as DomainCreateOrderInput } from '../domain/order.aggregate';
import { generateOrderNumber, type CreateOrderInput, type OrderResponse } from './dto';

type DomainItem = DomainCreateOrderInput['items'][number];

@Injectable()
export class CreateOrderService {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly repo: OrderRepository,
    @Inject(MENU_PRICING_PORT) private readonly pricing: MenuPricingPort,
    @Inject(ORDER_SEQUENCE_PORT) private readonly orderSequence: OrderSequencePort,
    @Inject(ORDER_TABLE_LOOKUP_PORT) private readonly tableLookup: OrderTableLookupPort,
    @Inject(DefaultLocationResolverService)
    private readonly defaultLocation: DefaultLocationResolverService,
    @Inject(TenantAwareDb) private readonly db: TenantAwareDb,
  ) {}

  /**
   * `tableFromSession` is how a guest names their table: they cannot put one in the request, so
   * the controller passes what their scanned session resolved to.
   */
  async execute(input: CreateOrderInput, tableFromSession?: string): Promise<OrderResponse> {
    const ctx = requireTenantContext();
    const tenantId = TenantId.parse(ctx.tenantId);

    const existingOrder = await this.repo.findByIdempotencyKey(tenantId, input.idempotencyKey);
    if (existingOrder) {
      return toOrderResponse(existingOrder.toSnapshot());
    }

    const tableId = tableFromSession ?? input.tableId;
    let locationId: string;
    let resolvedTable: ResolvedOrderTable | null = null;
    if (tableId !== undefined) {
      resolvedTable = await this.tableLookup.findActiveTable(tableId);
      if (!resolvedTable) {
        throw new OrderTableNotResolvedError(tableId);
      }
      locationId = resolvedTable.locationId;
    } else {
      locationId = await this.defaultLocation.resolveForTenant(tenantId);
    }

    return withLocation(locationId, () =>
      this.#createUnderLocation(input, tenantId, locationId, resolvedTable),
    );
  }

  async #createUnderLocation(
    input: CreateOrderInput,
    tenantId: TenantId,
    locationId: string,
    resolvedTable: ResolvedOrderTable | null,
  ): Promise<OrderResponse> {
    const snapshot = await this.pricing.loadSnapshot(tenantId, locationId);
    const currency = Currency.parse(snapshot.currency);
    const itemsById = new Map(snapshot.items.map((i) => [i.itemId, i]));
    const groupsById = new Map(snapshot.modifierGroups.map((g) => [g.groupId, g]));
    const optionsById = new Map(snapshot.modifierOptions.map((o) => [o.optionId, o]));
    const stopped = new Set(snapshot.stoppedItemIds);
    const stoppedIngredients = new Set(snapshot.stoppedIngredientIds);

    const orderNumber = generateOrderNumber();

    const domainItems: DomainItem[] = input.items.map((line) => {
      const published = itemsById.get(line.itemId);
      if (!published) {
        throw new OrderItemNotOrderableError(line.itemId);
      }
      if (stopped.has(line.itemId)) {
        throw new OrderItemUnavailableError(line.itemId);
      }

      const unitPrice = this.resolveUnitPrice(published, line.sizeId);

      const modifiers = line.modifiers.map((m) => {
        const option = optionsById.get(m.optionId);
        if (!option) {
          throw new OrderModifierNotAvailableError(m.optionId);
        }
        const kind = m.kind;

        if (kind === 'excluded') {
          if (!published.removableOptionIds.includes(option.optionId)) {
            throw new OrderModifierNotAvailableError(m.optionId);
          }
          return {
            optionId: option.optionId,
            nameSnapshot: m.name,
            priceDelta: '0',
            amount: 1,
            freeAmount: 0,
            modifierGroupId: null,
            kind: 'excluded' as const,
          };
        }

        const isAllowed =
          option.groupIds.some((g) => published.modifierGroupIds.includes(g)) ||
          published.extraOptionIds.includes(option.optionId);
        if (!isAllowed) {
          throw new OrderModifierNotAvailableError(m.optionId);
        }
        if (stoppedIngredients.has(option.optionId)) {
          throw new OrderIngredientUnavailableError(option.optionId);
        }
        const amount = m.amount ?? 1;
        if (option.maxAmount !== null && amount > option.maxAmount) {
          throw new OrderModifierNotAvailableError(m.optionId);
        }
        if (option.minAmount !== null && amount < option.minAmount) {
          throw new OrderModifierNotAvailableError(m.optionId);
        }
        const modifierGroupId =
          option.groupIds.find((g) => published.modifierGroupIds.includes(g)) ?? null;
        return {
          optionId: option.optionId,
          nameSnapshot: m.name,
          priceDelta: option.priceDelta,
          amount,
          freeAmount: option.freeAmount,
          modifierGroupId,
          kind: 'added' as const,
        };
      });

      const countByGroup = new Map<string, number>();
      for (const m of modifiers) {
        if (m.kind !== 'added' || m.modifierGroupId === null) continue;
        countByGroup.set(m.modifierGroupId, (countByGroup.get(m.modifierGroupId) ?? 0) + 1);
      }
      for (const groupId of published.modifierGroupIds) {
        const group = groupsById.get(groupId);
        if (!group) continue;
        const count = countByGroup.get(groupId) ?? 0;
        if (group.isRequired && count === 0) {
          throw new OrderModifierSelectionInvalidError(groupId, 'a selection is required');
        }
        if (group.behaviour === 'one' && count > 1) {
          throw new OrderModifierSelectionInvalidError(groupId, 'only one selection allowed');
        }
      }

      return {
        menuItemId: published.itemId,
        nameSnapshot: line.name,
        unitPrice,
        currency,
        modifiers,
        quantity: line.quantity,
        categoryId: published.categoryId,
      };
    });

    const businessDate = await this.resolveBusinessDate(locationId);
    const shortNumber = await this.orderSequence.nextShortNumber({
      tenantId,
      locationId,
      businessDate,
    });

    const order = Order.create({
      tenantId,
      locationId,
      idempotencyKey: input.idempotencyKey,
      orderNumber,
      orderType: input.orderType,
      tableIdentifier: null,
      tableId: resolvedTable?.tableId ?? null,
      tableZoneName: resolvedTable?.zoneName ?? null,
      tableNumber: resolvedTable?.number ?? null,
      customerName: input.customerName ?? null,
      customerPhone: input.customerPhone ?? null,
      customerEmail: input.customerEmail ?? null,
      items: domainItems,
      currency,
      discountSpec: null,
      scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
      shortNumber,
      channel: input.channel,
      marketingConsent: input.marketingConsent,
    });

    await this.repo.save(order);

    const existing = await this.repo.findByIdempotencyKey(tenantId, input.idempotencyKey);
    const snap = existing?.toSnapshot() ?? order.toSnapshot();

    return toOrderResponse(snap);
  }

  private resolveUnitPrice(item: PricedMenuItem, sizeId: string | null): string {
    if (sizeId === null) {
      return item.basePrice;
    }
    const size = item.sizes.find((s) => s.sizeId === sizeId);
    if (!size) {
      throw new OrderItemNotOrderableError(item.itemId);
    }
    return size.price;
  }

  private async resolveBusinessDate(locationId: string): Promise<string> {
    const rows = await this.db.withTenant(async (_tx, scoped) =>
      scoped.selectFrom(schema.locations, eq(schema.locations.id, locationId)).limit(1),
    );
    const timeZone = rows[0]?.timezone ?? 'UTC';

    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    if (!year || !month || !day) {
      throw new Error(
        `resolveBusinessDate: could not format a business date for timeZone=${timeZone}.`,
      );
    }
    return `${year}-${month}-${day}`;
  }
}

function toOrderResponse(snap: {
  id: string;
  orderNumber: string;
  status: string;
  total: string;
  currency: string;
  shortNumber: number;
  channel: 'site' | 'qr-menu';
}): OrderResponse {
  return {
    orderId: snap.id,
    orderNumber: snap.orderNumber,
    status: snap.status,
    total: snap.total,
    currency: snap.currency,
    shortNumber: snap.shortNumber,
    channel: snap.channel,
  };
}
