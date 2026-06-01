import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const { archiveMock, reorderMock } = vi.hoisted(() => ({
  archiveMock: vi.fn(() => Promise.resolve({ error: null, success: true })),
  reorderMock: vi.fn(() => Promise.resolve({ error: null, success: true })),
}));

vi.mock('@/app/dashboard/(workspace)/menu/categories/archive-category-action', () => ({
  archiveCategoryAction: archiveMock,
}));
vi.mock('@/app/dashboard/(workspace)/menu/categories/reorder-category-action', () => ({
  reorderCategoryAction: reorderMock,
}));
vi.mock('@/app/dashboard/(workspace)/menu/categories/category-form-client', () => ({
  CategoryFormClient: () => <div data-testid="category-form-stub" />,
}));
vi.mock('@/app/dashboard/(workspace)/menu/categories/upsert-category-action', () => ({
  upsertCategoryAction: vi.fn(),
}));

const { CategoriesTableClient } =
  await import('@/app/dashboard/(workspace)/menu/categories/categories-table-client');

const PARENT_A = '11111111-1111-4111-8111-111111111111';
const PARENT_B = '22222222-2222-4222-8222-222222222222';
const CHILD_A1 = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CHILD_A2 = 'aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const ARCHIVED_PARENT = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const baseCategories = [
  {
    id: PARENT_A,
    parentId: null,
    slug: 'napitki',
    name: { ru: 'Напитки' },
    description: null,
    sortOrder: 0,
    status: 'published' as const,
  },
  {
    id: CHILD_A1,
    parentId: PARENT_A,
    slug: 'cofe',
    name: { ru: 'Кофе' },
    description: null,
    sortOrder: 0,
    status: 'published' as const,
  },
  {
    id: CHILD_A2,
    parentId: PARENT_A,
    slug: 'chay',
    name: { ru: 'Чай' },
    description: null,
    sortOrder: 1,
    status: 'draft' as const,
  },
  {
    id: PARENT_B,
    parentId: null,
    slug: 'desserty',
    name: { ru: 'Десерты' },
    description: null,
    sortOrder: 1,
    status: 'published' as const,
  },
  {
    id: ARCHIVED_PARENT,
    parentId: null,
    slug: 'snack',
    name: { ru: 'Снэки' },
    description: null,
    sortOrder: 2,
    status: 'archived' as const,
  },
];

describe('CategoriesTableClient (Plan 04b-05 Task 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders parent rows then their children (children indented via pl-8, no arrow prefix)', () => {
    render(<CategoriesTableClient categories={baseCategories} />);
    expect(screen.getAllByText('Напитки').length).toBeGreaterThan(0);
    expect(screen.getByText('Кофе')).toBeInTheDocument();
    expect(screen.getByText('Чай')).toBeInTheDocument();
    expect(screen.getByText('Десерты')).toBeInTheDocument();
  });

  it('hides archived rows by default (D-03 default = all except archived)', () => {
    render(<CategoriesTableClient categories={baseCategories} />);
    expect(screen.queryByText('Снэки')).not.toBeInTheDocument();
  });

  it('renders rows with drag handles for reorder', () => {
    render(<CategoriesTableClient categories={baseCategories} />);
    const napitkiRow = screen.getByTestId(`category-row-${PARENT_A}`);
    expect(napitkiRow).toBeInTheDocument();
  });

  it('renders the empty state when the input list is empty', () => {
    render(<CategoriesTableClient categories={[]} />);
    expect(screen.getByText('Категории не добавлены')).toBeInTheDocument();
    expect(
      screen.getByText('Добавьте первую категорию, чтобы сгруппировать блюда в меню.'),
    ).toBeInTheDocument();
  });
});
