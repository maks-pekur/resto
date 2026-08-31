import { render, screen, waitFor } from '@testing-library/react';
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
      imageUrl: null,
      photos: [],
      allergens: [],
      proteins: null,
      fats: null,
      carbs: null,
      kcal: null,
      sortOrder: 0,
      sizes: [],
      modifierGroupIds: [],
    },
  ],
  modifierGroups: [],
};

const TABLE_UUID = '22222222-2222-4222-8222-222222222222';
const resolvedTable: ResolvedTable = { tableId: TABLE_UUID, zoneName: 'Terrace', number: '12' };

const fetchMenuMock = vi.fn<(signal?: AbortSignal) => Promise<MenuDto>>();
const fetchAvailabilityMock =
  vi.fn<
    (tableId: string | undefined, signal?: AbortSignal) => Promise<{ stoppedItemIds: string[] }>
  >();
const fetchTableMock =
  vi.fn<(tableId: string, signal?: AbortSignal) => Promise<ResolvedTable | null>>();

vi.mock('../src/api/client', () => ({
  MenuNotFoundError: class extends Error {},
  fetchMenu: (signal?: AbortSignal) => fetchMenuMock(signal),
  fetchAvailability: (tableId: string | undefined, signal?: AbortSignal) =>
    fetchAvailabilityMock(tableId, signal),
  fetchTable: (tableId: string, signal?: AbortSignal) => fetchTableMock(tableId, signal),
}));

const bannerNode = (): Element | null => document.querySelector('.bg-muted.border-b');

beforeEach(() => {
  window.localStorage.clear();
  useCartStore.getState().setTable(null);
  window.history.replaceState({}, '', '/');
  fetchMenuMock.mockReset().mockResolvedValue(menu);
  fetchAvailabilityMock.mockReset().mockResolvedValue({ stoppedItemIds: [] });
  fetchTableMock.mockReset().mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('qr-menu table', () => {
  it('resolves a scanned table id and renders the server-supplied label', async () => {
    window.history.replaceState({}, '', `/?t=${TABLE_UUID}`);
    fetchTableMock.mockResolvedValue(resolvedTable);
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(t('table.current', { table: 'Terrace · 12' }))).toBeInTheDocument();
    });
    expect(useCartStore.getState().tableId).toBe(TABLE_UUID);
    expect(useCartStore.getState().tableZoneName).toBe('Terrace');
    expect(useCartStore.getState().tableNumber).toBe('12');
  });

  it('shows the not-recognised line but still renders the menu when the table is unknown', async () => {
    window.history.replaceState({}, '', `/?t=${TABLE_UUID}`);
    fetchTableMock.mockResolvedValue(null);
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(t('table.notRecognized'))).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Margherita' })).toBeInTheDocument();
    expect(useCartStore.getState().tableId).toBeNull();
  });

  it('ignores the old free-text ?table= parameter entirely', async () => {
    window.history.replaceState({}, '', '/?table=%D0%A1%D1%82%D0%BE%D0%BB%2099');
    render(<App />);
    await screen.findByRole('contentinfo');

    expect(fetchTableMock).not.toHaveBeenCalled();
    expect(bannerNode()).not.toBeInTheDocument();
    expect(useCartStore.getState().tableId).toBeNull();
  });

  it('renders no table strip and no not-recognised line with no ?t= at all', async () => {
    render(<App />);
    await screen.findByRole('contentinfo');

    expect(fetchTableMock).not.toHaveBeenCalled();
    expect(bannerNode()).not.toBeInTheDocument();
    expect(screen.queryByText(t('table.notRecognized'))).not.toBeInTheDocument();
  });

  it('never asks the guest to type a table number', async () => {
    render(<App />);
    await screen.findByRole('contentinfo');

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('carries the scanned table on the availability request', async () => {
    window.history.replaceState({}, '', `/?t=${TABLE_UUID}`);
    fetchTableMock.mockResolvedValue(resolvedTable);
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
