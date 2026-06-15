import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { Currency, TenantId } from '@resto/domain';
import { ORDER_REPOSITORY, type OrderRepository } from '../domain/ports';
import { Order } from '../domain/order.aggregate';
import { generateOrderNumber, type CreateOrderInput } from './dto';

@Injectable()
export class CreateOrderService {
  constructor(@Inject(ORDER_REPOSITORY) private readonly repo: OrderRepository) {}

  async execute(input: CreateOrderInput): Promise<{ orderId: string; orderNumber: string }> {
    const ctx = requireTenantContext();
    const tenantId = TenantId.parse(ctx.tenantId);

    const currency = Currency.parse(input.items[0]?.currency ?? 'USD');
    for (const item of input.items) {
      if (item.currency !== currency) {
        throw new UnprocessableEntityException({
          code: 'ordering.currency_mismatch',
          message: 'All cart items must use the same currency.',
        });
      }
    }

    const orderNumber = generateOrderNumber();

    const domainItems = input.items.map((item) => ({
      menuItemId: item.itemId,
      nameSnapshot: item.name,
      unitPrice: item.unitPrice,
      currency: Currency.parse(item.currency),
      modifiers: item.modifiers.map((m) => ({
        optionId: m.optionId,
        nameSnapshot: m.name,
        priceDelta: m.priceDelta,
        amount: m.amount ?? 1,
        modifierGroupId: m.modifierGroupId ?? null,
      })),
      quantity: item.quantity,
      categoryId: '',
    }));

    const order = Order.create({
      tenantId,
      brandId: ctx.brandId ?? '',
      idempotencyKey: input.idempotencyKey,
      orderNumber,
      fulfillmentMode: input.fulfillmentMode,
      tableIdentifier: input.table ?? null,
      customerName: input.customerName ?? null,
      customerPhone: input.customerPhone ?? null,
      items: domainItems,
      currency,
      discountSpec: input.discountSpec ?? null,
      scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
    });

    await this.repo.save(order);

    const existing = await this.repo.findByIdempotencyKey(tenantId, input.idempotencyKey);
    const snap = existing?.toSnapshot() ?? order.toSnapshot();

    return { orderId: snap.id, orderNumber: snap.orderNumber };
  }
}
