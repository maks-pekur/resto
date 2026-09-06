import { describe, expect, it } from 'vitest';
import en from '../src/i18n/en.json';
import es from '../src/i18n/es.json';
import ru from '../src/i18n/ru.json';
import uk from '../src/i18n/uk.json';

const catalogues: Record<string, Record<string, string>> = { en, es, ru, uk };

describe('qr-menu message catalogues', () => {
  // The list mirrors CONTENT_LOCALES in @resto/domain: a language a restaurant may publish in
  // needs chrome to match, or a Spanish menu ends up with an English button.
  it('covers every language a restaurant may publish its menu in', () => {
    expect(Object.keys(catalogues).sort()).toEqual(['en', 'es', 'ru', 'uk']);
  });

  it('says the same things in each of them', () => {
    const reference = Object.keys(en).sort();
    for (const [locale, catalogue] of Object.entries(catalogues)) {
      expect(Object.keys(catalogue).sort(), locale).toEqual(reference);
    }
  });

  it('leaves no string untranslated', () => {
    for (const [locale, catalogue] of Object.entries(catalogues)) {
      for (const [key, value] of Object.entries(catalogue)) {
        expect(value.trim(), `${locale}.${key}`).not.toBe('');
      }
    }
  });
});
