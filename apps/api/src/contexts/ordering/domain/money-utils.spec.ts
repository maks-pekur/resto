import { describe, expect, it } from 'vitest';
import { fromMinorUnits, toMinorUnits } from './money-utils';

describe('toMinorUnits', () => {
  it('converts a standard decimal price', () => {
    expect(toMinorUnits('12.50')).toBe(1250);
  });

  it('converts zero', () => {
    expect(toMinorUnits('0.00')).toBe(0);
  });

  it('converts a large value', () => {
    expect(toMinorUnits('9999999999.99')).toBe(999999999999);
  });

  it('handles a value with one decimal place', () => {
    expect(toMinorUnits('1.5')).toBe(150);
  });

  it('handles a whole number string', () => {
    expect(toMinorUnits('5')).toBe(500);
  });

  it('truncates beyond 2 decimal places (matches cart.ts behavior)', () => {
    expect(toMinorUnits('1.999')).toBe(199);
  });
});

describe('fromMinorUnits', () => {
  it('converts minor units to a decimal string', () => {
    expect(fromMinorUnits(1250)).toBe('12.50');
  });

  it('converts zero', () => {
    expect(fromMinorUnits(0)).toBe('0.00');
  });

  it('converts a sub-cent value', () => {
    expect(fromMinorUnits(5)).toBe('0.05');
  });

  it('pads the fractional part with leading zero', () => {
    expect(fromMinorUnits(109)).toBe('1.09');
  });
});

describe('float-drift guard', () => {
  it('round-trips 0.10 + 0.20 as 0.30 without float drift', () => {
    expect(fromMinorUnits(toMinorUnits('0.10') + toMinorUnits('0.20'))).toBe('0.30');
  });
});
