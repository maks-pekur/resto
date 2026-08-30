import { beforeEach, describe, expect, it, vi } from 'vitest';

const load = async () => {
  vi.resetModules();
  return import('../src/i18n');
};

describe('locale adoption', () => {
  beforeEach(() => {
    document.cookie = 'locale=; path=/; max-age=0';
    vi.stubGlobal('navigator', { language: 'en-GB', languages: ['en-GB'] });
  });

  it('opens a Russian-only menu in Russian even on an English phone', async () => {
    const i18n = await load();

    expect(i18n.adoptTenantLocales(['ru'], 'ru')).toBe(true);
    expect(i18n.getActiveLocale()).toBe('ru');
  });

  it('keeps the browser language when the restaurant publishes in it', async () => {
    const i18n = await load();

    i18n.adoptTenantLocales(['ru', 'en'], 'ru');

    expect(i18n.getActiveLocale()).toBe('en');
  });

  it('leaves a language the guest picked alone', async () => {
    document.cookie = 'locale=en; path=/';
    const i18n = await load();

    expect(i18n.adoptTenantLocales(['ru', 'en'], 'ru')).toBe(false);
    expect(i18n.getActiveLocale()).toBe('en');
  });

  it('overrides a guest choice the restaurant no longer publishes in', async () => {
    document.cookie = 'locale=es; path=/';
    const i18n = await load();

    expect(i18n.adoptTenantLocales(['ru', 'en'], 'ru')).toBe(true);
    expect(i18n.getActiveLocale()).toBe('en');
  });
});
