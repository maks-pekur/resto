import { describe, expect, it } from 'vitest';
import { getLocale } from '../../../src/contexts/identity/infrastructure/email/get-locale';

describe('getLocale (D-03)', () => {
  it('returns en when headers are empty', () => {
    expect(getLocale({})).toBe('en');
  });

  it('returns ru when Accept-Language primary tag is ru', () => {
    expect(getLocale({ 'accept-language': 'ru-RU,ru;q=0.9' })).toBe('ru');
  });

  it('returns en when Accept-Language primary tag is en', () => {
    expect(getLocale({ 'accept-language': 'en-US,en;q=0.9' })).toBe('en');
  });

  it('falls back to en for unsupported locale (fr)', () => {
    expect(getLocale({ 'accept-language': 'fr-FR' })).toBe('en');
  });

  it('returns en when headers are undefined (non-HTTP code path)', () => {
    expect(getLocale(undefined)).toBe('en');
  });

  it('reads from a WHATWG Headers instance', () => {
    const h = new Headers({ 'accept-language': 'ru-RU' });
    expect(getLocale(h)).toBe('ru');
  });

  it('uses the first comma-separated segment when multiple locales are preferred', () => {
    expect(getLocale({ 'accept-language': 'ru,en;q=0.5' })).toBe('ru');
  });

  it('handles array-valued headers (Fastify edge case) by taking the first element', () => {
    expect(getLocale({ 'accept-language': ['ru-RU', 'en-US'] })).toBe('ru');
  });

  it('falls back to en when Accept-Language is the wildcard "*"', () => {
    expect(getLocale({ 'accept-language': '*' })).toBe('en');
  });
});
