import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-i18next');
  return {
    ...actual,
    useTranslation: (_ns?: string, opts?: { keyPrefix?: string }) => ({
      t: (key: string, values?: Record<string, unknown>) =>
        `${opts?.keyPrefix ?? ''}.${key}${values ? JSON.stringify(values) : ''}`,
      i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
  };
});

const { LocalizedField } = await import('@/components/common/localized-field');

const renderField = (value: Record<string, string> | null, onChange = vi.fn()) => {
  render(
    <LocalizedField
      id="name"
      label="Name"
      value={value}
      onChange={onChange}
      locales={['ru', 'en']}
      defaultLocale="ru"
    />,
  );
  return onChange;
};

describe('LocalizedField', () => {
  it('opens on the language everything falls back to', () => {
    renderField({ ru: 'Борщ', en: 'Borscht' });

    expect(screen.getByRole('textbox')).toHaveValue('Борщ');
  });

  it('switches the input to the language the operator picked', async () => {
    const user = userEvent.setup();
    renderField({ ru: 'Борщ', en: 'Borscht' });

    await user.click(screen.getByTestId('name-tab-en'));

    expect(screen.getByRole('textbox')).toHaveValue('Borscht');
  });

  it('keeps the other languages when one is edited', async () => {
    const user = userEvent.setup();
    const onChange = renderField({ ru: 'Борщ', en: 'Borscht' });

    await user.click(screen.getByTestId('name-tab-en'));
    await user.type(screen.getByRole('textbox'), '!');

    expect(onChange).toHaveBeenLastCalledWith({ ru: 'Борщ', en: 'Borscht!' });
  });

  it('drops a language that is emptied instead of storing a blank', async () => {
    const user = userEvent.setup();
    const onChange = renderField({ ru: 'Борщ', en: 'B' });

    await user.click(screen.getByTestId('name-tab-en'));
    await user.clear(screen.getByRole('textbox'));

    expect(onChange).toHaveBeenLastCalledWith({ ru: 'Борщ' });
  });

  it('stays a plain input when the restaurant publishes in one language', () => {
    render(
      <LocalizedField
        id="name"
        label="Name"
        value={{ ru: 'Борщ' }}
        onChange={vi.fn()}
        locales={['ru']}
        defaultLocale="ru"
      />,
    );

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });
});
