import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MenuPageClient } from '@/components/menu/menu-page-client';
import { GuestUi } from '@/components/guest-ui';
import type { MenuDto, MenuItemDto } from '@resto/api-client/public';
import en from '../messages/en.json';

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

const makeItem = (overrides: Partial<MenuItemDto>): MenuItemDto => ({
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
  ...overrides,
});

const makeMenu = (overrides: Partial<MenuDto> = {}): MenuDto => ({
  tenantId: 'tenant-1',
  version: 1,
  currency: 'EUR',
  tenant: {
    id: 'tenant-1',
    slug: 'demo',
    displayName: 'Cafe Demo',
    theme: null,
    locales: { default: 'ru', supported: ['ru', 'en'] },
    description: null,
    socials: {},
    contacts: { phone: null, email: null, website: null },
  },
  categories: [
    { id: 'cat-1', slug: 'starters', name: { en: 'Starters' }, description: null, sortOrder: 0 },
    { id: 'cat-2', slug: 'mains', name: { en: 'Mains' }, description: null, sortOrder: 1 },
  ],
  items: [
    makeItem({}),
    makeItem({
      id: 'item-2',
      slug: 'burger',
      categoryId: 'cat-2',
      name: { en: 'Burger' },
      basePrice: '12.00',
    }),
  ],
  modifierGroups: [],
  ...overrides,
});

const renderMenu = (menu: MenuDto, stoppedItemIds: readonly string[] = []) =>
  render(
    <GuestUi>
      <MenuPageClient menu={menu} stoppedItemIds={stoppedItemIds} footerLinks={[]} />
    </GuestUi>,
  );

describe('MenuPageClient', () => {
  it('renders a section heading per populated category', () => {
    renderMenu(makeMenu());
    expect(screen.getByRole('heading', { level: 2, name: 'Starters' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Mains' })).toBeInTheDocument();
  });

  it('renders the item cards of each section', () => {
    renderMenu(makeMenu());
    expect(screen.getByRole('button', { name: 'Soup' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Burger' })).toBeInTheDocument();
  });

  it('opens the item dialog when a card is clicked', async () => {
    renderMenu(makeMenu());
    fireEvent.click(screen.getByRole('button', { name: 'Soup' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Soup' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: en.item.addToCart })).toBeInTheDocument();
  });

  it('renders the empty state when the menu has no items', () => {
    renderMenu(makeMenu({ items: [] }));
    expect(screen.getByRole('heading', { name: en.menu.emptyHeading })).toBeInTheDocument();
  });

  it('marks an item unavailable when its id is in the stopped set', () => {
    renderMenu(makeMenu(), ['item-1']);
    expect(screen.getByRole('button', { name: 'Soup' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Burger' })).not.toHaveAttribute('aria-disabled');
  });

  it('renders the tenant name in the header and footer', () => {
    renderMenu(makeMenu());
    expect(within(screen.getByRole('banner')).getByText('Cafe Demo')).toBeInTheDocument();
    expect(within(screen.getByRole('contentinfo')).getByText('Cafe Demo')).toBeInTheDocument();
  });
});
