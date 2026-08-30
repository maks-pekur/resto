import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { OrderFeedRowApi } from '@/lib/queries/orders';

const { apiFetchMock, toastSuccessMock, toastErrorMock, canMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  canMock: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));

vi.mock('sonner', () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
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

const failedRefundRow: OrderFeedRowApi = {
  id: 'order-1',
  shortNumber: 42,
  status: 'completed',
  locationId: 'loc-1',
  locationName: 'Центр',
  orderType: 'dine_in',
  tableIdentifier: null,
  tableZoneName: null,
  tableNumber: null,
  customerName: null,
  customerPhone: null,
  paymentType: 'online',
  total: '1200.00',
  currency: 'RUB',
  itemCount: 1,
  channel: 'site',
  createdAt: new Date('2026-08-16T10:00:00.000Z').toISOString(),
  acceptedAt: null,
  preparingAt: null,
  readyAt: null,
  completedAt: new Date('2026-08-16T10:30:00.000Z').toISOString(),
  canceledAt: null,
  etaAt: null,
  cancelReason: null,
  canceledFromStatus: null,
  hasFailedRefund: true,
};

describe('OrderRow — refund-failure surface (D-11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canMock.mockReturnValue(true);
  });

  it('a failed-refund terminal card renders undimmed and with a retry action', () => {
    const { container } = render(
      <Wrap>
        <OrderRow row={failedRefundRow} showLocationBadge={false} onOpenDetail={vi.fn()} />
      </Wrap>,
    );

    const row = container.querySelector('[data-testid="order-row-order-1"]');
    expect(row).not.toBeNull();
    expect(row?.className).not.toContain('opacity');
    expect(row?.className).toContain('bg-destructive');

    expect(screen.getByRole('button', { name: /orders\.refund\.retryBtn/ })).toBeTruthy();
  });

  it('the card-level retry button is absent without order:cancel', () => {
    canMock.mockReturnValue(false);
    render(
      <Wrap>
        <OrderRow row={failedRefundRow} showLocationBadge={false} onOpenDetail={vi.fn()} />
      </Wrap>,
    );

    expect(screen.queryByRole('button', { name: /orders\.refund\.retryBtn/ })).toBeNull();
  });

  it('a failed retry leaves the retry button and refund-failed badge on screen', async () => {
    apiFetchMock.mockResolvedValue({ ok: false, status: 500, data: null });
    const user = userEvent.setup();
    render(
      <Wrap>
        <OrderRow row={failedRefundRow} showLocationBadge={false} onOpenDetail={vi.fn()} />
      </Wrap>,
    );

    await user.click(screen.getByRole('button', { name: /orders\.refund\.retryBtn/ }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalled();
    });

    expect(screen.getByRole('button', { name: /orders\.refund\.retryBtn/ })).toBeTruthy();
    expect(screen.getByText('orders.card.refundFailedBadge')).toBeTruthy();
  });

  it('tapping the retry button fires retryRefundMutation with no client-supplied refundRequestId', async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { stripeRefundId: 'stripe-1', amountMinor: 120000, fullyRefunded: true },
    });
    const user = userEvent.setup();
    render(
      <Wrap>
        <OrderRow row={failedRefundRow} showLocationBadge={false} onOpenDetail={vi.fn()} />
      </Wrap>,
    );

    await user.click(screen.getByRole('button', { name: /orders\.refund\.retryBtn/ }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        '/v1/orders/order-1/refund/retry',
        expect.objectContaining({
          method: 'POST',
          locationId: 'loc-1',
        }),
      );
    });
    const [, opts] = apiFetchMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(opts.body).toBeUndefined();
  });
});
