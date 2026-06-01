import * as React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toggleStopListActionMock = vi.fn();
const showSuccessMock = vi.fn();
const showErrorMock = vi.fn();

vi.mock('@/lib/ui/toast-helpers', () => ({
  showSuccess: showSuccessMock,
  showError: showErrorMock,
}));
vi.mock('../app/dashboard/(workspace)/menu/items/toggle-stop-list-action', () => ({
  toggleStopListAction: toggleStopListActionMock,
}));

const { StopListTableClient } =
  await import('../app/dashboard/(workspace)/menu/stop-list/stop-list-table-client');

const ITEM_FRESH = {
  id: '11111111-1111-4111-8111-111111111111',
  name: { ru: 'Капучино' },
  categoryName: { ru: 'Кофе' },
  parentCategoryName: { ru: 'Напитки' },
  photoUrl: null,
  stoppedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
};

const ITEM_STALE = {
  id: '22222222-2222-4222-8222-222222222222',
  name: { ru: 'Латте' },
  categoryName: { ru: 'Кофе' },
  parentCategoryName: { ru: 'Напитки' },
  photoUrl: null,
  stoppedAt: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString(),
};

describe('StopListTableClient (Plan 04b-09 Task 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders each item with name and joined category path', () => {
    render(<StopListTableClient items={[ITEM_FRESH]} />);
    expect(screen.getByText('Капучино')).toBeInTheDocument();
    expect(screen.getByText('Напитки → Кофе')).toBeInTheDocument();
  });

  it('renders the amber >24h stale warning for items stopped more than 24h ago', () => {
    render(<StopListTableClient items={[ITEM_STALE]} />);
    const warning = screen.getByText(/Остановлено\s+\d+/u);
    expect(warning).toBeInTheDocument();
    expect(warning.className).toMatch(/amber/u);
  });

  it('does NOT render the amber warning for fresh items', () => {
    render(<StopListTableClient items={[ITEM_FRESH]} />);
    expect(screen.queryByText(/Остановлено\s+\d+/u)).not.toBeInTheDocument();
  });

  it("calls toggleStopListAction with next='published' when the switch is toggled off", async () => {
    toggleStopListActionMock.mockResolvedValue({ ok: true, error: null });
    render(<StopListTableClient items={[ITEM_FRESH]} />);
    fireEvent.click(screen.getByLabelText('Возобновить Капучино'));
    await waitFor(() => {
      expect(toggleStopListActionMock).toHaveBeenCalledWith({
        itemId: ITEM_FRESH.id,
        next: 'published',
      });
      expect(showSuccessMock).toHaveBeenCalledWith('Блюдо возобновлено', { duration: 1500 });
    });
  });

  it('surfaces errors from toggleStopListAction', async () => {
    toggleStopListActionMock.mockResolvedValue({ ok: false, error: 'Не удалось.' });
    render(<StopListTableClient items={[ITEM_FRESH]} />);
    fireEvent.click(screen.getByLabelText('Возобновить Капучино'));
    await waitFor(() => {
      expect(showErrorMock).toHaveBeenCalled();
    });
  });
});
