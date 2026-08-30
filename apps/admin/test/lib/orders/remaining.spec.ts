import { describe, expect, it } from 'vitest';
import { countdown, remainingTime } from '@/lib/orders/remaining';

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

describe('countdown', () => {
  const started = at('2026-08-30T11:40:00.000Z');

  it('says nothing when nothing was promised', () => {
    expect(countdown(null, started, NOW)).toBeNull();
  });

  it('drains from the moment the promise was made', () => {
    const half = countdown(at('2026-08-30T12:20:00.000Z'), started, NOW);

    expect(half?.totalMinutes).toBe(20);
    expect(half?.minutes).toBe(20);
    expect(half?.hours).toBe(0);
    expect(half?.late).toBe(false);
    expect(half?.progress).toBeCloseTo(0.5, 2);
    expect(half?.tone).toBe('calm');
  });

  it('warns once only a quarter of the promise is left', () => {
    const nearly = countdown(at('2026-08-30T12:05:00.000Z'), started, NOW);

    expect(nearly?.tone).toBe('warning');
  });

  it('empties the ring and counts up once the promise is past', () => {
    const late = countdown(at('2026-08-30T11:56:00.000Z'), started, NOW);

    expect(late?.late).toBe(true);
    expect(late?.totalMinutes).toBe(4);
    expect(late?.progress).toBe(0);
    expect(late?.tone).toBe('late');
  });

  it('treats a promise with no span as already spent', () => {
    const instant = countdown(at('2026-08-30T12:00:00.000Z'), at('2026-08-30T12:00:00.000Z'), NOW);

    expect(instant?.progress).toBe(0);
  });

  it('splits a long span into hours and minutes', () => {
    const long = countdown(at('2026-08-30T14:35:00.000Z'), at('2026-08-30T10:00:00.000Z'), NOW);

    expect(long?.hours).toBe(2);
    expect(long?.minutes).toBe(35);
    expect(long?.days).toBe(0);
  });

  it('splits a span of more than a day into days and hours', () => {
    const long = countdown(at('2026-09-01T15:00:00.000Z'), at('2026-08-30T10:00:00.000Z'), NOW);

    expect(long?.days).toBe(2);
    expect(long?.hours).toBe(3);
  });
});
