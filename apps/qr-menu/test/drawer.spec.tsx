import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type * as ClientModule from '../src/api/client';

const menu = {
  tenantId: '00000000-0000-4000-8000-000000000001',
  version: 1,
  currency: 'UAH',
  tenant: {
    id: '00000000-0000-4000-8000-000000000001',
    slug: 'demo',
    displayName: 'Pizza Palace',
    theme: null,
    locales: { default: 'ru', supported: ['ru'] },
    description: null,
    socials: {},
    contacts: { phone: null, email: null, website: null },
  },
  categories: [],
  items: [],
  modifierGroups: [],
} as unknown as Awaited<ReturnType<typeof ClientModule.fetchMenu>>;

vi.mock('../src/api/client', () => ({
  fetchMenu: vi.fn(() => Promise.resolve(menu)),
  fetchAvailability: vi.fn(() => Promise.resolve({ stoppedItemIds: [] })),
  fetchVenue: vi.fn(() => Promise.resolve(null)),
  fetchLegalDocuments: vi.fn(() => Promise.resolve(null)),
  fetchTableSession: vi.fn(() => Promise.resolve(null)),
  openTableSession: vi.fn(() => Promise.reject(new Error('no'))),
  fetchOrderStatus: vi.fn(),
  placeOrder: vi.fn(),
  startPayment: vi.fn(),
  MenuNotFoundError: class extends Error {},
  OrderRequestError: class extends Error {},
}));

const { App } = await import('../src/App');

describe('qr-menu drawer and profile', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('offers signing in from the drawer, in words rather than a bare button', async () => {
    render(<App />);
    await screen.findByRole('contentinfo');

    fireEvent.click(screen.getByTestId('drawer-trigger'));

    expect(await screen.findByText(/Войдите/u)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('drawer-account'));

    expect(await screen.findByPlaceholderText('+7 900 000-00-00')).toBeInTheDocument();
  });

  it('opens the profile straight from the header', async () => {
    render(<App />);
    await screen.findByRole('contentinfo');

    fireEvent.click(screen.getByTestId('account-trigger'));

    expect(await screen.findByPlaceholderText('+7 900 000-00-00')).toBeInTheDocument();
  });
});
