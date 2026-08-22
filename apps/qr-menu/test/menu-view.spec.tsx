import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MenuView } from '../src/components/MenuView';
import { toStoppedSet } from '../src/api/availability';
import type { MenuDto } from '@resto/api-client/public';

const buildMenu = (): MenuDto => ({
  tenantId: '11111111-1111-4111-8111-111111111111',
  version: 1,
  currency: 'USD',
  tenant: null,
  categories: [
    { id: 'cat-1', slug: 'pizza', name: { en: 'Pizza' }, description: null, sortOrder: 0 },
  ],
  items: [
    {
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
    },
  ],
  modifierGroups: [],
});

const renderMenu = (
  menu: MenuDto,
  onSelectItem = vi.fn(),
  stoppedIds: ReadonlySet<string> = new Set(),
) =>
  render(
    <MenuView
      menu={menu}
      stoppedIds={stoppedIds}
      onSelectItem={onSelectItem}
      cartOpen={false}
      onOpenCart={vi.fn()}
      onCloseCart={vi.fn()}
    />,
  );

describe('MenuView', () => {
  it('renders categories and item names', () => {
    renderMenu(buildMenu());
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /Pizza/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Margherita/ })).toBeInTheDocument();
  });

  it('renders an item card with its price and photo', () => {
    const { container } = renderMenu(buildMenu());
    expect(screen.getByText(/12\.50/)).toBeInTheDocument();
    expect(container.querySelector('img.menu-item__image')).toHaveAttribute(
      'src',
      'https://cdn.example.test/margherita.jpg',
    );
  });

  it('invokes onSelectItem when an item is activated', () => {
    const onSelect = vi.fn();
    renderMenu(buildMenu(), onSelect);
    screen.getByRole('button', { name: /Margherita/ }).click();
    expect(onSelect).toHaveBeenCalledWith('item-1');
  });

  it('renders an empty state when there are no items', () => {
    const empty: MenuDto = { ...buildMenu(), items: [], categories: [] };
    renderMenu(empty);
    expect(screen.getByText(/menu is empty|empty right now/i)).toBeInTheDocument();
  });

  it('renders an item as unavailable when it is in the stopped set', () => {
    renderMenu(buildMenu(), vi.fn(), toStoppedSet(['item-1']));
    const card = screen.getByRole('button', { name: /Margherita/ });
    expect(card).toHaveAttribute('aria-disabled', 'true');
    expect(card.className).toContain('menu-item--disabled');
  });

  it('renders an item normally when it is not in the stopped set', () => {
    renderMenu(buildMenu(), vi.fn(), toStoppedSet(['some-other-item']));
    const card = screen.getByRole('button', { name: /Margherita/ });
    expect(card).not.toHaveAttribute('aria-disabled');
    expect(card.className).not.toContain('menu-item--disabled');
  });

  it('does not activate a stopped item', () => {
    const onSelect = vi.fn();
    renderMenu(buildMenu(), onSelect, toStoppedSet(['item-1']));
    screen.getByRole('button', { name: /Margherita/ }).click();
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('toStoppedSet', () => {
  it('maps stopped ids to a membership lookup', () => {
    const set = toStoppedSet(['a', 'b']);
    expect(set.has('a')).toBe(true);
    expect(set.has('b')).toBe(true);
    expect(set.has('c')).toBe(false);
  });

  it('returns an empty set for no stopped ids', () => {
    expect(toStoppedSet([]).size).toBe(0);
  });
});
