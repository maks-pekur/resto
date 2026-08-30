import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

const { AcceptPopover } = await import('@/components/orders/accept-popover');

const makeQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

const Wrap = ({ children }: { children: React.ReactNode }): React.ReactElement => (
  <QueryClientProvider client={makeQueryClient()}>{children}</QueryClientProvider>
);

const baseOrder: OrderFeedRowApi = {
  id: 'order-1',
  shortNumber: 42,
  status: 'paid',
  locationId: 'loc-1',
  locationName: 'Центр',
  fulfillmentMode: 'dine_in',
  tableIdentifier: null,
  tableZoneName: null,
  tableNumber: null,
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

describe('AcceptPopover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tapping a fixed chip fires the mutation with the matching prepMinutes and no intermediate confirm click', async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { etaAt: new Date('2026-01-01T12:20:00.000Z').toISOString() },
    });
    const user = userEvent.setup();
    render(
      <Wrap>
        <AcceptPopover order={baseOrder} />
      </Wrap>,
    );

    await user.click(screen.getByRole('button', { name: 'orders.card.acceptBtn' }));
    await user.click(screen.getByRole('button', { name: 'orders.accept.chip20' }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });
    expect(apiFetchMock).toHaveBeenCalledWith(
      '/v1/orders/order-1/accept',
      expect.objectContaining({
        method: 'POST',
        body: { prepMinutes: 20 },
        locationId: 'loc-1',
      }),
    );

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'orders.accept.chip20' })).toBeNull();
    });
  });

  it('custom path reveals an input and confirms with the typed minutes', async () => {
    apiFetchMock.mockResolvedValue({ ok: true, status: 200, data: { etaAt: null } });
    const user = userEvent.setup();
    render(
      <Wrap>
        <AcceptPopover order={baseOrder} />
      </Wrap>,
    );

    await user.click(screen.getByRole('button', { name: 'orders.card.acceptBtn' }));
    await user.click(screen.getByRole('button', { name: 'orders.accept.customChip' }));

    const input = screen.getByPlaceholderText('orders.accept.customPlaceholder');
    await user.clear(input);
    await user.type(input, '35');
    await user.click(screen.getByRole('button', { name: 'orders.accept.customConfirm' }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        '/v1/orders/order-1/accept',
        expect.objectContaining({ body: { prepMinutes: 35 } }),
      );
    });
  });

  it('shows an error toast when the mutation fails', async () => {
    apiFetchMock.mockResolvedValue({ ok: false, status: 500, data: null });
    const user = userEvent.setup();
    render(
      <Wrap>
        <AcceptPopover order={baseOrder} />
      </Wrap>,
    );

    await user.click(screen.getByRole('button', { name: 'orders.card.acceptBtn' }));
    await user.click(screen.getByRole('button', { name: 'orders.accept.chip15' }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalled();
    });
    expect(screen.queryByRole('button', { name: 'orders.accept.chip15' })).not.toBeNull();
  });
});
