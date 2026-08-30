import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuDto } from '@resto/api-client/public';
import { App } from '../src/App';
import { t } from '../src/i18n';

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

const themeToggle = () =>
  within(screen.getByRole('contentinfo')).getByRole('button', { name: t('theme.label') });

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

describe('qr-menu colour theme', () => {
  it('follows the system theme until the guest chooses otherwise', async () => {
    render(<App />);
    await screen.findByRole('contentinfo');

    expect(document.documentElement.getAttribute('data-theme')).toBe('system');
    expect(window.localStorage.getItem('resto.theme')).toBeNull();
    expect(themeToggle()).toBeInTheDocument();
  });

  it('applies and remembers an explicit dark choice', async () => {
    render(<App />);
    await screen.findByRole('contentinfo');

    fireEvent.click(themeToggle());

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });
    expect(window.localStorage.getItem('resto.theme')).toBe('dark');
  });

  it('toggles back to light on a second press', async () => {
    render(<App />);
    await screen.findByRole('contentinfo');

    fireEvent.click(themeToggle());
    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    fireEvent.click(themeToggle());
    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });
    expect(window.localStorage.getItem('resto.theme')).toBe('light');
  });

  it('restores the remembered choice on the next visit', async () => {
    window.localStorage.setItem('resto.theme', 'light');
    render(<App />);
    await screen.findByRole('contentinfo');

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });
  });

  it('ignores a corrupted stored value rather than breaking the page', async () => {
    window.localStorage.setItem('resto.theme', 'neon');
    render(<App />);
    await screen.findByRole('contentinfo');

    expect(document.documentElement.getAttribute('data-theme')).toBe('system');
  });
});
