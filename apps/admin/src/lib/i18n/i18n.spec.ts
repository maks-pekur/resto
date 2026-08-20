import { describe, it, expect, beforeAll } from 'vitest';
import i18n from './index';
import ru from './messages/ru.json';
import en from './messages/en.json';
import es from './messages/es.json';

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? flattenKeys(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

beforeAll(async () => {
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
    await i18n.changeLanguage('ru');
  });
});

describe('i18n — catalogue completeness (D-38)', () => {
  it('ru, en and es catalogues have identical key sets', () => {
    const ruKeys = flattenKeys(ru).sort();
    const enKeys = flattenKeys(en).sort();
    const esKeys = flattenKeys(es).sort();

    const missingFromEn = ruKeys.filter((key) => !enKeys.includes(key));
    const missingFromRu = enKeys.filter((key) => !ruKeys.includes(key));
    const missingFromEs = enKeys.filter((key) => !esKeys.includes(key));
    const extraInEs = esKeys.filter((key) => !enKeys.includes(key));

    expect({ missingFromEn, missingFromRu, missingFromEs, extraInEs }).toEqual({
      missingFromEn: [],
      missingFromRu: [],
      missingFromEs: [],
      extraInEs: [],
    });
  });
});

describe('i18n — deliberate fallback (D-38)', () => {
  it('a locale with no catalogue falls back to the ru (fallbackLng) rendered string, not a raw key', async () => {
    await i18n.changeLanguage('uk');
    const result = i18n.t('nav.user.localeEs');

    expect(result).not.toBe('nav.user.localeEs');
    expect(result).toBe(ru.nav.user.localeEs);

    await i18n.changeLanguage('ru');
  });
});
