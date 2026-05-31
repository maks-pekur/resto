import { describe, expect, it } from 'vitest';
import { pluralizeChanges } from '@/lib/menu/pluralize-changes';

describe('pluralizeChanges (Russian noun declension for "неопубликованных изменений")', () => {
  it('renders 0 as "0 неопубликованных изменений" (genitive plural)', () => {
    expect(pluralizeChanges(0)).toBe('0 неопубликованных изменений');
  });

  it('renders 1 as "1 неопубликованное изменение" (nominative singular)', () => {
    expect(pluralizeChanges(1)).toBe('1 неопубликованное изменение');
  });

  it('renders 2..4 as "N неопубликованных изменения" (genitive singular)', () => {
    expect(pluralizeChanges(2)).toBe('2 неопубликованных изменения');
    expect(pluralizeChanges(3)).toBe('3 неопубликованных изменения');
    expect(pluralizeChanges(4)).toBe('4 неопубликованных изменения');
  });

  it('renders 5..20 as "N неопубликованных изменений" (genitive plural)', () => {
    expect(pluralizeChanges(5)).toBe('5 неопубликованных изменений');
    expect(pluralizeChanges(11)).toBe('11 неопубликованных изменений');
    expect(pluralizeChanges(15)).toBe('15 неопубликованных изменений');
    expect(pluralizeChanges(20)).toBe('20 неопубликованных изменений');
  });

  it('renders 21 as "21 неопубликованное изменение" (singular — last digit 1 rule)', () => {
    expect(pluralizeChanges(21)).toBe('21 неопубликованное изменение');
  });

  it('renders 22 as "22 неопубликованных изменения" (last digit 2 rule)', () => {
    expect(pluralizeChanges(22)).toBe('22 неопубликованных изменения');
  });

  it('renders 25 as "25 неопубликованных изменений" (last digit 5 rule)', () => {
    expect(pluralizeChanges(25)).toBe('25 неопубликованных изменений');
  });

  it('renders 101 with singular (last digit 1, not in teens)', () => {
    expect(pluralizeChanges(101)).toBe('101 неопубликованное изменение');
  });

  it('renders 111 as genitive plural (teens override the last-digit rule)', () => {
    expect(pluralizeChanges(111)).toBe('111 неопубликованных изменений');
  });
});
