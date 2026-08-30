import { describe, expect, it } from 'vitest';
import { remainingTime } from '@/lib/orders/remaining';

const NOW = new Date('2026-08-30T12:00:00.000Z').getTime();
const at = (iso: string): string => new Date(iso).toISOString();

describe('remainingTime', () => {
  it('says nothing when nothing was promised', () => {
    expect(remainingTime(null, NOW)).toBeNull();
  });

  it('counts down to the promise', () => {
    expect(remainingTime(at('2026-08-30T12:04:30.000Z'), NOW)).toEqual({
      label: '04:30',
      late: false,
    });
  });

  it('marks a passed promise and keeps counting with a minus', () => {
    expect(remainingTime(at('2026-08-30T11:56:00.000Z'), NOW)).toEqual({
      label: '−04:00',
      late: true,
    });
  });

  it('switches to hours once minutes stop being readable', () => {
    expect(remainingTime(at('2026-08-30T14:05:00.000Z'), NOW)).toEqual({
      label: '2:05',
      late: false,
    });
  });
});
