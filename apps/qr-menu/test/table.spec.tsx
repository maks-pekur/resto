import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCartStore } from '@resto/cart';
import type { MenuDto } from '@resto/api-client/public';
import { App } from '../src/App';
import { t } from '../src/i18n';
import type * as ClientModule from '../src/api/client';
import type { ResolvedTable } from '../src/api/client';

const menu: MenuDto = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  version: 1,
  currency: 'UAH',
  tenant: {
    id: 'tenant-1',
    slug: 'pizza',
    displayName: 'Pizza Palace',
    theme: null,
    locales: { default: 'ru', supported: ['ru', 'en'] },
    description: null,
    socials: {},
    contacts: { phone: null, email: null, website: null },
  },
  categories: [
    { id: 'cat-1', slug: 'pizzas', name: { en: 'Pizzas' }, description: null, sortOrder: 0 },
  ],
  items: [
    {
      id: 'item-1',
      slug: 'margherita',
      categoryId: 'cat-1',
      name: { en: 'Margherita' },
      description: null,
      basePrice: '189.00',
      currency: 'UAH',
      weight: null,
      measureUnit: null,
      imageUrl: null,
      photos: [],
      allergens: [],
      diets: [],
      proteins: null,
      fats: null,
      carbs: null,
      kcal: null,
      sortOrder: 0,
      sizes: [],
      modifierGroupIds: [],
      extraOptionIds: [],
      compositionMode: 'text',
      composition: [],
      compositionLines: [],
    },
  ],
  modifierGroups: [],
  modifierOptions: [],
};

const TABLE_UUID = '22222222-2222-4222-8222-222222222222';
const resolvedTable: ResolvedTable = { tableId: TABLE_UUID, zoneName: 'Terrace', number: '12' };

const fetchMenuMock = vi.fn<(signal?: AbortSignal) => Promise<MenuDto>>();
const fetchAvailabilityMock =
  vi.fn<
    (
      tableId: string | undefined,
      signal?: AbortSignal,
    ) => Promise<{ stoppedItemIds: string[]; stoppedIngredientIds: string[] }>
  >();
const openTableSessionMock = vi.fn<(token: string) => Promise<ResolvedTable>>();
const fetchTableSessionMock = vi.fn<(signal?: AbortSignal) => Promise<ResolvedTable | null>>();

vi.mock('../src/api/client', () => ({
  fetchVenue: vi.fn(() => Promise.resolve(null)),
  fetchLegalDocuments: vi.fn(() => Promise.resolve(null)),
  MenuNotFoundError: class extends Error {},
  OrderRequestError: class extends Error {},
  fetchMenu: (signal?: AbortSignal) => fetchMenuMock(signal),
  fetchAvailability: (tableId: string | undefined, signal?: AbortSignal) =>
    fetchAvailabilityMock(tableId, signal),
  openTableSession: (token: string) => openTableSessionMock(token),
  fetchTableSession: (signal?: AbortSignal) => fetchTableSessionMock(signal),
}));

const bannerNode = (): Element | null => document.querySelector('.bg-muted.border-b');

beforeEach(() => {
  window.localStorage.clear();
  useCartStore.getState().setTable(null);
  window.history.replaceState({}, '', '/');
  fetchMenuMock.mockReset().mockResolvedValue(menu);
  fetchAvailabilityMock
    .mockReset()
    .mockResolvedValue({ stoppedItemIds: [], stoppedIngredientIds: [] });
  openTableSessionMock.mockReset().mockRejectedValue(new Error('no session'));
  fetchTableSessionMock.mockReset().mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('qr-menu table', () => {
  it('trades a scanned code for a session and seats the guest without saying so', async () => {
    window.history.replaceState({}, '', '/t/a-printed-secret');
    openTableSessionMock.mockResolvedValue(resolvedTable);
    render(<App />);

    await waitFor(() => {
      expect(useCartStore.getState().tableId).toBe(TABLE_UUID);
    });
    // The guest can see which table they are sitting at; the app does not tell them.
    expect(bannerNode()).not.toBeInTheDocument();
    expect(useCartStore.getState().tableId).toBe(TABLE_UUID);
    expect(useCartStore.getState().tableZoneName).toBe('Terrace');
    expect(useCartStore.getState().tableNumber).toBe('12');
  });

  it('opens a sheet offering another scan when the code is unknown', async () => {
    window.history.replaceState({}, '', '/t/someone-elses-code');
    openTableSessionMock.mockRejectedValue(new Error('unknown'));
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(t('table.unreadableTitle'))).toBeInTheDocument();
    });
    // A sheet, not a line to read past: the way out is in it.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(useCartStore.getState().tableId).toBeNull();
  });

  it('ignores a table named in the query — only a scanned code seats a guest', async () => {
    window.history.replaceState({}, '', `/?t=${TABLE_UUID}`);
    render(<App />);
    await screen.findByRole('contentinfo');

    expect(openTableSessionMock).not.toHaveBeenCalled();
    expect(bannerNode()).not.toBeInTheDocument();
    expect(useCartStore.getState().tableId).toBeNull();
  });

  it('renders no table strip and no not-recognised line without a code', async () => {
    render(<App />);
    await screen.findByRole('contentinfo');

    expect(openTableSessionMock).not.toHaveBeenCalled();
    expect(bannerNode()).not.toBeInTheDocument();
    expect(screen.queryByText(t('table.unreadableTitle'))).not.toBeInTheDocument();
  });

  it('never asks the guest to type a table number', async () => {
    render(<App />);
    await screen.findByRole('contentinfo');

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('carries the scanned table on the availability request', async () => {
    window.history.replaceState({}, '', '/t/a-printed-secret');
    openTableSessionMock.mockResolvedValue(resolvedTable);
    render(<App />);

    await waitFor(() => {
      expect(fetchAvailabilityMock).toHaveBeenCalledWith(TABLE_UUID, expect.anything());
    });

    const fetchSpy = vi.fn(() =>
      Promise.resolve({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ stoppedItemIds: [] }),
      }),
    );
    vi.stubGlobal('fetch', fetchSpy);
    const real = await vi.importActual<typeof ClientModule>('../src/api/client');
    await real.fetchAvailability(TABLE_UUID);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(`/v1/menu/availability?t=${TABLE_UUID}`, {});
  });

  it('sends no query string on availability when there is no table', async () => {
    render(<App />);

    await waitFor(() => {
      expect(fetchAvailabilityMock).toHaveBeenCalledWith(undefined, expect.anything());
    });

    const fetchSpy = vi.fn(() =>
      Promise.resolve({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ stoppedItemIds: [] }),
      }),
    );
    vi.stubGlobal('fetch', fetchSpy);
    const real = await vi.importActual<typeof ClientModule>('../src/api/client');
    await real.fetchAvailability(undefined);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith('/v1/menu/availability', {});
  });
});

describe('ordering without a table', () => {
  it('asks for the code first, then carries the guest on to checkout', async () => {
    render(<App />);
    await screen.findByRole('contentinfo');

    useCartStore.getState().addItem({
      itemId: 'item-1',
      sizeId: null,
      name: 'Margherita',
      unitPrice: '10.00',
      currency: 'EUR',
      modifiers: [],
    });

    fireEvent.click(await screen.findByRole('button', { name: t('nav.cart') }));
    fireEvent.click(await screen.findByRole('button', { name: t('checkout.open') }));

    // The scan sheet stands in for the checkout, and the cart is untouched.
    expect(await screen.findByText(t('table.orderingTitle'))).toBeInTheDocument();
    expect(screen.queryByText(t('checkout.paymentLabel'))).not.toBeInTheDocument();
    expect(useCartStore.getState().items).toHaveLength(1);
  });
});
