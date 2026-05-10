import { describe, expect, it } from 'vitest';
import { slugifyBrandName } from '@/lib/slugify-brand';

describe('slugifyBrandName', () => {
  it('lowercases + replaces spaces with hyphens', () => {
    expect(slugifyBrandName('Z Burger')).toBe('z-burger');
  });

  it('strips diacritics via NFKD', () => {
    expect(slugifyBrandName('Café Mañana')).toBe('cafe-manana');
  });

  it('collapses runs of non-alphanumeric characters into a single hyphen', () => {
    expect(slugifyBrandName("Joe's    Pizza & Pasta!!!")).toBe('joe-s-pizza-pasta');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugifyBrandName('---hi---')).toBe('hi');
  });

  it('caps at 64 characters and re-trims trailing hyphen', () => {
    const long = 'a'.repeat(70);
    expect(slugifyBrandName(long)).toHaveLength(64);
    const longHyphenAt64 = `${'a'.repeat(63)} hello`;
    const out = slugifyBrandName(longHyphenAt64);
    expect(out.endsWith('-')).toBe(false);
  });

  it('returns the empty string when no usable characters remain', () => {
    expect(slugifyBrandName('   ')).toBe('');
    expect(slugifyBrandName('!!!')).toBe('');
  });

  it('keeps already-valid slug shapes unchanged', () => {
    expect(slugifyBrandName('z-burger')).toBe('z-burger');
  });
});
