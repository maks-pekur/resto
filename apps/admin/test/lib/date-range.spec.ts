import { describe, expect, it } from 'vitest';
import {
  buildPresetRange,
  fromDateKey,
  matchingPreset,
  toDateKey,
  DEFAULT_DASHBOARD_RANGE,
} from '@/lib/date-range';

const MID_MONTH = new Date(2026, 7, 15);

describe('date range presets', () => {
  it('defaults to today', () => {
    expect(DEFAULT_DASHBOARD_RANGE(MID_MONTH)).toEqual({ from: '2026-08-15', to: '2026-08-15' });
  });

  it('builds a single-day yesterday', () => {
    expect(buildPresetRange('yesterday', MID_MONTH)).toEqual({
      from: '2026-08-14',
      to: '2026-08-14',
    });
  });

  it('counts the last 7 days inclusive of today', () => {
    expect(buildPresetRange('last7', MID_MONTH)).toEqual({ from: '2026-08-09', to: '2026-08-15' });
  });

  it('runs this month from its first day', () => {
    expect(buildPresetRange('thisMonth', MID_MONTH)).toEqual({
      from: '2026-08-01',
      to: '2026-08-15',
    });
  });

  it('runs last month end to end', () => {
    expect(buildPresetRange('lastMonth', MID_MONTH)).toEqual({
      from: '2026-07-01',
      to: '2026-07-31',
    });
  });

  it('crosses a month boundary when counting backwards', () => {
    expect(buildPresetRange('last28', new Date(2026, 7, 3))).toEqual({
      from: '2026-07-07',
      to: '2026-08-03',
    });
  });

  it('recognises a range that came from a preset', () => {
    expect(matchingPreset({ from: '2026-08-09', to: '2026-08-15' }, MID_MONTH)).toBe('last7');
  });

  it('recognises a hand-picked range as no preset', () => {
    expect(matchingPreset({ from: '2026-08-03', to: '2026-08-11' }, MID_MONTH)).toBeNull();
  });

  it('round-trips a key through a local date', () => {
    expect(toDateKey(fromDateKey('2026-02-01'))).toBe('2026-02-01');
  });
});
