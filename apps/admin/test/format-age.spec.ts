import { describe, expect, it } from 'vitest';
import { formatAge } from '@/lib/menu/format-age';

describe('formatAge (Russian relative time, 3 buckets)', () => {
  const NOW = 1_780_000_000_000;

  it('renders 0..59s as "Xс назад"', () => {
    expect(formatAge(NOW - 0, NOW)).toBe('0с назад');
    expect(formatAge(NOW - 999, NOW)).toBe('0с назад');
    expect(formatAge(NOW - 1_000, NOW)).toBe('1с назад');
    expect(formatAge(NOW - 59_999, NOW)).toBe('59с назад');
  });

  it('renders 60s..59m as "Xм назад"', () => {
    expect(formatAge(NOW - 60_000, NOW)).toBe('1м назад');
    expect(formatAge(NOW - 90_000, NOW)).toBe('1м назад');
    expect(formatAge(NOW - 60_000 * 5, NOW)).toBe('5м назад');
    expect(formatAge(NOW - (60_000 * 60 - 1), NOW)).toBe('59м назад');
  });

  it('renders 1h+ as "Xч назад"', () => {
    expect(formatAge(NOW - 60_000 * 60, NOW)).toBe('1ч назад');
    expect(formatAge(NOW - 60_000 * 60 * 3, NOW)).toBe('3ч назад');
    expect(formatAge(NOW - 60_000 * 60 * 24, NOW)).toBe('24ч назад');
  });
});
