import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MenuView } from '../src/components/MenuView';
import type { MenuDto } from '@resto/api-client/public';

const buildMenu = (): MenuDto => ({
  tenantId: '11111111-1111-4111-8111-111111111111',
  version: 1,
  currency: 'USD',
  brand: null,
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
      isStopListed: false,
    },
  ],
  modifierGroups: [],
});

describe('MenuView', () => {
  it('renders categories and item names', () => {
    render(<MenuView menu={buildMenu()} onSelectItem={vi.fn()} onOpenCart={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /Pizza/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Margherita/ })).toBeInTheDocument();
  });

  it('renders an item card with its price and photo', () => {
    const { container } = render(
      <MenuView menu={buildMenu()} onSelectItem={vi.fn()} onOpenCart={vi.fn()} />,
    );
    expect(screen.getByText(/12\.50/)).toBeInTheDocument();
    expect(container.querySelector('img.menu-item__image')).toHaveAttribute(
      'src',
      'https://cdn.example.test/margherita.jpg',
    );
  });

  it('invokes onSelectItem when an item is activated', () => {
    const onSelect = vi.fn();
    render(<MenuView menu={buildMenu()} onSelectItem={onSelect} onOpenCart={vi.fn()} />);
    screen.getByRole('button', { name: /Margherita/ }).click();
    expect(onSelect).toHaveBeenCalledWith('item-1');
  });

  it('renders an empty state when there are no items', () => {
    const empty: MenuDto = { ...buildMenu(), items: [], categories: [] };
    render(<MenuView menu={empty} onSelectItem={vi.fn()} onOpenCart={vi.fn()} />);
    expect(screen.getByText(/menu is empty|empty right now/i)).toBeInTheDocument();
  });
});
