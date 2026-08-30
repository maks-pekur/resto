import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { OrderFeedRowApi } from '@/lib/queries/orders';

const { apiFetchMock, toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
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

const { RejectPopover } = await import('@/components/orders/reject-popover');
const { OrderRow } = await import('@/components/orders/order-row');

const makeQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

const Wrap = ({ children }: { children: React.ReactNode }): React.ReactElement => (
  <QueryClientProvider client={makeQueryClient()}>
    <TooltipProvider>{children}</TooltipProvider>
  </QueryClientProvider>
);

const baseOrder: OrderFeedRowApi = {
  id: 'order-1',
  shortNumber: 42,
  status: 'paid',
  locationId: 'loc-1',
  locationName: 'Центр',
  orderType: 'dine_in',
  tableIdentifier: null,
  tableZoneName: null,
  tableNumber: null,
  customerName: null,
  customerPhone: null,
  total: '1200.00',
  currency: 'RUB',
  itemCount: 3,
  channel: 'site',
  createdAt: new Date().toISOString(),
  acceptedAt: null,
  preparingAt: null,
  readyAt: null,
  completedAt: null,
  canceledAt: null,
  etaAt: null,
  cancelReason: null,
  canceledFromStatus: null,
  hasFailedRefund: false,
};

describe('RejectPopover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tapping a reason chip fires cancelOrderMutation with the matching canonical code', async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        canceled: true,
        refund: { attempted: true, outcome: 'succeeded', amountMinor: 120000 },
      },
    });
    const user = userEvent.setup();
    render(
      <Wrap>
        <RejectPopover order={baseOrder} />
      </Wrap>,
    );

    await user.click(screen.getByRole('button', { name: 'orders.card.rejectBtn' }));
    await user.click(screen.getByRole('button', { name: 'orders.reasons.kitchenBusy' }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });
    expect(apiFetchMock).toHaveBeenCalledWith(
      '/v1/orders/order-1/cancel',
      expect.objectContaining({
        method: 'POST',
        body: { reasonCode: 'kitchen_too_busy' },
        locationId: 'loc-1',
      }),
    );

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'orders.reasons.kitchenBusy' })).toBeNull();
    });
  });

  it('shows an error toast when the cancel mutation fails', async () => {
    apiFetchMock.mockResolvedValue({ ok: false, status: 500, data: null });
    const user = userEvent.setup();
    render(
      <Wrap>
        <RejectPopover order={baseOrder} />
      </Wrap>,
    );

    await user.click(screen.getByRole('button', { name: 'orders.card.rejectBtn' }));
    await user.click(screen.getByRole('button', { name: 'orders.reasons.outOfStock' }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalled();
    });
    expect(screen.queryByRole('button', { name: 'orders.reasons.outOfStock' })).not.toBeNull();
  });
});

describe('OrderCard advance mutation — Product MED-17 (concurrent-transition idempotency)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('a repeated advance mutation resolving with the unchanged current state produces no error toast', async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { ...baseOrder, status: 'preparing' },
    });
    const acceptedRow: OrderFeedRowApi = {
      ...baseOrder,
      status: 'accepted',
      acceptedAt: baseOrder.createdAt,
    };
    const user = userEvent.setup();
    render(
      <Wrap>
        <OrderRow row={acceptedRow} showLocationBadge={false} onOpenDetail={vi.fn()} />
      </Wrap>,
    );

    const advanceBtn = screen.getByRole<HTMLButtonElement>('button', {
      name: 'orders.card.startPreparingBtn',
    });
    await user.click(advanceBtn);

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        '/v1/orders/order-1/advance',
        expect.objectContaining({ body: { targetStatus: 'preparing' } }),
      );
    });

    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(advanceBtn.disabled).toBe(false);
  });

  it('shows an error toast when the advance mutation truly fails', async () => {
    apiFetchMock.mockResolvedValue({ ok: false, status: 500, data: null });
    const acceptedRow: OrderFeedRowApi = {
      ...baseOrder,
      status: 'accepted',
      acceptedAt: baseOrder.createdAt,
    };
    const user = userEvent.setup();
    render(
      <Wrap>
        <OrderRow row={acceptedRow} showLocationBadge={false} onOpenDetail={vi.fn()} />
      </Wrap>,
    );

    const advanceBtn = screen.getByRole<HTMLButtonElement>('button', {
      name: 'orders.card.startPreparingBtn',
    });
    await user.click(advanceBtn);

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalled();
    });
    expect(advanceBtn.disabled).toBe(false);
  });
});
