import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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

const setContentLocales = vi.fn().mockResolvedValue({ ok: true, status: 200, data: null });
vi.mock('@/lib/queries/tenancy', () => ({ setContentLocales }));

const { ContentLocalesSection } = await import('@/components/settings/content-locales-section');

const renderSection = (contentLocales: readonly string[] = ['ru', 'en'], defaultLocale = 'ru') =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ContentLocalesSection defaultLocale={defaultLocale} contentLocales={contentLocales} />
    </QueryClientProvider>,
  );

const openLanguages = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
  await user.click(screen.getByLabelText('settings.contentLocales.languagesPlaceholder'));
};

describe('ContentLocalesSection', () => {
  it('shows the languages the restaurant publishes in', () => {
    renderSection();

    const trigger = screen.getByLabelText('settings.contentLocales.languagesPlaceholder');

    expect(trigger).toHaveTextContent('Russian');
    expect(trigger).toHaveTextContent('English');
    expect(trigger).not.toHaveTextContent('Ukrainian');
  });

  it('refuses to drop the language everything falls back to', async () => {
    const user = userEvent.setup();
    renderSection();
    await openLanguages(user);

    expect(await screen.findByTestId('multi-select-option-ru')).toHaveAttribute(
      'data-disabled',
      '',
    );
  });

  it('saves nothing until something changes', () => {
    renderSection();

    expect(screen.getByRole('button', { name: 'settings.contentLocales.save' })).toBeDisabled();
  });

  it('sends the language the operator added', async () => {
    const user = userEvent.setup();
    renderSection();
    setContentLocales.mockClear();

    await openLanguages(user);
    await user.click(await screen.findByTestId('multi-select-option-uk'));
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'settings.contentLocales.save' }));

    expect(setContentLocales).toHaveBeenCalledWith({
      defaultLocale: 'ru',
      contentLocales: ['ru', 'en', 'uk'],
    });
  });
});
