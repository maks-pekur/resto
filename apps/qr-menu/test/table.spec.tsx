import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCartStore } from '@resto/cart';
import type { MenuDto } from '@resto/api-client/public';
import { App } from '../src/App';
import { t } from '../src/i18n';

const menu: MenuDto = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  version: 1,
  currency: 'UAH',
  tenant: { id: 'tenant-1', slug: 'pizza', displayName: 'Pizza Palace', theme: null },
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
      nutritionEstimated: false,
      sortOrder: 0,
      sizes: [],
      modifierGroupIds: [],
    },
  ],
  modifierGroups: [],
};

vi.mock('../src/api/client', () => ({
  MenuNotFoundError: class extends Error {},
  fetchMenu: () => Promise.resolve(menu),
  fetchAvailability: () => Promise.resolve({ stoppedItemIds: [] }),
}));

beforeEach(() => {
  window.localStorage.clear();
  useCartStore.getState().setTable(null);
  window.history.replaceState({}, '', '/');
});

describe('qr-menu table', () => {
  it('takes the table from the scanned link', async () => {
    window.history.replaceState({}, '', '/?table=12');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(t('table.current', { table: '12' }))).toBeInTheDocument();
    });
    expect(useCartStore.getState().table).toBe('12');
  });

  it('never asks the guest to type a table number', async () => {
    render(<App />);
    await screen.findByRole('contentinfo');

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByText(t('table.current', { table: '12' }))).not.toBeInTheDocument();
  });

  it('ignores a blank table parameter', async () => {
    window.history.replaceState({}, '', '/?table=%20%20');
    render(<App />);
    await screen.findByRole('contentinfo');

    expect(useCartStore.getState().table).toBeNull();
  });
});
