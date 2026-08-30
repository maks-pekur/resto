import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { canMock } = vi.hoisted(() => ({ canMock: vi.fn(() => true) }));

vi.mock('@/hooks/use-permissions', () => ({ usePermissions: () => ({ can: canMock }) }));
vi.mock('@/lib/queries/orders', () => ({ retryRefundMutation: vi.fn() }));

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-i18next');
  return {
    ...actual,
    useTranslation: (_ns?: string, opts?: { keyPrefix?: string }) => ({
      t: (key: string) => (opts?.keyPrefix ? `${opts.keyPrefix}.${key}` : key),
      i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
  };
});

const { TransactionsTable } = await import('@/components/transactions/transactions-table');

const row = (overrides: Record<string, unknown> = {}) => ({
  paymentId: 'pay-1',
  orderId: 'order-1',
  orderShortNumber: 42,
  locationId: 'loc-1',
  status: 'succeeded',
  amount: '100.00',
  refundedAmount: '0.00',
  currency: 'EUR',
  hasFailedRefund: false,
  createdAt: new Date('2026-08-30T10:00:00.000Z').toISOString(),
  ...overrides,
});

const renderTable = (rows: ReturnType<typeof row>[]) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TransactionsTable rows={rows} />
    </QueryClientProvider>,
  );

describe('TransactionsTable', () => {
  it('reads a clean payment as paid, with no retry offered', () => {
    renderTable([row()]);

    expect(screen.getByText('transactions.status.paid')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'transactions.retryBtn' })).not.toBeInTheDocument();
  });

  it('separates a refunded payment from a failed one', () => {
    renderTable([row({ refundedAmount: '100.00' })]);

    expect(screen.getByText('transactions.status.refunded')).toBeInTheDocument();
  });

  it('offers a retry on the payment whose refund failed', () => {
    renderTable([row({ hasFailedRefund: true })]);

    expect(screen.getByText('transactions.status.failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'transactions.retryBtn' })).toBeInTheDocument();
  });

  it('withholds the retry from an operator who cannot cancel orders', () => {
    canMock.mockReturnValueOnce(false);

    renderTable([row({ hasFailedRefund: true })]);

    expect(screen.queryByRole('button', { name: 'transactions.retryBtn' })).not.toBeInTheDocument();
  });
});
