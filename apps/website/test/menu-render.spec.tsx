import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MenuPageClient } from '@/components/menu/menu-page-client';
import type { MenuDto } from '@resto/api-client/public';

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

const makeMenu = (overrides: Partial<MenuDto> = {}): MenuDto => ({
  tenantId: 'tenant-1',
  version: 1,
  currency: 'EUR',
  tenant: null,
  categories: [
    { id: 'cat-1', slug: 'starters', name: { en: 'Starters' }, description: null, sortOrder: 0 },
    { id: 'cat-2', slug: 'mains', name: { en: 'Mains' }, description: null, sortOrder: 1 },
  ],
  items: [
    {
      id: 'item-1',
      slug: 'soup',
      categoryId: 'cat-1',
      name: { en: 'Soup' },
      description: null,
      basePrice: '5.00',
      currency: 'EUR',
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
    {
      id: 'item-2',
      slug: 'burger',
      categoryId: 'cat-2',
      name: { en: 'Burger' },
      description: null,
      basePrice: '12.00',
      currency: 'EUR',
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
  ...overrides,
});

describe('MenuPageClient', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );
  });

  it('renders 2 category sections for a menu with 2 categories', () => {
    render(<MenuPageClient menu={makeMenu()} stoppedItemIds={[]} />);
    expect(screen.getAllByText('Starters').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Mains').length).toBeGreaterThan(0);
  });

  it('renders the correct item cards in each section', () => {
    render(<MenuPageClient menu={makeMenu()} stoppedItemIds={[]} />);
    expect(screen.getByText('Soup')).toBeDefined();
    expect(screen.getByText('Burger')).toBeDefined();
  });

  it('clicking a card opens the modal with that item name', async () => {
    render(<MenuPageClient menu={makeMenu()} stoppedItemIds={[]} />);
    const soupButton = screen.getAllByRole('button', { name: 'Soup' })[0];
    if (!soupButton) throw new Error('Soup button not found');
    fireEvent.click(soupButton);
    const dialogTitle = await screen.findAllByText('Soup');
    expect(dialogTitle.length).toBeGreaterThan(1);
  });

  it('renders the "Menu unavailable" state for empty items', () => {
    render(<MenuPageClient menu={makeMenu({ items: [] })} stoppedItemIds={[]} />);
    expect(screen.getByText('emptyHeading')).toBeDefined();
  });

  it('marks an item as unavailable when its id is in the stopped set', () => {
    render(<MenuPageClient menu={makeMenu()} stoppedItemIds={['item-1']} />);

    const soupCard = screen.getByRole('button', { name: 'Soup' });
    expect(soupCard.getAttribute('aria-disabled')).toBe('true');

    const burgerCard = screen.getByRole('button', { name: 'Burger' });
    expect(burgerCard.getAttribute('aria-disabled')).toBeNull();
  });
});
