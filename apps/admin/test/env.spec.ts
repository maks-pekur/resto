import { afterEach, describe, expect, it } from 'vitest';

// In Vitest, import.meta.env is a mutable object — we can set PROD/DEV/VITE_*
// directly to simulate different runtime modes.
const metaEnv = import.meta.env as Record<string, unknown>;

const saveEnv = () => ({ ...metaEnv });
const restoreEnv = (saved: Record<string, unknown>) => {
  for (const key of Object.keys(metaEnv)) delete metaEnv[key];
  Object.assign(metaEnv, saved);
};

describe('getEnv (G-05 fail-loud)', () => {
  let saved: Record<string, unknown>;

  afterEach(() => {
    restoreEnv(saved);
  });

  it('returns dev default when VITE_API_ORIGIN is unset in DEV mode', async () => {
    saved = saveEnv();
    metaEnv.PROD = false;
    metaEnv.DEV = true;
    delete metaEnv.VITE_API_ORIGIN;

    const { getEnv } = await import('@/env');
    expect(getEnv('VITE_API_ORIGIN')).toBe('http://localhost:3000');
  });

  it('throws when VITE_API_ORIGIN is empty in PROD mode', async () => {
    saved = saveEnv();
    metaEnv.PROD = true;
    metaEnv.DEV = false;
    metaEnv.VITE_API_ORIGIN = '';

    const { getEnv } = await import('@/env');
    expect(() => getEnv('VITE_API_ORIGIN')).toThrow(/Missing required env var/);
  });

  it('throws when VITE_API_ORIGIN is a localhost URL in PROD mode (G-05)', async () => {
    saved = saveEnv();
    metaEnv.PROD = true;
    metaEnv.DEV = false;
    metaEnv.VITE_API_ORIGIN = 'http://localhost:3000';

    const { getEnv } = await import('@/env');
    expect(() => getEnv('VITE_API_ORIGIN')).toThrow(/localhost/);
  });

  it('returns real HTTPS origin in PROD mode', async () => {
    saved = saveEnv();
    metaEnv.PROD = true;
    metaEnv.DEV = false;
    metaEnv.VITE_API_ORIGIN = 'https://api.resto.app';

    const { getEnv } = await import('@/env');
    expect(getEnv('VITE_API_ORIGIN')).toBe('https://api.resto.app');
  });
});
