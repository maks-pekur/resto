import { Inject, Injectable } from '@nestjs/common';
import { requireBrandContext, requireTenantContext, withLocation } from '@resto/db';
import { Currency, TenantId } from '@resto/domain';
import { DefaultLocationResolverService } from '../../catalog/application/default-location-resolver.service';
import {
  MENU_PRICING_PORT,
  ORDER_REPOSITORY,
  type MenuPricingPort,
  type PricedMenuItem,
  type OrderRepository,
} from '../domain/ports';
import {
  OrderItemNotOrderableError,
  OrderItemUnavailableError,
  OrderModifierNotAvailableError,
  OrderModifierSelectionInvalidError,
} from '../domain/errors';
import { Order, type CreateOrderInput as DomainCreateOrderInput } from '../domain/order.aggregate';
import { generateOrderNumber, type CreateOrderInput, type OrderResponse } from './dto';

type DomainItem = DomainCreateOrderInput['items'][number];

@Injectable()
export class CreateOrderService {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly repo: OrderRepository,
    @Inject(MENU_PRICING_PORT) private readonly pricing: MenuPricingPort,
    @Inject(DefaultLocationResolverService)
    private readonly defaultLocation: DefaultLocationResolverService,
  ) {}

  async execute(input: CreateOrderInput): Promise<OrderResponse> {
    const ctx = requireTenantContext();
    const tenantId = TenantId.parse(ctx.tenantId);
    const brandId = requireBrandContext();
    const locationId = await this.defaultLocation.resolveForBrand(brandId, tenantId);

    const snapshot = await this.pricing.loadSnapshot(tenantId, brandId);
    const currency = Currency.parse(snapshot.currency);
    const itemsById = new Map(snapshot.items.map((i) => [i.itemId, i]));
    const groupsById = new Map(snapshot.modifierGroups.map((g) => [g.groupId, g]));
    const optionsById = new Map(snapshot.modifierOptions.map((o) => [o.optionId, o]));
    const stopped = new Set(snapshot.stoppedItemIds);

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
        if (!option || !published.modifierGroupIds.includes(option.groupId)) {
          throw new OrderModifierNotAvailableError(m.optionId);
        }
        const amount = m.amount ?? 1;
        if (option.maxAmount !== null && amount > option.maxAmount) {
          throw new OrderModifierNotAvailableError(m.optionId);
        }
        if (option.minAmount !== null && amount < option.minAmount) {
          throw new OrderModifierNotAvailableError(m.optionId);
        }
        return {
          optionId: option.optionId,
          nameSnapshot: m.name,
          priceDelta: option.priceDelta,
          amount,
          freeAmount: option.freeAmount,
          modifierGroupId: option.groupId,
        };
      });

      const countByGroup = new Map<string, number>();
      for (const m of modifiers) {
        countByGroup.set(m.modifierGroupId, (countByGroup.get(m.modifierGroupId) ?? 0) + 1);
      }
      for (const groupId of published.modifierGroupIds) {
        const group = groupsById.get(groupId);
        if (!group) continue;
        const count = countByGroup.get(groupId) ?? 0;
        if (group.isRequired && count === 0) {
          throw new OrderModifierSelectionInvalidError(groupId, 'a selection is required');
        }
        if (count < group.minSelectable) {
          throw new OrderModifierSelectionInvalidError(
            groupId,
            `at least ${group.minSelectable} required`,
          );
        }
        if (count > group.maxSelectable) {
          throw new OrderModifierSelectionInvalidError(
            groupId,
            `at most ${group.maxSelectable} allowed`,
          );
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

    const order = Order.create({
      tenantId,
      brandId,
      locationId,
      idempotencyKey: input.idempotencyKey,
      orderNumber,
      fulfillmentMode: input.fulfillmentMode,
      tableIdentifier: input.table ?? null,
      customerName: input.customerName ?? null,
      customerPhone: input.customerPhone ?? null,
      customerEmail: input.customerEmail ?? null,
      items: domainItems,
      currency,
      discountSpec: null,
      scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
    });

    await withLocation(locationId, () => this.repo.save(order));

    const existing = await this.repo.findByIdempotencyKey(tenantId, input.idempotencyKey);
    const snap = existing?.toSnapshot() ?? order.toSnapshot();

    return {
      orderId: snap.id,
      orderNumber: snap.orderNumber,
      status: snap.status,
      total: snap.total,
      currency: snap.currency,
    };
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
}
