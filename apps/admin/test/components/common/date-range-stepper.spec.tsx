import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-i18next');
  return {
    ...actual,
    useTranslation: (_ns?: string, opts?: { keyPrefix?: string }) => ({
      t: (key: string) => (opts?.keyPrefix ? `${opts.keyPrefix}.${key}` : key),
      i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
  };
});

const { DateRangeStepper } = await import('@/components/common/date-range-stepper');
const { buildPresetRange } = await import('@/lib/date-range');

describe('DateRangeStepper', () => {
  it('names today by word rather than by date', () => {
    render(<DateRangeStepper value={buildPresetRange('today')} onChange={vi.fn()} />);

    expect(screen.getByText('orders.dateNav.today')).toBeInTheDocument();
  });

  it('steps a single day back', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DateRangeStepper value={buildPresetRange('today')} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'orders.dateNav.previous' }));

    expect(onChange).toHaveBeenCalledWith(buildPresetRange('yesterday'));
  });

  it('steps a whole week when a week is on screen', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DateRangeStepper value={buildPresetRange('last7')} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'orders.dateNav.previous' }));

    const [moved] = onChange.mock.calls[0] as [{ from: string; to: string }];
    const week = buildPresetRange('last7');
    const dayMs = 86_400_000;
    expect(new Date(`${moved.to}T00:00:00`).getTime()).toBe(
      new Date(`${week.from}T00:00:00`).getTime() - dayMs,
    );
  });

  it('refuses to walk into the future', () => {
    render(<DateRangeStepper value={buildPresetRange('today')} onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'orders.dateNav.next' })).toBeDisabled();
  });

  it('walks forward once the operator is looking at the past', () => {
    render(<DateRangeStepper value={buildPresetRange('yesterday')} onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'orders.dateNav.next' })).toBeEnabled();
  });
});
