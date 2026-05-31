import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { toggleMock, archiveMock, toastSuccessMock, toastErrorMock, pushMock } = vi.hoisted(() => ({
  toggleMock: vi.fn(),
  archiveMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock('@/app/dashboard/(workspace)/menu/items/toggle-stop-list-action', () => ({
  toggleStopListAction: toggleMock,
}));
vi.mock('@/app/dashboard/(workspace)/menu/items/archive-item-action', () => ({
  archiveItemAction: archiveMock,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}));

const { ItemsTableClient } =
  await import('@/app/dashboard/(workspace)/menu/items/items-table-client');

const ITEM_A = '11111111-1111-4111-8111-111111111111';
const ITEM_B = '22222222-2222-4222-8222-222222222222';

const baseItems = [
  {
    id: ITEM_A,
    name: { ru: 'Капучино' },
    categoryId: 'cat-a',
    categoryName: { ru: 'Кофе' },
    parentCategoryName: { ru: 'Напитки' },
    photoUrl: null,
    basePrice: '320',
    currency: 'RUB',
    status: 'published' as const,
    hasSizes: true,
    stoppedAt: null,
  },
  {
    id: ITEM_B,
    name: { ru: 'Сырник' },
    categoryId: 'cat-b',
    categoryName: { ru: 'Десерты' },
    parentCategoryName: null,
    photoUrl: 'https://example.com/photo.jpg',
    basePrice: '150',
    currency: 'RUB',
    status: 'paused' as const,
    hasSizes: false,
    stoppedAt: '2026-05-30T00:00:00.000Z',
  },
];

describe('ItemsTableClient (Plan 04b-06 Task 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toggleMock.mockResolvedValue({ ok: true, error: null });
    archiveMock.mockResolvedValue({ error: null, success: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders 'от {basePrice}₽' when hasSizes=true, plain price otherwise", () => {
    render(
      <ItemsTableClient items={baseItems} totalCount={2} pagination={{ page: 1, pageSize: 50 }} />,
    );
    expect(screen.getByText(/от 320 ₽/u)).toBeInTheDocument();
    expect(screen.getByText(/^150 ₽$/u)).toBeInTheDocument();
  });

  it('shows the parent → child category prefix when item has a parent category', () => {
    render(
      <ItemsTableClient items={baseItems} totalCount={2} pagination={{ page: 1, pageSize: 50 }} />,
    );
    expect(screen.getByText(/Напитки → Кофе/u)).toBeInTheDocument();
  });

  it("toggling stop-list switch ON calls action with next='paused' + shows success toast", async () => {
    render(
      <ItemsTableClient items={baseItems} totalCount={2} pagination={{ page: 1, pageSize: 50 }} />,
    );
    const sw = screen.getByLabelText('Добавить в стоп-лист');
    fireEvent.click(sw);
    await waitFor(() => {
      expect(toggleMock).toHaveBeenCalledWith({ itemId: ITEM_A, next: 'paused' });
    });
    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith('Блюдо добавлено в стоп-лист', {
        duration: 1500,
      });
    });
  });

  it("toggling stop-list OFF for a paused item calls action with next='published' + success toast", async () => {
    render(
      <ItemsTableClient items={baseItems} totalCount={2} pagination={{ page: 1, pageSize: 50 }} />,
    );
    const sw = screen.getByLabelText('Убрать из стоп-листа');
    fireEvent.click(sw);
    await waitFor(() => {
      expect(toggleMock).toHaveBeenCalledWith({ itemId: ITEM_B, next: 'published' });
    });
    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith('Блюдо возобновлено', { duration: 1500 });
    });
  });

  it('on toggle error, the switch snaps back to its prior state + an error toast fires', async () => {
    toggleMock.mockResolvedValue({ ok: false, error: 'Could not update — please try again.' });
    render(
      <ItemsTableClient items={baseItems} totalCount={2} pagination={{ page: 1, pageSize: 50 }} />,
    );
    const sw = screen.getByLabelText('Добавить в стоп-лист');
    expect(sw).toHaveAttribute('data-state', 'unchecked');
    fireEvent.click(sw);
    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith('Could not update — please try again.');
    });
    expect(sw).toHaveAttribute('data-state', 'unchecked');
  });

  it('opens the archive AlertDialog with the UI-SPEC §Destructive actions row-2 copy', () => {
    render(
      <ItemsTableClient items={baseItems} totalCount={2} pagination={{ page: 1, pageSize: 50 }} />,
    );
    const trigger = screen.getByRole('button', { name: /Действия с блюдом Капучино/u });
    fireEvent.click(trigger);
    const archiveBtn = screen.getByRole('menuitem', { name: 'Архивировать' });
    fireEvent.click(archiveBtn);
    expect(screen.getByText('Архивировать блюдо?')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Блюдо «Капучино» будет скрыто из меню\. Действие обратимо — снимите архивацию в фильтре статусов\./u,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Архивировать' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отмена' })).toBeInTheDocument();
  });

  it('confirming the archive AlertDialog calls archiveItemAction with the row id', async () => {
    render(
      <ItemsTableClient items={baseItems} totalCount={2} pagination={{ page: 1, pageSize: 50 }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Действия с блюдом Капучино/u }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Архивировать' }));
    fireEvent.click(screen.getByRole('button', { name: 'Архивировать' }));
    await waitFor(() => {
      expect(archiveMock).toHaveBeenCalledWith({ error: null, success: false }, { id: ITEM_A });
    });
  });

  it('disables Назад on page 1 and Вперёд when total <= page * pageSize', () => {
    render(
      <ItemsTableClient items={baseItems} totalCount={2} pagination={{ page: 1, pageSize: 50 }} />,
    );
    const back = screen.getByRole('button', { name: 'Назад' });
    const next = screen.getByRole('button', { name: 'Вперёд' });
    expect(back).toBeDisabled();
    expect(next).toBeDisabled();
  });

  it('enables Назад on page 2 and Вперёд when more pages exist', () => {
    render(
      <ItemsTableClient
        items={baseItems}
        totalCount={300}
        pagination={{ page: 2, pageSize: 50 }}
      />,
    );
    const back = screen.getByRole('button', { name: 'Назад' });
    const next = screen.getByRole('button', { name: 'Вперёд' });
    expect(back).not.toBeDisabled();
    expect(next).not.toBeDisabled();
  });

  it('renders the empty state when there are zero items', () => {
    render(<ItemsTableClient items={[]} totalCount={0} pagination={{ page: 1, pageSize: 50 }} />);
    expect(screen.getByText('Блюд пока нет')).toBeInTheDocument();
    expect(
      screen.getByText('Добавьте первое блюдо, чтобы начать заполнять меню.'),
    ).toBeInTheDocument();
  });
});
