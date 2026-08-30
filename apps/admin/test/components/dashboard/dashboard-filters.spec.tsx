import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

const { DashboardFilters } = await import('@/components/dashboard/dashboard-filters');
const { buildPresetRange } = await import('@/lib/date-range');

const TWO_LOCATIONS = [
  { id: 'loc-1', name: 'Central' },
  { id: 'loc-2', name: 'Riverside' },
];

const renderFilters = (
  locations: { id: string; name: string }[],
  onRangeChange = vi.fn(),
  onLocationChange = vi.fn(),
) => {
  render(
    <DashboardFilters
      locations={locations}
      locationId="all"
      onLocationChange={onLocationChange}
      range={buildPresetRange('today')}
      onRangeChange={onRangeChange}
    />,
  );
  return { onRangeChange, onLocationChange };
};

describe('DashboardFilters', () => {
  it('offers no location filter when there is only one location', () => {
    renderFilters([{ id: 'loc-1', name: 'Central' }]);

    expect(screen.queryByLabelText('dashboard.filterLocationLabel')).not.toBeInTheDocument();
  });

  it('offers the location filter as soon as there are two', () => {
    renderFilters(TWO_LOCATIONS);

    expect(screen.getByLabelText('dashboard.filterLocationLabel')).toBeInTheDocument();
  });

  it('opens on today and hands back the preset the operator picks', async () => {
    const user = userEvent.setup();
    const { onRangeChange } = renderFilters(TWO_LOCATIONS);

    await user.click(screen.getByRole('button', { name: 'dashboard.range.today' }));
    await user.click(screen.getByRole('button', { name: 'dashboard.range.last7' }));

    expect(onRangeChange).toHaveBeenCalledWith(buildPresetRange('last7'));
  });
});
