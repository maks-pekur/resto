import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { OrderDetailApi, OrderFeedRowApi } from '@/lib/queries/orders';

const { apiFetchMock, canMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  canMock: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ can: canMock }),
}));

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-i18next');
  return {
    ...actual,
    useTranslation: (_ns?: string, opts?: { keyPrefix?: string }) => ({
      t: (key: string, vars?: Record<string, unknown>) => {
        const full = opts?.keyPrefix ? `${opts.keyPrefix}.${key}` : key;
        return vars && Object.keys(vars).length > 0 ? `${full}(${JSON.stringify(vars)})` : full;
      },
      i18n: { language: 'ru', changeLanguage: vi.fn() },
    }),
  };
});

const { OrderDetailSheet } = await import('@/components/orders/order-detail-sheet');

const makeQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

const Wrap = ({ children }: { children: React.ReactNode }): React.ReactElement => (
  <QueryClientProvider client={makeQueryClient()}>
    <TooltipProvider>{children}</TooltipProvider>
  </QueryClientProvider>
);

const feedRow: OrderFeedRowApi = {
  id: 'order-1',
  shortNumber: 42,
  status: 'accepted',
  locationId: 'loc-1',
  locationName: 'Центр',
  customerName: null,
  customerPhone: null,
  paymentType: 'online',
  paymentStatus: 'paid',
  orderType: 'dine_in',
  tableIdentifier: null,
  tableZoneName: null,
  tableNumber: null,
  total: '1200.00',
  currency: 'RUB',
  itemCount: 1,
  channel: 'site',
  createdAt: new Date('2026-08-16T10:00:00.000Z').toISOString(),
  acceptedAt: new Date('2026-08-16T10:01:00.000Z').toISOString(),
  preparingAt: null,
  readyAt: null,
  completedAt: null,
  canceledAt: null,
  etaAt: null,
  cancelReason: null,
  canceledFromStatus: null,
  hasFailedRefund: false,
};

const detail: OrderDetailApi = {
  review: null,
  id: 'order-1',
  tenantId: 'tenant-1',
  locationId: 'loc-1',
  orderNumber: '20260810-A7K2M',
  status: 'accepted',
  orderType: 'dine_in',
  tableIdentifier: null,
  tableZoneName: null,
  tableNumber: null,
  customerName: 'Иван Иванов',
  customerPhone: '+79991234567',
  customerEmail: null,
  items: [
    {
      id: 'item-1',
      menuItemId: 'menu-1',
      nameSnapshot: 'Пицца Маргарита',
      unitPrice: '1200.00',
      currency: 'RUB',
      modifiers: [],
      quantity: 1,
      lineTotal: '1200.00',
      categoryId: 'cat-1',
    },
  ],
  subtotal: '1200.00',
  deliveryFee: '0.00',
  serviceFee: '0.00',
  discount: '0.00',
  total: '1200.00',
  currency: 'RUB',
  scheduledFor: null,
  shortNumber: 42,
  channel: 'site',
  acceptedAt: feedRow.acceptedAt,
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
  createdAt: feedRow.createdAt,
  updatedAt: feedRow.createdAt,
  hasFailedRefund: false,
  failedRefundAmount: null,
  failedRefundReason: null,
};

describe('OrderDetailSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetchMock.mockResolvedValue({ ok: true, status: 200, data: detail });
  });

  it('the discretionary refund section is absent from the DOM (not merely disabled) without billing:update', async () => {
    canMock.mockImplementation((resource: string, action: string) => {
      if (resource === 'order' && action === 'cancel') return true;
      return false;
    });
    render(
      <Wrap>
        <OrderDetailSheet order={feedRow} onOpenChange={vi.fn()} />
      </Wrap>,
    );

    await waitFor(() => {
      expect(screen.queryByText('orders.detail.itemsTitle')).not.toBeNull();
    });

    expect(screen.queryByText('orders.refund.title')).toBeNull();
    expect(screen.queryByLabelText('orders.refund.amountLabel')).toBeNull();
  });

  it('hides the discretionary refund control on an order that is not completed', async () => {
    canMock.mockReturnValue(true);
    apiFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { ...detail, status: 'accepted' },
    });
    render(
      <Wrap>
        <OrderDetailSheet order={feedRow} onOpenChange={vi.fn()} />
      </Wrap>,
    );

    await waitFor(() => {
      expect(screen.queryByText('orders.detail.itemsTitle')).not.toBeNull();
    });
    expect(screen.queryByLabelText('orders.refund.amountLabel')).toBeNull();
  });

  it('hides the cancel control on an already-canceled order', async () => {
    canMock.mockReturnValue(true);
    apiFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { ...detail, status: 'canceled' },
    });
    render(
      <Wrap>
        <OrderDetailSheet order={feedRow} onOpenChange={vi.fn()} />
      </Wrap>,
    );

    await waitFor(() => {
      expect(screen.queryByText('orders.detail.itemsTitle')).not.toBeNull();
    });
    expect(screen.queryByText('orders.detail.cancelBtn')).toBeNull();
  });

  it('renders the discretionary refund section when the operator has billing:update', async () => {
    canMock.mockImplementation((resource: string, action: string) => {
      if (resource === 'billing' && action === 'update') return true;
      if (resource === 'order' && action === 'cancel') return true;
      return false;
    });
    apiFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { ...detail, status: 'completed' },
    });
    render(
      <Wrap>
        <OrderDetailSheet order={feedRow} onOpenChange={vi.fn()} />
      </Wrap>,
    );

    await waitFor(() => {
      expect(screen.queryByText('orders.refund.title')).not.toBeNull();
    });
  });

  it('the footer cancel trigger is absent without order:cancel', async () => {
    canMock.mockReturnValue(false);
    render(
      <Wrap>
        <OrderDetailSheet order={feedRow} onOpenChange={vi.fn()} />
      </Wrap>,
    );

    await waitFor(() => {
      expect(screen.queryByText('orders.detail.itemsTitle')).not.toBeNull();
    });

    expect(screen.queryByText('orders.cancel.triggerBtn')).toBeNull();
  });

  it('the internal orderNumber appears exactly once, and the delivery-in-transit language never appears', async () => {
    canMock.mockReturnValue(true);
    render(
      <Wrap>
        <OrderDetailSheet order={feedRow} onOpenChange={vi.fn()} />
      </Wrap>,
    );

    await waitFor(() => {
      expect(screen.getAllByText(/20260810-A7K2M/)).toHaveLength(1);
    });

    const bodyText = document.body.textContent;
    expect(/on its way|в пути|курьер/i.test(bodyText)).toBe(false);
  });

  it('renders sections in the specified order: header, items, timeline, then the money block', async () => {
    canMock.mockReturnValue(true);
    apiFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { ...detail, status: 'completed' },
    });
    render(
      <Wrap>
        <OrderDetailSheet order={feedRow} onOpenChange={vi.fn()} />
      </Wrap>,
    );

    await waitFor(() => {
      expect(screen.queryByText('orders.detail.itemsTitle')).not.toBeNull();
    });

    const bodyText = document.body.textContent;
    const dailyNumberIndex = bodyText.indexOf('orders.card.dailyNumber');
    const itemsIndex = bodyText.indexOf('orders.detail.itemsTitle');
    const timelineIndex = bodyText.indexOf('orders.detail.timelineTitle');
    const refundIndex = bodyText.indexOf('orders.refund.title');

    expect(dailyNumberIndex).toBeGreaterThanOrEqual(0);
    expect(itemsIndex).toBeGreaterThan(dailyNumberIndex);
    expect(timelineIndex).toBeGreaterThan(itemsIndex);
    expect(refundIndex).toBeGreaterThan(timelineIndex);
  });

  it('puts the cancel control after the timeline on a cancelable order', async () => {
    canMock.mockReturnValue(true);
    apiFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { ...detail, status: 'accepted' },
    });
    render(
      <Wrap>
        <OrderDetailSheet order={feedRow} onOpenChange={vi.fn()} />
      </Wrap>,
    );

    await waitFor(() => {
      expect(screen.queryByText('orders.detail.itemsTitle')).not.toBeNull();
    });

    const bodyText = document.body.textContent;
    const timelineIndex = bodyText.indexOf('orders.detail.timelineTitle');
    const cancelIndex = bodyText.indexOf('orders.cancel.triggerBtn');

    expect(timelineIndex).toBeGreaterThanOrEqual(0);
    expect(cancelIndex).toBeGreaterThan(timelineIndex);
  });
});
