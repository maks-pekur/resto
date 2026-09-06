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
  fetchAvailability: vi.fn(() => Promise.resolve({ stoppedItemIds: [], stoppedIngredientIds: [] })),
  fetchVenue: vi.fn(() => Promise.resolve(null)),
  fetchLegalDocuments: vi.fn(() =>
    Promise.resolve({
      about: null,
      payment: null,
      returns: null,
      cookies: { ru: 'Мы храним язык и корзину.' },
      terms: null,
      privacy: { ru: 'Телефон нужен, чтобы принести заказ.' },
    }),
  ),
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

    expect(await screen.findByText(/Авторизуйтесь/u)).toBeInTheDocument();
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

describe('a published document', () => {
  it('lives at its own address, so back closes it and the link can be sent', async () => {
    render(<App />);
    await screen.findByRole('contentinfo');

    fireEvent.click(screen.getByTestId('drawer-trigger'));
    fireEvent.click(await screen.findByTestId('drawer-doc-Файлы cookie'));

    expect(window.location.pathname).toBe('/info/cookies');
    expect(await screen.findByText('Мы храним язык и корзину.')).toBeInTheDocument();
  });

  it('opens straight from a shared link', async () => {
    window.history.replaceState({}, '', '/info/privacy');
    render(<App />);

    expect(await screen.findByText('Телефон нужен, чтобы принести заказ.')).toBeInTheDocument();
  });
});
