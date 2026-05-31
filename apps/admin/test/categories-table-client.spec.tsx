import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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
// The form client and upsert action are not exercised in these specs.
// We stub them to keep render fast and avoid pulling server-only modules.
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

  it('renders parent rows then their children indented with the ↳ prefix', () => {
    render(<CategoriesTableClient categories={baseCategories} />);
    // Напитки appears in its own row + as parent label of two children;
    // assert at-least-one match and the prefixed-child cells are unique.
    expect(screen.getAllByText('Напитки').length).toBeGreaterThan(0);
    expect(screen.getByText('↳ Кофе')).toBeInTheDocument();
    expect(screen.getByText('↳ Чай')).toBeInTheDocument();
    expect(screen.getByText('Десерты')).toBeInTheDocument();
  });

  it('hides archived rows by default (D-03 default = all except archived)', () => {
    render(<CategoriesTableClient categories={baseCategories} />);
    expect(screen.queryByText('Снэки')).not.toBeInTheDocument();
  });

  it('"Показать архив" toggle reveals archived rows', () => {
    render(<CategoriesTableClient categories={baseCategories} />);
    const toggle = screen.getByRole('button', { name: /Показать архив/u });
    fireEvent.click(toggle);
    expect(screen.getByText('Снэки')).toBeInTheDocument();
    // Toggle re-labels itself
    expect(screen.getByRole('button', { name: /Скрыть архив/u })).toBeInTheDocument();
  });

  it('hides ↑ on the first parent row and ↓ on the last visible parent row', () => {
    render(<CategoriesTableClient categories={baseCategories} />);
    // The first parent (Напитки) should NOT have a "Переместить выше".
    // We scope the assertion to the Напитки row to avoid colliding with
    // child rows. Children of Напитки have their own up/down logic; the
    // first child (Кофе) also has no up button.
    const napitkiRow = screen.getByTestId(`category-row-${PARENT_A}`);
    expect(napitkiRow.querySelector('[aria-label="Переместить выше"]')).toBeNull();
    // Last visible parent (Десерты — Снэки is archived/hidden) → no ↓
    const dessertRow = screen.getByTestId(`category-row-${PARENT_B}`);
    expect(dessertRow.querySelector('[aria-label="Переместить ниже"]')).toBeNull();
  });

  it('opens the archive AlertDialog with the UI-SPEC §Destructive actions row-1 copy', () => {
    render(<CategoriesTableClient categories={baseCategories} />);
    const archiveBtn = screen.getByRole('button', {
      name: /Архивировать Напитки/u,
    });
    fireEvent.click(archiveBtn);
    expect(screen.getByText('Архивировать категорию?')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Категория «Напитки» будет скрыта\. Все блюда в ней останутся в черновике\. Действие можно отменить, опубликовав категорию снова\./u,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Архивировать' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отмена' })).toBeInTheDocument();
  });

  it('confirming the archive AlertDialog calls archiveCategoryAction with the row id', () => {
    render(<CategoriesTableClient categories={baseCategories} />);
    fireEvent.click(screen.getByRole('button', { name: /Архивировать Напитки/u }));
    fireEvent.click(screen.getByRole('button', { name: 'Архивировать' }));
    expect(archiveMock).toHaveBeenCalledWith({ error: null, success: false }, { id: PARENT_A });
  });

  it('clicking ↓ on a row calls reorderCategoryAction(id, "down")', () => {
    render(<CategoriesTableClient categories={baseCategories} />);
    // Напитки is the first parent — only has ↓
    const napitkiRow = screen.getByTestId(`category-row-${PARENT_A}`);
    const downBtn = napitkiRow.querySelector('[aria-label="Переместить ниже"]');
    expect(downBtn).not.toBeNull();
    if (downBtn) {
      fireEvent.click(downBtn);
    }
    expect(reorderMock).toHaveBeenCalledWith(
      { error: null, success: false },
      { id: PARENT_A, direction: 'down' },
    );
  });

  it('renders the empty state when the input list is empty', () => {
    render(<CategoriesTableClient categories={[]} />);
    expect(screen.getByText('Категории не добавлены')).toBeInTheDocument();
    expect(
      screen.getByText('Добавьте первую категорию, чтобы сгруппировать блюда в меню.'),
    ).toBeInTheDocument();
  });
});
