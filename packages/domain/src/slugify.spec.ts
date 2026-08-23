import { describe, expect, it } from 'vitest';
import { slugifyName } from './slugify';

describe('slugifyName', () => {
  it.each([
    ['Воскресенка', 'voskresenka'],
    ['Оболонь', 'obolon'],
    ['Піца Палац', 'pitsa-palats'],
    ['Хрещатик', 'khreshchatyk'],
    ['Kyiv Center', 'kyiv-center'],
    ['Café Málaga', 'cafe-malaga'],
  ])('%s becomes %s', (input, expected) => {
    expect(slugifyName(input)).toBe(expected);
  });

  // The bug this replaces: the ASCII-only slugifier returned '' for every Cyrillic name, so a
  // Ukrainian restaurant could not pick a slug from its own name at all.
  it('never returns empty for a name written in Cyrillic', () => {
    for (const name of ['Воскресенка', 'Оболонь 5', 'Лівий берег']) {
      expect(slugifyName(name)).not.toBe('');
    }
  });

  it('trims to the requested length without leaving a trailing hyphen', () => {
    expect(slugifyName('Very Long Location Name Here', 12)).toBe('very-long-lo');
    expect(slugifyName('ab cdefghijkl', 3)).toBe('ab');
  });

  it('returns empty when nothing survives, rather than inventing a slug', () => {
    expect(slugifyName('!!!')).toBe('');
    expect(slugifyName('   ')).toBe('');
  });
});
