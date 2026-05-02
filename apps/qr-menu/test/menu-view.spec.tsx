import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MenuView } from '../src/components/MenuView';
import type { MenuDto } from '../src/api/types';

const buildMenu = (): MenuDto => ({
  tenantId: '11111111-1111-4111-8111-111111111111',
  version: 1,
  currency: 'USD',
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
      imageS3Key: null,
      allergens: [],
      sortOrder: 0,
      variants: [],
      modifierIds: [],
    },
  ],
  modifiers: [],
});

describe('MenuView', () => {
  it('renders categories and item names', () => {
    render(<MenuView menu={buildMenu()} onSelectItem={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /Pizza/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Margherita/ })).toBeInTheDocument();
  });

  it('invokes onSelectItem when an item is activated', () => {
    const onSelect = vi.fn();
    render(<MenuView menu={buildMenu()} onSelectItem={onSelect} />);
    screen.getByRole('button', { name: /Margherita/ }).click();
    expect(onSelect).toHaveBeenCalledWith('item-1');
  });

  it('renders an empty state when there are no items', () => {
    const empty: MenuDto = { ...buildMenu(), items: [], categories: [] };
    render(<MenuView menu={empty} onSelectItem={vi.fn()} />);
    expect(screen.getByText(/menu is empty|empty right now/i)).toBeInTheDocument();
  });
});
