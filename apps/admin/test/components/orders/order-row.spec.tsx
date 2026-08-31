import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { OrderFeedRowApi } from '@/lib/queries/orders';
import { deriveOrderRowState, UNACCEPTED_ESCALATION_MS } from '@/components/orders/order-row';

const { canMock } = vi.hoisted(() => ({
  canMock: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn() }));

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

const baseRow: OrderFeedRowApi = {
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
  paymentType: 'online',
  total: '1200.00',
  currency: 'RUB',
  itemCount: 3,
  channel: 'site',
  createdAt: new Date(0).toISOString(),
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

describe('deriveOrderRowState', () => {
  it('returns new for a just-paid, unaccepted order', () => {
    const now = UNACCEPTED_ESCALATION_MS - 1_000;
    expect(deriveOrderRowState(baseRow, now)).toBe('new');
  });

  it('escalates at the 5-minute threshold', () => {
    const now = UNACCEPTED_ESCALATION_MS;
    expect(deriveOrderRowState(baseRow, now)).toBe('escalated');
  });

  it('maps accepted/preparing/ready statuses directly', () => {
    expect(deriveOrderRowState({ ...baseRow, status: 'accepted' }, 0)).toBe('accepted');
    expect(deriveOrderRowState({ ...baseRow, status: 'preparing' }, 0)).toBe('preparing');
    expect(deriveOrderRowState({ ...baseRow, status: 'ready' }, 0)).toBe('ready');
  });

  it('buckets canceled/refunded/failed as canceled', () => {
    expect(deriveOrderRowState({ ...baseRow, status: 'canceled' }, 0)).toBe('canceled');
    expect(deriveOrderRowState({ ...baseRow, status: 'refunded' }, 0)).toBe('canceled');
    expect(deriveOrderRowState({ ...baseRow, status: 'failed' }, 0)).toBe('canceled');
  });

  it('defaults unrecognized statuses to completed', () => {
    expect(deriveOrderRowState({ ...baseRow, status: 'completed' }, 0)).toBe('completed');
    expect(deriveOrderRowState({ ...baseRow, status: 'created' }, 0)).toBe('completed');
  });

  it('never escalates once accepted, even past the threshold', () => {
    const row = { ...baseRow, status: 'accepted' as const, acceptedAt: new Date(0).toISOString() };
    expect(deriveOrderRowState(row, UNACCEPTED_ESCALATION_MS * 10)).toBe('accepted');
  });
});

describe('OrderRow — table line precedence (TBL-12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canMock.mockReturnValue(true);
  });

  it('a dine-in order carrying a resolved zone and number renders the composed label', () => {
    const row: OrderFeedRowApi = {
      ...baseRow,
      orderType: 'dine_in',
      tableZoneName: 'Зал 1',
      tableNumber: '14',
      customerName: null,
      customerPhone: null,
      paymentType: 'online',
      tableIdentifier: null,
    };
    render(
      <Wrap>
        <OrderRow row={row} showLocationBadge={false} onOpenDetail={vi.fn()} />
      </Wrap>,
    );

    const expectedLabel = `orders.card.tableLabel(${JSON.stringify({ zone: 'Зал 1', number: '14' })})`;
    expect(screen.getByTestId('order-row-for-line').textContent).toBe(expectedLabel);
  });

  it('a dine-in order with no resolved table but a legacy free-text identifier renders that text', () => {
    const row: OrderFeedRowApi = {
      ...baseRow,
      orderType: 'dine_in',
      tableZoneName: null,
      tableNumber: null,
      customerName: null,
      customerPhone: null,
      paymentType: 'online',
      tableIdentifier: 'T7',
    };
    render(
      <Wrap>
        <OrderRow row={row} showLocationBadge={false} onOpenDetail={vi.fn()} />
      </Wrap>,
    );

    expect(screen.getByTestId('order-row-for-line').textContent).toBe('T7');
  });

  it('a pickup order with no table falls back to the customer, then to a placeholder', () => {
    const row: OrderFeedRowApi = {
      ...baseRow,
      orderType: 'pickup',
      tableZoneName: null,
      tableNumber: null,
      customerName: null,
      customerPhone: null,
      paymentType: 'online',
      tableIdentifier: null,
    };
    render(
      <Wrap>
        <OrderRow row={row} showLocationBadge={false} onOpenDetail={vi.fn()} />
      </Wrap>,
    );

    expect(screen.getByTestId('order-row-for-line').textContent).toBe('orders.card.noCustomer');
  });
});

describe('OrderRow — a promise nobody has made yet', () => {
  it('shows an unknown time on an order that has not been accepted', () => {
    const row: OrderFeedRowApi = {
      ...baseRow,
      status: 'paid',
      acceptedAt: null,
      etaAt: null,
    };
    render(
      <Wrap>
        <OrderRow row={row} showLocationBadge={false} onOpenDetail={vi.fn()} />
      </Wrap>,
    );

    expect(screen.getByRole('img', { name: 'orders.card.etaUnknownAria' })).toHaveTextContent('?');
  });
});
