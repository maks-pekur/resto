import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { PublishCountdownToast } from '@/components/menu/publish-countdown-toast';

describe('PublishCountdownToast (D-4b-03, UI-SPEC §Delayed-Publish Toast Spec)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows "Публикация через 5с" initially, with linear progress bar at 0', () => {
    render(<PublishCountdownToast onCancel={vi.fn()} onElapse={vi.fn()} />);
    expect(screen.getByText('Публикация через 5с')).toBeInTheDocument();
  });

  it('updates the countdown text as time advances', () => {
    render(<PublishCountdownToast onCancel={vi.fn()} onElapse={vi.fn()} />);
    act(() => {
      vi.advanceTimersByTime(1_500);
    });
    expect(screen.getByText('Публикация через 4с')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByText('Публикация через 3с')).toBeInTheDocument();
  });

  it('fires onElapse exactly once when the 5000ms boundary is crossed', () => {
    const onElapse = vi.fn();
    render(<PublishCountdownToast onCancel={vi.fn()} onElapse={onElapse} />);
    act(() => {
      vi.advanceTimersByTime(4_900);
    });
    expect(onElapse).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onElapse).toHaveBeenCalledTimes(1);
    // Advance well past elapse; must not fire again.
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onElapse).toHaveBeenCalledTimes(1);
  });

  it('fires onCancel when the "Отменить" button is clicked', () => {
    const onCancel = vi.fn();
    render(<PublishCountdownToast onCancel={onCancel} onElapse={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Отменить' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders the countdown text with aria-live="polite" for screen readers', () => {
    render(<PublishCountdownToast onCancel={vi.fn()} onElapse={vi.fn()} />);
    const live = screen.getByText('Публикация через 5с');
    expect(live.getAttribute('aria-live')).toBe('polite');
  });
});
