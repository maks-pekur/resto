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

const switchIn = (locale: string): HTMLElement => {
  const row = screen.getByTestId(`content-locale-${locale}`);
  const control = row.querySelector('button[role="switch"]');
  if (control === null) throw new Error(`no switch for ${locale}`);
  return control as HTMLElement;
};

describe('ContentLocalesSection', () => {
  it('shows every language we can publish in, with the tenant’s own switched on', () => {
    renderSection();

    expect(switchIn('ru')).toHaveAttribute('data-state', 'checked');
    expect(switchIn('en')).toHaveAttribute('data-state', 'checked');
    expect(switchIn('uk')).toHaveAttribute('data-state', 'unchecked');
  });

  it('refuses to switch off the language everything falls back to', async () => {
    renderSection();

    expect(switchIn('ru')).toBeDisabled();
  });

  it('saves nothing until something changes', async () => {
    renderSection();

    expect(screen.getByRole('button', { name: 'settings.contentLocales.save' })).toBeDisabled();
  });

  it('sends the new list and the new primary language together', async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(switchIn('uk'));
    const [makePrimary] = screen.getAllByRole('button', {
      name: 'settings.contentLocales.makePrimary',
    });
    if (makePrimary === undefined) throw new Error('no language to promote');
    await user.click(makePrimary);
    await user.click(screen.getByRole('button', { name: 'settings.contentLocales.save' }));

    expect(setContentLocales).toHaveBeenCalledWith({
      defaultLocale: 'en',
      contentLocales: ['ru', 'en', 'uk'],
    });
  });
});
