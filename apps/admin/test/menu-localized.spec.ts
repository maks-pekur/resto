import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, fromLocalizedText, toLocalizedText } from '@/lib/menu/localized';

describe('DEFAULT_LOCALE (Open Question #1 RESOLVED — D-05 single-locale MVP-1)', () => {
  it("is pinned to 'ru' for MVP-1", () => {
    expect(DEFAULT_LOCALE).toBe('ru');
  });
});

describe('toLocalizedText', () => {
  it("wraps a plain string into { ru: '...' } by default", () => {
    expect(toLocalizedText('Капучино')).toEqual({ ru: 'Капучино' });
  });

  it('honours a custom locale arg', () => {
    expect(toLocalizedText('Cappuccino', 'en')).toEqual({ en: 'Cappuccino' });
  });

  it('returns only the single requested locale key (no extra noise)', () => {
    const value = toLocalizedText('Капучино');
    expect(Object.keys(value)).toEqual(['ru']);
  });
});

describe('fromLocalizedText (RESEARCH.md Pitfall #9 fallback chain)', () => {
  it('returns the exact locale match when present', () => {
    expect(fromLocalizedText({ ru: 'Капучино' })).toBe('Капучино');
  });

  it("falls back to 'en' when the requested locale is missing", () => {
    expect(fromLocalizedText({ en: 'Cappuccino' })).toBe('Cappuccino');
  });

  it('falls back to the first non-empty value when no ru/en present', () => {
    expect(fromLocalizedText({ 'pt-BR': 'Cappuccino BR' })).toBe('Cappuccino BR');
  });

  it('returns an empty string for undefined input', () => {
    expect(fromLocalizedText(undefined)).toBe('');
  });

  it('returns an empty string for null input', () => {
    expect(fromLocalizedText(null)).toBe('');
  });

  it('returns an empty string for an empty record', () => {
    expect(fromLocalizedText({})).toBe('');
  });

  it('honours a custom locale arg', () => {
    expect(fromLocalizedText({ ru: 'Капучино', en: 'Cappuccino' }, 'en')).toBe('Cappuccino');
  });
});
