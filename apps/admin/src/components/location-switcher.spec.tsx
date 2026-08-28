import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/lib/i18n';
import { SidebarProvider } from '@/components/ui/sidebar';
import { LocationSwitcher } from './location-switcher';

const navigate = vi.fn();
const setActiveLocation = vi.fn((_locationId: string) =>
  Promise.resolve({ status: 200, ok: true, data: null }),
);
const invalidateQueries = vi.fn(() => Promise.resolve());

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useRouterState: () => '/voskresenka/orders',
  useParams: () => ({ locationSlug: 'voskresenka' }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries }),
}));

vi.mock('@/lib/hooks/use-effective-location', () => ({
  useEffectiveLocation: () => ({
    mode: 'single',
    locationId: 'loc-v',
    locationSlug: 'voskresenka',
  }),
}));

vi.mock('@/lib/queries/locations', () => ({
  setActiveLocationMutation: (id: string) => setActiveLocation(id),
}));

const VOSKRESENKA = { id: 'loc-v', name: 'Воскресенка', slug: 'voskresenka' };
const PODIL = { id: 'loc-p', name: 'Podil', slug: 'podil' };
const LOCATIONS = [VOSKRESENKA, PODIL];

const renderSwitcher = (props: { isOwner: boolean; locations: typeof LOCATIONS }) =>
  render(
    <I18nextProvider i18n={i18n}>
      <SidebarProvider>
        <LocationSwitcher {...props} />
      </SidebarProvider>
    </I18nextProvider>,
  );

beforeEach(() => {
  navigate.mockClear();
  setActiveLocation.mockClear();
  invalidateQueries.mockClear();
});

describe('LocationSwitcher — staff', () => {
  it('moves the session pin before navigating', async () => {
    // The order is the whole point: `/v1/me` resolves a staff member's permissions against the
    // pin, so navigating first would render a page the server has not agreed to yet.
    const order: string[] = [];
    setActiveLocation.mockImplementation(() => {
      order.push('pin');
      return Promise.resolve({ status: 200, ok: true, data: null });
    });
    navigate.mockImplementation(() => {
      order.push('navigate');
    });

    renderSwitcher({ isOwner: false, locations: LOCATIONS });
    await userEvent.click(screen.getByTestId('location-switcher-trigger'));
    await userEvent.click(screen.getByTestId('location-switcher-option-podil'));

    expect(setActiveLocation).toHaveBeenCalledWith('loc-p');
    expect(order).toEqual(['pin', 'navigate']);
    expect(invalidateQueries).toHaveBeenCalled();
  });

  it('does not navigate when the server refuses the switch', async () => {
    setActiveLocation.mockImplementation(() =>
      Promise.resolve({ status: 403, ok: false, data: null }),
    );

    renderSwitcher({ isOwner: false, locations: LOCATIONS });
    await userEvent.click(screen.getByTestId('location-switcher-trigger'));
    await userEvent.click(screen.getByTestId('location-switcher-option-podil'));

    expect(navigate).not.toHaveBeenCalled();
  });

  it('is not offered to a staff member who holds one location', () => {
    renderSwitcher({ isOwner: false, locations: [VOSKRESENKA] });
    expect(screen.queryByTestId('location-switcher-trigger')).toBeNull();
  });

  it('does not offer the every-location view — a pin is always one point', async () => {
    renderSwitcher({ isOwner: false, locations: LOCATIONS });
    await userEvent.click(screen.getByTestId('location-switcher-trigger'));
    expect(screen.queryByTestId('location-switcher-all')).toBeNull();
  });
});

describe('LocationSwitcher — owner', () => {
  it('navigates without touching the session pin', async () => {
    renderSwitcher({ isOwner: true, locations: LOCATIONS });
    await userEvent.click(screen.getByTestId('location-switcher-trigger'));
    await userEvent.click(screen.getByTestId('location-switcher-option-podil'));

    expect(setActiveLocation).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith({ href: '/podil/orders' });
  });
});
