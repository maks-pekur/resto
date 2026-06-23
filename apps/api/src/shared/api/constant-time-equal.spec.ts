import { describe, expect, it } from 'vitest';
import { COMPARE_PAD_LEN, constantTimeStringEqual } from './constant-time-equal';

describe('constantTimeStringEqual', () => {
  it('returns true for identical strings', () => {
    expect(constantTimeStringEqual('secret-token-abc', 'secret-token-abc')).toBe(true);
  });

  it('returns false for same-length strings with different bytes', () => {
    expect(constantTimeStringEqual('aaaa', 'aaab')).toBe(false);
  });

  it('returns false for different-length strings without short-circuiting on length', () => {
    expect(constantTimeStringEqual('abc', 'abcd')).toBe(false);
  });

  it('returns false when presented token exceeds COMPARE_PAD_LEN', () => {
    const oversized = 'x'.repeat(COMPARE_PAD_LEN + 1);
    expect(constantTimeStringEqual(oversized, oversized)).toBe(false);
  });

  it('returns true for two empty strings', () => {
    expect(constantTimeStringEqual('', '')).toBe(true);
  });
});
