import * as React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const showSuccessMock = vi.fn();
const showErrorMock = vi.fn();
const resetStopListActionMock = vi.fn();

vi.mock('@/lib/ui/toast-helpers', () => ({
  showError: showErrorMock,
  showSuccess: showSuccessMock,
}));
vi.mock('@/app/dashboard/(workspace)/menu/stop-list/reset-stop-list-action', () => ({
  resetStopListAction: resetStopListActionMock,
}));

const { TodaysWidget } = await import('@/components/menu/todays-86-widget');

describe('TodaysWidget (Plan 04b-09 Task 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the count badge and reset button when count > 0', () => {
    render(<TodaysWidget count={3} />);
    expect(screen.getByText('Стоп-лист сегодня')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Сбросить всё')).toBeInTheDocument();
  });

  it('hides the reset button and shows the empty hint when count is zero', () => {
    render(<TodaysWidget count={0} />);
    expect(screen.getByText('Стоп-лист пуст.')).toBeInTheDocument();
    expect(screen.queryByText('Сбросить всё')).not.toBeInTheDocument();
  });

  it('calls resetStopListAction and toasts success on full success', async () => {
    resetStopListActionMock.mockResolvedValue({
      ok: true,
      resetCount: 3,
      failedIds: [],
      error: null,
    });
    render(<TodaysWidget count={3} />);
    fireEvent.click(screen.getByText('Сбросить всё'));
    await waitFor(() => {
      expect(resetStopListActionMock).toHaveBeenCalled();
      expect(showSuccessMock).toHaveBeenCalledWith('Стоп-лист сбросен');
    });
  });

  it('reports partial-success via showError when some DELETEs fail', async () => {
    resetStopListActionMock.mockResolvedValue({
      ok: false,
      resetCount: 2,
      failedIds: ['x'],
      error: null,
    });
    render(<TodaysWidget count={3} />);
    fireEvent.click(screen.getByText('Сбросить всё'));
    await waitFor(() => {
      expect(showErrorMock).toHaveBeenCalledWith('2 возобновлены, 1 не удалось');
    });
  });
});
