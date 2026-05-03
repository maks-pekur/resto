import { describe, it, expect } from 'vitest';
import {
  generateOwnerPassword,
  assertPasswordFlagAllowed,
  PasswordFlagDisallowedError,
} from '../seed/lib/password';

describe('generateOwnerPassword', () => {
  it('returns a 24-char URL-safe string', () => {
    const pw = generateOwnerPassword();
    expect(pw).toHaveLength(24);
    expect(pw).toMatch(/^[A-Za-z0-9_-]{24}$/u);
  });

  it('returns different values across calls', () => {
    const a = generateOwnerPassword();
    const b = generateOwnerPassword();
    expect(a).not.toBe(b);
  });
});

describe('assertPasswordFlagAllowed', () => {
  it('throws PasswordFlagDisallowedError outside development', () => {
    expect(() => {
      assertPasswordFlagAllowed({ NODE_ENV: 'production' });
    }).toThrow(PasswordFlagDisallowedError);
    expect(() => {
      assertPasswordFlagAllowed({ NODE_ENV: 'staging' });
    }).toThrow(PasswordFlagDisallowedError);
  });

  it('passes through in development', () => {
    expect(() => {
      assertPasswordFlagAllowed({ NODE_ENV: 'development' });
    }).not.toThrow();
  });
});
