import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import type { GetOrderService } from '../../application/get-order.service';
import type { CreateOrderService } from '../../application/create-order.service';
import { OrderNotFoundError } from '../../domain/errors';
import type { OrderSnapshot } from '../../domain/order.aggregate';
import { Currency, OrderId, TenantId } from '@resto/domain';
import { randomUUID } from 'node:crypto';

const makeOrderSnap = (overrides: Partial<OrderSnapshot> = {}): OrderSnapshot => ({
  id: OrderId.parse(randomUUID()),
  tenantId: TenantId.parse(randomUUID()),
  brandId: randomUUID(),
  locationId: randomUUID(),
  idempotencyKey: randomUUID(),
  orderNumber: '20260627-ABCDE',
  status: 'created',
  fulfillmentMode: 'dine_in',
  tableIdentifier: 'A1',
  customerName: null,
  customerPhone: null,
  customerEmail: null,
  items: [],
  subtotal: '25.00',
  deliveryFee: '0.00',
  serviceFee: '0.00',
  discount: '0.00',
  total: '25.00',
  currency: Currency.parse('EUR'),
  scheduledFor: null,
  shortNumber: 1,
  channel: 'site',
  acceptedAt: null,
  preparingAt: null,
  readyAt: null,
  completedAt: null,
  canceledAt: null,
  acceptedByUserId: null,
  canceledByUserId: null,
  cancelReason: null,
  cancelNote: null,
  canceledFromStatus: null,
  etaAt: null,
  marketingConsent: false,
  marketingConsentAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const buildController = () => {
  const createOrderService = {
    execute: vi.fn(),
  } as unknown as CreateOrderService;

  const getOrderService = {
    execute: vi.fn(),
  } as unknown as GetOrderService;

  const controller = new OrdersController(createOrderService, getOrderService);

  return { controller, getOrderService, createOrderService };
};

describe('OrdersController GET /:id/status', () => {
  it('returns status, total, currency, and orderNumber for a found order', async () => {
    const { controller, getOrderService } = buildController();
    const snap = makeOrderSnap({ status: 'requires_action' });
    vi.mocked(getOrderService.execute).mockResolvedValue(snap);

    const result = await controller.getStatus(snap.id);

    expect(result).toEqual({
      status: 'requires_action',
      total: '25.00',
      currency: 'EUR',
      orderNumber: '20260627-ABCDE',
      eta: null,
    });
  });

  it('returns paid status when order is paid', async () => {
    const { controller, getOrderService } = buildController();
    const snap = makeOrderSnap({ status: 'paid' });
    vi.mocked(getOrderService.execute).mockResolvedValue(snap);

    const result = await controller.getStatus(snap.id);

    expect(result.status).toBe('paid');
  });

  it('does NOT mutate order state (read-only)', async () => {
    const { controller, getOrderService } = buildController();
    const snap = makeOrderSnap();
    vi.mocked(getOrderService.execute).mockResolvedValue(snap);

    await controller.getStatus(snap.id);

    expect(getOrderService.execute).toHaveBeenCalledWith({ orderId: snap.id });
    expect(getOrderService.execute).toHaveBeenCalledTimes(1);
  });

  it('propagates OrderNotFoundError as NotFoundException via wrapWith', async () => {
    const { controller, getOrderService } = buildController();
    vi.mocked(getOrderService.execute).mockRejectedValue(
      new OrderNotFoundError('missing-order-id'),
    );

    await expect(controller.getStatus('missing-order-id')).rejects.toThrow(NotFoundException);
  });

  it('includes eta when scheduledFor is set', async () => {
    const { controller, getOrderService } = buildController();
    const scheduledFor = new Date('2026-06-28T18:00:00Z');
    const snap = makeOrderSnap({ scheduledFor });
    vi.mocked(getOrderService.execute).mockResolvedValue(snap);

    const result = await controller.getStatus(snap.id);

    expect(result.eta).toEqual(scheduledFor.toISOString());
  });
});
