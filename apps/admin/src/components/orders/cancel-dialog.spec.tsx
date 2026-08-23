import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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

const { CancelDialog } = await import('./cancel-dialog');

const makeQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

const Wrap = ({ children }: { children: React.ReactNode }): React.ReactElement => (
  <QueryClientProvider client={makeQueryClient()}>{children}</QueryClientProvider>
);

const order = {
  id: 'order-1',
  shortNumber: 42,
  locationId: 'loc-1',
  total: '1200.00',
  currency: 'RUB',
};

describe('CancelDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('the confirm button label carries the same formatted amount as the dialog description', async () => {
    const user = userEvent.setup();
    render(
      <Wrap>
        <CancelDialog order={order} />
      </Wrap>,
    );

    await user.click(screen.getByRole('button', { name: 'orders.cancel.triggerBtn' }));

    const description = screen.getByText(/orders\.cancel\.dialogDescription/);
    const confirmButton = screen.getByRole('button', { name: /orders\.cancel\.confirmBtn/ });

    const amountMatch = /"amount":"([^"]+)"/.exec(description.textContent);
    expect(amountMatch).not.toBeNull();
    const amount = amountMatch?.[1] ?? '';
    expect(amount.length).toBeGreaterThan(0);
    expect(confirmButton.textContent).toContain(amount);
  });

  it('the confirm button stays disabled until a reason is chosen', async () => {
    const user = userEvent.setup();
    render(
      <Wrap>
        <CancelDialog order={order} />
      </Wrap>,
    );

    await user.click(screen.getByRole('button', { name: 'orders.cancel.triggerBtn' }));

    const confirmButton = screen.getByRole<HTMLButtonElement>('button', {
      name: /orders\.cancel\.confirmBtn/,
    });
    expect(confirmButton.disabled).toBe(true);
  });

  it('confirming fires cancelOrderMutation with the selected reason code and full order amount', async () => {
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
        <CancelDialog order={order} />
      </Wrap>,
    );

    await user.click(screen.getByRole('button', { name: 'orders.cancel.triggerBtn' }));
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'orders.reasons.kitchenBusy' }));

    const confirmButton = screen.getByRole<HTMLButtonElement>('button', {
      name: /orders\.cancel\.confirmBtn/,
    });
    expect(confirmButton.disabled).toBe(false);
    await user.click(confirmButton);

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        '/v1/orders/order-1/cancel',
        expect.objectContaining({
          method: 'POST',
          body: { reasonCode: 'kitchen_too_busy' },
          locationId: 'loc-1',
        }),
      );
    });
  });

  it('no amount/partial input exists anywhere in the cancel flow', async () => {
    const user = userEvent.setup();
    render(
      <Wrap>
        <CancelDialog order={order} />
      </Wrap>,
    );

    await user.click(screen.getByRole('button', { name: 'orders.cancel.triggerBtn' }));
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });
});
