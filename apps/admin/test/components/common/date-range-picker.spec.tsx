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

const { DateRangePicker } = await import('@/components/common/date-range-picker');
const { buildPresetRange } = await import('@/lib/date-range');

describe('DateRangePicker', () => {
  it('names the preset the current range came from', () => {
    render(<DateRangePicker value={buildPresetRange('today')} onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'dashboard.range.today' })).toBeInTheDocument();
  });

  it('hands back the preset the operator picks', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DateRangePicker value={buildPresetRange('today')} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'dashboard.range.today' }));
    await user.click(screen.getByRole('button', { name: 'dashboard.range.last7' }));

    expect(onChange).toHaveBeenCalledWith(buildPresetRange('last7'));
  });
});
