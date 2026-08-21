import { describe, expect, it } from 'vitest';
import { locationSearchSchema } from '../src/routes/(protected)/_layout';

describe('locationSearchSchema', () => {
  it('accepts "all"', () => {
    const result = locationSearchSchema.safeParse({ location: 'all' });
    expect(result.success).toBe(true);
    expect(result.success && result.data.location).toBe('all');
  });

  it('accepts a valid uuid', () => {
    const uuid = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
    const result = locationSearchSchema.safeParse({ location: uuid });
    expect(result.success).toBe(true);
    expect(result.success && result.data.location).toBe(uuid);
  });

  it('accepts a missing location', () => {
    const result = locationSearchSchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.success && result.data.location).toBeUndefined();
  });

  it('resolves a garbage location to undefined instead of failing', () => {
    const result = locationSearchSchema.safeParse({ location: 'garbage' });
    expect(result.success).toBe(true);
    expect(result.success && result.data.location).toBeUndefined();
  });
});
