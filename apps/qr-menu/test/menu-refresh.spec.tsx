import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuDto } from '@resto/api-client/public';
import { App } from '../src/App';

const menuWithPhoto = (url: string): MenuDto => ({
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
      imageUrl: url,
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
});

const SIGNED_FIRST = 'https://cdn.example.test/margherita.webp?sig=first';
const SIGNED_SECOND = 'https://cdn.example.test/margherita.webp?sig=second';

const fetchMenu = vi.fn();

vi.mock('../src/api/client', () => ({
  MenuNotFoundError: class extends Error {},
  fetchMenu: (signal?: AbortSignal, options?: { bypassCache?: boolean }) =>
    fetchMenu(signal, options) as Promise<MenuDto>,
  fetchAvailability: () => Promise.resolve({ stoppedItemIds: [] }),
}));

const photoSrc = (): string | null =>
  document.querySelector('main img')?.getAttribute('src') ?? null;

beforeEach(() => {
  window.localStorage.clear();
  fetchMenu.mockReset();
  fetchMenu
    .mockResolvedValueOnce(menuWithPhoto(SIGNED_FIRST))
    .mockResolvedValue(menuWithPhoto(SIGNED_SECOND));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('qr-menu photo signatures', () => {
  it('re-pulls the menu once its signed photo urls are close to expiring', async () => {
    const openedAt = Date.now();
    render(<App />);
    await waitFor(() => {
      expect(photoSrc()).toBe(SIGNED_FIRST);
    });

    vi.spyOn(Date, 'now').mockReturnValue(openedAt + 46 * 60 * 1000);
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => {
      expect(photoSrc()).toBe(SIGNED_SECOND);
    });
    expect(fetchMenu).toHaveBeenLastCalledWith(expect.anything(), { bypassCache: true });
  });

  it('leaves a fresh menu alone', async () => {
    const openedAt = Date.now();
    render(<App />);
    await waitFor(() => {
      expect(photoSrc()).toBe(SIGNED_FIRST);
    });

    vi.spyOn(Date, 'now').mockReturnValue(openedAt + 60 * 1000);
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(photoSrc()).toBe(SIGNED_FIRST);
    expect(fetchMenu).toHaveBeenCalledTimes(1);
  });
});
