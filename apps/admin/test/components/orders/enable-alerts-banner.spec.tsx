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

const { EnableAlertsBanner } = await import('@/components/orders/enable-alerts-banner');

describe('EnableAlertsBanner', () => {
  it('spends the operator click on both permissions at once', async () => {
    const user = userEvent.setup();
    const onEnable = vi.fn();
    render(<EnableAlertsBanner onEnable={onEnable} />);

    await user.click(screen.getByRole('button', { name: 'orders.alerts.enableAlertsBtn' }));

    expect(onEnable).toHaveBeenCalledTimes(1);
  });
});
