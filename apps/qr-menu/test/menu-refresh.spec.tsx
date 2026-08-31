import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuDto } from '@resto/api-client/public';
import { App } from '../src/App';

const menuWithPhoto = (url: string): MenuDto => ({
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
      imageUrl: url,
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
});

const SIGNED_FIRST = 'https://cdn.example.test/margherita.webp?sig=first';
const SIGNED_SECOND = 'https://cdn.example.test/margherita.webp?sig=second';

const fetchMenu = vi.fn();

vi.mock('../src/api/client', () => ({
  MenuNotFoundError: class extends Error {},
  fetchMenu: (signal?: AbortSignal) => fetchMenu(signal) as Promise<MenuDto>,
  fetchAvailability: () => Promise.resolve({ stoppedItemIds: [] }),
}));

const photoSrc = (): string | null =>
  document.querySelector('main img')?.getAttribute('src') ?? null;

const MINUTE_MS = 60 * 1000;

beforeEach(() => {
  // Fake timers rather than a stubbed Date.now: waitFor measures its own timeout
  // with Date.now, so jumping the real clock forward makes it declare itself
  // expired before the refetch lands — green locally, red on a slower runner.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  window.localStorage.clear();
  fetchMenu.mockReset();
  fetchMenu
    .mockResolvedValueOnce(menuWithPhoto(SIGNED_FIRST))
    .mockResolvedValue(menuWithPhoto(SIGNED_SECOND));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('qr-menu menu freshness', () => {
  it('re-pulls a long-open menu so a republish eventually reaches the table', async () => {
    render(<App />);
    await waitFor(() => {
      expect(photoSrc()).toBe(SIGNED_FIRST);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(46 * MINUTE_MS);
    });

    await waitFor(() => {
      expect(photoSrc()).toBe(SIGNED_SECOND);
    });
    // Once refreshed the clock resets, so the remaining ticks stay quiet.
    expect(fetchMenu).toHaveBeenCalledTimes(2);
  });

  it('leaves a fresh menu alone', async () => {
    render(<App />);
    await waitFor(() => {
      expect(photoSrc()).toBe(SIGNED_FIRST);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * MINUTE_MS);
    });

    expect(photoSrc()).toBe(SIGNED_FIRST);
    expect(fetchMenu).toHaveBeenCalledTimes(1);
  });
});
