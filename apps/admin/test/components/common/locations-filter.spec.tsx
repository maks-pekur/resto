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

const { LocationsFilter, ALL_LOCATIONS } = await import('@/components/common/locations-filter');

const TWO_LOCATIONS = [
  { id: 'loc-1', name: 'Central' },
  { id: 'loc-2', name: 'Riverside' },
];

const renderFilter = (locations: { id: string; name: string }[]) => {
  const onChange = vi.fn();
  render(<LocationsFilter locations={locations} value={ALL_LOCATIONS} onChange={onChange} />);
  return { onChange };
};

describe('LocationsFilter', () => {
  it('renders nothing when there is only one location', () => {
    renderFilter([{ id: 'loc-1', name: 'Central' }]);

    expect(screen.queryByLabelText('dashboard.filterLocationLabel')).not.toBeInTheDocument();
  });

  it('appears as soon as there are two', () => {
    renderFilter(TWO_LOCATIONS);

    expect(screen.getByLabelText('dashboard.filterLocationLabel')).toBeInTheDocument();
  });

  it('hands back the location the operator picks', async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilter(TWO_LOCATIONS);

    await user.click(screen.getByLabelText('dashboard.filterLocationLabel'));
    await user.click(screen.getByRole('option', { name: 'Riverside' }));

    expect(onChange).toHaveBeenCalledWith('loc-2');
  });
});
