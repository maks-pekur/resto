import { describe, it, expect, beforeAll } from 'vitest';
import i18n from './index';

beforeAll(async () => {
  // Ensure i18n has initialised before any assertion
  if (!i18n.isInitialized) {
    await new Promise<void>((resolve) => {
      i18n.on('initialized', resolve);
    });
  }
  await i18n.changeLanguage('ru');
});

describe('i18n — default ru', () => {
  it('resolves nav.dashboard to the Russian string', () => {
    const result = i18n.t('nav.dashboard');
    expect(result).toBe('Дашборд');
  });
});

describe('i18n — interpolation', () => {
  it('substitutes {{price}} in menu.items.withCurrency', () => {
    const result = i18n.t('menu.items.withCurrency', { price: '100' });
    expect(result).toBe('100 ₽');
  });
});

describe('i18n — plural (ru)', () => {
  it('uses _one key for count=1', () => {
    const result = i18n.t('menu.publishBar.unpublishedChanges', { count: 1 });
    expect(result).toBe('1 неопубликованное изменение');
  });

  it('uses _few key for count=2', () => {
    const result = i18n.t('menu.publishBar.unpublishedChanges', { count: 2 });
    expect(result).toBe('2 неопубликованных изменения');
  });

  it('uses _other key for count=5', () => {
    const result = i18n.t('menu.publishBar.unpublishedChanges', { count: 5 });
    expect(result).toBe('5 неопубликованных изменений');
  });
});

describe('i18n — language switch', () => {
  it('resolves the English string after changeLanguage("en")', async () => {
    await i18n.changeLanguage('en');
    const result = i18n.t('nav.dashboard');
    expect(result).toBe('Dashboard');
    // restore ru for subsequent tests
    await i18n.changeLanguage('ru');
  });
});
