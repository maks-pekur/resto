import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));

vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));

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

const { DashboardKpis } = await import('@/components/widgets/dashboard-kpis');

const RANGE = { from: '2026-08-01', to: '2026-08-28' };

const kpis = {
  range: RANGE,
  currency: 'EUR',
  revenue: { value: '1500.00', previous: '1000.00' },
  completedOrders: { value: 12, previous: 12 },
  newGuests: { value: 5, previous: 0 },
  refunds: { value: '50.00', previous: '25.00' },
};

const renderKpis = (locationId = 'all') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DashboardKpis locationId={locationId} range={RANGE} />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockResolvedValue({ status: 200, ok: true, data: kpis });
});

describe('DashboardKpis', () => {
  it('asks for the window and location it was given', async () => {
    renderKpis('loc-1');
    await screen.findByText('dashboard.kpiRevenue');

    expect(apiFetchMock).toHaveBeenCalledWith(
      '/v1/analytics/dashboard?from=2026-08-01&to=2026-08-28',
      { locationId: 'loc-1' },
    );
  });

  it('states each counter against the previous window', async () => {
    renderKpis();

    expect(await screen.findByText('+50.0%')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('reads a rise in refunds as bad and a rise in revenue as good', async () => {
    renderKpis();

    const revenueDelta = await screen.findByText('+50.0%');
    const refundsDelta = screen.getByText('+100.0%');

    expect(revenueDelta.className).toContain('text-success');
    expect(refundsDelta.className).toContain('text-destructive');
  });

  it('shows no percentage when the previous window is empty', async () => {
    renderKpis();

    expect(await screen.findByText('dashboard.kpiNoBaseline')).toBeInTheDocument();
  });

  it('renders no counters at all when the request fails', async () => {
    apiFetchMock.mockResolvedValue({ status: 500, ok: false, data: null });

    renderKpis();

    await vi.waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalled();
    });
    expect(screen.queryByText('dashboard.kpiRevenue')).not.toBeInTheDocument();
  });
});
