import { afterEach, describe, expect, it, vi } from 'vitest';
import { qrTokenFromScan } from '../src/components/TableScanCard';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('qrTokenFromScan', () => {
  it('reads the token out of a printed code', () => {
    expect(qrTokenFromScan(`${window.location.origin}/t/a-printed-secret`)).toBe(
      'a-printed-secret',
    );
  });

  it('reads it with a trailing slash too', () => {
    expect(qrTokenFromScan(`${window.location.origin}/t/a-printed-secret/`)).toBe(
      'a-printed-secret',
    );
  });

  it('returns null for a code that is not one of ours', () => {
    expect(qrTokenFromScan(`${window.location.origin}/menu`)).toBeNull();
    expect(qrTokenFromScan('not a url at all')).toBeNull();
  });

  it('takes a code printed for another host in dev, where the device browses a LAN address', () => {
    expect(qrTokenFromScan('https://pizza.menu.localhost/t/a-printed-secret')).toBe(
      'a-printed-secret',
    );
  });

  it('refuses another host once built for production', () => {
    vi.stubEnv('DEV', false);
    expect(qrTokenFromScan('https://evil.example.com/t/a-printed-secret')).toBeNull();
  });
});
