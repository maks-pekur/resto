import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/lib/i18n';
import { RefundFailedBanner } from '@/components/orders/refund-failed-banner';

describe('RefundFailedBanner', () => {
  it('renders nothing when count is 0', () => {
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <RefundFailedBanner count={0} onShowClick={vi.fn()} />
      </I18nextProvider>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('uses the singular Russian plural form for count 1', async () => {
    await i18n.changeLanguage('ru');
    render(
      <I18nextProvider i18n={i18n}>
        <RefundFailedBanner count={1} onShowClick={vi.fn()} />
      </I18nextProvider>,
    );
    expect(screen.getByText('1 возврат не прошёл — требуется действие')).toBeTruthy();
  });

  it('uses the few Russian plural form for count 2', async () => {
    await i18n.changeLanguage('ru');
    render(
      <I18nextProvider i18n={i18n}>
        <RefundFailedBanner count={2} onShowClick={vi.fn()} />
      </I18nextProvider>,
    );
    expect(screen.getByText('2 возврата не прошли — требуется действие')).toBeTruthy();
  });

  it('uses the many Russian plural form for count 5', async () => {
    await i18n.changeLanguage('ru');
    render(
      <I18nextProvider i18n={i18n}>
        <RefundFailedBanner count={5} onShowClick={vi.fn()} />
      </I18nextProvider>,
    );
    expect(screen.getByText('5 возвратов не прошли — требуется действие')).toBeTruthy();
  });

  it('the "Показать" action calls onShowClick', async () => {
    await i18n.changeLanguage('ru');
    const onShowClick = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <RefundFailedBanner count={1} onShowClick={onShowClick} />
      </I18nextProvider>,
    );
    screen.getByRole('button', { name: 'Показать' }).click();
    expect(onShowClick).toHaveBeenCalledTimes(1);
  });
});
