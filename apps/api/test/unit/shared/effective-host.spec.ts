import { describe, expect, it } from 'vitest';
import { effectiveHost } from '../../../src/shared/effective-host';

describe('effectiveHost', () => {
  it('returns the literal Host when trustProxy is off', () => {
    const headers = { host: 'localhost:3000', 'x-forwarded-host': 'cafe-demo.lvh.me' };
    expect(effectiveHost(headers, false)).toBe('localhost:3000');
  });

  it('prefers x-forwarded-host when trustProxy is on', () => {
    const headers = { host: 'localhost:3000', 'x-forwarded-host': 'cafe-demo.lvh.me' };
    expect(effectiveHost(headers, true)).toBe('cafe-demo.lvh.me');
  });

  it('uses the first value of a comma-joined x-forwarded-host', () => {
    const headers = { host: 'gw', 'x-forwarded-host': 'cafe-demo.lvh.me, gw.internal' };
    expect(effectiveHost(headers, true)).toBe('cafe-demo.lvh.me');
  });

  it('falls back to Host when x-forwarded-host is absent even with trustProxy on', () => {
    expect(effectiveHost({ host: 'cafe-demo.lvh.me' }, true)).toBe('cafe-demo.lvh.me');
  });

  it('returns undefined when neither header is present', () => {
    expect(effectiveHost({}, true)).toBeUndefined();
  });
});
