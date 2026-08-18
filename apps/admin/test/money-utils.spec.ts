import { describe, expect, it } from 'vitest';
import { toMinorUnits } from '@/lib/utils';

describe('toMinorUnits', () => {
  it('parses a plain decimal amount', () => {
    expect(toMinorUnits('11.50')).toBe(1150);
  });

  it('parses a whole amount with no fraction', () => {
    expect(toMinorUnits('12')).toBe(1200);
  });

  it('parses a leading-dot amount, which a number input accepts', () => {
    expect(toMinorUnits('.50')).toBe(50);
  });

  it('parses a negative leading-dot amount', () => {
    expect(toMinorUnits('-.50')).toBe(-50);
  });

  it('pads a single-digit fraction', () => {
    expect(toMinorUnits('3.5')).toBe(350);
  });

  it('truncates beyond two fraction digits', () => {
    expect(toMinorUnits('3.567')).toBe(356);
  });

  it('tolerates surrounding whitespace', () => {
    expect(toMinorUnits('  7.25 ')).toBe(725);
  });
});
