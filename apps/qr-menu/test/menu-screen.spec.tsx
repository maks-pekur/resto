import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GuestUiProvider, MenuScreen } from '@resto/ui';
import type { MenuDto, MenuItemDto } from '@resto/api-client/public';
import { t } from '../src/i18n';

const item = (overrides: Partial<MenuItemDto> = {}): MenuItemDto => ({
  id: 'item-1',
  slug: 'margherita',
  categoryId: 'cat-1',
  name: { en: 'Margherita' },
  description: null,
  basePrice: '12.50',
  currency: 'USD',
  imageUrl: 'https://cdn.example.test/margherita.jpg',
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

const buildMenu = (overrides: Partial<MenuDto> = {}): MenuDto => ({
  tenantId: '11111111-1111-4111-8111-111111111111',
  version: 1,
  currency: 'USD',
  tenant: {
    id: 'tenant-1',
    slug: 'demo',
    displayName: 'Cafe Demo',
    theme: null,
    locales: { default: 'ru', supported: ['ru', 'en'] },
  },
  categories: [
    { id: 'cat-1', slug: 'pizza', name: { en: 'Pizza' }, description: null, sortOrder: 0 },
  ],
  items: [item()],
  modifierGroups: [],
  ...overrides,
});

const renderMenu = (menu: MenuDto, stoppedItemIds: readonly string[] = []) =>
  render(
    <GuestUiProvider locale="en" t={t}>
      <MenuScreen menu={menu} stoppedItemIds={stoppedItemIds} />
    </GuestUiProvider>,
  );

describe('MenuScreen on qr-menu', () => {
  it('renders the tenant name in the header and the footer', () => {
    renderMenu(buildMenu());
    expect(within(screen.getByRole('banner')).getByText('Cafe Demo')).toBeInTheDocument();
    expect(within(screen.getByRole('contentinfo')).getByText('Cafe Demo')).toBeInTheDocument();
  });

  it('renders the tenant logo beside the name in the header and the footer', () => {
    renderMenu(
      buildMenu({
        tenant: {
          id: 'tenant-1',
          slug: 'demo',
          displayName: 'Cafe Demo',
          theme: {
            logoUrl: 'https://cdn.example.test/logo.png',
            primaryColor: null,
            font: null,
          },
          locales: { default: 'ru', supported: ['ru', 'en'] },
        },
      }),
    );
    const logos = screen.getAllByAltText('Cafe Demo');
    expect(logos).toHaveLength(2);
    for (const logo of logos) {
      expect(logo).toHaveAttribute('src', 'https://cdn.example.test/logo.png');
    }
  });

  it('renders a category heading, its item and the item price', () => {
    renderMenu(buildMenu());
    expect(screen.getByRole('heading', { level: 2, name: 'Pizza' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Margherita' })).toBeInTheDocument();
    expect(screen.getByText(/12\.50/)).toBeInTheDocument();
  });

  it('renders the item photo', () => {
    const { container } = renderMenu(buildMenu());
    expect(
      container.querySelector('img[src="https://cdn.example.test/margherita.jpg"]'),
    ).toBeInTheDocument();
  });

  it('opens the item dialog when a card is activated', async () => {
    renderMenu(buildMenu());
    fireEvent.click(screen.getByRole('button', { name: 'Margherita' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Margherita' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: t('item.addToCart') })).toBeInTheDocument();
  });

  it('marks a stopped item unavailable and refuses to open it', () => {
    renderMenu(buildMenu(), ['item-1']);
    const card = screen.getByRole('button', { name: 'Margherita' });
    expect(card).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(t('item.unavailable'))).toBeInTheDocument();
    fireEvent.click(card);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders an empty state when the menu has no items', () => {
    renderMenu(buildMenu({ items: [], categories: [] }));
    expect(screen.getByRole('heading', { name: t('menu.emptyHeading') })).toBeInTheDocument();
  });

  it('pins the cart trigger to the category rail, not the header', () => {
    renderMenu(buildMenu());
    const rail = screen.getByRole('navigation', { name: t('menu.categories') });
    expect(within(rail).getByRole('button', { name: t('cart.empty') })).toBeInTheDocument();
    expect(
      within(screen.getByRole('banner')).queryByRole('button', { name: t('cart.empty') }),
    ).not.toBeInTheDocument();
  });
});
